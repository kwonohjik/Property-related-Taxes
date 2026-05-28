# 상장주식 평가조서(갑·을) — 엔진 디자인

> Plan: `docs/00-pm/listed-stock-besshi-form-replica.plan.md`
> 선행 사례: `inheritance-unlisted-stock-besshi-2025-revision.engine.design.md`
> Definition of Done: CLAUDE.md 14 동기화 지점

---

## 0. 디자인 원칙

- **순수 함수 + echo 패턴** ([[echo-field-pattern]]): 산식 변경 0 + result 신규 optional 필드만 추가.
- **단일 source** ([[ui_engine_dual_truth_avoidance]]): 갑지 ⑨=⑱, ⑩=⑰의 echo source는 `result.besshiData` 한 곳. UI는 직접 곱셈·평균 재구현 금지.
- **자동 fallback 금지** ([[feedback_no_silent_apportion_fallback]]): `faceValuePerShare`·`dividendBaseDate` 등 §63②3호 분기 활성 시 명시 입력 강제.
- **store mirror 금지** ([[mirror-pattern]]): 키움 자동조회 응답을 store에 mirror 저장하지 않음. `EstateItem.listedStockDailyGroupsInput` 은 자동조회 시점에 1회 channel-fill, 이후 엔진 result echo로만 표시.

---

## 1. 케이스 매트릭스 (Pre-Do anchor 행 ≥ 1)

(Plan §2 동일. 본 디자인에서 10행 모두 anchor RED 골격 작성)

| ID | 입력 키 | 기대 echo |
|---|---|---|
| LS-01 | H사·개인·할증0% | ⑨=⑩=⑯=⑰=⑱=8,452 |
| LS-02 | +max·large | ⑩=⑰=floor(8,452×1.2)=10,142 |
| LS-03 | +capitalIncreaseDate=D−15일 | slot 시작=D−15, avg 재산정 |
| LS-04 | +mergerDate=D−10일 | slot 시작=D−10 |
| LS-05 | dividendBaseDateSameAsListed=true | ⑮=0 라벨 |
| LS-06 | 휴장일 다수(이미지) | 일수=84 |
| LS-07 | listingDate=D−15일 | tradingDays<60 warning |
| LS-08 | stockClass="preferred" | ⑤="우선주" |
| LS-09 | art53_8_5 | premium=0 라벨 표시 |
| LS-10 | small + max | premium=0 |

---

## 2. 타입 확장 (`lib/tax-engine/types/inheritance-gift.types.ts`)

```ts
export type ListedStockClass = "common" | "preferred";
export type ListedCompanySize = "small" | "medium" | "large";
export type ListedPremiumExclusionReason =
  | "none" | "smb_med"
  | "art53_8_1" | "art53_8_2" | "art53_8_3" | "art53_8_4"
  | "art53_8_5" | "art53_8_6" | "art53_8_7" | "art53_8_8" | "art53_8_9";

export interface ListedStockDailyRow {
  no: number;            // 1~31
  date: string;          // ISO
  monthDay: string;      // "07월 06일"
  closing: number | null;
  label: string;         // "" | "일요일" | "토요일" | "휴무일" | "종가 없음" | "상장전"
}

export interface ListedStockMonthGroups {
  beforeM1: ListedStockDailyRow[];
  beforeM2: ListedStockDailyRow[];
  afterM1: ListedStockDailyRow[];
  afterM2: ListedStockDailyRow[];
  beforeSubtotal: number;
  afterSubtotal: number;
  tradingDays: number;
  closingSum: number;
  closingAverage: number;
}

export interface EstateItem {
  // ... 기존 필드 ...
  // 갑지 1.평가대상 상장법인
  companyName?: string;
  representative?: string;
  companyAddress?: string;
  stockClass?: ListedStockClass;
  listingDate?: Date | string;
  capitalIncreaseDate?: Date | string;
  mergerDate?: Date | string;
  // §63③ 할증
  isMaxShareholder?: boolean;
  companySize?: ListedCompanySize;
  premiumExclusionReason?: ListedPremiumExclusionReason;
  // 갑지 3.미상장주식 (§63②3호)
  priorDividendRate?: number;       // decimal 0~1
  faceValuePerShare?: number;
  dividendBaseDate?: Date | string;
  // 자동조회 4그룹 caching (입력 폼 미보유)
  /**
   * 자동조회 4그룹 결과 caching ([[mirror-pattern]] 예외 — 사용자 입력 mirror가 아니라
   * 외부 시세 응답의 1회 channel-fill 캐시. UI 폼에는 노출하지 않으며 자동조회 시점에만
   * lib/calc/listed-stock-besshi.ts 어댑터가 채움. 엔진은 pass-through만).
   */
  listedStockDailyGroupsInput?: ListedStockMonthGroups;
}

export interface ListedStockBesshiData {
  page1: {
    companyName?: string;
    representative?: string;
    companyAddress?: string;
    valuationDate: string;
    stockClass: ListedStockClass;
    listingDate?: string;
    capitalIncreaseDate?: string;
    mergerDate?: string;
    isUnlistedShareSection: boolean;
  };
  page1Values: {
    closingAvg: number;                    // ⑨ ⑱
    perShareMajorShareholder: number;      // ⑩
    priorDividendRate?: number;            // ⑪
    priorDividendAmount?: number;          // ⑫
    dividendBaseDate?: string;             // ⑬
    daysUntilDividendBase?: number;        // ⑭
    dividendDifference?: number;           // ⑮
    perShareValue?: number;                // ⑯
    perShareMajorShareholderUnlisted?: number; // ⑰
    majorShareholderRate: 0 | 0.20;
    premiumExclusionLabel?: string;
    faceValuePerShare?: number;
  };
  page2: ListedStockMonthGroups;
}

export interface PropertyValuationResult {
  // ... 기존 필드 ...
  besshiData?: ListedStockBesshiData;
}
```

