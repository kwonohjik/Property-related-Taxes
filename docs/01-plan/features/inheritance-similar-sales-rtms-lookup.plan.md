# Plan — 아파트 유사매매사례가액 RTMS 자동조회

> 작성일: 2026-06-13  
> 관련 설계: `docs/02-design/features/inheritance-similar-sales-rtms-lookup.engine.design.md`  
> UI 설계: `docs/02-design/features/inheritance-similar-sales-rtms-lookup.ui.design.md` (UI 시니어 담당)

---

## 1. 배경 및 목표

### 1.1 현황

`EstateItem.similarSalesValue` (타입: `number | undefined`, Zod: `z.number().nonnegative().optional()`)는 사용자가 금액을 직접 입력한다.  
`resolveValuationMethod` (`property-valuation.ts:58-64`)가 `similarSalesValue > 0` 이면 `"similar_sales"` 로 파생한다.

### 1.2 목표

같은 아파트 단지의 유사 동·호 실거래가를 국토교통부 RTMS(실거래가 공개시스템 API)로 자동조회하여, 사용자가 수동으로 입력 보조로 제공한다.  
엔진의 `resolveValuationMethod` / `resolveValuationAmount` 로직은 건드리지 않는다. 자동조회는 순수하게 `similarSalesValue` 필드에 값을 채워주는 "입력 보조"다.

### 1.3 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-13)

| 조문 | 내용 | 출처 |
|------|------|------|
| 상증령 §49①1호 | 해당 재산 매매가액: 매매계약일 기준 평가기간 내 | MST 283637 §49① |
| 상증령 §49①1호가목 | 특수관계인 거래 등 객관적으로 부당한 거래가 제외 | 상동 |
| 상증령 §49②1호 | 시가 가액이 둘 이상이면 평가기준일 가장 가까운 날 적용. 가액이 둘 이상이면 평균 | 상동 |
| 상증령 §49②단서 | 해당 재산 매매가액이 있으면 §49④ 유사 재산 시가 배제 | 상동 |
| 상증령 §49④ | "재정경제부령으로 정하는 해당 재산과 면적·위치·용도·종목 및 기준시가가 동일하거나 유사한 다른 재산"의 가액을 시가로 본다 | 상동 |
| 상증령 §49①(본문) | 평가기간: 상속 — 전후 6개월 / 증여 — 전 6개월~후 3개월 | 상동 |
| 시행규칙 §15③1호 | 공동주택 유사재산 3요건: ①동일 공동주택단지 ②전용면적 차이 ±5% 이내 ③공동주택가격 차이 ±5% 이내 | MST 284609 §15③ |
| 시행규칙 §15③1호단서 | 둘 이상인 경우 공동주택가격 차이가 가장 작은 주택 적용 | 상동 |

**평가기간 상세** (상증령 §49① 본문, KoreanLaw 검증):
- 상속: 상속개시일(사망일) 전후 각 6개월
- 증여: 증여일 전 6개월 ~ 증여일 후 3개월

---

## 2. 범위

### 2.1 In-Scope

- `category === "real_estate_apartment"` 인 자산에 한정
- RTMS API 프록시 라우트 신설: `app/api/address/apt-trade/route.ts`
- 순수 필터 함수 신설: `lib/calc/rtms-similar-sales-filter.ts`
- 신규 env: `MOLIT_RTMS_API_KEY`
- `EstateItem` 타입에 메타 필드 추가: `similarSalesSource?`, `similarSalesCandidates?`
- Zod `baseItemSchema` 확장 (신규 필드)
- 클라이언트 헬퍼: `lib/calc/rtms-lookup.ts` (Dexie 캐시 7일 TTL)

### 2.2 Out-of-Scope

- 아파트 외 자산(토지, 단독주택, 건물 등) RTMS 조회
- 임대차 거래(전세/월세) 조회 (매매 전용)
- RTMS 응답에서 공시가격 자동조회 (후보별 vworld 재조회 — Phase 2 과제, 아래 §4.2 케이스 매트릭스 참고)
- 자동 단정·자동 채움 (후보 리스트 반환, 최종 선택은 사용자)
- 특수관계인 자동 판별 (수동 경고만)

---

## 3. 현행 코드 anchor (실측 완료)

