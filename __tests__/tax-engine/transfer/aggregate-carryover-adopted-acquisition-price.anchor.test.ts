/**
 * anchor: 다건(aggregate) **취득가액 열**은 이월과세 §97의2가 **채택한 시나리오**를 따라간다
 *
 * ── 무엇이 어긋나 있었나 (F16 계획서 D-4) ──────────────────────────────
 * 단건 엔진 STEP 0.475는 `workingInput`을 **채택 시나리오의 입력**으로 갈아탄 뒤
 * `transferGain`을 산출한다(`transfer-tax.ts`). 그런데
 * `transfer-tax-aggregate.ts`의 표시 취득가액은 `r.singleInput`(= 갈아타기 **전** 원본)에서
 * 왔다. **양도차익은 STEP 0.475 이후, 취득가액은 이전** — 두 열이 서로 다른 시점을 봤다.
 *
 * 필요경비 열은 `양도가액 − 취득가액 − 양도차익` **역산**이라 그 차이를 통째로 흡수한다:
 *
 * | 픽스처 | 취득가액 열(종전) | 필요경비 열(종전) | 채택 취득가액 |
 * |---|---|---|---|
 * | A 채택 · 폼 취득가 0 | **0** | 130,000,000 | 100,000,000 |
 * | B 채택 · 폼 취득가 0 | **0** | 300,000,000 | 300,000,000 |
 * | A 채택 · 폼 취득가 3억 | 300,000,000 | **−170,000,000** | 100,000,000 |
 * | 일반건물 토지 파트 · A 채택 | 250,000,000(수증자 환산) | **−70,000,000** | 150,000,000 |
 *
 * 앞 두 줄은 **오분류**다 — 합은 맞지만 취득가액이 필요경비 칸에 앉는다.
 * 뒤 두 줄은 더 나쁘다 — 음수 필요경비가 UI clamp(`Math.max(0, …)`)에 잘려
 * **화면에서 열 산술이 깨진다**. 마지막 줄(출하된 일반건물 파트 이월과세) 실측:
 *   `500,000,000 − 250,000,000 − 0 = 250,000,000` ≠ 양도차익 `320,000,000` (170,000,000 어긋남)
 *
 * ── 왜 엔진 변경이 아닌가 ───────────────────────────────────────────────
 * 채택 결과는 이미 `carryoverTaxationDetail.adoptedScenario` ·
 * `scenarioA/B.acquisitionPrice`로 breakdown에 실려 있다. 표시 축을 그 값으로 맞추기만 하면
 * 되고, 세액 경로(`taxableAfterReduction`·`groupTaxes`)는 이 두 열을 읽지 않는다.
 * 직전 커밋의 `adoptedRateBasis` echo(`aggregate-carryover-adopted-rate-basis.anchor.test.ts`)와
 * **같은 패턴**이다 — 「채택 결과를 표시·분류 축에 반영」.
 *
 * 🔒 **세액 불변** — 각 describe의 마지막 `it`이 결정세액을 못으로 박는다.
 *    이 수정으로 원 단위로도 움직이면 안 된다.
 *
 * ⚠️ `filingColumns()`는 UI가 실제로 그리는 값을 재현한다 —
 *    `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts:161-162`
 *    (= `DetailedStatementHelpers.ts:276·294`)와 **같은 식**이다. 그쪽이 바뀌면 여기도 바꿀 것.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
  type PerPropertyBreakdown,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

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

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/**
 * 신고서 양식이 **화면에 그리는** 세 열 — clamp 포함.
 * 자본적지출은 취득가액 열로 흡수되고, 필요경비 열은 남은 양도비만 그린다.
 */
function filingColumns(p: PerPropertyBreakdown) {
  return {
    transferPrice: p.transferPrice,
    acquisition: p.acquisitionPrice + p.capitalExpenditureForDisplay,
    expense: Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay),
  };
}

/** 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 **화면 값으로** 성립하는가. */
function expectFilingSelfConsistent(p: PerPropertyBreakdown) {
  const c = filingColumns(p);
  expect(c.transferPrice - c.acquisition - c.expense).toBe(p.transferGain);
}

// ══════════════════════════════════════════════════════════════════════
// 축 1 — 다건 aggregate 직접 호출 (함께양도·다물건 경로)
// ══════════════════════════════════════════════════════════════════════

const DONOR_ACQ = D("2010-01-01");
const GIFT_REG = D("2025-09-01");
const TRANSFER_DATE = D("2026-06-01");

