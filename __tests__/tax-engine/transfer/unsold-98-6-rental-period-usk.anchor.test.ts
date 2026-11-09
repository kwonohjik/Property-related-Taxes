// 그룹 K anchor — §98의6 2호 임대기간 (US-24 공실 · US-25 ⑧ 공백 · US-60 등록일 기산) + Q-22 (a) 초일 산입
//          + 사용자 결정(2026-11-09) §98의6 감면주택 주택 수 제외 — 2011.3.29.~5.18. 양도 포함(현행 유지)
//
// 근거: docs/reviews/unsold-98-series-review-2026-11.md US-24 · US-25 · US-60 · Q-22 (a).
// 조특령 §98의5⑤1호 「임대를 개시하는 날부터 기산할 것」→ 개시일 당일 산입(civil-period `completedMonthsInclusive`, D 유형).
// 공실: 령 §98의5⑤에 산입 규정 없음 → 임대기간에서 제외. 구간별 만 개월 합산 방식은 법령에 정함이 없다(확인 필요).
import { describe, it, expect } from "vitest";
import {
  unsold986RentalBasisDate,
  unsold986RentalMonthsExcludingVacancy,
  unsold986RentalSegments,
} from "@/lib/tax-engine/transfer-reductions/unsold-98-6-rental-period";
import { evaluateUnsold986, type Unsold986Input } from "@/lib/tax-engine/transfer-reductions/unsold-98-6";
import { resolveSpecialHouseExclusions } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

// ───────────────────────── leaf: 초일 산입 · 공실 ─────────────────────────
describe("K-1 leaf — 초일 산입 만 개월 (Q-22 (a))", () => {
  const m = (a: string, b: string, vac: Array<[string, string]> = []) =>
    unsold986RentalMonthsExcludingVacancy(D(a), D(b), vac.map(([s, e]) => ({ startDate: D(s), endDate: D(e) })));

  it("개시 2011-12-01 → 종료 2016-11-30 = 60개월(5년 전날 적격) · 2016-11-29 = 59개월 · 2016-12-01 = 60개월", () => {
    expect(m("2011-12-01", "2016-11-30")).toBe(60);
    expect(m("2011-12-01", "2016-11-29")).toBe(59);
    expect(m("2011-12-01", "2016-12-01")).toBe(60);
  });

  it("공실 없음 = 한 구간과 같다 · 공실이 구간 밖이면 영향 없음", () => {
    expect(unsold986RentalSegments(D("2011-12-01"), D("2016-11-30"), [])).toHaveLength(1);
    expect(m("2011-12-01", "2016-11-30", [["2010-01-01", "2011-11-30"], ["2016-12-01", "2017-01-01"]])).toBe(60);
  });

  it("공실 12개월(2014-01-01~2014-12-31) 제외: 2011-12-01~2017-02-28 = 63개월 → 2구간 합 51개월", () => {
    // 구간1 2011-12-01~2013-12-31 = 25개월, 구간2 2015-01-01~2017-02-28 = 26개월
    expect(m("2011-12-01", "2017-02-28")).toBe(63);
    expect(m("2011-12-01", "2017-02-28", [["2014-01-01", "2014-12-31"]])).toBe(51);
  });

  it("공실 시작일·종료일도 공실에 포함(양 끝 포함) — 하루 공실로 59개월 경계가 갈린다", () => {
    // 개시 2011-12-01, 양도 2016-11-30 = 60개월. 공실 1일(2013-05-10) → 구간1 2011-12-01~2013-05-09(17개월) + 구간2 2013-05-11~2016-11-30(42개월)
    expect(m("2011-12-01", "2016-11-30", [["2013-05-10", "2013-05-10"]])).toBe(59);
  });

  it("기산일 = max(사업자등록일, 임대사업자등록일, 실제 임대개시일)", () => {
    expect(unsold986RentalBasisDate(D("2011-12-01"), D("2012-06-01"), D("2011-11-01")).toISOString().slice(0, 10)).toBe("2012-06-01");
    expect(unsold986RentalBasisDate(D("2011-12-01"), D("2011-10-01"), D("2012-01-15")).toISOString().slice(0, 10)).toBe("2012-01-15");
    expect(unsold986RentalBasisDate(D("2011-12-01"), D("2011-10-01"), D("2011-11-01")).toISOString().slice(0, 10)).toBe("2011-12-01");
  });
});

