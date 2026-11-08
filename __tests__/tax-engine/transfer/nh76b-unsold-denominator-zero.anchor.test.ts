/**
 * anchor — 하이브리드(§98의7 등)·§98의8 안분 산식의 분모 0 (리뷰 NH-76 형제 · L15 · Q-20)
 *
 * #2951이 §99·§99의3에 한 규칙(`nh76-allocation-denominator-zero.anchor.test.ts`)을 같은 `calcSignedAllocation`을 쓰는
 * `unsold-hybrid.ts`·`unsold-98-8.ts`에도 적용한다 — 양도시 = 취득시 기준시가(분모 0)이면 안분 비율이 정의되지 않으므로
 * 근거 없이 공제 0을 내지 않고 «계산 불가 + 확인 필요»로 알린다. 분모가 ±1원만 달라져도 (+,+)·(+,-) 쪽이라 세액이 크게 달라지는 절벽이었다.
 *
 * 전(前) 실측(mock 세율, 같은 시료): §98의7 분모 0 → eligible=true·all_negative·공제 0 · 총 79,849,000 / 분모 +1·−1 → 공제 246,000,000 · 총 14,518,000.
 *   §98의8 분모 0 → 총 82,357,000 / 분모 +1·−1 → 공제 126,000,000 · 총 39,980,500.
 * 세액은 불변이다(분모 0은 전에도 공제 0 — 같은 시료의 «감면 없음» 대조와 같다). 소령 §167의3①5호 중과 배제는 요건으로 정해지므로 유지한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { evaluateUnsold988 } from "@/lib/tax-engine/transfer-reductions/unsold-98-8";
import { makeMockRates, makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const R987 = (tr: number) => ({
  type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: 300_000_000, standardPriceAtTransfer987: tr,
});
const R992 = (tr: number) => ({
  type: "unsold_99_2" as const, houseType992: "new_or_unsold" as const, contractDate992: D("2013-06-01"), acquisitionPrice992: 550_000_000,
  exclusiveAreaSqm992: 84.5, meetsHouseTypeRequirement992: true, isNotRecontract992: true, hasConfirmationSeal992: true,
  standardPriceAtAcquisition992: 200_000_000, standardPriceAt5Years992: 300_000_000, standardPriceAtTransfer992: tr,
});
const R988 = (tr: number) => ({
  type: "unsold_98_8" as const, contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: tr,
});
const O987 = { acquisitionDate: D("2013-01-15"), transferDate: D("2022-08-01") };
const O992 = { acquisitionDate: D("2013-10-23"), transferDate: D("2026-06-01") };
const O988 = { acquisitionDate: D("2015-07-01"), transferDate: D("2023-08-01") };
const mk = (reductions: unknown[], over: Record<string, unknown>, rates = makeMockRates()) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 800_000_000, acquisitionPrice: 500_000_000, householdHousingCount: 2, reductions, ...over } as never),
    rates,
  );
const surcharge = (over: Record<string, unknown>) => ({
  householdHousingCount: 3, isRegulatedArea: true,
  houses: [makeHouseInfo("h1", { acquisitionDate: over.acquisitionDate as Date, regionCode: "11680" }), makeHouseInfo("h2"), makeHouseInfo("h3")],
  sellingHouseId: "h1", ...over,
});
const EXCLUSION_STEP = "감면주택 다주택 중과 배제";

describe("NH-76 하이브리드(§98의7) — 분모 0은 계산 불가 + 확인 필요", () => {
  it("분모 0: 불성립 · 공제 0 · 확인 필요 사유 · 세액 = 감면 없음 대조", () => {
    const r = mk([R987(200_000_000)], O987);
    const d = r.unsold987Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.signCase).toBe("ineligible");
    expect(d.reducibleTransferIncome).toBe(0);
    expect(d.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(d.ineligibleReasons[0].message).toContain("확인 필요");
    expect(d.ineligibleReasons[0].message).toContain("분모가 0");
    expect(r.totalTax).toBe(79_849_000);
    expect(r.totalTax, "세액 불변 — 감면 없음과 같다").toBe(mk([], O987).totalTax);
  });
  it("짝: 분모 +1은 종전대로 (+,+) 안분 · 분모 −1은 (+,-) 전액 — 공제 246,000,000 · 총 14,518,000", () => {
    for (const [tr, sign] of [[200_000_001, "all_positive"], [199_999_999, "pos_neg"]] as const) {
      const r = mk([R987(tr)], O987);
      expect(r.unsold987Detail!.isEligible).toBe(true);
      expect(r.unsold987Detail!.signCase).toBe(sign);
      expect(r.unsold987Detail!.reducibleTransferIncome).toBe(246_000_000);
      expect(r.totalTax).toBe(14_518_000);
    }
  });
  it("§99의2(같은 하이브리드 공용 경로)도 같다 — 분모 0 불성립, +1·−1 짝은 종전대로", () => {
    expect(mk([R992(200_000_000)], O992).unsold992Detail!.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    for (const tr of [200_000_001, 199_999_999]) expect(mk([R992(tr)], O992).unsold992Detail!.isEligible).toBe(true);
  });
  it("소령 §167의3①5호 중과 배제는 유지된다 — 분모 0·±1 모두 3주택 조정지역 중과 없음(요건은 안분 인자와 무관)", () => {
    for (const tr of [200_000_000, 200_000_001, 199_999_999]) {
      const r = mk([R987(tr)], surcharge(O987), makeMockRatesWithHouseEngine());
      expect(r.steps.some((s) => s.label === EXCLUSION_STEP), String(tr)).toBe(true);
      expect(r.surchargeRate ?? 0, String(tr)).toBe(0);
    }
  });
});

describe("NH-76 §98의8 — 같은 규칙", () => {
  it("분모 0: 불성립 · 확인 필요 · 세액 = 감면 없음 대조 82,357,000", () => {
    const r = mk([R988(200_000_000)], O988);
    const d = r.unsold988Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.ineligibleReasons.map((x) => x.code)).toEqual(["ALLOCATION_DENOMINATOR_ZERO"]);
    expect(d.ineligibleReasons[0].message).toContain("확인 필요");
    expect(r.totalTax).toBe(82_357_000);
    expect(r.totalTax).toBe(mk([], O988).totalTax);
  });
  it("짝: 분모 +1·−1은 종전대로 — 공제 126,000,000 · 총 39,980,500", () => {
    for (const [tr, sign] of [[200_000_001, "all_positive"], [199_999_999, "pos_neg"]] as const) {
      const r = mk([R988(tr)], O988);
      expect(r.unsold988Detail!.isEligible).toBe(true);
      expect(r.unsold988Detail!.signCase).toBe(sign);
      expect(r.unsold988Detail!.reducibleTransferIncome).toBe(126_000_000);
      expect(r.totalTax).toBe(39_980_500);
    }
  });
  it("중과 배제 유지 — 분모 0에도 3주택 조정지역 중과 없음", () => {
    const r = mk([R988(200_000_000)], surcharge(O988), makeMockRatesWithHouseEngine());
    expect(r.steps.some((s) => s.label === EXCLUSION_STEP)).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
  });
  it("evaluator 단위: 5년 내 양도는 기준시가를 보지 않는다 — 분모 0이어도 전액 기준", () => {
    const r = evaluateUnsold988({
      transferDate: D("2020-07-01"), acquisitionDate: D("2015-07-01"), contractDate: D("2015-06-01"), acquisitionPrice: 550_000_000,
      exclusiveAreaSqm: 84.5, rentalContractDate: D("2015-12-20"), rentalStartDate: D("2016-01-01"), inheritedRentalMonths: 6,
      isUnsoldAfterCompletion: true, isFirstContract: true, isNotRecontract: true, transferIncome: 200_000_000,
      standardPriceAtAcquisition: 200_000_000, standardPriceAt5Years: 300_000_000, standardPriceAtTransfer: 200_000_000,
    });
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("within_5_years");
  });
});
