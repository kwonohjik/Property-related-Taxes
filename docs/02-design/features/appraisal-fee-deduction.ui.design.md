# 감정평가수수료 공제 (상속 §25①2호 / 증여 §55①·§46의2) — UI 설계

> 계획서: `docs/00-pm/appraisal-fee-deduction.plan.md` · 엔진 설계: `appraisal-fee-deduction.engine.design.md`
> 상속 진입점: `components/calc/InheritanceTaxForm.tsx` (steps = `components/calc/inheritance/steps.tsx`, 폼 = `inheritance/shared.ts`)
> 증여 진입점: `components/calc/GiftTaxForm.tsx` (steps·폼 = `components/calc/gift-tax-form-shared.tsx`)

## Context

감정평가수수료 입력은 현재 **전무**(상속 `steps.tsx` Step4·증여 `gift-tax-form-shared.tsx` Step3 어디에도 없음). 과세표준에서 차감되는 공제(세액공제 아님)이므로 상속 Step4의 **공제 그룹 하단(재해손실공제 다음, 세액공제 섹션 직전)**, 증여 Step3의 **증여재산공제 다음**에 배치한다. 결과는 과세표준 CalculationStep "− 감정평가수수료"로 자동 표시 + 신고서(별지9호 ⑲ / 별지10호 ㉙) 실값 + `appraisalFeeDetail` 호별 내역 ▼펼침.

5칸 입력(부동산·비상장·서화 3종 금액 + 비상장 법인수·기관수)을 1개 `AppraisalFeeInput`으로 조립. **상속·증여 동일 위젯**(`AppraisalFeeSection` 공용 컴포넌트).

---

## 14개 동기화 지점 — ⚠️ 상속·증여 비대칭 (계획서 §5·실측 반영)

### 상속 (11 지점 — API/Route 3곳 모두 명시 매핑)
| # | 지점 | 위치 (실측) | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `inheritance/shared.ts:16 FormState` | flat 5필드: `appraisalRealEstateFee`·`appraisalUnlistedFee`·`appraisalUnlistedTargetCount`·`appraisalUnlistedAgencyCount`·`appraisalTangibleFee`: `string` |
| ② | initial | `inheritance/shared.ts:113 INITIAL_FORM` | 각 `""` |
| ③ | normalize | — | **N/A** (상속 폼 normalize 루틴 없음, ②로 충족) |
| ④ | API 변환 | `InheritanceTaxForm.tsx:334 buildInput` | `appraisalFee: buildAppraisalFee(form)`(아래 헬퍼) — 상속 `KEY_LABELS` 없음(실측 0건) |
| ⑤ | UI 위젯 | `steps.tsx` Step4 (재해손실공제 `:537~545` 다음, 세액공제 `:546` 직전) | `AppraisalFeeSection`(공용, violet) |
| ⑥ | 사이드바 | `InheritanceSidebar` | 과세표준 차감(결과 의존) — 별도 라인 불요 |
| ⑦ | 결과 카드 | `InheritanceTaxResultView` + `filing-form-9-data.ts:102` | CalculationStep 자동 + 별지9호 ⑲(`b19 = result.appraisalFeeDeduction ?? 0`) + `appraisalFeeDetail` ▼펼침 |
| ⑧ | validation | `inheritance-validate.ts` `validateInheritanceTaxInput`(:300) | V-AF-1(음수 차단)·V-AF-2(부동산 입력+감정가 미신고 hint) |
| ⑫ | **Zod 입력객체** | `inheritanceTaxInputSchema:732` | `appraisalFee: appraisalFeeSchema.optional()` ⚠️ |
| ⑬ | **api.ts body** | `inheritance-api.ts:68-89` 명시 body | `appraisalFee: input.appraisalFee` 추가 ⚠️ |
| ⑭ | **route 매핑** | `route.ts:69-90` 명시 객체 | `appraisalFee: parsedData.appraisalFee` 추가 ⚠️ **Critical** |

