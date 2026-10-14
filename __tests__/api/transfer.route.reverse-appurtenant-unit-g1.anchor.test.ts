/**
 * G1 — 사례 28 역방향: **첫 자산이 주택부수토지**(토지 · `landNature: "appurtenant_to_housing"`)이고 주택은 함께 양도 자산인 일괄양도.
 * 계획서 `docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md` V-5.
 *
 * 사용자 결정(2026-10-13): ① 첫 자산 토지를 배율 이내분·초과분 두 항목으로 나눈다(`primary__appurtenant` / `primary__excess`)
 * ② 토지가 첫 자산이어도 1세대1주택 합산 판정(주택 카드 + 배율 이내 토지) ③ 함께 양도 주택 카드의 토지가 배율 한도를 먼저 쓴다(K1 규칙).
 *
 * 성공 기준: 같은 사실을 주택 먼저(K1 경로)와 토지 먼저로 넣으면 총세액·항목별 비과세·장특·세율·양도가액이 같다.
 * 세율은 프로덕션 fallback. 1세대1주택 · 2014 취득 · 거주 5년 · 수도권 주거지역 3배 · 정착면적 100㎡ → 한도 300㎡.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const TD = "2026-02-16";
const rates = loadFallbackTransferRates(new Date(TD));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

type Prop = {
  propertyId: string;
  transferPrice: number;
  transferGain: number;
  isExempt?: boolean;
  isPartialExempt?: boolean;
  longTermHoldingDeduction?: number;
  rateClause?: string;
  determinedTax?: number;
};
type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };

async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}

interface Facts {
  house: number;
  /** 주택 카드 자신의 토지 면적(㎡) — 0이면 주택 카드에 토지 없음 */
  houseLand: number;
  /** 부수토지 [가액, 면적] — 첫 항목이 역방향의 첫 자산 */
  lands: [number, number][];
  household?: { isOneHousehold: boolean; householdHousingCount: number };
}

const HOUSEHOLD = { isOneHousehold: true, householdHousingCount: 1 };
const COMMON = {
  transferDate: TD,
  acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
};
const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const total = (f: Facts) => f.house + f.lands.reduce((s, [p]) => s + p, 0);
const landCompanion = (id: string, [price, area]: [number, number], f: Facts) => ({
  assetId: id,
  assetLabel: `부수토지 ${id}`,
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: price / 2,
  standardPriceAtTransfer: price / 1000,
  directExpenses: 0,
  isOneHousehold: (f.household ?? HOUSEHOLD).isOneHousehold,
  areaM2: area,
  reductions: [],
});

/** K1 경로 — 주택이 첫 자산 */
const forward = (f: Facts) => ({
  ...COMMON,
  ...(f.household ?? HOUSEHOLD),
  ...ZONE,
  propertyType: "housing",
  transferPrice: f.house,
  acquisitionPrice: f.house / 2,
  ...(f.houseLand > 0 ? { acquisitionArea: f.houseLand } : {}),
  totalSalePrice: total(f),
  standardPriceAtTransferForApportion: f.house / 1000,
  companionAssets: f.lands.map((l, i) => landCompanion(`c${i + 1}`, l, f)),
});

/** 역방향 — 첫 자산이 주택부수토지, 주택은 함께 양도(정착면적·소재지 구분은 주택 카드에) */
const reverse = (f: Facts) => {
  const [[firstPrice, firstArea], ...rest] = f.lands;
  return {
    ...COMMON,
    ...(f.household ?? HOUSEHOLD),
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    transferPrice: firstPrice,
    acquisitionPrice: firstPrice / 2,
    acquisitionArea: firstArea,
    transferArea: firstArea,
    totalSalePrice: total(f),
    standardPriceAtTransferForApportion: firstPrice / 1000,
    companionAssets: [
      {
        assetId: "h1",
        assetLabel: "주택",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2014-01-01",
        fixedAcquisitionPrice: f.house / 2,
        standardPriceAtTransfer: f.house / 1000,
        directExpenses: 0,
        isOneHousehold: (f.household ?? HOUSEHOLD).isOneHousehold,
        reductions: [],
        ...ZONE,
        ...(f.houseLand > 0 ? { companionHousingLand: { landAreaM2: f.houseLand, footprintM2: 100, zone: "metropolitan_residential" } } : {}),
      },
      ...rest.map((l, i) => landCompanion(`c${i + 2}`, l, f)),
    ],
  };
};

