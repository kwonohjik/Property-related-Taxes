/**
 * anchor — #32(S07-9) 공휴일 표 한계 고지(`civil-161-holiday-table-uncovered`)는 **선언한 기한 중 하나의 말일이 양도일 곁에 있을 때만**
 *
 * 결정 문서 #32 권고 C · 하위 1 가) 「어느 기한의 말일이 양도일 직전 10일 안에 있으면 낸다」 · 하위 2 나) 「이미 이른(안전한) 기한으로 계산했고
 * 결론도 같으면 기한 줄에 단서를 달지 않는다」.
 *
 * 근거: 민법 §161(국세기본법 §4)은 「~이내」 기한 말일이 토요일·공휴일이면 익일 만료. 표(`data/public-holidays-kr.ts`) 밖의 해는 토·일요일만,
 * 예정 해(2028~2035 — 월력요항 미발표)는 임시공휴일·규정 개정 없이 계산한다. 그 한계가 판정을 바꾸는 것은 말일 직후 최장 연휴 일수(10일) 안의 양도뿐이다.
 *
 * 종전: 기한 축을 선언하기만 하면 양도일이 2028년 이후일 때 말일이 한참 앞이어도 항상 고지.
 */
import { describe, it, expect } from "vitest";
import { deadlineEndHolidayUncertaintyNear } from "@/lib/tax-engine/civil-period";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { holidayTableNoticeKind, declaredDeadlineEnds } from "@/lib/tax-engine/one-house/holiday-notice-deadlines";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ID = "civil-161-holiday-table-uncovered";
const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, D("2026-09-26"));
const has = (over: Partial<TransferTaxInput>) => judge(over).undetermined.some((u) => u.id === ID);

describe("deadlineEndHolidayUncertaintyNear — 말일이 양도일 곁에 있는가", () => {
  it("N1 표 밖(2036): 말일 직후 10일 안의 양도만 갈린다 — 말일 당일·그 전·11일 뒤는 아니다", () => {
    const end = D("2036-06-09");
    expect(deadlineEndHolidayUncertaintyNear(end, D("2036-06-12"))).toBe("uncovered");
    expect(deadlineEndHolidayUncertaintyNear(end, D("2036-06-19"))).toBe("uncovered"); // +10일
    expect(deadlineEndHolidayUncertaintyNear(end, D("2036-06-20"))).toBeUndefined(); // +11일
    expect(deadlineEndHolidayUncertaintyNear(end, D("2036-06-09"))).toBeUndefined(); // 당일 — 이미 기한 안
    expect(deadlineEndHolidayUncertaintyNear(end, D("2036-06-01"))).toBeUndefined(); // 말일 전
  });

  it("N2 예정 해(2028): 연장이 잘못 얹혔을 수도 있어 말일 앞뒤 10일 — 11일부터는 아니다", () => {
    const end = D("2028-06-05");
    expect(deadlineEndHolidayUncertaintyNear(end, D("2028-06-05"))).toBe("provisional");
    expect(deadlineEndHolidayUncertaintyNear(end, D("2028-05-26"))).toBe("provisional"); // -10일
    expect(deadlineEndHolidayUncertaintyNear(end, D("2028-05-25"))).toBeUndefined(); // -11일
    expect(deadlineEndHolidayUncertaintyNear(end, D("2028-06-15"))).toBe("provisional"); // +10일
    expect(deadlineEndHolidayUncertaintyNear(end, D("2028-06-16"))).toBeUndefined(); // +11일
  });

  it("N3 부정 짝 — 표 안 확정 해(2024)는 곁에 있어도 고지하지 않는다", () => {
    expect(deadlineEndHolidayUncertaintyNear(D("2024-06-05"), D("2024-06-07"))).toBeUndefined();
  });
});

