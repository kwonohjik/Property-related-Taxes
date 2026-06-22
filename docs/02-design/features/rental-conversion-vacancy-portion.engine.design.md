# 임대보증금 평가특례 — 미임대(공실) 부분 처리 — 엔진 설계

> 계획서: `docs/00-pm/rental-conversion-vacancy-portion.plan.md`
> 세목: 상속세 + 증여세 공용 (property-valuation.ts 공유)
> 법령 위임 체인 검증일: 2026-06-22 (KoreanLaw MCP, MST 276123·283637·284609)

---

## Context

상증법 §61⑤는 임대차계약이 체결된 재산을 Max(임대료환산가액, 보충평가액)으로 평가한다.
현행 엔진(`applyCollateralFloor`)은 건물 **전체**를 단일 비교하므로, 1동 건물이 **일부만 임대**되어
있는 경우(미임대·공실 층 존재) 미임대분 기준시가가 비교식에서 누락된다.

교재 사례(서대문구 연희동 △빌딩, 2026.02.18 증여):
- 현행 엔진: `Max(651,300,000, 700,000,000) = 700,000,000`
- 정답: `Max(651,300,000, 700,000,000 + 158,100,000) = 858,100,000`
- 과소평가 차액: **158,100,000원**

본 작업은 신규 3필드(`totalBuildingArea`, `vacantBuildingArea`, `vacantBuildingStandardPrice`)와
`calcVacantPortionStandardPrice` 헬퍼를 추가해 `applyCollateralFloor`의 비교식을
`Max(전체기준시가, 임대분환산 + 미임대분기준시가)`로 확장한다.
선행 계획(경로 B — 부수토지 개별공시지가 분리, `appurtenantLandStandardPrice`)은 머지 완료 상태.

---

## 법령 근거 (위임 체인 끝까지 KoreanLaw 검증 완료)

### 상증법 §61⑤ — 임대 부동산 평가 (본칙)

```
§61⑤: 사실상 임대차계약이 체결되거나 임차권이 등기된 재산의 경우에는
       임대료 등을 기준으로 하여 대통령령으로 정하는 바에 따라 평가한 가액과
       제1항부터 제4항까지의 규정에 따라 평가한 가액 중 큰 금액을 그 재산의 가액으로 한다.
       (KoreanLaw 검증 완료, MST 276123, 시행 2026-01-02)
```

위임: "대통령령으로 정하는 바" → 상증령 §50⑦

### 상증령 §50⑦ — 임대료 등의 환산가액 (위임 체인 중간)

```
§50⑦: 법 제61조제5항에서 "대통령령으로 정하는 바에 따라 평가한 가액"이란
       다음 계산식에 따라 계산한 금액(임대료 등의 환산가액)을 말한다.
       (KoreanLaw 검증 완료, MST 283637, 시행 2026-02-27)

       환산가액 = (연 임대료 ÷ 재정경제부령이 정하는 율) + 임대보증금
```

위임: "재정경제부령이 정하는 율" → 상증칙 §15의2

### 상증칙 §15의2 — 환산율 12% (위임 체인 최종 본칙)

```
§15의2: 영 제50조제7항에서 "재정경제부령으로 정하는 율"이란 100분의 12를 말한다.
        (KoreanLaw 검증 완료, MST 284609, 시행 2026-03-20)
```

따라서: 환산가액 = (월 임대료 × 12) ÷ 12% + 임대보증금
        코드: `Math.floor((monthly * 12) / 0.12) + leaseDeposit` (현행 `calcRentalConversionValue` 정합)

### 상증법 §66 / 상증령 §63 — 담보채권 하한 (검증 완료)

```
§66: 저당권·전세권 등이 설정된 재산은 담보하는 채권액 기준 대통령령 평가가액과
     §60 평가가액 중 큰 금액을 재산가액으로 한다.
     (MST 276123 검증 완료)

상증령 §63②: 근저당 채권최고액 < 채권액이면 채권최고액 적용.
              신용보증기관 보증액이 있으면 채권액에서 차감.
              (MST 283637 검증 완료)
```

현행 `applyCollateralFloor` 외곽 `Math.max(baseAmount, securedClaim)` 로직 무변경.

### 사전법령해석재산2020- (2021.06.04) — 1동 일부 임대 시 구분 평가

```
1동 건물 일부만 임대 중인 경우 임대분·미임대분을 구분하여 평가한다.
산식: Max(전체기준시가, 임대분환산가액 + 미임대분기준시가)

⚠️ 확인 필요: KoreanLaw API(interpretation/nts 양 도메인) 검색 결과 없음.
   계획서 교재 산식("사전법령해석재산2020-, 2021.06.04")을 채택.
   Do 착수 전 taxlaw.nts.go.kr 직접 검색으로 해석례 본문 1회 확인 강제.
```

### §50⑧ — 토지·건물 소유자 다른 경우 안분 (설계 전제 범위 확인)

