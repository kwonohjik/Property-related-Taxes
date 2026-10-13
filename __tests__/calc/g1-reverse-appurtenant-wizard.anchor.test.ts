/**
 * G1 — 사례 28 역방향(첫 자산 주택부수토지 · 주택은 함께 양도) **화면 경로** anchor: 폼 → ⑧ → ④ → route → 엔진.
 *
 * ④는 짝 주택(`reverseAppurtenantHouseAssetId`)에 신축이 아니어도 정착면적·소재지 구분을 싣는다 — 종전에는 신축 주택에만 실어
 * route가 배율 한도를 잴 수 없었다. 같은 사실을 주택 먼저 넣은 결과와 총세액·항목이 같다(route 단위 anchor:
 * `__tests__/api/transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts`).
 *
 * ⚠️ 남은 한계: 화면 Step4의 세대·거주기간·조정대상지역 입력은 첫 자산이 주택일 때만 열린다 — 역방향에서 짝 주택의 거주기간은 0으로 간다
 *    (주택 카드 자신의 거주기간 입력 경로가 없다). 그래서 거주기간이 세액을 가르는 구성(12억 초과 고가주택의 장특 표2 등)은 화면 경로에서
 *    주택 먼저 순서와 갈린다 — 아래 시료는 1세대1주택 비과세가 거주기간과 무관한(조정대상지역 아님 · 12억 이하) 구성이다.
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
import { reverseAppurtenantHouseAssetId } from "@/lib/calc/reverse-appurtenant-house";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const HOUSE = (landArea: number): Record<string, unknown> => ({
  assetId: "h1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000",
  actualSalePrice: "800000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  ...(landArea > 0 ? { areaScenario: "same", acquisitionArea: String(landArea), transferArea: String(landArea) } : {}),
  standardPriceAtTransfer: "600000000",
});
const LAND = (id: string, area: number): Record<string, unknown> => ({
  assetId: id,
  assetKind: "land",
  landNature: "appurtenant",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "150000000",
  actualSalePrice: "300000000",
  addressJibun: `서울 테스트동 ${id}`,
  areaScenario: "same",
  acquisitionArea: String(area),
  transferArea: String(area),
  standardPriceAtTransfer: "200000000",
});
const household = {
  transferDate: "2026-02-16",
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const form = (...assets: Record<string, unknown>[]) =>
  ({
    ...createDefaultTransferFormData(),
    ...household,
    contractTotalPrice: "1100000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a })),
  }) as never;

type Prop = { propertyId: string; transferPrice: number; isExempt: boolean; longTermHoldingDeduction: number; rateClause?: string };
type Agg = { totalTax: number; properties: Prop[]; warnings?: string[] };
const aggOf = (r: Awaited<ReturnType<typeof runCalc>>) => r.json.data.aggregated as Agg;
/** 역할로 맞춘다 — 주택: forward `primary` ↔ reverse `h1` · 토지: forward `l1…` ↔ reverse `primary…` */
const norm = (a: Agg, dir: "f" | "r") =>
  a.properties
    .map((p) => [
      dir === "f" ? p.propertyId.replace(/^primary$/, "HOUSE") : p.propertyId.replace(/^h1$/, "HOUSE").replace(/^primary/, "l1"),
      p.transferPrice,
      p.isExempt,
      p.longTermHoldingDeduction,
      p.rateClause ?? null,
    ])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));

