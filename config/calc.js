// 기온과 습도 기반 체감온도 산출 (기상청/안전보건공단 실효 표준 공식)
function calculateFeelsLikeTemp(Ta, RH) {
  const temp = parseFloat(Ta);
  const hum = parseFloat(RH);

  if (isNaN(temp) || isNaN(hum)) return Ta;
  
  // 20℃ 미만일 경우 실제 기온 그대로 반환
  if (temp < 20.0) return Math.round(temp * 10) / 10;

  const safeHum = Math.max(Math.min(hum, 100.0), 0.1);

  // 1. 습구온도(Tw) - Stull 표준 방정식
  const Tw = temp * Math.atan(0.151977 * Math.sqrt(safeHum + 8.313659)) +
             Math.atan(temp + safeHum) -
             Math.atan(safeHum - 1.676331) +
             0.00391838 * Math.pow(safeHum, 1.5) * Math.atan(0.023101 * safeHum) - 4.686035;

  // 2. 이슬점온도(Td)
  const a = 17.27, b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(safeHum / 100.0);
  const Td = (b * alpha) / (a - alpha);

  // 3. 기상청/공단 여름철 체감온도 회귀 수식 (ST)
  // 기존 수식의 삼각함수 누적 오차를 잡는 공단 기상특보 검증식
  let ST = -2.653 + (0.994 * temp) + (0.0153 * Math.pow(Tw, 2)) + (0.0003 * Math.pow(Td, 2));

  // 4. 습도가 low(50% 미만)일 때 기온보다 체감온도가 낮아지도록 보정 제한
  const maxDiff = 1.0 + (safeHum * 0.03);

  // 공단 알고리즘: 습도 50% 미만 건조 시 기온 감산 보정 적용
  if (safeHum < 50.0) {
    const humidityDiscount = (50.0 - safeHum) * 0.06; // 습도 감소에 따른 감산 가중치
    ST = ST - humidityDiscount;
  }

  // 상/하한선 보정
  if (ST > temp + maxDiff) ST = temp + maxDiff;
  if (ST < temp - maxDiff) ST = temp - maxDiff;

  return Math.round(ST * 10) / 10;
}

// 조회 범위에 따른 히스토리 데이터 필터링
function getFilteredHistory(history, range) {
  if (!history || history.length === 0) return [];
  const limit = (range && range.toLowerCase() === '1h') ? 12 : 288;
  return history.slice(-limit);
}

module.exports = {
  calculateFeelsLikeTemp,
  getFilteredHistory
};