| 위치 | 확인 내용 |
|------|----------|
| `lib/tax-engine/types/inheritance-gift.types.ts:92` | `EstateItem.similarSalesValue?: number` |
| `lib/validators/estate-item-schema.ts:23` | `similarSalesValue: z.number().nonnegative().optional()` |
| `lib/tax-engine/property-valuation.ts:58-64` | `resolveValuationMethod`: `similarSalesValue > 0` → `"similar_sales"` |
| `lib/tax-engine/property-valuation.ts:185-218` | `evaluateApartment` — `resolveValuationAmount` → `applyCollateralFloor` |
| `app/api/address/standard-price/route.ts:110-158` | `callNedAllPages` 패턴 (전체 페이지 수집) |
| `app/api/address/standard-price/route.ts:71-88` | `getLegalDongCode` (vworld addr API) |
| `lib/calc/vworld-reverse-geocode.ts:58-126` | Dexie 캐시 7일 TTL + error 객체 fallback 패턴 |

---

## 4. 핵심 설계 결정사항

### 4.1 외부 API 선택

| 항목 | 결정 |
|------|------|
| API | 국토교통부 실거래가 공개시스템 (공공데이터포털) |
| 엔드포인트 | `http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` |
| 파라미터 | `LAWD_CD`(법정동코드 앞 5자리) + `DEAL_YMD`(YYYYMM) + `serviceKey` |
| env 변수 | `MOLIT_RTMS_API_KEY` (vworld와 별도 발급) |
| 미설정 시 | 자동조회 버튼 비활성, 수동입력 유지 (기존 env graceful 통과 패턴 동일) |
| 무료 쿼터 | 개발계정 일 10,000건 |
| 거래금액 단위 | 응답값 "만원" 단위 → 원 환산 시 `× 10,000` |

### 4.2 공시가격 ±5% 비교 — 케이스 매트릭스 (가장 까다로운 부분)

시행규칙 §15③1호다목: 공동주택가격 차이 ±5% 이내. 대상 아파트 공시가격은 vworld standard-price API로 이미 조회 가능 (`EstateItem.standardPrice`). **문제: RTMS 응답에 공시가격 없음 → 후보별 공시가격을 어떻게 확보하는가.**

| 케이스 | 상황 | 처리 방법 | 비고 |
|--------|------|-----------|------|
| **A. 대상 공시가격 미입력** | `standardPrice` undefined | 공시가격 필터 건너뜀. 면적 ±5%만 적용. 결과에 경고: "공동주택가격 미입력 — §15③1호다목 공시가격 ±5% 필터 미적용" | 보수적 운용 — 필터 완화 |
| **B. 대상 공시가격 입력, 후보 공시가격 미확보 (Phase 1)** | `standardPrice` 있음, RTMS에 공시가격 없음 | 후보별 공시가격 조회 생략. 면적 ±5%만 적용 + 경고: "공시가격 ±5% 필터 미적용 (후보 공시가격 미확보). 직접 확인 권장." | Phase 1 현실적 절충 |
| **C. 후보별 vworld 재조회 (Phase 2)** | Phase 2 과제 — 각 후보 동·호별 PNU 구성 후 vworld 공동주택가격 조회 | 캐시 활용 최적화 필요. 네트워크 N×요청 비용 | Phase 1 Out-of-Scope |
| **D. 단지명 + 면적만 매칭 후 표시** | Phase 1 기본 동작 | 단지명 일치 + 전용면적 ±5% 후보 반환. 결과 카드에 "공시가격 필터: 미적용" 명시 | Phase 1 |

**Phase 1 결정**: 공시가격 ±5% 필터는 Phase 1에서 **소프트(경고) 적용** — 대상 `standardPrice`가 있으면 필터 적용, 없으면 경고만. 후보별 공시가격은 Phase 2에서 vworld 재조회로 구현.

### 4.3 자동 단정 금지 원칙

엔진·필터는 후보 리스트를 반환한다. §49② 가장 가까운 날 기준 추천값 1건을 `recommendedValue`로 노출하되, 최종 채움은 사용자가 UI에서 선택 버튼으로 수행한다.

### 4.4 특수관계인 경고

§49①1호가목: 특수관계인 거래는 시가 인정 제외. RTMS 응답에 거래 당사자 정보 없음 → 자동 판별 불가. 조회 결과 카드 하단에 고정 경고: "특수관계인 간 거래(상증령 §49①1호가목)는 시가 인정 제외입니다. 직접 확인 필요."

---

## 5. 케이스 매트릭스 — 필터 분기 전수

### 5.1 평가기간 필터 (§49①·§49②)

| 거래유형 | 평가기준일 | 매매계약일 유효 범위 | 비고 |
|---------|-----------|---------------------|------|
| 상속 | 사망일 | 사망일 -6개월 ~ +6개월 | §49①1호 기준일: 매매계약일 |
| 증여 | 증여일 | 증여일 -6개월 ~ +3개월 | §49①1호·② |

