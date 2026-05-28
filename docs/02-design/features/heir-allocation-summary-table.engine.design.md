# 상속인별 상속세부담액 집계 표 — 엔진 설계

> 계획서: [`docs/01-plan/heir-allocation-summary-table.plan.md`](../../01-plan/heir-allocation-summary-table.plan.md) · UI 설계: [`heir-allocation-summary-table.ui.design.md`](./heir-allocation-summary-table.ui.design.md)
> **PDF 정본 자료** (I-4):
> - 이미지 8: 결과 표 (Anchor — 계획서 §0.8)
> - 이미지 9~10: ②간주174M·③추정350M 4항목·기타226M 8항목 명세 (단 ㉠부동산 아파트·농지 금액은 **무시** — 이미지 18 표 정본)
> - 이미지 11~13: 공제 산식
> - 이미지 14~16: 사전증여·과세표준상당액·산출세액·세대생략·부담비율 산식
> - **이미지 17·18**: §1(1) 자산 19건 협의분할 내역 — 정본
> - **이미지 19**: §1(2) 추정상속 협의분할 (배우자 150·장남 100·차남 100, 법정상속분)
> - **이미지 20**: §1(3) 채무 5건 협의분할 내역 — 정본
> 핵심 원칙: **엔진 산식 변경 0** — 모든 신규 필드는 echo (중간 계산값 노출). [[echo-field-pattern]]

## Context

`calcHeirAllocation`이 perHeir 14필드(직접/간접 배부·세대생략·§28 사전증여공제 한도·영리법인 면제 제외 배부대상 산출세액)를 BigInt round-half-up으로 이미 정확히 구현 중. PDF 사례(이미지 8) 결과 ⑮ 차감자진납부세액 5인 분배 = 1,033,760,232원이 현재 엔진으로 도달 가능. 격차 = (a) 자산 4분류 합계 (b) 합계행용 echo 4건 (c) 결과 화면·PDF의 매트릭스 25행 × 가변 N열 렌더.

---

## ★ 케이스 인벤토리 (Do 진입 전 필수)

| # | 시나리오 | 법령 근거 / PDF 출처 | anchor | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 1 | 종합 사례 — 5인(배우자·자2·corp·legatee) + 가업+동거+금융재산공제 + 영리법인 사전증여 + 손녀 세대생략 유증 | 이미지 8·17~20 PDF | §0.8 27행 × 5열 = 약 90건 | `heir-allocation-summary-pdf-case.test.ts` | ☐ |
| 2 | 단독 상속 (자녀 1인) — 합계행=상속인행 동일, 부담비율=1.0 | 자체 (boundary) | finalTax 단독 합 | `heir-allocation-single-child.test.ts` | ☐ |
| 3 | 영리법인 사전증여 0 — `corporateExemption=0` · `surchargeTargetTaxableValue === taxableEstateValue` | 자체 (분기 누락 방지) | summaryTable echo | (포함) | ☐ |
| 4 | 세대생략 미존재 — `generationSkipSurcharge=0` · `*4 행 전체 빈셀` | 자체 (분기 누락 방지) | perHeir 모두 surcharge=0 | (포함) | ☐ |
| 5 | ㉠ 과세제외 비∅ — 비과세 + 과세가액불산입 합계 echo (사용자 답변 R-7) | 상증법 §11·§12·§16·§17·§52 | totalExcludedFromTaxation > 0 | `heir-allocation-excluded.test.ts` | ☐ |
| 6 | 협의분할 미입력 자산 — 법정상속분 자동 fallback `usedLegalShareFallback === true` | `inheritance-legal-share.ts:36-37` (corp·legatee 제외) | categoryBreakdown 자동 분배 | (포함) | ☐ |
| 7 | ⑩b 두 산식 분기 — `corporateExemptionLimitDisplay` (할증 포함) ≠ `perHeir[corp].priorGiftCreditLimit` (할증 미포함) | PDF 표8 ⑩b 합계 vs 영리법인 행 | 277,943,123 vs 272,874,251 | (Case 1 포함) | ☐ |

**규칙**: 모든 행 ☐ 상태에서 Phase A anchor 작성 → Pre-Do 실행 → 실패 항목 = 디자인 환류.

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 사용 강제.

