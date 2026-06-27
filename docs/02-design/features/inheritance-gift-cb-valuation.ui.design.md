# 전환사채 등의 평가 — UI 설계

> 계획서 `inheritance-gift-cb-valuation.plan.md` §6 + 엔진설계 기반 UI 설계 (PDCA Design 산출물).
> 템플릿: #403 `EstateBodyReceivable` / 지상권 `EstateBodySuperficies`. 작성 2026-06-27.

## 1. 진입·디스패치
- 자산종류 선택: `estate-category-meta.ts CATEGORY_LABELS["convertible_bond"]="전환사채등"`, `GIFT_CATEGORIES`·`INHERITANCE_CATEGORIES`(상속·증여 공통 노출), `CategoryChangeDialog`.
- Body 디스패치: `EstateItemEditor.tsx VariantBody` switch(**실사용**) + `variants/index.ts pickBodyVariant`(exhaustive). 신규 `EstateBodyConvertibleBond`.
- root testid: `estate-body-variant-convertible-bond-${item.id}`.

## 2. 입력 폼 레이아웃 (위젯 바인딩) — 순서=엔진 로직순서

```
[1] 자산명                                         input  name
    증권 종류  RadioCardGroup  cb-security-type-${id}
       ○ 전환사채  ○ 신주인수권부사채  ○ 신주인수권증권  ○ 신주인수권증서

[2] 거래소 거래 여부  ToggleCard  cb-traded
  ON(A):
     2개월 거래실적  ToggleCard  cb-has-trade
       ON : [2개월 종가평균] CurrencyInput cb-2m-avg
            [최근일 최종시세] CurrencyInput cb-latest
       OFF: 평가방법  RadioCardGroup  cb-sub-mode
              ○ 매입분(§58①2호가): [매입가액] cb-purchase-price  [미수이자상당액] cb-accrued-to-base
              ○ 그 외(처분예상금액 §58①2호나): [처분예상금액] cb-disposal-expected
  OFF(B):
     [원금(액면총액)] CurrencyInput cb-principal          // = 발행가액(par)
     [표시 액면이자율 %] DecimalInput cb-coupon-rate
     [만기년수] DecimalInput cb-maturity
     상환할증조건  ToggleCard  cb-has-premium
        ON: [상환할증금] cb-redemption-premium
            [유효이자율 R %] DecimalInput cb-issue-rate    // 할증有만 (무할증=표시이자율 자동)

[3] 주식전환 가능 여부  ToggleCard  cb-convertible   (B 전용)
     발생이자상당액:  (auto-derive 읽기전용 표시)  cb-accrued-derived
        [직전 이자지급일] DateInput cb-interest-base-date
        [직접입력 override] CurrencyInput cb-accrued-override
     전환가능 ON:
        주식가액:
          가·나·다목: [전환·인수가능 주식가액] CurrencyInput cb-conv-share-value
          라목      : [권리락 전 가액] CurrencyInput cb-exrights-prior
                      [권리락 후 가액(상장단서)] CurrencyInput cb-exrights-post
        나·다·라목: [신주인수가액] CurrencyInput cb-subscription-price
        배당차액:  (auto-derive 읽기전용)  cb-dividend-derived
          [1주당 액면가액] cb-face-value  [직전기 배당률 %] cb-prior-dividend-rate
          [배당기산일] DateInput cb-dividend-base-date  [주식수] cb-share-count
          [직접입력 override] CurrencyInput cb-dividend-override

[4] 적정할인율 r  읽기전용 배지 (resolveCbDiscountRate(valuationDate))  cb-rate-badge
    ※ B(비거래소)에서만 노출 — A(거래소)는 할인율 무관
```

### 위젯 규칙
- 토글/라디오: `ToggleCard`/`RadioCardGroup` 필수(native select/radio 금지). OFF도 tone 유지.
- 발생이자·배당차액: **auto-derive 표시 + override**(ToggleCard 없음, superficies `superficiesRemainingYearsOverride` 패턴, useMemo — useEffect store 미러링 금지).
- DateInput(type=date 금지), CurrencyInput/DecimalInput, SelectOnFocus 전역.
- placeholder 숫자예시 금지 — 형식설명은 FieldCard `hint`.
- 라목 거래소: securityType=preemptive_right & cb-traded ON → "전체 거래일 종가평균"(cb-2m-avg 라벨을 라목에선 "전체일 평균"으로 분기 표시).

## 3. 가시성 (`asset-toggle-visibility.ts` MATRIX·CULTURAL_HERITAGE — Record 강제)
```
convertible_bond: { farming:"hidden_permanent", familyBusiness:"hidden_permanent",
                    financialDeduction: 잠정 "hidden_permanent"(receivable 선례), §9 §22적격 검증 후 "default" 전환 가능,
                    deemedRetirementOption:"visible" }
CULTURAL_HERITAGE_VISIBILITY.convertible_bond = "hidden_permanent"
```

## 4. 검증 (`estate-item-schema.ts convertibleBondItemSchema`)
- **cb* 全필드 1줄씩 등재**(누락=Zod 침묵 strip ⑫). discriminatedUnion에 추가. `COORD_INCOMPATIBLE`(배열)에 convertible_bond 추가.
- `superRefine` 분기별 필수입력 (계획 §5.1): A실적有→2mAvg·latest / A실적無purchase→purchase-price / A실적無disposal→disposal / B→principal·coupon·maturity(+할증→premium·issue-rate) / 전환가능 가→conv-share-value / 나→conv-share-value·subscription / 다→conv-share-value·subscription / 라→exrights-prior·subscription.
- 미입력 = validation 차단(자동 0 fallback 금지). **UI 통과 ↔ validate 차단 모순 금지**.

## 5. 사이드바 합계 (⑥)
`computeEffectiveValuation`→grossEstate 자동집계로 **무영향**(receivable 동일 경로, Do 시 확인). 0원 제외.

## 6. 결과 카드 (⑦) — 템플릿 실태 준수 (C#2)
- receivable·superficies처럼 **결과화면 산식카드 없이** 부표2 명세서 라인 + 카테고리 라벨("전환사채등")로 평가액 노출.
- `besshi-buppyo-2-data.ts`·`deduction-besshi-data.ts`(Record) + `inheritance-filing-form-helpers.ts ESTATE_ITEM_TYPE_CODE`(Record) 매핑.
- echo(발생이자·배당차액·PV(r)·발행가액·선택분기)는 엔진 `breakdown[]`로 전달 → 필요시 명세 표시.
- 금액 칸 `amount-column-align`(font-mono, tabular-nums).

### testid 규칙 (E2E 셀렉터 동결)
root `estate-body-variant-convertible-bond-${id}` + §2 inner testid 전부 동결.

## 7. E2E (`e2e/convertible-bond-valuation.spec.ts`) — 2 spec
- spec1: 비거래소 전환사채 전환금지 → 평가액 512,493,150 확인(폼→계산→결과).
- spec2: 비거래소 신주인수권부사채 전환가능 → 1,278,624,603(±2,000) 확인.
- 모달 안 자산명 입력(keepModalOpen)·ToggleCard=role=switch (메모리 `feedback_e2e_gift_modal_chip_switch_selectors`).

## 8. 동결 전 확인
§22 financialDeduction 적격(계획 §9.1)·라목 거래소 라벨 분기·배당차액 floor·노출조건 매트릭스 구현 일치. Do STEP 0/6에서 확인.
