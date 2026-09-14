// 센서 마스터 정보
const SENSOR_CONFIG = {
  '스마트온도계': { name: '공무팀', zone: '야외 현장', type: 'OUTDOOR', min: 0.0, max: 50.0, sensorId: '6281-7088' },
  '13room':       { name: '외부창고', zone: '야외 현장', type: 'OUTDOOR', min: 0.0, max: 50.0, sensorId: '8629-9794' },
  '2team1':       { name: '쿠커실', zone: '현장 온열', type: 'OUTDOOR', min: 0.0, max: 36.0, sensorId: '7244-3574' },
  '2team':        { name: '유화솥', zone: '현장 온열', type: 'OUTDOOR', min: 0.0, max: 36.0, sensorId: '4289-4748' },
  '2팀천장':      { name: '2팀천장', zone: '현장 온열', type: 'OUTDOOR', min: 0.0, max: 36.0, sensorId: '5704-7896' },
  '스마트센서':   { name: '12번창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '8433-5905', channel: 1 },
  '2채널':   { name: '13번창고', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '8433-5905', channel: 2 },
  'B동 냉동':   { name: 'B동냉동창고', zone: '외부창고', type: 'FREEZING', min: -25.0, max: -12.0, sensorId: '8405-9325'},
  'B동 냉장1,2':   { name: 'B동냉장창고1', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 1},
  'B동 냉장1,2':   { name: 'B동냉장창고2', zone: '외부창고', type: 'COOLING', min: 0.0, max: 5.0, sensorId: '2830-9035', channel: 2},
};

// 전역 설정
const CONFIG = {
  API_BASE_URL: 'https://combining-black-mainly-north.trycloudflare.com',
  ALARM_DURATION_SEC: 5,
  POLLING_INTERVAL_MS: 5000,
  EXCLUDED_ALERT_TYPES: ['GAS']
};

// 전역 상태
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

// 페이지 초기화 및 이벤트 연결
window.onload = () => {
  initDateInputs();
  autoRequestNotificationPermission();
  fetchSensorData();
  setInterval(fetchSensorData, CONFIG.POLLING_INTERVAL_MS);
  
  const confirmBtn = document.getElementById('confirmDownloadBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', handleExcelDownload);
};

// 웹 알림 권한 요청
function autoRequestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.permission;
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

// 알람음 연속 재생 실행
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

// 알람음 정지 처리
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

// 사용자 알람 확인 및 음소거
function acknowledgeAndStopSound() {
  STATE.isSoundMutedByUser = true;
  stopAlarmSoundOnly();

  const stopBtn = document.getElementById('stopAlarmBtn');
  if (stopBtn) stopBtn.style.display = 'none';
}

// 경고음 단일 재생
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

// 센서 데이터 API 요청
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

// 대시보드 메인 렌더링
function renderDashboard(data) {
  setSyncStatus(data.updated_at || '--:--:--', '#38bdf8');

  const catCounts = { 
    COOLING: { ok: 0, total: 0 }, 
    FREEZING: { ok: 0, total: 0 }, 
    OUTDOOR: { ok: 0, total: 0 }
  };
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

      const feelsLike = data.feels_like_list ? parseFloat(data.feels_like_list[index]) : temp;

      if (catCounts[cfg.type]) {
        catCounts[cfg.type].total++;
        if (!cfg.isWarning) catCounts[cfg.type].ok++;
      }

      if (!categoryRanges[cfg.type] && cfg.min !== undefined && cfg.max !== undefined) {
        categoryRanges[cfg.type] = `기준: ${cfg.min.toFixed(1)}℃ ~ ${cfg.max.toFixed(1)}℃`;
      }

      renderSensorTile(index, cfg, temp, hum, feelsLike, cfg.isWarning);
      updateOrCreateMiniChart(index, cfg, temp, data.updated_at, data.history || []);
    });
  }

  Object.entries(categoryRanges).forEach(([type, text]) => {
    const subElem = document.getElementById(`range-subtext-${type}`);
    const headElem = document.getElementById(`header-range-${type}`);
    if (subElem) subElem.innerText = text;
    if (headElem) headElem.innerText = text.replace('기준: ', '');
  });

  const activeTotal = Object.values(catCounts).reduce((acc, cur) => acc + cur.total, 0);
  document.getElementById('stat-total').innerText = activeTotal;
  document.getElementById('stat-ref-status').innerText = `${catCounts.COOLING.ok} / ${catCounts.COOLING.total}`;
  document.getElementById('stat-freezer-status').innerText = `${catCounts.FREEZING.ok} / ${catCounts.FREEZING.total}`;
  document.getElementById('stat-outdoor-status').innerText = `${catCounts.OUTDOOR.ok} / ${catCounts.OUTDOOR.total}`;

  const validAlertItems = (data.alert_items || []).filter(item => !CONFIG.EXCLUDED_ALERT_TYPES.includes(item.type));
  showAlertBanner(validAlertItems);
}

