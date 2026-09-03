# 🌡️ Temperature Monitoring System

> 실시간 온도·습도 및 가스 상태를 통합 모니터링하고, 이상 상태 발생 시 이메일 알림과 데이터 이력 관리를 제공하는 스마트 관제 시스템

## 💡 프로젝트 개요

온도 센서의 실시간 데이터를 주기적으로 수집하여 웹 기반 대시보드에서 모니터링할 수 있도록 구현한 통합 관제 시스템입니다.

센서별 정상 범위를 설정하고 현재 측정값을 기준으로 이상 상태를 자동 감지하며, 야외 센서의 경우 온도와 습도를 기반으로 체감온도를 계산하여 보다 실질적인 온열 환경을 확인할 수 있도록 구성하였습니다.

또한 Oracle Database에 센서 측정 이력을 저장하고, 과거 데이터를 조회하거나 Excel 리포트로 다운로드할 수 있도록 구현하였습니다.

온도 센서뿐만 아니라 조아테크 고압가스 모니터링 시스템의 데이터를 Puppeteer를 이용하여 수집하여 온도·습도·가스 상태를 하나의 대시보드에서 통합적으로 확인할 수 있도록 구성하였습니다.

---

## 🛠 사용 기술 스택

| 구분                 | 기술                          |
| ------------------ | --------------------------- |
| Backend            | Node.js, Express            |
| HTTP Client        | Axios                       |
| Browser Automation | Puppeteer                   |
| Database           | Oracle Database             |
| Database Driver    | node-oracledb               |
| Excel              | ExcelJS                     |
| API                | REST API                    |
| CORS               | Express CORS                |
| Notification       | SMTP / Email                |
| Frontend           | HTML, CSS, JavaScript       |
| Deployment         | Netlify / Cloudflare Tunnel |
| Runtime            | Node.js                     |

---

## ✨ 주요 기능

### 🌡️ 실시간 온도·습도 모니터링

* 외부 온도 센서 API를 주기적으로 호출하여 데이터를 수집
* 센서별 온도 및 습도 실시간 표시
* 센서 종류에 따라 냉장·냉동·야외 등으로 구분
* 센서별 정상 온도 범위 설정 가능
* 마지막 데이터 수집 시각 표시

---

### 🌤️ 체감온도 계산

야외 센서의 온도와 상대습도 데이터를 이용하여 체감온도를 계산합니다.

단순 현재 온도뿐만 아니라 습도에 따른 실제 체감 환경을 함께 판단할 수 있도록 구성하였습니다.

```text
온도 + 습도
    ↓
이슬점 계산
    ↓
습구온도 계산
    ↓
체감온도 계산
    ↓
센서 허용범위와 비교
```

특히 야외 센서의 경우 실제 온도가 정상 범위에 있더라도 높은 습도로 인해 체감온도가 상승할 수 있으므로 체감온도를 기준으로 이상 상태를 판단하도록 구성하였습니다.

---

### 🚨 온도 이상 감지

각 센서별 최소/최대 허용 온도를 설정할 수 있습니다.

```text
측정값
  │
  ├── 정상 범위
  │      ↓
  │    NORMAL
  │
  └── 정상 범위 초과
         ↓
      WARNING
         ↓
    이메일 알림
```

센서 상태가

```text
NORMAL → WARNING
```

으로 변경되는 순간 이상 알림을 발송하며,

```text
WARNING → NORMAL
```

으로 복구될 경우 복구 알림을 발송합니다.

이를 통해 동일한 센서가 계속해서 경고 상태인 동안 불필요한 이메일이 반복적으로 발송되는 것을 방지합니다.

---

### 📧 이메일 알림

온도 이상 발생 및 복구 상황을 이메일로 알립니다.

#### 이상 발생

```text
NORMAL
  ↓
WARNING
  ↓
이상 온도 감지
  ↓
이메일 발송
```

#### 정상 복구

```text
WARNING
  ↓
NORMAL
  ↓
복구 감지
  ↓
복구 이메일 발송
```

또한 API를 통해 수동 테스트 메일을 발송할 수 있도록 구성하였습니다.

---

### 🗄️ Oracle Database 저장

센서 데이터를 Oracle Database에 지속적으로 저장합니다.

주요 저장 데이터:

* 센서명
* 센서 종류
* 온도
* 습도
* 체감온도
* 수집일시

테이블 구조:

```text
SENSOR_LOG_HISTORY
│
├── ID
├── SENSOR_NAME
├── SENSOR_TYPE
├── TEMPERATURE
├── HUMIDITY
├── FEELS_LIKE
└── COLLECTED_AT
```