```
상증령 §50⑧: 토지·건물 소유자가 동일한 경우(1호): 임대료환산가액을 기준시가로 나누어
              토지·건물 각각 평가. 소유자 다른 경우(2호 가/나): 귀속별 또는 전체 안분.
              (MST 283637 검증 완료)

→ 본 설계 범위: 토지·건물 동일 소유자(경로 B)에서 미임대분 토지는 면적 직접 안분.
  §50⑧2호(소유자 상이)는 v1.x Scope Out — "세무사 상담 권장" 안내로 처리.
```

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| V-1 | 일부 임대(교재 사례): 전체기준 651,300,000 / 임대환산 700,000,000 / 미임대분 158,100,000 | §61⑤ + 해석례 | 교재 이미지(2026.02.18 증여) | `appurtenant-land-61.test.ts` 증분 추가 | ☐ Pre-Do anchor |
| V-2 | 미임대 미입력(하위호환 회귀): 3필드 모두 undefined → 기존 Max(전체, 환산) 결과 불변 | §61⑤ | 현행 동작 보존 | 동상 | ☐ TODO |
| V-3 | 임대환산 < 전체기준시가: 전체기준 900,000,000 / 임대환산 700,000,000 / 미임대 100,000,000 → 900,000,000 | §61⑤ Max 산식 | 수치 도출 | 동상 | ☐ TODO |
| V-4 | 경로 A(일괄고시 §61①3호) + 미임대 입력: `appurtenantLandStandardPrice` = 0 → 미임대분 토지 = 0, 건물분만 합산 | §61⑤ 경로 B 전용 방어 | 수치 도출 | 동상 | ☐ TODO |
| V-5 | §66 담보채권 하한 동시: 특례액 858,100,000 / 담보채권 900,000,000 → 900,000,000 | §66·§63 | 수치 도출 | 동상 | ☐ TODO |
| V-6 | 시가 우선(method=market_value): `applyCollateralFloor` 내 `method==="standard_price"` 조건 미충족 → 특례 미적용, 시가 그대로 | §60 시가 우선 | 수치 도출 | 동상 | ☐ TODO |
| V-7 | 면적 안분 무한소수: totalArea=720, vacantArea=100, landStd=330,000,000 → floor(330,000,000×100/720) = 45,833,333 | 정수 연산 정책 | 계산 검증 | 동상 | ☐ TODO |
| V-8 | 모순 입력 차단 — vacantArea > totalArea: validation ⑧ 차단 | 입력 정합성 | — | validation 테스트 | ☐ TODO |
| V-9 | 모순 입력 차단 — 면적 한쪽만 입력: vacantArea>0 but totalArea=0 (또는 역) → validation 차단 | 입력 정합성 | — | 동상 | ☐ TODO |
| V-10 | 부수토지 미입력 + 미임대 면적 입력: `appurtenantLandStandardPrice`=0 → 미임대분 토지 0, 미임대분 건물기준시가만 합산, 안내 경고 | §3-4 방어 | 수치 도출 | 동상 | ☐ TODO |
| V-11 | 사이드바 선존 dual-truth 실증(⑥ Scope Out): 현행 `EstimatedValuePreview`·`TotalEstimatedValue`·`computeEffectiveValuation`이 임대료환산 Max를 미적용함을 확인 → 해소는 별도 PR | Scope Out 경계 | 현행 코드 실측 | (별도) | ☐ Pre-Do 실증 |

**규칙**: V-1 Pre-Do anchor를 Do 착수 전 반드시 실행 → 현행 700,000,000 실패 확보 → 858,100,000으로 GREEN 전환. V-8·V-9·V-10 validation은 Do 9단계(§7 실행 순서) 에서 구현.

---

## 엔진 input 타입

신규 3필드를 `EstateItem`(`lib/tax-engine/types/inheritance-gift-estate.types.ts`)에 추가.
`appurtenantLandStandardPrice` (:63) 바로 아래에 삽입(논리 인접).

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts
// appurtenantLandStandardPrice?: number; ← 기존 :63 — 변경 없음

/**
 * 미임대(공실) 건물 전체 연면적(㎡) — §61⑤ 임대보증금 평가특례 일부임대 분리 산식.
 * 미임대분 토지 안분 분모로 사용. DecimalInput 입력.
 * vacantBuildingArea·vacantBuildingStandardPrice와 세트로 입력.
 * 경로 B(appurtenantLandStandardPrice > 0)에서만 토지 안분에 의미 있음.
 */
totalBuildingArea?: number;

/**
 * 미임대(공실) 건물 연면적(㎡) — §61⑤ 일부임대 특례 미임대분 면적.
 * 미임대분 토지 기준시가 안분 분자로 사용.
 * 반드시 totalBuildingArea <= 입력해야 validation 통과.
 */
vacantBuildingArea?: number;

/**
 * 미임대분 건물 기준시가(원) — 층별 위치지수·구조·용도에 따라 비균등하여
 * 면적 단순 안분이 부정확. 사용자가 「건물기준시가 계산서」 해당 층 합계를 직접 입력.
 * (토지 기준시가는 지번 동일로 ㎡단가 균일 → 면적 안분 정확 → 자동 파생)
 * CurrencyInput 입력 (정수 원).
 */
