/**
 * 아코디언 — 일반건물 분할 파트 카드(토지·건물)는 «산출세액 (참고)»·«결정세액 (참고)» 행을 싣지 않는다 (Q-1 a).
 * 계획서 docs/00-pm/multi-per-asset-display-followup3.plan.md.
 *
 * 화면 정책(`gb-part-card.ts` «합이 합계와 맞지 않아 표시하지 않는다»)·신고서 건별 열(공란)·PDF(#3170)와 맞춘다.
 * 같은 카드의 «감면세액» 행은 해당하지 않는다 — 파트 배분 감면의 합이 합산 감면과 같다.
 * 실제 다건 route 응답(`land#p2`·`building#p2`, `generalBuildingDetailsByAsset.p2`)을 서버 렌더(`renderToStaticMarkup`)해 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiGbAssetGroup } from "@/components/calc/results/MultiGbAssetGroup";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { groupMultiResultRows } from "@/components/calc/results/transfer/multi-result-groups";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeDefaultAsset, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { buildMultiBody } from "../calc/_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TD = "2024-03-01";

/** `transfer.route.gb-amendment.predo.anchor.test.ts`·`gb-reduction-penalty-f17`과 같은 물건 — 실가 198,210,000 · 환산 111,380,000. */
const COMMON = {
  transferDate: TD,
  expenses: 0,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbZoneType: "general_residential",
    ...over,
  } as AssetForm;
}


/** 같은 물건의 단건 body(다건 항목에도 그대로 쓴다). */
function gbBody(asset: AssetForm, top: Obj = {}): Obj {
  return {
    ...COMMON,
    useEstimatedAcquisition: asset.useEstimatedAcquisition,
    propertyType: "general_building",
    transferPrice: 1_000_000_000,
    totalPropertyTransferPrice: 1_000_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: asset.acquisitionDate,
    generalBuildingValuation: buildGeneralBuildingValuation(asset, TD),
    ...top,
  };
}

/** 같은 해 먼저 양도한 토지(기본공제를 먼저 쓴다). */
const LAND: Obj = {
  ...COMMON,
  transferDate: "2024-01-15",
  propertyType: "land",
  transferPrice: 300_000_000,
  acquisitionPrice: 100_000_000,
  acquisitionDate: "2015-01-01",
  useEstimatedAcquisition: false,
};

const post = async (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Obj };
};

async function multi(items: Obj[]): Promise<Obj> {
  const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    basicDeductionAllocation: "EARLIEST_TRANSFER",
    properties: items.map((it, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `양도 ${i + 1}번`, ...it })),
  });
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  return r.json.data;
}

/** §77 공익수용 감면 1건을 실은 주택 폼 — ④ 변환이 만드는 실제 API 감면 본문을 얻는 용도 */
function housingForm(): TransferFormData {
  const r77 = { ...getReductionDefault("public_expropriation"), expropriationCash: "900,000,000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01" };
  const c = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-03-01", actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000", assetContractDate: "", reductions: [r77],
  }) as unknown as AssetForm;
  return Object.assign(createDefaultTransferFormData(), { transferDate: "2025-08-01", contractTotalPrice: "900000000", assets: [c], isOneHousehold: false, householdHousingCount: "1" }) as TransferFormData;
}

const count = (html: string, label: string) => html.split(`>${label}<`).length - 1;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

function gbGroupHtml(m: Obj): string {
  const g = groupMultiResultRows(m.properties).find((x) => x.isCardGroup)!;
  return html(createElement(MultiGbAssetGroup, { result: m as never, formPropertyId: g.formPropertyId, cards: g.rows as never, property: undefined }));
}

describe("아코디언 — 일반건물 파트 카드의 참고 세액 두 행", () => {
  it("토지 + 일반건물: 파트 카드(land#p2·building#p2)에는 두 행이 없고, 일반 자산(토지) 카드에는 그대로 있다", async () => {
    const m = await multi([LAND, gbBody(gbAsset())]);
    expect(m.properties.map((p: Obj) => p.propertyId)).toEqual(["p1", "land#p2", "building#p2"]);
    const g = gbGroupHtml(m);
    expect(g, "전제: 일반건물 그룹이 파트 카드 2장을 그린다").toContain("multi-gb-group-p2");
    expect(count(g, "산출세액 (참고)")).toBe(0);
    expect(count(g, "결정세액 (참고)")).toBe(0);
    const land = html(createElement(PropertyBreakdownAccordion, { breakdown: m.properties[0] }));
    expect(count(land, "산출세액 (참고)")).toBe(1);
    expect(count(land, "결정세액 (참고)")).toBe(1);
  });

  it("일반건물만(1건)", async () => {
    const m = await multi([gbBody(gbAsset())]);
    const g = gbGroupHtml(m);
    expect(count(g, "산출세액 (참고)")).toBe(0);
    expect(count(g, "결정세액 (참고)")).toBe(0);
  });

  it("파트 카드에 배분 감면이 있으면 «감면세액» 행은 그대로 남는다 (§77 이식)", async () => {
    // 주택 폼 → ④ 변환으로 얻은 실제 §77 API 본문을 일반건물 항목에 얹는다 (비주택 감면은 ⑫가 허용)
    const reds = ((await buildMultiBody([housingForm()])).properties as Obj[])[0].reductions;
    const m = await multi([gbBody(gbAsset(), { reductions: reds })]);
    expect(m.reductionAmount).toBeGreaterThan(0);
    const g = gbGroupHtml(m);
    expect(count(g, "산출세액 (참고)")).toBe(0);
    expect(count(g, "결정세액 (참고)")).toBe(0);
    // 그룹 전체에는 «감면세액» 라벨이 다른 블록(3분 표 등)에도 쓰이므로 파트 카드 단위로 본다
    const parts = groupMultiResultRows(m.properties as PerPropertyBreakdown[]).find((x) => x.isCardGroup)!.rows;
    expect(parts).toHaveLength(2);
    for (const c of parts) {
      expect(c.reductionAggregated, "전제: 파트에 배분 감면이 있다").toBeGreaterThan(0);
      const card = html(createElement(PropertyBreakdownAccordion, { breakdown: c, hideRefTax: true }));
      const full = html(createElement(PropertyBreakdownAccordion, { breakdown: c }));
      expect(count(full, "감면세액"), "전제: 숨기지 않을 때 감면 행이 있다").toBeGreaterThan(0);
      expect(count(card, "감면세액")).toBe(count(full, "감면세액")); // 감면 행은 줄지 않는다
      expect(count(full, "산출세액 (참고)"), "전제: 숨기지 않으면 산출 행이 있다").toBe(1);
      expect(count(card, "산출세액 (참고)")).toBe(0);
      expect(count(card, "결정세액 (참고)")).toBe(0);
    }
  });
});
