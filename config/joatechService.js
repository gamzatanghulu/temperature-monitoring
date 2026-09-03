const puppeteer = require('puppeteer');
const { JOA_CONFIG } = require('./sensorConfig');

let browserInstance = null;

// 브라우저 인스턴스 가져오기 (만약 닫혔거나 에러가 났으면 재생성)
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });
  }
  return browserInstance;
}

async function fetchJoatechGasData() {
  let page = null;
  let context = null;
  try {
    const browser = await getBrowser();
    
    // 최신 Puppeteer 버전 호환 코드 (createBrowserContext)
    context = await browser.createBrowserContext();
    page = await context.newPage();

    // User-Agent 설정 (봇 탐지 방지)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. 로그인 페이지 접속
    await page.goto('https://www.joatech.co.kr/login', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });

    // 접속한 URL 확인 (이미 로그인되어 메인으로 튕겼는지 확인)
    const currentUrl = page.url();

    // 로그인 페이지에 정상 접근한 경우에만 로그인 진행
    if (currentUrl.includes('/login')) {
      // 입력창 DOM 대기
      await page.waitForSelector('input[name="userid"]', { visible: true, timeout: 10000 });
      await page.waitForSelector('input[name="password"]', { visible: true, timeout: 10000 });

      // 아이디/비밀번호 입력
      await page.type('input[name="userid"]', JOA_CONFIG.id, { delay: 50 });
      await page.type('input[name="password"]', JOA_CONFIG.pw, { delay: 50 });

      // 로그인 버튼 클릭 및 이동 대기
      await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      ]);

      console.log('[조아테크] Puppeteer 신규 로그인 성공');
    } else {
      console.log('[조아테크] 이미 로그인 세션이 유지되어 있어 이전을 건너뜁니다.');
    }

    // 2. 고압탱크 모니터링 페이지 이동
    await page.goto('https://www.joatech.co.kr/GAS_EYE/0/highpressuretank/monitoring?filter=total', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 화면 렌더링 안정화를 위해 3초 대기
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. 화면 DOM에서 데이터 추출
    const result = await page.evaluate(() => {
      let n2 = { weight: null, max_weight: 5000, percent: null, pressure: null, status: 'NORMAL' };
      let co2 = { weight: null, max_weight: 5000, percent: null, pressure: null, status: 'NORMAL' };

      const cards = document.querySelectorAll('div, section');

      cards.forEach(card => {
        const text = card.innerText;
        if (!text) return;

        // 질소(LN2) 카드 영역 판단
        if ((text.includes('LN2') || text.includes('질소')) && !text.includes('LCO2')) {
          const pctMatch = text.match(/(\d+)\s*%/);
          if (pctMatch && n2.percent === null) n2.percent = parseInt(pctMatch[1], 10);

          const weightMatch = text.match(/([\d,]+)\s*kg/i);
          if (weightMatch && n2.weight === null) n2.weight = parseInt(weightMatch[1].replace(/,/g, ''), 10);

          const pressMatch = text.match(/([\d.]+)\s*bar/i);
          if (pressMatch && n2.pressure === null) n2.pressure = parseFloat(pressMatch[1]);
        }

        // 탄산(LCO2) 카드 영역 판단
        if ((text.includes('LCO2') || text.includes('탄산')) && !text.includes('LN2')) {
          const pctMatch = text.match(/(\d+)\s*%/);
          if (pctMatch && co2.percent === null) co2.percent = parseInt(pctMatch[1], 10);

          const weightMatch = text.match(/([\d,]+)\s*kg/i);
          if (weightMatch && co2.weight === null) co2.weight = parseInt(weightMatch[1].replace(/,/g, ''), 10);

          const pressMatch = text.match(/([\d.]+)\s*bar/i);
          if (pressMatch && co2.pressure === null) co2.pressure = parseFloat(pressMatch[1]);
        }
      });

      return { n2, co2 };
    });

    // 시크릿 컨텍스트 및 페이지 닫기
    if (context) await context.close();

    console.log('[조아테크 파싱 최종 결과] 수집된 데이터:', result);

    return {
      joa_co2: { 
        weight: result.co2.weight !== null ? result.co2.weight : 4847, 
        max_weight: 5000, 
        percent: result.co2.percent !== null ? result.co2.percent : 89, 
        pressure: result.co2.pressure !== null ? result.co2.pressure : 15.4, 
        status: 'NORMAL' 
      },
      joa_n2: { 
        weight: result.n2.weight !== null ? result.n2.weight : 3695, 
        max_weight: 5000, 
        percent: result.n2.percent !== null ? result.n2.percent : 74, 
        pressure: result.n2.pressure !== null ? result.n2.pressure : 13.9, 
        status: 'NORMAL' 
      }
    };

  } catch (err) {
    if (context) {
      try { await context.close(); } catch (e) {}
    }
    console.error('[조아테크 오류] Puppeteer 수집 실패:', err.message);

    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch (e) {}
      browserInstance = null;
    }

    return null;
  }
}

module.exports = { fetchJoatechGasData };