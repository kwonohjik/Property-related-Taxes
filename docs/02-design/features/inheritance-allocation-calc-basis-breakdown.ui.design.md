# 상속세 배부·증여세액공제 계산 근거 펼침 — UI 설계

> Plan: `docs/00-pm/inheritance-allocation-calc-basis-breakdown.plan.md`
> Engine: `docs/02-design/features/inheritance-allocation-calc-basis-breakdown.engine.design.md`
> 작성일: 2026-06-01

## Context

집계 표(이미지8 위 `HeirAllocationSummaryTable`)는 *1·*2·⑥·⑦⑧⑨·⑩·⑫의 **결과값**만 보여준다.
사용자는 교재(이미지5~7)처럼 각 값의 **산식·중간값**을, "상속공제 상세 내역"(`DeductionBreakdownSection`)과
**같은 펼침(▼) 방식**으로 그 아래에서 조회하고 싶어 한다.

## 사용자 시나리오

1. 상속세 계산 완료 → 결과 화면.
2. "상속인별 상속세부담액 집계 표"에서 *1·⑥㉡·⑩b·⑫b 등 값을 본다.
3. 그 아래 **"상속세 산출세액·증여세액공제 계산 근거"** 섹션 ▼ 펼침.
4. 6개 카드 각각 ▼ 펼쳐 교재와 동일한 산식(분자/분모·×세율−누진공제·Min)을 확인.
5. 인쇄/PDF 시 모든 카드 자동 펼침(`print:block`).

## 컴포넌트 분리 트리

```
components/calc/results/allocation-breakdown/
├── AllocationBreakdownSection.tsx     # 섹션 헤더 ▼ (useState) + 6 DetailCard 조립 + 조건부 렌더
├── DistributableTaxBaseDetailCard.tsx # ① *1
├── SurchargeTargetDetailCard.tsx      # ② *2
├── TaxBaseShareDetailCard.tsx         # ③ ⑥㉠㉡㉢ + *3
├── ComputedTaxDetailCard.tsx          # ④ ⑦⑧⑨ + ⑪·*5
├── CorporateGiftCreditDetailCard.tsx  # ⑤ ⑩a/b/c
└── HeirGiftCreditDetailCard.tsx       # ⑥ ⑫a/b/c
```
- 공용: `deduction-breakdown/shared.tsx`의 `DetailTable`·`DetailRow`·`SubTotalRow`·`ExpandButton` import.
- 열 순서·라벨: `lib/calc/heir-allocation-summary.ts`의 `sortHeirs`·`labelOf` 재사용.
- 각 카드 props: `{ result, heirs }`. 영리법인 행은 해당 카드에서 제외/빈칸 처리.

## 각 카드 펼침 표 디자인 (한국어 풀어쓰기 · "원" 단위 미표기 · floor 묵시 · 변수 약어 금지)

> **[U1] DetailRow 다열 표현**: 공용 `DetailRow`는 `{label, value}` 2열 — 집계표 같은 다열(이름=칼럼)
> 아님. 상속인별 값은 **세로 반복** — `label`에 "{이름} — {항목}"(예 "배우자 — ㉡ 간접배부"), `value`에 결과액.
> 분수·곱셈 산식은 **보조 행**(`DetailRow indent muted`, 예 label="= 1,865,000,000 × (2,935,000,000 ÷ 5,815,000,000)",
> value="") 또는 fine-print로 결과값 아래 배치 — 모바일 줄넘침 방지. 값은 `formatKRW`(toLocaleString, "원" 없음).
> 상속인 라벨은 `labelOf(id, heirs)`, 순서는 `sortHeirs`.

### ① 과세표준 배부대상 과세가액 (*1) — `DistributableTaxBaseDetailCard`
- trigger: `과세표준 배부대상 과세가액` / `distributableTaxBase`
- 펼침:
  - SubTotal `합계` = `상속세 과세가액 − 가산한 증여재산 합계` (8,775,000,000 − 2,960,000,000)
  - 상속인별 행(영리법인 제외): `{이름}` = `과세가액상당액(taxableValueShare) − 사전증여가액(priorGiftAmount)`
    - 예) 배우자 2,935,000,000 = 3,695,000,000 − 760,000,000

### ② 할증과세 대상 과세가액 (*2) — `SurchargeTargetDetailCard`  (§27①)
- trigger: `할증과세 대상 과세가액` / `surchargeTargetTaxableValue`
- 펼침:
  - SubTotal `합계` = `상속세 과세가액 − 상속인·수유자 외 자(영리법인) 사전증여가액` (8,775,000,000 − 700,000,000)
  - 상속인별 행: `{이름} 과세가액상당액` (`taxableValueShare`, 영리법인 제외)