function land(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: TRANSFER_DATE,
    acquisitionDate: GIFT_REG,
    acquisitionPrice: 0,
    transferPrice: 1_000_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    ...o,
  };
}

/**
 * 이월과세 토지.
 * @param acqInput 폼 취득가액(STEP 0.475 **이전** 값). 실사용에서는 `carryover_gift`에
 *   취득가액 입력 UI가 없어 0이지만, 일반건물 파트 경로는 환산액이 여기 실린다.
 */
function carryoverLand(
  id: string,
  o: { donorAcquisitionPrice: number; giftDateValuation: number; acqInput?: number },
): TransferTaxItemInput {
  return land(id, {
    acquisitionCause: "carryover_gift",
    acquisitionPrice: o.acqInput ?? 0,
    carryoverTaxation: {
      giftRegistryDate: GIFT_REG,
      donorAcquisitionDate: DONOR_ACQ,
      donorAcquisitionPrice: o.donorAcquisitionPrice,
      useEstimatedAcquisition: false,
      giftTaxAmount: 30_000_000,
      giftDateValuation: o.giftDateValuation,
    },
  });
}

/** A 채택 — 증여자 취득가 1억(A 세액 크다) vs 증여시 평가액 9억 → §97의2②3호 미발동 */
const ADOPT_A = { donorAcquisitionPrice: 100_000_000, giftDateValuation: 900_000_000 };
/** B 채택 — 증여자 취득가 9억(A 세액 작다) vs 증여시 평가액 3억 → ②3호 발동 */
const ADOPT_B = { donorAcquisitionPrice: 900_000_000, giftDateValuation: 300_000_000 };

/** 이월과세와 무관한 동반 자산 — 종전 축이 그대로인지 대조한다. */
const plainLand = () =>
  land("X", {
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 300_000_000,
    transferPrice: 800_000_000,
  });

