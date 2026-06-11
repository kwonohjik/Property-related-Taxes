// P2 — §98의7·§99의2 하이브리드 evaluator 단위 anchor
//
// H7-*: §98의7 (내국인·9억·2012.9.24~12.31) / H2-*: §99의2 (6억 OR 85㎡·유형 3분기·확인날인)
import { describe, it, expect } from "vitest";
import {
  evaluateUnsold987,
  evaluateUnsold992,
  type Unsold987Input,
  type Unsold992Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid";

const D = (s: string) => new Date(s);

/** §98의7 적격 기본 입력 — 5년 후 양도 (안분 0.5) */
function base987(overrides: Partial<Unsold987Input> = {}): Unsold987Input {
  return {
    transferDate: D("2022-08-01"),
    acquisitionDate: D("2013-01-15"),
    contractDate: D("2012-10-15"),
    acquisitionPrice: 550_000_000,
    isUnsoldAtCutoff: true,
    isFirstContract: true,
    isNotOccupiedAtContract: true,
    isNotRecontract: true,
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

/** §99의2 적격 기본 입력 — new_or_unsold, 5년 후 양도 */
function base992(overrides: Partial<Unsold992Input> = {}): Unsold992Input {
  return {
    transferDate: D("2022-08-01"),
    acquisitionDate: D("2013-06-15"),
    houseType: "new_or_unsold",
    contractDate: D("2013-06-01"),
    acquisitionPrice: 550_000_000,
    exclusiveAreaSqm: 84.5,
    meetsHouseTypeRequirement: true,
    isNotRecontract: true,
    hasConfirmationSeal: true,
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

describe("§98의7 — evaluateUnsold987", () => {
  it("H7-1: 5년 후 양도 — income_deduction·안분 0.5·공제 50,000,000", () => {
    const r = evaluateUnsold987(base987());
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.effectCategory).toBe("income_deduction");
    expect(r.fiveYearRatio).toBe(0.5);
    expect(r.reducibleTransferIncome).toBe(50_000_000);
    expect(r.taxReductionRate).toBe(1.0);
  });

  it("H7-1': 5년 내 양도 — tax_amount·reducible 0 (감면세액 단계 위임)", () => {
    const r = evaluateUnsold987(base987({ transferDate: D("2016-01-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(true);
    expect(r.effectCategory).toBe("tax_amount");
    expect(r.reducibleTransferIncome).toBe(0);
    expect(r.reductionAmount).toBe(0); // calcReductions 경로에서 채움
  });

  it("H7-2: 9억 경계 — 900,000,000 적격 / +1원 배제", () => {
    expect(evaluateUnsold987(base987({ acquisitionPrice: 900_000_000 })).isEligible).toBe(true);
    const over = evaluateUnsold987(base987({ acquisitionPrice: 900_000_001 }));
    expect(over.isEligible).toBe(false);
    expect(over.ineligibleReasons.map((x) => x.code)).toContain("PRICE_LIMIT_EXCEEDED");
  });

  it("H7-3: 계약 시한 경계 — 2012.9.24·12.31 적격 / 9.23·2013.1.1 배제 (UTC)", () => {
    expect(evaluateUnsold987(base987({ contractDate: D("2012-09-24") })).isEligible).toBe(true);
    expect(evaluateUnsold987(base987({ contractDate: D("2012-12-31") })).isEligible).toBe(true);
    expect(
      evaluateUnsold987(base987({ contractDate: D("2012-09-23") })).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold987(base987({ contractDate: D("2013-01-01") })).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
  });

  it("H7-4: 자격 토글 4종 미확인 — 사유 4건 수집", () => {
    const r = evaluateUnsold987(
      base987({
        isUnsoldAtCutoff: false,
        isFirstContract: false,
        isNotOccupiedAtContract: false,
        isNotRecontract: false,
      }),
    );
    const codes = r.ineligibleReasons.map((x) => x.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "NOT_UNSOLD_AT_CUTOFF",
        "NOT_FIRST_CONTRACT",
        "OCCUPIED_AT_CONTRACT",
        "RECONTRACT_EXCLUDED",
      ]),
    );
  });

  it("H7-5: 내국인 아님 — NOT_DOMESTIC / 기본값(undefined)은 내국인 취급", () => {
    expect(
      evaluateUnsold987(base987({ isDomestic: false })).ineligibleReasons.map((x) => x.code),
    ).toContain("NOT_DOMESTIC");
    expect(evaluateUnsold987(base987({ isDomestic: undefined })).isEligible).toBe(true);
  });

  it("H7-6: 5년 후 기준시가 누락 — MISSING_STD_PRICE", () => {
    const r = evaluateUnsold987(base987({ standardPriceAt5Years: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_STD_PRICE");
  });
});

describe("§99의2 — evaluateUnsold992", () => {
  it("H2-1: 5년 내 양도 — tax_amount (이중 혜택 차단: reducible 0)", () => {
    const r = evaluateUnsold992(base992({ transferDate: D("2017-06-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("tax_amount");
    expect(r.reducibleTransferIncome).toBe(0);
  });

  it("H2-2: 6억 OR 85㎡ — (7억·84) 적격 / (5억·100) 적격 / (7억·86) 배제", () => {
    expect(
      evaluateUnsold992(base992({ acquisitionPrice: 700_000_000, exclusiveAreaSqm: 84 })).isEligible,
    ).toBe(true);
    expect(
      evaluateUnsold992(base992({ acquisitionPrice: 500_000_000, exclusiveAreaSqm: 100 })).isEligible,
    ).toBe(true);
    const both = evaluateUnsold992(base992({ acquisitionPrice: 700_000_000, exclusiveAreaSqm: 86 }));
    expect(both.isEligible).toBe(false);
    expect(both.ineligibleReasons.map((x) => x.code)).toContain("PRICE_AND_AREA_EXCEEDED");
  });

  it("H2-2': 경계 포함 — 6억 정확 OR 85㎡ 정확은 적격", () => {
    expect(
      evaluateUnsold992(base992({ acquisitionPrice: 600_000_000, exclusiveAreaSqm: 200 })).isEligible,
    ).toBe(true);
    expect(
      evaluateUnsold992(base992({ acquisitionPrice: 2_000_000_000, exclusiveAreaSqm: 85 })).isEligible,
    ).toBe(true);
  });

  it("H2-3: 1세대1주택자 주택 — 토글 미확인 배제 (령③)", () => {
    const r = evaluateUnsold992(
      base992({ houseType: "existing_one_house", meetsOneHouseSellerRequirement: false }),
    );
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("NOT_ONE_HOUSE_SELLER");
    expect(
      evaluateUnsold992(
        base992({ houseType: "existing_one_house", meetsOneHouseSellerRequirement: true }),
      ).isEligible,
    ).toBe(true);
  });

  it("H2-4: 오피스텔 사후요건 미충족 — 배제 (령②4호)", () => {
    const r = evaluateUnsold992(base992({ isOfficetel: true, meetsOfficetelRequirement: false }));
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("OFFICETEL_REQUIREMENT_NOT_MET");
    expect(
      evaluateUnsold992(base992({ isOfficetel: true, meetsOfficetelRequirement: true })).isEligible,
    ).toBe(true);
  });

  it("H2-5: 확인 날인 미보유 — 배제 (법④ 적용 게이트)", () => {
    const r = evaluateUnsold992(base992({ hasConfirmationSeal: false }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("NO_CONFIRMATION_SEAL");
  });

  it("H2-6: 자기건설 — 사용승인 시한(2013.4.1~12.31) + 조합원 제외 토글", () => {
    const selfBuilt = base992({
      houseType: "self_built",
      contractDate: undefined,
      usageApprovalDate: D("2013-06-01"),
      isNotExcludedSelfBuilt: true,
    });
    expect(evaluateUnsold992(selfBuilt).isEligible).toBe(true);
    expect(
      evaluateUnsold992({ ...selfBuilt, usageApprovalDate: D("2014-01-01") }).ineligibleReasons.map(
        (x) => x.code,
      ),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold992({ ...selfBuilt, isNotExcludedSelfBuilt: false }).ineligibleReasons.map(
        (x) => x.code,
      ),
    ).toContain("SELF_BUILT_EXCLUDED");
  });

  it("H2-7: 계약 시한 경계 — 2013.4.1·12.31 적격 / 3.31·2014.1.1 배제 (UTC)", () => {
    expect(evaluateUnsold992(base992({ contractDate: D("2013-04-01") })).isEligible).toBe(true);
    expect(evaluateUnsold992(base992({ contractDate: D("2013-12-31") })).isEligible).toBe(true);
    expect(
      evaluateUnsold992(base992({ contractDate: D("2013-03-31") })).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    expect(
      evaluateUnsold992(base992({ contractDate: D("2014-01-01") })).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
  });

  it("H2-8: 5년 후 양도 — 안분 0.5·공제 50,000,000 (령 §99의2⑦ → §40① 준용)", () => {
    const r = evaluateUnsold992(base992());
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("income_deduction");
    expect(r.reducibleTransferIncome).toBe(50_000_000);
  });
});