// ───────────────────────── 엔진: evaluateUnsold986 ─────────────────────────
const base986 = (over: Partial<Unsold986Input> = {}): Unsold986Input => ({
  transferDate: D("2016-12-15"),
  acquisitionDate: D("2011-11-01"),
  hoType: "buyer_rented",
  stdPriceSumAtBase: 400_000_000,
  floorAreaSqm: 84,
  isUnsoldAfterCompletion: true,
  isFirstContract: true,
  isNotOccupiedAfterCompletion: true,
  isNotRecontract: true,
  rentalContractDate: D("2011-11-15"),
  rentalStartDate: D("2011-12-01"),
  businessRegistrationDate: D("2011-11-20"),
  rentalRegistrationDate: D("2011-11-25"),
  transferIncome: 100_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 400_000_000,
  ...over,
});
const codes = (i: Unsold986Input) => evaluateUnsold986(i).ineligibleReasons.map((x) => x.code);

describe("K-2 엔진 — 2호 임대기간 5년", () => {
  it("US-60: 등록 2012-06-01(실제 개시 2011-12-01) → 기산 2012-06-01, 양도 2016-12-15 = 54개월 불적격 / 등록 전 개시면 60개월 적격", () => {
    const late = base986({ businessRegistrationDate: D("2012-05-01"), rentalRegistrationDate: D("2012-06-01") });
    expect(codes(late)).toContain("RENTAL_PERIOD_SHORT");
    expect(codes(late)).toContain("REGISTRATION_AFTER_DEADLINE"); // 2012.1.1. 이후 등록 — 사용자 결정 2026-11-09
    expect(evaluateUnsold986(late).ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message).toContain("54개월");
    expect(codes(base986())).not.toContain("RENTAL_PERIOD_SHORT");
  });

  it("사용자 결정 2026-11-09: 등록 2011-12-31 적격 / 2012-01-01 부적격 — 사업자등록·임대사업자등록 각각", () => {
    const ok = (o: Partial<Unsold986Input>) => codes(base986({ transferDate: D("2017-12-31"), ...o }));
    expect(ok({ businessRegistrationDate: D("2011-12-31") })).not.toContain("REGISTRATION_AFTER_DEADLINE");
    expect(ok({ rentalRegistrationDate: D("2011-12-31") })).not.toContain("REGISTRATION_AFTER_DEADLINE");
    expect(ok({ businessRegistrationDate: D("2012-01-01") })).toContain("REGISTRATION_AFTER_DEADLINE");
    expect(ok({ rentalRegistrationDate: D("2012-01-01") })).toContain("REGISTRATION_AFTER_DEADLINE");
    // 등록이 계약(2011-11-15)보다 늦지만 2011년 안 — 사유 아님, 기산만 늦춘다(등록 2011-12-31 → 기산 2011-12-31)
    const r = evaluateUnsold986(base986({ transferDate: D("2017-12-31"), rentalRegistrationDate: D("2011-12-31") }));
    expect(r.isEligible).toBe(true);
    expect(r.rentalPeriodEcho?.basisDate).toBe("2011-12-31");
    expect(r.rentalPeriodEcho?.rentalMonths).toBe(72);
  });

  it("⑦ echo: 적격이어도 인정 임대기간·기산일·공실 개월을 싣는다 (엔진 판정 불변)", () => {
    const r = evaluateUnsold986(
      base986({ transferDate: D("2018-12-31"), rentalVacancies: [{ startDate: D("2014-01-01"), endDate: D("2014-12-31") }] }),
    );
    expect(r.isEligible).toBe(true);
    // 2011-12-01~2018-12-31 = 85개월, 공실 12개월 제외 → 구간 25 + 48 = 73개월
    expect(r.rentalPeriodEcho).toEqual({ basisDate: "2011-12-01", rentalMonths: 73, vacancyMonths: 12, inheritedMonths: 0 });
  });

  it("Q-22 (a): 기산 2011-12-01 — 양도 2016-11-30 적격(60) / 2016-11-29 불적격(59)", () => {
    expect(codes(base986({ transferDate: D("2016-11-30") }))).not.toContain("RENTAL_PERIOD_SHORT");
    expect(codes(base986({ transferDate: D("2016-11-29") }))).toContain("RENTAL_PERIOD_SHORT");
  });

  it("US-24: 양도 2017-03-01 · 2014년 12개월 공실 — 공실 없음 적격(63) / 공실 입력 시 불적격(51)", () => {
    const i = base986({ transferDate: D("2017-03-01"), standardPriceAtAcquisition: 200_000_000 });
    expect(codes(i)).not.toContain("RENTAL_PERIOD_SHORT");
    const v = base986({ transferDate: D("2017-03-01"), rentalVacancies: [{ startDate: D("2014-01-01"), endDate: D("2014-12-31") }] });
    const msg = evaluateUnsold986(v).ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message ?? "";
    expect(msg).toContain("인정 임대기간 51개월");
    expect(msg).toContain("공실 구간 제외");
  });

  it("US-25: 종료 > 양도 — 양도일까지로 자른다(66개월 → 59개월 불적격). 종료 < 개시 · 계약 > 개시 · 등록일 미입력은 사유로 막는다", () => {
    const over = base986({ transferDate: D("2016-06-01"), rentalStartDate: D("2011-07-01"), rentalContractDate: D("2011-06-01"), businessRegistrationDate: D("2011-06-10"), rentalRegistrationDate: D("2011-06-15"), rentalEndDate: D("2017-01-01") });
    expect(codes(over)).toContain("RENTAL_PERIOD_SHORT"); // 2011-07-01~2016-06-01 = 59개월(양도일 상한)
    expect(evaluateUnsold986(over).ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message).toContain("59개월");
    expect(codes(base986({ rentalEndDate: D("2010-01-01") }))).toContain("RENTAL_DATE_ORDER");
    expect(codes(base986({ rentalContractDate: D("2011-12-02") }))).toContain("RENTAL_DATE_ORDER");
    expect(codes(base986({ businessRegistrationDate: undefined }))).toContain("MISSING_RENTAL_REGISTRATION");
    expect(codes(base986({ rentalRegistrationDate: undefined }))).toContain("MISSING_RENTAL_REGISTRATION");
    expect(codes(base986({ inheritedRentalMonths: 5.9 }))).toContain("INVALID_INHERITED_RENTAL_MONTHS");
    expect(codes(base986({ rentalVacancies: [{ startDate: D("2013-02-01"), endDate: D("2013-01-01") }] }))).toContain("RENTAL_VACANCY_ORDER");
  });

  it("상속 합산은 정수 개월 그대로 더한다 — 본인 54개월 + 6 = 60 적격 / +5 = 59 불적격", () => {
    // 기산 2011-12-01 ~ 2016-05-31 = 54개월
    const t = D("2016-05-31");
    expect(codes(base986({ transferDate: t, inheritedRentalMonths: 6 }))).not.toContain("RENTAL_PERIOD_SHORT");
    expect(codes(base986({ transferDate: t, inheritedRentalMonths: 5 }))).toContain("RENTAL_PERIOD_SHORT");
  });
});

