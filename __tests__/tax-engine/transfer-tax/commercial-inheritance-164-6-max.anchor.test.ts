/**
 * 상가건물 상속 §163⑨2호 (pre-disclosure) max(상증법 평가액, §164⑥ 취득당시 기준시가) anchor.
 *
 * Phase 2 (PR#715 후속). 상가 기준시가 최초고시 = 2005-01-01. 2005 이전 상속 상가는
 *   취득가액 = max(상속개시일 상증법 §60~66 평가액, §164⑥ 취득당시 기준시가 P_A).
 *   P_A = 최초고시(2005) 역환산 = case-29 estimatedBasisAtAcq = 119,607,326.
 *
 * opt-in: commercialInheritanceValuation payload 제공 시에만 §164⑥ max(주택 inheritedHouseValuation 미러).
 *
 * 근거: 소득세법 시행령 §163⑨2호 · §164⑥. KoreanLaw MST 286211.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates } from "../_helpers/mock-rates";
import { makeCase29Input } from "./_helpers/case-29-fixtures";
import type { InheritanceAcquisitionInput, CommercialInheritanceValuationInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";

const rates = makeMockRates();

/** case-29 §164⑥ 입력 → P_A = 119,607,326 (ESTIMATED_BASIS_AT_ACQ) */
const COMMERCIAL_INH_VAL: CommercialInheritanceValuationInput = {
  exclusiveArea: 36,
  commonArea: 33.52,
  landArea: 12.57,
  unitPriceAtFirstDisclosure: 3_000_000,
  landPriceAtAcquisition: 3_978_096,
  landPriceAtFirstDisclosure: 11_060_632,
  buildingStdPriceAtAcquisition: 69_602_660,
  buildingStdPriceAtFirstDisclosure: 69_527_856,
};
const P_A = 119_607_326;

function inhAcq(reportedValue: number): InheritanceAcquisitionInput {
  return {
    inheritanceDate: new Date("2000-12-07"), // post-deemed(>1985) & pre-disclosure(<2005-01-01)
    assetKind: "land",
    reportedValue,
    reportedMethod: "supplementary",
  };
}

describe("P2-1 — 상가 상속 §163⑨2호 max(상증법, §164⑥ P_A)", () => {
  it("P2-1a ★: 상증법 평가액(100M) < P_A(119,607,326) → 취득가 = P_A, gain = 420,392,674", () => {
    const result = calculateTransferTax(
      makeCase29Input({
        acquisitionCause: "inheritance",
        inheritedAcquisition: inhAcq(100_000_000),
        commercialInheritanceValuation: COMMERCIAL_INH_VAL,
      }),
      rates,
    );
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(P_A);
    expect(result.transferGain).toBe(540_000_000 - P_A); // 420,392,674
    expect(result.commercialBuildingValuationDetail).toBeUndefined(); // 환산 미적용
  });

  it("P2-1b: 상증법 평가액(150M) > P_A → 취득가 = 150M, gain = 390,000,000", () => {
    const result = calculateTransferTax(
      makeCase29Input({
        acquisitionCause: "inheritance",
        inheritedAcquisition: inhAcq(150_000_000),
        commercialInheritanceValuation: COMMERCIAL_INH_VAL,
      }),
      rates,
    );
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(150_000_000);
    expect(result.transferGain).toBe(390_000_000);
  });

  it("P2-2 opt-out: commercialInheritanceValuation 미제공 → 상증법 평가액만(Phase1 불변)", () => {
    const result = calculateTransferTax(
      makeCase29Input({
        acquisitionCause: "inheritance",
        inheritedAcquisition: inhAcq(100_000_000),
        // commercialInheritanceValuation 없음
      }),
      rates,
    );
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(100_000_000);
    expect(result.transferGain).toBe(440_000_000);
  });

  it("P2-1c: 개산공제 미적용 (§163⑨2호 실지거래가액 의제)", () => {
    const result = calculateTransferTax(
      makeCase29Input({
        acquisitionCause: "inheritance",
        inheritedAcquisition: inhAcq(100_000_000),
        commercialInheritanceValuation: COMMERCIAL_INH_VAL,
      }),
      rates,
    );
    // gain에 개산공제(3,588,219) 흔적 없음 = 540M − P_A 정확.
    expect(result.transferGain).toBe(540_000_000 - P_A);
    expect(result.usedEstimatedAcquisition).toBe(false);
  });
});

describe("B — 매매 상가 환산 불변 (회귀)", () => {
  it("B-01: 매매(기본) 상가 환산취득가 유지 = 135,155,041", () => {
    const result = calculateTransferTax(makeCase29Input(), rates);
    expect(result.commercialBuildingValuationDetail?.estimatedAcquisitionTotal).toBe(135_155_041);
  });
});
