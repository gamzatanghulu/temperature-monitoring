module.exports = {
  HASH_KEY: process.env.HASH_KEY || '75597298595310529218112835277866',
  RECEIVER_TO: process.env.RECEIVER_TO || "yhlohna@choheung.co.kr",
  RECEIVER_CC: process.env.RECEIVER_CC || "joker@choheung.co.kr; ohdonga@choheung.co.kr; moonflair@choheung.co.kr; hojin3131@choheung.co.kr; sh_yoon001@choheung.co.kr; su25@choheung.co.kr; yoonsook.ko@choheung.co.kr; iopen009@choheung.co.kr",
  FETCH_INTERVAL_MS: 5 * 60 * 1000, // 5분

  JOA_CONFIG: {
    id: process.env.JOA_ID || '01095052917',
    pw: process.env.JOA_PW || '5646',
    isLoggedIn: false
  },

  SENSOR_CONFIG: {
    '스마트온도계': { name: '공무팀', zone: '야외 현장', type: 'OUTDOOR', min: 0.0, max: 50.0, sensorId: '6281-7088' },
    '13room':       { name: '외부창고', zone: '야외 현장', type: 'OUTDOOR', min: 0.0, max: 50.0, sensorId: '8629-9794' },
    '2team1':       { name: '쿠커실', zone: '현장 온열', type: 'OUTDOOR', min: 0.0, max: 36.0, sensorId: '7244-3574' },
    '2team':        { name: '유화솥', zone: '현장 온열', type: 'OUTDOOR', min: 0.0, max: 36.0, sensorId: '4289-4748' },
    '스마트센서':   { name: '13번창고', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '8433-5905', channel: 1 },
    'joa_co2':      { name: '탄산 고압용기', zone: '가스 저장소', type: 'GAS' },
    'joa_n2':       { name: '질소 고압용기', zone: '가스 저장소', type: 'GAS' }
  }
};