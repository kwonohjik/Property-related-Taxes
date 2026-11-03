/**
 * anchor — §97의4 가목 아파트 양도기한 (리뷰 2026-11-02 R-2)
 *
 * 조특령 §97의4①: 「"대통령령으로 정하는 주택"이란 「소득세법 시행령」 제167조의3제1항제2호가목 및 다목에 따른 장기임대주택」.
 * 소령 §167의3①2호 가목(MST 290841 · 대통령령 제36737호 2026.10.1. 시행) 「… 중 다음의 요건을 모두 갖춘 주택
 *   1) 2018년 3월 31일까지 사업자등록등을 하였을 것
 *   2) 종전의 「민간임대주택에 관한 특별법」 제2조제5호에 따른 장기일반민간임대주택 중 아파트[「주택법」에 따른 도시형 생활주택인
 *      아파트는 제외한다 …]를 임대하는 민간매입임대주택 또는 종전의 … 제6호에 따른 단기민간임대주택 중 아파트를 임대하는
 *      민간매입임대주택인 경우에는 제11항에 따른 기한까지 양도할 것.」
 * ⑪ 「… 기한은 2027년 12월 31일로 한다. 다만 … 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 * 다목(건설임대)에는 이 요건이 없다. 기한 판정은 중과·§155⑳와 같은 `judgeAptTransferDeadline`.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);

const BASE = {
  id: "rental_97_4" as const,
  acquisitionDate: D("2016-06-01"),
  registrationDate: D("2017-01-02"),
  rentalStartDate: D("2017-01-02"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2017-01-02"),
  rentIncreaseViolated: false,
  rental974Category: "purchase_a" as const,
  region: "capital" as const,
  officialPriceAtStart: 300_000_000,
};
const run = (over: Record<string, unknown>) => evaluateRental974({ ...BASE, ...over } as Any) as Any;
const codes = (r: Any): string[] => (r.isEligible ? [] : r.ineligibleReasons.map((x: Any) => x.code));
const message = (r: Any): string => (r.isEligible ? "" : r.ineligibleReasons.map((x: Any) => x.message).join(" "));

describe("가목 + 아파트 — ⑪ 기한까지 양도해야 한다", () => {
  it("기한 당일(2027.12.31. 금) 양도 → 적용 (10년 10%)", () => {
    const r = run({ isApartment974: true, transferDate: D("2027-12-31") });
    expect(r.isEligible).toBe(true);
    expect(r.additionalRate).toBe(0.1);
  });

  it("🔴 2028.1.3. 양도 · 연장 사유 모름 → 불적용 + 「연장 사유를 확인하지 못해」 확인 필요 고지", () => {
    const r = run({ isApartment974: true, transferDate: D("2028-01-03") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
    expect(message(r)).toContain("연장 사유를 확인하지 못해");
  });

  it("2028.1.3. 양도 · 「연장 사유 없음」 확인 → 불적용 · 확인 필요 고지 없음", () => {
    const r = run({ isApartment974: true, aptDeadlineExtension974: { confirmedNone: true }, transferDate: D("2028-01-03") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
    expect(message(r)).not.toContain("확인 필요");
  });

  it("⑪1호 등록말소일 2027.6.1. → 기한 2028.6.1. — 2028.5.1. 양도는 적용", () => {
    const r = run({
      isApartment974: true,
      aptDeadlineExtension974: { dutyPeriodEndCancellationDate: D("2027-06-01") },
      transferDate: D("2028-05-01"),
    });
    expect(r.isEligible).toBe(true);
  });

  it("⑪1호로 늘어난 기한(2028.6.1.)도 지나면 불적용", () => {
    const r = run({
      isApartment974: true,
      aptDeadlineExtension974: { dutyPeriodEndCancellationDate: D("2027-06-01") },
      transferDate: D("2028-07-03"),
    });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
  });
});

describe("아파트 여부를 모를 때 — 결론을 가를 때만 입력 누락", () => {
  it("2027.12.31. 전 양도 → 아파트 여부와 무관하게 적용", () => {
    expect(run({ transferDate: D("2027-06-01") }).isEligible).toBe(true);
  });
  it("🔴 2028.1.3. 양도 → MISSING_APARTMENT_974", () => {
    expect(codes(run({ transferDate: D("2028-01-03") }))).toEqual(["MISSING_APARTMENT_974"]);
  });
});

describe("요건 밖", () => {
  it("가목 + 아파트 아님 → 2030년 양도도 적용", () => {
    expect(run({ isApartment974: false, transferDate: D("2030-01-02") }).isEligible).toBe(true);
  });
  it("다목(건설임대)은 아파트라도 기한 요건 없음", () => {
    const r = run({ rental974Category: "construction_c", isApartment974: true, transferDate: D("2030-01-02") });
    expect(r.isEligible).toBe(true);
  });
});
