// 시스템 설정
const CONFIG = {
  API_BASE_URL: 'https://rest-imagination-everyday-rep.trycloudflare.com',
  ALARM_DURATION_SEC: 5,
  POLLING_INTERVAL_MS: 5000,
  EXCLUDED_ALERT_TYPES: ['GAS', 'COOLING', 'FREEZING']
};

// 앱 상태 관리
const STATE = {
  sensorConfig: {}, // 백엔드에서 동적으로 불러올 센서 설정
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

// 서버에서 센서 설정값 가져오기
async function fetchSensorConfig() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/sensor-config`, {
      method: 'GET',
      headers: { 'bypass-tunnel-reminder': 'true' }
    });
    if (!response.ok) throw new Error(`Config fetch error: ${response.status}`);
    const data = await response.json();
    if (data && data.result_code === 0 && data.sensor_config) {
      STATE.sensorConfig = data.sensor_config;
    }
  } catch (e) {
    console.error("Sensor config load error:", e);
  }
}

// 페이지 초기화 (비동기 설정 로드 후 실행)
window.onload = async () => {
  initDateInputs();
  autoRequestNotificationPermission();
  
  // 백엔드에서 설정값 먼저 가져오기
  await fetchSensorConfig();

  fetchSensorData();
  setInterval(fetchSensorData, CONFIG.POLLING_INTERVAL_MS);

  const confirmBtn = document.getElementById('confirmDownloadBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', handleExcelDownload);
};

function autoRequestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

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

function acknowledgeAndStopSound() {
  STATE.isSoundMutedByUser = true;
  stopAlarmSoundOnly();

  const stopBtn = document.getElementById('stopAlarmBtn');
  if (stopBtn) stopBtn.style.display = 'none';
}

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
      correction(data);
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

// 센서 온도 보정(offset) 처리 (체감온도 계산은 서버 calc.js의 표준 공식을 신뢰하고 받아옴)
function correction(data) {
  if (!Array.isArray(data.name_list)) return;
  if (!data.sensor_configs) data.sensor_configs = {};

  data.name_list.forEach((rawName, index) => {
    const config = STATE.sensorConfig[rawName];
    if (!data.sensor_configs[index]) data.sensor_configs[index] = {};

    if (config) {
      const offsetValue = typeof config.offset === 'number' ? config.offset : 0;

      // 1. 기온(data_list_1) 오프셋 보정 적용
      if (data.data_list_1 && data.data_list_1[index] !== undefined && data.data_list_1[index] !== null) {
        let val = parseFloat(data.data_list_1[index]);
        if (!isNaN(val) && val !== 0) {
          let calibratedVal = val + offsetValue;
          data.data_list_1[index] = calibratedVal.toFixed(1);
        }
      }

      // 2. 히스토리 기온 오프셋 보정
      if (Array.isArray(data.history) && offsetValue !== 0) {
        data.history.forEach(h => {
          if (h.temps && h.temps[index] !== undefined && h.temps[index] !== null) {
            let hVal = parseFloat(h.temps[index]);
            if (!isNaN(hVal) && hVal !== 0) {
              h.temps[index] = (hVal + offsetValue).toFixed(1);
            }
          }
        });
      }
    }
  });
}

function getHeatLevel(tempVal) {
  if (tempVal === null || isNaN(tempVal)) return 1;
  if (tempVal >= 38.0) return 5;
  if (tempVal >= 35.0) return 4;
  if (tempVal >= 33.0) return 3;
  if (tempVal >= 31.0) return 2;
  return 1;
}

function renderDashboard(data) {
  setSyncStatus(data.updated_at || '--:--:--', '#38bdf8');

  const categoryRanges = {};

  if (Array.isArray(data.name_list)) {
    data.name_list.forEach((rawName, index) => {
      const mappedConfig = STATE.sensorConfig[rawName];
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

      // 서버에서 계산되어 넘어온 feels_like_list 사용 (없으면 기온 대체)
      let feelsLike = null;
      if (data.feels_like_list && data.feels_like_list[index] !== undefined && data.feels_like_list[index] !== null) {
        feelsLike = parseFloat(data.feels_like_list[index]);
      } else {
        feelsLike = temp;
      }

      if (!categoryRanges[cfg.type] && cfg.min !== undefined && cfg.max !== undefined) {
        categoryRanges[cfg.type] = `${cfg.min.toFixed(1)}℃ ~ ${cfg.max.toFixed(1)}℃`;
      }

      renderSensorTile(index, cfg, temp, hum, feelsLike, cfg.isWarning);
      
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

function renderGasData(data) {
  if (!data) return;
  const co2 = data.joa_co2 || null;
  const n2 = data.joa_n2 || null;

  if (co2) updateSingleGasUI('lco2', co2);
  if (n2) updateSingleGasUI('ln2', n2);
}

function updateSingleGasUI(type, info) {
  const fillElem = document.getElementById(`gas-fill-${type}`);
  const pctElem = document.getElementById(`gas-pct-${type}`);
  const weightElem = document.getElementById(`gas-weight-${type}`);
  const weightStatusElem = document.getElementById(`gas-weight-status-${type}`);
  const pressValElem = document.getElementById(`gas-press-val-${type}`);
  const pressStatusElem = document.getElementById(`gas-press-status-${type}`);
  const statusElem = document.getElementById(`gas-status-${type}`);

  const percent = info.percent ?? 0;
  const weight = Number(info.weight ?? 0);
  const maxWeight = Number(info.max_weight ?? 5000);
  const pressure = parseFloat(info.pressure ?? 0);
  const status = info.status ?? 'NORMAL';

  if (fillElem) fillElem.style.height = `${Math.min(Math.max(percent, 0), 100)}%`;
  if (pctElem) pctElem.innerText = `${percent}%`;

  if (weightElem) {
    const formattedWeight = weight.toLocaleString();
    const formattedMax = maxWeight.toLocaleString();
    weightElem.innerText = `${formattedWeight} kg / ${formattedMax} kg`;
  }

  if (weightStatusElem) {
    const isShortage = weight < 500;
    weightStatusElem.innerHTML = `
      <span class="gas-tag ${isShortage ? 'active-warn' : 'off'}">과부족</span>
      <span class="gas-tag ${!isShortage ? 'active-ok' : 'off'}">적정량</span>
    `;
  }

  const targetPressValElem = pressValElem || document.getElementById(`gas-press-${type}`);
  if (targetPressValElem) {
    targetPressValElem.innerText = `${pressure} bar`;
  }

  let pressLevel = 'normal';
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
    tile.className = `sensor-tile ${isWarning ? 'status-warn' : 'status-ok'}`;
    const tempElem = document.getElementById(`temp-val-${index}`);
    const humElem = document.getElementById(`hum-val-${index}`);
    const feelsElem = document.getElementById(`feels-val-${index}`);

    if (tempElem) tempElem.innerText = tempText;
    if (humElem) humElem.innerText = humText;
    if (feelsElem && cfg.type === 'HEAT') feelsElem.innerText = feelsText;

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
  if (cfg.type === 'PROD2') colorPrimary = '#ffdda1';

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

function closeAlert() {
  STATE.currentAlertKeys.keys().forEach(key => STATE.dismissedAlertKeys.add(key)); // 안전한 순회 보완
  const banner = document.getElementById('alert-banner');
  if (banner) banner.classList.remove('active');
  acknowledgeAndStopSound();
}

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

function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const timePart = timeStr.trim().includes(' ') ? timeStr.trim().split(' ')[1] : timeStr.trim();
  const parts = timePart.split(':');
  return parts.length < 2 ? timeStr : `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

function initDateInputs() {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const toDateElem = document.getElementById('csv-to-date');
  const fromDateElem = document.getElementById('csv-from-date');
  if (toDateElem) toDateElem.value = today.toISOString().split('T')[0];
  if (fromDateElem) fromDateElem.value = oneMonthAgo.toISOString().split('T')[0];
}

function setSyncStatus(text, color) {
  const syncElem = document.getElementById('update-time');
  if (syncElem) {
    syncElem.innerText = formatTimeLabel(text);
    syncElem.style.color = color;
  }
}

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

function closeConfirmModal() {
  const modalElem = document.getElementById('customConfirmModal');
  if (modalElem) modalElem.style.display = 'none';
  STATE.pendingDownloadParams = null;
}

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

    const blob = `blob`;
    // 기존 blob 다운로드 로직 유지
    const url = window.URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `조흥GF스마트관제${STATE.pendingDownloadParams.startDate}_${STATE.pendingDownloadParams.endDate}.xlsx`;
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