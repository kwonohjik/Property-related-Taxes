/**
 * anchor: 일반건물 **부담부증여 × 배우자등 이월과세(§97의2)** (F27, 2026-08-23)
 *
 * ## 종전 결함
 *
 * `assetKind === "general_building"`은 `route.ts`가 GB 분기로 빼서 §159 안분
 * (`buildBurdenedGiftBreakdown`)을 **직접** 부르는데, `info`를 원본 그대로 넘겨
 * §97의2①1호 취득가액 치환도 ①3호 증여세 산입도 하지 않았다. 그 치환은
 * `applyCarryoverDonorBasis`에서만 일어나고, 그 함수는 **단건 엔진 STEP 0.475에서만** 불린다.
 *
 * 반면 ⑧(`transfer-tax-validate-bg.ts`)은 일반건물에서도 「당초 증여자」 취득 당시 기준시가
 * 두 칸을 **필수로 요구**하고 ⑤가 그 칸을 렌더한다 ⇒ **입력을 강제하면서 반영하지 않는** 상태.
 *
 * 실측(아래 픽스처): 「당초 증여자」 기준시가를 15억·2억 → **1원·1원**으로 바꿔도
 * 결정세액이 **전 필드 동일**했다(Δ 0). 배선 후 Δ = **+28,981,429**.
 *
 * ## 왜 결합이 성립하는가
 *
 * · 법 §88조1호 후단 — 부담부증여 채무액 부분은 「양도로 보며」
 * · 영 §159①1호 — 취득가액 A = 「**법 제97조제1항제1호에 따른 가액**」
 * · §97의2①1호는 **바로 그 슬롯**을 당초 증여자 취득 당시 값으로 치환한다 ⇒ 같은 칸을 가리킨다
 * · §97의2②의 적용배제는 **3개 호뿐**(수용·§89①3호·세액비교) — 부담부증여를 배제하는 문언이 없다
 *
 * ## ②3호 비교 단위 = **신고단위 결정세액**
 *
 * 일반건물은 카드 여러 장이 하나의 신고를 이루므로 카드별 비교가 불가능하다. aggregate 전체를
 * 두 번 돌려 비교한다(N-1에서 확정한 §92③2호 규약 승계).
 *
 * ## 픽스처
 *
 * 토지 1,279㎡ × 6,215,000(양도) / 2,130,000(취득) · 건물 631,846,500 / 424,472,064 ·
 * 인수채무 5억 · 증여등기 2023-06-01 · 당초 증여자 취득 2012-01-01 · 증여세 1억 ·
 * 양도 2026-02-16. 「당초 증여자」 취득 당시 기준시가 토지 15억 · 건물 2억.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

const LAND_AREA = 1279;
const T_LAND = 6_215_000;
const A_LAND = 2_130_000;
const T_BLDG = 631_846_500;
const A_BLDG = 424_472_064;

/** 이월과세 미적용(시나리오 B) 결정세액 — 배제 사유가 있으면 전부 이 값으로 수렴해야 한다. */
const TAX_B = 73_660_200;
/** 이월과세 적용(시나리오 A) 결정세액 */
const TAX_A = 86_400_412;

const CARRYOVER = {
  giftRegistryDate: "2023-06-01",
  donorAcquisitionDate: "2012-01-01",
  donorAcquisitionPrice: 0,
  useEstimatedAcquisition: false,
  giftTaxAmount: 100_000_000,
  giftDateValuation: 3_000_000_000,
  donorRelation: "lineal",
};

const BASE = {
  propertyType: "general_building" as const,
  transferType: "burdened_gift" as const,
  acquisitionCause: "carryover_gift" as const,
  transferPrice: 2_500_000_000,
  transferDate: "2026-02-16",
  acquisitionPrice: 2_500_000_000,
  acquisitionDate: "2016-01-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  carryoverTaxation: CARRYOVER,
  burdenedGiftInfo: {
    valuationMode: "sangjeungbeop_standard" as const,
    lendingDepositTotal: 0,
    mortgageDebtAmount: 500_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: LAND_AREA * T_LAND,
    buildingStdPriceAtTransfer: T_BLDG,
    landStdPriceAtAcquisition: LAND_AREA * A_LAND,
    buildingStdPriceAtAcquisition: A_BLDG,
    donorRelation: "lineal_descendant" as const,
    carryoverDonorBasis: {
      landStdPriceAtAcquisition: 1_500_000_000,
      buildingStdPriceAtAcquisition: 200_000_000,
    },
  },
  generalBuildingValuation: {
    transferLandPricePerSqm: T_LAND,
    transferBuildingStdPrice: T_BLDG,
    landArea: LAND_AREA,
    buildingFootprintArea: 388.27,
    zoneType: "general_residential" as const,
    actualPriceMode: true,
    buildingAcquisitionCause: "purchase" as const,
    acquisitionLandPricePerSqm: A_LAND,
    acquisitionBuildingStdPrice: A_BLDG,
  },
};

