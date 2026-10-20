/**
 * 컴패니언(함께양도) 겸용주택 — 상속받은 겸용주택의 피상속인 취득일이 파트 카드 판정에 닿는다.
 *
 * 파트 카드 경로(`mixed-use-part-cards.ts`)는 겸용 서브엔진의 `total`을 버리고 안분·환산 값만 쓰며,
 * 세율·장기보유특별공제·감면은 카드(aggregate item)마다 단건 엔진이 다시 판정한다. 그래서 단건 겸용 경로의
 * 결함(#2130 — 피상속인 취득일이 겸용 엔진에 닿지 않음)이 이 경로에는 **없었다**. 그 사실을 잠근다.
 *  - 「소득세법」 §104②1호 — 상속받은 자산의 단기보유 세율 보유기간은 피상속인 취득일부터.
 *  - 「조세특례제한법」 §77⑨ — 상속받은 토지등의 「소급 2년 이전 취득」은 피상속인 취득일로.
 * primary = 일반 주택(2015 매매) · companion = 겸용주택(상속 2023-09-01) · 양도 2024-06-01. route 경유(⑧ → ④ → ⑫ → ⑭).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData, patch?: (b: unknown) => void) {
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
  patch?.(captured);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    body: captured as { companionAssets?: Array<{ assetKind?: string; mixedUse?: Record<string, unknown> }> },
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

type AggProp = { propertyId?: unknown; rateGroup?: unknown };
function aggregated(r: { json: Record<string, unknown> }) {
  return (r.json as { data?: { aggregated?: { properties?: AggProp[] } } }).data?.aggregated ?? {};
}

/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(배율초과 발생). */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  // 부수토지가 정착면적의 3배 초과 ⇒ 용도지역 필수 (2026-09-06 · UI 리뷰). 주제와 무관한 축이라 값만 채운다.
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

/** primary 주택 + companion 겸용주택. 기준시가를 같게 두어 안분이 50:50. */
function bundledForm(): TransferFormData {
  // S3-2 ④ — 나목은 폼 필드에서 실려 간다(body shim 아님).
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [
      asset(1),
      asset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" }),
    ],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData);
}

const INH = { acquisitionCause: "inheritance", acquisitionDate: "2023-09-01", mixedHousingInheritedValueOverride: "400000000", mixedCommercialInheritedValueOverride: "200000000" };
const PE = { type: "public_expropriation", cashCompensation: 600_000_000, bondCompensation: 0, businessApprovalDate: "2024-03-01" };

async function calc(over: Record<string, unknown>, withPE = false) {
  const base = bundledForm();
  const f = {
    ...base,
    assets: [base.assets[0], { ...base.assets[1], ...over }],
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  } as TransferFormData;
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f, withPE ? (b) => {
    const c = (b as { companionAssets: Array<Record<string, unknown>> }).companionAssets[0];
    c.reductions = [PE];
    c.transferCause = "public_expropriation";
  } : undefined);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const a = aggregated(r) as { totalTax: number; reductionAmount: number; properties: Array<{ propertyId: string; rateGroup: string; appliedRate: number }> };
  const card = (id: string) => a.properties.find((p) => String(p.propertyId).startsWith(id))!;
  return { a, card };
}

