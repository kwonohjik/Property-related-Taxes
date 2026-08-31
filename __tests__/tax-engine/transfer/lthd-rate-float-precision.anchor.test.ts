/**
 * anchor — 장기보유특별공제율 합산의 부동소수 오차 (D10-06)
 *
 * ## 결함
 * 공제율을 double로 더한 뒤 `applyRate`(= `Math.floor(amount × rate)`)에 넘기면,
 * 합이 의도 공제율보다 **1 ulp 작아지는 조합**에서 공제액이 **1원 과소**산정된다(납세자 불리).
 *
 * ## 단방향이다
 * 상향 드리프트 조합(0.20+0.10 = 0.30000000000000004 등)은 곱한 결과가 정수의 **위쪽**으로만
 * 밀리므로 `Math.floor`가 변하지 않는다. 리뷰의 전수 스캔(1,600만 케이스)에서 과다공제 0건.
 *
 * ## §97의4만의 문제가 아니다 — 표2 일반 경로가 훨씬 흔하다
 * `calcLongTermRate`가 `holdingPart + residencePart`(각 `Math.min(y × 0.04, 0.40)`)를
 * double로 더한다. (보유 9년 + 거주 1년 = 0.39999999999999997) 같은 조합에서 같은 1원 과소가
 * 난다. 1세대1주택 표2는 §97의4보다 훨씬 흔한 경로다.
 *
 * ⇒ 국소 패치가 아니라 **「공제율 → 공제액」 적용 지점 공통**으로 정수 분수연산
 *   (`applyFairMarketRatio` = `applyRateFraction(amount, round(rate×10000), 10000)`)으로 통일한다.
 *   그 헬퍼는 이미 같은 이유(공정시장가액비율 0.70의 double 표현)로 저장소에 존재한다.
 *
 * ⚠️ `Math.round`는 **비율 상수를 정수 분자로 바꾸는 데만** 쓴다 — 세액에 쓰는 것이 아니므로
 *    「세법은 floor」 원칙 위반이 아니다(`applyFairMarketRatio` 주석과 같은 논거).
 */
import { describe, it, expect } from "vitest";
import { applyRate, applyFairMarketRatio } from "@/lib/tax-engine/tax-utils";
import { calcLongTermHoldingDeduction } from "@/lib/tax-engine/transfer-tax-helpers";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

describe("문제 재현 — double 합산이 1 ulp 아래로 민다", () => {
  it("표2: 보유 9년(36%) + 거주 1년(4%) = 0.4가 되어야 한다", () => {
    const drifted = Math.min(9 * 0.04, 0.4) + Math.min(1 * 0.04, 0.4);
    expect(drifted).not.toBe(0.4); // 0.39999999999999997
    expect(drifted).toBeLessThan(0.4);
  });

  it("§97의4: 보유 9년(18%) + 추가 2% = 0.2가 되어야 한다", () => {
    const drifted = Math.min(9 * 0.02, 0.3) + 0.02;
    expect(drifted).not.toBe(0.2); // 0.19999999999999998
  });
});

describe("🔴 applyRate는 그 오차를 1원 과소로 전파한다", () => {
  it("양도차익 10억 × 40% = 4억인데 399,999,999가 된다", () => {
    const rate = Math.min(9 * 0.04, 0.4) + Math.min(1 * 0.04, 0.4);
    expect(applyRate(1_000_000_000, rate)).toBe(399_999_999);
  });

  it("양도차익 10억 × 20% = 2억인데 199,999,999가 된다", () => {
    const rate = Math.min(9 * 0.02, 0.3) + 0.02;
    expect(applyRate(1_000_000_000, rate)).toBe(199_999_999);
  });
});

describe("🔴 정수 분수연산은 정확값을 낸다", () => {
  it("표2 조합 → 정확히 4억", () => {
    const rate = Math.min(9 * 0.04, 0.4) + Math.min(1 * 0.04, 0.4);
    expect(applyFairMarketRatio(1_000_000_000, rate)).toBe(400_000_000);
  });

  it("§97의4 조합 → 정확히 2억", () => {
    const rate = Math.min(9 * 0.02, 0.3) + 0.02;
    expect(applyFairMarketRatio(1_000_000_000, rate)).toBe(200_000_000);
  });

  it("상향 드리프트 조합에서도 결과가 같다 — 회귀 없음", () => {
    // 보유 10년(20%) + 추가 10% = 0.30000000000000004
    const up = Math.min(10 * 0.02, 0.3) + 0.1;
    expect(applyRate(1_000_000_000, up)).toBe(300_000_000);
    expect(applyFairMarketRatio(1_000_000_000, up)).toBe(300_000_000);
  });

  it("드리프트가 없는 조합도 값이 같다", () => {
    for (const [gain, rate] of [
      [500_000_000, 0.3],
      [123_456_789, 0.24],
      [1_000_000_000, 0.8],
    ] as const) {
      expect(applyFairMarketRatio(gain, rate)).toBe(applyRate(gain, rate));
    }
  });
});

describe("🔴 엔진 — 표2 일반 경로에서 실제 공제액이 1원 회복된다", () => {
  const rates = parseRatesFromMap(makeMockRates());
  const D = (x: string) => new Date(`${x}T00:00:00`);

  /**
   * 보유 9년(36%) + 거주 8년(32%) = 68%. 양도차익 10억이면 정확히 6.8억.
   *
   * ⚠️ 「보유 9년 + 거주 1년」 조합은 이 경로로 만들 수 없다 — 표2 게이트가
   *    `table2ResidenceYears >= 2`를 요구한다(D2-01에서 확인한 술어).
   *    실제로 그 픽스처로 시작했다가 rate가 0.16(표1)으로 나와 조합을 바꿨다.
   */
  function run() {
    const input = baseTransferInput({
      transferPrice: 3_000_000_000,
      transferDate: D("2023-01-01"),
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2013-12-01"), // 보유 9년
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 96, // 거주 8년
    } as Any);
    return calcLongTermHoldingDeduction(
      1_000_000_000,
      input as Any,
      rates.longTermHoldingRules,
      false,
      false,
    );
  }

  it("공제율 자체는 여전히 드리프트한다 — 고친 것은 「적용」이다", () => {
    expect(run().rate).toBe(0.6799999999999999);
  });

  it("🔴 그럼에도 공제액은 정확히 6.8억이다", () => {
    expect(
      run().deduction,
      "double 합산을 applyRate에 넘기면 679,999,999가 된다",
    ).toBe(680_000_000);
  });
});