describe("§155① — 처분기한 말일이 양도일 곁에 있을 때만 고지", () => {
  // 종전 2022-01-01 취득(비조정) · 신규 2025-06-01 취득 → 3년 말일 2028-06-01(목)
  const tt = (transfer: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2022-01-01"),
    transferDate: D(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2022-01-01"),
      newAcquisitionDate: D("2025-06-01"),
      previousHouseRegulatedAtNewAcquisition: false,
      newHouseRegulatedAtAcquisition: false,
    },
  });

  it("T1 ★ 말일(2028-06-01)보다 석 달 앞선 양도(2028-03-01) → 결론이 이미 정해졌고 말일이 곁에 없다 → 고지 없음 (종전: 항상 고지)", () => {
    const r = judge(tt("2028-03-01"));
    expect(r.isExempt).toBe(true);
    expect(has(tt("2028-03-01"))).toBe(false);
  });

  it("T1 긍정 짝 — 말일 사흘 뒤(2028-06-04) 양도 → 공휴일이 더 있었다면 결론이 갈린다 → 고지", () => {
    expect(has(tt("2028-06-04"))).toBe(true);
  });

  it("T2 말일에서 11일 넘게 지난 양도(2028-06-20) → 어떤 공휴일 연휴로도 구제되지 않는다 → 고지 없음", () => {
    expect(has(tt("2028-06-20"))).toBe(false);
  });
});

describe("선언한 기한 축별 말일 — 합가·⑧·⑦3호·수용·출국·대체주택", () => {
  const base = (over: Partial<TransferTaxInput>): OneHouseJudgeInput =>
    baseTransferInput({ householdHousingCount: 2, transferDate: D("2030-06-04"), ...over }) as OneHouseJudgeInput;
  const kind = (i: OneHouseJudgeInput) => holidayTableNoticeKind(i, rules, {});
  const ends = (i: OneHouseJudgeInput) => declaredDeadlineEnds(i, rules, {}).map((e) => iso(e.end));

  it("A1 혼인 합가 — 혼인일 2020-06-01의 10년 말일 2030-06-01(토) → 06-03(월). 양도 2030-06-04 → 고지 / 2030-03-01 → 없음", () => {
    const marriageMerge = { marriageDate: D("2020-06-01") } as TransferTaxInput["marriageMerge"];
    expect(ends(base({ marriageMerge }))).toEqual(["2030-06-03"]);
    expect(kind(base({ marriageMerge }))).toBe("provisional");
    expect(kind(base({ marriageMerge, transferDate: D("2030-03-01") }))).toBeUndefined();
  });

  it("A2 §155⑧ — 해소일 2027-06-02의 3년 말일 2030-06-02(일) → 06-03(월). 양도 2030-06-04 → 고지", () => {
    const unavoidableOutsideCapitalHouse = { reason: "work", resolvedDate: D("2027-06-02") } as TransferTaxInput["unavoidableOutsideCapitalHouse"];
    expect(ends(base({ unavoidableOutsideCapitalHouse }))).toEqual(["2030-06-03"]);
    expect(kind(base({ unavoidableOutsideCapitalHouse }))).toBe("provisional");
  });

  it("A3 부정 짝 — 2012.2.2. 전 해소분은 기한이 없어 말일도 없다(고지 대상 아님)", () => {
    const unavoidableOutsideCapitalHouse = { reason: "work", resolvedDate: D("2011-06-02") } as TransferTaxInput["unavoidableOutsideCapitalHouse"];
    expect(ends(base({ unavoidableOutsideCapitalHouse, transferDate: D("2012-03-01") }))).toEqual([]);
  });

  it("A4 §155⑦3호 귀농 — 취득일 2025-06-02의 5년 말일 2030-06-02(일) → 06-03(월)", () => {
    const ruralHouse = { kind: "return_to_farm", isOutsideCapitalEupMyeon: true, acquisitionDate: D("2025-06-02") } as TransferTaxInput["ruralHouse"];
    expect(ends(base({ ruralHouse }))).toEqual(["2030-06-03"]);
  });

  it("A5 §154① 단서 수용 — 수용일 2025-06-02의 5년 말일 → 2030-06-03", () => {
    const oneHouseExemptionProviso = { reason: "expropriation", expropriationDate: D("2025-06-02") } as TransferTaxInput["oneHouseExemptionProviso"];
    expect(ends(base({ oneHouseExemptionProviso }))).toEqual(["2030-06-03"]);
  });

  it("A6 §156의2⑤ 대체주택 — 완성일 2027-06-02 + 3년 말일 → 2030-06-03", () => {
    const replacementHouse = { completionDate: D("2027-06-02") } as TransferTaxInput["replacementHouse"];
    expect(ends(base({ replacementHouse }))).toEqual(["2030-06-03"]);
  });

  it("A7 기한 축이 없으면 말일도 고지도 없다 — 단순 1주택", () => {
    expect(ends(base({ householdHousingCount: 1 }))).toEqual([]);
    expect(has({ householdHousingCount: 1, acquisitionDate: D("2022-01-01"), transferDate: D("2028-06-05") })).toBe(false);
  });
});

