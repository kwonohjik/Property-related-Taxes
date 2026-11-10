/**
 * anchor — 하이브리드(§98의3·5·6·7·§99의2)·§98의8 결과 `warnings` (W3b)
 *
 * 「확인 필요」 고지가 산식 step 문구뿐 아니라 결과 `warnings?: string[]`에도 실린다(§99·§99의3 결과와 같은 이름·형태).
 * 규칙(= `describeAllocationFormula`이 step에 붙이는 조건과 같다):
 *   · 분자 > 0 · 분모 0, 율 100%        -> ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE
 *   · 분자 > 0 · 분모 ≤ 0, 율 < 100%    -> ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE
 *   · 분자 > 0 · 분모 < 0, 율 100%      -> 없음(부동산거래관리과-525 해석례 있음)
 *   · 분모 > 0 · 분자 ≤ 0 · 5년 내       -> 없음
 *   · §98의3 과밀 5년 후                -> UNSOLD_98_3_OVERCON_READING_NOTICE (조특법 §98의3① 괄호 독법)
 * 세액은 불변이어야 한다 — 값은 기존 anchor(us12 · nh76b · us65)의 손계산 값 그대로다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE,
  ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
} from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { allocationNoticeWarnings } from "@/lib/tax-engine/transfer-reductions/unsold-allocation-display";
import { UNSOLD_98_3_OVERCON_READING_NOTICE } from "@/lib/tax-engine/transfer-reductions/unsold-98-3";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const mk = (reductions: unknown[], over: Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 800_000_000, acquisitionPrice: 500_000_000, householdHousingCount: 2, reductions, ...over } as never),
    makeMockRates(),
  );

const R987 = (tr: number, y5 = 300_000_000) => ({
  type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: y5, standardPriceAtTransfer987: tr,
});
const O987 = { acquisitionDate: D("2013-01-15"), transferDate: D("2022-08-01") };

const R986 = (tr: number) => ({
  type: "unsold_98_6" as const, hoType986: "seller_rented" as const, stdPriceSumAtBase986: 550_000_000, floorAreaSqm986: 84.5,
  isUnsoldAfterCompletion986: true, isFirstContract986: true, isNotOccupiedAfterCompletion986: true, isNotRecontract986: true, sellerRented2Years986: true,
  standardPriceAtAcquisition986: 100_000_000, standardPriceAt5Years986: 150_000_000, standardPriceAtTransfer986: tr,
});
const O986 = { acquisitionDate: D("2011-07-01"), transferDate: D("2021-09-01"), transferPrice: 400_000_000, acquisitionPrice: 250_000_000 };

const R988 = (tr: number) => ({
  type: "unsold_98_8" as const, contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"), businessRegistrationDate988: D("2015-12-10"), rentalRegistrationDate988: D("2015-12-10"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: tr,
});
const O988 = { acquisitionDate: D("2015-07-01"), transferDate: D("2023-08-01") };

const R983 = (over: Record<string, unknown> = {}) => ({
  type: "unsold_98_3" as const, residencyType983: "resident" as const, houseType983: "purchased" as const, contractDate983: D("2009-06-15"),
  isOutsideSeoulNotDesignated983: true, isOverconcentration983: true, landAreaSqm983: 400, floorAreaSqm983: 120,
  isUnsoldConfirmed983: true, isFirstContract983: true, isNotOccupiedAtContract983: true, isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
  ...over,
});
const O983 = { acquisitionDate: D("2009-12-01"), transferDate: D("2024-08-01") };

describe("allocationNoticeWarnings — step 문구와 같은 조건", () => {
  it("케이스 매트릭스", () => {
    expect(allocationNoticeWarnings("pos_zero", 1)).toEqual([ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE]);
    expect(allocationNoticeWarnings("pos_zero", 0.5)).toEqual([ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE]);
    expect(allocationNoticeWarnings("pos_neg", 0.5)).toEqual([ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE]);
    expect(allocationNoticeWarnings("pos_neg", 1)).toEqual([]);
    expect(allocationNoticeWarnings("neg_pos", 0.5)).toEqual([]);
    expect(allocationNoticeWarnings("all_negative", 1)).toEqual([]);
    expect(allocationNoticeWarnings("all_positive", 0.6)).toEqual([]);
    expect(allocationNoticeWarnings("within_5_years", 0.6)).toEqual([]);
  });
});

describe("§98의7(100%) — 분모 0만 고지", () => {
  it("분모 0: 전액 고지 + 총 14,518,000 불변(nh76b 손계산)", () => {
    const r = mk([R987(200_000_000)], O987);
    expect(r.unsold987Detail!.warnings).toEqual([ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE]);
    expect(r.totalTax).toBe(14_518_000);
  });
  it("분모 -1(해석례 525)·+1·분자 0: warnings 없음", () => {
    for (const tr of [199_999_999, 200_000_001]) {
      expect(mk([R987(tr)], O987).unsold987Detail!.warnings, String(tr)).toBeUndefined();
    }
    expect(mk([R987(200_000_000, 200_000_000)], O987).unsold987Detail!.warnings).toBeUndefined();
  });
  it("5년 내 양도: warnings 없음", () => {
    const r = mk([R987(200_000_000)], { acquisitionDate: D("2020-01-15"), transferDate: D("2022-08-01") });
    expect(r.unsold987Detail!.warnings).toBeUndefined();
  });
});

describe("§98의6 1호(50%) — 분모 ≤ 0 이면 감면율 100% 미만 고지", () => {
  it.each([[99_999_999], [100_000_000]])("분모 %i: 고지 1건 + 총 5,137,000 불변", (tr) => {
    const r = mk([R986(tr)], O986);
    expect(r.unsold986Detail!.warnings).toEqual([ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE]);
    expect(r.totalTax).toBe(5_137_000);
  });
  it("분모 +1: warnings 없음 · 총 5,137,000", () => {
    const r = mk([R986(100_000_001)], O986);
    expect(r.unsold986Detail!.warnings).toBeUndefined();
    expect(r.totalTax).toBe(5_137_000);
  });
});

describe("§98의8(50%)", () => {
  it.each([[199_999_999], [200_000_000]])("분모 %i: 고지 1건 + 총 14,974,000 불변", (tr) => {
    const r = mk([R988(tr)], O988);
    expect(r.unsold988Detail!.warnings).toEqual([ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE]);
    expect(r.totalTax).toBe(14_974_000);
  });
  it("분모 +1: warnings 없음", () => {
    expect(mk([R988(200_000_001)], O988).unsold988Detail!.warnings).toBeUndefined();
  });
  it("5년 내 양도(전액 기준): warnings 없음", () => {
    const r = mk([R988(200_000_000)], { acquisitionDate: D("2021-07-01"), transferDate: D("2023-08-01") });
    expect(r.unsold988Detail!.isWithin5Years).toBe(true);
    expect(r.unsold988Detail!.warnings).toBeUndefined();
  });
});

describe("§98의3 과밀 독법 고지 — 5년 후 공제 경로에만", () => {
  it("과밀 5년 후 (+,+): 독법 고지 1건 · 총 40,265,500 불변(US-65-3 손계산)", () => {
    const r = mk([R983()], O983);
    expect(r.unsold983Detail!.warnings).toEqual([UNSOLD_98_3_OVERCON_READING_NOTICE]);
    expect(r.totalTax).toBe(40_265_500);
  });
  it("고지 원문은 법문 verbatim을 인용하고 «확인 필요»·60% 독법을 밝힌다", () => {
    expect(UNSOLD_98_3_OVERCON_READING_NOTICE).toContain("수도권과밀억제권역인 경우에는 양도소득금액의 100분의 60에 상당하는 금액");
    expect(UNSOLD_98_3_OVERCON_READING_NOTICE).toContain("확인 필요");
  });
  it("과밀 + 분모 0: 분모 고지(율 60% 미만)와 독법 고지가 순서대로 둘 다", () => {
    const r = mk([R983({ standardPriceAtTransfer983: 200_000_000 })], O983);
    expect(r.unsold983Detail!.warnings).toEqual([
      ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
      UNSOLD_98_3_OVERCON_READING_NOTICE,
    ]);
  });
  it("비과밀 5년 후: warnings 없음", () => {
    const r = mk([R983({ isOverconcentration983: false, landAreaSqm983: undefined, floorAreaSqm983: undefined })], O983);
    expect(r.unsold983Detail!.warnings).toBeUndefined();
  });
  it("과밀 5년 내(세액감면 60%): 독법 고지 없음 — 해당 괄호는 5년 후 문언", () => {
    const r = mk([R983()], { acquisitionDate: D("2009-12-01"), transferDate: D("2012-06-01") });
    expect(r.unsold983Detail!.isEligible).toBe(true);
    expect(r.unsold983Detail!.isWithin5Years).toBe(true);
    expect(r.unsold983Detail!.warnings).toBeUndefined();
  });
});
