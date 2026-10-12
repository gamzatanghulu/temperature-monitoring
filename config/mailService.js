const nodemailer = require('nodemailer');
const path = require('path');
const { RECEIVER_TO, RECEIVER_CC } = require('./sensorConfig');

// SMTP 메일 트랜스포터 설정
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'joheunggf@gmail.com',
    pass: process.env.SMTP_PASS || 'qele odul pifn ynum'
  }
});

// 메일 제목 생성 함수 ([경보] 센서명 (측정치) 포맷)
function generateSubject(items, isTest) {
  if (isTest) return '[시스템 테스트] 통합 관제 시스템 연결 확인';
  if (!items || items.length === 0) return '[경보] 미확인 이상 상태 발생';

  const firstItem = items[0];
  const count = items.length;

  // 1건 초과 복수 건 발생 시
  if (count > 1) {
    return `[경보] ${firstItem.displayName} 외 ${count - 1}건 이상 발생`;
  }

  // 단일 건 발생 시 요청하신 포맷으로 적용
  const nameStr = firstItem.displayName || firstItem.rawName;

  switch (firstItem.type) {
    case 'GAS':
      return `[경보] ${nameStr} (${firstItem.temp}kg / ${firstItem.hum}bar)`;

    case 'HEAT':
      const feelsLikeVal = firstItem.feelsLike !== undefined ? firstItem.feelsLike : firstItem.temp;
      return `[경보] ${nameStr} (${firstItem.temp}℃ / 체감 ${feelsLikeVal}℃)`;

    default:
      return `[경보] ${nameStr} (${firstItem.temp}℃ / 습도 ${firstItem.hum}%)`;
  }
}

// 측정치 표기 HTML 생성
function renderTempDisplay(item) {
  const color = '#dc2626';

  if (item.type === 'GAS') {
    return `<div style="font-size: 15px; font-weight: 800; color: ${color}; font-family: 'Consolas', monospace;">${item.temp} kg / ${item.hum} bar</div>`;
  }

  if (item.type === 'HEAT') {
    return `
      <div style="font-size: 15px; font-weight: 800; color: ${color}; font-family: 'Consolas', monospace;">
        ${item.temp}℃ <span style="font-size: 12px; color: #64748b; font-weight: 400;">(${item.hum}%)</span>
      </div>
      <div style="margin-top: 4px;">
        <span style="display: inline-block; padding: 2px 8px; background-color: #fef2f2; color: ${color}; border: 1px solid #fecaca; border-radius: 6px; font-size: 11px; font-weight: 700;">
          체감 ${item.feelsLike}℃
        </span>
      </div>`;
  }

  return `
    <div style="font-size: 15px; font-weight: 800; color: ${color}; font-family: 'Consolas', monospace;">${item.temp}℃</div>
    <div style="font-size: 12px; color: #64748b; margin-top: 2px;">습도 ${item.hum}%</div>`;
}

