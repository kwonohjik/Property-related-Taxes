/**
 * P2 C × 다건(합산) — ⑧ 차단 ⇔ ⑫ 거부 정합 (2026-10-19)
 *
 * 다건 화면은 단건 마법사를 임베드하므로 C 토글이 보인다. 이월과세 호스트는 다건 ⑧이 이미 막지만(`validateMultiSupportedMode`), 그 막음이 우회될 때
 * (API 직접 호출) ⑫가 새 키를 **strip 하지 않고 거부**해야 한다 — 조용히 일반 증여로 계산되면 안 된다(침묵 오산 금지).
 * 다건 ④(`buildPropertyPayload`)는 `buildLandPartCausePayload(primary)`를 첫 자산 자격으로 부르므로 C 키를 그대로 싣고, 그 body를 실제 multi route에 태운다.
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
import { MULTI_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { cAsset, cForm } from "./_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("다건 × C", () => {
  it("⑧: C를 켠 자산(이월과세 호스트)은 다건 지원 모드가 아니다 — 토글 OFF 이월과세도 같다(종전 규칙 불변)", () => {
    expect(validateMultiSupportedMode(cForm() as never)).toBe(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE);
    expect(validateMultiSupportedMode(cForm({}, cAsset({ carryoverDonorSplit: false })) as never)).toBe(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE);
  });

  it("④⑫: 다건 body는 C 키를 싣고(첫 자산 자격), multi route는 strip 없이 400으로 거부한다", async () => {
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
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("단건 계산기에서만 지원");
  });

  it("긍정 짝: C가 아닌 일반 split(매매)은 다건 ⑧ 통과", () => {
    expect(validateMultiSupportedMode(cForm({}, cAsset({ acquisitionCause: "purchase", carryoverDonorSplit: false })) as never)).toBeNull();
  });
});
