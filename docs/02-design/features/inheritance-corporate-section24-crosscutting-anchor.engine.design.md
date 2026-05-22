# 영리법인 사전증여 × §24 종합한도 cross-cutting anchor — Engine Design

> 작성일: 2026-05-22
> 연결 계획서: [`docs/00-pm/inheritance-corporate-section24-crosscutting-anchor.plan.md`](../../00-pm/inheritance-corporate-section24-crosscutting-anchor.plan.md)
> 작업 유형: 회귀 anchor 보강 (엔진 변경 없음)

## 1. Scope

**대상**: 영리법인 사전증여(`beneficiaryType: "corporate"`) 입력 변화 시 §24 한도와 §3의2② 면제가 정합하게 동시 변하는지 통합 anchor 3건으로 보호.

**비대상**:
- 엔진 산식 변경
- 영리법인 다수(N>1) 분배 로직 (별도 PR — plan §7 후속-2)
- UI 변경 (별도 PR — plan §7 후속-3)
- `spouseLegalShareOverride` × `wasCapped` 경계 (별도 PR)

**폴백 정책**: breakdown 라벨 매칭은 `.includes("§24 종합한도")` / `.includes("한도 초과")` 사용 — 라벨 부분 변경 안전.

## 2. 엔진 산식 재확인 (변경 없음)

### 2.1 산식 A — §24 종합한도 (`inheritance-tax.ts:295~301`)

```ts
const deductionResult = calcInheritanceDeductions(
  { ...input.deductionInput, ... },
  taxableEstateValue,
  heirOnlyGifts,
  {
    totalPriorGiftAmount: priorGiftAggregated,  // ← 영리법인 포함
    priorGiftDeductionTotal: input.deductionInput.priorGiftDeductionTotal ?? 0,
    legateeAmountNonHeir: input.deductionInput.legateeAmountNonHeir ?? 0,
    disasterLossDeduction: input.deductionInput.disasterLossDeduction ?? 0,
  },
  ...
);
```

### 2.2 산식 B — §3의2② 면제 (`inheritance-tax.ts:367~447` + `inheritance-corporate-exemption.ts:101~105`)

```ts
const corporateGifts = (input.preGiftsWithin10Years ?? []).filter(
  (g) => g.beneficiaryType === "corporate" && isWithin13Cutoff(g, input.deathDate),
);
const corporateGiftTaxBase = corporateGifts.reduce((s, g) => s + (g.giftTaxBase ?? g.giftAmount), 0);
const corporateGiftComputedTax = corporateGifts.reduce((s, g) => s + (g.corporateGiftComputedTax ?? 0), 0);

// 한도 = floor(상속세 산출세액 × 영리법인 과세표준 / 상속세 과세표준)
const limit = Math.floor((totalComputedTax * corporateGiftTaxBase) / totalTaxBase);
const amount = Math.min(corporateGiftComputedTax, limit);
```

### 2.3 단일 진실: `isWithin13Cutoff`

A의 `priorGiftAggregated`도 동일 헬퍼 사용 — `aggregatePriorGiftsForInheritance` (`lib/tax-engine/inheritance-gift-common.ts:286`) 내부에서 `isWithin13Cutoff`로 필터링. B의 `corporateGifts` filter (`inheritance-tax.ts:373`)도 동일 헬퍼. cutoff 도과 영리법인은 A·B 양쪽에서 동시 제외 — 본 anchor의 핵심 보호 대상.

### 2.4 결과 노출 경로

| 경로 | 노출 필드 |
|---|---|
| `result.priorGiftAggregated` | A 분자 (영리법인 포함 모든 사전증여 합) |
| `result.deductionDetail.breakdown` | "§24 종합한도 (...)" line amount = ceiling |
| `result.corporateExemption?.amount` | B 결과 (`undefined` 가능 — 영리법인 사전증여 0이면) |
| `result.finalTax` | 두 효과 합산 후 |

## 3. 데이터 인벤토리 — 3개 anchor

### 3.1 baseline (EXAMPLE_INPUT) — 확정

| 항목 | 값 | 출처 |
|---|---|---|
| `deathDate` | 2023-03-05 | fixture L50 |
| `priorGiftDeductionTotal` | 650,000,000 | fixture L440 |
| `legateeAmountNonHeir` | 500,000,000 | fixture L439 |
| 영리법인 사전증여 700M (2021-08-10), CGCT 150M | 1건 | fixture L379~389 |
| 상속인 사전증여 760M(2022)+1,500M(2018) | 2건 | fixture L390~407 |
| `priorGiftAggregated` 합계 | **2,960M** | (700+760+1,500) |
| §24 ceiling | **5,965M** | (8,775−500−max(0,2,960−650)) |
| `result.totalDeduction` | **4,600M** | J-04b PASS 확정 |

