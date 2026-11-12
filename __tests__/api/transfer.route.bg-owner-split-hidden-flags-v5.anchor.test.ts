/**
 * V-5 — 부담부증여 × 소유자 분리: 숨은 감정·매매사례 플래그가 분리 검증(V8)만 발동시키던 결함.
 *
 * 부담부증여 취득가액은 `bgAcquisitionMethod`가 정하고 자산 단위 감정·매매사례 라디오는 화면에 없다 — ④는 그 플래그를 무시한다
 * (`bgIgnoresAssetAppraisalSalesCase`). 그런데 분리 검증(`transfer-tax-validate-split.ts`)이 원본 플래그로 파트 취득 방식을 파생해
 * 「소유자 분리 → 취득 당시 ㎡당 개별공시지가·면적·기준시가 총액」을 요구했다.
 *
 * 실측(2026-11-12 · 시가 모드 · 파트 취득가액 직접 입력 · 기준시가 칸 빈칸):
 *
 * | 숨은 플래그 | 종전 ⑧ | 서버 | 양도차익 |
 * |---|---|---|---|
 * | 없음 | 통과 | 200 | 210,000,000 |
 * | 감정 · 매매사례 | **차단** | 200 | 210,000,000 |
 *
 * 환산(`useEstimatedAcquisition`)은 ⑧·⑫가 함께 막아 범위 밖이다(#2629 Q-2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

const OWNER_SPLIT_MSG = "토지·건물 소유자가 다르면 본인 소유분만 과세하므로 취득가액을 토지·건물로 나눠야 합니다";
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const BG_MARKET = {
  acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "",
  useEstimatedAcquisition: false, transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000",
  // 파트 취득가액 직접 입력 · 기준시가 칸 빈칸 — 깨끗하면 비율이 쓰이지 않아 V8이 요구하지 않는다
  landAcquisitionPrice: "200000000", buildingAcquisitionPrice: "100000000", standardPricePerSqmAtAcq: "", acquisitionArea: "",
};
const OWN = { building_only: { selfOwns: "building_only" }, land_only: { selfOwns: "land_only", buildingOwnerSameHousehold: false } } as const;
const FLAGS = { clean: {}, appraisal: { isAppraisalAcquisition: true }, salesCase: { isSalesCaseAcquisition: true } } as const;

const asset = (o: Record<string, unknown>) =>
  Object.assign({ ...makeDefaultAsset(1) }, { ...BG_MARKET, assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", ...o }) as unknown as AssetForm;

async function run(o: Record<string, unknown>) {
  const f = Object.assign(createDefaultTransferFormData(), FORM, { assets: [asset(o)], contractTotalPrice: "1,000,000,000" }) as TransferFormData;
  const step0 = collectStepIssues(0, f).map((i) => i.message);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as { data?: { result?: { transferGain?: number } } };
  return { step0, status: res.status, gain: j.data?.result?.transferGain };
}

describe("V-5 부담부증여 × 소유자 분리 — 숨은 감정·매매사례 플래그는 분리 검증을 바꾸지 않는다", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  });

  for (const [own, oo] of Object.entries(OWN)) {
    for (const [flag, fo] of Object.entries(FLAGS)) {
      it(`${own} · ${flag}: ⑧ 소유자 분리 기준시가 요구 없음 · 200 · 양도차익 210,000,000`, async () => {
        const r = await run({ ...oo, ...fo });
        expect(r.step0.some((m) => m.includes(OWNER_SPLIT_MSG))).toBe(false);
        expect(r.status).toBe(200);
        expect(r.gain).toBe(210_000_000);
      });
    }
  }

  it("형제 안전망 — 일반 양도는 같은 감정 플래그로 V8이 그대로 요구한다(부담부증여만 무시)", () => {
    const general = asset({ ...OWN.building_only, transferType: "general", isAppraisalAcquisition: true });
    expect(validateSplitDirectInputs(general, "자산") ?? "").toContain(OWNER_SPLIT_MSG);
    const bg = asset({ ...OWN.building_only, isAppraisalAcquisition: true });
    expect(validateSplitDirectInputs(bg, "자산") ?? "").not.toContain(OWNER_SPLIT_MSG);
  });
});
