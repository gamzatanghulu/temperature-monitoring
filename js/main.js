// 센서 마스터 정보
const SENSOR_CONFIG = {
  '스마트온도계': { name: '공무팀', zone: '야외 현장', type: 'HEAT', min: -18.0, max: 38.0, sensorId: '6281-7088' },
  '13room':       { name: '야외외부', zone: '야외 현장', type: 'HEAT', min: -18.0, max: 38.0, sensorId: '8629-9794' },
  '2team1':       { name: '쿠커실', zone: '현장 온열', type: 'HEAT', min: -18.0, max: 38.0, sensorId: '7244-3574' },
  '2team':        { name: '유화솥', zone: '현장 온열', type: 'HEAT', min: -18.0, max: 38.0, sensorId: '4289-4748' },
  '1팀외박스실':    { name: '1팀박스실', zone: '현장 온열', type: 'PROD1', min: -18.0, max: 38.0, sensorId: '8555-3600' },
  '슈레드실1,2라인': { name: '슈레드 1,2', zone: '현장 온열', type: 'PROD1', min: -18.0, max: 38.0, sensorId: '7084-4013', channel: 1 },
  '슈레드실3라인':   { name: '슈레드 3', zone: '현장 온열', type: 'PROD1', min: -18.0, max: 38.0, sensorId: '7084-4013', channel: 2 },
  '2팀천장':      { name: '2팀천장', zone: '현장 온열', type: 'PROD2', min: -18.0, max: 38.0, sensorId: '5704-7896' },
  '골드포장실':    { name: '골드포장실', zone: '현장 온열', type: 'PROD2', min: -18.0, max: 38.0, sensorId: '9318-2714' },
  '원료보관실':    { name: '원료보관실', zone: '현장 온열', type: 'PROD2', min: -18.0, max: 38.0, sensorId: '3848-8683', channel: 1 },
  '소분계량실':    { name: '소분계량실', zone: '현장 온열', type: 'PROD2', min: -18.0, max: 38.0, sensorId: '3848-8683', channel: 2 },
  '10번창고':     { name: '10번 냉동', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '9751-1833', channel: 2},
  '11번창고':     { name: '11번 냉동', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '9751-1833', channel: 1},
  '스마트센서':   { name: '12번 냉동', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -5.0, sensorId: '8433-5905', channel: 1 },
  '2채널':       { name: '13번 냉장', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '8433-5905', channel: 2 },
  '14번창고':     { name: '14번 냉동', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '4595-1501', channel: 1},
  '15번창고':     { name: '15번 냉장', zone: '외부창고', type: 'COOLING', min: -1.0, max: 5.0, sensorId: '4595-1501', channel: 2},
  'B동 냉동':     { name: 'B동 냉동', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '8405-9325'},
  'B동 냉장1':    { name: 'B동 냉장1', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 1},
  'B동 냉장2':    { name: 'B동 냉장2', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 2}
};

// 시스템 설정
const CONFIG = {
  API_BASE_URL: 'https://taxation-back-assumed-utah.trycloudflare.com',
  ALARM_DURATION_SEC: 5,
  POLLING_INTERVAL_MS: 5000,
  EXCLUDED_ALERT_TYPES: ['GAS']
};

// 앱 상태 관리
const STATE = {
  chartsMap: {},
  audioCtx: null,
  alarmIntervalId: null,
  alarmAutoStopTimer: null,
  isSoundMutedByUser: false,
  dismissedAlertKeys: new Set(),
  lastNotifiedKeys: new Set(),
  currentAlertKeys: [],
  activeAlertKeys: new Set(),
  currentRangeMode: '24h',
  pendingDownloadParams: null
};

// 페이지 초기화 및 폴링 설정
window.onload = () => {
  initDateInputs();
  autoRequestNotificationPermission();
  fetchSensorData();
  setInterval(fetchSensorData, CONFIG.POLLING_INTERVAL_MS);

  const confirmBtn = document.getElementById('confirmDownloadBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', handleExcelDownload);
};

// 브라우저 알림 권한 요청
function autoRequestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

