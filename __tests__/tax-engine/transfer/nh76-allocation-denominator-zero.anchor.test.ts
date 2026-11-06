/**
 * anchor — §99·§99의3 안분 산식의 분모 0 (리뷰 NH-76 · Q-20)
 *
 * 결함: 양도 당시 기준시가 = 취득 당시 기준시가(분모 0)이면 `calcSignedAllocation`이 «그 외» 분기로 보내
 *   근거 없이 감면 0을 냈다. 분모가 1원만 달라져도 (+,+) 안분 또는 (+,-) 전액 감면이라 1원 절벽이었다.
 * 결정(Q-20): 분모 0은 안분 비율이 정의되지 않으므로 «계산 불가 + 확인 필요» — 감면을 계산하지 않고 사유를 알린다.
 *
 * 인용 정정: 부호 (-,-) → 0 의 근거는 «법규재산2014-2035»(2014.11.20., 국세청 법령해석 — 5년시점 888 < 취득시 992,
 *   양도시 737 사례)다. 종전 주석의 «재산 2014-2035»는 형식이 달랐다(재산세과-2035는 2008.7.31. 직선거리 20km 해석).
 *
 * 세율표는 mock(정본 세액 아님) — 상대 비교가 목적이다. 전(前) 실측: 분모 0 → eligible=true·signCase=all_negative·감면 0,
 *   분모 +1 → 감면 350,000,000 · 세액 22,612,000 (절벽).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { evaluateNew99 } from "@/lib/tax-engine/transfer-reductions/new-99";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const mk = (reductions: unknown[], over: Record<string, unknown> = {}) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 300_000_000,
      acquisitionDate: D("2004-09-01"), transferDate: D("2023-08-01"), householdHousingCount: 2,
      reductions, ...over,
    } as never),
    rates,
  );

const R993 = (acq: number, tr: number, over: Record<string, unknown> = {}) => ({
  type: "new_99_3" as const, contractDate993: D("2002-05-01"), standardPriceAtAcquisition993: acq, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: tr, exclusiveAreaSqm993: 84, region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const, firstContract993: "yes" as const, isResident993: true, isHousingConstructionBusiness993: false, ...over,
});
const R99 = (acq: number, tr: number, over: Record<string, unknown> = {}) => ({
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: acq, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: tr, exclusiveAreaSqm99: 84, ...over,
});
const OVER99 = { acquisitionDate: D("1999-01-01"), transferDate: D("2022-08-01") };
const T_NO_REDUCTION = 124_366_000;
const T_FULL = 22_612_000;

describe("NH-76 §99의3 — 분모 0은 계산 불가 + 확인 필요", () => {
  it("분모 0 (양도시 = 취득시 1억): 불성립 · 감면 0 · 확인 필요 사유", () => {
    const d = mk([R993(100_000_000, 100_000_000)]).new993Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.signCase).toBe("ineligible");
    expect(d.reducibleTransferIncome).toBe(0);
    expect(d.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(d.ineligibleReasons[0].message).toContain("확인 필요");
    expect(d.ineligibleReasons[0].message).toContain("분모가 0");
    expect(mk([R993(100_000_000, 100_000_000)]).totalTax).toBe(T_NO_REDUCTION);
  });
  it("짝: 분모 +1은 종전대로 (+,+) 안분 — 감면 350,000,000 · 세액 22,612,000", () => {
    const r = mk([R993(100_000_000, 100_000_001)]);
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("all_positive");
    expect(r.new993Detail!.reducibleTransferIncome).toBe(350_000_000);
    expect(r.totalTax).toBe(T_FULL);
  });
  it("짝: 분모 −1은 종전대로 (+,-) 전액 감면 (부동산-525 선례 유지)", () => {
    const r = mk([R993(100_000_000, 99_999_999)]);
    expect(r.new993Detail!.signCase).toBe("pos_neg");
    expect(r.totalTax).toBe(T_FULL);
  });
  it("짝: 5년 이내 양도(재개발 변형 아님)는 기준시가를 보지 않는다 — 분모 0이어도 전액 차감", () => {
    const r = mk([R993(100_000_000, 100_000_000)], { transferDate: D("2008-08-01") });
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("within_5_years");
  });
  it("재개발 변형: 분모 = 양도시 − 종전주택 취득시 — 종전주택 기준시가 = 양도시이면 분모 0", () => {
    const variant = { isRedevelopedNewHouse993: true, previousHouseStdPrice993: 400_000_000 };
    const d = mk([R993(100_000_000, 400_000_000, variant)]).new993Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(d.ineligibleReasons[0].message).toContain("종전주택 취득 당시");
  });
  it("법규재산2014-2035 (-,-) 사례(888 < 992, 737 < 888)는 종전대로 감면 0 · 적용 가능 상태", () => {
    const d = mk([R993(992_000_000, 737_000_000, { standardPriceAt5Years: 888_000_000 })]).new993Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("all_negative");
    expect(d.reducibleTransferIncome).toBe(0);
  });
});

describe("NH-76 §99 — 같은 규칙", () => {
  it("분모 0: 불성립 · 확인 필요 · 세액 = 감면 없음", () => {
    const r = mk([R99(100_000_000, 100_000_000)], OVER99);
    expect(r.new99Detail!.isEligible).toBe(false);
    expect(r.new99Detail!.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(r.new99Detail!.ineligibleReasons[0].message).toContain("확인 필요");
    expect(r.totalTax).toBe(T_NO_REDUCTION);
  });
  it("짝: 분모 +1은 종전대로 안분 — 세액 22,612,000", () => {
    const r = mk([R99(100_000_000, 100_000_001)], OVER99);
    expect(r.new99Detail!.isEligible).toBe(true);
    expect(r.new99Detail!.signCase).toBe("all_positive");
    expect(r.totalTax).toBe(T_FULL);
  });
  it("재개발 변형 5년 이내: 분모 = 양도시 − 종전주택 취득시 → 0이면 계산 불가", () => {
    const r = evaluateNew99({
      transferDate: D("2002-01-01"), acquisitionDate: D("1999-01-01"), contractDate: D("1998-06-01"),
      transferIncome: 500_000_000, wholePropertyTransferPrice: 500_000_000, exclusiveAreaSqm: 84,
      acquisitionType: "from_builder", firstContract: "yes", isNationalHousing: false,
      standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 300_000_000,
      isRedevelopedNewHouse: true, previousHouseStdPriceAtAcquisition: 300_000_000,
    });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(r.ineligibleReasons[0].message).toContain("종전주택 취득 당시");
  });
});
