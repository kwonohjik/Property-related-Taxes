# 증여세 PDF 사례 1·2 — 엔진·UI 통합 디자인

> 계획서: [`docs/00-pm/gift-tax-pdf-cases-1-2.plan.md`](../../00-pm/gift-tax-pdf-cases-1-2.plan.md)
> 작성일: 2026-05-20
> Scope: 동일인 §47 합산 + §58 안분 한도 + §57 할증 한도 + 신고서 양식 표 12행/18행

---

## 1. 케이스 인벤토리 매트릭스 (Plan §2 매트릭스, Do 진입 강제 조건)

| ID | donor 그룹 | 회차 수 | 미성년 | ①>20억 | 할증율 | §47 합산 | §58 안분 | §57 한도 | 결과 행수 | anchor | 핵심 finalTax |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **C1-1** | A(부모) | 1차 | N | — | — | 0 | 0 | — | 12 | 6 | ⑫=48,500,000 |
| **C1-2** | A(부모) | 2차 | N | — | — | 1차 ① | ✓ | — | 12 | 7 | ⑫=172,660,000 |
| **C1-3** | A(부모) | 3차 (PDF 사례1) | N | — | — | 1+2차 ① | ✓ | — | 12 | **7** | **⑫=194,000,000** |
| **C2-1** | B(조부모) | 1차 | N | N | 30% | 0 | 0 | 0 | 18 | 6 | ⑱=50,440,000 |
| **C2-2** | B(조부모) | 2차 | N | N | 30% | 1차 ① | ✓ | ✓ (16,655,844) | 18 | 14 | ⑱=165,191,000 |
| **C2-3** | B(조부모) | 3차 (PDF 사례2) | N | N | 30% | 1+2차 ① | ✓ | ✓ (71,518,644) | 18 | **18** | **⑱=475,397,000** |
| **C3-1** | B(조부모) | 1차 | **Y** | **Y** | 40% | 0 | 0 | 0 | 18 | 후속 | — |
| **C4-1** | A+B 혼합 | — | — | — | — | 그룹별 별개 | — | — | warning | 4 | (회귀) |
| **C5-1** | C(배우자) | 1차 | — | — | — | 6억 공제 | — | — | 12 | 후속 | — |
| **C6-1** | D(직계비속) | — | — | — | — | — | — | — | 12 | 후속 | — |

**Do 진입 조건**: C1-1 ~ C2-3 + C4-1 (총 62 anchor: 20 + 38 + 4) 매트릭스 enumerate 완료.

**핵심 anchor 값 검증 표 (I-7)**:
- C1-3 (PDF 사례 1 3차): ⑤=1,470,000,000 / ⑦=428,000,000 / ⑨=279,510,204 / ⑩=228,000,000 / ⑫=**194,000,000**
- C2-3 (PDF 사례 2 3차): ⑤=1,770,000,000 / ⑦=548,000,000 / ⑩=71,518,644 / ⑫=113,100,000 / ⑬=661,100,000 / ⑮=238,395,480 / ⑰=14,703,000 / ⑱=**475,397,000**

---

## 2. 타입 정의

### 2.1 입력 (`types/inheritance-gift.types.ts`)

```ts
// F-4 정정: 8 enum 값 → 7 그룹 매핑
export type GiftDonorRelation =
  | "father" | "mother"        // 그룹 A
  | "grandparent"              // 그룹 B
  | "spouse"                   // 그룹 C
  | "lineal_descendant"        // 그룹 D
  | "sibling"                  // 그룹 E
  | "other_relative"           // 그룹 F
  | "other";                   // 그룹 G  (총 8 enum 값)

export type DonorGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G"; // 7 그룹

export interface PriorGift {
  giftDate: string;                                  // ISO date
  isHeir: boolean;                                   // (기존)
  giftAmount: number;                                // = 그 회차의 ①
  giftTaxPaid: number;                               // = 그 회차의 ⑱(차가감자진납부세액) — §58과 무관, 정보용
  giftTaxBase?: number;                              // = 그 회차의 ⑤ (필수: §47 합산 시)
  doneeRelation?: DonorRelation;                     // (기존)
  // 신규 (Phase A)
  donor?: GiftDonorRelation;                         // 그 회차의 증여자
  computedTax?: number;                              // = 그 회차의 ⑦ (§58 ⑭용)
  additionalGenerationSkipSurcharge?: number;        // = 그 회차의 ⑫ (§57 ⑨용)
  wasGenerationSkip?: boolean;                       // §57 적용 여부 (F-9: 그 회차 신고서에 §57 적용했는지 검증용. 보통 donor=grandparent 시 true. 예외 케이스 대비 명시 입력 가능. 미입력 시 donor에서 자동 도출)
}

export interface GiftTaxInput {
  // ... (기존 필드)
  donor: GiftDonorRelation;                          // 신규: 금번 증여자 (필수)
  // isGenerationSkip 폐지 (D-12): donor === "grandparent" 로 자동 도출
  // 마이그레이션: 본 PR로 즉시 필드 제거 (외부 호출자 grep 후 일괄 갱신)
  isMinorDonee: boolean;                             // (기존)
  // ...
}
```

