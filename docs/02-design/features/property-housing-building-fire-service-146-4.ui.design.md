# 재산세 주택 건축물분 소방분 (§146④ 단서) — UI 설계

> 엔진 설계: `property-housing-building-fire-service-146-4.engine.design.md`
> UI 동기화: 재산세 8지점(`components/calc/property/shared.ts` 집약 + Zod)
> 담당: `property-tax-ui-senior`

## 1. 사용자 시나리오

1. 물건 유형 **주택** 선택 → 공시가격(주택공시가격=토지+건물) 입력.
2. 기존 직전연도 공시가격(§110③) 입력란 인근에 신규 **"주택 건축물 부분 시가표준액"** 입력란 노출(주택 한정).
3. 미입력 가능 — hint: "재산세 고지서·주택가격 공시의 건물분 가액. 입력 시 건물분 소방분(지역자원시설세) 산출. 미입력 시 미산출."
4. 계산 → 결과 부가세 섹션에 주택 소방분 행(과세표준 = 건물분 × 공정시장가액비율) 표시.

## 2. 동기화 지점 매핑 (8 + Zod)

| # | 지점 | 파일·위치 | 작업 |
|---|---|---|---|
| ① | FormState | `property/shared.ts` | `housingBuildingValue: string;` |
| ② | INITIAL_FORM | 동상 | `housingBuildingValue: "",` |
| ③ | normalize | **해당 없음**(component-local) |
| ④ | API 변환 | 동상 `buildPropertyTaxRequestBody` | housing + 값>0 시 `body.housingBuildingValue = parseAmount(...)` |
| ⑤ | UI 위젯 | `property/Step0.tsx`(priorYearPublishedPrice 블록 직후, housing 게이트) | `CurrencyInput` |
| ⑥ | 사이드바 | **해당 없음** |
| ⑦ | 결과 카드 | `results/PropertyTaxResultView.tsx`(소방분 행) | housing 소방분 행 추가(과세표준 = 건물분 × FMR note) |
| ⑧ | Validation | `property/shared.ts` validateStep | optional·입력 시 숫자 검증만(미입력 통과) |
| ⑫ | Zod | `lib/validators/property-input.ts` | `housingBuildingValue: z.number().int().nonnegative().optional()` + housing 외 refine |

## 3. ⑤ 입력 위젯 (Step0.tsx — 주택 분기)

**배치**: 기존 직전연도 공시가격(§110③) 블록(`{form.objectType === "housing" && (...)}`, Step0.tsx:116-135) **직후 별도 housing-게이트 블록**.

```
┌─ 주택 (form.objectType === "housing") ───────────────┐
│ [공시가격]   StandardPriceInput (토지+건물 통합)  (기존)│
│ [직전연도 공시가격]  ___________ 원  §110③       (기존) │
│ ── 신규 ──────────────────────────────────────       │
│ [주택 건축물 부분 시가표준액]  ___________ 원 (선택)     │
│   hint: "재산세 고지서·주택가격 공시의 건물분 가액.     │
│          입력 시 건물분 소방분(지역자원시설세) 산출.    │
│          미입력 시 미산출."                            │
│ [1세대1주택 특례]  ◗ ToggleCard                 (기존) │
└──────────────────────────────────────────────────────┘
```
- `CurrencyInput` + `parseAmount`(원 정수). **`DecimalInput` 아님**.
- `form.housingBuildingValue` 직접 read + `onChange({ housingBuildingValue: v })`(priorYear와 동일 패턴 — prop threading 불요).
- hint는 한국어(placeholder 숫자 예시 금지). 노출 게이트 `form.objectType === "housing"`.

## 4. ⑦ 결과 카드 (PropertyTaxResultView.tsx 소방분 행)

현행 소방분 행은 `fireHazardMultiplier`(building 중과) / else(building 일반) 2분기. **housing 분기 추가** — `surtax.housingFireServiceTaxBase != null`:
```tsx
{surtax.regionalResourceTax > 0 &&
  (surtax.fireHazardMultiplier ? (
    /* 기존: building 화재위험 중과 분해 */
  ) : surtax.housingFireServiceTaxBase != null ? (
    <TaxRow
      label="지역자원시설세 (주택 건물분, §146④ 단서)"
      amount={surtax.regionalResourceTax}
      note={`소방분 과세표준 ${surtax.housingFireServiceTaxBase.toLocaleString()} = 건물분 × 공정시장가액비율 ${formatRate(fairMarketRatio)}`}
      sub
    />
  ) : (
    /* 기존: building 일반 지역자원시설세 */
  ))}
```
- `fairMarketRatio`·`formatRate` 결과뷰 가용(실측: `PropertyTaxResultView.tsx:76` 구조분해·`:29` 정의) — 추가 echo·import 불요.
- housing은 `fireHazardMultiplier` 항상 undefined(엔진 게이트) → 첫 분기 미진입, housing 분기로.
- TaxRow `amount` 셀은 `text-right font-mono tabular-nums`(기존 컨벤션). **note의 과세표준(원) 인라인은 free text** — amount-column-align은 amount 셀 한정이므로 note 표기는 무관.

## 5. ⑫ Zod refine (property-input.ts)

`isOneHousehold`/`priorYearPublishedPrice` housing-게이트 패턴 차용:
```ts
housingBuildingValue: z.number().int().nonnegative().optional(),
// superRefine:
if (data.housingBuildingValue != null && data.objectType !== "housing") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["housingBuildingValue"],
    message: "housingBuildingValue는 objectType이 'housing'일 때만 적용됩니다.",
  });
}
```

## 6. ④ API 변환 / ⑧ Validation (shared.ts)

```ts
// buildPropertyTaxRequestBody — housing + 값>0 만 전송 (priorYearPublishedPrice 패턴)
if (form.objectType === "housing") {
  const v = parseAmount(form.housingBuildingValue);
  if (v !== null && v > 0) body.housingBuildingValue = v;
}
```
```ts
// validateStep step 0 — optional, 미입력 통과
if (form.objectType === "housing" && form.housingBuildingValue &&
    parseAmount(form.housingBuildingValue) === null)
  return "주택 건축물 부분 시가표준액을 올바른 금액으로 입력하세요.";
```
- 3중 패턴: UI 미입력 = API 미전송 = 엔진 미산출(0) 일치(모순 0).

## 7. E2E (Playwright)

`e2e/property-housing-building-fire.spec.ts`:
- **E2E-1**: 주택 + 건물분 1.5억 → 결과 "주택 건물분, §146④ 단서" 행 + 소방분 표시.
- **E2E-2**: 주택 + 건물분 미입력 → 소방분 행 미표시.
- **E2E-3**: 건축물 선택 → "주택 건축물 부분" 입력란 미노출.
- Network body `housingBuildingValue` 도달 확인.

## 8. 체크리스트 (DoD)

- [ ] ①②④⑤⑦⑧⑫ 동기화 (③⑥⑭ 해당없음/자동)
- [ ] `CurrencyInput`+`parseAmount`(금액)·hint 한국어
- [ ] 주택 한정 노출 게이트(`objectType === "housing"`)
- [ ] 결과 카드 housing 분기(`housingFireServiceTaxBase != null`) + FMR note
- [ ] UI통과↔validate 모순 0 (미입력 양쪽 통과)
- [ ] `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/property-tax.test.ts` 통과
- [ ] 브라우저/E2E: 주택→건물분 입력→Network body→결과 소방분 행
