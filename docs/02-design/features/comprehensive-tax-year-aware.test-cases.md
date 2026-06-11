# 종합부동산세 과세연도별 파라미터 — 테스트 케이스 상세

> 메인 설계 문서: `comprehensive-tax-year-aware.engine.design.md`
> 테스트 파일 대상: `__tests__/tax-engine/comprehensive/year-aware-params.test.ts`

---

## T-YA-01 ~ T-YA-13: 사례집 anchor (원단위 toBe)

출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 PDF 실측.

```ts
// 파일: __tests__/tax-engine/comprehensive/year-aware-params.test.ts

// T-YA-01: 사례1 2022 귀속 일반1주택
it("T-YA-01: 2022 일반 1주택 (공시 9.5억)", () => {
  const result = calculateComprehensiveTax({
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [{ propertyId: "p1", assessedValue: 950_000_000 }],
  });
  expect(result.basicDeduction).toBe(600_000_000);
  expect(result.fairMarketRatio).toBe(0.60);
  expect(result.taxBase).toBe(210_000_000);    // (9.5억−6억)×60% = 2.1억, 만원 미만 절사 불필요
  expect(result.appliedRate).toBe(0.006);      // 2022 일반 최저구간(3억 이하) = 0.6% — 사례1 실측 (현행 0.5%와 다름)
  expect(result.calculatedTax).toBe(1_260_000);
  // 재산세 비율안분 공제 504,000 → 결정 756,000 (별도 anchor)
});

// T-YA-02: 사례2 2022 귀속 일반1주택 세부담 상한 150%
it("T-YA-02: 2022 일반 1주택 세부담 상한 (전년 포함)", () => {
  // 21년 세액 입력 시 150% 상한 적용
  // PDF anchor: 22년 산출 2,070,000; 상한액 = 21년총세액×150%
  const result = calculateComprehensiveTax({
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [{ propertyId: "p1", assessedValue: 980_000_000 }], // 9.8억
    previousYearTotalTax: 1_326_000,  // 21년 총세액 (사례2 PDF 역산)
  });
  expect(result.taxCap?.capRate).toBe(1.50);
  expect(result.taxCap?.isApplied).toBe(true);
});

// T-YA-04: 사례4 2022 귀속 1세대1주택 (공시 52.2억)
// anchor: 과표 24.72억×1.2%−3,000,000 = 26,664,000
it("T-YA-04: 2022 1세대1주택 (합산 52.2억)", () => {
  const result = calculateComprehensiveTax({
    assessmentYear: 2022,
    isOneHouseOwner: true,
    properties: [
      { propertyId: "p1", assessedValue: 2_490_000_000 }, // 24.9억
      { propertyId: "p2", assessedValue: 2_730_000_000 }, // 27.3억
    ],
  });
  expect(result.basicDeduction).toBe(1_100_000_000);        // 11억 (구법 §8①)
  expect(result.taxBase).toBe(2_472_000_000);               // (52.2억−11억)×60%, 만원 미만 절사
  expect(result.appliedRate).toBe(0.012);                   // 1.2% (12억~50억 구간)
  expect(result.progressiveDeduction).toBe(3_000_000);      // PDF 사례4 직접 확인
  expect(result.calculatedTax).toBe(26_664_000);            // 24.72억×1.2%−3,000,000
});

// T-YA-08: 사례8 2022 귀속 조정대상지역 2주택 세부담 300% 상한
// anchor: 사례8 PDF "해당연도 세부담 상한 = 나 × 300%" 직접 명시
it("T-YA-08: 2022 다주택 300% 세부담 상한 적용", () => {
  const result = calculateComprehensiveTax({
    assessmentYear: 2022,
    isOneHouseOwner: false,
    isMultiHouseInAdjustedArea: true,
    previousYearTotalTax: 2_079_000,  // 21년 총세액 (사례8 PDF)
    properties: [
      { propertyId: "p1", assessedValue: 1_050_000_000 }, // 서울 서초구
      { propertyId: "p2", assessedValue:   840_000_000 }, // 서울 강남구
    ],
  });
  expect(result.taxCap?.capRate).toBe(3.00);
  expect(result.taxCap?.isApplied).toBe(true);
});

// T-YA-08b: 사례8 2022 귀속 다주택 산출세액 anchor
// 과표 = (1.05억+0.84억−0.6억)×60% = 11.875억×60% = ... 단, 기본공제는 합산에서 차감
// 과표 = (1.05+0.84−0.6)억 = 12.9억 → ×60% = 7.74억? 재확인 필요
// 실측 anchor: 11.875억 × 2.2% − 4,800,000 = 21,325,000
it("T-YA-08b: 2022 다주택 세율 2.2% anchor", () => {
  // 과표 11.875억 시나리오 (실제 입력값은 Do 단계에서 확정)
  const taxBase = 1_187_500_000;
  // 직접 세율 함수 테스트
  const { calculatedTax } = calcHousingBrackets(taxBase, BRACKETS_2022_MULTI_HOUSE);
  expect(calculatedTax).toBe(21_325_000); // 11.875억 × 2.2% − 4,800,000 = 21,325,000
});

// T-YA-09: 사례9 2022 귀속 3주택 이상
// anchor: 과표 34.83억 → 3.6% − 누진공제 11,100,000
it("T-YA-09: 2022 3주택이상 세율 3.6% anchor", () => {
  const taxBase = 3_483_000_000;
  const { calculatedTax } = calcHousingBrackets(taxBase, BRACKETS_2022_MULTI_HOUSE);
  // 34.83억 × 3.6% − 11,100,000 = 125,388,000 − 11,100,000 = 114,288,000
  // (PDF 사례9 anchor — Do 단계에서 원단위 확인 필요)
  expect(calculatedTax).toBe(125_388_000 - 11_100_000);
});

// T-YA-21: 사례21 2022 귀속 조정2주택 21년 직전연도 분 anchor
// anchor: 21년 과표 11.875억 × 2.2% − 4,800,000 = 21,325,000 (사례21 PDF 직접 확인)
it("T-YA-21: 2021 다주택 세율 동일 anchor (사례21 21년분)", () => {
  const taxBase = 1_187_500_000;
  const { calculatedTax } = calcHousingBrackets(taxBase, BRACKETS_2021_MULTI_HOUSE);
  expect(calculatedTax).toBe(21_325_000);
});
```