// 오디오 컨텍스트 초기화
function initAudioContext() {
  if (!STATE.audioCtx) {
    STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (STATE.audioCtx.state === 'suspended') {
    STATE.audioCtx.resume();
  }
}
window.addEventListener('click', initAudioContext, { once: true });
window.addEventListener('touchstart', initAudioContext, { once: true });

// 경고음 연속 재생
function startContinuousAlarm() {
  if (STATE.isSoundMutedByUser) return;

  const stopBtn = document.getElementById('stopAlarmBtn');
  if (stopBtn) stopBtn.style.display = 'inline-block';

  stopAlarmSoundOnly();
  playSingleBeepSound();
  STATE.alarmIntervalId = setInterval(playSingleBeepSound, 3000);

  if (CONFIG.ALARM_DURATION_SEC > 0) {
    STATE.alarmAutoStopTimer = setTimeout(stopAlarmSoundOnly, CONFIG.ALARM_DURATION_SEC * 1000);
  }
}

// 경고음 정지
function stopAlarmSoundOnly() {
  if (STATE.alarmIntervalId) {
    clearInterval(STATE.alarmIntervalId);
    STATE.alarmIntervalId = null;
  }
  if (STATE.alarmAutoStopTimer) {
    clearTimeout(STATE.alarmAutoStopTimer);
    STATE.alarmAutoStopTimer = null;
  }
}

// 알람 해제 및 음소거
function acknowledgeAndStopSound() {
  STATE.isSoundMutedByUser = true;
  stopAlarmSoundOnly();

  const stopBtn = document.getElementById('stopAlarmBtn');
  if (stopBtn) stopBtn.style.display = 'none';
}

// 단일 딜레이 비프음 발생
function playSingleBeepSound() {
  initAudioContext();
  if (!STATE.audioCtx) return;

  try {
    const now = STATE.audioCtx.currentTime;
    const masterGain = STATE.audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.8, now);
    masterGain.gain.linearRampToValueAtTime(0.001, now + 2.5);
    masterGain.connect(STATE.audioCtx.destination);

    const osc1 = STATE.audioCtx.createOscillator();
    osc1.frequency.setValueAtTime(1050, now);
    osc1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 1.2);

    const osc2 = STATE.audioCtx.createOscillator();
    osc2.frequency.setValueAtTime(1400, now + 1.2);
    osc2.connect(masterGain);
    osc2.start(now + 1.2);
    osc2.stop(now + 2.5);
  } catch (e) {
    console.error("Audio play error:", e);
  }
}

// 센서 실시간 데이터 수신
async function fetchSensorData() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/sensor?range=${STATE.currentRangeMode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'bypass-tunnel-reminder': 'true'
      },
      body: JSON.stringify({ range: STATE.currentRangeMode })
    });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const data = await response.json();

    if (data && data.result_code === 0) {
      renderDashboard(data);
      renderGasData(data);
    } else {
      setSyncStatus('대기 중', '#f59e0b');
    }
  } catch (e) {
    console.error("Sensor fetch error:", e);
    setSyncStatus('연결 끊김', '#ef4444');
  }
}

// 온도 수치 기반 폭염 5단계 레벨 계산 (1: 정상, 2: 관심, 3: 주의, 4: 경고, 5: 심각)
function getHeatLevel(tempVal) {
  if (tempVal === null || isNaN(tempVal)) return 1;
  if (tempVal >= 38.0) return 5;
  if (tempVal >= 35.0) return 4;
  if (tempVal >= 33.0) return 3;
  if (tempVal >= 31.0) return 2;
  return 1;
}

