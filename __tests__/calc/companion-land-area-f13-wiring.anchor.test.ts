/**
 * anchor — 토지 컴패니언의 면적이 ④ → ⑫ → ⑭ → 엔진에 닿아 F-13 「1세대1주택 단위」 판정이 **화면 경로**에서 선다.
 *
 * ## 결함 (PR5a 보고 7-2 · 막다른 회귀 방지)
 * 화면의 토지 카드는 면적 칸(`acquisitionArea`·`transferArea`)을 갖는데 ④(`buildAssetPayload`)가 부수토지 한도 판정용
 * `areaM2`를 한 번도 싣지 않았다 — ⑫ Zod(`areaM2`)·⑭(`bundled-split-helpers` `areaM2: c.areaM2`)에는 칸이 있는데 ④만 비어 있어
 * 화면 경로의 부수토지 컴패니언은 **언제나** 「배율 이내인지 판정 불가」가 됐다. S08-6의 표2 대상 자산 축은 배율 이내로 확인된
 * 카드만 표2로 보므로, 이 배선이 없으면 정당한 주택 부수토지 함께 양도가 화면에서 표1로 떨어지고 바로잡을 입력 경로도 없다.
 *
 * ## 고정하는 것 (route 경유 ④ → ⑧ → ⑫ → ⑭)
 *  1. 면적을 입력한 배율 이내 부수토지 → 단위에 들어가 표2 · 총세액이 같은 사실의 단일 주택 입력과 같다 (종전보다 불리하지 않다)
 *  2. 배율 초과 면적 → 한도 내/초과 분리(초과분은 비사업용 토지 표1)
 *  3. 면적 미입력 → 판정 불가 안내(종전 그대로)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function form(landOver: Record<string, unknown> = {}) {
  const f = createDefaultTransferFormData();
  const house = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    standardPriceAtTransfer: "500000000",
    addressJibun: "서울 테스트동 1",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential",
    isUrbanArea: true,
  } as unknown as AssetForm;
  const land = {
    ...makeDefaultAsset(2),
    assetKind: "land",
    landNature: "appurtenant",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "200000000",
    actualSalePrice: "400000000",
    standardPriceAtTransfer: "200000000",
    addressJibun: "서울 테스트동 1",
    acquisitionArea: "200",
    transferArea: "200",
    ...landOver,
  } as unknown as AssetForm;
  return {
    ...f,
    transferDate: "2026-02-16",
    contractTotalPrice: "1400000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "60",
    assets: [house, land],
  } as never;
}

type Card = {
  propertyId: string;
  isExempt?: boolean;
  rateGroup?: string;
  longTermHoldingRate?: number;
  longTermHoldingDeduction: number;
};
const cardsOf = (r: Awaited<ReturnType<typeof runCalc>>): Card[] => r.json.data.aggregated.properties;
const landCard = (r: Awaited<ReturnType<typeof runCalc>>) => cardsOf(r).find((p) => p.propertyId !== "primary")!;

describe("토지 컴패니언 면적 배선 (④→⑧→⑫→⑭)", () => {
  it("🔑 면적 200㎡ ≤ 한도 300㎡ — ④가 areaM2를 싣고 부수토지 카드가 단위(표2)에 든다 · 총세액 4,801,500 = 같은 사실의 단일 주택 입력", async () => {
    const r = await runCalc(form());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBe(200);
    // 주택 10억 + 부수토지 4억 = 14억 합산 판정 후 12억 초과분 안분 → 토지 장특은 표2(보유 40% + 거주 5년 20% = 60%)
    expect(landCard(r).longTermHoldingDeduction).toBe(17_142_856);
    expect(r.json.data.aggregated.totalTax).toBe(4_801_500);
    expect((r.json.data.aggregated.warnings ?? []).join("\n")).not.toContain("배율 이내인지 판정하지 못했습니다");
  });

  it("양도면적이 비면 취득면적으로 대신한다 · 일부양도는 양도한 부분 면적을 쓴다", async () => {
    const onlyAcq = await runCalc(form({ transferArea: "" }));
    expect((onlyAcq.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBe(200);
    const partial = await runCalc(form({ areaScenario: "partial", acquisitionArea: "500", transferArea: "200" }));
    expect((partial.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBe(200);
  });

  it("배율 초과 면적(500㎡ > 300㎡) — 한도 내/초과 분리: 초과분은 비사업용 토지(표1)", async () => {
    const r = await runCalc(form({ acquisitionArea: "500", transferArea: "500" }));
    expect(r.issues).toEqual([]);
    expect((r.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBe(500);
    const ids = cardsOf(r).map((p) => p.propertyId);
    expect(ids.some((id) => id.endsWith("__excess"))).toBe(true);
    expect(ids.some((id) => id.endsWith("__appurtenant"))).toBe(true);
    expect(cardsOf(r).find((p) => p.propertyId.endsWith("__excess"))!.rateGroup).toBe("non_business_land");
  });

  it("독립 나대지는 한도 판정 대상이 아니라 areaM2를 싣지 않는다", async () => {
    const r = await runCalc(form({ landNature: "standalone" }));
    expect((r.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBeUndefined();
  });

  it("면적 미입력 — ⑧이 막는다(#18 하위 1: 면적 필수) · API 직접 호출은 판정 불가 안내 + 12억 합계에는 토지 가액 포함 · 면적을 채우면 위 첫 케이스로 바로잡힌다", async () => {
    const r = await runCalc(form({ acquisitionArea: "", transferArea: "" }));
    // ⑧ — 부수토지로 선언한 토지는 면적 필수 (같은 식을 ④가 areaM2로 싣는다 — 3중 패턴). 면적을 채우면 첫 케이스처럼 issues가 비는 것이 긍정 짝.
    expect(JSON.stringify(r.issues).includes("주택부수토지로 선언한 토지의 면적(㎡)을 입력하세요")).toBe(true);
    expect((r.body.companionAssets as { areaM2?: number }[])[0].areaM2).toBeUndefined();
    expect((r.json.data.aggregated.warnings ?? []).join("\n")).toContain("배율 이내인지 판정하지 못했습니다");
    expect((r.json.data.aggregated.warnings ?? []).join("\n")).toContain("고가주택(12억 초과) 판정에는 그 토지 가액을 합산했습니다");
    expect(landCard(r).isExempt).not.toBe(true);
  });

  it("독립 나대지는 면적이 비어도 ⑧이 막지 않는다 (부수토지 선언만 면적 필수)", async () => {
    const r = await runCalc(form({ landNature: "standalone", acquisitionArea: "", transferArea: "" }));
    expect(JSON.stringify(r.issues).includes("주택부수토지로 선언한 토지의 면적")).toBe(false);
  });
});