vacantBuildingStandardPrice?: number;
```

새 Date 필드 없음. `lib/api/date-coerce.ts` 처리 불필요.

---

## 엔진 result 타입

신규 result 필드 없음. `PropertyValuationResult`의 `breakdown: CalculationStep[]`에 행 추가만.
`rentalRaised`(기존 boolean)는 내부 변수 — 노출 타입 변경 없음.

`extraCollateralRows` 반환 타입(`CalculationStep[]`)도 무변경(행 수만 2~3→3~4로 확장).

---

## 계산 알고리즘 (단계별)

### STEP 1 — `calcVacantPortionStandardPrice(item)` 신규 헬퍼

파일 위치: `property-valuation.ts` (기존 `calcRentalConversionValue` 바로 아래 추가)

> **export 필수**: 본 헬퍼는 V-7 단위 테스트가 직접 호출하므로 `export function`으로 정의한다
> (테스트 전용 별칭 `...Exposed` 신설 금지 — 정확한 이름 `calcVacantPortionStandardPrice`로 단일화).
> 인자는 `EstateItem` 전체 객체(테스트도 `EstateItem` 형태로 구성).

```ts
/**
 * §61⑤·사전법령해석재산2020-(2021.06.04) — 1동 건물 일부 임대 시 미임대(공실)분 기준시가.
 *
 * 미임대분 기준시가 = 미임대분 건물 기준시가(직접입력)
 *                   + 미임대분 토지 기준시가(= 전체 부수토지 기준시가 × 미임대건물면적/전체건물면적)
 *
 * 토지 안분: 법령 명시 면적 직접 안분(교재 이미지5: 300×180/720=75㎡).
 *   - safeMultiply(totalLandStd, vacantArea) 먼저 → / totalArea (정수 연산 순서 강제)
 *   - Math.floor() — 절사(반올림 아님)
 *   - feedback_safemul_decimal_apportion_precision: 분자>MAX_SAFE 시 BigInt fallback 자동
 *
 * 미입력(면적 0 또는 undefined) → 0 반환 → 기존 단일 비교 동작 완전 보존(하위호환).
 * appurtenantLandStandardPrice = 0(경로 A) → 토지분 0, 건물분만 반영(안전).
 */
export function calcVacantPortionStandardPrice(item: EstateItem): number {
  // 면적 안분 floor 산식은 calcVacantPortionBreakdown(STEP 3)이 유일 소스.
  // 본 함수는 분해 항목의 합으로만 정의 — 산식 인라인 복제 금지.
  const { vacantLandStd, vacantBuildingStd } = calcVacantPortionBreakdown(item);
  return vacantBuildingStd + vacantLandStd;
}
```

> 위 본문은 분해 헬퍼 `calcVacantPortionBreakdown`(STEP 3에 정의)의 합이다.
> 안분 floor 산식·미입력(0) 가드·경로 A(토지분 0) 처리는 모두 `calcVacantPortionBreakdown`에 1곳으로 모은다.
> (파일 배치상 분해 헬퍼를 STEP 1 헬퍼보다 위에 선언하거나 함수 선언 호이스팅에 의존.)

### STEP 2 — `applyCollateralFloor` 비교식 수정 (단일 지점)

기존 `:112~118` 범위의 `method === "standard_price"` 블록만 수정:

```ts
// 변경 전 (현행)
if (method === "standard_price") {
  const rentalValue = calcRentalConversionValue(item);
  if (rentalValue > amount) {
    baseAmount = rentalValue;
    rentalRaised = true;
  }
}

// 변경 후
if (method === "standard_price") {
  const rentalValue = calcRentalConversionValue(item);
  if (rentalValue > 0) {
    const vacantStd = calcVacantPortionStandardPrice(item); // 미임대 미입력 시 0
    const specialValue = rentalValue + vacantStd;
    if (specialValue > amount) {
      baseAmount = specialValue;
      rentalRaised = true;
    }
  }
}
```

- `amount`는 경로 B에서 `evaluateDetachedHouse`가 이미 `standardPrice + appurtenantLandStandardPrice`를
  합산하여 전달 → 본 비교가 곧 **Max(전체기준시가, 임대분환산 + 미임대분기준시가)** 산식을 구현.
- `vacantStd = 0`이면 `specialValue = rentalValue` → **완전한 하위호환**.
- `rentalValue > 0` 게이트: 임대료 0(전부 공실) 케이스에서 `vacantStd`만으로 특례 적용 차단
  (§61⑤는 "사실상 임대차계약이 체결된 재산"이 전제 — 임대료 없으면 미적용).
- §66 담보채권 외곽 `Math.max(baseAmount, securedClaim)` (`:122`) — **무변경**.

### STEP 3 — `extraCollateralRows` breakdown 보강 (산식 단일 소스 위임)

> **Simplicity First — 중복 계산 금지**: STEP 2의 `applyCollateralFloor`가 이미 산출한
> `rentalValue`·`vacantStd`·분해 항목을 재사용한다. `extraCollateralRows`에서
> `Math.floor(safeMultiply(...) / totalArea)` 안분 산식을 **다시 손으로 쓰지 않는다**.
> 면적 안분 floor 산식은 `calcVacantPortionStandardPrice`가 **유일 산식 소스**다(드리프트 차단).

**분해 헬퍼 1개로 단일화** — 미임대분 토지/건물을 분리 반환하는 작은 헬퍼를 추가하고
`calcVacantPortionStandardPrice`는 이 헬퍼의 합으로 정의(산식 1곳):

```ts
/** 미임대분 분해 — 토지/건물 분리 (산식 단일 소스). */
export function calcVacantPortionBreakdown(item: EstateItem): {
  vacantLandStd: number;
  vacantBuildingStd: number;
} {
  const vacantArea = item.vacantBuildingArea ?? 0;
  const totalArea = item.totalBuildingArea ?? 0;
  if (vacantArea <= 0 || totalArea <= 0) {
    return { vacantLandStd: 0, vacantBuildingStd: 0 };
  }
  const totalLandStd = item.appurtenantLandStandardPrice ?? 0;
  // 면적 안분: 곱셈 먼저 → floor(safeMultiply(분자) / 분모) — 유일 산식 위치
  const vacantLandStd = Math.floor(safeMultiply(totalLandStd, vacantArea) / totalArea);
  return { vacantLandStd, vacantBuildingStd: item.vacantBuildingStandardPrice ?? 0 };
}