---

## 3. 엔진 산식 변경 (`lib/tax-engine/property-valuation-stock.ts`)

### 3-0. 사전 작업
1. ~~atoms 격상 이동~~ — **정책 변경**: 격상 이동 대신 기존 위치 유지. 신규 listed besshi 컴포넌트가 `components/calc/inheritance/unlisted-stock-v2/besshi/BesshiSharedAtoms` 를 직접 import. 회귀 위험 0. (격상은 후속 정리 작업으로 분리)
2. **EstateItem.deathDate/giftDate 존재 여부 grep** — 없으면 orchestrator가 `evaluateListedStock(item, { valuationDate })` 의 context로 전달 (단일 정책).
3. `lib/tax-engine/legal-codes/inheritance-gift.ts` 에 신규 상수 추가:
   - `VALUATION.LISTED_STOCK_PREMIUM = "상증법 §63③"`
   - `VALUATION.LISTED_STOCK_CAPITAL_INCREASE_PERIOD = "상증령 §52의2②"`
   - `VALUATION.DIVIDEND_DIFFERENCE_FORMULA = "상증규 §18②"`
4. §53⑧ 1~9호 배제 사유 라벨 상수 (`lib/tax-engine/data/listed-premium-exclusion-labels.ts`):
   ```ts
   export const PREMIUM_EXCLUSION_LABELS: Record<ListedPremiumExclusionReason, string> = {
     none: "배제 사유 없음",
     smb_med: "중소·중견기업 (§53④)",
     art53_8_1: "§53⑧1호 — 평가기준일 전 3년 이내 계속 결손법인",
     art53_8_2: "§53⑧2호 — 평가기준일 직전 3개 사업연도 매출액이 평균 30억원 이하",
     art53_8_3: "§53⑧3호 — 사업개시 후 3년 미만",
     art53_8_4: "§53⑧4호 — 평가기준일 전후 6개월 이내 매매사실",
     art53_8_5: "§53⑧5호 — 상속·증여 후 1년 이내 청산",
     art53_8_6: "§53⑧6호 — 잔여 존속기한 3년 이내",
     art53_8_7: "§53⑧7호 — 주식 80% 이상 보유 법인 청산 진행",
     art53_8_8: "§53⑧8호 — 최대주주 등이 보유한 주식가액 합이 30억원 이하",
     art53_8_9: "§53⑧9호 — 그 밖에 시행규칙으로 정하는 경우",
   };
   ```
   > 라벨 문구는 Pre-Do 단계에서 KoreanLaw MCP로 §53⑧ 본칙 끝까지 검증 후 확정 ([[korean-law-citation-verify]]).

