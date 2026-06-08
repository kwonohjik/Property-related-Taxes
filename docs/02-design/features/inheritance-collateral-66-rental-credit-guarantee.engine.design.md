# 엔진설계 — §66 ㉱ 임대료환산가액 + ㉲ 신용보증기관 보증액 차감

> 상위: `inheritance-collateral-66-rental-credit-guarantee.plan.md` (법령 KoreanLaw 검증 완료)
> 본 문서: 타입·알고리즘·케이스·anchor. UI는 `.ui.design.md` 별도.
> file:line 실측(13단계 STEP1~4).

## 1. 케이스 인벤토리 (전수 enumerate)

표기 단위 억/만원. `method`=resolveValuationMethod. 임대료환산 = `(monthlyRent×12÷0.12)+leaseDeposit` (보충평가 시만). securedClaim = `max(0, mortgage−creditGuarantee) + leaseDeposit`.

| ID | method | std | 월세 | 보증금 | 저당 | 신용보증 | 임대료환산 | baseAmount | securedClaim | **평가액** |
|---|---|---|---|---|---|---|---|---|---|---|
| CR-C1 보충+월세 | standard_price | 1억 | 100만 | 5천만 | – | – | 1.5억 | max(1억,1.5억)=1.5억 | 5천만 | **1.5억** |
| CR-C2 시가+월세 | market_value | – | 100만 | 5천만 | – | – | (미적용) | 2억(시가) | 5천만 | **2억** |
| CR-C3 보충+저당+보증 | standard_price | 3억 | – | – | 2억 | 1.2억 | – | 3억 | mortgageNet 8천만 | **3억** |
| CR-C4 보충(저<평)+저당+보증 | standard_price | 1억 | – | – | 2억 | 1.2억 | – | 1억 | 8천만 | **1억** |
| CR-C5 신용보증>저당 | standard_price | 1억 | – | – | 1억 | 1.5억 | – | 1억 | max(0,1억−1.5억)=0 | **1억** |
| CR-C6 전부 | standard_price | 1억 | 100만 | 5천만 | 2억 | 1.2억 | 1.5억 | 1.5억 | 8천만+5천만=1.3억 | **1.5억** |
| CR-C7 회귀(신규0) | standard_price | 1억 | – | – | 2억 | – | – | 1억 | 2억 | **2억** |
| CR-C8 시가+저당+보증 | market_value | – | – | – | 2억 | 1.2억 | (미적용) | 2억(시가) | 8천만 | **2억** |

- CR-C1: 월세 100만 → 연 1,200만 ÷0.12 = 1억 + 보증금 5천만 = 1.5억. (§61⑤)
- CR-C2/C8: 시가 채택 → 임대료환산 미적용(법 §61⑤은 보충평가와 비교), 신용보증 차감은 적용되나 securedClaim<시가라 무발동.
- CR-C5: 신용보증>저당 → mortgageNet 음수 가드 0.

## 2. 타입 (EstateItem)

```ts
/** 월 임대료 (원) — §61⑤·시행규칙 §15의2: 임대료환산가액=(월세×12÷0.12)+임대보증금. 보충평가(standard_price) 시만 비교. */
monthlyRent?: number;
/** 신용보증기관 보증액 (원) — 시행령 §63②: 저당 담보채권액에서 차감(§66 1호 한정, 음수 가드). */
creditGuaranteeAmount?: number;
```

## 3. 알고리즘 (`property-valuation.ts`)

### 3-1. 신규 헬퍼 (convertLeaseToValue와 별개 — :39 보존)
```ts
/** §61⑤ 임대료환산가액 — 시행규칙 §15의2 율 0.12. 월세×12÷0.12 + 임대보증금. */
function calcRentalConversionValue(item: EstateItem): number {
  const monthly = item.monthlyRent ?? 0;
  if (monthly <= 0) return 0;
  return Math.floor((monthly * 12) / 0.12) + (item.leaseDeposit ?? 0);
}
```

