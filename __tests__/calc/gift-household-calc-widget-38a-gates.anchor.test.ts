/**
 * anchor(⑤⑧④ 게이트 · route) — 결정 #38-1 위젯의 겸용·다건 화면 (검토 지적 보정 · #38 후속)
 *
 * | # | 화면 | 동작 (실측) |
 * |---|---|---|
 * | GC-5 | 겸용주택을 증여받은 경우 | **묻는다**(#38 후속) — 겸용 엔진 §154① 판정이 단건과 같은 leaf로 `giftHouseholdBasis`를 읽는다. 종전에는 받지 않아 「예」·「아니오」 모두 305,678,570이었다 → 「예」 140,178,570 · 「아니오」 305,678,570 |
 * | GC-6 | 다건 편집 임베드 | **묻는다**(#38-3) — 다건 ④⑫⑭가 단건과 같은 빌더·함수로 건마다 주 자산의 사실을 싣는다. 종전에는 ④가 싣지 않아 단건 「예」 0 ↔ 다건 「예」 229,075,000 + 「입력되지 않아」 고지(묻고도 버렸다) → 지금은 단건·다건 모두 「예」 0 · 「아니오」 229,075,000 |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues, validateStep } from "@/lib/calc/transfer-tax-validate";
import { isPropertyReady } from "@/lib/calc/multi-transfer-tax-validate";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { calcGiftHouseholdFactAsked, calcGiftHouseholdFactVisible } from "@/lib/calc/gift-household-payload";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { handoff } from "./_one-house-pr6a-routes";
import { buildMultiBody, postMulti, runMulti, runSingle } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const issues = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
async function runSingleMixed(f: TransferFormData) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ data: {} }), { status: 200 }); }));
  try { await callTransferTaxAPI(f).catch(() => undefined); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json(), body: body as Record<string, unknown> };
}

// ── GC-5 겸용주택 — `transfer.route.mixed-use-inheritance-decedent-date` 픽스처를 1세대1주택 · 증여 취득으로 둔다 ──
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: true,
  addressRoad: "서울 강남구 테헤란로 1", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000", mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
};
/** 증여자 2000-01-01 취득 → 2023-09-01 증여 → 2024-06-01 양도 · 그 밖의 친족 */
const MIXED_GIFT = { acquisitionCause: "gift", acquisitionDate: "2023-09-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000",
  donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other" };
function mixedForm(over: Record<string, unknown> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], ...MIXED, ...over } as AssetForm;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1,200,000,000", householdHousingCount: "1",
    isOneHousehold: true, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0" });
  return withIdentityHousingBuildingStdOnForm(f, { acqN: 90_000_000 });
}

