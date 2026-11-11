/**
 * anchor — 겸용주택에 남은 가업상속공제(§97의2④) 입력이 함께 양도 파트 카드 세액을 바꾸지 않는다(2026-11-11 · 사용자 결정 a 명시 해제 요구).
 *
 * 겸용주택은 가업상속공제 의제취득가액 미지원(범위 밖)이다. 일반 주택에서 켜 두고 겸용으로 바꾸면 ⑤ 토글이 비활성이라 값이 남았고,
 * ④ 게이트(`allowsFamilyBusinessInheritance`)가 겸용을 보지 않아 그대로 실었다 → 파트 카드 `neutralized`가 키를 비우지 않아
 * 카드마다 STEP 0.42가 자산 전체 의제취득가액(1억)으로 취득가액을 덮었다(mock 세율 실측):
 *   · 주 자산 겸용 + 토지 묶음 208,837,200 → 228,247,312 · 지분 60/40 173,866,000 → 118,787,138 · ⑧ 통과
 *   · 단건 겸용(엔진이 키를 안 읽음)·컴패니언(④가 안 실음)은 종전에도 세액 불변
 * 수정: ④ `sendsFamilyBusinessInheritance`(겸용 제외) · ⑧ 해제 요구 · ⑤ 겸용이어도 끄기 허용 · 파트 카드 중화(직접 API).
 * 공통 시료는 `transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts`와 같다.
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



const FB = { familyBusinessInheritance: { decedentAcquisitionPrice: 100_000_000, inheritanceMarketValue: 600_000_000, fbDeductionAppliedRate: 1, inheritanceDate: "2022-10-01" } };
const issuesOf = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
const totalOf = (j: { data?: { aggregated?: Agg; result?: { total?: { totalPayable: number } } } }) => j.data?.aggregated?.totalTax ?? j.data?.result?.total?.totalPayable;
const MSG = "겸용주택은 가업상속공제 의제취득가액(§97의2④)을 지원하지 않습니다. 가업상속공제 입력을 해제하세요.";
const fractional = (cause: Record<string, unknown>) => {
  const share = (i: number, num: string) => ({ ...makeDefaultAsset(i), ...MIXED, ...cause, ownershipNumerator: num, ownershipDenominator: "100" });
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional", bundledSaleMode: "apportioned",
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1000000000", householdHousingCount: "1", isOneHousehold: false,
    residencePeriodMonths: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};

describe("겸용주택 가업상속공제 잔재", () => {
  it.each([
    ["단건", () => form({ ...INHERIT("600000000"), ...FB }, "single"), ["자산: " + MSG], 173_866_000],
    ["주 자산 묶음", () => form({ ...INHERIT("600000000"), ...FB }, "primary"), ["자산 1: " + MSG], 208_837_200],
    ["컴패니언", () => form({ ...INHERIT("600000000"), ...FB }, "companion"), ["자산 2: " + MSG], 208_837_200],
    ["지분 60/40", () => fractional({ ...INHERIT("600000000"), ...FB }), ["자산 1: " + MSG, "자산 2: " + MSG], 173_866_000],
  ] as const)("%s — ⑧ 해제 요구 · ④ 미탑재 · 세액 = 잔재 없음", async (_n, mk, issues, total) => {
    const f = mk();
    expect(issuesOf(f)).toEqual(issues);
    const r = await pipeline(f);
    expect(r.body.familyBusinessInheritance).toBeUndefined();
    expect(r.status).toBe(200);
    expect(totalOf(r.json)).toBe(total);
  });

  it("직접 API — 주 자산 겸용 묶음 요청에 키를 넣어도 파트 카드가 중화한다(208,837,200 · 종전 228,247,312)", async () => {
    for (const [arr, total] of [["primary", 208_837_200], ["single", 173_866_000]] as const) {
      const { body } = await pipeline(form(INHERIT("600000000"), arr));
      const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify({ ...body, ...FB }), headers: { "content-type": "application/json" } }));
      expect(res.status).toBe(200);
      expect(totalOf(await res.json())).toBe(total);
    }
  });

  it("🔴 짝: 겸용이 아닌 상속 주택은 종전대로 ④가 싣고 ⑧이 막지 않는다", async () => {
    const f = form({ ...INHERIT("600000000"), ...FB, isMixedUseHouse: false }, "single");
    expect(issuesOf(f).filter((m) => m.includes("가업상속"))).toEqual([]);
    const { body } = await pipeline(f);
    expect(body.familyBusinessInheritance).toEqual(FB.familyBusinessInheritance);
  });
});
