# 엔진/데이터 설계 — 아파트 유사매매사례가액 RTMS 자동조회

> 상위 계획: `docs/01-plan/features/inheritance-similar-sales-rtms-lookup.plan.md`  
> 법령 검증: KoreanLaw MCP (MST 283637 상증령 §49, MST 284609 시행규칙 §15③ — 2026-06-13 실측)  
> 코드 anchor: 실측 완료 (아래 §1)  
> UI 설계: `docs/02-design/features/inheritance-similar-sales-rtms-lookup.ui.design.md` (UI 시니어 별도 작성)

---

## 1. 코드 Anchor (실측)

| 위치 | 내용 |
|------|------|
| `lib/tax-engine/types/inheritance-gift.types.ts:92` | `EstateItem.similarSalesValue?: number` |
| `lib/validators/estate-item-schema.ts:23` | `similarSalesValue: z.number().nonnegative().optional()` |
| `lib/tax-engine/property-valuation.ts:58-64` | `resolveValuationMethod` — `similarSalesValue > 0` → `"similar_sales"` |
| `lib/tax-engine/property-valuation.ts:185-218` | `evaluateApartment` |
| `app/api/address/standard-price/route.ts:110-158` | `callNedAllPages` 패턴 |
| `app/api/address/standard-price/route.ts:71-88` | `getLegalDongCode` |
| `app/api/address/standard-price/route.ts:90-104` | `buildPnu` |
| `lib/calc/vworld-reverse-geocode.ts:19` | `CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000` |
| `lib/calc/vworld-reverse-geocode.ts:58-126` | Dexie 캐시 + error 객체 fallback 패턴 |

---

## 2. 법령 근거 (확정)

### 2.1 평가기간 (상증령 §49① 본문, MST 283637)

```
상속: 평가기준일(사망일) 전후 6개월
증여: 평가기준일(증여일) 전 6개월 ~ 후 3개월
기준일 판단: 매매계약일 (§49②1호)
```

### 2.2 유사재산 요건 (시행규칙 §15③1호, MST 284609)

```
공동주택가격이 있는 공동주택의 유사재산 3요건:
  가. 동일한 공동주택단지(공동주택관리법상 단지) 내
  나. 주거전용면적 차이 ≤ 대상 주거전용면적 × 5%
  다. 공동주택가격 차이 ≤ 대상 공동주택가격 × 5%
  [단서] 둘 이상인 경우: 공동주택가격 차이가 가장 작은 주택
```

### 2.3 가장 가까운 날 + 평균 (상증령 §49②)

```
시가로 보는 가액이 둘 이상 → 평가기준일 전후 가장 가까운 날에 해당하는 가액
해당 날짜 가액이 둘 이상 → 평균액
단서: 해당 재산의 매매가액(§49①1호) 있으면 §49④ 유사재산 가액 배제
```

### 2.4 특수관계인 거래 배제 (상증령 §49①1호가목)

```
특수관계인과의 거래 등으로 그 거래가액이 객관적으로 부당하다고 인정되는 경우 제외
```

---

## 3. RTMS API 계약

### 3.1 요청

```
GET http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
  ?serviceKey={MOLIT_RTMS_API_KEY}   // URL-encoded 필요
  &LAWD_CD={5자리 법정동코드}          // 예: "11110" (종로구)
  &DEAL_YMD={YYYYMM}                  // 예: "202501"
  &numOfRows=100
  &pageNo=1
```

`LAWD_CD`: 법정동코드 10자리(vworld `getLegalDongCode` 반환값)의 앞 5자리.

### 3.2 응답 구조 (XML → JSON 변환 또는 JSON 직접)

공공데이터포털 v2 응답은 XML이 기본. 프록시에서 파싱 후 JSON 정규화.

