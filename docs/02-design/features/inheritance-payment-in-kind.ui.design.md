# 상속세 물납(§73) — UI 디자인

> 마스터: `inheritance-payment-in-kind.design.md` §5 / 엔진: `.engine.design.md`
> 결정세액 미영향 **납부방법 투영 입력**. 결과뷰가 `result` + 폼 props로 `calcPaymentInKindAssessment()` 호출 → 카드 렌더(연부연납 `InstallmentScheduleCard` 패턴).
> 작성 2026-06-06 · 13단계 자가검토(STEP 12) · 분리 생성(스킬 강제)

---

## 1. 동기화 지점 (UI 측 ①②③⑤⑦⑧ + 별지9호 ㊵)

| 지점 | 파일 | 작업 |
|---|---|---|
| ① FormState | `components/calc/inheritance/shared.ts` | `paymentInKindEnabled:boolean` / `paymentInKindIneligibleAmount:string` / `paymentInKindRequestedAmount:string` |
| ② INITIAL_FORM | `shared.ts` | `false` / `""` / `""` |
| ③ normalize | `shared.ts` | sessionStorage 호환 fallback(`?? false`/`?? ""`) |
| ⑤ 위젯 | `PaymentInKindInputSection.tsx` (신규) | Step4 끝, 연부연납 섹션 **아래**(sky tone) |
| ⑦ 결과 | `payment-in-kind/PaymentInKindCard.tsx`(신규) + `InheritanceTaxResultView` | 카드 + props 배선 |
| ⑧ validation | `InheritanceTaxForm` | `≥0`, 허용한도 초과 **경고(차단 아님)** |
| ㊵ 별지9호 | `FilingForm9CoverSection` | `paymentInKindAmount` prop(= `acceptedRequest`) + ㊵ 칸 렌더(현재 미렌더) |

> ④⑥⑨~⑭ 미해당(API 미경유·세액 불변). result echo 1필드는 엔진측(`.engine.design.md`).

---

## 2. 입력 — `PaymentInKindInputSection` (Step4 끝, sky ToggleCard)

```
┌ 물납 신청 (상증법 §73)  [ToggleCard sky]  ⊙────   ← paymentInKindEnabled
│  ⓘ 부동산·유가증권이 상속재산의 1/2 초과 + 납부세액 2천만원 초과 + 납부세액이
│     금융재산 초과 시 신청 가능. 결과 화면에 요건·허용한도·충당순서가 표시됩니다.
│  (ON 시 펼침 — 충당재산은 입력한 상속재산에서 자동 집계되어 결과 카드에 표시, 아래는 보정만)
│  (⚠️ Do 환류: 자동집계 정보카드는 입력 단계 평가액(result) 부재 → 결과 카드 PaymentInKindCard로 이관)
│  • 관리·처분 부적당 제외액 [CurrencyInput]   ← §71·§73③ paymentInKindIneligibleAmount
│     ⓘ 저당권 등 설정 부동산, 폐업·결손 법인 유가증권은 물납이 제한될 수 있습니다(§71).
│  • 희망 물납액 [CurrencyInput] (선택)        ← paymentInKindRequestedAmount
│     ⓘ 미입력 시 결과 화면에서 허용한도로 안내. 별지9호 ㊵ = min(희망, 한도).
└
```

규칙: `ToggleCard`(native 금지)·OFF도 sky tone 유지·`CurrencyInput`(`hideLabel`+`FieldCard` 라벨, `onFocus select`)·"원" 접미사 금지·placeholder 숫자 예시 금지(hint 한국어). 자동 집계 카드는 **읽기 전용 fallback prop**(store 미러링 금지 — `mirror-pattern`). 연부연납과 **배타 처리 안 함**(독립 토글 — 병행 가능 §70②, 본 범위는 일시납 물납).

---

## 3. 결과 — `PaymentInKindCard` (sky, 요건→한도→충당순서 3블록)

