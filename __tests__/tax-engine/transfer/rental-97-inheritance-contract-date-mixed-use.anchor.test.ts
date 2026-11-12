/**
 * anchor — 겸용주택(`calcMixedUseTransferTax`)도 상속 자산의 매매계약일을 읽지 않는다 (V-11 엔진 진입부)
 *
 * 겸용은 단건 진입부(`calculateTransferTax`)를 거치지 않아 같은 leaf(`assetContractDateForCause`)를 따로 둔다.
 * 단건·라우트 anchor: `__tests__/api/transfer.route.rental-97-inheritance-contract-date.anchor.test.ts`.
 *
 * 실측(2026-11-12): 취득 2019-02-01(§97의5 시한 밖) · 계약일 2018-12-01 · 양도 2030-06-01 · case14 겸용 양도가 11억
 * - 매매: 감면 140,966,166 (§97의5 — 계약일 예외로 시한 안) · 계약일 없으면 0
 * - 상속: 계약일이 있어도 0 (수정 전에는 매매와 같은 140,966,166)
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const red = {
  type: "rental_97_5", registrationDate: D("2019-02-10"), rentalStartDate: D("2019-02-10"), taxRegistrationDate: D("2019-02-10"),
  isTaxRegistered: true, rentIncreaseViolated: false, isNationalHousingScale: true, region: "capital", officialPriceAtStart: 300_000_000,
  rentalContinuesToTransfer: true, isPurchaseRental: true,
};
const run = (acquisitionCause: "purchase" | "inheritance", assetContractDate?: Date) =>
  calcMixed(
    1_100_000_000,
    D("2030-06-01"),
    {
      ...mixedUseCase14(), isOneHouseExempt: false, acquisitionCause,
      buildingAcquisitionDate: D("2019-02-01"), landAcquisitionDate: D("2019-02-01"),
      reductions: [red], assetContractDate,
    } as unknown as MixedUseAssetInput,
    makeMockRatesWithHouseEngine(),
  ).total;

describe("겸용 — §97의5 시한 × 자산 매매계약일", () => {
  it("매매: 계약일 2018-12-01 → 감면 140,966,166 · 없으면 0 (회귀)", () => {
    expect(run("purchase", D("2018-12-01")).reductionAmount).toBe(140_966_166);
    expect(run("purchase").reductionAmount).toBe(0);
  });
  it("🔴 상속: 계약일 2018-12-01이 남아 있어도 감면 0", () => {
    expect(run("inheritance", D("2018-12-01")).reductionAmount).toBe(0);
    expect(run("inheritance", D("2018-12-01")).determinedTax).toBe(run("inheritance").determinedTax);
  });
});