```typescript
interface RtmsRawItem {
  aptNm: string;          // 단지명 (예: "래미안" — 표준명, 공백 포함 가능)
  dealYear: string;       // 계약년 (예: "2025")
  dealMonth: string;      // 계약월 (예: "1")
  dealDay: string;        // 계약일 (예: "15")
  excluUseAr: string;     // 전용면적 (㎡, 소수 포함 가능 예: "84.87")
  dealAmount: string;     // 거래금액 (만원 단위, 쉼표 포함 가능 예: "85,000")
  floor: string;          // 층 (예: "12")
  buildYear: string;      // 건축연도 (예: "2003")
  jibun: string;          // 지번 (예: "241")
  umdNm: string;          // 읍면동명 (예: "사직동")
  rgstDate?: string;      // 등기일 (선택)
  dealingGbn?: string;    // 거래유형 ("중개거래"|"직거래"|"기타") — 선택
}
```

### 3.3 정규화 타입 (프록시 응답)

```typescript
/** RTMS 단건 거래 정규화 결과 */
export interface RtmsTradeRecord {
  aptName: string;           // 단지명 (정규화 전 원문)
  aptNameNormalized: string; // 단지명 (공백·특수문자 제거 후 소문자)
  dealDate: string;          // 매매계약일 "YYYY-MM-DD"
  exclusiveAreaM2: number;   // 전용면적 (㎡, 소수 2자리 반올림)
  dealAmountWon: number;     // 거래금액 (원 단위, 만원 × 10_000 정수변환)
  floor: number;             // 층
  buildYear: number;         // 건축연도
  jibun: string;             // 지번
  lawdCd: string;            // LAWD_CD (5자리)
}

/** 프록시 응답 전체 */
export interface AptTradeRouteResponse {
  lawdCd: string;
  months: string[];          // 조회한 YYYYMM 목록
  trades: RtmsTradeRecord[];
  totalCount: number;
  errors?: string[];         // 월별 조회 오류 목록 (부분 성공 허용)
}

/** 프록시 오류 */
export interface AptTradeRouteError {
  code:
    | "API_KEY_MISSING"
    | "INVALID_LAWD_CD"
    | "RTMS_FETCH_FAILED"
    | "PARSE_ERROR";
  message: string;
}
```

---

## 4. 프록시 라우트 설계 (`app/api/address/apt-trade/route.ts`)

### 4.1 GET 파라미터

```
GET /api/address/apt-trade
  ?lawdCd={5자리}          필수
  &baseDate={YYYY-MM-DD}   필수 (평가기준일)
  &taxType={inheritance|gift}  필수 (평가기간 산정용)
```

### 4.2 평가기간 → 조회 월 목록 산출

```typescript
// 상속: baseDate ±6개월 → 최대 13개월치 YYYYMM
// 증여: baseDate -6개월 ~ +3개월 → 최대 10개월치 YYYYMM
function buildQueryMonths(baseDate: Date, taxType: "inheritance" | "gift"): string[] {
  const monthsBefore = 6;
  const monthsAfter = taxType === "inheritance" ? 6 : 3;
  const months: string[] = [];
  for (let m = -monthsBefore; m <= monthsAfter; m++) {
    const d = addMonths(baseDate, m);
    months.push(format(d, "yyyyMM"));  // date-fns
  }
  return [...new Set(months)];  // 중복 제거
}
```

### 4.3 병렬 fetch + 부분 성공 허용

```typescript
// 각 YYYYMM에 대해 병렬 fetch. 실패한 월은 errors[]에 기록, 나머지 정상 반환.
const results = await Promise.allSettled(
  months.map(m => fetchRtmsMonth(lawdCd, m, apiKey))
);
```

### 4.4 거래금액 환산 (만원 → 원)

```typescript
// RTMS 응답 dealAmount: "85,000" (만원 단위, 쉼표 포함)
function parseDealAmountWon(raw: string): number {
  const manwon = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (isNaN(manwon) || manwon <= 0) return 0;
  return manwon * 10_000;  // 정수 × 정수, 오버플로 위험 없음 (max ~수십조)
}
```

주의: `parseFloat` / 소수 연산 금지. 만원 단위가 정수이므로 × 10,000은 항상 정수.

### 4.5 단지명 정규화