**호환성 마이그레이션 정책 (D-12·D-18)**:
- `GiftTaxInput.donor`는 **즉시 required**. optional 단계 거치지 않음.
- `GiftTaxInput.isGenerationSkip` 필드 폐지: donor 도입과 동시에 type-level 제거.
- 외부 호출자 통합 grep (Phase A 진입 전, F-6 일관):
  ```bash
  grep -rn "calcGiftTax\|GiftTaxInput\|isGenerationSkip\|priorGiftTaxPaid\|PriorGift\b" \
    lib/ app/ components/ __tests__/
  ```
- 발견된 모든 호출자(테스트·API route·burdened-gift Phase 3 연동 등)를 1 PR 내 일괄 갱신.

### 2.2 결과 (`types/inheritance-gift.types.ts`)

```ts
export interface GenerationSkipSurchargeDetail {
  surchargeBase: number;            // ⑧ = ⑦ × 비율 × 할증율 (gross)
  nonParentLinealRatio: number;     // 부모 제외 직계존속 비율 (0~1)
  surchargeRate: number;            // 0.30 or 0.40
  priorAdditionalCumulative: number; // ⑨ = Σ⑫_prior
  surchargeCreditLimit: number;     // ⑩ = ⑦ × ⑤_prior/⑤ × 할증율
  priorSurchargeCredit: number;     // ⑪ = Min(⑨, ⑩)
  additionalSurcharge: number;      // ⑫ = ⑧ − ⑪
  totalComputedTaxWithSurcharge: number; // ⑬ = ⑦ + ⑫
}

export interface PriorGiftCreditDetail {
  priorComputedTax: number;         // ⑭ = 가장 최근 합산 회차의 ⑦
  priorAddedTaxBase: number;        // ⑤_prior
  aggregatedTaxBase: number;        // ⑤
  creditLimit: number;              // ⑮ = ⑦ × ⑤_prior/⑤
  priorPaidCredit: number;          // ⑯ = Min(⑭, ⑮)
}

export interface GiftTaxResult {
  // ... (기존)
  donorGroup: DonorGroup;                            // 신규
  generationSkipSurchargeDetail?: GenerationSkipSurchargeDetail;  // C2-* 활성
  priorGiftCreditDetail?: PriorGiftCreditDetail;     // C1-2·1-3·C2-2·2-3 활성
  filingFormRows: FilingFormRow[];                   // 12행 or 18행
  warnings: string[];                                // 다른 그룹 priorGifts 무시 안내 등
}

export interface FilingFormRow {
  number: string;                   // "①" ~ "⑱"
  label: string;                    // "증여재산가액" 등
  amount: number;
  formula?: string;                 // "⑦ × ⑤_prior / ⑤" 등 (선택)
  lawRef?: string;
}
```

---

## 3. 엔진 파이프라인

```
calcGiftTax(input):
  STEP 1  재산 평가          (현행)
  STEP 2  비과세 차감         (현행)
  STEP 3  §47 동일인 합산     ← 그룹화 적용
            ├ aggregatePriorGiftsForGift(priorGifts, giftDate, currentDonor)
            ├ output: { totalAmount, totalComputedTax, priorAddedTaxBase,
            │           totalAdditionalSurcharge, nonParentLinealAmount }
            └ warnings: 다른 그룹 priorGifts 무시 알림
  STEP 4  §53 증여공제        (현행)
  STEP 5  과세표준 ⑤          (현행)
  STEP 6  §56 산출세액 ⑦      (현행)
  STEP 7  §57 할증과세        ← 한도 공식 신규
            ├ donorGroup === "B" ? 활성 : 비활성
            ├ rate = (isMinor && currentGift > 2_000_000_000) ? 0.40 : 0.30
            ├ ratio = (nonParentLinealAmount + currentGiftValue) / (currentGiftValue + priorTotal)  // B 그룹은 = 1 (분자에 현재 회차 ① 포함, F-2 일관)
            ├ surchargeBase = applyRate(⑦ × ratio, rate)               // ⑧
            ├ limit = applyRate(⑦ × priorAddedTaxBase / ⑤, rate)       // ⑩
            ├ priorCredit = Min(priorAdditionalCumulative, limit)      // ⑪
            └ additionalSurcharge = Max(0, surchargeBase − priorCredit) // ⑫
  STEP 8  §58 안분 한도       ← 한도 공식 신규
            ├ priorComputedTax = aggregation.totalComputedTax           // ⑭
            ├ limit58 = applyRate(⑦, priorAddedTaxBase / ⑤)             // ⑮
            └ priorPaidCredit = Min(priorComputedTax, limit58)          // ⑯
  STEP 9  §69 신고세액공제    ← 산출세액합계 기준
            ├ totalComputedTax = ⑦ + additionalSurcharge                // ⑬
            ├ reportingBase = Max(0, totalComputedTax − priorPaidCredit − foreignTaxCredit)
            └ reportingCredit = applyRate(reportingBase, 0.03)          // ⑰
  STEP 10 결정세액 ⑱          finalTax = Max(0, ⑬ − ⑯ − ⑰ − foreignTaxCredit)
  STEP 11 filingFormRows 빌드 (12행 or 18행)
            ├ buildFilingFormRows(
            │   result: GiftTaxResult,
            │   hasGenerationSkip: boolean,        // = donorGroup === "B" && additionalSurcharge > 0
            │   hasPriorGifts: boolean,             // = priorAggregation.matchedPriorGifts.length > 0
            │ ): FilingFormRow[]
            └ 위치: gift-tax.ts 또는 신규 gift-filing-form-rows.ts (~150줄)
```