function aggregate(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000,
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("A-9 축1: aggregate 취득가액 열 = 채택 시나리오 취득가액", () => {
  it("C-A1 A 채택 — 취득가액 100,000,000 / 필요경비 30,000,000 (종전 0 / 130,000,000)", () => {
    const a = aggregate([carryoverLand("C", ADOPT_A), plainLand()]);
    const p = a.properties[0];

    expect(p.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(p.acquisitionPrice).toBe(100_000_000);
    expect(p.acquisitionPrice).toBe(p.carryoverTaxationDetail!.scenarioA.acquisitionPrice);
    // 남은 필요경비는 §97의2①3호 증여세 상당액뿐이다.
    expect(p.necessaryExpense).toBe(30_000_000);
    expectFilingSelfConsistent(p);
  });

  it("C-A2 B 채택(②3호 배제) — 취득가액 300,000,000 / 필요경비 0 (종전 0 / 300,000,000)", () => {
    const a = aggregate([carryoverLand("C", ADOPT_B), plainLand()]);
    const p = a.properties[0];

    expect(p.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    // B는 증여 당시 평가액이 곧 취득가액이다(§97의2② — 이월과세 미적용).
    expect(p.acquisitionPrice).toBe(300_000_000);
    expect(p.acquisitionPrice).toBe(p.carryoverTaxationDetail!.scenarioB.acquisitionPrice);
    expect(p.necessaryExpense).toBe(0);
    expectFilingSelfConsistent(p);
  });

  it("C-A3 폼 취득가액이 남아 있어도 채택값이 이긴다 — 필요경비 −170,000,000 소멸", () => {
    const a = aggregate([carryoverLand("C", { ...ADOPT_A, acqInput: 300_000_000 })]);
    const p = a.properties[0];

    expect(p.acquisitionPrice).toBe(100_000_000); // 종전 300,000,000(= 폼 값)
    expect(p.necessaryExpense).toBe(30_000_000); // 종전 −170,000,000
    // 🔴 종전에는 음수가 clamp돼 화면 산술이 170,000,000 어긋났다.
    expect(p.necessaryExpense).toBeGreaterThanOrEqual(p.capitalExpenditureForDisplay);
    expectFilingSelfConsistent(p);
  });

  it("C-A4 이월과세가 아닌 동반 자산은 종전 축 그대로", () => {
    const a = aggregate([carryoverLand("C", ADOPT_A), plainLand()]);
    const x = a.properties[1];

    expect(x.carryoverTaxationDetail).toBeUndefined();
    expect(x.acquisitionPrice).toBe(300_000_000);
    expectFilingSelfConsistent(x);
  });

  it("C-A5 🔒 세액 불변 — 표시 축 수정이 결정세액을 원 단위로도 바꾸지 않는다", () => {
    expect(aggregate([carryoverLand("C", ADOPT_A), plainLand()]).determinedTax).toBe(383_640_000);
    expect(aggregate([carryoverLand("C", ADOPT_B), plainLand()]).determinedTax).toBe(480_060_000);
    expect(
      aggregate([carryoverLand("C", { ...ADOPT_A, acqInput: 300_000_000 })]).determinedTax,
    ).toBe(219_840_000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 축 2 — 일반건물 토지 파트 이월과세 (출하된 기능 · route 경유)
//
// 픽스처는 `__tests__/api/transfer.route.gb-carryover.predo.anchor.test.ts`와 동일:
//   토지 100㎡ × 2,000,000/㎡ = 200,000,000 · 건물 양도시 기준시가 200,000,000
//   ⇒ §166⑥ 안분 50:50 · 총양도가 10억 ⇒ 토지 500,000,000 / 건물 500,000,000
// ══════════════════════════════════════════════════════════════════════

const GIFT_DATE_GB = "2021-03-01";
const DONOR_ACQ_GB = "2005-06-15";

const GB_BODY = {
  propertyType: "general_building" as const,
  transferDate: "2024-03-01",
  transferPrice: 1_000_000_000,
  acquisitionDate: GIFT_DATE_GB,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  generalBuildingValuation: {
    landArea: 100,
    buildingArea: 200,
    buildingFootprintArea: 50,
    transferLandPricePerSqm: 2_000_000,
    transferBuildingStdPrice: 200_000_000,
    zoneType: "general_residential" as const,
    acquisitionLandPricePerSqm: 1_000_000,
    acquisitionBuildingStdPrice: 100_000_000,
    buildingAcquisitionCause: "purchase" as const,
    landAcquisitionCause: "carryover_gift" as const,
    landCarryoverTaxation: {
      giftRegistryDate: GIFT_DATE_GB,
      donorAcquisitionDate: DONOR_ACQ_GB,
      donorAcquisitionPrice: 150_000_000,
      useEstimatedAcquisition: false,
      giftTaxAmount: 30_000_000,
      giftDateValuation: 400_000_000,
    },
  },
};

async function callGb() {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(GB_BODY),
    }),
  );
  const json = await res.json();
  return {
    status: res.status,
    properties: (json.data?.aggregated?.properties ?? []) as PerPropertyBreakdown[],
    determinedTax: json.data?.aggregated?.determinedTax as number | undefined,
  };
}

describe("A-9 축2: 일반건물 토지 파트 이월과세 — 신고서 열 산술이 성립한다", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("C-A6 토지 파트 취득가액 150,000,000 / 필요경비 30,000,000 (종전 250,000,000 / −70,000,000)", async () => {
    const r = await callGb();
    expect(r.status).toBe(200);
    const land = r.properties.find((p) => p.propertyId === "land")!;

    expect(land.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    // 종전 250,000,000은 **수증자 자신의** 환산취득가였다 — 증여자 축과 무관하다.
    expect(land.acquisitionPrice).toBe(150_000_000);
    expect(land.acquisitionPrice).toBe(land.carryoverTaxationDetail!.scenarioA.acquisitionPrice);
    expect(land.necessaryExpense).toBe(30_000_000);
    // 🔴 종전 −70,000,000이 clamp돼 500,000,000 − 250,000,000 − 0 ≠ 320,000,000 이었다.
    expect(land.necessaryExpense).toBeGreaterThanOrEqual(land.capitalExpenditureForDisplay);
    expectFilingSelfConsistent(land);
  });

  it("C-A7 이월과세가 없는 건물 파트는 종전 축 그대로", async () => {
    const r = await callGb();
    const building = r.properties.find((p) => p.propertyId === "building")!;

    expect(building.carryoverTaxationDetail).toBeUndefined();
    expect(building.acquisitionPrice).toBe(250_000_000);
    expect(building.necessaryExpense).toBe(3_000_000);
    expectFilingSelfConsistent(building);
  });

  it("C-A8 🔒 세액 불변 — 161,460,000", async () => {
    expect((await callGb()).determinedTax).toBe(161_460_000);
  });
});
