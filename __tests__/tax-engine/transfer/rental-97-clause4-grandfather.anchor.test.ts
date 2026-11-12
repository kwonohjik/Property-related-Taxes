/**
 * anchor — 조특령 §97의3③4호(기준시가 6억·3억 한도)의 부칙 예외 (rental-97-5-textbook-gaps.plan.md §3.3 · §4.3, PR-B)
 *
 * 대통령령 제29241호 부칙 §2② — 「1. 2018년 9월 13일 이전에 주택(주택을 취득할 수 있는 권리를 포함한다. 이하 이 항에서 같다)을
 * 취득한 경우 2. 2018년 9월 13일 이전에 주택을 취득하기 위하여 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류에 의하여
 * 확인되는 경우」에는 종전 규정(한도 없음)에 따른다 (MST 204913 원문).
 *
 * 종전 엔진은 주택 취득일만 봐서 2018.9.13. 이전 분양권·매매계약으로 그 뒤 취득한 주택에 한도를 적용했다(납세자 불리).
 * - ②2호: 자산-수준 매매계약일(`contractDate` — 화면 「분양·매매계약 + 계약금 납부 시점」 칸) ≤ 2018-09-13
 * - ②1호(권리)·②2호 확인: `clause4Grandfathered === true`
 * §97의3·§97의5가 같은 헬퍼(`checkRental973Clause24`)를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { isClause4Applicable } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));

/** 취득 2018-11-01(한도 적용 구간) · 즉시 등록·임대 · 양도 2030-06-01 · 수도권 기준시가 7억 */
const common = {
  acquisitionDate: D("2018-11-01"),
  registrationDate: D("2018-11-15"),
  rentalStartDate: D("2018-11-15"),
  taxRegistrationDate: D("2018-11-15"),
  transferDate: D("2030-06-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital" as const,
  officialPriceAtStart: 700_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
};
const r975 = (over: Partial<Rental97EvaluationInput> = {}): Rental97EvaluationInput => ({
  id: "rental_97_5",
  isPurchaseRental: true,
  ...common,
  ...over,
});
const r973 = (over: Partial<Rental97EvaluationInput> = {}): Rental97EvaluationInput => ({
  id: "rental_97_3",
  ...common,
  stdPriceAtAcquisition: 500_000_000,
  stdPriceAtTransfer: 900_000_000,
  ...over,
});

describe("§97의5 — 부칙 §2② 예외", () => {
  it("G-1 계약일·확인 없음 → OFFICIAL_PRICE_EXCEEDED (회귀)", () => {
    expect(codes(evaluateRental975(r975()))).toEqual(["OFFICIAL_PRICE_EXCEEDED"]);
  });

  it("G-2 확인 「예」 → 한도 미적용 → 적격", () => {
    expect(evaluateRental975(r975({ clause4Grandfathered: true }))).toMatchObject({ isEligible: true, reductionAmount: 50_000_000 });
  });

  it("G-3 매매계약일 2018-09-01 → ②2호로 자동 예외 → 적격", () => {
    expect(evaluateRental975(r975({ contractDate: D("2018-09-01") })).isEligible).toBe(true);
  });

  it("매매계약일 2018-09-13 당일 → 예외(「이전」 포함) · 2018-09-14 → 한도 적용", () => {
    expect(evaluateRental975(r975({ contractDate: D("2018-09-13") })).isEligible).toBe(true);
    expect(codes(evaluateRental975(r975({ contractDate: D("2018-09-14") })))).toEqual(["OFFICIAL_PRICE_EXCEEDED"]);
  });

  it("G-6 확인 「아니오」 · 기준시가 5억 → 한도 내 → 적격 (회귀)", () => {
    expect(evaluateRental975(r975({ clause4Grandfathered: false, officialPriceAtStart: 500_000_000 })).isEligible).toBe(true);
  });

  it("확인 「아니오」 · 7억 → 한도 적용, 안내문은 질문을 가리킨다", () => {
    const r = evaluateRental975(r975({ clause4Grandfathered: false }));
    expect(codes(r)).toEqual(["OFFICIAL_PRICE_EXCEEDED"]);
    const msg = !r.isEligible ? r.ineligibleReasons[0].message : "";
    expect(msg).toContain("「2018.9.13. 이전 취득·계약」 질문");
    expect(msg).not.toContain("본 계산기는 이 사실을 판정하지 않습니다");
  });
});

describe("§97의3 — 같은 헬퍼", () => {
  it("G-4 매매계약일 2018-09-01 → ②2호로 예외 (자산-수준 매매계약일의 의미가 같다 — 계획 대비 확장)", () => {
    const r = evaluateRental973(r973({ contractDate: D("2018-09-01") }));
    expect(codes(r)).not.toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.isEligible).toBe(true);
  });

  it("G-5 확인 「예」 → 예외", () => {
    expect(evaluateRental973(r973({ clause4Grandfathered: true })).isEligible).toBe(true);
  });

  it("계약일·확인 없음 → OFFICIAL_PRICE_EXCEEDED (회귀)", () => {
    expect(codes(evaluateRental973(r973()))).toContain("OFFICIAL_PRICE_EXCEEDED");
  });
});

describe("isClause4Applicable — 게이트 순서", () => {
  const T = D("2030-06-01");
  it("양도가 시행일(2018-10-23) 전이면 무엇이든 미적용", () => {
    expect(isClause4Applicable({ transferDate: D("2018-10-22"), acquisitionDate: D("2018-10-01") })).toBe(false);
  });
  it("취득일 ≤ 2018-09-13 → 미적용 (회귀)", () => {
    expect(isClause4Applicable({ transferDate: T, acquisitionDate: D("2018-09-13") })).toBe(false);
  });
  it("취득일 이후·계약일 없음·확인 없음 → 적용", () => {
    expect(isClause4Applicable({ transferDate: T, acquisitionDate: D("2018-09-14") })).toBe(true);
    expect(isClause4Applicable({ transferDate: T, acquisitionDate: D("2018-09-14"), clause4Grandfathered: false })).toBe(true);
  });
});