**`buildFilingFormRows` 시그니처 (I-8)**:
```ts
export function buildFilingFormRows(
  result: Omit<GiftTaxResult, "filingFormRows">,
  hasGenerationSkip: boolean,
  hasPriorGifts: boolean,
): FilingFormRow[] {
  const rows: FilingFormRow[] = [];

  // ①~⑥ 공통
  rows.push({ number: "①", label: "증여재산가액", amount: result.grossGiftValue, lawRef: GIFT.TAXABLE_VALUE });
  rows.push({ number: "②", label: "채무", amount: 0 });
  rows.push({ number: "③", label: "증여재산가산액", amount: priorAggregation.totalAmount, lawRef: GIFT.AGGREGATION_SAME_PERSON });
  rows.push({ number: "④", label: "증여재산공제", amount: result.totalDeduction });
  rows.push({ number: "⑤", label: "합산과세표준", amount: result.taxBase });
  rows.push({ number: "⑥", label: "세율", amount: bracketRate });
  rows.push({ number: "⑦", label: "산출세액", amount: result.computedTax });

  if (hasGenerationSkip) {
    // ⑧~⑬ (할증)
    rows.push(...generationSkipRows(result, hasPriorGifts));
    // ⑭~⑱
    rows.push(...priorCreditAndFinalRows(result, hasPriorGifts, /*offset18=true*/));
  } else {
    // ⑧~⑫ (12행)
    rows.push(...priorCreditAndFinalRows(result, hasPriorGifts, /*offset18=false*/));
  }
  return rows;
}
```

### 3.1 분기 의사결정 트리

```
priorGifts 필터링 (donor 그룹 일치만 합산, F-5 명확화):
  matched = priorGifts.filter(p => isSameDonorGroup(p.donor, currentDonor))

  if (matched.length === 0)
      → C1-1 / C2-1 단독 신고 (§47 합산·§58 한도·§57 한도 모두 비활성)
  else:
      if (getDonorGroup(currentDonor) === "A")            // 부모
          → §57 비활성 / §58 한도 활성
      else if (getDonorGroup(currentDonor) === "B")       // 조부모
          → §57 활성 + 한도 적용 / §58 한도 활성
      else                                                // C·D·E·F·G
          → §57 비활성 / §58 한도 활성 (그룹 내 합산 자체는 OK)

priorGifts 중 다른 그룹 항목 있음:
  → warnings에 "donor=X 회차는 별개 신고 대상" 추가
  → 합산 미적용
```

---

## 4. 헬퍼 함수 (신규)

### 4.1 `lib/tax-engine/gift-prior-aggregation.ts` (신규, ~200줄)

```ts
import type { GiftDonorRelation, DonorGroup, PriorGift } from "./types/inheritance-gift.types";
import { differenceInYears } from "date-fns";

export function getDonorGroup(donor: GiftDonorRelation): DonorGroup {
  switch (donor) {
    case "father":
    case "mother":            return "A";
    case "grandparent":       return "B";
    case "spouse":            return "C";
    case "lineal_descendant": return "D";
    case "sibling":           return "E";
    case "other_relative":    return "F";
    case "other":             return "G";
  }
}

export function isSameDonorGroup(a: GiftDonorRelation, b: GiftDonorRelation): boolean {
  return getDonorGroup(a) === getDonorGroup(b);
}

export interface PriorAggregationResult {
  /** 합산된 사전증여 (그룹 일치만) */
  matchedPriorGifts: PriorGift[];
  /** § 47 합산 ① 누계 (= 신고서 ③) */
  totalAmount: number;
  /** 합산 사전증여 회차들의 giftTaxPaid 합 (D-11: 정보용, §58 로직과 무관) */
  totalTaxPaid: number;
  /** 가장 최근 합산 회차의 ⑦ (§58 ⑭용, 0이면 단독신고) */
  totalComputedTax: number;
  /** 가장 최근 합산 회차의 ⑤ (§58·§57 한도 분자) */
  priorAddedTaxBase: number;
  /** 사전증여 회차들의 ⑫ 누계 (§57 ⑨) */
  totalAdditionalSurcharge: number;
  /** 부모 제외 직계존속 ① 누계 (그룹 B 합산 시 totalAmount와 동일, 그 외 0) */
  nonParentLinealAmount: number;
  breakdown: CalculationStep[];
  /** 다른 그룹 priorGifts 무시 안내 */
  warnings: string[];
}

export function aggregatePriorGiftsForGift(
  priorGifts: PriorGift[],
  giftDate: string,
  currentDonor: GiftDonorRelation,
): PriorAggregationResult {
  const current = new Date(giftDate);
  const matched: PriorGift[] = [];
  const warnings: string[] = [];

  for (const gift of priorGifts) {
    const elapsedYears = differenceInYears(current, new Date(gift.giftDate));
    if (elapsedYears > 10) continue;

    if (!gift.donor) {
      warnings.push(`사전증여 ${gift.giftDate} — donor 미입력으로 §47 합산 제외`);
      continue;
    }

    if (!isSameDonorGroup(gift.donor, currentDonor)) {
      warnings.push(
        `사전증여 ${gift.giftDate} (증여자=${gift.donor})는 현 증여자(${currentDonor})와 다른 동일인 그룹 — §47 합산 제외, 별개 신고 대상`
      );
      continue;
    }

    matched.push(gift);
  }

  // giftDate 내림차순 정렬 → 첫 번째가 가장 최근
  matched.sort((a, b) => b.giftDate.localeCompare(a.giftDate));

  const totalAmount = matched.reduce((s, p) => s + p.giftAmount, 0);
  const totalComputedTax = matched[0]?.computedTax ?? 0;
  const priorAddedTaxBase = matched[0]?.giftTaxBase ?? 0;
  const totalAdditionalSurcharge = matched.reduce(
    (s, p) => s + (p.additionalGenerationSkipSurcharge ?? 0), 0
  );
  const nonParentLinealAmount = getDonorGroup(currentDonor) === "B" ? totalAmount : 0;

  return {
    matchedPriorGifts: matched,
    totalAmount,
    totalComputedTax,
    priorAddedTaxBase,
    totalAdditionalSurcharge,
    nonParentLinealAmount,
    breakdown: matched.map(p => ({
      label: `§47 합산 (${p.giftDate}, 증여자=${p.donor})`,
      amount: p.giftAmount,
    })),
    warnings,
  };
}
```

