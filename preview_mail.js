const fs = require('fs');

function getViolationReasonsListHtml(item, emailType) {
  if (emailType === 'RECOVERY') {
    return `<div style="background-color: #f0fdf4; color: #15803d; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #bbf7d0;">✓ 설정된 적정 범위 내로 안전하게 복구되었습니다.</div>`;
  }

  let reasons = [];
  if (item.type === 'GAS') {
    const weight = Number(item.temp || 0);
    const pressure = Number(item.hum || 0);
    if (weight < 500) {
      reasons.push(`
        <div style="display: flex; align-items: center; background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; width: 80px;">용량 부족</span>
          <span style="font-size: 12px; color: #334155; font-weight: 600;">잔량 <b>${weight} kg</b> (기준 500 kg 미만)</span>
        </div>`);
    }
  }
  return reasons.join('');
}

// 💡 테스트용 복구 데이터 및 타입 설정 ('RECOVERY')
const emailType = 'RECOVERY'; 
const mockItems = [
  {
    rawName: 'joa_co2',
    displayName: '탄산 고압용기',
    zone: '가스 저장소',
    type: 'GAS',
    temp: 2450.0, // 정상 수치로 복구된 상황
    hum: 15.0
  }
];

const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const subject = '[정상복구] 탄산 고압용기 정상 수치 복귀 완료';
const themeColor = '#15803d'; // 초록색 테마
const headerBadgeText = 'NORMAL RECOVERY';
const headerBadgeBg = '#dcfce7';
const headerBadgeColor = '#15803d';

const cardsHtml = mockItems.map(item => {
  const valDisplay = `${item.temp} kg / ${item.hum} bar`;

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
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">상태 안내</div>
        ${getViolationReasonsListHtml(item, emailType)}
      </div>
    </div>`;
}).join('');

const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>관제 시스템 알림 미리보기 (정상복구)</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px 10px; color: #1e293b;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; border-collapse: separate;">
        <tr>
            <td style="background-color: ${themeColor}; padding: 28px 36px 32px 36px; color: #ffffff;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                    <tr>
                        <td align="left" style="vertical-align: middle; font-weight: 800; font-size: 20px; letter-spacing: 1px;">
                            CHOHEUNG
                        </td>
                        <td align="right" style="vertical-align: middle;">
                            <span style="display: inline-block; padding: 4px 10px; background-color: ${headerBadgeBg}; color: ${headerBadgeColor}; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                                ${headerBadgeText}
                            </span>
                        </td>
                    </tr>
                </table>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; color: #ffffff;">${subject}</h1>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #ffffff; opacity: 0.9; line-height: 1.5;">이전 경고 상태였던 항목이 정상 수치 범위 내로 안전하게 복구되었습니다.</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px 36px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
                    <tr>
                        <td align="left" style="font-size: 13px; color: #64748b;"><b>처리 시각:</b> ${nowStr}</td>
                        <td align="right" style="font-size: 13px; color: #64748b;">
                            <b>대상 항목:</b> <span style="color: ${themeColor}; font-weight: 700;">${mockItems.length}건</span>
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

fs.writeFileSync('mail_preview.html', htmlContent, 'utf-8');
console.log('✅ 정상복구 미리보기 파일 생성 완료! "mail_preview.html" 파일을 브라우저로 열어보세요.');