```
물납 안내 (상증법 §73)
부동산·유가증권 물납 — 요건·허용한도·충당순서
─────────────────────────────────────────────
[요건 충족]  (§73①)
 ✓ 부동산·유가증권 1,500,000,000 > 상속재산 1/2 (1,000,000,000)   (요건1 §73①1호)
 ✓ 납부세액 400,000,000 > 2천만원                                (요건2 §73①2호)
 ✓ 납부세액 400,000,000 > 금융재산 200,000,000                    (요건3 §73①3호)
 → 물납 신청 가능
─────────────────────────────────────────────
[물납 허용한도]  (§73①, 적은 금액)
 ① 부동산·유가증권 안분세액   300,000,000   (납부세액 × 충당가능 ÷ 상속재산가액)
 ② 납부세액−순금융−상장        150,000,000   (400,000,000 − 200,000,000 − 50,000,000)
 ▶ 허용한도 = min(①,②)        150,000,000
 · 비상장주식 별도한도(§73④)            0   (다른 재산으로 충당 가능, 기준=과세가액)
─────────────────────────────────────────────
[충당순서]  (§74②, 정당사유 없는 한)
 1 국채·공채            (해당 없음)
 2 상장유가증권(처분제한) 100,000,000
 3 국내 부동산          1,400,000,000
 4 그 밖의 유가증권      (해당 없음)
 5 비상장주식           200,000,000  ※ 최후순위·§73④ 한도·관리처분 부적당 주의
 6 상속인 거주 주택      100,000,000  ※ 최후순위
─────────────────────────────────────────────
※ 물납 신청은 상속세 신고기한까지(상속개시월 말일+6개월, 해외 9개월).
  저당권 등 설정 재산·폐업/결손 법인 유가증권은 관리·처분 부적당으로 불허될 수 있습니다(§71).
  실제 허가·수납가액은 관할 세무서 평가·세무사 확인 권장.
```

- 금액 칸 `text-right font-mono tabular-nums`(`amount-column-align`). "원" 접미사 금지·한국어 산식(`feedback_result_view_korean_formula`).
- 미충족 요건 ✗ + rose tone. `eligible:false`면 한도·충당순서 숨기고 미충족 사유만.
- 산출근거 ▼펼침(`formula-display-builder`) — 변수 배지(①②) + fine-print.
- 인쇄 자동 펼침 CSS-only(`print-only-css-toggle`), `PrintSection id="payment-in-kind"` — **`PrintSectionId` union 타입(`InheritanceTaxResultView` L45 import 원본 `shared/PrintSection`)에 `"payment-in-kind"` 추가** 필수 + 선택출력 레지스트리 등록(`project_selective_print_6tax_series`).
- 자산명 미표시(내부 id 노출 정책 해당 없음).

---

## 4. 폼 필드 정의 (`shared.ts`)

```ts
// FormState (연부연납 installmentEnabled 블록 인접)
paymentInKindEnabled: boolean;
paymentInKindIneligibleAmount: string;  // §71·§73③ 관리처분 부적당 제외(원)
paymentInKindRequestedAmount: string;   // 희망 물납액(원, 선택)
// INITIAL_FORM
paymentInKindEnabled: false,
paymentInKindIneligibleAmount: "",
paymentInKindRequestedAmount: "",
// normalize(sessionStorage): raw.paymentInKindEnabled ?? false / ?? ""
```

⑧ validateStep(Step4): `paymentInKindEnabled` ON 시 — `paymentInKindIneligibleAmount`·`paymentInKindRequestedAmount`는 `parseAmount`(`components/calc/inputs/CurrencyInput.tsx:22`) `≥ 0`(빈 문자열 허용). **허용한도 초과는 차단하지 않고** 결과 카드에서 경고(물납은 §73② 초과허가 여지). 자동 안분 fallback 금지(`feedback_no_silent_apportion_fallback`).

---

## 5. 결과뷰 배선 (`InheritanceTaxResultView` / `InheritanceTaxForm`)