// 관제 알림 이메일 발송 함수
async function sendEmailNotification({ items = [], emailType = 'ALERT', isTest = false, targetEmail = null }) {
  const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const subject = generateSubject(items, isTest);

  const rowsHtml = isTest 
    ? `
      <tr>
        <td style="padding: 16px 20px; font-size: 14px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 600;">테스트 센서</td>
        <td style="padding: 16px 20px; font-size: 13px; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: center;">전체 관제 구역</td>
        <td style="padding: 16px 20px; font-size: 13px; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: center;">-</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; color: #15803d; border-radius: 20px; font-size: 12px; font-weight: 700;">● 정상 연동</span>
        </td>
      </tr>`
    : items.map(item => `
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${item.displayName}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${item.zone}</div>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: center; vertical-align: middle;">
          <span style="font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; display: inline-block;">${item.type}</span>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: center; vertical-align: middle; font-size: 13px; color: #334155; font-weight: 600;">
          ${item.type === 'HEAT' ? '경고기준 33.0℃ 이상' : item.type === 'GAS' ? '압력/잔량 모니터링' : `${item.min} ~${item.max}℃`}
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: right; vertical-align: middle;">
          ${renderTempDisplay(item)}
        </td>
      </tr>`).join('');

  const bodyDescription = isTest
    ? '본 메일은 통합 관제 시스템의 이메일 발송 기능 테스트 메일입니다.'
    : '설정된 적정 범위를 이탈하거나 경고 조건이 발생한 항목이 감지되었습니다.';

  const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>관제 시스템 알림</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px 10px; color: #1e293b;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; border-collapse: separate;">
        <tr>
            <td style="background-color: #dc2626; padding: 28px 36px 32px 36px; color: #ffffff;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                    <tr>
                        <td align="left" style="vertical-align: middle;">
                            <img src="cid:choheungLogo" alt="CHOHEUNG LOGO" style="display: block; max-height: 32px; width: auto; border: 0;" />
                        </td>
                        <td align="right" style="vertical-align: middle;">
                            <span style="display: inline-block; padding: 4px 10px; background-color: #ffffff; color: #dc2626; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                                CRITICAL ALERT
                            </span>
                        </td>
                    </tr>
                </table>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; color: #ffffff;">${subject}</h1>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #ffffff; opacity: 0.9; line-height: 1.5;">${bodyDescription}</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px 36px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
                    <tr>
                        <td align="left" style="font-size: 13px; color: #64748b;"><b>발생 시각:</b> ${nowStr}</td>
                        <td align="right" style="font-size: 13px; color: #64748b;">
                            <b>대상 항목:</b> <span style="color: #dc2626; font-weight: 700;">${isTest ? '0' : items.length}건</span>
                        </td>
                    </tr>
                </table>
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; border-collapse: separate;">
                    <thead>
                        <tr style="background-color: #f8fafc;">
                            <th style="padding: 12px 20px; font-size: 12px; font-weight: 700; color: #475569; text-align: left; border-bottom: 1px solid #e2e8f0;">구역 및 항목명</th>
                            <th style="padding: 12px 20px; font-size: 12px; font-weight: 700; color: #475569; text-align: center; border-bottom: 1px solid #e2e8f0;">유형</th>
                            <th style="padding: 12px 20px; font-size: 12px; font-weight: 700; color: #475569; text-align: center; border-bottom: 1px solid #e2e8f0;">기준 범위</th>
                            <th style="padding: 12px 20px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; border-bottom: 1px solid #e2e8f0;">현재 측정치</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
                    본 메일은 <b>스마트 온·습도 및 가스 통합 관제 시스템</b>에서 자동 발송되었습니다.<br>
                    © CHOHEUNG Co., Ltd. All rights reserved.
                </div>
            </td>
        </tr>
    </table>
</body>
</html>`;

  const safeTo = targetEmail ? targetEmail : (RECEIVER_TO || '').replace(/;/g, ',').trim();
  const safeCc = targetEmail ? '' : (RECEIVER_CC || '').replace(/;/g, ',').trim();

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER || '"스마트관제" <no-reply@choheung.co.kr>',
      to: safeTo,
      cc: safeCc,
      subject,
      html: htmlContent,
      attachments: [{
        filename: 'choheung_logo.png',
        path: path.join(__dirname, '../choheung_logo.png'),
        cid: 'choheungLogo'
      }]
    });

    return true;
  } catch (err) {
    console.error('[이메일 오류] 전송 실패:', err);
    throw err;
  }
}

module.exports = { sendEmailNotification };

// // ----------------------------------------------------
// // [1회성 테스트 실행용 코드]
// // ----------------------------------------------------
// async function testToJoker() {
//   console.log('joker@choheung.co.kr 주소로 최종 제목 테스트 발송 중...');

//   const mockAlertItems = [
//     {
//       rawName: '1팀외박스실',
//       displayName: '1팀박스실',
//       zone: '현장 온열',
//       type: 'PROD1',
//       temp: 39.2,
//       hum: 68.0,
//       min: -18.0,
//       max: 38.0
//     }
//   ];

//   try {
//     await sendEmailNotification({
//       items: mockAlertItems,
//       emailType: 'ALERT',
//       isTest: false,
//       targetEmail: 'joker@choheung.co.kr'
//     });
//     console.log('✅ 발송 성공! joker@choheung.co.kr 수신함에서 새 제목을 확인해 보세요.');
//   } catch (err) {
//     console.error('❌ 발송 실패:', err.message);
//   }
// }

// testToJoker();