```typescript
function normalizeAptName(name: string): string {
  // 공백, 특수문자(괄호·점·하이픈 등) 제거 후 소문자
  return name.replace(/[\s\-().·,]/g, "").toLowerCase();
}
```

### 4.6 env 미설정 처리

```typescript
const apiKey = process.env.MOLIT_RTMS_API_KEY;
if (!apiKey) {
  return NextResponse.json(
    { error: { code: "API_KEY_MISSING", message: "MOLIT_RTMS_API_KEY가 설정되지 않았습니다." } },
    { status: 500 },
  );
}
```

---

## 5. 순수 필터 함수 (`lib/calc/rtms-similar-sales-filter.ts`)

**설계 원칙**: DB·fetch 없음. 입력 → 출력 순수 함수. 정수 연산. `Math.round` 금지.

### 5.1 입력 타입

```typescript
export interface SimilarSalesFilterInput {
  /** 대상 아파트 단지명 (정규화 전) */
  targetAptName: string;
  /** 대상 전용면적 (㎡) — undefined 시 면적 필터 건너뜀 + 경고 */
  targetExclusiveAreaM2?: number;
  /** 대상 공동주택 공시가격 (원) — undefined 시 공시가격 필터 건너뜀 + 경고 */
  targetStandardPrice?: number;
  /** 평가기준일 (ISO 날짜 문자열 "YYYY-MM-DD") */
  valuationDate: string;
  /** 세목 — 평가기간 산정 */
  taxType: "inheritance" | "gift";
  /** RTMS 조회 결과 전체 */
  trades: RtmsTradeRecord[];
}
```

### 5.2 출력 타입

```typescript
export interface SimilarSalesCandidate {
  trade: RtmsTradeRecord;
  /** 평가기준일로부터 매매계약일까지 절대 일수 (가장 가까운 날 정렬 기준) */
  daysFromValuationDate: number;
  /** 면적 차이 비율 (%) — 소수 2자리, 정수 연산: |후보-대상| * 100 / 대상 */
  areaDiffRatePct: number;
  /** 공시가격 차이 비율 (%) — targetStandardPrice 없으면 undefined */
  stdPriceDiffRatePct?: number;
  /** §15③1호 3요건 충족 여부 */
  passesAllFilters: boolean;
}

export interface SimilarSalesFilterResult {
  candidates: SimilarSalesCandidate[];
  /** §49② 가장 가까운 날 기준 추천값 (원). 후보 없으면 null */
  recommendedValue: number | null;
  /** §15③1호 최종 선택: 공시가격 차이 가장 작은 주택 (단서 적용) */
  bestByStdPrice?: SimilarSalesCandidate;
  warnings: string[];
  /** 공시가격 필터 적용 여부 */
  stdPriceFilterApplied: boolean;
}
```

### 5.3 핵심 알고리즘

