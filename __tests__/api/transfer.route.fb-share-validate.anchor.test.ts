/**
 * anchor — 지분 × 가업상속공제 ⑧ V8-1·V8-3 ↔ ⑫ E-5 경계 (transfer-fb-share UI 계획 §4.5·§5.1 · 최종 결정 UQ-2·E-5)
 *
 * | 입력 | ⑧ | ⑫ |
 * | 지분 + FB + 확인 없음 | 차단(V8-1) | 통과 — **의도된 비대칭**: 확인은 화면 표시·검증 전용이라 서버가 막을 근거가 없다(`ownershipRemainderThirdParty` 선례) |
 * | 지분 + FB + 확인 있음 | 통과 | 통과 |
 * | 지분율을 곱한 평가액 0원 | 차단(V8-3) | 400(E-5 — 같은 엔진 술어) |
 * | 100% + FB | 통과(확인 불필요) | 통과 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { FB_SHARE_MARKET_VALUE_ZERO_MESSAGE } from "@/lib/tax-engine/family-business-share";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(() => vi.unstubAllGlobals());

function form(o: { share?: boolean; confirmed?: boolean; market?: number } = {}): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-10-15";
  f.contractTotalPrice = "1,800,000,000";
  f.householdHousingCount = "1";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2022-04-10",
    inheritanceStartDate: "2022-04-10",
    fixedAcquisitionPrice: "1,500,000,000",
    inheritanceAssetKind: "land",
    publishedValueAtInheritance: "1,500,000,000",
    decedentAcquisitionDate: "2012-03-08",
    transferExpense: "30,000,000",
    ...(o.share ? { ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" as const } : {}),
    fbShareBasisConfirmed: o.confirmed ?? false,
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 500_000_000,
      inheritanceMarketValue: o.market ?? 1_500_000_000,
      fbDeductionAppliedRate: 0.7,
      inheritanceDate: "2022-04-10",
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
    },
  };
  return f;
}
const fbIssues = (f: TransferFormData) => {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) if (i.message.includes("가업상속공제")) out.push(i.message);
  return out;
};
async function captureBody(f: TransferFormData) {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body만 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function post(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("V8-1 «물건 전체 기준» 확인", () => {
  it("지분 + FB + 확인 없음 → ⑧ 차단 · ⑫는 통과(의도된 비대칭)", async () => {
    const f = form({ share: true, confirmed: false });
    expect(fbIssues(f).some((m) => m.includes("지분 모드(50%)") && m.includes("확인하는 항목을 켜세요"))).toBe(true);
    const r = await post(await captureBody(f));
    expect(r.status).toBe(200);
  });
  it("확인 있음 → ⑧ 통과", () => {
    expect(fbIssues(form({ share: true, confirmed: true }))).toEqual([]);
  });
  it("100% 자산은 확인 없이 통과(회귀 0)", () => {
    expect(fbIssues(form({ share: false, confirmed: false }))).toEqual([]);
  });
  it("④ body에 확인 필드가 실리지 않는다(표시·검증 전용)", async () => {
    const body = await captureBody(form({ share: true, confirmed: true }));
    expect(JSON.stringify(body)).not.toContain("fbShareBasisConfirmed");
  });
});

describe("V8-3 / E-5 지분율을 곱한 평가액 0원 — ⑧과 ⑫ 모두 거부", () => {
  /** 평가액 1원 × 1/2 → applyRatio 0원 */
  it("⑧ 차단 · ⑫ 400(같은 문구)", async () => {
    const f = form({ share: true, confirmed: true, market: 1 });
    expect(fbIssues(f)).toContain(`자산: ${FB_SHARE_MARKET_VALUE_ZERO_MESSAGE}`);
    const r = await post(await captureBody(f));
    expect(r.status).toBe(400);
    expect(r.j.error.fieldErrors["familyBusinessInheritance.inheritanceMarketValue"]).toContain(FB_SHARE_MARKET_VALUE_ZERO_MESSAGE);
  });
  it("평가액 2원 × 1/2 = 1원 → 통과", () => {
    expect(fbIssues(form({ share: true, confirmed: true, market: 2 }))).toEqual([]);
  });
});