// STEP 1 헬퍼는 분해 헬퍼의 합으로 정의(산식 인라인 복제 제거)
export function calcVacantPortionStandardPrice(item: EstateItem): number {
  const { vacantLandStd, vacantBuildingStd } = calcVacantPortionBreakdown(item);
  return vacantBuildingStd + vacantLandStd;
}
```

breakdown 빌더는 분해 헬퍼만 호출(안분 산식 재기재 없음):

```ts
function extraCollateralRows(
  item: EstateItem,
  valuatedAmount: number,
  rentalRaised: boolean,
): CalculationStep[] {
  const rows: CalculationStep[] = [];
  if (rentalRaised) {
    const { vacantLandStd, vacantBuildingStd } = calcVacantPortionBreakdown(item);
    if (vacantLandStd + vacantBuildingStd > 0) {
      // 미임대분이 있는 경우 — 분해 3행 (rentalValue는 STEP 1과 동일 헬퍼 재호출)
      const rentalValue = calcRentalConversionValue(item);
      rows.push({ label: "§61⑤ 임대료환산가액 (임대분)", amount: rentalValue, lawRef: VALUATION.RENTAL_CONVERSION });
      rows.push({ label: "미임대분 건물 기준시가", amount: vacantBuildingStd, lawRef: VALUATION.REAL_ESTATE_SUPP });
      rows.push({ label: "미임대분 토지 기준시가 (면적 안분)", amount: vacantLandStd, lawRef: VALUATION.REAL_ESTATE_SUPP });
      rows.push({ label: "임대보증금 평가특례 합계 (채택)", amount: valuatedAmount, lawRef: VALUATION.RENTAL_CONVERSION });
    } else {
      // 미임대 없음(기존) — 1행 유지
      rows.push({ label: "§61⑤ 임대료환산가액 적용", amount: valuatedAmount, lawRef: VALUATION.RENTAL_CONVERSION });
    }
  }
  const cg = item.creditGuaranteeAmount ?? 0;
  if (cg > 0) {
    rows.push({ label: "§63② 신용보증기관 보증액 차감", amount: -cg, lawRef: VALUATION.COLLATERAL_SPECIAL });
  }
  return rows;
}
```

`calcRentalConversionValue`는 부작용 없는 순수 산술 헬퍼이므로 STEP 1·STEP 3 양쪽 재호출은 무해
(중간 floor 안분 산식 복제만 제거하면 드리프트 위험 해소). 산식 라벨은 한국어 풀어쓰기
(memory `feedback_result_view_korean_formula`). 변수 약어·`floor()` 표시 금지.

---

## 산식 검증 (교재 anchor)

교재 사례 (서대문구 연희동 △빌딩, 2026.02.18 증여):

```
[입력]
standardPrice(건물 전체 기준시가)         = 321,300,000
appurtenantLandStandardPrice(부수토지)    = 330,000,000
amount(전체 기준시가, 경로 B 합산)         = 651,300,000
monthlyRent                              = 2,000,000
leaseDeposit                             = 500,000,000
totalBuildingArea                        = 720
vacantBuildingArea                       = 180
vacantBuildingStandardPrice              = 75,600,000

[계산]
임대분 환산가액 = floor(2,000,000 × 12 / 0.12) + 500,000,000
               = floor(200,000,000) + 500,000,000
               = 700,000,000

미임대분 토지   = floor(safeMultiply(330,000,000, 180) / 720)
               = floor(59,400,000,000 / 720)
               = floor(82,500,000.0)
               = 82,500,000

미임대분 기준시가 합계 = 75,600,000 + 82,500,000 = 158,100,000

특례 합계      = 700,000,000 + 158,100,000 = 858,100,000

결과           = Max(651,300,000, 858,100,000) = 858,100,000  ← 채택
```

**V-1 anchor**: `expect(result.valuatedAmount).toBe(858_100_000)`

---

## 법정 산식 수학적 등가 확인 (단일 Max 비교 충분성)

교재 원문 산식: "임대분 = Max(임대환산, 임대분기준시가), 미임대분 = 미임대분기준시가" 도 동등.

```
전체기준시가 = 임대분기준시가 + 미임대분기준시가
특례액       = 임대분환산    + 미임대분기준시가

