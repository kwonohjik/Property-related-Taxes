/**
 * 부담부증여 × 이월과세 — 당초 증여자 취득 당시 기준시가 합이 0(D-3i · Q-15 a · 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §22).
 *
 * 종전: ⑧은 칸이 비었는지(`filled`)만 봐 「토지 0 · 건물 0」을 통과시켰다.
 *   - 환산(K-5): 200 · 시나리오 A 취득가액 0 → 양도차익 500,000,000(정상 403,437,500).
 *   - 기준시가 평가 · 담보 승: 엔진이 400 — ⑧ 통과 ↔ 400.
 * 지금: ⑧이 세 경우 모두 막고(합 0) · 엔진도 K-5에서 막는다(`transfer-tax-burdened-gift-step.ts`).
 * 양도인 쪽 취득시 기준시가 0은 막지 않는다 — 시나리오 B는 양도인 증여일 평가액을 실지거래가액으로 읽는다(`toTransferorBasisInfo` · ⑧ `bgConvertedCarryoverReadsGiftValuation`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { bgAsset, bgForm, bodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(f: TransferFormData) {
  const b = (await bodyOf(f)) as Body;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...b, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const j = (await res.json()) as { data?: { result?: Body }; error?: { message?: string } };
  return { status: res.status, gain: j.data?.result?.transferGain as number | undefined, message: j.error?.message ?? "" };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household"));
/** 주택 · 시가 800M · 채무 500M · 당초 증여자 토지 0 · 건물 1.5억(정상) — `carryover-donor-built-bg-form` 셀. */
const asset = (over: Partial<AssetForm> = {}) => bgForm(bgAsset("converted", { donorBuilt: false }, over));
const ZERO = { bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "0" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" } as Partial<AssetForm>;
const COLLATERAL = { bgMortgageDebtAmount: "900,000,000" } as Partial<AssetForm>;

describe("CZ-1 당초 증여자 기준시가 합 0 — ⑧ 차단 ∧ ⑫ 400 (⑧ ⊇ ⑫)", () => {
  for (const [name, over, engine] of [
    ["시가 · 환산(K-5) — 종전 ⑧ 통과 · 200 · 500,000,000", {}, /환산취득가액으로 취득가액을 산정하는데 취득시 기준시가가 없습니다/],
    ["기준시가 평가 — 종전 ⑧ 통과 ↔ 400", STD, /기준시가로 평가했는데 취득시 기준시가가 없습니다/],
    ["시가 · 담보 승 — 종전 ⑧ 통과 ↔ 400", COLLATERAL, /취득시 기준시가로 산정해야 합니다/],
  ] as const) {
    it(name, async () => {
      const f = asset({ ...over, ...ZERO } as Partial<AssetForm>);
      const is = issues(f);
      expect(is.map((i) => i.field)).toContain("bgCoDonorLandStdPriceAtAcq");
      expect(is.map((i) => String(i.message)).join(" ")).toContain("당초 증여자 취득 당시 기준시가가 모두 0입니다");
      const r = await post(f);
      expect(r.status).toBe(400);
      expect(r.message).toMatch(engine);
    });
  }
});

describe("CZ-2 막지 않는다", () => {
  it("정상(당초 증여자 토지 0 · 건물 1.5억) → ⑧ 0 · 200 · 403,437,500", async () => {
    const f = asset();
    expect(issues(f)).toEqual([]);
    expect(await post(f)).toMatchObject({ status: 200, gain: 403_437_500 });
  });
  it("양도인 취득시 기준시가 0 — 시나리오 B는 증여일 평가액을 읽는다 → ⑧ 0 · 200 · 403,437,500", async () => {
    const f = asset({ standardPriceAtAcq: "0" });
    expect(issues(f)).toEqual([]);
    expect(await post(f)).toMatchObject({ status: 200, gain: 403_437_500 });
  });
  it("매매사례가액 · 감정가액(담보 승 아님)은 이 칸을 개산공제 base로만 쓴다 — 합 0이어도 이 규칙으로 막지 않는다", () => {
    const f = bgForm(bgAsset("appraisal", { donorBuilt: false }, ZERO as Partial<AssetForm>));
    expect(issues(f).map((i) => String(i.message)).join(" ")).not.toContain("당초 증여자 취득 당시 기준시가가 모두 0입니다");
  });
});