### 5.2 면적 ±5% 필터 (시행규칙 §15③1호나목)

| 케이스 | 조건 | 통과 |
|--------|------|------|
| F-A | `|후보.전용면적 - 대상.전용면적| / 대상.전용면적 × 100 ≤ 5` | 통과 |
| F-B | 초과 | 제외 |
| F-C | 대상 전용면적 미입력 (`undefined`) | 면적 필터 건너뜀 + 경고 |
| F-D | 후보 전용면적 0 또는 없음 | 제외 |

### 5.3 공시가격 ±5% 필터 (시행규칙 §15③1호다목)

| 케이스 | 대상 `standardPrice` | 후보 공시가격 | 처리 |
|--------|---------------------|-------------|------|
| G-A | 있음 | 있음 (Phase 2) | `|후보가격 - 대상가격| / 대상가격 × 100 ≤ 5` 통과/제외 |
| G-B | 있음 | 없음 (Phase 1) | 경고만 — 결과에 포함 |
| G-C | 없음 | — | 경고만 — 결과에 포함 |

### 5.4 가장 가까운 날 정렬 + 평균 (§49②)

| 케이스 | 상황 | 처리 |
|--------|------|------|
| H-A 후보 0건 | 평가기간 내 거래 없음 | `candidates: []`, `recommendedValue: null`, 경고 |
| H-B 후보 1건 | | `recommendedValue = 해당 거래가` |
| H-C 후보 다건, 가장 가까운 날 1건 | | `recommendedValue = 해당 거래가` |
| H-D 후보 다건, 가장 가까운 날 동일 거래일 복수 | | `recommendedValue = 평균` (원 미만 절사) |
| H-E 후보 다건, 서로 다른 날짜 복수 | | 전체 후보 정렬 반환. `recommendedValue = 가장 가까운 날 거래가(H-C/H-D)` |

### 5.5 단지명 매칭

| 케이스 | 처리 |
|--------|------|
| 단지명 완전일치 | 포함 |
| 단지명 공백·특수문자 정규화 후 일치 | 포함 |
| 단지명 불일치 | 제외 (LAWD_CD 동일 동내 다른 단지) |
| 단지명 없음 (RTMS 응답 누락) | 제외 |

### 5.6 기타 엣지케이스

| 케이스 | 처리 |
|--------|------|
| LAWD_CD 5자리 추출 불가 (주소 미입력) | 조회 불가 오류 반환 |
| MOLIT_RTMS_API_KEY 미설정 | `API_KEY_MISSING` 오류 — UI 버튼 비활성 |
| RTMS 응답 HTTP 오류 | `RTMS_FETCH_FAILED` 오류 + graceful fallback |
| 거래금액 0 또는 음수 | 제외 |
| 후보 거래일이 `undefined` | 평가기간 필터 제외 |

---

## 6. 단계(Phase) 계획

### Phase 1 — 기본 자동조회 (현재 설계 범위)

1. `MOLIT_RTMS_API_KEY` env 추가 + graceful 처리
2. `app/api/address/apt-trade/route.ts` — RTMS 프록시 (LAWD_CD + 다개월 수집)
3. `lib/calc/rtms-similar-sales-filter.ts` — 순수 필터 함수 (면적±5%, 평가기간, 가장가까운날)
4. `EstateItem` + Zod 타입 확장 (`similarSalesSource`, `similarSalesCandidates`)
5. `lib/calc/rtms-lookup.ts` — 클라이언트 헬퍼 + Dexie 캐시
6. UI: "유사매매사례 자동조회" 버튼 → 후보 리스트 모달 → 선택 시 `similarSalesValue` 채움 (UI 시니어 담당)
7. 경고 표시: 특수관계인, 공시가격 필터 미적용, 후보 0건 등

### Phase 2 — 공시가격 ±5% 자동 적용

- 후보별 vworld standard-price 재조회 (단지 내 동·호별 PNU 구성)
- `filterSimilarSales` 함수에 `targetStandardPrice` + 후보 공시가격 배열 연동
- 캐시 최적화 (단지별 일괄 캐시)

---

## 7. 리스크

