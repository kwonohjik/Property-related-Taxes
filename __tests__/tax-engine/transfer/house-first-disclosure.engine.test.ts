/**
 * 주택별 개별주택가격 최초공시일 — leaf 직접 · 엔진 직접 (2026-10-19)
 *
 * 계획서 docs/00-pm/transfer-house-first-disclosure-per-house.plan.md. route 단 anchor는 `__tests__/api/transfer.route.house-first-disclosure.anchor.test.ts`.
 * 겹친 방어(엔진 leaf throw · ⑫ refine)는 mutation에서 서로를 가리므로 엔진 층을 따로 잠근다 — route는 ⑫가 먼저 400을 낸다.
 */
import { describe, it, expect } from "vitest";
import {
  houseDisclosureBoundary,
  houseFirstDisclosureDateInRange,
  disclosureDateLabel,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

describe("leaf — 구간 끝·범위·표기", () => {
  it("houseDisclosureBoundary: 2005-04-30 뒤 날짜만 · 공동주택은 고정 · 형식 오류는 고정", () => {
    expect(houseDisclosureBoundary("2006-04-28", "house_individual")).toBe("2006-04-28");
    expect(houseDisclosureBoundary("2006-04-28", undefined)).toBe("2006-04-28");
    expect(houseDisclosureBoundary("2006-04-28", "house_apart")).toBe("2005-04-30");
    expect(houseDisclosureBoundary("2005-04-30", "house_individual")).toBe("2005-04-30");
    expect(houseDisclosureBoundary("2004-01-01", "house_individual")).toBe("2005-04-30");
    expect(houseDisclosureBoundary("2006/04/28", "house_individual")).toBe("2005-04-30");
    expect(houseDisclosureBoundary(undefined, "house_individual")).toBe("2005-04-30");
  });
  it("houseFirstDisclosureDateInRange: 2005-04-30 ≤ 날짜 ≤ 양도일 · 생략은 통과", () => {
    expect(houseFirstDisclosureDateInRange(undefined, "2026-06-30")).toBe(true);
    expect(houseFirstDisclosureDateInRange("2005-04-30", "2026-06-30")).toBe(true);
    expect(houseFirstDisclosureDateInRange("2026-06-30", "2026-06-30")).toBe(true);
    expect(houseFirstDisclosureDateInRange("2005-04-29", "2026-06-30")).toBe(false);
    expect(houseFirstDisclosureDateInRange("2026-07-01", "2026-06-30")).toBe(false);
    expect(houseFirstDisclosureDateInRange("2006-4-28", "2026-06-30")).toBe(false);
  });
  it("disclosureDateLabel", () => {
    expect(disclosureDateLabel("2006-04-28")).toBe("2006.4.28.");
    expect(disclosureDateLabel("2005-04-30")).toBe("2005.4.30.");
  });
});

describe("엔진 직접 — 같은 leaf가 날짜로 구간을 넓히고, 해결자가 max를 한다", () => {
  const D = (s: string) => new Date(s);
  const common: Partial<TransferTaxInput> = {
    propertyType: "housing",
    transferPrice: 1_200_000_000,
    transferDate: D("2026-06-30"),
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 500_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 500_000_000,
  };
  /** D2-4 — 건물 상속 2005-05-12 + 토지 매매 · ② 36,000,000 */
  const d24 = (o: Partial<TransferTaxInput>) =>
    calculateTransferTax(baseTransferInput({
      ...common,
      acquisitionDate: D("2005-05-12"), acquisitionCause: "inheritance", decedentAcquisitionDate: D("1990-01-01"),
      landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 30_000_000, buildingSec164Value: 36_000_000,
      buildingHouseKind: "house_individual", landAcquisitionDate: D("2020-01-10"), landAcquisitionCause: "purchase",
      ...o,
    }), makeMockRates());
  /** D1-H — 토지 증여 2005-05-12 + 건물 매매 · 받을 당시 주택 있음 · ② 115,384,615 */
  const d1h = (o: Partial<TransferTaxInput>) =>
    calculateTransferTax(baseTransferInput({
      ...common,
      acquisitionDate: D("2018-03-02"), acquisitionCause: "purchase",
      landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 350_000_000, landHouseSec164Value: 115_384_615,
      landHouseExisted: "yes", buildingHouseKind: "house_individual", landAcquisitionDate: D("2005-05-12"), landAcquisitionCause: "gift",
      ...o,
    }), makeMockRates());

  it("D2-4: 날짜 없으면 ① 30,000,000 · 2006-04-28이면 ② 36,000,000 채택 · ② 없으면 throw", () => {
    expect(d24({}).splitDetail?.building.acquisitionPrice).toBe(30_000_000);
    const r = d24({ houseFirstDisclosureDate: "2006-04-28" });
    expect(r.splitDetail?.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 30_000_000, sec164: 36_000_000, adopted: "sec164" });
    expect(() => d24({ houseFirstDisclosureDate: "2006-04-28", buildingSec164Value: undefined })).toThrow("그 건물 몫(buildingSec164Value)이 필요합니다");
    expect(d24({ houseFirstDisclosureDate: "2006-04-28", buildingHouseKind: "house_apart" }).splitDetail?.building.acquisitionPrice).toBe(30_000_000);
  });
  it("D1-H: 날짜 없으면 ① 100,000,000 · 2006-04-28이면 ② 채택 · ② 없으면 throw", () => {
    expect(d1h({}).splitDetail?.land.acquisitionPrice).toBe(100_000_000);
    const r = d1h({ houseFirstDisclosureDate: "2006-04-28" });
    expect(r.splitDetail?.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "sec164", sec164: 115_384_615 });
    expect(() => d1h({ houseFirstDisclosureDate: "2006-04-28", landHouseSec164Value: undefined })).toThrow("그 토지 몫(landHouseSec164Value)이 필요합니다");
  });
});