Oracle Connection Pool을 사용하여 반복적인 DB 연결에 따른 부하를 줄일 수 있도록 구성하였습니다.

---

### 📊 실시간 / 과거 데이터 조회

센서 이력 데이터를 메모리 캐시와 Oracle Database를 함께 활용하여 제공합니다.

지원 데이터 범위:

```text
1시간
24시간
```

서버가 재시작되더라도 Oracle Database에 저장된 최근 데이터를 불러와 대시보드의 차트 이력을 복원할 수 있도록 구성하였습니다.

---

### 🧪 가스 용기 모니터링

조아테크 고압가스 모니터링 페이지를 Puppeteer로 자동 접속하여 가스 상태를 수집합니다.

모니터링 데이터:

* LN2 질소
* LCO2 탄산
* 현재 중량
* 최대 중량
* 잔량 %
* 압력
* 상태

구성:

```text
조아테크 웹사이트
       ↓
   Puppeteer
       ↓
   로그인
       ↓
고압탱크 모니터링
       ↓
   DOM 데이터 추출
       ↓
Node.js 서버
       ↓
통합 대시보드
```

---

### 📥 Excel 리포트

Oracle Database에 저장된 데이터를 Excel 파일로 다운로드할 수 있습니다.

지원 집계 방식:

| Type | 집계 방식    |
| ---- | -------- |
| 1    | 일일 집계    |
| 2    | 시간대별 집계  |
| 3    | 5분 단위 집계 |

Excel 파일은 센서 종류별로 시트를 분리하여 생성합니다.

```text
통합관제리포트
│
├── 야외 온열
├── 냉장 창고
├── 냉동 창고
└── 가스 용기
```

야외 센서의 경우 Excel 리포트에 다음 데이터를 함께 제공합니다.

```text
온도
습도
체감온도
```

---

## 🔌 REST API

백엔드에서는 `/api` 경로를 통해 센서 데이터를 제공합니다.

### 센서 데이터 조회

```http
GET /api/sensor
```

기간을 지정할 수도 있습니다.

```http
GET /api/sensor?range=24h
```

또는

```http
GET /api/sensor?range=1h
```

응답에는 다음 데이터가 포함됩니다.

```json
{
  "result_code": 0,
  "name_list": [],
  "data_list_1": [],
  "data_list_2": [],
  "feels_like_list": [],
  "sensor_configs": [],
  "alert_items": [],
  "joa_co2": {},
  "joa_n2": {},
  "history": [],
  "updated_at": ""
}
```

---

## 📁 프로젝트 구조

```text
temperature-monitoring/
│
├── backend/
│   ├── server.js
│   │
│   └── config/
│       ├── api.js
│       ├── calc.js
│       ├── db.js
│       ├── joatechService.js
│       ├── mailService.js
│       └── sensorConfig.js
│
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── screenshots/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🧩 시스템 구성

```text
┌──────────────────────┐
│    온도 센서 API      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│      Node.js         │
│       Express        │
│                      │
│  데이터 수집 / 처리   │
└───────┬───────┬──────┘
        │       │
        │       ├──────────────────┐
        │       │                  │
        ▼       ▼                  ▼
┌──────────┐ ┌──────────┐   ┌──────────────┐
│ 체감온도  │ │ 이상감지 │   │ 조아테크 가스 │
│ 계산      │ │ WARNING │   │ Puppeteer    │
└─────┬────┘ └────┬─────┘   └──────┬───────┘
      │           │                │
      │           ▼                │
      │     ┌────────────┐         │
      │     │ Email 알림  │         │
      │     └────────────┘         │
      │                            │
      └────────────┬───────────────┘
                   ▼
          ┌─────────────────┐
          │ Oracle Database │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ REST API Server │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Web Dashboard   │
          │                 │
          │ 실시간 데이터    │
          │ 차트 / 경고      │
          │ 가스 상태        │
          │ Excel 다운로드   │
          └─────────────────┘
```

---

## 🔄 데이터 처리 Flow

```text
[1] 센서 데이터 수집
        ↓
[2] 조아테크 가스 데이터 수집
        ↓
[3] 센서별 데이터 매핑
        ↓
[4] 체감온도 계산
        ↓
[5] 정상 / 이상 상태 판단
        ↓
[6] Oracle DB 저장
        ↓
[7] 메모리 캐시 갱신
        ↓
[8] REST API 제공
        ↓
[9] Web Dashboard 표시
        ↓