describe("G1 화면 경로 — 첫 자산 주택부수토지 = 주택 먼저", () => {
  it("④ — 짝 주택(신축 아님)에 정착면적·소재지 구분을 싣는다 · 주택 먼저 순서의 함께 양도 주택에는 싣지 않는다(종전)", async () => {
    const r = await runCalc(form(LAND("l1", 400), HOUSE(0)));
    const house = (r.body.companionAssets as Record<string, unknown>[]).find((c) => c.assetKind === "housing")!;
    expect(house).toMatchObject({ buildingFootprintArea: 100, appurtenantLandZone: "metropolitan_residential", isUrbanArea: true });
    const fw = await runCalc(form(HOUSE(0), LAND("l1", 400), { ...HOUSE(0), assetId: "h2" }));
    const fwHouse = (fw.body.companionAssets as Record<string, unknown>[]).find((c) => c.assetKind === "housing")!;
    expect(fwHouse.buildingFootprintArea).toBeUndefined();
  });

  it("짝 주택 판정 leaf — 주택 계열 컴패니언이 일반 주택 1건일 때만", () => {
    const a = (o: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...o }) as never;
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0))])).toBe("h1");
    expect(reverseAppurtenantHouseAssetId([a({ ...LAND("l1", 1), landNature: "standalone" }), a(HOUSE(0))])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0)), a({ ...HOUSE(0), assetId: "h2" })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a({ ...HOUSE(0), isMixedUseHouse: true })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(HOUSE(0)), a(LAND("l1", 1))])).toBeUndefined();
  });

  for (const [title, houseLand, landArea, total] of [
    ["배율 이내 300㎡ — 둘 다 비과세 0 (수정 전 역방향 18,628,498)", 0, 300, 0],
    ["토지 400㎡ — 이내 300·초과 100 두 항목 (수정 전 18,628,498)", 0, 400, 4_457_750],
    ["주택 카드 토지 200㎡ + 토지 200㎡ — 남은 한도 100㎡ (수정 전 18,628,498)", 200, 200, 10_989_000],
  ] as const) {
    it(`🔑 ${title}`, async () => {
      const fw = await runCalc(form(HOUSE(houseLand), LAND("l1", landArea)));
      const rv = await runCalc(form(LAND("l1", landArea), HOUSE(houseLand)));
      expect(rv.issues).toEqual([]);
      expect(rv.status).toBe(200);
      expect(norm(aggOf(rv), "r")).toEqual(norm(aggOf(fw), "f"));
      expect(aggOf(rv).totalTax).toBe(total);
      expect(aggOf(fw).totalTax).toBe(total);
    });
  }

  it("결과뷰 — 신고서 양식의 `primary__appurtenant`·`primary__excess` 열은 첫 자산(토지)의 취득일을 쓴다(컴패니언 분리 열과 같은 규약)", async () => {
    const f = form({ ...LAND("l1", 400), acquisitionDate: "2012-05-05" }, HOUSE(0));
    const agg = aggOf(await runCalc(f));
    const rows = buildAggregateRows(
      {} as unknown as TransferTaxResult,
      { properties: agg.properties, aggregated: agg } as unknown as AggregateMeta,
      f,
    );
    const acq = rows.find((r) => r.label === "취득일자")!.values as Record<string, unknown>;
    expect(acq["primary__appurtenant"]).toBe("2012-05-05");
    expect(acq["primary__excess"]).toBe("2012-05-05");
    expect(acq["h1"]).toBe("2014-01-02");
  });

  it("첫 자산 토지에 비사업용 토지 정밀판정을 켜도 배율 이내·초과가 정해지면 그 판정 입력을 쓰지 않는다 — 초과분 비사업용 토지(§104①8호) · 주택 먼저와 같다", async () => {
    const NBL = {
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "urban_residential",
      nblOtherPropertyTaxType: "separate",
      // 같은 입력을 단건 독립 토지로 넣으면 사업용 토지(§104①1호)로 판정된다(실측) — 정밀판정이 초과분 판정을 덮으면 여기서 드러난다.
      nblOtherIsRelatedToResidence: true,
    };
    const fw = await runCalc(form(HOUSE(0), LAND("l1", 400)));
    const rv = await runCalc(form({ ...LAND("l1", 400), ...NBL }, HOUSE(0)));
    expect(rv.body.nonBusinessLandRaw).toBeDefined();
    expect(aggOf(rv).properties.find((p) => p.propertyId === "primary__excess")?.rateClause).toBe("104-1-8");
    expect(norm(aggOf(rv), "r")).toEqual(norm(aggOf(fw), "f"));
  });
});