describe("GC-5 겸용주택 증여 — 묻는다(겸용 엔진이 세대 사실을 단건과 같은 leaf로 읽는다 · #38 후속)", () => {
  it("[GC-5a] 술어 — 겸용이어도 참 · 같은 자산이 겸용이 아니어도 참(짝)", () => {
    const a = mixedForm(MIXED_GIFT).assets[0];
    expect(calcGiftHouseholdFactVisible(a)).toBe(true);
    expect(calcGiftHouseholdFactVisible({ ...a, isMixedUseHouse: false })).toBe(true);
    expect(calcGiftHouseholdFactAsked(a, { isPrimary: true })).toBe(true);
  });

  it("[GC-5b] ⑧ — 세대 답이 비면 막는다 · 답하면 통과(짝 — 다른 칸은 다 채운 폼이라 「없음」이 공허하지 않다)", () => {
    const blank = issues(mixedForm({ ...MIXED_GIFT, giftSameHousehold: "" }));
    expect(blank).toHaveLength(1);
    expect(blank[0]).toMatch(/증여일부터 양도일까지 증여자와 계속 같은 세대였는지 선택하세요\.$/);
    expect(issues(mixedForm({ ...MIXED_GIFT, giftSameHousehold: "no" }))).toEqual([]);
  });

  it("[GC-5c] ④⑫⑭ — 「예」를 실어 겸용 엔진까지 닿는다: 「예」 140,178,570(§154③ 본문 전부 주택 비과세 · 배율 초과 토지만 과세) · 「아니오」 305,678,571(종전 305,678,570 — 상가 40% 합산 1회 절사 +1)", async () => {
    const yes = await runSingleMixed(mixedForm({ ...MIXED_GIFT, giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2000-01-01" }));
    expect(yes.status, JSON.stringify(yes.json).slice(0, 300)).toBe(200);
    expect(yes.body.giftSameHouseholdContinuous).toBe(true);
    expect(yes.body.giftHouseholdHoldingStartDate).toBe("2000-01-01");
    expect(yes.json.data.result.total.determinedTax).toBe(140_178_570);
    const yw = JSON.stringify(yes.json.data.result.warnings);
    expect(yw).toContain("증여자와 계속 같은 세대였다는 입력에 따라");
    expect(yw).toContain("건물 전부를 주택으로 봅니다(소득세법 시행령 §154③ 본문)");
    const no = await runSingleMixed(mixedForm({ ...MIXED_GIFT, giftSameHousehold: "no" }));
    expect(no.body.giftSameHouseholdContinuous).toBe(false);
    expect(no.json.data.result.total.determinedTax).toBe(305_678_571); // 계획서 p3 §9.1 — 같은 단기세율(40%) 상가 토지 · 건물을 합산해 1회 절사(일반 합산 엔진 호 버킷과 같은 단위, 종전 파트별 절사보다 +1)
    expect(JSON.stringify(no.json.data.result.warnings)).not.toContain("증여자와 계속 같은 세대였다는 입력에 따라");
  }, 60_000);
});

// ── GC-6 다건 편집 임베드 — 단건 anchor(GC-4)와 같은 사실 ──
const giftAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing",
    addressJibun: "서울특별시 종로구 청운동 1-1", acquisitionCause: "gift", acquisitionDate: "2025-06-01",
    fixedAcquisitionPrice: "600000000", donorAcquisitionDate: "2010-03-01", giftDonorRelation: "other",
    giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01", ...over }) as AssetForm;
function calcForm(assetOver: Partial<AssetForm> = {}): TransferFormData {
  const j = { ...createInitialOneHouseJudgmentForm(), assets: [giftAsset()], transferDate: "2026-02-16",
    contractTotalPrice: "900000000", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    houses: [], presaleRights: [] } as unknown as OneHouseJudgmentFormData;
  const f = handoff(j);
  return { ...f, assets: [{ ...f.assets[0], ...assetOver } as AssetForm, ...f.assets.slice(1)] } as TransferFormData;
}
const BLANK = { giftDonorRelation: "", giftSameHousehold: "", giftHouseholdHoldingStartDate: "" } as const;
const item = (form: TransferFormData) => ({ propertyId: "p1", propertyLabel: "p1", form, completionPercent: 100 }) as PropertyItem;

describe("GC-6 다건 편집 임베드 — 묻는다(다건 ④⑫⑭가 단건과 같은 빌더·함수로 싣는다 · #38-3)", () => {
  it("[GC-6a] 게이트 — 첫 자산이면 참 · 함께 양도하는 두 번째 이후 자산이면 거짓(짝)", () => {
    const a = calcForm(BLANK).assets[0];
    expect(calcGiftHouseholdFactAsked(a, { isPrimary: true })).toBe(true);
    expect(calcGiftHouseholdFactAsked(a, { isPrimary: false })).toBe(false);
  });

  it("[GC-6b] ⑧ — 다건 「다음」 게이트(isPropertyReady)도 답이 비면 막고 · 답하면 통과(짝)", () => {
    const blank = calcForm(BLANK);
    expect(isPropertyReady(item(blank))).toBe(false);
    expect(validateStep(0, blank)).toMatch(/증여자와의 관계를 선택하세요/);
    expect(isPropertyReady(item(calcForm()))).toBe(true);
    expect(isPropertyReady(item(calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" })))).toBe(true);
  });

  it("[GC-6c] ④⑫⑭ — 다건이 사실을 싣고 단건과 같은 세액: 「예」 0 · 「아니오」 229,075,000 · 「입력되지 않아」 고지 없음", async () => {
    const yes = calcForm();
    expect(buildPropertyPayload(yes)).toMatchObject({
      acquisitionCause: "gift", donorAcquisitionDate: "2010-03-01", giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2010-03-01",
    });
    const my = await runMulti([yes]);
    expect(my.status, JSON.stringify(my.json).slice(0, 300)).toBe(200);
    expect(my.totalTax).toBe(0);
    expect((await runSingle(yes)).totalTax).toBe(0);
    expect(JSON.stringify(my.json)).not.toContain("세대 관계가 입력되지 않아");

    const no = calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" });
    expect(buildPropertyPayload(no)).toMatchObject({ giftSameHouseholdContinuous: false });
    expect(buildPropertyPayload(no)).not.toHaveProperty("giftHouseholdHoldingStartDate");
    const mn = await runMulti([no]);
    expect(mn.totalTax).toBe(229_075_000);
    expect((await runSingle(no)).totalTax).toBe(229_075_000);
    expect(JSON.stringify(mn.json)).not.toContain("세대 관계가 입력되지 않아");
  }, 60_000);

  it("[GC-6d] 건마다 따로 — 한 건은 「예」(0) · 다른 건은 「아니오」(과세)면 두 건이 각자의 사실로 판정된다", async () => {
    const m = await runMulti([calcForm(), calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" })]);
    expect(m.status, JSON.stringify(m.json).slice(0, 300)).toBe(200);
    const [first, second] = m.props as { isExempt: boolean; determinedTax: number }[];
    expect(first).toMatchObject({ isExempt: true, determinedTax: 0 });
    expect(second.isExempt).toBe(false);
    expect(second.determinedTax).toBeGreaterThan(0);
  }, 60_000);

  it("[GC-6e] 사실 없이 다건 API를 직접 부르면 종전대로 증여일 기준 + 「입력되지 않아」 고지(짝 — ⑭는 답한 경우에만 사실을 만든다)", async () => {
    const body = await buildMultiBody([calcForm()]);
    const p0 = (body.properties as Record<string, unknown>[])[0];
    delete p0.giftSameHouseholdContinuous;
    delete p0.giftHouseholdHoldingStartDate;
    const m = await postMulti(body);
    expect(m.status).toBe(200);
    expect(m.totalTax).toBe(229_075_000);
    const text = JSON.stringify(m.json);
    expect(text).toContain("세대 관계가 입력되지 않아");
  }, 60_000);

  it("[GC-6g] ⑭ — 「아니오」(false)는 그대로 닿는다 — 시작일이 같이 와도 통산하지 않는다(⑭가 답을 「예」로 굳히지 않는다)", async () => {
    const body = await buildMultiBody([calcForm()]);
    (body.properties as Record<string, unknown>[])[0].giftSameHouseholdContinuous = false;
    const m = await postMulti(body);
    expect(m.status, JSON.stringify(m.json).slice(0, 300)).toBe(200);
    expect(m.totalTax).toBe(229_075_000);
  }, 60_000);

  it("[GC-6h] ⑭ — 증여자 취득일이 없으면 사실을 만들지 않는다(「아니오」만 온 직접 호출 — 500이 아니라 종전 계산) · 증여가 아닌 취득의 잔존 사실은 닿지 않는다(짝)", async () => {
    const noDonor = await buildMultiBody([calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" })]);
    delete (noDonor.properties as Record<string, unknown>[])[0].donorAcquisitionDate;
    const a = await postMulti(noDonor);
    expect(a.status, JSON.stringify(a.json).slice(0, 300)).toBe(200);
    expect(a.totalTax).toBe(229_075_000);

    const stray = await buildMultiBody([calcForm()]);
    const p0 = (stray.properties as Record<string, unknown>[])[0];
    p0.acquisitionCause = "purchase";
    const withFacts = await postMulti(stray);
    delete p0.giftSameHouseholdContinuous;
    delete p0.giftHouseholdHoldingStartDate;
    delete p0.donorAcquisitionDate;
    const without = await postMulti(stray);
    expect(withFacts.status, JSON.stringify(withFacts.json).slice(0, 300)).toBe(200);
    expect(withFacts.totalTax).toBe(without.totalTax);
  }, 60_000);

  it("[GC-6f] ⑫ — 다건도 같은 세대 「예」면 시작일을 필수로 받는다(단건과 같은 refine · 400)", async () => {
    const body = await buildMultiBody([calcForm()]);
    delete (body.properties as Record<string, unknown>[])[0].giftHouseholdHoldingStartDate;
    const m = await postMulti(body);
    expect(m.status).toBe(400);
    expect(JSON.stringify(m.json)).toContain("세대 보유 시작일이 필요합니다");
  }, 60_000);
});
