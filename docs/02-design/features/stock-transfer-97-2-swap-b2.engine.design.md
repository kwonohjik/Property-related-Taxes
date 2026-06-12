# B-2 §97②2호 단서 swap (주식) — 엔진 설계 (stock-transfer-97-2-swap-b2)

> 계획: `docs/00-pm/stock-transfer-97-2-swap-b2.plan.md` · 기준 origin/master `ea2edf14`
> 법령: 소법 §97②2호 단서 + 소령 §163⑫ → §176의2②1호(주식 환산 명시) + §163⑤1호 가목(증권거래세 양도비) — 계획 §1 축자 완료
> 판정: **적용**. swap = (환산취득가+개산공제) < (자본적지출+양도비) 시 후자를 필요경비 전체로 대체.

## 1. 케이스 인벤토리 (계획 §3 → 엔진 동작)

| # | 케이스 | 게이트 | 동작 |
|---|---|---|---|
| S-1~3 | estimated 전 분기 (상장 환산·비상장 보충·거래정지 양/취·취득후상장) | `usedEstimatedAcquisition=true`(:259) + estimatedDeduction>0 | directSide > estimatedSide → swap |
| S-4 | face_value (장부분실) | `usedEstimatedAcquisition=true`(:229) | 동일 비교. **법리 확정**: 액면가는 §99①4 후단의 취득 당시 기준시가이고 취득가액 산식은 §176의2②1호 그 자체 → "환산취득가액으로 하는 경우" 해당 |
| S-5 | sale_case | `usedEstimatedAcquisition` 미설정 — 게이트 미진입 | 구조적 배제 (anchor SW-5 고정) |
| S-6 | actual | STEP 4 `else if (expenseMode==="actual")` 경로 | 무변경 |
| S-7 | directSide ≤ estimatedSide (동률 포함) | 본문 유지 | warning 문구 "환산취득가 모드…"로 시작 (LE-7 호환 — 계획 §4.3) |
| S-8 | actualExpenses 미입력 | directSide 0 → 비교 비발동 | 현행 동일 (회귀 0) |
| S-9 | 비과세 — **2경로 분리** | (a) 장내 비대주주 = full pipeline + zeroing(`apply-exempt-zeroing.ts`) — LE-8의 expenses 300,000 echo가 증거 → **swap 자동 반영** (anchor SW-9) / (b) K-OTC `buildExemptResult` = `expenses: 0`(`stock-transfer-exempt-result.ts:93`) 고정 echo → swap 무관 | (a) 자동·(b) 작업 없음 |
| S-10 | 다자산 | aggregate = 단건 반복 | 자산별 독립 swap 자동 |

## 2. 결과 타입 (`types/stock-transfer.types.ts`)

```ts
// StockTransferResult — estimatedDeduction(:489) 인근
/** [B-2] §97②2호 단서 swap 발동 여부 — (환산취득가+개산공제) < (자본적지출+양도비) 시 후자를 필요경비로 */
swapApplied?: boolean;
/** [B-2] swap 비교 echo (환산 모드 + actualExpenses 입력 시만 — 비교 비발동이면 undefined) */
swapComparison?: {
  /** 가목 = 환산취득가 + 개산공제 (§97②2호 단서 가목) */
  estimatedSide: number;
  /** 나목 = 자본적지출 + 양도비 합계 (actualExpenses 입력) */
  directSide: number;
  chosen: "estimated" | "direct";
};
```

- appliedRules 유니온(:676 인근)에 `"§97②단서swap"` 추가
- 부동산 전례(`transfer-tax-helpers.ts:272-281`)와 동형 — 필드명 일치 (cross-tax 일관성)

## 3. STEP 4 블록 교체 (`stock-transfer-tax.ts:445-465`)

```ts
// STEP 4: 필요경비
//   환산취득가 모드 본문: §163⑥4 개산공제(취득기준시가×1%) 자동 (§97②2호 본문)
//   단서: (환산취득가+개산공제) < (자본적지출+양도비) → 후자를 필요경비 전체로 대체 (§97②2호 단서)
//   sale_case는 usedEstimatedAcquisition 미설정 — 본 게이트 미진입 (구조적 배제)
let expenses = 0;
let swapApplied = false;
let swapComparison: StockTransferResult["swapComparison"];
const { expenseMode } = input;

if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
  const directSide = input.actualExpenses ?? 0;   // expenseMode 무관 (api ④ 게이트 해제로 환산 모드에도 도달)
  const estimatedSide = acquisitionPrice + estimatedDeduction;
  if (directSide > estimatedSide) {
    // 단서 발동 — "적은 경우" 문리상 동률(==)은 본문
    swapApplied = true;
    expenses = directSide;
    swapComparison = { estimatedSide, directSide, chosen: "direct" };
    appliedRules.push("§97②단서swap");
    warnings.push(
      "§97②2호 단서 적용 — (환산취득가+개산공제)보다 실제 필요경비(자본적지출+양도비)가 커 후자를 필요경비로 합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다.",
    );
  } else {
    expenses = estimatedDeduction;
    if (directSide > 0) {
      swapComparison = { estimatedSide, directSide, chosen: "estimated" };
      warnings.push(
        "환산취득가 모드 — §97②2호 단서 비교 결과 (환산취득가+개산공제)가 입력 실비 이상이므로 본문(개산공제)을 적용합니다.",
      );
    }
  }
} else if (expenseMode === "actual") {
  expenses = input.actualExpenses ?? 0;
} else {
  expenses = estimatedDeduction ?? 0;
}
```

