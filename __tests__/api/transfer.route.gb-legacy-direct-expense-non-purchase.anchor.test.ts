/**
 * anchor — 일반건물 **옛 필요경비 칸(`directExpenses`)** 의 ⑧ 차단이 **취득원인과 무관하게** 쓰이지 않는 조합만 막는다 (계획서 `docs/00-pm/gb-legacy-direct-expense-non-purchase-causes.plan.md` Q-1 a)
 *
 * #2711 은 매매 취득원인만 막고 증여·신축·이월과세·상속은 「미측정」으로 제외했다(`isPurchase`). 실측: 한 파트가 증여·신축·이월과세이고 다른 파트가 환산·감정이면
 * 혼합 경로라 옛 칸이 똑같이 누락됐다(증여·신축 21칸 중 18, 이월과세 32칸 중 20 · ⑧ 미차단). 상속은 §163⑨ 로 파트 모드가 실가에 고정돼 결함이 없다.
 *
 * 🔑 **엔진 거동에서 기대값을 도출한다**(live 대조 — #2711 과 같은 방식): `dropped = 옛 칸 세액 = 없음 && 양도비 칸 세액 ≠ 없음` 이면 ⑧ 이 막아야 하고, 아니면 막으면 안 된다.
 *    이월과세 격자의 D 는 600,000,000(양도 2024-03-01), 증여·신축 격자의 D 는 2,000,000,000(환산 단서가 발동하는 규모).
 * 경로: 단건 · 함께 양도(GB 주 / GB 컴패니언) · 지분(이월과세만).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});



const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: String(T),
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", useEstimatedAcquisition: true,
  landAcqMode: "actual", landAcquisitionPrice: "400000000", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000",
};
const LAND_EST_BLD_ACT = { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const LAND_ACT_BLD_EST = { buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number, over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000", ...over,
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, {
    transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual",
    contractTotalPrice: "2000000000", ...over,
  });
  return f as unknown as TransferFormData;
};
async function run(f: TransferFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  expect(res.status, `${JSON.stringify(j.error)} ${String(allIssues(f)).slice(0, 120)}`).toBe(200);
  const ps = j.data.aggregated.properties as { propertyId: string; necessaryExpense: number }[];
  return { tax: j.data.aggregated.calculatedTax as number, cards: ps.map((p) => p.necessaryExpense) };
}

const LAND_APPRAISAL_BLD_ACT = { landAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const single = (g: AssetForm): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(T), assets: [g] });
  return f as unknown as TransferFormData;
};

import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
const legacyIssues = (f: TransferFormData) => allIssues(f).filter((i) => i.split(":")[1] === "directExpenses");
const D_MIX = "2000000000";
const D_CO = "600000000";

type Path = [string, (c: Partial<AssetForm>[], o: Partial<AssetForm>) => TransferFormData];
/** 격자 한 칸 — 엔진 거동에서 「누락」을 도출하고 ⑧ 차단과 비교한다. */
async function cell(mk: Path[1], c: Partial<AssetForm>[], d: string) {
  const none = (await run(mk(c, {}))).tax;
  const legacy = (await run(mk(c, { directExpenses: d }))).tax;
  const viaTx = (await run(mk(c, { transferExpense: d }))).tax;
  return { dropped: legacy === none && viaTx !== none, blocked: legacyIssues(mk(c, { directExpenses: d })).length > 0 };
}

