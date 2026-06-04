# 상속세 외국납부세액공제 (§29 / 상증령 §21①) — UI 설계

> 계획서: `docs/00-pm/inheritance-foreign-tax-credit.plan.md` · 엔진 설계: `inheritance-foreign-tax-credit.engine.design.md`
> 단일 마법사 진입점: `components/calc/InheritanceTaxForm.tsx` (steps = `components/calc/inheritance/steps.tsx`)

## Context

외국납부세액공제 입력은 현재 `steps.tsx:566-572`의 **외국납부세액 1칸(CurrencyInput)** 뿐이다. 상증령 §21① 점유비 한도를 적용하려면 **국외 상속재산 과세표준(분자)** 입력이 추가되어야 한다(분모=전체 과세표준은 엔진 `taxBase` 자동). 결과 화면에서는 사용자 요구대로 **다른 세액공제(§28·§30·§69)와 동일하게 ▼펼치기로 Min(①,②) 산식**을 노출한다.

---

## 14개 동기화 지점 (확정 — 계획서 §5 실측 반영)

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `inheritance/shared.ts:70` | `foreignInheritanceTaxBase: string` 추가 |
| ② | initial | `inheritance/shared.ts:133` | `foreignInheritanceTaxBase: ""` 추가 |
| ③ | normalize | — | **N/A** (상속세 폼 normalize 루틴 없음, ②로 충족) |
| ④ | API 변환 | `InheritanceTaxForm.tsx:383`(buildInput creditInput) | `foreignInheritanceTaxBase: parseAmount(form.foreignInheritanceTaxBase) \|\| undefined` + `KEY_LABELS`(:106) 라벨 |
| ⑤ | UI 위젯 | `steps.tsx:566-572` | 섹션 카드 승격(아래 §입력 위젯) |
| ⑥ | 사이드바 | `InheritanceSidebar` | 세액공제 합계에 포함(별도 라인 불요) |
| ⑦ | 결과 카드 | `TaxCreditBreakdownCard.tsx:357-361` + `InheritanceTaxResultView.tsx:338` | `buildSection29Formula` + `formula` 연결 + 카드 렌더(숨김 해제) |
| ⑧ | validation | `inheritance-validate.ts` | V-29-2·V-29-3 |
| ⑨ | Zod enum | — | N/A |
| ⑩ | Zod 컴패니언 | `property-valuation-input.ts:682` | `foreignInheritanceTaxBase: z.number().nonnegative().optional()` |
| ⑪ | acqDate fallback | — | N/A |
| ⑫ | Zod 입력객체 | `inheritanceTaxCreditInputSchema:680-690` | 필드 추가 |
| ⑬ | body spread | `inheritance-api.ts:84` | `creditInput` 통째 — **자동 무수정** |
| ⑭ | route 매핑 | `route.ts:84-85` | `creditInput` 통째 — **무수정** |

---

## 입력 위젯 설계 (⑤)

`steps.tsx:566-572` 단순 CurrencyInput → **섹션 카드**(번호+tone, `components/calc/CLAUDE.md` 색상카드 규칙). §30 단기재상속(`steps.tsx:575-652`)과 동일 패턴.

```
┌ 외국납부세액공제 (§29) ───────────────────── (tone: violet, 자격/공제) ┐
│ 해외 소재 상속재산에 외국 법령에 따라 부과된 상속세를 공제합니다.        │
│ (상증령 §21① 한도: 산출세액 × 국외 상속재산 과세표준 ÷ 상속세 과세표준)   │
│                                                                       │
│ FieldCard "외국에서 납부한 상속세액"  [CurrencyInput foreignTaxPaid]      │
│   hint: 외국 법령에 따라 부과된 상속세액 (한도 비교 대상 ②)               │
│                                                                       │
│ FieldCard "국외 상속재산 과세표준"   [CurrencyInput foreignInheritanceTaxBase] │
│   hint: 외국에서 상속세가 부과된 상속재산의 과세표준 (한도식 분자 ①).      │
│         미입력 시 외국납부세액공제가 적용되지 않습니다.                    │
│   ※ 전체 상속세 과세표준(분모)은 자동 계산됩니다.                         │
└───────────────────────────────────────────────────────────────────────┘
```

- 입력 컴포넌트: `CurrencyInput`(원 정수) + `FieldCard`(라벨·hint). placeholder 숫자 예시 금지 — hint 한국어.
- 순서 = 엔진 계산 순서: 외국납부세액(②) → 국외 과세표준(① 분자). 분모는 UI 없음(엔진 `taxBase`).
- 미입력 동작: `foreignInheritanceTaxBase` 빈칸 → 한도 0 → 공제 0(FTC-03). 외국세액만 있고 과표 미입력 시 hint로 "과표 미입력 시 공제 0" 안내(차단 아님 — V-29-3 참조).
- tone: violet(자격·공제). §30 카드가 번호 없이 tone 카드 형식이므로(`steps.tsx:575`) §29도 **번호 없이** 동일 형식(U3).

---

## 결과 카드 설계 (⑦ — 옵션 X)