| 리스크 | 대응 |
|--------|------|
| RTMS 공공데이터포털 API 일 쿼터 초과 | Dexie 캐시 7일 TTL — 동일 `LAWD_CD`+`DEAL_YMD` 재조회 차단 |
| 단지명 표기 불일치 (공백, 특수문자) | 정규화(공백·특수문자 제거) 후 비교 |
| 거래금액 만원 단위 환산 오류 | `× 10_000` (정수) — `parseAmount` 등 소수 연산 금지 |
| 평가기간 계산 오류 (월별 경계) | `date-fns addMonths` 사용. `lib/api/date-coerce.ts` 패턴 준수 |
| RTMS에 공시가격 없어 §15③1호다목 불완전 적용 | Phase 1: 경고 표시. Phase 2: vworld 재조회 |
| 특수관계인 거래 포함 위험 | 고정 경고 UI, 자동 배제 불가 명시 |

---

## 8. 열린 질문

1. **단지명 추출**: `EstateItem.name`(사용자 입력 자산명) vs 별도 단지명 필드(`aptComplexName?`) — 사용자가 표준명을 모를 수 있음. RTMS 응답의 `aptNm`(단지명)과 비교하는 기준을 어떻게 제공할 것인가? (Phase 1: 조회 시 RTMS 응답 단지명 목록에서 선택 UI로 해결)
2. **LAWD_CD 5자리 추출**: `estateAddress.jibun` 또는 vworld 역지오코딩 결과의 법정동코드 10자리에서 앞 5자리 슬라이싱 — 기존 `getLegalDongCode` 함수 재사용 가능 여부 (route-to-route 직접 호출 금지, 공통 유틸 분리 필요).
3. **다개월 수집 범위**: 평가기간 최대 12개월(상속 ±6개월) → 최대 13개월치 RTMS 월별 호출. 캐시가 없으면 최대 13회 요청. 프록시에서 병렬 fetch 여부 결정 필요.

---

## 9. 계약 정합성 교차 검토 및 조정 결정 (BINDING — Do 단계 단일 진실)

엔진 설계(`*.engine.design.md`)와 UI 설계(`*.ui.design.md`)를 병렬 작성한 결과 10건의 계약 발산이 확인되었다. 아래 결정이 두 설계 문서보다 **우선**한다. 두 문서에서 본 부록과 충돌하는 서술은 본 부록 기준으로 구현한다.

검토 방법: 두 설계 문서 실측 비교 + 법령(시행규칙 §15③1호다목 MST 284609) 재확인.

### 9.1 결정 표

| # | 항목 | 엔진 설계 | UI 설계 | **조정 결정** | 근거 |
|---|------|-----------|---------|--------------|------|
| D1 | 거래금액 필드명 | `dealAmountWon`(원) | `dealAmount`(원) | **`dealAmountWon`**(원, 정수) | 단위 명시(만원 혼동 차단). 둘 다 원 단위 합의 — 명칭만 통일 |
| D2 | 라우트 응답 envelope | `AptTradeRouteResponse{trades, months, errors?}` \| `{error}` | `RtmsAptTradeResponse{success, records, configMissing?}` | **`{ success, records, configMissing?, error?, months? }`** (UI envelope 채택 + `records: RtmsTradeRecord[]`) | UI가 `configMissing`로 버튼 비활성 판단 필요. 레코드 타입은 엔진 `RtmsTradeRecord` 채택 |
| D3 | 라우트 요청 파라미터 | `lawdCd + baseDate + taxType`(스마트: 라우트가 다개월 자동 산출) | `sigunguCode + year + month`(덤브: 단일 월) | **`?lawdCd&baseDate&taxType`** (엔진 스마트 라우트 채택) | 1회 호출로 평가기간 전체 수집·부분성공(`Promise.allSettled`). `lawdCd = sigunguCode.slice(0,5)`는 Mediator가 파생. `aptName`은 라우트 미사용(필터 함수가 처리) |
| D4 | 순수 필터 함수명 | `filterSimilarSales` | `filterSimilarSalesLocal`(혼재) | **`filterSimilarSales`** | 단일 명칭. `filterSimilarSalesLocal` 폐기 |
| D5 | 파일 구성 | `rtms-lookup.ts`(fetch) + `rtms-similar-sales-filter.ts`(순수) | `rtms-similar-sales-lookup.ts`(all-in-one) | **3파일**: ①`app/api/address/apt-trade/route.ts`(프록시) ②`lib/calc/rtms-similar-sales-filter.ts`(순수 필터+rank+average) ③`lib/calc/rtms-similar-sales-lookup.ts`(Mediator: fetch+Dexie 캐시, ②를 import) | 순수 필터 분리(테스트 용이) + Mediator 명칭은 UI 채택. 엔진의 `rtms-lookup.ts` 명칭 폐기 |
| D6 | env 변수명 | `MOLIT_RTMS_API_KEY` | `RTMS_SERVICE_KEY` | **`MOLIT_RTMS_API_KEY`** | 국토부 출처 명시. `.env.local.example` 1곳만 등록 |
| **D7** | **공시가격 ±% 임계** | **±5%**(시행규칙 §15③1호다목 정확) + Phase 1 미적용·경고 | **±20%**(추정값) | **±5%** (UI ±20% 폐기) + Phase 1 미적용·경고만 | **법령 정확성 — §15③1호다목은 공동주택가격 차이 ≤ 5%. ±20%는 법적 근거 없음. RTMS에 후보 공시가격 부재 → Phase 1은 필터 미적용·경고, Phase 2에서 vworld 재조회로 ±5% 적용** |
| D8 | `EstateItem` 신규 필드 수 | 2개(`similarSalesSource` + `similarSalesCandidates`) | 1개(`similarSalesSource`) | **1개**(`similarSalesSource?: "manual" \| "rtms_auto"`) | `similarSalesCandidates`는 엔진 미소비 + sessionStorage/DB 비대화. 후보 재표시는 Dexie `rtmsSalesCache`(거래 원본)로 충분 → 모달 재개 시 `filterSimilarSales` 재실행. EstateItem에 후보 배열 영속 금지 |
| D9 | 필터 criteria `targetAptName` | 있음(`targetAptName`) | **누락** | **필수 포함** (`SimilarSalesFilterCriteria.targetAptName`) | 단지명 정규화 비교가 필터 핵심. UI criteria 누락은 갭 — 추가 |
| D10 | criteria 날짜 타입 | `valuationDate: string`("YYYY-MM-DD") | `evaluationDate: Date` | **`valuationDate: Date`** (명칭 엔진, 타입 UI) | 순수 클라이언트 함수이므로 `Date` 안전. 라우트 경유 없음 → date-coerce 불필요. 필드명 `valuationDate`로 통일 |

