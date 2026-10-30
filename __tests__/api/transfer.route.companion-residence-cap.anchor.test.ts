/**
 * ⑫ 거주 상한 — 함께 양도 **컴패니언**(주택 `residencePeriodMonths` · 겸용 `mixedUse.residencePeriodYears`)도 단건과 같은 규칙으로 막는다
 * (계획서 `docs/02-design/features/companion-residence-cap-api.plan.md` O-24 · Q-1 a — #2751(O-14)·#2768의 후속).
 *
 * 종전: 컴패니언 refine이 거주를 보지 않아 API 직접 호출에서 보유 5년 · 거주 240개월이 400 없이 장특 144,000,000 → 216,000,000으로 계산됐다
 * (실측: 총세액 87,373,000 → 50,589,000). 화면은 닿지 않는다 — 거주 위젯은 주 자산만이고 컴패니언 주택의 `residencePeriodMonths`는 변환이 싣지 않는다.
 * 같은 규칙(`residenceMonthsOverflowIssue`) — 거주 개월(겸용은 연수 × 12)이 «가능한 가장 이른 보유 기산일»~양도일을 넘을 때만 막는다.
 *
 * 기준(폼 시료): 컴패니언 취득 2021-06-01 · 양도 2024-06-01 = 보유 36개월.
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
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

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

/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(배율초과 발생). */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2021-06-01",
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

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function postBody(b: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } }));
  return { status: res.status, json: (await res.json()) as Loose };
}

/** 폼 → ④ 본문(컴패니언은 거주를 싣지 않는다) — 거주 값은 본문에서 직접 얹는다(API 직접 호출). */
async function capture(kind: "mixed" | "housing"): Promise<Loose> {
  const second = kind === "mixed"
    ? asset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000", acquisitionDate: "2021-06-01" })
    : asset(2, { acquisitionDate: "2021-06-01" });
  const f = withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [asset(1, { acquisitionDate: "2021-06-01" }), second],
    transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1200000000", householdHousingCount: "2",
  } as unknown as TransferFormData);
  return (await pipeline(f)).body as Loose;
}
const withCompanion = (cap: Loose, patch: (c: Loose) => void) => {
  const b = JSON.parse(JSON.stringify(cap));
  patch(b.companionAssets[0]);
  return b;
};

describe("⑫ 컴패니언 주택 거주 상한", () => {
  it("🔑 C1 거주 36개월(= 보유 36개월, 경계 포함): 통과", async () => {
    const cap = await capture("housing");
    const r = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.residencePeriodMonths = 36; }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("🔑 C2 거주 37개월(상한 +1): 400 — 필드 `companionAssets.0.residencePeriodMonths` · 취득일 · 상한 36개월", async () => {
    const cap = await capture("housing");
    const r = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.residencePeriodMonths = 37; }));
    expect(r.status).toBe(400);
    const msg = JSON.stringify(r.json.error);
    expect(msg).toContain("companionAssets.0.residencePeriodMonths");
    expect(msg).toContain("37개월");
    expect(msg).toContain("36개월");
    expect(msg).toContain("2021-06-01");
  });

  it("🔑 C3 거주 240개월: 400 (종전 200 · 장특 거주분 증가)", async () => {
    const cap = await capture("housing");
    expect((await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.residencePeriodMonths = 240; }))).status).toBe(400);
  });

  it("C4 1세대1주택이 아닌 컴패니언(isOneHousehold false)은 거주가 쓰이지 않으므로 상한도 걸지 않는다 — 주 자산·단건과 같은 조건", async () => {
    const cap = await capture("housing");
    const r = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = false; c.residencePeriodMonths = 240; }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("C5 거주 미전송(UI 경로 — 변환이 컴패니언 주택 거주를 싣지 않는다)은 판정하지 않는다", async () => {
    const cap = await capture("housing");
    expect(cap.companionAssets[0].residencePeriodMonths).toBeUndefined();
    expect((await postBody(cap)).status).toBe(200);
  });
});

describe("⑫ 컴패니언 겸용주택 거주 상한 (연수 × 12)", () => {
  it("🔑 M1 거주 3년(= 보유 36개월): 통과 · 4년(48개월 > 36): 400 — 필드 `companionAssets.0.mixedUse.residencePeriodYears`", async () => {
    const cap = await capture("mixed");
    const ok = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.mixedUse.residencePeriodYears = 3; }));
    expect(ok.status, JSON.stringify(ok.json.error)).toBe(200);
    const bad = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.mixedUse.residencePeriodYears = 4; }));
    expect(bad.status).toBe(400);
    const msg = JSON.stringify(bad.json.error);
    expect(msg).toContain("companionAssets.0.mixedUse.residencePeriodYears");
    expect(msg).toContain("48개월");
    expect(msg).toContain("36개월");
  });

  it("M2 거주 10 · 20년: 400", async () => {
    const cap = await capture("mixed");
    for (const y of [10, 20]) {
      const r = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = true; c.mixedUse.residencePeriodYears = y; }));
      expect(r.status, `${y}년`).toBe(400);
    }
  });

  it("M3 1세대1주택이 아닌 컴패니언 겸용은 판정하지 않는다", async () => {
    const cap = await capture("mixed");
    const r = await postBody(withCompanion(cap, (c) => { c.isOneHousehold = false; c.mixedUse.residencePeriodYears = 20; }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});
