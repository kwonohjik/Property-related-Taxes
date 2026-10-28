/**
 * anchor — 일반건물 카드 × 이월과세(§97의2): **양도자 본인의 자본적지출·양도비**가 필요경비에서 소실되는 결함 (PR-2, R-1)
 *
 * 계획서 `docs/00-pm/gb-estimated-carryover-scenario-a-capex.plan.md` §2.2~2.4·§3·§6.3 · 결정 Q-1~Q-6(2026-10-28 전부 권고).
 *
 * ## 결함
 * 일반건물 카드의 `expenses`는 환산 파트에서 **본인 환산의 개산공제**(단서 발동 시 배분 나목)이고 `capitalExpenditure`는 비어 있었다.
 * 이월과세 엔진 A 입력은 `capitalExpenditure`를 항상 숫자로 선언해 그 스칼라를 읽지 않으므로 본인 자본적지출·양도비가 A 필요경비에서 통째로
 * 사라졌다(보고 사례: 자본적지출 150,000,000 + 양도비 5,000,000 → 결정세액 31,721,209). B(비교과세)는 반대로 증여 당시 평가액(= 실지거래가액 의제 — 영 §163⑨)을
 * 취득가액으로 쓰면서 본인 **개산공제**를 필요경비로 끌어와 법 근거 없는 공제가 섞였다(B-2 · 제97조제2항제1호는 개산공제를 두지 않는다).
 *
 * ## 수정
 * `buildProperties`가 **이월과세 카드에만** 본인 직접귀속 나목을 `capitalExpenditure`로 명시한다(몫이 0이어도 0). 환산 경로는 `swap.ownDirect`
 * (단서 발동 여부와 무관한 카드별 몫 — 배분 규칙은 기존 swap 과 같다), 실가 경로는 `card.expenses`가 곧 본인 몫이다.
 *
 * ## 공통 픽스처 (계획서 §2.1 — 보고 사례를 재현하도록 역산: 토지 57㎡, 양도시 기준시가 토지 5,956,000/㎡ · 건물 12,308,310,
 *    취득시 토지 1,400,000/㎡ · 건물 16,997,190)
 * 양도 2024-10-11 · 양도가액 330,000,000 · 증여 등기 2020-03-17 · 증여자 취득 1995-06-15 · 증여자 취득가액 50,000,000 · 증여세 상당액 50,000,000 ·
 * 증여 당시 평가액 200,000,000. 토지만 이월과세. 양도가액 안분 토지 318,454,409 · 건물 11,545,591.
 *
 * ## 손계산 (독립 검증 — 자본적지출 150,000,000 · 양도비 5,000,000)
 * 본인 지출 합 155,000,000 을 카드에 (환산취득가 + 개산공제) 비례 배분: 토지 77,248,965(= 74,854,965 + 2,394,000) : 건물 16,453,826 → 토지 127,782,635 · 건물 27,217,365.
 * A 토지 = 318,454,409 − 50,000,000 − 127,782,635 − 증여세 50,000,000 = 90,671,774 → 장특 30%(27년) 27,201,532 → 63,470,242.
 * 건물 = 11,545,591 − 27,217,365 = −15,671,774 (같은 누진 그룹 — 토지에서 차감) → 47,798,468 − 기본공제 2,500,000 = 45,298,468
 * × 15% = 6,794,770 − 1,260,000 = **5,534,770**. (수정 전에는 토지 A 필요경비가 증여세 50,000,000뿐이라 31,721,209.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { capExInAcquisitionColumnOfProperty } from "@/components/calc/results/transfer/exempt-gross-gain";

const BUILDING_ACQ_STD = 16_997_190;
const ct = (o: object = {}) => ({
  giftRegistryDate: "2020-03-17", donorAcquisitionDate: "1995-06-15", donorAcquisitionPrice: 50_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 50_000_000, giftDateValuation: 200_000_000, ...o,
});
const OFF_LAND = { landAcquisitionCause: undefined, landCarryoverTaxation: undefined };

/** 환산 경로(2-way) 일반건물 payload. */
const estimatedGbv = (o: object = {}) => ({
  landArea: 57, buildingArea: 100, buildingFootprintArea: 50, transferLandPricePerSqm: 5_956_000, transferBuildingStdPrice: 12_308_310,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 1_400_000, acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2020-03-17",
  landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct(), ...o,
});
/** 실가 경로 — ④(`buildGeneralBuildingValuation`)가 만드는 모양. */
const actualGbv = (o: object = {}) => ({
  transferLandPricePerSqm: 5_956_000, transferBuildingStdPrice: 12_308_310, landArea: 57, buildingFootprintArea: 50, actualPriceMode: true,
  landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionDate: "2020-03-17", landAcquisitionDate: "2020-03-17", buildingAcquisitionCause: "purchase",
  isSelfBuilt: false, acquisitionLandPricePerSqm: 1_400_000, acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
  landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct(), zoneType: "general_residential", isMetropolitan: false,
  unapprovedBuilding: false, unregisteredLand: false, unregisteredBuilding: false, ...o,
});
const COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 330_000_000, acquisitionDate: "2020-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const estimatedBody = (gbv: object) => ({ ...COMMON, generalBuildingValuation: gbv });
const actualBody = (gbv: object) => ({ ...COMMON, acquisitionPrice: 100_000_000, useEstimatedAcquisition: false, totalPropertyTransferPrice: 330_000_000, generalBuildingValuation: gbv });