### 증여 (8 지점 — ⑥ 사이드바·⑭ route 없음)
| # | 지점 | 위치 (실측) | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `gift-tax-form-shared.tsx:29 FormState` | 동일 flat 5필드 |
| ② | initial | `gift-tax-form-shared.tsx:59 INITIAL_FORM` | 각 `""` |
| ③ | normalize | — | N/A |
| ④ | API 변환 | `gift-api.ts:61 buildGiftTaxInput` return | `appraisalFee: buildAppraisalFee(form)` (+ `KEY_LABELS:152` 라벨 선택) |
| ⑤ | UI 위젯 | `gift-tax-form-shared.tsx` Step3(`:440`) — 10년 기사용 증여재산공제(`:481`) 다음, 신고세액공제(`:488`) 직전 | `AppraisalFeeSection`(공용, violet) |
| ⑦ | 결과 카드 | `GiftTaxResultView` + `besshi10.ts:127` | CalculationStep + 별지10호 ㉙(기연동, 엔진값만) + ㉚ 정합(AF-11) + detail ▼펼침 |
| ⑧ | validation | `gift-tax-form-shared.tsx:220 validateStep` (⚠️ `gift-validate.ts` 부재) | V-AF-1·V-AF-2 |
| ⑫ | **Zod 입력객체** | `giftTaxInputSchema:767` | `appraisalFee: appraisalFeeSchema.optional()` ⚠️ |
| (⑬) | body | `GiftTaxForm.tsx:128` `JSON.stringify(buildGiftTaxInput(form))` | buildInput에 추가 시 **자동** |
| (⑭) | route | `gift/route.ts:62` `parsed.data as GiftTaxInput` | **spread 자동 — 무수정** |

⚠️ **상속 ⑫⑬⑭ 3곳 모두 추가 필수** — 1곳 누락 시 TypeScript 미감지 침묵 strip([[feedback_explicit_prop_mapping_strip]]). 자가점검: `appraisalFee` grep이 Zod·api.ts·route 3파일에 모두 등장.

### 공유 헬퍼 (④ 상속·증여 동일)
```ts
// AppraisalFeeInput 조립 — flat 폼 → nested (상속 InheritanceTaxForm·증여 gift-api 공용)
function buildAppraisalFee(form): AppraisalFeeInput | undefined {
  const re = parseAmount(form.appraisalRealEstateFee) || undefined;
  const un = parseAmount(form.appraisalUnlistedFee) || undefined;
  const tg = parseAmount(form.appraisalTangibleFee) || undefined;
  if (!re && !un && !tg) return undefined;   // 전부 빈값 → undefined (회귀 0, AF-8)
  return {
    realEstateAppraisalFee: re,
    unlistedStockAppraisalFee: un,
    unlistedTargetCount: parseInt(form.appraisalUnlistedTargetCount) || undefined,
    unlistedAgencyCount: parseInt(form.appraisalUnlistedAgencyCount) || undefined,
    tangibleAppraisalFee: tg,
  };
}
```
> `Zod appraisalFeeSchema` = `z.object({ realEstateAppraisalFee: z.number().nonnegative().optional(), unlistedStockAppraisalFee: …, unlistedTargetCount: z.number().int().positive().optional(), unlistedAgencyCount: …, tangibleAppraisalFee: … })` — `property-valuation-input.ts` 신설 후 양 Input 스키마에 부착.

---

## 입력 위젯 설계 (⑤) — `AppraisalFeeSection` (상속·증여 공용)

**공용 위치** `components/calc/deductions/AppraisalFeeSection.tsx` 신설 (상속·증여 공용 — `ExemptionChecklist`(`components/calc/exemption/`)의 공용 패턴 차용, 상속 `steps.tsx`·증여 `gift-tax-form-shared.tsx` 양쪽이 import). tone violet(자격·공제). `ToggleCard`로 optional 펼침(기본 OFF — 해당 시만 입력, 미해당 0). `components/calc/CLAUDE.md` 색상카드·번호 규칙.

