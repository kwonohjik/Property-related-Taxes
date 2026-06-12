# 종부세 사례12 재현 — 엔진 설계 (engine.design)

> Plan: `docs/01-plan/features/comprehensive-case12-replica.plan.md`
> 갭: G-1·G-2(안분 FMR) · G-3(ⓐ 직접 계산) · G-4(직전연도 상당액) · G-5(Min 130%) · G-6(서식 echo)
> 원칙: 정수 연산(분수 정수 — `feedback_applyrate_fractional_rate_one_won_error`) · 법령 상수(`legal-codes/comprehensive.ts`) · property-tax.ts **무변경**

---

## 1. 케이스 인벤토리 (Do 진입 게이트 — 행≥1 충족)

| # | 케이스 | 입력 요지 | 기대값 (원단위) | anchor |
|---|---|---|---|---|
| M-01 | 사례12 본 케이스 | 2022·1주택·공시 15억·67세·'12.1.1 취득·직전연도 자동(14억) | calculatedTax 1,440,000 / credit 432,000 / 세액공제 705,600 / taxBeforeCap 302,400 / capAmount 4,864,500 / determinedHousingTax 302,400 / 농특세 60,480 | C12-A2·A4 |
| M-02 | 직접입력 동치 | M-01에서 `previousYearTotalTax=3,243,000` 직접 | determinedHousingTax 302,400 (동일) | C12-B1 |
| M-03 | 직전연도 미입력 | M-01에서 직전연도 생략 | taxCap undefined·Min 생략·302,400 | C12-B2 |
| M-04 | 상한 발동 | M-01에서 직접입력 150,000 | capAmount 225,000 → cappedTax = max(min(302,400, 225,000−2,070,000), 0) = **0** (현행 `applyTaxCap` 산식 실측 — `comprehensive-tax-helpers.ts:136~140`) | C12-B3 |
| M-05 | 2021 1주택 안분 FMR | 2021·1주택·공시 14억 | 안분 분자 = 과표×**60%**×0.4% (p.194 ⑧ 684,000 패턴) | C12-A5 |
| M-06 | 2024+ 1주택 | 2024·1주택 | FMR 60%·공제 12억·현행 세율 | C12-B4 |
| M-07 | 2022 일반 | 사례1 입력 (9.5억, 비1주택) | credit 504,000 / 결정 756,000 — G-1 전후 불변 | C12-A6 |
| M-08 | 다주택 중과 | 사례9 입력 | calculatedTax 28,080,000 불변 (기존 YA-3) | 기존 |
| M-09 | 상한 300% | 2022·조정 2주택·직접입력 | capRate 3.0 (기존 로직 — 회귀만) | 기존 |
| M-10 | 법인 | 2022·corporate_general | 1주택 분기 미진입 → FMR 60% | C12-B5 |
| M-11 | 과세표준 0 | 2022·1주택·공시 10억 | isSubjectToHousingTax=false | 기존 |
| M-12 | Min 발동 | 2022·1주택·해당연도 재산세>직전 상당×130% | ⓐ = 직전×130% 선택 — fixture는 직전 공시를 낮춰 구성 | C12-B6 |
| M-13 | 2023+ 구간별 FMR | 2023·1주택 | §109의2 KoreanLaw 확정 후 — 미확정 시 60% 유지 + TODO | 보류 |

---

## 2. 타입 확장 (`lib/tax-engine/types/comprehensive.types.ts`)

### 2-1. Input — 직전연도 자동계산 옵트인 (G-4)

```ts
/** 세부담상한 직전연도 상당액 자동계산 입력 (별지 제5호서식 부표).
 *  previousYearTotalTax(직접입력)와 상호배타 — 둘 다 오면 Zod refine 차단.
 *  v1 범위: 직전연도 단일 주택군(일반/1세대1주택). 직전연도 다주택 중과는 직접입력 모드 사용. */
export interface PreviousYearAutoInput {
  assessedValue: number;        // 직전연도 공시가격 합산 (합산배제 후, 원)
  isOneHouseOwner: boolean;     // 직전연도 1세대1주택 여부
  birthDate?: Date;             // 고령자 공제 (직전연도 과세기준일 기준 재판정)
  acquisitionDate?: Date;       // 장기보유 공제 (동일)
}
// ComprehensiveTaxInput에 추가:
//   previousYearAuto?: PreviousYearAutoInput;
```

### 2-2. Result — 서식 echo (G-6) — **전부 number/Record, Map 금지**