// ───────────────────────── 세액: 리뷰 US-24 시나리오 (mock 세율) ─────────────────────────
const UNSOLD_986_2 = (over: Record<string, unknown> = {}) =>
  ({
    type: "unsold_98_6" as const,
    hoType986: "buyer_rented" as const,
    stdPriceSumAtBase986: 400_000_000,
    floorAreaSqm986: 84,
    isUnsoldAfterCompletion986: true,
    isFirstContract986: true,
    isNotOccupiedAfterCompletion986: true,
    isNotRecontract986: true,
    rentalContractDate986: D("2011-11-15"),
    rentalStartDate986: D("2011-12-01"),
    businessRegistrationDate986: D("2011-11-20"),
    rentalRegistrationDate986: D("2011-11-25"),
    standardPriceAtAcquisition986: 200_000_000,
    standardPriceAt5Years986: 300_000_000,
    standardPriceAtTransfer986: 400_000_000,
    ...over,
  }) as unknown as NonNullable<TransferTaxInput["reductions"]>[number];

const run = (reductions: TransferTaxInput["reductions"], transferDate = "2017-03-01") =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("2011-11-01"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      reductions,
    }),
    rates,
  );

describe("K-3 세액 anchor — 리뷰 US-24 시나리오(취득 2011-11-01 · 개시 2011-12-01 · 양도 2017-03-01 · 5억/3억)", () => {
  const none = run([]);
  const noVacancy = run([UNSOLD_986_2()]);
  const vacancy = run([UNSOLD_986_2({ rentalVacancyPeriods986: [{ startDate: D("2014-01-01"), endDate: D("2014-12-31") }] })]);

  it("감면 없음(법령상 값) = 공실 12개월을 입력한 값 — 51개월 불적격", () => {
    expect(none.totalTax).toBe(52_261_000); // 리뷰 US-24 mock 값
    expect(vacancy.totalTax).toBe(none.totalTax);
  });

  it("공실 미입력(종전과 같은 63개월 적격) = 리뷰의 현재값 37,343,500 → 14,917,500 과소", () => {
    expect(noVacancy.totalTax).toBe(37_343_500);
    expect(none.totalTax - noVacancy.totalTax).toBe(14_917_500);
  });
});

