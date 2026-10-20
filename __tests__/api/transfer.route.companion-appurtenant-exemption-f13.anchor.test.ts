/**
 * F-13 — 일괄양도에서 따로 입력한 **주택부수토지(배율 이내)**의 1세대1주택 비과세·12억 합산 판정 anchor.
 * 계획서: docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md.
 *
 * 「소득세법」 §89①3호: 비과세 대상 = 「각 목의 주택」 + 「주택부수토지(배율 이내)」 · 12억 판정 = 「주택 및 이에 딸린
 * 토지의 양도 당시 실지거래가액의 합계액」. 결정(2026-09-19): Q-1 (가) 단위로 묶어 합계액 판정 · Q-2 배율 초과분은 비과세
 * 제외 + 비사업용 토지 · Q-3 부수토지로서의 보유기간은 주택·토지 중 늦은 날부터(단일 입력 G-3과 같은 함수) · Q-4 부수토지도
 * 주택의 이월과세 ②2호 배제를 따른다.
 *
 * 기대값: 같은 거래를 **단일 주택(토지 포함 가액)**으로 입력한 결과와 같다(C1·C2). 세율은 프로덕션 fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const TD = "2026-02-16";
const rates = loadFallbackTransferRates(new Date(TD));

/** 1세대1주택 · 2014 취득 · 거주 5년 · 수도권 주거지역(배율 3배) · 정착면적 100㎡ → 한도 300㎡ */
const primary = (house: number, land: number, over: object = {}) => ({
  propertyType: "housing",
  transferPrice: house,
  transferDate: TD,
  acquisitionPrice: house / 2,
  acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  buildingFootprintArea: 100,
  isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential",
  totalSalePrice: house + land,
  standardPriceAtTransferForApportion: house / 1000,
  ...over,
});
const land = (price: number, over: object = {}) => ({
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: price / 2,
  standardPriceAtTransfer: price / 1000,
  directExpenses: 0,
  isOneHousehold: true,
  areaM2: 200,
  reductions: [],
  ...over,
});

type Prop = {
  propertyId: string;
  isExempt?: boolean;
  rateGroup: string;
  longTermHoldingDeduction?: number;
  carryoverTaxationDetail?: { adoptedScenario: string; exclusionReason?: string };
};
type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };

async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}
const byId = (a: Agg, id: string) => a.properties.find((p) => p.propertyId === id)!;

/** 같은 거래를 단일 주택(토지 포함 가액)으로 — 법령상 기대값의 기준 */
const single = (price: number) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: price,
      acquisitionPrice: price / 2,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date(TD),
      householdHousingCount: 1,
      isOneHousehold: true,
      residencePeriodMonths: 60,
    } as Partial<TransferTaxInput>),
    rates,
  ).totalTax;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