describe("컴패니언 겸용주택 — 상속 피상속인 취득일", () => {
  it("대조: 매매 2023-09-01 → 주택 카드 70% · 상가 카드 50%", async () => {
    const { a, card } = await calc({ acquisitionDate: "2023-09-01" });
    expect(card("mu-house-land").appliedRate).toBe(0.7);
    expect(card("mu-comm-bld").appliedRate).toBe(0.5);
    expect(a.totalTax).toBe(264_520_338);
  }, 60_000);

  it("§104②1호 — 피상속인 2000 취득 → 모든 카드 단기세율 아님", async () => {
    const { a, card } = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" });
    for (const id of ["mu-house-land", "mu-house-bld", "mu-comm-land", "mu-comm-bld"]) expect(card(id).rateGroup).toBe("progressive");
    expect(a.totalTax).toBe(79_849_000);
  }, 60_000);

  // 계획서 docs/00-pm/non-heir-bequest-followups.plan.md §1 B — 수유자는 통산하지 않는다(동반 자산 ④ → bundled → 파트 카드).
  it("수유자 — 피상속인 2000 취득이어도 통산하지 않는다 → 주택 카드 70% · 상가 카드 50%", async () => {
    const { a, card } = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01", nonHeirBequest: true });
    expect([card("mu-house-land").appliedRate, card("mu-comm-bld").appliedRate, a.totalTax]).toEqual([0.7, 0.5, 93_199_581]); // 상속인 79,849,000
  });

  it("긍정 짝 — 피상속인 2023-06-01 취득 → 주택 60% · 상가 40%", async () => {
    const { a, card } = await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" });
    expect(card("mu-house-bld").appliedRate).toBe(0.6);
    expect(card("mu-comm-land").appliedRate).toBe(0.4);
  // §102② 차손 안분 잔액 1원의 자리 — 입력상 마지막 카드가 아니라 소수부가 큰 카드로(최대잉여법, 계획서 `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §6). 종전 85,264,628.
    expect(a.totalTax).toBe(85_264_630);
  }, 60_000);

  it("§77⑨ — 사업인정고시 2024-03-01 · 피상속인 2000 → 감면 성립", async () => {
    const { a } = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" }, true);
    // 감면 카드(주택 건물·상가 토지·상가 건물)는 같은 겸용주택의 주택 토지·배율초과 토지 카드 차손을 통산받는다 —
    // B도 「소득세법 시행령」 §167의2②로 그만큼 줄어 통산 전 합 142,857,142가 아니라 통산 후 90,374,724다
    // (계획서 `transfer-90-1-reducible-income-after-loss-offset.plan.md`). 감면 = 72,590,000 × 90,374,724 / 243,500,000 × 10%.
    // 종전 감면 4,258,726 · 총세액 76,016,146.
    expect(a.reductionAmount).toBe(2_694_168);
    // 농특세는 과세 대상 감면세액 합계에 한 번 — floor(2,694,168 × 20%) = 538,833
    // (계획서 `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §5 · 별지 제84호서식 농특세 납부계산서 한 줄).
    expect(a.totalTax).toBe(77_424_248);
  }, 60_000);

  it("§77 긍정 짝 — 피상속인도 소급 2년 안(2023-06-01) · 매매 2023-09-01 → 불성립", async () => {
    expect((await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" }, true)).a.reductionAmount).toBe(0);
    expect((await calc({ acquisitionDate: "2023-09-01" }, true)).a.reductionAmount).toBe(0);
  }, 60_000);

  describe("토지를 상속개시일과 다른 날(2023-10-01) 취득 — 종전 ⑫ 400(「매매」로 지정하라는데 겸용엔 그 칸이 없음)", () => {
    const SEP = { landAcquisitionDate: "2023-10-01", hasSeperateLandAcquisitionDate: true, mixedAcqLandPricePerSqmAtBuildingAcq: "1000000" };

    it("계산된다 — 주택 카드는 주택분 늦은 날(토지 2023-10-01)로 둘 다 70%(§104①2호 괄호) · 상가 토지 50% · 상가 건물은 피상속인 취득일(누진)", async () => {
      const { a, card } = await calc({ ...INH, ...SEP, decedentAcquisitionDate: "2000-01-01" });
      expect(card("mu-house-land").appliedRate).toBe(0.7);
      expect(card("mu-house-bld").appliedRate).toBe(0.7);
      expect(card("mu-comm-land").appliedRate).toBe(0.5);
      expect(card("mu-comm-bld").rateGroup).toBe("progressive");
      expect(a.totalTax).toBe(88_756_549);
    }, 60_000);

    it("긍정 짝 — 피상속인 2023-06-01이면 상가 건물 카드도 단기(40%) · 주택 카드는 늦은 날 기준 70%", async () => {
      const { a, card } = await calc({ ...INH, ...SEP, decedentAcquisitionDate: "2023-06-01" });
      expect(card("mu-house-bld").appliedRate).toBe(0.7);
      expect(card("mu-comm-bld").appliedRate).toBe(0.4);
      // 주택 토지 카드 차손(-35,714,285)이 같은 70% 세율군의 주택 건물 카드 차익과 먼저 통산된다(「소득세법 시행령」 §167의2①).
      expect(a.totalTax).toBe(89_497_053);
    }, 60_000);

    it("§77 — 토지 카드는 자기 취득일(2023-10-01)로 불성립, 건물 카드만 감면", async () => {
      const { a } = await calc({ ...INH, ...SEP, decedentAcquisitionDate: "2000-01-01" }, true);
      // 감면 카드(주택 건물·상가 건물)의 B는 받은 차손을 뺀 53,562,250(위 §77⑨ 사례와 같은 사유 — 종전 112,605,041).
      // 종전 감면 5,866,193 · 총세액 84,026,974.
      expect(a.reductionAmount).toBe(2_344_896);
      // 농특세 floor(2,344,896 × 20%) = 468,979 — 과세 대상 감면세액 합계에 한 번(위 §77⑨ 사례와 같은 사유).
      expect(a.totalTax).toBe(87_196_142);
    }, 60_000);
  });
});

