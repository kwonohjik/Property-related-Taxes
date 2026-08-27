# 임대보증금 평가특례 — 미임대(공실) 부분 처리 구현 계획서

> 작성일: 2026-06-22 · 세목: **증여세 + 상속세 공용 엔진** · 영역: 부동산 평가(§61⑤·§60~§66)
> 출처: 교재 「임대보증금 평가특례가 적용되는 경우로서 미임대 부분이 있는 경우」(이미지 1~5)
> 검증 원칙: 인용 file:line·법령은 실측. 미확인은 "🔎 확인 필요" 표기(추정 금지).
> 선행: [`gift-commercial-building-appurtenant-land.plan.md`](./gift-commercial-building-appurtenant-land.plan.md)
> — 본 계획은 그 **경로 B(§61①2호 건물 + 1호 부수토지 분리)** 구조 위에 미임대분 처리를 얹는다.

---

## 0. 핵심 결론 (확정)

구분등기 안 된 1동 건물이 평가기준일 현재 **일부만 임대 중**일 때, 임대분과 미임대(공실)분을
구분 평가한다. **1차 근거는 실측 확정된 법령**(상증법 §61⑤ Max·시행령 §50⑦⑧·시행규칙 §15의2 율 12%,
§50⑧1호 소유자 동일 시 안분)이며, 1동 일부 임대 시 구분 평가는 교재가 인용한 해석례
**「사전법령해석재산2020-…, 2021.06.04.」**(⚠️ 일련번호 미상 — KoreanLaw `search_decisions`(interpretation·nts)
2회 NOT_FOUND, **교재 인용·미검증**)에 따른다. 산식 자체는 법령으로 보장되므로 해석례는 **보강 근거**.

```
평가액 = Max( 전체 기준시가,  임대분 환산가액 + 미임대분 기준시가 )       … (§66 담보채권 하한과도 Max)

임대분 환산가액   = (월 임대료 × 12 ÷ 12%) + 임대보증금                  … 기존 calcRentalConversionValue
미임대분 기준시가 = 미임대분 건물 기준시가(직접입력)
                  + 미임대분 토지 기준시가
미임대분 토지 기준시가 = 전체 토지 기준시가 × (미임대 건물 연면적 / 전체 건물 연면적)   … 면적 직접 안분
```

> **왜 Max 하나로 충분한가**: 교재 원문은 "임대부분 = Max(환산, 기준시가), 미임대부분 = 기준시가"이지만,
> 예제 UI는 「전체 기준시가」와 「임대분 환산 + 미임대분 기준시가」를 비교(Max)한다. 이 둘은
> **수학적으로 동일**하다 — 임대분 환산 < 임대분 기준시가이면 (임대분환산+미임대분기준) < 전체기준시가가
> 되어 전체 기준시가가 채택되고, 그 반대면 특례액이 채택된다. 따라서 별도 임대분/미임대분 기준시가
> 분해 없이 **단일 Max 비교**로 법령 결과가 보장된다.

### 입력 방식 — C안 확정 (사용자 결정 2026-06-22)

신규 입력은 **3필드만**. 미임대분 토지 기준시가는 이미 입력된 `appurtenantLandStandardPrice`(전체
부수토지, **선행 계획 머지 완료** — 타입 `inheritance-gift-estate.types.ts:63`·Zod `estate-item-schema.ts:32`·
엔진 `evaluateDetachedHouse`(`property-valuation.ts:240~242`)·6 dual-truth 사이트·전용 테스트
`appurtenant-land-61.test.ts`[AL-B1~AL-C1] 6건 전부 존재·동작)를 **면적 안분**하므로 별도 입력 불요.
즉 본 계획의 토지 안분 분모·경로 B 합산은 **이미 동작하는 코드 위에** 미임대분만 얹는다.

| 신규 입력 | 의미 | 교재 사례값 |
|---|---|---|
| `totalBuildingArea` | 전체 건물 연면적(㎡) | 720 |
| `vacantBuildingArea` | 미임대 건물 연면적(㎡) | 180 |
| `vacantBuildingStandardPrice` | 미임대분 건물 기준시가(원, 직접입력) | 75,600,000 |

> 미임대분 건물 기준시가를 직접 입력받는 이유: 건물 기준시가는 층별 위치지수·구조·용도에 따라
> 균등하지 않아(건물기준시가 계산서상 1층 90,720,000 ≠ 4층 75,600,000) 면적 단순 안분이 부정확.
> 사용자가 「건물기준시가 계산서」의 해당 층 값을 직접 입력한다. **토지 기준시가는 지번이 동일해
> ㎡단가가 균일**하므로 면적 안분이 정확(법령상 명시 안분, 이미지 5: `300×180/720=75㎡`).