interface Res {
  aggregated: {
    determinedTax: number;
    totalTransferGain: number;
    burdenedGiftCarryoverDetail?: {
      adoptedScenario: "A" | "B";
      determinedTaxA: number;
      determinedTaxB: number;
      applicablePeriodYears: 5 | 10;
    };
  };
  transferBurdenedGiftBreakdown?: { carryoverGiftTax?: { applied: number; raw: number } };
}

async function post(over: Record<string, unknown> = {}): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  const json = (await res.json()) as { data?: Res; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F27 · 일반건물 부담부증여 × 이월과세", () => {
  it("F27-01: 🔴 「당초 증여자」 취득 당시 기준시가가 **세액을 움직인다** (종전 Δ 0)", async () => {
    const base = await post();
    const mutated = await post({
      burdenedGiftInfo: {
        ...BASE.burdenedGiftInfo,
        carryoverDonorBasis: { landStdPriceAtAcquisition: 1, buildingStdPriceAtAcquisition: 1 },
      },
    });

    expect(base.aggregated.determinedTax).toBe(TAX_A);
    expect(mutated.aggregated.determinedTax).toBe(115_381_841);
    expect(mutated.aggregated.determinedTax - base.aggregated.determinedTax).toBe(28_981_429);
  });

  it("F27-02: §97의2①3호 — 증여세 상당액이 §159 안분 단계에 산입된다 (종전 undefined)", async () => {
    const base = await post();
    const cg = base.transferBurdenedGiftBreakdown?.carryoverGiftTax;
    expect(cg).toBeDefined();
    expect(cg!.raw).toBe(100_000_000);
    // 영 §163의2② — 채무액 비율로 안분된 몫만 필요경비에 산입된다.
    expect(cg!.applied).toBe(5_826_941);
  });

  it("F27-03: §97의2②3호 — **신고단위 결정세액** 두 개를 비교해 채택한다", async () => {
    const base = await post();
    const d = base.aggregated.burdenedGiftCarryoverDetail;
    expect(d).toBeDefined();
    expect(d!.determinedTaxA).toBe(TAX_A);
    expect(d!.determinedTaxB).toBe(TAX_B);
    // A ≥ B이므로 ①을 적용한다(A < B면 「적은 경우」에 해당해 미적용).
    expect(d!.adoptedScenario).toBe("A");
    expect(base.aggregated.determinedTax).toBe(d!.determinedTaxA);
  });

  it("F27-04: 🔑 시나리오 B는 **종전 계산과 같은 값**이다 (회귀 0)", async () => {
    const noCarryover = await post({ carryoverTaxation: undefined, acquisitionCause: "purchase" });
    expect(noCarryover.aggregated.determinedTax).toBe(TAX_B);
    expect(noCarryover.aggregated.totalTransferGain).toBe(311_020_394);
    expect(noCarryover.aggregated.burdenedGiftCarryoverDetail).toBeUndefined();
  });

  it("F27-05: §97의2③ 기간 초과면 미적용 — 단건과 **같은 판정 leaf**를 쓴다", async () => {
    // 증여 등기접수일 2012-06-01 < 2023-01-01 ⇒ 5년 룰(부칙 §18) ⇒ 2017-06-01 한도 초과.
    const expired = await post({
      carryoverTaxation: { ...CARRYOVER, giftRegistryDate: "2012-06-01" },
    });
    expect(expired.aggregated.determinedTax).toBe(TAX_B);
    expect(expired.aggregated.burdenedGiftCarryoverDetail).toBeUndefined();
  });

  it("F27-06: §97의2②1호 수용 선언이면 미적용", async () => {
    const excluded = await post({
      carryoverTaxation: {
        ...CARRYOVER,
        exclusionDeclared: { expropriationWithin2Years: true },
      },
    });
    expect(excluded.aggregated.determinedTax).toBe(TAX_B);
    expect(excluded.aggregated.burdenedGiftCarryoverDetail).toBeUndefined();
  });
});
