/**
 * anchor (NBL2611-V4-HS06 · R17) — 겸용 「수도권 지역」 3-state(미선택 / 수도권 / 수도권 밖).
 *
 * 🔴 종전: store 기본값 `mixedIsMetropolitanArea: true`(주·상·공 3배) + ⑧이 묻지 않음 + 엔진 `?? true`.
 *    수도권 밖(5배) 부동산을 입력하는 사람이 토글을 건드리지 않으면 3배로 계산돼 인정 면적이 줄고 초과분이 비사업용 토지(+10%p·장특 배제)로 넘어갔다.
 *
 * 체인(화면 경로): store 기본값 → ⑧ `collectStepIssues` → ④ `callTransferTaxAPI` 본문 → ⑫ Zod → ⑭ mapper → 엔진.
 * 시료: 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 토지 600㎡ — 주택 부수토지 360㎡ · 주택 정착 30㎡ → 3배면 초과 270㎡, 5배면 초과 210㎡(배율이 갈린다).
 * 배율이 갈리지 않으면(부수토지 ≤ 정착 × 3) 묻지 않는다 — 필요 없는 입력 강제 금지(`mixed-use-zone-type-multiplier` 선례).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { migrateMixedUseFields } from "@/lib/stores/calc-wizard-asset-mixed-use";
import { MIXED_METRO_REQUIRED_MESSAGE } from "@/lib/tax-engine/mixed-use-metro-required";

type Form = ReturnType<typeof createDefaultTransferFormData>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const issues = (f: Form): string[] => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));

async function run(f: Form) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callTransferTaxAPI(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return post(body);
}

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json(), body: body as Record<string, unknown> };
}

const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  addressRoad: "전북 전주시 완산구 1",
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "150000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqLandPricePerSqm: "300000",
};
function mixedForm(over: Record<string, unknown> = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], ...MIXED, ...over } as Form["assets"][number];
  Object.assign(f, {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1,000,000,000",
    // 1세대1주택 + 전체 12억 이하 + 주택 연면적 > 상가(§154③ 본문 — OH-17): 주택·상가 비과세, 배율 초과 토지분만 비사업용 토지로 과세 → 세율 가산이 세액에 그대로 드러난다.
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "0",
  });
  return rosterForDeclaredCount(withIdentityHousingBuildingStdOnForm(f));
}
const tax = (json: { data: { result: { total: { transferTax: number } } } }) => json.data.result.total.transferTax;
const nbExcess = (json: { data: { result: { nonBusinessLandPart?: { excessArea: number; appliedMultiplier: number } } } }) =>
  json.data.result.nonBusinessLandPart;

describe("NBL2611-V4-HS06 — store 기본값 · ⑧", () => {
  it("🔴 store 기본값은 «미선택»(undefined)이다 — 종전 true(수도권 3배)가 조용히 계산에 들어갔다", () => {
    expect(makeDefaultAsset(1).mixedIsMetropolitanArea).toBeUndefined();
  });

  it("🔴 ⑧: 배율이 갈리는데 미선택이면 차단한다 (종전 ⑧ 통과)", () => {
    const f = mixedForm(); // mixedIsMetropolitanArea 미지정 = 기본값
    expect(issues(f).join("|")).toMatch(/수도권 여부를 선택하세요/);
  });

  it("⑧: 수도권/수도권 밖을 고르면 통과한다", () => {
    expect(issues(mixedForm({ mixedIsMetropolitanArea: true }))).toEqual([]);
    expect(issues(mixedForm({ mixedIsMetropolitanArea: false }))).toEqual([]);
  });

  it("🔑 ⑧: 배율이 갈리지 않으면(부수토지 ≤ 정착 × 3) 묻지 않는다 — 필요 없는 입력 강제 금지", () => {
    // 부수토지 90㎡ ≤ 정착 30㎡ × 3 → 수도권이어도 아니어도 초과 0
    const small = mixedForm({ mixedUseTotalLandArea: "150" });
    expect(issues(small)).toEqual([]);
  });

  it("🔑 ⑧: 도시지역 밖(10배) 용도지역은 수도권 축이 없으므로 묻지 않는다", () => {
    expect(issues(mixedForm({ mixedZoneType: "agriculture_forest" }))).toEqual([]);
  });
});

describe("NBL2611-V4-HS06 — ④ · ⑫ · 엔진", () => {
  it("🔴 ④·⑫: 미선택 본문은 400 — 기본값으로 계산하지 않는다 (종전 200 · 수도권 3배)", async () => {
    // ⑧을 우회한 직접 호출 모사 — 미선택 그대로 전송
    const r = await run(mixedForm());
    expect(r.body.mixedUse && (r.body.mixedUse as Record<string, unknown>).isMetropolitanArea).toBeUndefined();
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("수도권 여부");
  });

  it("🔑 선택값은 끝까지 도달하고 세액이 갈린다 — 수도권 밖(5배)이 수도권(3배)보다 초과분·세액이 작다", async () => {
    const metro = await run(mixedForm({ mixedIsMetropolitanArea: true }));
    const outside = await run(mixedForm({ mixedIsMetropolitanArea: false }));
    expect(metro.status).toBe(200);
    expect(outside.status).toBe(200);
    expect(nbExcess(metro.json)?.appliedMultiplier).toBe(3);
    expect(nbExcess(outside.json)?.appliedMultiplier).toBe(5);
    expect(nbExcess(metro.json)!.excessArea).toBeGreaterThan(nbExcess(outside.json)!.excessArea);
    // 실측(2026-11-19 · 가상 시료 · mock 세율표): 수도권(3배) 157,845,928 vs 수도권 밖(5배) 117,020,159 → 토글을 건드리지 않은 수도권 밖 입력자가 +40,825,769(국세)를 과대 부담했다.
    expect([tax(metro.json), tax(outside.json), nbExcess(metro.json)!.excessArea, nbExcess(outside.json)!.excessArea]).toEqual([157_845_928, 117_020_159, 450, 350]);
    expect(tax(metro.json)).toBeGreaterThan(tax(outside.json));
  });

  it("🔑 배율이 갈리지 않는 시료는 미선택으로도 200 — 이 경우 값은 선택과 무관하다", async () => {
    const r = await run(mixedForm({ mixedUseTotalLandArea: "150" }));
    expect(r.status).toBe(200);
    const sel = await run(mixedForm({ mixedUseTotalLandArea: "150", mixedIsMetropolitanArea: false }));
    expect(tax(r.json)).toBe(tax(sel.json));
  });

  it("엔진 가드 — 직접 호출도 미선택 + 배율이 갈리면 던진다 (기본값으로 계산하지 않는다)", () => {
    const asset = {
      isMixedUseHouse: true, residentialFloorArea: 60, nonResidentialFloorArea: 40, buildingFootprintArea: 50, totalLandArea: 600,
      landAcquisitionDate: new Date("2015-03-01"), buildingAcquisitionDate: new Date("2015-03-01"),
      transferStandardPrice: { housingPrice: 900_000_000, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000, housingBuildingPrice: 400_000_000 },
      acquisitionStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 1_000_000, housingBuildingPrice: 120_000_000 },
      residencePeriodYears: 0, zoneType: "general_residential", isOneHouseExempt: false,
    } as never;
    expect(() => calcMixedUseTransferTax(1_200_000_000, new Date("2024-06-01"), asset, makeMockRates())).toThrow(MIXED_METRO_REQUIRED_MESSAGE);
  });
});

describe("NBL2611-V4-HS06 — 기존 저장 이력(migration)", () => {
  it("저장된 선택값(true/false)은 그대로 복원한다 — 이력은 그 값으로 계산됐다", () => {
    for (const v of [true, false]) {
      const a: Record<string, unknown> = { mixedIsMetropolitanArea: v };
      migrateMixedUseFields(a);
      expect(a.mixedIsMetropolitanArea).toBe(v);
    }
  });

  it("🔴 키가 없는 이력은 true를 지어내지 않는다 — «미선택»으로 둔다 (종전 true 주입)", () => {
    const a: Record<string, unknown> = {};
    migrateMixedUseFields(a);
    expect(a.mixedIsMetropolitanArea).toBeUndefined();
  });
});