### 3-1. 시그니처 변경
```ts
export function evaluateListedStock(
  item: EstateItem,
  context: { valuationDate: Date | string }, // ★ 신규 — orchestrator가 deathDate/giftDate 전달
): PropertyValuationResult
```

`property-valuation.ts`·`resolve-estate-item-value.ts` 의 호출처 동시 수정. 외부 prop으로 valuationDate를 받는 이유: `EstateItem` 자체에는 평가기준일 필드가 없고, 상속(deathDate)·증여(giftDate)·`§63②3호` 케이스에서 서로 다른 일자를 사용할 수 있어 단일 source가 orchestrator.

### 3-2. 산식 (`isCapitalIncreaseUnlistedShare === true` 분기)

```ts
const premium = calcMaxShareholderPremium({
  finalPerShareValue: 0, // perShareValue 결정 후 별도 적용
  isMaxShareholder: item.isMaxShareholder ?? false,
  companySize: item.companySize ?? "small",
});
const premiumRate =
  item.premiumExclusionReason && item.premiumExclusionReason !== "none" ? 0 : premium.premiumRate;

const { effectiveDividendDifference, perShareValue /* ⑯ */ } =
  applyCapitalIncreaseShareValuation(
    avgPrice,
    item.listedStockDividendDifference ?? 0,
    item.dividendBaseDateSameAsListed ?? false,
  );
const perShareMajorShareholderUnlisted = Math.floor(perShareValue * (1 + premiumRate)); // ⑰
const totalValue = perShareMajorShareholderUnlisted * shares; // ★ 기존 ⑯×shares → ⑰×shares
```

### 3-3. 산식 (일반 분기, `isCapitalIncreaseUnlistedShare !== true`)

```ts
const perShareMajorShareholder = Math.floor(avgPrice * (1 + premiumRate)); // ⑩
const totalValue = perShareMajorShareholder * shares; // ★ 기존 avgPrice×shares → ⑩×shares
```

### 3-3a. ⑬·⑭·⑮ 배당차액 산식 (§18②)

```ts
// ⑬ dividendBaseDate: item.dividendBaseDate (사용자 입력)
// ⑭ daysUntilDividendBase:
//    item.dividendBaseDateSameAsListed ? 0 :
//    differenceInDays(context.valuationDate, dividendBaseDate)
// ⑫ priorDividendAmount: Math.floor((item.faceValuePerShare ?? 0) × (item.priorDividendRate ?? 0))
// ⑮ dividendDifference: item.dividendBaseDateSameAsListed ? 0 :
//    Math.floor(priorDividendAmount × daysUntilDividendBase / 365)
//    (윤년 미고려 — KoreanLaw §18② 본칙 분모 365 고정 검증 필요)
```

`§63②3호` 분기에서 위 산식은 `applyCapitalIncreaseShareValuation` 내부에서 이미 부분 수행 (effectiveDividendDifference). echo만 분해해 노출.

### 3-3b. emptyGroups() 헬퍼

```ts
export const EMPTY_LISTED_STOCK_MONTH_GROUPS: ListedStockMonthGroups = {
  beforeM1: [], beforeM2: [], afterM1: [], afterM2: [],
  beforeSubtotal: 0, afterSubtotal: 0, tradingDays: 0,
  closingSum: 0, closingAverage: 0,
};
```

### 3-4. result echo

```ts
return {
  estateItemId: item.id,
  method: "market_value", // ★ 유지
  valuatedAmount: totalValue,
  breakdown: [
    { label: "전후 2개월 종가 평균 (⑨/⑱)", amount: avgPrice, lawRef: VALUATION.LISTED_STOCK },
    { label: "최대주주 할증률 (§63③)", amount: premiumRate, note: premiumRate === 0 ? premiumExclusionLabel : "20%" },
    { label: "⑩ 최대주주 1주당 평가액", amount: perShareMajorShareholder, lawRef: VALUATION.LISTED_STOCK_PREMIUM },
    ...(item.isCapitalIncreaseUnlistedShare ? [
      { label: "⑮ 배당차액 (§18②)", amount: -effectiveDividendDifference, lawRef: VALUATION.DIVIDEND_DIFFERENCE },
      { label: "⑯ 1주당 가액", amount: perShareValue },
      { label: "⑰ 최대주주 미상장 신주 1주당 평가액", amount: perShareMajorShareholderUnlisted },
    ] : []),
    { label: "보유 주식 수", amount: shares, note: "주" },
    { label: "상장주식 평가액", amount: totalValue, lawRef: VALUATION.LISTED_STOCK },
  ],
  warnings,
  besshiData: {
    page1: { ..., valuationDate: toIso(context.valuationDate), ... },
    page1Values: { closingAvg: avgPrice, perShareMajorShareholder, ..., majorShareholderRate: premiumRate as 0|0.20, premiumExclusionLabel, ... },
    page2: item.listedStockDailyGroupsInput ?? emptyGroups(),
  },
};
```

