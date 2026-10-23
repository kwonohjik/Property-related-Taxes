/**
 * PR-7b-6a — 의제취득일(1985.1.1.) 전 상속 일반건물 × 부담부증여 × **시가 평가** — 파트별 3자 max (사용자 결정 Q-28).
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-6.
 *
 * 6a(엔진·route·⑫)에서 만든 anchor다 — 화면 폼으로 만든 body에 ①②를 **직접 넣어** route ⑫⑭ → 엔진을 고정한다. PR-7b-6b부터 ④가 파트 ①②를
 * 스스로 싣는다(이 폼은 ① 칸이 비어 ① 0) — 「한 파트만」 시료는 다른 파트의 ①②를 걷어 낸다. 화면 경로 anchor는 `...-gb-market-ui.routes.anchor.test.ts`.
 *
 * 시료: 1983-07-26 상속 · 2023-02-16 부담부증여 · 시가 10억 · 채무 5억(β 0.5) · 토지 100㎡ · 양도시 토지 2,000,000/㎡ · 건물 2억 ·
 * 취득시(의제취득일) 토지 300,000/㎡ · 건물 3천만. 파트 증여가액 5억씩 → ③ = 5억 × 3천만/2억 = 7,500만씩. 세율은 mock.
 */
import { describe, expect, it, vi } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { BG_PART_METHOD_REQUIRED_MESSAGE } from "@/lib/tax-engine/burdened-gift-part-pre-deemed";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const GB: Loose = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "general_building",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  useEstimatedAcquisition: false,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "300,000",
  gbAcqBuildingValue: "30,000,000",
  gbZoneType: "general_residential",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgMortgageDebtAmount: "500000000",
  bgLendingDepositTotal: "0",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgAcquisitionMethod: "converted",
  preDeemedClauseAUnconfirmed: true,
};

const form = (over: Loose = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...GB, ...over } as AssetForm],
  }) as TransferFormData;

type Pair = [reported: number, sec164: number];
/** ④가 PR-7b-6b부터 실을 파트 ①② — 지분이면 지분 몫(`transfer-tax-api-gb-shares.ts`와 같은 규약) */
const inject = (gbv: Loose, land?: Pair, building?: Pair, r = 1) => {
  if (land) gbv.landPreDeemedClauseA = { reported: land[0] * r, sec164: land[1] * r };
  if (building) gbv.buildingPreDeemedClauseA = { reported: building[0] * r, sec164: building[1] * r };
};
const SAMPLE_LAND: Pair = [600_000_000, 30_000_000];
const SAMPLE_BUILDING: Pair = [10_000_000, 30_000_000];

async function run(over: Loose, mut?: (b: Loose) => void) {
  const body = (await captureBody(form(over))) as Loose;
  mut?.(body);
  const r = await postTransfer(body);
  const data = r.json?.data;
  const bg = data?.transferBurdenedGiftBreakdown;
  return {
    status: r.status,
    error: r.json?.error,
    tax: data?.aggregated?.determinedTax,
    bg,
    acq: bg ? [bg.perAsset.land.acquisitionPrice, bg.perAsset.building.acquisitionPrice] : undefined,
  };
}
const both = (land: Pair, building: Pair, dropMethod = true) => (b: Loose) => {
  inject(b.generalBuildingValuation, land, building);
  if (dropMethod) delete b.burdenedGiftInfo.acquisitionMethod;
};