Max(전체기준, 특례액)
= Max(임대분기준 + 미임대분기준, 임대분환산 + 미임대분기준)
= Max(임대분기준, 임대분환산) + 미임대분기준   ← 미임대분 공통항 소거
= (교재 원문 임대분 Max) + 미임대분기준시가

∴ 단일 Max 비교 = 교재 2단계 Max와 수학적으로 동일.
```

---

## Silent fallback / 자동 안분 후보 식별

**허용 — 법령 명시 안분** (자동 안분 fallback 아님):
- 미임대분 토지 기준시가 = `appurtenantLandStandardPrice × (vacantArea / totalArea)`
  근거: 교재 이미지 5 "300×180/720=75㎡"로 법령 명시 산식. 사용자가 면적을 명시 입력 + 토지 ㎡단가
  균일(지번 동일) + 법령상 면적 안분 명시 → silent fallback 아닌 정상 파생 계산.
  (memory `feedback_no_silent_apportion_fallback` PHD §164⑤ 예외와 동질 구조)

**금지 — validation 오류로 차단해야 할 케이스**:
- `vacantBuildingArea > 0` + `totalBuildingArea = 0`: validation 차단
- `totalBuildingArea > 0` + `vacantBuildingArea = 0`(면적 미입력) + `vacantBuildingStandardPrice > 0`:
  건물 기준시가 입력했는데 면적 0 → validation 차단(V-9 유사)
- `vacantBuildingArea > totalBuildingArea`: 물리적 모순 → validation 차단(V-8)

**안내만 (차단 아님)**:
- `appurtenantLandStandardPrice = 0` + 미임대 면적 입력: 토지 안분 분모 0 → 토지분 0(건물분만 반영)
  + "부수토지 개별공시지가 미입력 — 미임대분 토지 안분 불가(건물분만 반영)" warning 추가(V-10)

**건물 기준시가 직접입력 이유**:
- 층별 위치지수·구조·용도에 따라 비균등 (1층 90,720,000 ≠ 4층 75,600,000)
- 면적 단순 안분 부정확 → 사용자가 「건물기준시가 계산서」 해당 층 합계를 직접 입력
- hint: "건물기준시가 계산서의 미임대 층 기준시가 합계를 입력하세요"

---

## 14개 동기화 지점 전수 점검

신규 필드 3개: `totalBuildingArea?`, `vacantBuildingArea?`, `vacantBuildingStandardPrice?` (모두 optional number)

| # | 지점 | 파일 · 위치 | 변경 | 비고 |
|---|-----|------------|------|------|
| **①** | 폼 상태 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` `:63` 인접 | 3필드 `?: number` + JSDoc | 현행 없음 → 추가 |
| **Zod** | Zod 스키마 (침묵 strip 게이트) | `lib/validators/estate-item-schema.ts` `:32` `baseItemSchema` | `totalBuildingArea: z.number().nonnegative().optional()` 등 3필드 + roundtrip 테스트 갱신 | **누락 시 silent strip — 반드시 추가** |
| **②** | initial value | `components/calc/PropertyValuationForm.tsx` 초기값 블록 | optional 필드라 기본값 불요(undefined) | 확인만 |
| **③** | normalize (카테고리 전환) | `lib/calc/category-change-policy.ts` `pickPreservedFields` (:55) | **실제 모델 = 보존 화이트리스트** (`CLEAR_ON_CATEGORY_CHANGE` 不在). cross-group(building→cash 등) 전환은 base 화이트리스트(:68~73)에 3필드 미포함 → 자동 drop. **그룹 내(building→apartment/land) 전환은 `return { ...item, category }` (:64)로 3필드 carry-over됨** — 영향 무해 실증 필요 또는 그룹 내 분기 추가(아래 결정) | 게이트 밖 미소비 확인 또는 제거 분기 추가 |
| **④** | API 변환 (증여) | `lib/calc/gift-api.ts` `buildGiftTaxInput` giftItems `.map` spread | spread 구조라 신규 optional 자동 생존. **Zod 통과가 진짜 게이트** | N/A (spread) |
| **④** | API 변환 (상속) | `lib/calc/inheritance-api.ts` `:60~103` estateItems spread/passthrough | 동상 | N/A (spread) |
| **⑤** | UI 위젯 | `EstateBodySupplementaryValuation.tsx` separateLandMode 블록(:138~161) 내부 | 미임대 ToggleCard + DecimalInput×2(면적) + CurrencyInput×1(건물기준시가) + 자동계산 박스(sky tone). 노출 게이트 = 경로 B(`cat==="real_estate_building" && separateLandMode`). hint: 임대료(`monthlyRent>0`, CollateralLeaseFields) 입력 시에만 의미 | 위치 확정(아래 ⑤ UI 배치 결정) |
| **⑥** | 사이드바 | `lib/calc/estate-item-valuation.ts` `computeEffectiveValuation` + `property-valuation-preview.tsx` 2함수 | **복제 금지** — 결과 도착 전 추정 단계는 기존 보충평가 단순합산 유지. "추정" 라벨 명시. 임대료환산 본체 dual-truth 해소는 Scope Out | 미임대분만 끼워넣어 `totalStd+vacantStd` 같은 법령 부재값 내는 것 금지 |
| **⑦** | 결과 카드 | `extraCollateralRows` (`property-valuation.ts`) + 상속·증여 결과뷰 | breakdown 3~4행(§3-3). 상속 평가조서·별지 영향 확인 필요 | §3 STEP 3 구현 |
| **⑧** | validation | 증여 `components/calc/gift-tax-form-validate.ts` + 상속 `lib/calc/inheritance-validate.ts` | 면적 모순(V-8·V-9)·반쪽 입력·토지 분모 0 안내(V-10). **UI 통과 ↔ validate 차단 모순 금지** | 증여·상속 양쪽 모두 |
| **⑨⑩** | Zod enum (Route) | `app/api/calc/gift/route.ts` / `app/api/calc/inheritance/route.ts` | EstateItem 필드 → spread/passthrough 자동. Zod 스키마 통과 후 엔진 전달 | N/A |
| **⑫** | Zod 입력 객체 정의 | `lib/validators/estate-item-schema.ts` | **위 Zod 행과 동일 — 3필드 반드시 추가** | **침묵 strip 차단 핵심** |
| **⑬** | API body spread | 증여·상속 api.ts spread 구조 | 자동 생존 | N/A |
| **⑭** | Route handler 엔진 input 매핑 | 상속·증여 route handler | estateItems 배열 passthrough — 자동 | N/A |

