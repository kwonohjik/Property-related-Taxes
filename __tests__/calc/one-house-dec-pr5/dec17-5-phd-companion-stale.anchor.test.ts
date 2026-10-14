/**
 * #17-5 ① — §164⑦ PHD는 **첫 자산에만** 닿는다(④ `buildPreHousingDisclosurePayload(primary)` 한 곳 · ⑧ `index > 0`은 11칸 요구 해제).
 * 함께 양도 주택 카드에 PHD 플래그가 남아 있어도(첫 자산이었다가 순서가 바뀐 경우 등) 분리 경로의 5칸 요구·전송은 5칸 경로 그대로여야 한다 —
 * 클라이언트가 그 카드를 «PHD 분리»로 읽으면 5칸 카드가 사라지고(⑤) ⑧은 요구하지 않는데(⑧) 엔진은 PHD 페이로드가 없어 5칸을 요구한다(막다른 길 / API 400).
 *
 * 시료: 주 자산 주택(한도 이내) + 컴패니언 주택(2012 취득 · 환산 · PHD 플래그 잔재 · 500㎡/정착 100㎡ → 초과 200㎡) — 같은 날 함께양도 주택 2채 차단(#40)은 제외하고 본다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "500000000",
  standardPriceAtTransfer: "500000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "250",
  transferArea: "250",
};
const OVER = { acquisitionArea: "500", transferArea: "500" };
const FIVE: Record<string, unknown> = {
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const STALE_PHD: Record<string, unknown> = {
  usePreHousingDisclosure: true,
  useEstimatedAcquisition: true,
  fixedAcquisitionPrice: "",
  phdFirstDisclosureDate: "2015-04-30",
  phdFirstDisclosureHousingPrice: "486000000",
};
const mk = (n: number, over: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(n), ...HOUSE, addressJibun: `서울 테스트동 ${n}`, ...over }) as unknown as AssetForm;
const form = (assets: AssetForm[]) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets,
  }) as never;
const exceptSameDay = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => !i.message.includes("함께양도로 묶여 있습니다"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const propsOf = (r: Awaited<ReturnType<typeof runCalc>>): any[] => r.json?.data?.aggregated?.properties ?? [];

describe("#17-5 ① 함께 양도 주택 카드 — PHD 플래그 잔재는 PHD가 아니다(첫 자산에만 닿는다)", () => {
  it("🔑 컴패니언(환산 + PHD 잔재 플래그 + 초과 200㎡) — ⑧이 5칸을 요구하지 않을 때만 통과·④가 5칸을 싣고·엔진이 초과분을 분리한다 (주 자산 단건과 같은 5칸 경로)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE, ...STALE_PHD })]));
    expect(exceptSameDay(r)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (r.body.companionAssets as any[])[0];
    expect(body.preHousingDisclosure).toBeUndefined();
    expect(body.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    expect(body.standardPricePerSqmAtAcquisition).toBe(400_000);
    expect(r.status).toBe(200);
    expect(propsOf(r)[1].splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, limitArea: 300 });
  });

  it("⑧ — 같은 컴패니언의 5칸이 비어 있으면 PHD 잔재 플래그와 무관하게 5칸(취득 당시 개별주택가격)을 요구한다 (칸 없는 요구가 아니다)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...STALE_PHD })]));
    // 환산 취득가액 칸의 일반 요구와 구별한다 — 배율 초과분 분리 요구(⑧ `validateHousingExcessSplitInputs`)의 고유 문구로 본다
    expect(exceptSameDay(r).some((i) => i.message.includes("배율 한도를") && i.message.includes("토지·건물 가액을 나눌 기준시가"))).toBe(true);
  });
});
