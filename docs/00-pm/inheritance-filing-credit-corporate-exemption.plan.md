# 상속세 요약 — 신고세액공제(§69)·영리법인 면제(§3의2②) 배부표 일치 수정 계획서

> 작성일 2026-06-01 · 대상 세목 상속세(inheritance) · 범위 **요약 화면(이미지6)을 배부표(이미지7)와 완전 일치**

## 1. 증상 (사용자 보고)

상속세 결정세액 요약 화면의 **신고세액공제(§69)** 가 배부표와 다르다.

| 항목 | 요약 화면 (이미지6, 현행) | 배부표 (이미지7, 정답) |
|---|---|---|
| 신고세액공제 (§69) | **36,471,965** | **31,971,966** |
| 결정세액 | **1,179,260,233** | 차감자진납부세액 합계 **1,033,760,232** |

사용자 지시: **"신고세액공제 계산 엔진은 이미지7(배부표)에서 사용하고 있는 것으로 대체"**, 범위는 **요약 전체를 배부표와 일치**.

## 2. 근본 원인 (코드·이미지 실증 완료, 추정 없음)

### 2-1. 영리법인 면제(§3의2②) 150,000,000이 요약 경로에서 누락

배부표 엔진 `calcHeirAllocation`은 면제를 차감한다:

- `lib/tax-engine/inheritance-allocation.ts:463`
  `const distributableTax = computedTax - corporateExemption;` → 1,627,500,000 − 150,000,000 = **1,477,500,000** (배부표 ⑪)

반면 요약 경로는 면제를 **두 곳에서** 빠뜨린다:

1. **§69 신고세액공제 기준세액** — `inheritance-tax.ts:648` STEP 11 `calcInheritanceTaxCredits()` 호출 시 `corporateExemption`을 **인자로 전달하지 않음**.
   - `inheritance-gift-tax-credit.ts:162` `totalComputedTax = computedTax + generationSkipSurcharge` (면제 미차감)
   - `:233` §69 기준 `taxBeforeFilingCredit = remainingTax` = 1,657,732,198 − 442,000,000(§28) = **1,215,732,198** (정답 1,065,732,198 대비 +150,000,000)
   - `:235` 신고세액공제 = `applyRate(1,215,732,198, 0.03)` = floor(36,471,965.94) = **36,471,965**
2. **결정세액** — `inheritance-tax.ts:665` STEP 12
   `finalTax = computedTax + generationSkipSurcharge - totalTaxCredit` → 영리법인 면제 **미차감**.
   - 1,627,500,000 + 30,232,198 − 478,471,965 = **1,179,260,233** (정답 1,033,760,232 대비 +145,500,001 = +150M − 4.5M)

### 2-2. 신고세액공제 산출 방식 차이 (floor vs per-heir round)

- 요약: 단일 기준 × 3% **floor** (`credits/filing-credit.ts:71` `applyRate`)
- 배부표: **상속인별** `Math.round(preFilingCreditTax × 0.03)` 후 **합산** (`inheritance-allocation.ts:570-571`, PDF 책 1867 안분 round)
  - ⑭ 합 = 13,387,771 + 8,554,434 + 7,077,325 + 2,952,436 = **31,971,966**

→ 기준세액을 1,065,732,198로 맞추더라도 단일 floor(31,971,965)는 배부표 합(31,971,966)과 **1원** 다르다. 사용자 지시("배부표 것으로 대체")를 충족하려면 **배부표 상속인별 합을 그대로 사용**해야 한다.

### 2-3. UI 모순 (현행)

`components/calc/results/InheritanceTaxResultView.tsx`
- `:307-328` 영리법인 면제 카드가 "− 150,000,000"으로 **이미 표시**되나
- `:210·279` 결정세액(`result.finalTax`)에는 **반영 안 됨** → 면제 카드와 결정세액이 시각적으로 불일치
- `:242-280` 요약 산식 행에 영리법인 면제 행 **자체가 없음**

## 3. 검증된 목표값 (배부표 per-heir 합)

