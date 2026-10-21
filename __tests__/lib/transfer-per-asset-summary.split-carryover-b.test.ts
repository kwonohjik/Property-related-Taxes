/**
 * P4 B ⑥ 사이드바 — 건물 이월과세의 건물 취득가액·필요경비는 입력 단계에서 «계산 후 표시»(pending), 결과가 오면 엔진이 실제 차감한 값으로 풀린다 (2026-10-21)
 *
 * 건물 취득가액은 «증여자 취득가액»(적용) 또는 «증여 신고가액»(미적용)이고 어느 쪽인지는 ②3호 비교(엔진)가 정한다 — 입력 단계에서 증여 신고가액(4억)을
 * 건물 취득가액으로 보이면 오독이다. 부정형 짝: 같은 폼의 건물 원인 「증여」(D2)는 종전대로 파트 합(1.2억 + 4억)을 보인다.
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
import { bAsset, bForm } from "../calc/_helpers/split-carryover-b-form";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  useCalcWizardStore.getState().reset();
});

const load = (asset: AssetForm, result: TransferAPIResult | null = null) => {
  useCalcWizardStore.setState({ formData: bForm({}, asset), result });
  const { formData, result: r } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, r).rows[0];
};

describe("⑥ B 사이드바", () => {
  it("입력 단계: 취득가액·필요경비는 계산 후 표시", () => {
    const row = load(bAsset());
    expect(row.acqPending).toBe(true);
    expect(row.expensePending).toBe(true);
    expect(row.acqPrice).toBe(0);
  });

  it("결과 후: 엔진이 실제 차감한 파트 합 — 토지 매매 1.2억 + 건물 증여자 취득가액 1억(이월과세 적용) = 2.2억, 필요경비 = 건물 증여세 상당액 2천만", async () => {
    const r = await routeOf(POST, await bodyOf(bForm()));
    expect(r.status).toBe(200);
    const row = load(bAsset(), { mode: "single", result: r.json.data.result } as unknown as TransferAPIResult);
    expect(row.acqPending).toBe(false);
    expect(row.acqPrice).toBe(220_000_000);
    expect(row.expensePending).toBe(false);
    expect(row.expense).toBe(20_000_000);
  });

  it("부정형 짝: 건물 원인 「증여」(D2 — 일반 증여 + 토지 매매)는 pending 아님 — 파트 합 5.2억", () => {
    const row = load(bAsset({ acquisitionCause: "gift", landCauseHost: "gift", acquisitionDate: "2023-03-01" }));
    expect(row.acqPending).toBe(false);
    expect(row.acqPrice).toBe(520_000_000);
  });
});
