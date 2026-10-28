/**
 * anchor — 일반건물 축 B(같은 물건 지분 분할) × 폼 상단 「총 양도비」 (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` 결함 A · §5.1)
 *
 * 종전: 지분 빌더가 카드의 자산 칸 양도비만 싣고 총 양도비를 받지 못해, 총 양도비를 넣어도 전 카드 필요경비 0 · 세액 불변이었다
 * (같은 조건의 토지 축 B 는 정상). 화면은 「자동 안분 N = 총 양도비 × 지분」이라고 보여 준다.
 *
 * 약속: **총 양도비 N 한 번 입력 ≡ 각 카드 양도비 칸에 N(100% 기준) 입력** — 카드마다 지분율로 줄어 Σ = N, 파트 분배는 자산 칸 채널과 같다
 * (소득세법 §100② 후문 · §97②1호·2호).
 *
 *   AB-1~3  실가+실가 · 혼합(토지 실가 + 건물 감정) · 환산+환산 — 오라클 값을 ±0 으로 고정
 *   AB-4    총 양도비 ≡ 카드 입력 (live 대조)
 *   AB-5    총 양도비 없음 → 불변(회귀)
 *   AB-6    단건 일반건물은 총 양도비 칸이 없다 → 무시(회귀)
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
/** 총 양도비 한 번 입력 */
const viaTotal = (mode: Partial<AssetForm>, total: string) =>
  axisB([share(1, "60", mode), share(2, "40", mode)], { totalTransferExpense: total });
/** 오라클 — 각 카드 양도비 칸에 같은 금액(100% 기준) */
const viaCards = (mode: Partial<AssetForm>, each: string) =>
  axisB([share(1, "60", mode, { transferExpense: each }), share(2, "40", mode, { transferExpense: each })]);

describe("AB-1~3 총 양도비가 카드·파트 필요경비에 닿는다", () => {
  it("AB-1 실가+실가 · 총 5,000,000 → 카드1 3,000,000(2,440,626 + 559,374) · 카드2 2,000,000(1,627,084 + 372,916), Σ 5,000,000", async () => {
    const r = await run(viaTotal(ACTUAL, "5000000"));
    expect(r.cards).toEqual([2_440_626, 559_374, 1_627_084, 372_916]);
    expect(r.cards.reduce((s, v) => s + v, 0)).toBe(5_000_000);
    expect(r.tax).toBe(255_540_000);
  });

  it("AB-2 혼합(토지 실가 + 건물 감정) · 총 5,000,000 → 토지만 받고 감정 건물 몫은 버려진다(개산공제 2,700,000·1,800,000 그대로)", async () => {
    const r = await run(viaTotal({}, "5000000"));
    expect(r.cards).toEqual([2_440_626, 2_700_000, 1_627_084, 1_800_000]);
    expect(r.tax).toBe(254_491_093);
  });

  it("AB-3 환산+환산 · 총 1,500,000,000(단서 발동 규모) → 나목(자본적지출+양도비)이 환산취득가+개산공제를 넘어 채택된다", async () => {
    const r = await run(viaTotal(ESTIMATED, "1500000000"));
    expect(r.cards).toEqual([519_718_309, 380_281_691, 346_478_871, 253_521_129]);
    expect(r.tax).toBe(0);
  });
});

describe("AB-4 총 양도비 N ≡ 각 카드 양도비 칸 N (100% 기준)", () => {
  it.each([
    ["실가+실가", ACTUAL, "5000000"],
    ["혼합", {} as Partial<AssetForm>, "5000000"],
    ["환산+환산", ESTIMATED, "1500000000"],
  ] as const)("%s", async (_tag, mode, n) => {
    const a = await run(viaTotal(mode, n));
    const b = await run(viaCards(mode, n));
    expect(a.cards).toEqual(b.cards);
    expect(a.tax).toBe(b.tax);
  });
});

describe("AB-5·6 회귀 — 총 양도비가 없거나 칸이 없으면 종전 그대로", () => {
  it("AB-5 총 양도비 비움 → 카드 필요경비는 개산공제뿐(실가+실가는 0) · 세액 종전 값", async () => {
    const r = await run(axisB([share(1, "60", ACTUAL), share(2, "40", ACTUAL)]));
    expect(r.cards).toEqual([0, 0, 0, 0]);
    expect(r.tax).toBe(257_010_000);
  });

  it("AB-6 자산 1건 일반건물은 총 양도비 칸이 없다 → 입력이 남아 있어도 무시 (종전 255,687,000)", async () => {
    const one = Object.assign({ ...makeDefaultAsset(1) }, BASE) as AssetForm;
    const f = newForm() as unknown as Record<string, unknown>;
    Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(T), assets: [one], totalTransferExpense: "5000000" });
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(await captureBody(f as unknown as TransferFormData)),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(j.data.aggregated.calculatedTax).toBe(255_687_000);
  });
});
