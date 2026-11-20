/**
 * NBL2611-D1 (R20) Pre-Do anchor — 기간 축 후속: 주택부수토지 유예(Q-3a (나)) · 당해 사업개시일(Q-4 (나) DM-01).
 *   V2-C1  주택부수토지 배율 초과분에 영 §168의14① 유예만 반영한다(배율 초과 상태는 전 기간 지속으로 보되 유예 구간만 사업용).
 *   V2-C2  기타토지 수입금액비율 화면이 받은 「당해 사업개시일」을 판정에 쓴다(직전 비율②가 미통과일 때만 사업 구간 [개시일, 양도일]).
 *
 * 금액은 모의 세율(`makeMockRates`) 기준이라 방향·규모만 유효하다. 판정·비율로 단언하고, 세액은 독립 경로(같은 거래의 전량 사업용·전량 비사업용 세액)로 검산한다.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { consumesGracePeriods } from "@/lib/tax-engine/non-business-land/land-category";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { GracePeriod, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const minusDays = (s: string, n: number) => iso(new Date(d(s).getTime() - n * 86_400_000));

const grace = (start: string, end: string): GracePeriod => ({ reasonCode: "use_prohibited", startDate: d(start), endDate: d(end) });

/** 거래: 양도 10억 · 취득 3억 · 보유 10년 — 같은 세율 출처로 전량 사업용·전량 비사업용·부분 비사업용 세액을 비교한다. */
function tax(nbl: NonBusinessLandInput) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: nbl.acquisitionDate,
      transferDate: nbl.transferDate,
      isOneHousehold: false,
      nonBusinessLandDetails: nbl,
    }),
    makeMockRates(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-3a (나) — 주택부수토지 배율 초과분 + 유예
// ─────────────────────────────────────────────────────────────────────────────

/** 도시지역 수도권 밖 일반주거 5배 · 정착면적 20㎡ → 허용 100㎡ · 토지 200㎡ → 초과 100㎡(비율 0.5). 2014-01-01 → 2024-01-01. */
function housing(over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "housing_site",
    landArea: 200,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    housingFootprint: 20,
    isMetropolitanArea: false,
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("Q-3a — 주택부수토지 배율 초과분에 유예만 반영", () => {
  it("HG-1: 🔴 유예 전 기간 → 초과분이 사업용으로 돌아 전량 사업용 (정정 전: 비율 0.5 비사업용)", () => {
    const j = judgeNonBusinessLand(housing({ gracePeriods: [grace("2014-01-02", "2024-01-01")] }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0);
    expect(j.periodEvaluation?.graceJudged?.meets).toBe(true);
  });

  it("HG-2: 대조군 — 유예 입력이 없으면 현행 그대로(비율 0.5 · not_judged · 「양도일 현재 상태」 고지)", () => {
    const j = judgeNonBusinessLand(housing(), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.5);
    expect(j.periodEvaluation?.basis).toBe("not_judged");
    expect(j.periodEvaluation?.graceJudged).toBeUndefined();
  });

  it("HG-3: 경계 — 양도일 직전 3년 중 유예 730일 → 사업용 · 729일 → 비사업용 (§168의6 1호 나목 「직전 3년 중 1년(365일) 초과」)", () => {
    const at730 = judgeNonBusinessLand(housing({ gracePeriods: [grace("2022-01-01", "2024-01-01")] }), R);
    expect(at730.gracePeriodDays).toBe(730);
    expect(at730.isNonBusinessLand).toBe(false);
    const at729 = judgeNonBusinessLand(housing({ gracePeriods: [grace("2022-01-02", "2024-01-01")] }), R);
    expect(at729.gracePeriodDays).toBe(729);
    expect(at729.isNonBusinessLand).toBe(true);
    expect(at729.surcharge.nonBusinessAreaRatio).toBe(0.5); // 면적 안분은 그대로
  });

  it("HG-4: 유예가 기간기준을 못 채우면 판정은 그대로이고 echo는 일수·미충족을 사실대로 말한다", () => {
    const j = judgeNonBusinessLand(housing({ gracePeriods: [grace("2023-01-02", "2024-01-01")] }), R); // 364일
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.periodEvaluation?.basis).toBe("state_at_transfer");
    expect(j.periodEvaluation?.graceJudged).toEqual({ gracePeriodDays: 364, totalOwnershipDays: j.totalOwnershipDays, meets: false });
  });

  it("HG-5: 배율 이내면 유예를 판정할 초과분이 없다 — 전량 사업용 그대로 · echo 없음", () => {
    const j = judgeNonBusinessLand(housing({ landArea: 100, gracePeriods: [grace("2014-01-02", "2024-01-01")] }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.periodEvaluation?.graceJudged).toBeUndefined();
    expect(j.areaProportioning?.buildingMultiplier).toBe(5);
  });

  it("HG-6: 유예로 사업용이 돼도 배율·면적 echo는 남는다(사업용 면적 전체 · 초과 0)", () => {
    const j = judgeNonBusinessLand(housing({ gracePeriods: [grace("2014-01-02", "2024-01-01")] }), R);
    expect(j.areaProportioning).toMatchObject({ totalArea: 200, businessArea: 200, nonBusinessArea: 0, nonBusinessRatio: 0, buildingMultiplier: 5 });
  });

  it("HG-7: 소비 술어·엔진 고지 — 주택부수토지는 유예를 읽는다(「반영되지 않았습니다」 경고 없음), 건물 부수토지는 그대로", () => {
    expect(consumesGracePeriods("housing_site")).toBe(true);
    expect(consumesGracePeriods("building_site")).toBe(false);
    const j = judgeNonBusinessLand(housing({ gracePeriods: [grace("2014-01-02", "2024-01-01")] }), R);
    expect(j.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(false);
  });

  it("HG-8: 세액 — 유예 전 기간이면 전량 사업용 세액, 없으면 부분 비사업용 세액(같은 세율 출처 · 독립 검산)", () => {
    const withGrace = tax(housing({ gracePeriods: [grace("2014-01-02", "2024-01-01")] }));
    const without = tax(housing());
    const allBusiness = tax(housing({ landArea: 100 })); // 전량 사업용 대조(배율 이내)
    const allNonBusiness = tax(housing({ landArea: 100, housingFootprint: 0 })); // 정착면적 0 → 전량 비사업용 대조
    expect(withGrace.calculatedTax).toBe(allBusiness.calculatedTax);
    expect(without.calculatedTax).toBeGreaterThan(allBusiness.calculatedTax);
    expect(without.calculatedTax).toBeLessThan(allNonBusiness.calculatedTax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q-4 (나) — DM-01: 당해 사업개시일
// ─────────────────────────────────────────────────────────────────────────────

type RT = NonNullable<NonBusinessLandInput["revenueTest"]>;

/** 잡종지 · 종합합산 · 건축물 없음 · 주차장운영업 수입금액비율 충족(20% ≥ 기준). 2014-01-01 → 2024-06-30. */
function other(rt: Partial<RT> = {}, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "commercial",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-06-30"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false },
    revenueTest: { businessType: "parking_operation", currentRevenue: 20_000_000, currentLandValue: 100_000_000, ...rt },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("Q-4 (나) DM-01 — 당해 사업개시일 + 직전 비율② 미통과 → 사업 구간 [개시일, 양도일]", () => {
  it("DM-1: 🔴 개시일 2024-03-01 · 직전 데이터 없음 → 소유 10년 중 사업 약 4개월 → 비사업용 (정정 전: 수입금액비율 충족으로 전 기간 사업용)", () => {
    const j = judgeNonBusinessLand(other({ currentBusinessStartDate: d("2024-03-01") } as Partial<RT>), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
  });

  it("DM-2: 대조군 — 개시일 미입력은 현행 그대로(수입금액비율 충족 → 사업용)", () => {
    const j = judgeNonBusinessLand(other(), R);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("DM-3: 직전 비율②가 통과면 개시일이 있어도 전 기간(현행) — 직전 과세기간에 이미 사업 실적이 있다", () => {
    const j = judgeNonBusinessLand(
      other({ currentBusinessStartDate: d("2024-03-01"), priorRevenue: 20_000_000, priorLandValue: 100_000_000 } as Partial<RT>),
      R,
    );
    expect(j.revenueTestDetail?.ratioCombined).toBeGreaterThanOrEqual(j.revenueTestDetail?.threshold ?? 1);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("DM-4: 직전 비율②가 있으나 미통과(당해 ①만 충족: 직전 수입 0 · 직전 토지가액 큼)면 개시일을 쓴다", () => {
    const j = judgeNonBusinessLand(
      other({ currentBusinessStartDate: d("2024-03-01"), priorRevenue: 0, priorLandValue: 10_000_000_000 } as Partial<RT>),
      R,
    );
    expect(j.revenueTestDetail?.ratioCurrent).toBeGreaterThanOrEqual(j.revenueTestDetail?.threshold ?? 1);
    expect(j.revenueTestDetail?.ratioCombined).toBeLessThan(j.revenueTestDetail?.threshold ?? 0);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.revenueTestDetail?.businessStartJudged).toMatchObject({ startDate: "2024-03-01", meets: false });
  });

  it("DM-5: 경계 — 사업 구간이 양도일 직전 3년 중 비사업 365일 이하면 사업용 · 366일이면 비사업용 (§168의6 1호 나목)", () => {
    // 직전 3년 창 = 양도일 −3년(달력) ~ 양도일. 비사업 일수 = 창 길이 − (양도일 − 개시일).
    const T = "2024-06-30";
    const win3 = Math.round((d(T).getTime() - d("2021-06-30").getTime()) / 86_400_000);
    const sOk = minusDays(T, win3 - 365); // 비사업 365일 → 나목 미충족(초과 아님) → 사업용
    const sNg = minusDays(T, win3 - 366); // 비사업 366일 → 나목 충족 → 가·다목도 충족 → 비사업용
    expect(judgeNonBusinessLand(other({ currentBusinessStartDate: d(sOk) } as Partial<RT>), R).isNonBusinessLand).toBe(false);
    expect(judgeNonBusinessLand(other({ currentBusinessStartDate: d(sNg) } as Partial<RT>), R).isNonBusinessLand).toBe(true);
  });

  it("DM-6: 유예가 있으면 개시일 구간과 합집합으로 본다(겹침 이중 계상 없음)", () => {
    const j = judgeNonBusinessLand(
      other({ currentBusinessStartDate: d("2024-03-01") } as Partial<RT>, { gracePeriods: [grace("2014-01-02", "2024-02-29")] }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("DM-7: 세액 — 개시일 반영 시 전량 비사업용 세액, 미반영(대조)은 사업용 세액", () => {
    const base = tax(other());
    const withStart = tax(other({ currentBusinessStartDate: d("2024-03-01") } as Partial<RT>));
    expect(withStart.calculatedTax).toBeGreaterThan(base.calculatedTax);
  });
});
