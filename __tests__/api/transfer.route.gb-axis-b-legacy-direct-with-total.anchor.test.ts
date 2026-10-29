/**
 * anchor — 일반건물 **축 B(지분) × 옛 필요경비 칸(`directExpenses`) + 폼 총 양도비** 동시 입력 (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` §13)
 *
 * 🔴 결함: `buildGeneralBuildingShares` 가 총 양도비를 선언 채널(`transferExpense`)로 옮기면 실가 경로가 `effectiveExpenses = 선언 > 0 ? 선언 : legacy`
 *    (`general-building-route-actual.ts:95`) 로 옛 칸을 읽지 않아 그 자산의 옛 칸 직접분이 소실됐다(실가+실가 255,540,000 ↔ 오라클 255,010,800).
 *    옛 칸은 값이 이미 있을 때만 화면에 보이는 저장 데이터 전용 입력(`AssetSectionExpense.tsx:225`)이다.
 * 오라클: 카드1 양도비 칸 = 옛 칸 + 총 양도비 · 카드2 칸 = 총 양도비(100% 기준 — 엔진이 × 지분율).
 * 증축 + 옛 칸은 ⑧(`gbExtensionLegacyExpenseUnused`)이 파트 가격 대체 조합에서 막아 이 입력으로 닿지 않는다(`collectStepIssues`가 차단 — 프로브로는 API 가 받아 오라클 ±0 이었다) — 셀을 두지 않는다.
 * 수치는 mock 세율표 실측값이다(전후 대조가 목적).
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
const share = (id: number, n: string, ...over: Partial<AssetForm>[]) =>
  Object.assign({ ...makeDefaultAsset(id) }, BASE, { ownershipNumerator: n, ownershipDenominator: "100" }, ...over) as AssetForm;
const axisB = (a: AssetForm[], over: Record<string, unknown> = {}): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(T), assets: a, assetSplitMode: "fractional" }, over);
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
  return {
    tax: j.data.aggregated.calculatedTax as number,
    cards: ps.map((p) => p.necessaryExpense), // 순서: land#0 · building#0 · land#1 · building#1
  };
}


const LEGACY = "3000000";
const TOTAL = "5000000";
const withLegacy = (mode: Partial<AssetForm>, d: string, total: string) =>
  axisB([share(1, "60", mode, { directExpenses: d }), share(2, "40", mode)], { totalTransferExpense: total });
const oracle = (mode: Partial<AssetForm>, d: string, total: string) =>
  axisB([share(1, "60", mode, { transferExpense: String(Number(d) + Number(total)) }), share(2, "40", mode, { transferExpense: total })]);

describe("LD-1 옛 칸 D + 총 양도비 T ≡ 카드1 칸 D+T · 카드2 칸 T", () => {
  it("실가+실가 · 옛 칸 3,000,000 · 총 5,000,000 → 카드1 4,800,000(= 8,000,000 × 0.6) · 세액 255,010,800 (직접분 소실 시 255,540,000)", async () => {
    const r = await run(withLegacy(ACTUAL, LEGACY, TOTAL));
    expect(r.cards).toEqual([3_905_002, 894_998, 1_627_084, 372_916]);
    expect(r.tax).toBe(255_010_800);
  });

  it.each([
    ["실가+실가", ACTUAL, LEGACY, TOTAL],
    ["혼합(토지 실가 + 건물 감정)", {} as Partial<AssetForm>, LEGACY, TOTAL],
    ["환산+환산(단서 발동 규모)", ESTIMATED, "600000000", "900000000"],
  ])("%s", async (_n, mode, d, t) => {
    const a = await run(withLegacy(mode, d, t));
    const b = await run(oracle(mode, d, t));
    expect(a).toEqual(b);
  });

  it("두 카드 모두 옛 칸(3,000,000 · 2,000,000) + 총 5,000,000 → 카드 칸 8,000,000 · 7,000,000 과 같다", async () => {
    const a = await run(axisB([share(1, "60", ACTUAL, { directExpenses: "3000000" }), share(2, "40", ACTUAL, { directExpenses: "2000000" })], { totalTransferExpense: TOTAL }));
    const b = await run(axisB([share(1, "60", ACTUAL, { transferExpense: "8000000" }), share(2, "40", ACTUAL, { transferExpense: "7000000" })]));
    expect(a).toEqual(b);
    expect(a.tax).toBe(254_775_600);
  });
});

describe("LD-2 회귀 — 옛 칸만 · 총 양도비만이면 종전 그대로", () => {
  it("옛 칸만(실가+실가) → 자산 칸 3,000,000 단독과 같다 (256,480,800)", async () => {
    const a = await run(axisB([share(1, "60", ACTUAL, { directExpenses: LEGACY }), share(2, "40", ACTUAL)]));
    const b = await run(axisB([share(1, "60", ACTUAL, { transferExpense: LEGACY }), share(2, "40", ACTUAL)]));
    expect(a).toEqual(b);
    expect(a.tax).toBe(256_480_800);
  });

  it("총 양도비만 → 종전 255,540,000 · 카드 [2,440,626 · 559,374 · 1,627,084 · 372,916]", async () => {
    const r = await run(axisB([share(1, "60", ACTUAL), share(2, "40", ACTUAL)], { totalTransferExpense: TOTAL }));
    expect(r.cards).toEqual([2_440_626, 559_374, 1_627_084, 372_916]);
    expect(r.tax).toBe(255_540_000);
  });
});
