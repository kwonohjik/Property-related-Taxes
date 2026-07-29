# 부담부증여 — stale 산정방식이 §159 안분 취득가액을 덮어쓰는 버그 (계획서)

- 작성일: 2026-07-16 (rev.2 — **Do 완료 환류**)
- 상태: ✅ Do 완료

## Do 환류 — 설계와 달라진 점

### 🔴 D1. A1만으로 닫히지 않는 구멍 — `finalize.ts` penaltyBase (계획 미기재)

계획 §3-1은 "엔진 스텝에서 `acquisitionMethod` 정규화"만 다뤘으나, **`finalize.ts:335`·`transfer-tax.ts:378`이
raw `input.acquisitionMethod`를 참조**해 정규화(effectiveInput)가 닿지 않았다.

**실측**: K-5 자가건축 + stale 감정가액 → `penaltyTax` **2,500,000 → 45,000,000 (18배 과다)**.
(anchor 케이스 5-b가 RED로 검출)

**근본**: 발동 게이트인 `calculateBuildingPenalty`는 **이미 `effectiveInput`을 받는데**(`finalize.ts:348`·
`rate-calc.ts:58`) **base만 raw `input`에서 가져오는 층위 불일치**였다.
→ 두 곳을 `effectiveInput` 참조로 교체(A4). 게이트와 base의 층위를 일치시킨 것.

**회귀 0 근거(정정)**: 최초 주석은 "비-부담부는 override가 없어 두 값이 같다"고 썼으나 **거짓**이다 —
`transfer-tax-carryover.ts:261`이 `acquisitionMethod: undefined`로 덮는다(반례). 실제 회귀 0 근거는
**`calculateBuildingPenalty`가 이미 effectiveInput을 게이트로 읽어** 그 경로가 `penaltyTax=0`으로 수렴한다는 것.
(코드리뷰가 검출 — `feedback_engine_comment_vs_impl_drift`)

### D2. 증상이 계획서 기재보다 큼

계획 §1은 "양도차익 6억 → 99,970,000"으로 적었으나, **전체 엔진에선 §159 양도가(5억) < 추계액(9억)**이라
손실 floor로 **양도차익 0 = 세금 0**이 된다(anchor 케이스 2·3 RED 메시지).

### D3. Phase B(API 가드) 미채택

`isSalesCase`/`isAppraisal`이 `acquisitionMethod`·`appraisalValue`·`similarSalesValue`뿐 아니라
**`acquisitionPrice`(`:200`·`:220`)·`useEstimatedAcquisition`(`:244`) 산출에도** 쓰여(실측) 가드 시 4곳이 동시에 변한다.
A1+A4가 엔진 최종 방어이므로 §3-2의 "미채택 시에도 3-1이 최종 방어" 조항대로 **미채택**.

### D4. 검증 결과

| 게이트 | 결과 |
|---|---|
| anchor (신규 9케이스) | **9/9** — 케이스 2·3·5-b가 RED→GREEN |
| K-5 penalty 기존 테스트 | **25/25 무회귀**(수정 전 기준선 고정 후 대조) |
| 양도세 엔진 | **1,839건 통과** |
| 전체 test | **10,585 통과** — 회귀 0 |
| tsc / lint | **0건 / 0 error** |
| 코드 품질 정적 검토 | Critical 0 · Important 1(주석 사실오류) **수정 완료** · Nit 4건 처리 |

### D5. 14 동기화 지점 — 해당 없음

신규 엔진 input/result 필드 **0건**. `acquisitionMethod`는 기존 필드이고 **참조 대상만**
`input` → `effectiveInput`으로 바꿨다. UI 무변경(§3-3 준수).

---
- 발단: `land-building-split-mode-gating-and-salescase-drift.plan.md` 조사 중 발견(그 계획의 **S6**로 분리)
- 심각도: 🔴 **High — 세액 과소납부, 금액 큼**
- 법령: 소득령 §159(부담부증여) · §176의2③1호(매매사례가액) · §163⑥(개산공제)

---

## 1. 증상 (probe 실측)

조건: 총양도가액 10억 / §159 안분 취득가액 4억 / 추계액(매매사례·감정) 9억.

| 상황 | 양도차익 | 판정 |
|---|---|---|
| 정상(산정방식 미선택) | **600,000,000** | ✅ §159 안분 4억 정상 차감 |
| stale `salesCase` + `similarSalesValue` 9억 | **99,970,000** | 🔴 §159 4억 무시 → 9억 사용 |
| stale `appraisal` + `appraisalValue` 9억 | **99,970,000** | 🔴 동일 |