> ⑥ dual-truth 선존 사이트 전수:
> (1) `lib/calc/estate-item-valuation.ts:computeEffectiveValuation` — 임대료환산 Max 부재.
> (2) `lib/tax-engine/valuation/resolve-estate-item-value.ts` — 동상.
> (3) `components/calc/property-valuation-preview.tsx:EstimatedValuePreview` — 동상.
> (4) `components/calc/property-valuation-preview.tsx:TotalEstimatedValue` — 동상.
> → 4사이트 모두 임대료환산 Max 자체가 없음(grep `calcRentalConversionValue` 0건 — 실측).
> 본 계획에서 미임대분만 추가하면 `totalStd + vacantStd` 같은 법령 부재값이 됨 → 금지.
> 해소 방향: 결과 도착 후엔 엔진 `valuatedAmount` 단일 위임(Scope Out 별도 PR).

---

## 테스트 약속

파일: `__tests__/tax-engine/property-valuation/appurtenant-land-61.test.ts` (기존 경로 B 테스트에 증분 추가)

### V-1 — Pre-Do anchor (교재 사례 — 현행 실패 확보)

```ts
// [Pre-Do] 현행 엔진에서 실패해야 함 (미임대 누락으로 700,000,000 반환)
it("V-1-PRE: 일부임대 미임대 누락 → 과소평가 현행 실패", () => {
  const item: EstateItem = {
    id: "v1", category: "real_estate_building", name: "△빌딩",
    standardPrice: 321_300_000,
    appurtenantLandStandardPrice: 330_000_000,
    monthlyRent: 2_000_000,
    leaseDeposit: 500_000_000,
    totalBuildingArea: 720,
    vacantBuildingArea: 180,
    vacantBuildingStandardPrice: 75_600_000,
  };
  const result = evaluateDetachedHouse(item);
  // 현행: 700,000,000 (미임대 미반영) → 이 anchor가 FAIL이면 코드 변경 확인 필요
  expect(result.valuatedAmount).toBe(700_000_000); // 실패 예상
});

// [구현 후] GREEN 전환 목표
it("V-1: 일부임대 교재 사례 — 858,100,000", () => {
  const item: EstateItem = { ...V1_BASE };
  const result = evaluateDetachedHouse(item);
  expect(result.valuatedAmount).toBe(858_100_000); // 700,000,000 + 158,100,000
});
```

### V-2 — 하위호환 회귀

```ts
it("V-2: 미임대 미입력 → 기존 Max(전체기준, 환산) 불변", () => {
  const item: EstateItem = { ...V1_BASE, totalBuildingArea: undefined, vacantBuildingArea: undefined, vacantBuildingStandardPrice: undefined };
  const result = evaluateDetachedHouse(item);
  expect(result.valuatedAmount).toBe(700_000_000); // 임대환산이 전체기준보다 크므로
});
```

### V-3 — Max 정합 (전체기준시가 채택)

```ts
it("V-3: 임대환산 < 전체기준시가 → 전체기준시가 채택", () => {
  const item: EstateItem = {
    id: "v3", category: "real_estate_building", name: "test",
    standardPrice: 800_000_000,
    appurtenantLandStandardPrice: 100_000_000, // 전체기준 900,000,000
    monthlyRent: 2_000_000, leaseDeposit: 500_000_000, // 환산 700,000,000
    totalBuildingArea: 720, vacantBuildingArea: 180,
    vacantBuildingStandardPrice: 75_600_000, // 특례 700,000,000+158,100,000=858,100,000 < 900,000,000
  };
  const result = evaluateDetachedHouse(item);
  expect(result.valuatedAmount).toBe(900_000_000); // 전체기준 채택
});
```

### V-7 — 면적 안분 정수 연산

