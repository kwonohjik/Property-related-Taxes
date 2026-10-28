/**
 * anchor — 일반건물 파트 카드 「감정·매매사례는 개산공제만」 안내 × 자산 단위 양도비 (혼합 자산)
 *
 * 계획서: `docs/00-pm/gb-deduction-only-notice-mixed-asset-transfer-expense.plan.md` §2.2 · §7
 *
 * 양도비는 자산 단위로 한 번 입력되어 카드(토지·건물·증축분)에 가액 비례로 나뉜다(소득세법 §100② 후문).
 * 감정·매매사례 카드의 몫만 버려지고(§97②2호 본문) 실가 카드 몫은 가산(§97②1호), 환산 카드 몫은 단서 비교(§97②2호 단서)다.
 *
 *   G-1  엔진 사실 고정 — 8조합 필요경비·세액 (양도비 5,000,000 / 환산 경계 1,500,000,000)
 *   G-2  판정 leaf `gbOtherCardsReceiveTransferExpense` ↔ 엔진 격자 전수 대조 (파트 모드 4×4 × 증축 유무)
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
import { gbOtherCardsReceiveTransferExpense } from "@/lib/calc/gb-part-transfer-expense-reach";

const T = 1_600_000_000;
const BIG_EXPENSE = "1500000000";
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01",
  acquisitionDate: "2010-05-01",
  useEstimatedAcquisition: true,
};
const EXT = {
  gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50",
  gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;

type Mode = "actual" | "estimated" | "appraisal" | "salesCase";
const MODES: Mode[] = ["actual", "estimated", "appraisal", "salesCase"];
/** 파트 하나의 모드 patch — 취득가액 칸은 그 모드가 읽는 슬롯만 채운다. */
function modePatch(part: "land" | "building", m: Mode): Partial<AssetForm> {
  const price = part === "land" ? "400000000" : "200000000";
  const k = part === "land" ? "land" : "building";
  if (m === "estimated") return { [`${k}AcqMode`]: m, [`${k}AcquisitionPrice`]: "" } as Partial<AssetForm>;
  if (m === "salesCase") return { [`${k}AcqMode`]: m, [`${k}SalesCaseValue`]: price, [`${k}AcquisitionPrice`]: "" } as Partial<AssetForm>;
  return { [`${k}AcqMode`]: m, [`${k}AcquisitionPrice`]: price } as Partial<AssetForm>;
}
const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, BASE, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = [a];
  return f;
}

async function run(a: AssetForm) {
  const f = form(a);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, `${JSON.stringify(json.error)} ${String(allIssues(f)).slice(0, 120)}`).toBe(200);
  const ps = json.data.aggregated.properties as { propertyId: string; necessaryExpense: number }[];
  return {
    tax: json.data.aggregated.calculatedTax as number,
    exp: Object.fromEntries(ps.map((p) => [p.propertyId, p.necessaryExpense])) as Record<string, number>,
  };
}
const withExpense = (a: AssetForm, v: string) => ({ ...a, transferExpense: v }) as AssetForm;

