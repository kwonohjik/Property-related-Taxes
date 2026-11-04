/**
 * anchor — 함께 양도 상속·증여 겸용주택 파트 카드의 취득가액·필요경비 표시(echo)가 단건 겸용 엔진 파트 값과 같다.
 * 계획서 `docs/02-design/features/companion-mixed-use-inherited-acq-echo.plan.md` · Q-1 a(결함 없음 — 회귀 고정).
 *
 * 겸용 엔진이 §163⑨(①·②·③)를 먼저 끝낸 값을 파트 카드 취득가액으로 싣고(`mixed-use-part-cards.ts`), 카드의 STEP 0.45는
 * `inheritedAcquisition: undefined`로 끈다. 그래서 echo(`resolveDisplayAcquisitionAndExpense`)의 실가 분기가 읽는
 * `singleInput.acquisitionPrice`가 곧 채택값이다 — #2896 결함(D-1, 일반 자산 카드가 ①을 싣고 단건 엔진이 덮어쓴다)과 경로가 다르다.
 *
 * 공통: 겸용(주택 100㎡ · 상가 60㎡ · 대지 200㎡ · 비조정) + 토지(매매 2015-03-01) 함께 양도 · 계약 총액 12억 · 양도 2023-09-18.
 * 픽스처는 #2898 anchor(`transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts`)와 같다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Card = { propertyId: string; transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number };
type PartAmounts = { landTransferPrice: number; landAcqPrice: number; landAppraisalDed: number; buildingTransferPrice: number; buildingAcqPrice: number; buildingAppraisalDed: number };
type Resp = { data?: { aggregated?: { properties: Card[] }; result?: { housingPart: PartAmounts; commercialPart: PartAmounts; sec163_9Comparison?: { selected: string } } } };

async function pipeline(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }),
  );
  return { status: res.status, json: (await res.json()) as Resp };
}

const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
const INHERIT = {
  acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
  decedentAcquisitionDate: "2015-01-01", publishedValueAtInheritance: "600000000",
};
const GIFT = {
  acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no",
  fixedAcquisitionPrice: "600000000",
};
/** 의제취득일(1985.1.1.) 전 상속 — 겸용 엔진이 ①·②·③을 합계로 비교한다(`sec163_9Comparison`). */
const PRE_DEEMED = { ...INHERIT, acquisitionDate: "1983-05-01", inheritanceStartDate: "1983-05-01", decedentAcquisitionDate: "1975-01-01" };
const REPORTED = { mixedHousingInheritedValueOverride: "500000000", mixedCommercialInheritedValueOverride: "400000000" };
const EXPENSE = { mixedHousingInheritedExpense: "20000000", mixedCommercialInheritedExpense: "10000000" };
const HALF = { ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" };
/** 양도시 기준시가를 낮춰 ③(환산)이 이긴다. */
const LOW_TRANSFER_STD = { mixedTransferHousingPrice: "300000000", mixedTransferLandPricePerSqm: "3000000", mixedTransferCommercialBuildingPrice: "60000000" };
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};

const form = (cause: Record<string, unknown>, companion: boolean, singleTotal = "1000000000"): TransferFormData => {
  const m = { ...makeDefaultAsset(companion ? 2 : 1), ...MIXED, actualSalePrice: singleTotal, ...cause };
  const l = { ...makeDefaultAsset(companion ? 1 : 2), ...LAND };
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: companion ? [l, m] : [m],
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: companion ? "1200000000" : singleTotal,
    householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};
const run = async (f: TransferFormData) => {
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f);
  expect(r.status).toBe(200);
  return r.json.data!;
};

/** 파트 카드 4장 — 주택 부수토지 · 주택 건물 · 상가 부수토지 · 상가 건물 순(이 픽스처에는 배율초과 카드가 없다). */
const PART_IDS = ["mu-house-land", "mu-house-bld", "mu-comm-land", "mu-comm-bld"] as const;
const companionCards = async (cause: Record<string, unknown>) => {
  const props = (await run(form(cause, true))).aggregated!.properties;
  return PART_IDS.map((id) => props.find((p) => p.propertyId.startsWith(`${id}#`))!);
};
const singleParts = (d: NonNullable<Resp["data"]>) => {
  const { housingPart: h, commercialPart: c } = d.result!;
  return [
    [h.landAcqPrice, h.landAppraisalDed],
    [h.buildingAcqPrice, h.buildingAppraisalDed],
    [c.landAcqPrice, c.landAppraisalDed],
    [c.buildingAcqPrice, c.buildingAppraisalDed],
  ];
};

