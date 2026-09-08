const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

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

app.options(/(.*)/, cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const axiosClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 10000
});

// 실시간 상태 캐시 변수
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

// API 라우트 주입
app.use('/api', createApiRouter(() => ({ cachedSensorData, sensorHistory })));

// 주기적 스크래핑 및 DB 저장
async function fetchAndProcessData() {
  try {
    // cpSensor 센서 데이터 수집
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

    // 조아테크 가스 수집
    const joaGasResult = await fetchJoatechGasData();
    const data = response.data;

    if (data && data.result_code === 0 && Array.isArray(data.name_list)) {
      const apiDataMap = {};
      
      // cpSensor 응답 맵 구성
      data.name_list.forEach((rawName, index) => {
        const temp = parseFloat(data.data_list_1[index]);
        const hum = (data.data_list_2 && data.data_list_2[index] !== undefined) 
          ? parseFloat(data.data_list_2[index]) : 0;
        apiDataMap[rawName] = { temp, hum };
      });

      let joaCo2Data = null;
      let joaN2Data = null;

      // 조아테크 데이터 재계산
      if (joaGasResult) {
        const prevCo2Weight = cachedSensorData.joa_co2?.weight ?? joaGasResult.joa_co2?.weight ?? 0;
        const prevN2Weight = cachedSensorData.joa_n2?.weight ?? joaGasResult.joa_n2?.weight ?? 0;

        if (joaGasResult.joa_co2) {
          const currentWeight = joaGasResult.joa_co2.weight;
          const currentPressure = joaGasResult.joa_co2.pressure;
          const usage = Math.max(0, parseFloat((prevCo2Weight - currentWeight).toFixed(2)));

          joaCo2Data = {
            ...joaGasResult.joa_co2,
            usage: usage
          };

          apiDataMap['joa_co2'] = {
            temp: parseFloat(currentWeight || 0),
            hum: parseFloat(currentPressure || 0),
            feelsLike: usage,
            rawGasData: joaCo2Data
          };
        }

        if (joaGasResult.joa_n2) {
          const currentWeight = joaGasResult.joa_n2.weight;
          const currentPressure = joaGasResult.joa_n2.pressure;
          const usage = Math.max(0, parseFloat((prevN2Weight - currentWeight).toFixed(2)));

          joaN2Data = {
            ...joaGasResult.joa_n2,
            usage: usage
          };

          apiDataMap['joa_n2'] = {
            temp: parseFloat(currentWeight || 0),
            hum: parseFloat(currentPressure || 0),
            feelsLike: usage,
            rawGasData: joaN2Data
          };
        }
      }

      const filteredNames = [], filteredTemps = [], filteredHums = [], feelsLikeTemps = [];
      const sensorConfigs = [], alertItems = [], itemsToSaveDb = [];
      const newlyAlertedItems = [], newlyRecoveredItems = [];

      Object.keys(SENSOR_CONFIG).forEach((rawName) => {
        const cfg = SENSOR_CONFIG[rawName];
        const sensorApiData = apiDataMap[rawName];

        const temp = (sensorApiData && !isNaN(sensorApiData.temp)) ? sensorApiData.temp : null;
        const hum = (sensorApiData && !isNaN(sensorApiData.hum)) ? sensorApiData.hum : null;
        
        let feelsLike = temp;
        if (cfg.type === 'OUTDOOR' && temp !== null && hum !== null) {
          feelsLike = calculateFeelsLikeTemp(temp, hum);
        } else if (cfg.type === 'GAS') {
          feelsLike = (sensorApiData && sensorApiData.feelsLike !== undefined) ? sensorApiData.feelsLike : 0;
        }

        const targetTempForAlert = (cfg.type === 'OUTDOOR') ? feelsLike : temp;
        
        // 임계값 및 임계범위 상태 체크
        const hasThresholds = (cfg.min !== undefined && cfg.max !== undefined);
        const isCurrentlyWarning = hasThresholds && (temp !== null && !isNaN(temp)) && (targetTempForAlert < cfg.min || targetTempForAlert > cfg.max);
        const previousState = sensorStateMap[rawName] || 'NORMAL';

        const itemObj = { rawName, displayName: cfg.name, zone: cfg.zone, type: cfg.type, temp, feelsLike, hum, min: cfg.min, max: cfg.max };

        if (isCurrentlyWarning && previousState === 'NORMAL') {
          sensorStateMap[rawName] = 'WARNING';
          newlyAlertedItems.push(itemObj);
          console.warn(`샤갈 경보 터짐: [${cfg.name}] 현재값 ${targetTempForAlert}`);
        } else if (!isCurrentlyWarning && previousState === 'WARNING') {
          sensorStateMap[rawName] = 'NORMAL';
          newlyRecoveredItems.push(itemObj);
          console.log(`휴 살았다... 경보 해제: [${cfg.name}] 정상 복귀`);
        }

        if (isCurrentlyWarning) alertItems.push(itemObj);

        filteredNames.push(rawName);
        filteredTemps.push(temp);
        filteredHums.push(hum);
        feelsLikeTemps.push(feelsLike);
        sensorConfigs.push({ ...cfg, rawName, isWarning: isCurrentlyWarning });

        // 오라클 DB 보낼 배열
        if (temp !== null) {
          itemsToSaveDb.push({ 
            rawName, 
            name: cfg.name || rawName, 
            type: cfg.type, 
            temp, 
            hum, 
            feelsLike 
          });
        }
      });

      // 오라클 DB 저장
      if (itemsToSaveDb.length > 0) {
        try {
          await saveSensorDataToOracle(itemsToSaveDb);
        } catch (dbErr) {
          console.error('슈발 저장실패:', dbErr.message);
        }
      }

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

      // 알림 메일 발송
      if (newlyAlertedItems.length > 0) await sendEmailNotification({ items: newlyAlertedItems, emailType: 'ALERT' });
      if (newlyRecoveredItems.length > 0) await sendEmailNotification({ items: newlyRecoveredItems, emailType: 'RECOVERY' });
      
      console.log(`[${currentTime}] 데이터 갱신 완료 (수집 센서: ${filteredNames.length}개)`);
    } else {
      console.log('cpSensor 응답 이상함.. 데이터 확인 필요:', data);
    }
  } catch (error) {
    console.error('수집 뻗음ㅅㅂ :', error.message);
  }
}

// 서버 구동 및 오라클 초기화
app.listen(PORT, async () => {
  console.log(`서버 스타트... 포트 번호: ${PORT}`);
  try {
    await initDbPool();
    await createTableIfNotExists();
    sensorHistory = await loadInitialHistoryFromOracle();
    console.log('로드 성공 무야호');
  } catch (err) {
    console.error('에라이 DB 초기화 망함:', err.message);
  }

  fetchAndProcessData();
  setInterval(fetchAndProcessData, FETCH_INTERVAL_MS);
});