### 적용 범위 — 상속세 + 증여세 공용 (사용자 결정)

엔진 `property-valuation.ts`는 상속·증여 공유 → 두 세목 모두 자동 반영. UI(`EstateBodyRealEstate.tsx`)도
`mode` 무관 노출. 상속 회귀(평가조서·stale E2E) 포함 검증.

---

## 1. 배경 — 현재 갭

현행 임대료환산은 **건물 전체 단일 비교**다:

- `calcRentalConversionValue(item)` (`property-valuation.ts:90~94`):
  `(monthlyRent × 12 ÷ 0.12) + leaseDeposit`. 미임대 개념 없음.
- `applyCollateralFloor(amount, item, method)` (`property-valuation.ts:104~124`):
  `method === "standard_price"`일 때 `if (rentalValue > amount)` 단순 비교 → `Max(전체기준시가, 환산, 담보)`.

**갭**: 일부만 임대된 건물에서 임대분 환산가액(임대 안 된 4층까지 포함한 보증금·임대료가 아니라
**임대분만의** 환산)을 전체 기준시가와 그냥 비교하면, 미임대분의 기준시가가 비교식에서 누락된다.
교재 사례에서 현행 엔진은 `Max(651,300,000, 700,000,000) = 700,000,000`을 내지만,
**정답은 858,100,000**(= 700,000,000 + 미임대분 158,100,000). 약 1.58억 과소평가.

> ⚠️ 전제: 본 특례는 **경로 B**(건물 기준시가 §61①2호 + 부수토지 개별공시지가 §61①1호 분리)에서
> 성립한다. 경로 A(§61①3호 일괄고시)는 토지+건물이 1개 가액이라 미임대분 토지 안분 분모(전체
> 부수토지 기준시가)가 분리돼 있지 않다. → **미임대 입력은 경로 B에서만 노출**(§3-1).

---

## 2. 법령 근거

| 근거 | 내용 | 검증 상태 |
|---|---|---|
| 상증법 §61⑤ | 임대 부동산 = Max(보충평가, 임대료환산가액) | ✅ 실측(MST 276123, 시행 2026-01-02). 경로 B(`appurtenantLandStandardPrice`)는 **머지 완료**(타입:63·Zod:32·엔진:240~242·테스트 6건) |
| 시행령 §50⑦ | 임대료환산율(연 12%) | ✅ `LEASE_CONVERSION_RATE = 0.12` (`property-valuation.ts:34`) |
| 시행규칙 §15의2 | 환산가액 = (월세×12÷12%)+보증금 | ✅ 코드 주석 인용 일치(`:86~88`) |
| 시행령 §50⑧1호 | 소유자 동일 시 임대료환산가액 면적 안분 | ✅ 실측(MST 283637) — 미임대분 토지 면적 안분의 직접 근거 |
| 「사전법령해석재산2020-…」(2021.06.04.) | 1동 일부 임대 시 임대분/미임대분 구분 평가 | ⚠️ **교재 인용·미검증** — KoreanLaw interpretation·nts 도메인 **2회 NOT_FOUND**(일련번호 미상). 산식 1차 근거는 위 법령으로 확정되어 있어 **보강 근거**로만 인용. Do 전 국세법령정보시스템에서 정확한 사건번호 확보 시 보정, 미확보 시 "교재 인용(미검증)" 표기 유지 |

> 법령 상수: `legal-codes/inheritance-gift.ts` `VALUATION.RENTAL_CONVERSION = "상증법 §61⑤"`(:165 인근)
> 이미 존재. 미임대분 라벨은 동일 §61⑤ 하위 — 신규 상수 불요(필요 시 주석 보강).

---

## 3. 설계 결정

### 3-1. UI — 경로 B 보충평가 내부, 미임대 토글 (⚠️ 컴포넌트 분리 실측 반영)

> 🔴 **must-fix(critical): 경로 B 상태가 두 컴포넌트에 분산되어 원안대로 구현 불가.**
> 선행 계획의 §61 경로 UI는 800줄 정책으로 이미 **`EstateBodySupplementaryValuation.tsx`로 분리**됨
> (`EstateBodyRealEstate.tsx:229~237`에서 호출). 실측:
> - 경로 B 상태 `separateLandMode`는 `EstateBodySupplementaryValuation.tsx`의 **local `useState`**
>   (`:72` = `(item.appurtenantLandStandardPrice ?? 0) > 0` derive)로만 존재 — 어디에도 리프트·영속되지
>   않아 형제 컴포넌트에서 접근 불가. 평가방식 §61 경로 라디오(`:94~111`)도 이 카드 내부에 있음.
> - `CollateralLeaseFields`(`EstateBodyRealEstate.tsx:492~`)는 props(`RealEstateAdvancedFieldsProps`
>   `:269~280`)에 `showLeaseDeposit`·`showCohabitToggle` 등만 받고 **`cat`도 경로 B 신호도 받지 않음**.
> - `showLeaseDeposit`은 apartment·building 양쪽 true(`:149~150`)라 **건물 한정 게이트가 아님**.

