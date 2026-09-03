const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const ExcelJS = require('exceljs');
// 기존 경로들을 같은 폴더(./)로 변경
const { SENSOR_CONFIG } = require('./sensorConfig');
const { getFilteredHistory } = require('./calc');
const { sendEmailNotification } = require('./mailService');

module.exports = function (getSensorContext) {
  // 1. 센서 실시간 및 과거 데이터 제공
  router.get('/sensor', (req, res) => {
    const { cachedSensorData, sensorHistory } = getSensorContext();
    const range = req.query.range || req.query.timeRange || '24h';
    const filteredHistory = getFilteredHistory(sensorHistory, range);
    
    res.json({ 
      ...cachedSensorData, 
      history: filteredHistory, 
      raw_configs: SENSOR_CONFIG 
    });
  });

  router.post('/sensor', (req, res) => {
    const { cachedSensorData, sensorHistory } = getSensorContext();
    const range = req.body.range || req.query.range || '24h';
    const filteredHistory = getFilteredHistory(sensorHistory, range);

    res.json({ 
      ...cachedSensorData, 
      history: filteredHistory, 
      raw_configs: SENSOR_CONFIG 
    });
  });

  // 2. 수동 메일 발송 테스트
  router.post('/send-email', async (req, res) => {
    try {
      const { alertItems, isTest } = req.body;
      await sendEmailNotification({ items: alertItems || [], emailType: 'ALERT', isTest: isTest || false });
      return res.json({ success: true, message: '테스트 메일 전송 완료' });
    } catch (err) {
      return res.status(500).json({ success: false, reason: err.message });
    }
  });

  // 3. 엑셀 다운로드 API
  router.get('/excel-download', async (req, res) => {
    let conn;
    try {
      const { type = '1', startDate, endDate } = req.query; 
      conn = await oracledb.getConnection();
      
      let timeGroupFormat = 'YYYY-MM-DD'; 
      if (type === '2') timeGroupFormat = 'YYYY-MM-DD HH24'; 
      else if (type === '3') timeGroupFormat = 'YYYY-MM-DD HH24:MI'; 

      let query = `
        SELECT SENSOR_NAME, SENSOR_TYPE, 
               ROUND(AVG(TEMPERATURE), 2) AS AVG_TEMP, 
               ROUND(AVG(HUMIDITY), 2) AS AVG_HUM, 
               ROUND(AVG(FEELS_LIKE), 2) AS AVG_FEELS,
      `;

      if (type === '3') {
        query += ` TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24') || ':' || LPAD(FLOOR(TO_NUMBER(TO_CHAR(COLLECTED_AT, 'MI')) / 5) * 5, 2, '0') AS TIME_GROUP `;
      } else {
        query += ` TO_CHAR(COLLECTED_AT, '${timeGroupFormat}') AS TIME_GROUP `;
      }

      query += ` FROM SENSOR_LOG_HISTORY `;

      const binds = {};
      if (startDate && endDate) {
        query += ` WHERE COLLECTED_AT BETWEEN TO_DATE(:startDate, 'YYYY-MM-DD') AND TO_DATE(:endDate, 'YYYY-MM-DD') + 1 `;
        binds.startDate = startDate;
        binds.endDate = endDate;
      }

      if (type === '3') {
        query += ` GROUP BY SENSOR_NAME, SENSOR_TYPE, TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24'), FLOOR(TO_NUMBER(TO_CHAR(COLLECTED_AT, 'MI')) / 5) `;
      } else {
        query += ` GROUP BY SENSOR_NAME, SENSOR_TYPE, TO_CHAR(COLLECTED_AT, '${timeGroupFormat}') `;
      }
      
      query += ` ORDER BY TIME_GROUP DESC `;

      const result = await conn.execute(query, binds);
      const workbook = new ExcelJS.Workbook();
      workbook.creator = '스마트관제시스템';

      const categorySpecs = [
        { key: 'OUTDOOR', title: '야외 온열', bgColor: 'FEF3C7' },
        { key: 'COOLING', title: '냉장 창고', bgColor: 'E0F2FE' },
        { key: 'FREEZING', title: '냉동 창고', bgColor: 'F1F5F9' },
        { key: 'GAS', title: '가스 용기', bgColor: 'F3E8FF' }
      ];

      const thinBorder = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      };

      const activeSensorNames = Object.keys(SENSOR_CONFIG);

      categorySpecs.forEach(cat => {
        const sheet = workbook.addWorksheet(cat.title);
        const sensorList = activeSensorNames
          .filter(name => SENSOR_CONFIG[name].type === cat.key)
          .map(name => ({ rawName: name, ...SENSOR_CONFIG[name] }));

        if (sensorList.length === 0) {
          sheet.addRow(['등록된 데이터가 없습니다.']);
          return;
        }

        const headerRow1 = ['수집일시'];
        sensorList.forEach(s => {
          const colSpan = (s.type === 'OUTDOOR') ? 3 : (s.type === 'GAS' ? 1 : 2);
          headerRow1.push(s.name);
          for (let i = 1; i < colSpan; i++) headerRow1.push('');
        });

        const r1 = sheet.addRow(headerRow1);
        r1.height = 26;

        const headerRow2 = ['수집일시'];
        sensorList.forEach(s => {
          if (s.type === 'GAS') {
            headerRow2.push('압력/잔량');
          } else {
            headerRow2.push('온도(℃)');
            headerRow2.push('습도(%)');
            if (s.type === 'OUTDOOR') headerRow2.push('체감온도(℃)');
          }
        });

        const r2 = sheet.addRow(headerRow2);
        r2.height = 24;

        sheet.mergeCells(1, 1, 2, 1);

        let colIdx = 2;
        sensorList.forEach(s => {
          const colSpan = (s.type === 'OUTDOOR') ? 3 : (s.type === 'GAS' ? 1 : 2);
          if (colSpan > 1) {
            sheet.mergeCells(1, colIdx, 1, colIdx + colSpan - 1);
          }
          colIdx += colSpan;
        });

        [r1, r2].forEach(row => {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cat.bgColor } };
            cell.font = { name: '오뚜기산스 3N Medium', size: 10, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
          });
        });

        const timeMap = {};
        result.rows.forEach(row => {
          const [sensorName, sensorType, temp, hum, feels, timeGroup] = row;
          const matchedRawKey = Object.keys(SENSOR_CONFIG).find(
            k => k === sensorName || SENSOR_CONFIG[k].name === sensorName
          );

          if (!matchedRawKey) return;
          const cfg = SENSOR_CONFIG[matchedRawKey];
          if (!cfg || cfg.type !== cat.key) return;

          let displayTs = timeGroup;
          if (type === '2') displayTs = timeGroup + ':00';

          if (!timeMap[displayTs]) timeMap[displayTs] = {};

          timeMap[displayTs][matchedRawKey] = {
            temp: temp !== null ? parseFloat(temp.toFixed(1)) : '',
            hum: hum !== null && !isNaN(hum) ? parseFloat(hum.toFixed(1)) : '',
            feels: feels !== null && !isNaN(feels) ? parseFloat(feels.toFixed(1)) : ''
          };
        });

        sheet.getColumn(1).width = 18;
        const feelsLikeColIndices = new Set();
        let currentColIndex = 2;

        sensorList.forEach(s => {
          if (s.type === 'GAS') {
            sheet.getColumn(currentColIndex).width = 14;
            currentColIndex += 1;
          } else {
            sheet.getColumn(currentColIndex).width = 12;
            sheet.getColumn(currentColIndex + 1).width = 12;
            if (s.type === 'OUTDOOR') {
              sheet.getColumn(currentColIndex + 2).width = 14;
              feelsLikeColIndices.add(currentColIndex + 2);
              currentColIndex += 3;
            } else {
              currentColIndex += 2;
            }
          }
        });

        const sortedTimeKeys = Object.keys(timeMap).sort().reverse();

        sortedTimeKeys.forEach(timeKey => {
          const rowVal = [timeKey];
          sensorList.forEach(s => {
            const item = timeMap[timeKey][s.rawName];
            if (item) {
              rowVal.push(item.temp);
              if (s.type !== 'GAS') {
                rowVal.push(item.hum);
                if (s.type === 'OUTDOOR') rowVal.push(item.feels);
              }
            } else {
              rowVal.push('');
              if (s.type !== 'GAS') {
                rowVal.push('');
                if (s.type === 'OUTDOOR') rowVal.push('');
              }
            }
          });

          const addedRow = sheet.addRow(rowVal);
          addedRow.height = 22;

          addedRow.eachCell({ includeEmpty: true }, (cell, cNum) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: '오뚜기산스 3N Medium', size: 10 };
            cell.border = thinBorder;

            if (cat.key === 'OUTDOOR' && feelsLikeColIndices.has(cNum) && cell.value !== '') {
              cell.font = { name: '오뚜기산스 3N Medium', size: 10, bold: true, color: { argb: 'DC2626' } };
            }
          });
        });
      });

      const typeNames = { '1': '일일집계', '2': '시간대별집계', '3': '5분단위집계' };
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `통합관제리포트_${typeNames[type] || '집계'}_${dateStr}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

      await workbook.xlsx.write(res);
      res.end();

    } catch (err) {
      console.error('[엑셀 오류] 다운로드 실패:', err.message);
      res.status(500).send('엑셀 리포트 생성 중 오류가 발생했습니다.');
    } finally {
      if (conn) await conn.close();
    }
  });

  return router;
};