// 대시보드 타일 및 차트 바인딩
function renderDashboard(data) {
  setSyncStatus(data.updated_at || '--:--:--', '#38bdf8');

  const categoryRanges = {};

  if (Array.isArray(data.name_list)) {
    data.name_list.forEach((rawName, index) => {
      const mappedConfig = SENSOR_CONFIG[rawName];
      const apiConfig = (data.sensor_configs && data.sensor_configs[index]) || {};

      const cfg = {
        name: mappedConfig?.name || apiConfig.name || rawName,
        zone: mappedConfig?.zone || apiConfig.zone || '기타구역',
        type: mappedConfig?.type || apiConfig.type || 'COOLING',
        min:  mappedConfig?.min  ?? apiConfig.min  ?? 0.0,
        max:  mappedConfig?.max  ?? apiConfig.max  ?? 5.0,
        isWarning: apiConfig.isWarning || false
      };

      if (cfg.type === 'GAS') return;

      let temp = parseFloat(data.data_list_1[index]);
      let hum = data.data_list_2 ? parseFloat(data.data_list_2[index]) : 0;
      if (isNaN(temp) || temp === 0) temp = null;
      if (isNaN(hum) || hum === 0) hum = null;

      // 1. 서버 응답 데이터에서 체감온도 배열 우선 추출
      let feelsLike = null;
      if (data.feels_like_list && data.feels_like_list[index] !== undefined && data.feels_like_list[index] !== null) {
        feelsLike = parseFloat(data.feels_like_list[index]);
      } else if (data.feels_list && data.feels_list[index] !== undefined && data.feels_list[index] !== null) {
        feelsLike = parseFloat(data.feels_list[index]);
      }

      // 2. 서버 체감온도가 없거나 유효하지 않고, 온도/습도가 정상일 때 calc.js 계산 함수 호출
      if ((feelsLike === null || isNaN(feelsLike)) && temp !== null && hum !== null) {
        if (typeof calculateFeelsLikeTemp === 'function') {
          feelsLike = calculateFeelsLikeTemp(temp, hum);
        } else {
          feelsLike = temp; // fallback
        }
      }

      if (!categoryRanges[cfg.type] && cfg.min !== undefined && cfg.max !== undefined) {
        categoryRanges[cfg.type] = `${cfg.min.toFixed(1)}℃ ~ ${cfg.max.toFixed(1)}℃`;
      }

      renderSensorTile(index, cfg, temp, hum, feelsLike, cfg.isWarning);
      
      // HEAT 타입이 아닌 경우에만 그래프 업데이트 수행
      if (cfg.type !== 'HEAT') {
        updateOrCreateMiniChart(index, cfg, temp, data.updated_at, data.history || []);
      }
    });
  }

  Object.entries(categoryRanges).forEach(([type, text]) => {
    const headElem = document.getElementById(`header-range-${type}`);
    if (headElem) headElem.innerText = text;
  });

  const validAlertItems = (data.alert_items || []).filter(item => !CONFIG.EXCLUDED_ALERT_TYPES.includes(item.type));
  showAlertBanner(validAlertItems);
}

// 가스 탱크 잔량/압력 바인딩
function renderGasData(data) {
  if (!data) return;
  const co2 = data.joa_co2 || null;
  const n2 = data.joa_n2 || null;

  if (co2) updateSingleGasUI('lco2', co2);
  if (n2) updateSingleGasUI('ln2', n2);
}

// 가스 탱크 위젯 개별 업데이트 (잔량 & 압력 불들어오는 태그 구조 적용)
function updateSingleGasUI(type, info) {
  const fillElem = document.getElementById(`gas-fill-${type}`);
  const pctElem = document.getElementById(`gas-pct-${type}`);
  const weightElem = document.getElementById(`gas-weight-${type}`);
  const weightStatusElem = document.getElementById(`gas-weight-status-${type}`); // 잔량 과부족/적정량 태그 영역
  const pressValElem = document.getElementById(`gas-press-val-${type}`);        // 압력 수치 영역 (or gas-press-type)
  const pressStatusElem = document.getElementById(`gas-press-status-${type}`);   // 압력 저압/정상/고압 태그 영역
  const statusElem = document.getElementById(`gas-status-${type}`);

  // 백엔드 fallback 연산
  const percent = info.percent ?? 0;
  const weight = Number(info.weight ?? 0);
  const maxWeight = Number(info.max_weight ?? 5000);
  const pressure = parseFloat(info.pressure ?? 0);
  const status = info.status ?? 'NORMAL';

  // 1. 게이지 및 텍스트 바인딩
  if (fillElem) fillElem.style.height = `${Math.min(Math.max(percent, 0), 100)}%`;
  if (pctElem) pctElem.innerText = `${percent}%`;

  if (weightElem) {
    const formattedWeight = weight.toLocaleString();
    const formattedMax = maxWeight.toLocaleString();
    weightElem.innerText = `${formattedWeight} kg / ${formattedMax} kg`;
  }

  // 2. 잔량 상태 판정 (1,000kg 미만: 과부족 / 1,000kg 이상: 적정량)
  if (weightStatusElem) {
    const isShortage = weight < 1000;
    weightStatusElem.innerHTML = `
      <span class="gas-tag ${isShortage ? 'active-warn' : 'off'}">과부족</span>
      <span class="gas-tag ${!isShortage ? 'active-ok' : 'off'}">적정량</span>
    `;
  }

  // 3. 압력 수치 표기 (기존 pressElem ID 지원 포함)
  const targetPressValElem = pressValElem || document.getElementById(`gas-press-${type}`);
  if (targetPressValElem) {
    // 수치 텍스트만 깔끔하게 노출
    targetPressValElem.innerText = `${pressure} bar`;
  }

  // 4. 압력 3단계 상태 판정 (저압 / 정상 / 고압)
  let pressLevel = 'normal'; // 'low' | 'normal' | 'high'
  const normalRangeText = (type === 'lco2') ? '10~20bar' : '8~20bar';

  if (type === 'lco2') {
    if (pressure < 10.0) pressLevel = 'low';
    else if (pressure > 20.0) pressLevel = 'high';
    else pressLevel = 'normal';
  } else if (type === 'ln2') {
    if (pressure < 8.0) pressLevel = 'low';
    else if (pressure > 20.0) pressLevel = 'high';
    else pressLevel = 'normal';
  }

  if (pressStatusElem) {
    pressStatusElem.innerHTML = `
      <span class="gas-tag ${pressLevel === 'low' ? 'active-warn' : 'off'}">저압</span>
      <span class="gas-tag ${pressLevel === 'normal' ? 'active-ok' : 'off'}">정상 (${normalRangeText})</span>
      <span class="gas-tag ${pressLevel === 'high' ? 'active-danger' : 'off'}">고압</span>
    `;
  }

  // 5. 상단 전체 가동 상태
  if (statusElem) {
    if (status === 'NORMAL') {
      statusElem.innerText = '정상 가동';
      statusElem.className = 'gas-status-badge ok';
    } else {
      statusElem.innerText = status;
      statusElem.className = 'gas-status-badge warn';
    }
  }
}

