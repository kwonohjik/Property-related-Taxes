/**
 * 「조세특례제한법」 §77⑨·§77의3③ — 상속받은 토지등은 피상속인이 취득한 날을 그 조문의 취득일로 본다.
 *
 * 종전에는 상속개시일(자산 취득일)로 「사업인정고시일부터 소급하여 2년 이전에 취득」(§77①)·「지정일 이전 취득」(§77의3)을
 * 판정해, 피상속인이 2000년에 취득한 토지를 2024년에 상속받아 수용돼도 감면 0이었다(재실측 별건).
 *
 * §77⑨의 다른 축(「소득세법」 §97의2① 적용 증여 = 증여자 취득일)은 이월과세 시나리오 A가 취득일 자체를 증여자 취득일로
 * 바꿔 다시 계산하므로 이미 반영돼 있다 — 아래 이월과세 케이스가 그 경로를 잠근다.
 * §77의2(대토보상)에는 같은 의제 규정이 없다(조특령 §73에도 없음) — 상속개시일 기준 유지.
 *
 * 토지 단건 · 취득 3억 → 양도 8억 · 상속개시(취득일) 2024-01-10 · 양도 2026-06-30 · 사업인정고시 2025-06-01(소급 2년 = 2023-06-01).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const PE = [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: new Date("2025-06-01") }];
const GB = [{ type: "gb_designated_land", branch: "in_zone", purchaseRoute: "negotiated", designationDate: new Date("2005-01-01"), triggerDate: new Date("2026-03-01"), residedFromAcqToTrigger: true }];
const RL = [{ type: "replacement_land_comp", cashCompensation: 0, replacementLandComp: 800_000_000, businessApprovalDate: new Date("2025-06-01") }];

const land = (o: Partial<TransferTaxInput> & Record<string, unknown>): TransferTaxInput =>
  baseTransferInput({
    propertyType: "land", transferPrice: 800_000_000, transferDate: new Date("2026-06-30"),
    acquisitionDate: new Date("2024-01-10"), acquisitionPrice: 300_000_000, isOneHousehold: false,
    householdHousingCount: 0, residencePeriodMonths: 0, useEstimatedAcquisition: false,
    transferCause: "public_expropriation", ...o,
  } as never);
const inherit = (decedent?: string) => ({
  acquisitionCause: "inheritance" as const,
  ...(decedent ? { decedentAcquisitionDate: new Date(decedent) } : {}),
});

describe("§77⑨ — 상속 토지의 §77① 취득일 = 피상속인 취득일", () => {
  it("피상속인 2000 취득 · 상속개시 2024-01-10 → 감면 성립(종전 0)", () => {
    const r = calculateTransferTax(land({ reductions: PE as never, ...inherit("2000-01-01") }), rates);
    expect(r.publicExpropriationDetail?.isEligible).toBe(true);
    // 산출세액 173,060,000 × 15% = 25,959,000 (장기보유특별공제는 상속개시일 기산 — §95④, 이 수정과 무관)
    expect(r.reductionAmount).toBe(25_959_000);
  });

  it("긍정 짝 — 피상속인도 소급 2년 안(2023-12-01) 취득 → 불성립", () => {
    const r = calculateTransferTax(land({ reductions: PE as never, ...inherit("2023-12-01") }), rates);
    expect(r.publicExpropriationDetail?.isEligible).toBe(false);
    expect(r.publicExpropriationDetail?.notEligibleReason).toContain("소급 2년 이전에 취득한 토지등이 아닙니다");
    expect(r.reductionAmount).toBe(0);
  });

  it("경계 — 피상속인 취득일이 소급 2년 되는 날(2023-06-01) → 성립, 하루 뒤 → 불성립", () => {
    expect(calculateTransferTax(land({ reductions: PE as never, ...inherit("2023-06-01") }), rates).reductionAmount).toBe(25_959_000);
    expect(calculateTransferTax(land({ reductions: PE as never, ...inherit("2023-06-02") }), rates).reductionAmount).toBe(0);
  });

  it("상속이 아니면 피상속인 취득일이 실려 와도 쓰지 않는다(매매 2024-01-10 → 불성립)", () => {
    const r = calculateTransferTax(land({ reductions: PE as never, decedentAcquisitionDate: new Date("2000-01-01") }), rates);
    expect(r.reductionAmount).toBe(0);
  });

  it("다필지 경로도 같은 취득일로 판정 — 피상속인 2000 → 25,959,000(종전 0)", () => {
    const parcel = (id: string) => ({ id, transferArea: 100, acquisitionArea: 100, acquisitionDate: new Date("2024-01-10"),
      acquisitionMethod: "actual" as const, acquisitionPrice: 150_000_000, standardPricePerSqmAtTransfer: 4_000_000 });
    const mp = (o: object) => land({ reductions: PE as never, acquisitionPrice: 0, parcels: [parcel("a"), parcel("b")], ...o });
    expect(calculateTransferTax(mp({}), rates).reductionAmount).toBe(0);
    expect(calculateTransferTax(mp(inherit("2000-01-01")), rates).reductionAmount).toBe(25_959_000);
  });

  it("피상속인 취득일이 없으면 상속개시일로 판정(불성립)", () => {
    expect(calculateTransferTax(land({ reductions: PE as never, ...inherit() }), rates).reductionAmount).toBe(0);
  });
});

describe("§77⑨ — 「소득세법」 §97의2① 증여는 이월과세 시나리오 A가 증여자 취득일로 판정(종전부터)", () => {
  const carry = (donorDate: string) => ({
    acquisitionCause: "carryover_gift" as const,
    carryoverTaxation: {
      giftRegistryDate: new Date("2024-01-10"), donorAcquisitionDate: new Date(donorDate), donorAcquisitionPrice: 10_000_000,
      useEstimatedAcquisition: false, giftTaxAmount: 10_000_000, giftDateValuation: 300_000_000, donorRelation: "spouse" as const,
    },
  });

  it("증여자 2000 취득 → 시나리오 A에 §77 15% 반영(192,330,000 → 163,480,500) → A < B라 §97의2②3호로 B 채택", () => {
    const withPE = calculateTransferTax(land({ reductions: PE as never, ...carry("2000-01-01") }), rates);
    const noPE = calculateTransferTax(land({ reductions: [], ...carry("2000-01-01") }), rates);
    expect(noPE.carryoverTaxationDetail?.scenarioA.determinedTax).toBe(192_330_000);
    expect(withPE.carryoverTaxationDetail?.scenarioA.determinedTax).toBe(163_480_500);
    expect(withPE.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(withPE.carryoverTaxationDetail?.exclusionReason).toBe("tax_comparison");
    // B는 §97의2①이 적용되지 않은 계산이라 §77⑨ 의제도 없다 — 수증자 취득일(2024-01-10)로 불성립
    expect(withPE.reductionAmount).toBe(0);
  });
});

describe("§77의3③ — 개발제한구역 매수대상 상속 토지 = 피상속인 취득일", () => {
  it("피상속인 2000 취득(지정일 2005 이전) · 상속개시 2024 → 1호 40% 성립(종전 0)", () => {
    const r = calculateTransferTax(land({ reductions: GB as never, transferCause: undefined, ...inherit("2000-01-01") }), rates);
    expect(r.gbDesignatedLandDetail?.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(69_224_000); // 173,060,000 × 40%
  });

  it("긍정 짝 — 피상속인이 지정일 뒤(2010) 취득 → 불성립", () => {
    const r = calculateTransferTax(land({ reductions: GB as never, transferCause: undefined, ...inherit("2010-01-01") }), rates);
    expect(r.reductionAmount).toBe(0);
  });
});

describe("§77의2 — 같은 의제 규정이 없다(상속개시일 기준 유지)", () => {
  it("피상속인 2000 취득 · 상속개시 2024-01-10 → 대토보상 감면 불성립", () => {
    const inh = calculateTransferTax(land({ reductions: RL as never, ...inherit("2000-01-01") }), rates);
    const bought2000 = calculateTransferTax(land({ reductions: RL as never, acquisitionDate: new Date("2000-01-01") }), rates);
    expect(bought2000.replacementLandDetail?.isEligible).toBe(true);
    expect(inh.replacementLandDetail?.isEligible).toBe(false);
    expect(inh.reductionAmount).toBe(0);
  });
});