```typescript
export function filterSimilarSales(
  input: SimilarSalesFilterInput,
): SimilarSalesFilterResult {
  const warnings: string[] = [];
  const valuationDateObj = new Date(input.valuationDate);

  // ── Step 1: 평가기간 산출 ─────────────────────────────
  const periodStart = addMonths(valuationDateObj, -6);  // 상속·증여 공통
  const periodEnd = addMonths(
    valuationDateObj,
    input.taxType === "inheritance" ? 6 : 3,
  );

  // ── Step 2: 단지명 정규화 ──────────────────────────────
  const targetNameNorm = normalizeAptName(input.targetAptName);

  // ── Step 3: 면적 필터 준비 ────────────────────────────
  const hasTargetArea = input.targetExclusiveAreaM2 != null && input.targetExclusiveAreaM2 > 0;
  if (!hasTargetArea) {
    warnings.push("전용면적 미입력 — §15③1호나목 면적 ±5% 필터 미적용");
  }

  // ── Step 4: 공시가격 필터 준비 ───────────────────────
  const hasTargetStdPrice = input.targetStandardPrice != null && input.targetStandardPrice > 0;
  if (!hasTargetStdPrice) {
    warnings.push("공동주택가격 미입력 — §15③1호다목 공시가격 ±5% 필터 미적용 (Phase 2에서 자동 조회 예정)");
  }

  // ── Step 5: 거래 필터링 ──────────────────────────────
  const candidates: SimilarSalesCandidate[] = [];

  for (const trade of input.trades) {
    // 5-1. 단지명
    if (normalizeAptName(trade.aptName) !== targetNameNorm) continue;

    // 5-2. 평가기간 (매매계약일 기준 §49②1호)
    const dealDate = new Date(trade.dealDate);
    if (dealDate < periodStart || dealDate > periodEnd) continue;

    // 5-3. 거래금액 유효성
    if (trade.dealAmountWon <= 0) continue;

    // 5-4. 면적 ±5% (정수 연산)
    let areaDiffRatePct = 0;
    if (hasTargetArea) {
      // |후보 - 대상| × 100 / 대상 — 소수점 있는 면적이므로 float 비교 불가피하나
      // 비율 자체는 정수 비교로 충분 (5% = 정수 임계)
      const targetArea = input.targetExclusiveAreaM2!;
      // Math.abs(float) 허용 (면적 값 자체는 m2 소수, 비율 임계는 5로 비교)
      areaDiffRatePct = Math.abs(trade.exclusiveAreaM2 - targetArea) * 100 / targetArea;
      if (areaDiffRatePct > 5) continue;
    }

    // 5-5. 공시가격 ±5% (Phase 1: 대상 공시가격만, 후보 공시가격 없음 → 경고만)
    let stdPriceDiffRatePct: number | undefined;
    // Phase 2에서: 후보 공시가격 확보 시 필터 적용
    // Phase 1: hasTargetStdPrice이지만 후보 공시가격 없으므로 skip (경고 이미 등록)

    // 절대 일수 (가장 가까운 날 기준)
    const daysFromValuationDate = Math.abs(
      Math.floor((dealDate.getTime() - valuationDateObj.getTime()) / (1000 * 60 * 60 * 24))
    );

    candidates.push({
      trade,
      daysFromValuationDate,
      areaDiffRatePct,
      stdPriceDiffRatePct,
      passesAllFilters: true,  // Phase 1: 단지명+기간+면적만 (공시가격은 Phase 2)
    });
  }

  // ── Step 6: 특수관계인 경고 (고정) ──────────────────
  if (candidates.length > 0) {
    warnings.push(
      "특수관계인 간 거래(상증령 §49①1호가목)는 시가 인정이 제외됩니다. 거래 당사자를 직접 확인하세요.",
    );
  }

  // ── Step 7: §49② 가장 가까운 날 정렬 + 추천값 ──────
  if (candidates.length === 0) {
    warnings.push("평가기간 내 유사 매매사례가 없습니다.");
    return {
      candidates: [],
      recommendedValue: null,
      stdPriceFilterApplied: false,
      warnings,
    };
  }

  // 가장 가까운 날 오름차순 정렬
  candidates.sort((a, b) => a.daysFromValuationDate - b.daysFromValuationDate);

  const closestDays = candidates[0].daysFromValuationDate;
  const closestGroup = candidates.filter(c => c.daysFromValuationDate === closestDays);

  // 평균 (원 미만 절사) — §49② "평균액"
  const sumWon = closestGroup.reduce((s, c) => s + c.trade.dealAmountWon, 0);
  const recommendedValue = Math.floor(sumWon / closestGroup.length);

  // §15③1호단서: 공시가격 차이 가장 작은 주택 (Phase 2 — Phase 1은 undefined)
  const bestByStdPrice = undefined;

  return {
    candidates,
    recommendedValue,
    bestByStdPrice,
    stdPriceFilterApplied: false,  // Phase 1
    warnings,
  };
}
```

**정수 연산 주의**:
- `dealAmountWon`: 만원 × 10,000 정수
- `sumWon / closestGroup.length`: `Math.floor` 적용
- `areaDiffRatePct`: 면적은 소수점 포함이나 임계값(5%) 비교는 부등호로 충분