// 센서 타일 동적 생성 및 갱신 (폭염 레벨 바 반영)
function renderSensorTile(index, cfg, temp, hum, feelsLike, isWarning) {
  const tempText = (temp === null) ? '--' : temp.toFixed(1);
  const humText = (hum === null) ? '--' : `${hum.toFixed(1)}%`;
  
  const feelsVal = (feelsLike !== null && !isNaN(feelsLike)) ? feelsLike : temp;
  const feelsText = (feelsVal !== null) ? `체감 ${Number(feelsVal).toFixed(1)}℃` : '';

  let tile = document.getElementById(`sensor-tile-${index}`);

  if (!tile) {
    tile = document.createElement('div');
    tile.id = `sensor-tile-${index}`;
    tile.className = `sensor-tile ${isWarning ? 'status-warn' : 'status-ok'}`;

    if (cfg.type === 'HEAT') {
      // 폭염 관제용 레벨 바 HTML 생성
      const heatLevel = getHeatLevel(feelsVal);
      tile.innerHTML = `
        <div class="tile-info">
          <span class="tile-zone">${cfg.zone}</span>
          <span class="tile-name">${cfg.name}</span>
        </div>
        <div class="tile-temp-group">
          <div class="tile-temp-wrapper">
            <span class="tile-temp" id="temp-val-${index}">${tempText}</span>
            <span class="tile-temp-unit">℃</span>
          </div>
          <span class="tile-feels" id="feels-val-${index}">${feelsText}</span>
        </div>
        <div class="tile-hum" id="hum-val-${index}">${humText}</div>
        <div class="heat-tile-level-bar" id="heat-level-bar-${index}">
          <div class="tile-step step-normal ${heatLevel === 1 ? 'active' : ''}">
            <span class="step-range">~30℃</span>
            <span class="step-label">정상</span>
          </div>
          <div class="tile-step step-interest ${heatLevel === 2 ? 'active' : ''}">
            <span class="step-range">31℃</span>
            <span class="step-label">관심</span>
          </div>
          <div class="tile-step step-caution ${heatLevel === 3 ? 'active' : ''}">
            <span class="step-range">33℃</span>
            <span class="step-label">주의</span>
          </div>
          <div class="tile-step step-warn ${heatLevel === 4 ? 'active' : ''}">
            <span class="step-range">35℃</span>
            <span class="step-label">경고</span>
          </div>
          <div class="tile-step step-danger ${heatLevel === 5 ? 'active' : ''}">
            <span class="step-range">38℃+</span>
            <span class="step-label">심각</span>
          </div>
        </div>
      `;
    } else {
      // 일반 창고/생산라인 미니 차트용 HTML 생성
      tile.innerHTML = `
        <div class="tile-info">
          <span class="tile-zone">${cfg.zone}</span>
          <span class="tile-name">${cfg.name}</span>
        </div>
        <div class="tile-temp-group">
          <div class="tile-temp-wrapper">
            <span class="tile-temp" id="temp-val-${index}">${tempText}</span>
            <span class="tile-temp-unit">℃</span>
          </div>
        </div>
        <div class="tile-hum" id="hum-val-${index}">${humText}</div>
        <div class="minichart-wrapper">
          <canvas id="chart-canvas-${index}"></canvas>
        </div>
      `;
    }

    const targetContainer = document.getElementById(`container-${cfg.type}`) || document.getElementById('container-COOLING');
    if (targetContainer) targetContainer.appendChild(tile);
  } else {
    // 기존 타일 DOM 값 실시간 업데이트
    tile.className = `sensor-tile ${isWarning ? 'status-warn' : 'status-ok'}`;
    const tempElem = document.getElementById(`temp-val-${index}`);
    const humElem = document.getElementById(`hum-val-${index}`);
    const feelsElem = document.getElementById(`feels-val-${index}`);

    if (tempElem) tempElem.innerText = tempText;
    if (humElem) humElem.innerText = humText;
    if (feelsElem && cfg.type === 'HEAT') feelsElem.innerText = feelsText;

    // 폭염 타입인 경우 레벨 바 활성화 상태 업데이트
    if (cfg.type === 'HEAT') {
      const levelBarContainer = document.getElementById(`heat-level-bar-${index}`);
      if (levelBarContainer) {
        const heatLevel = getHeatLevel(feelsVal);
        const steps = levelBarContainer.querySelectorAll('.tile-step');
        steps.forEach((step, idx) => {
          if (idx + 1 === heatLevel) {
            step.classList.add('active');
          } else {
            step.classList.remove('active');
          }
        });
      }
    }
  }
}

