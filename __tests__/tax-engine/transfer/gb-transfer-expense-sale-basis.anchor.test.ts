/**
 * anchor — 일반건물 양도비 토지·건물 배분 기준 = **각 파트에 적용된 자산가액** (실가·감정 → 그 가액 / 환산·기준시가 안분 → 기준시가)
 *
 * 계획서: `docs/00-pm/gb-transfer-expense-apportion-basis.plan.md` (E-1~E-13 · D-1 · D-2)
 *
 * ## 사용자 규칙 (2026-10-22)
 * 「양도비는 자산가액으로 배분한다 — 자산가액이 실가나 감정가액이면 그 가액으로, 환산가액이면 기준시가로.」
 * 종전 일반건물(실가·증축)은 양도가액을 구분 기재·감정으로 나눈 경우에도 양도비를 **양도시 기준시가**로 나눠
 * 양도가액과 양도비가 서로 다른 비율이 됐다. split·PHD·겸용·컴패니언 묶음은 이미 적용 양도가액 비례였다.
 *
 * ## 이빨
 * 세액까지 단언한다(E-6) — 파트 배분만 바뀌고 세액이 안 움직이는 결함은 카드 단언만으로는 잡히지 않는다.
 * 기준시가 안분(기본) 경로는 현행과 **값이 같아야** 한다(E-3 · E-12 회귀 가드).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildActualGeneralBuildingCards } from "@/app/api/calc/transfer/general-building-route-actual";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { cForm, bodyOf, routeOf, issuesOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const gb = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase",
    acquisitionDate: "2005-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "85", gbBuildingArea: "180.96", gbBuildingFootprintArea: "90.48", gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000", gbTransferBuildingValue: "300000000",
    gbAcqLandPricePerSqm: "1500000", gbAcqBuildingValue: "28144700",
    landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100", ownershipDenominator: "100",
    ...over,
  }) as any;

/** 양도 안분 방식 4종 — 총 양도가 20억 · 양도시 토지 920,550,000 : 건물 300,000,000 */
const SALE = {
  A_declared_70_30: { saleSplitMode: "actual", landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000" },
  B_appraisal_55_45: { saleSplitMode: "apportioned", landAppraisalAtTransfer: "1,100,000,000", buildingAppraisalAtTransfer: "900,000,000" },
  C_none_std: { saleSplitMode: "apportioned" },
  D_declared_deemed: { saleSplitMode: "actual", landTransferPrice: "1,000,000,000", buildingTransferPrice: "1,000,000,000" },
  E_declared_land_only: { saleSplitMode: "actual", landTransferPrice: "1,400,000,000" },
} as const;

/** 취득 상황 — 동일 취득일(세액 불변 확인용) / 토지 1999·건물 2022(세율·공제 속성 상이 → 세액이 움직인다) */
const ACQ = {
  same: {
    acquisitionDate: "2005-03-01", landAcquisitionDate: "2005-03-01", hasSeperateLandAcquisitionDate: false,
    fixedAcquisitionPrice: "700,000,000", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
  },
  diff: {
    acquisitionDate: "2022-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true,
    fixedAcquisitionPrice: "", landAcquisitionPrice: "150,000,000", buildingAcquisitionPrice: "550,000,000",
  },
} as const;

async function run(sale: keyof typeof SALE, acq: keyof typeof ACQ, exp: Record<string, string>, extra: Record<string, unknown> = {}) {
  const asset = gb({ ...SALE[sale], ...ACQ[acq], ...exp, ...extra });
  const form = cForm({ transferDate: "2025-06-30", filingDate: "2025-08-31", contractTotalPrice: "2000000000" } as never, asset);
  expect(issuesOf(form), "⑧ validate가 막으면 안 된다").toEqual([]);
  const r = await routeOf(POST as never, await bodyOf(form));
  expect(r.status, JSON.stringify(r.json?.error ?? "").slice(0, 200)).toBe(200);
  const d = r.json.data;
  const gbd = d.aggregated.generalBuildingValuationDetail;
  const cards = gbd.assetCards as Array<{ propertyId: string; transferPrice: number; acquisitionPrice: number; expenses: number }>;
  // 토지는 NBL 2분할(land_business + land_nbl)일 수 있어 «land»로 시작하는 카드를 합산한다.
  const land = cards.filter((c) => c.propertyId.startsWith("land")).reduce((sum, c) => sum + c.expenses, 0);
  const building = cards.find((c) => c.propertyId === "building")!.expenses;
  return { tax: d.aggregated.determinedTax as number, land, building, gbd, cards };
}

describe("E-1~E-5 — 양도비는 각 파트에 적용된 양도가액 비례 (동일 취득일, 양도비 5,000,000)", () => {
  const TE = { transferExpense: "5,000,000" };

  it("E-1 구분 기재 14억/6억(70:30) → 토지 3,500,000 · 건물 1,500,000", async () => {
    const r = await run("A_declared_70_30", "same", TE);
    expect([r.land, r.building]).toEqual([3_500_000, 1_500_000]);
  });
  it("E-2 감정평가 11억/9억(55:45) → 토지 2,750,000 · 건물 2,250,000", async () => {
    const r = await run("B_appraisal_55_45", "same", TE);
    expect([r.land, r.building]).toEqual([2_750_000, 2_250_000]);
  });
  it("E-3 기준시가 안분(구분·감정 없음) → 현행 불변 3,771,045 · 1,228,955 (회귀 가드)", async () => {
    const r = await run("C_none_std", "same", TE);
    expect([r.land, r.building]).toEqual([3_771_045, 1_228_955]);
  });
  it("E-4 구분 기재 5:5 → §100③ 30% 의제로 안분값 복귀 → E-3과 같다 (적용값 추종)", async () => {
    const r = await run("D_declared_deemed", "same", TE);
    expect([r.land, r.building]).toEqual([3_771_045, 1_228_955]);
  });
  it("E-5 구분 기재 한쪽만(토지 14억) → 건물은 총액에서 도출(6억) → E-1과 같다", async () => {
    const r = await run("E_declared_land_only", "same", TE);
    expect([r.land, r.building]).toEqual([3_500_000, 1_500_000]);
  });
  it("동일 취득일이면 세액은 배분 기준과 무관하다 (343,740,000 불변) — 파트 배분만 이동", async () => {
    const taxes = await Promise.all(
      (["A_declared_70_30", "B_appraisal_55_45", "C_none_std"] as const).map(async (s) => (await run(s, "same", TE)).tax),
    );
    expect(taxes).toEqual([343_740_000, 343_740_000, 343_740_000]);
  });
});

describe("E-6 — 🔑 세액이 실제로 달라진다 (취득일 상이: 토지 1999 · 건물 2022)", () => {
  const TE = { transferExpense: "5,000,000" };
  // 수정 전: A 348,656,121 · B 378,896,121 (양도비를 양도시 기준시가로 나눠 건물 필요경비가 과소·토지가 과대)
  it("A 구분 기재 70:30 → 348,628,800", async () => {
    expect((await run("A_declared_70_30", "diff", TE)).tax).toBe(348_628_800);
  });
  it("B 감정 55:45 → 378,793,200", async () => {
    expect((await run("B_appraisal_55_45", "diff", TE)).tax).toBe(378_793_200);
  });
  it("C 기준시가 안분 → 현행 불변 336,224,441", async () => {
    expect((await run("C_none_std", "diff", TE)).tax).toBe(336_224_441);
  });
  it("양도비 50,000,000 · 건물 취득 2024-08-01(단기): A 337,520,000 · B 397,775,000 (수정 전 338,078,354 · 399,878,354)", async () => {
    const over = { acquisitionDate: "2024-08-01" };
    const a = await run("A_declared_70_30", "diff", { transferExpense: "50,000,000" }, over);
    const b = await run("B_appraisal_55_45", "diff", { transferExpense: "50,000,000" }, over);
    expect([a.tax, b.tax]).toEqual([337_520_000, 397_775_000]);
  });
});

describe("E-7 — 자본적지출·legacy는 현행 basis 유지 (Q-3·Q-4)", () => {
  it("자본적지출 5,000,000 → 구분 기재·감정이어도 취득시 기준시가 4,095,867 · 904,133", async () => {
    for (const s of ["A_declared_70_30", "B_appraisal_55_45", "C_none_std"] as const) {
      const r = await run(s, "same", { capitalExpenditure: "5,000,000" });
      expect([r.land, r.building], s).toEqual([4_095_867, 904_133]);
    }
  });
  it("legacy directExpenses 5,000,000 → 구분 기재·감정이어도 양도시 기준시가 3,771,045 · 1,228,955", async () => {
    for (const s of ["A_declared_70_30", "B_appraisal_55_45", "C_none_std"] as const) {
      const r = await run(s, "same", { directExpenses: "5,000,000" });
      expect([r.land, r.building], s).toEqual([3_771_045, 1_228_955]);
    }
  });
  it("자본적지출 + 양도비 동시 → 각자 basis 합산 (구분 기재 70:30)", async () => {
    const r = await run("A_declared_70_30", "same", { capitalExpenditure: "5,000,000", transferExpense: "5,000,000" });
    expect([r.land, r.building]).toEqual([4_095_867 + 3_500_000, 904_133 + 1_500_000]);
  });
});

describe("E-9 — NBL 2분할(배율 초과)에서도 합계 보존", () => {
  it("구분 기재 70:30 · 양도비 5,000,000 → 토지 카드(사업용+비사업용) 합 3,500,000 · 건물 1,500,000", async () => {
    const r = await run("A_declared_70_30", "same", { transferExpense: "5,000,000" }, { gbBuildingFootprintArea: "20" });
    const ids = r.cards.map((c) => c.propertyId);
    expect(ids).toContain("land_business");
    expect(ids).toContain("land_nbl");
    const landSum = r.cards.filter((c) => c.propertyId.startsWith("land")).reduce((s, c) => s + c.expenses, 0);
    expect(landSum).toBe(3_500_000);
    expect(r.cards.find((c) => c.propertyId === "building")!.expenses).toBe(1_500_000);
    expect(r.cards.reduce((s, c) => s + c.expenses, 0)).toBe(5_000_000);
  });
});

describe("E-10 — 증축 경로(G2): 원건물 실가 · 양도비 50,000,000", () => {
  const rates = makeMockRates();
  function ext(over: Record<string, unknown>) {
    const a = {
      ...makeDefaultAsset(1), assetKind: "general_building", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300,000,000",
      acquisitionDate: "1999-05-24", gbLandArea: "85", gbBuildingArea: "180.96", gbBuildingFootprintArea: "90.48",
      gbTransferLandPricePerSqm: "10830000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "2800000", gbAcqBuildingValue: "28144700",
      gbBuildingAcquisitionCause: "purchase", gbZoneType: "commercial", gbIsMetropolitan: true, gbHasExtension: true, gbExtensionDate: "2015-06-01",
      gbExtensionAcquisitionCause: "newConstruction", gbExtensionAcquisitionMode: "estimated",
      gbTransferExtensionBuildingStdPrice: "20000000", gbAcquisitionExtensionBuildingStdPrice: "6000000",
      transferExpense: "50,000,000", ...over,
    } as any;
    const gbv = buildGeneralBuildingValuation(a) as Record<string, unknown>;
    const r: any = dispatchGeneralBuilding(
      gbv, 2_000_000_000, new Date("2024-03-01"), new Date("1999-05-24"),
      (gbv.bundledAcquisitionPrice as number | undefined) ?? 0, (gbv.bundledExpenses as number) ?? 0,
      2024, 0, [], rates, undefined, {}, undefined,
    );
    // 최종 엔진 입력 필요경비 — 양도비는 2026-10-22 E-1부터 swap 파트 축 가산(§97②1호)으로 실린다(카드 명세가 아니라 properties).
    const props = r.aggregated.properties as Array<{ propertyId: string; necessaryExpense: number }>;
    const e = (id: string) => props.find((c) => c.propertyId === id)!.necessaryExpense;
    return { nature: gbv.bundledExpenseNature, land: e("land"), b1: e("building1"), b2: e("building2"), tax: r.aggregated.determinedTax as number };
  }

  /*
   * 2026-10-22 E-1 — 양도비는 일괄 슬롯(성질 `transfer`)이 아니라 swap 파트 축 가산(§97②1호)으로 간다.
   * 토지 몫 = 양도비 × 토지 양도가액 ÷ **총** 양도가액(증축분 포함 — §100② 후문 「해당 자산의 가액」). 증축분이 환산이라
   * 그 몫은 원건물이 받는다(Q-8 a — 환산 카드에 1호 가산을 섞지 않는다). 종전 배분은 토지 : 원건물만 분모였다. 세액은 같다.
   */
  it("기준시가 안분 → 토지 37,102,494 · 원건물 12,897,506 (건물2는 개산공제 180,000만) · 세액 불변", () => {
    const r = ext({});
    expect(r.nature).toBe("mixed");
    expect([r.land, r.b1, r.b2]).toEqual([37_102_494, 12_897_506, 180_000]);
    expect(r.tax).toBe(450_991_875);
  });
  it("구분 기재 14억/6억 → 토지 35,000,000(= 5천만 × 14/20) · 원건물 15,000,000", () => {
    const r = ext({ saleSplitMode: "actual", landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000" });
    expect([r.land, r.b1]).toEqual([35_000_000, 15_000_000]);
    expect(r.tax).toBe(450_726_960);
  });
  it("구분 기재 16억/4억 → 토지 40,000,000 · 원건물 10,000,000", () => {
    const r = ext({ saleSplitMode: "actual", landTransferPrice: "1,600,000,000", buildingTransferPrice: "400,000,000" });
    expect([r.land, r.b1]).toEqual([40_000_000, 10_000_000]);
    expect(r.tax).toBe(451_356_960);
  });
});

describe("E-11~E-12 — 엔진 직접: 지분 카드 합 보존 · 소수 비율 곱 1원 과소", () => {
  const BASE = {
    totalTransferPrice: 1_000_000_000,
    transferDate: new Date("2025-06-30"),
    acquisitionDate: new Date("2015-01-01"),
    landArea: 100,
    buildingFootprintArea: 100,
    transferLandPricePerSqm: 153_000, // 토지 15,300,000
    transferBuildingStdPrice: 77_500_000,
    zoneType: "commercial",
    actualAcquisitionPrice: 0,
    actualExpenses: 0,
  };
  const expOf = (cards: Array<{ propertyId: string; expenses: number }>, id: string) =>
    cards.find((c) => c.propertyId === id)!.expenses;

  it("E-12 🔴 양도비 91,640,000 × 토지 15,300,000 / (토지+건물 92,800,000) = 15,108,750 (부동소수 15,108,749)", () => {
    const { cards } = buildActualGeneralBuildingCards({ ...BASE, transferExpense: 91_640_000 } as never);
    expect(expOf(cards, "land")).toBe(15_108_750);
    expect(expOf(cards, "building")).toBe(91_640_000 - 15_108_750);
  });
  it("E-12b 같은 시료의 legacy directExpenses(양도시 기준시가 유지)도 정수 안분", () => {
    const { cards } = buildActualGeneralBuildingCards({ ...BASE, actualExpenses: 91_640_000 } as never);
    expect(expOf(cards, "land")).toBe(15_108_750);
  });
  it("E-12c 자본적지출 91,640,000 × 취득시 토지 15,300,000 / (취득시 합 92,800,000) = 15,108,750", () => {
    const { cards } = buildActualGeneralBuildingCards({
      ...BASE, capitalExpenditure: 91_640_000, acquisitionLandPricePerSqm: 153_000, acquisitionBuildingStdPrice: 77_500_000,
    } as never);
    expect(expOf(cards, "land")).toBe(15_108_750);
  });
  it("E-12d 일괄 취득가액 안분 91,640,000도 같은 헬퍼 (취득시 기준시가 비율)", () => {
    const { cards } = buildActualGeneralBuildingCards({
      ...BASE, actualAcquisitionPrice: 91_640_000, acquisitionLandPricePerSqm: 153_000, acquisitionBuildingStdPrice: 77_500_000,
    } as never);
    expect(cards.find((c) => c.propertyId === "land")!.acquisitionPrice).toBe(15_108_750);
  });
  it("E-11 지분 카드(G6): 지분별 호출마다 Σ 카드 필요경비 = 그 지분 양도비 (구분 기재 20:80 — §100③ 30% 미만이라 채택)", () => {
    const sale = { landTransferPrice: 200_000_000, buildingTransferPrice: 800_000_000, transferDate: new Date("2025-06-30") };
    const half = { ...BASE, ...sale, totalTransferPrice: 1_000_000_000 };
    const a = buildActualGeneralBuildingCards({ ...half, transferExpense: 3_333_333 } as never);
    const b = buildActualGeneralBuildingCards({ ...half, totalTransferPrice: 1_000_000_000, transferExpense: 1_666_667 } as never);
    expect(a.cards.reduce((s, c) => s + c.expenses, 0)).toBe(3_333_333);
    expect(b.cards.reduce((s, c) => s + c.expenses, 0)).toBe(1_666_667);
    expect(expOf(a.cards, "land")).toBe(666_666); // floor(3,333,333 × 2 / 10) — 수정 전은 양도시 기준시가 16.5% = 549,568
  });
});

/**
 * Q-6 (b) — 같은 모양(`applyRate(금액, a / b)`)이 swap·split에도 있었다. 아래 시료는 부동소수 비율이 참값 정수에서 1원 모자라는 값이다
 * (200만 건 탐색으로 찾음 — 방향은 항상 과소). PHD 경로(`phd.transfer`·`phd.capex`)는 같은 파일의 정적 가드(`estimated-acq-float-policy`)가 지킨다.
 */
describe("E-12e~g — swap·split 소수 비율 곱 1원 과소", () => {
  const estCard = (id: string, basis: number) =>
    ({ propertyId: id, propertyType: id === "land" ? "land" : "general_building_unit", usedEstimatedAcquisition: true, acquisitionPrice: basis, expenses: 0, transferPrice: 0 }) as never;

  it("E-12e swap 자산총액: 양도비 97,990,000 × 카드1 38,391,000 / (38,391,000+21,359,000) = 62,961,240 (부동소수 62,961,239)", () => {
    const d = resolveGeneralBuildingSwap([estCard("land", 38_391_000), estCard("building", 21_359_000)], undefined, 97_990_000);
    expect(d.swapApplied).toBe(true);
    expect(d.allocation.get("land")).toBe(62_961_240);
    expect(d.allocation.get("building")).toBe(97_990_000 - 62_961_240);
  });
  it("E-12f swap 파트 축: 양도비 6,090,000 × 토지 양도가액 266,000,000 / (266,000,000+714,000,000) = 1,653,000 (부동소수 1,652,999)", () => {
    const card = (id: string, transferPrice: number) =>
      ({ propertyId: id, propertyType: id === "land" ? "land" : "general_building_unit", usedEstimatedAcquisition: false, acquisitionPrice: 0, expenses: 0, transferPrice }) as never;
    const d = resolveGeneralBuildingSwap(
      [card("land", 266_000_000), card("building", 714_000_000)], undefined, undefined,
      { land: { direct: 0, mode: "actual" }, building: { direct: 0, mode: "actual" }, transferExpense: 6_090_000 },
    );
    expect(d.perPart!.land!.directSide).toBe(1_653_000);
    expect(d.perPart!.building!.directSide).toBe(6_090_000 - 1_653_000);
  });
  it("E-12g split(비-PHD): 양도비 6,090,000 → 토지 파트 1,653,000 (부동소수 1,652,999) · Σ = 양도비", () => {
    const r = calculateTransferTax(
      {
        ...baseTransferInput(),
        propertyType: "building",
        transferDate: new Date("2026-06-01"),
        acquisitionDate: new Date("2015-03-01"),
        landAcquisitionDate: new Date("2012-01-01"),
        isSeparateAcquisition: true,
        transferPrice: 980_000_000,
        acquisitionPrice: 1_000_000_000,
        landTransferPrice: 266_000_000,
        buildingTransferPrice: 714_000_000,
        landStandardPriceAtTransfer: 266_000_000,
        buildingStandardPriceAtTransfer: 714_000_000,
        landAcquisitionPrice: 600_000_000,
        buildingAcquisitionPrice: 400_000_000,
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        isOneHousehold: false,
        householdHousingCount: 0,
        transferExpense: 6_090_000,
      } as never,
      makeMockRates(),
    );
    expect(r.splitDetail!.land.directExpenses).toBe(1_653_000);
    expect(r.splitDetail!.land.directExpenses + r.splitDetail!.building.directExpenses).toBe(6_090_000);
  });
});

describe("E-12h — PHD(개별주택가격 미공시) 경로: 자본적지출·양도비 안분 1원 과소", () => {
  it("자산 단위 자본적지출(expenses) 6,090,000 + 양도비 6,090,000 → 토지 3,306,000 = 1,653,000 × 2 (옛 식 1,652,999 × 2 = 3,305,998)", () => {
    const r = calculateTransferTax(
      {
        ...baseTransferInput(),
        propertyType: "housing",
        transferPrice: 980_000_000,
        transferDate: new Date("2023-02-16"),
        acquisitionDate: new Date("2014-09-14"),
        landAcquisitionDate: new Date("2013-06-01"),
        acquisitionPrice: 0,
        useEstimatedAcquisition: true,
        acquisitionMethod: "estimated",
        expenses: 6_090_000,
        transferExpense: 6_090_000,
        isOneHousehold: true,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
        landSplitMode: "apportioned",
        // 양도시 개별주택가격 = 기준시가 합 980,000,000 → 토지 266,000,000(27.14%) : 건물 714,000,000. 취득시 기준시가는 작게 둬 §97②2호 단서(나목 채택)가 걸리게 한다.
        preHousingDisclosure: {
          firstDisclosureDate: new Date("2005-04-30"),
          firstDisclosureHousingPrice: 3_000_000,
          landArea: 100,
          landPricePerSqmAtAcquisition: 10_000,
          buildingStdPriceAtAcquisition: 1_000_000,
          landPricePerSqmAtFirstDisclosure: 15_000,
          buildingStdPriceAtFirstDisclosure: 1_500_000,
          transferHousingPrice: 980_000_000,
          landPricePerSqmAtTransfer: 2_660_000,
          buildingStdPriceAtTransfer: 714_000_000,
        },
      } as never,
      makeMockRates(),
    );
    expect(r.splitDetail!.land.swapApplied).toBe(true);
    expect(r.splitDetail!.land.directExpenses).toBe(3_306_000);
    expect(r.splitDetail!.building.directExpenses).toBe(12_180_000 - 3_306_000);
  });
});

describe("D-1·D-2 — 상세명세서 «자산별 양도비» 산식이 자기 값을 만든다", () => {
  const ALLOC = /^([\d,]+) × ([\d,]+) \/ \(([\d,]+)\+([\d,]+)\) = ([\d,]+)$/;
  const n = (s: string) => Number(s.replace(/,/g, ""));

  async function formulas(sale: keyof typeof SALE, exp: Record<string, string>) {
    const r = await run(sale, "same", exp);
    const f = (id: string) => {
      const c = r.cards.find((x) => x.propertyId === id)!;
      return buildGbExpenseFormula({ propertyId: id, necessaryExpense: c.expenses, capitalExpenditureForDisplay: 0 } as never, r.gbd);
    };
    return { r, land: f("land"), building: f("building") };
  }

  it("D-1 신규 양도비 5,000,000 · 구분 기재 14억/6억 → 5,000,000 × 1,400,000,000 / (1,400,000,000+600,000,000) = 3,500,000", async () => {
    const { land, building } = await formulas("A_declared_70_30", { transferExpense: "5,000,000" });
    expect(land).toBe("5,000,000 × 1,400,000,000 / (1,400,000,000+600,000,000) = 3,500,000");
    const m = ALLOC.exec(land!)!;
    expect(Math.floor((n(m[1]) * n(m[2])) / (n(m[3]) + n(m[4])))).toBe(n(m[5])); // 산식 검산 — 현행은 `0 × …`
    expect(building).toBe("5,000,000 - 토지 3,500,000 = 1,500,000 (잔액 보정)");
  });
  it("D-1 감정 11억/9억 → 분모가 감정 양도가액", async () => {
    const { land } = await formulas("B_appraisal_55_45", { transferExpense: "5,000,000" });
    expect(land).toBe("5,000,000 × 1,100,000,000 / (1,100,000,000+900,000,000) = 2,750,000");
  });
  it("D-1 기준시가 안분 → 분모는 적용 양도가액(안분 결과)이 아니라 양도시 기준시가", async () => {
    const { land } = await formulas("C_none_std", { transferExpense: "5,000,000" });
    expect(land).toBe("5,000,000 × 920,550,000 / (920,550,000+300,000,000) = 3,771,045");
  });
  it("D-1 자본적지출 5,000,000 → 취득시 기준시가 분모로 자기 값을 만든다 (현행은 양도시 분모에 0 × …)", async () => {
    const { land } = await formulas("A_declared_70_30", { capitalExpenditure: "5,000,000" });
    const m = ALLOC.exec(land!)!;
    expect(Math.floor((n(m[1]) * n(m[2])) / (n(m[3]) + n(m[4])))).toBe(n(m[5]));
    expect(n(m[5])).toBe(4_095_867);
  });
  it("D-1 자본적지출 + 양도비 → 두 항과 합계를 적고 합계가 카드 값과 같다", async () => {
    const { r, land } = await formulas("A_declared_70_30", { capitalExpenditure: "5,000,000", transferExpense: "5,000,000" });
    const lines = land!.split("\n").map((s) => s.trim());
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^양도비 /);
    expect(lines[1]).toMatch(/^자본적지출 /);
    expect(lines[2]).toBe(`합계 = ${(4_095_867 + 3_500_000).toLocaleString("ko-KR")}`);
    expect(r.land).toBe(4_095_867 + 3_500_000);
  });
  it("D-2 옛 이력(echo 없음)·legacy 입력은 현행 산식 그대로", async () => {
    const { r, land } = await formulas("C_none_std", { directExpenses: "5,000,000" });
    expect(land).toBe("5,000,000 × 920,550,000 / (920,550,000+300,000,000) = 3,771,045");
    // 신규 입력 결과에서 echo를 걷어낸 옛 이력 모양 → 종전 산식(legacy 총액 0)으로 후퇴한다
    const old = { ...r.gbd, bundledActualCapitalExpenditure: undefined, bundledActualTransferExpense: undefined };
    const fOld = buildGbExpenseFormula({ propertyId: "land", necessaryExpense: r.land, capitalExpenditureForDisplay: 0 } as never, old);
    expect(fOld).toBe(land);
  });
  it("D-3 파트 자본적지출 칸(직접 입력) + 양도비 → 자본적지출은 입력값, 양도비 몫은 안분해 더하고 산식이 그 합을 만든다", async () => {
    const { r, land, building } = await formulas("A_declared_70_30", {
      transferExpense: "5,000,000", landDirectExpenses: "1,000,000", buildingDirectExpenses: "2,000,000",
    });
    // 파트 칸은 자본적지출만 대체한다 — 종전엔 양도비 5,000,000이 통째로 사라졌다(1,000,000 / 2,000,000).
    expect([r.land, r.building]).toEqual([1_000_000 + 3_500_000, 2_000_000 + 1_500_000]);
    expect(land).toBe(
      "양도비 5,000,000 × 1,400,000,000 / (1,400,000,000+600,000,000) = 3,500,000\n        자본적지출 1,000,000 (토지 칸 직접 입력)\n        합계 = 4,500,000",
    );
    expect(building).toBe(
      "양도비 5,000,000 - 토지 3,500,000 = 1,500,000 (잔액 보정)\n        자본적지출 2,000,000 (건물 칸 직접 입력)\n        합계 = 3,500,000",
    );
  });
  it("D-2b 신규 입력 결과에서 echo를 걷어내면 종전 산식으로 후퇴한다 (옛 이력 모양)", async () => {
    const { r } = await formulas("A_declared_70_30", { transferExpense: "5,000,000" });
    const old = { ...r.gbd };
    delete old.bundledActualTransferExpense;
    delete old.bundledActualCapitalExpenditure;
    const f = buildGbExpenseFormula({ propertyId: "land", necessaryExpense: 3_500_000, capitalExpenditureForDisplay: 0 } as never, old);
    expect(f).toBe("0 × 920,550,000 / (920,550,000+300,000,000) = 3,500,000");
  });
});