양도차익 6억 → **1억 미만으로 폭락**. `salesCase`·`appraisal` **양쪽** 발생.
(99,970,000 = 10억 − 9억 − 개산공제 30,000)

**재현 절차**:
1. 자산 카드 ③ 취득정보 → 취득 원인 **매매** → 취득가액 산정 방식 **매매사례가액**(또는 감정가액) 선택 + 금액 입력
2. ② 양도정보 → **부담부증여** 선택
3. 계산 → 취득가액이 §159 안분값이 아니라 2단계에서 입력한 추계액으로 계산됨

---

## 2. 원인 — 가드 부재 3중 (실측)

### 2-1. UI가 폼 상태를 의도적으로 보존

`CompanionAcqPurchaseBlock.tsx:338-341` 주석:
> 부담부증여 모드 — 취득가액 산정 방식·실거래가 입력 **숨김**(§159 자동 산정).
> 폼 상태(`useEstimatedAcquisition`·`fixedAcquisitionPrice` 등)는 **보존**하여 …

`TransferModeBlock.tsx`의 `selectMode("burdened_gift")`도 `isSalesCaseAcquisition`·`isAppraisalAcquisition`·
`useEstimatedAcquisition`를 리셋하지 않는다(재토글 시 복원 목적 — **의도된 설계**).

→ **UI 보존 자체는 정당**하다. 문제는 보존된 값이 엔진까지 흘러가는 것.

### 2-2. API에 부담부증여 가드 없음

```ts
// transfer-tax-api.ts:82
const isSalesCase = primary.isSalesCaseAcquisition === true;          // ← transferType 무관
// :269-272
acquisitionMethod: hasPre1990 || isMixed ? "actual"
  : isSalesCase ? "salesCase"
  : (isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"),
// :275
similarSalesValue: isSalesCase ? parseAmount(primary.similarSalesValue) || undefined : undefined,
```

### 2-3. 🔴 엔진 스텝이 `acquisitionMethod`를 리셋하지 않음 — **근본 원인**

`transfer-tax-burdened-gift-step.ts:72-90`은 §159 산정 후 `workingInput`을 덮어쓰는데:

```ts
workingInput = {
  ...workingInput,
  transferPrice: totalTransferPrice,
  acquisitionPrice: totalAcquisitionPrice,   // ← §159 안분값
  expenses: totalEstimatedDeduction,
  capitalExpenditure: undefined,
  transferExpense: undefined,
  useEstimatedAcquisition: false,            // ← 환산 분기는 차단됨
  burdenedGiftDenominator: ...,
  // ⚠️ acquisitionMethod 미리셋 → stale 값 생존
  ...(isK5SelfBuilt ? { acquisitionMethod: "estimated" as const, ... } : {}),
};
```

`useEstimatedAcquisition: false`로 **환산 분기만** 막았고, `acquisitionMethod` 기반 분기는 무방비.

### 2-4. `calcTransferGain`이 stale 분기로 진입

```ts
// transfer-tax-helpers.ts:309   환산 — useEstimatedAcquisition=false라 미진입 ✅
if (input.useEstimatedAcquisition) { ... }
// :332   감정가액 — acquisitionMethod로 판정 🔴
else if (input.acquisitionMethod === "appraisal") {
  const appraisal = input.appraisalValue ?? input.acquisitionPrice;   // ← §159값 덮어씀
  acquisitionCostBase = appraisal;
}
// :339   매매사례가액 🔴
else if (input.acquisitionMethod === "salesCase") {
  const salesCase = input.similarSalesValue ?? input.acquisitionPrice; // ← §159값 덮어씀
  acquisitionCostBase = salesCase;
}
else { acquisitionCostBase = input.acquisitionPrice; }   // ← 정상 경로
```

→ **`?? input.acquisitionPrice` fallback이 있으나, 추계액이 존재하면 그쪽이 우선**된다.

---

## 3. 설계

### 3-1. 근본 수정 — 엔진 스텝에서 `acquisitionMethod` 정규화 (Phase A)

`transfer-tax-burdened-gift-step.ts:72` 블록에 추가:

```ts
workingInput = {
  ...workingInput,
  transferPrice: totalTransferPrice,
  acquisitionPrice: totalAcquisitionPrice,
  expenses: totalEstimatedDeduction,
  capitalExpenditure: undefined,
  transferExpense: undefined,
  useEstimatedAcquisition: false,
  // §159 안분값을 그대로 취득가액으로 쓴다 — 일반 취득가액 산정방식(환산·감정·매매사례)은
  // 부담부증여에서 UI가 숨기지만 폼 상태는 보존되므로(재토글 복원 목적) stale 값이 흘러들 수 있다.
  // useEstimatedAcquisition:false가 환산 분기만 막고 acquisitionMethod 분기는 무방비였다
  // → calcTransferGain이 similarSalesValue/appraisalValue를 §159값보다 우선 적용(과소납부).
  acquisitionMethod: "actual" as const,
  burdenedGiftDenominator: ...,
  ...(isK5SelfBuilt ? { acquisitionMethod: "estimated" as const, ... } : {}),
};
```

**⚠️ K-5 자가건축 분기를 깨뜨리지 않는다 (실측 근거)**:
- `isK5SelfBuilt`(`:56-58` — `burdenedGiftInfo.acquisitionMethod === "converted" && isSelfBuilt`)는
  `acquisitionMethod: "estimated"`를 **의도적으로** 설정한다. 주석(`:52-54`): "§114조의2 penalty 전용 신호이며,
  본 양도차익은 §159 안분값(`useEstimatedAcquisition:false`)으로 계산. 발동 게이트는 `calculateBuildingPenalty`가 최종 판정."
- **spread 순서상 K-5가 뒤**라 `"actual"`을 덮어쓴다 → 기존 동작 보존.
- `"estimated"`는 `calcTransferGain`에서 무해하다 — 환산 분기는 `useEstimatedAcquisition`으로 판정하고(`:309`),
  `"estimated"`는 `appraisal`/`salesCase` 분기 어디에도 안 걸려 **else(정상 경로)**로 떨어진다.

**왜 `"actual"`인가**: §159 안분 취득가액은 **이미 최종값**이다(`burdenedGiftInfo.acquisitionMethod`가
"actual"이든 "converted"든 `buildBurdenedGiftBreakdown`이 내부에서 반영해 산출). `calcTransferGain`은 이를
그대로 차감만 하면 된다 → `"actual"`(= `input.acquisitionPrice` 그대로 사용)이 정확한 의미.
개산공제도 이미 `expenses: totalEstimatedDeduction`으로 전달되므로 이중 적용 없음
(`calcNecessaryExpense`가 `isEstimatedMode=false` → `expensesApplied = input.expenses`, `swapEligible=false`).

### 3-2. 방어 계층 — API 가드 (Phase B, 선택)

`transfer-tax-api.ts:82-83`에 부담부증여 가드:
```ts
const isBurdenedGift = primary.transferType === "burdened_gift";
const isSalesCase = !isBurdenedGift && primary.isSalesCaseAcquisition === true;
const isAppraisal = !isBurdenedGift && !isSalesCase && primary.isAppraisalAcquisition === true;
```

- **엔진 수정(3-1)만으로 충분**하나, API가 애초에 안 보내면 노출면이 준다(방어 심층화).
- ⚠️ **범위 판단 필요**: `appraisalValue`·`similarSalesValue`가 다른 곳에서도 쓰이는지 확인 후 결정.
  `isAppraisal`은 `acquisitionMethod`·`appraisalValue` 외에도 참조될 수 있음 → grep 전수 필요.
- **미채택 시에도 3-1이 최종 방어**이므로 세액은 정확하다.

### 3-3. UI는 건드리지 않는다

폼 상태 보존은 **의도된 설계**(재토글 복원). 리셋하면 사용자가 부담부증여를 껐다 켤 때 입력이 날아간다.
→ **엔진이 정규화**하는 3-1이 옳은 층위. (`bg*` 필드 보존 패턴과 동형 — `TransferModeBlock.tsx` selectMode)

---

## 4. 케이스 매트릭스

총양도 10억 / §159 안분 취득 4억 / 추계액 9억.

