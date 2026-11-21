/**
 * anchor(화면 경로 ④⑫⑭) — 겸용주택 주택분 부수토지 배율 초과분의 수용 의제·유예 (NBL2611-C5).
 *
 * 폼 → `callTransferTaxAPI`(④) → 실제 route(⑫ Zod · ⑭ 엔진 입력 조립)를 끝까지 태운다. ⑫가 `appurtenantExcessFacts`를 모르면 값이 조용히 떼어져
 * (200 + 의제 미적용) 엔진 anchor(`nbl2611-c5-mixed-use-deeming.anchor.test.ts`)가 못 본다 — 이 파일이 «보냈더니 세액이 움직인다»를 입구별로 고정한다.
 * 입구: 단건 겸용(route 5-a-2) · 함께 양도 주 자산 겸용 · 함께 양도 컴패니언 겸용(파트 카드 `mu-nbl`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Prop = { propertyId?: unknown; rateGroup?: unknown; surchargeRate?: number; appliedRate?: number };
interface NbPart { additionalRate: number; incomeAmount: number; deemedBusiness?: { reason: string } }
interface Json {
  data: {
    result: { nonBusinessLandPart: NbPart | null; total: { transferTax: number }; warnings: string[] };
    aggregated: { properties?: Prop[]; warnings: string[]; totalTax: number; clause8Tax: number };
  };
}

async function pipeline(form: TransferFormData) {
  let captured: unknown = null;
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
  return { body: captured as Record<string, unknown>, status: res.status, json: (await res.json()) as Json };
}

/** 겸용 — 주택 150㎡ > 상가 100㎡(OH-17) · 정착 100㎡ · 대지 400㎡ · 수도권 일반주거(3배) → 초과 100㎡. 1세대1주택 10억이면 주택·상가는 비과세, 초과분 파트만 과세. */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2015-06-01",
  // 겸용 취득 실거래가 + 공익수용 조합은 엔진이 지원하지 않는다(`calcHousingEstimatedAcq`) — 환산 모드로 둔다.
  useEstimatedAcquisition: true,
  residentialFloorArea: "150",
  nonResidentialFloorArea: "100",
  buildingFootprintArea: "100",
  mixedUseTotalLandArea: "400",
  mixedZoneType: "general_residential",
  mixedIsMetropolitanArea: true,
  mixedTransferHousingPrice: "500000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "350000000",
  mixedAcqCommercialBuildingPrice: "80000000",
  mixedAcqLandPricePerSqm: "1500000",
};
/** 겸용 수용은 §164⑨1호 보상액 4칸이 ⑫ 필수다(환산이 아니면 세액에는 닿지 않는다). */
const COMP = {
  housingCompensationTotal: "900000000",
  housingCompensationBasisTotal: "900000000",
  mixedCommercialLandCompensationTotal: "400000000",
  mixedCommercialLandCompensationBasisTotal: "400000000",
};
const EXPRO_NO_DATE = { transferCause: "public_expropriation", ...COMP };
const EXPRO = { ...EXPRO_NO_DATE, expropriationNoticeDate: "2019-01-01" };
const GRACE = [{ reasonCode: "other_justifiable", anchorDate: "2015-06-02", endDate: "2023-12-31", description: "" }];

function mixedAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울특별시 강남구 테스트동 1-1",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "1000000000",
    ...MIXED_FIELDS,
    ...over,
  } as unknown as AssetForm;
}
function singleForm(over: Record<string, unknown> = {}): TransferFormData {
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [mixedAsset(over)],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "120",
  } as unknown as TransferFormData);
}

