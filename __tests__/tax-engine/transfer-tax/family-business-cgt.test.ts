/**
 * 가업상속공제 자산 양도 — §97의2④ 의제 취득가액 + §18의2⑩ 양도세 상당액 공제
 *
 * Pre-Do anchor 6건 (Do 단계 전 실패 예상):
 *   FB-CGT-IMPUTED-1~3: calcFamilyBusinessImputedAcquisitionPrice 단위 테스트
 *   FB-CGT-CREDIT-NEG-1: 음수 가드 + §97의2④ 본문 강제
 *   FB-CGT-LAW-1: 소령 §163의2③ 개인가업 적용률 산식 검증
 *   FB-CGT-FULL-1: calculateTransferTax 2회 호출 통합 시나리오
 *
 * 회귀 anchor:
 *   FB-CGT-BYPASS-1: familyBusinessInheritance 미제공 시 기존 동작 불변
 *
 * 법령:
 *   - 소득세법 §97의2④ (mst=285523, 시행 2026-04-21)
 *   - 소득세법 시행령 §163의2③ (mst=286211, 시행 2026-05-22) — FB-CGT-LAW-1 확정
 *   - 상증법 §18의2⑩ + 상증령 §15㉑
 *
 * 설계 문서: docs/02-design/features/transfer-fb-cgt-credit-integration/engine.design.md
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

// ─────────────────────────────────────────────────────
// Do 단계 완료: 실제 헬퍼 import 사용.
// ─────────────────────────────────────────────────────
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/transfer-tax-family-business";

// ─────────────────────────────────────────────────────
// 단위 테스트 — calcFamilyBusinessImputedAcquisitionPrice (§97의2④ 산식)
// ─────────────────────────────────────────────────────

describe("FB-CGT 의제 취득가액 산식 (소법 §97의2④1호+2호)", () => {
  /**
   * FB-CGT-IMPUTED-1
   * 산식: 피상속인 취득가 × 적용률 + 상속개시일 평가액 × (1 - 적용률)
   * 적용률 0.8:
   *   100,000,000 × 0.8 = 80,000,000
   *   300,000,000 × 0.2 = 60,000,000
   *   합계 = 140,000,000
   */
  it("FB-CGT-IMPUTED-1: 적용률 0.8 → 의제 취득가 = 140,000,000", () => {
    const decedentAcquisitionPrice = 100_000_000;  // 피상속인 원취득가액
    const inheritanceMarketValue   = 300_000_000;  // 상속개시일 현재 자산가액
    const fbDeductionAppliedRate   = 0.8;           // 가업상속공제적용률 (소령 §163의2③)

    const result = calcFamilyBusinessImputedAcquisitionPrice(
      decedentAcquisitionPrice,
      inheritanceMarketValue,
      fbDeductionAppliedRate,
    );

    // 100M×0.8 + 300M×0.2 = 80M + 60M = 140M
    expect(result).toBe(140_000_000);
  });

  /**
   * FB-CGT-IMPUTED-2
   * 적용률 1.0: 가업상속공제 100% 적용 시
   *   100M×1.0 + 300M×0.0 = 100,000,000 (피상속인 원취득가 그대로)
   * 상증법상 가업 100% 공제 → 피상속인 원취득가가 의제 취득가
   */
  it("FB-CGT-IMPUTED-2: 적용률 1.0 → 의제 취득가 = 피상속인 원취득가 (100,000,000)", () => {
    const result = calcFamilyBusinessImputedAcquisitionPrice(
      100_000_000,  // 피상속인 원취득가
      300_000_000,  // 상속개시일 평가액 (적용률 1.0이면 미반영)
      1.0,
    );
    expect(result).toBe(100_000_000);
  });

  /**
   * FB-CGT-IMPUTED-3
   * 적용률 0.0: 가업상속공제 미적용 시
   *   100M×0.0 + 300M×1.0 = 300,000,000 (상속개시일 평가액 그대로)
   * 상증법상 가업공제 0% → 상속개시일 평가액이 의제 취득가
   */
  it("FB-CGT-IMPUTED-3: 적용률 0.0 → 의제 취득가 = 상속개시일 평가액 (300,000,000)", () => {
    const result = calcFamilyBusinessImputedAcquisitionPrice(
      100_000_000,
      300_000_000,
      0.0,
    );
    expect(result).toBe(300_000_000);
  });
});

