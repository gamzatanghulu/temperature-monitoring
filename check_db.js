const oracledb = require('oracledb');

async function checkStorageOnly() {
  const dbConfig = {
    user: process.env.DB_USER || "sys",
    password: process.env.DB_PASSWORD || "1234",
    connectString: process.env.DB_CONNECT_STRING || "localhost:1521/FREEPDB1",
    privilege: oracledb.SYSDBA
  };

  let conn;
  try {
    console.log('데이터베이스에 연결하여 용량을 조회하는 중...');
    conn = await oracledb.getConnection(dbConfig);
    
    const result = await conn.execute(
      `SELECT NVL(SUM(bytes)/1024/1024, 0) AS TABLE_MB 
       FROM user_segments 
       WHERE segment_name = 'SENSOR_LOG_HISTORY'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const tableSizeMb = result.rows[0]?.TABLE_MB || 0;

    console.log('\n========================================');
    console.log(`📊 [오라클 DB 실시간 용량 진단]`);
    console.log(`- SENSOR_LOG_HISTORY 테이블 크기: ${Number(tableSizeMb).toFixed(2)} MB`);
    console.log(`- 오라클 Always Free 무료 한도: 20,000 MB (20 GB)`);
    console.log(`- 남은 여유 공간: 약 ${(20000 - tableSizeMb).toFixed(2)} MB`);
    console.log('========================================\n');

  } catch (err) {
    console.error('❌ 용량 조회 실패:', err.message);
  } finally {
    if (conn) await conn.close();
    process.exit(0);
  }
}

checkStorageOnly();