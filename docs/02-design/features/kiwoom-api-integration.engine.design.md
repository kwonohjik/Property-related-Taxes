# 키움증권 OpenAPI 연동 — 인프라 엔진 설계 (`lib/kiwoom/`, v2)

> ★ v2 self-review 정정 (5건):
> 1. **store 필드 재사용**: ①②③ 신규 추가 = `kiwoomTradingHalt`·`kiwoomLastFetchedAt` 2개만 (`securityCode` 기존 line 81 재활용)
> 2. **클라이언트 필터 책임 분리**: ka10081 ~200거래일 응답 → Route Handler에서 1개월 범위 필터 → averages.ts 순수 함수에 quotes 인자로 전달
> 3. **환경변수 graceful**: `KiwoomConfigError` 신규 + Route 503 + UI 안내 카드 (auto fallback 금지)
> 4. **캐시 키 변경**: `LRUCache<CacheKey, DailyQuote>` 일자별 단일 종가 (과거 거래일 영구·당일 5분 TTL)
> 5. **거래정지 자동조회 차단**: `KiwoomTradingHaltError` 신규 + 비상장 자동조회 명시적 미지원 (`marketType === "unlisted"` → 안내, F-14 후속)

---



> **관련 Plan**: `docs/00-pm/kiwoom-stock-transfer-163-9-autofetch.plan.md` (v3)
> **관련 UI 설계**: `kiwoom-stock-transfer-163-9-autofetch.ui.design.md`
> **에이전트**: `kiwoom-api-senior` — `.claude/agents/kiwoom-api-senior.md`
> **작성일**: 2026-05-19

## Context

본 프로젝트의 주식 평가는 §99①3(상장 양도일 직전 1개월 평균)·§63①1(상속·증여 평가기준일 전후 2개월)·§165⑤(취득 후 상장 1개월)·§99①3 양도일 당일 종가 등 **다수 시점·법령에서 동일 시세 데이터를 반복 사용**한다. 종목코드 입력 시 종가 자동조회 인프라를 단일 도메인(`lib/kiwoom/`)으로 분리하여 6개 이상의 후속 PR이 재사용한다.

본 PR 첫 사용 케이스는 **§99①3 (소득세법) → 시행령 §165③ 코스닥·코넥스 치환 → 상증법 §63①1가목 본문 준용 → 상증령 §52의2**의 1주당 1개월 평균(이미지 26 31-슬롯).

이전 한계: 사용자가 31-슬롯 종가를 수동 입력 → 휴장일 누락·평균 산정 오류·거래정지 종목 식별 불가. KoreanLaw MCP 검증으로 기존 코드 `§163⑨` 인용 오류(환원율 §82 오기 패턴 반복) 동시 발견.

---

## ★ 케이스 인벤토리 (8행 — Do 진입 게이트 통과)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| K-01 | KOSPI 정상 (휴장일 없음) | 상증령 §52의2④ 거래일 분모 | 005930 2024-06-03 모의투자 응답 캡처 | `__tests__/kiwoom/averages.test.ts` | ☐ TODO |
| K-02 | KOSDAQ 어린이날 휴장 포함 | 상증령 §52의2④1 공휴일 제외 | 086520 2024-05-07 fixture | `__tests__/kiwoom/calendar.test.ts` | ☐ TODO |
| K-03 | KONEX 종목 | 시령 §165③ KONEX 적용 | 217620 2024-04-01 (휴장일 anchor 검증 후) | `__tests__/kiwoom/calendar.test.ts` | ☐ TODO |
| K-04 | 거래정지·관리종목 (자동조회 차단) | 상증령 §52의2③ 평가 제외 | `tradingHalt:"Y"` mock | `__tests__/kiwoom/tr/ka10001.test.ts` | ☐ TODO |
| K-05 | IPO 후 1개월 미만 (분모 부족) | (자동 보정 금지) | 신규상장 종목 fixture | `__tests__/kiwoom/averages.test.ts` | ☐ TODO |
| K-06 | 양도일=오늘 (미래일 빈칸) | — | base_dt=TODAY fixture | `__tests__/kiwoom/averages.test.ts` | ☐ TODO |
| K-07 | 윤년 경계 (2024-03-01) | — | 2024-02-01~2024-02-29 29일 | `__tests__/kiwoom/averages.test.ts` | ☐ TODO |
| K-08 | Rate limit 초과 (동시 다종목) | — | 6 concurrent → token bucket | `__tests__/kiwoom/client.test.ts` | ☐ TODO |