| 조문 | 산식·의미 | 변수명 |
|---|---|---|
| 상증법 §3의2② | 영리법인 면제세액 = Min(증여세산출세액, 한도). 한도 = floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준) | `INH.CORPORATE_EXEMPTION` |
| 상증법 §27① | 세대생략 할증 = floor(산출세액 × 세대생략재산 × 할증율 / (상속세 과세가액 − 영리법인 등 사전증여)) | `INH.GENERATION_SKIP` |
| 상증법 §28 | 사전증여세액공제 = Min(증여세 산출세액, 한도). 한도 = floor(산출세액상당액 × 사전증여 과세표준 / 과세표준상당액) | `INH.PRIOR_GIFT_CREDIT` |
| 상증법 §13 | 가산 사전증여재산 | `INH.PRIOR_GIFT_ADD` |
| 집행기준 19-17-1, 재재산 46014-247 | 상속인등 부담비율 안분 | `INH.ALLOCATION` |
| 서서이-1447 (2008.6.17.) | §27① 분모 "총상속재산가액"에서 영리법인 등 증여재산 차감 | (집행기준 인용) |
| 이미지 15 | *1 = 과세가액 − Σ가산 증여재산, *3 = ⑥㉢ − 영리법인 사전증여 과세표준 | (PDF 사례) |
| 이미지 16 | *5 부담비율 = ⑥㉢ / (taxBase − 상속인·수유자 아닌 자 사전증여 과세표준) | (PDF 사례) |

---

## 엔진 input/result 타입 (변경 사항 명시)

### 1. 신규 헬퍼 — `lib/tax-engine/inheritance-asset-category.ts` (B1)
```ts
import type { AssetCategory, EstateItem } from "./types/inheritance-gift.types";

export type SummaryTableCategory = "financial" | "real_estate" | "stock" | "other";

const CATEGORY_TO_SUMMARY: Record<AssetCategory, SummaryTableCategory> = {
  cash: "financial",
  financial: "financial",
  deposit: "financial",
  real_estate_land: "real_estate",
  real_estate_building: "real_estate",
  real_estate_apartment: "real_estate",
  listed_stock: "stock",
  unlisted_stock: "stock",
  other: "other",
};

/**
 * §0.3 매핑: deemedCategory 보정 우선 → category 매핑.
 * 퇴직금(retirement)·보험금(insurance)·신탁(trust)은 PDF 표8 "기타" 행으로 통합.
 */
export function buildSummaryCategory(item: Pick<EstateItem, "category" | "deemedCategory">): SummaryTableCategory {
  if (item.deemedCategory === "retirement" || item.deemedCategory === "insurance" || item.deemedCategory === "trust") {
    return "other";
  }
  return CATEGORY_TO_SUMMARY[item.category];
}
```

### 2. `HeirTaxBreakdown` 확장 — `types/inheritance-allocation-result.types.ts` (B2)
```ts
export interface HeirTaxBreakdown {
  // ── 기존 14필드 (변경 없음) ──
  heirId: string;
  directEstateAmount: number;
  priorGiftAmount: number;
  presumedAmount: number;
  debtShare: number;
  taxableValueShare: number;        // ④ 상속세 과세가액 (상속인별)
  directTaxBaseShare: number;       // ⑥ ㉠ 직접배부
  indirectTaxBaseShare: number;     // ⑥ ㉡ 간접배부
  taxBaseShare: number;             // ⑥ ㉢ 과세표준상당액
  computedTaxShare: number;         // ⑪ 산출세액 배부
  generationSkipSurcharge: number;  // *4 세대생략가산
  priorGiftCredit: number;          // ⑩c (corporate) / ⑫c (heir)
  preFilingCreditTax: number;       // ⑬ 차가감세액
  filingCredit: number;             // ⑭ 신고세액공제
  finalTax: number;                 // ⑮ 차감자진납부세액

  // ── 신규 echo (B2) — 모두 optional, 산식 변경 0 ──
  /** §0.3 자산 4분류 합계 (협의분할 분배 후 본인 몫). 미할당 자산은 법정상속분 fallback */
  categoryBreakdown?: {
    financial: number;
    realEstate: number;
    stock: number;
    other: number;
  };
  /** ① 총상속재산 (채무공제 전) = Σ categoryBreakdown */
  grossInheritance?: number;
  /** ㉠ 과세제외 재산 (비과세 §11·§12 + 과세가액불산입 §16·§17·§52). 합계는 result.summaryTable */
  excludedFromTaxation?: number;
  /**
   * ⑩b / ⑫b 공제 한도 — **필드 두 의미** (명세 박스 D-8):
   * - heir (spouse/child/...): §28 사전증여공제 한도 = floor(⑪ × directTaxBaseShare / taxBaseShare)
   * - corporate: §3의2② 면제 한도 = floor(⑦ × corporateGiftTaxBase / taxBase) ← `inheritance-corporate-exemption.ts:101` `limit`과 동일
   * UI는 heir.relation으로 분기하여 라벨 분리 표시 (⑩b vs ⑫b).
   */
  priorGiftCreditLimit?: number;
  /** ⑩a / ⑫a 증여세 산출세액 (사전증여 시 납부한 증여세) */
  priorGiftComputedTax?: number;
  /** *5 부담비율 = taxBaseShare / distributableTaxBaseAfterGifts (4자리 round) */
  burdenRatio?: number;
}
```