### 4.2 `lib/tax-engine/inheritance-gift-common.ts` 보강

`calcGenerationSkipSurcharge` 신규 시그니처 (D-1·D-2·D-3 정정 반영):

```ts
export function calcGenerationSkipSurcharge(
  computedTax: number,
  donorGroup: DonorGroup,
  isMinor: boolean,
  currentGiftValue: number,
  priorAggregation: PriorAggregationResult,
  aggregatedTaxBase: number,
): { detail: GenerationSkipSurchargeDetail | null; additionalSurcharge: number; breakdown: CalculationStep[] } {
  if (donorGroup !== "B") {
    return { detail: null, additionalSurcharge: 0, breakdown: [] };
  }

  const rate = isMinor && currentGiftValue > 2_000_000_000 ? 0.40 : 0.30;
  const totalGiftAmount = currentGiftValue + priorAggregation.totalAmount;

  // ⑧ 분자: 부모 제외 직계존속 ① 합 = (priorAggregation 합) + 현재 회차 ①
  //   priorAggregation.nonParentLinealAmount는 priorGifts의 합만 포함하므로 currentGiftValue 추가
  //   donorGroup === "B" 보장이므로 currentGiftValue 전체가 분자에 포함됨
  const nonParentLinealTotal = priorAggregation.nonParentLinealAmount + currentGiftValue;
  const ratio = totalGiftAmount === 0 ? 0 : nonParentLinealTotal / totalGiftAmount; // 사례 2: 1.0

  // 정수 연산: 단일 floor (PDF anchor와 일치, 이중 floor 회피)
  //   사례 2 ⑧ = floor(548,000,000 × 1.0 × 0.30) = 164,400,000
  const surchargeBase = Math.floor(computedTax * ratio * rate); // ⑧

  // ⑩ 한도: floor(⑦ × ⑤_prior / ⑤ × 할증율) — 단일 floor
  //   사례 2 ⑩ = floor(548M × 770M/1770M × 0.30) = floor(71,518,644.07) = 71,518,644
  const surchargeCreditLimit = aggregatedTaxBase === 0
    ? 0
    : Math.floor(
        computedTax * (priorAggregation.priorAddedTaxBase / aggregatedTaxBase) * rate
      );

  const priorSurchargeCredit = Math.min(
    priorAggregation.totalAdditionalSurcharge,
    surchargeCreditLimit
  ); // ⑪

  const additionalSurcharge = Math.max(0, surchargeBase - priorSurchargeCredit); // ⑫

  const detail: GenerationSkipSurchargeDetail = {
    surchargeBase,
    nonParentLinealRatio: ratio,
    surchargeRate: rate,
    priorAdditionalCumulative: priorAggregation.totalAdditionalSurcharge,
    surchargeCreditLimit,
    priorSurchargeCredit,
    additionalSurcharge,
    totalComputedTaxWithSurcharge: computedTax + additionalSurcharge,
  };

  return { detail, additionalSurcharge, breakdown: [/* 행별 step */] };
}
```

**정수 연산 정책 (memory `feedback_legal_codes` + lib/tax-engine/CLAUDE.md "정수 연산 디테일")**:
- 비율(0~1 부동소수) × 금액 곱셈은 **단일 `Math.floor`** 로 마감.
- `applyRate(amount, rate)`는 `Math.floor(amount * rate)` 와 동치이나, **3개 인자 곱셈은 직접 `Math.floor(a * b * c)`** 사용 (이중 floor 회피).
- 금액 범위 10억원 × 1 × 0.4 = 4억 ≪ Number.MAX_SAFE_INTEGER → BigInt fallback 불필요. 30억 초과 50% 케이스도 안전.

### 4.3 `lib/tax-engine/inheritance-gift-tax-credit.ts` 보강

`calcGiftTaxCredits` 신규 매개변수:
- `priorAggregation: PriorAggregationResult`
- `aggregatedTaxBase: number`
- `totalComputedTaxWithSurcharge: number` (= ⑦ + additionalSurcharge)

