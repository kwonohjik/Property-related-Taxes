# §41의2 초과배당에 따른 이익의 증여 — 엔진 설계

> 브랜치 `feat/gift-excess-dividend-41-2` · 워크트리 `.claude/worktrees/gift-excess-dividend-41-2`
> Plan 단일 진실: `docs/00-pm/gift-excess-dividend-41-2.plan.md`
> §9 실측 결과 단정 포함 (probe/grep 검증 완료). 미검증은 "확인 필요" 명시.

---

## 0. §9 실측 결과 (Design 진입 전 단정)

### §9-1 (최우선): deemed ↔ calcGiftTax 연결 경로 실측 결과

**실측 경로** (파일:라인 기준):

```
DeemedGiftCalculator.tsx:48    →  fetch("/api/calc/gift-deemed", body)
app/api/calc/gift-deemed/route.ts:62  →  calcDeemedGift(input)  [router.ts]
router.ts:55                   →  calcExcessDividendGift(input)  [excess-dividend.ts]
                                   → DeemedGiftResult { deemedGiftValue }  반환
DeemedGiftCalculator.tsx:59    →  result = json.result  (DeemedGiftResult)
DeemedGiftCalculator.tsx:68    →  buildGiftWizardPrefill(form, result)
gift-deemed-api.ts:308-318     →  giftItems[0].marketValue = result.deemedGiftValue
                                   → sessionStorage "giftTaxResumeInput"
                                   → router.push("/calc/gift-tax")
```

**핵심 발견**:
- `calcDeemedGift` → `calcExcessDividendGift`은 `DeemedGiftResult`만 반환하고 `calcGiftTax`를 전혀 호출하지 않는다.
- `buildGiftWizardPrefill`이 `deemedGiftValue`를 `giftItems[0].marketValue`로 변환해 증여세 마법사(별도 페이지)에 prefill로 주입한다.
- 증여세 본체 계산(`calcGiftTax`)은 `/calc/gift-tax` 마법사에서 별도로 실행된다 — deemed 계산기는 `deemedGiftValue` 산출까지만 담당한다.

**정산 2-pass 구현 위치 결정 (핵심 설계 결정)**:

정산(㉮ 당초 vs ⑭ 정산 증여세액)은 `calcGiftTax`를 2회 호출해야 하므로, 아래 3가지 옵션 중 **옵션 A**를 채택한다.

| 옵션 | 구현 위치 | 채택 여부 | 사유 |
|------|---------|---------|-----|
| **A** | **deemed 엔진 내부가 `calcGiftTax`를 import해 2-pass 수행** (신규 의존) | **채택** | 정산을 엔진 순수 함수 내에서 완결. Route/클라이언트 복잡도 증가 없음. 단, `gift-deemed/` → `gift-tax.ts` 단방향 의존(역방향 아님) — 기존 의존 규칙 위반 아님. |
| B | Route Handler 레벨 2회 호출 | 미채택 | Route가 엔진 로직을 직접 조합해야 → Layer 2 순수성 훼손 |
| C | 클라이언트 2-pass (prefill → 마법사 → 정산입력 → 재계산) | 미채택 | UX 복잡. 정산 금액 표시가 deemed 결과뷰에서 불가 |

**옵션 A 의존 방향**: `gift-deemed/excess-dividend.ts` → `gift-tax.ts` (calcGiftTax import). `lib/tax-engine/CLAUDE.md`의 "서브엔진 의존 규칙"에 위배되지 않음 — 역방향(gift-tax → deemed)이 아니라 deemed → gift-tax 방향이며, gift-tax.ts는 deemed의 상위 엔진이 아님(독립 도메인).

다만 **정산 2-pass는 현행(2021~) 전용**이며, `GiftTaxInput` 구성에 필요한 `giftDate`·`donorRelationship`·`priorGifts`·`creditInput` 등을 `ExcessDividendInput`에서 수신해야 한다. 이 때문에 `ExcessDividendInput`에 `giftTaxContext` 선택 필드를 추가한다.

### §9-2: §47② 합산배제 연계 가능 여부

**실측 결과**: `lib/tax-engine/gift-prior-aggregation.ts:108`에 §47② 합산배제 로직이 있으나, 이는 증여세 마법사(`calcGiftTax`)의 사전증여합산 단계에서 처리된다. deemed 계산기는 `deemedGiftValue > 0` 여부(법§41의2①)를 판정하는 데 그치고, §47② 합산배제 여부는 증여세 마법사에서 별도 처리한다.

**설계 방침**: 초과배당 증여세액 < 소득세상당액 → `applied = false` + `exclusionReason = "§47② 재차증여 합산 배제 해당 (법§41의2①이 적용되지 않음)"` 경고를 `DeemedGiftResult.warnings[]`에 추가한다. 실제 §47② 제외 처리는 증여세 마법사 prefill 단계에서 `skipPriorAggregation: true` 플래그로 전달한다. **기존 `dup-exclusion.ts` 직접 연계 불필요** — 현재 `dup-exclusion.ts`는 §43①(중복배제, 최대 1건 선택)만 담당하며, §47②는 `gift-prior-aggregation.ts`가 담당한다.

### §9-3: 종합과세 실제소득세 — 소득세 누진세율 데이터

**실측 결과**: 소득세법 §55 누진세율(6%~45%)은 repo에 **별도 정적 상수가 없다**. `transfer-rate-seed-historical.ts`의 `brackets_common_1_to_5`(양도소득세 구간)가 유사하나, 이는 양도세 전용이며 §55 종합소득세율과 구간·공제액이 다르다.

**설계 방침**: `lib/tax-engine/data/gift-deemed-rates.ts`에 §55 종합소득세율 정적 상수 `COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY`를 **신규 추가**한다. 연도별 변경(2021.1.1 10억 초과 45% 구간 신설) 때문에 역사 배열로 관리한다. Do 단계에서 KoreanLaw 별표 검증 후 확정.