```ts
it("V-7: 면적 안분 무한소수 — safeMultiply floor 1원 정합", () => {
  // 330,000,000 × 100 / 720 = 45,833,333.33... → floor = 45,833,333
  // STEP 1의 export된 calcVacantPortionStandardPrice를 EstateItem 전체 객체로 직접 호출.
  const item: EstateItem = {
    id: "v7", category: "real_estate_building", name: "test",
    appurtenantLandStandardPrice: 330_000_000,
    totalBuildingArea: 720, vacantBuildingArea: 100,
    vacantBuildingStandardPrice: 0,
  };
  const result = calcVacantPortionStandardPrice(item);
  expect(result).toBe(45_833_333);
});
```

모든 anchor는 `toBe()` 원단위 고정 (memory `feedback_pdf_example_test_anchoring`).

---

## 실행 순서 (Do — 시퀀셜)

1. **법령 1회 확인**: Do 착수 전 taxlaw.nts.go.kr에서 "사전법령해석재산2020-"(2021.06.04) 해석례 본문 직접 확인. 산식 불일치 시 Do 중단 → 설계 환류.
2. **타입 ①**: `inheritance-gift-estate.types.ts` 3필드 추가 + JSDoc(§61⑤ 미임대 주석).
3. **Zod ⑫**: `estate-item-schema.ts` `baseItemSchema`에 3필드 `z.number().nonnegative().optional()` 추가. roundtrip 테스트 갱신.
4. **Pre-Do anchor V-1-PRE**: `appurtenant-land-61.test.ts`에 현행 실패 anchor 추가. `npx vitest run` 실패 확보. 실패 미확인 시 Do 중단.
5. **엔진**: `calcVacantPortionBreakdown`(분해 단일 산식 소스) + `calcVacantPortionStandardPrice`(합 wrapper, 둘 다 export) 헬퍼 + `applyCollateralFloor` 비교식 수정. `extraCollateralRows` breakdown 확장 — 안분 floor 산식 인라인 복제 금지(분해 헬퍼 위임).
6. **anchor 통과**: `npx vitest run __tests__/tax-engine/property-valuation/` → V-1 GREEN, 기존 [AL-B1~AL-C1] 6건 회귀 없음.
7. **결과뷰 ⑦**: `extraCollateralRows` 3~4행 분해 확인. 상속 평가조서·별지 영향 점검.
8. **사이드바 ⑥**: 미임대 특례 3사이트에 **복제 금지**. result 도착 후 엔진 `valuatedAmount` 단일 위임 확인.
9. **UI ⑤** (아래 「⑤ UI 배치 결정」 참조): `EstateBodySupplementaryValuation.tsx`의 separateLandMode 블록(:138~161) 내부에 미임대 ToggleCard + DecimalInput×2(면적, `feedback_decimal_input` — 면적은 CurrencyInput 금지) + CurrencyInput×1(건물기준시가) + 자동계산 박스(sky tone). 노출 게이트 = 경로 B(`cat==="real_estate_building" && separateLandMode`). 임대료(`monthlyRent>0`) 입력 시에만 의미 있음을 hint로 안내. DecimalInput/CurrencyInput `data-testid` passthrough 확인(memory: testid 미전달 전례 있음).
10. **validation ⑧**: 면적 모순·반쪽 입력(V-8·V-9) 차단. 토지 분모 0 안내(V-10). 증여·상속 양쪽.
11. **normalize ③**: `category-change-policy.ts`의 실제 모델은 **보존 화이트리스트**(`pickPreservedFields`, `CLEAR_ON_CATEGORY_CHANGE` 不在). cross-group 전환(building→cash 등)은 base 화이트리스트(:68~73)에 3필드가 없어 자동 drop되므로 추가 작업 불필요. **그룹 내 전환**(building→apartment·building→land)은 `return { ...item, category }`(:64)로 3필드가 carry-over된다. 택1: (a) carry된 3필드는 `applyCollateralFloor`의 `method==="standard_price"` + `evaluateDetachedHouse`(real_estate_building 경로) 게이트 밖에서는 소비되지 않음(apartment·land 평가 경로 미진입)을 anchor로 실증해 무해 확정, 또는 (b) `pickPreservedFields` 그룹 내 보존 분기에서 `newCategory !== "real_estate_building"`일 때 3필드를 제거하는 분기 추가. **권장: (a)** — building 전용 필드이며 게이트 밖 미소비면 carry-over는 무해(잔존 데이터일 뿐 산식 미반영). 무해 실증 실패 시 (b).
12. **게이트**: `npx tsc --noEmit` 0건 + `npx vitest run __tests__/tax-engine/property-valuation/` + 증여·상속 회귀 + E2E(증여 상업용 건물 경로 B 미임대 + 상속 회귀 — `project_inheritance_stale_e2e_specs` 사전실패 6종 인지).
13. **검증**: 브라우저 수동(Network body에 3필드 도달 확인. `totalBuildingArea: 720` 확인).

---

## Scope Out (이 설계에서 의도적으로 제외)