§13 5년 cutoff 기준: deathDate − 5년 = **2018-03-04 이후** 영리법인 사전증여만 가산.

### 3.2 CC-01 — 영리법인 700M → 1,400M 증액 (cap 미발동 분기)

**변형**:
```ts
preGiftsWithin10Years: [
  { ...EXAMPLE_PRIOR_GIFTS[0], giftAmount: 1_400_000_000, giftTaxBase: 1_400_000_000,
    corporateGiftComputedTax: 300_000_000 },
  EXAMPLE_PRIOR_GIFTS[1],
  EXAMPLE_PRIOR_GIFTS[2],
]
```

**기대 (cap 미발동 — ceiling 5,265M > rawTotal 4,600M)**:

| 검증 항목 | 기대 |
|---|---|
| `result.priorGiftAggregated` | **3,660,000,000** (= 2,960 + 700) |
| breakdown "§24 종합한도" line amount | **5,265,000,000** (= 5,965 − 700) |
| breakdown "한도 초과" line | `undefined` (cap 미발동) |
| `result.totalDeduction` | baseline과 동일 (Pre-Do 확정 — 예상 4,600M) |
| `result.corporateExemption?.amount` | Pre-Do 측정 |
| `result.finalTax` | Pre-Do 측정 |

### 3.3 CC-02 — §13 5년 cutoff 도과 영리법인 추가 (A·B 동기 제외)

**변형**:
```ts
preGiftsWithin10Years: [
  ...EXAMPLE_PRIOR_GIFTS,
  {
    giftDate: "2017-03-05",  // deathDate − 6년, cutoff 도과
    isHeir: false,
    giftAmount: 500_000_000,
    giftTaxBase: 500_000_000,
    giftTaxPaid: 0,
    doneeId: HEIR_ID.corporate,
    beneficiaryType: "corporate",
    corporateGiftComputedTax: 100_000_000,
  } as PriorGift,
]
```

**검증 패턴 (baseline 동치)**:
```ts
const baseline = calcInheritanceTax(EXAMPLE_INPUT);
const augmented = calcInheritanceTax({ ...EXAMPLE_INPUT, preGiftsWithin10Years: [...] });
expect(augmented.priorGiftAggregated).toBe(baseline.priorGiftAggregated);
expect(augmented.totalDeduction).toBe(baseline.totalDeduction);
expect(augmented.corporateExemption?.amount ?? 0).toBe(baseline.corporateExemption?.amount ?? 0);
expect(augmented.finalTax).toBe(baseline.finalTax);
```

→ A·B 양쪽 동기 cutoff 검증. baseline 절대값 측정 불요.

### 3.4 CC-03 — 영리법인 사전증여만 (상속인 0)

**cap 미발동 확정 사유**: ceiling 8,225M은 매우 큰 값. cascade로 rawTotal이 변동(상속인 사전증여 제거 → `spouseDeduction` 변화)하지만, baseline rawTotal 4,600M에서 spouseDeduction 변화량은 수억 단위(배우자 30억 cap 변동 가능)로 추정. 최악의 경우라도 rawTotal이 8,225M을 초과할 가능성은 낮음 (rawTotal 상한 = 일괄 5억 + 배우자 30억 + 금융 5억 + 동거 6억 + 영농 30억 + 가업 600억 = 매우 큼이지만 EXAMPLE_INPUT은 cap 미적용된 적정 입력). Pre-Do 실측으로 cap 미발동 확정 후 anchor 고정.


**변형**:
```ts
preGiftsWithin10Years: EXAMPLE_PRIOR_GIFTS.filter(g => g.beneficiaryType === "corporate")
```

**cascade 영향**: 상속인 사전증여 제거 → `spouseGiftTaxBase=0` → `spouseLegalShareOverride` 자동 재계산 → `spouseDeduction` 변화 → `totalDeduction`·`taxBase`·`finalTax` 변화.

**기대**:

| 검증 항목 | 기대 |
|---|---|
| `result.priorGiftAggregated` | **700,000,000** |
| breakdown "§24 종합한도" line amount | **8,225,000,000** (= 8,775 − 500 − max(0, 700 − 650)) |
| breakdown "한도 초과" line | `undefined` (cap 미발동) |
| `result.totalDeduction` | Pre-Do 측정 (cascade 영향) |
| `result.corporateExemption?.amount` | Pre-Do 측정 |
| `result.finalTax` | Pre-Do 측정 |

### 3.5 Pre-Do 동결 입력값 (Step Pre-Do 종료 후 갱신)