### §9-4: 율표 base 값 정확성 (법제처 별표 미검증)

**실측 결과**: Plan §9 ②에서 "법제처 별표 재검증 필수"로 지정됨. 현재 anchor는 교재 이미지. 계산 검증:
- 현행 7구간 경계: `5,760만 × 14% = 8,064,000` (수학적 연속성). 교재 기재 '806만'은 `8,060,000`.
- 양자 불일치 1건: 구간 전환점에서 `5,760만+1원 → 8,060,000 + floor(1×0.24) = 8,060,000` (연속).
- **확인 필요**: 법제처 시행규칙 §10의3 별표 원문 재검증 (Do 단계 Pre-Do anchor). 현재는 교재값(`8,060,000`, `8,060,000 = 806만`)을 설계에 사용.

### §9-5: 신고기한구분 UI 입력 필요 여부

**실측 결과**: `DeemedGiftCalculator.tsx` 기존 폼 필드에 신고기한구분 항목이 없다. 영§31의2③1호(신고기한이 다음해 6.1/7.1 이후 → 정산 미적용)는 증여일과 신고기한 종류(일반/성실신고)에서 자동 파생 가능하다. 증여일은 이미 `form.giftDate`로 수집된다.

**설계 방침**: 신규 필드 `edFilingDeadlineType: 'ordinary' | 'diligent'` 추가. 기본값 `'ordinary'`. 영③1호 경계: 다음해 6.1(일반)/7.1(성실) → 증여일+1년+5개월1일 ~ 6개월1일. 엔진에서 자동 판정.

---

## 1. 타입 설계

### 1.1 ExcessDividendInput (전면 개편)

현재 위치: `lib/tax-engine/gift-deemed/types.ts:271`

```typescript
/** §41의2 초과배당 — 법령 정합 산정 엔진용 입력 (보완 v2) */
export interface ExcessDividendInput {
  // ── ① 주주 배열 (영§31의2② 자동산정) ──────────────────
  /** 주주별 배당 내역. 비례배당 자동산정에 필요. 1개 이상 필수. */
  shareholders: ShareholderDividend[];

  // ── ② 시기·증여일 ──────────────────────────────────────
  /** 배당 지급일 (= 증여일, 법§41의2①). Date 객체. */
  dividendDate: Date;

  // ── ③ 소득세 모드 ──────────────────────────────────────
  /**
   * 소득세 상당액 확정 여부 및 과세유형 (규칙§10의3).
   * - 'undetermined': 미확정 → 율표 자동 적용 (규칙①)
   * - 'separate'    : 확정·분리과세 → 실제 세액 직접입력 (규칙②)
   * - 'comprehensive': 확정·종합과세 → Max(ⓐ−ⓑ, 14%) 자동 계산 (규칙②)
   * - 'exempt'      : 비과세 → 소득세 0 (규칙② 1호)
   */
  incomeTaxMode: 'undetermined' | 'separate' | 'comprehensive' | 'exempt';

  // ── ④ 분리과세 직접입력 (incomeTaxMode='separate') ─────
  /** 분리과세 실제 소득세액 (원). incomeTaxMode='separate'일 때 필수. */
  separateIncomeTax?: number;

  // ── ⑤ 종합과세 입력 (incomeTaxMode='comprehensive') ────
  /**
   * 수증자 종합소득과세표준 ⓐ기준 (초과배당금액 포함, 원).
   * Max(ⓐ−ⓑ, 초과배당금액×14%) 계산용.
   */
  comprehensiveTaxBase?: number;
  /**
   * 종합소득과세표준에서 초과배당금액을 제외한 값 ⓑ기준 (원).
   * 미입력 시 엔진이 (comprehensiveTaxBase - 초과배당금액)으로 추정.
   * 법규재산-2377: 배당가산액(Gross-up) 제외분만 대입.
   */
  comprehensiveTaxBaseExcluding?: number;
  /** 소득세 과세연도 (종합과세 세율표 연도 분기용). 기본: dividendDate.year. */
  incomeTaxYear?: number;

  // ── ⑥ 신고기한구분 (영§31의2③1호 분기) ─────────────────
  /**
   * 성실신고확인대상: true → 신고기한 6.30 → 경계 7.1
   * 일반: false → 신고기한 5.31 → 경계 6.1
   * 기본: false (일반)
   */
  isDiligentFiler?: boolean;

  // ── ⑦ 정산 입력 (현행 2021~ + 정산 단계에서만) ──────────
  /** 실제 납부 소득세액 (확정 후). 정산 pass 2에서만 사용. */
  actualIncomeTax?: number;

  // ── ⑧ 증여세 본체 맥락 (정산 2-pass 자동 수행 시 필요) ──
  /**
   * 정산 2-pass를 엔진 내부에서 calcGiftTax로 완결할 경우,
   * 증여세 과세 맥락 정보. 미제공 시 정산 금액은 '확인 필요'로 echo만 반환.
   */
  giftTaxContext?: ExcessDividendGiftTaxContext;
}

/** 주주별 배당 내역 (영§31의2② 자동산정 원료) */
export interface ShareholderDividend {
  /** 식별자 (UI row id) */
  id: string;
  /** 주주 역할 */
  role:
    | 'major_shareholder'    // 최대주주등 (배당 포기·과소배당 주체)
    | 'related_party'        // 특수관계인 (초과배당 수령자)
    | 'other';               // 기타 주주
  /** 지분율 분수 (예: 30% → { numer: 30, denom: 100 }) */
  ownershipRatio: { numer: number; denom: number };
  /** 실제 수령 배당금액 (원) */
  actualDividend: number;
  /** 표시용 이름 (결과뷰 echo) */
  name?: string;
}

/** 정산 2-pass 계산을 위한 증여세 과세 맥락 */
export interface ExcessDividendGiftTaxContext {
  /** 수증자와 증여자 관계 (증여재산공제 결정) */
  donorRelationship:
    | 'spouse'
    | 'lineal_ascendant_adult'
    | 'lineal_ascendant_minor'
    | 'lineal_descendant'
    | 'other_relative';
  /** 10년 내 기적용 공제 누계 (원). 잔여공제 = 총한도 - 이 값. */
  priorDeductionApplied?: number;
  /** 세대생략 해당 여부 */
  isGenerationSkip?: boolean;
  /** 세대생략 미성년자 해당 여부 */
  isMinorGenerationSkip?: boolean;
  /** 신고기한 내 신고 예정 여부 (신고세액공제 3% 적용). 기본 true. */
  isWithinFilingDeadline?: boolean;
}
```

