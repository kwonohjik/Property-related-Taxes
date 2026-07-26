# 수정 계획서 — 사이드바 `필요경비` 개산공제 미표시 (계산 시점 변경)

**작성일**: 2026-07-26
**세목**: 양도소득세 (환산취득가·감정가액 모드 개산공제 §163⑥)
**증상**: 세액 계산 완료 후에도 사이드바 `필요경비`가 `-`. 개산공제액이 표시되지 않음.

> ✅ **구현 완료 (2026-07-26)**: A안. 즉시=`floor(std×3%)` 개산공제 + result 후 권위 override.
> **실측 정정**: override는 `estimatedDeduction+expenses`가 아닌 **`result.expenses` 단독**(engine probe로 본문 모드 `expenses=estimatedDeduction=12M` 확인 → 합산 시 이중계산). anchor 7건 + tsc 0건.

---

## 1. 증상 (관찰)

마법사 좌측 사이드바 요약:
- `양도가액 800,000,000` · `취득가액 480,000,000` 정상 표시
- **`필요경비 -`** — 환산/감정 모드의 개산공제(§163⑥)가 계산 완료 후에도 미표시

---

## 2. 근본 원인 (실제 코드 검증)

### 2-a. 사이드바 필요경비는 **입력 필드만** 합산 — 개산공제·result 미참조

`lib/stores/calc-wizard-store.ts:464-486` `computeTransferSummary`의 `totalNecessaryExpense`:

```ts
// 자산별: 겸용은 주택/상가 섹션별 실경비 합, 그 외는 capex+transferExpense || directExpenses
const capExp = parseRaw(a.capitalExpenditure);
const trExp = parseRaw(a.transferExpense);
baseExp = (capExp + trExp) > 0 ? capExp + trExp : parseRaw(a.directExpenses);
```

- **개산공제(§163⑥)는 전혀 포함 안 됨.**
- **`result` 인자를 필요경비 산출에 전혀 사용 안 함**(`estimatedTax`만 result에서 읽음, L487-492).
- 환산/감정 모드는 사용자가 capex/양도비를 입력하지 않으므로 `totalNecessaryExpense = 0` → 사이드바 `-`.

### 2-b. 개산공제는 엔진 result에만 존재 (사이드바 미연결)

`lib/tax-engine/types/transfer-result.types.ts:69` `estimatedDeduction?: number` — "개산공제액(취득시 기준시가 × 3%) — 환산/감정가액 모드에서만".
`:78` `expenses?: number` — "엔진이 실제 차감한 필요경비 합계(자본+양도비, swap 후)".

**권위 미러** = 단건 결과뷰 `TransferTaxResultView.tsx:89-93`:
```
estimatedDeduction > 0 → "필요경비 (개산공제 §163⑥)"  값 estimatedDeduction
expenses > 0           → "필요경비 (자본·양도비[/§97②단서])" 값 expenses
```
→ **실필요경비 = `(estimatedDeduction ?? 0) + (expenses ?? 0)`**. 사이드바는 이 값을 읽지 않아 `-`.

### 2-c. 개산공제는 client-side 즉시 계산 가능

개산공제 = `취득 당시 기준시가 × 개산공제율`. 산식·율은 엔진(`transfer-tax-helpers.ts:311,323`)에서 확정:
- 율: 미등기 `0.003`, 그 외 `0.03` (§163⑥1호·2호가목 토지·건물·주택 3%)
- base: `standardPriceAtAcquisition` = AssetForm `standardPriceAtAcq`(`calc-wizard-asset.ts:449`)
- 발동 모드: `useEstimatedAcquisition`(환산) 또는 `isAppraisalAcquisition`(감정) (`:328,331`)

→ result 도착 전에도 `standardPriceAtAcq`만 입력되면 **사이드바에서 즉시 산출 가능**. 현재는 이 계산 시점이 "엔진(API) 이후"에 묶여 있고 그마저도 사이드바에 미연결.

---

## 3. 수정 방향 — "계산 가능한 시점에 즉시 표시"

`computeTransferSummary`의 `totalNecessaryExpense` 산출을 **2단계 시점**으로 재설계:

1. **즉시(입력 시점, result 이전)**: 자산이 환산/감정 모드이고 `standardPriceAtAcq` 입력되면 개산공제 = `floor(std × rate)`를 필요경비에 반영. → 세액 계산 전에도 표시.
2. **result 도착 후(권위값)**: 단건 모드면 `(estimatedDeduction ?? 0) + (expenses ?? 0)`로 **덮어씀**(결과뷰와 1원 일치). swap 등 client-side가 모르는 보정 반영.

**모드별 필요경비 source (자산별)**:

| 모드 | result 전 (즉시) | result 후 (권위) |
|---|---|---|
| 환산·감정 (`useEstimated`/`isAppraisal`) | `floor(std×rate)` 개산공제 | `estimatedDeduction + expenses` |
| 실지취득·매매사례 | `capex+trExp \|\| directExpenses` (현행) | `expenses`(=capex+양도비) |
| 겸용주택 | 섹션별 실경비 합 (현행) | mixed-use result 값 |