### 3. `InheritanceTaxResult` 확장 — `types/inheritance-gift.types.ts` (B3)
```ts
export interface InheritanceTaxResult {
  // ── 기존 필드 (변경 없음) ──
  // ...

  // ── 신규 echo (B3) — optional ──
  summaryTable?: {
    /** *1 과세표준 배부대상 과세가액 = 과세가액 − Σ가산 증여재산. PDF 이미지 15. */
    distributableTaxBase: number;
    /** *2 할증과세 대상 과세가액 = 과세가액 − 영리법인 등 사전증여가액. PDF 이미지 16 §27①. */
    surchargeTargetTaxableValue: number;
    /** *3·*5 분모 = taxBase − 영리법인 등 사전증여 과세표준 = ⑥㉢ 합계(영리법인 제외). PDF 이미지 16. */
    distributableTaxBaseAfterGifts: number;
    /** ⑩b 합계행 표시값 = floor((⑦+⑧) × corporateGiftTaxBase / taxBase). 할증 포함. perHeir[corp].priorGiftCreditLimit(할증 미포함)과 의도적 분리. */
    corporateExemptionLimitDisplay: number;
    /** 자산 4분류 합계 (모든 상속인 합) */
    categoryTotals: {
      financial: number;
      realEstate: number;
      stock: number;
      other: number;
    };
    /** ㉠ 과세제외 재산 전체 합 (비과세 + 과세가액불산입) */
    totalExcludedFromTaxation: number;
  };
}
```

---

## 계산 알고리즘 (Phase B4·B5 의사코드)

