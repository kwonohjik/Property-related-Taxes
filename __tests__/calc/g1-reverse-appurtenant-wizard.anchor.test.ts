/**
 * G1 — 사례 28 역방향(첫 자산 주택부수토지 · 주택은 함께 양도) **화면 경로** anchor: 폼 → ⑧ → ④ → route → 엔진.
 *
 * 화면은 이 구성을 **막고 주택을 첫 자산으로 넣도록 안내한다**(⑧ `transfer-tax-validate-asset.ts`). 보유 상황 단계의 1세대1주택 판정 입력
 * (세대·주택 수·거주기간·취득 당시 조정대상지역·일시적 2주택 등)이 첫 자산이 주택일 때만 열려, 그대로 계산하면 숨은 기본값(1세대 해당 · 1주택 ·
 * 조정대상지역 아님 — 조정대상지역 리셋 effect가 false로 둔다)으로 주택·토지가 통째로 비과세된다(검토 실측: 조정대상지역 2018 취득 · 거주 0 ·
 * 배율 이내 300㎡ — 주택 먼저 173,646,000, 토지 먼저 0 · 안내 없음). 주택 먼저 순서는 같은 사실을 #17 K1 경로로 계산한다.
 *
 * route 단위 parity(API 본문으로 들어온 역방향 구성): `__tests__/api/transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts`.
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
import { runCalc, allIssues, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
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
const BLOCK = "주택부수토지를 첫 자산으로 넣고 주택을 함께 양도하는 자산으로 넣으면";
const blocked = (issues: { step: number; field?: string; message: string }[]) =>
  issues.filter((i) => i.message.includes(BLOCK));

describe("G1 화면 경로 — 첫 자산 주택부수토지 + 함께 양도 주택 1건은 막고 주택 먼저 입력을 안내", () => {
  it("짝 주택 판정 leaf — 주택 계열 컴패니언이 일반 주택 1건일 때만", () => {
    const a = (o: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...o }) as never;
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0))])).toBe("h1");
    expect(reverseAppurtenantHouseAssetId([a({ ...LAND("l1", 1), landNature: "standalone" }), a(HOUSE(0))])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0)), a({ ...HOUSE(0), assetId: "h2" })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a({ ...HOUSE(0), isMixedUseHouse: true })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(HOUSE(0)), a(LAND("l1", 1))])).toBeUndefined();
  });

  it("🔑 ⑧ — 토지 먼저는 1단계(자산)에서 막는다 · 첫 자산의 토지 성격 칸 · 주택 먼저는 막지 않는다", () => {
    const rv = blocked(allIssues(form(LAND("l1", 300), HOUSE(0))));
    expect(rv).toHaveLength(1);
    expect(rv[0]).toMatchObject({ step: 0, field: "landNature" });
    expect(rv[0].message).toContain("주택을 첫 자산으로, 이 토지를 함께 양도하는 자산(주택부수토지)으로 입력하세요");
    expect(blocked(allIssues(form(HOUSE(0), LAND("l1", 300))))).toEqual([]);
    // 부수토지 컴패니언이 더 있어도 막는 자리는 첫 자산 하나다(같은 안내를 카드마다 되풀이하지 않는다).
    const many = blocked(allIssues(form(LAND("l1", 200), HOUSE(0), LAND("l2", 200))));
    expect(many).toHaveLength(1);
  });

  it("🔑 숨은 기본값 비과세 차단 — 조정대상지역 2018 취득 · 거주 0: 주택 먼저는 과세(거주요건 미충족), 토지 먼저는 계산 전에 막힌다", async () => {
    const reg = { acquisitionDate: "2018-01-02", residencePeriodMonthsAsset: "0", residencePeriodMonths: "0" };
    const f = (...assets: Record<string, unknown>[]) =>
      ({ ...(form(...assets) as object), wasRegulatedAtAcquisition: true, wasRegulatedAtAcquisitionTouched: true, residencePeriodMonths: "0" }) as never;
    const fw = await runCalc(f({ ...HOUSE(0), ...reg }, { ...LAND("l1", 300), acquisitionDate: "2018-01-02" }));
    expect(fw.issues).toEqual([]);
    expect(aggOf(fw).totalTax).toBeGreaterThan(0);
    expect(aggOf(fw).properties.some((p) => p.isExempt)).toBe(false);
    const rv = allIssues(f({ ...LAND("l1", 300), acquisitionDate: "2018-01-02" }, { ...HOUSE(0), ...reg }));
    expect(blocked(rv)).toHaveLength(1);
  });

  it("짝 주택을 정할 수 없는 구성(함께 양도 주택 2건 · 겸용주택)은 막지 않는다 — 종전대로 계산하고 엔진이 안내한다", () => {
    expect(blocked(allIssues(form(LAND("l1", 300), HOUSE(0), { ...HOUSE(0), assetId: "h2" })))).toEqual([]);
    expect(blocked(allIssues(form(LAND("l1", 300), { ...HOUSE(0), isMixedUseHouse: true })))).toEqual([]);
  });

  it("④ — 짝 주택(신축 아님)에는 정착면적을 싣지 않는다(화면에서 역방향 단위를 만들지 않는다 · 종전 동작)", async () => {
    const body = await captureBody(form(LAND("l1", 400), HOUSE(0)));
    const house = (body.companionAssets as Record<string, unknown>[]).find((c) => c.assetKind === "housing")!;
    expect(house.buildingFootprintArea).toBeUndefined();
  });

  it("결과뷰 — 신고서 양식의 `primary__appurtenant`·`primary__excess` 열은 첫 자산(토지)의 취득일을 쓴다(컴패니언 분리 열과 같은 규약 · route가 API 본문으로 이 구성을 받은 경우)", async () => {
    const f = form({ ...LAND("l1", 400), acquisitionDate: "2012-05-05" }, HOUSE(0));
    const body = await captureBody(f);
    // route 단위를 만드는 사실(짝 주택 정착면적·소재지 구분) — 화면 ④는 싣지 않으므로 본문에 직접 넣는다.
    const withFootprint = {
      ...body,
      companionAssets: (body.companionAssets as Record<string, unknown>[]).map((c) =>
        c.assetId === "h1" ? { ...c, buildingFootprintArea: 100, appurtenantLandZone: "metropolitan_residential", isUrbanArea: true } : c,
      ),
    };
    const r = await postTransfer(withFootprint);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated as Agg;
    const rows = buildAggregateRows(
      {} as unknown as TransferTaxResult,
      { properties: agg.properties, aggregated: agg } as unknown as AggregateMeta,
      f,
    );
    const acq = rows.find((row) => row.label === "취득일자")!.values as Record<string, unknown>;
    expect(acq["primary__appurtenant"]).toBe("2012-05-05");
    expect(acq["primary__excess"]).toBe("2012-05-05");
    expect(acq["h1"]).toBe("2014-01-02");
  });
});
