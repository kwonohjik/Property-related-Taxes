# 재산세 주택 과세표준상한제 (§110③) — UI 설계

> 엔진 설계: `property-tax-base-cap-110-3.engine.design.md`
> UI 동기화 모델: 재산세 8지점 (`components/calc/property/shared.ts` 집약 + Zod)
> 담당: `property-tax-ui-senior`

## 1. 사용자 시나리오

1. 물건 유형 **주택** 선택 → 공시가격 입력 (기존).
2. 공시가격 직하에 신규 **"직전연도 공시가격(과세표준상한 계산용)"** 입력란 노출(주택 한정).
3. 미입력 가능 — hint: *"직전연도 공시가격을 입력하면 과세표준 급등분에 §110③ 상한(직전 과세표준 + 5%)이 적용됩니다. 미입력 시 상한 미적용."*
4. 계산 → 결과 화면에 상한 적용 시 "과세표준상한 적용" 카드 표시.

## 2. 동기화 지점 매핑 (8 + Zod)

| # | 지점 | 파일·위치 | 작업 |
|---|---|---|---|
| ① | FormState | `property/shared.ts:51` | `priorYearPublishedPrice: string;` 추가 |
| ② | INITIAL_FORM | `property/shared.ts:73` | `priorYearPublishedPrice: "",` |
| ③ | normalize | **해당 없음** — property는 component-local state, sessionStorage normalize 미사용 |
| ④ | API 변환 | `property/shared.ts:136` `buildPropertyTaxRequestBody` | housing + 값>0 시 `body.priorYearPublishedPrice = parseAmount(...)` |
| ⑤ | UI 위젯 | `property/Step0.tsx` (housing 블록, `publishedPrice` CurrencyInput 직하·`isOneHousehold` 토글 위) | `CurrencyInput` (주택 한정 조건부) |
| ⑥ | 사이드바 | **해당 없음**(실측 — 재산세 사이드바 없음) |
| ⑦ | 결과 카드 | `components/calc/results/PropertyTaxResultView.tsx` | 과세표준상한 산식 카드 |
| ⑧ | Validation | `property/shared.ts:99` `validateStep` | optional — 입력 시 숫자 검증만, 차단 없음 |
| ⑫ | Zod | `lib/validators/property-input.ts` | `priorYearPublishedPrice: z.number().nonnegative().optional()` + housing 외 refine |

## 3. ⑤ 입력 위젯 (Step0.tsx)

**실측 배치**: housing 공시가격은 `CurrencyInput`이 아닌 **`StandardPriceInput`**(Step0.tsx:88-99, 조회 연동)으로 렌더된다. 신규 필드는 **공시가격 블록 직후(line 113)·`1세대1주택` 토글(line 116) 직전**에 housing-게이트로 삽입.

```
┌─ 주택 (form.objectType === "housing") ───────────────┐
│ [공시가격]   StandardPriceInput (조회 연동)   (기존)     │
│ ── 신규 ──────────────────────────────────────       │
│ [직전연도 공시가격]   ___________ 원   (CurrencyInput)   │
│   hint: "직전연도 공시가격 입력 시 과세표준 급등분에      │
│          §110③ 상한(직전 과세표준 + 5%) 적용.           │
│          미입력 시 상한 미적용."                         │
│ [1세대1주택 특례]   ◗ ToggleCard      (기존)            │
└──────────────────────────────────────────────────────┘
```
- **배선(실측)**: `publishedPrice`는 별도 prop(`publishedPrice`/`onPublishedPriceChange`)으로 threading되지만, 신규 단순금액 필드는 **`form.priorYearPublishedPrice` 직접 read + `onChange({ priorYearPublishedPrice: v })`** (Step0의 `isOneHousehold`·`buildingType`와 동일 패턴). **신규 prop threading 불요.**
- `CurrencyInput` + `parseAmount` (원 정수). **`DecimalInput` 아님**(금액 필드).
- `hint`에 한국어 설명(placeholder 숫자 예시 금지 — CLAUDE.md 정책).
- 노출 조건: `form.objectType === "housing"` 만(기존 `isOneHousehold` 토글과 동일 게이트).
- 포커스 전체선택: `SelectOnFocusProvider` 전역 적용 → 개별 `onFocus` 불요.