**회귀 가드 (정확)**:
- `isMaxShareholder` 미입력(undefined→false) **AND** `premiumExclusionReason` 미입력 → `companySize=small(기본)` → `calcMaxShareholderPremium`이 premiumRate=0 반환 → `Math.floor(avgPrice × 1) = avgPrice` → 기존 동작과 **수치 동일**. 단 `Math.floor` 추가가 정수 avgPrice에서 무영향 (avgPrice는 `Math.floor` 이미 적용된 정수). LS-01 anchor가 회귀 검증.
- `isMaxShareholder=true` + `companySize=large` + `premiumExclusionReason=none` → premiumRate=0.20 → ⑩=⑰=floor(avg×1.2). LS-02 anchor.

---

## 4. 키움 4그룹 분할 헬퍼 (`lib/kiwoom/two-month-grouping.ts`)

```ts
export function splitTwoMonthSurroundingByMonthGroup(
  slotDates: string[],
  closingPrices: (number | null)[],
  weekendLabels: string[],
  valuationDateIso: string,
  options?: { startOverrideDate?: string }, // §52의2② partial 슬롯 케이스
): ListedStockMonthGroups
```

### 4-1. NO 매핑 규칙 (이미지 5 정합)

| 그룹 | NO 1 의 일자 | NO 31 의 일자 | 정렬 |
|---|---|---|---|
| beforeM1 | **D** (평가기준일 자체) | D − 30일 | 가까운날→먼날 (역순) |
| beforeM2 | D − 31일 | D − 61일 | 역순 |
| afterM1 | **D** | D + 30일 | 가까운날→먼날 (정순) |
| afterM2 | D + 31일 | D + 61일 | 정순 |

> **D는 좌(beforeM1 NO 1)·우(afterM1 NO 1) 양쪽 모두 표시 + closing 양쪽 카운트** — 이미지 H사 검증: 좌 350,490 + 우 359,540 = 710,030, floor(710,030/84) = 8,452 ✓

### 4-2. partial slot 처리 (§52의2②)

`startOverrideDate` 가 D보다 과거 + D-2월 이내일 때:
- beforeM1·beforeM2 중 `startOverrideDate` 이전 일자는 **`closing=null`, `label="기간외"`** 로 채워 표 행 31개 유지. 소계·일수에서 자동 제외.
- afterM1·afterM2 는 영향 없음.

### 4-3. 산출
- subtotal = 각 그룹 closing 합 (label≠"" 행은 0)
- tradingDays = (beforeM1 closing≠null 수) + (beforeM2) + (afterM1) + (afterM2)
- closingSum = beforeSubtotal + afterSubtotal
- closingAverage = `Math.floor(closingSum / tradingDays)` (tradingDays=0 → 0)

`__tests__/lib/kiwoom/two-month-grouping.test.ts` 단위 anchor 10건 (8 기본 + 2 partial).

---

## 5. valuation-2month route 파라미터 확장 (`app/api/kiwoom/valuation-2month/route.ts`)

```ts
const RequestSchema = z.object({
  stockCode: z.string().regex(/^[0-9A-Z]{6}$/, "..."),
  valuationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "..."),
  startOverrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // 신규
});
```

### 5-1. 신규 헬퍼 `lib/kiwoom/calendar.ts`
```ts
export function buildPartialSurroundingSlots(
  startIso: string,
  valuationDateIso: string,
): string[] {
  // [startIso, valuationDateIso + 2월] 사이 모든 캘린더 날짜 (ISO 정순)
}
```

