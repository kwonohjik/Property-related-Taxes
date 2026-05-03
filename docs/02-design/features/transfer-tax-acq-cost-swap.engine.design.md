# 양도세 §97②2호 단서 적용 — 엔진 설계

## Context

**문제**: 환산취득가액·감정가액 모드에서 (환산취득가 + 개산공제)가 (자본적지출 + 양도비)보다 작은 경우, 소득세법 §97②2호 단서는 후자(자본적지출+양도비)를 필요경비로 인정한다. 현재 엔진(`transfer-tax-helpers.ts:275-307`)에는 이 비교·swap 로직이 없다.

**부수 발견**: `input.expenses`가 환산 모드에서도 차감되고 있어(`transfer-tax-helpers.ts:299`), 환산 + 개산공제 + expenses 삼중 차감 가능성. 그러나 §97② 본문상 환산 모드 필요경비는 개산공제만이다(또는 단서로 자본+양도비 swap). `multi-parcel-transfer.ts:294`는 정확히 처리됨(`expenses = estimatedDeduction`).

**사용자 결정 (2026-05-03)**:
1. **`expenses` 분리** — `capitalExpenditure` + `transferExpense` 두 필드로 분리
2. **환산 모드 본문 처리** — 현재까지 의도는 환산 모드에서 개산공제만 적용. expenses(자본+양도비) 차감은 버그.

## 법령 근거

- **소득세법 §97① 2호 가목**: 자본적 지출액
- **소득세법 §97① 2호 나목**: 양도비
- **소득세법 §97② 2호 본문**: 취득가액을 환산가액(또는 감정가액)으로 하는 경우 필요경비 = 환산가액(/감정가액) + 개산공제
- **소득세법 §97② 2호 단서**: 환산가액 + 개산공제 < 자본적지출 + 양도비 → 자본적지출 + 양도비를 필요경비로 적용 가능
- **시행령 §163⑥**: 개산공제 = 취득당시 기준시가 × 3% (토지·건물 일반)

`legal-codes/transfer.ts`에 신규 상수 추가: `TRANSFER.ACQ_COST_SWAP_PROVISO = "소득세법 §97② 2호 단서"`.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 환산 모드 + swap 미발동 (환산+개산 ≥ 자본+양도비) → 환산+개산 적용 | §97② 본문 | 합성 (필수+0 케이스) | `acq-cost-swap.test.ts` | ☑ |
| 2 | 환산 모드 + swap 발동 (환산+개산 < 자본+양도비) → 자본+양도비 적용 | §97② 단서 | 합성 (proviso 발동) | `acq-cost-swap.test.ts` | ☑ |
| 3 | 환산 모드 + 자본·양도비 둘 다 0 → 환산+개산 적용 (회귀) | §97② 본문 | 기존 케이스 | `acq-cost-swap.test.ts` | ☑ |
| 4 | 감정가액 모드 + swap 발동 → 자본+양도비 적용 | §97② 단서 (§163⑥ 동치) | 합성 | `acq-cost-swap.test.ts` | ☑ |
| 5 | 실가 모드 (`useEstimatedAcquisition=false`) → swap 미적용, 자본+양도비 직접 차감 | §97① | 기존 케이스 | `acq-cost-swap.test.ts` | ☑ |
| 6 | 토지·건물 분리 (`calcSplitGain`) + 환산 + swap → 자산 단위 swap | §97② 단서 + §166⑥ | 합성 (자산별 명시 입력 시만 활성) | `acq-cost-swap-split.test.ts` | ☑ |
| 7 | multi-parcel + 환산 → expenses 처리 일관성 회귀 | §97② 본문 | 기존 PDF 사례 | `multi-parcel-transfer.test.ts` 기존 28건 | ☑ (회귀 통과) |
| 8 | 환산 모드 + 본문 expenses 이중 차감 회귀 (legacy 버그) | §97② 본문 | 합성 (반례) | `acq-cost-swap.test.ts` | ☑ |
| 경계 | estimatedSide == directSide → 본문 적용 | §97② 단서 ("적은 경우" 명시) | 합성 (boundary) | `acq-cost-swap.test.ts` | ☑ |

**케이스 6 결정**: 토지·건물 분리 시 단서 swap은 **자산 단위 독립 적용** — 토지의 환산+개산 < 토지의 자본+양도비면 토지만 swap, 건물도 동일. 합산 비교 시 한쪽 자산이 다른 쪽을 가려 단서 의도(필요경비 보장)가 왜곡됨.

---

## 엔진 input 타입 변경

```ts
export type TransferTaxInput = {
  // 기존
  expenses: number;  // ← deprecated (backward-compat)
  // 신규
  capitalExpenditure?: number;  // 자본적 지출액 (§97① 2호 가목)
  transferExpense?: number;     // 양도비 (§97① 2호 나목)
  // ...
};
```

**Backward compat 정책**: `capitalExpenditure`/`transferExpense` 둘 다 undefined이면 `expenses`를 자본+양도비 합으로 간주하되 **swap 불가** (분리 정보 없음). swap이 필요하면 두 필드 명시 입력.

엔진 내부 정규화:
```ts
const capExp = input.capitalExpenditure ?? 0;
const trExp = input.transferExpense ?? 0;
const directExpenseTotal = (capExp + trExp) || input.expenses; // legacy fallback
const swapEligible = input.capitalExpenditure !== undefined || input.transferExpense !== undefined;
```