interface Card {
  id: string; ne: number; acq: number; gain: number;
  adopted?: string; eligible?: boolean; exclusion?: string; aGain?: number; bGain?: number;
}
async function post(body: object): Promise<{ tax: number; cards: Card[] }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const a = json.data.aggregated;
  return {
    tax: a.determinedTax,
    cards: a.properties.map((p: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: p.propertyId, ne: p.necessaryExpense, acq: p.acquisitionPrice, gain: p.transferGain,
      adopted: p.carryoverTaxationDetail?.adoptedScenario, eligible: p.carryoverTaxationDetail?.isEligible,
      exclusion: p.carryoverTaxationDetail?.exclusionReason,
      aGain: p.carryoverTaxationDetail?.scenarioA?.transferGain, bGain: p.carryoverTaxationDetail?.scenarioB?.transferGain,
    })),
  };
}
const land = (r: { cards: Card[] }) => r.cards.find((c) => c.id === "land")!;
const exp = (capex: number, tr: number) => ({ ...(capex ? { capitalExpenditure: capex } : {}), ...(tr ? { transferExpense: tr } : {}) });

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("GBCO-1 환산 경로 × 토지 이월과세(증여자 실가) — 본인 지출이 A 필요경비에 들어간다", () => {
  // [자본적지출, 양도비, 결정세액(수정 후)] — 수정 前 값: 35,488,448 · 35,488,448 · 35,488,448 · 32,028,502 · 31,721,209 (본인 지출 소실)
  it.each([
    [0, 0, 35_488_448],
    [3_000_000, 0, 34_882_511],
    [3_000_000, 5_000_000, 33_872_616],
    [150_000_000, 0, 6_099_279],
    [150_000_000, 5_000_000, 5_534_770],
  ])("자본적지출 %i · 양도비 %i → 결정세액 %i", async (capex, tr, tax) => {
    const r = await post(estimatedBody(estimatedGbv(exp(capex, tr))));
    expect(r.tax).toBe(tax);
    expect(land(r).adopted).toBe("A");
  });

  it("🔑 단서가 발동하는 입력(150,000,000 / 5,000,000)에서 A 토지 필요경비 = 증여세 50,000,000 + 이월과세 아닌 카드(OFF)의 몫 (Q-2 배분 규칙 재사용)", async () => {
    const on = await post(estimatedBody(estimatedGbv(exp(150_000_000, 5_000_000))));
    const off = await post(estimatedBody(estimatedGbv({ ...exp(150_000_000, 5_000_000), ...OFF_LAND })));
    expect(land(on).ne).toBe(50_000_000 + land(off).ne);
    // 합계 불변식 — 토지·건물 카드가 받은 본인 몫의 합은 입력한 본인 지출과 같다.
    expect(land(off).ne + off.cards.find((c) => c.id === "building")!.ne).toBe(155_000_000);
  });

  it("🔑 단서가 불발인 입력(3,000,000 / 5,000,000)에서도 A 는 본인 지출을 쓴다 — OFF 카드는 본문(개산공제 2,394,000)이지만 A 는 제97조제2항제1호 몫 6,595,232", async () => {
    const on = await post(estimatedBody(estimatedGbv(exp(3_000_000, 5_000_000))));
    const off = await post(estimatedBody(estimatedGbv({ ...exp(3_000_000, 5_000_000), ...OFF_LAND })));
    expect(land(off).ne).toBe(2_394_000);
    // 8,000,000 × 77,248,965 / (77,248,965 + 16,453,826) = 6,595,232 (토지 몫 · 잔액은 건물)
    expect(land(on).ne).toBe(50_000_000 + 6_595_232);
  });

  it("손계산 일치 — 150,000,000 / 5,000,000: 토지 본인 몫 127,782,635 · A 양도차익 90,671,774 · 건물 27,217,365", async () => {
    const r = await post(estimatedBody(estimatedGbv(exp(150_000_000, 5_000_000))));
    expect(land(r).ne).toBe(50_000_000 + 127_782_635);
    expect(land(r).aGain).toBe(318_454_409 - 50_000_000 - 50_000_000 - 127_782_635);
    expect(land(r).aGain).toBe(90_671_774);
    expect(r.cards.find((c) => c.id === "building")!.ne).toBe(27_217_365);
  });

  it("대조군 — 이월과세 아닌 카드(OFF)의 결정세액은 이 수정으로 변하지 않는다", async () => {
    // 수정 前(PR-1 기준 브랜치) 실측값 — 비이월과세 카드는 `capitalExpenditure`를 새로 싣지 않는다.
    const off = await post(estimatedBody(estimatedGbv({ ...exp(150_000_000, 5_000_000), ...OFF_LAND })));
    expect(off.tax).toBe(39_813_578);
    expect(land(off).ne).toBe(127_782_635);
  });
});