---

## 6. 타입 변경

### 6.1 `EstateItem` 확장 (`lib/tax-engine/types/inheritance-gift.types.ts`)

현재 `similarSalesValue?: number` (L92) 이후에 추가:

```typescript
/**
 * 유사매매사례가액 출처 메타 — RTMS 자동조회 시 자동 설정.
 * "manual": 사용자 수동 입력 (기존 동작)
 * "rtms_auto": RTMS 자동조회 후 사용자가 선택하여 채움
 */
similarSalesSource?: "manual" | "rtms_auto";

/**
 * RTMS 자동조회 후보 목록 캐시 — UI 표시용. 엔진은 소비하지 않음.
 * UI 시니어가 소비: 후보 모달 재표시 시 재조회 없이 기존 후보 표시.
 */
similarSalesCandidates?: SimilarSalesCandidate[];
```

`SimilarSalesCandidate` 타입은 `lib/calc/rtms-similar-sales-filter.ts`에서 export.  
`EstateItem`에서 import 시 순환 의존 방지: `types/` 레이어에서는 최소 형태로 별도 정의.

**순환 의존 회피 방안**: `lib/tax-engine/types/inheritance-gift.types.ts`에는 직접 import 대신 inline 미니멀 타입 정의:

```typescript
// EstateItem 내부 (순환 방지용 인라인 타입)
similarSalesCandidates?: Array<{
  dealDate: string;
  dealAmountWon: number;
  exclusiveAreaM2: number;
  floor: number;
  aptName: string;
  daysFromValuationDate: number;
}>;
```

### 6.2 Zod 스키마 확장 (`lib/validators/estate-item-schema.ts`)

`baseItemSchema`에 추가 (L23 `similarSalesValue` 인접):

```typescript
similarSalesSource: z.enum(["manual", "rtms_auto"]).optional(),
similarSalesCandidates: z.array(
  z.object({
    dealDate: z.string(),
    dealAmountWon: z.number().nonneg(),
    exclusiveAreaM2: z.number().nonneg(),
    floor: z.number(),
    aptName: z.string(),
    daysFromValuationDate: z.number().nonneg(),
  })
).optional(),
```

`baseItemSchema`에 추가하면 discriminatedUnion 9멤버 전체에 자동 전파됨 (아파트 전용이지만, 다른 카테고리에서는 undefined로 무해).

---

## 7. 클라이언트 헬퍼 (`lib/calc/rtms-lookup.ts`)

`vworld-reverse-geocode.ts` 패턴 동일하게 적용:

### 7.1 Dexie 캐시 스키마 확장

`lib/storage/db.ts`에 `rtmsTradeCache` 테이블 추가:

```typescript
interface RtmsTradeCacheRecord {
  id: string;            // `${lawdCd}:${dealYmd}` — 복합 키
  lawdCd: string;
  dealYmd: string;
  trades: RtmsTradeRecord[];
  createdAt: number;
  expiresAt: number;
}
```

캐시 TTL: 7일 (실거래가 데이터는 매일 변경되지 않음, 기존 vworld TTL 통일).

### 7.2 헬퍼 함수 시그니처

```typescript
export type RtmsLookupErrorCode =
  | "API_KEY_MISSING"
  | "INVALID_LAWD_CD"
  | "RTMS_FETCH_FAILED"
  | "PARSE_ERROR";

export interface RtmsLookupError {
  code: RtmsLookupErrorCode;
  message: string;
}

export interface RtmsLookupSuccess {
  trades: RtmsTradeRecord[];
  fromCache: boolean;
  months: string[];
}

export type RtmsLookupOutcome = RtmsLookupSuccess | RtmsLookupError;

export function isRtmsLookupError(o: RtmsLookupOutcome): o is RtmsLookupError {
  return "code" in o;
}

/**
 * RTMS 거래 조회 + Dexie 캐시.
 * @param lawdCd   5자리 법정동코드
 * @param baseDate 평가기준일 "YYYY-MM-DD"
 * @param taxType  세목 (평가기간 산정)
 */
export async function lookupRtmsTrades(
  lawdCd: string,
  baseDate: string,
  taxType: "inheritance" | "gift",
): Promise<RtmsLookupOutcome>;
```