| 합계 산식 | 값 |
|---|---|
| Σ `perHeir.preFilingCreditTax` (⑬) | 1,065,732,198 = §69 기준세액 |
| Σ `perHeir.filingCredit` (⑭) | **31,971,966** = 신고세액공제 |
| Σ `perHeir.finalTax` (⑮) | **1,033,760,232** = 결정세액 |
| `corporateExemption.amount` | 150,000,000 |
| Σ `perHeir.priorGiftCredit` (⑫c) | 442,000,000 = §28 증여세액공제 |

자기검산: (1,627,500,000 − 150,000,000) + 30,232,198 − 442,000,000 − 31,971,966 = **1,033,760,232** ✓

## 4. 수정 방안 — 배부표를 요약의 단일 진실로 (사용자 확정 범위)

사용자 결정("요약 전체를 배부표와 일치" + "신고세액공제 엔진을 배부표 것으로 대체")에 따라 **배부표(`heirAllocationResult`) 합계를 요약 세액공제·결정세액의 단일 진실로** 채택. 요약이 §69를 독립 재계산하지 않고 배부표 값을 끌어쓴다.

> **(정정 R2-B) 14 동기화 지점 범위**: 본 수정은 **신규 입력 필드를 추가하지 않는다**(영리법인 면제·신고세액공제는 기존 입력에서 도출되는 result-only 값). 따라서 14 지점 중 **⑦(결과 카드)만 해당**, ①폼·②initial·③normalize·④API·⑤위젯·⑥사이드바·⑧validation·⑨~⑭(Zod·route) 모두 **N/A**. 엔진 result 값 보정 + 결과뷰/카드 표시가 작업 전부.

### 4-1. 엔진 — `lib/tax-engine/inheritance-tax.ts`

`:658` `const totalTaxCredit`·`:665` `const finalTax`를 **`let`으로 전환**. STEP 13(배부, `:687~717`) **이후**에 요약 합계를 배부표에서 재도출 (STEP 13.5 신설).

```
// STEP 13.5: 요약 세액공제·결정세액을 배부표 합계와 일치 (영리법인 면제·§69 단일 진실)
if (heirAllocationResult) {
  const ph = Object.values(heirAllocationResult.perHeir);
  const allocFilingCredit  = ph.reduce((s, h) => s + h.filingCredit, 0);        // 31,971,966
  const allocFilingBase    = ph.reduce((s, h) => s + h.preFilingCreditTax, 0);  // 1,065,732,198
  const allocFinalTax      = ph.reduce((s, h) => s + h.finalTax, 0);            // 1,033,760,232
  // §29 외국납부·§30 단기재상속은 배부표 미모델링 → 추가 차감 (이 케이스 0)
  const otherCredits = creditResult.foreignTaxCredit + creditResult.shortTermReinheritCredit;

  creditResult.filingCredit     = allocFilingCredit;
  creditResult.filingCreditBase = allocFilingBase;            // §69 산출근거 펼침 echo
  creditResult.totalCredit      = creditResult.giftTaxCredit + otherCredits + allocFilingCredit;
  totalTaxCredit = creditResult.totalCredit;
  finalTax = Math.max(0, allocFinalTax - otherCredits);
}
```

- **(정정 C2)** `result.breakdown`(상위 CalculationStep 배열)은 **상속 결과뷰에서 렌더되지 않음**(`InheritanceTaxResultView`는 `corporateExemption.breakdown`만 사용). 따라서 표시 목적의 breakdown step 재생성은 **불필요**. 단 PDF·이력(`saveCalculation`)이 breakdown을 직렬화·재현할 경우 stale step(36,471,965)이 남으므로, STEP 12의 신고세액공제·결정세액 step amount를 13.5 이후 값으로 갱신하는 것을 **정합성 차원에서 권장**(표시 영향 없으므로 필수 아님). → Do 단계에서 PDF 경로 1건 확인.
- **(정정 C6)** `creditResult` 필드(`filingCredit`·`filingCreditBase?`·`totalCredit`·`foreignTaxCredit`·`shortTermReinheritCredit`)는 모두 `TaxCreditResult`(`types/inheritance-tax-credit.types.ts:37~61`)에 존재·비-readonly → 객체 속성 mutation 가능, **신규 타입 필드 불필요**.
- **Path B(배부 미발동 edge: 자연인 상속인·doneeId·세대생략 수유자 전무)**: `calcInheritanceTaxCredits`에 `corporateExemption` 파라미터를 추가해 §69 기준 = `(computedTax − corporateExemption) + surcharge − §28 − §29 − §30`로 보정하고, STEP 12 `finalTax`에서도 `corporateExemption` 차감. (정상 케이스는 항상 Path A.)