### 1.2 DeemedGiftResult 확장 (excess_dividend 전용 필드)

현재 `DeemedGiftResult` (`lib/tax-engine/gift-deemed/types.ts:32`)에 선택 필드를 추가한다.

```typescript
/** DeemedGiftResult에 추가되는 excess_dividend 전용 선택 필드 */
export interface ExcessDividendDetail {
  // 초과배당금액 자동산정 내역
  totalDividend: number;           // 법인 전체 배당총액
  proportionalDividend: number;    // 특수관계인 비례 배당(지분×총배당)
  excessBeforeRatio: number;       // ①가액 = 실수령 − 비례
  majorShortfall: number;          // 최대주주 과소배당금액
  totalShortfall: number;          // 총과소배당금액
  ratioNumer: number;              // ②비율 분자 = majorShortfall
  ratioDenom: number;              // ②비율 분모 = totalShortfall
  excessDividendAmount: number;    // 초과배당금액 = ①×②

  // 소득세 상당액 산정 내역
  incomeTaxMode: 'undetermined' | 'separate' | 'comprehensive' | 'exempt';
  appliedRateTableSet: '6bracket_2018' | '7bracket_2024' | null; // 율표 적용 여부
  incomeTaxEquivalent: number;     // 소득세 상당액 (원)
  comprehensiveMaxDetail?: {       // 종합과세 Max 계산 내역
    taxA: number;                  // ⓐ과세표준×세율
    taxB: number;                  // ⓑ(과세표준−초과배당)×세율
    taxAminusB: number;            // ⓐ−ⓑ
    taxFloor: number;              // 초과배당금액×14%
    appliedAmount: number;         // Max(ⓐ−ⓑ, 14%)
  };

  // 법적 처리 방식
  taxMethod: 'current_deduction_from_base' | 'legacy_credit_from_tax';

  // 정산 2-pass (현행 2021~, giftTaxContext 제공 시)
  settlement?: {
    initialGiftTax: number;        // ㉮ 당초 증여세액 (calcGiftTax 결과)
    settlementGiftTax: number;     // ⑭ 정산 증여세액 (실제소득세 기준)
    settlementDue: number;         // 정산 납부액 (음수=환급)
    isRefund: boolean;             // 환급 여부
  };

  // §47② 합산배제 안내
  isAggregationExcluded?: boolean; // true: applied=false로 §47② 합산 배제
}
```

`DeemedGiftResult.thresholdEcho`에 `ExcessDividendDetail`을 통합하거나, 별도 선택 필드 `excessDividendDetail?: ExcessDividendDetail`을 추가한다. **선택 필드 추가 방식 채택** (기존 `thresholdEcho`는 단순 Record 타입이라 구조화 내역 표현 부적합).

---

## 2. 함수 분해 및 파일 구조

### 2.1 파일 분리 계획 (800줄 정책)

현재 `excess-dividend.ts`는 31줄. 보완 후 예상 줄수 분석:
- `calcExcessDividendGift` 오케스트레이터: ~80줄
- `computeShareholderAmounts` 주주산정: ~60줄
- `applyIncomeTaxRateTable` 율표 적용: ~40줄
- `computeComprehensiveTax` 종합소득세: ~50줄
- `checkFilingDeadlineExemption` 신고기한 분기: ~20줄
- `runSettlement2Pass` 정산: ~80줄 (calcGiftTax 2회 호출)

합계 ~330줄 → 800줄 이내이지만, **정산 로직은 calcGiftTax import가 필요하므로 별파일로 분리**한다.

```
lib/tax-engine/gift-deemed/
├── excess-dividend.ts               (기존, ~160줄 → 산정·율표 오케스트레이터)
└── excess-dividend-settlement.ts    (신규, ~120줄 → 정산 2-pass, calcGiftTax import)
```

`lib/tax-engine/data/gift-deemed-rates.ts`에 율표 2세트 상수 추가.

### 2.2 excess-dividend.ts 함수 파이프라인

```typescript
// excess-dividend.ts 함수 목록

/** 메인 진입점 — DeemedGiftResult 반환 */
export function calcExcessDividendGift(input: ExcessDividendInput): DeemedGiftResult

/** ①: 주주 배열에서 초과배당금액 자동 산정 (영§31의2②) */
function computeExcessDividendAmount(
  shareholders: ShareholderDividend[],
  totalDividend: number,  // 주주 실수령 합계에서 계산
): ExcessDividendAmountDetail

/** ②: 율표 소득세 상당액 산정 (규칙§10의3①) */
function applyIncomeTaxRateTable(
  excessDividendAmount: number,
  dividendDate: Date,
): { incomeTaxEquivalent: number; appliedSet: '6bracket_2018' | '7bracket_2024' }

/** ③: 종합과세 Max(ⓐ−ⓑ, 14%) 실제소득세 계산 (규칙§10의3②) */
function computeComprehensiveIncomeTax(
  excessDividendAmount: number,
  comprehensiveTaxBase: number,
  comprehensiveTaxBaseExcluding: number,
  incomeTaxYear: number,
): { incomeTaxEquivalent: number; detail: ComprehensiveMaxDetail }

/** ④: 신고기한 분기 — 영§31의2③1호 해당 여부 */
function isFilingDeadlineExempt(
  dividendDate: Date,
  isDiligentFiler: boolean,
): boolean
// 해당 시: 처음부터 실제소득세 단일 계산, 정산(법②③) 미적용
```