### B4: `calcHeirAllocation` 수정 (`inheritance-allocation.ts`)
```ts
// 기존 STEP 13-1 자산 분배 집계 직후 (line ~257):
const categoryBreakdownByHeir = new Map<string, {financial: number; realEstate: number; stock: number; other: number}>();
for (const heir of heirs) {
  categoryBreakdownByHeir.set(heir.id, {financial: 0, realEstate: 0, stock: 0, other: 0});
}
for (const item of estateItems) {
  const cat = buildSummaryCategory(item);
  const amount = valuatedAmountById.get(item.id) ?? 0;
  if (item.heirAllocations && item.heirAllocations.length > 0) {
    for (const alloc of item.heirAllocations) {
      categoryBreakdownByHeir.get(alloc.heirId)![cat] += alloc.amount;
    }
  } else {
    // 법정상속분 fallback (corporate·legatee 자동 제외 — inheritance-legal-share.ts:36-37)
    const dist = distributeByLegalShares(amount, legalShares);
    for (const [heirId, amt] of dist) {
      const bucket = categoryBreakdownByHeir.get(heirId);
      if (bucket) bucket[cat] += amt;
    }
  }
}

// 기존 perHeir 채우기 직후 — echo 추가:
for (const [heirId, breakdown] of categoryBreakdownByHeir) {
  if (perHeir[heirId]) {
    perHeir[heirId].categoryBreakdown = breakdown;
    perHeir[heirId].grossInheritance =
      breakdown.financial + breakdown.realEstate + breakdown.stock + breakdown.other;
  }
}

// D-6 corp 분기 echo 보강 (line ~341 corp 분기 끝):
for (const heir of heirs) {
  if (heir.relation !== "corporate") continue;
  // §3의2② 한도 재계산 (calcCorporateExemption.limit과 동일 산식)
  const corpGiftTaxBase = taxBaseByDonee.get(heir.id) ?? 0;
  const corpLimit = taxBase > 0 && corpGiftTaxBase > 0
    ? Math.floor((computedTax * corpGiftTaxBase) / taxBase)  // = 272,874,251
    : 0;
  perHeir[heir.id].priorGiftCreditLimit = corpLimit;             // ⑩b 영리법인
  perHeir[heir.id].priorGiftComputedTax = heir.corporateGiftComputedTax ?? 0;  // ⑩a = 150M
  // categoryBreakdown — corp는 본래 상속 0, 사전증여만이므로 4분류 모두 0 (D-7)
  perHeir[heir.id].categoryBreakdown = {financial: 0, realEstate: 0, stock: 0, other: 0};
  perHeir[heir.id].grossInheritance = 0;
}

// heir 분기 §28 한도 echo (기존 limit 변수 노출):
//   perHeir[heir.id].priorGiftCreditLimit = limit;  // line 388-394 limit
//   perHeir[heir.id].priorGiftComputedTax = giftTaxPaid;  // line 386

// 기존 §28 한도 계산 (line 388-394) — limit 변수를 echo로 노출:
//   perHeir[heir.id].priorGiftCreditLimit = limit  // ⑫b
//   perHeir[heir.id].priorGiftComputedTax = giftTaxPaid  // ⑫a

// 영리법인은 calcCorporateExemption 결과의 limit을 perHeir[corp].priorGiftCreditLimit에 echo
// (확인 완료: `corporateExemption.limit`는 이미 반환됨 — `inheritance-corporate-exemption.ts:136`. 추가 변경 0)

// 부담비율 (*5) — distributableTaxBaseAfterGifts = taxBase − corporateGiftTaxBase
const burdenRatioDenominator = taxBase - corporateGiftTaxBase;  // = computedTaxShareDenominator (기존 변수)
for (const heirId in perHeir) {
  if (heirs.find(h => h.id === heirId)?.relation === "corporate") continue;
  perHeir[heirId].burdenRatio = burdenRatioDenominator > 0
    ? Math.round((perHeir[heirId].taxBaseShare / burdenRatioDenominator) * 10000) / 10000  // 4자리
    : 0;
}
```

### B5: `inheritance-tax.ts` STEP 14 후 — `result.summaryTable` 조립
```ts
// STEP 9 직후에 이미 계산된 값들 재사용:
const distributableTaxBaseForGifts = taxBase - corporateGiftTaxBase;
const corporateExemptionLimitDisplay = corporateGiftTaxBase > 0 && taxBase > 0
  ? Math.floor(
      ((computedTax + generationSkipSurcharge) * corporateGiftTaxBase) / taxBase
    )
  : 0;

// estateItems 4분류 전체 합계
const categoryTotals = {financial: 0, realEstate: 0, stock: 0, other: 0};
for (const item of estateItems) {
  const cat = buildSummaryCategory(item);
  categoryTotals[cat] += valuatedAmountById.get(item.id) ?? 0;
}

// 과세제외 = 비과세(§11·§12) + 과세가액불산입(§16·§17·§52). 현재 result에 별도 필드 부재 — 신규 echo.
// grep 검증 결과: `result`에 `exemptAmount`(=비과세+과세가액불산입 합)는 있으나 분리 echo 없음.
// 본 작업에서 별도 분리는 비목표 — `exemptAmount` 그대로 totalExcludedFromTaxation에 매핑.
const totalExcludedFromTaxation = exemptAmount;  // STEP 2 결과 (inheritance-tax.ts 본문 변수)

result.summaryTable = {
  distributableTaxBase: indirectDenominator,  // *1 = 5,815M
  surchargeTargetTaxableValue: taxableEstateValue - nonHeirNonLegateeGifts,  // *2 = 8,075M
  distributableTaxBaseAfterGifts: distributableTaxBaseForGifts,  // *3·*5 분모 = 3,475M
  corporateExemptionLimitDisplay,  // ⑩b 합계 277,943,123
  categoryTotals,
  totalExcludedFromTaxation,
};
```

**산식 변경 검증**:
- `calcHeirAllocation` 본체 14필드 산식: **변경 없음** ✓
- `calcGenerationSkipSurcharge` 분모: **변경 없음** ✓
- `calcCorporateExemption` Min(증여세산출세액, 한도): **변경 없음** ✓ (단 `limit` 반환 추가)
- 신규 echo 6필드(perHeir) + 6필드(summaryTable) 모두 **중간 계산값 노출**