```
┌ 감정평가수수료 공제 (§25①2호 / 시행령 §20의3) ─────── (tone: violet) ┐  ※증여: (§55① / §46의2)
│ 상속·증여 재산 평가에 든 감정평가 수수료를 과세표준에서 공제합니다.       │
│ ▸ ToggleCard "감정평가수수료 입력" (OFF 기본)                            │
│   ON 시:                                                               │
│   ┌ 1호 부동산 등 감정평가 ────────────────────── (sky 서브) ┐          │
│   │ FieldCard "감정평가법인 수수료"  [CurrencyInput appraisalRealEstateFee]│
│   │   hint: 「감정평가법」 감정평가법인등 수수료 (500만원 한도).          │
│   │         감정가액으로 신고한 경우에만 공제됩니다(시행령 §20의3②).      │
│   └──────────────────────────────────────────────────────────┘          │
│   ┌ 2호 비상장주식 신용평가 ──────────────────── (sky 서브) ┐          │
│   │ FieldCard "신용평가전문기관 수수료" [CurrencyInput appraisalUnlistedFee]│
│   │ FieldCard "평가대상 법인 수" [DecimalInput appraisalUnlistedTargetCount]│
│   │ FieldCard "신용평가기관 수"  [DecimalInput appraisalUnlistedAgencyCount]│
│   │   hint: 법인 수 × 기관 수 × 1천만원 한도 (시행령 §20의3③).           │
│   └──────────────────────────────────────────────────────────┘          │
│   ┌ 3호 서화·골동품 등 ───────────────────────── (sky 서브) ┐          │
│   │ FieldCard "유형재산 감정수수료" [CurrencyInput appraisalTangibleFee]  │
│   │   hint: 서화·골동품 등 유형재산 평가 감정수수료 (500만원 한도).        │
│   └──────────────────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────────────┘
```

- 금액 = `CurrencyInput`(원 정수) + `parseAmount`. 법인수·기관수 = `DecimalInput` + `parseDecimal` 후 정수화(`Math.trunc`/`parseInt`) (CurrencyInput 금지 — 콤마 부적합). `FieldCard` 라벨·hint. placeholder 숫자 예시 금지([[feedback_no_won_suffix]] 등) — hint 한국어.
- 순서 = 엔진 호별 순서: 1호 부동산 → 2호 비상장(+카운트) → 3호 서화. ToggleCard OFF도 violet tone 유지([[feedback_toggle_card_visibility]]).
- **3-state 주의**([[feedback_three_state_optional_mode_toggle]]): ToggleCard ON/OFF는 데이터 유무 derive 금지 — 명시 토글 상태. OFF면 5필드 무시(공제 0).
- 배치: 상속 = `steps.tsx` Step4 재해손실공제(`:537~545`) 다음·세액공제(`:546`) 직전. 증여 = `gift-tax-form-shared.tsx` Step3 10년 기사용 증여재산공제(`:481`) 다음·신고세액공제(`:488`) 직전.
- **V-AF-2 hint(차단 아님)**: `appraisalRealEstateFee > 0` AND 감정가액 자산(`valuationMethod==="appraisal"`) 부재 → 1호 hint에 "감정가액으로 신고한 경우에만 공제(§20의3②)" 안내. 한도 0 → 공제 0(자동 안분 fallback 아님, [[feedback_no_silent_apportion_fallback]]).

---

## 결과 카드 설계 (⑦)

### 과세표준 요약 행 — SummaryRow/Row 명시 추가 (Do 환류)
> ⚠️ **Do 환류**: 결과뷰 요약 목록(`InheritanceTaxResultView` SummaryRow · `GiftTaxResultView` Row)은 `allBreakdown` 전체가 아니라 **주요 단계만** 표시 → 감정평가수수료 step이 자동 노출되지 않음(E2E AF-E2E-2로 발견, [[feedback_engine_result_display_drift]]). **상속공제/증여재산공제 행 다음·과세표준 직전에 명시 행 추가**(`result.appraisalFeeDeduction > 0` 시 `- {금액}`).

### `appraisalFeeDetail` ▼펼침 (호별 내역 — 선택)
- `result.appraisalFeeDetail.breakdown[]`(호별 한도 적용액) + `warnings[]`(§20의3② 미신고·§20의3④ 입증서류)을 ▼펼침 카드로.
- 산식 한국어([[feedback_result_view_korean_formula]]): "1호 부동산 감정 = min(입력액, 500만) / 2호 비상장 = min(입력액, 1천만 × 법인수 × 기관수) / 3호 = min(입력액, 500만)". "원" 접미사 금지, 금액칸 `text-right font-mono tabular-nums`.
- 호별 한도 cap 발동(입력 > 한도) 시 note: "시행령 §20의3③ 한도 적용".