describe("함께 양도 겸용주택 상속·증여 — 파트 카드 echo = 단건 겸용 엔진 파트 값 (V-1)", () => {
  /** [행, 원인, 단건 비교 채택, 파트 카드 [취득가액, 필요경비] ×4] — 계획서 §1.1·§1.2 */
  it.each([
    ["상속 ② (① 칸 빈칸)", INHERIT, undefined,
      [[258_620_689, 0], [41_379_311, 0], [187_500_000, 0], [50_000_000, 0]]],
    ["상속 ① 주택 5억·상가 4억", { ...INHERIT, ...REPORTED }, undefined,
      [[431_034_481, 0], [68_965_519, 0], [315_789_473, 0], [84_210_527, 0]]],
    ["상속 ① + 필요경비 주택 2천만·상가 1천만", { ...INHERIT, ...REPORTED, ...EXPENSE }, undefined,
      [[431_034_481, 17_241_379], [68_965_519, 2_758_621], [315_789_473, 7_894_736], [84_210_527, 2_105_264]]],
    ["상속 ② + 같은 필요경비", { ...INHERIT, ...EXPENSE }, undefined,
      [[258_620_689, 17_241_379], [41_379_311, 2_758_621], [187_500_000, 7_894_736], [50_000_000, 2_105_264]]],
    ["증여 ① + 주택 필요경비 2천만", { ...GIFT, mixedHousingGiftValueOverride: "500000000", mixedCommercialGiftValueOverride: "400000000", mixedHousingGiftExpense: "20000000" }, undefined,
      [[431_034_481, 17_241_379], [68_965_519, 2_758_621], [315_789_473, 0], [84_210_527, 0]]],
    ["상속 ① · 지분 1/2(나머지 타인)", { ...INHERIT, ...REPORTED, ...HALF }, undefined,
      [[215_517_240, 0], [34_482_760, 0], [157_894_736, 0], [42_105_264, 0]]],
    ["상속 ② · 지분 1/2", { ...INHERIT, ...HALF }, undefined,
      [[129_310_344, 0], [20_689_656, 0], [93_750_000, 0], [25_000_000, 0]]],
    ["의제 전 1983 상속 — ② 537,500,000 > ③ 500,000,000", PRE_DEEMED, "standard",
      [[258_620_689, 0], [41_379_311, 0], [187_500_000, 0], [50_000_000, 0]]],
    ["의제 전 1983 상속 — ① 9억", { ...PRE_DEEMED, ...REPORTED }, "reported",
      [[431_034_481, 0], [68_965_519, 0], [315_789_473, 0], [84_210_527, 0]]],
  ] as const)("%s", async (_n, cause, selected, expected) => {
    const cards = await companionCards(cause);
    expect(cards.map((c) => [c.acquisitionPrice, c.necessaryExpense])).toEqual(expected);
    for (const c of cards) expect(c.transferPrice - c.acquisitionPrice - c.necessaryExpense).toBe(c.transferGain);

    // 정본 대조 — 같은 겸용주택을 단건으로 계산한 엔진 파트 값(§163⑨ 채택은 양도가액과 무관하다)
    const single = await run(form(cause, false));
    expect(singleParts(single)).toEqual(expected);
    if (selected) expect(single.result!.sec163_9Comparison?.selected).toBe(selected);
  });

  /**
   * ③(환산)은 양도가액으로 환산한다 — 함께 양도에서 안분된 겸용 양도가액(파트 카드 양도가액 합 960,000,000)으로 단건을 계산해 대조한다.
   * 계약 총액 10억 단건과는 입력이 달라 값이 다르다(표시 결함 아님 · 계획서 §1.2).
   */
  it("의제 전 1983 상속 — ③ 환산 채택(양도시 기준시가를 낮춤)", async () => {
    const cause = { ...PRE_DEEMED, ...LOW_TRANSFER_STD };
    const cards = await companionCards(cause);
    const expected = [[424_403_181, 7_758_620], [67_904_511, 1_241_379], [307_692_307, 5_625_000], [82_051_283, 1_500_000]];
    expect(cards.map((c) => [c.acquisitionPrice, c.necessaryExpense])).toEqual(expected);
    for (const c of cards) expect(c.transferPrice - c.acquisitionPrice - c.necessaryExpense).toBe(c.transferGain);
    const mixedTransfer = cards.reduce((s, c) => s + c.transferPrice, 0);
    expect(mixedTransfer).toBe(960_000_000);

    const single = await run(form(cause, false, String(mixedTransfer)));
    expect(single.result!.sec163_9Comparison?.selected).toBe("converted");
    expect(singleParts(single)).toEqual(expected);
  });
});