---

## Silent fallback / 자동 안분 식별

| 필드 | fallback 정책 | 비고 |
|---|---|---|
| `categoryBreakdown` | 협의분할 미입력 시 법정상속분 안분 (corporate·legatee 자동 제외) | `inheritance-legal-share.ts:36-37` 단일출처 — UI 자체 계산 금지 |
| `priorGiftCreditLimit` | 항상 계산 (사전증여 0이면 0) | echo만 |
| `burdenRatio` | corporate 행 = undefined (계산 안 함) | UI 표시 시 — |
| `summaryTable.totalExcludedFromTaxation` | 비과세·불산입 0이면 0 echo → UI '-' 표시 | `result.nontaxableTotal` + `excludedFromTaxableValue` 합 |
| ⑩b 합계 vs 영리법인 행 | 두 산식 모두 echo (display·apply 분리) | corp의 priorGiftCreditLimit는 §3의2② 면제 한도(할증 미포함), summaryTable.corporateExemptionLimitDisplay는 PDF 표시값(할증 포함) |

**자동 안분 금지 정책** ([[feedback_no_silent_apportion_fallback]]) — 협의분할 자동 안분 외 다른 자동 채움 없음. 미입력 항목은 UI에서 별도 안내(예: "협의분할 미입력 자산은 법정상속분 자동 안분 적용됨").

---

## 테스트 약속 (Phase A anchor 17건)

`__tests__/tax-engine/inheritance/heir-allocation-summary-pdf-case.test.ts`:

```ts
describe("PDF 종합사례 (이미지 8) — 5인 상속·영리법인 사전증여·손녀 세대생략", () => {
  const input: InheritanceTaxInput = buildPdfCaseInput();  // §0.2~§0.7 데이터

  let result: InheritanceTaxResult;
  beforeAll(() => { result = calculateInheritanceTax(input, rates); });

  test("AN-1: ④ 과세가액 8,775M", () => expect(result.taxableEstateValue).toBe(8_775_000_000));
  test("AN-2: 과세표준 4,175M", () => expect(result.taxBase).toBe(4_175_000_000));
  test("AN-3: 산출세액 1,627.5M", () => expect(result.computedTax).toBe(1_627_500_000));
  test("AN-4: 세대생략 30,232,198", () => expect(result.generationSkipSurcharge).toBe(30_232_198));
  test("AN-5: *1 5,815M", () => expect(result.summaryTable!.distributableTaxBase).toBe(5_815_000_000));
  test("AN-6: *2 8,075M", () => expect(result.summaryTable!.surchargeTargetTaxableValue).toBe(8_075_000_000));
  test("AN-7: *3 3,475M", () => expect(result.summaryTable!.distributableTaxBaseAfterGifts).toBe(3_475_000_000));
  test("AN-8: ⑩b 합계 277,943,123", () => expect(result.summaryTable!.corporateExemptionLimitDisplay).toBe(277_943_123));
  test("AN-9: ⑩b 영리법인 272,874,251", () => expect(result.heirAllocationResult!.perHeir.corp_M.priorGiftCreditLimit).toBe(272_874_251));
  test("AN-10: ⑫b 배우자 68,028,777", () => expect(result.heirAllocationResult!.perHeir.spouse.priorGiftCreditLimit).toBe(68_028_777));
  test("AN-11: ⑫b 장남 616,510,791", () => expect(result.heirAllocationResult!.perHeir.child1.priorGiftCreditLimit).toBe(616_510_791));
  test("AN-12: ⑮ 배우자 432,871,250", () => expect(result.heirAllocationResult!.perHeir.spouse.finalTax).toBe(432_871_250));
  test("AN-13: ⑮ 장남 276,593,379", () => expect(result.heirAllocationResult!.perHeir.child1.finalTax).toBe(276_593_379));
  test("AN-14: ⑮ 차남 228,833,517", () => expect(result.heirAllocationResult!.perHeir.child2.finalTax).toBe(228_833_517));
  test("AN-15: ⑮ 영리법인 0", () => expect(result.heirAllocationResult!.perHeir.corp_M.finalTax).toBe(0));
  test("AN-16: ⑮ 손녀 95,462,086", () => expect(result.heirAllocationResult!.perHeir.grand.finalTax).toBe(95_462_086));
  test("AN-17: Σ⑮ 1,033,760,232", () => {
    const sum = Object.values(result.heirAllocationResult!.perHeir).reduce((s, h) => s + h.finalTax, 0);
    expect(sum).toBe(1_033_760_232);
  });
});
```

