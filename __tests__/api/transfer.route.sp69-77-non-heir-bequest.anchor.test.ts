/**
 * 「조세특례제한법」 §77⑨ × 상속인이 아닌 수유자 — route 경유(④ → ⑫ → ⑭ → 엔진) (계획서 `docs/00-pm/sp69-77-non-heir-bequest.plan.md` Q-1 (b))
 *
 * 수유자 토글(`nonHeirBequest`)이 켜지면 피상속인 취득일로 소급하지 않고 상속개시일로 판정한다. 5B 파트별 판정
 * (`buildPublicExpropriationParts`)도 같은 함수를 쓴다. 시료는 `transfer.route.expropriation-77-9-inheritance.anchor.test.ts`와 같다.
 * 겸용 경로는 엔진이 취득일을 따로 만든다(`transfer-tax-mixed-use.ts`) — `transfer.route.mixed-use-inheritance-decedent-date.anchor.test.ts` 시료로 고정.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 2주택(비과세 없음) · 토지 300→500 · 건물 150→300 · 양도 2026-06-30 · 사업인정고시 2025-06-01(소급 2년 = 2023-06-01) */
const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2024-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "150,000,000",
    actualSalePrice: "800,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "500,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "500,000,000",
    buildingStandardPriceAtTransfer: "300,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100000",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm, over: Partial<TransferFormData> = {}): TransferFormData =>
  ({
    transferDate: "2026-06-30", filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

const PE = {
  reductions: [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2025-06-01" }],
  isOneHousehold: false, householdHousingCount: 2, transferCause: "public_expropriation",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData, extra: Record<string, unknown> = PE): Promise<any> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const body = {
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0, ...extra,
  };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const j = await res.json();
  expect(res.status, JSON.stringify(j).slice(0, 600)).toBe(200);
  return j.data.result;
}

import { NON_HEIR_BEQUEST_77_NOTE } from "@/lib/tax-engine/public-expropriation-reduction";

describe("§77⑨ × 수유자 — 단건 · 5B 파트별 (route)", () => {
  const whole = (nonHeir: boolean) => house({
    hasSeperateLandAcquisitionDate: false, acquisitionCause: "inheritance", acquisitionDate: "2024-01-10",
    decedentAcquisitionDate: "2000-01-01", landAcquisitionCause: "", landCauseHost: "",
    ...(nonHeir ? { nonHeirBequest: true } : {}),
  } as never);

  it("한 번에 상속 — 상속인 44,851,500(불변) · 수유자 0 + 확인 필요 고지", async () => {
    expect((await run(form(whole(false)))).reductionAmount).toBe(44_851_500);
    const r = await run(form(whole(true)));
    expect(r.publicExpropriationDetail.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.publicExpropriationDetail.notEligibleReason).toContain(NON_HEIR_BEQUEST_77_NOTE);
  }, 60_000);

  it("5B — 건물 상속(피상속인 2000) · 토지 2024-02-10 매매: 상속인 건물분 7,320,431(불변) · 수유자 두 파트 미충족 0", async () => {
    const bld = (nonHeir: boolean) => house({
      acquisitionCause: "inheritance", acquisitionDate: "2024-01-10", decedentAcquisitionDate: "2000-01-01",
      landAcquisitionCause: "purchase", landCauseHost: "inheritance", landAcquisitionDate: "2024-02-10",
      ...(nonHeir ? { nonHeirBequest: true } : {}),
    } as never);
    expect((await run(form(bld(false)))).reductionAmount).toBe(7_320_431);
    const r = await run(form(bld(true)));
    expect(r.publicExpropriationDetail.partWise).toBeUndefined();
    expect(r.reductionAmount).toBe(0);
  }, 60_000);
});