---

## 8. 엔진↔UI 계약 인터페이스 (UI 시니어가 그대로 소비)

UI는 다음 인터페이스를 기반으로 구현한다.

### 8.1 조회 트리거 → 프록시 호출

```
UI → GET /api/address/apt-trade
       ?lawdCd={5자리}&baseDate={YYYY-MM-DD}&taxType={inheritance|gift}
  ← AptTradeRouteResponse | { error: AptTradeRouteError }
```

### 8.2 필터 함수 호출 (클라이언트 사이드)

```typescript
// UI 컴포넌트 내에서 직접 import 가능 (순수 함수, 클라이언트 번들 안전)
import { filterSimilarSales } from "@/lib/calc/rtms-similar-sales-filter";

const result: SimilarSalesFilterResult = filterSimilarSales({
  targetAptName: item.name,
  targetExclusiveAreaM2: item.areaSqm,
  targetStandardPrice: item.standardPrice,
  valuationDate: formData.deathDate ?? formData.giftDate,
  taxType: formData.taxType,
  trades: lookupResult.trades,
});
```

### 8.3 선택 확정 → 필드 채움

사용자가 후보에서 1건 선택 시:

```typescript
updateEstateItem(item.id, {
  similarSalesValue: candidate.trade.dealAmountWon,
  similarSalesSource: "rtms_auto",
  similarSalesCandidates: result.candidates.map(c => ({
    dealDate: c.trade.dealDate,
    dealAmountWon: c.trade.dealAmountWon,
    exclusiveAreaM2: c.trade.exclusiveAreaM2,
    floor: c.trade.floor,
    aptName: c.trade.aptName,
    daysFromValuationDate: c.daysFromValuationDate,
  })),
});
```

### 8.4 14개 동기화 지점 영향 범위

| 지점 | 변경 내용 |
|------|----------|
| ① 폼 상태 | `similarSalesSource`, `similarSalesCandidates` 필드 추가 |
| ② initial | `similarSalesSource: undefined`, `similarSalesCandidates: undefined` |
| ③ normalize | `similarSalesSource: item.similarSalesSource ?? undefined` |
| ④ API 변환 | `lib/calc/inheritance-tax-api.ts` — 신규 필드 spread |
| ⑤ UI 위젯 | "유사매매사례 자동조회" 버튼 + 후보 모달 (UI 시니어) |
| ⑥ 사이드바 합계 | 변경 없음 (`similarSalesValue` 기존 처리 유지) |
| ⑦ 결과 카드 | `similarSalesSource === "rtms_auto"` 시 출처 배지 표시 (UI 시니어) |
| ⑧ validation | `similarSalesSource`, `similarSalesCandidates` optional → 추가 규칙 없음 |
| ⑨ Zod enum 메인 | 신규 enum `"manual" | "rtms_auto"` 추가 |
| ⑩ Zod enum 컴패니언 | baseItemSchema 확장 → 9멤버 자동 전파 |
| ⑪ `acquisitionDate` fallback | 해당 없음 |
| ⑫ Zod 입력 객체 정의 | `baseItemSchema` 내 신규 2필드 |
| ⑬ API body spread | 기존 spread 유지, 신규 필드 자동 포함 |
| ⑭ Route handler 엔진 input 매핑 | `similarSalesSource`, `similarSalesCandidates` — 엔진 미소비, route에서 strip 불필요 (Zod passthrough 주의) |

---

## 9. legal-codes 추가 상수

`lib/tax-engine/legal-codes/inheritance-gift.ts`의 `VALUATION` 객체에 추가:

```typescript
/** 상증령 §49④ — 유사재산 시가 인정 (위임: 면적·위치·용도·종목·기준시가 동일·유사) */
SIMILAR_SALES_DEEMED_MARKET:   "상증령 §49④",
/** 시행규칙 §15③1호 — 공동주택 유사재산 3요건 (단지·면적±5%·공시가격±5%) */
SIMILAR_SALES_APT_CRITERIA:    "상증세법 시행규칙 §15③1호",
/** 시행규칙 §15③1호단서 — 둘 이상 시 공시가격 차이 가장 작은 주택 */
SIMILAR_SALES_APT_BEST_STD:    "상증세법 시행규칙 §15③1호단서",
/** 상증령 §49①1호가목 — 특수관계인 거래 배제 */
SIMILAR_SALES_RELATED_PARTY_EXCL: "상증령 §49①1호가목",
/** 상증령 §49②1호 — 매매계약일 기준 기간 판단 + 가장 가까운 날 */
SIMILAR_SALES_CLOSEST_DATE:    "상증령 §49②1호",
```

---

## 10. 테스트 anchor 케이스

파일: `__tests__/tax-engine/inheritance/similar-sales-filter.test.ts`

### T-1. 기본 — 후보 1건 (상속, 면적 정확일치)

```typescript
const result = filterSimilarSales({
  targetAptName: "래미안아파트",
  targetExclusiveAreaM2: 84.87,
  targetStandardPrice: 500_000_000,
  valuationDate: "2024-06-15",
  taxType: "inheritance",
  trades: [
    {
      aptName: "래미안아파트",
      aptNameNormalized: "래미안아파트",
      dealDate: "2024-04-10",   // 기준일 기준 -66일
      exclusiveAreaM2: 84.87,
      dealAmountWon: 850_000_000,
      floor: 10,
      buildYear: 2003,
      jibun: "241",
      lawdCd: "11110",
    },
  ],
});
expect(result.candidates).toHaveLength(1);
expect(result.recommendedValue).toBe(850_000_000);
```

### T-2. 후보 0건 — 기간 외 거래

```typescript
const result = filterSimilarSales({
  targetAptName: "래미안아파트",
  targetExclusiveAreaM2: 84.87,
  valuationDate: "2024-06-15",
  taxType: "inheritance",
  trades: [{
    ...baseT2Trade,
    dealDate: "2023-12-01",  // 기준일 -197일 → 6개월(~180일) 초과
  }],
});
expect(result.candidates).toHaveLength(0);
expect(result.recommendedValue).toBeNull();
expect(result.warnings).toContain("평가기간 내 유사 매매사례가 없습니다.");
```

### T-3. 후보 다건 — 가장 가까운 날 + 평균

```typescript
// 두 거래가 동일 날짜 (dealDate 동일)
const result = filterSimilarSales({
  targetAptName: "래미안아파트",
  targetExclusiveAreaM2: 84.87,
  valuationDate: "2024-06-15",
  taxType: "inheritance",
  trades: [
    { ...t, dealDate: "2024-06-10", dealAmountWon: 850_000_000 },
    { ...t, dealDate: "2024-06-10", dealAmountWon: 860_000_000 },
    { ...t, dealDate: "2024-05-01", dealAmountWon: 800_000_000 },
  ],
});
// 가장 가까운 날 = 2024-06-10 (5일), 2건 평균
expect(result.recommendedValue).toBe(Math.floor((850_000_000 + 860_000_000) / 2));
// = 855_000_000
```

### T-4. 면적 ±5% 경계값

```typescript
// 대상 84.87㎡, 5% = 4.2435㎡
// 후보 89.09㎡: 차이 4.22㎡ → 4.22/84.87×100 = 4.97% < 5% → 통과
// 후보 89.19㎡: 차이 4.32㎡ → 4.32/84.87×100 = 5.09% > 5% → 제외
const result = filterSimilarSales({
  targetExclusiveAreaM2: 84.87,
  trades: [
    { ...t, aptName: "래미안아파트", exclusiveAreaM2: 89.09, dealAmountWon: 850_000_000 },
    { ...t, aptName: "래미안아파트", exclusiveAreaM2: 89.19, dealAmountWon: 900_000_000 },
  ],
  ...baseInput,
});
expect(result.candidates).toHaveLength(1);
expect(result.candidates[0].trade.exclusiveAreaM2).toBe(89.09);
```

