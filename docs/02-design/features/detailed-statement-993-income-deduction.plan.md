# 수정 계획서 — 상세 명세서(DetailedStatement)에 §99의3 소득금액 감면 미반영 버그

**작성일**: 2026-07-27
**세목**: 양도소득세 — §99의3 신축주택 감면(소득금액차감방식) 결과 표시

---

## 1. 증상 (사용자 보고)

§99의3 감면이 적용된 계산(농어촌특별세 14,124,188 존재)에서 **상세 명세서(DetailedStatement, 「3단계 — 양도소득금액·기본공제」 카드)**가 §99의3 감면을 전혀 반영하지 못한다.

| 항목 | 신고서 항목별 테이블(FilingFormTable, image49) | 상세 명세서 스텝 카드(DetailedStatement, image50) |
|---|---|---|
| 세액감면대상금액 | 0 | 0 |
| **소득금액 감면대상** | **179,917,278** | **행 자체가 없음** |
| **감면후 소득금액** | **235,201,405** (=415,118,683−179,917,278) | **415,118,683** (감면 미차감) |

→ 상세 명세서의 "감면후 소득금액 415,118,683"은 실제 과세표준(232,701,405, 감면후 소득 235,201,405 − 기본공제 2,500,000)과 **모순**. FilingFormTable은 정확.

---

## 2. 근본 원인 (실측 file:line)

### 2-a. §99의3는 "소득금액차감(§90②)" 방식 — 세액감면(§90①) 아님 (확인 완료)

- `lib/tax-engine/transfer-tax.ts:596-609` — STEP 4.6 "차감형 감면(§99의3·§99·§98의8) — 양도소득금액 차감 방식". `transferIncome = transferIncomeBefore993 − incomeDeduction.reducible`. 즉 **양도소득금액에서 직접 차감**.
- `lib/tax-engine/transfer-reductions/new-99-3.ts:449-458` — 농특세는 "감면 전 산출세액 − 감면 후 산출세액"(=소득 차감으로 절감된 세액)의 20%.
- 따라서 §99의3 금액(179,917,278)은 `result.new993Detail.reducibleTransferIncome`에 담기고, **세액감면 경로(`result.reducibleIncome`)와 무관**(0).

→ **세액감면대상금액 = 0은 정합**이다(§99의3는 §90① 세액감면방식이 아니므로). 진짜 결함은 **§99의3 금액을 "소득금액 감면대상" 행으로 표시하고 감면후 소득금액을 차감**하는 로직이 상세 명세서에 **누락**된 것.

### 2-b. FilingFormTable(정본)은 올바르게 처리

`components/calc/results/transfer/FilingFormTableHelpers.ts:653-661`:
```ts
setNum("reductionTargetIncome2", "total", result.new993Detail?.reducibleTransferIncome ?? 0); // 소득금액 감면대상
const new993Reducible = result.new993Detail?.reducibleTransferIncome ?? 0;
const incomeAmountAfter = isRH ? result.taxableGain : Math.max(0, incomeAmount - new993Reducible);
setNum("incomeAmountAfter", "total", incomeAmountAfter); // 감면후 소득금액
```

### 2-c. DetailedStatement(버그) — 두 결함

`components/calc/results/transfer/DetailedStatementHelpers.ts`:
1. **"소득금액 감면대상"(reductionTargetIncome2) 행 자체가 없음** (grep 확인 — reductionTargetIncome2는 FilingFormTable 계열에만 존재).
2. **incomeAmountAfter가 항상 0 차감** (line 604-615):
   ```ts
   items.set("incomeAmountAfter", {
     value: isAggregate
       ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)   // 집계: 자산별 incomeAfterOffset (§99의3 반영됨 — 확인 필요)
       : Math.max(0, singleIncome - (result.reductionAmount > 0 ? 0 : 0)),  // ← 단건: (x>0?0:0) = 항상 0 차감(no-op)
     ...
   });
   ```
   `(result.reductionAmount > 0 ? 0 : 0)`은 삼항 양쪽이 0 → **무조건 singleIncome 그대로**. §99의3 차감분 미반영.

### 2-d. (관련·별개 스코프) 다건 모드의 §99의3 소득금액 감면대상 미배선