// 가스 데이터 바인딩
function renderGasData(data) {
  const co2 = data.joa_co2 || null;
  const n2 = data.joa_n2 || null;

  if (co2) updateSingleGasUI('lco2', co2);
  if (n2) updateSingleGasUI('ln2', n2);
}

// 개별 가스 위젯 UI 업데이트
function updateSingleGasUI(type, info) {
  const fillElem = document.getElementById(`gas-fill-${type}`);
  const pctElem = document.getElementById(`gas-pct-${type}`);
  const weightElem = document.getElementById(`gas-weight-${type}`);
  const pressElem = document.getElementById(`gas-press-${type}`);
  const statusElem = document.getElementById(`gas-status-${type}`);

  const percent = info.percent ?? 0;
  const weight = info.weight ?? 0;
  const maxWeight = info.max_weight ?? 5000;
  const pressure = info.pressure ?? 0;
  const status = info.status ?? 'NORMAL';

  if (fillElem) fillElem.style.height = `${Math.min(Math.max(percent, 0), 100)}%`;
  if (pctElem) pctElem.innerText = `${percent}%`;

  if (weightElem) {
    const formattedWeight = Number(weight).toLocaleString();
    const formattedMax = Number(maxWeight).toLocaleString();
    weightElem.innerText = `${formattedWeight} kg / ${formattedMax} kg`;
  }

  if (pressElem) pressElem.innerText = `${pressure} bar`;

  if (statusElem) {
    if (status === 'NORMAL') {
      statusElem.innerText = '정상';
      statusElem.className = 'gas-status-badge ok';
    } else {
      statusElem.innerText = status;
      statusElem.className = 'gas-status-badge warn';
    }
  }
}

