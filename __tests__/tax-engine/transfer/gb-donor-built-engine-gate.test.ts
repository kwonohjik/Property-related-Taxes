/**
 * 엔진 게이트 — 일반건물 건물 카드(`general_building_unit`)의 증여자 신축·증축 §114조의2 (PR-5a)
 *
 * `assertDonorBuiltInput` 은 route 보다 아래의 **직접 호출 방어선**이다. ⑫가 먼저 거르는 입력(일체 주택 `housing`)도 엔진이 독립적으로 던져야
 * 「카드가 이미 건물분인데 안분 입력을 받아 조용히 무시」하는 일이 없다 — route anchor 로는 도달할 수 없어 여기서 직접 부른다.
 */
import { describe, it, expect } from "vitest";
import { assertDonorBuiltInput } from "@/lib/tax-engine/transfer-tax-carryover-donor-penalty";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const HOUSING = {
  landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000, buildingStdPriceAtTransfer: 160_000_000,
};
const ct = (donorBuilt: object) => ({
  giftRegistryDate: new Date("2024-05-01"), donorAcquisitionDate: new Date("2015-01-01"), useEstimatedAcquisition: true,
  giftTaxAmount: 0, giftDateValuation: 800_000_000, donorBuilt: { buildingType: "new", constructionDate: new Date("2022-01-10"), ...donorBuilt },
});
const input = (propertyType: string, over: object = {}) =>
  ({ propertyType, acquisitionCause: "carryover_gift", transferPrice: 500_000_000, transferDate: new Date("2026-03-01"), ...over }) as unknown as TransferTaxInput;
const run = (propertyType: string, donorBuilt: object = {}, over: object = {}) => {
  const c = ct(donorBuilt);
  return () => assertDonorBuiltInput(input(propertyType, over), c as never);
};

describe("assertDonorBuiltInput × general_building_unit", () => {
  it("일반건물 건물 카드는 허용한다 (환산 · 신축 · 5년 이내 입력)", () => {
    expect(run("general_building_unit")).not.toThrow();
  });
  it("증축 donor 는 양도 당시 기준시가가 있어야 허용 — 비면 던진다", () => {
    const ext = { buildingType: "extension", extensionFloorArea: 90, extensionStdPriceAtAcquisition: 50_000_000 };
    expect(run("general_building_unit", ext, { standardPriceAtTransfer: 200_000_000 })).not.toThrow();
    expect(run("general_building_unit", ext)).toThrow(/양도 당시 기준시가/);
  });
  it("일체 주택 건물분 입력(housing)은 일반건물 카드에서 던진다 — 받아서 무시하지 않는다", () => {
    expect(run("general_building_unit", { housing: HOUSING })).toThrow(TaxCalculationError);
    expect(run("general_building_unit", { housing: HOUSING })).toThrow(/housing/);
  });
  it("토지 카드·상가 등 그 밖의 자산 종류는 여전히 던진다 (D4 건물분만)", () => {
    for (const t of ["land", "commercial_building", "general_building"]) expect(run(t), t).toThrow(/주택·건물에만/);
  });
  it("환산 OFF(실지거래가액 승계)는 일반건물 카드에서도 던진다", () => {
    const c = { ...ct({}), useEstimatedAcquisition: false };
    expect(() => assertDonorBuiltInput(input("general_building_unit"), c as never)).toThrow(/환산취득가액으로 계산할 때만/);
  });
});