### 4-2. 결과 타입

`TaxCreditResult.filingCreditBase?`·`totalComputedTaxWithSurcharge?`는 기존 optional echo 필드(존재 확인 `:53·:61`). 추가 신규 필드 불필요. `finalTax`/`totalTaxCredit`는 기존 result 필드 재사용.

### 4-3. UI — `components/calc/results/InheritanceTaxResultView.tsx` + `components/calc/TaxCreditBreakdownCard.tsx`

1. **요약 산식 행에 영리법인 면제 행 추가** (`:271` 세대생략 할증 다음, `:272` 세액공제 앞):
   `result.corporateExemption?.amount > 0` 조건으로 `SummaryRow label="영리법인 면제 (§3의2②)" value="- {amount}" deduction`.
   → 산출 + 할증 − 면제 − 세액공제 = 결정세액 산식이 화면에서 자기일관.
2. **(정정 C1 — 누락 보완·치명) §69 산출근거 펼침 등식 정정** — `TaxCreditBreakdownCard.tsx` `buildSection69Formula`(`:81~125`)는 현재
   `= totalComputedTaxWithSurcharge − giftTaxCredit [− 외국납부] [− 단기재상속] = filingCreditBase` 를 출력한다.
   `filingCreditBase`만 1,065,732,198로 바꾸면 좌변(1,657,732,198 − 442,000,000 = 1,215,732,198)이 우변과 **불일치 → 등식 붕괴**.
   - 수정: `TaxCreditBreakdownCardProps`에 `corporateExemption?: number` prop 추가, 산식에 면제 항 삽입 →
     텍스트 "신고분 세액 = (산출세액 + 세대생략 할증) − 증여세액공제 **− 영리법인 면제** [− 외국납부] [− 단기재상속]",
     숫자 "= 1,657,732,198 − 442,000,000 **− 150,000,000** = 1,065,732,198" (등식 성립 ✓).
   - `InheritanceTaxResultView`의 카드 호출(`:285~288`)에 `corporateExemption={result.corporateExemption?.amount ?? 0}` 전달.
   - **(정정 C3)** `totalComputedTaxWithSurcharge`(= computedTax + 할증)는 **의미 변경 금지**(증여세 경로 `gift-tax.ts`·`gift-filing-form-rows.ts`·echo setter `inheritance-gift-tax-credit.ts:260` 공유). 면제는 별도 차감 항으로만 표기.
   - **(정정 R2-A)** §69 row는 "base × 3% = filingCredit" **단일 기준 표기**이나 실제 `filingCredit`은 **상속인별 `Math.round` 합**이다. 본 케이스는 1,065,732,198 × 3% = 31,971,965.94 → 31,971,966으로 우연히 일치하나, 일반적으로 Σ(상속인별 round) ≠ round(단일 기준)이면 카드의 "base × 3%" 직접 검산값과 표시값이 **±N원 어긋날 수 있다**. → §69 row 하단에 fine-print "(상속인별 산출세액에 각각 3% 적용 후 합산)" 추가로 사용자 혼동 방지.