### 9.2 확정 계약 타입 (Do 단계 기준)

```typescript
// lib/calc/rtms-similar-sales-filter.ts
export interface RtmsTradeRecord {
  aptName: string;
  dealDate: string;          // "YYYY-MM-DD" (매매계약일, §49②1호)
  exclusiveAreaM2: number;   // 전용면적(㎡)
  dealAmountWon: number;     // 거래금액(원, 만원×10_000 정수)
  floor: number;
  buildYear: number;
  jibun: string;
  lawdCd: string;            // 5자리
}

export interface SimilarSalesFilterCriteria {
  targetAptName: string;            // D9 — 필수
  targetExclusiveAreaM2?: number;   // 미입력 시 면적필터 skip + 경고
  targetStandardPrice?: number;     // Phase 1: 경고만(후보 공시가격 부재). Phase 2: ±5% 적용
  valuationDate: Date;              // D10
  taxType: "inheritance" | "gift";
}

export interface SimilarSalesCandidate {
  trade: RtmsTradeRecord;
  daysFromValuationDate: number;    // 절대 일수
  areaDiffRatePct: number;          // |후보-대상|×100/대상
  stdPriceDiffRatePct?: number;     // Phase 1: undefined
  isWithinPeriod: boolean;
  isRecommended: boolean;           // §49② 가장 가까운 날
}

export interface SimilarSalesFilterResult {
  candidates: SimilarSalesCandidate[];   // 단지명+기간+면적±5% 통과
  outOfPeriod: SimilarSalesCandidate[];  // 기간 외(참고)
  recommendedValue: number | null;       // §49② 가장 가까운 날(복수 시 평균, floor)
  appliedCriteria: { areaMin: number; areaMax: number; periodStart: string; periodEnd: string };
  stdPriceFilterApplied: boolean;        // Phase 1: false
  warnings: string[];                    // 면적/공시가격 미적용·특수관계·후보0건
}

// app/api/address/apt-trade/route.ts 응답 (D2)
export interface RtmsAptTradeResponse {
  success: boolean;
  records: RtmsTradeRecord[];
  months?: string[];
  configMissing?: boolean;   // env 미설정 → 버튼 비활성
  error?: string;
}
```

### 9.3 확정 파일 목록 (D5)

