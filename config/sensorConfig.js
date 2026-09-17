module.exports = {
  HASH_KEY: process.env.HASH_KEY || '75597298595310529218112835277866',
  // RECEIVER_TO: process.env.RECEIVER_TO || "yhlohna@choheung.co.kr",
  // RECEIVER_CC: process.env.RECEIVER_CC || "joker@choheung.co.kr; ohdonga@choheung.co.kr; moonflair@choheung.co.kr; hojin3131@choheung.co.kr; sh_yoon001@choheung.co.kr; su25@choheung.co.kr; yoonsook.ko@choheung.co.kr; iopen009@choheung.co.kr",
  FETCH_INTERVAL_MS: 5 * 60 * 1000, // 5분


  JOA_CONFIG: {
    id: process.env.JOA_ID || '01095052917',
    pw: process.env.JOA_PW || '5646',
    isLoggedIn: false
  },

  SENSOR_CONFIG: {
    '스마트온도계': { name: '공무팀', zone: '야외 현장', type: 'PROD1', min: 0.0, max: 50.0, sensorId: '6281-7088' },
    '13room':       { name: '야외외부창고', zone: '야외 현장', type: 'PROD1', min: 0.0, max: 50.0, sensorId: '8629-9794' },
    '1팀외박스실':      { name: '1팀외박스실', zone: '현장 온열', type: 'PROD1', min: 0.0, max: 36.0, sensorId: '8555-3600' },
    '슈레드실1,2라인':      { name: '슈레드실1,2라인', zone: '현장 온열', type: 'PROD1', min: 0.0, max: 36.0, sensorId: '7084-4013', channel: 1 },
    '슈레드실3라인':      { name: '슈레드실3라인', zone: '현장 온열', type: 'PROD1', min: 0.0, max: 36.0, sensorId: '7084-4013', channel: 2 },
    '2team1':       { name: '쿠커실', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '7244-3574' },
    '2team':        { name: '유화솥', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '4289-4748' },
    '2팀천장':      { name: '2팀천장', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '5704-7896' },
    '골드포장실':      { name: '골드포장실', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '9318-2714' },
    '원료보관실':      { name: '원료보관실', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '3848-8683', channel: 1 },
    '소분계량실':      { name: '소분계량실', zone: '현장 온열', type: 'PROD2', min: 0.0, max: 36.0, sensorId: '3848-8683', channel: 2 },
    '10번창고':   { name: '10번냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '9751-1833', channel: 2},
    '11번창고':   { name: '11번냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '9751-1833', channel: 1},
    '스마트센서':   { name: '12번냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -5.0, sensorId: '8433-5905', channel: 1 },
    '2채널':   { name: '13번냉장창고', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '8433-5905', channel: 2 },
    '14번창고':   { name: '14번냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '4595-1501', channel: 1},
    '15번창고':   { name: '15번냉장창고', zone: '외부창고', type: 'COOLING', min: -1.0, max: 5.0, sensorId: '4595-1501', channel: 2},
    'B동 냉동':   { name: 'B동냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '8405-9325'},
    'B동 냉장1':   { name: 'B동냉장창고1', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 1},
    'B동 냉장2':   { name: 'B동냉장창고2', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 2},
    'joa_co2':      { name: '탄산 고압용기', zone: '가스 저장소', type: 'GAS' },
    'joa_n2':       { name: '질소 고압용기', zone: '가스 저장소', type: 'GAS' }
  }
};