- 비발동·미입력(directSide 0) 시 swapComparison **undefined** (S-8 — 결과 카드 비노출)
- 본문 유지 + 입력 존재 시 swapComparison echo (chosen "estimated") — 결과 카드에서 비교 근거 표시 가능

## 4. STEP 5 차익 산식 (`:469` 인근)

```ts
// swap 시 가목(환산취득가+개산공제) 전체가 나목으로 대체 — 취득가액 차감 제외 (§97②2호 단서)
const transferIncome = swapApplied
  ? transferPrice - expenses
  : transferPrice - acquisitionPrice - expenses;
```

- `result.acquisitionPrice`는 환산값 정보 echo **유지** — 자기일관 anchor: SW-2에서 `transferIncome === transferPrice − swapComparison.directSide` && `acquisitionPrice === 환산값` 동시 단언 ([[feedback_engine_result_display_drift]])
- result 조립(:578 인근)에 `swapApplied`·`swapComparison` 추가

## 5. ④ api.ts 게이트 해제 (`stock-transfer-tax-api.ts:558-561`)

```ts
// 변경 전: if (resolvedExpenseMode === "actual") { ... body.actualExpenses = exp; }
// 변경 후: expenseMode 무관 항상 전송 — §97②2호 단서 비교 입력 (silent strip 해제)
body.expenseMode = resolvedExpenseMode;             // 유지
const exp = parseIntOrUndef(form.actualExpenses);
if (exp !== undefined) body.actualExpenses = exp;   // 무조건
```

- sale_case에도 전송되나 엔진 게이트 미진입(S-5) — 무해. Zod `actualExpenses: z.number().min(0).optional()`(:259) 기존 통과·route 기존 매핑 — ⑫⑭ grep 자가 점검만

## 6. anchor (계획 §7 — 8건 + LE 호환)

파일: `__tests__/tax-engine/stock-transfer/swap-97-2-b2.test.ts`. Pre-Do = LE-1~8 통과 고정.

| anchor | 입력 (LE-1 기반: 양도 50M·환산 30M·개산 300K) | 기대 |
|---|---|---|
| SW-1 | 실비 미입력 | LE-1 동치 — swapApplied false·swapComparison undefined |
| SW-2 | actualExpenses 31,000,000 | swap — transferIncome **19,000,000** · expenses 31,000,000 · acquisitionPrice 30,000,000(echo 유지) · comparison{30,300,000·31,000,000·direct} · appliedRules "§97②단서swap" |
| SW-3 | 30,300,000 (동률) | 본문 — expenses 300,000 · chosen "estimated" |
| SW-4 | 1,000,000 | 본문 + warning "환산취득가 모드" 포함 (LE-7 호환 증명) |
| SW-5 | sale_case + 실비 충분 | swap 비발동 (구조 배제) |
| SW-6 | face_value(사례 49형) + 실비 > 가목 | swap |
| SW-7 | C-1 취득정지 환산 + 실비 6,000,000 | swap — 가목 5,656,000(취득 5.6M+개산 56K) < 6,000,000 → transferIncome 4,000,000 (양도 10M − 6M) |
| SW-8 | 다자산 2건 — 1 swap·1 본문 | 자산별 독립 |
| SW-9 | 장내 비대주주 비과세 + 실비 > 가목 | isExempt·finalTax 0 + 정보성 echo에 swap 반영 (calculatedTax 재계산치·swapApplied true) |

E2E 1건 (`e2e/stock-transfer-97-2-swap.spec.ts`, 포트 3200): 환산 모드 → 실비 입력 → swap 결과 + transferIncome 단언.

## 7. 파일 영향

| 파일 | 작업 |
|---|---|
| types | result 2필드 + appliedRules 리터럴 |
| stock-transfer-tax.ts (641줄) | STEP 4 교체 + STEP 5 분기 + result 조립 (+25 내외) |
| stock-transfer-tax-api.ts | :558-561 게이트 해제 (−1 조건) |
| MarketTypeBlock.tsx | 부수: stale 헤더 주석 정정 (B-1③) |
| Step3.tsx | ⑤ optional 실비 노출 + placeholder 정정 (ui.design) |
| 결과 카드 | ⑦ swap 비교 표 (ui.design) |