`PerPropertyBreakdown`(`lib/tax-engine/types/transfer-aggregate.types.ts:82-126`)에는 **`new993Detail` 필드가 없다**(실측 확인). 따라서 자산별 §99의3 감면대상 양도소득금액을 결과뷰에서 꺼낼 수 없다.
- `FilingFormTableAggregateHelpers.ts:182,255` — `setNum("reductionTargetIncome2", col/total, 0)` 하드코딩(단건 FilingFormTable만 정확).
- 다건 DetailedStatement의 `incomeAmount`·`incomeAmountAfter`는 둘 다 `Σ incomeAfterOffset`(`DetailedStatementHelpers.ts:540-541,607`) = 동일 값. `incomeAfterOffset`는 §102② 통산 후 값이며 **§99의3 차감 반영 여부는 aggregate 엔진 별도 확인 필요**.
- → **다건 §99의3 정확 표시는 엔진(PerPropertyBreakdown에 new993Detail/reducible 추가) 배선이 선행**되어야 하는 별개 과제. **본 계획은 단건 DetailedStatement 정정으로 한정**하고, 집계 경로는 현행(0) 유지(FilingFormTable 집계와 동일 거동 — 회귀 무변화).

---

## 3. 설계 — DetailedStatement를 FilingFormTable 정본에 정렬

### 3-a. "소득금액 감면대상" 행 추가 (DetailedStatementHelpers.ts)

`reductionTargetIncome`(세액감면대상금액, line 582-602) 직후에 삽입. **집계는 0**(§2-d — PerPropertyBreakdown에 new993Detail 없음, FilingFormTable 집계와 동일):
```ts
items.set("reductionTargetIncome2", {
  label: "소득금액 감면대상",
  value: isAggregate ? 0 : (result.new993Detail?.reducibleTransferIncome ?? 0),
  formula: "§99의3 5년 안분 감면대상 양도소득금액 (§90② 소득금액차감방식) = 양도소득금액 × (5년시점 − 취득시 공시가격) / (양도시 − 취득시 공시가격)",
  legalBasis: "조세특례제한법 §99의3 · 소득세법 §90②",
  note: "신축주택 감면 — 소득금액에서 직접 차감(세액감면방식 아님)",
});
```
> `p.new993Detail` 접근 불가(PerPropertyBreakdown 미보유) 확인 완료 → 집계는 리터럴 0. 다건 §99의3 정확 표시는 §2-d 별개 과제.

### 3-b. incomeAmountAfter no-op 제거 (DetailedStatementHelpers.ts)

FilingFormTableHelpers:657-661과 동일 산식으로. **`isRH` 분기 이식 필수**(현 DetailedStatement엔 isRH 미정의 — `result.rentalHousingExceptionDetail?.applied === true`로 도출):
```ts
const isRH = result.rentalHousingExceptionDetail?.applied === true;
const new993Reducible = result.new993Detail?.reducibleTransferIncome ?? 0;
items.set("incomeAmountAfter", {
  label: "감면후 소득금액",
  value: isAggregate
    ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)          // 집계: 기존 유지(§2-d)
    : (isRH ? result.taxableGain : Math.max(0, singleIncome - new993Reducible)),  // ← no-op 삼항 제거 + isRH 분기
  formula: "양도소득금액 − 소득금액 감면대상(§99의3 §90② 소득금액차감)",
  legalBasis: "소득세법 §95·§90②",
  note: "§99의3 등 소득금액차감 감면 반영 후 소득금액 (세액감면방식은 미차감)",
});
```
- **정정 대상 확인**: 기존 line 604-615의 `value`(`Math.max(0, singleIncome - (result.reductionAmount > 0 ? 0 : 0))` no-op) + `formula`("…감면세액 차감 전 소득금액 그대로") + `note`("감면은 산출세액 단계에서 차감…") 모두 **§99의3 소득금액차감을 부정하는 문구라 함께 교체**(위 코드).
- `singleIncome`(line 543 = `Math.max(0, result.taxableGain − result.longTermHoldingDeduction)` = 양도소득금액)은 동일 스코프에서 접근 가능(확인).

### 3-c. print-leaf 열거 동기화 (강제 — memory `feedback_print_leaf_add_unit_test_sync`)

`components/calc/results/transfer/DetailedStatementConfig.ts:85-92` "income" 그룹 `itemKeys`에 신규 키 삽입:
```ts
itemKeys: [
  "incomeAmount",
  "nontaxableIncome",
  "reductionTargetIncome",
  "reductionTargetIncome2",   // ← 추가 (세액감면대상금액 다음)
  "incomeAmountAfter",
  "priorIncomeAmount",
  "basicDeduction",
],
```
누락 시 items.set 해도 스텝 카드에 미렌더(선택 출력 leaf 목록에서 제외).

---

## 4. 세액감면대상금액(reductionTargetIncome) 정확성 재확인 — 변경 불필요 (실측)

**결론: 세액감면대상금액 행은 이미 정확하다. 본 수정에서 건드리지 않는다.**