### ③ 상속인별 과세표준 상당액 (⑥) — `TaxBaseShareDetailCard`  (집행기준 19-17-1)
- trigger: `상속인별 과세표준 상당액 (계)` / `result.taxBase`
- 펼침(분모/분자 안내 행 먼저):
  - 안내 `간접배부대상 과세표준` = `indirectNumerator` (1,865,000,000)
  - 안내 `간접배부 분모(증여재산 제외 과세가액)` = `indirectDistributionBase` (5,815,000,000)
  - **[U6] 상속인별 3행 묶음 — 영리법인 포함** (집계표 ⑥ 행은 영리법인 포함, 실측: 영리법인 ㉠ 700M·㉡ 0·㉢ 700M):
    - `㉠ 직접배부` = `directTaxBaseShare` (영리법인=사전증여 과세표준 700M)
      *(증여재산공제 역산 R8: 사전증여 {priorGiftAmount} − 공제 {priorGiftAmount−directTaxBaseShare} = {directTaxBaseShare}; 직접배부 0이면 역산 줄 생략. 영리법인은 증여공제 0이므로 역산 생략)*
    - `㉡ 간접배부` = `간접배부대상 과세표준 × (본인 *1 ÷ 분모)` = `indirectTaxBaseShare` (영리법인=0 — 간접배부 미적용)
      - 예) 배우자 941,319,862 = 1,865,000,000 × (2,935,000,000 ÷ 5,815,000,000)
    - `㉢ 과세표준 상당액 계` = `taxBaseShare` (㉠+㉡)
  - SubTotal `*3 분모(영리법인 제외)` = `computedTaxShareDenominator` (3,475,000,000)
  - ⚠ ①*1·②*2·④⑪·*5·⑥⑫는 **영리법인 제외**(집계표 `HEIR_NO_CORP`), **③⑥만 영리법인 포함** — 행 필터 분기 주의.

### ④ 상속세 산출세액 (⑦⑧⑨ + ⑪·*5) — `ComputedTaxDetailCard`  (§26)
- trigger: `상속세 산출세액 소계` / `computedTax + generationSkipSurcharge`
- 펼침:
  - `⑦ 산출세액` = `과세표준 × 세율 − 누진공제` = `computedTax`
    - 세율·누진공제는 echo: `과세표준 4,175,000,000 × 50% − 460,000,000` (`computedTaxAppliedRate`·`computedTaxProgressiveDeduction`)
    - **echo undefined fallback**: "§26 누진세율"(`LawArticleModal §26`)만, ×−줄 생략
  - `⑧ 세대생략 가산액` = `generationSkipSurcharge` *(값만 — 상세 산식은 위 ⑧ `InheritanceGenerationSkipDetailCard` 참조 안내, R3 중복 금지)*
  - SubTotal `⑨ 산출세액 소계` = ⑦ + ⑧
  - `배부대상 산출세액` = `⑦ − 영리법인 면제(⑩c)` = `distributableTax` (1,477,500,000)
  - 상속인별 행(영리법인 제외):
    - `⑪ 산출세액 배부` = `배부대상 × (본인 ⑥㉢ ÷ *3 분모)` = `computedTaxShare`
    - `*5 부담비율` = `본인 ⑥㉢ ÷ *3 분모` = `burdenRatio` (소수 4자리)

### ⑤ 상속인·수유자가 아닌 자의 증여세액 공제 (⑩) — `CorporateGiftCreditDetailCard`  (§3의2②)
- 표시 조건: 영리법인 상속인 존재 시만
- trigger: `상속인·수유자 외 증여세액공제` / `corporateExemption.amount`
- 펼침(영리법인 행):
  - `ⓐ 증여세 산출세액` = `perHeir[corp].priorGiftComputedTax` (150,000,000)
  - `ⓑ 공제 한도` = `산출세액 × (영리법인 과세표준 ÷ 과세표준)` = `perHeir[corp].priorGiftCreditLimit` (272,874,251)
    - 영리법인 과세표준 700,000,000 = `taxBase − computedTaxShareDenominator` (역산 R4)
  - `ⓒ 공제할 증여세액` = `Min(ⓐ, ⓑ)` = `corporateExemption.amount`
  - 주석(R7): `합계행 ⑩b(corporateExemptionLimitDisplay 277,943,123)는 산출세액+세대생략(⑨ 소계) 기준,
    영리법인 행(272,874,251)은 산출세액(⑦) 기준 — 할증 포함 여부 차이`
  - 안내: 영리법인 주주 환원 명세는 별지 부표5 카드(`perCorporateBreakdown`) 참조 (중복 금지)

### ⑥ 상속인 및 수유자의 증여세액 공제 (⑫) — `HeirGiftCreditDetailCard`  (§28)
- 표시 조건(R2): 영리법인 **제외** 상속인의 `priorGiftComputedTax` 합 > 0
- trigger: `상속인·수유자 증여세액공제` / `Σ(영리법인 제외) priorGiftCredit`
- 펼침(상속인별, 사전증여 있는 상속인만 행 표시):
  - `ⓐ 증여세 산출세액` = `priorGiftComputedTax`
  - `ⓑ 공제 한도` = `산출세액 배부(⑪) × (직접배부 ÷ 과세표준 상당액)` = `priorGiftCreditLimit`
    - 예) 배우자 68,028,777 = 468,259,020 × (160,000,000 ÷ 1,101,319,862)  *(⑪ echo 468,259,020, PDF ±1원 R10)*
  - `ⓒ 사전증여세액공제` = `Min(ⓐ, ⓑ)` = `priorGiftCredit`