| 파일 | 레이어 | 담당 |
|------|--------|------|
| `app/api/address/apt-trade/route.ts` | API 프록시 (`?lawdCd&baseDate&taxType`, 다개월 `Promise.allSettled`, 만원→원, env graceful `configMissing`) | 엔진 |
| `lib/calc/rtms-similar-sales-filter.ts` | 순수 함수 (`filterSimilarSales` + rank + average, 정수연산) | 엔진 |
| `lib/calc/rtms-similar-sales-lookup.ts` | Mediator (fetch + Dexie 캐시 `rtms_${lawdCd}_${baseDate}_${taxType}`, `filterSimilarSales` import) | UI |
| `components/calc/.../RtmsSimilarSalesModal.tsx` 외 (Button·Badge) | UI 위젯 | UI |
| `__tests__/.../similar-sales-filter.test.ts` | T-1~T-8 anchor (±5% 경계 포함) | 엔진 |

**기존 수정**: `EstateItem`(+`similarSalesSource` **1필드만**) · `estate-item-schema.ts`(baseItemSchema +1필드, **`similarSalesCandidates` 추가 안 함**) · `legal-codes/inheritance-gift.ts`(VALUATION +5상수, **±5% 근거는 §15③1호다목**) · `lib/storage/db.ts`(`rtmsSalesCache` 테이블 + version↑) · `.env.local.example`(`MOLIT_RTMS_API_KEY`).

### 9.4 Pre-Do anchor (구현 착수 전 1건 우선)

`single-source-engine-helper`·`pre-do-anchor-verification` 정책: Do 진입 전 `filterSimilarSales` T-4(면적 ±5% 경계: 89.09㎡ 통과 / 89.19㎡ 제외) anchor를 먼저 작성·실행해 ±5% 산식과 "가장 가까운 날" 정렬을 환류 검증한다. ±20%(폐기) 흔적이 남지 않았는지 grep 확인.

---

## 10. 2차 설계 검토 — 추가 정정 (BINDING, §9에 보충)

1차 검토(§9)는 엔진↔UI 계약 발산을 다뤘다. 2차는 **각 문서 내부의 오류·누락·구현 함정**을 적대적으로 점검한 결과다. 실측 근거를 병기한다.

### 10.1 신규 실질 결함 (구현 전 반드시 반영)

| # | 결함 | 실측 근거 | **정정 결정 (BINDING)** |
|---|------|-----------|------------------------|
| **P1. 잘못된 법령 인용 (법령 정확성)** | UI 초안 §0에 "시행규칙 §15① 공시가격 **±20%**(§15의3 준용)" — 법적 근거 없는 인용 | KoreanLaw MST 284609 §15③1호다목 = **±5%**(엔진·재검토 2회 독립 확인) | UI §0 정정 완료. **legal-codes 상수·코드 주석·결과 카드 어디에도 ±20%/§15① 금지.** 공동주택가격 임계는 §15③1호다목 ±5% 단일 |
| **P2. RTMS 페이지네이션 누락 (데이터 유실)** | 엔진 §3.1이 `numOfRows=100&pageNo=1`만 — 루프 없음. LAWD_CD는 **시군구(구) 전체** 거래 반환 → 한 달 수백~수천 건 가능 | `standard-price/route.ts:110-158 callNedAllPages`는 전체 페이지 수집 루프 보유 | apt-trade 라우트는 **월별 전체 페이지 수집**(`callNedAllPages` 패턴 차용, `numOfRows=1000` + totalCount까지 루프). 100건 단발 호출 금지 |
| **P3. 단지 식별 불충분 (동명 단지 오매칭)** | 필터 §5 Step5가 `normalizeAptName`만 비교. LAWD_CD=시군구 범위라 **같은 구 내 동일 단지명**(예: "래미안")이 다른 동에 존재 가능 | RTMS raw에 `umdNm`(읍면동)·`jibun` 존재(엔진 §3.2). 필터는 미사용 | 필터 매칭에 **`umdNm`(읍면동) 일치 추가**, 가능 시 `jibun` 보조. §15③1호가목 "동일한 공동주택단지" 정밀화. criteria에 `targetUmdNm?`·`targetJibun?` 추가 |
| **P4. 면적 필드 의미 미확정** | UI가 `item.areaSqm`을 `targetExclusiveAreaM2`로 전달. `areaSqm`은 범용 "area in sqm" — 전용/공급 미구분 | `inheritance-gift.types.ts:251 areaSqm?: number`(주석 없음) | 아파트 ±5% 비교는 **전용면적** 기준(RTMS `excluUseAr`=전용). UI 위젯에 "전용면적(㎡)" 라벨 + hint 명시. `areaSqm`이 전용면적임을 보장하지 못하면 별도 전용면적 입력 안내. Do에서 의미 확정 |
| **P5. env 감지 메커니즘 미정** | UI §5.5는 `/api/address/apt-trade?healthcheck=1` 제안, 엔진 §4.6은 키 없으면 **HTTP 500 `API_KEY_MISSING`** 반환 — 둘 다 §9 D2 `configMissing` envelope와 불일치 | 엔진 §4.6 vs UI §5.5 vs §9 D2 3중 불일치 | **env 미설정 = HTTP 200 + `{success:false, configMissing:true}`**(에러 아님). 버튼은 주소 있으면 활성, 클릭 후 `configMissing`이면 모달에 안내. `healthcheck` 파라미터·500 에러 폐기. (별도 사전감지 불필요 — lazy) |
| **P6. 평가일·세목 데이터흐름 미명시** | UI 모달이 `evaluationDate`·`mode`를 받으나, 자산-카드(`EstateBodyRealEstate`)가 폼-전역 사망일/증여일·taxType에 접근하는 경로 미서술 | `EstateBodyRealEstate.tsx:39`는 `VariantBodyProps`(types)만 수신 — date/mode 미포함 추정 | Do에서 `VariantBodyProps`에 `valuationDate`·`mode` props threading 필요 여부 grep 확인 후 추가. 자산 카드는 평가일 미보유 가능 → 상위(Step/Calculator)에서 주입 |