3. `result.finalTax`·`result.totalTaxCredit`·`result.creditDetail`(나머지 카드 수치)은 엔진 13.5 mutation으로 자동 반영.
4. **(정정 C3)** `taxBeforeCredit`(`InheritanceTaxResultView:178` = computedTax + 할증, 면제 미차감)에서 산출되는 카드 헤더 "세액 대비 X% 절감"(`TaxCreditBreakdownCard:218`)은 **산출세액 기준 비율**이므로 면제 미차감 유지가 의도에 맞음 → 변경 불필요(478,471,965/1,657,732,198=28.9% → 473,971,966/1,657,732,198=28.6%로 자연 변동).

## 5. 영향·동기화 점검

| 지점 | 변경 |
|---|---|
| 엔진 `:658·:665` | `totalTaxCredit`·`finalTax` `const`→`let` |
| 엔진 STEP 13.5 (신설) | `finalTax`·`totalTaxCredit`·`filingCredit`·`filingCreditBase` 배부표 합 도출 |
| `calcInheritanceTaxCredits` | `corporateExemption` 파라미터 추가 (Path B fallback 전용) |
| creditResult breakdown | (권장) 신고세액공제·결정세액 step amount 정합 — 표시 미사용, PDF·이력 한정 |
| UI 요약 행 | 영리법인 면제 SummaryRow 신규 (`InheritanceTaxResultView`) |
| UI §69 산식 (C1) | `TaxCreditBreakdownCard` `corporateExemption` prop + 면제 항 삽입 (등식 붕괴 방지) |
| UI 카드 호출 | `corporateExemption={result.corporateExemption?.amount ?? 0}` 전달 |

## 6. 회귀·anchor 계획 (Pre-Do 우선)

1. **본 사례 재현 anchor** (`__tests__/tax-engine/inheritance/`):
   - `result.creditDetail.filingCredit` === 31,971,966
   - `result.finalTax` === 1,033,760,232
   - `result.creditDetail.filingCreditBase` === 1,065,732,198
2. **Pre-Do**: 위 anchor를 먼저 작성·실행 → 현재 36,471,965/1,179,260,233로 **실패 확보** → 디자인 환류.
3. **교차 일치 anchor**: 요약 `finalTax` === Σ `heirAllocationResult.perHeir[*].finalTax` 및 `creditDetail.filingCredit` === Σ `perHeir[*].filingCredit` (모든 케이스 불변식).
4. **회귀**: 영리법인 면제 없는 기존 사례(면제 0)에서 `finalTax`·`filingCredit` 무변(0원 차이) — 전체 `npm test`.
5. **(정정 R2-C) UI 검증 — Playwright E2E** (`e2e/*.spec.ts`, 메모리 `feedback_browser_verify_with_playwright`): ① 요약에 "영리법인 면제 (§3의2②) − 150,000,000" 행 표시 ② 결정세액 1,033,760,232 표시 ③ §69 산출근거 펼침 등식 균형(`1,657,732,198 − 442,000,000 − 150,000,000 = 1,065,732,198`) ④ 세액공제 합계 473,971,966. 수동 확인·claude-in-chrome 금지, spec 통과로 충족.
6. §29·§30 동시 존재 케이스는 별도 트랙(배부표 미모델링) — 본 PR 범위 외, "확인 필요"로 명시.

## 7. 미해결·확인 필요

- **(정정 C4) §29·§30 동시 존재 케이스 한계**: 배부표 `preFilingCreditTax`(⑬)는 §28만 차감하고 §29·§30은 차감하지 않는다. 따라서 §29·§30이 있으면 ① 배부표 `filingCredit`(⑭)이 과다하고 ② STEP 13.5가 이를 그대로 채택하므로 요약 신고세액공제도 과다해진다. 본 케이스는 둘 다 0이라 영향 없음. **근본 정합은 배부표 엔진에 §29·§30 per-heir 반영이 필요 → 별도 트랙.** Do 단계 anchor에 §29·§30 동시 케이스는 포함하지 않음(범위 외 명시).
- **용어 주의(개선)**: 본 앱은 `finalTax`를 "결정세액"으로 표기하나 §69 신고세액공제까지 차감한 값(엄밀히는 자진납부세액)이다. 배부표 ⑮(차감자진납부세액)과 동일 개념·동일 값. 라벨 정정은 본 PR 범위 외(기존 표기 유지).
- **PDF·이력 경로**: `result.breakdown` 직렬화 시 stale 신고세액공제 step 잔존 가능 — Do 단계에서 1건 확인 후 필요 시 step amount 갱신.