**Phase 0 게이트 anchor**:

| Anchor ID | 대상 | 우선순위 |
|---|---|---|
| K-PING-01 | 모의투자 ka10001 005930 실호출 | Phase 0.3 (사용자 키 입력 후) |
| K-MAP-01 | `market-mapping.normalizeMarket("KOSPI") === "kospi"` | Phase 1 진입 직후 |
| K-DEDUP-01 | 동일 요청 2회 동시 → 1회 API + Promise 공유 | Phase 1 |
| K-FILTER-01 | ka10081 200거래일 → `[transferDate−1m, transferDate−1d]` 22거래일 필터 | Phase 1 |

---

## 법령 근거 (KoreanLaw MCP 본문 검증 완료)

```
소득세법 §99①3 (모법, MST 285523):
  "「상속세 및 증여세법」 제63조제1항제1호가목을 준용하여 평가한 가액.
   이 경우 '평가기준일 이전·이후 각 2개월'은 '양도일·취득일 이전 1개월'로 본다."

소득세법 시행령 §165③ (MST 285631):
  "법 제99조제1항제3호 전단 및 같은 항 제4호 전단에서 '대통령령으로 정하는 주권상장법인'이란
   각각 코스닥시장 또는 코넥스시장에 주권을 상장한 법인을 말하며, ...
   상증령 §52의2제3항에 해당하는 것을 말한다.
   이 경우 같은 항 중 '평가기준일 전후 2개월'은 '양도일·취득일 이전 1개월'로 한다."

상증령 §52의2 (MST 283637):
  ② 평균액 산정 기간 정의 (증자·합병 사유 발생 시 조정 — 본 PR scope 외, F-13 후속)
  ③ 매매거래 정지·관리종목 지정 기간 포함 주식은 본 평가에서 제외
     → 거래정지 자동조회 차단 법령 근거
  ④ "공휴일 등 매매가 없는 날" = (1) 공휴일 및 대체공휴일 (2) 토요일
     → 평균 분모에서 제외 = 거래일 분모 법령 명시
```

**기존 §163⑨ 인용 정정**: 시행령 §163⑨은 상속·증여 자산 취득가액 산정 조항으로 일봉 1개월 평균과 무관. 4개 파일 주석·라벨 정정은 Plan §10.2 Phase 0.1 D-1 mini-PR로 분리.

법령 상수 → `lib/tax-engine/legal-codes/stock.ts`에 다음 키 추가:

```ts
export const STOCK_VALUATION = {
  ONE_MONTH_AVG_LAW: "소득세법 §99①3",
  ONE_MONTH_AVG_DECREE: "소득세법 시행령 §165③",
  ONE_MONTH_AVG_PRESCRIBE: "상증법 §63①1가목",
  ONE_MONTH_AVG_BASIS: "상증령 §52의2",
  TRADING_DAY_DEFINITION: "상증령 §52의2④",
  TRADING_HALT_EXCLUSION: "상증령 §52의2③",
} as const;
```

---

## 도메인 input·output 타입

본 도메인은 세금 엔진과 분리된 시세 인프라이므로 `*Input`/`*Result` 보다는 각 함수 시그니처로 명세.

### 핵심 export 시그니처