| 항목 | 이유 |
|---|---|
| 사이드바 임대료환산 본체 dual-truth 해소 | `EstimatedValuePreview`·`TotalEstimatedValue`·`computeEffectiveValuation`·`resolveEstateItemValue` 4사이트 현행 §61⑤ 환산 Max 미구현 — 미임대 분기만 추가하면 `totalStd+vacantStd` 법령 부재값 발생. 별도 PR로 분리 |
| 층별 테이블 UI (A안) | 건물 층별 행 + 미임대 체크 + 건물기준시가 계산서 자동생성. 단일 면적 구조 벗어나는 신규 아키텍처 필요 |
| 국세청 건물기준시가 자동 계산기 연동 | v1.x 수동 입력 범위 |
| 경로 A 일괄고시(§61①3호) 미임대 안분 | 토지+건물 미분리 → 안분 분모 부재. 경로 B 한정 |
| §50⑧2호 — 토지·건물 소유자 상이 케이스 | 복잡성↑. "세무사 상담 권장" 안내로 처리 |
| 사전법령해석재산2020-(2021.06.04) 해석례 미발견 상태 완전 해소 | Do 착수 전 1회 확인 의무화로 대체 |

---

## 자가 점검 체크리스트 (Do 완료 보고 전)

- [ ] 케이스 매트릭스 V-1~V-11 전수 구현 또는 Scope Out 명시
- [ ] V-1 Pre-Do anchor 현행 실패 확보 → 구현 후 GREEN
- [ ] Zod `baseItemSchema` 3필드 추가 (⑫ — 침묵 strip 차단)
- [ ] `totalBuildingArea`, `vacantBuildingArea`, `vacantBuildingStandardPrice` 타입·Zod·validate 3중 동기화
- [ ] validation ⑧: 증여·상속 양쪽 모순 차단 + "UI 통과↔validate 차단" 모순 없음
- [ ] `useEffect → store` 미러링 없음 (memory `feedback_useeffect_store_mirror_forbidden`)
- [ ] 사이드바 ⑥ 복제 없음 (`calcRentalConversionValue` 미임대분 추가 grep 0건)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/` GREEN (기존 6건 회귀 없음)
- [ ] 브라우저 수동 확인: Network body 3필드 도달 + 결과 858,100,000 표시

---

## ⑤ UI 배치 결정 (구현안 단일 확정)

> 본 엔진 설계서에 §3-1 절(구현안 a/b/c)은 존재하지 않는다. 별도 UI 설계서
> (`rental-conversion-vacancy-portion.ui.design.md`)도 현재 미작성(`docs/02-design/features/` 확인 결과 부재).
> 입력 경로 미정의를 해소하기 위해 본 절에서 단일 안으로 확정한다.

검증한 실제 코드 구조(2026-06-22):
- 부수토지 개별공시지가(`appurtenantLandStandardPrice`) 입력 = `EstateBodySupplementaryValuation.tsx`의
  `separateLandMode` 게이트 블록(:138~161, `cat==="real_estate_building" && separateLandMode`).
- 임대 필드(`monthlyRent`·`leaseDeposit`) 입력 = `CollateralLeaseFields`(`EstateBodyRealEstate.tsx:492~`)에 분리.

**확정 안**: 미임대 3필드(`totalBuildingArea`·`vacantBuildingArea`·`vacantBuildingStandardPrice`)는
**`EstateBodySupplementaryValuation.tsx`의 separateLandMode(경로 B) 블록 내부**에 ToggleCard로 배치한다.

- 노출 게이트: `cat === "real_estate_building" && separateLandMode` (경로 B). 미임대분 토지 안분 분모인
  `appurtenantLandStandardPrice`와 같은 블록에 두어 세트 입력 UX를 보장.
- 위젯: 면적 2필드(`totalBuildingArea`·`vacantBuildingArea`)는 **DecimalInput**
  (memory `feedback_decimal_input` — 면적은 CurrencyInput 금지),
  건물 기준시가(`vacantBuildingStandardPrice`)는 **CurrencyInput**.
- hint: "미임대분은 임대료(`monthlyRent`)가 입력된 경우에만 §61⑤ 특례에 반영됩니다"
  (임대 필드는 별도 `CollateralLeaseFields`에 위치하므로 의존 관계를 hint로 안내).
- `data-testid` passthrough 확인 (memory: DecimalInput/CurrencyInput testid 미전달 전례 있음).

## UI 통합 위임

UI 명세는 별도 `rental-conversion-vacancy-portion.ui.design.md` 작성 예정(현재 미작성).
배치·게이트·위젯 선택은 위 「⑤ UI 배치 결정」을 단일 안으로 따른다.

엔진 시니어 책임 범위:
- input 타입 3필드 정의 (① + ⑫)
- `calcVacantPortionStandardPrice` 헬퍼 + `applyCollateralFloor` 비교식 수정
- `extraCollateralRows` breakdown 3~4행 확장
- validation ⑧ 엔진 측 모순 차단 패턴 정의

UI 시니어 책임 범위 (⑤⑥⑦ 제외 본 문서 기술):
- 「⑤ UI 배치 결정」 단일 안 구현: `EstateBodySupplementaryValuation.tsx` separateLandMode 블록 내부 ToggleCard + DecimalInput×2(면적) + CurrencyInput×1(건물기준시가)
- sky tone 자동계산 박스
- 사이드바 단일 위임 확인 (복제 금지)
- 결과뷰 breakdown 행 렌더
- E2E 스펙 작성