### 10.2 잔여 stale 참조 (본 부록이 override — 코드 작성 시 무시)

§9·§10이 BINDING이며, 아래 초안 서술은 **본 부록 기준으로 구현**한다(문서 본문 미수정, 혼동 방지용 명시):

- **필드 수**: 본문 §2.1·§3·§6(Phase1 step4)·엔진 §6에 `similarSalesCandidates` 잔존 → **무효**(§9 D8: `similarSalesSource` 1필드만).
- **파일명**: 본문 §2.1·§6.5의 `lib/calc/rtms-lookup.ts` → **무효**(§9 D5: Mediator `rtms-similar-sales-lookup.ts` + 순수 `rtms-similar-sales-filter.ts`).
- **함수명**: UI `filterSimilarSalesLocal` → **무효**(§9 D4: `filterSimilarSales`).
- **env명**: UI §5.5 disabledReason 문자열·§8.3의 `RTMS_SERVICE_KEY` → **무효**(§9 D6: `MOLIT_RTMS_API_KEY`). 사용자 노출 문자열도 교체.
- **공시가격 임계**: UI §3 와이어프레임·§6.2 ±20% 표기 → **무효**(§9 D7·§10 P1: ±5%). 와이어프레임 "공시가격차이 %" 배지는 Phase 2에서만 의미.
- **캐시 키**: 엔진 §7.1 `lawdCd:dealYmd`(per-month) vs UI §7 `pnu_YYYY_MM` → **무효**(§9 D5: Mediator `rtms_${lawdCd}_${baseDate}_${taxType}` 기간 단위). 단, P2 페이지네이션은 라우트 내부 처리이므로 캐시는 기간 응답 전체 1엔트리.

### 10.3 적정 확인 (검토 결과 문제 없음 — 변경 불요)

- 거래금액 "만원" 단위 → `×10_000` 정수 환산: RTMS 관례 정확. ✓
- `getRTMSDataSvcAptTradeDev`(상세) 엔드포인트: 등기일·거래유형 포함 상세본 — 적절. ✓ (단 https 사용)
- 평가기간 `addMonths` 계산(180일 아님): 월 경계 정확. 테스트 주석의 "~180일"은 비유 표현일 뿐 구현은 `addMonths`. ✓
- 자동 단정 금지(추천만, §15③1호단서 공시가격-최소 tie-break은 Phase 2): "추천≠법적 최종선택, 사용자 확정" 원칙으로 Phase 1 date-기준 추천 허용. ✓

### 10.4 Do 진입 게이트 (갱신)

§9.4 anchor에 추가: 구현 착수 전 grep 확인 — ①`±20%`/`§15①`/`§15의3` 흔적 0건 ②`similarSalesCandidates` 미생성 ③`RTMS_SERVICE_KEY` 미사용(`MOLIT_RTMS_API_KEY`만) ④`areaSqm` 전용면적 의미 ⑤`VariantBodyProps` date/mode threading.

---

## 11. 3차 설계 검토 — 법령 적용 심화 + RTMS 데이터 함정 (BINDING)

3차는 **법령 적용의 깊은 정합성**과 **RTMS 데이터 자체의 함정**을 점검했다. 실측·법령 본문 근거 병기.

### 11.1 신규 결함 (구현 전 필수 반영)