// Chart.js 미니 그래프 생성 및 업데이트 (HEAT 타입은 수행 안 함)
function updateOrCreateMiniChart(index, cfg, currentTemp, time, history) {
  if (cfg.type === 'HEAT') return;

  const canvasElem = document.getElementById(`chart-canvas-${index}`);
  if (!canvasElem) return;

  const { labels, tempData } = prepareChartData(index, time, history);

  if (STATE.chartsMap[index]) {
    STATE.chartsMap[index].data.labels = labels;
    STATE.chartsMap[index].data.datasets[0].data = tempData;
    STATE.chartsMap[index].update('none');
    return;
  }

  let colorPrimary = '#38bdf8';
  if (cfg.type === 'FREEZING') colorPrimary = '#c084fc';
  if (cfg.type === 'PROD1') colorPrimary = '#fb923c';
  if (cfg.type === 'PROD2') colorPrimary = '#f59e0b';

  const ctx = canvasElem.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 40);
  gradient.addColorStop(0, colorPrimary + '50');
  gradient.addColorStop(1, colorPrimary + '00');

  STATE.chartsMap[index] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: tempData,
        borderColor: colorPrimary,
        backgroundColor: gradient,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: colorPrimary,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 1.5,
        fill: true,
        tension: 0.2,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, bottom: 2, left: 0, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#94a3b8',
          bodyColor: colorPrimary,
          bodyFont: { weight: 'bold', size: 10 },
          titleFont: { size: 9 },
          borderColor: '#334155',
          borderWidth: 1,
          padding: 6,
          displayColors: false,
          callbacks: {
            title: ctx => ctx[0].label || '',
            label: ctx => `온도: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) : '--'} ℃`
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 8 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 4,
            padding: 2,
            callback: function(val) {
              const label = this.getLabelForValue(val);
              if (!label) return '';
              if (STATE.currentRangeMode === '24h') {
                const hour = parseInt(label.split(':')[0], 10);
                return `${hour}시`;
              }
              return label;
            }
          }
        },
        y: {
          display: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { size: 7.5 },
            maxTicksLimit: 3,
            padding: 2,
            callback: val => typeof val === 'number' ? `${val.toFixed(1)}℃` : val
          }
        }
      }
    }
  });
}