§58 한도 산출 (단일 floor, D-2 일관 적용):
```ts
const limit58 = aggregatedTaxBase === 0
  ? 0
  : Math.floor(computedTax * (priorAggregation.priorAddedTaxBase / aggregatedTaxBase)); // ⑮
const priorPaidCredit = Math.min(priorAggregation.totalComputedTax, limit58); // ⑯

// 신고세액공제 (D-3 음수 방지)
const reportingBase = Math.max(
  0,
  totalComputedTaxWithSurcharge - priorPaidCredit - foreignTaxCredit
);
const reportingCredit = Math.floor(reportingBase * 0.03); // ⑰
```

**Legacy `priorGiftTaxPaid` 매개변수 처리 (D-6)**:
- 기존 `GiftTaxCreditParams.priorGiftTaxPaid?: number` 는 **deprecated 표기 후 1 sprint 보존** 후 제거.
- 외부 호출자 확인:
  - `lib/tax-engine/gift-tax.ts` — 본 PR로 priorAggregation 전달로 교체
  - `lib/tax-engine/inheritance-tax.ts` 등 상속세 §28 호출 — `calcGiftTaxCredits` 직접 호출 없음 (확인 grep 필요)
  - 단독 호출자 없으면 즉시 제거 가능.
- Phase A 진입 시 `grep -rn "priorGiftTaxPaid" lib/` 로 외부 호출자 0건 확인 후 제거.

---

## 5. UI 명세

### 5.1 마법사 단계 (현행 유지)

```
Step 1: 증여 기본정보
  ├ 증여일 (DateInput)
  ├ 증여자 (Select, 7옵션 — donor)         ← 신규 [단일 source of truth]
  ├ 수증자 관계 (Select)
  └ 수증자 미성년 여부 (Toggle)
  ※ §57 세대생략 할증 적용 여부는 donor에서 자동 도출 (donor=grandparent ⇔ 적용).
    별도 isGenerationSkip 토글 제거 (D-5) — useEffect 미러링 정책 위반 회피.
    UI는 donor 선택 즉시 "이 증여는 세대생략 할증 30% 대상입니다" 안내 배지 표시 (display only).

Step 2: 증여재산
  ├ 평가방식 (Select: 시가/매매사례가액/감정가액/기준시가)
  └ 평가액 (CurrencyInput)

Step 3: 사전증여 (10년 이내 동일인)
  └ PriorGiftInput (행 N개)
       ├ 증여일자
       ├ 증여자 (Select, 7옵션)            ← 신규
       ├ 증여재산가액 ① (CurrencyInput)
       ├ 합산과세표준 ⑤ (CurrencyInput)    ← 신규 (동일 그룹 시 필수)
       ├ 산출세액 ⑦ (CurrencyInput)        ← 신규 (동일 그룹 시 필수)
       ├ 세대생략 할증 여부 (Toggle)       ← 신규
       └ 추가 할증세액 ⑫ (CurrencyInput, 할증 ON 시만) ← 신규

Step 4: 비과세·공제 입력 (현행)
Step 5: 결과
```

### 5.2 결과 카드 — `GiftTaxFilingFormTable.tsx` (신규)

**동적 행 분기**:
- `result.generationSkipSurchargeDetail !== null` → 18행 (사례 2)
- else → 12행 (사례 1)

**12행 매핑**:
```
① 증여재산가액            = result.grossGiftValue
② 채무                   = 0 (현행 미지원)
③ 증여재산가산액           = aggregation.totalAmount
④ 증여재산공제            = result.totalDeduction
⑤ 합산과세표준            = result.taxBase
⑥ 세율                   = bracket label
⑦ 산출세액                = result.computedTax
⑧ 가산 증여재산 산출세액   = priorGiftCreditDetail.priorComputedTax  (priorGifts=0 → "—")
⑨ 한도                   = priorGiftCreditDetail.creditLimit         (priorGifts=0 → "—")
⑩ 공제액                  = priorGiftCreditDetail.priorPaidCredit    (priorGifts=0 → "—")
⑪ 신고세액공제            = creditDetail.reportingCredit
⑫ 차가감자진납부세액       = result.finalTax
```

**단독 신고 "—" 표시 규칙 (D-4)**:
- `result.priorGiftCreditDetail === null` (priorGifts.matched.length === 0) → ⑧⑨⑩ 셀 "—" 렌더
- `priorGiftCreditDetail`는 합산 priorGift가 1건 이상일 때만 생성
- PDF 사례 1·2 1차 행과 일치

**18행 매핑** (12행 + 7행 추가, 순서 재배치):
```
① ~ ⑥ (동일)
⑦ 산출세액                = result.computedTax
⑧ 할증과세 ⑦×비율×30%      = generationSkipSurchargeDetail.surchargeBase
⑨ 누적 기할증과세액         = generationSkipSurchargeDetail.priorAdditionalCumulative (priorGifts=0 → "—" 표시 권장이나 PDF 사례 2 1차는 0 표기 → 옵션 A: 0 표시)
⑩ 공제한도                = generationSkipSurchargeDetail.surchargeCreditLimit  (priorGifts=0 → "—")
⑪ 차감 기할증              = generationSkipSurchargeDetail.priorSurchargeCredit (priorGifts=0 → "—" or 0)
⑫ 추가 할증세액            = generationSkipSurchargeDetail.additionalSurcharge
⑬ 산출세액합계             = generationSkipSurchargeDetail.totalComputedTaxWithSurcharge
⑭ 가산 증여재산 산출세액   = priorGiftCreditDetail.priorComputedTax            (priorGifts=0 → "—")
⑮ 한도                    = priorGiftCreditDetail.creditLimit                  (priorGifts=0 → "—")
⑯ 공제액                  = priorGiftCreditDetail.priorPaidCredit              (priorGifts=0 → "—" or 0)
⑰ 신고세액공제             = creditDetail.reportingCredit
⑱ 차가감자진납부세액        = result.finalTax
```

