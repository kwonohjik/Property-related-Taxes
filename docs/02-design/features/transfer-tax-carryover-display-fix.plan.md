# 이월과세 적용 시 취득가액·필요경비 계산 근거 표시 + 증여세 상당액 누락 수정 계획

**세목**: 양도소득세 (배우자등 이월과세, 소득세법 §97조의2)
**유형**: (1) **엔진 수치 버그** — 실가 모드 증여세 상당액 필요경비 누락 + (2) 결과뷰 근거 표시 오류
**작성일**: 2026-07-24 (정정: probe 실측으로 수치 버그 확인 → 범위 확대)

## ⚠️ 정정 이력 (Pre-Do anchor 결과)

초안은 "숫자는 정확하나 근거 문구만 오류"로 판단했으나, **probe 실측 결과 실가 모드에서 증여세 상당액이 필요경비에서 실제 누락**됨을 확인 → 엔진 수치 수정으로 범위 확대:

| probe | 양도차익(현재) | 정상값 | 판정 |
|---|---|---|---|
| 실가+양도비 22.12M+증여세 30M | 233,225,912 | 203,225,912 | 증여세 30M 드롭 |
| 실가+자본 10M+양도비 12M+증여세 30M | 233,345,912 | 203,345,912 | 증여세 30M 드롭 |

**근본 원인**: `transfer-tax-carryover.ts:275-278`(실가 else-분기)가 증여세를 legacy `expenses`에 가산하지만, `inputABase`가 `capitalExpenditure`를 **항상 정의**(`:220` `effectiveCapex`)해 `calcNecessaryExpense`(`transfer-tax-helpers.ts:240,245`)의 swap-aware 경로가 활성 → legacy `expenses` 무시 → 증여세 드롭. 기존 테스트 `carryover-gift-tax-expense.test.ts:80,86`이 `toBeLessThanOrEqual`(같음 허용)로 버그를 은폐하고 있었음.

**영향**: §163의2 증여세 상당액 공제 누락 → 양도차익 과대 → **납세자 불리 과대과세** (feedback_no_unfavorable_application_without_legal_basis 위반).

**수정 방향(검증 완료)**: 실가 else-분기에서 증여세를 `expenses` 대신 `transferExpense`(나목)에 가산 → `directSide`로 반영. capex 표시 관행(취득가액 합산) 보존.

---

## 1. 문제 정의 (관찰된 증상)