describe("GBCO-2 환산 경로 × 토지 이월과세(증여자 환산) — 단서(나목>가목) 구간에서만 소실이었다", () => {
  const donorEst = { landCarryoverTaxation: ct({ useEstimatedAcquisition: true, donorAcquisitionPrice: 0, donorStandardPriceAtAcquisition: 40_000_000 }) };
  it.each([
    [0, 0, 38_353_881],
    [3_000_000, 5_000_000, 38_353_881], // 본인 지출 < 증여자 가목(환산취득가 + 개산공제) → 본문 · 수정 前후 불변
    [150_000_000, 0, 14_414_846], // 수정 前 34,791,787
    [150_000_000, 5_000_000, 13_511_632], // 수정 前 34,484,494
  ])("자본적지출 %i · 양도비 %i → 결정세액 %i", async (capex, tr, tax) => {
    const r = await post(estimatedBody(estimatedGbv({ ...donorEst, ...exp(capex, tr) })));
    expect(r.tax).toBe(tax);
  });
});

describe("GBCO-3 B-2 — 비교과세(B)에는 본인 개산공제가 아니라 본인 지출만 들어간다 (Q-3)", () => {
  it("본인 지출 0이어도 0을 명시한다 — B 양도차익 = 평가액 기준 118,454,409 (개산공제 2,394,000 없음 · 실가 경로와 같다)", async () => {
    const r = await post(estimatedBody(estimatedGbv()));
        expect(land(r).bGain).toBe(118_454_409);
  });

  it("적용배제(기간초과 2010)로 B 로 돌아가도 필요경비는 본인 지출뿐이다 — 0 / 3,000,000 몫 2,473,212", async () => {
    const excluded = { landCarryoverTaxation: ct({ giftRegistryDate: "2010-03-17" }) };
    const zero = await post(estimatedBody(estimatedGbv(excluded)));
    expect(land(zero).eligible).toBe(false);
    expect(land(zero).exclusion).toBe("period_exceeded");
    expect(land(zero).acq).toBe(200_000_000);
    expect(land(zero).ne).toBe(0); // 수정 前 2,394,000 (개산공제)
    expect(land(zero).gain).toBe(118_454_409);
    const three = await post(estimatedBody(estimatedGbv({ ...excluded, capitalExpenditure: 3_000_000 })));
    expect(land(three).ne).toBe(2_473_212);
    expect(land(three).gain).toBe(115_981_197);
  });
});

