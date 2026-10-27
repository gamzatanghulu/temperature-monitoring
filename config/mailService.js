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

// 메일 제목 생성 함수 ([경보] 또는 [정상복구] 포맷 분기)
function generateSubject(items, isTest, emailType) {
  if (isTest) return '[시스템 테스트] 통합 관제 시스템 연결 확인';
  if (!items || items.length === 0) return '[관제 시스템] 상태 변경 안내';

  const firstItem = items[0];
  const count = items.length;
  const prefix = (emailType === 'RECOVERY') ? '[정상복구]' : '[경보]';

  if (count > 1) {
    return `${prefix} ${firstItem.displayName} 외 ${count - 1}건 상태 변화`;
  }

  const nameStr = firstItem.displayName || firstItem.rawName;

  if (emailType === 'RECOVERY') {
    return `${prefix} ${nameStr} 정상 수치 복귀 완료`;
  }

  switch (firstItem.type) {
    case 'GAS':
      return `${prefix} ${nameStr} (${firstItem.temp}kg / ${firstItem.hum}bar)`;

    case 'HEAT':
      const feelsLikeVal = firstItem.feelsLike !== undefined ? firstItem.feelsLike : firstItem.temp;
      return `${prefix} ${nameStr} (${firstItem.temp}℃ / 체감 ${feelsLikeVal}℃)`;

    default:
      return `${prefix} ${nameStr} (${firstItem.temp}℃ / 습도 ${firstItem.hum}%)`;
  }
}

// 장애 사유 HTML 생성 (직관적인 뱃지 형태)
function getViolationReasonsListHtml(item, emailType) {
  if (emailType === 'RECOVERY') {
    return `<div style="background-color: #f0fdf4; color: #15803d; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #bbf7d0;">✓ 설정된 적정 범위 내로 안전하게 복구되었습니다.</div>`;
  }

  let reasons = [];

  if (item.type === 'GAS') {
    const weight = Number(item.temp || 0);
    const pressure = Number(item.hum || 0);
    const isCo2 = item.rawName === 'joa_co2';
    
    if (weight < 500) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">용량 부족</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">잔량 <b>${weight} kg</b> (기준 500 kg 미만)</span>
        </div>`);
    }
    if (isCo2 && pressure < 10.0) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">탄산 저압</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">압력 <b>${pressure} bar</b> (기준 10.0 bar 미만)</span>
        </div>`);
    } else if (!isCo2 && pressure < 8.0) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">질소 저압</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">압력 <b>${pressure} bar</b> (기준 8.0 bar 미만)</span>
        </div>`);
    }
    if (pressure > 20.0) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">고압 위험</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">압력 <b>${pressure} bar</b> (기준 20.0 bar 초과)</span>
        </div>`);
    }
  } else if (item.type === 'HEAT') {
    const feels = item.feelsLike !== undefined ? item.feelsLike : item.temp;
    if (feels >= 33.0) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">폭염 위험</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">체감온도 <b>${feels}℃</b> (경고 기준 33.0℃ 이상)</span>
        </div>`);
    }
  } else {
    if (item.temp < item.min) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">저온 이탈</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">현재 <b>${item.temp}℃</b> (최저 기준 ${item.min}℃ 미만)</span>
        </div>`);
    }
    if (item.temp > item.max) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">고온 이탈</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">현재 <b>${item.temp}℃</b> (최고 기준 ${item.max}℃ 초과)</span>
        </div>`);
    }
  }

  return reasons.length > 0 ? reasons.join('') : `<div style="color: #dc2626; font-weight: 700; font-size: 12px;">• 규격 범위를 이탈하였습니다.</div>`;
}

// 관제 알림 이메일 발송 함수
async function sendEmailNotification({ items = [], emailType = 'ALERT', isTest = false, targetEmail = null }) {
  if (Array.isArray(items)) {
    items = items.filter(item => {
      const val = parseFloat(item.temp);
      if (isNaN(val) || val < -100) {
        console.warn(`[관제 시스템] 비정상 센서 데이터(-273℃ 등 통신 오류) 감지로 인해 메일 발송 대상에서 제외함:`, item);
        return false;
      }
      return true;
    });
  }

  if (!isTest && emailType === 'ALERT' && (!items || items.length === 0)) {
    console.log('[관제 시스템] 유효한 경고 항목이 없어 이메일 발송을 취소합니다.');
    return false;
  }

  const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const subject = generateSubject(items, isTest, emailType);
  const isRecovery = (emailType === 'RECOVERY');

  const themeColor = isRecovery ? '#15803d' : '#dc2626';
  const headerBadgeText = isRecovery ? 'NORMAL RECOVERY' : 'CRITICAL ALERT';
  const headerBadgeBg = isRecovery ? '#dcfce7' : '#ffffff';
  const headerBadgeColor = isRecovery ? '#15803d' : '#dc2626';

  const cardsHtml = isTest 
    ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">테스트 센서</div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">전체 관제 구역</div>
        <div style="background-color: #dcfce7; color: #15803d; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; text-align: center;">
          ● 시스템 정상 연동 확인 완료
        </div>
      </div>`
    : items.map(item => {
        const valDisplay = item.type === 'GAS' 
          ? `${item.temp} kg / ${item.hum} bar`
          : item.type === 'HEAT'
            ? `${item.temp}℃ (체감 ${item.feelsLike ?? item.temp}℃)`
            : `${item.temp}℃ (습도 ${item.hum}%)`;

        return `
          <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px;">
              <tr>
                <td align="left">
                  <span style="font-size: 15px; font-weight: 800; color: #0f172a;">${item.displayName}</span>
                  <span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 600;">${item.zone}</span>
                </td>
                <td align="right">
                  <span style="font-size: 11px; font-weight: 700; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px;">${item.type}</span>
                </td>
              </tr>
            </table>

            <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #64748b; font-weight: 600;">현재 측정치</span>
              <span style="font-size: 15px; font-weight: 800; color: ${themeColor}; font-family: 'Consolas', monospace;">${valDisplay}</span>
            </div>

            <div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">상세 발생 원인 및 사유</div>
              ${getViolationReasonsListHtml(item, emailType)}
            </div>
          </div>`;
      }).join('');

  const bodyDescription = isTest
    ? '본 메일은 통합 관제 시스템의 이메일 발송 기능 테스트 메일입니다.'
    : isRecovery 
      ? '이전 경고 상태였던 항목이 정상 수치 범위 내로 안전하게 복구되었습니다.' 
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
            <td style="background-color: ${themeColor}; padding: 28px 36px 32px 36px; color: #ffffff;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                    <tr>
                        <td align="left" style="vertical-align: middle;">
                            <img src="cid:choheungLogo" alt="CHOHEUNG LOGO" style="display: block; max-height: 32px; width: auto; border: 0;" />
                        </td>
                        <td align="right" style="vertical-align: middle;">
                            <span style="display: inline-block; padding: 4px 10px; background-color: ${headerBadgeBg}; color: ${headerBadgeColor}; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                                ${headerBadgeText}
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
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
                    <tr>
                        <td align="left" style="font-size: 13px; color: #64748b;"><b>처리 시각:</b> ${nowStr}</td>
                        <td align="right" style="font-size: 13px; color: #64748b;">
                            <b>대상 항목:</b> <span style="color: ${themeColor}; font-weight: 700;">${isTest ? '0' : items.length}건</span>
                        </td>
                    </tr>
                </table>

                <div>
                    ${cardsHtml}
                </div>

                <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 10px; text-align: center; font-size: 12px; color: #94a3b8;">
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