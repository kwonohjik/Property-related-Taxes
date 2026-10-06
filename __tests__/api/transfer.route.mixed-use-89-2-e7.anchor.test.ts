/**
 * anchor (E-7) — 겸용 **단건** 엔진이 「소득세법」 §89② 판정을 단건 주택 경로와 **같은 leaf**
 * (`resolveArticle89Clause2`)로 한다.
 *
 * 법령: 「소득세법」 §89② — 「1세대가 주택(주택부수토지를 포함한다)과 조합원입주권 또는 분양권을 보유하다가
 *   그 주택을 양도하는 경우에는 제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」 ·
 *   「소득세법 시행령」 §154③ — 겸용주택의 주택 부분은 「법 제89조제1항제3호를 적용할 때」 주택이다.
 *   예외 · 「소득세법 시행령」 §156의2③(권리 취득일부터 3년 이내 양도) · ④(3년 초과 — 선언).
 *
 * 결함(base): 겸용 단건 route(5-a-2)는 §89②를 보지 않아, 주택 + 조합원입주권 세대가 3년을 넘겨
 *   겸용주택을 양도해도(예외 없음 선언) 주택분 12억 이하 비과세를 받았다. 겸용 **컴패니언**(파트 카드)은
 *   카드마다 단건 엔진이 §89②를 판정해 같은 사실에서 과세였다 — 경로에 따라 결론이 갈렸다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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

/** 건물·토지 2018-06-01 취득 · 2026-06-01 10억 양도 · 1세대 · 세대 주택 1채(겸용 자신) · 거주 5년 */
const MIXED = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2018-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2018-06-01",
    buildingAcquisitionDate: "2018-06-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 5,
    zoneType: "general_residential" as const,
    isOneHouseExempt: true,
  },
};

const right = (acquisitionDate: string, over: object = {}) => ({
  id: "r1",
  type: "redevelopment_right" as const,
  acquisitionDate,
  region: "capital" as const,
  ...over,
});

type RouteResult = {
  calculationRoute: { highValueRule: string };
  housingPart: { isExempt: boolean };
  total: { totalPayable: number; determinedTax: number };
  warnings: string[];
  multiHouseSurcharge?: { surchargeType: string };
};
type HousingResult = { isExempt: boolean; isPartialExempt?: boolean; surchargeType?: string };

/** 같은 사실을 단건 **주택** 경로로 — 판정 leaf가 같은지 결론으로 대조한다. */
async function postHousing(over: object = {}): Promise<HousingResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, propertyType: "housing", mixedUse: undefined, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: HousingResult } }).data.result;
}

async function post(over: object = {}): Promise<RouteResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as { data: { result: RouteResult } };
  return json.data.result;
}
const rule = (r: RouteResult) => r.calculationRoute.highValueRule;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("E-7 겸용 단건 × §89② — 단건 주택 경로와 같은 leaf", () => {
  it("대조군 — 권리 없음: 주택분 12억 이하 비과세", async () => {
    const r = await post();
    expect(rule(r)).toBe("below_threshold_exempt");
    expect(r.total.totalPayable).toBe(0);
  });

  it("🔴 입주권 3년 초과 + 예외 없음 선언 → §89② 배제(주택분 과세) · 결정세액 0 → 138,640,800", async () => {
    const over = { presaleRights: [right("2022-06-01")], rightThreeYearException: { kind: "none" } };
    const r = await post(over);
    expect(rule(r)).toBe("non_one_house_full_taxation");
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.total.determinedTax).toBe(138_640_800);
    expect(r.warnings.some((w) => w.includes("§89②에 따라"))).toBe(true);
    // 단건 주택 경로도 같은 사실에서 비과세를 끈다(같은 leaf).
    expect((await postHousing(over)).isExempt).toBe(false);
  });

  it("🔴 분양권(§88 10호 시행 후 취득) 3년 초과 + 예외 없음 → 배제 — 분양권 축 시행일 게이트(DB)가 겸용에도 닿는다", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
    const over = {
      presaleRights: [right("2022-06-01", { type: "presale_right" })],
      rightThreeYearException: { kind: "none" },
    };
    expect(rule(await post(over))).toBe("non_one_house_full_taxation");
    expect((await postHousing(over)).isExempt).toBe(false);
  });

  it("🔴 입주권 2개(합가·상속 축 없음) → 배제 확정", async () => {
    const r = await post({
      presaleRights: [right("2024-06-01"), right("2024-07-01", { id: "r2" })],
    });
    expect(rule(r)).toBe("non_one_house_full_taxation");
  });

  it("긍정 짝 — 입주권 취득일부터 3년 이내 양도(§156의2③) → 비과세 유지", async () => {
    const r = await post({ presaleRights: [right("2024-06-01")] });
    expect(rule(r)).toBe("below_threshold_exempt");
    expect(r.total.totalPayable).toBe(0);
    expect((await postHousing({ presaleRights: [right("2024-06-01")] })).isExempt).toBe(true);
  });

  it("긍정 짝 — 3년 초과 + 완성 전 양도 선언(§156의2④) → 비과세 유지 + 사후관리 고지", async () => {
    const r = await post({
      presaleRights: [right("2022-06-01")],
      rightThreeYearException: { kind: "before_completion", movedInWithin3Years: true, residedOneYearOrMore: true },
    });
    expect(rule(r)).toBe("below_threshold_exempt");
    expect(r.warnings.some((w) => w.includes("§156의2⑬"))).toBe(true);
  });

  it("판정 불가 — 3년 초과 · 선언 없음 → 종전 동작(비과세) + 단건과 같은 고지", async () => {
    const r = await post({ presaleRights: [right("2022-06-01")] });
    expect(rule(r)).toBe("below_threshold_exempt");
    expect(r.warnings.some((w) => w.includes("§89②") && w.includes("§156의2 ④"))).toBe(true);
  });
});