[10] 이상 상태 발생 시 Email 알림
```

---

## ⚙️ 환경 설정

민감한 정보는 소스 코드에 직접 작성하지 않고 환경변수로 관리합니다.

`.env.example`

```env
PORT=3000

DB_USER=
DB_PASSWORD=
DB_CONNECT_STRING=localhost:1521/FREEPDB1

HASH_KEY=

JOA_ID=
JOA_PASSWORD=

MAIL_HOST=
MAIL_PORT=
MAIL_USER=
MAIL_PASSWORD=
```

실제 운영 환경에서는 `.env` 파일을 사용합니다.

```text
.env
```

`.env`는 Git에 커밋하지 않습니다.

---

## 🚀 실행 방법

### 1. 프로젝트 Clone

```bash
git clone https://github.com/gamzatanghulu/temperature-monitoring.git
cd temperature-monitoring
```

### 2. Node.js 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

`.env.example`을 참고하여 `.env` 파일을 생성합니다.

```text
.env.example
        ↓
      복사
        ↓
      .env
```

### 4. Oracle Database 실행

Oracle Database가 실행 중인지 확인합니다.

기본 연결 예시는 다음과 같습니다.

```text
localhost:1521/FREEPDB1
```

### 5. 서버 실행

```bash
node server.js
```

또는 개발 환경에서는:

```bash
npm run dev
```

### 6. API 확인

```text
http://localhost:3000/api/sensor
```

---

## 🌐 외부 접속

개발 및 테스트 환경에서는 Cloudflare Tunnel 등을 이용하여 로컬 서버를 외부에서 접근할 수 있도록 구성할 수 있습니다.

```bash
cloudflared tunnel --url http://localhost:3000
```

이를 통해 로컬에서 실행 중인 Node.js API 서버를 외부 프론트엔드와 연결하여 테스트할 수 있습니다.

---

## 📸 주요 화면


### 통합 관제 대시보드

<img width="1887" height="527" alt="image" src="https://github.com/user-attachments/assets/a5d05ceb-6fa8-4af1-8656-9750574137d2" />


### 온도 / 습도 차트

<img width="1883" height="359" alt="image" src="https://github.com/user-attachments/assets/690810a0-80b4-4f86-9af8-4be3d36e984a" />


### 가스 용기 모니터링

<img width="476" height="88" alt="image" src="https://github.com/user-attachments/assets/0ac9d725-aefd-45b4-9142-2d3c6120b411" />


### Excel 리포트

<img width="404" height="239" alt="image" src="https://github.com/user-attachments/assets/aaacc743-09f8-459f-9031-bf8f0dcf50cd" />
<img width="1420" height="539" alt="image" src="https://github.com/user-attachments/assets/2b0e2479-dae9-412d-9780-990e58058ab8" />


---

## 🎯 프로젝트에서 구현한 핵심 포인트

* 실시간 외부 API 데이터 수집
* Node.js 기반 REST API 서버 구축
* 센서별 정상 범위 및 상태 관리
* 온도·습도 기반 체감온도 계산
* 센서 이상 상태 감지
* 이상 발생 / 복구 이메일 자동 알림
* Oracle Connection Pool 기반 데이터 저장
* 서버 재시작 후 기존 이력 데이터 복원
* Puppeteer를 이용한 외부 웹 데이터 자동 수집
* ExcelJS를 이용한 분석 리포트 자동 생성
* CORS를 이용한 프론트엔드-백엔드 분리
* Cloudflare Tunnel을 이용한 외부 테스트 환경 구성

---

## 🔐 보안 주의사항

본 프로젝트를 실행하기 위해 필요한 다음 정보는 GitHub에 공개하지 않습니다.

```text
DB 계정 / 비밀번호
센서 HASH KEY
외부 사이트 로그인 계정
이메일 계정 / 비밀번호
SMTP 인증 정보
```

운영 환경에서는 환경변수 또는 별도의 Secret 관리 시스템을 사용하는 것을 권장합니다.

---

## 📌 향후 개선 예정

* [ ] 센서 통신 끊김 감지
* [ ] 모바일 UI 최적화
* [ ] 일간 / 주간 / 월간 통계
* [ ] 센서별 상세 이력 조회
* [ ] 알림 이력 관리
* [ ] 대시보드 사용자 권한 관리
* [ ] 데이터 보존 기간 및 자동 삭제 정책
* [ ] Docker 기반 배포
* [ ] Oracle 외 DB 지원
* [ ] WebSocket 기반 실시간 데이터 전송

---