### 5-2. Route 분기
```ts
const slotDates = startOverrideDate
  ? buildPartialSurroundingSlots(startOverrideDate, valuationDate)
  : buildTwoMonthSurroundingSlots(valuationDate);
```
`twoMonthSurroundingAvg` 는 평균 산식·휴장일 제외 동일 (소스 그대로).

### 5-3. Client 전달 로직 (`lib/calc/listed-stock-besshi.ts` 신규)
```ts
import { subMonths } from "date-fns";

function resolveStartOverrideDate(item: EstateItem, valuationDate: Date): string | undefined {
  const candidate = item.capitalIncreaseDate ?? item.mergerDate;
  if (!candidate) return undefined;
  const d = toDate(candidate);
  const lowerBound = subMonths(valuationDate, 2);
  if (d >= lowerBound && d <= valuationDate) return toIsoYmd(d);
  return undefined;
}
```

> 미달 시 무시 (default 전체 D±2월). [[korean-law-citation-verify]] 정책: §52의2② 본칙 라벨을 KoreanLaw MCP로 Pre-Do 단계 확정.

---

## 6. 14 동기화 지점 grep 체크리스트

| # | 검증 grep | 통과 조건 |
|---|---|---|
| ① | `grep -rn "companyName\|representative\|stockClass\|isMaxShareholder\|priorDividendRate" lib/stores/calc-wizard-*.ts` | 11 필드 모두 등장 |
| ② | initial factory | 11 필드 undefined |
| ③ | normalize | Date·decimal 변환 |
| ④ | `lib/calc/inheritance-gift-api.ts`·`gift-tax-api.ts` | 11 신규 전달 |
| ⑤ | `components/calc/inheritance/listed-stock/` 신규 | besshi/ 4 파일 |
| ⑥ | `lib/stores/inheritance-summary.ts`·`gift-summary.ts` | Pre-Do 단계 `grep "listed_stock\|category === \"listed_stock\""` 후 file:line 명시. 합산은 `estateItem.valuation.valuatedAmount` 기반 → 엔진 산식 변경으로 변동 가능 (LS-02·LS-04 anchor 검증) |
| ⑦ | 결과 카드 — `ListedStockBesshiResultView` | 갑·을 렌더 |
| ⑧ | `lib/calc/inheritance-validate.ts`·`gift-validate.ts` | §63②3호 활성 시 필수 |
| ⑨ | `lib/api/schemas/inheritance-gift.schema.ts` | enum 3개 |
| ⑩ | 컴패니언 EstateItem 스키마 | 11 필드 |
| ⑪ | 무관 | − |
| ⑫ | **Zod 입력 객체 — EstateItem 11 필드 추가 확인** | grep |
| ⑬ | **API body spread** | grep `...item` 유지 |
| ⑭ | **Route handler `coerceDates`** | 4 Date 필드 추가 |

---

## 7. anchor 테스트 (10 + α)

```
__tests__/tax-engine/listed-stock/
├── ls-01-image-h-sample.test.ts            # ⑨=⑱=⑩=⑰=8,452, valuatedAmount = 8,452 × shares
├── ls-02-max-shareholder-large.test.ts     # ⑩=10,142, valuatedAmount = 10,142 × shares
├── ls-03-capital-increase-period.test.ts   # §52의2②
├── ls-04-merger-period.test.ts
├── ls-05-dividend-base-same.test.ts
├── ls-06-non-trading-days.test.ts          # 휴장일 다수 — 일수=84 정합
├── ls-07-ipo-warning.test.ts
├── ls-08-preferred-stock.test.ts
├── ls-09-art53-8-exclusion.test.ts
├── ls-10-small-max.test.ts
└── besshi-echo-shape-guard.test.ts         # 누락 가드
```

---

## 8. 회귀 영향 분석

- 기존 `listed_stock` 사용처 (상속·증여 결과뷰·사이드바): `isMaxShareholder` 미입력 시 결과 무변경 ✓
- 비상장 `max-shareholder-premium.ts`: 영향 없음 (호출처만 추가)
- `valuation-2month` API: 기존 호출자 `startOverrideDate` 미전달 → 동작 무변경 ✓
- `BesshiSharedAtoms.tsx` 이동: 비상장 별지부표3 import 경로 일괄 치환 필요 (5 파일) — grep 후 mv