| # | 상황 | 기대 | 현행 |
|---|---|---|---|
| 1 | 부담부증여, 산정방식 미선택 | 양도차익 **6억** | ✅ 동일 (회귀 방어) |
| 2 | 부담부증여 + stale `salesCase`(9억) | 양도차익 **6억** — 추계액 무시 | 🔴 99,970,000 |
| 3 | 부담부증여 + stale `appraisal`(9억) | 양도차익 **6억** | 🔴 99,970,000 |
| 4 | 부담부증여 + stale `useEstimatedAcquisition=true` | 양도차익 **6억** | ✅ 동일 (`:79`가 이미 false로 리셋 — 회귀 방어) |
| 5 | **K-5 자가건축**(`burdenedGiftInfo.acquisitionMethod="converted"` + `isSelfBuilt`) | `acquisitionMethod="estimated"` **유지** + `estimatedBase` 유지 → §114조의2 penalty 정상 | ✅ 동일 (**최우선 회귀 방어**) |
| 6 | **K-5 증축**(`buildingType="extension"`) | `extensionPenaltyBase` 유지 | ✅ 동일 (회귀 방어) |
| 7 | 부담부증여 + 토지·건물 취득일 분리 + stale `salesCase` | split·비-split **모두 6억** | 🔴 둘 다 오염(split은 S6 수정 후 A-1 적용 시) |
| 8 | 일반 양도(비-부담부증여) + `salesCase` | **추계액 9억 사용**(정상 동작) | ✅ 동일 (**과잉 수정 방어**) |

> 케이스 5·6·8이 **핵심 회귀 방어**다. 5·6은 K-5 penalty 신호, 8은 일반 경로의 salesCase가 정상 동작함을 고정.

---

## 5. 실행 계획

```
[Pre-Do anchor] — RED 확인 필수
  P1. __tests__/tax-engine/transfer-tax/burdened-gift-stale-acq-method.anchor.test.ts
      케이스 2·3 RED / 케이스 1·4·5·6·8 GREEN(회귀 방어 — 수정 후에도 유지되어야 함)
  P2. 기존 부담부증여 anchor 전수 목록화:
      grep -rl "burdened\|burdenedGiftInfo\|§159" __tests__/tax-engine/transfer-tax/
      → K-5·증축·12억 안분 anchor가 값 변동 없는지 사전 식별

[Phase A — 엔진 정규화] (커밋 1)
  transfer-tax-burdened-gift-step.ts — acquisitionMethod: "actual" 추가 (K-5 spread 뒤에 두어 override 보존)
  verify: P1 GREEN 전건 + npx vitest run __tests__/tax-engine/transfer-tax/

[Phase B — API 가드] (커밋 2 · 선택)
  grep로 isAppraisal/isSalesCase 참조 전수 확인 → 부작용 없으면 가드 추가
  없으면 Phase A만으로 종료(3-2 참조)

[Phase C — 회귀]
  전체 test · baseline anchor · 브라우저 실측(Playwright — 재현 절차 §1 그대로)
```

## 6. 위험

- 🔴 **K-5 penalty 회귀**가 최대 위험. `isK5SelfBuilt` spread가 `"actual"`을 덮어쓰는지 **anchor(케이스 5·6)로 고정** 후 수정.
- **과잉 수정 위험**: 일반 양도의 salesCase/appraisal은 정상 동작이므로 건드리면 안 된다(케이스 8).
  정규화는 **`isBurdenedGiftEngine && burdenedGiftInfo` 블록 내부**에만 적용된다 — 블록 밖 경로 무영향.
- **`acquisitionCause === "burdened_gift"` legacy 경로**도 `isBurdenedGiftEngine`에 포함(`:23-25`) → 함께 수정됨.
- ~~`burdenedGiftInfo` 부재 시 스텝 미실행~~ → **✅ 해소(2026-07-16 실측)**: API의
  `isBurdenedGift`(`transfer-tax-api.ts:123-125`)와 엔진의 `isBurdenedGiftEngine`(`burdened-gift-step.ts:22-24`)이
  **동일 조건**(`transferType === "burdened_gift" || acquisitionCause === "burdened_gift"`)이고,
  `buildBurdenedGiftInfo(primary): BurdenedGiftInfoPayload`는 **비-optional 반환**(`transfer-tax-api-burdened-gift.ts:67`)
  → `isBurdenedGift`가 참이면 `burdenedGiftInfo`가 **항상 전달**된다. 스텝 미실행 구멍 없음.

## 7. 관련

- 본 버그를 발견한 계획: `land-building-split-mode-gating-and-salescase-drift.plan.md` §7 S6
  - 그 계획의 **A-1은 가드를 넣지 않는다** — split에만 가드를 넣으면 비-split과 새 드리프트가 생긴다.
    S6(본 계획)가 **양 경로를 함께** 고치는 것이 정합적. A-1 anchor 케이스 17이 `split === 비-split`을 고정.
- `feedback_no_unfavorable_application_without_legal_basis` — 본 수정은 납세자 **불리** 방향(과소납부 → 정상).
  법령 근거 명확(§159가 취득가액 산정을 규정, 일반 추계는 §159 적용 시 적용 여지 없음) → 정책 위반 아님.