이월과세 **Scenario A(적용)** 채택 시, 결과뷰 "1단계 — 양도차익 산정"의 취득가액·필요경비 **근거 문구가 일반 취득과 동일하게** 렌더된다 (첨부 이미지 #2).

| 항목 | 값 (정확) | 현재 근거 문구 (오류) | 올바른 근거 |
|---|---|---|---|
| 취득가액 | 444,654,088 | `취득가액 444,654,088 (실제 거래가액)` | **증여자 취득 당시** 취득가액(승계) — 이월과세 §97의2① |
| 필요경비 | 22,120,000 | `양도비 22,120,000 (중개수수료·법무사 비용 등) — §97① 나목` | 양도비 + (해당 시) **증여세 상당액** §163의2② + **증여자 자본적지출** §97의2①2호 후단 |

**핵심**: 숫자는 정확하나(엔진은 올바르게 계산), 근거(계산 산식 문구)가 이월과세 특유의 구성을 설명하지 못한다.

---

## 2. 근본 원인 (실측 근거)

이월과세 Scenario A 채택 시 엔진은 `calcCarryoverScenarios()`가 만든 `adoptedInput`(= `inputAFinal`)을 **메인 `calculateTransferTax()`에 재투입**한다 (`lib/tax-engine/transfer-tax-carryover.ts:281,343`). 그 결과:

1. **취득가액 근거 오류** — 결과뷰 근거 빌더 `buildAcquisitionPriceFormula()` (`components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:506-528`)는 `result.usedEstimatedAcquisition`만 보고 분기한다. 이월과세 여부(`result.carryoverTaxationDetail`)를 전혀 참조하지 않아 일반 실가/환산 문구를 그대로 출력.
   - 특히 **환산+증여세 차감 경로**에서는 엔진이 `useEstimatedAcquisition`을 `false`로 뒤집고 필요경비를 `expenses`에 접기 때문에(`transfer-tax-carryover.ts:256-272`), `result.usedEstimatedAcquisition = false` → 근거가 무조건 "실제 거래가액"으로 표시됨.

2. **필요경비 근거 오류** — `buildNecessaryExpenseFormula()` (같은 파일 `:534-555`) 역시 이월과세 미인식. `inputAFinal.expenses = rawInput.expenses + giftTaxAddedToExpense` (실가) 또는 `necessaryExpenseBeforeGift + giftTaxAddedToExpense` (환산+증여세)로 **증여세 상당액이 필요경비에 합산**되어 있으나(`transfer-tax-carryover.ts:268,277`), 근거 문구는 "양도비 (중개수수료·법무사)"만 표기 → 증여세 상당액이 필요경비에 왜 포함됐는지 설명 없음. `donorCapexAddedToExpense`(증여자 자본적지출 §97의2①2호 후단)도 동일하게 미설명.

3. **빌더는 이미 `result` 전체를 받으므로**(`DetailedStatementHelpers.ts:252,285`) `result.carryoverTaxationDetail.scenarioA`에 접근 가능. 단, scenarioA에 **취득 basis 모드(환산/실가) echo가 없어**(`transfer-carryover.types.ts:85-131` 확인 — `acquisitionPrice`·`giftTaxAddedToExpense`·`donorCapexAddedToExpense`·`giftTaxLimitApplied`·`giftTaxLimitCap`·`donorCapexGuardApplied`·`effectiveCapex`는 있으나 모드 플래그·환산 기준시가 없음) 환산 산식 재현이 불가.

---

## 3. 수정 범위 (Surgical — 근거 문구만)

**변경 대상 3개, 그 외 무변경**:
- `lib/tax-engine/types/transfer-carryover.types.ts` — scenarioA에 echo 필드 추가 (엔진 산식 무변경, `echo-field-pattern`)
- `lib/tax-engine/transfer-tax-carryover.ts` — scenarioA 조립 시 echo 값 채움 (계산 로직 무변경)
- `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts` — 두 빌더에 이월과세 분기 추가

**무변경**: 엔진 세액 계산, `CarryoverComparisonCard`(별도 비교 카드 — 정상), 다건(aggregate) 경로(이월과세는 단건 전용).

---

## 4. 상세 설계

### Phase 0 — Pre-Do anchor (설계 환류 우선, `pre-do-anchor-verification`)

수정 전, 현재 잘못된 근거 문구를 고정하는 anchor 2건 작성·실행하여 **엔진 데이터가 실제로 무엇을 담는지** 확정:

- **A-1 실가 모드 + 증여세 상당액 > 0**: `carryoverTaxation`에 `giftTaxAmount > 0` 지정 → `result.expenses`가 `양도비 + giftTaxAddedToExpense`임을 assert. 현재 `buildNecessaryExpenseFormula` 출력이 "양도비 …"로 증여세 누락 설명임을 확인.
- **A-2 환산 모드 + 증여세 상당액 > 0**: `useEstimatedAcquisition=true` + `giftTaxAmount > 0` → `result.usedEstimatedAcquisition === false`(뒤집힘) assert. 현재 취득가액 근거가 "실제 거래가액"으로 오표시됨을 확인.

> 이 anchor로 echo 필드 필요 여부·환산 산식 재현 가능성을 확정한 뒤 Phase 1 착수. (예상 불일치 시 설계 수정)

### Phase 1 — 엔진 echo 필드 (`transfer-carryover.types.ts` + `transfer-tax-carryover.ts`)

`CarryoverScenarioADetail`에 optional echo 추가:

```ts
/** 취득가액 산정 방식 — true면 증여자 취득 당시 환산취득가(§163⑨), false면 실가 승계 */
acquisitionWasEstimated?: boolean;
/** 환산 모드일 때 취득시 기준시가 (환산 산식 재현용, echo) */
estimatedStdPriceAtAcquisition?: number;
/** 환산 모드일 때 양도시 기준시가 (환산 산식 재현용, echo) */
estimatedStdPriceAtTransfer?: number;
```

`transfer-tax-carryover.ts`의 scenarioA 조립부(`:287-298`)에서 `ct.useEstimatedAcquisition`·환산 경로의 기준시가를 그대로 echo. **계산에 영향 없음**(표시 전용).

### Phase 2 — 결과뷰 근거 빌더 이월과세 분기

`DetailedStatementFormulaBuilders.ts`:

**`buildAcquisitionPriceFormula`** — 시그니처에 `result` 이미 있음. 함수 진입부에 분기 추가:
```ts
const co = result.carryoverTaxationDetail;
if (co?.adoptedScenario === "A" && !isAggregate) {
  const a = co.scenarioA;
  if (a.acquisitionWasEstimated) {
    // 환산 산식 (echo 기준시가 사용) + 이월과세 근거
    return `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)} = 양도가액 × (취득시 기준시가 ${...} ÷ 양도시 기준시가 ${...}) — 이월과세 §97의2① (증여자 취득가액 승계·시행령 §163⑨)`;
  }
  return `증여자 취득 당시 취득가액 ${fmt(a.acquisitionPrice)}${capExStr} — 이월과세 §97의2① (증여자 취득가액 승계)`;
}
// …기존 로직 유지
```