**구현 방식 — (c)안 확정 (✅ engine/ui 설계서와 단일화, 2026-06-22 자가검증 수렴).**

미임대 입력 그룹을 **`EstateBodySupplementaryValuation.tsx`의 경로 B 분리 블록(`:138~161`) 내부**에 배치한다.
경로 B 라디오·`separateLandMode`·부수토지 입력이 모두 이 카드에 있으므로, 미임대 입력을 같은 카드에 두면
경로 B 게이트·토지 안분 분모(`appurtenantLandStandardPrice`)에 동일 스코프에서 직접 접근 가능해
**cross-card 상태 분산·입력순서 결합(§3-4)을 근본 해소**한다. `monthlyRent`만 형제 카드
`CollateralLeaseFields`(`:563~564` write)에서 입력되므로 거기서 **read**(`item.monthlyRent`)하여
"임대 중(`monthlyRent > 0`)"을 게이트로 쓴다(동일 `item` 직접 read — `useEffect → store` 미러링 아님,
memory `feedback_useeffect_store_mirror_forbidden`).

> 폐기된 대안(이력): **(a) 상태 리프트**(`separateLandMode`를 `EstateBodyRealEstate`로 끌어올려 양쪽 prop
> 주입) — 형제 두 카드에 상태를 흩뿌려 §3-4 순서 결합이 남음. **(b) item 필드 derive**(`CollateralLeaseFields`에
> 경로 B 파생 주입) — 라디오 미선택(분리 OFF)과 어긋날 수 있고 분산 유지. → 둘 다 (c)보다 결합도 높아 폐기.

(c)안 배치 — 경로 B 블록 내, 부수토지 입력 직후 + `monthlyRent > 0`일 때 미임대 ToggleCard 노출
(tone=sky 면적·규모):

```
[ EstateBodySupplementaryValuation — 경로 B(건물+부수토지 분리) 블록 ]
   건물 기준시가          321,300,000  (StandardPriceInput, 기존)
   부수토지 개별공시지가    330,000,000  (StandardPriceInput, 기존 = appurtenantLandStandardPrice)
   [ 일부만 임대 중 (미임대 공실 있음) ]  ← ToggleCard, §61⑤ 배지 · monthlyRent>0 시에만 노출
      전체 건물 연면적        720 ㎡       (DecimalInput)
      미임대 건물 연면적      180 ㎡       (DecimalInput)
      미임대분 건물 기준시가  75,600,000   (CurrencyInput)
      └ 자동: 미임대분 토지 기준시가  82,500,000   (= 부수토지 330,000,000 × 180/720)
      └ 자동: 미임대분 기준시가 합계   158,100,000
```

- 면적은 **`DecimalInput` + `parseDecimal`**(㎡ 소수, CurrencyInput 금지 — memory `feedback_decimal_input`).
- 미임대분 건물 기준시가는 원(정수) → `CurrencyInput` + `parseAmount`.
- 자동 계산 박스는 sky tone 통일(`bg-sky-*/60 border-sky-*/200`), 산식 한국어 풀어쓰기.
- 토글 가시성: 경로 A(일괄고시, 라디오 분리 OFF) 또는 `monthlyRent = 0`이면 **숨김**(같은 카드라 경로 B
  ON 신호 직접 접근).
  - 🔎 "전부 미임대"(임대료 0, 전체가 공실) 케이스는 §3-4에서 별도 검토.

