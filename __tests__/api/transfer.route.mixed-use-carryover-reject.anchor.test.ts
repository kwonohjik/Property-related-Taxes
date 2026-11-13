/**
 * anchor — 겸용주택 × 이월과세(증여) 거부 (⑧ ≡ ⑫, 단건·컴패니언) · 계획서 docs/00-pm/mixed-use-4col-separate-acq-bg-carryover.plan.md (Q-1 a)
 *
 * 종전: ⑧이 `carryover_gift` 분기(이월과세 전용 검증)를 겸용 분기보다 먼저 타 통과했고, 요청에 `mixedUse`와 `carryoverTaxation`이 함께 실려도
 * 라우트의 겸용 분기가 먼저 일반 겸용 엔진으로 계산해 **이월과세가 조용히 무시**됐다(같은 조건의 «매매 + 환산» 겸용과 4열 전 행이 같았다).
 * 컴패니언 겸용은 파트 카드 5장이 증여자 취득가액 전액을 각각 받았다(취득가 합 5배).
 *
 *  · MC-1 ⑧ 단건 — 겸용 + 이월과세 → 문구 1건 · 필드 acquisitionCause
 *  · MC-2 ⑫ 단건 — 같은 입력의 body → 400 + 같은 문구 + path acquisitionCause
 *  · MC-3 ⑫ 컴패니언 — 400 + path companionAssets.0.acquisitionCause
 *  · MC-4 ⑧ ≡ ⑫ 같은 문구 (단일 소스)
 *  · MC-5 짝 — 겸용 매매는 통과(200) · 겸용 아닌 주택 + 이월과세는 이 문구가 없다 · 부담부증여 겸용은 이 규칙 밖(MB-9가 따로 막는다)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import {
  MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE,
  isMixedCarryoverRequest,
  isMixedCarryoverUnsupported,
} from "@/lib/calc/mixed-use-carryover-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const CARRY = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-01-10", donorAcquisitionDate: "2010-03-15", donorAcquisitionCause: "purchase" as const,
  donorAcquisitionPrice: "500000000", giftDateValuation: "800000000", donorSameHousehold: "no" as const,
};
const MIXED_FIELDS = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionDate: "2010-03-15", useEstimatedAcquisition: true,
  residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedIsMetropolitanArea: true,
  actualSalePrice: "1500000000",
};
const mkAsset = (i: number, over: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(i), addressJibun: "서울 강남구 테스트동 1-1", ...MIXED_FIELDS, ...over }) as never;
const singleForm = (over: Record<string, unknown> = {}): TransferFormData =>
  withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [mkAsset(1, over)], transferDate: "2025-06-01", filingDate: "2025-08-31", contractTotalPrice: "1500000000", householdHousingCount: "2",
  } as TransferFormData);
const carryoverForm = () => singleForm({ acquisitionCause: "carryover_gift", carryover: CARRY });

async function post(form: TransferFormData) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } finally {
    global.fetch = orig;
  }
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }),
  );
  return { status: res.status, text: JSON.stringify(await res.json()) };
}
const messages = (f: TransferFormData) => collectStepIssues(0, f).map((i: { message: string }) => i.message);

describe("MC 겸용주택 × 이월과세 거부 (Q-1 a)", () => {
  it("MC-1 ⑧ 단건 — 겸용 + 이월과세 → 문구 1건만 (종전: 0건 통과)", () => {
    expect(messages(carryoverForm()).filter((m) => m.includes(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE))).toHaveLength(1);
    expect(messages(carryoverForm())).toEqual([expect.stringContaining(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE)]);
  });

  it("MC-2 ⑫ 단건 — 같은 입력의 body → 400 + 문구 + path acquisitionCause (종전: 200 · 이월과세 무시)", async () => {
    const r = await post(carryoverForm());
    expect(r.status).toBe(400);
    expect(r.text).toContain(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE);
    expect(r.text).toContain("acquisitionCause");
  });

  it("MC-3 ⑫ 컴패니언 — 겸용 컴패니언 + 이월과세 → 400 + path companionAssets.0.acquisitionCause (종전: 200 · 파트 5장이 증여자 취득가 전액씩)", async () => {
    const plain = (i: number) => ({ ...makeDefaultAsset(i), addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "500000000", standardPriceAtAcq: "250000000" });
    const form = withIdentityHousingBuildingStdOnForm({
      ...createDefaultTransferFormData(),
      assets: [plain(1), { ...plain(2), ...MIXED_FIELDS, mixedZoneType: "general_residential", acquisitionCause: "carryover_gift", carryover: CARRY, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" }],
      transferDate: "2025-06-01", filingDate: "2025-08-31", contractTotalPrice: "1200000000", householdHousingCount: "2",
    } as unknown as TransferFormData);
    const r = await post(form);
    expect(r.status).toBe(400);
    expect(r.text).toContain(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE);
    expect(r.text).toContain("companionAssets");
    expect(messages(form).some((m) => m.includes(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE))).toBe(true);
  });

  it("MC-4 ⑧ ≡ ⑫ — 화면 차단 문구와 서버 거부 문구가 같다(단일 소스 상수)", async () => {
    const r = await post(carryoverForm());
    expect(messages(carryoverForm())[0]).toContain(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE);
    expect(r.text).toContain(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE);
  });

  it("MC-5 짝 — 겸용 매매는 ⑧ 0건 · 200 / 겸용 아닌 주택 + 이월과세는 이 문구가 없다 / 부담부증여 겸용은 술어 밖", async () => {
    const purchase = singleForm({ acquisitionCause: "purchase" });
    expect(messages(purchase)).toEqual([]);
    expect((await post(purchase)).status).toBe(200);
    const plainCarry = singleForm({ acquisitionCause: "carryover_gift", carryover: CARRY, isMixedUseHouse: false });
    expect(messages(plainCarry).some((m) => m.includes(MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE))).toBe(false);
    expect(isMixedCarryoverUnsupported({ assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "carryover_gift", transferType: "burdened_gift" })).toBe(false);
    expect(isMixedCarryoverUnsupported({ assetKind: "land", isMixedUseHouse: true, acquisitionCause: "carryover_gift" })).toBe(false);
    expect(isMixedCarryoverUnsupported({ assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "carryover_gift" })).toBe(true);
    // ⑫ 술어(요청 body) — 부담부증여(transferType · burdenedGiftInfo)와 겸용 서브객체 없음은 규칙 밖
    const req = { mixedUse: {}, acquisitionCause: "carryover_gift" };
    expect(isMixedCarryoverRequest(req)).toBe(true);
    expect(isMixedCarryoverRequest({ ...req, transferType: "burdened_gift" })).toBe(false);
    expect(isMixedCarryoverRequest({ ...req, burdenedGiftInfo: {} })).toBe(false);
    expect(isMixedCarryoverRequest({ acquisitionCause: "carryover_gift" })).toBe(false);
    expect(isMixedCarryoverRequest({ ...req, acquisitionCause: "purchase" })).toBe(false);
  });
});