**PDF 사례 2 1차 표기 검증 + 옵션 A/B 결정 (D-13)**:
- PDF 사례 2 1차: ⑨=0 / ⑩·⑪·⑭·⑮ 빈 셀 / ⑯=0 / ⑰=1,560,000 / ⑱=50,440,000
- **옵션 A (PDF 형식 그대로)**: ⑨·⑯ = "0" 표기, ⑩·⑪·⑭·⑮ = "—" 표기
- **옵션 B (일관된 0 표기)**: 모든 행 "0" 표기
- **결정: 옵션 A 채택** (PDF 사례 1·2 양식과 완전 일치 우선)
- 렌더 규칙:
  - `priorGifts.matched.length === 0` 시:
    - ⑨ → 0 (priorAdditionalCumulative)
    - ⑩·⑪ → "—" (산식 무의미)
    - ⑭·⑮ → "—" (산식 무의미)
    - ⑯ → 0 (priorPaidCredit)
- ⑰ = 1,560,000 (= ⑬×3% = 52M×3%, priorPaidCredit=0이므로 ⑬에 직접 적용)
- ⑱ = 50,440,000 (= ⑬ − 0 − ⑰)

**시각 디자인**:
- 카드 색상: violet/fuchsia tone (memory `feedback_section_card_numbering`)
- 단위: 모든 숫자 끝 "원" 생략 (memory `feedback_no_won_suffix`)
- 산식 풀어쓰기: "변수 약어·floor()" 사용 금지 (memory `feedback_result_view_korean_formula`)
- 행마다 우측 산식 hint 토글 ("▼ 산식 보기")

### 5.3 사이드바 합계 (해당 없음 — 본 마법사 단일 컬럼)

GiftTaxForm 마법사는 양도세 TransferTaxCalculator와 달리 `WizardSidebar` 미사용 단일 컬럼 패턴. ⑥ 사이드바 합계 동기화 지점은 **본 마법사 패턴에서 해당 없음**으로 명시.

결과 finalTax (⑫ 또는 ⑱)는 `GiftTaxResultView` 핵심 결과 카드에 `text-4xl font-bold` 로 강조 표시 (이미 구현).

WizardSidebar 도입(증여재산가액 / 사전증여 합산 / 예상 과세표준 / 산출세액 / 결정세액 실시간 합계)은 후속 PR로 분리.

#### 사이드바 도입 시 권장 구조 (참고)

```
증여재산가액         ① 510,000,000
사전증여 합산        ③ 1,010,000,000          ← 0이면 행 숨김
공제                ④ -50,000,000
─────────────────
과세표준            ⑤ 1,470,000,000
산출세액            ⑦ 428,000,000
추가 할증세액           113,100,000           ← donor=B && additionalSurcharge>0 시만 표시 (18행 케이스)
기납부세액공제          228,000,000           ← priorPaidCredit>0 시만 표시
신고세액공제             6,000,000
─────────────────
차가감자진납부세액      194,000,000
```

**0원 행 숨김 규칙 (D-7, memory 사이드바 정책)**:
- ③(사전증여 합산), 추가 할증세액, 기납부세액공제, `result.foreignTaxCredit` 등 — **0이면 해당 행 미렌더**
- ①·④·⑤·⑦·신고세액공제·차가감자진납부세액 — 항상 표시 (필수 경로)

**번호 표기 정책 (F-7)**:
- 사이드바는 **번호 생략 + 라벨만 사용** (사례 1=12행/사례 2=18행 번호 차이 회피)
- 결과 카드 `GiftTaxFilingFormTable`만 PDF 형식 번호 ①~⑱ 명시
- 사이드바 라벨: "증여재산가액 / 사전증여 합산 / 공제 / 과세표준 / 산출세액 / 추가 할증세액 / 기납부세액공제 / 신고세액공제 / 차가감자진납부세액"

### 5.4 입력 가이드 카드 (PriorGiftInput 상단)

> 📋 **사전증여 입력 가이드**
> - **증여자**: 현재 증여자와 동일인 그룹(부·모 또는 조부모)만 §47 합산 대상.
>   다른 그룹은 별개 신고로 자동 분리.
> - **합산과세표준 ⑤·산출세액 ⑦**: 그 회차의 증여세 신고서 ⑤·⑦ 값. 없으면 §58 한도 산정 불가.
> - **추가 할증세액 ⑫**: 세대생략 증여 회차에만 입력. 신고서 ⑫ 값.