### 3-2. `applyCollateralFloor` +method (3인자)
```ts
function applyCollateralFloor(amount: number, item: EstateItem, method: ValuationMethod):
  { valuatedAmount; securedClaim; rentalRaised; raised } {
  // ㉱ 임대료환산 — 보충평가만 (§61⑤)
  let baseAmount = amount;
  let rentalRaised = false;
  if (method === "standard_price") {
    const rv = calcRentalConversionValue(item);
    if (rv > amount) { baseAmount = rv; rentalRaised = true; }
  }
  // ㉲ 신용보증 차감 — 저당분만 (§63②)
  const mortgageNet = Math.max(0, (item.mortgageAmount ?? 0) - (item.creditGuaranteeAmount ?? 0));
  const securedClaim = mortgageNet + (item.leaseDeposit ?? 0);
  const valuatedAmount = Math.max(baseAmount, securedClaim);
  return { valuatedAmount, securedClaim, rentalRaised, raised: valuatedAmount > baseAmount };
}
```

### 3-3. 호출처 4곳 (method 전달 + 구조분해 갱신)
`evaluateLand:115`·`evaluateApartment:148`·`evaluateDetachedHouse:186`·`evaluateBuilding:218`:
- `applyCollateralFloor(amount, item, method)` 3인자 호출 (직전 `const {amount, method}` 보유).
- 구조분해 `const { valuatedAmount, securedClaim, raised, rentalRaised } = ...` — **4곳 모두 `rentalRaised` 추가**.
- 각 함수의 `breakdown` 배열에 조건부 행 삽입(아래 §3-4) — **4곳 동일 패턴**(헬퍼화 고려).

### 3-4. breakdown/warnings (4곳 공통)
- `rentalRaised` 시: `{ label: "§61⑤ 임대료환산가액 적용", amount: valuatedAmount, lawRef: VALUATION.RENTAL_CONVERSION }` (lawRef 상수 신설 필요 — legal-codes 확인).
- `creditGuaranteeAmount > 0` 시: `{ label: "§63② 신용보증액 차감", amount: -creditGuaranteeAmount }`.
- 기존 `§66 담보채권액 하한 적용` 행은 `raised` 기준 유지.
- ✅ **lawRef 상수 실측(STEP8 #9)**: `VALUATION.COLLATERAL_SPECIAL`(§66, `legal-codes/inheritance-gift.ts:185`)·`REAL_ESTATE_SUPP`(§61, :123) **존재**. **`RENTAL_CONVERSION` 부재 → 신설** `:123 인접에 RENTAL_CONVERSION: "상증법 §61⑤"`. 신용보증 차감은 §63② → `COLLATERAL_SPECIAL` 재사용 가능(별 상수 불요).

## 4. dual-truth (계획 §6 결정)
- **단일 진실 = `applyCollateralFloor`(엔진)**. 결과 표 평가금액 열 `resolveEngineValuatedAmount` 경유 → 자동 정확.
- H2 `computeEffectiveValuation`(사이드바): §66 미반영 기존 동작 **유지**(평가 전 추정).
- H3 `EstimatedValuePreview`: §66 securedClaim 표시 유지, 임대료환산·신용보증 표시 **최소/후속**(자체계산 4분기 추가 금지).

## 5. 동기화 지점 (14)
①폼 EstateItem ②initial optional ③normalize(number 무관) ④API passthrough(자동) ⑤UI 2칸(월세·신용보증) ⑥사이드바 H2 미반영 유지 ⑦결과 평가금액열(엔진)·breakdown 산식 ⑧Zod baseItemSchema 2필드 ⑨⑩ enum 무관 ⑪N/A ⑫Zod ⑬passthrough ⑭number(Date 무관).

## 6. Anchor (§7 계획 + 케이스)
- CR-RENT-01(=CR-C1)·CR-RENT-02(=CR-C2)·CR-GUAR-01(=CR-C3)·CR-GUAR-02(=CR-C4)·CR-GUAR-03(=CR-C5 음수가드)·CR-C6 전부·CR-66-REG(=CR-C7)·CR-C8.
- `convertLeaseToValue` test T8 불변(보존 확인).

## 7. 리스크
- ㉱ 보충평가 한정(method 게이트) — 시가 케이스 과대평가 방지(CR-C2·C8 anchor).
- 신용보증 음수 가드(CR-C5).
- 근저당 채권최고액(§63② 첫문장)·다채권 합계(셋째 문장)·신탁(§66 4호) — 본 작업 범위 제외(계획 D-4 명시).
- gift 공유(estateItemSchema) → 증여도 동일 반영.