```ts
/** 직전연도 상당액 echo — 별지 5호 ⑭⑮⑯ + 부표 ①~⑫ */
export interface PreviousYearEquivalentResult {
  propertyTaxEquiv: number;        // ⑭ = 부표에선 ⑦ (표준세율 재계산 상당액)
  comprehensiveTaxEquiv: number;   // ⑮ = 부표 ⑫
  total: number;                   // ⑯ = ⑭+⑮
  detail: {                        // 부표 (1)(2) 칸 1:1
    assessedValue: number;         // ①
    basicDeduction: number;        // ② (1주택 시 추가공제 포함 합계 — 부표는 병기 표기)
    fairMarketRatio: number;       // ③ (2021 = 0.95)
    taxBase: number;               // ④
    appliedRate: number;           // ⑤
    calculatedTax: number;         // ⑥
    stdTaxNumerator: number;       // ⑧ (과표×직전연도 재산세FMR×0.4%)
    stdTaxDenominator: number;     // ⑨ (공시가격 과표 표준세율 누진)
    creditAmount: number;          // ⑩ = ⑦×⑧/⑨
    oneHouseDeductionRate: number; // ⑪ 공제율 (0.50)
    oneHouseDeductionAmount: number; // ⑪ 금액 (513,000)
  };
}

// HousingTaxResult(메인 result) 추가 필드:
//   taxAfterPropertyCredit: number;        // 신고서 ⑥ = calculatedTax − creditAmount (음수 시 0)
//   taxBeforeCap: number;                  // 별지5호 ⑬ = ⑥ − 세액공제
//   currentYearTotalEquivalent?: number;   // 별지5호 ⑲ = propertyTaxCredit.totalPropertyTax + taxBeforeCap (taxCap 존재 시만)
//   previousYearEquivalent?: PreviousYearEquivalentResult;  // 자동 모드일 때만

// OneHouseDeductionResult 추가:
//   seniorAmount: number;    // 신고서 ⑦ = floor(base × seniorRate)
//   longTermAmount: number;  // 신고서 ⑧ = deductionAmount − seniorAmount  ← 80% cap 발동 시에도
//                            //   합 = deductionAmount 보장 (잔액 흡수 — feedback_floor_residual_absorption)

// HousingTaxResult 추가 (UI 검토 U-1 — b3 ⑤·b5 ③ 칸, UI의 params 파생 금지):
//   oneHouseExtraDeduction?: number;  // 1세대1주택 추가공제 = basicDeduction − 일반공제 (1주택 시만)
```

### 2-3. TaxCapResult 호환

`previousYearTotalTax: number`(입력 echo)는 자동 모드에서 `previousYearEquivalent.total`을 주입 — 필드 의미 변화 없음(직접입력 경로 그대로).

---

## 3. 연도 파라미터 확장 (`lib/tax-engine/data/comprehensive-historical.ts`)

```ts
// ComprehensiveYearParams에 추가:
//   /** 재산세 비율안분·ⓐ 계산용 재산세 FMR (§4의3). [기본 60%, 1주택 특례는 별도 필드] */
//   propertyFmrGeneral: number;            // 전 연도 0.60
//   propertyFmrOneHouse?: number;          // 2022 = 0.45 (사례12 실측). 2021 없음(60%).
//                                          // 2023+: §109의2 KoreanLaw 확정 후 (M-13 보류 — 미확정 시 미설정=60%)

export function getPropertyFmrForProration(year: number, isOneHouseOwner: boolean): number;
// = params.propertyFmrOneHouse(있고 isOneHouseOwner) ?? params.propertyFmrGeneral
```

데이터 주도(연도 엔트리 필드) — 함수 내 연도 하드코딩 분기 금지. 법령 인용은 `legal-codes/comprehensive.ts`에 `PROPERTY_FMR_ONE_HOUSE_2022: "지방세법 시행령 §109의2"` 상수 추가(P0 검증 후 확정 표기).

---

## 4. 알고리즘 변경 (`lib/tax-engine/comprehensive-tax.ts`)

### 4-1. Step 6 안분 (G-1·G-2·G-3·G-5)