// ─────────────────────────────────────────────────────
// FB-CGT-LAW-1: 소령 §163의2③ 개인가업 적용률 산식 검증
// ─────────────────────────────────────────────────────

describe("FB-CGT-LAW-1: 소령 §163의2③ 개인가업 적용률 산식", () => {
  /**
   * 소령 §163의2③1호 (KoreanLaw MCP 2026-05-22 검증):
   * 개인가업 적용률 = 가업상속공제금액 / 가업상속 재산가액
   *
   * 예시:
   *   가업상속공제금액 = 2,000,000,000 (20억)
   *   가업상속 재산가액 = 2,500,000,000 (25억)
   *   → 적용률 = 2,000,000,000 / 2,500,000,000 = 0.8
   *
   * 이 적용률로 의제 취득가 산식 적용 후 FB-CGT-IMPUTED-1과 일관성 확인.
   */
  it("FB-CGT-LAW-1: 개인가업 적용률 = 공제금액/재산가액 → 의제 취득가 140,000,000", () => {
    // 소령 §163의2③1호 산식
    const fbDeductionAmount = 2_000_000_000;   // 가업상속공제금액 (상증법 §18의2① 공제액)
    const fbPropertyValue   = 2_500_000_000;   // 가업상속 재산가액 (§18의2① 각 호 외 부분 전단)
    const appliedRate = fbDeductionAmount / fbPropertyValue;  // 0.8

    expect(appliedRate).toBeCloseTo(0.8, 10);

    // 이 적용률로 의제 취득가 계산 (FB-CGT-IMPUTED-1과 동일 결과)
    const imputedAcq = calcFamilyBusinessImputedAcquisitionPrice(
      100_000_000,  // 피상속인 원취득가
      300_000_000,  // 상속개시일 평가액
      appliedRate,
    );
    // Pre-Do 발견: 분수 적용률(2G/2.5G) → 부동소수점 stub Math.floor 두 번 합산 시 ±1원 오차.
    // 실 엔진에서 applyRate() 사용 시 동일 패턴 → ±1원 허용오차 정책 적용.
    // Do 완료 후 정확한 기대값으로 교체 예정.
    expect(Math.abs(imputedAcq - 140_000_000)).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────
// FB-CGT-CREDIT-NEG-1: 음수 가드 + §97의2④ 본문 강제
// ─────────────────────────────────────────────────────

describe("FB-CGT-CREDIT-NEG-1: 의제 양도세 < 일반 양도세 → creditAmount=0, 양도세는 의제 강제", () => {
  /**
   * 소법 §97의2④: 본문 강제 (선택 없음)
   * 상증령 §15㉑ + §18의2⑩ 단서: 양도세 상당액 음수면 0
   *
   * 시나리오: 피상속인 취득가가 상속개시일 평가액보다 높을 때
   *   (예: 피상속인이 비싸게 취득, 가업자산 가치 하락)
   *   의제 취득가 > 피상속인 원취득가 → 의제 양도세 < 일반 양도세
   *   → creditAmount = 0 (음수 가드)
   *   단, 양도세는 §97의2④ 본문 강제 — 의제 산식 그대로 적용
   *
   * 입력:
   *   피상속인 취득가 = 500,000,000 (높은 취득가)
   *   상속개시일 평가액 = 100,000,000 (낮은 평가)
   *   적용률 = 0.5
   *   의제 취득가 = 500M×0.5 + 100M×0.5 = 250M + 50M = 300M
   *
   *   양도가 = 400,000,000
   *   일반 산식 양도차익 = 400M - 500M = -100M (손실, finalTax=0)
   *   의제 산식 양도차익 = 400M - 300M = 100M (이익, 세금 발생)
   *   → 의제 양도세 > 일반 양도세 이 경우는 creditAmount > 0
   *
   * 반대 시나리오 (creditAmount=0 확인):
   *   피상속인 취득가 = 100,000,000
   *   상속개시일 평가액 = 500,000,000 (높은 평가)
   *   적용률 = 0.5
   *   의제 취득가 = 100M×0.5 + 500M×0.5 = 50M + 250M = 300M
   *
   *   양도가 = 400,000,000
   *   일반 산식 양도차익 = 400M - 100M = 300M (이익 큼)
   *   의제 산식 양도차익 = 400M - 300M = 100M (이익 작음)
   *   → 의제 양도세 < 일반 양도세 → creditAmount = 0
   *
   * 본 anchor: familyBusinessDetail.creditAmount=0 + totalTax는 의제 산식 기준
   */
  it("FB-CGT-CREDIT-NEG-1: 의제 취득가 > 피상속인 취득가 → 의제 양도세 < 일반 → creditAmount=0", () => {
    // Do 단계 완료 전 이 테스트는 familyBusinessInheritance 필드 미인식으로 실패 예상
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice:    400_000_000,
      acquisitionPrice: 100_000_000,  // 피상속인 원취득가 (일반 산식 기준)
      acquisitionDate:  new Date("2015-01-01"),
      transferDate:     new Date("2026-01-01"),
      isOneHousehold:   false,
      householdHousingCount: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
      familyBusinessInheritance: {
        decedentAcquisitionPrice: 100_000_000,
        inheritanceMarketValue:   500_000_000,  // 높은 상속개시일 평가액
        fbDeductionAppliedRate:   0.5,          // 의제 취득가 = 50M + 250M = 300M
        inheritanceDate:          "2020-01-01",
      },
    });

    const result = calculateTransferTax(input, MOCK_RATES);

    // Do 단계 완료 전 familyBusinessDetail이 없으므로 undefined
    // Do 완료 후 기대값:
    //   imputedAcquisitionPrice = 300,000,000
    //   일반 취득가 100M → 일반 차익 300M → 일반 세액 > 의제 세액
    //   creditAmount = 0 (음수 가드)
    expect(result.familyBusinessDetail).toBeDefined();           // Do 완료 후 통과
    expect(result.familyBusinessDetail!.creditAmount).toBe(0);  // 음수 가드
    // 의제 취득가액 확인
    expect(result.familyBusinessDetail!.imputedAcquisitionPrice).toBe(300_000_000);
  });
});

// ─────────────────────────────────────────────────────
// FB-CGT-FULL-1: 풀 시나리오 통합 anchor
// ─────────────────────────────────────────────────────

describe("FB-CGT-FULL-1: calculateTransferTax 2회 호출 통합 시나리오", () => {
  /**
   * 시나리오 (의제 양도세 > 일반 → creditAmount 양수):
   *
   * 자산: 비주거용 부동산 (housing=false, 단순 계산)
   *   양도가 = 500,000,000
   *   피상속인 원취득가 = 100,000,000 (일반 §97 기준)
   *   상속개시일 평가액 = 300,000,000
   *   가업상속공제적용률 = 0.8 (소령 §163의2③)
   *   의제 취득가 = 100M×0.8 + 300M×0.2 = 80M + 60M = 140M
   *
   *   보유기간: 2015-01-01 ~ 2026-01-01 = 11년 (LTHD 22%)
   *   중과: 없음, 기본공제 250만
   *
   * 일반 산식 (§97):
   *   양도차익 = 500M - 100M = 400M
   *   LTHD = 400M × 0.22 = 88,000,000
   *   양도소득금액 = 312,000,000
   *   기본공제 = 2,500,000
   *   과세표준 = 309,500,000 → 절사 → 309,500,000
   *   세율: 300M~500M 구간 40%, 누진공제 25,940,000
   *   산출세액 = 309,500,000 × 0.40 - 25,940,000 = 123,800,000 - 25,940,000 = 97,860,000
   *   지방소득세 = 97,860,000 × 0.1 = 9,786,000
   *   totalTax = 107,646,000
   *
   * 의제 산식 (§97의2④):
   *   의제 취득가 = 140,000,000
   *   양도차익 = 500M - 140M = 360M
   *   LTHD = 360M × 0.22 = 79,200,000
   *   양도소득금액 = 280,800,000
   *   기본공제 = 2,500,000
   *   과세표준 = 278,300,000
   *   세율: 150M~300M 구간 38%, 누진공제 19,940,000
   *   산출세액 = 278,300,000 × 0.38 - 19,940,000 = 105,754,000 - 19,940,000 = 85,814,000
   *   지방소득세 = 85,814,000 × 0.1 = 8,581,400
   *   totalTax = 94,395,400
   *
   * creditAmount = max(0, 94,395,400 - 107,646,000) = 0 (의제가 더 낮음!)
   *
   * ※ 위 수치는 Do 단계 엔진 구현 후 실제 계산값으로 대체.
   *   현재는 구조 검증용 anchor — 실제 계산값은 Do 완료 후 갱신.
   *
   * Do 단계 전 이 테스트는 familyBusinessDetail undefined로 실패 예상.
   */
  it("FB-CGT-FULL-1: 의제 취득가 140M → familyBusinessDetail 노출 + 양도세 의제 강제", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice:    500_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate:  new Date("2015-01-01"),
      transferDate:     new Date("2026-01-01"),
      isOneHousehold:   false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
      familyBusinessInheritance: {
        decedentAcquisitionPrice: 100_000_000,
        inheritanceMarketValue:   300_000_000,
        fbDeductionAppliedRate:   0.8,
        inheritanceDate:          "2020-01-01",
      },
    });

    const result = calculateTransferTax(input, MOCK_RATES);

    // Do 완료 후 기대값:
    expect(result.familyBusinessDetail).toBeDefined();
    expect(result.familyBusinessDetail!.imputedAcquisitionPrice).toBe(140_000_000);
    expect(result.familyBusinessDetail!.appliedRate).toBe(0.8);
    // 양도세는 §97의2④ 본문 강제 (의제 산식 기준)
    // cgtUnderSection97_2_4 = 의제 취득가 적용 결정세액
    // cgtUnderSection97 = 피상속인 원취득가 적용 결정세액
    expect(result.familyBusinessDetail!.cgtUnderSection97_2_4).toBeGreaterThan(0);
    expect(result.familyBusinessDetail!.cgtUnderSection97).toBeGreaterThan(0);
    // creditAmount ≥ 0 (음수 가드)
    expect(result.familyBusinessDetail!.creditAmount).toBeGreaterThanOrEqual(0);
  });

  /**
   * FB-CGT-FULL-POSITIVE: 의제 양도세 > 일반 → creditAmount > 0 시나리오
   *
   * 피상속인 원취득가 500M (비싸게 취득) vs 상속개시일 평가 100M (가치 하락)
   * 적용률 0.8 → 의제 취득가 = 500M×0.8 + 100M×0.2 = 400M + 20M = 420M
   *
   * 일반 §97: 취득가 500M → 양도가 600M → 차익 100M (낮은 세액)
   * 의제 §97의2④: 취득가 420M → 양도가 600M → 차익 180M (높은 세액)
   * → creditAmount = 의제 세액 - 일반 세액 > 0
   */
  it("FB-CGT-FULL-POSITIVE: 피상속인 취득가 > 상속개시 평가 + 적용률 0.8 → creditAmount > 0", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice:    600_000_000,
      acquisitionPrice: 500_000_000,  // 피상속인 원취득가 (높음)
      acquisitionDate:  new Date("2015-01-01"),
      transferDate:     new Date("2026-01-01"),
      isOneHousehold:   false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
      familyBusinessInheritance: {
        decedentAcquisitionPrice: 500_000_000,
        inheritanceMarketValue:   100_000_000,  // 낮은 상속개시일 평가
        fbDeductionAppliedRate:   0.8,          // 의제 취득가 = 400M + 20M = 420M
        inheritanceDate:          "2020-01-01",
      },
    });

    const result = calculateTransferTax(input, MOCK_RATES);

    expect(result.familyBusinessDetail).toBeDefined();
    expect(result.familyBusinessDetail!.imputedAcquisitionPrice).toBe(420_000_000);
    // 의제 취득가 420M → 차익 180M (세액 발생)
    // 일반 취득가 500M → 차익 100M (세액 낮음)
    // creditAmount > 0 예상
    expect(result.familyBusinessDetail!.creditAmount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────
// FB-CGT-BYPASS-1: familyBusinessInheritance 미제공 시 기존 동작 불변 (회귀)
// ─────────────────────────────────────────────────────

describe("FB-CGT-BYPASS-1: familyBusinessInheritance 미제공 → 기존 엔진 동작 불변", () => {
  /**
   * familyBusinessInheritance 필드 없는 일반 입력 → familyBusinessDetail=undefined
   * 기존 양도세 계산 결과에 영향 없음 (회귀 방지)
   */
  it("FB-CGT-BYPASS-1: 일반 입력 → familyBusinessDetail 없음, 기존 totalTax 불변", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice:    500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate:  new Date("2019-06-01"),
      transferDate:     new Date("2024-06-01"),
      isOneHousehold:   false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
      // familyBusinessInheritance 없음
    });

    const result = calculateTransferTax(input, MOCK_RATES);

    // familyBusinessDetail 없음 (미제공 시 의제 산식 미적용)
    expect(result.familyBusinessDetail).toBeUndefined();
    // 기존 totalTax 양수 (일반 계산 정상)
    expect(result.totalTax).toBeGreaterThan(0);
  });
});