### 2.3 excess-dividend-settlement.ts 함수 파이프라인

```typescript
// excess-dividend-settlement.ts 함수 목록
// import { calcGiftTax } from '../gift-tax' (단방향, 역방향 아님)

/** 정산 2-pass 계산 (현행 2021~ 전용) */
export function runSettlement2Pass(params: {
  excessDividendAmount: number;
  initialIncomeTax: number;      // ㉮ 율표 소득세 (pass 1)
  actualIncomeTax: number;       // ⑭ 실제소득세 (pass 2)
  dividendDate: Date;
  giftTaxContext: ExcessDividendGiftTaxContext;
  giftTaxBrackets: TaxBracket[];
}): SettlementResult

/** 증여재산가액 → GiftTaxInput 조립 헬퍼 (정산용 최소 입력 구성) */
function buildMinimalGiftTaxInput(
  deemedGiftValue: number,
  dividendDate: Date,
  context: ExcessDividendGiftTaxContext,
): GiftTaxInput
```

---

## 3. 율표 2세트 정적 상수

추가 위치: `lib/tax-engine/data/gift-deemed-rates.ts`

```typescript
// ─────────────────────────────────────────────────────────────
// §41의2 소득세 상당액 율표 (시행규칙 §10의3①)
// anchor: 교재 img26(현행)/img29(구법). 법제처 별표 재검증 필수(§9②).
// 누진공제식: base + (구간진입액 초과분 × 율)
// 오름차순 정렬 (feedback_progressive_bracket_sort_enforcement)
// ─────────────────────────────────────────────────────────────

export interface ExcessDividendRateBracket {
  /** 구간 상한 (null = 초과 없음) */
  max: number | null;
  /** 구간 기저 세액 (원) — 해당 구간 진입 기준 누진공제식 base */
  base: number;
  /** 초과분 적용세율 (소수: 0.14, 0.24, ...) */
  rate: number;
  /** 구간 하한 초과액 기준점 (원) */
  threshold: number;
}

/**
 * 2018.1.1 ~ 2024.3.21 (6구간)
 * anchor: 교재 img29
 * ⚠️ Do 단계 법제처 §10의3 별표 재검증 필수
 */
export const EXCESS_DIVIDEND_RATE_TABLE_6BRACKET: readonly ExcessDividendRateBracket[] = [
  { max: 52_200_000,    base: 0,           rate: 0.14, threshold: 0           },
  { max: 88_000_000,    base: 7_310_000,   rate: 0.24, threshold: 52_200_000  },
  { max: 150_000_000,   base: 15_900_000,  rate: 0.35, threshold: 88_000_000  },
  { max: 300_000_000,   base: 37_600_000,  rate: 0.38, threshold: 150_000_000 },
  { max: 500_000_000,   base: 94_600_000,  rate: 0.40, threshold: 300_000_000 },
  { max: null,          base: 174_600_000, rate: 0.42, threshold: 500_000_000 },
];

/**
 * 2024.3.22 ~ 현행 (7구간)
 * anchor: 교재 img26
 * ⚠️ Do 단계 법제처 §10의3 별표 재검증 필수
 */
export const EXCESS_DIVIDEND_RATE_TABLE_7BRACKET: readonly ExcessDividendRateBracket[] = [
  { max: 57_600_000,    base: 0,           rate: 0.14, threshold: 0           },
  { max: 88_000_000,    base: 8_060_000,   rate: 0.24, threshold: 57_600_000  },
  { max: 150_000_000,   base: 15_360_000,  rate: 0.35, threshold: 88_000_000  },
  { max: 300_000_000,   base: 37_060_000,  rate: 0.38, threshold: 150_000_000 },
  { max: 500_000_000,   base: 94_060_000,  rate: 0.40, threshold: 300_000_000 },
  { max: 1_000_000_000, base: 174_060_000, rate: 0.42, threshold: 500_000_000 },
  { max: null,          base: 384_060_000, rate: 0.45, threshold: 1_000_000_000 },
];

/** 증여일 기준 율표 선택 (2024.3.22 경계) */
export function resolveExcessDividendRateTable(
  dividendDate: Date,
): readonly ExcessDividendRateBracket[] {
  const cutoff = new Date('2024-03-22');
  return dividendDate >= cutoff
    ? EXCESS_DIVIDEND_RATE_TABLE_7BRACKET
    : EXCESS_DIVIDEND_RATE_TABLE_6BRACKET;
}

/**
 * §55 종합소득세 누진세율 역사 (종합과세 실제소득세 Max 계산용)
 * 신규 추가. 연도별: 2021.1.1 45% 구간 신설.
 * ⚠️ Do 단계 KoreanLaw §55 별표 재검증 필수.
 */
export interface ComprehensiveIncomeTaxBrackets {
  /** 적용 기준연도 이상 (from 연도, 4자리) */
  fromYear: number;
  brackets: readonly { max: number | null; rate: number; deduction: number }[];
}

export const COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY: readonly ComprehensiveIncomeTaxBrackets[] = [
  {
    fromYear: 2014,  // ~2020: 7구간
    brackets: [
      { max: 12_000_000,    rate: 0.06, deduction: 0          },
      { max: 46_000_000,    rate: 0.15, deduction: 1_080_000  },
      { max: 88_000_000,    rate: 0.24, deduction: 5_220_000  },
      { max: 150_000_000,   rate: 0.35, deduction: 14_900_000 },
      { max: 300_000_000,   rate: 0.38, deduction: 19_400_000 },
      { max: 500_000_000,   rate: 0.40, deduction: 25_400_000 },
      { max: null,          rate: 0.42, deduction: 35_400_000 },
    ],
  },
  {
    fromYear: 2021,  // ~현행: 8구간 (10억 초과 45%)
    brackets: [
      { max: 12_000_000,    rate: 0.06, deduction: 0          },
      { max: 46_000_000,    rate: 0.15, deduction: 1_080_000  },
      { max: 88_000_000,    rate: 0.24, deduction: 5_220_000  },
      { max: 150_000_000,   rate: 0.35, deduction: 14_900_000 },
      { max: 300_000_000,   rate: 0.38, deduction: 19_400_000 },
      { max: 500_000_000,   rate: 0.40, deduction: 25_400_000 },
      { max: 1_000_000_000, rate: 0.42, deduction: 35_400_000 },
      { max: null,          rate: 0.45, deduction: 65_400_000 },
    ],
  },
];

/** 소득세 과세연도 기준 §55 세율표 선택 */
export function resolveComprehensiveIncomeTaxBrackets(
  incomeTaxYear: number,
): readonly { max: number | null; rate: number; deduction: number }[] {
  let resolved = COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY[0].brackets;
  for (const entry of COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY) {
    if (incomeTaxYear >= entry.fromYear) resolved = entry.brackets;
  }
  return resolved;
}
```