/**
 * 중과 배제 ① 요소 — 단건 `resolveSurchargeDeemedOneHouseDetail`과 같은 순서·같은 술어(E-7).
 * 강남 · 20억 · 명부(양도 주택 1행) · 1세대. 결론(중과 유형)을 단건 주택 경로와 대조한다.
 */
describe("E-7 겸용 단건 × §89② — 중과 배제 ① 요소(§156의2 의제 · 판정 보류 게이트)", () => {
  const GANGNAM = "1168010100";
  const house = (id: string, acquisitionDate: string) => ({
    id,
    region: "capital",
    regionCode: GANGNAM,
    acquisitionDate,
    officialPrice: 900_000_000,
    isInherited: false,
    isLongTermRental: false,
  });
  const HIGH = {
    transferPrice: 2_000_000_000,
    isRegulatedArea: true,
    regionCode: GANGNAM,
    houses: [house("selling", "2018-06-01")],
    sellingHouseId: "selling",
    mixedUse: {
      ...MIXED.mixedUse,
      isMetropolitanArea: true,
      transferStandardPrice: { housingPrice: 600_000_000, commercialBuildingPrice: 200_000_000, landPricePerSqm: 4_000_000 },
    },
  };
  const rightG = (d: string) => right(d, { regionCode: GANGNAM });
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });

  it("대조군 — 권리 없음: 중과 없음 · 결정세액 168,318,240", async () => {
    const r = await post(HIGH);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(r.total.determinedTax).toBe(168_318_240);
  });

  it("🔴 1주택 + 입주권(3년 이내 · §156의2③) → §167의11①13호 배제 · 176,181,840 → 168,318,240", async () => {
    const over = { ...HIGH, presaleRights: [rightG("2024-06-01")] };
    const r = await post(over);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(r.total.determinedTax).toBe(168_318_240);
    expect((await postHousing({ ...over, mixedUse: undefined })).surchargeType ?? "none").toBe("none");
  });

  it("🔴 2022-03-01 양도(한시 유예 전) · 입주권 3년 이내 → 구 §167의11①1호 배제 · 200,233,440 → 195,217,632", async () => {
    const over = { ...HIGH, transferDate: "2022-03-01", presaleRights: [rightG("2021-06-01")] };
    const r = await post(over);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(r.total.determinedTax).toBe(195_217_632);
    expect((await postHousing({ ...over, mixedUse: undefined })).surchargeType ?? "none").toBe("none");
  });

  /**
   * E011(2026-10-06) — 특수주택 선언이 없는 2주택 + 1권리는 §89② **배제 확정**이다(종전: 판정 보류 + 비과세 종전 동작).
   * 그래서 고가주택 부분 비과세가 사라져 세액이 176,561,800 → 796,172,800이 됐다. 이 케이스가 지키는 성질
   * (15호 의제 불성립 · 3주택+ 중과 — 단건과 같은 게이트)은 그대로다.
   */
  it("🔴 §155① 일시적 2주택 + 입주권(특수주택 선언 없음) → §89② 배제 확정 · 15호 의제 불성립(단건과 같은 게이트) · 796,172,800", async () => {
    const over = {
      ...HIGH,
      householdHousingCount: 2,
      houses: [house("selling", "2018-06-01"), house("h2", "2025-06-01")],
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2025-06-01" },
      presaleRights: [rightG("2022-06-01")],
    };
    const r = await post(over);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
    expect(r.total.determinedTax).toBe(796_172_800);
    expect((await postHousing({ ...over, mixedUse: undefined })).surchargeType).toBe("multi_house_3plus");
  });

  it("긍정 짝 — 같은 2주택 · 권리 없음 → 15호 배제 유지(168,318,240)", async () => {
    const r = await post({
      ...HIGH,
      householdHousingCount: 2,
      houses: [house("selling", "2018-06-01"), house("h2", "2025-06-01")],
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2025-06-01" },
    });
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(r.total.determinedTax).toBe(168_318_240);
  });
});

