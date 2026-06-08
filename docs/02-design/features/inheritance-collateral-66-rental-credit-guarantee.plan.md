# §66 저당권 설정 재산 평가 — ㉱ 임대료환산가액 + ㉲ 신용보증기관 보증액 차감 계획서

> 작성 2026-06-08 · 대상: `lib/tax-engine/property-valuation.ts` `applyCollateralFloor` + 부동산 평가
> 교재 근거: 상속·증여세 교재 1650쪽 §66 "저당권 등이 설정된 재산 평가의 특례" 평가금액 적용순서 ②
> 상태: **Plan (Design·Do 전)**. 법령은 KoreanLaw 검증 완료, file:line 실측.

## 1. 목표 (교재 §66 ② 미반영 2건)

교재 §66 평가금액 적용순서:
- ① 시가 평가: `Max(㉮ 시가, ㉯ 특례가액=담보채권액)` — **현행 구현됨**
- ② 보충평가: `Max(㉰ 보충평가액, ㉱ 임대료환산가액, ㉲ 특례가액=담보채권액−신용보증보증액)` — **㉱·㉲ 미구현**

1. **㉱ 임대료환산가액** (법 §61⑤·시행령 §50⑦·시행규칙 §15의2): 사실상 임대 부동산은 보충평가액과 임대료환산가액 중 큰 금액.
2. **㉲ 신용보증기관 보증액 차감** (시행령 §63②): 저당권 설정 재산의 담보채권액에서 신용보증기관 보증액 차감.

## 2. 법령 검증 (KoreanLaw 축자 — 2026-06-08)

### ㉱ 임대료환산가액
- **법 §61⑤**: *"사실상 임대차계약이 체결되거나 임차권이 등기된 재산의 경우에는 임대료 등을 기준으로 … 평가한 가액과 제1항부터 제4항까지의 규정에 따라 평가한 가액 중 **큰 금액**을 그 재산의 가액으로 한다."*
- **시행령 §50⑦**: "임대료 등의 환산가액" 정의 (계산식은 법제처 API에서 이미지 저장 → 구조 텍스트 미확인, 율만 확인).
- **시행규칙 §15의2**: *"영 제50조제7항에서 '재정경제부령으로 정하는 율'이란 **100분의 12**를 말한다."* → 율 0.12 확정.
- **통설 산식**(율 12% 검증 + 구조는 실무 통설): **임대료환산가액 = (1년간 임대료 합계 ÷ 0.12) + 임대보증금**.
- ⚠️ **적용 범위**: 법 §61⑤은 "제1항부터 제4항까지(=보충적평가)와 비교" → **시가·감정가가 있으면(§60) 적용 안 됨**, 보충평가(method="standard_price") 케이스에서만 비교. 교재 ② 위치와 정합.

### ㉲ 신용보증기관 보증액 차감
- **시행령 §63② 둘째 문장**: *"… 당해 재산에 설정된 물적담보 외에 재정경제부령이 정하는 신용보증기관의 보증이 있는 경우에는 **담보하는 채권액에서 당해 신용보증기관이 보증한 금액을 차감한 가액**으로 하며 …"*
- **적용 대상**: **법 §66제1호 재산(저당권·동산채권담보권·질권)에 한정** — 전세권·임대보증금(§66 3호)에는 미적용.
- **근저당 채권최고액**(§63② 첫째 문장): *"근저당의 채권최고액이 담보하는 채권액보다 적은 경우에는 채권최고액으로 하고"* — 별도 처리(D-4).
- **§66 범위 4호**: 1호 저당·동산채권·질권 / 2호 양도담보 / 3호 전세권·임대보증금 / 4호 담보신탁(2018.12.31 신설).

## 3. 현행 구현 실측

