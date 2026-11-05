/**
 * anchor — 축 B(같은 주택 지분 분할 취득) × 명부 행 ⑥ 조세특례제한법 §99의4 선언(NH-07 · Q-27).
 *
 * 선언은 주 자산 감면(④ `primaryReductionsWithRows`)에만 실려, 둘째 지분은 같은 주택인데도 농어촌주택을 소유주택으로 세어 과세됐다
 * (강남 10억 · 2018 취득 · 2026-02-16 양도 · 50/50 66,891,000 · 60/40 48,917,000 / 단건 0). 금액은 mock 세율.
 * 늦게 취득한 지분의 「그 농어촌주택등 취득 전에 보유하던 다른 주택」 순서는 첫 지분(명부 양도 행 = 첫 지분, SH-81) 날짜로 본다(Q-27).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
// 카드 입력 확인용(NH-81) — 합산 엔진은 그대로 돌리고 받은 카드만 기록한다.
const seen = vi.hoisted(() => ({ properties: [] as Record<string, unknown>[] }));
vi.mock("@/lib/tax-engine/transfer-tax-aggregate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-aggregate")>();
  return {
    ...actual,
    calculateTransferTaxAggregateWithUnits: (...args: Parameters<typeof actual.calculateTransferTaxAggregateWithUnits>) => {
      seen.properties = args[0].properties as unknown as Record<string, unknown>[];
      return actual.calculateTransferTaxAggregateWithUnits(...args);
    },
  };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { runCalc, houseRow, captureBody, postTransfer } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const RURAL = { type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "100000000", isRegisteredHanok: false, isAdjacentArea: false, meetsLocationRequirement: true };
const rural = (acq: string) =>
  houseRow("rural", acq, { region: "non_capital", regionCode: "4682025021", isApartment: false, officialPrice: "100000000", countExclusion: { kind: "reduction", reduction: RURAL } } as never);
const RES = { residencePeriods: [{ moveInDate: "2018-03-01", moveOutDate: "2025-03-01" }] };
const share = (n: number, num: string, o: object = {}) => ({
  ...makeDefaultAsset(n), assetKind: "housing", addressJibun: "강남동 1", regionCode: GANGNAM, acquisitionCause: "purchase", acquisitionDate: "2018-03-01",
  fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  assetId: `s${n}`, ownershipNumerator: num, ownershipDenominator: "100", ...RES, ...o,
});
const FR = { assetSplitMode: "fractional", bundledSaleMode: "actual" };
const form = (assets: object[], houses: object[], over: object = {}) =>
  ({
    ...createDefaultTransferFormData(), contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", isOneHousehold: true,
    assets, houses, householdHousingCount: String(houses.length + 1), householdNoOtherHousesConfirmed: houses.length === 0,
    householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "84", ...over,
  }) as never;
const totalOf = async (f: never) => {
  const r = await runCalc(f);
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  expect(r.issues, "⑧ 막다른 길이 없어야 한다").toEqual([]);
  return (r.json.data.aggregated?.totalTax ?? r.json.data.result.totalTax) as number;
};

describe("NH-07 둘째 지분도 명부 행 ⑥ §99의4 선언을 받는다", () => {
  it("SC-1 💰 단건 0 · 50/50 지분 0(종전 66,891,000) · 60/40 지분 0(종전 48,917,000)", async () => {
    expect(await totalOf(form([share(1, "100")], [rural("2020-03-01")]))).toBe(0);
    expect(await totalOf(form([share(1, "50"), share(2, "50")], [rural("2020-03-01")], FR))).toBe(0);
    expect(await totalOf(form([share(1, "60"), share(2, "40")], [rural("2020-03-01")], FR))).toBe(0);
  });
  it("SC-2 💰 음성 짝 — 농어촌주택을 양도 주택보다 먼저 취득(요건 불성립)하면 단건·지분 모두 과세, 지분 합이 단건과 같다", async () => {
    const one = await totalOf(form([share(1, "100")], [rural("2017-03-01")]));
    expect(one).toBeGreaterThan(0);
    expect(await totalOf(form([share(1, "50"), share(2, "50")], [rural("2017-03-01")], FR))).toBe(one);
  });
});

describe("Q-27 늦게 취득한 지분의 순서 기준일 = 첫 지분 취득일", () => {
  it("SC-3 💰 첫 지분 2018 < 농어촌주택 2020 < 둘째 지분 2021 → 둘째 지분도 제외 → 0", async () => {
    expect(await totalOf(form([share(1, "50"), share(2, "50", { acquisitionDate: "2021-03-01" })], [rural("2020-03-01")], FR))).toBe(0);
  });
});

describe("재개발 완공 아파트 지분도 같다", () => {
  const APT = {
    assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "",
    redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000", redevSettlementDirection: "pay", redevSettlementAmount: "100000000",
    redevPreApprovalExpenses: "20000000", redevOriginalAssetType: "housing", capitalExpenditure: "30000000", transferExpense: "10000000", addressJibun: "서울 A 1",
    residencePeriods: [{ moveInDate: "2012-03-01", moveOutDate: "2020-03-01" }],
  };
  it("SC-4 💰 50/50 완공 아파트 지분 → 단건과 같은 0(종전 29,146,700)", async () => {
    const R96 = { residencePeriodMonths: "96" };
    expect(await totalOf(form([share(1, "100", APT)], [rural("2020-03-01")], R96))).toBe(0);
    expect(await totalOf(form([share(1, "50", APT), share(2, "50", APT)], [rural("2020-03-01")], { ...FR, ...R96 }))).toBe(0);
  });
});

describe("NH-81 컴패니언 매매계약일 — 정본 변환(`toOptionalDate`)", () => {
  it("본문의 문자열 계약일이 엔진 카드에 Date로 도달한다", async () => {
    const body = await captureBody(form([share(1, "50"), share(2, "50")], [], FR));
    const companions = body.companionAssets as Record<string, unknown>[];
    companions[0].assetContractDate = "2018-02-01";
    const r = await postTransfer(body);
    expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
    const card = seen.properties.find((p) => p.propertyId === companions[0].assetId)!;
    expect(card.assetContractDate).toBeInstanceOf(Date);
    expect((card.assetContractDate as Date).toISOString().slice(0, 10)).toBe("2018-02-01");
  });
});