describe("C5 route — 단건 겸용 (화면 경로 ④⑫⑭)", () => {
  it("수용 + 고시일: ⑫ 통과 · ⑭ Date 변환 → 의제 성립 (보내지 않으면 +10%p 유지)", async () => {
    const noFacts = await pipeline(singleForm(EXPRO_NO_DATE));
    expect(noFacts.status, JSON.stringify(noFacts.json).slice(0, 300)).toBe(200);
    const withFacts = await pipeline(singleForm(EXPRO));
    expect(withFacts.status, JSON.stringify(withFacts.json).slice(0, 300)).toBe(200);
    const nb0 = noFacts.json.data.result.nonBusinessLandPart!;
    const nb1 = withFacts.json.data.result.nonBusinessLandPart!;
    expect(nb0.additionalRate).toBe(0.1);
    expect(nb1.additionalRate).toBe(0);
    expect(nb1.deemedBusiness?.reason).toBe("public_expropriation");
    // 독립 검산 — 소득금액은 같고 세액 차 = 과세표준 × 10%p (주택·상가는 비과세라 이 파트만 과세)
    expect(nb1.incomeAmount).toBe(nb0.incomeAmount);
    const base = nb0.incomeAmount - 2_500_000;
    expect(noFacts.json.data.result.total.transferTax - withFacts.json.data.result.total.transferTax).toBe(Math.floor(base * 0.1));
  });

  it("수용인데 고시일 없음 → 200 + 확인 필요 고지(차단하지 않는다)", async () => {
    const r = await pipeline(singleForm(EXPRO_NO_DATE));
    expect(r.status).toBe(200);
    expect(r.json.data.result.warnings).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });

  it("유예 행(NBL 섹션 입력 재사용) → ④가 구간으로 풀어 보낸다 → 의제 성립", async () => {
    const r = await pipeline(singleForm({ nblGracePeriods: GRACE }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.data.result.nonBusinessLandPart?.deemedBusiness?.reason).toBe("grace_period");
    expect((r.body.appurtenantExcessFacts as { graceIntervals?: unknown[] }).graceIntervals).toHaveLength(1);
  });

  it("초과분이 없으면(대지 300㎡ = 한도) 칸이 안 보이므로 남은 유예 행은 전송하지 않는다 (stale 차단)", async () => {
    const r = await pipeline(singleForm({ nblGracePeriods: GRACE, mixedUseTotalLandArea: "300" }));
    expect(r.status).toBe(200);
    expect((r.body.appurtenantExcessFacts as { graceIntervals?: unknown[] } | undefined)?.graceIntervals).toBeUndefined();
    expect(r.json.data.result.nonBusinessLandPart).toBeNull();
  });

  it("⑧ — 보이는 유예 행의 필수 입력이 비면 막는다(NBL 섹션과 같은 helper)", () => {
    const bad = singleForm({ nblGracePeriods: [{ reasonCode: "other_justifiable", anchorDate: "", endDate: "", description: "" }] });
    const msgs = collectStepIssues(0, bad).map((i) => i.message);
    expect(msgs.some((m) => /유예|부득이|시작일|종료일/.test(m))).toBe(true);
  });
});

// ── 함께 양도(묶음) — 주 자산 겸용 · 컴패니언 겸용 ───────────────────────────────────
function plainHouse(i: number): AssetForm {
  return {
    ...makeDefaultAsset(i),
    addressJibun: "제주특별자치도 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "580000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
  } as unknown as AssetForm;
}
function bundledForm(mixedFirst: boolean, over: Record<string, unknown>): TransferFormData {
  const mixed = { ...mixedAsset(over), actualSalePrice: "600000000", standardPriceAtTransfer: "500000000" } as AssetForm;
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: mixedFirst ? [{ ...mixed, assetId: undefined }, plainHouse(2)] : [plainHouse(1), mixed],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as unknown as TransferFormData);
}
const props = (r: { json: Json }) => r.json.data?.aggregated?.properties ?? [];
const nblCard = (r: { json: Json }) => props(r).find((p) => String(p.propertyId).startsWith("mu-nbl"));

describe.each([
  ["함께 양도 컴패니언 겸용", false],
  ["함께 양도 주 자산 겸용", true],
] as const)("C5 route — %s (파트 카드 mu-nbl)", (_name, mixedFirst) => {
  it("수용 + 고시일 → 초과분 카드가 비사업용 세율군이 아니다 · 고시일이 없으면 비사업용 유지 + 확인 필요 고지", async () => {
    const without = await pipeline(bundledForm(mixedFirst, EXPRO_NO_DATE));
    expect(without.status, JSON.stringify(without.json).slice(0, 300)).toBe(200);
    expect(nblCard(without)?.rateGroup).toBe("non_business_land");
    expect(without.json.data.aggregated.warnings.some((w: string) => w.includes(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE))).toBe(true);

    const withFacts = await pipeline(bundledForm(mixedFirst, EXPRO));
    expect(withFacts.status, JSON.stringify(withFacts.json).slice(0, 300)).toBe(200);
    const card = nblCard(withFacts);
    expect(card).toBeDefined(); // 초과분은 비과세로 새지 않고 카드로 남는다
    expect(card?.rateGroup).not.toBe("non_business_land");
    // 카드 세율 — 비사업용(+10%p) 25% → 일반 토지 15%(가산 0). §104①8호 비교(`clause8Tax`)도 2,036,469 → 0이다.
    //   이 표본은 합산 누진(§104⑤ 1호)이 자산별 합계(2호 후보)를 이겨 총세액은 같다 — 일반 토지가 되면 누진 그룹에 합산돼 그룹 합계는 오히려 커진다(같은 세율 합산 규칙).
    expect(without.json.data.aggregated.clause8Tax).toBeGreaterThan(0);
    expect(withFacts.json.data.aggregated.clause8Tax).toBe(0);
    expect(card?.surchargeRate ?? 0).toBe(0);
    expect(nblCard(without)?.appliedRate).toBeCloseTo(0.25, 10);
    expect(card?.appliedRate).toBeCloseTo(0.15, 10);
    expect(withFacts.json.data.aggregated.totalTax).toBeLessThanOrEqual(without.json.data.aggregated.totalTax);
    expect(withFacts.json.data.aggregated.warnings.some((w: string) => /비사업용 토지로 보지 않아/.test(w))).toBe(true);
  });

  it("유예 구간 → 의제 성립(카드가 비사업용 세율군이 아니다)", async () => {
    const r = await pipeline(bundledForm(mixedFirst, { nblGracePeriods: GRACE }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(nblCard(r)?.rateGroup).not.toBe("non_business_land");
  });
});