## 엔진 result 타입 추가

```ts
export type TransferGainResult = {
  // 기존
  gain, usedEstimated, estimatedBase, estimatedDeduction, expenses, splitDetail
  // 신규
  necessaryExpenseMode?: "estimated_with_deduction" | "swap_to_direct" | "actual";
  swapApplied?: boolean;          // 단서 발동 여부
  swapComparison?: {
    estimatedSide: number;        // 환산 + 개산공제
    directSide: number;           // 자본 + 양도비
    chosen: "estimated" | "direct";
  };
};
```

`CalculationStep` 추가: swap 발동 시 "필요경비 swap (§97② 단서) 적용 — 환산+개산 ₩X < 자본+양도비 ₩Y" 산식.

---

## 계산 알고리즘 (단계별)

### `calcTransferGain` 신규 분기

```ts
function calcNecessaryExpense(input, estimatedBase, estimatedDeduction): {
  finalExpense: number;
  mode: "estimated_with_deduction" | "swap_to_direct" | "actual";
  swap?: {...};
} {
  const capExp = input.capitalExpenditure ?? 0;
  const trExp = input.transferExpense ?? 0;
  const directSide = capExp + trExp;
  const swapEligible = input.capitalExpenditure !== undefined
    || input.transferExpense !== undefined;

  if (!input.useEstimatedAcquisition && input.acquisitionMethod !== "appraisal") {
    // 실가 모드 — swap 무관, 자본+양도비 직접 차감
    return {
      finalExpense: directSide || input.expenses,  // legacy fallback
      mode: "actual",
    };
  }

  const estimatedSide = estimatedBase + estimatedDeduction;

  if (swapEligible && directSide > estimatedSide) {
    // §97② 2호 단서 swap 발동
    return {
      finalExpense: directSide - estimatedBase,  // 환산취득가는 그대로 두고, 필요경비를 directSide로 교체
      // 단, 산식상 더 명확한 방식: acquisitionCost를 별도로 표현
      mode: "swap_to_direct",
      swap: { estimatedSide, directSide, chosen: "direct" },
    };
  }

  // 본문 — 환산 + 개산공제만
  return {
    finalExpense: estimatedDeduction,
    mode: "estimated_with_deduction",
    swap: swapEligible
      ? { estimatedSide, directSide, chosen: "estimated" }
      : undefined,
  };
}
```

**산식 표현 결정**: swap 발동 시 `acquisitionCost = estimated`(환산) 유지하고, `expenses = directSide`로 두어 `gain = transfer - estimated - directSide`. 본문은 `expenses = estimatedDeduction`. 이로써 결과 화면 산식이 깔끔.

### `calcSplitGain` (토지·건물 분리)

각 자산(토지·건물)에 대해 독립적으로 위 알고리즘 적용. 입력은 `landCapitalExpenditure`·`landTransferExpense`·`buildingCapitalExpenditure`·`buildingTransferExpense` 4필드 (또는 split-side에서 비율 안분). 우선 합산 입력 + 자동 안분은 **금지** (silent fallback 정책 위반) — 자산 단위 명시 입력 강제.

### `multi-parcel-transfer.ts`

기존 `expenses = estimatedDeduction` 로직을 새 `calcNecessaryExpense` 헬퍼로 일원화. 각 parcel 독립 swap.

---

## Silent fallback / 자동 안분 후보 식별

| 후보 | 결정 |
|------|------|
| `capitalExpenditure`/`transferExpense` 미입력 시 `expenses` 단일값을 자동 분배 | ☐ 금지 — backward-compat은 합산 차감만 허용, swap 비활성 |
| 토지·건물 분리 시 자본·양도비 자동 안분 | ☐ 금지 — 자산별 명시 입력 |
| swap 결과 음수 처리 | `Math.max(0, ...)` 적용 |

---

## 테스트 약속

- 케이스 인벤토리 표 8개 행 모두 anchor 1개 이상.
- swap 경계값 (estimatedSide == directSide) 테스트 필수 — 동률 시 본문 적용 (단서는 "적은 경우" 명시).
- 회귀: 기존 `transfer-tax/basic.test.ts`·`__tests__/tax-engine/multi-parcel-transfer.test.ts` 모든 anchor 유지.

---

## UI 통합 위임

UI 측은 `transfer-tax-acq-cost-swap.ui.design.md`로 별도 작성 (UI 시니어 호출). 8개 동기화 지점:
- 폼 타입에 `capitalExpenditure`/`transferExpense` 분리 입력 (현재 단일 `expenses` 폐지 또는 deprecated)
- AssetForm에 자산-수준 필드로 추가
- API 변환에서 두 필드 라우트 전송
- 결과 카드에 swap 발동 여부 + 비교액 노출
- validation: 두 필드 모두 음수 차단, swap 모드 시 산식 표시

---

## 작업 순서

1. **본 PR (엔진)**: input 타입 확장, `calcNecessaryExpense` 헬퍼, `calcTransferGain` 통합, `calcSplitGain` 통합, `multi-parcel` 통합, 8개 anchor 테스트
2. **별도 PR (UI)**: UI 시니어 호출 후 8개 동기화 지점 일괄 — `transfer-tax-acq-cost-swap.ui.design.md` 선행
3. **별도 PR (API/validation)**: 두 필드 fallback 정책 확정 후 일괄
