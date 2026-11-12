const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const ExcelJS = require('exceljs');
const { SENSOR_CONFIG } = require('./sensorConfig');
const { getFilteredHistory, calculateFeelsLikeTemp } = require('./calc');
const { sendEmailNotification } = require('./mailService');

module.exports = function (getSensorContext) {

  // 센서 데이터에 체감온도(feels_like_list) 동적 병합 헬퍼 함수
  function attachFeelsLikeData(cachedData) {
    if (!cachedData || !Array.isArray(cachedData.data_list_1)) return cachedData;

    const temps = cachedData.data_list_1;
    const hums = cachedData.data_list_2 || [];
    const names = cachedData.name_list || [];

    const feelsLikeList = temps.map((tVal, idx) => {
      const temp = parseFloat(tVal);
      const hum = parseFloat(hums[idx]);
      const rawName = names[idx];
      const cfg = SENSOR_CONFIG[rawName];

      if (cfg && cfg.type === 'HEAT' && !isNaN(temp) && !isNaN(hum)) {
        return calculateFeelsLikeTemp(temp, hum);
      }
      return !isNaN(temp) ? temp : null;
    });

    return {
      ...cachedData,
      feels_like_list: feelsLikeList,
      feels_list: feelsLikeList 
    };
  }

  router.get('/sensor', (req, res) => {
    const { cachedSensorData, sensorHistory } = getSensorContext();
    const range = req.query.range || req.query.timeRange || '24h';
    const filteredHistory = getFilteredHistory(sensorHistory, range);
    const enrichedData = attachFeelsLikeData(cachedSensorData);

    res.json({ 
      ...enrichedData, 
      history: filteredHistory, 
      raw_configs: SENSOR_CONFIG 
    });
  });

  router.post('/sensor', (req, res) => {
    const { cachedSensorData, sensorHistory } = getSensorContext();
    const range = req.body.range || req.query.range || '24h';
    const filteredHistory = getFilteredHistory(sensorHistory, range);
    const enrichedData = attachFeelsLikeData(cachedSensorData);

    res.json({ 
      ...enrichedData, 
      history: filteredHistory, 
      raw_configs: SENSOR_CONFIG 
    });
  });

  router.post('/send-email', async (req, res) => {
    try {
      const { alertItems, isTest } = req.body;
      await sendEmailNotification({ 
        items: alertItems || [], 
        emailType: 'ALERT', 
        isTest: isTest || false 
      });
      return res.json({ success: true, message: '테스트 메일 전송 완료' });
    } catch (err) {
      console.error('메일 수동 발송 오류:', err);
      return res.status(500).json({ success: false, reason: err.message });
    }
  });

  // 💡 [현장 조치 내용 등록/업데이트 API]
  router.post('/action-note', async (req, res) => {
    let conn;
    try {
      const { sensorName, actionNote } = req.body;
      if (!sensorName || !actionNote) {
        return res.status(400).json({ success: false, message: '센서명과 조치 내용은 필수입니다.' });
      }

      conn = await oracledb.getConnection();
      
      const query = `
        UPDATE SENSOR_LOG_HISTORY 
        SET ACTION_NOTE = :actionNote 
        WHERE ID = (
          SELECT MAX(ID) 
          FROM SENSOR_LOG_HISTORY 
          WHERE SENSOR_NAME = :sensorName 
            AND COLLECTED_AT >= TRUNC(SYSDATE)
        )
      `;
      
      const result = await conn.execute(query, { actionNote, sensorName }, { autoCommit: true });
      
      if (result.rowsAffected === 0) {
        const fallbackQuery = `
          UPDATE SENSOR_LOG_HISTORY 
          SET ACTION_NOTE = :actionNote 
          WHERE ID = (
            SELECT MAX(ID) 
            FROM SENSOR_LOG_HISTORY 
            WHERE SENSOR_NAME = :sensorName
          )
        `;
        await conn.execute(fallbackQuery, { actionNote, sensorName }, { autoCommit: true });
      }

      res.json({ success: true, message: '조치 내역이 성공적으로 저장되었습니다.' });
    } catch (err) {
      console.error('조치 내역 저장 실패:', err.message);
      res.status(500).json({ success: false, reason: err.message });
    } finally {
      if (conn) try { await conn.close(); } catch (e) {}
    }
  });

  // 엑셀 다운로드 처리
  router.get('/excel-download', async (req, res) => {
    let conn;
    try {
      const { type = '1', startDate, endDate } = req.query; 

      conn = await oracledb.getConnection();
      
      let timeGroupExpr = '';
      
      if (type === '1') {
        timeGroupExpr = "TO_CHAR(COLLECTED_AT - (8.5 / 24), 'YYYY-MM-DD')";
      } else if (type === '2') {
        timeGroupExpr = "TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24')";
      } else if (type === '3') {
        timeGroupExpr = "TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24') || ':' || LPAD(FLOOR(TO_NUMBER(TO_CHAR(COLLECTED_AT, 'MI')) / 5) * 5, 2, '0')";
      }

      let query = `
        SELECT SENSOR_NAME, SENSOR_TYPE, 
               ROUND(AVG(TEMPERATURE), 2) AS AVG_TEMP, 
               ROUND(AVG(HUMIDITY), 2) AS AVG_HUM, 
               CASE 
                 WHEN SENSOR_TYPE = 'GAS' THEN 
                   ROUND(SUM(CASE WHEN FEELS_LIKE < 0 OR FEELS_LIKE > 500 THEN 0 ELSE FEELS_LIKE END), 2)
                 ELSE ROUND(AVG(FEELS_LIKE), 2)
               END AS AVG_FEELS,
               ${timeGroupExpr} AS TIME_GROUP,
               MAX(ACTION_NOTE) KEEP (DENSE_RANK LAST ORDER BY COLLECTED_AT) AS LATEST_ACTION_NOTE
        FROM SENSOR_LOG_HISTORY
      `;

      const binds = {};
      if (startDate && endDate) {
        query += ` WHERE COLLECTED_AT >= TO_DATE(:startDate, 'YYYY-MM-DD') 
                    AND COLLECTED_AT < TO_DATE(:endDate, 'YYYY-MM-DD') + 1 `;
        binds.startDate = startDate;
        binds.endDate = endDate;
      }

      if (type === '3') {
        query += ` GROUP BY SENSOR_NAME, SENSOR_TYPE, TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24'), FLOOR(TO_NUMBER(TO_CHAR(COLLECTED_AT, 'MI')) / 5) `;
      } else if (type === '2') {
        query += ` GROUP BY SENSOR_NAME, SENSOR_TYPE, TO_CHAR(COLLECTED_AT, 'YYYY-MM-DD HH24') `;
      } else {
        query += ` GROUP BY SENSOR_NAME, SENSOR_TYPE, TO_CHAR(COLLECTED_AT - (8.5 / 24), 'YYYY-MM-DD') `;
      }
      
      query += ` ORDER BY TIME_GROUP DESC `;

      const result = await conn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_ARRAY });
      
      const workbook = new ExcelJS.Workbook();
      workbook.creator = '스마트관제시스템';

      // 요청하신 순서(냉동 / 냉장 / 생산1팀 / 생산2팀 / 폭염 / 가스) 및 색상 정의
      const categorySpecs = [
        { key: 'FREEZING', title: '냉동 창고', bgColor: 'E0F2FE' }, // 연한 하늘색
        { key: 'COOLING',  title: '냉장 창고', bgColor: 'FFEDD5' }, // 연한 살구/주황색
        { key: 'PROD1',    title: '생산 1팀',  bgColor: 'DCFCE7' }, // 연한 연두색
        { key: 'PROD2',    title: '생산 2팀',  bgColor: 'FEF3C7' }, // 연한 노란색
        { key: 'HEAT',     title: '폭염 관제', bgColor: 'FEE2E2' }, // 연한 빨간색
        { key: 'GAS',      title: '가스 용기', bgColor: 'F3E8FF' }  // 연한 보라색
      ];

      const thinBorder = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      };

      const activeSensorNames = Object.keys(SENSOR_CONFIG);

      // 전체 조회 데이터를 시간대별로 미리 정리 (모든 시트에서 재사용)
      const globalTimeMap = {};
      if (result.rows && result.rows.length > 0) {
        result.rows.forEach(row => {
          const [sensorName, sensorType, temp, hum, feels, timeGroup, actionNote] = row;
          const matchedRawKey = activeSensorNames.find(
            k => k === sensorName || SENSOR_CONFIG[k].name === sensorName
          );

          if (!matchedRawKey) return;
          const cfg = SENSOR_CONFIG[matchedRawKey];
          if (!cfg) return;

          let displayTs = timeGroup;
          if (type === '2') displayTs = timeGroup + ':00';

          if (!globalTimeMap[displayTs]) globalTimeMap[displayTs] = {};

          const parsedTemp = (temp !== null && temp !== undefined) ? parseFloat(Number(temp).toFixed(1)) : null;
          const parsedHum = (hum !== null && hum !== undefined && !isNaN(hum)) ? parseFloat(Number(hum).toFixed(1)) : null;

          let calculatedFeels = null;
          if (cfg.type === 'HEAT' && parsedTemp !== null && parsedHum !== null) {
            calculatedFeels = calculateFeelsLikeTemp(parsedTemp, parsedHum);
          } else if (feels !== null && feels !== undefined && !isNaN(feels)) {
            calculatedFeels = parseFloat(Number(feels).toFixed(1));
          }

          globalTimeMap[displayTs][matchedRawKey] = {
            temp: parsedTemp !== null ? parsedTemp : '',
            hum: parsedHum !== null ? parsedHum : '',
            feels: calculatedFeels !== null ? calculatedFeels : '',
            actionNote: actionNote || ''
          };
        });
      }

      const sortedTimeKeys = Object.keys(globalTimeMap).sort().reverse();

      // =========================================================================
      // 1. 첫 번째 시트: 전체 모니터링 (습도 제거, 냉동/냉장 등 긴 이름을 위해 너비 +3pt 확대)
      // =========================================================================
      const summarySheet = workbook.addWorksheet('전체 모니터링');
      
      const categoryGroups = [];
      categorySpecs.forEach(cat => {
        const sensorsInCat = activeSensorNames
          .filter(name => SENSOR_CONFIG[name].type === cat.key)
          .map(name => ({ rawName: name, ...SENSOR_CONFIG[name] }));
        
        if (sensorsInCat.length > 0) {
          categoryGroups.push({
            title: cat.title,
            bgColor: cat.bgColor,
            sensors: sensorsInCat
          });
        }
      });

      if (categoryGroups.length === 0) {
        summarySheet.addRow(['등록된 데이터가 없습니다.']);
      } else {
        const sHeader1 = ['수집일시']; // 1행: 구역명
        const sHeader2 = ['수집일시']; // 2행: 센서 상세명 (name) - 긴 이름 대응 너비 확대
        const sHeader3 = ['수집일시']; // 3행: 측정 항목
        
        const colColorMap = { 1: 'E2E8F0' };
        const summaryHighlightCols = new Set();

        let sColIdx = 2;
        categoryGroups.forEach(group => {
          group.sensors.forEach(s => {
            let colSpan = 1;
            if (s.type === 'GAS') {
              colSpan = 3;
            } else {
              colSpan = 1; // 일반 및 폭염 모두 1열
            }

            sHeader1.push(group.title);
            for (let i = 1; i < colSpan; i++) sHeader1.push('');

            sHeader2.push(s.name);
            for (let i = 1; i < colSpan; i++) sHeader2.push('');

            if (s.type === 'GAS') {
              sHeader3.push('잔량(kg)', '압력(bar)', '사용량(kg)');
              summaryHighlightCols.add(sColIdx + 2);
            } else if (s.type === 'HEAT') {
              sHeader3.push('체감온도(℃)');
              summaryHighlightCols.add(sColIdx);
            } else {
              sHeader3.push('온도(℃)');
            }

            // 기존 12에서 약 3포인트 넓힌 15로 설정 (냉동/냉장 등 긴 이름 수용)
            const columnWidth = (s.type === 'GAS') ? 13 : 15;

            for (let i = 0; i < colSpan; i++) {
              colColorMap[sColIdx + i] = group.bgColor;
              summarySheet.getColumn(sColIdx + i).width = columnWidth;
            }

            sColIdx += colSpan;
          });
        });

        const sr1 = summarySheet.addRow(sHeader1);
        const sr2 = summarySheet.addRow(sHeader2);
        const sr3 = summarySheet.addRow(sHeader3);
        
        [sr1, sr2, sr3].forEach(r => r.height = 22);

        summarySheet.mergeCells(1, 1, 3, 1);
        summarySheet.getColumn(1).width = 18;

        let currentMergeCol = 2;
        categoryGroups.forEach(group => {
          let groupColSpanTotal = 0;
          group.sensors.forEach(s => {
            const span = (s.type === 'GAS') ? 3 : 1;
            groupColSpanTotal += span;

            if (span > 1) {
              summarySheet.mergeCells(2, currentMergeCol, 2, currentMergeCol + span - 1);
            }
            currentMergeCol += span;
          });

          if (groupColSpanTotal > 0) {
            const startCol = currentMergeCol - groupColSpanTotal;
            const endCol = currentMergeCol - 1;
            if (startCol < endCol) {
              summarySheet.mergeCells(1, startCol, 1, endCol);
            }
          }
        });

        [sr1, sr2, sr3].forEach(row => {
          row.eachCell({ includeEmpty: true }, (cell, cNum) => {
            const bg = colColorMap[cNum] || 'F8FAFC';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: '오뚜기산스 3N Medium', size: 10, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
          });
        });

        sortedTimeKeys.forEach(timeKey => {
          const rowVal = [timeKey];
          categoryGroups.forEach(group => {
            group.sensors.forEach(s => {
              const item = globalTimeMap[timeKey][s.rawName];
              if (item) {
                if (s.type === 'GAS') {
                  rowVal.push(item.temp, item.hum, item.feels);
                } else if (s.type === 'HEAT') {
                  rowVal.push(item.feels !== '' ? item.feels : item.temp);
                } else {
                  rowVal.push(item.temp);
                }
              } else {
                if (s.type === 'GAS') {
                  rowVal.push('', '', '');
                } else {
                  rowVal.push('');
                }
              }
            });
          });

          const addedRow = summarySheet.addRow(rowVal);
          addedRow.height = 22;

          addedRow.eachCell({ includeEmpty: true }, (cell, cNum) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: '오뚜기산스 3N Medium', size: 10 };
            cell.border = thinBorder;

            if (summaryHighlightCols.has(cNum) && cell.value !== '') {
              cell.font = { name: '오뚜기산스 3N Medium', size: 10, bold: true, color: { argb: 'DC2626' } };
            }
          });
        });
      }

      // =========================================================================
      // 2. 카테고리별 개별 시트 (기존 로직 유지)
      // =========================================================================
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
          const colSpan = (s.type === 'HEAT' || s.type === 'GAS') ? 4 : 3;
          headerRow1.push(s.name);
          for (let i = 1; i < colSpan; i++) headerRow1.push('');
        });

        const r1 = sheet.addRow(headerRow1);
        r1.height = 26;

        const headerRow2 = ['수집일시'];
        sensorList.forEach(s => {
          if (s.type === 'GAS') {
            headerRow2.push('잔량(kg)', '압력(bar)', '사용량(kg)', '조치사항');
          } else {
            headerRow2.push('온도(℃)', '습도(%)');
            if (s.type === 'HEAT') headerRow2.push('체감온도(℃)');
            headerRow2.push('조치사항');
          }
        });

        const r2 = sheet.addRow(headerRow2);
        r2.height = 24;

        sheet.mergeCells(1, 1, 2, 1);

        let colIdx = 2;
        sensorList.forEach(s => {
          const colSpan = (s.type === 'HEAT' || s.type === 'GAS') ? 4 : 3;
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

        sheet.getColumn(1).width = 18;
        const highlightColIndices = new Set();
        let currentColIndex = 2;

        sensorList.forEach(s => {
          if (s.type === 'GAS') {
            sheet.getColumn(currentColIndex).width = 12;
            sheet.getColumn(currentColIndex + 1).width = 12;
            sheet.getColumn(currentColIndex + 2).width = 12;
            sheet.getColumn(currentColIndex + 3).width = 20;
            highlightColIndices.add(currentColIndex + 2);
            currentColIndex += 4;
          } else {
            sheet.getColumn(currentColIndex).width = 11;
            sheet.getColumn(currentColIndex + 1).width = 11;
            if (s.type === 'HEAT') {
              sheet.getColumn(currentColIndex + 2).width = 13;
              sheet.getColumn(currentColIndex + 3).width = 20;
              highlightColIndices.add(currentColIndex + 2);
              currentColIndex += 4;
            } else {
              sheet.getColumn(currentColIndex + 2).width = 20;
              currentColIndex += 3;
            }
          }
        });

        sortedTimeKeys.forEach(timeKey => {
          const rowVal = [timeKey];
          sensorList.forEach(s => {
            const item = globalTimeMap[timeKey][s.rawName];
            if (item) {
              rowVal.push(item.temp);
              rowVal.push(item.hum);
              if (s.type === 'HEAT' || s.type === 'GAS') {
                rowVal.push(item.feels);
              }
              rowVal.push(item.actionNote);
            } else {
              rowVal.push('');
              rowVal.push('');
              if (s.type === 'HEAT' || s.type === 'GAS') {
                rowVal.push('');
              }
              rowVal.push('');
            }
          });

          const addedRow = sheet.addRow(rowVal);
          addedRow.height = 22;

          addedRow.eachCell({ includeEmpty: true }, (cell, cNum) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: '오뚜기산스 3N Medium', size: 10 };
            cell.border = thinBorder;

            if ((cat.key === 'HEAT' || cat.key === 'GAS') && highlightColIndices.has(cNum) && cell.value !== '') {
              cell.font = { name: '오뚜기산스 3N Medium', size: 10, bold: true, color: { argb: 'DC2626' } };
            }
          });
        });
      });

      const typeNames = { '1': '일일집계(08:30기준)', '2': '시간대별집계', '3': '5분단위집계' };
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `통합관제리포트_${typeNames[type] || '집계'}_${dateStr}.xlsx`;
      const encodedFilename = encodeURIComponent(filename);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);

      await workbook.xlsx.write(res);
      res.end();

    } catch (err) {
      console.error('엑셀 다운로드 실패:', err.message);
      if (!res.headersSent) {
        res.status(500).send('엑셀 리포트 생성 중 오류가 발생했습니다.');
      }
    } finally {
      if (conn) {
        try { await conn.close(); } catch (e) {}
      }
    }
  });

  return router;
};