- **출처**: `reductionTargetIncome` = `reductionEligibleIncome(result.reductionTypeApplied, incomeAmount, result.reducibleIncome ?? 0, …)`.
- `result.reductionTypeApplied`·`result.reducibleIncome`은 **`calcReductions`의 세액감면 candidate에서만** 세팅(`transfer-tax-reductions-calc.ts:381-382`). candidate = 공익수용(§77)·개발제한(§77의3)·대토(§77의2)·자경(§69) 등 **세액감면방식(§90①)** 조문뿐.
- **§99의3는 income-deduction 경로(STEP 4.6 `resolveIncomeDeduction`, `transfer-tax.ts:596-609`)** — calcReductions candidate가 아님 → §99의3-단독 케이스에서 `reductionTypeApplied = undefined`, `reducibleIncome = undefined(→0)` → **세액감면대상금액 = 0 (정확)**.
- **§77/§69 등 세액감면 케이스**: `reductionEligibleIncome`의 exact-match 라우팅이 올바르게 동작(공익수용·개발제한 → 양도소득금액 전액 / 대토 → eligibleTransferIncome / 그 외 자경 → reducibleIncome). 정합.

즉 §99의3에서 세액감면대상금액 = 0은 버그가 아니라 **§90②(소득금액차감) ≠ §90①(세액감면) 구분의 정확한 결과**. §99의3 금액은 신설 "소득금액 감면대상" 행(§3-a)이 담당.

> (참고) §99의3를 세액감면대상금액 행에 넣는 것은 §90② → §90① 오분류로, **과세표준·산출세액·농특세가 전면 변경**(과세표준 232,701,405 → 412,618,683)되는 별개 사안. 옵션 A는 이 재분류를 하지 않는다(소득금액차감이 정확).

---

## 5. 성공 기준 (verify — anchor)

1. **anchor(단건)**: §99의3 감면 적용 결과(new993Detail.reducibleTransferIncome > 0)로 `buildDetailedStatement`(또는 해당 빌더) 호출 →
   - `소득금액 감면대상` = new993Detail.reducibleTransferIncome (179,917,278).
   - `감면후 소득금액` = 양도소득금액 − 소득금액 감면대상 (235,201,405), **FilingFormTable의 incomeAmountAfter와 동일**.
   - `세액감면대상금액` = 0 (정합 유지).
   - `과세표준` = 감면후 소득금액 − 기본공제 = 232,701,405 (기존 result.taxBase와 일치).
2. **회귀**: §99의3 미적용(new993Detail undefined) 케이스 → 소득금액 감면대상 = 0, 감면후 소득금액 = 양도소득금액(무영향).
3. **일관성**: 동일 result로 DetailedStatement와 FilingFormTable의 `incomeAmountAfter`·`reductionTargetIncome2` 값이 **일치**.
4. `npx tsc --noEmit` 0건 · `npx vitest run __tests__/**/transfer/` 회귀 통과.
5. 브라우저: §99의3 계산 → 상세 명세서 「3단계」에 소득금액 감면대상 179,917,278 + 감면후 소득금액 235,201,405 표시.

---

## 6. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (확정)** | DetailedStatement 단건에 소득금액 감면대상 행 추가 + incomeAmountAfter no-op 제거(FilingFormTable 이식·isRH 분기) + Config leaf 동기화 | 두 뷰 일관·법령 정합·surgical | ✅ |
| B | §99의3를 세액감면대상금액 행에 표시 | §90② → §90① 오분류. 과세표준·세액 전면 변경 | ✗ |
| C | 상세 명세서에서 §99의3 감면 행 숨김 | 사용자에게 감면 반영 사실 미노출 — 현 버그와 동일 | ✗ |

- **변경 범위(단건 한정)**: `DetailedStatementHelpers.ts`(reductionTargetIncome2 행 추가 + incomeAmountAfter value/formula/note 교체) + `DetailedStatementConfig.ts`(income 그룹 itemKeys 1줄).
- **집계(다건) 경로**: 현행(0) 유지 — 회귀 무변화. 다건 §99의3 정확 표시는 PerPropertyBreakdown 엔진 배선이 선행되는 **별개 과제**(§2-d).
- **세액감면대상금액(reductionTargetIncome)**: 무변경 — 이미 정확(§4).
- 정본은 FilingFormTableHelpers — 신규 산식 0, 검증된 로직 이식만.

## 7. 관련 메모리·정책
- `feedback_print_leaf_add_unit_test_sync` ★★ (Config itemKeys 동기화)
- `feedback_engine_result_display_drift` ★★★ (차감값 ↔ 결과 표시 일관성)
- `feedback_detailed_statement_formula_sync` ★★ (상세명세서 산식 동기화)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (FilingFormTable/DetailedStatement 단일 진실)