```ts
// lib/kiwoom/auth.ts
export async function getAccessToken(): Promise<string>;
// 메모리 캐시 + 만료 5분 전 자동 갱신. 환경변수 KIWOOM_APP_KEY/KIWOOM_APP_SECRET/KIWOOM_ENV.

// lib/kiwoom/tr/ka10001-stock-info.ts
export type StockBasicInfo = {
  stockCode: string;        // "005930"
  stockName: string;        // "삼성전자"
  marketType: MarketType;   // "kospi"|"kosdaq"|"konex"|"unlisted"
  marketCap: number;        // 시가총액 (원)
  listedShares: number;     // 상장주식수
  tradingHalt: boolean;     // 거래정지 (상증령 §52의2③)
  adminIssue: boolean;      // 관리종목
};
export async function fetchStockBasicInfo(stockCode: string): Promise<StockBasicInfo>;

// lib/kiwoom/tr/ka10081-daily-chart.ts
export type DailyQuote = {
  date: string;             // "YYYY-MM-DD"
  close: number;            // 종가 (원)
  open: number;
  high: number;
  low: number;
  volume: number;
};
export async function fetchDailyChart(
  stockCode: string,
  baseDate: string,         // "YYYY-MM-DD"
  modifyPriceType?: "1" | "0",  // default "1" (수정주가)
): Promise<DailyQuote[]>;   // 응답: base_dt 이전 ~200거래일

// lib/kiwoom/averages.ts
export type OneMonthBeforeTransferResult = {
  slots: Array<{
    date: string;           // "2023-01-17" ...
    label: string;          // "토요일·거래일 제외"|"일요일·거래일 제외"|""
    close: number | null;   // 거래일만 number, 비거래일 null
    isTradingDay: boolean;
  }>;
  tradingDayCount: number;
  sum: number;
  average: number;          // floor(sum / tradingDayCount). 원 단위 정수
  legalBasis: typeof STOCK_VALUATION;
};
export function oneMonthBeforeTransferAvg(args: {
  quotes: DailyQuote[];     // ka10081 응답
  transferDate: string;     // "YYYY-MM-DD"
}): OneMonthBeforeTransferResult;

// lib/kiwoom/calendar.ts
export function isKrxTradingDay(date: string): boolean;
export function isWeekend(date: string): boolean;
export function getWeekendLabel(date: string): "토요일·거래일 제외" | "일요일·거래일 제외" | "";
export function getHolidayLabel(date: string): string | null;   // "어린이날·거래일 제외" 등

// lib/kiwoom/cache.ts
export type CacheKey = `${string}|${string}|${string}`;  // TR|stockCode|YYYY-MM-DD (일자별 단일 종가 캐시)
export const dailyQuoteCache: LRUCache<CacheKey, DailyQuote>;  // capacity 1,000
// ★ 과거 거래일 종가는 영구(미만료) — 거래일 fixed. 당일·미래일은 5분 TTL.

// lib/kiwoom/errors.ts (신규)
export class KiwoomConfigError extends Error {}     // 환경변수 미설정 → 503
export class KiwoomAuthError extends Error {}       // 토큰 발급 실패
export class KiwoomRateLimitError extends Error {}  // 4회 재시도 후 실패
export class KiwoomTradingHaltError extends Error {} // 거래정지 종목

// lib/kiwoom/dedup.ts
export function deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T>;
// in-flight Map 기반. 동일 키 동시 호출 시 동일 Promise 공유.

// lib/kiwoom/market-mapping.ts
export type MarketType = "kospi" | "kosdaq" | "konex" | "unlisted";
export function normalizeMarket(apiMarketId: string): MarketType;
// "KOSPI"|"KOSDAQ"|"KONEX" → lowercase. 매핑 단일 진실.
```

---

## 계산 알고리즘 (단계별)

### `oneMonthBeforeTransferAvg`

1. **31-슬롯 일자 생성**: `[transferDate − 1 month, transferDate − 1 day]` 달력일 enumerate
   - 윤년 처리: 2024-03-01 → [2024-02-01 ... 2024-02-29] 29일
   - 1개월 = `addMonths(transferDate, -1)` (date-fns)
2. **각 슬롯 거래일 판정** (calendar.ts):
   - 토요일·일요일 → `isTradingDay = false`, label = "토요일·거래일 제외" 또는 "일요일·거래일 제외"
   - KRX 휴장일(정적 fixture 2020~2026) → `isTradingDay = false`, label = "어린이날·거래일 제외" 등
   - 범위 외(2020 이전 / 2027 이후) → ka10081 응답에서 거래일 존재 여부로 판정
3. **종가 매핑**: quotes 응답을 `Map<date, close>`로 인덱싱 후 거래일 슬롯에 매핑
4. **평균 산정**: `sum = Σ close (거래일만)`, `count = tradingDayCount`, `average = Math.floor(sum / count)` (원 단위)
5. **분모 부족 경고** (count < 정상 기대치 22일 등): `{warning: "ipo_not_yet" | "trading_halt" | null}` 메타 동봉 (자동 보정 금지)

