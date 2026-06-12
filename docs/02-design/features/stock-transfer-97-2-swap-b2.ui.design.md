# B-2 §97②2호 단서 swap — UI 설계 (stock-transfer-97-2-swap-b2)

> 계획: `docs/00-pm/stock-transfer-97-2-swap-b2.plan.md` §5 · 엔진: `stock-transfer-97-2-swap-b2.engine.design.md`
> 원칙: placeholder 숫자 금지·결과 "원" 생략·납세자 유불리 표현 금지(중립 산식 서술)

## 1. Step3 실비 입력 — 환산·액면가 모드 optional 노출 (`app/calc/stock-transfer-tax/steps/Step3.tsx`)

현행: `expenseLocked = isEstimatedAcquisition(acquisitionMode)`(`:59-61` — estimated·sale_case·face_value) → `:175` 실비 입력 숨김.

```
변경: swapEligibleMode = acquisitionMode === "estimated" || acquisitionMode === "face_value"
      (sale_case 제외 — S-5 구조적 배제와 UI 일치)

[expenseLocked && swapEligibleMode 시 — 기존 개산공제 안내 카드 아래 추가]
  CurrencyInput
    label="실제 필요경비 합계 (선택 — §97②2호 단서 비교)"
    hint="증권거래세·매매수수료 등 §163⑤ 증빙 경비 + 자본적지출(§163③).
          (환산취득가+개산공제)보다 크면 이 금액이 필요경비로 적용됩니다 (소득세법 §97②2호 단서)."
    value={form.actualExpenses} onChange — 기존 필드 재사용 (placeholder 없음)
```

- 미입력 시 현행과 완전 동일 (S-8) — required 아님·validation 추가 없음
- **부수 정정 ②**: 실가 모드 기존 입력(`:182`)의 `placeholder="291,200"` 제거 (숫자 예시 금지 — `hint`로 충분)
- **locked 안내 카드 문구 갱신** (`:153-163` 실측): 기존 꼬리 문장 "실가 모드로 변경 시 실제 경비 입력이 가능해집니다"가 B-2 이후 **stale**(환산·액면가 모드에서도 입력 가능) → "실제 경비가 (환산취득가+개산공제)를 초과하면 §97②2호 단서에 따라 실제 경비를 필요경비로 합니다. 아래에 선택 입력하세요."로 교체 (estimated·face_value). sale_case는 기존 문구 유지 (입력 미노출)

## 2. 사이드바 ⑥ (`components/calc/stock-transfer/StockSidebar.tsx:206-210`)

현행 `(formData.expenseMode || "actual") === "actual"` 게이트는 환산 모드에서도 true(폼 expenseMode는 factory "actual" 잔존, `calc-wizard-stock-store.ts:521`) — B-2로 환산 모드에 실비 입력이 노출되면 **비교용 입력이 "필요경비" 합계로 오표시**될 위험.

```
변경: 실가 모드만 표시 — acquisitionMode 게이트 추가
  const isActualAcq = (formData.acquisitionMode || "actual") === "actual";
  const expenses = isActualAcq && (formData.expenseMode || "actual") === "actual" ? ... : null;
```

- 환산 모드 실비는 swap 확정 전(결과 도착 전) 차감 여부 미정 → 사이드바 원칙 "계산 가능한 항목만" 준수
- 결과 도착 후에는 `result` 기반 표시 (기존 구조)

## 3. 결과 카드 ⑦ (`components/calc/results/StockTransferTaxResultViewHelpers.tsx` — EstimatedValuationBreakdown 내)

`result.swapComparison` 존재 시 비교 블록 추가 (환산 산식 카드 하단):

```
[swapApplied === true]
  §97②2호 단서 적용 — 실제 필요경비 선택
    가목 (환산취득가 + 개산공제)      30,300,000
    나목 (자본적지출 + 양도비)        31,000,000
    → 나목이 더 크므로 실제 필요경비를 적용합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다.
    양도차익 = 양도가액 − 실제 필요경비

[swapApplied === false && swapComparison 존재 (chosen "estimated")]
  §97②2호 단서 비교 — 본문(개산공제) 적용
    가목 30,300,000 ≥ 나목 1,000,000 → 환산취득가 + 개산공제를 적용합니다.   (text-xs 1줄 축약)
```

- 금액 `text-right font-mono tabular-nums`·"원" 생략·floor 미표기
- `RULE_BADGE`(`:136-152` 인근)에 `"§97②단서swap": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200"` 추가
- 요약부 취득가액 행: swapApplied 시 "취득가액(환산·차감 제외)" 라벨 부기 — `result.acquisitionPrice` echo는 유지되나 차감되지 않음을 명시 ([[feedback_engine_result_display_drift]] — 표시·산식 불일치 방지)

## 4. 부수 정정 ① — `MarketTypeBlock.tsx:6-10` stale 헤더 주석 (B-1③)

"본 계산기 미지원" 문구를 현황(해외주식 §94①3다목 `foreign-stock.ts`·국외전출세 `exit-tax.ts` 기구현, PR-4A/4B)으로 교체. 코드 변경 없음 — 주석 1블록.

## 5. 클라이언트 8지점

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | form 상태 | 변경 없음 (`actualExpenses`·`expenseMode` 기존) |
| ④ | api | `:558-561` 게이트 해제 (engine.design §5) |
| ⑤ | Step3 optional 실비 (§1) | — |
| ⑥ | 사이드바 acquisitionMode 게이트 (§2) | — |
| ⑦ | 결과 카드 swap 블록 + RULE_BADGE (§3) | — |
| ⑧ | validate | 변경 없음 (optional 입력·차단 없음) 명시 |

## 6. E2E (`e2e/stock-transfer-97-2-swap.spec.ts`, `E2E_PORT=3200`)

E-1 (SW-2 동형): Step1 코스피 1,000주(장외) → Step2 환산 모드 + 분모 50,000·분자 30,000 → Step3 "실제 필요경비 합계 (선택 — §97②2호 단서 비교)" 31,000,000 입력 → 계산 →
- Network body: `actualExpenses: 31000000` **+ `expenseMode: "estimated"`** (④ strip 해제 증명)
- `json.result.swapApplied === true` · `transferIncome === 19_000_000` · appliedRules "§97②단서swap"
- 결과 화면 "§97②2호 단서 적용" 블록 노출

함정 메모: 신규 라벨 '실제 필요경비 합계…'는 `has-text('필요경비 합계')` substring에도 매칭됨(실가 라벨과 부분 중복) — E2E는 **'실제 필요경비 합계'** prefix로 식별(실가 라벨은 '실제'로 시작하지 않아 유일). 환산 모드에서 실가 입력은 비노출이라 실충돌 없음. 사이드바 "필요경비" 항목이 환산 모드에서 비노출인지 단언 추가(§2 게이트 증명).

## 7. 비스코프

- 자본적지출/양도비 분리 입력 (합계 1필드로 충분 — 나목은 합계 비교)
- sale_case 실비 노출 (S-5 비적용)
- K-OTC buildExemptResult 정보성 echo 확장 (expenses 0 고정 — S-9b)