describe("PR-7b-6a 일반건물 × 의제취득일 전 × 부담부증여 · 시가 평가 — 파트별 3자 max", () => {
  it("R-0 ① 칸이 빈 폼 그대로 — ④가 ① 0으로 싣고 두 파트 ③(7,500만씩) → 종전 환산과 같은 91,920,600", async () => {
    const r = await run({});
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([37_500_000, 37_500_000]);
    expect(r.tax).toBe(91_920_600);
  });

  it("R-1 계획서 시료 — 토지 ① 6억 · 건물 ③ 7,500만 → 취득가액 3억 + 3,750만 · 산정방식 없이 200(두 파트 다 의제취득일 전)", async () => {
    const r = await run({}, both(SAMPLE_LAND, SAMPLE_BUILDING));
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([300_000_000, 37_500_000]);
    expect(r.bg.preDeemed.basis).toBe("three_way_parts");
    expect([r.bg.preDeemed.parts.land.selected, r.bg.preDeemed.parts.building.selected]).toEqual(["reported", "converted"]);
    expect(r.tax).toBe(18_137_250);
  });

  it("R-2 두 파트 모두 ③ — 종전 환산과 같다(91,920,600)", async () => {
    const r = await run({}, both([0, 30_000_000], [0, 30_000_000]));
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([37_500_000, 37_500_000]);
    expect(r.tax).toBe(91_920_600);
  });

  it("R-3 한 파트만 의제취득일 전 · 산정방식 없음 → ⑫ 400(다른 파트가 쓸 방식이 없다)", async () => {
    const r = await run({}, (b) => {
      inject(b.generalBuildingValuation, SAMPLE_LAND);
      delete b.generalBuildingValuation.buildingPreDeemedClauseA;
      delete b.burdenedGiftInfo.acquisitionMethod;
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("burdenedGiftInfo.acquisitionMethod");
  });

  it.each(["appraisal", "salesCase"])("R-3a 두 파트 다 의제취득일 전 · 화면에 남은 산정방식 %s(금액 없음) — ⑫가 쓰이지 않을 금액을 요구하지 않는다(리뷰 D-1b)", async (method) => {
    const r = await run({}, (b) => {
      both(SAMPLE_LAND, SAMPLE_BUILDING, false)(b);
      b.burdenedGiftInfo.acquisitionMethod = method;
    });
    expect(r.status).toBe(200);
    expect(r.tax).toBe(18_137_250);
  });

  it("R-3b 면제는 일반건물만 — 다른 자산 body에 파트 ①②를 실어도 산정방식을 요구한다", async () => {
    const r = await run({}, (b) => {
      both(SAMPLE_LAND, SAMPLE_BUILDING)(b);
      b.propertyType = "building";
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("burdenedGiftInfo.acquisitionMethod");
  });

  it("R-4 한 파트만 의제취득일 전 · 다른 파트는 고른 환산 — 토지 ①, 건물 K-5", async () => {
    const r = await run({}, (b) => {
      inject(b.generalBuildingValuation, SAMPLE_LAND);
      delete b.generalBuildingValuation.buildingPreDeemedClauseA;
      b.burdenedGiftInfo.acquisitionMethod = "converted"; // ④는 두 파트 다 의제면 방식을 싣지 않는다 — 건물 파트가 쓸 방식을 되돌린다
    });
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([300_000_000, 37_500_000]);
    expect(r.bg.preDeemed.parts).toEqual({ land: expect.objectContaining({ selected: "reported" }) });
    expect(r.tax).toBe(18_137_250);
  });

  it("R-5 실비 단서 — 건물(환산)만 실비 몫 1억과 겨뤄 나목 채택 · 토지(①)는 실비 몫 1억", async () => {
    const r = await run({}, (b) => {
      both(SAMPLE_LAND, SAMPLE_BUILDING)(b);
      b.generalBuildingValuation.capitalExpenditure = 400_000_000;
    });
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([300_000_000, 0]);
    expect([r.bg.perAsset.land.estimatedDeduction, r.bg.perAsset.building.estimatedDeduction]).toEqual([100_000_000, 100_000_000]);
    expect(r.bg.necessaryExpenseSwap).toEqual({ estimatedSide: 37_950_000, directSide: 100_000_000, chosen: "direct" });
  });

  it.each([
    ["기준시가 평가", { bgValuationMode: "sangjeungbeop_standard", preDeemedClauseAUnconfirmed: undefined }],
    ["시가 평가 · 담보 승", { bgMarketValueAtTransfer: "400000000" }],
  ])("R-6 %s — 파트 ①②를 실어도 쓰지 않는다(의제취득일 기준시가 × 채무비율 · 95,756,000)", async (_l, over) => {
    const r = await run(over, both(SAMPLE_LAND, SAMPLE_BUILDING));
    expect(r.status).toBe(200);
    expect(r.bg.acquisitionMethodUsed).toBe("standard_price");
    expect(r.bg.preDeemed).toBeUndefined();
    expect(r.tax).toBe(95_756_000);
  });

  it("R-7 축 B 60/40 지분 — 지분 몫 ①②(④ 규약)면 단건과 같은 세액", async () => {
    const share = (id: number, n: string) =>
      ({ ...makeDefaultAsset(id), ...GB, ownershipNumerator: n, ownershipDenominator: "100" }) as unknown as AssetForm;
    const f = Object.assign(form(), { assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional" }) as TransferFormData;
    const body = (await captureBody(f)) as Loose;
    const before = await postTransfer(structuredClone(body));
    expect(before.json?.data?.aggregated?.determinedTax).toBe(91_920_600);
    (body.generalBuildingShares as Loose[]).forEach((s, i) => {
      inject(s.valuation, SAMPLE_LAND, SAMPLE_BUILDING, i === 0 ? 0.6 : 0.4);
      delete s.burdenedGiftInfo.acquisitionMethod;
    });
    inject(body.generalBuildingValuation, SAMPLE_LAND, SAMPLE_BUILDING, 0.6);
    delete body.burdenedGiftInfo.acquisitionMethod;
    const r = await postTransfer(body);
    expect(r.status).toBe(200);
    expect(r.json?.data?.aggregated?.determinedTax).toBe(18_137_250);
  });

  const companionBody = async () => {
    const land = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      acquisitionArea: "100",
      transferArea: "100",
      landNature: "standalone",
      standardPriceAtAcq: "100,000,000",
      standardPriceAtTransfer: "200,000,000",
      transferType: "burdened_gift",
      bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "0",
      bgMortgageDebtAmount: "100000000",
      bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "200000000",
      bgAcquisitionMethod: "converted",
    } as unknown as AssetForm;
    const f = Object.assign(form(), { assets: [land, { ...makeDefaultAsset(2), ...GB } as AssetForm] }) as TransferFormData;
    const body = (await captureBody(f)) as Loose;
    return { body, card: (body.companionAssets as Loose[]).find((x) => x.assetKind === "general_building")! };
  };

  it("R-8 함께 양도 카드 일반건물 — 카드 경로도 같은 §159를 탄다(106,164,000 → 30,698,750)", async () => {
    const { body, card: c } = await companionBody();
    const before = await postTransfer(structuredClone(body));
    expect(before.json?.data?.aggregated?.determinedTax).toBe(106_164_000);
    inject(c.generalBuildingValuation, SAMPLE_LAND, SAMPLE_BUILDING);
    delete c.burdenedGiftInfo.acquisitionMethod;
    const r = await postTransfer(body);
    expect(r.status).toBe(200);
    expect(r.json?.data?.aggregated?.determinedTax).toBe(30_698_750);
  });

  it("R-9 함께 양도 카드 · 한 파트만 의제취득일 전 · 산정방식 없음 — 컴패니언 ⑫에는 이 검사가 없어 엔진이 막는다(취득가액 0 방지)", async () => {
    const { body, card } = await companionBody();
    inject(card.generalBuildingValuation, SAMPLE_LAND);
    delete card.generalBuildingValuation.buildingPreDeemedClauseA;
    delete card.burdenedGiftInfo.acquisitionMethod;
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json?.error)).toContain(BG_PART_METHOD_REQUIRED_MESSAGE.slice("[burdened_gift] ".length, 60));
  });
});