**후속 PR 메모 (D-14)**:
- 사용자가 사전증여 신고서 사본이 없을 때를 위한 **자동 재계산 헬퍼** 후속 PR:
  - PriorGift 행에 "그 회차 단독 신고 재계산" 버튼 추가
  - 입력: ① giftAmount + donor + 그 회차의 §53 공제 정보 + (할증 시) 세대생략 여부
  - 출력: ⑤·⑦ 자동 계산 (그 회차의 합산은 또 그 이전 회차로 재귀 → 깊이 제한 필요)
  - 본 PR 범위 외 — `gift-tax-prior-recalc.plan.md` 별도 기획.

---

## 6. 14개 동기화 지점 — 세부 위치 + 시니어 분담 (D-16)

**시니어 분담 (Plan §7 시퀀셜 위임)**:
- **엔진 시니어** (`inheritance-gift-tax-senior` + sub `deduction`/`credit`): ①②③④⑧⑨⑫⑭ (8지점)
- **UI 시니어** (`inheritance-gift-tax-ui-senior`): ⑤⑥⑦ (3지점)
- 엔진 시니어 완료 후 UI 시니어가 결과 받아 진행 (시퀀셜)

| # | 파일 | 변경 내용 |
|---|---|---|
| ① | `lib/stores/calc-wizard-store.ts` GiftFormData | `donor: GiftDonorRelation \| ""`, `priorGifts[].donor/.computedTax/.additionalGenerationSkipSurcharge/.wasGenerationSkip/.giftTaxBase` |
| ② | `lib/stores/calc-wizard-initial.ts` createInitialGiftForm | donor: "", priorGifts: [] |
| ③ | `lib/stores/calc-wizard-normalize.ts` normalizeGiftForm | 빈문자→undefined, 숫자 변환 |
| ④ | `lib/calc/gift-tax-api.ts` callGiftTaxAPI | body.donor + body.priorGifts[i] 신규 4필드 명시 spread |
| ⑤ | `components/calc/GiftTaxForm.tsx` + `PriorGiftInput.tsx` | donor Select × 2 + ⑤⑦⑫ Input + 할증 Toggle |
| ⑥ | 사이드바 합계 컴포넌트 | finalTax + (추가할증 18행 케이스만) |
| ⑦ | 결과 카드 `GiftTaxFilingFormTable.tsx` (신규) | 12/18행 동적 분기 |
| ⑧ | `lib/calc/gift-tax-validate.ts` | donor 필수 + 동일 그룹 priorGifts의 ⑤⑦ 필수 (UI fallback 0건) |
| ⑨ | `app/api/calc/gift-tax/route.ts` Zod 메인 | GiftDonorRelationSchema enum 8종 (F-4: 7그룹·8 enum 값) |
| ⑩ | (해당 없음) | — |
| ⑪ | (해당 없음) | — |
| ⑫ | `app/api/calc/gift-tax/route.ts` Zod 입력 객체 | PriorGiftSchema에 donor/computedTax/additionalGenerationSkipSurcharge/wasGenerationSkip + GiftTaxRequestSchema에 donor 필수 |
| ⑬ | `lib/calc/gift-tax-api.ts` callGiftTaxAPI body | `donor: input.donor, priorGifts: input.priorGifts.map(p => ({ ..., donor: p.donor, computedTax: p.computedTax, additionalGenerationSkipSurcharge: p.additionalGenerationSkipSurcharge, wasGenerationSkip: p.wasGenerationSkip, giftTaxBase: p.giftTaxBase }))` |
| ⑭ | `app/api/calc/gift-tax/route.ts` engine input 매핑 | priorGiftsWithin10Years 변환 시 신규 4필드 보존, giftDate Date 변환 (date-coerce) |

**grep 자가점검 명령**:
```bash
grep -n "donor" lib/calc/gift-tax-api.ts app/api/calc/gift-tax/route.ts
grep -n "additionalGenerationSkipSurcharge\|computedTax" components/calc/PriorGiftInput.tsx lib/calc/gift-tax-api.ts
```

---

## 7. 법령 상수 (신규)

`legal-codes/inheritance-gift.ts` 추가:

```ts
export const GIFT = {
  // ... (기존)
  GENERATION_SKIP_LIMIT_FORMULA: "상증법 §57·시행령 §28의2",  // ※ KoreanLaw MCP 검증 후 정정
  PRIOR_TAX_CREDIT_LIMIT_FORMULA: "상증법 §58 ①",
  AGGREGATION_SAME_PERSON: "상증법 §47 ②",
  MARKET_PRICE_COMPARABLE: "상증법 §60·§61, 상증령 §49①의2",
  SURCHARGE_MINOR_OVER_2B: "상증법 §57 ① 단서",
} as const;
```

**KoreanLaw MCP 호출 (Phase A 진입 전 필수)**:
```
get_law_text("상속세 및 증여세법", "57")
get_law_text("상속세 및 증여세법", "58")
get_law_text("상속세 및 증여세법", "47")
get_law_text("상속세 및 증여세법 시행령", "28")
get_law_text("상속세 및 증여세법 시행령", "28의2")
```

---

## 8. 테스트 매트릭스 (Phase C)

### 8.1 `__tests__/tax-engine/gift/case-1-redonation-spouse.test.ts` (20 anchor)