| 항목 | 현재 | 위치 |
|---|---|---|
| §66 MAX | `Math.max(amount, securedClaim)` | `property-valuation.ts:88 applyCollateralFloor` |
| 담보채권액 | `mortgageAmount + leaseDeposit` | 같은 함수 :85 |
| `convertLeaseToValue(deposit)=deposit/0.12` | **별도 함수 — "임대수익 자본환원용"**(test T8: 1억→8.33억). §61⑤ 임대료환산(월세×12÷0.12+보증금)과 **다른 산식·용도** → **정정 금지, 보존**. 본 작업은 별도 신규 헬퍼 | :39, test:120 |
| applyCollateralFloor 호출처 | **4곳** evaluateLand:115·Apartment:148·DetachedHouse:186·Building:218 — 모두 직전 `const {amount, method}` 보유 → method 전달 가능 | :115·148·186·218 |
| 월세/연임대료 필드 | **없음** | EstateItem |
| 신용보증 필드 | **없음** | EstateItem |
| §66 범위 입력 | `mortgageAmount`(저당 등 통칭) + `leaseDeposit` 2칸 (양도담보·질권·신탁 미구분, 금액 합산 동일 → numeric 무해) | — |

## 4. ⚠️ 선결 설계 결정 (Design 확정)

- **D-1 임대료환산 적용 범위**: method="standard_price"(보충평가)일 때만 `amount = max(standardPrice, 임대료환산가액)`. 시가·감정가·매매사례 채택 시 ㉱ 미적용(법 §61⑤·교재 ① 정합). **확정 방향**.
- **D-2 임대료 입력 단위**: 월세(`monthlyRent`) 입력 → 엔진에서 `×12` 후 `÷0.12`. or 연임대료(`annualRent`) 직접. **권장: 월세 입력**(실무 익숙) → 산식 `(monthlyRent × 12 ÷ 0.12) + leaseDeposit`.
- **D-3 신용보증 차감 대상**: §66제1호 한정 → `mortgageAmount`(저당분)에서만 `creditGuaranteeAmount` 차감. `leaseDeposit`(전세)엔 미적용. 차감 후 음수 방지(`max(0, mortgage − guarantee)`).
- **D-4 근저당 채권최고액**: §63② "채권최고액 < 담보채권액 → 채권최고액". 현행 `mortgageAmount`="실제 채무 잔액" 입력. 채권최고액 별도 입력칸 추가 여부 — **본 계획 범위 제외 권장**(실무는 채권 잔액 입력으로 충분, 채권최고액 비교는 후속). Design 확정.
- **D-5 임대료환산 vs 담보채권액 동시**: 교재 ②는 3자 Max. `max(standardPrice, 임대료환산, 담보채권액−신용보증)`. 구현 순서: ㉱로 amount 보정 → ㉲로 securedClaim 보정 → max.

## 5. 변경 설계 (초안)

### 5-1. 신규 필드 (EstateItem)
```ts
/** 월 임대료 (원) — §61⑤ 임대료환산가액 (월세×12÷0.12 + 임대보증금). 보충평가 시만 비교. */
monthlyRent?: number;
/** 신용보증기관 보증액 (원) — §66·시행령 §63② 저당 담보채권액에서 차감(§66 1호 한정). */
creditGuaranteeAmount?: number;
```

### 5-2. 엔진 (`applyCollateralFloor` 시그니처 +method)
```ts
// ㉱ 신규 헬퍼 (convertLeaseToValue와 별개 — §61⑤·시행규칙 §15의2)
function calcRentalConversionValue(item: EstateItem): number {
  const monthly = item.monthlyRent ?? 0;
  if (monthly <= 0) return 0;
  return Math.floor((monthly * 12) / 0.12) + (item.leaseDeposit ?? 0);
}

function applyCollateralFloor(amount, item, method) {  // ← method 인자 신규
  // ㉱ 임대료환산가액 — 보충평가(standard_price) 케이스만 (§61⑤)
  let baseAmount = amount;
  if (method === "standard_price") {
    const rentalValue = calcRentalConversionValue(item);
    if (rentalValue > 0) baseAmount = Math.max(amount, rentalValue);
  }
  // ㉲ 신용보증 차감 — 저당분(§66 1호)에서만 (시행령 §63②)
  const mortgageNet = Math.max(0, (item.mortgageAmount ?? 0) - (item.creditGuaranteeAmount ?? 0));
  const securedClaim = mortgageNet + (item.leaseDeposit ?? 0);
  const valuatedAmount = Math.max(baseAmount, securedClaim);
  return { valuatedAmount, securedClaim, raised: valuatedAmount > amount };
}
```
- **호출처 4곳**(evaluateLand:115·Apartment:148·DetachedHouse:186·Building:218) → `applyCollateralFloor(amount, item, method)`로 3인자 전달(method 변수 이미 보유).
- **`convertLeaseToValue` 정정 금지** — "임대수익 자본환원용" 별도 함수·test T8 보존. ㉱는 `calcRentalConversionValue` 신규.

