/**
 * anchor — 하이브리드(§98의7 등)·§98의8 안분 산식의 분모 0 (리뷰 NH-76 형제 · L15 · Q-20 → US-36으로 규칙 변경)
 *
 * US-36 (2026-11-10 사용자 결정): 분모 0은 «계산 불가»가 아니라 «전액 + 확인 필요».
 *   (분자>0, 분모=0) → 비율 1 · 전액 / 분자 ≤ 0 → 0. 분모 ±1원 양옆이 이미 전액이므로 분모 0도 같은 값이다(연속성).
 *   손계산: §98의7 분모 0 → 공제 246,000,000 · 총 14,518,000(±1 짝과 같다) / §98의8 → 공제 126,000,000 · 총 39,980,500.
 *   분자 ≤ 0(5년시점 ≤ 취득시) → 공제 0 · 총 = 감면 없음 대조(§98의7 79,849,000 · §98의8 82,357,000).
 *
 * 2026-11-10 후속(분모 <= 0 = 감면율 무관 전액): §98의8(공제율 50%)도 분모 -1·0·+1 모두 양도소득금액 전액 252,000,000 차감.
 *   손계산: 감면 없음 82,357,000 = 산출세액 74,870,000 × 1.1 -> 전액 차감 시 산출 0 · 농특세 = 74,870,000 × 20% = 14,974,000
 *   (같은 방식 검산: §98의7 79,849,000 -> 72,590,000 × 20% = 14,518,000 = 위 §98의7 값). 종전 분모 0·-1 126,000,000 · 39,980,500은 50%만 차감한 값.
 *
 * (이하 종전 Q-20 헤더)
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
const R987 = (tr: number, y5 = 300_000_000) => ({
  type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: y5, standardPriceAtTransfer987: tr,
});
const R992 = (tr: number, y5 = 300_000_000) => ({
  type: "unsold_99_2" as const, houseType992: "new_or_unsold" as const, contractDate992: D("2013-06-01"), acquisitionPrice992: 550_000_000,
  exclusiveAreaSqm992: 84.5, meetsHouseTypeRequirement992: true, isNotRecontract992: true, hasConfirmationSeal992: true,
  standardPriceAtAcquisition992: 200_000_000, standardPriceAt5Years992: y5, standardPriceAtTransfer992: tr,
});
const R988 = (tr: number, y5 = 300_000_000) => ({
  type: "unsold_98_8" as const, contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"), businessRegistrationDate988: D("2015-12-10"), rentalRegistrationDate988: D("2015-12-10"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: y5, standardPriceAtTransfer988: tr,
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

describe("US-36 하이브리드(§98의7) — 분모 0은 전액 + 확인 필요", () => {
  it("분모 0: 적격 · pos_zero · 공제 246,000,000 · 총 14,518,000 · 확인 필요 산식 고지", () => {
    const r = mk([R987(200_000_000)], O987);
    const d = r.unsold987Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("pos_zero");
    expect(d.fiveYearRatio).toBe(1);
    expect(d.reducibleTransferIncome).toBe(246_000_000);
    expect(d.ineligibleReasons).toEqual([]);
    expect(d.formulaSteps.some((x) => x.formula?.includes("부동산납세과-412") && x.formula?.includes("확인 필요"))).toBe(true);
    expect(r.totalTax).toBe(14_518_000);
  });
  it("연속성: 분모 −1·0·+1이 모두 같은 공제 246,000,000 · 총 14,518,000", () => {
    for (const [tr, sign] of [[199_999_999, "pos_neg"], [200_000_000, "pos_zero"], [200_000_001, "all_positive"]] as const) {
      const r = mk([R987(tr)], O987);
      expect(r.unsold987Detail!.signCase).toBe(sign);
      expect(r.unsold987Detail!.reducibleTransferIncome).toBe(246_000_000);
      expect(r.totalTax).toBe(14_518_000);
    }
  });
  it("(분자=0, 분모=0)·(분자<0, 분모=0) → 공제 0 · 총 79,849,000 (= 감면 없음 대조)", () => {
    for (const y5 of [200_000_000, 190_000_000]) {
      const r = mk([R987(200_000_000, y5)], O987);
      expect(r.unsold987Detail!.isEligible, String(y5)).toBe(true);
      expect(r.unsold987Detail!.reducibleTransferIncome, String(y5)).toBe(0);
      expect(r.totalTax, String(y5)).toBe(79_849_000);
      expect(r.totalTax).toBe(mk([], O987).totalTax);
    }
  });
  it("§99의2(같은 하이브리드 공용 경로)도 같다 — 분모 −1·0·+1이 같은 공제", () => {
    const inc = (tr: number) => mk([R992(tr)], O992).unsold992Detail!.reducibleTransferIncome;
    expect(mk([R992(200_000_000)], O992).unsold992Detail!.signCase).toBe("pos_zero");
    expect(inc(200_000_000)).toBe(inc(200_000_001));
    expect(inc(200_000_000)).toBe(inc(199_999_999));
    expect(inc(200_000_000)).toBeGreaterThan(0);
  });
  it("소령 §167의3①5호 중과 배제는 유지된다 — 분모 0·±1 모두 3주택 조정지역 중과 없음", () => {
    for (const tr of [200_000_000, 200_000_001, 199_999_999]) {
      const r = mk([R987(tr)], surcharge(O987), makeMockRatesWithHouseEngine());
      expect(r.steps.some((s) => s.label === EXCLUSION_STEP), String(tr)).toBe(true);
      expect(r.surchargeRate ?? 0, String(tr)).toBe(0);
    }
  });
});

describe("US-36 §98의8 — 같은 규칙", () => {
  it("분모 0: 적격 · pos_zero · 공제 252,000,000(전액) · 총 14,974,000", () => {
    const r = mk([R988(200_000_000)], O988);
    const d = r.unsold988Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("pos_zero");
    expect(d.reducibleTransferIncome).toBe(252_000_000);
    expect(d.formulaSteps.some((x) => x.formula?.includes("확인 필요"))).toBe(true);
    expect(r.totalTax).toBe(14_974_000);
  });
  it("연속성: 분모 -1·+1도 252,000,000 · 14,974,000", () => {
    for (const tr of [199_999_999, 200_000_001]) {
      const r = mk([R988(tr)], O988);
      expect(r.unsold988Detail!.reducibleTransferIncome).toBe(252_000_000);
      expect(r.totalTax).toBe(14_974_000);
    }
  });
  it("(분자≤0, 분모=0) → 공제 0 · 총 82,357,000 (= 감면 없음 대조)", () => {
    for (const y5 of [200_000_000, 190_000_000]) {
      const r = mk([R988(200_000_000, y5)], O988);
      expect(r.unsold988Detail!.isEligible).toBe(true);
      expect(r.unsold988Detail!.reducibleTransferIncome).toBe(0);
      expect(r.totalTax).toBe(82_357_000);
      expect(r.totalTax).toBe(mk([], O988).totalTax);
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
      exclusiveAreaSqm: 84.5, rentalContractDate: D("2015-12-20"), rentalStartDate: D("2016-01-01"), businessRegistrationDate: D("2015-12-10"), rentalRegistrationDate: D("2015-12-10"), inheritedRentalMonths: 6,
      isUnsoldAfterCompletion: true, isFirstContract: true, isNotRecontract: true, transferIncome: 200_000_000,
      standardPriceAtAcquisition: 200_000_000, standardPriceAt5Years: 300_000_000, standardPriceAtTransfer: 200_000_000,
    });
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("within_5_years");
  });
});
