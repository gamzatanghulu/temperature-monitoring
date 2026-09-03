const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

// 루트 디렉토리에서 config 폴더 내 파일들을 불러오므로 ./config/파일명 으로 연결
const { HASH_KEY, FETCH_INTERVAL_MS, SENSOR_CONFIG } = require('./config/sensorConfig');
const { initDbPool, createTableIfNotExists, saveSensorDataToOracle, loadInitialHistoryFromOracle } = require('./config/db');
const { calculateFeelsLikeTemp } = require('./config/calc');
const { fetchJoatechGasData } = require('./config/joatechService');
const { sendEmailNotification } = require('./config/mailService');
const createApiRouter = require('./config/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'bypass-tunnel-reminder', 'ngrok-skip-browser-warning'],
  credentials: true
}));

// OPTIONS Preflight 요청 사전 승인 처리
app.options(/(.*)/, cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const axiosClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 10000
});

// 전역 상태 관리
const sensorStateMap = {}; 
let sensorHistory = [];
let cachedSensorData = {
  result_code: -1,
  name_list: [],
  data_list_1: [],
  data_list_2: [],
  feels_like_list: [],
  sensor_configs: [],
  alert_items: [],
  joa_co2: null,
  joa_n2: null,
  joa_gas_data: null,
  updated_at: null
};

// API 라우터 연결 (메모리 캐시 상태 주입)
app.use('/api', createApiRouter(() => ({ cachedSensorData, sensorHistory })));

// 5분 주기 통합 스크래핑 함수
async function fetchAndProcessData() {
  try {
    // 1) cpSensor 온도계 수집
    const response = await axiosClient.post(
      'https://cpsensor.com/pcview/users/get_monitor_thermometers.php',
      { hash_value: HASH_KEY },
      {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://cpsensor.com/pcview/?i=${HASH_KEY}`,
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    // 2) 조아테크 가스 수집
    const joaGasResult = await fetchJoatechGasData();
    const data = response.data;

    if (data && data.result_code === 0 && Array.isArray(data.name_list)) {
      const apiDataMap = {};
      
      data.name_list.forEach((rawName, index) => {
        const temp = parseFloat(data.data_list_1[index]);
        const hum = (data.data_list_2 && data.data_list_2[index] !== undefined) 
          ? parseFloat(data.data_list_2[index]) : 0;
        apiDataMap[rawName] = { temp, hum };
      });

      let joaCo2Data = null;
      let joaN2Data = null;

      if (joaGasResult) {
        if (joaGasResult.joa_co2) joaCo2Data = joaGasResult.joa_co2;
        if (joaGasResult.joa_n2) joaN2Data = joaGasResult.joa_n2;
        
        Object.keys(joaGasResult).forEach(k => { apiDataMap[k] = joaGasResult[k]; });
      }

      const filteredNames = [], filteredTemps = [], filteredHums = [], feelsLikeTemps = [];
      const sensorConfigs = [], alertItems = [], itemsToSaveDb = [];
      const newlyAlertedItems = [], newlyRecoveredItems = [];

      Object.keys(SENSOR_CONFIG).forEach((rawName) => {
        const cfg = SENSOR_CONFIG[rawName];
        const sensorApiData = apiDataMap[rawName];

        const temp = (sensorApiData && !isNaN(sensorApiData.temp)) ? sensorApiData.temp : null;
        const hum = (sensorApiData && !isNaN(sensorApiData.hum)) ? sensorApiData.hum : null;
        const feelsLike = (temp !== null && hum !== null && cfg.type === 'OUTDOOR') 
          ? calculateFeelsLikeTemp(temp, hum) : temp;

        const targetTempForAlert = (cfg.type === 'OUTDOOR') ? feelsLike : temp;
        const isCurrentlyWarning = (temp !== null && !isNaN(temp)) && (targetTempForAlert < cfg.min || targetTempForAlert > cfg.max);
        const previousState = sensorStateMap[rawName] || 'NORMAL';

        const itemObj = { rawName, displayName: cfg.name, zone: cfg.zone, type: cfg.type, temp, feelsLike, hum, min: cfg.min, max: cfg.max };

        if (isCurrentlyWarning && previousState === 'NORMAL') {
          sensorStateMap[rawName] = 'WARNING';
          newlyAlertedItems.push(itemObj);
        } else if (!isCurrentlyWarning && previousState === 'WARNING') {
          sensorStateMap[rawName] = 'NORMAL';
          newlyRecoveredItems.push(itemObj);
        }

        if (isCurrentlyWarning) alertItems.push(itemObj);

        filteredNames.push(rawName);
        filteredTemps.push(temp);
        filteredHums.push(hum);
        feelsLikeTemps.push(feelsLike);
        sensorConfigs.push({ ...cfg, rawName, isWarning: isCurrentlyWarning });

        if (temp !== null) {
          itemsToSaveDb.push({ name: cfg.name || rawName, type: cfg.type, temp, hum, feelsLike });
        }
      });

      if (itemsToSaveDb.length > 0) await saveSensorDataToOracle(itemsToSaveDb);

      const currentTime = new Date().toLocaleTimeString('ko-KR', { 
        timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });

      cachedSensorData = {
        result_code: 0,
        name_list: filteredNames,
        data_list_1: filteredTemps,
        data_list_2: filteredHums,
        feels_like_list: feelsLikeTemps,
        sensor_configs: sensorConfigs,
        alert_items: alertItems,
        joa_co2: joaCo2Data,
        joa_n2: joaN2Data,
        joa_gas_data: joaGasResult,
        updated_at: currentTime
      };

      sensorHistory.push({ time: currentTime, temps: filteredTemps, hums: filteredHums, feelsLikes: feelsLikeTemps });
      if (sensorHistory.length > 288) sensorHistory.shift();

      if (newlyAlertedItems.length > 0) await sendEmailNotification({ items: newlyAlertedItems, emailType: 'ALERT' });
      if (newlyRecoveredItems.length > 0) await sendEmailNotification({ items: newlyRecoveredItems, emailType: 'RECOVERY' });
    }
  } catch (error) {
    console.error(`[오류] 데이터 수집 주기 처리 에러:`, error.message);
  }
}

// 서버 구동
app.listen(PORT, async () => {
  console.log(`[시스템] 백엔드 관제 서버 구동 중 (PORT: ${PORT})`);
  try {
    await initDbPool();
    await createTableIfNotExists();
    sensorHistory = await loadInitialHistoryFromOracle();
  } catch (err) {
    console.error('[오류] 초기화 작업 실패:', err.message);
  }

  fetchAndProcessData();
  setInterval(fetchAndProcessData, FETCH_INTERVAL_MS);
});