## 펼침 UX

- 섹션 헤더·각 카드 모두 `useState(open)` + `ExpandButton`(▲/▼).
- **print 자동 펼침 (CSS-only, `print-only-css-toggle`)**: 펼침 영역 `className={open ? "block" : "hidden print:block"}`,
  토글 버튼 `print:hidden`. useEffect·isPrinting 추적 금지.
- 색조: `deduction-breakdown`과 동일 — `border rounded-xl` + 헤더 `bg-muted/30`. (집계 표 violet과 구분되는 중립 톤,
  "상속공제 상세 내역"과 시각적 형제 관계 강조)
- 섹션 번호: 6 카드는 원형 번호 대신 라벨의 ①~⑫ 기호 유지(교재 정합).

## result echo 소비 매핑 (엔진 echo 단일 진실 — 자체 재계산 금지)

| 카드 | 직접 echo | 역산(UI) |
|---|---|---|
| ① *1 | `summaryTable.distributableTaxBase`, `taxableValueShare`, `priorGiftAmount` | — |
| ② *2 | `summaryTable.surchargeTargetTaxableValue`, `taxableValueShare` | — |
| ③ ⑥ | `directTaxBaseShare`·`indirectTaxBaseShare`·`taxBaseShare`·`indirectNumerator`·`indirectDistributionBase`·`computedTaxShareDenominator` | 증여공제 = `priorGiftAmount − directTaxBaseShare` (R8) |
| ④ ⑦⑨⑪ | `computedTax`·`generationSkipSurcharge`·`distributableTax`·`computedTaxShare`·`burdenRatio`·`computedTaxAppliedRate`·`computedTaxProgressiveDeduction` | ⑨ = ⑦+⑧ |
| ⑤ ⑩ | `perHeir[corp].priorGiftComputedTax`·`priorGiftCreditLimit`·`corporateExemption.amount`·`summaryTable.corporateExemptionLimitDisplay` | 영리법인 과세표준 = `taxBase − computedTaxShareDenominator` (R4) |
| ⑥ ⑫ | `priorGiftComputedTax`·`priorGiftCreditLimit`·`priorGiftCredit` | — |

> `result.taxBase` 등은 기존 노출 필드. **자체 안분·세율표 재정의 금지** (`feedback_ui_engine_dual_truth_avoidance`).

## 14개 동기화 지점 — ⑦ 결과 카드 중심 (입력 폼 없음 — 결과 전용 기능)

| # | 지점 | 적용 |
|---|---|---|
| ①~④ 폼/initial/normalize/API 변환 | **N/A** — 입력 신규 0 |
| ⑤ UI 위젯 | **신규** — 6 DetailCard + AllocationBreakdownSection |
| ⑥ 사이드바 | N/A |
| ⑦ 결과 카드 | **핵심** — `InheritanceTaxResultView.tsx` L371(DeductionBreakdownSection) 직후 섹션 추가 |
| ⑧ validation | N/A (result echo 표시 전용) |
| ⑨~⑭ Zod/route | N/A — 입력 변경 없음. 단 ⑦ echo 2필드는 **엔진 result**(route 통과 자동) |

## 작업 순서 (엔진 선처리 → UI)

1. [엔진] `findApplicableBracket` 헬퍼 + STEP 8 echo 2필드 + echo anchor (Engine D1).
2. [UI] shared·sortHeirs·labelOf import 확인.
3. [UI] 6 DetailCard 작성 (각 ≤150줄, 이미지5~7 산식 박제).
4. [UI] AllocationBreakdownSection 조립 + 조건부 렌더(⑩ 영리법인 / ⑫ 영리법인 제외 합 R2).
5. [UI] `InheritanceTaxResultView` 통합 (L371 직후, `heirAllocationResult && heirs?.length` 가드).
6. [UI] RTL anchor (`AllocationBreakdownSection.test.tsx`) — 카드 존재·산식 텍스트·조건부·자기일관.
7. `tsc --noEmit` 0 → `vitest` → `npm test` 회귀 0 → E2E.

## 자가 검토 이력 (UI 디자인)
### 검토 1차 — 3건 (단계 13)
| # | 카테고리 | 우선순위 | 발견 → 정정 |
|---|---|---|---|
| U1 | UI누락 | Medium | DetailRow 다열 표현 미명시 → 상속인별 세로 반복(label=이름+항목), 분수 보조 indent 행 |
| U2 | 확인 | — | `formatKRW`=toLocaleString "원" 미표기 확인 — OK |
| U6 | 오류 | High | ③⑥ "영리법인 제외" 틀림(실측 영리법인 ㉠ 700M) → ⑥만 영리법인 포함, *1/*2/⑪/⑫만 제외 |

→ 통합 비교(I1·I4·I8)는 plan/engine.design에 반영 완료. UI 디자인 검토 종결.
