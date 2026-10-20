/**
 * P3 A ⑥ 사이드바 — 토지 이월과세의 토지 취득가액·필요경비는 입력 단계에서 «계산 후 표시»(pending), 결과가 오면 엔진이 실제 차감한 값으로 풀린다 (2026-10-20)
 *
 * 토지 취득가액은 «증여자 취득가액»(적용) 또는 «증여 신고가액»(미적용)이고 어느 쪽인지는 ②3호 비교(엔진)가 정한다 — 입력 단계에서 증여 신고가액(3억)을
 * 토지 취득가액으로 보이면 오독이다. 부정형 짝: 같은 폼의 토지 원인 「증여」는 종전대로 파트 합(3억 + 4억)을 보인다.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { bodyOf, routeOf } from "../calc/_helpers/split-carryover-c-form";
import { aAsset, aForm, type AHost } from "../calc/_helpers/split-carryover-a-form";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  useCalcWizardStore.getState().reset();
});

const load = (host: AHost, asset: AssetForm, result: TransferAPIResult | null = null) => {
  useCalcWizardStore.setState({ formData: aForm(host, {}, asset), result });
  const { formData, result: r } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, r).rows[0];
};

for (const host of ["purchase", "newConstruction"] as const) {
  describe(`⑥ A 사이드바 × ${host}`, () => {
    it("입력 단계: 취득가액·필요경비는 계산 후 표시", () => {
      const row = load(host, aAsset(host));
      expect(row.acqPending).toBe(true);
      expect(row.expensePending).toBe(true);
      expect(row.acqPrice).toBe(0);
    });

    it("결과 후: 엔진이 실제 차감한 파트 합 — 토지 증여자 취득가액 1억(이월과세 적용) + 건물 4억 = 5억, 필요경비 = 토지 증여세 상당액 2천만", async () => {
      const r = await routeOf(POST, await bodyOf(aForm(host)));
      expect(r.status).toBe(200);
      const row = load(host, aAsset(host), { mode: "single", result: r.json.data.result } as unknown as TransferAPIResult);
      expect(row.acqPending).toBe(false);
      expect(row.acqPrice).toBe(500_000_000);
      expect(row.expensePending).toBe(false);
      expect(row.expense).toBe(20_000_000);
    });

    it("부정형 짝: 토지 원인 「증여」는 pending 아님 — 파트 합 7억", () => {
      const row = load(host, aAsset(host, { landAcquisitionCause: "gift" }));
      expect(row.acqPending).toBe(false);
      expect(row.acqPrice).toBe(700_000_000);
    });
  });
}
