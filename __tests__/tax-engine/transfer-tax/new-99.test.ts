// §99 신축주택 감면 (IMF 1차) — evaluator 단위 anchor (B-1~B-12)
//
// 법령: 법 §99 ①~④ + 령 §99 ①~④ (KoreanLaw 2026-06-11 원문 — 령 §99① 수식 텍스트 확정)
// 산식: 5년 내 = §95① 전액 / 5년 후 = (5년시점−취득시)÷(양도시−취득시) 안분
// 재개발·재건축 변형(령 §99①1호 단서): 5년 내도 안분, 분모 = 양도시 − 종전주택 취득시
import { describe, it, expect } from "vitest";
import { evaluateNew99, type New99Input } from "@/lib/tax-engine/transfer-reductions/new-99";

/** 기준 적격 입력 — 주건업 1998.9.1 계약·1999.3.1 취득 */
function baseInput(overrides?: Partial<New99Input>): New99Input {
  return {
    transferDate: new Date("2006-01-01"),
    acquisitionDate: new Date("1999-03-01"),
    contractDate: new Date("1998-09-01"),
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 160_000_000,
    standardPriceAtTransfer: 250_000_000,
    transferPrice: 500_000_000,
    exclusiveAreaSqm: 84,
    acquisitionType: "from_builder",
    ...overrides,
  };
}

describe("§99 evaluator anchor", () => {
  it("B-1: 5년 내 양도 — 양도소득금액 전액 차감 (령 §99①1호 본문)", () => {
    const r = evaluateNew99(baseInput({ transferDate: new Date("2003-01-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(true);
    expect(r.reducibleTransferIncome).toBe(100_000_000);
  });

  it("B-2: 5년 후 양도 — 안분 (160M−100M)÷(250M−100M) = 0.4 → 40,000,000 (령 §99①2호)", () => {
    const r = evaluateNew99(baseInput());
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.fiveYearRatio).toBeCloseTo(0.4, 10);
    expect(r.reducibleTransferIncome).toBe(40_000_000);
  });

  it("B-3: 부호 (−,+) → 0 / (+,−) → 전액 / (−,−) → 0 (§99의3 부호 정책 동형)", () => {
    expect(evaluateNew99(baseInput({ standardPriceAt5Years: 80_000_000 })).reducibleTransferIncome).toBe(0);
    expect(
      evaluateNew99(baseInput({ standardPriceAtTransfer: 50_000_000 })).reducibleTransferIncome,
    ).toBe(100_000_000);
    expect(
      evaluateNew99(baseInput({ standardPriceAt5Years: 80_000_000, standardPriceAtTransfer: 50_000_000 }))
        .reducibleTransferIncome,
    ).toBe(0);
  });

  it("B-4: 비국민주택·계약 1999.8.1 → OUT_OF_ACQUISITION_PERIOD (~1999.6.30)", () => {
    const r = evaluateNew99(baseInput({ contractDate: new Date("1999-08-01") }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("OUT_OF_ACQUISITION_PERIOD");
  });

  it("B-5: 국민주택 — 1999.8.1 적격 (~1999.12.31 연장) / 2000.1.1 불적격", () => {
    const ok = evaluateNew99(baseInput({ contractDate: new Date("1999-08-01"), isNationalHousing: true }));
    expect(ok.isEligible).toBe(true);
    const out = evaluateNew99(baseInput({ contractDate: new Date("2000-01-01"), isNationalHousing: true }));
    expect(out.isEligible).toBe(false);
  });

  it("B-6: 자기건설 — 사용승인일 1999.3.1 기준 적격 (1호)", () => {
    const r = evaluateNew99(
      baseInput({
        acquisitionType: "self_built",
        contractDate: undefined,
        usageApprovalDate: new Date("1999-03-01"),
        acquisitionDate: new Date("1999-03-01"),
      }),
    );
    expect(r.isEligible).toBe(true);
  });

  it("B-7: 고가주택 단서 — 계약 1998.9 기준 165㎡ 이상 AND 6억 초과 → HIGH_VALUE_HOUSE", () => {
    const hv = evaluateNew99(baseInput({ transferPrice: 700_000_000, exclusiveAreaSqm: 170 }));
    expect(hv.isEligible).toBe(false);
    expect(hv.ineligibleReasons.map((x) => x.code)).toContain("HIGH_VALUE_HOUSE");
    // 84㎡면 1998~2002.9 정의(면적 AND 가액)상 고가 아님
    const ok = evaluateNew99(baseInput({ transferPrice: 700_000_000, exclusiveAreaSqm: 84 }));
    expect(ok.isEligible).toBe(true);
  });

  it("B-8: 주건업 본인 / 매매계약일 입주 사실 → 각 배제", () => {
    expect(
      evaluateNew99(baseInput({ isHousingConstructionBusiness: true })).ineligibleReasons.map((x) => x.code),
    ).toContain("HOUSING_CONSTRUCTION_BUSINESS");
    expect(
      evaluateNew99(baseInput({ hasOccupancyAtContract: true })).ineligibleReasons.map((x) => x.code),
    ).toContain("OCCUPANCY_AT_CONTRACT");
  });

  it("B-9: 재개발·재건축 변형 — 5년 내도 안분: (250M−100M)÷(250M−50M) = 0.75 → 75,000,000", () => {
    const r = evaluateNew99(
      baseInput({
        transferDate: new Date("2003-01-01"),
        isRedevelopedNewHouse: true,
        previousHouseStdPriceAtAcquisition: 50_000_000,
      }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.redevelopedVariantApplied).toBe(true);
    expect(r.fiveYearRatio).toBeCloseTo(0.75, 10);
    expect(r.reducibleTransferIncome).toBe(75_000_000);
  });

  it("B-10: 변형 + 5년 후 — 분자 (160M−100M) ÷ 분모 (250M−50M) = 0.3 → 30,000,000", () => {
    const r = evaluateNew99(
      baseInput({ isRedevelopedNewHouse: true, previousHouseStdPriceAtAcquisition: 50_000_000 }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.fiveYearRatio).toBeCloseTo(0.3, 10);
    expect(r.reducibleTransferIncome).toBe(30_000_000);
  });

  it("B-11: 변형 ON + 종전주택 기준시가 미입력 → MISSING_PREVIOUS_STD_PRICE (자동 안분 금지)", () => {
    const r = evaluateNew99(baseInput({ isRedevelopedNewHouse: true }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_PREVIOUS_STD_PRICE");
  });

  it("B-12: 1998.5.21 이전 계약 해제 후 재계약 (령 §99②) → RECONTRACT_EXCLUDED", () => {
    const r = evaluateNew99(baseInput({ isRecontractExcluded: true }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("RECONTRACT_EXCLUDED");
  });

  it("양도일 ≤ 취득일 → TRANSFER_BEFORE_ACQUISITION", () => {
    const r = evaluateNew99(baseInput({ transferDate: new Date("1999-03-01") }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("TRANSFER_BEFORE_ACQUISITION");
  });

  it("5년 후 + 5년시점 기준시가 미입력 → MISSING_STD_PRICE", () => {
    const r = evaluateNew99(baseInput({ standardPriceAt5Years: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_STD_PRICE");
  });
});