```ts
describe("PDF 사례 1 — 동일인(부모) 재차증여", () => {
  describe("C1-1: 2021-05-10 1차 단독 (부→장남 350M)", () => {
    // ⑤=300M, ⑦=50M, ⑪=1.5M, ⑫=48,500,000
    // 6 anchor
  });

  describe("C1-2: 2022-07-20 2차 합산 (모→장남 660M, 1차 합산)", () => {
    // ⑤=960M, ⑦=228M, ⑧=50M, ⑨=71,250,000, ⑩=50M, ⑪=5,340,000, ⑫=172,660,000
    // 7 anchor (보유 1행은 단독 1차 회귀)
  });

  describe("C1-3: 2023-04-20 3차 합산 (PDF 사례1 본문)", () => {
    // ⑤=1,470M, ⑦=428M, ⑧=228M, ⑨=279,510,204, ⑩=228M, ⑪=6M, ⑫=194,000,000
    // 7 anchor
  });
});
```

### 8.2 `__tests__/tax-engine/gift/case-2-generation-skip.test.ts` (38 anchor — D-17 정정)

```ts
describe("PDF 사례 2 — 조부모→손자 세대생략 재차증여", () => {
  describe("C2-1: 2018-05-02 1차 단독 (조모→손자 300M)", () => {
    // ⑤=250M, ⑦=40M, ⑧=12M, ⑫=12M, ⑬=52M, ⑱=50,440,000
    // 6 anchor
  });

  describe("C2-2: 2021-05-02 2차 합산 (조부→손자 520M)", () => {
    // 14 anchor (F-1 정정 — ⑥ 포함):
    //   ⑤=770,000,000 / ⑥="30%" / ⑦=171,000,000 / ⑧=51,300,000
    //   ⑨=12,000,000 / ⑩=16,655,844 / ⑪=12,000,000 / ⑫=39,300,000
    //   ⑬=210,300,000 / ⑭=40,000,000 / ⑮=55,519,481 / ⑯=40,000,000
    //   ⑰=5,109,000 / ⑱=165,191,000
  });

  describe("C2-3: 2023-05-02 3차 합산 (PDF 사례2 본문)", () => {
    // 18 anchor: ⑤=1,770M / ⑦=548M / ⑧=164.4M / ⑨=51.3M / ⑩=71,518,644 /
    //           ⑪=51.3M / ⑫=113.1M / ⑬=661.1M / ⑭=171M / ⑮=238,395,480 /
    //           ⑯=171M / ⑰=14,703,000 / ⑱=475,397,000
  });
});
```

### 8.3 회귀 보호 anchor

- `__tests__/tax-engine/gift/donor-group-isolation.test.ts` (신규) — 4 anchor:
  1. `expect(result.aggregatedGiftValue).toBe(<현재 회차만 + 그룹 B prior 만>)` — 父 항목 제외 확인
  2. `expect(result.warnings).toContainEqual(expect.stringMatching(/증여자=father.*별개 신고/))` — warning 발생
  3. `expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(<2차 조부 ⑦>)` — 가장 최근 그룹 B 회차 사용
  4. `expect(result.finalTax).toBe(<父 무시 후 산정값>)` — 합산 정확성
- 입력 시나리오:
  - 현재: donor=grandparent / ① 1,000,000,000 / 2023-05-02
  - prior 1: donor=father / ① 350,000,000 / 2018-05-10 (다른 그룹 → 무시)
  - prior 2: donor=grandparent / ① 300,000,000 / 2020-05-10 (그룹 B → 합산)

### 8.4 Pre-Do anchor 실행 순서

1. `case-2-generation-skip.test.ts` C2-3 18 anchor 작성
2. `npx vitest run __tests__/tax-engine/gift/case-2-generation-skip.test.ts`
3. 실패 진단 (F-8 정정 — Legacy priorGiftTaxPaid 매개변수 폐기 명시):
   - ⑦ OK / ⑧ 164M (현행은 ⑦×30% 단순) / ⑨~⑪ undefined (detail 필드 없음) / ⑫ undefined / ⑬ undefined
   - ⑭ undefined / ⑮ undefined / ⑯ 현행 산식 `Min(priorGiftTaxPaid, computedTax)` 적용 — 입력값에 따라 부정확
   - ⑱ 현행 산식으로 잘못된 값 출력 (475,397,000 ≠ 현행값)
   - 결과 타입에 `generationSkipSurchargeDetail`·`priorGiftCreditDetail`·`filingFormRows` 등 신규 필드 부재로 TypeScript 컴파일 단계에서도 anchor 작성 시 type error
4. 실패 패턴이 G-1/G-2/G-3 매칭 확인 → Phase A 진행

---

## 9. 디자인 단계 산출물 체크리스트

- [x] 케이스 인벤토리 매트릭스 (§1) — 행 9개 enumerate
- [x] 타입 정의 — 입력·결과·detail (§2)
- [x] 엔진 파이프라인 STEP 1~11 (§3)
- [x] 분기 의사결정 트리 (§3.1)
- [x] 헬퍼 함수 시그니처 + pseudo-code (§4)
- [x] UI 명세 — 마법사 단계·결과 카드·사이드바·가이드 카드 (§5)
- [x] 14개 동기화 지점 매핑 (§6)
- [x] 법령 상수 (§7) + KoreanLaw MCP 호출 목록
- [x] 테스트 매트릭스 **20+38+4=62 anchor** (§8) (F-1·F-10 정정)
- [x] Pre-Do anchor 실행 순서 (§8.4)