### `buildSection29Formula(detail: foreignCreditDetail)` 신규 (TaxCreditBreakdownCard.tsx, §28 빌더 패턴)
```
외국납부세액공제 = Min( 한도① , 외국 납부세액② )
  = Min( {creditLimit} , {foreignTaxPaid} ) = {creditAmount}
한도① = 상속세 산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준)
      = {computedTax} × ({foreignInheritanceTaxBase} ÷ {overallTaxBase}) = {creditLimit}
```
- 약어·`floor()` 금지(`feedback_result_view_korean_formula`), "원" 접미사 금지(`feedback_no_won_suffix`), 금액칼럼 `text-right font-mono tabular-nums`(`amount-column-align`).
- `creditAmount < Min(②,①)`(잔액 클램핑 발동) 시 note: "선행 공제(§28) 차감 후 잔액 한도로 축소".

### 연결 + 렌더 (props 실측 — U1·U2)
- 상속세 세액공제 결과 객체 = **`result.creditDetail`**(`InheritanceTaxResult.creditDetail: TaxCreditResult`, types:1044). echo 경로 = `result.creditDetail.foreignCreditDetail`.
- §29 `CreditRow`(`:357-361`)에 `formula={credit.foreignCreditDetail ? buildSection29Formula(credit.foreignCreditDetail) : undefined}` 추가. `CreditRow`(`:224-278`)가 자동 ▶/▼ 토글 렌더.
- `InheritanceTaxResultView.tsx:338` 숨김 해제 → `TaxCreditBreakdownCard` 렌더(`result.totalTaxCredit > 0` 시). props 매핑(GiftTaxResultView:424 참고):

  | prop | 상속세 값 |
  |---|---|
  | `credit` | `result.creditDetail` |
  | `taxBeforeCredit` | `result.creditDetail.totalComputedTaxWithSurcharge ?? result.computedTax` (세액공제 전 세액) |
  | `computedTax` | `result.computedTax` (§28 산식 ⑦용 — 카드 §28 펼침 미사용 시 무영향) |
  | `corporateExemption` | `result.corporateExemption?.amount ?? 0` (§69 산식 차감항) |
  | `priorGiftCreditDetail` | **undefined 권장** — §28 펼침은 `AllocationBreakdownSection` 담당(중복 방지), 카드는 §29·§30·§69 펼침 |

- 역할 정리: §29·§30·§69 펼침은 카드, §28은 배부표 유지(중복 방지 — Do 시 확정, 계획서 §11-5).

---

## Validation (⑧)

`inheritance-validate.ts`에 §30 교차검증(`:327-346`) 옆에 추가:
- **V-29-2**: `foreignInheritanceTaxBase` 음수 → "국외 상속재산 과세표준은 0 이상이어야 합니다." (Zod `nonnegative`와 동일 — UI/validate 모순 금지)
- **V-29-3**: `foreignInheritanceTaxBase > 0` AND `foreignTaxPaid` 미입력 → "외국납부세액공제: 국외 과세표준을 입력하려면 외국에서 납부한 상속세액도 입력해야 합니다." (과표만 입력은 무의미)
- 역방향(외국세액만 입력, 과표 미입력)은 **차단 안 함** — 한도 0으로 공제 0이 되며, 입력 위젯 hint로 안내(자동 안분 fallback 아님, `feedback_no_silent_apportion_fallback`).

---

## 사이드바 (⑥)

외국납부세액공제는 세액공제 합계(`result.totalTaxCredit`)에 포함되어 결과 도착 후 노출. 입력 중 별도 라인 불요(계산 결과 의존값).

---

## E2E 시나리오 (`e2e/inheritance-foreign-tax-credit.spec.ts`)

패턴: `e2e/inheritance-corporate-exemption-filing-credit.spec.ts`. memory `feedback_browser_verify_with_playwright`.
1. 상속 재산·상속인 입력 → Step4에서 외국납부세액(②) + 국외 상속재산 과세표준(①) 입력.
2. 계산 → 결과 화면 세액공제 내역에 "외국납부세액공제" 행 + `- {creditAmount}` 표시.
3. **▼ 산출근거 토글 클릭 → Min(①,②) 산식 + "산출세액 × (국외과표 ÷ 과세표준)" 펼침 노출** (사용자 요구 핵심).
4. 한도 미달 케이스(교재: ①3.75억 < ②4억)에서 공제 = 375,000,000 확인.

---

## 7대 사용자 동기화 지점 점검

| 지점 | 반영 |
|---|---|
| FormData 필드 | ① `foreignInheritanceTaxBase: string` |
| initial | ② `""` |
| normalize | ③ N/A |
| API 변환 | ④ buildInput creditInput |
| UI 위젯 | ⑤ 섹션 카드 2칸 |
| 결과 카드 | ⑦ buildSection29Formula + 카드 렌더 |
| validation | ⑧ V-29-2·V-29-3 |

800줄 정책: `steps.tsx`(658→~680)·`TaxCreditBreakdownCard.tsx`(401→~445)·`InheritanceTaxResultView.tsx`·`inheritance-validate.ts` 모두 800 이내(계획서 UI 시니어 평가).
