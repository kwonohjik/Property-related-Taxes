/**
 * P6 ⑥ 사이드바 — 파트 환산은 사이드바 합계 코드를 바꾸지 않는다(이월과세 파트는 이미 «계산 후 표시»).
 *
 * 입력 단계: 환산이든 아니든 이월과세 파트의 취득가액·필요경비는 미확정(pending)이다 — 증여자 취득 당시 기준시가·증여자 가액 입력 부분합을 총액으로 보이지 않는다.
 * 결과 도착 후: 엔진이 실제로 차감한 파트 합(`summarizeSplitGain().acquisitionDeducted`)으로 풀린다 — 환산취득가액이 거기 들어간다.
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf } from "./_helpers/split-carryover-c-form";
import { aForm, aAsset, A_LAND_CARRYOVER } from "./_helpers/split-carryover-a-form";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const EST = { ...A_LAND_CARRYOVER, partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };

describe("P6 ⑥ 사이드바 (A 토지 환산)", () => {
  it("계산 전: 환산·실가 모두 취득가액 pending(0) — 입력 부분합을 총액으로 보이지 않는다", () => {
    for (const land of [EST, A_LAND_CARRYOVER]) {
      const f = aForm("purchase", {}, aAsset("purchase", { landCarryover: land }));
      const row = computeTransferPerAssetSummary(f, null).rows[0];
      expect(row.acqPending).toBe(true);
      expect(row.acqPrice).toBe(0);
      expect(computeTransferSummary(f, null).totalAcqPrice).toBe(0);
    }
  });

  it("계산 후: pending이 풀려 엔진이 차감한 파트 합(환산취득가액 + 건물 실가)을 보인다", async () => {
    const f = aForm("purchase", {}, aAsset("purchase", { landCarryover: EST }));
    const r = await routeOf(POST, await bodyOf(f));
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    const sd = r.json.data.result.splitDetail;
    const post = computeTransferPerAssetSummary(f, { mode: "single", result: r.json.data.result } as never).rows[0];
    expect(post.acqPending).toBe(false);
    expect(post.acqPrice).toBe(summarizeSplitGain(sd).acquisitionDeducted);
    expect(post.acqPrice).toBe(30_000_000 + 400_000_000); // 토지 환산취득가액 + 건물 실가
  });
});