| anchor | 필드 | Pre-Do 종료값 (실측 후 동결) |
|---|---|---|
| baseline | `result.corporateExemption?.amount` | TBD |
| baseline | `result.finalTax` | TBD |
| CC-01 | `result.totalDeduction` | TBD (cap 미발동 예상 4,600M) |
| CC-01 | `result.corporateExemption?.amount` | TBD |
| CC-01 | `result.finalTax` | TBD |
| CC-03 | `result.totalDeduction` | TBD (cascade) |
| CC-03 | `result.corporateExemption?.amount` | TBD |
| CC-03 | `result.finalTax` | TBD |

CC-02는 baseline 동치 검증 — 절대값 동결 불요.

## 4. 테스트 파일 변경 명세

### 4.1 `__tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts`

**삽입 위치**: outer describe `describe("상속세 종합사례 PDF — 통합 anchor", ...)` (L21) 내부, [J] 블록 종료 `});` (L457) 직후, outer 종료 `});` (L458) 직전.

**import 추가** (L15~19 fixture import 확장):
```ts
import {
  EXAMPLE_INPUT,
  EXAMPLE_PRESUMED,
  EXAMPLE_PRIOR_GIFTS,  // ← 추가
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";  // ← 추가 (또는 기존 type import에 병합)
```

```ts
describe("[K] 영리법인 × §24 cross-cutting", () => {
  it("CC-01: 영리법인 700M→1,400M 증액 — ceiling −700M + 면제 변화 (cap 미발동)", () => {
    const input = {
      ...EXAMPLE_INPUT,
      preGiftsWithin10Years: [
        { ...EXAMPLE_PRIOR_GIFTS[0], giftAmount: 1_400_000_000, giftTaxBase: 1_400_000_000,
          corporateGiftComputedTax: 300_000_000 },
        EXAMPLE_PRIOR_GIFTS[1],
        EXAMPLE_PRIOR_GIFTS[2],
      ] as PriorGift[],
    };
    const result = calcInheritanceTax(input);
    expect(result.priorGiftAggregated).toBe(3_660_000_000);
    const ceilingLine = result.deductionDetail.breakdown.find((s) => s.label?.includes("§24 종합한도"));
    expect(ceilingLine?.amount).toBe(5_265_000_000);
    const limitLine = result.deductionDetail.breakdown.find((s) => s.label?.includes("한도 초과"));
    expect(limitLine).toBeUndefined();
    // Pre-Do로 동결할 anchor:
    expect(result.totalDeduction).toBe(/* TBD */ 0);
    expect(result.corporateExemption?.amount).toBe(/* TBD */ 0);
    expect(result.finalTax).toBe(/* TBD */ 0);
  });

  it("CC-02: §13 5년 cutoff 도과 영리법인 — baseline 동치 (A·B 동기 제외)", () => {
    const baseline = calcInheritanceTax(EXAMPLE_INPUT);
    const augmented = calcInheritanceTax({
      ...EXAMPLE_INPUT,
      preGiftsWithin10Years: [
        ...EXAMPLE_PRIOR_GIFTS,
        {
          giftDate: "2017-03-05",
          isHeir: false,
          giftAmount: 500_000_000,
          giftTaxBase: 500_000_000,
          giftTaxPaid: 0,
          doneeId: HEIR_ID.corporate,
          beneficiaryType: "corporate",
          corporateGiftComputedTax: 100_000_000,
        } as PriorGift,
      ],
    });
    expect(augmented.priorGiftAggregated).toBe(baseline.priorGiftAggregated);
    expect(augmented.totalDeduction).toBe(baseline.totalDeduction);
    expect(augmented.corporateExemption?.amount ?? 0).toBe(baseline.corporateExemption?.amount ?? 0);
    expect(augmented.finalTax).toBe(baseline.finalTax);
  });

  it("CC-03: 영리법인 사전증여만 (상속인 0) — ceiling 8,225M + cascade", () => {
    const input = {
      ...EXAMPLE_INPUT,
      preGiftsWithin10Years: EXAMPLE_PRIOR_GIFTS.filter((g) => g.beneficiaryType === "corporate"),
    };
    const result = calcInheritanceTax(input);
    expect(result.priorGiftAggregated).toBe(700_000_000);
    const ceilingLine = result.deductionDetail.breakdown.find((s) => s.label?.includes("§24 종합한도"));
    expect(ceilingLine?.amount).toBe(8_225_000_000);
    const limitLine = result.deductionDetail.breakdown.find((s) => s.label?.includes("한도 초과"));
    expect(limitLine).toBeUndefined();
    // Pre-Do로 동결할 anchor (cascade 영향):
    expect(result.totalDeduction).toBe(/* TBD */ 0);
    expect(result.corporateExemption?.amount).toBe(/* TBD */ 0);
    expect(result.finalTax).toBe(/* TBD */ 0);
  });
});
```

## 5. Pre-Do 워크플로

