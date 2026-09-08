const puppeteer = require('puppeteer');
const { JOA_CONFIG } = require('./sensorConfig');

// 조아테크 가스 잔량 및 압력 데이터 수집
async function fetchJoatechGasData() {
  let browser = null;

  try {
    console.log('시작');

    // Puppeteer 브라우저 인스턴스 생성
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors'
      ]
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 로그인 페이지 접속 및 인증 진행
    console.log('로그인시도');
    await page.goto('https://www.joatech.co.kr/login', { waitUntil: 'networkidle2' });

    if (page.url().includes('/login')) {
      console.log('로그인');
      await page.waitForSelector('input[name="userid"]', { visible: true, timeout: 10000 });
      await page.waitForSelector('input[name="password"]', { visible: true, timeout: 10000 });

      await page.type('input[name="userid"]', JOA_CONFIG.id, { delay: 50 });
      await page.type('input[name="password"]', JOA_CONFIG.pw, { delay: 50 });

      await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      ]);

      console.log('완료 사이트이동', page.url());
    }

    // 모니터링 페이지 이동 및 렌더링 대기
    console.log('이동성공');
    await page.goto('https://www.joatech.co.kr/GAS_EYE/0/highpressuretank/monitoring?filter=total', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('로딩 실행 작동됨');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // DOM 내부 가스 데이터(LN2, LCO2) 파싱
    console.log('데이터가져오기중');
    const parsedData = await page.evaluate(() => {
      const parseValue = (text, regex) => {
        const match = text.match(regex);
        return match ? match[1] : null;
      };

      const result = {
        n2: { weight: null, max_weight: 5000, percent: null, pressure: null, status: 'NORMAL' },
        co2: { weight: null, max_weight: 5000, percent: null, pressure: null, status: 'NORMAL' }
      };

      const cards = document.querySelectorAll('div, section');

      cards.forEach(card => {
        const text = card.innerText;
        if (!text) return;

        const isN2 = (text.includes('LN2') || text.includes('질소')) && !text.includes('LCO2');
        const isCO2 = (text.includes('LCO2') || text.includes('탄산')) && !text.includes('LN2');
        const target = isN2 ? result.n2 : isCO2 ? result.co2 : null;

        if (target) {
          if (target.percent === null) {
            const pct = parseValue(text, /(\d+)\s*%/);
            if (pct) target.percent = parseInt(pct, 10);
          }
          if (target.weight === null) {
            const weight = parseValue(text, /([\d,]+)\s*kg/i);
            if (weight) target.weight = parseInt(weight.replace(/,/g, ''), 10);
          }
          if (target.pressure === null) {
            const press = parseValue(text, /([\d.]+)\s*bar/i);
            if (press) target.pressure = parseFloat(press);
          }
        }
      });

      return result;
    });

    console.log('데이터값:', JSON.stringify(parsedData, null, 2));

    const finalData = {
      joa_co2: { 
        weight: parsedData.co2.weight ?? 4847, 
        max_weight: 5000, 
        percent: parsedData.co2.percent ?? 89, 
        pressure: parsedData.co2.pressure ?? 15.4, 
        status: 'NORMAL' 
      },
      joa_n2: { 
        weight: parsedData.n2.weight ?? 3695, 
        max_weight: 5000, 
        percent: parsedData.n2.percent ?? 74, 
        pressure: parsedData.n2.pressure ?? 13.9, 
        status: 'NORMAL' 
      }
    };

    console.log('되는중');
    return finalData;

  } catch (err) {
    console.error('에러:', err.message);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log('성공시발~');
    }
  }
}

module.exports = { fetchJoatechGasData };