describe("GBCO-4 실가 경로 × 토지 이월과세 — 카드 expenses 가 곧 본인 몫이다", () => {
  // 수정 前: 35,101,430 · 34,917,054 · 34,855,827(3M/5M) · 25,882,645 · 25,821,418 — 0/0 만 불변
  it.each([
    [0, 0, 35_101_430],
    [3_000_000, 0, 34_311_117],
    [0, 5_000_000, 33_858_062],
    [3_000_000, 5_000_000, 33_067_749],
    [150_000_000, 0, 3_465_340],
    [150_000_000, 5_000_000, 2_932_468],
  ])("자본적지출 %i · 양도비 %i → 결정세액 %i", async (capex, tr, tax) => {
    const r = await post(actualBody(actualGbv(exp(capex, tr))));
    expect(r.tax).toBe(tax);
  });

  it("A 토지 필요경비 = 증여세 50,000,000 + OFF 카드 몫 (자본적지출은 취득시 기준시가, 양도비는 양도가액 비례)", async () => {
    const on = await post(actualBody(actualGbv(exp(3_000_000, 5_000_000))));
    const off = await post(actualBody(actualGbv({ ...exp(3_000_000, 5_000_000), ...OFF_LAND })));
    // 자본적지출 3,000,000 × 79,800,000 / 96,797,190 = 2,473,212 · 양도비 5,000,000 × 318,454,409 / 330,000,000 = 4,825,066
    expect(land(off).ne).toBe(2_473_212 + 4_825_066);
    expect(land(on).ne).toBe(50_000_000 + 7_298_278);
    // 손계산: 양도차익 318,454,409 − 50,000,000 − 57,298,278 = 211,156,131 (장특 30% → 147,809,292 − 건물 손실 6,715,722 − 2,500,000 → ×35% − 15,440,000)
    expect(land(on).aGain).toBe(211_156_131);
  });
});

describe("GBCO-5 지분(%) 분할 × 이월과세 — 지분 카드도 같은 몫을 받는다 (Q-6: 같은 메커니즘이라 차단 불필요)", () => {
  const level = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" };
  const valuation = (acqL: number, acqB: number, o: object = {}) => ({ ...level, acquisitionLandPricePerSqm: acqL, acquisitionBuildingStdPrice: acqB, buildingAcquisitionCause: "purchase", ...o });
  const carry = { landAcquisitionCause: "carryover_gift", landCarryoverTaxation: { giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 60_000_000, useEstimatedAcquisition: false, giftTaxAmount: 12_000_000, giftDateValuation: 160_000_000 } };
  const shareA = { shareId: "a", shareLabel: "60%", ownershipRatio: 0.6, acquisitionDate: "2009-03-01", valuation: valuation(1_000_000, 100_000_000) };
  const shareB = (o: object) => ({ shareId: "b", shareLabel: "40%", ownershipRatio: 0.4, acquisitionDate: "2021-03-01", valuation: valuation(1_500_000, 150_000_000, { ...carry, ...o }) });
  const body = (shares: object[]) => ({
    ...COMMON, transferDate: "2024-03-01", acquisitionDate: "2009-03-01", transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000,
    generalBuildingValuation: (shares[0] as { valuation: object }).valuation, generalBuildingShares: shares,
  });
  const land1 = (r: { cards: Card[] }) => r.cards.find((c) => c.id === "land#1")!;

  it("본인 자본적지출 10,000,000 → 지분 B 토지 A 필요경비 17,000,000 (= 증여세 12,000,000 + 몫 5,000,000) · A 양도차익 123,000,000", async () => {
    const r = await post(body([shareA, shareB({ capitalExpenditure: 10_000_000 })]));
    expect(land1(r).ne).toBe(17_000_000);
    expect(land1(r).aGain).toBe(200_000_000 - 60_000_000 - 17_000_000);
  });
  it("양도비 3,000,000 을 더하면 몫 6,500,000 (13,000,000 × 토지 가액 50%)", async () => {
    const r = await post(body([shareA, shareB({ capitalExpenditure: 10_000_000, transferExpense: 3_000_000 })]));
    expect(land1(r).ne).toBe(12_000_000 + 6_500_000);
  });
  it("본인 지출이 가목을 넘어 단서가 발동해도(300,000,000) 토지 몫은 150,000,000", async () => {
    const r = await post(body([shareA, shareB({ capitalExpenditure: 300_000_000 })]));
    expect(land1(r).ne).toBe(150_000_000);
    expect(land1(r).aGain).toBe(-10_000_000); // 200,000,000 − 60,000,000 − 12,000,000 − 150,000,000 (차손)
  });
});