describe("G-1 엔진 사실 — 감정·매매사례 카드 몫만 버려지고 다른 카드 몫은 반영된다 (양도비 5,000,000)", () => {
  const cases: { tag: string; over: Partial<AssetForm>[]; base: [number, number, number]; with5m: [number, number, number] }[] = [
    { tag: "토지 실가 + 건물 감정", over: [modePatch("land", "actual"), modePatch("building", "appraisal")], base: [0, 4_500_000, 255_687_000], with5m: [4_067_710, 4_500_000, 254_491_093] },
    { tag: "토지 실가 + 건물 매매사례", over: [modePatch("land", "actual"), modePatch("building", "salesCase")], base: [0, 4_500_000, 255_687_000], with5m: [4_067_710, 4_500_000, 254_491_093] },
    { tag: "토지 감정 + 건물 실가", over: [modePatch("land", "appraisal"), modePatch("building", "actual")], base: [6_150_000, 0, 255_201_900], with5m: [6_150_000, 932_290, 254_927_807] },
  ];
  it.each(cases)("$tag — 실가 카드만 4,067,710/932,290 을 받고 감정·매매 카드는 개산공제 그대로", async ({ over, base, with5m }) => {
    const a = asset(...over);
    const r0 = await run(a);
    const r5 = await run(withExpense(a, "5000000"));
    expect([r0.exp.land, r0.exp.building, r0.tax]).toEqual(base);
    expect([r5.exp.land, r5.exp.building, r5.tax]).toEqual(with5m);
  });

  it("두 파트 모두 감정·매매사례가 아닌 3행 — 환산 + 감정 · 감정 + 환산 · 감정 + 매매사례는 5,000,000 으로 세액 불변", async () => {
    for (const [l, b, tax] of [["estimated", "appraisal", 302_075_519], ["appraisal", "estimated", 261_895_938], ["appraisal", "salesCase", 253_878_900]] as const) {
      const a = asset(modePatch("land", l), modePatch("building", b));
      expect((await run(a)).tax).toBe(tax);
      expect((await run(withExpense(a, "5000000"))).tax).toBe(tax);
    }
  });

  it("환산 파트는 단서 발동 규모(1,500,000,000)에서 몫이 반영되고 감정 카드 몫은 여전히 버려진다", async () => {
    const lE = asset(modePatch("land", "estimated"), modePatch("building", "appraisal"));
    const r = await run(withExpense(lE, BIG_EXPENSE));
    expect(r.exp.land).toBe(1_220_313_270);
    expect(r.exp.building).toBe(4_500_000);
    expect(r.tax).toBe(26_605_749);
    const bE = asset(modePatch("land", "appraisal"), modePatch("building", "estimated"));
    const r2 = await run(withExpense(bE, BIG_EXPENSE));
    expect(r2.exp.land).toBe(6_150_000);
    expect(r2.exp.building).toBe(279_686_730);
    expect(r2.tax).toBe(231_774_001);
  });

  it("증축분(실가)이 있으면 증축분 카드도 몫을 받는다 — 토지 3,953,884 · 증축분 139,915 · 원건물(감정) 4,500,000 불변", async () => {
    const a = asset(modePatch("land", "actual"), modePatch("building", "appraisal"), EXT);
    const r0 = await run(a);
    const r5 = await run(withExpense(a, "5000000"));
    expect([r0.exp.land, r0.exp.building1, r0.exp.building2, r0.tax]).toEqual([0, 4_500_000, 0, 240_328_361]);
    expect([r5.exp.land, r5.exp.building1, r5.exp.building2, r5.tax]).toEqual([3_953_884, 4_500_000, 139_915, 239_107_154]);
  });
});

describe("G-2 판정 leaf ↔ 엔진 격자 — 감정·매매사례 파트 p 에 대해 leaf(asset, p) == 「p 가 아닌 다른 카드의 필요경비가 양도비로 바뀌는가」", () => {
  const grid: { l: Mode; b: Mode; ext: boolean }[] = [];
  for (const l of MODES) for (const b of MODES) for (const ext of [false, true]) {
    if (l === "actual" && b === "actual") continue;
    if (l === "estimated" && b === "estimated") continue;
    if ((l === "actual" && b === "estimated") || (l === "estimated" && b === "actual")) continue;
    grid.push({ l, b, ext });
  }
  const isAprSc = (m: Mode) => m === "appraisal" || m === "salesCase";
  it.each(grid)("토지 $l · 건물 $b · 증축 $ext", async ({ l, b, ext }) => {
    const a = asset(modePatch("land", l), modePatch("building", b), ext ? EXT : {});
    const r0 = await run(a);
    const r1 = await run(withExpense(a, BIG_EXPENSE));
    const ids = ext ? ["land", "building1", "building2"] : ["land", "building"];
    const buildingId = ext ? "building1" : "building";
    for (const [part, pid, m] of [["land", "land", l], ["building", buildingId, b]] as const) {
      if (!isAprSc(m)) continue;
      const others = ids.filter((id) => id !== pid);
      const reaches = others.some((id) => r1.exp[id] !== r0.exp[id]);
      // p 자신의 카드 몫은 항상 버려진다
      expect(r1.exp[pid], `${part} 카드 자신은 불변`).toBe(r0.exp[pid]);
      expect(gbOtherCardsReceiveTransferExpense(a, part), `${part} 파트 leaf`).toBe(reaches);
    }
  });
});