### Step Pre-Do-1: 실패 anchor 실측

> ⚠️ Pre-Do 중 TBD 자리 `0` 또는 임시값으로 두면 anchor가 잠시 broken state. 옵션 두 가지:
> - (A) Pre-Do 중에는 `it.skip("CC-01 ...", ...)`로 skip 처리 → 실측 시 일시 활성화 → 동결 후 `it()`로 복원
> - (B) 단일 세션에서 Pre-Do + 동결 + 커밋을 연속 처리 (broken state 미커밋)

권장 = (B). 본 작업은 단일 세션 처리 가능 규모.

1. 위 코드 그대로 작성 (`TBD` 자리에 `0`)
2. `npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts -t "CC-01"` → 실패 메시지에서 실측값 확인 → §3.5 동결값 갱신
3. CC-03 동일 절차
4. CC-02 실행:
   - PASS: 엔진 단일 진실(`isWithin13Cutoff`) 정상 → anchor가 향후 회귀 보호 역할 수행
   - FAIL: 엔진 버그 노출 → 본 anchor가 곧 회귀 detection 역할 수행 → 별도 PR로 엔진 정정 후 anchor 재실행 (작업 분리)

### Step Pre-Do-2: ceiling/priorGiftAggregated/limitLine 검증
- 단위 산식이므로 1차에서 PASS 예상
- 실패 시 산식 정정(§3.2·§3.4 표) 또는 엔진 산식 변화 확인

### Step Pre-Do-3: TBD 자리 교체 + 회귀
- `TBD`를 실측값으로 교체
- `npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts` 전체 PASS 확인

## 6. 회귀 검증 명령

```bash
npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts
npx vitest run __tests__/tax-engine/inheritance/
npx vitest run __tests__/tax-engine/inheritance-gift/
npm run typecheck
npm test
```

## 7. 영향 분석

| 영역 | 변경 |
|---|---|
| 엔진 (`lib/tax-engine/`) | **없음** |
| 타입 (`lib/tax-engine/types/`) | **없음** |
| fixture (`comprehensive-case-pdf.fixture.ts`) | **없음** (spread 변형만) |
| UI / API / Zod / validation | **없음** |
| 테스트 | 1파일 +3 it (1 describe 신규) |
| 회귀 위험 | 0 |

## 8. 14지점 동기화

| 지점 | 영향 |
|---|---|
| ①~⑭ | **전체 N/A** (anchor 추가 전용) |

## 9. Definition of Done

- [ ] Pre-Do Step 1·2·3 종료 → TBD 자리 모두 동결값 교체
- [ ] CC-01·CC-02·CC-03 3건 모두 `toBe()` 원단위 PASS
- [ ] CC-02 baseline 동치 검증 4필드(`priorGiftAggregated`·`totalDeduction`·`corporateExemption?.amount`·`finalTax`) 모두 동치
- [ ] CC-01 ceiling 5,265M anchor 명시
- [ ] CC-03 ceiling 8,225M anchor + cascade 영향 주석
- [ ] `§3.5 동결값 표` Pre-Do 종료 후 갱신
- [ ] `npm run typecheck` 0 error
- [ ] `npm test` 0 FAIL
- [ ] 신규 anchor 3건 외 통과수 변화 0

## 10. 후속 (out of scope)

- [후속-1] CC-04: cap 발동 + 영리법인 동시 시나리오 (rawTotal 강화 + 영리법인 증액) — 필요 시
- [후속-2] 영리법인 다수(N>1) cross-cutting (`corporate-prior-gift` 도메인)
- [후속-3] `spouseLegalShareOverride` × `wasCapped` 우선순위 경계
- [후속-4] UI 영리법인 면제 + §24 한도 동시 노출 시 사용자 안내

## 11. 참조

| 항목 | 위치 |
|---|---|
| §24 한도 영리법인 합산 (분자) | `lib/tax-engine/inheritance-tax.ts:295~301` |
| §3의2② 면제 영리법인 filter | `lib/tax-engine/inheritance-tax.ts:367~447` |
| 면제 산식 | `lib/tax-engine/inheritance-corporate-exemption.ts:101~105` |
| §13 cutoff 헬퍼 | `isWithin13Cutoff` (`inheritance-tax.ts:36`) |
| 결과 타입 priorGiftAggregated 노출 | `lib/tax-engine/types/inheritance-gift.types.ts:680` |
| baseline fixture | `__tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture.ts` |
| 기존 anchor | comprehensive-case-pdf.test.ts J-04·J-04b·J-04c·J-04d + comprehensive H 시리즈 |
| 법령 | 상증법 §3의2②·§13②·§24 |
| memory 정책 | `feedback_pre_anchor_verification`·`feedback_pdf_example_test_anchoring` |