// 그래프 시계열 데이터 파싱
function prepareChartData(index, time, history) {
  let labels = [];
  let tempData = [];

  const nowTimeStr = formatTimeLabel(time || '11:00');
  const nowParts = nowTimeStr.split(':');
  const nowHour = parseInt(nowParts[0], 10) || 0;
  const nowMin = parseInt(nowParts[1], 10) || 0;

  if (STATE.currentRangeMode === '24h') {
    const hourlyValidTemps = new Map();
    if (history && history.length > 0) {
      history.forEach(h => {
        const timeKey = formatTimeLabel(h.time);
        if (h.temps && h.temps[index] !== undefined && h.temps[index] !== null) {
          const val = parseFloat(h.temps[index]);
          if (!isNaN(val) && val !== 0) {
            const hourKey = timeKey.split(':')[0];
            if (!hourlyValidTemps.has(hourKey)) hourlyValidTemps.set(hourKey, []);
            hourlyValidTemps.get(hourKey).push(val);
          }
        }
      });
    }

    for (let i = 24; i >= 0; i--) {
      let targetHour = (nowHour - i + 24) % 24;
      const targetHourStr = String(targetHour).padStart(2, '0');
      labels.push(`${targetHourStr}:00`);

      let selectedVal = null;
      if (hourlyValidTemps.has(targetHourStr) && hourlyValidTemps.get(targetHourStr).length > 0) {
        selectedVal = Math.max(...hourlyValidTemps.get(targetHourStr));
      }
      tempData.push(selectedVal);
    }
  } else {
    if (history && history.length > 0) {
      history.forEach(h => {
        labels.push(formatTimeLabel(h.time));
        let val = null;
        if (h.temps && h.temps[index] !== undefined && h.temps[index] !== null) {
          const parsed = parseFloat(h.temps[index]);
          if (!isNaN(parsed) && parsed !== 0) val = parsed;
        }
        tempData.push(val);
      });
    } else {
      for (let i = 11; i >= 0; i--) {
        const totalMins = (nowHour * 60 + nowMin) - (i * 5);
        let h = Math.floor(totalMins / 60) % 24;
        if (h < 0) h += 24;
        let m = totalMins % 60;
        if (m < 0) m += 60;

        labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        tempData.push(i === 0 ? currentTemp : null);
      }
    }
  }

  return { labels, tempData };
}

