const nodemailer = require('nodemailer');
const path = require('path');
const { RECEIVER_TO, RECEIVER_CC } = require('./sensorConfig');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'joheunggf@gmail.com',
    pass: process.env.SMTP_PASS || 'qele odul pifn ynum'
  }
});

async function sendEmailNotification({ items, emailType = 'ALERT', isTest = false }) {
  const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  let alertCategoryTitle = "긴급 온도/가스 경고";
  let headerBg = "#dc2626";
  let headerStatusBadge = "CRITICAL ALERT";

  if (isTest) {
    alertCategoryTitle = "통합 관제 시스템 연동 확인";
    headerBg = "#2563eb";
    headerStatusBadge = "SYSTEM TEST";
  } else if (emailType === 'RECOVERY') {
    alertCategoryTitle = "안전한 상태로 복구되었습니다";
    headerBg = "#059669";
    headerStatusBadge = "STATUS RECOVERED";
  } else if (items.length > 0) {
    const types = items.map(i => i.type);
    if (types.includes('GAS')) {
      alertCategoryTitle = "탄산/질소 고압용기 잔량/압력 이상 경보";
      headerBg = "#7c3aed";
      headerStatusBadge = "GAS TANK ALERT";
    } else if (types.includes('OUTDOOR')) {
      alertCategoryTitle = "폭염 / 온열질환 위험 경보 (체감온도 초과)";
      headerBg = "#ea580c";
      headerStatusBadge = "HEAT WAVE ALERT";
    } else if (types.includes('FREEZING')) {
      alertCategoryTitle = "냉동창고 긴급 온도 이상";
      headerBg = "#4f46e5";
      headerStatusBadge = "FREEZER ALERT";
    } else if (types.includes('COOLING')) {
      alertCategoryTitle = "냉장창고 긴급 온도 이상";
      headerBg = "#0284c7";
      headerStatusBadge = "COOLING ALERT";
    }
  }

  const subject = isTest
    ? `[시스템 테스트] 통합 관제 시스템 연결 확인`
    : `[${alertCategoryTitle}] 관제 시스템 리포트 (${nowStr})`;

  let rowsHtml = '';
  if (isTest) {
    rowsHtml = `
      <tr>
        <td style="padding: 16px 20px; font-size: 14px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 600;">테스트 센서</td>
        <td style="padding: 16px 20px; font-size: 13px; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: center;">전체 관제 구역</td>
        <td style="padding: 16px 20px; font-size: 13px; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: center;">-</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; color: #15803d; border-radius: 20px; font-size: 12px; font-weight: 700;">● 정상 연동</span>
        </td>
      </tr>`;
  } else {
    rowsHtml = items.map(item => {
      const isOutdoor = item.type === 'OUTDOOR';
      const isGas = item.type === 'GAS';
      const isRecovery = (emailType === 'RECOVERY');
      const tempColor = isRecovery ? '#059669' : '#dc2626';

      let tempDisplay = '';
      if (isGas) {
        tempDisplay = `<div style="font-size: 15px; font-weight: 800; color: ${tempColor}; font-family: 'Consolas', monospace;">${item.temp} MPa</div>`;
      } else if (isOutdoor) {
        tempDisplay = `<div style="font-size: 15px; font-weight: 800; color: ${tempColor}; font-family: 'Consolas', monospace;">
             ${item.temp}℃ <span style="font-size: 12px; color: #64748b; font-weight: 400;">(${item.hum}%)</span>
           </div>
           <div style="margin-top: 4px;">
             <span style="display: inline-block; padding: 2px 8px; background-color: ${isRecovery ? '#ecfdf5' : '#fef2f2'}; color: ${tempColor}; border: 1px solid ${isRecovery ? '#a7f3d0' : '#fecaca'}; border-radius: 6px; font-size: 11px; font-weight: 700;">
               체감 ${item.feelsLike}℃
             </span>
           </div>`;
      } else {
        tempDisplay = `<div style="font-size: 15px; font-weight: 800; color: ${tempColor}; font-family: 'Consolas', monospace;">${item.temp}℃</div>
           <div style="font-size: 12px; color: #64748b; margin-top: 2px;">습도 ${item.hum}%</div>`;
      }

      return `
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${item.displayName}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${item.zone}</div>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: center; vertical-align: middle;">
          <span style="font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; display: inline-block;">${item.type}</span>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: center; vertical-align: middle; font-size: 13px; color: #334155; font-weight: 600;">
          ${isOutdoor ? '체감 ' : ''}${item.min} ~ ${item.max}
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; text-align: right; vertical-align: middle;">
          ${tempDisplay}
        </td>
      </tr>`;
    }).join('');
  }

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
            <td style="background-color: ${headerBg}; padding: 28px 36px 32px 36px; color: #ffffff;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                    <tr>
                        <td align="left" style="vertical-align: middle;">
                            <img src="cid:choheungLogo" alt="CHOHEUNG LOGO" style="display: block; max-height: 32px; width: auto; border: 0;" />
                        </td>
                        <td align="right" style="vertical-align: middle;">
                            <span style="display: inline-block; padding: 4px 10px; background-color: #ffffff; color: ${headerBg}; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                                ${headerStatusBadge}
                            </span>
                        </td>
                    </tr>
                </table>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3; color: #ffffff;">${alertCategoryTitle}</h1>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #ffffff; opacity: 0.9; line-height: 1.5;">
                    ${isTest 
                      ? '본 메일은 통합 관제 시스템의 이메일 발송 기능 테스트 메일입니다.' 
                      : emailType === 'RECOVERY'
                        ? '점검 및 수리가 완료되어 센서가 안전한 정상 범위로 회복되었습니다.'
                        : '설정된 적정 범위를 이탈한 센서가 감지되었습니다. 수리 동안 추가 중복 메일은 방지됩니다.'}
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px 36px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
                    <tr>
                        <td align="left" style="font-size: 13px; color: #64748b;"><b>발생 시각:</b> ${nowStr}</td>
                        <td align="right" style="font-size: 13px; color: #64748b;">
                            <b>대상 항목:</b> <span style="color: ${emailType === 'RECOVERY' ? '#059669' : '#dc2626'}; font-weight: 700;">${isTest ? '0' : items.length}건</span>
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

  try {
    const mailOptions = {
      from: process.env.SMTP_USER || '"스마트관제" <no-reply@choheung.co.kr>',
      to: RECEIVER_TO,
      cc: RECEIVER_CC,
      subject: subject,
      html: htmlContent,
      attachments: [
        {
          filename: 'choheung_logo.png',
          path: path.join(__dirname, '../choheung_logo.png'),
          cid: 'choheungLogo'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[이메일] ${subject} 전송 완료 (${info.messageId})`);
    return true;
  } catch (err) {
    console.error('[이메일 오류] 전송 실패:', err);
    throw err;
  }
}

module.exports = { sendEmailNotification };