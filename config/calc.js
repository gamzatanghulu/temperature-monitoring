// 기온과 습도 기반 체감온도 산출
function calculateFeelsLikeTemp(Ta, RH) {
  // 수치 파싱 및 유효성 검증
  const temp = parseFloat(Ta);
  const hum = parseFloat(RH);

  if (isNaN(temp) || isNaN(hum)) return Ta;
  if (temp < 20.0) return Math.round(temp * 10) / 10;

  // 습도 범위 예외 처리 (0% 이하 방지)
  const safeHum = Math.max(Math.min(hum, 100.0), 0.1);

  const a = 17.27, b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(safeHum / 100.0);
  const Td = (b * alpha) / (a - alpha);

  const Tw = temp * Math.atan(0.151977 * Math.sqrt(safeHum + 8.313659)) +
             Math.atan(temp + safeHum) -
             Math.atan(safeHum - 1.676331) +
             0.00391838 * Math.pow(safeHum, 1.5) * Math.atan(0.023101 * safeHum) - 4.686035;

  let ST = -2.653 + (0.994 * temp) + (0.0153 * Math.pow(Tw, 2)) + (0.0003 * Math.pow(Td, 2));
  const maxDiff = 1.0 + (safeHum * 0.03); 
  
  if (ST > temp + maxDiff) ST = temp + maxDiff;

  return Math.round(ST * 10) / 10;
}

// 조회 범위에 따른 히스토리 데이터 필터링
function getFilteredHistory(history, range) {
  if (!history || history.length === 0) return [];
  const limit = (range && range.toLowerCase() === '1h') ? 12 : 288;
  return history.slice(-limit);
}

// 모듈 내보내기
module.exports = {
  calculateFeelsLikeTemp,
  getFilteredHistory
};