| # | 결함 | 근거 | **정정 결정 (BINDING)** |
|---|------|------|------------------------|
| **P7. §49④ 신고일 절단 미반영 (법령)** | 평가기간을 일률적으로 "상속 전후 6개월/증여 전6~후3개월"로 설계(§2.1). 그러나 §49④ 본문 괄호: 유사재산 가액은 **"신고한 경우에는 평가기준일 전 6개월부터 평가기간 이내의 신고일까지의 가액"** — 신고 후 거래는 유사사례에서 배제 | KoreanLaw MST 283637 §49④ 괄호(retrieve 완료): `[법 제67조·제68조에 따라 신고한 경우에는 평가기준일 전 6개월부터 제1항 평가기간 이내의 신고일까지의 가액]` | 필터 criteria에 **`reportDate?`(신고일) optional 입력** 추가. 있으면 평가기간 상한을 `min(평가기준일+기간상한, 신고일)`로 절단. 계산기는 통상 신고 전 시뮬레이션 → **미입력 시 전체 기간**(기본). UI에 "신고일(선택 — 입력 시 이후 거래 배제)" 안내 |
| **P8. 해제(취소)거래 미배제 (시가 오류)** | §3.2 `RtmsRawItem`에 해제 필드 없음 → 계약 해제된 거래가 유사매매사례로 혼입. 해제거래는 시가 아님 | 엔진 §3.2 실측(해제 필드 부재). RTMS 상세(Dev) 응답은 해제여부·해제사유발생일 제공(2021 허위신고 대응 추가) | RtmsRawItem에 **`cdealType`(해제여부, 해제 시 "O")·`cdealDay`(해제사유발생일)** 추가. 필터 1순위로 **`cdealType === "O"` 거래 제외**. ⚠️ 정확한 필드명은 공공데이터포털 기술문서(.hwp) Do 단계 확인 — 단 "해제거래 배제" 요건 자체는 법적 확정 |
| **P9. 직거래 플래그 미활용 (경고 정밀도)** | `dealingGbn`(중개/직거래)이 §3.2 raw엔 있으나 §3.3 `RtmsTradeRecord`에서 누락 → 직거래(특수관계 개연성↑)를 경고에 활용 불가 | 엔진 §3.2:94 `dealingGbn?` 존재, §3.3:102-112 정규화 타입에서 탈락 | `RtmsTradeRecord`에 **`dealingType?: "중개"|"직거래"|"기타"`** 보존. 직거래 후보 행에 §49①1호가목 특수관계 경고 배지 **개별 강조**(전역 고정 경고에 더해) |
| **P10. §49② 전후 등거리 처리 미명시** | "가장 가까운 날" 정렬에서 평가기준일 전 N일·후 N일 거래가 동시 존재(등거리) 시 처리 불명 | §49② "평가기준일을 전후하여 가장 가까운 날에 해당하는 가액(그 가액이 둘 이상인 경우 평균액)" | 등거리(|일수| 동일) 전·후 거래는 **모두 "가장 가까운 날"로 보아 평균**. 정렬 키는 `Math.abs(일수차)` 단일, 동일 키 그룹 전체를 추천군으로 평균(원 미만 절사) |

### 11.2 적정 확인 (3차 — 문제 없음)

- **평가기준일 전 2년 확대(§49① 단서)**: 평가심의위원회 심의 사항 → 자동화 불가, 6개월/3개월 기본창만 적용하는 보수적 설계 정확. ✓
- **PII**: RTMS 상세는 거래 당사자 인적정보 미포함(지번까지) → IndexedDB 캐시 개인정보 이슈 없음(공개데이터). ✓
- **쿼터×페이지네이션**: P2 전체수집으로 1회 조회가 13개월×수 페이지 → 일 10,000건 소모 가속. **§9 D5 기간단위 캐시(7일)가 필수 완화책** — 캐시 제거 금지. 조회 월 범위를 실제 평가기간으로 최소화. ✓(설계 유지)
- **엔드포인트 https**: §3.1 `http://` → Do에서 `https://apis.data.go.kr` 사용. (경미)

### 11.3 Do 진입 게이트 (§10.4에 추가)

- ⑥ 필터에 `cdealType==="O"` 해제거래 제외 (P8)
- ⑦ criteria `reportDate?` 신고일 절단 분기 (P7) — 미입력 시 전체 기간
- ⑧ `dealingType` 정규화 보존 + 직거래 행 경고 (P9)
- ⑨ "가장 가까운 날" 정렬 `Math.abs(일수차)` + 등거리 평균 (P10)