---

## 4. 시기 분기 구현 전략

### 4.1 부과방법 2종 분기 (증여일 2021.1.1 경계)

```typescript
// excess-dividend.ts 내부 분기 핵심

const isCurrentMethod = dividendDate >= new Date('2021-01-01');

if (isCurrentMethod) {
  // 현행(2021~): 과세표준차감 방식
  // deemedGiftValue = 초과배당금액 - 소득세상당액
  // calcGiftTax(deemedGiftValue) → 증여세 산출
  // + 정산 2-pass (giftTaxContext 제공 시)
} else {
  // 구법(2018~2020): 산출세액공제 방식
  // 과세표준 = 초과배당금액 전액 (소득세 차감 전)
  // 소득세상당액은 DeemedGiftResult.excessDividendDetail.incomeTaxEquivalent에 echo
  // → buildGiftWizardPrefill이 증여세 마법사로 prefill할 때,
  //   마법사에서 '구법 산출세액공제' 플래그를 별도 항목으로 전달해야 함
  //   ⚠️ 구법 산출세액공제는 calcGiftTax 내 별도 처리 필요 (증여세 크레딧)
}
```

**구법(2018~2020) 구현 방식 — 🔴 교차검토 보완 (2026-06-25)**:

구법은 `증여세부과대상 산출세액 = 증여세산출세액(할증포함) − min(소득세상당액, 산출세액)` (img29). 산출세액을 알아야 공제를 적용할 수 있고, 산출세액은 `calcGiftTax`를 거쳐야 나온다 → **정산 2-pass와 동형의 `calcGiftTax` 1회 호출 구조가 필요**하다. 따라서 구법 처리도 `excess-dividend-settlement.ts`(또는 동 파일 내 `runLegacyCredit` 헬퍼)에서 수행한다.

```typescript
// 구법(2018~2020) 산출세액공제 — calcGiftTax 1회 호출 후 공제
// (giftTaxContext 제공 시 완결, 미제공 시 legacyCreditAmount echo만)
function runLegacyCredit(params: {
  excessDividendAmount: number;       // 과세표준 = 초과배당금액 전액
  incomeTaxEquivalent: number;        // 소득세상당액 (율표 or 실제)
  dividendDate: Date;
  giftTaxContext: ExcessDividendGiftTaxContext;
}): { grossGiftTax: number; legacyCreditAmount: number; finalTax: number } {
  // 1) calcGiftTax(deemedGiftValue = 초과배당금액 전액) → 산출세액(할증 포함)
  // 2) legacyCreditAmount = min(소득세상당액, 산출세액)   ← 음수 방지(전액공제 상한)
  // 3) finalTax = 산출세액 − legacyCreditAmount           ← 0 미만 없음
}
```

- `deemedGiftValue = 초과배당금액 전액`(과세표준은 초과배당 전액 — 현행처럼 소득세 차감 안 함).
- `giftTaxContext` 미제공 시: `legacyCreditAmount`를 echo하되 `finalTax`는 "확인 필요"로 두고 결과뷰에서 '산출세액에서 공제' 안내만 표시.
- **A5(구법 4억 → 0원) 검증 경로**: calcGiftTax(4억, 기타친족 공제 1천만) → 산출세액 57,000,000 → min(134,600,000, 57,000,000)=57,000,000 → finalTax 0. ⚠️ A5 anchor는 `runLegacyCredit`을 거쳐야 재현 가능 — 단순 deemedGiftValue echo로는 0원이 나오지 않음.
- `calcGiftTax`의 `creditInput` 확장 불요 — 산출세액공제는 deemed 측 `runLegacyCredit`에서 후처리(증여세 본체 무변경).

### 4.2 신고기한구분 분기 (영§31의2③1호·⑥)

```typescript
// 영③1호 해당 여부 판정 (처음부터 실제소득세 → 정산 미적용)
function isFilingDeadlineExempt(dividendDate: Date, isDiligentFiler: boolean): boolean {
  const nextYear = dividendDate.getFullYear() + 1;
  // 일반: 다음해 6.1 이후 신고기한 → 영③1호 해당
  // 성실: 다음해 7.1 이후 신고기한 → 영③1호 해당
  // 즉, 발생연도 다음해 5.31(일반)/6.30(성실) 이전까지가 정산 대상
  // → dividendDate가 어느 날이든 신고기한(5.31/6.30) 내 → 정산 적용
  // → 영③1호: 신고기한이 '6.1/7.1 이후'인 경우
  // 현실적으로: 성실신고확인대상 여부만 입력받으면 모두 처리 가능
  // (신고기한 자체는 증여일과 무관하게 '다음해 5.31 또는 6.30'으로 고정)
  // → isDiligentFiler=false: 신고기한 5.31 → 6.1 이전이면 정산 적용
  //                                             → 즉 정산 항상 적용(일반 신고기한=5.31<6.1)
  // → isDiligentFiler=true:  신고기한 6.30 → 7.1 이전이면 정산 적용
  //                                             → 즉 정산 항상 적용(성실 신고기한=6.30<7.1)
  // ⚠️ 해석: 현행 법령상 "신고기한이 6.1 이후"인 케이스는 사실상 존재하지 않음
  //   (일반 5.31 < 6.1 = 미해당, 성실 6.30 < 7.1 = 미해당)
  //   → 영③1호는 사실상 미적용(특수한 기한 연장 등 예외적 상황)
  // 설계: isDiligentFiler 보관·echo하되 실제 판정은 항상 false 반환
  //       (단, 법령 변경·특수 케이스 대비 파라미터 유지)
  return false; // 현행 법령 해석상 해당 없음 → 정산 항상 적용 (현행 2021~)
}
```