---

## T-YA-PARAMS: 연도별 파라미터 헬퍼 단위 테스트

```ts
describe("getComprehensiveParams", () => {
  // FMR 테이블 — 시행령 §2의4 KoreanLaw 직접 확인
  it("시행령 §2의4 FMR 테이블 전수 검증", () => {
    expect(getComprehensiveParams(2019).fairMarketRatioHousing).toBe(0.85);
    expect(getComprehensiveParams(2020).fairMarketRatioHousing).toBe(0.90);
    expect(getComprehensiveParams(2021).fairMarketRatioHousing).toBe(0.95);
    expect(getComprehensiveParams(2022).fairMarketRatioHousing).toBe(0.60);
    expect(getComprehensiveParams(2023).fairMarketRatioHousing).toBe(0.60);
    expect(getComprehensiveParams(2025).fairMarketRatioHousing).toBe(0.60);
  });

  it("2021 토지 FMR 95%", () => {
    expect(getComprehensiveParams(2021).fairMarketRatioLand).toBe(0.95);
  });

  it("2022 토지 FMR 100%", () => {
    expect(getComprehensiveParams(2022).fairMarketRatioLand).toBe(1.00);
  });

  // 기본공제 — §8① KoreanLaw 확인 + PDF 사례집 실측
  it("2021 기본공제 6억/11억, FMR 95%, 상한 150%/300%", () => {
    const p = getComprehensiveParams(2021);
    expect(p.basicDeductionGeneral).toBe(600_000_000);
    expect(p.basicDeductionOneHouse).toBe(1_100_000_000);
    expect(p.fairMarketRatioHousing).toBe(0.95);
    expect(p.taxCapRateGeneral).toBe(1.50);
    expect(p.taxCapRateMultiHouseAdjusted).toBe(3.00);
  });

  it("2022 기본공제 6억/11억, FMR 60%/100%, 상한 150%/300%", () => {
    const p = getComprehensiveParams(2022);
    expect(p.basicDeductionGeneral).toBe(600_000_000);
    expect(p.basicDeductionOneHouse).toBe(1_100_000_000);
    expect(p.fairMarketRatioHousing).toBe(0.60);
    expect(p.fairMarketRatioLand).toBe(1.00);
    expect(p.taxCapRateGeneral).toBe(1.50);
    expect(p.taxCapRateMultiHouseAdjusted).toBe(3.00);
  });

  it("2023 기본공제 9억/12억, FMR 60%/100%, 상한 150% 단일", () => {
    const p = getComprehensiveParams(2023);
    expect(p.basicDeductionGeneral).toBe(900_000_000);
    expect(p.basicDeductionOneHouse).toBe(1_200_000_000);
    expect(p.fairMarketRatioHousing).toBe(0.60);
    expect(p.fairMarketRatioLand).toBe(1.00);
    expect(p.taxCapRateGeneral).toBe(1.50);
    expect(p.taxCapRateMultiHouseAdjusted).toBeUndefined(); // §10① 삭제됨
  });

  it("2025도 default(2023+) 적용", () => {
    const p = getComprehensiveParams(2025);
    expect(p.basicDeductionGeneral).toBe(900_000_000);
    expect(p.basicDeductionOneHouse).toBe(1_200_000_000);
  });

  it("2020(미지원) → 2021 파라미터 하한 클램핑", () => {
    // getComprehensiveParams는 테이블에 없는 연도 요청 시
    // 테이블 최저 연도(2021) 파라미터를 반환 (에러 미발생)
    const p = getComprehensiveParams(2020);
    expect(p.basicDeductionGeneral).toBe(600_000_000); // 2021과 동일
  });
});
```

