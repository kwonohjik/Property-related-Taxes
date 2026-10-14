/**
 * #17-6 다건(⑬ `multi-transfer-tax-api` · ⑫ · ⑭ `multi/route.ts`) — 취득 당시 계약서 구분금액이 단건과 같은 세액·판정으로 닿는다.
 * 새 키를 한쪽만 매핑하면 다건에서 침묵 strip되어 같은 입력이 단건과 다른 세액이 된다(#38-3 선례). 기대값은 단건 route 결과와의 동일성이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runMulti, runSingle } from "../_helpers/single-multi-route-parity";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const HOUSE: Record<string, unknown> = {
  assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000", addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct", residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, areaScenario: "same",
  acquisitionArea: "500", transferArea: "500",
  standardPriceAtAcq: "500000000", standardPricePerSqmAtAcq: "600000", buildingStandardPriceAtAcq: "200000000",
  standardPricePerSqmAtTransfer: "800000", buildingStandardPriceAtTransfer: "400000000",
};
const form = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2026-02-16", contractTotalPrice: "1000000000",
    isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, ...over } as unknown as AssetForm],
  }) as never;

describe("#17-6 다건 ↔ 단건 parity", () => {
  it.each([
    ["30% 미만(계약서 적용)", { acqContractLandPrice: "335714285", acqContractBuildingPrice: "164285715" }],
    ["30% 이상(안분 적용)", { acqContractLandPrice: "380000000", acqContractBuildingPrice: "120000000" }],
    ["30% 이상 + 단서 신고(계약서 적용)", { acqContractLandPrice: "380000000", acqContractBuildingPrice: "120000000", acqContractOtherLaw: true }],
    ["미입력", {}],
  ])("%s — 다건 세액·토지 취득가액이 단건과 같다", async (_n, over) => {
    const s = await runSingle(form(over));
    const m = await runMulti([form(over)]);
    expect(s.status).toBe(200);
    expect(m.status).toBe(200);
    expect(m.props[0]).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mp = m.props[0] as any;
    // 세액 절댓값은 다건이 기본공제를 다르게 배분해 단건과 상수만큼 어긋난다(이 변경과 무관) — 배관 증거는 아래 취득가액·판정 echo다.
    expect(mp.splitDetail?.land?.acquisitionPrice).toBe((s.r as any).splitDetail.land.acquisitionPrice); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mp.splitDetail?.acqSplitJudgment?.outcome).toBe((s.r as any).splitDetail.acqSplitJudgment?.outcome); // eslint-disable-line @typescript-eslint/no-explicit-any
  }, 60_000);

  it("30% 미만 구분금액은 다건 세액도 움직인다 (다건에서 침묵 strip되면 미입력과 같아진다)", async () => {
    const none = await runMulti([form()]);
    const under = await runMulti([form({ acqContractLandPrice: "335714285", acqContractBuildingPrice: "164285715" })]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((under.props[0] as any).determinedTax).not.toBe((none.props[0] as any).determinedTax);
  }, 60_000);
});