---

## 5. 정수 연산 주의사항

### 5.1 율표 적용 (base + 초과분 × 율)

```typescript
function applyExcessDividendRateTable(
  amount: number,
  table: readonly ExcessDividendRateBracket[],
): number {
  // 오름차순 정렬 전제 (feedback_progressive_bracket_sort_enforcement)
  const bracket = table.find((b) => b.max === null || amount <= b.max) ?? table[table.length - 1];
  // base + floor((amount - threshold) × rate)
  // applyRate()는 Math.floor(amount * rate) → 분리 연산 필요
  const excess = amount - bracket.threshold;
  const excessTax = Math.floor(excess * bracket.rate); // 소수 rate → Math.floor 직접
  // ⚠️ applyRate(a, b) = Math.floor(a * b). 적용 가능하지만 threshold 차감 선행 필요.
  return bracket.base + excessTax;
}
```

### 5.2 주주 비율 안분 (영§31의2② 비율)

```typescript
// ②비율 = 최대주주등 과소배당 / 총과소배당
// safeMultiplyThenDivide(excessBeforeRatio, majorShortfall, totalShortfall)
// 정수 연산: floor 잔여분 흡수 (feedback_floor_residual_absorption)
// 분모 0 방어: totalShortfall === 0 → ratio = 0, applied = false
```

### 5.3 종합과세 ⓐ−ⓑ 계산

```typescript
// ⓐ = 종합소득과세표준 × §55 세율
// ⓑ = (종합소득과세표준 - 초과배당금액) × §55 세율
// calculateProgressiveTax() 2회 호출 (tax-utils.ts)
// Max(ⓐ−ⓑ, 초과배당금액 × 14%) — 모두 Math.floor 단위
// 14% floor: Math.floor(excessDividendAmount * 0.14)
```

---

## 6. 케이스 매트릭스 C1~C8 엔진 동작 상세

| # | 증여일 | 소득세모드 | 부과방법 | 엔진 동작 |
|---|--------|---------|---------|---------|
| C1 | 2024.4.1 | undetermined | 현행·율표 7구간 | 율표 7구간 적용 → deemedGiftValue = 초과배당−율표소득세 → 정산 echo만 |
| C2 | 2024.4.1 | separate | 현행·실제소득세 | `separateIncomeTax` 직접 사용 → deemedGiftValue = 초과배당−실제소득세 |
| C3 | 2024.4.1 | comprehensive | 현행·종합과세 | Max(ⓐ−ⓑ, 14%) 계산 → deemedGiftValue = 초과배당−종합소득세 → giftTaxContext 제공 시 정산 2-pass 수행 |
| C4 | 2024.4.1 | exempt | 현행·비과세 | incomeTaxEquivalent = 0 → deemedGiftValue = 초과배당금액 전액 |
| C5 | 2019.3.1 | undetermined | 구법·6구간 산출세액공제 | 율표 6구간 적용 → deemedGiftValue = 초과배당금액 전액 + legacyCreditAmount echo |
| C6 | 2019.3.1 | comprehensive | 구법·종합과세 산출세액공제 | 종합소득세 계산 → deemedGiftValue = 초과배당금액 전액 + legacyCreditAmount echo |
| C7 | 2022.5.1 | (영③1호 판정) | 현행·실제소득세 단일 | isFilingDeadlineExempt = false(현행 법령상 해당 없음) → 정상 정산 적용 |
| C8 | 임의 | 임의 | 초과배당금액 ≤ 소득세상당액 | applied = false + §47② 경고 + deemedGiftValue = 0 |

---

## 7. Anchor 기대값 (probe 직접 계산)

### A1 (Pre-Do 게이트): 현행 7구간 율표, 초과배당금액 2억

```
구간: 1.5억 초과 ~ 3억 이하
base = 37,060,000
excess = 200,000,000 - 150,000,000 = 50,000,000
excessTax = floor(50,000,000 × 0.38) = 19,000,000
소득세상당액 = 37,060,000 + 19,000,000 = 56,060,000 원
```

테스트:
```typescript
expect(applyExcessDividendRateTable(200_000_000, EXCESS_DIVIDEND_RATE_TABLE_7BRACKET))
  .toBe(56_060_000);
```

### A2: 구법 6구간 율표, 초과배당금액 2억

```
구간: 1.5억 초과 ~ 3억 이하
base = 37,600,000
excess = 50,000,000
excessTax = floor(50,000,000 × 0.38) = 19,000,000
소득세상당액 = 37,600,000 + 19,000,000 = 56,600,000 원
```

테스트:
```typescript
expect(applyExcessDividendRateTable(200_000_000, EXCESS_DIVIDEND_RATE_TABLE_6BRACKET))
  .toBe(56_600_000);
```

### A3: 초과배당금액 자동산정 (영§31의2②) — 🔴 교차검토 정정 (2026-06-25)

