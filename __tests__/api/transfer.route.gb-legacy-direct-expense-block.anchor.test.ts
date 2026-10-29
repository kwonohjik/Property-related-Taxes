/**
 * anchor — 일반건물 **옛 필요경비 칸(`directExpenses`)** 이 계산에 쓰이지 않는 조합을 ⑧이 막는다 (계획서 `docs/00-pm/gb-legacy-direct-expense-estimated-mixed.plan.md` Q-1 a)
 *
 * 옛 칸은 `input.expenses` → 일반건물 `actualExpenses` 로만 가고, **실가 경로만** 읽는다(`general-building-route-actual.ts:95`). 환산 파트가 있거나 실가·감정(매매사례)이
 * 섞이면 읽히지 않아 값이 침묵 누락된다. 값의 성질(자본적지출/양도비)을 모르므로(분리 ON 혼합에서 0~전액) 어느 칸으로 옮길지 지어내지 않고 입력자가 나눠 입력하게 막는다.
 *
 * 🔑 **엔진 거동에서 기대값을 도출한다**(live 대조): 옛 칸 D 를 넣어도 세액이 안 바뀌는데(= 누락) 같은 D 를 양도비 칸에 넣으면 바뀌는(= 쓰일 값) 조합만 ⑧ 이 막아야 한다.
 *    - 쓰이는 조합(분리 OFF 일괄 실가 · 분리 ON 실가+실가)은 막으면 안 된다.
 *    - 모든 파트가 감정·매매사례(개산공제뿐)면 옛 칸이 안 쓰이는 것이 법문상 맞다(§97②2호 본문) → 막지 않는다.
 * 경로: 단건 · 함께 양도(GB 주 / GB 컴패니언). 격자의 D = 2,000,000,000 은 모든 환산 조합에서 단서가 발동하는 규모다(작으면 환산이 개산공제 승자라 차이가 없고, 토지가 감정인 조합은 양도비 몫이 건물에만 가서 6억으로는 안 닿는다 — 실측).
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
const ACTUAL = { buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const ESTIMATED = { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
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

const D = "2000000000";
const D600 = "600000000";
const OFF_EST = { hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: true, acquisitionDate: "2010-05-01", landAcquisitionDate: "2010-05-01", landAcqMode: undefined, buildingAcqMode: undefined, landAcquisitionPrice: "", buildingAcquisitionPrice: "" } as unknown as Partial<AssetForm>;
const OFF_ACT = { hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false, acquisitionDate: "2010-05-01", landAcquisitionDate: "2010-05-01", fixedAcquisitionPrice: "600000000", landAcqMode: undefined, buildingAcqMode: undefined, landAcquisitionPrice: "", buildingAcquisitionPrice: "" } as unknown as Partial<AssetForm>;
const OFF_APPRAISAL = { ...OFF_ACT, useEstimatedAcquisition: false, isAppraisalAcquisition: true } as unknown as Partial<AssetForm>;
const ON_ACTUAL = { ...ACTUAL, useEstimatedAcquisition: false } as Partial<AssetForm>;
const BOTH_APPRAISAL = { landAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const LAND_EST_BLD_APPRAISAL = { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const LAND_APPRAISAL_BLD_ACT = { landAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const LAND_APPRAISAL_BLD_EST = { landAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const MODES: [string, Partial<AssetForm>][] = [
  ["분리 OFF 일괄 실가", OFF_ACT], ["분리 OFF 전체 환산", OFF_EST], ["분리 OFF 일괄 감정", OFF_APPRAISAL],
  ["분리 ON 실가+실가", ON_ACTUAL], ["분리 ON 토지 실가+건물 감정", {}], ["분리 ON 토지 실가+건물 환산", LAND_ACT_BLD_EST],
  ["분리 ON 토지 환산+건물 실가", LAND_EST_BLD_ACT], ["분리 ON 환산+환산", ESTIMATED], ["분리 ON 감정+감정", BOTH_APPRAISAL],
  ["분리 ON 토지 환산+건물 감정", LAND_EST_BLD_APPRAISAL], ["분리 ON 토지 감정+건물 실가", LAND_APPRAISAL_BLD_ACT], ["분리 ON 토지 감정+건물 환산", LAND_APPRAISAL_BLD_EST],
];
const single = (g: AssetForm): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(T), assets: [g] });
  return f as unknown as TransferFormData;
};
const PATHS: [string, (mode: Partial<AssetForm>, over: Partial<AssetForm>) => TransferFormData][] = [
  ["단건", (m, o) => single(gbAsset(1, m, o))],
  ["함께 양도 GB 주", (m, o) => bundle([gbAsset(1, m, o), landAsset(2)])],
  ["함께 양도 GB 컴패니언", (m, o) => bundle([landAsset(1), gbAsset(2, m, o)])],
];
const legacyIssues = (f: TransferFormData) => allIssues(f).filter((i) => i.split(":")[1] === "directExpenses");

describe("LB-1 옛 칸이 쓰이지 않는 조합만 ⑧이 막는다 — 엔진 거동에서 도출한 기대와 ±0", () => {
  for (const [pn, mk] of PATHS) {
    it.each(MODES)(`${pn} · %s`, async (_mn, mode) => {
      const none = (await run(mk(mode, {}))).tax;
      const legacy = (await run(mk(mode, { directExpenses: D }))).tax;
      const viaTx = (await run(mk(mode, { transferExpense: D }))).tax;
      const dropped = legacy === none && viaTx !== none;
      expect(legacyIssues(mk(mode, { directExpenses: D })).length > 0).toBe(dropped);
    });
  }

  it("막는 조합 수를 고정한다 — 환산 파트가 있거나 실가·감정 혼합인 8모드 × 3경로 = 24, 쓰이는 조합·개산공제뿐 조합은 0", async () => {
    let blocked = 0;
    for (const [, mk] of PATHS) for (const [, mode] of MODES) if (legacyIssues(mk(mode, { directExpenses: D })).length) blocked++;
    expect(blocked).toBe(24);
  });
});

describe("LB-2 막지 않는 경우", () => {
  const MIXED: Partial<AssetForm> = LAND_ACT_BLD_EST;

  it("옛 칸이 0 이면 이슈 없음", () => {
    expect(legacyIssues(single(gbAsset(1, MIXED, { directExpenses: "0" })))).toEqual([]);
  });

  it("양도비 칸에 값이 있으면(옛 칸은 화면에서 숨는다 — 숨은 칸을 지목하지 않는다) 이슈 없음", () => {
    expect(legacyIssues(single(gbAsset(1, MIXED, { directExpenses: D, transferExpense: "1000000" })))).toEqual([]);
  });

  it("자본적지출 칸에 값이 있으면 이슈 없음", () => {
    expect(legacyIssues(single(gbAsset(1, MIXED, { directExpenses: D, capitalExpenditure: "1000000" })))).toEqual([]);
  });

  it("옛 칸을 비우고 양도비 칸에 옮기면 통과하고 세액은 양도비 칸 값과 같다", async () => {
    const f = single(gbAsset(1, ESTIMATED, { transferExpense: D600 }));
    expect(legacyIssues(f)).toEqual([]);
    expect((await run(f)).tax).toBe(257_010_000);
  });
});