### 신고서 연동
- **상속 별지9호 ⑲**: `filing-form-9-data.ts:102` `const b19 = 0;` → `const b19 = result.appraisalFeeDeduction ?? 0;` (result 필드 추가 후). `:130 amtRow("⑲", b19)` 자동.
- **증여 별지10호 ㉙**: `besshi10.ts:127` 이미 `r.appraisalFeeDeduction ?? 0` → **코드 변경 0**(엔진 계산값 자동 반영). ㉚ formula `㉔−…−㉙`와 `r.taxBase` 정합(AF-11).

---

## Validation (⑧) — 상속·증여 공통

`inheritance-validate.ts`(상속) / `gift-tax-form-shared.tsx validateStep`(증여)에 추가:
- **V-AF-1**(음수 차단): `CurrencyInput`(allowNegative 미사용=양수 전용) + Zod `nonnegative`/`positive` 이중으로 충족 — 별도 validate 코드 불요(음수 도달 불가). [[feedback_validation_sync_8th_point]] UI/validate 일관. (Do 환류: validate 코드 0)
- **V-AF-2는 validate 차단 아님** — 위젯 hint로 처리(§입력 위젯 V-AF-2). 감정가 미신고 시 1호 한도 0 → 공제 0(자동 안분 fallback 아님, [[feedback_no_silent_apportion_fallback]]). validate는 음수(V-AF-1)만 차단.
- 역방향(법인수·기관수만 입력, 비상장 수수료 0)은 무해(곱 한도만 산정, 공제 0).

---

## 사이드바 (⑥ — 상속만)

감정평가수수료는 과세표준 차감(결과 의존값)이므로 결과 도착 후 노출. 입력 중 별도 라인 불요([[feedback_pdca_session_efficiency]] 사이드바=계산 가능 항목만).

---

## E2E 시나리오 (`e2e/appraisal-fee-deduction.spec.ts`)

패턴: `e2e/inheritance-foreign-tax-credit.spec.ts`([[feedback_browser_verify_with_playwright]]).
1. **상속**: 재산(감정가 자산 1건, `valuationMethod=appraisal`)·상속인 입력 → Step4 ToggleCard ON → 부동산 감정수수료 700만 입력 → 계산 → 과세표준 CalculationStep "− 5,000,000"(500만 cap) + 별지9호 ⑲ = 5,000,000.
2. ▼ 호별 내역 펼침 → "1호 부동산 = min(700만, 500만)" 노출.
3. AF-3: 감정가 자산 없이 부동산 수수료 입력 → 공제 0 + hint.
4. **증여**: Step3 ToggleCard ON → 비상장 1,500만(법인2·기관1) → 과세표준 −1,500만(한도 2천만) + 별지10호 ㉙=15,000,000·㉚ 정합.

---

## 7대 사용자 동기화 지점 점검

| 지점 | 상속 | 증여 |
|---|---|---|
| ① FormData | shared.ts 5필드 | gift-shared 5필드 |
| ② initial | `""` | `""` |
| ③ normalize | N/A | N/A |
| ④ API 변환 | buildInput `buildAppraisalFee` | buildGiftTaxInput `buildAppraisalFee` |
| ⑤ UI 위젯 | Step4 `AppraisalFeeSection` | Step3 `AppraisalFeeSection`(공용) |
| ⑦ 결과 | CalcStep+⑲+detail | CalcStep+㉙·㉚+detail |
| ⑧ validation | inheritance-validate V-AF-1·2 | validateStep V-AF-1·2 |

**800줄 정책**: `AppraisalFeeSection.tsx` 신설(공용)로 steps.tsx·gift-tax-form-shared.tsx 증분 최소. `appraisal-fee-deduction.ts`(공유 모듈)·`InheritanceTaxResultView`·신고서 모두 800 이내 확인(Do 시).