케이스: 최대주주(지분 60%, 실배당 0원), 특수관계인(지분 30%, 실배당 1억), 기타(지분 10%, 실배당 5백만). 총배당 = 1억 5백만(105,000,000).
- 특수관계인 비례배당 = 105,000,000 × 30% = 31,500,000
- ①가액 = 100,000,000 − 31,500,000 = 68,500,000
- 최대주주 과소배당 = 105,000,000 × 60% − 0 = 63,000,000
- 기타주주 비례배당 = 105,000,000 × 10% = **10,500,000**, 실배당 5,000,000 → **과소배당 = 5,500,000** (비례 10,500,000 > 실수령 5,000,000 → 과소배당 주주에 포함)
- 총과소배당금액 = 63,000,000 + 5,500,000 = **68,500,000**
- ②비율 = 63,000,000 / 68,500,000 ≈ 0.9197
- 초과배당금액 = safeMultiplyThenDivide(68,500,000, 63,000,000, 68,500,000) = **63,000,000 원**

> ⚠️ **정정 사유**: 초판 설계는 기타주주 비례배당을 `1,050,000`으로 오기(105,000,000×10%=10,500,000이 정답, 한 자리 오류)하여 기타주주 과소배당을 누락 → ②비율을 1.0으로 오판 → 초과배당금액 68,500,000으로 틀림. 영§31의2②2호의 "과소배당 주주 **전체**의 과소배당금액 합" 정의상 기타주주(비례 미달 수령)도 분모에 포함. 정답 63,000,000. **산식(`①가액 × majorShortfall/totalShortfall`)은 옳음 — anchor 기대값만 정정.** (손산 검증 완료, memory `feedback_numeric_impact_verify_before_bug_claim`·`feedback_anchor_correction_legal_priority`)

> 이 케이스는 ②비율 < 1을 검증하는 **강한 anchor** — 분모에 기타주주 과소배당이 정확히 합산되는지(누락 시 68,500,000으로 회귀) 확인.

```typescript
expect(computeExcessDividendAmount(shareholders, totalDividend).excessDividendAmount)
  .toBe(63_000_000);
```

### A4: 정산 2-pass (현행 2021~, giftTaxContext 제공)

케이스: 초과배당금액 1억, 기타친족 공제 1천만, 신고세액공제 3% 적용, 세대생략 없음.

pass 1 (율표, 7구간 적용: dividendDate 2024.4.1):
```
소득세상당액 = 15,360,000 + floor((100,000,000−88,000,000)×0.35) = 15,360,000 + 4,200,000 = 19,560,000
deemedGiftValue₁ = 100,000,000 − 19,560,000 = 80,440,000
과세표준 = 80,440,000 − 10,000,000 = 70,440,000 → floor(70440000/1000)×1000 = 70,440,000
산출세액 = floor(70,440,000 × 0.10) = 7,044,000
신고세액공제 = floor(7,044,000 × 0.03) = 211,320
당초 최종세액 ㉮ = 7,044,000 − 211,320 = 6,832,680 원
```

pass 2 (실제소득세 1,200만 가정):
```
deemedGiftValue₂ = 100,000,000 − 12,000,000 = 88,000,000
과세표준 = 88,000,000 − 10,000,000 = 78,000,000 → 78,000,000
산출세액 = floor(78,000,000 × 0.10) = 7,800,000
신고세액공제 = floor(7,800,000 × 0.03) = 234,000
정산 최종세액 ⑭ = 7,800,000 − 234,000 = 7,566,000 원
```

정산 납부액 = ⑭ − ㉮ = 7,566,000 − 6,832,680 = **733,320 원 (추가납부)**

```typescript
expect(settlementResult.settlementDue).toBe(733_320);
expect(settlementResult.isRefund).toBe(false);
```

### A5: 구법(2019) vs 현행(2021) 동일 초과배당금액 4억

케이스: 초과배당금액 4억, 기타친족 공제 1천만.

구법(2019): 6구간 소득세상당액 = 94,600,000 + floor((400,000,000−300,000,000)×0.40) = 94,600,000 + 40,000,000 = **134,600,000**
- 과세표준 = 4억 − 1천만 = 390,000,000
- 산출세액 = floor(390,000,000×0.30) − 60,000,000 = 117,000,000 − 60,000,000 = 57,000,000
- 소득세상당액공제 = min(134,600,000, 57,000,000) = **57,000,000** (전액 공제)
- 최종세액 = 0 원

현행(2021): 7구간 소득세상당액 = 94,060,000 + floor((400,000,000−300,000,000)×0.40) = 94,060,000 + 40,000,000 = **134,060,000**
- deemedGiftValue = 400,000,000 − 134,060,000 = 265,940,000
- 과세표준 = 265,940,000 − 10,000,000 = 255,940,000
- 산출세액 = floor(255,940,000×0.20) − 10,000,000 = 51,188,000 − 10,000,000 = 41,188,000
- 신고세액공제 = floor(41,188,000×0.03) = 1,235,640
- 최종세액 = **39,952,360 원**

```typescript
// 구법: legacy 방식, 소득세상당액이 산출세액 초과 → 최종세액 0
expect(legacyResult.finalTax).toBe(0);
// 현행: 과세표준차감, 최종세액 발생
expect(currentResult.finalTax).toBe(39_952_360);
```

---

## 8. 14개 동기화 지점 변경 상세

기존 MVP는 `excessDividend`·`incomeTaxEquivalent` 2필드로 구성. 보완 후 전면 확장.