/**
 * 겸용 **파트 카드**(주 자산·컴패니언 겸용) — 서브엔진도 카드 item의 §89② 사실로 판정한다.
 * 카드마다 도는 단건 엔진은 이미 §89②를 판정했지만(`mixed-use-part-cards-right-3yr-exception`), 서브엔진은 보지 않아
 * §154③ 본문(주택 연면적 > 상가 · 전체 12억 이하 · 1세대1주택 비과세 성립)으로 상가 카드까지 **주택 카드**로 만들었다.
 * §154③은 「법 제89조제1항제3호를 적용할 때」의 규정이라 §89②로 그 호가 배제되면 상가 부분은 상가다.
 */
describe("E-7 겸용 파트 카드 — 서브엔진 §154③ 본문이 카드 §89② 판정과 갈리지 않는다", () => {
  it("🔴 입주권 3년 초과·예외 없음 → 상가 카드는 land/building (종전: housing)", async () => {
    const { buildMixedUseCompanionItems, MIXED_USE_PART_IDS } = await import(
      "@/app/api/calc/transfer/mixed-use-part-cards"
    );
    const TD = new Date("2026-06-01");
    const item = (presaleRights: unknown[], rightThreeYearException?: unknown) =>
      ({
        propertyId: "c1",
        propertyLabel: "자산 2",
        propertyType: "housing",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        expenses: 0,
        transferDate: TD,
        acquisitionDate: new Date("2018-06-01"),
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 60,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        useEstimatedAcquisition: false,
        isNonBusinessLand: false,
        reductions: [],
        presaleRights,
        rightThreeYearException,
      }) as never;
    const cards = (presaleRights: unknown[], exception?: unknown) =>
      buildMixedUseCompanionItems(
        { ...MIXED.mixedUse, isMetropolitanArea: true } as never,
        item(presaleRights, exception),
        {
          transferDate: TD,
          mixedUseCtx: { rates: makeMockRates(), globals: {} as never },
          primaryEngineInput: { householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false },
        },
        {
          ownershipRatio: undefined,
          isUnregistered: false,
          totalPropertyTransferPrice: undefined,
          assetId: "c1",
          assetLabel: "자산 2",
          allocatedSalePrice: 1_000_000_000,
        },
      );
    const commTypes = (cs: { propertyId: string; propertyType: string }[]) =>
      cs
        .filter(
          (c) =>
            c.propertyId.startsWith(MIXED_USE_PART_IDS.commercialLand) ||
            c.propertyId.startsWith(MIXED_USE_PART_IDS.commercialBuilding),
        )
        .map((c) => c.propertyType);
    const RIGHT = { id: "r1", type: "redevelopment_right", acquisitionDate: new Date("2022-06-01"), region: "capital" };
    // 긍정 짝 — 권리 없음: §154③ 본문 성립 → 상가 카드도 주택 카드
    expect(commTypes(cards([]))).toEqual(["housing", "housing"]);
    // §89② 배제 확정 → 본문 불성립
    expect(commTypes(cards([RIGHT], { kind: "none" }))).toEqual(["land", "building"]);
  });
});