describe("GBCO-6 신고서 항등식 (계획서 V-4) — 취득가액 칸 + 필요경비 칸 = 양도가액 − 양도차익", () => {
  /**
   * 일반건물 카드가 본인 몫을 `capitalExpenditure`로 싣기 시작하면 `capitalExpenditureForDisplay`(신고서가 이월과세 A 에서 취득가액 칸으로 옮겨 얹는 값)도 양수가 된다.
   * 증여자 환산 + 단서 불발(본문 = 개산공제) 또는 환산취득가를 빼지 않는 단서 발동 표시(acq=환산취득가 · ne=역산 나머지)에서는 그 값이 필요경비보다 커져
   * 칸 합이 어긋났다 — `transfer-tax-aggregate-once.ts`가 필요경비로 상한한다.
   */
  const donorEst = (gift: number) => ({ landCarryoverTaxation: ct({ useEstimatedAcquisition: true, donorAcquisitionPrice: 0, donorStandardPriceAtAcquisition: 40_000_000, giftTaxAmount: gift }) });
  async function identityHolds(body: object): Promise<boolean[]> {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    return json.data.aggregated.properties.map((p: Parameters<typeof capExInAcquisitionColumnOfProperty>[0]) => {
      const shift = capExInAcquisitionColumnOfProperty(p);
      return p.transferPrice - (p.acquisitionPrice + shift + Math.max(0, p.necessaryExpense - shift)) === p.transferGain;
    });
  }
  it.each([
    ["환산 경로 · 증여자 실가 · 150,000,000/5,000,000", estimatedBody(estimatedGbv(exp(150_000_000, 5_000_000)))],
    ["환산 경로 · 증여자 실가 · 3,000,000/5,000,000", estimatedBody(estimatedGbv(exp(3_000_000, 5_000_000)))],
    ["환산 경로 · 증여자 환산 · 증여세 0 · 3,000,000/5,000,000 (단서 불발)", estimatedBody(estimatedGbv({ ...donorEst(0), ...exp(3_000_000, 5_000_000) }))],
    ["환산 경로 · 증여자 환산 · 증여세 0 · 150,000,000/5,000,000 (단서 발동)", estimatedBody(estimatedGbv({ ...donorEst(0), ...exp(150_000_000, 5_000_000) }))],
    ["환산 경로 · 증여자 환산 · 증여세 50,000,000 · 150,000,000/5,000,000", estimatedBody(estimatedGbv({ ...donorEst(50_000_000), ...exp(150_000_000, 5_000_000) }))],
    ["실가 경로 · 증여자 실가 · 3,000,000/5,000,000", actualBody(actualGbv(exp(3_000_000, 5_000_000)))],
    ["실가 경로 · 증여자 환산 · 증여세 0 · 3,000,000/5,000,000", actualBody(actualGbv({ ...donorEst(0), ...exp(3_000_000, 5_000_000) }))],
  ])("%s", async (_n, body) => {
    expect(await identityHolds(body)).not.toContain(false);
  });
});