**`buildNecessaryExpenseFormula`** — 시그니처에 `result` 이미 있음. 이월과세 분기:
```ts
const co = result.carryoverTaxationDetail;
if (co?.adoptedScenario === "A" && !isAggregate) {
  const a = co.scenarioA;
  const parts = [`양도비 등 ${fmt(...)}`];
  if (a.giftTaxAddedToExpense > 0)
    parts.push(`증여세 상당액 ${fmt(a.giftTaxAddedToExpense)}${a.giftTaxLimitApplied ? ` (한도 ${fmt(a.giftTaxLimitCap)} 적용)` : ""} — §97의2① 3호·시행령 §163의2②`);
  if (a.donorCapexAddedToExpense > 0)
    parts.push(`증여자 자본적지출 ${fmt(a.donorCapexAddedToExpense)} — §97의2①2호 후단`);
  // donorCapexGuardApplied면 "양도일 2024-01-01 전 — 증여자 자본적지출 불산입" 주석
  return parts.join(" + ") + ` = ${fmt(singleExp)}`;
}
// …기존 로직 유지
```

> **양도비 분해값**: `singleExp − giftTaxAddedToExpense − (해당 시 필요경비 흡수 capex)` 로 역산하되, 음수 가드. Phase 0 anchor로 정확한 분해식 확정 후 확정.

### 근거 조문 상수화

문자열 리터럴 대신 `lib/tax-engine/legal-codes/transfer.ts`의 `TRANSFER.CARRYOVER_*` 상수 참조 (§97의2① 승계·§163의2② 증여세·§97의2①2호 후단 자본적지출). 필요 상수 부재 시 추가.

---

## 5. 검증 기준 (Goal-Driven)

- [ ] Phase 0 anchor 2건 작성·실행 → 현재 오표시 확정 (Do 전)
- [ ] Phase 2 후 anchor 갱신 → 근거 문구에 "증여자 취득가액 승계", "증여세 상당액", 해당 시 "증여자 자본적지출" 포함 assert
- [ ] **숫자 무변경 회귀**: 기존 carryover 테스트 전건 통과 (`__tests__/tax-engine/transfer-tax/carryover-*.test.ts` — 취득가액·필요경비·양도차익 값 불변)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/carryover` 통과
- [ ] 브라우저 수동 확인: 이월과세 계산 → 1단계 취득가액·필요경비 근거 문구 육안 확인 (미수행 시 명시)

---

## 6. 리스크·주의

- **echo 필드는 optional** → 기존 직렬화/스토리지 호환. carryover 미적용 시 undefined로 기존 경로 완전 보존.
- **환산 산식 재현 실패 리스크**: 환산+증여세 경로에서 엔진이 실가로 뒤집으므로 환산 기준시가가 result 본문엔 없음 → **반드시 scenarioA echo에서 취득**. Phase 0에서 echo 값 존재 확인.
- **다건(aggregate) 제외**: 이월과세는 단건 전용이므로 `!isAggregate` 가드로 aggregate perAsset 경로 무영향.
- **양도비 분해 음수**: `giftTaxAddedToExpense`가 `singleExp`보다 큰 극단 케이스 → `Math.max(0, …)` 가드.
