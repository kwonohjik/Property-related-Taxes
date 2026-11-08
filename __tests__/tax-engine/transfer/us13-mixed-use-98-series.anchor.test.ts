/**
 * US-13 · US-71 (리뷰 `unsold-98-series-review-2026-11.md`) — 겸용주택 경로가 §98 시리즈를 주택분에서 계산한다.
 * 사용자 결정 Q-14 (a) 2026-11-08 · 토지 선보유분은 Q-7 (b)(산식 유지 + 안내). 세율표 mock — 시료는 NH-33 anchor의 case14(11억).
 *
 * | 시료 | 수정 전 총부담 | 수정 후 |
 * |---|---|---|
 * | 감면 미선택(대조) · 2009-08-01 동시 취득 · 2022-02-16 양도 | 244,707,938 | 244,707,938 |
 * | §98의3 매입형 비과밀(기준시가 2억→3억→4억) | 244,707,938 + 「명문 규정 없음」 고지 | 158,949,305 (차감 189,143,868) |
 * | §98의2 단독 | 고지 2건(장특 특례 + 차감형) | 장특 특례 고지 1건 |
 * | §98 단독 | 「소득금액 차감형」 고지 | 「세율 20% 특례 미반영」 고지 |
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import { UNSOLD_983_LAND_PRIOR_NOTICE } from "@/lib/tax-engine/transfer-tax-mixed-use-income-deduction";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const U983 = {
  type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: D("2009-06-15"),
  isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isUnsoldConfirmed983: true, isFirstContract983: true,
  isNotOccupiedAtContract983: true, isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
};
const R988 = {
  type: "unsold_98_8", contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: 400_000_000,
};
const SAME = { buildingAcquisitionDate: D("2009-08-01"), landAcquisitionDate: D("2009-08-01") };

function run(over: Record<string, unknown>, td = "2022-02-16") {
  return calcMixed(1_100_000_000, D(td), { ...mixedUseCase14(), isOneHouseExempt: false, ...SAME, ...over } as unknown as MixedUseAssetInput, rates);
}
const payable = (r: ReturnType<typeof run>) => r.total.totalPayable;
const notReflected = (r: ReturnType<typeof run>) => r.warnings.filter((w) => w.includes("반영되지 않았습니다"));

describe("US-13 §98의3 — 주택분 5년간 발생분 차감", () => {
  const control = run({});
  it("대조군 244,707,938", () => expect(payable(control)).toBe(244_707_938));

  it("§98의3: 주택분 소득 378,287,736 × (3억 − 2억) ÷ (4억 − 2억) = 189,143,868 차감 → 158,949,305 · 농특세 0(비과세)", () => {
    const r = run({ reductions: [U983] });
    expect(r.housingPart.incomeAmount).toBe(378_287_736);
    expect(r.total.incomeDeduction?.appliedId).toBe("unsold_98_3");
    expect(r.total.incomeDeduction?.reducibleIncome).toBe(189_143_868);
    expect(r.total.aggregateIncome).toBe(control.total.aggregateIncome - 189_143_868);
    expect(payable(r)).toBe(158_949_305);
    expect(r.total.ruralSurtax).toBe(0);
    expect(r.total.reductionDetails?.unsold983Detail?.isEligible).toBe(true);
    expect(r.steps.find((s) => s.id === "income-deduction-new-housing")?.title).toBe("§98의3 미분양주택 과세특례 — 양도소득금액 차감 (주택분)");
    expect(notReflected(r)).toHaveLength(0);
    expect(r.warnings.some((w) => /명문 규정이 없습니다/.test(w))).toBe(false);
  });

  it("요건 미충족(빈 카드)이면 대조와 같고 step에 사유가 남는다(조용히 버리지 않는다)", () => {
    const r = run({ reductions: [{ type: "unsold_98_3" }] });
    expect(payable(r)).toBe(payable(control));
    expect(r.steps.some((s) => s.id === "income-deduction-new-housing")).toBe(true);
  });
});

describe("US-13 §98의8 — 5년간 발생분의 50% 차감", () => {
  it("2015-07-01 동시 취득 · 2023-08-01 양도: 차감 = 주택분 소득 × 1억 ÷ 2억 × 50%", () => {
    const dates = { buildingAcquisitionDate: D("2015-07-01"), landAcquisitionDate: D("2015-07-01") };
    const ctl = run(dates, "2023-08-01");
    const r = run({ ...dates, reductions: [R988] }, "2023-08-01");
    expect(r.total.incomeDeduction?.appliedId).toBe("unsold_98_8");
    expect(r.total.incomeDeduction?.reducibleIncome).toBe(Math.floor(Math.floor(r.housingPart.incomeAmount / 2) / 2));
    expect(payable(r)).toBeLessThan(payable(ctl));
    expect(r.total.reductionDetails?.unsold988Detail).toBeDefined();
  });
});

describe("Q-7 (b) — 토지 선보유 안내 (세액 불변)", () => {
  it("토지를 먼저 취득했으면 안내를 붙이고, 동시 취득이면 붙이지 않는다", () => {
    const prior = run({ reductions: [U983], landAcquisitionDate: D("2008-05-01") });
    expect(prior.warnings).toContain(UNSOLD_983_LAND_PRIOR_NOTICE);
    expect(UNSOLD_983_LAND_PRIOR_NOTICE).not.toMatch(/유리|불리|절감/);
    expect(run({ reductions: [U983] }).warnings).not.toContain(UNSOLD_983_LAND_PRIOR_NOTICE);
  });
});

describe("US-71 — §98·§98의2는 «소득금액 차감형» 고지에 넣지 않는다", () => {
  it("§98의2 단독: 장특 특례 고지 1건뿐", () => {
    const r = run({ reductions: [{ type: "unsold_98_2" }] });
    expect(notReflected(r)).toHaveLength(1);
    expect(notReflected(r)[0]).toContain("장기보유특별공제 특례");
  });
  it("§98 단독: 세율 20% 특례 미반영 고지 1건", () => {
    const r = run({ reductions: [{ type: "unsold_98" }] });
    expect(notReflected(r)).toHaveLength(1);
    expect(notReflected(r)[0]).toContain("세율 100분의 20");
    expect(notReflected(r)[0]).not.toContain("차감형");
  });
});

describe("US-13 × 중과 배제(NH-09) 결합 — 3주택 조정 · 2026-06-01 양도", () => {
  const mh = (sellingOver: Record<string, unknown> = {}) => ({
    houses: [
      makeHouseInfo("selling", sellingOver as never),
      makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }),
      makeHouseInfo("h3", { acquisitionDate: D("2015-03-01") }),
    ],
    sellingHouseId: "selling", presaleRights: [], isOneHousehold: true, isRegulatedArea: true,
  });
  it("§98의3: 5호 중과 배제 + 주택분 차감 = 양도 주택 5호 수동 토글 대조 · 고지에 «차감 미반영» 문구 없음", () => {
    const none = run({ multiHouse: mh() }, "2026-06-01");
    const r = run({ multiHouse: mh(), reductions: [U983] }, "2026-06-01");
    const manual = run({ multiHouse: mh({ isTaxSpecialExemption: true }), reductions: [U983] }, "2026-06-01");
    expect(r.total.incomeDeduction?.reducibleIncome ?? 0).toBeGreaterThan(0);
    expect(payable(r)).toBe(payable(manual));
    expect(payable(r)).toBeLessThan(payable(none));
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    const exclusion = r.warnings.find((w) => w.includes("다주택 중과 배제를 반영"));
    expect(exclusion).toBeDefined();
    expect(exclusion).not.toContain("차감은 반영하지 않으므로");
  });
});