// 상단 경고 팝업 및 노티
function showAlertBanner(items) {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;

  STATE.dismissedAlertKeys.forEach(key => {
    if (!items.some(i => (i.rawName || i.displayName) === key)) {
      STATE.dismissedAlertKeys.delete(key);
    }
  });

  const activeItems = items.filter(i => !STATE.dismissedAlertKeys.has(i.rawName || i.displayName));
  STATE.currentAlertKeys = activeItems.map(i => i.rawName || i.displayName);

  const currentAlarmKeysSet = new Set(items.map(i => i.rawName || i.displayName));
  const hasNewAlarm = [...currentAlarmKeysSet].some(key => !STATE.activeAlertKeys.has(key));
  STATE.activeAlertKeys = currentAlarmKeysSet;

  if (activeItems.length > 0) {
    const msg = activeItems.map(i => {
      const displayVal = i.type === 'HEAT' 
        ? `체감 ${i.feelsLike ?? i.temp}℃` 
        : `${i.temp}℃`;
      return `${i.zone}(${i.displayName}) - ${displayVal}`;
    }).join(', ');

    const alertMsgElem = document.getElementById('alert-message');
    if (alertMsgElem) alertMsgElem.innerText = `경고 항목: ${msg}`;

    banner.classList.add('active');

    if (hasNewAlarm) {
      STATE.isSoundMutedByUser = false;
      // startContinuousAlarm(); // 경고 알림음 활성화 필요 시 주석 해제
    }

    if ("Notification" in window && Notification.permission === "granted") {
      activeItems.forEach(i => {
        const key = i.rawName || i.displayName;
        if (!STATE.lastNotifiedKeys.has(key)) {
          new Notification(`[경고] ${i.zone} 센서 이상`, { body: `${i.displayName} 수치 확인 요망` });
          STATE.lastNotifiedKeys.add(key);
        }
      });
    }
  } else {
    banner.classList.remove('active');
    STATE.lastNotifiedKeys.clear();
    STATE.isSoundMutedByUser = false;
    stopAlarmSoundOnly();

    const stopBtn = document.getElementById('stopAlarmBtn');
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

// 경고 창 수동 닫기
function closeAlert() {
  STATE.currentAlertKeys.forEach(key => STATE.dismissedAlertKeys.add(key));
  const banner = document.getElementById('alert-banner');
  if (banner) banner.classList.remove('active');
  acknowledgeAndStopSound();
}

// 조회 기간 모드 변경 (24h / 1h)
function changeChartRange(mode) {
  if (STATE.currentRangeMode === mode) return;
  STATE.currentRangeMode = mode;

  const btn24h = document.getElementById('btn-range-24h');
  const btn1h = document.getElementById('btn-range-1h');
  if (btn24h) btn24h.classList.toggle('active', mode === '24h');
  if (btn1h) btn1h.classList.toggle('active', mode === '1h');

  const titleText = mode === '24h' ? '24시간 그래프' : '1시간 그래프';
  ['HEAT', 'PROD1', 'PROD2', 'COOLING', 'FREEZING'].forEach(type => {
    const elem = document.getElementById(`chart-header-title-${type}`);
    if (elem) {
      if (type === 'HEAT') {
        elem.innerText = '폭염/온열 단계';
      } else {
        elem.innerText = titleText;
      }
    }
  });

  fetchSensorData();
}

// 시간 문자열 서식 정리
function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const timePart = timeStr.trim().includes(' ') ? timeStr.trim().split(' ')[1] : timeStr.trim();
  const parts = timePart.split(':');
  return parts.length < 2 ? timeStr : `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

// 날짜 검색 조건 기본값 세팅
function initDateInputs() {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const toDateElem = document.getElementById('csv-to-date');
  const fromDateElem = document.getElementById('csv-from-date');
  if (toDateElem) toDateElem.value = today.toISOString().split('T')[0];
  if (fromDateElem) fromDateElem.value = oneMonthAgo.toISOString().split('T')[0];
}

// 동기화 상태 표시 변경
function setSyncStatus(text, color) {
  const syncElem = document.getElementById('update-time');
  if (syncElem) {
    syncElem.innerText = formatTimeLabel(text);
    syncElem.style.color = color;
  }
}

// 엑셀 다운로드 모달 실행
function downloadExcelModule() {
  const typeElem = document.getElementById('csv-type');
  const fromDateElem = document.getElementById('csv-from-date');
  const toDateElem = document.getElementById('csv-to-date');

  if (!typeElem || !fromDateElem || !toDateElem) return;

  const type = typeElem.value;
  const startDate = fromDateElem.value;
  const endDate = toDateElem.value;

  if (!startDate || !endDate) {
    alert('조회 기간을 설정해 주세요.');
    return;
  }

  const typeNames = { '1': '일일 집계', '2': '시간대별 집계', '3': '5분 단위 집계' };
  const periodTextElem = document.getElementById('modalPeriodText');
  const typeTextElem = document.getElementById('modalTypeText');
  const modalElem = document.getElementById('customConfirmModal');

  if (periodTextElem) periodTextElem.innerText = `${startDate} ~ ${endDate}`;
  if (typeTextElem) typeTextElem.innerText = typeNames[type] || '일일 집계';

  STATE.pendingDownloadParams = { type, startDate, endDate };
  if (modalElem) modalElem.style.display = 'flex';
}

// 엑셀 모달 닫기
function closeConfirmModal() {
  const modalElem = document.getElementById('customConfirmModal');
  if (modalElem) modalElem.style.display = 'none';
  STATE.pendingDownloadParams = null;
}

// 엑셀 다운로드 파일 수신 처리
async function handleExcelDownload() {
  if (!STATE.pendingDownloadParams) return;

  const queryParams = new URLSearchParams(STATE.pendingDownloadParams);
  const downloadUrl = `${CONFIG.API_BASE_URL}/api/excel-download?${queryParams.toString()}`;

  try {
    const response = await fetch(downloadUrl, {
      headers: {
        'bypass-tunnel-reminder': 'true'
      }
    });
    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `온도통합리포트_${STATE.pendingDownloadParams.startDate}_${STATE.pendingDownloadParams.endDate}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert('엑셀 파일 다운로드 중 오류가 발생했습니다.');
  } finally {
    closeConfirmModal();
  }
}