// ── 격자 A — 증여·신축·상속 (양도 2026-02-16) ─────────────────────────────────
const GIFT_LAND = { acquisitionCause: "gift", fixedAcquisitionPrice: "600000000" } as Partial<AssetForm>;
const GIFT_BLD = { gbBuildingAcquisitionCause: "gift" } as Partial<AssetForm>;
const NEW_BLD = { gbBuildingAcquisitionCause: "newConstruction" } as Partial<AssetForm>;
const PRE85 = { landAcquisitionDate: "1980-05-01", acquisitionDate: "1982-05-01" } as Partial<AssetForm>;
const INHERIT = {
  acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", decedentAcquisitionDate: "1960-01-01",
  publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000", landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false,
} as Partial<AssetForm>;
const ACT_BOTH = { landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false } as Partial<AssetForm>;
const MIX_COMBOS: [string, Partial<AssetForm>[], boolean][] = [
  ["증여 토지(실가) + 건물 매매 감정", [GIFT_LAND, {}], true],
  ["증여 토지(실가) + 건물 매매 환산", [GIFT_LAND, LAND_ACT_BLD_EST], true],
  ["건물 증여(실가) + 토지 매매 환산", [GIFT_BLD, LAND_EST_BLD_ACT], true],
  ["건물 증여(실가) + 토지 매매 감정", [GIFT_BLD, LAND_APPRAISAL_BLD_ACT], true],
  ["건물 신축(실가) + 토지 매매 환산", [NEW_BLD, LAND_EST_BLD_ACT], true],
  ["건물 신축(실가) + 토지 매매 감정", [NEW_BLD, LAND_APPRAISAL_BLD_ACT], true],
  ["둘 다 증여 · 1985 전 취득(실가+실가)", [GIFT_LAND, GIFT_BLD, PRE85, ACT_BOTH], false],
  ["둘 다 상속(실가+실가)", [INHERIT], false],
  ["둘 다 상속 · 1985 전 취득", [INHERIT, PRE85], false],
];
const MIX_PATHS: Path[] = [
  ["단건", (c, o) => single(gbAsset(1, ...c, o))],
  ["함께 양도 GB 주", (c, o) => bundle([gbAsset(1, ...c, o), landAsset(2)])],
  ["함께 양도 GB 컴패니언", (c, o) => bundle([landAsset(1), gbAsset(2, ...c, o)])],
];

describe("NP-1 증여·신축·상속 — 옛 칸이 누락되는 조합만 ⑧이 막는다 (엔진 거동에서 도출)", () => {
  for (const [pn, mk] of MIX_PATHS) {
    it.each(MIX_COMBOS)(`${pn} · %s`, async (_n, c, expectDropped) => {
      const r = await cell(mk, c, D_MIX);
      expect(r.dropped).toBe(expectDropped);
      expect(r.blocked).toBe(r.dropped);
    });
  }
  it("막는 조합 수를 고정한다 — 혼합 6조합 × 3경로 = 18, 1985 전 증여·상속 실가 조합은 0", async () => {
    let blocked = 0;
    let free = 0;
    for (const [, mk] of MIX_PATHS) for (const [, c, drop] of MIX_COMBOS) {
      const b = legacyIssues(mk(c, { directExpenses: D_MIX })).length > 0;
      if (b) blocked++;
      if (!drop && !b) free++;
    }
    expect([blocked, free]).toEqual([18, 9]);
  });
});