### 5-3. UI (담보·임대 섹션 `CollateralLeaseFields`)
- 월 임대료 입력칸 (apartment·building, leaseDeposit 인접) — "월 임대료 (원) — 임대 부동산 §61⑤ 환산 비교용"
- 신용보증기관 보증액 입력칸 (저당권 칸 인접) — "신용보증기관 보증액 (원) — 저당 담보채권액에서 차감 §63②"

## 6. 14개 동기화 지점
①폼 EstateItem ②initial(optional) ③normalize(number 무관) ④API passthrough(자동) ⑤UI 2칸 ⑥사이드바(computeEffectiveValuation §66 미반영 현행 — 확인) ⑦결과(EstimatedValuePreview·breakdown 산식) ⑧Zod baseItemSchema 2필드 추가 ⑨⑩ enum 무관 ⑪N/A ⑫Zod ⑬passthrough ⑭number(Date 무관).
- ⚠️ **H2~H4 dual-truth 실측(STEP1 #3·STEP3 #5)**: `computeEffectiveValuation`(H2, 사이드바 합계)는 §66 담보 하한·임대료환산 **전부 미반영**이 **기존 동작**(explicit/주식만 반환). `EstimatedValuePreview`(H3)는 §66 securedClaim max만 표시(엔진 `valuatedAmount` 미사용·자체 if-chain).
  - **결정(dual-truth 악화 방지)**: ㉱·㉲는 **엔진 `applyCollateralFloor`(단일 진실)에만** 반영. **결과 표 평가금액 열은 `resolveEngineValuatedAmount`(엔진 결과) 사용**이므로 자동 정확. H2(사이드바)는 §66 미반영 기존 동작 **유지**(평가 전 추정값). H3 미리보기는 §66 securedClaim 표시 **유지**, 임대료환산·신용보증 표시는 **최소(또는 후속)** — H3 자체계산에 4번째 분기 추가 금지(메모리 dual-truth 교훈). H4 동일.

## 7. Pre-Do anchor
- **CR-RENT-01**: 보충평가 1억 + 월세 100만 + 보증금 5천만 → 임대료환산 (1,200만÷0.12=1억)+5천만=1.5억 → max(1억, 1.5억)=1.5억.
- **CR-RENT-02**: 시가 2억 + 월세 100만(보충평가 아님) → 임대료환산 미적용, 평가액 2억.
- **CR-GUAR-01**: 보충평가 3억 + 저당 2억 + 신용보증 1.2억 → mortgageNet=8천만 → max(3억, 8천만)=3억(담보 하한 미발동).
- **CR-GUAR-02**: 보충평가 1억 + 저당 2억 + 신용보증 1.2억 → mortgageNet=8천만 → max(1억, 8천만)=1억.
- **CR-66-REG (회귀)**: 신규 필드 미입력 → 기존 §66 동작 불변(max(평가, 저당+임대보증금)).
- anchor는 `evaluateLand(item)`/`evaluateApartment(item)` 호출 — method는 함수 내부 `resolveValuationAmount`에서 도출되므로 `applyCollateralFloor` 3인자 시그니처 변경과 무관(테스트 코드 수정 불요).

## 8. 리스크
- ㉱ 적용 범위(보충평가 한정) 오구현 시 시가 케이스 과대평가 — D-1 anchor 필수.
- `convertLeaseToValue` 산식 정정이 다른 사용처에 영향 없는지 grep.
- 신용보증 차감 음수 가드.
- §63② 근저당 채권최고액(D-4)은 범위 제외 — 계획서 명시(silent 누락 금지).
- 다주택·여러 채권 담보(§63② 셋째 문장 합계) 케이스 — 본 계획 단일 채권 가정.

## 9. 다음 단계
1. 승인 → `inheritance-gift-tax-senior` + UI senior Plan 병렬.
2. Design: D-1~D-5 확정 + §50⑦ 산식 구조 재확인(이미지 미렌더 → 시행규칙·실무 통설 교차) + 케이스 매트릭스.
3. Pre-Do anchor(§7) → Do(엔진 → UI) → Check(14지점·gap-detector) → 13단계 자가검토.