describe("§155① 신규 취득 당시 조정 여부 미입력 — 두 독법의 말일이 모두 후보 (holiday-notice-deadlines.ts §155① 블록)", () => {
  // 종전 2025-01-01 · 신규 2026-09-01(제36737호 1호 대상 — 2026-08-04 이후 취득) · 양도 2026-10-01 이후
  //   → 두 주택 모두 조정 독법 2년 말일 2028-09-01(금) · 아닌 독법 3년 말일 2029-09-01(토) → 09-03(월)
  const tt = (transfer: string, regulated?: boolean): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2025-01-01"),
    transferDate: D(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2025-01-01"),
      newAcquisitionDate: D("2026-09-01"),
      ...(regulated === undefined
        ? {}
        : { previousHouseRegulatedAtNewAcquisition: regulated, newHouseRegulatedAtAcquisition: regulated }),
    },
  });
  const input = (transfer: string, regulated?: boolean) => baseTransferInput(tt(transfer, regulated)) as OneHouseJudgeInput;
  const ends = (transfer: string, regulated?: boolean) => declaredDeadlineEnds(input(transfer, regulated), rules, {}).map((e) => iso(e.end));
  const kind = (transfer: string, regulated?: boolean) => holidayTableNoticeKind(input(transfer, regulated), rules, {});

  it("U1 미입력이면 두 독법의 말일이 모두 후보다 — 2028-09-01(조정) · 2029-09-03(비조정)", () => {
    expect(ends("2029-09-05")).toEqual(["2028-09-01", "2029-09-03"]);
  });

  it("U2 ★ 비조정 독법의 3년 말일(2029-09-03) 이틀 뒤 양도(2029-09-05) → 고지 — 조정 독법 말일(2028-09-01)은 1년 앞이다", () => {
    expect(kind("2029-09-05")).toBe("provisional");
    expect(has(tt("2029-09-05"))).toBe(true);
  });

  it("U2 부정 짝 — 같은 사실을 「두 주택 모두 조정」으로 입력하면 3년 말일은 후보가 아니다 → 고지 없음", () => {
    expect(ends("2029-09-05", true)).toEqual(["2028-09-01"]);
    expect(kind("2029-09-05", true)).toBeUndefined();
    expect(has(tt("2029-09-05", true))).toBe(false);
  });

  it("U3 조정 독법의 2년 말일(2028-09-01) 사흘 뒤 양도(2028-09-04) → 고지 / 「조정 아님」 입력이면 그 말일은 후보가 아니다 → 고지 없음", () => {
    expect(kind("2028-09-04")).toBe("provisional");
    expect(ends("2028-09-04", false)).toEqual(["2029-09-03"]);
    expect(kind("2028-09-04", false)).toBeUndefined();
  });

  it("U4 두 말일 어디에도 곁에 있지 않은 양도(2029-03-02) → 미입력이어도 고지 없음", () => {
    expect(kind("2029-03-02")).toBeUndefined();
  });
});

