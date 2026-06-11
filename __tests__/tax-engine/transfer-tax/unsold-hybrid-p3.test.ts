// P3 — §98의3·§98의5·§98의6 하이브리드 evaluator 단위 anchor
import { describe, it, expect } from "vitest";
import {
  evaluateUnsold983,
  evaluateUnsold985,
  evaluateUnsold986,
  resolve985Rate,
  type Unsold983Input,
  type Unsold985Input,
  type Unsold986Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";

const D = (s: string) => new Date(s);
const STD = {
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 400_000_000, // 안분 0.5
};

function base983(overrides: Partial<Unsold983Input> = {}): Unsold983Input {
  return {
    transferDate: D("2022-08-01"),
    acquisitionDate: D("2009-12-01"),
    residencyType: "resident",
    houseType: "purchased",
    contractDate: D("2009-06-15"),
    isOutsideSeoulNotDesignated: true,
    isOverconcentration: false,
    isUnsoldConfirmed: true,
    isFirstContract: true,
    isNotOccupiedAtContract: true,
    isNotRecontract: true,
    transferIncome: 100_000_000,
    ...STD,
    ...overrides,
  };
}

function base985(overrides: Partial<Unsold985Input> = {}): Unsold985Input {
  return {
    transferDate: D("2022-08-01"),
    acquisitionDate: D("2011-06-15"),
    contractDate: D("2010-06-15"),
    priceReductionRatePct: 15,
    isNonCapitalUnsoldAtCutoff: true,
    isFirstContract: true,
    isNotOccupiedAtContract: true,
    isNotRecontract: true,
    transferIncome: 100_000_000,
    ...STD,
    ...overrides,
  };
}

function base986(overrides: Partial<Unsold986Input> = {}): Unsold986Input {
  return {
    transferDate: D("2022-08-01"),
    acquisitionDate: D("2011-09-01"),
    hoType: "seller_rented",
    contractDate: D("2011-08-01"),
    stdPriceSumAtBase: 550_000_000,
    floorAreaSqm: 84.5,
    isUnsoldAfterCompletion: true,
    isFirstContract: true,
    isNotOccupiedAfterCompletion: true,
    isNotRecontract: true,
    sellerRented2Years: true,
    transferIncome: 100_000_000,
    ...STD,
    ...overrides,
  };
}

describe("§98의3 — evaluateUnsold983", () => {
  it("P3-1: 5년 후 비과밀 — rate 1.0·공제 50,000,000·농특세 비과세", () => {
    const r = evaluateUnsold983(base983());
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("income_deduction");
    expect(r.taxReductionRate).toBe(1.0);
    expect(r.reducibleTransferIncome).toBe(50_000_000);
    expect(r.ruralSurtaxExempt).toBe(true);
  });

  it("P3-2: 과밀억제권역 — rate 0.6·공제 30,000,000 / 면적 초과 배제", () => {
    const r = evaluateUnsold983(
      base983({ isOverconcentration: true, landAreaSqm: 400, floorAreaSqm: 120 }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.taxReductionRate).toBe(0.6);
    // 안분 50,000,000 × 60% = 30,000,000
    expect(r.reducibleTransferIncome).toBe(30_000_000);
    const over = evaluateUnsold983(
      base983({ isOverconcentration: true, landAreaSqm: 700, floorAreaSqm: 120 }),
    );
    expect(over.ineligibleReasons.map((x) => x.code)).toContain("AREA_LIMIT_EXCEEDED");
  });

  it("P3-3: 시한 2-트랙 — 2009.2.20 계약: 거주자 적격 / 비거주자 배제 (3.16~)", () => {
    expect(evaluateUnsold983(base983({ contractDate: D("2009-02-20") })).isEligible).toBe(true);
    const nr = evaluateUnsold983(
      base983({ contractDate: D("2009-02-20"), residencyType: "nonresident_no_pe" }),
    );
    expect(nr.ineligibleReasons.map((x) => x.code)).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold983(
        base983({ contractDate: D("2009-03-16"), residencyType: "nonresident_no_pe" }),
      ).isEligible,
    ).toBe(true);
  });

  it("P3-3': 자기건설 — 착공·사용승인 모두 기간 내 / 승인 기간 외 배제 / 조합원 제외 토글", () => {
    const selfBuilt = base983({
      houseType: "self_built",
      contractDate: undefined,
      constructionStartDate: D("2009-03-01"),
      usageApprovalDate: D("2009-12-01"),
      isNotExcludedSelfBuilt: true,
    });
    expect(evaluateUnsold983(selfBuilt).isEligible).toBe(true);
    expect(
      evaluateUnsold983({ ...selfBuilt, usageApprovalDate: D("2010-03-01") }).ineligibleReasons.map(
        (x) => x.code,
      ),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold983({ ...selfBuilt, isNotExcludedSelfBuilt: false }).ineligibleReasons.map(
        (x) => x.code,
      ),
    ).toContain("SELF_BUILT_EXCLUDED");
  });
});

describe("§98의5 — evaluateUnsold985", () => {
  it("P3-4: 인하율 3단계 경계 — 10%=60% / 10.01%=80% / 20%=80% / 20.01%=100%", () => {
    expect(resolve985Rate(10)).toBe(0.6);
    expect(resolve985Rate(10.01)).toBe(0.8);
    expect(resolve985Rate(20)).toBe(0.8);
    expect(resolve985Rate(20.01)).toBe(1.0);
  });

  it("P3-4': 5년 후 인하율 15% — rate 0.8·공제 40,000,000·농특세 비과세", () => {
    const r = evaluateUnsold985(base985());
    expect(r.isEligible).toBe(true);
    expect(r.taxReductionRate).toBe(0.8);
    expect(r.reducibleTransferIncome).toBe(40_000_000);
    expect(r.ruralSurtaxExempt).toBe(true);
  });

  it("P3-4'': 계약 시한 — 2011.4.30 적격 / 2011.5.1 배제 / 인하율 미입력 배제", () => {
    expect(evaluateUnsold985(base985({ contractDate: D("2011-04-30") })).isEligible).toBe(true);
    expect(
      evaluateUnsold985(base985({ contractDate: D("2011-05-01") })).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold985(base985({ priceReductionRatePct: undefined })).ineligibleReasons.map((x) => x.code),
    ).toContain("MISSING_PRICE_REDUCTION_RATE");
  });
});

describe("§98의6 — evaluateUnsold986", () => {
  it("P3-5: 1호 5년 내 — tax_amount 50% / 2호 5년 내 — 혜택 없음 (NO_WITHIN_5Y_BENEFIT)", () => {
    const within = base986({ transferDate: D("2014-01-01") });
    const ho1 = evaluateUnsold986(within);
    expect(ho1.isEligible).toBe(true);
    expect(ho1.effectCategory).toBe("tax_amount");
    expect(ho1.taxReductionRate).toBe(0.5);
    // 2호 + 임대 60개월 충족(상속 합산) + 5년 내 양도 → 세액감면 없음 (법 ① "제1호 한정")
    const ho2 = evaluateUnsold986({
      ...within,
      hoType: "buyer_rented",
      rentalContractDate: D("2011-10-01"),
      rentalStartDate: D("2011-11-01"), // ~2014-01-01 = 26개월
      inheritedRentalMonths: 40, // 합산 66개월 — 임대 요건 충족
    });
    expect(ho2.isEligible).toBe(false);
    expect(ho2.ineligibleReasons.map((x) => x.code)).toContain("NO_WITHIN_5Y_BENEFIT");
  });

  it("P3-6: 기준시가 합계 6억·면적 149 한도 (초과 배제)", () => {
    expect(
      evaluateUnsold986(base986({ stdPriceSumAtBase: 600_000_000 })).isEligible,
    ).toBe(true);
    expect(
      evaluateUnsold986(base986({ stdPriceSumAtBase: 600_000_001 })).ineligibleReasons.map((x) => x.code),
    ).toContain("STD_SUM_LIMIT_EXCEEDED");
    expect(
      evaluateUnsold986(base986({ floorAreaSqm: 149 })).isEligible,
    ).toBe(true);
    expect(
      evaluateUnsold986(base986({ floorAreaSqm: 149.5 })).ineligibleReasons.map((x) => x.code),
    ).toContain("AREA_LIMIT_EXCEEDED");
  });

  it("P3-6': 2호 5년 후 — 임대 60개월 충족 시 50% 공제 25,000,000 / 임대계약 2012년 배제", () => {
    const ho2 = base986({
      hoType: "buyer_rented",
      sellerRented2Years: undefined,
      rentalContractDate: D("2011-10-01"),
      rentalStartDate: D("2011-11-01"), // ~양도일 2022-08-01 = 129개월
    });
    const r = evaluateUnsold986(ho2);
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("income_deduction");
    // 안분 50,000,000 × 50% = 25,000,000
    expect(r.reducibleTransferIncome).toBe(25_000_000);
    expect(r.ruralSurtaxExempt).toBe(false);
    expect(
      evaluateUnsold986({ ...ho2, rentalContractDate: D("2012-01-01") }).ineligibleReasons.map((x) => x.code),
    ).toContain("RENTAL_CONTRACT_TOO_LATE");
    // 임대 60개월 미만 — 개시 2018년
    expect(
      evaluateUnsold986({ ...ho2, rentalStartDate: D("2018-06-01") }).ineligibleReasons.map((x) => x.code),
    ).toContain("RENTAL_PERIOD_SHORT");
  });
});