// 센서 타일 UI 생성 및 갱신
function renderSensorTile(index, cfg, temp, hum, feelsLike, isWarning) {
  const tempText = (temp === null) ? '--' : temp.toFixed(1);
  const humText = (hum === null) ? '--' : `${hum.toFixed(1)}%`;
  const feelsText = (feelsLike === null) ? '' : `체감 ${feelsLike.toFixed(1)}℃`;

  let tile = document.getElementById(`sensor-tile-${index}`);

  if (!tile) {
    tile = document.createElement('div');
    tile.id = `sensor-tile-${index}`;
    tile.className = `sensor-tile ${isWarning ? 'status-warn' : 'status-ok'}`;
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
        ${cfg.type === 'OUTDOOR' ? `<span class="tile-feels" id="feels-val-${index}">${feelsText}</span>` : ''}
      </div>
      <div class="tile-hum" id="hum-val-${index}">${humText}</div>
      <div class="minichart-wrapper">
        <canvas id="chart-canvas-${index}"></canvas>
      </div>
    `;

    const targetContainer = document.getElementById(`container-${cfg.type}`) || document.getElementById('container-COOLING');
    if (targetContainer) targetContainer.appendChild(tile);
  } else {
    tile.className = `sensor-tile ${isWarning ? 'status-warn' : 'status-ok'}`;
    const tempElem = document.getElementById(`temp-val-${index}`);
    const humElem = document.getElementById(`hum-val-${index}`);
    const feelsElem = document.getElementById(`feels-val-${index}`);

    if (tempElem) tempElem.innerText = tempText;
    if (humElem) humElem.innerText = humText;
    if (feelsElem) feelsElem.innerText = feelsText;
  }
}

// 미니 차트 생성 및 업데이트
function updateOrCreateMiniChart(index, cfg, currentTemp, time, history) {
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
  if (cfg.type === 'OUTDOOR') colorPrimary = '#fb923c';

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
        borderWidth: 1.8, 
        pointRadius: 0, 
        pointHoverRadius: 5, 
        pointHoverBackgroundColor: colorPrimary,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        fill: true, 
        tension: 0.25, 
        spanGaps: true 
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, bottom: 2, left: 2, right: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true, 
          backgroundColor: 'rgba(15, 23, 42, 0.95)', 
          titleColor: '#94a3b8', 
          bodyColor: colorPrimary,
          bodyFont: { weight: 'bold', size: 11 },
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
            color: '#64748b', font: { size: 8 }, maxRotation: 0, autoSkip: false,
            callback: function(val, idx, ticks) {
              const label = this.getLabelForValue(val);
              if (!label) return '';
              if (STATE.currentRangeMode === '24h') {
                const hour = parseInt(label.split(':')[0], 10);
                return hour % 4 === 0 ? `${hour}시` : '';
              } else {
                return (idx === 0 || idx === ticks.length - 1 || idx % 3 === 0) ? label : '';
              }
            }
          }
        },
        y: {
          display: true, 
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { 
            color: '#94a3b8', 
            font: { size: 7.5 }, 
            maxTicksLimit: 3, 
            callback: val => typeof val === 'number' ? `${val.toFixed(1)}℃` : val 
          }
        }
      }
    }
  });
}

// 차트 데이터 가공
function prepareChartData(index, time, history) {
  let labels = [];
  let tempData = [];
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

  const nowTimeStr = formatTimeLabel(time || '11:00');
  const nowHour = parseInt(nowTimeStr.split(':')[0], 10) || 11;
  const nowMin = parseInt(nowTimeStr.split(':')[1], 10) || 0;

  if (STATE.currentRangeMode === '24h') {
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
    const historyMap = new Map();
    if (history && history.length > 0) {
      history.forEach(h => {
        const timeKey = formatTimeLabel(h.time);
        if (h.temps && h.temps[index] !== undefined && h.temps[index] !== null) {
          const val = parseFloat(h.temps[index]);
          if (!isNaN(val) && val !== 0) historyMap.set(timeKey, val);
        }
      });
    }

    for (let i = 11; i >= 0; i--) {
      const totalMins = (nowHour * 60 + nowMin) - (i * 5);
      let h = Math.floor(totalMins / 60) % 24;
      if (h < 0) h += 24;
      let m = totalMins % 60;
      if (m < 0) m += 60;

      const timeKey = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      labels.push(timeKey);
      tempData.push(historyMap.has(timeKey) ? historyMap.get(timeKey) : null);
    }
  }

  return { labels, tempData };
}

// 경고 배너 제어 및 웹 알림 처리
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
    const msg = activeItems.map(i => 
      `${i.zone}(${i.displayName}) - ${i.type === 'OUTDOOR' ? '체감 ' + i.feelsLike + '℃' : i.temp + '℃'}`
    ).join(', ');
    
    const alertMsgElem = document.getElementById('alert-message');
    if (alertMsgElem) alertMsgElem.innerText = `경고 항목: ${msg}`;
    
    banner.classList.add('active');

    if (hasNewAlarm) {
      STATE.isSoundMutedByUser = false; 
      startContinuousAlarm();
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
    acknowledgeAndStopSound();
  }
}

// 경고 닫기
function closeAlert() {
  STATE.currentAlertKeys.forEach(key => STATE.dismissedAlertKeys.add(key));
  const banner = document.getElementById('alert-banner');
  if (banner) banner.classList.remove('active');
  acknowledgeAndStopSound();
}

// 차트 조회 범위 변경
function changeChartRange(mode) {
  if (STATE.currentRangeMode === mode) return;
  STATE.currentRangeMode = mode;

  const btn24h = document.getElementById('btn-range-24h');
  const btn1h = document.getElementById('btn-range-1h');
  if (btn24h) btn24h.classList.toggle('active', mode === '24h');
  if (btn1h) btn1h.classList.toggle('active', mode === '1h');

  const titleText = mode === '24h' ? '24시간 그래프' : '1시간 그래프';
  ['COOLING', 'FREEZING', 'OUTDOOR'].forEach(type => {
    const elem = document.getElementById(`chart-header-title-${type}`);
    if (elem) elem.innerText = titleText;
  });

  fetchSensorData();
}

// 시간 포맷 변환
function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const timePart = timeStr.trim().includes(' ') ? timeStr.trim().split(' ')[1] : timeStr.trim();
  const parts = timePart.split(':');
  return parts.length < 2 ? timeStr : `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

// 날짜 Input 초기화
function initDateInputs() {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const toDateElem = document.getElementById('csv-to-date');
  const fromDateElem = document.getElementById('csv-from-date');
  if (toDateElem) toDateElem.value = today.toISOString().split('T')[0];
  if (fromDateElem) fromDateElem.value = oneMonthAgo.toISOString().split('T')[0];
}

// 동기화 상태 텍스트 변경
function setSyncStatus(text, color) {
  const syncElem = document.getElementById('update-time');
  if (syncElem) {
    syncElem.innerText = formatTimeLabel(text);
    syncElem.style.color = color;
  }
}

// 엑셀 다운로드 모달 열기
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

// 다운로드 확인 모달 닫기
function closeConfirmModal() {
  const modalElem = document.getElementById('customConfirmModal');
  if (modalElem) modalElem.style.display = 'none';
  STATE.pendingDownloadParams = null;
}

// 엑셀 다운로드 처리
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