```
현행: propertyFMR = PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING (0.60 고정)   [:320]
변경: propertyFMR = getPropertyFmrForProration(assessmentYear, isOneHouseOwner)

⑤ 분자 (정수): floor(taxBase × round(FMR×100) × 4 / 100_000)
    2022 1주택: 240,000,000 × 45 × 4 / 100,000 = 432,000  ✓
⑥ 분모: floor(includedAssessedValue × round(FMR×100) / 100) → calcHousingTax(…, false).tax
    floor(15억×45/100) = 675,000,000 → 570,000 + 3.75억×0.4% = 2,070,000  ✓
ⓐ (G-3·G-5):
    standalonePropertyTax = denominatorStdTax            // 동일 과표·표준세율 → 2,070,000
    if (직전연도 상당액 존재) ⓐ = min(standalonePropertyTax, floor(prevPropertyTaxEquiv × capPct / 100))
    else                      ⓐ = standalonePropertyTax
    ※ Min의 정체 = **2022년 당시 지방세법 §122 주택 세부담상한** (재해석 — E-2):
       구간 105%(공시 3억 이하)/110%(3~6억)/130%(6억 초과) — capPct는 공시가격 구간 분기.
       사례12: 15억 > 6억 → 130%. 현행 property-tax.ts는 §122 단서(주택 배제, :263 — 현행법)라
       미지원 → 과세연도 ≤2022 한정으로 comprehensive 쪽에서 적용. 2023+ 과세연도는 Min 생략
       (주택 상한 폐지·과표상한제 §110의2 대체). 구간·연도 경계는 KoreanLaw §122 신구대조 P1 확정.
    ※ 현행 totalPropertyTaxAmount(calculatePropertyTax 합계)는 ⓐ에서 제외 —
      물건별 재산세 echo·totalPropertyTax(참고 표시)에만 유지. property-tax.ts 무변경.
```

**주의(D-2)**: ⓐ=ⓒ(분모)인 것은 단일 물건·전 물건 과세 케이스의 동치 — 합산배제 혼재 시 ⓐ는 "과세 대상 주택 합산 재산세 상당액"으로 동일 산식이 유지됨(분모와 같은 베이스). 사례13(합산배제 혼재) 회귀는 기존 anchor로 방어.

### 4-2. Step 5.5 신설 — 직전연도 상당액 (신규 모듈 `lib/tax-engine/comprehensive-prior-year.ts`)

```
calcPreviousYearEquivalent(auto: PreviousYearAutoInput, currentYear: number): PreviousYearEquivalentResult
  py = currentYear − 1
  p  = getComprehensiveParams(py)                     // 2021: FMR 95%, 공제 6억/11억, 0.6% 표
  기준일 = new Date(py, 5, 1)                          // 직전연도 과세기준일 6.1 (연령·보유 재판정)
  ① assessedValue → ② 공제(1주택 시 11억) → ④ floor((①−②)×95/100) 만원 미만 절사
  ⑤·⑥ 일반 누진표 적용 (v1: 단일 주택군 — 다주택 미지원)
  ⑦ 재산세상당 = calcHousingTax(floor(①×60/100), ①, false).tax        // 직전연도 재산세 FMR 60%
  ⑧ = floor(④×60×4/100_000)  ⑨ = ⑦과 동일 베이스 → ⑩ = floor(⑦×⑧/⑨)
  ⑪ 세액공제 = (⑥−⑩) × combinedRate(기준일 재판정)                     // 기존 공제율 함수 재사용
  ⑫ = ⑥−⑩−⑪
  반환 total = ⑦ + ⑫
검산(사례12): ④ 285,000,000 → ⑥ 1,710,000 → ⑦ 2,730,000 → ⑧ 684,000 → ⑩ 684,000
             → ⑪ 50% = 513,000 → ⑫ 513,000 → total 3,243,000  ✓
```

연령·보유 공제율 함수는 기존 1세대1주택 공제 로직에서 **기준일 인자화로 추출 재사용** (dual-truth 금지 — `feedback_ui_engine_dual_truth_avoidance`).

### 4-3. Step 7 세부담상한 입력 결선

```
prevTotal = input.previousYearTotalTax ?? previousYearEquivalent?.total
(둘 다 undefined → taxCap undefined — 현행 동작)
(둘 다 입력 → Zod refine 차단 — ⑫)
applyTaxCap(taxBeforeCap, ⓐ, prevTotal, capRate)
  ※ E-3: 두 번째 인자(재산세)는 기존 totalPropertyTaxAmount가 아니라 **ⓐ**로 교체 —
    별지 5호 ⑲ = ⑧(ⓐ) + ⑬(taxBeforeCap) 정합. 산식 자체는 현행 유지
    (cappedTax = max(min(⑬, ⑳−⑧), 0) ≡ ⑬ − max(0, ⑲−⑳)).
```

### 4-4. echo 채움 (G-6)

`taxAfterPropertyCredit`(기존 중간변수 :345 노출), `taxBeforeCap`, `currentYearTotalEquivalent = ⓐ + taxBeforeCap`(taxCap 산정 시), `seniorAmount`/`longTermAmount`(공제 함수 내부에서 분리 + 잔액 흡수).

---