## 8. 검토 정정 이력

### 1차 검토 (코드 실증)
- **C1 (치명·누락)**: §69 산출근거 펼침 등식 붕괴 위험 → 면제 항 추가·prop 신설 (4-3 보완).
- **C2 (정정)**: `result.breakdown` 상속 결과뷰 미렌더 확인 → step 재생성 표시상 불필요, PDF·이력만 권장.
- **C3 (정정)**: `totalComputedTaxWithSurcharge` 의미 변경 금지(증여 경로 공유) / `taxBeforeCredit`·절감% 면제 미차감 유지 의도.
- **C4 (강화)**: §29·§30 동시 케이스 배부표 미모델링 한계 명시 강화.
- **C5 (보강)**: `:658·:665` `const`→`let` line 적시.
- **C6 (확인)**: `TaxCreditResult` echo 필드 존재·비-readonly → 신규 타입 불필요.

### 2차 검토 (코드 실증)
- **R2-A (누락)**: §69 카드 단일 기준 표기 vs 상속인별 round 합 ±N원 괴리 → fine-print 추가 (4-3.2).
- **R2-B (누락)**: 14 동기화 지점 범위 명시 — 신규 입력 없음, ⑦만 해당 (4 머리말).
- **R2-C (누락)**: UI 검증을 Playwright E2E로 (수동·claude-in-chrome 금지) — section 6.5 신설.
- **R2-D (개선)**: section 4 제목 "(권장)" → "(사용자 확정 범위)".

### 3차 — Do 단계 실측 환류 (★ 설계 정정)
- **D-1 (치명 회귀, 전체 테스트가 포착)**: "배부표를 무조건 단일 진실로" 채택 시 **배부표 데이터가 불완전한 케이스가 깨짐**:
  - E4: 사전증여에 `doneeId` 없음 → 배부표 §28=0 → 배부표 §69 기준(117M) ≠ 요약 기준(112M) → 신고세액공제 과다(3,510,000).
  - E9-A: 단일 상속인 세대생략 미플래그 → 배부표가 §27 할증을 §69 기준에 미포함 → finalTax 85,360,000(오류).
  - → **가드 신설**: `Σ perHeir.preFilingCreditTax === 요약 §69 기준`일 때만 배부표 per-heir round 합 채택. 불일치 시 요약 단일값 유지(회귀 방지). 일치 시 차이는 floor↔round ±N원뿐 → 배부표가 더 정밀. (`inheritance-summary-reconcile.ts`)
  - finalTax는 배부표 `Σ finalTax`를 통째로 쓰지 않고 **요약 결정세액에서 §69 차액(filingDelta)만 보정** — 배부표 computedTaxShare 분기 차이 전파 차단.
- **D-2**: STEP 12 `finalTax`에 영리법인 면제 차감(Path A·B 공통) + `calcInheritanceTaxCredits`에 `corporateExemptionAmount` 파라미터(§69 기준 차감, Path B fallback). Path A는 STEP 13.5가 §69를 배부표 round로 재정밀화.
- **D-3 (anchor 정정)**: 기존 `heir-allocation-gifttaxbase-derive.test.ts`가 버그값 `finalTax=1,179,260,233`을 단언(동일 테스트 per-heir 합 1,033,760,232와 자기모순) → 법령 정합값 1,033,760,232로 정정.
- **D-4 (800줄 정책)**: STEP 13.5 로직을 `inheritance-summary-reconcile.ts` 순수 헬퍼로 분리(inheritance-tax.ts 800줄 유지).
- **결과**: 엔진 anchor K-01~K-06 통과, E2E `inheritance-corporate-exemption-filing-credit.spec.ts` 통과, 전체 `npm test` 5,879 PASS·0 FAIL, tsc 0, lint 0 error.