### `getAccessToken`

1. 메모리 캐시(`{token, expiresAt}`) 조회 → 만료 5분 전이면 그대로 반환
2. 만료 임박/없음 → `POST {KIWOOM_BASE_URL}/oauth2/token`
   - body: `{ grant_type: "client_credentials", appkey, secretkey }`
   - secret은 `process.env.KIWOOM_APP_SECRET` (서버측만)
3. 응답 `{ token, expires_dt }` → 캐시 저장 → 반환
4. **TODO(F-11)**: serverless 환경 분산 token store (Redis/Supabase `kiwoom_tokens`)

### `client.fetchTR`

1. **환경변수 확인** — `KIWOOM_APP_KEY`·`KIWOOM_APP_SECRET` 미설정 시 즉시 `KiwoomConfigError` throw → Route Handler 503 + UI graceful 안내 (자동 fallback 채움 금지)
2. dedup 키 생성 `{TR}|{stockCode}|{base_dt}` → in-flight Map 확인
3. token bucket 큐 (초당 3건 안전치) → 슬롯 확보 대기
4. 캐시 조회 (TR=ka10081 + 과거일자) → hit 시 반환
5. `fetch(endpoint, { headers: {authorization, appkey, secretkey, api-id, ...}, body })`
6. 429·5xx → 지수 백오프(250ms·500ms·1s·2s, 최대 4회)
7. 응답 검증 (`return_code === 0`) → 캐시 저장 → 반환
8. 응답 헤더 `X-RateLimit-Remaining` 등 감시 → 일별 한도 임박 시 console.warn

### Route Handler `transfer-1month` 책임 분리 (v2 명세)

`POST /api/kiwoom/transfer-1month` 내부:

1. Zod 검증 `{ stockCode: /^\d{6}$/, transferDate: ISO }`
2. `fetchDailyChart(stockCode, transferDate)` → 응답 ~200거래일
3. **클라이언트 필터** (Route 책임): 응답을 `[transferDate − 1 month, transferDate − 1 day]` 범위로 필터 → `quotes: DailyQuote[]`
4. `oneMonthBeforeTransferAvg({ quotes, transferDate })` 호출 (averages.ts는 순수 함수 — 필터 책임 없음)
5. 응답 JSON `{ slots, tradingDayCount, sum, average, warning }` 반환

→ averages.ts는 quotes 인자를 받아 평균만 산정. 필터링은 Route Handler 책임 단일.

---

## Silent fallback / 자동 안분 후보 식별

본 도메인에서 자동 fallback이 들어갈 위험 지점 + 차단 정책:

| 후보 | 차단 방법 | 법령 근거 |
|---|---|---|
| 거래정지 종목 자동 시세 추정 | `tradingHalt === true` 시 API throw + UI 안내 카드 + 수동 입력 허용 | 상증령 §52의2③ |
| IPO 1개월 미만 시 부족 분모로 평균 산정 | 분모 < 정상 기대치 시 `warning` 메타 + 결과 카드 경고 (자동 22일로 패딩 금지) | (법령 명시 없음 — 자동 fallback 금지 정책) |
| 휴장일 슬롯을 직전·직후 종가로 보간 | 보간 금지. 빈 슬롯 유지 + 평균 분모만 거래일 수 | 상증령 §52의2④ |
| 토큰 만료 시 자동 silent 재발급 | 재발급은 OK (메모리 캐시 갱신 단일 동작). 단 발급 실패 시 사용자 보고 (silent retry 무한 루프 금지) | — |
| 일별 호출 한도 초과 시 결과 누락 | 한도 초과 시 API throw + 수동 입력 안내. 추정값 채움 금지 | — |

---

## 테스트 약속

- 케이스 인벤토리 8행 모두 anchor 테스트 작성 (위 표 K-01~K-08)
- Phase 0 anchor 5건 (K-PING-01·K-MAP-01·K-DEDUP-01·K-FILTER-01·K-AVG-01) Pre-Do 우선 검증 (`feedback_pre_anchor_verification`)
- 모의투자 실응답 fixture 캡처 → 원단위 `toBe()` (`feedback_pdf_example_test_anchoring` 동일 정책)
- 회귀 보호: 기존 stock-transfer 3,452 PASS 유지
- 회귀 anchor: 사용자 발견 버그는 즉시 anchor로 고정

