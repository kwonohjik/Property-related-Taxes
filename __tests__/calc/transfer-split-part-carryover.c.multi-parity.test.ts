/**
 * P2 C × 다건(합산) — ⑧ 통과 · ⑭ 합성기 · 단건과 같은 결정세액 (2026-10-19 차단 → 2026-11-10 트랙 CO-PART · Q-4 b)
 *
 * 다건 화면은 단건 마법사를 임베드하므로 C 토글이 보인다. 다건 ④(`buildPropertyPayload`)는 C 키를 첫 자산 자격으로 싣고, 다건 ⑭가 단건과 같은 합성기
 * (`composeSplitCarryover`)로 엔진에 옮긴다. 키가 조용히 버려지면(strip) 일반 증여로 계산되므로 단건 결정세액과 대조해 고정한다.
 * 파트 A/B는 엔진이 그 자산의 결정세액으로 정한다 — 다른 자산과 함께면 route가 «확인 필요»를 싣는다(`MULTI_SPLIT_CARRYOVER_ASSET_SCOPE_NOTICE`).
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

import { POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { cAsset, cForm, bodyOf, routeOf } from "./_helpers/split-carryover-c-form";
import { POST as SINGLE_POST } from "@/app/api/calc/transfer/route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("다건 × C", () => {
  it("⑧: C를 켠 자산도 다건 지원 모드다(트랙 CO-PART) — 토글 OFF면 자산 단위 이월과세(트랙 CO)", () => {
    expect(validateMultiSupportedMode(cForm() as never)).toBeNull();
    // 2026-11-09 트랙 CO — 토글 OFF 이월과세는 자산 단위 사건이라 다건이 단건과 같이 계산한다(`multi-carryover-parity.anchor.test.ts`).
    expect(validateMultiSupportedMode(cForm({}, cAsset({ carryoverDonorSplit: false })) as never)).toBeNull();
  });

  it("④⑭: 다건 body는 C 키를 싣고(첫 자산 자격), multi route는 단건과 같은 결정세액 — strip(일반 증여 세액)이 아니다", async () => {
    const payload = buildPropertyPayload(cForm() as never) as Record<string, unknown>;
    expect(payload.carryoverGiftEvent).toBeTruthy();
    expect(payload.landCarryoverPart).toBeTruthy();
    expect(payload.buildingCarryoverPart).toBeTruthy();
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...JSON.parse(JSON.stringify(payload)) }], annualBasicDeductionUsed: 0 }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    const single = await routeOf(SINGLE_POST, await bodyOf(cForm()));
    expect(json.data.determinedTax).toBe(single.json.data.result.determinedTax);
    // 대조 — 파트 키를 버리면(일반 증여) 세액이 다르다(이 시료가 strip을 구별한다)
    const stripped = await POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...JSON.parse(JSON.stringify(buildPropertyPayload(cForm({}, cAsset({ carryoverDonorSplit: false })) as never))) }], annualBasicDeductionUsed: 0 }),
      }),
    );
    expect((await stripped.json()).data?.determinedTax).not.toBe(json.data.determinedTax);
  });

  it("긍정 짝: C가 아닌 일반 split(매매)은 다건 ⑧ 통과", () => {
    expect(validateMultiSupportedMode(cForm({}, cAsset({ acquisitionCause: "purchase", carryoverDonorSplit: false })) as never)).toBeNull();
  });
});