## 5. API 동기화 (⑫⑬⑭)

- ⑫ Zod (`lib/validators/comprehensive-input.ts`): `previousYearAuto` 객체 스키마(`assessedValue` int 양수 필수, 날짜 YYYY-MM-DD) + **refine: `previousYearTotalTax`와 동시 입력 차단**
- ⑬ `lib/calc/comprehensive-api.ts`: 자동 모드 시 body에 `previousYearAuto` 포함, 직접 모드 시 기존 필드만
- ⑭ route `toEngineInput()`: `previousYearAuto.birthDate`·`acquisitionDate` → `toOptionalDate()` (`lib/api/date-coerce.ts`)

---

## 6. 설계 결정·확인 필요 (Design 단계 잔여)

| ID | 항목 | 결정/보류 |
|---|---|---|
| D-1 | ~~M-04 cappedTax 산식~~ | **해소** — `applyTaxCap` 실측 완료 (`comprehensive-tax-helpers.ts:128~150`), M-04 기대값 0 확정 |
| D-2 | ⓐ 전환(G-3)이 사례13(합산배제 혼재)·토지분 안분에 주는 영향 | 주택분만 변경 — 토지분 `propertyTaxCredit`는 별도 경로로 무영향 (`comprehensive-land-aggregate.ts` — **grep 확인 필요**) |
| D-3 | Min 130%의 "직전연도 재산세" 베이스 — 자동 모드는 상당액(⑦) 사용, 고지서 override 미제공 (v1 단순화 — 탄력세율 없음 전제) | 채택. 리스크 §plan 11 기재 |
| D-4 | §4의2 vs §4의3 조문 드리프트 | P1 KoreanLaw 확정 후 타입·엔진 주석 통일 |
| D-5 | 직전연도 공제 기준 연도별 차이(2021 추가공제 11억 병기 양식) | `getComprehensiveParams(py)` 데이터가 이미 보유 — 신규 분기 불필요 |
| D-6 | ⓐ 표준세율 직접 계산의 한계 — §9③ 법문은 "부과된 세액"이나, 특례세율(1주택 공시 9억 이하 0.05%p 인하) 미반영 | 채택·한계 명시: 특례세율 대상(9억 이하 1주택)은 1주택 공제 11~12억으로 **종부세 비과세** → 실영향 희박. 사례12(15억, 특례 비대상)와 정합 |
| D-7 | §122 상한 구간(105/110/130%)은 물건별 공시가격 기준 — 합산 베이스 단일 구간은 다물건 시 부정확 | v1: 단일 물건(사례12) 정합 우선. 다물건+직전연도 자동 모드 조합은 경고 메시지 + 직접입력 유도 |

---

## 7. 파일 예산 (800줄 정책)

| 파일 | 예상 | 비고 |
|---|---|---|
| `comprehensive-prior-year.ts` 신규 | ~180줄 | 순수 함수 + 검산 주석 |
| `comprehensive-tax.ts` 518→~560줄 | +42 | Step 5.5 호출·Step 6 치환·echo |
| `data/comprehensive-historical.ts` 202→~225줄 | +23 | 필드 2종 + 헬퍼 |
| `types/comprehensive.types.ts` 493→~545줄 | +52 | §2 타입 |
| `__tests__/tax-engine/comprehensive-case12.test.ts` 신규 | ~300줄 | fixture + anchor 14건 |

---

## 8. 회귀 전략

- **G-3·E-3 파급 (High)**: ⓐ 표준세율 전환 + `applyTaxCap` 재산세 인자 교체는 기존 직접입력 경로의 `propertyTaxCredit.totalPropertyTax`·`creditAmount`·`taxCap` anchor에 영향 가능 — Pre-Do에서 `comprehensive-tax-integration.test.ts`·`comprehensive-special-cases.test.ts`의 해당 anchor를 **수정 전 실측**해 변동 목록 확보 → 법령 정합(§4의3 표준세율) 기준으로 anchor 갱신 판정 (`feedback_anchor_correction_legal_priority`)
- 기존 YA-1·2·3 (`comprehensive-year-aware.test.ts`)은 `calculatedTax`(안분 전) 검증 → G-1 무영향 통과 유지
- C12-A6로 사례1 공제액(504,000) anchor **신설** 후 G-1 전후 불변 확인
- `previousYearTotalTax` 직접입력 경로 기존 테스트 (`comprehensive-tax-integration.test.ts` 등) 전체 통과 필수
- 사례4 공제액 변동(G-1로 1주택 27억의 안분 공제 변화)은 사례집 원본 실측 후 anchor 추가 (**확인 필요** — plan §11)