// ───────────────────────── ⑧ validate ─────────────────────────
function form986(over: Record<string, unknown>, transferDate = "2016-12-15") {
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  const r = {
    type: "unsold_98_6",
    hoType986: "buyer_rented",
    stdPriceSumAtBase986: "400,000,000",
    floorAreaSqm986: "84",
    isEligibleSubject986: true,
    isUnsoldAfterCompletion986: true,
    isFirstContract986: true,
    isNotOccupiedAfterCompletion986: true,
    isNotRecontract986: true,
    sellerRented2Years986: false,
    rentalContractDate986: "2011-11-15",
    rentalStartDate986: "2011-12-01",
    businessRegistrationDate986: "2011-11-20",
    rentalRegistrationDate986: "2011-11-25",
    rentalEndDate986: "",
    rentalVacancyPeriods986: [],
    inheritedRentalMonths986: "",
    standardPriceAtAcquisition986: "200,000,000",
    standardPriceAt5Years986: "300,000,000",
    standardPriceAtTransfer986: "400,000,000",
    ...over,
  } as unknown as AssetReductionForm;
  form.assets[0] = { ...form.assets[0], acquisitionDate: "2011-11-01", reductions: [r] };
  return form;
}
const v8 = (over: Record<string, unknown>, transferDate?: string) => validateStep(2, form986(over, transferDate)) ?? null;

describe("K-4 ⑧ — 2호 임대 입력 검증", () => {
  it("정상 입력은 통과", () => {
    expect(v8({})).toBeNull();
  });
  it("US-60: 사업자등록일·임대사업자등록일 미입력 차단", () => {
    expect(v8({ businessRegistrationDate986: "" })).toMatch(/^§98의6 2호 적용: 사업자등록일/);
    expect(v8({ rentalRegistrationDate986: "" })).toMatch(/^§98의6 2호 적용: 임대사업자등록일/);
  });
  it("US-25: 종료 < 개시 · 계약 > 개시 · 종료 > 양도 차단", () => {
    expect(v8({ rentalEndDate986: "2010-01-01" })).toMatch(/임대종료일이 임대개시일보다 앞섭니다/);
    expect(v8({ rentalContractDate986: "2011-12-02" })).toMatch(/임대계약 체결일이 임대개시일보다 늦습니다/);
    expect(v8({ rentalEndDate986: "2017-01-01" })).toMatch(/임대종료일이 양도일보다 늦습니다/);
    expect(v8({ rentalEndDate986: "2016-12-15" })).toBeNull(); // 종료 = 양도일은 통과
  });
  it("US-25: 상속 합산 소수·음수 차단, 정수·0은 통과", () => {
    expect(v8({ inheritedRentalMonths986: "5.9" })).toMatch(/정수 개월/);
    expect(v8({ inheritedRentalMonths986: "0.5" })).toMatch(/정수 개월/);
    expect(v8({ inheritedRentalMonths986: "-1" })).toMatch(/정수 개월/);
    expect(v8({ inheritedRentalMonths986: "6" })).toBeNull();
    expect(v8({ inheritedRentalMonths986: "0" })).toBeNull();
  });
  it("US-24: 공실 행 미완성·역전 차단", () => {
    expect(v8({ rentalVacancyPeriods986: [{ startDate: "2014-01-01", endDate: "" }] })).toMatch(/공실 구간의 시작일·종료일을 모두/);
    expect(v8({ rentalVacancyPeriods986: [{ startDate: "2014-02-01", endDate: "2014-01-01" }] })).toMatch(/공실 구간의 종료일이 시작일보다/);
    expect(v8({ rentalVacancyPeriods986: [{ startDate: "2014-01-01", endDate: "2014-12-31" }] })).toBeNull();
  });
});

// ───────────────────────── 사용자 결정: 주택 수 제외 (양도일 게이트 없음) ─────────────────────────
describe("K-5 §98의6 주택 수 제외 — 2011.3.29.~5.18. 취득·같은 기간 양도도 제외 (사용자 결정 2026-11-09 · 부칙 제10631호 제4조)", () => {
  const entry = (transferDate: string, acq = "2011-04-15") =>
    resolveSpecialHouseExclusions(
      [
        {
          article: "unsold_98_6",
          houseAcquisitionDate: D(acq),
          houseContractDate: D(acq),
          requirementsConfirmed: true,
        } as unknown as NonNullable<Parameters<typeof resolveSpecialHouseExclusions>[0]>[number],
      ],
      D(transferDate),
    );

  it("취득 2011-04-15 감면주택 + 양도 2011-05-10 → 제외 1 (신설 2011.5.19. 시행 전 양도도 현행 유지)", () => {
    const r = entry("2011-05-10");
    expect(r.excludedCount).toBe(1);
  });
  it("대조: 양도 2011-06-01 (시행 후)도 제외 1 · 취득 2011-03-28(하한 미만)은 제외 0", () => {
    expect(entry("2011-06-01").excludedCount).toBe(1);
    expect(entry("2011-05-10", "2011-03-28").excludedCount).toBe(0);
  });
});
