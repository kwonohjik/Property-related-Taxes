/**
 * 🔄 2026-11-12 PR-3 — 범위가 «건물 종류만»으로 열렸다(`bg-owner-split-159.plan.md` Q-1 b). 이 파일은 **범위 밖**(주택 · 함께 양도 묶음)이 계속 막힘을 고정한다 —
 * 단언은 그대로이고 사유별 문구만 따라간다. 범위 안 계산·그 밖 사유(취득원인·매매사례/감정·공유지분·채무 미확인)는 `transfer.route.bg-owner-split-calc.anchor.test.ts`.
 *
 * 부담부증여 × 토지·건물 소유자 분리 — ⑧·⑫가 같은 leaf로 막는다(`lib/calc/bg-owner-split-scope.ts` · 사용자 결정 c 2026-11-12).
 *
 * 「소득세법 시행령」 §159①의 평가액·증여가액은 증여한 부분의 값이어야 하는데, ④가 부담부증여면 분리 payload를 끄고 엔진은 물건 전체 값으로
 * 계산했다 — 소유자 분리를 켜도 양도차익이 `both`와 같았다(시가 210,000,000 · 기준시가 194,000,000). 취득·양도 시점 건물 비중이 다르면
 * 결정세액이 갈린다(실측 4,039,500 ↔ 건물분 값 0 · 모의 세율). 엔진 구현(결정 b)은 별건이다.
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
import { BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE, bgOwnerSplitReasonMessage } from "@/lib/calc/bg-owner-split-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

const MSG = BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE;
/** 주택(개별주택가격)은 범위 밖 — 사유별 문구(계획서 Q-1 b). 이 파일의 시료는 모두 범위 밖이다. */
const HOUSING_MSG = bgOwnerSplitReasonMessage("housing");
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 기준시가 모드 부담부증여 주택(`transfer.route.bg-std-mode-acq-std-required` SA-1과 같은 시료) — 단건 양도차익 194,000,000 */
const BG = {
  acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000",
  useEstimatedAcquisition: false, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000",
  // 소유자 분리 V8 칸 — 채워 두어 차단 사유가 이 leaf 하나뿐이게 한다
  standardPricePerSqmAtAcq: "1000000", acquisitionArea: "250",
};
const house = (id: number, o: Record<string, unknown> = {}) =>
  Object.assign({ ...makeDefaultAsset(id) }, { ...BG, assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", ...o }) as unknown as AssetForm;

async function run(assets: AssetForm[]) {
  const f = Object.assign(createDefaultTransferFormData(), FORM, {
    assets, contractTotalPrice: assets.length > 1 ? "" : "1,000,000,000", ...(assets.length > 1 ? { assetSplitMode: "companion", bundledSaleMode: "actual" } : {}),
  }) as TransferFormData;
  const step0 = collectStepIssues(0, f);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const text = await res.text();
  return { step0, status: res.status, text, body };
}

describe("부담부증여 × 소유자 분리 차단", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  });

  it("기준선 — 소유자 분리 없음(both)은 그대로 200 · 양도차익 194,000,000", async () => {
    const r = await run([house(1)]);
    expect(r.step0.map((i) => i.message).some((m) => m.includes(MSG))).toBe(false);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text).data.result.transferGain).toBe(194_000_000);
  });

  it.each(["building_only", "land_only"] as const)("주 자산 %s → ⑧ 「토지·건물 소유자 다름」 칸 · ⑫ 400 같은 문구", async (own) => {
    const r = await run([house(1, { selfOwns: own, ...(own === "land_only" ? { buildingOwnerSameHousehold: false } : {}) })]);
    expect(r.step0).toContainEqual(expect.objectContaining({ assetIndex: 0, field: "selfOwns", message: `자산: ${HOUSING_MSG}` }));
    expect(r.status).toBe(400);
    expect(r.text).toContain(MSG);
  });

  it("함께 양도 컴패니언(건물) building_only → ⑧ 자산 2 · ⑫ 400 (컴패니언 경로)", async () => {
    // 주택 2채 같은 날 함께 양도는 §154⑨ 순서 차단이 먼저 걸린다 — 컴패니언을 건물로 둔다
    const r = await run([house(1), house(2, { assetKind: "building", selfOwns: "building_only" })]);
    expect(r.step0).toContainEqual(expect.objectContaining({ assetIndex: 1, field: "selfOwns" }));
    expect(r.step0.find((i) => i.assetIndex === 1)?.message).toContain(MSG);
    expect(r.status).toBe(400);
    expect(r.text).toContain(MSG);
  });

  it("⑫ 직접 API — ④를 거치지 않은 본문도 막는다(selfOwns + burdenedGiftInfo)", async () => {
    const { body } = await run([house(1)]);
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ ...body, selfOwns: "building_only" }) }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(MSG);
  });

  it("형제 안전망 — 일반 양도 소유자 분리는 막지 않는다", async () => {
    const r = await run([house(1, { transferType: "regular", selfOwns: "building_only" })]);
    expect(r.step0.map((i) => i.message).some((m) => m.includes(MSG))).toBe(false);
    expect(r.text).not.toContain(MSG);
  });
});
