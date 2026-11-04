/**
 * anchor — 주 자산 겸용주택 묶음 · 상속·증여 평가액(§163⑨)이 파트 카드마다 전액 취득가액으로 중복되지 않는다.
 * 계획서 `docs/00-pm/mixed-primary-inherited-acquisition-dup.plan.md` · Q 전부 권장안(Q-1 a 파트 카드 중화).
 *
 * 종전(2026-11-04 실측 · mock 세율): 주 자산 ④는 겸용이어도 `inheritedAcquisition`을 실었고 파트 카드 `neutralized`가 그 키를
 * 비우지 않아, 카드마다 STEP 0.45가 자산 전체 평가액으로 취득가액을 덮었다 — 상속 6억 · 증여 6억 모두 전 카드 차손 · 세액 0.
 * 같은 물건을 컴패니언으로 두면 정상(컴패니언 ④는 `ownsAcquisitionSubobject`로 이 키를 싣지 않는다).
 *
 * 공통: 겸용(주택 100㎡ · 상가 60㎡ · 대지 200㎡ · 비조정) + 토지(매매 2015-03-01) 함께 양도 · 계약 총액 12억 · 양도 2023-09-18.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }),
  );
  return { body: captured, status: res.status, json: (await res.json()) as { data?: { aggregated?: Agg; result?: { total?: { totalPayable: number } } } } };
}
type Agg = { totalTax: number; properties: { propertyId: string; transferGain: number }[] };

const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
const INHERIT = (pub: string) => ({
  acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
  decedentAcquisitionDate: "2015-01-01", publishedValueAtInheritance: pub,
});
const GIFT = (reported: string) => ({
  acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no",
  fixedAcquisitionPrice: reported,
});
const PURCHASE = { acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "600000000" };
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
type Arrangement = "primary" | "companion" | "single";
const form = (cause: Record<string, unknown>, arr: Arrangement): TransferFormData => {
  const m = { ...makeDefaultAsset(arr === "companion" ? 2 : 1), ...MIXED, ...cause };
  const l = { ...makeDefaultAsset(arr === "companion" ? 1 : 2), ...LAND };
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: arr === "single" ? [m] : arr === "primary" ? [m, l] : [l, m],
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: arr === "single" ? "1000000000" : "1200000000",
    householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};
const run = async (cause: Record<string, unknown>, arr: Arrangement) => {
  const f = form(cause, arr);
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f);
  expect(r.status).toBe(200);
  return r;
};
const bundled = async (cause: Record<string, unknown>, arr: "primary" | "companion") => {
  const agg = (await run(cause, arr)).json.data!.aggregated!;
  return {
    total: agg.totalTax,
    gains: agg.properties.filter((p) => p.propertyId.startsWith("mu-")).map((p) => `${p.propertyId.split("#")[0]}:${p.transferGain}`),
  };
};
const MU_GAINS = ["mu-house-land:203287890", "mu-house-bld:32526063", "mu-comm-land:147383721", "mu-comm-bld:39302326"];

describe("주 자산 겸용 묶음 — 상속·증여 평가액이 카드마다 중복되지 않는다(위치 불변)", () => {
  it.each([
    ["상속 평가액 600,000,000", INHERIT("600000000"), 208_837_200],
    ["상속 평가액 900,000,000(평가액이 카드 차익을 바꾸지 않는다)", INHERIT("900000000"), 208_837_200],
    ["증여 신고가액 600,000,000", GIFT("600000000"), 310_621_069],
    ["증여 신고가액 900,000,000", GIFT("900000000"), 310_621_069],
  ] as const)("%s — 주 자산 배치 = 컴패니언 배치", async (_n, cause, total) => {
    const primary = await bundled(cause, "primary");
    const companion = await bundled(cause, "companion");
    expect(primary).toEqual({ total, gains: MU_GAINS });
    expect(companion).toEqual(primary);
  });

  it("④ 주 자산 겸용 요청에는 여전히 `inheritedAcquisition`이 실린다 — 막는 곳은 파트 카드(Q-1 a)", async () => {
    const r = await run(INHERIT("600000000"), "primary");
    expect((r.body.inheritedAcquisition as { reportedValue?: number } | undefined)?.reportedValue).toBe(600_000_000);
  });

  it("🔴 짝: 매매 겸용은 종전과 같다(155,166,000 · 위치 불변 — PM-3과 같은 축)", async () => {
    const primary = await bundled(PURCHASE, "primary");
    expect(primary.total).toBe(155_166_000);
    expect(await bundled(PURCHASE, "companion")).toEqual(primary);
  });

  it.each([
    ["상속 600,000,000", INHERIT("600000000"), 173_866_000],
    ["상속 평가액 빈칸", INHERIT(""), 173_866_000],
  ] as const)("🔴 짝: 단건 겸용은 이 키를 쓰지 않는다 — %s", async (_n, cause, total) => {
    const r = await run(cause, "single");
    expect(r.json.data!.result!.total!.totalPayable).toBe(total);
  });

  /** 지분 분할(축 B) — 같은 겸용주택 60/40 두 카드. 종전 상속·증여 모두 0(계획서 V-2). 합계가 단건 100%와 같다. */
  it.each([
    ["상속 600,000,000", INHERIT("600000000"), 173_866_000],
    ["증여 600,000,000", GIFT("600000000"), 309_240_696],
    ["🔴 짝: 매매(종전과 같다)", PURCHASE, 118_206_002],
  ] as const)("지분 60/40 겸용 · %s", async (_n, cause, total) => {
    const share = (i: number, num: string) => ({ ...makeDefaultAsset(i), ...MIXED, ...cause, ownershipNumerator: num, ownershipDenominator: "100" });
    const f = withIdentityHousingBuildingStdOnForm({
      ...createDefaultTransferFormData(), assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional", bundledSaleMode: "apportioned",
      transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1000000000", householdHousingCount: "1", isOneHousehold: false,
      residencePeriodMonths: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    } as unknown as TransferFormData);
    expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
    const r = await pipeline(f);
    expect(r.status).toBe(200);
    const agg = r.json.data!.aggregated!;
    expect(agg.totalTax).toBe(total);
    expect(agg.properties.every((p) => p.transferGain >= 0)).toBe(true);
  });
});