describe("F-13 주택 + 배율 이내 부수토지 = 1세대1주택 단위", () => {
  it("F13-1 합계 11억(≤12억) → 주택·부수토지 모두 비과세 0 = 단일 주택 입력 (종전 8,844,000)", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000)] });
    expect(byId(a, "c1").isExempt).toBe(true);
    expect(a.totalTax).toBe(0);
    expect(a.totalTax).toBe(single(1_100_000_000));
  });

  it("F13-2 합계 14억 → 합계액으로 12억 안분 4,801,500 = 단일 주택 입력 (종전 14,124,000)", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000)] });
    expect(a.totalTax).toBe(4_801_500);
    expect(a.totalTax).toBe(single(1_400_000_000));
  });

  it("F13-3 Q-2 배율 초과 분리 — 한도 내 카드는 비과세·표2 단위, 초과 카드는 비사업용 토지 · 12억 판정 합계는 초과분 포함 14억(#18)", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000, { areaM2: 500 })] });
    expect(byId(a, "c1__excess").rateGroup).toBe("non_business_land");
    expect(byId(a, "c1__appurtenant").rateGroup).not.toBe("non_business_land");
    // 🔁 S08-6 갱신: 7,254,500 → 15,996,200. 종전 값은 배율 초과 카드(비사업용 토지 — §104의3①5호)가 `{...base}` 복제로 세대 플래그를
    // 물려받아 표2 60%(공제 48,000,000)를 받은 값이었다. 표2는 「1세대 1주택(이에 딸린 토지 포함)에 해당하는 자산」 전용이고 배율 초과분은
    // 주택부수토지가 아니므로(재산세과-791) 표1 24%(공제 19,200,000)다 — 같은 사실의 단건 G-2 초과분과 같은 값이다.
    expect(byId(a, "c1__excess").longTermHoldingDeduction).toBe(19_200_000);
    // #18(G… S08-7) — 12억 판정·안분 분모의 합계액에 배율 초과분 가액을 넣는다(법문 괄호 «주택 및 이에 딸린 토지의 … 합계액»에 배율 한정이 없다).
    // 합계 12.4억 → 14억: 안분 비율 (12.4−12)/12.4 → (14−12)/14라 주택분 과세가 늘어 15,996,200 → 19,927,913.
    // 🔁 #17-2b 갱신: 19,927,913 → 18,796,485. 한도 내 카드의 과세 양도차익이 «자기 양도차익 × 안분 비율»에서 재산세제과-915 회신 방식
    // (전체 부수토지 안분값 − 초과분 양도차익, 음수면 0)으로 바뀌었다 — 단일 주택 입력과 같은 값(`dec17-2b-…-paths.anchor`).
    expect(a.totalTax).toBe(18_796_485);
  });

  it("F13-4 Q-3 부수토지를 주택보다 늦게 취득해 부수토지로서 2년 미만 → 그 토지는 비과세 아님", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000, { acquisitionDate: "2025-01-01" })] });
    expect(byId(a, "primary").isExempt).toBe(true);
    expect(byId(a, "c1").isExempt).toBe(false);
  });

  it("F13-5 배율 판정 불가(면적 없음) → 단위에 넣지 않고 안내 · 토지는 일반 과세", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000, { areaM2: undefined })] });
    expect(byId(a, "c1").isExempt).toBe(false);
    expect((a.warnings ?? []).some((w) => w.includes("배율 이내인지 판정하지 못했습니다"))).toBe(true);
  });

  it("F13-6 대조군: 1세대1주택이 아니면 단위와 무관하게 종전과 같다 154,286,000", async () => {
    const a = await post({
      ...primary(800_000_000, 300_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
      companionAssets: [land(300_000_000)],
    });
    expect(a.totalTax).toBe(154_286_000);

    // 면적이 없어도 1세대1주택이 아니면 비과세 판정 자체가 없으므로 「판정하지 못했다」 안내를 내지 않는다.
    const noArea = await post({
      ...primary(800_000_000, 300_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
      companionAssets: [land(300_000_000, { areaM2: undefined })],
    });
    expect(noArea.warnings ?? []).not.toContainEqual(expect.stringContaining("배율 이내인지"));
  });

  it("F13-7 Q-4 주택이 이월과세 ②2호로 배제되면 부수토지 카드도 배제(B)", async () => {
    const CO = (v: number) => ({
      giftRegistryDate: "2025-06-01",
      donorAcquisitionDate: "2000-06-01",
      donorAcquisitionPrice: 10_000_000,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: v,
      donorRelation: "spouse",
      exclusionDeclared: {},
    });
    const a = await post({
      ...primary(1_000_000_000, 400_000_000, {
        acquisitionCause: "carryover_gift",
        acquisitionDate: "2025-06-01",
        acquisitionPrice: 0,
        residencePeriodMonths: 0,
        carryoverTaxation: CO(1_000_000_000),
      }),
      companionAssets: [
        land(400_000_000, {
          acquisitionCause: "carryover_gift",
          acquisitionDate: "2025-06-01",
          fixedAcquisitionPrice: undefined,
          carryoverTaxation: CO(400_000_000),
        }),
      ],
    });
    expect(byId(a, "primary").carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
    const l = byId(a, "c1").carryoverTaxationDetail!;
    expect(l.exclusionReason).toBe("one_house_exemption");
    expect(l.adoptedScenario).toBe("B");
  });
});

describe("#18 12억 판정·안분 분모 — 배율 초과 부수토지 가액도 합계에 넣는다 (초과 토지는 계속 비과세 제외)", () => {
  it("F13-8 주택 8억 + 토지 6억(500㎡ — 한도 300㎡ 초과 200㎡) → 합계 14억이라 주택·한도 내 토지분이 부분과세 (수정 전 합 11.6억 → 비과세)", async () => {
    const a = await post({ ...primary(800_000_000, 600_000_000), companionAssets: [land(600_000_000, { areaM2: 500 })] });
    expect(byId(a, "primary").isExempt).toBe(false);
    expect(byId(a, "c1__appurtenant").isExempt).toBe(false);
    expect(byId(a, "c1__excess").rateGroup).toBe("non_business_land");
    expect(a.totalTax).toBe(29_307_928); // 🔁 #17-2b 갱신: 31,005,069 → 29,307,927 (회신 방식 — F13-3과 같은 사유) · `applyRate` 소수 세율 정확화로 +1원
  });

  it("F13-9 긍정 짝 — 초과분을 넣어도 합계가 12억 이하면(주택 6억 + 토지 4억 500㎡) 주택·한도 내 토지는 비과세 그대로", async () => {
    const a = await post({ ...primary(600_000_000, 400_000_000), companionAssets: [land(400_000_000, { areaM2: 500 })] });
    expect(byId(a, "primary").isExempt).toBe(true);
    expect(byId(a, "c1__appurtenant").isExempt).toBe(true);
    expect(byId(a, "c1__excess").rateGroup).toBe("non_business_land");
  });

  it("F13-10 면적 없는 부수토지 선언 카드도 12억 합계에 든다(비과세는 계속 제외) — 주택 8억 + 토지 6억(면적 없음) → 주택 부분과세", async () => {
    const a = await post({ ...primary(800_000_000, 600_000_000), companionAssets: [land(600_000_000, { areaM2: undefined })] });
    expect(byId(a, "primary").isExempt).toBe(false);
    expect(byId(a, "c1").isExempt).toBe(false);
    expect((a.warnings ?? []).some((w) => w.includes("고가주택(12억 초과) 판정에는 그 토지 가액을 합산"))).toBe(true);
    expect(a.totalTax).toBe(81_879_285);
  });
});

/**
 * 사례 28 역방향(F3 후속) — 주택부수토지를 주 자산(첫 자산)으로, 주택을 함께 양도 자산으로 넣은 구성.
 * G1(2026-10-13)부터 route가 짝 주택(함께 양도 일반 주택 1건 · 정착면적 있음)을 정하면 주택 먼저 순서와 같이 계산한다
 * (`transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts`). 아래 시료는 주택 카드에 **정착면적이 없어** 짝 주택을 정하지 못한 구성 —
 * 단위·배율 분리 없이 종전대로 계산하고 알린다(주택 먼저 순서도 정착면적이 없으면 단위를 만들지 않는다).
 */
describe("사례 28 역방향 — 짝 주택을 정하지 못하면 판정 생략을 알린다", () => {
  const reversePrimary = (landPrice: number, housePrice: number, over: object = {}) => ({
    ...primary(landPrice, housePrice),
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    buildingFootprintArea: undefined,
    standardPriceAtTransferForApportion: landPrice / 1000,
    ...over,
  });
  const house = (price: number, over: object = {}) => ({
    assetId: "h1",
    assetLabel: "주택",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: price / 2,
    standardPriceAtTransfer: price / 1000,
    directExpenses: 0,
    isOneHousehold: true,
    reductions: [],
    ...over,
  });
  const NOTICE = "짝 주택을 정하지 못해";

  it("F13-11 역방향(1세대1주택) · 주택 정착면적 없음 — 판정 생략 안내", async () => {
    const a = await post({ ...reversePrimary(300_000_000, 800_000_000), companionAssets: [house(800_000_000)] });
    // 짝 주택을 정하지 못해 토지를 따로 과세한다(실측 25,943,500). 정착면적이 있으면 0이다(G1 anchor).
    expect(a.totalTax).toBe(25_943_500);
    expect((a.warnings ?? []).some((w) => w.includes(NOTICE))).toBe(true);
  });
  it("F13-12 역방향(1세대1주택 아님) · 주택 정착면적 없음 — 배율 이내·초과 구분도 하지 않으므로 같은 안내", async () => {
    const a = await post({
      ...reversePrimary(300_000_000, 800_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
      companionAssets: [house(800_000_000, { isOneHousehold: false })],
    });
    expect((a.warnings ?? []).some((w) => w.includes(NOTICE))).toBe(true);
  });
  it("F13-13 대조군 — 주 자산 토지가 독립 토지이거나, 주택이 첫 자산(K1 순서)이면 안내하지 않는다", async () => {
    const standalone = await post({
      ...reversePrimary(300_000_000, 800_000_000, { landNature: "non_appurtenant" }),
      companionAssets: [house(800_000_000)],
    });
    expect(standalone.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
    const forward = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000)] });
    expect(forward.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
    // K1 순서에서 면적이 없어 역할을 못 받은 부수토지 카드는 F13-5 안내 대상이다 — 역방향 안내가 겹치지 않는다
    const forwardNoArea = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000, { areaM2: undefined })] });
    expect(forwardNoArea.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
    const noHouse = await post({ ...reversePrimary(300_000_000, 300_000_000), companionAssets: [land(300_000_000)] });
    expect(noHouse.warnings ?? []).not.toContainEqual(expect.stringContaining(NOTICE));
  });
});