- **율**: `isUnregistered ? 0.003 : 0.03` — 엔진 상수 미러(하드코딩 대신 주석에 §163⑥ 근거).
- **floor**: 엔진 `applyRate`(floor) 미러 — `Math.floor(std * rate)`.
- **지분(ownership)**: 기존 fractional × ratio 로직 동일 적용.

---

## 4. 트레이드오프 / 대안

| 옵션 | 내용 | 장단 | 채택 |
|---|---|---|---|
| **A (권장)** | 즉시(client 개산공제) + result 후 권위 override | 사용자 요구("즉시") 충족·결과뷰 1원 일치·최소 파일(1) | ✅ |
| B | result 도착 후에만 result값 반영 | 단순하나 "즉시 표시" 미충족(세액 계산 전 `-` 유지) | ✗ |
| C | 엔진에 필요경비 총액 단일 필드 신설 후 사이드바 연결 | 근원 정리이나 엔진·타입 blast 큼·불필요(결과뷰가 이미 두 필드로 표시 중) | ✗ |

**단순성**: 엔진/타입 변경 없음. `computeTransferSummary` 순수함수 내부만 수정(무한루프 위험 없음 — useMemo 래핑 기존 유지).

---

## 5. 구현 (단일 파일)

**`lib/stores/calc-wizard-store.ts`** `computeTransferSummary`:

1. `totalNecessaryExpense` 계산 시 자산별 분기에 환산/감정 모드 개산공제 추가:
   ```ts
   // 환산·감정 모드: 실경비 대신 개산공제(§163⑥ = 취득기준시가 × 3%, 미등기 0.3%) 즉시 산출
   if (a.useEstimatedAcquisition || a.isAppraisalAcquisition) {
     const rate = a.isUnregistered ? 0.003 : 0.03;
     baseExp = Math.floor(parseRaw(a.standardPriceAtAcq) * rate);
   } else if (겸용) { ... } else { capex+trExp || directExpenses }
   ```
2. return 직전, 단건 result 있으면 권위값으로 override — **`result.expenses` 단독**:
   ```ts
   // engine probe 실측: 본문 expenses=estimatedDeduction(중복), swap expenses=directSide(개산공제 미차감).
   // → expenses가 실차감 필요경비. estimatedDeduction 합산 시 본문 이중계산이므로 단독 사용.
   const resultNecessaryExpense =
     result?.mode === "single" ? (result.result.expenses ?? 0) : null;
   const finalNecessaryExpense = resultNecessaryExpense ?? totalNecessaryExpense;
   ```
   `netTransferIncome`도 `finalNecessaryExpense` 사용. (split 모드는 expenses가 개산공제 미포함 undercount — 드묾, 후속.)

- mixed-use/bundled result 모드는 이번 범위에서 **입력 기반 유지**(현행) — 단건 환산/감정이 사용자 사례. 필요 시 후속(§6 note).

---

## 6. 성공 기준 (verify)

1. **anchor(store 순수함수)**:
   - 환산 모드 + `standardPriceAtAcq=400,000,000` + result=null → `totalNecessaryExpense = 12,000,000`(400M×3%). → verify.
   - 미등기 → `1,200,000`(0.3%). → verify.
   - result(single, estimatedDeduction=12,000,000, expenses=0) 주입 → 사이드바 `필요경비 = 12,000,000`. → verify.
   - 실지취득 모드 + capex/trExp → 현행값 회귀 불변. → verify.
2. **결과뷰 1원 일치**: 동일 입력의 `TransferTaxResultView` 개산공제 표시값과 사이드바 값 동일.
3. `npx tsc --noEmit` 0건.
4. 기존 summary 회귀(`__tests__/**/*summary*`, transfer sidebar 테스트) 통과.
5. **브라우저**: 환산/감정 모드 → 취득기준시가 입력 즉시 사이드바 `필요경비` 노출, 세액 계산 후 값 유지(미수행 시 명시).

---

## 7. 동기화 지점 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ⑥ 사이드바 합계 | `computeTransferSummary.totalNecessaryExpense` | **수정 대상** |
| ⑦ 결과 카드 | `TransferTaxResultView` 개산공제/expenses (권위 미러) | 변경 없음(참조원) |
| ①~⑤⑧ | 입력·API·validate | 변경 없음(표시 전용 파생) |

---

## 8. 관련 메모리·정책
- `feedback_estimated_deduction_separation` ★★ (개산공제 분리표시)
- `feedback_estimated_mode_expenses_pattern` (환산 모드 expenses swap만)
- `feedback_engine_result_display_drift` ★★★ (차감값↔표시 일관성 — 사이드바도 결과뷰와 일치)
- `feedback_no_silent_apportion_fallback` (개산공제는 법정 산식 — silent 안분 아님, §163⑥ 명문)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (율·산식은 엔진 상수 미러, 하드코딩 최소화)