/** 항목을 역할로 맞춘다 — 주택: forward `primary` ↔ reverse `h1` · 첫 토지: forward `c1…` ↔ reverse `primary…` */
const norm = (a: Agg, dir: "f" | "r") =>
  a.properties
    .map((p) => ({
      id: dir === "f" ? p.propertyId.replace(/^primary$/, "HOUSE") : p.propertyId.replace(/^h1$/, "HOUSE").replace(/^primary/, "c1"),
      transferPrice: p.transferPrice,
      transferGain: p.transferGain,
      isExempt: p.isExempt === true,
      isPartialExempt: p.isPartialExempt === true,
      lthd: p.longTermHoldingDeduction ?? 0,
      rateClause: p.rateClause,
      determinedTax: p.determinedTax,
    }))
    .sort((x, y) => x.id.localeCompare(y.id));

async function parity(f: Facts) {
  const fw = await post(forward(f));
  const rv = await post(reverse(f));
  expect(norm(rv, "r")).toEqual(norm(fw, "f"));
  expect(rv.totalTax).toBe(fw.totalTax);
  return { fw, rv };
}
const ids = (a: Agg) => a.properties.map((p) => p.propertyId).sort();

describe("G1 — 첫 자산 주택부수토지 = 주택 먼저(K1)와 같은 계산", () => {
  it("🔑 주택 8억 + 토지 3억(300㎡ · 한도 이내) — 둘 다 0 (수정 전 역방향 25,943,500)", async () => {
    const { rv } = await parity({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] });
    expect(rv.totalTax).toBe(0);
    expect(ids(rv)).toEqual(["h1", "primary"]);
    expect(rv.properties.every((p) => p.isExempt === true)).toBe(true);
  });

  it("🔑 주택(토지 0) + 토지 400㎡ — 첫 자산이 배율 이내 300㎡·초과 100㎡ 두 항목, 초과분은 비사업용 토지 §104①8호", async () => {
    const { rv } = await parity({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 400]] });
    expect(ids(rv)).toEqual(["h1", "primary__appurtenant", "primary__excess"]);
    const ex = rv.properties.find((p) => p.propertyId === "primary__excess")!;
    expect(ex).toMatchObject({ isExempt: false, transferPrice: 75_000_000, rateClause: "104-1-8" });
    expect(rv.properties.find((p) => p.propertyId === "primary__appurtenant")).toMatchObject({ isExempt: true, transferPrice: 225_000_000 });
    expect(rv.totalTax).toBe(5_764_000);
  });

  it("🔑 주택 카드 토지 200㎡ + 토지 200㎡ — 주택 카드 토지가 한도를 먼저 써 남은 100㎡만 이내 (결정 ③)", async () => {
    const { rv } = await parity({ house: 800_000_000, houseLand: 200, lands: [[300_000_000, 200]] });
    expect(rv.properties.filter((p) => p.propertyId.startsWith("primary__")).map((p) => [p.propertyId, p.transferPrice])).toEqual([
      ["primary__appurtenant", 150_000_000],
      ["primary__excess", 150_000_000],
    ]);
    expect(rv.totalTax).toBe(14_047_000);
  });

  it("🔑 토지 200㎡ + 200㎡ 두 필지(합 12억 초과 고가주택) — 남은 한도를 면적 비율로 나눠 필지마다 이내 150·초과 50", async () => {
    const { rv } = await parity({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 200], [300_000_000, 200]] });
    expect(ids(rv)).toEqual(["c2__appurtenant", "c2__excess", "h1", "primary__appurtenant", "primary__excess"]);
    // 🔁 #17-2b 갱신: 18,553,857 → 16,432,428. 두 필지의 한도 내 카드가 배율 초과분(두 필지 합)을 몫으로 나눠 받아 회신 방식으로 과세한다(단일 주택 입력과 같은 산식).
    expect(rv.totalTax).toBe(16_432_428);
  });

  it("고가주택 12억 초과 짝 — 주택 10억 + 토지 4억(400㎡): 합계액(초과분 포함) 14억으로 안분 · 장특 표2", async () => {
    const { rv } = await parity({ house: 1_000_000_000, houseLand: 0, lands: [[400_000_000, 400]] });
    const house = rv.properties.find((p) => p.propertyId === "h1")!;
    expect(house.isPartialExempt).toBe(true);
    expect(rv.properties.find((p) => p.propertyId === "primary__appurtenant")?.isPartialExempt).toBe(true);
    expect(rv.totalTax).toBeGreaterThan(0);
  });

  it("🔑 일시적 2주택 짝 — 짝 주택 카드가 세대 단위 1주택 사실(§155①)을 주 자산 주택처럼 받는다 (검토 전 역방향 154,286,000)", async () => {
    const f: Facts = { house: 800_000_000, houseLand: 0, lands: [[300_000_000, 400]], household: { isOneHousehold: true, householdHousingCount: 2 } };
    const t2 = <T extends object>(b: T) => ({ ...b, temporaryTwoHouse: { previousAcquisitionDate: "2014-01-01", newAcquisitionDate: "2025-06-01" } });
    const fw = await post(t2(forward(f)));
    const rv = await post(t2(reverse(f)));
    expect(norm(rv, "r")).toEqual(norm(fw, "f"));
    expect(rv.totalTax).toBe(5_764_000);
    expect(fw.totalTax).toBe(5_764_000);
    expect(rv.properties.find((p) => p.propertyId === "h1")?.isExempt).toBe(true);
  });

  it("🔑 짝 주택 거주기간 — 주택 카드 자신의 값이 주 자산(토지) 행의 값보다 먼저다 · 고가주택 장특 표2 (주택 11억 + 토지 4억 · 주택 카드 거주 24, 토지 행 0)", async () => {
    const f: Facts = { house: 1_100_000_000, houseLand: 0, lands: [[400_000_000, 400]] };
    const fw = await post({ ...forward(f), residencePeriodMonths: 24 });
    const body = reverse(f);
    const rv = await post({
      ...body,
      residencePeriodMonths: 0,
      companionAssets: body.companionAssets.map((c) => (c.assetId === "h1" ? { ...c, residencePeriodMonths: 24 } : c)),
    });
    expect(norm(rv, "r")).toEqual(norm(fw, "f"));
    // 🔁 #17-2b 갱신: 24,711,500 → 18,705,498 (고가주택 + 배율 초과 — 회신 방식). 정/역 순서 동치(`norm`)와 거주 0 대조는 그대로다.
    expect(rv.totalTax).toBe(18_705_498);
    // 거주 0으로 보면 표2 거주분이 빠진다 — 우선순위가 뒤집히면 여기서 갈린다.
    const rv0 = await post({ ...body, residencePeriodMonths: 0 });
    expect(rv0.totalTax).toBeGreaterThan(rv.totalTax);
  });

  it("1세대1주택 아님 짝 — 비과세 없이도 배율 이내·초과 구분은 같다(초과분 비사업용 토지)", async () => {
    const { rv } = await parity({
      house: 800_000_000,
      houseLand: 0,
      lands: [[300_000_000, 400]],
      household: { isOneHousehold: false, householdHousingCount: 2 },
    });
    expect(ids(rv)).toEqual(["h1", "primary__appurtenant", "primary__excess"]);
    expect(rv.properties.some((p) => p.isExempt === true)).toBe(false);
  });
});