**Pre-Do 실행 정책** ([[pre-do-anchor-verification]]): anchor 작성 후 즉시 `npx vitest run heir-allocation-summary-pdf-case`. 실패 시 = Phase B echo 미구현 신호로 디자인 환류, 통과 시 = R-4·R-5 grep 결론 실측 확정.

---

## 800줄 정책 (사전 분리 신호)

- `inheritance-allocation.ts` 현재 458줄 + B4 echo 추가 약 +60줄 → 518줄 (정책 OK)
- `inheritance-tax.ts` 현재 571줄 + B5 summaryTable 조립 약 +30줄 → 601줄 (정책 OK)
- 800줄 도달 시 `inheritance-allocation-summary.ts` 별도 헬퍼로 분리 (`buildSummaryEcho(input, perHeir, ...) → summaryTable`)

---

## 의존성 (단방향)

```
inheritance-tax.ts (orchestrator)
  → inheritance-allocation.ts (calcHeirAllocation + categoryBreakdown echo)
      → inheritance-asset-category.ts (buildSummaryCategory)  ← 신설
      → inheritance-legal-share.ts (computeLegalShares + distributeByLegalShares)
  → inheritance-corporate-exemption.ts (limit echo 반환 추가)
  → inheritance-gift-common.ts (calcGenerationSkipSurcharge — 변경 없음)
```

UI → 엔진 단방향. 엔진은 UI/PDF 모름.

---

## 자가 검토 이력 (Step 6·8)

### 1차 검토 — 정정 5건
| # | 발견 | 정정 |
|---|---|---|
| D-1 | `result.allocation!.perHeir` 단정 | grep 검증: 실제 필드명 `result.heirAllocationResult` (`inheritance-tax.ts:568`). 디자인 전체 치환 완료 |
| D-2 | `corporateExemption.limit` "return에 추가 필요" 단정 | grep 검증: 이미 line 136에서 반환 중. 변경 0 |
| D-3 | `result.nontaxableTotal`·`excludedFromTaxableValue` 필드 단정 | grep 검증: 두 필드 부재. `exemptAmount`만 존재. summaryTable.totalExcludedFromTaxation는 STEP 2 내부 변수 직접 매핑으로 정정 |
| D-4 | `taxableEstateValue` line 362-378 인용 | 정확 — 선언 line 206, R-5 사용은 362-378. 변경 0 |
| D-5 | `usedLegalShareFallback` 미명시 | `HeirAllocationResult`에 이미 echo 존재 — 본 작업 무관 (기존 활용) |

### 2차 검토 — 정정 5건
| # | 발견 | 정정 |
|---|---|---|
| D-6 | corp 분기(line 323-343)에서 perHeir[corp].priorGiftCreditLimit 설정 누락 — AN-9 실패 위험 | B4 의사코드에 corp 한도 재계산 echo 블록 추가 (산식은 `inheritance-corporate-exemption.ts:101`과 동일, 산식 변경 0) |
| D-7 | corp의 categoryBreakdown — 사전증여만이고 본래 0 | corp 분기에 `categoryBreakdown = {0,0,0,0}` 명시. UI에서 corp 행 자산 4행은 모두 — 표시 |
| D-8 | `priorGiftCreditLimit` 필드 한 이름·두 의미 (heir §28 vs corp §3의2②) | HeirTaxBreakdown 주석에 명세 박스 추가 (UI 분기로 ⑩b/⑫b 라벨 분리) |
| D-9 | B4 categoryBreakdown 별도 루프 — 기존 resolveAllocationsByHeir와 중복 | 가독성 우선 유지. 800줄 정책 무관 |
| D-10 | Phase A `buildPdfCaseInput()` fixture 미명시 | `__tests__/tax-engine/inheritance/fixtures/pdf-case-input.ts` 별도 파일 신설 — §0.2 19건 + §0.4 5건 + §0.5 3건 + §0.6 4건 + §0.7 5건 입력 builder 제공 |

