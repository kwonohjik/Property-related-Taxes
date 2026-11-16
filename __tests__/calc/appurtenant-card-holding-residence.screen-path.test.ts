/**
 * 주택 부수토지 카드(L-1b)를 주 주택보다 늦게 취득 — 화면 경로(폼 → ④ companion payload → ⑧ → ⑫ → ⑭ → 엔진)
 * 주 자산이 구간 입력이면 ④가 카드에 `landHoldingResidenceMonths`(주 자산 구간 ∩ [카드 취득일, 양도일])를 싣고 `residencePeriodMonths`(승계 합계)는 줄이지 않는다.
 * route 직접 입력·게이트는 `__tests__/api/transfer.route.appurtenant-card-holding-residence.anchor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { appurtenantCardAfterPrimaryHouse, buildAppurtenantCardHoldingResidencePayload } from "@/lib/calc/transfer-land-holding-residence-scope";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const interval = (...p: [string, string][]): Partial<AssetForm> =>
  ({ residenceInputMode: "interval", residencePeriods: p.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) }) as Partial<AssetForm>;
const direct = (m: string): Partial<AssetForm> => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: m }) as Partial<AssetForm>;

const house = (o: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "500000000",
    actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000", addressJibun: "서울 테스트동 1", buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, ...interval(["2014-02-01", "2026-02-16"]), ...o,
  }) as unknown as AssetForm;
const card = (o: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(2), assetKind: "land", landNature: "appurtenant", acquisitionCause: "purchase", acquisitionDate: "2022-06-01", fixedAcquisitionPrice: "200000000",
    actualSalePrice: "400000000", standardPriceAtTransfer: "200000000", addressJibun: "서울 테스트동 1", acquisitionArea: "200", transferArea: "200", ...o,
  }) as unknown as AssetForm;
const form = (h: AssetForm, c: AssetForm) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2026-02-16", contractTotalPrice: "1400000000", isOneHousehold: true, householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", assets: [h, c],
  }) as never;

type R = Awaited<ReturnType<typeof runCalc>>;
const cardBody = (r: R) => (r.body.companionAssets as Record<string, unknown>[])[0];
const props = (r: R) => r.json.data.aggregated.properties as { propertyId: string; longTermHoldingDeduction: number; longTermHoldingRate?: number }[];
const capNote = (r: R) => ((r.json.data.aggregated.warnings ?? []) as string[]).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("④ → ⑫ → ⑭ → 엔진 — 주 자산 구간 입력", () => {
  it("구간 2014-02-01~2026-02-16: 카드 취득 2022-06-01 이후 겹침 44개월을 싣고 승계 합계(142)는 그대로 · route 200 · 고지 없음", async () => {
    const r = await runCalc(form(house(), card()));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(cardBody(r).landHoldingResidenceMonths).toBe(44);
    expect(r.body.residencePeriodMonths).toBe(144);
    expect(cardBody(r).residencePeriodMonths).toBeUndefined(); // 승계는 서버 — 합계를 줄여 싣지 않는다
    expect(capNote(r)).toHaveLength(0);
  });

  it("카드 취득 전에만 거주(2014-02-01~2019-01-31 = 60개월): 겹침 0 · 합계 60 그대로 · 카드는 표2 대상 그대로(거주 5년) 보유분만 — 직접 입력 60개월과 장특이 다르다", async () => {
    const rI = await runCalc(form(house(interval(["2014-02-01", "2019-01-31"])), card()));
    expect(cardBody(rI).landHoldingResidenceMonths).toBe(0);
    expect(rI.body.residencePeriodMonths).toBe(60);
    const rD = await runCalc(form(house(direct("60")), card()));
    expect(cardBody(rD)).not.toHaveProperty("landHoldingResidenceMonths");
    const lI = props(rI).find((p) => p.propertyId !== "primary")!;
    const lD = props(rD).find((p) => p.propertyId !== "primary")!;
    expect(lI.longTermHoldingDeduction).toBeLessThan(lD.longTermHoldingDeduction); // 겹침 0 < 직접 60 → min(60,44)
    expect(capNote(rD)).toHaveLength(1);
    expect(capNote(rI)).toHaveLength(0);
  });

  it("직접 입력: 키 없음 · 고지 1건", async () => {
    const r = await runCalc(form(house(direct("142")), card()));
    expect(cardBody(r)).not.toHaveProperty("landHoldingResidenceMonths");
    expect(capNote(r)).toHaveLength(1);
  });

  it("짝 — 카드가 주택과 같은 날·먼저: 키 없음 · route 200", async () => {
    for (const d of ["2014-01-01", "2010-01-01"]) {
      const r = await runCalc(form(house(), card({ acquisitionDate: d } as Partial<AssetForm>)));
      expect(cardBody(r), d).not.toHaveProperty("landHoldingResidenceMonths");
      expect(r.status, d).toBe(200);
    }
  });
});

describe("⑤ 술어 ≡ ④ 전송 — appurtenantCardAfterPrimaryHouse ∧ 구간 입력 ⇔ 키가 실린다(격자)", () => {
  const cells: [string, Partial<AssetForm>, Partial<AssetForm>][] = [
    ["카드가 나중", {}, {}],
    ["카드가 먼저", {}, { acquisitionDate: "2010-01-01" } as Partial<AssetForm>],
    ["같은 날", {}, { acquisitionDate: "2014-01-01" } as Partial<AssetForm>],
    ["독립 나대지", {}, { landNature: "standalone" } as Partial<AssetForm>],
    ["주 자산 겸용주택", { isMixedUseHouse: true } as Partial<AssetForm>, {}],
    ["주 자산 직접 입력", direct("60"), {}],
  ];
  for (const [name, h, c] of cells)
    it(name, async () => {
      const H = house(h);
      const C = card(c);
      const r = await runCalc(form(H, C));
      const sent = !!cardBody(r) && "landHoldingResidenceMonths" in cardBody(r);
      expect(sent, name).toBe(H.residenceInputMode === "interval" && appurtenantCardAfterPrimaryHouse(C, H));
    });
  it("buildAppurtenantCardHoldingResidencePayload — 구간 합산 · 직접이면 {}", () => {
    expect(buildAppurtenantCardHoldingResidencePayload(card(), house())).toEqual({ landHoldingResidenceMonths: 44 });
    expect(buildAppurtenantCardHoldingResidencePayload(card(), house(direct("60")))).toEqual({});
    expect(buildAppurtenantCardHoldingResidencePayload(card(), house(interval(["2014-02-01", ""])))).toEqual({ landHoldingResidenceMonths: 0 });
  });
});