describe("G1 — 짝 주택을 정하지 못하면 종전 계산 + 안내", () => {
  const NOTICE = "짝 주택을 정하지 못해";
  it("주택 카드에 정착면적이 없으면 단위를 만들지 않는다(주택 먼저 순서도 정착면적이 없으면 단위가 없다)", async () => {
    const body = reverse({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] });
    const noFootprint = {
      ...body,
      companionAssets: body.companionAssets.map((c) =>
        c.assetId === "h1" ? { ...c, buildingFootprintArea: undefined, appurtenantLandZone: undefined, isUrbanArea: undefined } : c,
      ),
    };
    const a = await post(noFootprint);
    expect(ids(a)).toEqual(["h1", "primary"]);
    expect(a.properties.find((p) => p.propertyId === "primary")?.isExempt).toBe(false);
    expect((a.warnings ?? []).some((w) => w.includes(NOTICE))).toBe(true);
  });

  it("함께 양도 주택이 둘이면 짝 주택을 정하지 않는다", async () => {
    const body = reverse({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] });
    const twoHouses = {
      ...body,
      totalSalePrice: body.totalSalePrice + 500_000_000,
      companionAssets: [...body.companionAssets, { ...body.companionAssets[0], assetId: "h2", fixedAcquisitionPrice: 250_000_000, standardPriceAtTransfer: 500_000 }],
    };
    const a = await post(twoHouses);
    expect(a.properties.some((p) => p.propertyId.startsWith("primary__"))).toBe(false);
    expect((a.warnings ?? []).some((w) => w.includes(NOTICE))).toBe(true);
  });

  it("짝 주택이 정해지면 안내하지 않는다 · 면적 없는 첫 자산 토지는 F13-5 «판정 불가» 안내(주택 먼저 순서와 같다)", async () => {
    const ok = await post(reverse({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] }));
    expect(ok.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
    const body = reverse({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] });
    const noArea = await post({ ...body, acquisitionArea: undefined, transferArea: undefined });
    expect(noArea.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
    expect((noArea.warnings ?? []).some((w) => w.includes("배율 이내인지 판정하지 못했습니다"))).toBe(true);
    const fwNoArea = await post({ ...forward({ house: 800_000_000, houseLand: 0, lands: [[300_000_000, 300]] }), companionAssets: [{ ...landCompanion("c1", [300_000_000, 300], { house: 0, houseLand: 0, lands: [] }), areaM2: undefined }] });
    expect(noArea.totalTax).toBe(fwNoArea.totalTax);
  });
});