---

## 800줄 파일 분할 약속

| 파일 | 예상 줄수 |
|---|---|
| `lib/kiwoom/auth.ts` | ~120 |
| `lib/kiwoom/client.ts` | ~180 |
| `lib/kiwoom/dedup.ts` | ~50 |
| `lib/kiwoom/market-mapping.ts` | ~60 |
| `lib/kiwoom/tr/ka10001-stock-info.ts` | ~80 |
| `lib/kiwoom/tr/ka10081-daily-chart.ts` | ~100 |
| `lib/kiwoom/cache.ts` | ~120 |
| `lib/kiwoom/calendar.ts` | ~80 |
| `lib/kiwoom/data/krx-holidays-2020-2026.ts` | ~80 |
| `lib/kiwoom/averages.ts` | ~120 |
| `lib/kiwoom/types.ts` | ~60 |
| `app/api/kiwoom/search/route.ts` | ~100 |
| `app/api/kiwoom/transfer-1month/route.ts` | ~140 |

총 ~1,290줄. 모두 800줄 정책 준수.

---

## UI 통합 위임

- UI 측 명세는 `kiwoom-stock-transfer-163-9-autofetch.ui.design.md` 참조
- 14개 동기화 지점 중 본 PR 변경: ①②③ (`kiwoomTradingHalt`·`kiwoomLastFetchedAt` 2 필드만 — `securityCode`는 기존 store line 81 재활용) + ⑤ (UI 위젯) + ⑧ (securityCode 6자리 검증, 빈문자 허용)
- 나머지 ④⑥⑦⑨⑩⑪⑫⑬⑭ 변경 없음 — 모든 신규 필드 엔진 미전송 UI 메타

---

## 보안·환경변수

```env
# .env.example (실키는 .env.local에 사용자가 직접 입력)
KIWOOM_APP_KEY=
KIWOOM_APP_SECRET=
KIWOOM_ENV=mock   # mock | prod
```

- 실키 절대 커밋 금지 (`.gitignore` `.env.local` 확인)
- access token 메모리 캐시만 (서버측). localStorage·cookie 금지
- 클라이언트는 `/api/kiwoom/*` Route Handler만 호출 (CORS·secret 노출 방지)
- 로깅 시 `app_key`·`secret_key`·`token` 마스킹 (마지막 4자만)

---

## 후속 PR

| ID | 내용 | 본 도메인 영향 |
|---|---|---|
| F-01 | §63①1 평가기준일 전후 2개월 (상속·증여) | `averages.twoMonthSurroundingAvg()` 추가 |
| F-02 | §165⑤ 상장일 이후 1개월 (사례 48) | `averages.oneMonthAfterListingAvg()` 추가 |
| F-03 | §99①3 양도일 당일 종가 단건 | `averages.transferDayClose()` 추가 |
| F-04 | 대주주 임계 시총 50억 자동 판정 | `valuation/major-shareholder.ts` 신규 |
| F-05 | 액면분할·무상증자 보정 (`modify_pric_tp` 옵션화) | 본 PR 기본 "1" 고정 |
| F-06 | 다종목 batch (ka10095) | TR 추가 |
| F-07 | Supabase `stock_quotes` 영구 캐시 | `cache.ts` 백엔드 분리 |
| F-08 | 휴장일 캘린더 npm package 비교 평가 | `calendar.ts` 대체 검토 |
| F-09 | Playwright e2e | — |
| F-10 | 종목명 자동완성 다건 후보 (ka10099 prefetch) | TR 추가 |
| F-11 | Vercel/serverless 분산 token store | `auth.ts` Redis/Supabase 분리 |
| F-12 | 자동조회 출처 라벨링 | UI 측 변경 |
| F-13 | 증자·합병 1개월 내 발생 시 기간 조정 (상증령 §52의2②) | `averages.ts` 분기 추가 |
| F-14 | K-OTC 등록 비상장주식 시세 출처 통합 | 별도 TR 또는 KRX 외 출처 |
| D-1 | (mini-PR) `§163⑨` → `§99①3` 인용 정정 | 본 도메인 무관, 기존 4파일 주석 |