> 위젯 식별 정정 주의(선행 must-fix #4 교훈): 면적은 `LandPriceLookupField` 아님(공시지가 전용).
> 순수 면적 입력이므로 `DecimalInput`. 미임대분 건물 기준시가도 단가×면적이 아니라 **층별 고시액
> 직접입력**이므로 `StandardPriceInput`(area-mode) 아닌 `CurrencyInput`.

### 3-2. 엔진 — `applyCollateralFloor`에 미임대분 합산 (단일 지점)

`property-valuation.ts`에 헬퍼 추가 + `applyCollateralFloor` 비교식 1곳 수정:

```ts
/**
 * §61⑤·사전법령해석재산2020-(2021.06.04) — 1동 건물 일부 임대 시 미임대(공실)분 기준시가.
 * 미임대분 기준시가 = 미임대분 건물 기준시가(직접입력)
 *                   + 미임대분 토지 기준시가(= 전체 부수토지 기준시가 × 미임대건물면적/전체건물면적).
 * 토지는 면적 직접 안분(round 비율 곱 금지 — feedback_safemul_decimal_apportion_precision).
 * 미입력(면적 0) 시 0 반환 → 기존 단일 비교 동작 보존.
 */
function calcVacantPortionStandardPrice(item: EstateItem): number {
  const vacantArea = item.vacantBuildingArea ?? 0;
  const totalArea = item.totalBuildingArea ?? 0;
  if (vacantArea <= 0 || totalArea <= 0) return 0;
  const vacantBuildingStd = item.vacantBuildingStandardPrice ?? 0;
  const totalLandStd = item.appurtenantLandStandardPrice ?? 0;
  const vacantLandStd = Math.floor(safeMultiply(totalLandStd, vacantArea) / totalArea);
  return vacantBuildingStd + vacantLandStd;
}
```

`applyCollateralFloor`(`:112~118`) 수정:

```ts
if (method === "standard_price") {
  const rentalValue = calcRentalConversionValue(item);
  if (rentalValue > 0) {
    const vacantStd = calcVacantPortionStandardPrice(item);   // 미임대분 0이면 기존과 동일
    const specialValue = rentalValue + vacantStd;
    if (specialValue > amount) {
      baseAmount = specialValue;
      rentalRaised = true;
    }
  }
}
```

- `amount`는 경로 B 합산값(`standardPrice + appurtenantLandStandardPrice`, 선행 계획에서
  `evaluateDetachedHouse`가 이미 합산해 넘김) → 본 비교가 곧 **Max(전체기준시가, 특례액)**.
- 미임대 미입력 시 `vacantStd = 0` → `specialValue = rentalValue` → **완전한 하위호환**.
- §66 담보채권 하한(`securedClaim`)과의 외곽 `Math.max`(`:122`)는 무변경.

### 3-3. 결과뷰 — breakdown 행 보강

`extraCollateralRows`(`property-valuation.ts:127~141`) — `rentalRaised`일 때 현재 "§61⑤ 임대료환산가액
적용" 1행. 미임대분이 있으면 **분해 2~3행**으로 교체:

```
§61⑤ 임대료환산가액 (임대분)          700,000,000
미임대분 건물 기준시가                  75,600,000
미임대분 토지 기준시가 (면적안분)        82,500,000
임대보증금 평가특례 합계               858,100,000   ← 채택
```

산식은 한국어 풀어쓰기(memory `feedback_result_view_korean_formula`), 금액 칸 정렬 스킬 적용.

### 3-4. 잔여 설계 검토 (Do 전 확정)

- 🔎 **"전부 미임대"(임대 없음, 전체 공실)**: 교재 범위는 "일부 임대". 전부 미임대면 임대료환산
  자체가 없어 전체 기준시가 평가 → 현행으로 충분. UI 토글은 `monthlyRent > 0` 게이트로 차단.
- 🔎 **`vacantBuildingArea > totalBuildingArea`** 등 모순 입력 → validation 차단(§4 ⑧).
- 🔎 **경로 A에서 미임대 입력 시도**: 토글 자체를 경로 B에서만 노출(§3-1)로 원천 차단. 추가로
  엔진 `appurtenantLandStandardPrice = 0`이면 미임대분 토지 = 0이 되어 안전(건물분만 반영).
- ✅ **cross-card 입력 순서 결합 — (c)안으로 해소(§3-1)**: 미임대분 토지 안분 분모
  `appurtenantLandStandardPrice` 입력과 미임대 입력이 **같은 카드(`EstateBodySupplementaryValuation.tsx`
  경로 B 블록)** 안에 함께 있으므로, 부수토지 입력이 미임대 입력보다 위에 위치해 순서 결합이 구조적으로
  해소된다. 그래도 사용자가 부수토지를 비운 채 미임대를 입력할 수 있으므로, `appurtenantLandStandardPrice = 0`
  + 미임대 입력 시 "부수토지 개별공시지가 미입력 — 미임대분 토지 안분 불가(건물분만 반영)" 안내를 ⑤(인라인)
  + ⑧(validation 경고)에 표시.

---

## 4. 동기화 지점 (CLAUDE.md 8지점 + Zod strip · 실측 경로)

신규 필드 3개: `totalBuildingArea`, `vacantBuildingArea`, `vacantBuildingStandardPrice` (모두 optional)

| # | 지점 | 파일·라인 | 변경 |
|---|---|---|---|
| ① | 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` (`appurtenantLandStandardPrice` :63 인접) | 3필드 `?: number` 추가 + JSDoc(§61⑤ 미임대) |
| **Zod** | **입력 스키마(침묵 strip 게이트)** | `lib/validators/estate-item-schema.ts` (`appurtenantLandStandardPrice` :32, baseItemSchema) | 3필드 `z.number().nonnegative().optional()` 추가 + roundtrip 테스트(`estate-item-schema-roundtrip.test.ts`) 갱신. **누락 시 silent strip** |
| ② | initial | `components/calc/PropertyValuationForm.tsx:130~143` | optional → 기본값 불요(undefined) |
| ③ | normalize | `lib/calc/category-change-policy.ts` 차단 필드 목록(:111) | building↔타 분류 전환 시 3필드 보존/정리 검토(건물 전용 필드라 land·deposit 전환 시 carry 차단) |
| ④ | API 변환 | 증여 `lib/calc/gift-api.ts` `buildGiftTaxInput`(giftItems `.map` spread) · 상속 `lib/calc/inheritance-api.ts:60~103`(estateItems spread/passthrough) | spread라 신규 optional 자동 생존. **Zod 통과가 진짜 게이트** |
| ⑤ | UI 위젯 | **(c)안 확정(§3-1)**: 미임대 입력을 `components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx` **경로 B 분리 블록(:138~161) 내부**에 배치. §61 경로 라디오·`separateLandMode`(:72·:94~111)가 같은 카드라 게이트 직접 접근. `monthlyRent`는 형제 `EstateBodyRealEstate.tsx` `CollateralLeaseFields`(:563~564 write)에서 입력 → 미임대 토글은 `item.monthlyRent` **read**로 게이트 | 미임대 ToggleCard + 3입력(DecimalInput×2·CurrencyInput×1) + 자동계산 박스(sky tone). 경로 B 신호 분산 해소(같은 카드) |
| ⑥ | 사이드바·평가액 직접읽기 | **실측 dual-truth 사이트(전수 enumerate 갱신)**: (1) `lib/calc/estate-item-valuation.ts` `computeEffectiveValuation`(:23~56) (2) `lib/tax-engine/valuation/resolve-estate-item-value.ts`(:134~149) (3) `components/calc/property-valuation-preview.tsx` `EstimatedValuePreview`(:17~, addon :40·Max :46) + `TotalEstimatedValue`(:92~, addon :114·Max :118). ⚠️ `lib/stores/inheritance-summary.ts`(:96~101)는 `computeEffectiveValuation` **위임**(단일소스)이라 별도 게이트 불요. `gift-burdened-transfer-api.ts:103~107`은 §159 양도 기준시가 안분(평가 표시 아님) → **미임대 특례 대상 아님** | 🔴 **선존 dual-truth(must-fix 인지)**: 위 3사이트 모두 §61⑤ 임대료환산 Max 자체가 **부재**(`calcRentalConversionValue`/`monthlyRent` 호출 0건 — grep 실측). appurtenant 합산 + `Math.max(base, securedClaim)`만 수행. → **미임대분만 복제 금지**(임대료환산 본체 없이 `totalStd+vacantStd` 같은 법령 부재값 위험·`feedback_ui_engine_dual_truth_avoidance` 위반). **사이드바는 엔진 권위값 단일 위임**으로 한정(§6 재정의·§9 Scope Out 참조) |
| ⑦ | 결과 카드 | `extraCollateralRows`(`property-valuation.ts:127`) breakdown + `InheritanceTaxResultView`·증여 결과뷰 | breakdown 2~3행 자동(§3-3). 평가조서/별지 양식 영향 🔎 확인 |
| ⑧ | validation | 증여 `components/calc/gift-tax-form-validate.ts` · 상속 `lib/calc/inheritance-validate.ts` | 모순 입력 차단: 미임대면적>전체면적, 면적 한쪽만 입력, 미임대분 건물기준시가 입력했는데 면적 0. `appurtenantLandStandardPrice=0`인데 미임대 입력 시 안내(토지 안분 불가, §3-4). **UI 통과↔validate 모순 금지** |

> ⑥ enumerate **완료**(위 표): 평가액을 독립 재구현하는 진짜 dual-truth = `computeEffectiveValuation` +
> `resolveEstateItemValue` + `property-valuation-preview.tsx` 2함수. `inheritance-summary.ts`는 위임(단일소스).
> `EstimatedValuePreview`는 `EstateItemAdvancedPanel.tsx`에서 자산 카드마다, `TotalEstimatedValue`는
> `PropertyValuationForm.tsx`에서 합계로 실제 렌더 → 누락 시 "예상 평가액 미리보기"·"재산 합계(예상)"가
> 엔진 결과와 불일치. **해소 방향은 미임대 복제가 아니라 §6·§9의 단일 위임/Scope Out**.
> (memory `feedback_api_zod_schema_sync`·`feedback_explicit_prop_mapping_strip`·`feedback_ui_engine_dual_truth_avoidance`)

---

## 5. Pre-Do Anchor (디자인 환류용 — Do 전 우선 실행)

기존 `__tests__/tax-engine/property-valuation/appurtenant-land-61.test.ts`(경로 B 머지 완료, [AL-B1~AL-C1]
6건 통과)에 **미임대 케이스를 증분 추가**해 교재 사례 anchor로 **현행 실패 확보**(새 파일 신설보다
기존 경로 B 테스트에 얹어 회귀 동시 보장):

```ts
// 교재 사례 (서대문구 연희동 △빌딩, 2026.02.18 증여):
//   standardPrice(건물 전체 기준시가)          = 321,300,000
//   appurtenantLandStandardPrice(부수토지 전체) = 330,000,000   → 전체 기준시가 = 651,300,000
//   monthlyRent = 2,000,000 (연 24,000,000),  leaseDeposit = 500,000,000
//   totalBuildingArea = 720, vacantBuildingArea = 180, vacantBuildingStandardPrice = 75,600,000
// 임대분 환산 = 200,000,000 + 500,000,000 = 700,000,000
// 미임대분 토지 = floor(330,000,000 × 180/720) = 82,500,000
// 미임대분 기준시가 = 75,600,000 + 82,500,000 = 158,100,000
// 기대: valuatedAmount === 858,100,000   (= max(651,300,000, 700,000,000 + 158,100,000))
// 현행: 700,000,000 (미임대분 누락) → 실패 확보 → 합산 후 통과
```

추가 anchor:
- **미임대 미입력 회귀**: 3필드 모두 미입력 → `Max(전체기준시가, 임대료환산)` 기존값 그대로(하위호환).
- **임대분 환산 < 전체 기준시가**: 특례액 < 전체기준시가 → 전체 기준시가 채택(Max 정합).
- **면적 안분 정밀**: 무한소수 비율(예: `100/720`) → `floor(safeMultiply(land, vacant)/total)` 1원 정합.
- **경로 A 방어**: `appurtenantLandStandardPrice` 미입력(일괄고시) + 미임대 입력 → 미임대분 토지 0(건물분만).
- **사이드바 선존 dual-truth 실증(⑥)**: 미임대 **없이 임대료환산만 있는** 기존 케이스에서
  `computeEffectiveValuation`·`property-valuation-preview.tsx`(`EstimatedValuePreview`/`TotalEstimatedValue`)가
  현재 **환산 전 기준시가**를 표시(임대료환산 Max 부재 — 선존 버그)함을 먼저 실증해 환류. → 해소는
  미임대 분기 추가가 아니라 **엔진 권위값 단일 위임**(§6·§9). 미임대 입력 후 사이드바 일치 검증은
  단일 위임 채택 시 엔진 `valuatedAmount`(858,100,000)와 자동 일치.

> memory `feedback_pre_anchor_verification`·`pre-do-anchor-verification` 스킬 — "현행 일치 예상" 금지.
> 사례값 `toBe()` 고정(memory `feedback_pdf_example_test_anchoring`).

---

## 6. 테스트 매트릭스 (전수 enumerate)

| 케이스 | 전체기준시가 | 임대분환산 | 미임대분 | method | 기대 |
|---|---|---|---|---|---|
| 교재 일부임대 | 651,300,000 | 700,000,000 | 158,100,000 | standard_price | **858,100,000** |
| 미임대 미입력(회귀) | 651,300,000 | 700,000,000 | 0 | standard_price | 700,000,000 (기존) |
| 임대환산 < 전체기준 | 900,000,000 | 700,000,000 | 100,000,000 | standard_price | 900,000,000 (전체기준 채택) |
| 경로 A 일괄고시 | 651,300,000(통합) | 700,000,000 | 토지0+건물분 | standard_price | max(전체, 700,000,000+건물분) |
| 시가 우선 | — | — | — | market_value | marketValue (특례 무시) |
| §66 담보하한 동시 | 651,300,000 | 700,000,000 | 158,100,000 | standard_price | max(858,100,000, 담보채권액) |
| 모순(미임대>전체 면적) | — | — | — | — | **validation 차단(⑧)** |

---

## 7. 실행 순서 (PDCA Do — 시퀀셜)

0. **아키텍처 확정 = (c)안**(§3-1): 미임대 입력을 `EstateBodySupplementaryValuation.tsx` 경로 B 블록 내부 배치. (단계8 전제)
1. **법령 1회 확인**: §61⑤·§50⑦⑧·§15의2는 실측 확정(재확인 불요). 해석례 「사전법령해석재산2020-…」는 국세법령정보시스템에서 정확 사건번호 확보 시도 → 실패 시 "교재 인용(미검증)" 유지(산식은 법령으로 보장, §2).
2. **타입 ①**: EstateItem에 3필드 추가 + JSDoc. ⚠️ `totalBuildingArea`는 NBL `area-proportioning.ts:35` 함수 파라미터와 동명(스코프 다름·충돌 없음) — JSDoc에 "EstateItem 보충평가 전용" 명시로 검색 혼선 방지.
3. **Zod**: `estate-item-schema.ts` 3필드 추가 → roundtrip 테스트 갱신.
4. **Pre-Do anchor(§5)** 작성 → 현행 실패 확인 → 디자인 환류(사이드바 선존 dual-truth·경로 A 방어 포함).
5. **엔진**: `calcVacantPortionStandardPrice` 헬퍼 + `applyCollateralFloor` 비교식 수정. ⚠️ `property-valuation.ts`에 `safeMultiply` **미import**(grep 0건) → `import { safeMultiply } from "./tax-utils"` 추가. 헬퍼 본문은 **1곳에만** 정의(설계서 STEP 1/STEP 3 중복 게재는 문서 가독성 — 코드는 단일).
6. **결과뷰 ⑦**: `extraCollateralRows` breakdown 2~3행 분해. `applyCollateralFloor`가 산출한 `rentalValue`를 반환 객체에 담아 `extraCollateralRows`로 전달하면 재호출 1회 절감(선택, 순수함수라 현행 재호출도 무해).
7. **사이드바·직접읽기 ⑥**: 미임대 특례를 3사이트(`computeEffectiveValuation`·`resolveEstateItemValue`·`property-valuation-preview.tsx` 2함수)에 **복제 금지**. result 도착 후엔 엔진 `valuatedAmount` 단일 위임, result 도착 전 추정 단계는 기존 단순 추정값 유지 + "추정" 라벨 명시. 임대료환산 본체 dual-truth 해소는 **본 계획 범위 밖(§9 Scope Out)**. **dual-truth 차단(미임대 분기 추가 금지).**
8. **UI ⑤ = (c)안**: `EstateBodySupplementaryValuation.tsx` 경로 B 블록(:138~161)에 미임대 ToggleCard(경로 B ON + `item.monthlyRent>0` 게이트, DecimalInput×2·CurrencyInput×1·자동계산 박스 sky tone). `monthlyRent`는 read만(write는 `CollateralLeaseFields`).
9. **validation ⑧**: 모순 차단 조건 **단일 정의**(V-9): 미임대 입력 의사 있을 때만(`vacantBuildingArea>0` 또는 `vacantBuildingStandardPrice>0`) — 미임대면적>전체면적·면적 한쪽만 입력·건물기준시가 입력 but 면적 0 차단. `totalBuildingArea`만 있고 나머지 미입력은 "미완성(특례 미적용)" 통과. `appurtenantLandStandardPrice=0`+미임대 입력은 경고(차단 아님, §3-4). 증여·상속 양쪽.
10. **normalize ③**: `category-change-policy` 건물→타분류 전환 시 3필드 정리.
11. **게이트**: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/property-valuation/` · 증여/상속 회귀 · E2E(증여 상업용 건물 경로 B 미임대 + 상속 회귀, memory `project_inheritance_stale_e2e_specs`).
12. **검증**: `ui-engine-sync-checker` + 브라우저 수동(Network body에 3필드 도달 확인).

---

## 8. 잔여 확인 / 주의

- **상속세 동시 적용**: EstateItem 공유 → 상속 보충평가에도 자동 반영. 상속 E2E·평가조서(별지) 회귀 포함.
- **경로 B 의존**: 본 특례의 토지 안분 분모(`appurtenantLandStandardPrice` 분리)는 **선행 계획 머지
  완료**(타입 :63·Zod :32·엔진 `evaluateDetachedHouse` :240~242·테스트 `appurtenant-land-61.test.ts` 6건).
  Do 전 `grep appurtenantLandStandardPrice`로 머지 완료 재확인(이미 완료 — 위 모든 사이트 존재 예상).
- **층별 건물 기준시가 직접입력 한계**: 사용자가 「건물기준시가 계산서」 해당 층 값을 직접 산출·입력해야
  함(자동 안분 아님 — 층별 비균등성 때문). hint에 "건물기준시가 계산서의 미임대 층 합계" 안내.
- **자동 안분 정책 정합**(memory `feedback_no_silent_apportion_fallback`): 토지 면적 안분은 ① 사용자가
  미임대 면적을 **명시 입력**하고 ② 법령상 명시 안분 산식(이미지 5)이며 ③ 토지단가 균일이라 정확 →
  silent fallback 아닌 **정상 파생 계산**으로 허용(PHD §164⑤ 예외와 동질).

---

## 9. 범위 밖 (Scope Out)

- **층별 테이블 UI(A안)**: 예제식 건물 층별 행 + 미임대 체크 + 건물기준시가 계산서 자동생성.
  현 상증 폼은 단일 면적 구조라 신규 층별 입력 아키텍처가 필요 → 본 계획 범위 밖(C안 채택).
- **국세청 건물기준시가 자동 계산기 연동**: 미임대분 건물 기준시가는 수동 입력.
- **경로 A 일괄고시의 미임대 안분**: 토지+건물 미분리라 안분 분모 부재 → 경로 B 한정.
- **사이드바 임대료환산 본체 dual-truth 해소(별도 과제)**: 사이드바 3사이트(`computeEffectiveValuation`·
  `resolveEstateItemValue`·`property-valuation-preview.tsx` 2함수)는 현재 §61⑤ 임대료환산 Max 자체가 부재
  (선존 버그·`feedback_ui_engine_dual_truth_avoidance`). 본 계획은 사이드바를 **엔진 권위값 단일 위임**으로만
  처리하고, 임대료환산 본체를 UI에 재구현하는 작업은 **별도 PR**로 분리(미임대분만 끼워넣어 `totalStd+vacantStd`
  같은 법령 부재값을 내는 것 방지).

---

## 부록 A. 자가검증(plan-self-review 10단계·25 에이전트) must-fix 처리 대장

> verdict: blocked(high 2 + residual 8) → 정정 반영. 생성 설계서:
> `docs/02-design/features/rental-conversion-vacancy-portion.{engine,ui}.design.md`

| # | 심각도 | 결함 | 처리 |
|---|---|---|---|
| 1 | high(모순) | plan §3-1 UI 배치 3안 미확정 ↔ engine/ui 설계 (c)안 단독 확정 | ✅ §3-1·§3-4·§4⑤·§7(단계0·8)을 **(c)안 확정**으로 단일화(EstateBodySupplementaryValuation 경로 B 블록 내부). (a)/(b)는 폐기 이력으로 보존 |
| 2 | high(누락) | 근거 해석례 「사전법령해석재산2020-」 일련번호 미상·KoreanLaw NOT_FOUND | ✅ §0·§2·§7단계1 — **교재 인용(미검증)으로 격하**. 산식 1차 근거를 §61⑤·§50⑦⑧1호·§15의2 실측으로 명시(해석례=보강). 본 세션 KoreanLaw 2회 재검색도 NOT_FOUND 확인 |
| 3 | med(모순) | §7 단계8이 특정 안 하드코딩(3안 미확정과 충돌) | ✅ #1 해소로 (c)안 일관 |
| 4 | med(누락) | §50⑦ 인용이 원문 축자 아닌 산식 풀어쓰기(별표 형태) | 🔎 engine 설계서 인용 주석 보강 권고(잔여, 설계서 surgical) |
| 5 | med(누락) | V-9(면적 한쪽만 입력) 차단 정의 문서 간 불일치 | ✅ §7단계9 — **단일 정의**(입력 의사 있을 때만 차단, totalArea만은 미완성 통과) |
| 6 | med(개선) | `extraCollateralRows`가 `rentalValue` 재호출 | ✅ §7단계6 — 반환객체 전달 옵션 명시(순수함수라 현행도 무해) |
| 7 | low(오류) | engine 설계서 V-3 주석 수치 오기(800,600,000을 858,100,000으로) | 🔎 설계서 주석 정정 권고(테스트 단언값은 정확·GREEN, 잔여) |
| 8 | low(오류·개선) | UI 파일 경로 granularity·헬퍼 문서 2회 중복 게재 | ✅ §7단계5·§4⑤ 전체 경로 통일·헬퍼 단일 정의 명시 |
| 9 | low(누락) | `safeMultiply` import 누락 지시 | ✅ §7단계5 — `import { safeMultiply } from "./tax-utils"` 명시 |
| 10 | low(개선) | `totalBuildingArea` 필드명이 NBL 함수 파라미터와 동명 | ✅ §7단계2 — JSDoc "보충평가 전용" 명시(스코프 다름·충돌 없음) |

> 잔여 🔎 #4·#7는 **생성 설계서(engine.design.md)** 측 surgical 정정 대상(plan 본문 아님) — Do 착수 시
> 설계서 동기화 단계에서 처리. plan 본문 결함은 전부 해소.