```tsx
// InheritanceTaxForm → InheritanceTaxResultView 호출에 props 추가
paymentInKindEnabled={form.paymentInKindEnabled}
paymentInKindIneligibleAmount={parseAmount(form.paymentInKindIneligibleAmount)}
paymentInKindRequestedAmount={parseAmount(form.paymentInKindRequestedAmount)}
// InheritanceTaxResultView 내부
const pik = paymentInKindEnabled
  ? calcPaymentInKindAssessment({
      finalTax: result.finalTax,
      grossEstateValue: result.grossEstateValue,
      exemptAmount: result.exemptAmount,
      priorGiftToHeirTotal: result.priorGiftToHeirTotal ?? 0,   // ★echo
      taxableEstateValue: result.taxableEstateValue,
      assets: derivePaymentInKindAssets(estateItems, result, ineligibleAmount), // §7 헬퍼
      requestedAmount: paymentInKindRequestedAmount || undefined,
    })
  : null;
{pik && <PaymentInKindCard data={pik} decedentType={decedentType} />}
```

---

## 6. 별지 제9호서식 ㊵ 연결 (`FilingForm9CoverSection`)

- 현재 `filing-form-9-constants.ts:72` `"㊵":"물납"` 라벨만, 렌더 미사용. → ㊵ 칸 렌더 추가.
- props에 `paymentInKindAmount?: number`(= `pik.acceptedRequest` = min(희망, 허용한도)) 추가. 미입력/부적격 시 0.
- 납부방법 섹션 ㊵(물납)·㊶(분납)·㊷(신고납부) 라인에 ㊵ 금액 바인딩.

---

## 7. 데이터 소싱 (UI → 엔진 input) — `derivePaymentInKindAssets` 헬퍼

> 입력 `estateItems` = 결과뷰 전달분 **`[...form.estateItems, ...form.stockItems]`**(`InheritanceTaxForm` L498) — 상장·비상장주식이 `stockItems` 분리배열이므로 합친 목록으로 집계.

| input | 도출 | 가드 |
|---|---|---|
| `realEstateValue` | estateItems `buildSummaryCategory`==="realEstate" 합 | 국내 가정(확인⑤) |
| `unlistedStockValue` | `category==="unlisted_stock"` OR (stock ∧ `unlistedStockData`/`V2`) | buildSummaryCategory는 stock 통합(L22-23) → category+평가데이터 세분 |
| `tradableListedValue` | `category==="listed_stock"` OR (stock ∧ `listedStockCode`) − 처분제한분 | §73①2호 차감 |
| `eligibleSecuritiesValue` | 처분제한 상장 + 국채·공채 보정 입력 | 기본 0(확인②) |
| `netFinancialValue` | estateItems `financial` 카테고리 합 (⚠️ Do 환류: netFinancialAssets는 input측 필드) | 금융채무 차감 후속 |
| `heirResidenceValue` | 상속인 거주 주택·부수토지(담보채무 차감) | 자동판정 어려움 → 보정(확인⑦) |
| `ineligibleManagementValue` | `parseAmount(paymentInKindIneligibleAmount)` | NaN→0 |

> 헬퍼는 `lib/calc/` 또는 결과뷰 내 순수 함수. UI 재합산 금지·엔진/카테고리 헬퍼 import(`single-source-engine-helper`). 상세 → `.engine.design.md` §5.

---

## 8. UI 케이스 (E2E `e2e/inheritance-payment-in-kind.spec.ts`)

| ID | 시나리오 | 기대 |
|---|---|---|
| PIK-UI-1 | 물납 ON → 요건 충족 | 요건 3✓ + 허용한도 카드 표시 |
| PIK-UI-2 | 물납 ON → 요건 미충족(세액 2천만 이하) | rose 미충족 사유, 한도 숨김 |
| PIK-UI-3 | 희망액 > 한도 | ㊵ = 허용한도, 초과 경고 amber |
| PIK-UI-4 | 관리처분 부적당 입력 | 분자·요건1 차감 반영 |
| PIK-UI-5 | 인쇄 | PrintSection 자동 펼침 |
