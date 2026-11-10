/**
 * anchor — §99·§99의3 안분 산식의 분모 0 (리뷰 NH-76 · Q-20 → US-36으로 규칙 변경)
 *
 * US-36 (2026-11-10 사용자 결정): 분모 0 규칙을 «계산 불가 + 확인 필요»(Q-20, #2979)에서 «전액»으로 바꾼다.
 *   (분자>0, 분모=0) → 비율 1 · 전액(부동산납세과-412 요지 문언 — 양도시 = 취득시 < 5년시점) + 「확인 필요」 고지(직접 해석례 없음)
 *   (분자=0, 분모=0)·(분자<0, 분모=0) → 0 (분자 ≤ 0이면 5년간 발생분 없음 — 재산세제과-274 · 부동산거래관리과-136 계열)
 *   손계산 근거: 분모 ±1원 양옆이 이미 전액(+,+ 상한 · +,- )이므로 분모 0도 같은 값 — 감면 350,000,000 · 세액 22,612,000.
 *   분자 ≤ 0은 («감면 없음» 대조) 124,366,000과 같다. 아래는 종전 Q-20 단언을 새 규칙으로 바꾼 것이다.
 *
 * (이하 종전 Q-20 헤더)
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

describe("US-36 §99의3 — 분모 0은 전액 + 확인 필요", () => {
  it("분모 0 (양도시 = 취득시 1억, 5년시점 2억): 적격 · 전액 감면 350,000,000 · 세액 22,612,000 · 확인 필요 고지", () => {
    const r = mk([R993(100_000_000, 100_000_000)]);
    const d = r.new993Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("pos_zero");
    expect(d.fiveYearRatio).toBe(1);
    expect(d.reducibleTransferIncome).toBe(350_000_000);
    expect(d.ineligibleReasons).toEqual([]);
    expect(d.warnings?.some((w) => w.includes("분모 0") && w.includes("부동산납세과-412") && w.includes("확인 필요"))).toBe(true);
    expect(d.formulaSteps.some((x) => x.formula?.includes("확인 필요"))).toBe(true);
    expect(r.totalTax).toBe(T_FULL);
  });
  it("연속성: 분모 −1·0·+1이 모두 같은 전액 — 감면 350,000,000 · 세액 22,612,000", () => {
    for (const [tr, sign] of [[99_999_999, "pos_neg"], [100_000_000, "pos_zero"], [100_000_001, "all_positive"]] as const) {
      const r = mk([R993(100_000_000, tr)]);
      expect(r.new993Detail!.signCase, String(tr)).toBe(sign);
      expect(r.new993Detail!.reducibleTransferIncome, String(tr)).toBe(350_000_000);
      expect(r.totalTax, String(tr)).toBe(T_FULL);
    }
  });
  it("(분자=0, 분모=0): 5년시점 = 취득시 = 양도시 → 감면 0 · 적용 가능 상태 · 세액 = 감면 없음 124,366,000", () => {
    const r = mk([R993(100_000_000, 100_000_000, { standardPriceAt5Years: 100_000_000 })]);
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("all_negative");
    expect(r.new993Detail!.reducibleTransferIncome).toBe(0);
    expect(r.totalTax).toBe(T_NO_REDUCTION);
  });
  it("(분자<0, 분모=0): 5년시점 < 취득시 = 양도시 → 감면 0 · 세액 = 감면 없음", () => {
    const r = mk([R993(100_000_000, 100_000_000, { standardPriceAt5Years: 90_000_000 })]);
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("all_negative");
    expect(r.new993Detail!.reducibleTransferIncome).toBe(0);
    expect(r.totalTax).toBe(T_NO_REDUCTION);
  });
  it("짝: 5년 이내 양도(재개발 변형 아님)는 기준시가를 보지 않는다 — 분모 0이어도 전액 차감", () => {
    const r = mk([R993(100_000_000, 100_000_000)], { transferDate: D("2008-08-01") });
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("within_5_years");
  });
  it("재개발 변형: 분모 = 양도시 − 종전주택 취득시 — 종전주택 기준시가 = 양도시이면 분모 0 → 전액, 분모 +1과 같은 값", () => {
    const variant = { isRedevelopedNewHouse993: true, previousHouseStdPrice993: 400_000_000 };
    const z = mk([R993(100_000_000, 400_000_000, variant)]);
    const near = mk([R993(100_000_000, 400_000_001, variant)]);
    expect(z.new993Detail!.isEligible).toBe(true);
    expect(z.new993Detail!.signCase).toBe("pos_zero");
    expect(z.new993Detail!.reducibleTransferIncome).toBe(near.new993Detail!.reducibleTransferIncome);
    expect(z.totalTax).toBe(near.totalTax);
  });
  it("법규재산2014-2035 (-,-) 사례(888 < 992, 737 < 888)는 종전대로 감면 0 · 적용 가능 상태", () => {
    const d = mk([R993(992_000_000, 737_000_000, { standardPriceAt5Years: 888_000_000 })]).new993Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("all_negative");
    expect(d.reducibleTransferIncome).toBe(0);
  });
});

describe("US-36 §99 — 같은 규칙", () => {
  it("분모 0: 적격 · 전액 · 세액 22,612,000 · 확인 필요 고지", () => {
    const r = mk([R99(100_000_000, 100_000_000)], OVER99);
    expect(r.new99Detail!.isEligible).toBe(true);
    expect(r.new99Detail!.signCase).toBe("pos_zero");
    expect(r.new99Detail!.warnings?.some((w) => w.includes("확인 필요"))).toBe(true);
    expect(r.totalTax).toBe(T_FULL);
  });
  it("연속성: 분모 −1·+1도 22,612,000 (분모 0과 같다)", () => {
    for (const tr of [99_999_999, 100_000_001]) expect(mk([R99(100_000_000, tr)], OVER99).totalTax, String(tr)).toBe(T_FULL);
  });
  it("(분자=0, 분모=0)·(분자<0, 분모=0) → 감면 0 · 세액 = 감면 없음", () => {
    for (const y5 of [100_000_000, 90_000_000]) {
      const r = mk([R99(100_000_000, 100_000_000, { standardPriceAt5Years99: y5 })], OVER99);
      expect(r.new99Detail!.isEligible, String(y5)).toBe(true);
      expect(r.new99Detail!.reducibleTransferIncome, String(y5)).toBe(0);
      expect(r.totalTax, String(y5)).toBe(T_NO_REDUCTION);
    }
  });
  it("재개발 변형 5년 이내: 분모 = 양도시 − 종전주택 취득시 → 0이면 전액(양도소득금액 500,000,000)", () => {
    const r = evaluateNew99({
      transferDate: D("2002-01-01"), acquisitionDate: D("1999-01-01"), contractDate: D("1998-06-01"),
      transferIncome: 500_000_000, wholePropertyTransferPrice: 500_000_000, exclusiveAreaSqm: 84,
      acquisitionType: "from_builder", firstContract: "yes", isNationalHousing: false,
      standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 300_000_000,
      isRedevelopedNewHouse: true, previousHouseStdPriceAtAcquisition: 300_000_000,
    });
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("pos_zero");
    expect(r.reducibleTransferIncome).toBe(500_000_000);
  });
});
