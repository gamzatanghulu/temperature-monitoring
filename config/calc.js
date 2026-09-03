function calculateFeelsLikeTemp(Ta, RH) {
  if (Ta === null || RH === null || isNaN(Ta) || isNaN(RH)) return Ta;
  if (Ta < 20.0) return Math.round(Ta * 10) / 10;

  const a = 17.27, b = 237.7;
  const alpha = ((a * Ta) / (b + Ta)) + Math.log(RH / 100.0);
  const Td = (b * alpha) / (a - alpha);

  const Tw = Ta * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
             Math.atan(Ta + RH) -
             Math.atan(RH - 1.676331) +
             0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;

  let ST = -2.653 + (0.994 * Ta) + (0.0153 * Math.pow(Tw, 2)) + (0.0003 * Math.pow(Td, 2));
  const maxDiff = 1.0 + (RH * 0.03); 
  
  if (ST > Ta + maxDiff) ST = Ta + maxDiff;

  return Math.round(ST * 10) / 10;
}

function getFilteredHistory(history, range) {
  if (!history || history.length === 0) return [];
  const limit = (range && range.toLowerCase() === '1h') ? 12 : 288;
  return history.slice(-limit);
}

// 이 부분이 반드시 존재해야 불러올 때 함수로 인식됩니다!
module.exports = {
  calculateFeelsLikeTemp,
  getFilteredHistory
};