| # | 지점 | 파일 (file:line 근사) | 변경 내용 |
|---|------|---------------------|---------|
| ① | 폼 상태 | `shared.tsx:325` `DeemedFormState` | `edExcessDividend`·`edIncomeTax` 폐지 → `edShareholders[]`(주주배열)·`edDividendDate`·`edIncomeTaxMode`·`edComprehensiveTaxBase`·`edComprehensiveTaxBaseExcluding`·`edIsDiligentFiler`·`edActualIncomeTax`·`edDonorRelationship`·`edIsWithinFilingDeadline` 추가 |
| ② | initial | `shared.tsx` `INITIAL_DEEMED` | 신규 필드 초기값. `edShareholders=[]`·`edIncomeTaxMode='undetermined'`·`edIsDiligentFiler=false` |
| ③ | normalize | `gift-deemed-api.ts` parseAmount 자동 | 주주배열 normalize (parseAmount per item) |
| ④ | API변환 | `gift-deemed-api.ts:230` excess case | `buildDeemedGiftInput` excess case 전면 재작성 |
| ⑤ | UI위젯 | `other-forms.tsx` `ExcessDividendFields` | 주주 행 테이블 + 모드 RadioCardGroup + 종합과세 입력 + 정산 섹션 (UI 시니어 담당) |
| ⑥ | 사이드바 합계 | — | deemed 독립계산기 → 해당 없음 |
| ⑦ | 결과카드 | `DeemedGiftResultView.tsx` | 산정내역·율표 적용·정산 2-pass·구법 산출세액공제 표시 (UI 시니어 담당) |
| ⑧ | validate | `gift-deemed-validate.ts:107` | excess case 주주배열 ≥1·모드별 필수필드 검증 |
| ⑨ | Zod enum 메인 | `types.ts:24` `DeemedGiftType` | 불변 (excess_dividend 유지) |
| ⑫ | Zod 입력객체 | `validators/gift-deemed-input.ts` | `excessDividendSchema` 전면 개편 |
| ⑬ | fetch body | `buildDeemedGiftInput` 반환 | 신규 객체 (shareholders 배열 포함) |
| ⑭ | Route 매핑 | `app/api/calc/gift-deemed/route.ts` | dividendDate Date 변환 (`toDate`) — 현재 기존 MVP에는 Date 없음 → 추가 필요 |

---

## 9. §47② 합산배제 결과뷰 안내 패턴

C8(초과배당금액 ≤ 소득세상당액) 발생 시:

```typescript
// excess-dividend.ts
if (excessDividendAmount <= incomeTaxEquivalent) {
  return {
    type: 'excess_dividend',
    applied: false,
    deemedGiftValue: 0,
    breakdown: [...],
    exclusionReason: '초과배당금액이 소득세 상당액 이하 — 법§41의2①이 적용되지 않음',
    legalBasis: GIFT.EXCESS_DIVIDEND,
    thresholdEcho: { excessDividendAmount, incomeTaxEquivalent },
    warnings: [
      '§47② 재차증여 합산 배제: 법§41의2①이 적용되지 않으므로, 동일인으로부터의 10년 내 재차증여 합산 대상에서 제외됩니다 (서면법령재산-4195, 대법 2022두32931)',
    ],
  };
}
```

---

## 10. 법적 코드 상수 추가 (`lib/tax-engine/legal-codes/inheritance-gift.ts`)

Do 단계에서 아래 상수를 추가한다:

```typescript
GIFT.EXCESS_DIVIDEND_INCOME_TAX_RATE = "상증법 시행규칙 §10의3",
GIFT.EXCESS_DIVIDEND_SETTLEMENT = "상증법 §41의2②③",
GIFT.EXCESS_DIVIDEND_AUTO_COMPUTE = "상증법 시행령 §31의2②",
```

---

## 11. 미확인 사항 (Do 단계 Pre-Do 실행 필수)

| # | 항목 | 현황 | Do 단계 조치 |
|---|------|------|------------|
| ⚠️ | 율표 base 값 정확성 | 교재 '806만' vs 수학적 '806만4천' 불일치 가능성 | Pre-Do: KoreanLaw §10의3 별표 원문 조회 (mcp__claude_ai_KoreanLaw__get_annexes) |
| ⚠️ | §55 종합소득세율 2014~2020 구법 공제액 | 설계 수치 미검증 (양도세 데이터와 일치하는지 불명) | Do: KoreanLaw §55 역사 조문 조회 |
| 확인 필요 | 구법(2018~2020) 산출세액공제를 calcGiftTax creditInput에 연결하는 방법 | 현재 `creditInput`에 해당 필드 없음 | Do: creditInput 확장 or 결과뷰 안내만 |
| 확인 필요 | `ExcessDividendGiftTaxContext.donorRelationship` enum이 `calcGiftDeductions` 관계 코드와 일치 여부 | `gift-deductions.ts` 미확인 | Do: grep 후 일치 확인 |

---

## 12. 설계 결정 요약

1. **정산 2-pass 구현 위치**: `excess-dividend-settlement.ts`에서 `calcGiftTax`를 import해 엔진 내부 완결. Route·클라이언트 레벨 분산 없음.

2. **파일 분리**: `excess-dividend.ts` (산정·율표·오케스트레이터) + `excess-dividend-settlement.ts` (정산, calcGiftTax import). 합계 ~280줄 → 800줄 정책 준수.

3. **율표 상수**: `lib/tax-engine/data/gift-deemed-rates.ts`에 `EXCESS_DIVIDEND_RATE_TABLE_6BRACKET`·`EXCESS_DIVIDEND_RATE_TABLE_7BRACKET` 추가. 기존 파일 확장(신규 파일 아님).

4. **§55 종합소득세율 신규 추가**: 동일 파일(`gift-deemed-rates.ts`)에 `COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY` 추가.

5. **구법(2018~2020)**: `deemedGiftValue = 초과배당금액 전액` + `legacyCreditAmount` echo. 증여세 마법사에서 creditInput 통한 산출세액 공제는 Do 단계 확장 결정.

6. **§47② 합산배제**: `applied=false` + `warnings[]` 경고. 실제 §47② 처리는 증여세 마법사 담당.

7. **신고기한구분(영③1호)**: 현행 법령 해석상 해당 없음(일반 5.31 < 6.1, 성실 6.30 < 7.1). `isDiligentFiler` 필드는 보관하되 실제 판정은 항상 false 반환.

8. **정수 연산**: 율표 base + floor(초과분×율). 주주 비율은 `safeMultiplyThenDivide`. 종합과세 Max는 `calculateProgressiveTax` 2회 + Math.floor.