## 4. ⑦ 결과 카드 (PropertyTaxResultView.tsx)

`result.taxBaseCapApplied === true` 일 때만 렌더(sky tone 카드):

```
┌─ 과세표준상한 적용 (지방세법 §110③) ──────────────────┐
│ 당해연도 과세표준         420,000,000                   │
│ 직전연도 과세표준 상당액   300,000,000                   │
│   (직전 공시가격 × 공정시장가액비율)                      │
│ 과세표준상한율 가산(5%)   + 21,000,000                  │
│ ─────────────────────────────────                     │
│ 과세표준상한액            321,000,000                   │
│ → 적용 과세표준 = min(당해, 상한액) = 321,000,000        │
└──────────────────────────────────────────────────────┘
```
- **가산분(+21,000,000) 역산(실측)**: `capIncrement`는 result 필드가 **아님**. UI에서 `taxBaseCapLimit − priorYearTaxBaseEquivalent`(321,000,000 − 300,000,000)로 역산 표시(`engine-formula-reverse-derive` 스킬·음수가드 불요 — 항상 ≥0). 나머지(`taxBaseBeforeCap`·`priorYearTaxBaseEquivalent`·`taxBaseCapLimit`)는 result 직접 필드.
- 금액 칸: `text-right font-mono tabular-nums` (천·백만 콤마 세로정렬 — `amount-column-align` 스킬·`BesshiRow` 재사용).
- 변수 약어·`floor()` 금지 — 한국어 풀어쓰기(`feedback_result_view_korean_formula`).
- `taxBaseCapApplied === false`(미적용·미입력)이면 카드 **비표시**(과세표준 그대로이므로 노이즈 방지).
- 단, 미입력 시 기존 과세표준 카드 하단 작은 안내: *"직전연도 공시가격 입력 시 과세표준상한(§110③) 적용 가능"* (선택, Low).

## 5. ⑫ Zod refine

`property-input.ts:126`의 `isOneHousehold` housing-게이트 refine 패턴 차용:
```ts
priorYearPublishedPrice: z.number().nonnegative().optional(),
// superRefine:
if (data.priorYearPublishedPrice != null && data.objectType !== "housing") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["priorYearPublishedPrice"],
    message: "priorYearPublishedPrice는 objectType이 'housing'일 때만 적용됩니다.",
  });
}
```

## 6. ⑧ Validation (shared.ts validateStep)

```ts
// step 0, housing 한정 — optional, 미입력 허용
if (form.priorYearPublishedPrice) {
  if (parseAmount(form.priorYearPublishedPrice) === null)
    return "직전연도 공시가격을 올바른 금액으로 입력하세요.";
}
```
- **미입력은 통과**(상한 미적용 = 정상). UI 통과 ↔ validate 차단 모순 금지(`feedback_validation_sync_8th_point`).
- API 변환(④)도 동일하게 "housing + 값>0"만 전송 → UI/API/validate 3중 fallback 일치.

## 7. E2E (Playwright)

`e2e/property-tax-base-cap.spec.ts` 신규:
- **E2E-1**: 주택 7억 + 직전 5억 입력 → 계산 → 결과에 "과세표준상한" 카드 + 과세표준 321,000,000 표시.
- **E2E-2**: 주택 7억 + 직전 미입력 → 상한 카드 **미표시** + 과세표준 420,000,000.
- **E2E-3**: 건축물 선택 → 직전연도 공시가격 입력란 **미노출**.
- Network 탭 request body에 `priorYearPublishedPrice` 도달 확인(수동 또는 spec).

## 8. 체크리스트 (DoD)

- [ ] ①②④⑤⑦⑧⑫ 동기화 (③⑥⑭ 해당없음/자동)
- [ ] `CurrencyInput`+`parseAmount`(금액) / `FieldCard` hint 한국어
- [ ] 주택 한정 노출 게이트(`objectType === "housing"`)
- [ ] 결과 카드 `taxBaseCapApplied` 게이트 + 금액 우측정렬 mono
- [ ] UI통과 ↔ validate 모순 0 (미입력 양쪽 통과)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/property/` 통과
- [ ] 브라우저(또는 E2E) 확인: 주택→직전입력→Network body→결과 카드
