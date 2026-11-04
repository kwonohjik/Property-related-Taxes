/**
 * anchor — 증여 겸용주택 「증여 신고가액」(`fixedAcquisitionPrice`)은 세액에 쓰이지 않으므로 ⑫가 컴패니언 겸용에 요구하지 않는다.
 * 계획서 `docs/00-pm/mixed-gift-fixed-acq-price.plan.md` · Q 전부 권장안(Q-2 a ⑫ 면제).
 *
 * 종전(2026-11-04 실측 · mock 세율): ⑧은 겸용이면 `validateMixedUseAsset`로 분기해 이 칸을 묻지 않는데, ⑫ 컴패니언 증여 규칙
 * (`transfer-tax-schema-companion-refines.ts` `giftPriceFromOtherSource`)은 겸용을 면제하지 않아 둘째 자산·둘째 지분 빈칸 = 400.
 * 겸용이 쓰는 평가액은 주택분·상가분 칸(`mixed*GiftValueOverride`)이다.
 *
 * 공통: 겸용(주택 100㎡ · 상가 60㎡ · 대지 200㎡ · 비조정) · 증여 2022-10-01 · 양도 2023-09-18 · 묶음은 토지(매매) 함께 양도.
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
  return { status: res.status, json: (await res.json()) as Res, body: captured };
}
async function postBody(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  );
  return { status: res.status, json: (await res.json()) as Res };
}
type Res = {
  error?: { fieldErrors?: Record<string, string[]> };
  data?: { aggregated?: { totalTax: number }; result?: { total?: { totalPayable: number } } };
};

const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
/** 증여 · `reported` = 취득정보 섹션 「증여 신고가액」 · `parts` = 주택분·상가분 증여일 신고가액(겸용이 쓰는 칸) */
const GIFT = (reported: string, parts: boolean) => ({
  acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no",
  fixedAcquisitionPrice: reported,
  ...(parts ? { mixedHousingGiftValueOverride: "400000000", mixedCommercialGiftValueOverride: "200000000" } : {}),
});
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
const BASE = {
  transferDate: "2023-09-18", filingDate: "2023-12-31", householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
type Arrangement = "single" | "primary" | "companion" | "fractional";
const form = (cause: Record<string, unknown>, arr: Arrangement, mixed = true): TransferFormData => {
  const body = mixed ? MIXED : { ...MIXED, isMixedUseHouse: false };
  if (arr === "fractional") {
    const share = (i: number, num: string) => ({ ...makeDefaultAsset(i), ...body, ...cause, ownershipNumerator: num, ownershipDenominator: "100" });
    return withIdentityHousingBuildingStdOnForm({
      ...createDefaultTransferFormData(), ...BASE, assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional", bundledSaleMode: "apportioned",
      contractTotalPrice: "1000000000",
    } as unknown as TransferFormData);
  }
  const m = { ...makeDefaultAsset(arr === "companion" ? 2 : 1), ...body, ...cause };
  const l = { ...makeDefaultAsset(arr === "companion" ? 1 : 2), ...LAND };
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), ...BASE,
    assets: arr === "single" ? [m] : arr === "primary" ? [m, l] : [l, m], contractTotalPrice: arr === "single" ? "1000000000" : "1200000000",
  } as unknown as TransferFormData);
};
const issuesOf = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
const taxOf = (j: Res) => j.data?.aggregated?.totalTax ?? j.data?.result?.total?.totalPayable;

describe("증여 겸용 — 「증여 신고가액」 빈칸이 둘째 자산·둘째 지분에서도 계산된다(⑧ 통과 = ⑫ 통과)", () => {
  it.each([
    ["둘째 자산 · 평가액 칸 비움", "companion", false, 310_621_069],
    ["지분 60/40 · 평가액 칸 비움", "fractional", false, 309_240_696],
    ["둘째 자산 · 주택분 4억 · 상가분 2억", "companion", true, 254_246_069],
    ["지분 60/40 · 주택분 4억 · 상가분 2억", "fractional", true, 252_865_696],
  ] as const)("%s → 200 · 신고가액을 넣은 결과와 같다", async (_n, arr, parts, tax) => {
    const f = form(GIFT("", parts), arr);
    expect(issuesOf(f)).toEqual([]);
    const r = await pipeline(f);
    expect(r.status).toBe(200);
    expect(taxOf(r.json)).toBe(tax);
  });

  /** 짝 — 신고가액 칸 값은 어느 배치에서도 세액을 바꾸지 않는다(종전과 같다 · 계획서 1.1). */
  it.each([
    ["단건", "single", 309_240_696, 252_865_696],
    ["주 자산 묶음", "primary", 310_621_069, 254_246_069],
    ["둘째 자산", "companion", 310_621_069, 254_246_069],
    ["지분 60/40", "fractional", 309_240_696, 252_865_696],
  ] as const)("🔴 짝: %s · 신고가액 6억 = 9억 = 빈칸", async (_n, arr, noParts, withParts) => {
    for (const [parts, tax] of [[false, noParts], [true, withParts]] as const) {
      for (const v of ["", "600000000", "900000000"]) {
        const r = await pipeline(form(GIFT(v, parts), arr));
        expect(r.status, `${arr} ${parts} ${v}`).toBe(200);
        expect(taxOf(r.json), `${arr} ${parts} ${v}`).toBe(tax);
      }
    }
  });

  /**
   * 리뷰 게이트 W-1 — 면제 술어는 ⑭ 겸용 분기(`assetKind === "mixed_use_house" && mixedUse`)와 같다. `mixedUse`만 실리고 종류가 일반 주택이면
   * ⑭가 일반 주택으로 계산하므로(신고가액 없음 → 취득가액 0) ⑫가 막아야 한다. 화면은 이 조합을 만들지 않는다(API 직접 호출).
   */
  it("🔴 짝: `mixedUse`만 있고 종류가 일반 주택인 증여 컴패니언(API 직접) · 신고가액 없음 → ⑫ 400", async () => {
    const { body } = await pipeline(form(GIFT("", false), "companion"));
    const companions = body.companionAssets as Record<string, unknown>[];
    expect(companions[0].assetKind).toBe("mixed_use_house");
    expect(companions[0].mixedUse).toBeDefined();
    const r = await postBody({ ...body, companionAssets: [{ ...companions[0], assetKind: "housing" }] });
    expect(r.status).toBe(400);
    expect(r.json.error?.fieldErrors?.["companionAssets.0.fixedAcquisitionPrice"]).toEqual(["증여 자산은 신고가액(취득가액) 필수"]);
  });

  it("🔴 짝: 겸용이 아닌 증여 주택 둘째 자산은 신고가액이 여전히 필수다(⑧·⑫ 모두)", async () => {
    const f = form(GIFT("", false), "companion", false);
    expect(issuesOf(f).join()).toMatch(/증여 신고가액을 입력하세요/);
    const r = await pipeline(f);
    expect(r.status).toBe(400);
    expect(r.json.error?.fieldErrors?.["companionAssets.0.fixedAcquisitionPrice"]).toEqual(["증여 자산은 신고가액(취득가액) 필수"]);
  });
});
