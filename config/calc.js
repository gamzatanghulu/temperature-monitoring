// 기온과 습도 기반 체감온도 산출 (기상청/안전보건공단 표준 공식)
function calculateFeelsLikeTemp(Ta, RH) {
  // 수치 파싱 및 유효성 검증
  const temp = parseFloat(Ta);
  const hum = parseFloat(RH);

  if (isNaN(temp) || isNaN(hum)) return Ta;
  
  // 20℃ 미만일 경우 실제 기온 그대로 반환
  if (temp < 20.0) return Math.round(temp * 10) / 10;

  // 습도 범위 예외 처리 (0.1% ~ 100%)
  const safeHum = Math.max(Math.min(hum, 100.0), 0.1);

  // 1. 이슬점 온도(Td) 계산
  const a = 17.27, b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(safeHum / 100.0);
  const Td = (b * alpha) / (a - alpha);

  // 2. 습구온도(Tw) 계산 (Stull 공식)
  const Tw = temp * Math.atan(0.151977 * Math.sqrt(safeHum + 8.313659)) +
             Math.atan(temp + safeHum) -
             Math.atan(safeHum - 1.676331) +
             0.00391838 * Math.pow(safeHum, 1.5) * Math.atan(0.023101 * safeHum) - 4.686035;

  // 3. 체감온도(ST) 기본 산출
  let ST = -2.653 + (0.994 * temp) + (0.0153 * Math.pow(Tw, 2)) + (0.0003 * Math.pow(Td, 2));

  // 4. 습도 보정 한계치 계산
  const maxDiff = 1.0 + (safeHum * 0.03); 

  // 5. 상한선 및 하한선 제한 (기온 대비 과도한 편차 방지)
  if (ST > temp + maxDiff) {
    ST = temp + maxDiff;
  } else if (ST < temp - maxDiff) {
    ST = temp - maxDiff; // ★ 누락되어 있던 하한선 보정식 추가
  }

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