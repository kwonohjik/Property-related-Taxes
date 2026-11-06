/**
 * anchor — §155⑳ 거주주택 특례 경로의 조특법 §99·§99의3 계산 (리뷰 NH-37 · Q-19)
 *
 * 종전: 이 경로는 §99·§99의3을 «미반영 (차감형)»으로 두고 「고가주택 배제 단서가 명문이므로 적용 대상이 아닙니다」라고 단정했다.
 *   그러나 단서의 «고가주택»은 2003.1.1. 이후 계약·사용승인분만 양도 당시 소득세법 §89①3호 기준이고,
 *   그 전 계약·사용승인분은 법률 제6762호 부칙 §29①에 따라 계약·승인일 당시의 «고급주택» 기준(면적 AND 가액)이다.
 *   12억을 넘는다는 사실만으로 배제되지 않는다 — 일반 경로 라우터(`resolveIncomeDeduction`)가 이미 그렇게 판정한다.
 * 적용 순서: 서면인터넷방문상담4팀-3614 · 재산세제과-1114 — 고가주택이면 소득세법 §95③·령 §160 적용 후 §99·§99의3 적용.
 *   §161 안분과 차감 사이의 순서를 직접 다룬 해석은 확인하지 못했다 → 확인 필요 고지.
 *
 * 세율표는 mock(정본 세액 아님). 전(前) 실측(아래 픽스처): §99의3 · §99 모두 산출세액 76,390,000 · 총세액 84,029,000 (감면 없음과 같음).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const rentalUnit = {
  businessRegistrationDate: D("2015-06-01"), rentalRegistrationDate: D("2015-06-01"), rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 120, rentalAutoTermination: false, requirementsConfirmed: true,
};
const rheA = { applyException: true, scenario: "A" as const, rentalUnits: [rentalUnit] };

const R993 = (o: Record<string, unknown> = {}) => ({
  type: "new_99_3" as const, contractDate993: D("2002-05-01"), standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84, region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const, firstContract993: "yes" as const, isResident993: true, isHousingConstructionBusiness993: false, ...o,
});
const R99 = (o: Record<string, unknown> = {}) => ({
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 400_000_000, exclusiveAreaSqm99: 84, ...o,
});

// 12억 초과 고가주택 · 보유 24년 · 거주 5년 — 특례 경로의 과세대상 양도소득금액 256,000,000
const fx = (o: Record<string, unknown>) =>
  baseTransferInput({
    propertyType: "housing", acquisitionDate: D("2002-09-01"), transferDate: D("2026-03-01"), residencePeriodMonths: 60,
    isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    transferPrice: 2_000_000_000, acquisitionPrice: 400_000_000, ...o,
  } as never);
const rhe = (reductions: unknown[], o: Record<string, unknown> = {}) =>
  calculateTransferTax(fx({ rentalHousingException: rheA, reductions, ...o }), rates);

const NO_RED = { calc: 76_390_000, tot: 84_029_000 };

describe("NH-37 §99의3 — 2003.1.1. 전 계약분은 고가주택이어도 계산한다 (부칙 §29①)", () => {
  it("계약 2002-05-01 · 5년 후 양도: 256,000,000 × (200−100)/(400−100) 차감 → 산출 43,963,333 · 농특세 6,485,333 · 총 54,844,999", () => {
    const r = rhe([R993()]);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(r.new993Detail?.reducibleTransferIncome).toBe(85_333_333);
    expect(r.calculatedTax).toBe(43_963_333);
    expect(r.ruralSurtax).toBe(6_485_333);
    expect(r.totalTax).toBe(54_844_999);
    expect(r.determinedTax! + r.localIncomeTax! + r.ruralSurtax!).toBe(r.totalTax);
    // 전: 감면 없는 대조와 같았다
    expect(r.totalTax).toBeLessThan(NO_RED.tot);
  });
  it("일반 경로(§155⑳ 아님)와 같은 고가주택 안분·장특·차감 결과다 (산출세액 · 농특세 일치)", () => {
    const rh = rhe([R993()]);
    const g = calculateTransferTax(fx({ reductions: [R993()] }), rates);
    expect(rh.calculatedTax).toBe(g.calculatedTax);
    expect(rh.ruralSurtax).toBe(g.ruralSurtax);
  });
  it("확인 필요 고지(적용 순서)가 warnings와 steps에 남는다", () => {
    const r = rhe([R993()]);
    expect((r.warnings ?? []).some((w) => w.includes("서면인터넷방문상담4팀-3614") && w.includes("확인 필요"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("§99의3 신축주택 과세특례 — 양도소득금액 차감"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("§99의3 농어촌특별세"))).toBe(true);
  });
  it("짝: 2003.1.1. 이후 계약분은 양도 당시 §89①3호 고가주택이라 불성립 — 세액은 감면 없는 대조와 같다", () => {
    const r = rhe([R993({ contractDate993: D("2003-03-01") })], { acquisitionDate: D("2003-09-01") });
    const ctl = rhe([], { acquisitionDate: D("2003-09-01") });
    expect(r.new993Detail?.isEligible).toBe(false);
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code)).toContain("HIGH_VALUE_HOUSE");
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.ruralSurtax ?? 0).toBe(0);
  });
  it("짝: 감면을 고르지 않으면 종전과 같다 — 산출 76,390,000 · 총 84,029,000 · 고지 없음", () => {
    const r = rhe([]);
    expect(r.calculatedTax).toBe(NO_RED.calc);
    expect(r.totalTax).toBe(NO_RED.tot);
    expect(r.warnings ?? []).toHaveLength(0);
  });
});

describe("NH-37 §99 — 같은 규칙 (1998.5.22~1999.6.30. 신축주택취득기간)", () => {
  const over = { acquisitionDate: D("1999-01-01") };
  it("계약 1998-06-01: 차감 비율 0.2 · 감면대상 51,200,000 → 산출 56,934,000 · 농특세 3,891,200 · 총 66,518,600", () => {
    const r = rhe([R99()], over);
    expect(r.new99Detail?.isEligible).toBe(true);
    expect(r.new99Detail?.fiveYearRatio).toBe(0.2);
    expect(r.new99Detail?.reducibleTransferIncome).toBe(51_200_000);
    expect(r.calculatedTax).toBe(56_934_000);
    expect(r.ruralSurtax).toBe(3_891_200);
    expect(r.totalTax).toBe(66_518_600);
  });
  it("짝: 종전 고급주택 기준(단독 연면적 264㎡ 이상 + 가액)에 해당하면 고가주택 단서로 불성립 — 세액 = 대조", () => {
    const lux = R99({ houseType99: "detached", grossFloorAreaSqm99: 300, stdPriceFloorMet99: "yes", luxuryFacility99: "no" });
    const r = rhe([lux], over);
    const ctl = rhe([], over);
    expect(r.new99Detail?.isEligible).toBe(false);
    expect(r.new99Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(ctl.totalTax);
  });
});

describe("NH-37 형제 안전망 — 다른 차감형은 종전대로 미반영 고지 (F08-02 유지)", () => {
  it("§98의3은 계산하지 않고 고지하며, 고지 문구에서 «§99·§99의3 적용 대상 아님» 단정이 빠졌다", () => {
    const r = rhe([{ type: "unsold_98_3" as const, region: "metropolitan" as const }]);
    expect(r.totalTax).toBe(NO_RED.tot);
    const w = (r.warnings ?? [])[0] ?? "";
    expect(w).toMatch(/차감형\)은 이 계산에 반영되지 않았습니다/);
    expect(w).not.toContain("고가주택 배제 단서가 명문");
  });
  it("§99의3 + §98의3 동시 선택: §99의3만 계산하고 §98의3은 고지한다", () => {
    const r = rhe([R993(), { type: "unsold_98_3" as const, region: "metropolitan" as const }]);
    expect(r.calculatedTax).toBe(43_963_333);
    expect((r.warnings ?? []).some((w) => /차감형\)은 이 계산에 반영되지 않았습니다/.test(w))).toBe(true);
  });
});