### T-5. 단지명 정규화 — 공백 차이

```typescript
// "래미안 아파트" vs "래미안아파트"
// 정규화 후 동일 → 통과
```

### T-6. 거래금액 환산 (만원 → 원)

```typescript
// RTMS raw: "85,000" → parseDealAmountWon → 850_000_000
expect(parseDealAmountWon("85,000")).toBe(850_000_000);
expect(parseDealAmountWon("0")).toBe(0);       // 제외 대상
expect(parseDealAmountWon("-1,000")).toBe(0);   // 음수 방어
```

### T-7. 전용면적 미입력 경고

```typescript
const result = filterSimilarSales({
  targetAptName: "래미안아파트",
  targetExclusiveAreaM2: undefined,
  valuationDate: "2024-06-15",
  taxType: "inheritance",
  trades: [validTrade],
});
expect(result.warnings).toContain(expect.stringContaining("면적 ±5% 필터 미적용"));
// 면적 필터 건너뜀 → 해당 거래 포함 가능
```

### T-8. 증여세 평가기간 (후 3개월 제한)

```typescript
// 기준일 2024-06-15 (증여)
// 후 4개월 거래 2024-10-20 → 제외 (후 3개월 = ~2024-09-15)
// 후 2개월 거래 2024-08-10 → 포함
```

---

## 11. 파일 목록 (신규 생성)

| 파일 | 레이어 | 역할 |
|------|--------|------|
| `app/api/address/apt-trade/route.ts` | API Route | RTMS 프록시, 다개월 수집, 정규화 |
| `lib/calc/rtms-similar-sales-filter.ts` | 순수 함수 | 필터링·정렬·추천값 산출 |
| `lib/calc/rtms-lookup.ts` | 클라이언트 헬퍼 | fetch + Dexie 캐시 |
| `__tests__/tax-engine/inheritance/similar-sales-filter.test.ts` | 테스트 | T-1~T-8 anchor |

**기존 수정 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `lib/tax-engine/types/inheritance-gift.types.ts` | `EstateItem`에 `similarSalesSource`, `similarSalesCandidates` 추가 |
| `lib/validators/estate-item-schema.ts` | `baseItemSchema`에 2필드 추가 |
| `lib/tax-engine/legal-codes/inheritance-gift.ts` | `VALUATION`에 5개 상수 추가 |
| `lib/storage/db.ts` | `rtmsTradeCache` 테이블 추가 + 버전 증가 |
| `.env.local.example` | `MOLIT_RTMS_API_KEY=` 주석 추가 |

---

## 12. 주의사항 및 제약

1. **엔진 불변**: `resolveValuationMethod` / `evaluateApartment` 변경 없음. `similarSalesValue` 필드만 채워지면 기존 평가 파이프라인이 자동으로 `"similar_sales"` 방법으로 동작.
2. **800줄 정책**: `app/api/address/apt-trade/route.ts`는 RTMS 병렬 fetch 로직이 길어질 수 있음. 300줄 초과 시 `apt-trade-helpers.ts` 분리.
3. **거래금액 단위**: RTMS "만원" 단위를 `parseInt × 10_000` 정수 연산. `Number.MAX_SAFE_INTEGER`(~9조) 이내 — 최고가 거래 ~수백억원 × 10,000 = 수조원 범위로 안전.
4. **date-fns 의존**: `addMonths`, `format` 사용. 기존 `lib/api/date-coerce.ts` 패턴과 일관성 유지. `new Date(string)` 직접 호출 금지.
5. **`similarSalesCandidates` 엔진 미소비**: Route handler Zod 파싱 시 `.strip()` 기본 동작에 의해 엔진 input에서 제거될 수 있음. `baseItemSchema`에 포함되어 있으므로 strip 방지를 위해 Zod `.passthrough()` 불필요 — 엔진이 소비하지 않으므로 strip되어도 무방.