// ── 격자 B — 이월과세 (양도 2024-03-01) ──────────────────────────────────────
const cof = (over: object = {}) => ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000", giftTaxAmount: "30,000,000", giftDateValuation: "400,000,000", ...over });
const bco = () => cof({ donorAcquisitionPrice: "80,000,000", giftDateValuation: "300,000,000", giftTaxAmount: "20,000,000" });
const gbc = (over: Partial<AssetForm> = {}, id = 1): AssetForm => ({
  ...makeDefaultAsset(id), assetKind: "general_building", addressJibun: `서울 강남구 테스트동 ${id}`, acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2021-03-01", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2021-03-01",
  landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", actualSalePrice: "1000000000", ...over,
}) as AssetForm;
const LC = { acquisitionCause: "carryover_gift", carryover: cof() } as unknown as Partial<AssetForm>;
const BC = { gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: bco() } as unknown as Partial<AssetForm>;
const EST_BOTH = { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated", landAcquisitionPrice: "", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const BLD_EST = { buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const BLD_APR = { buildingAcqMode: "appraisal" } as Partial<AssetForm>;
const LAND_EST = { landAcqMode: "estimated", landAcquisitionPrice: "" } as Partial<AssetForm>;
const CO_COMBOS: [string, Partial<AssetForm>[], boolean][] = [
  ["토지 이월과세 · 실가+실가", [LC], false],
  ["토지 이월과세 · 건물 환산", [LC, BLD_EST], true],
  ["토지 이월과세 · 건물 감정", [LC, BLD_APR], true],
  ["토지 이월과세 · 환산+환산", [LC, EST_BOTH], true],
  ["건물 이월과세 · 실가+실가", [BC], false],
  ["건물 이월과세 · 토지 환산", [BC, LAND_EST], true],
  ["둘 다 이월과세 · 실가+실가", [LC, BC], false],
  ["둘 다 이월과세 · 환산+환산", [LC, BC, EST_BOTH], true],
];
const mkF = (assets: AssetForm[], over: Record<string, unknown>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2024-03-01", filingDate: "2024-05-31", ...over, assets });
  return f as unknown as TransferFormData;
};
const half = (c: Partial<AssetForm>[], o: Partial<AssetForm>, id: number) =>
  gbc({ ...Object.assign({}, ...c, o), ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>, id);
const CO_PATHS: Path[] = [
  ["단건", (c, o) => mkF([gbc(Object.assign({}, ...c, o))], { contractTotalPrice: "1000000000" })],
  ["함께 양도 GB 주", (c, o) => mkF([gbc(Object.assign({}, ...c, o)), landAsset(2, { acquisitionDate: "2018-01-01" })], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1400000000" })],
  ["함께 양도 GB 컴패니언", (c, o) => mkF([landAsset(1, { acquisitionDate: "2018-01-01" }), gbc(Object.assign({}, ...c, o), 2)], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1400000000" })],
  ["지분", (c, o) => mkF([half(c, o, 1), half(c, o, 2)], { assetSplitMode: "fractional", contractTotalPrice: "1000000000" })],
];

describe("NP-2 이월과세 — 옛 칸이 누락되는 조합만 ⑧이 막는다 (엔진 거동에서 도출)", () => {
  for (const [pn, mk] of CO_PATHS) {
    it.each(CO_COMBOS)(`${pn} · %s`, async (_n, c, expectDropped) => {
      const r = await cell(mk, c, D_CO);
      expect(r.dropped).toBe(expectDropped);
      expect(r.blocked).toBe(r.dropped);
    });
  }
  it("막는 조합 수를 고정한다 — 환산·감정 파트가 있는 5조합 × 4경로 = 20, 실가+실가 3조합 × 4경로 = 12는 0", async () => {
    let blocked = 0;
    let free = 0;
    for (const [, mk] of CO_PATHS) for (const [, c, drop] of CO_COMBOS) {
      const b = legacyIssues(mk(c, { directExpenses: D_CO })).length > 0;
      if (b) blocked++;
      if (!drop && !b) free++;
    }
    expect([blocked, free]).toEqual([20, 12]);
  });
  it("회귀 — 자본적지출·양도비 칸에 값이 있으면 이월과세 환산 조합도 이슈 없음(숨은 칸을 지목하지 않는다)", () => {
    expect(legacyIssues(CO_PATHS[0][1]([LC, BLD_EST], { directExpenses: D_CO, transferExpense: "1000000" }))).toEqual([]);
    expect(legacyIssues(CO_PATHS[0][1]([LC, BLD_EST], { directExpenses: D_CO, capitalExpenditure: "1000000" }))).toEqual([]);
  });
  it("회귀 — 부담부증여는 이 술어가 아니라 별도 규칙이 처리한다(이월과세 환산이어도 옛 칸 이슈 없음)", () => {
    expect(legacyIssues(CO_PATHS[0][1]([LC, BLD_EST], { directExpenses: D_CO, transferType: "burdened_gift" } as Partial<AssetForm>))).toEqual([]);
  });
});