describe("§155㉓ 임대주택 등록 말소 후 5년 — 최초 말소일의 5년 말일 (holiday-notice-deadlines.ts §155㉓ 블록)", () => {
  /** 2018-06-01 등록 매입 비아파트(가목) · 자진말소 */
  const unit = (cancellation: string, patch: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
    businessRegistrationDate: D("2018-06-01"),
    rentalRegistrationDate: D("2018-06-01"),
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    isExcluded918Rule: false,
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 30,
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    registrationCancellationDate: D(cancellation),
    requirementsConfirmed: true,
    ...patch,
  });
  const input = (transfer: string, units: RentalUnitInput[]) =>
    baseTransferInput({
      householdHousingCount: 2,
      acquisitionDate: D("2015-01-10"),
      transferDate: D(transfer),
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: units },
    }) as OneHouseJudgeInput;
  const ends = (i: OneHouseJudgeInput) => declaredDeadlineEnds(i, rules, {}).map((e) => iso(e.end));
  const kind = (i: OneHouseJudgeInput) => holidayTableNoticeKind(i, rules, {});

  it("M1 ★ 말소일 2025-06-02의 5년 말일 2030-06-02(일) → 06-03(월). 양도 2030-06-04 → 고지", () => {
    const i = input("2030-06-04", [unit("2025-06-02")]);
    expect(ends(i)).toEqual(["2030-06-03"]);
    expect(kind(i)).toBe("provisional");
  });

  it("M1 부정 짝 — 같은 말소, 말일보다 석 달 앞선 양도(2030-03-01) → 고지 없음", () => {
    expect(kind(input("2030-03-01", [unit("2025-06-02")]))).toBeUndefined();
  });

  it("M2 2호 이상이면 최초 말소일 기준 — 2025-06-02·2026-01-05 말소 → 말일은 2030-06-03 하나", () => {
    const i = input("2030-06-04", [unit("2026-01-05"), unit("2025-06-02")]);
    expect(ends(i)).toEqual(["2030-06-03"]);
    expect(kind(i)).toBe("provisional");
  });

  it("M3 부정 짝 — 말소 사실이 없으면(rentalAutoTermination false) 말일도 고지도 없다", () => {
    const i = input("2030-06-04", [unit("2025-06-02", { rentalAutoTermination: false })]);
    expect(ends(i)).toEqual([]);
    expect(kind(i)).toBeUndefined();
  });
});

describe("합가 요건 검토표 기한 줄 — 공휴일 단서 (#32 조건: 공휴일 고지를 좁히기 전에 먼저 붙인다)", () => {
  it("R1 혼인일 2019-03-09의 5년 말일 2024-03-09(토) → 03-11(월)까지 늘어났다는 단서가 기한 줄에 실린다", () => {
    const r = judge({
      householdHousingCount: 2,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2024-03-11"),
      residencePeriodMonths: 24,
      marriageMerge: { marriageDate: D("2019-03-09") } as TransferTaxInput["marriageMerge"],
      isFirstTransferredInMerge: true,
    });
    const row = r.requirementReview?.items.find((x) => x.id === "merge-window");
    expect(row).toBeDefined();
    expect(row?.note ?? "").toContain("2024-03-11까지 늘어났습니다");
  });

  it("R1 부정 짝 — 말일이 평일이면(혼인일 2019-03-12 → 2024-03-12) 단서가 없다", () => {
    const r = judge({
      householdHousingCount: 2,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2024-03-11"),
      residencePeriodMonths: 24,
      marriageMerge: { marriageDate: D("2019-03-12") } as TransferTaxInput["marriageMerge"],
      isFirstTransferredInMerge: true,
    });
    const row = r.requirementReview?.items.find((x) => x.id === "merge-window");
    expect(row?.note ?? "").not.toContain("늘어났습니다");
  });
});
