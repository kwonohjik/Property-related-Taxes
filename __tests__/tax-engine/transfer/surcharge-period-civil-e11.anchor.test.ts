/**
 * E-11 — 중과 축(「소득세법 시행령」 §167의3·§167의10) 기간 판정의 초일·말일 규칙.
 *
 * 종전에는 `differenceInYears`(date-fns 응당일 비교)로 셌다. 조문 문구별 유형(`lib/tax-engine/civil-period.ts`):
 *
 * | 조문 (MST 286211 · 구 12호는 MST 214261 실독) | 문구 | 유형 | 판정 |
 * |---|---|---|---|
 * | §167의3①7호 상속주택 | 「상속받은 날부터 5년이 경과하지 아니한」 | 기간 안(초일불산입) | `isWithinDeadline` |
 * | §167의3①8호 저당권 실행 | 「취득일부터 3년이 경과하지 아니한」 | 〃 | 〃 |
 * | §167의10①3호 부득이한 사유 | 「해당 사유가 해소된 날부터 3년이 경과하지 아니한」 | 〃 | 〃 |
 * | §167의10①7호 소송 | 「확정판결일부터 3년이 경과하지 아니한」 | 〃 | 〃 |
 * | §167의3⑨ 혼인 차감 | 「혼인한 날부터 5년 이내에 … 양도하는」 | B | 〃 |
 * | §167의3①12의2·§167의10①12의2 | 「법 제95조제4항에 따른 보유기간이 2년 … 이상」 | C(초일 산입) | `calculateHoldingPeriod` |
 * | 구 §167의10①12호 등(2019.12.17.~2020.6.30.) | 「법 제95조제4항에 따른 보유기간이 10년 … 이상」 | C | 〃 |
 *
 * 「경과하지 아니한」 = 기간의 말일(초일불산입 · 민법 §157·§160)까지 — 사건일의 N년 응당일 **당일**이 기간 안이다
 * (종전은 응당일을 기간 밖으로 봐 하루 짧았다). 말일이 토요일·공휴일이면 익일(민법 §161 — 계획서 L-1).
 * 「경과하지 아니한」에 §161을 적용한 직접 선례는 미확보 — 구 §167의10①8호(`surcharge-old-clauses-era.ts`)와 같은 독법.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { isMultiHouseSurchargeSuppressed } from "@/lib/calc/transfer-tax-api-helpers";

type H = Record<string, unknown>;
const house = (id: string, acq: string, o: H = {}) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...o,
});

function hh(others: H[], selling: H, td: string, sellingAcq: string, extra: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const hs = [house("selling", sellingAcq, selling), ...others.map((o, i) => house(`h${i + 2}`, "2012-01-01", o))];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date(sellingAcq),
    transferDate: new Date(td),
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: hs.length,
    houses: hs as TransferTaxInput["houses"],
    sellingHouseId: "selling",
    ...extra,
  } as Partial<TransferTaxInput>);
}
function calc(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const e = r.multiHouseSurchargeEvaluation!;
  return {
    tax: r.totalTax,
    count: e.effectiveHouseCount,
    suspended: e.isSurchargeSuspended,
    reasons: (e.exclusionReasons ?? []).map((x) => x.type),
  };
}

const TD = "2026-09-18"; // 금요일 · 한시 유예 종료(2026-05-09) 뒤

describe("E-11 「N년이 경과하지 아니한」 — 응당일 당일은 기간 안", () => {
  it("§167의3①7호 상속 — 상속개시 2021-09-18 · 양도 2026-09-18(응당일) → 배제 · 총세액 299,816,000 → 141,966,000", () => {
    const r = calc(hh([{}], { isInherited: true, inheritedDate: new Date("2021-09-18") }, TD, "2015-01-01"));
    expect(r.reasons).toEqual(["inherited_house_5years"]);
    expect(r.tax).toBe(141_966_000);
  });
  it("짝 — 상속개시 2021-09-17(응당일 목요일 경과) → 배제 없음", () => {
    expect(calc(hh([{}], { isInherited: true, inheritedDate: new Date("2021-09-17") }, TD, "2015-01-01")).reasons).toEqual([]);
  });

  it("§167의3①8호 저당권 — 취득 2023-09-18 · 3주택 · 양도 응당일 → 배제 · 354,541,000 → 177,166,000", () => {
    const r = calc(hh([{}, {}], { isMortgageExecution: true }, TD, "2023-09-18"));
    expect(r.reasons).toContain("mortgage_execution_3years");
    expect(r.tax).toBe(177_166_000);
  });
  it("짝 — 취득 2023-09-17 → 배제 없음", () => {
    expect(calc(hh([{}, {}], { isMortgageExecution: true }, TD, "2023-09-17")).reasons).not.toContain(
      "mortgage_execution_3years",
    );
  });
  it("민법 §161 — 취득 2023-09-19 · 응당일 2026-09-19(토) → 월요일 2026-09-21 양도까지 배제", () => {
    expect(calc(hh([{}, {}], { isMortgageExecution: true }, "2026-09-21", "2023-09-19")).reasons).toContain(
      "mortgage_execution_3years",
    );
    expect(calc(hh([{}, {}], { isMortgageExecution: true }, "2026-09-22", "2023-09-19")).reasons).not.toContain(
      "mortgage_execution_3years",
    );
  });
  it("§167의3①10호 그룹 판정(다른 주택이 8호) — 응당일 → 유일한 일반주택 배제", () => {
    const others = [{ isMortgageExecution: true, acquisitionDate: new Date("2023-09-18") }, { isMortgageExecution: true, acquisitionDate: new Date("2023-09-18") }];
    expect(calc(hh(others, {}, TD, "2015-01-01")).reasons).toEqual(["only_one_remaining"]);
    const late = [{ isMortgageExecution: true, acquisitionDate: new Date("2023-09-17") }, { isMortgageExecution: true, acquisitionDate: new Date("2023-09-18") }];
    expect(calc(hh(late, {}, TD, "2015-01-01")).reasons).toEqual([]);
  });

  it("§167의10①3호 부득이한 사유 — 해소일 2023-09-18 · 2주택 · 응당일 → 배제", () => {
    const other = { isUnavoidableReason: true, unavoidableResidenceYears: 2, acquisitionOfficialPrice: 250_000_000 };
    expect(calc(hh([{ ...other, unavoidableReasonResolvedDate: new Date("2023-09-18") }], {}, TD, "2015-01-01")).reasons).toContain(
      "unavoidable_reason_two_house",
    );
    expect(
      calc(hh([{ ...other, unavoidableReasonResolvedDate: new Date("2023-09-17") }], {}, TD, "2015-01-01")).reasons,
    ).not.toContain("unavoidable_reason_two_house");
  });

  it("§167의10①7호 소송 — 확정판결 2023-09-18 · 2주택 · 응당일 → 배제", () => {
    expect(
      calc(hh([{ isLitigationHousing: true, litigationAcquisitionDate: new Date("2023-09-18") }], {}, TD, "2015-01-01")).reasons,
    ).toContain("litigation_housing_two_house");
    expect(
      calc(hh([{ isLitigationHousing: true, litigationAcquisitionDate: new Date("2023-09-17") }], {}, TD, "2015-01-01")).reasons,
    ).not.toContain("litigation_housing_two_house");
  });
});

describe("E-11 §167의3⑨ 혼인 5년 이내 — 민법 §160③·§161", () => {
  const spouse = { isSpouseOwned: true };
  const withMarriage = (m: string, td: string) =>
    calc(hh([{}, spouse], {}, td, "2015-01-01", { marriageMerge: { marriageDate: new Date(m) } } as Partial<TransferTaxInput>));
  it("혼인 2021-09-19 · 5년 응당일 2026-09-19(토) → 2026-09-21(월) 양도까지 배우자 주택 차감(3→2) · 354,541,000 → 299,816,000", () => {
    expect(withMarriage("2021-09-19", "2026-09-21").count).toBe(2);
    expect(withMarriage("2021-09-19", "2026-09-21").tax).toBe(299_816_000);
    expect(withMarriage("2021-09-19", "2026-09-22").count).toBe(3);
  });
  it("대조 — 응당일이 평일이면 그 날까지(종전과 같다)", () => {
    expect(withMarriage("2021-09-18", "2026-09-18").count).toBe(2);
    expect(withMarriage("2021-09-18", "2026-09-19").count).toBe(3);
  });
});

describe("E-11 보유기간(§95④ 초일 산입) — 12의2 · 구 12호", () => {
  it("12의2 — 취득 2022-09-18 · 양도 2024-09-17 = 보유 2년(초일 산입) → 한시 유예 · 299,816,000 → 190,366,000", () => {
    const r = calc(hh([{}], {}, "2024-09-17", "2022-09-18"));
    expect(r.suspended).toBe(true);
    expect(r.tax).toBe(190_366_000);
  });
  it("짝 — 양도 2024-09-16 → 2년 미만 → 유예 없음", () => {
    expect(calc(hh([{}], {}, "2024-09-16", "2022-09-18")).suspended).toBe(false);
  });
  it("⑤ 화면 게이트(`isMultiHouseSurchargeSuppressed`)도 같은 날 열린다", () => {
    expect(isMultiHouseSurchargeSuppressed("2024-09-17", "2022-09-18")).toBe(true);
    expect(isMultiHouseSurchargeSuppressed("2024-09-16", "2022-09-18")).toBe(false);
  });
  it("구 12호 — 취득 2010-03-02 · 양도 2020-03-01 = 보유 10년 → 배제 / 2020-02-29 → 없음", () => {
    const r = calc(hh([{}], {}, "2020-03-01", "2010-03-02"));
    expect(r.reasons).toContain("long_holding_10y_until_2020_06_30");
    expect(r.tax).toBe(146_960_000); // 종전 190,960,000
    expect(calc(hh([{}], {}, "2020-02-29", "2010-03-02")).reasons).not.toContain("long_holding_10y_until_2020_06_30");
  });
});

describe("E-11 12의2 다목2) 「매매계약 체결일부터 4개월 이내」 — 말일 토요일이면 익일(민법 §161)", () => {
  it("계약 2026-01-09 · 역상 말일 2026-05-09(토) → 2026-05-11(월) 양도까지 유예 / 05-12 없음", async () => {
    const { checkGracePeriodExemption } = await import("@/lib/tax-engine/multi-house-surcharge-exclusion");
    const gp = { contractDate: new Date("2026-01-09"), isLandPermitTarget: false, depositReceiptConfirmed: true };
    const on = checkGracePeriodExemption(new Date("2026-05-11"), gp as never, "1168010100");
    expect(on.suspended).toBe(true);
    expect(on.deadline?.toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(checkGracePeriodExemption(new Date("2026-05-12"), gp as never, "1168010100").suspended).toBe(false);
  });
  it("짝 — 계약 2026-01-12 · 말일 2026-05-12(화) → 그 날까지만(연장 없음)", async () => {
    const { checkGracePeriodExemption } = await import("@/lib/tax-engine/multi-house-surcharge-exclusion");
    const gp = { contractDate: new Date("2026-01-12"), isLandPermitTarget: false, depositReceiptConfirmed: true };
    expect(checkGracePeriodExemption(new Date("2026-05-12"), gp as never, "1168010100").suspended).toBe(true);
    expect(checkGracePeriodExemption(new Date("2026-05-13"), gp as never, "1168010100").suspended).toBe(false);
  });
});