---

## T-YA-SYNC: 2023+ 기존 엔진 회귀 없음 확인

2023 귀속 연도에서 기존 테스트 93건이 모두 통과해야 함.
`getComprehensiveParams(2023)` → 기존 `COMPREHENSIVE_CONST` 하드코딩 값과 동일.

```ts
it("2023+ 현행 파라미터 = 기존 COMPREHENSIVE_CONST 동일", () => {
  const p = getComprehensiveParams(2023);
  // 기존 COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL = 900_000_000
  expect(p.basicDeductionGeneral).toBe(900_000_000);
  // 기존 COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING = 0.60
  expect(p.fairMarketRatioHousing).toBe(0.60);
  // 기존 HOUSING_BRACKETS[0].rate = 0.005
  expect(p.housingRates.generalBrackets[0].rate).toBe(0.005);
  // 기존 HOUSING_BRACKETS[6].rate = 0.027
  expect(p.housingRates.generalBrackets[6].rate).toBe(0.027);
});
```

---

## 미결 anchor (Do 단계 전 확인 필요)

1. **T-YA-01 적용 세율**: 과표 2.1억은 3억 이하 구간 → 0.5%? 산출 1,260,000 = 2.1억×0.6% → 이는 3억~6억(0.7%) 아니고 "3억초과~6억 이하 0.6%" 구간임 → 2022 일반 세율 구간 첫 번째 bucket 확인 필요 (2.1억 → 0.005 = 1,050,000? 또는 0.006 = 1,260,000?).
   역산: 1,260,000 ÷ 210,000,000 = 0.006 (0.6%) → 첫 bucket이 0.5%가 아닌 0.6%일 가능성.
   → KoreanLaw 2022 귀속 §9①1호 원문 확인 필요 (구법 = 현행과 다른 첫 구간).

2. **T-YA-08b 입력값 확정**: 과표 11.875억을 만드는 공시가격 조합 → (합산 공시 - 6억) × 60% = 11.875억 → 합산 공시 = 11.875억/0.6 + 6억 = 19.791667억 + 6억 = 25.791667억. 즉 두 주택 공시가격 합이 약 25.79억. Do 단계에서 정확한 입력값 확정 후 anchor.

3. **사례1 재산세 비율안분 공제 504,000**: 이를 만드는 재산세 부과세액·과세표준·종부세 과세표준 역산 필요.
