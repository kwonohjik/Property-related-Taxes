/**
 * V-5 — §155㉓1호 「민특법 §43 임대의무기간의 2분의 1 이상 임대」 판정 개월의 기산일.
 *
 * 민특령 §34①2호: 민간매입임대주택의 임대의무기간은 임대사업자 등록일(그 뒤 임대 개시면 실제 임대개시일)부터.
 * 서면-2021-부동산-7820(2022.9.26.) · 서면-2022-부동산-4280(2022.12.15.): ㉓1호·㉒2호라목1)·§167의3①2호사목의
 * 1/2 기산일도 같다 — 4280은 세무서 사업자등록(2022.8.)이 지자체 등록(2018.9.27.)보다 늦은 사실관계.
 *
 * #3260이 ⑳ 임대기간을 두 등록일 중 늦은 날로 자르면서(소령 §167의3③) ㉓1호도 그 값을 읽어, 세무서 등록이 늦은 호는
 * 1/2을 적게 셌다. 실측(2026-11-12 probe): 지자체 2018-01-01 · 세무서 2020-01-01 · 임대 2018-01-01~말소 2022-03-01
 * (장기일반 아파트 매입, 1/2 = 48) → 26개월로 ㉓ 불성립. 지자체 등록일부터면 50개월로 성립.
 *
 * | # | 주장 |
 * |---|---|
 * | HD-1 ★ | 1/2 판정 개월은 지자체 등록일로만 자른다(50) — ⑳ 임대기간(26)과 기산이 다르다 |
 * | HD-2 ★ | 엔진 ㉓1호는 `halfDutyRentalMonths`로 판정한다 — 50이면 성립, 미제공이면 종전대로 `rentalMonths`(26) |
 * | HD-3 | ④ 말소 토글 ON일 때만 싣는다 |
 * | HD-4 | ⑫ Zod가 벗기지 않고 ⑭ 매퍼가 엔진까지 넘긴다 |
 */
import { describe, it, expect } from "vitest";
import { deriveHalfDutyRentalMonths, deriveRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema-rental-exception";
import { toRentalHousingExceptionEngineInput } from "@/app/api/calc/transfer/_rental-engine-input";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const UNIT_FORM = {
  businessRegistrationDate: "2020-01-01",
  rentalRegistrationDate: "2018-01-01",
  rentalInputMode: "interval" as const,
  rentalPeriods: [{ start: "2018-01-01", end: "2022-03-01" }],
};

describe("HD-1 기산일", () => {
  it("★ 1/2 판정은 지자체 등록일부터 50개월 · ⑳ 임대기간은 두 등록일 중 늦은 날부터 26개월", () => {
    expect(deriveHalfDutyRentalMonths(UNIT_FORM)).toBe(50);
    expect(deriveRentalMonths(UNIT_FORM)).toBe(26);
  });
  it("지자체 등록 뒤에 임대를 시작했으면 실제 임대개시일부터(민특령 §34①2호 단서)", () => {
    expect(
      deriveHalfDutyRentalMonths({ ...UNIT_FORM, rentalPeriods: [{ start: "2019-01-01", end: "2022-03-01" }] }),
    ).toBe(38);
  });
  /**
   * HD-5 — 말소일까지만 센다(사용자 결정 2026-11-12). ㉓1호 「등록 말소 신청으로 등록이 말소된 경우(§43 임대의무기간의
   * 2분의 1 이상을 임대한 경우)」 — §43①의 임대의무는 등록 임대사업자의 임대라 말소 뒤 임대는 넣지 않는다.
   * 정면 해석례 없음(국세청 「2분의 1」 3건은 기산일만). 실측(변경 전): 등록 2019-01-01·말소 2020-06-01·구간 ~2022-01-01 → 36.
   */
  it("HD-5 ★ 말소일 뒤 임대분은 넣지 않는다 — 36 → 17", () => {
    expect(
      deriveHalfDutyRentalMonths({
        rentalRegistrationDate: "2019-01-01",
        rentalInputMode: "interval",
        rentalPeriods: [{ start: "2019-01-01", end: "2022-01-01" }],
        registrationCancellationDate: "2020-06-01",
      }),
    ).toBe(17);
  });
  it("HD-5 짝 — 말소일 뒤에 시작한 구간은 통째로 빠지고, 말소일이 비면 종전대로", () => {
    const form = {
      rentalRegistrationDate: "2019-01-01",
      rentalInputMode: "interval" as const,
      rentalPeriods: [{ start: "2019-01-01", end: "2020-01-01" }, { start: "2020-03-01", end: "2022-01-01" }],
    };
    expect(deriveHalfDutyRentalMonths({ ...form, registrationCancellationDate: "2020-02-01" })).toBe(12);
    expect(deriveHalfDutyRentalMonths({ ...form, registrationCancellationDate: "" })).toBe(36);
  });
  it("피상속인 개월은 ⑳과 같이 더한다(종전 동작 유지)", () => {
    expect(deriveHalfDutyRentalMonths({ ...UNIT_FORM, isInheritedRental: true, decedentRentalMonths: "10" })).toBe(60);
  });
});

const unit = (patch: Partial<RentalUnitInput>): RentalUnitInput => ({
  businessRegistrationDate: new Date("2020-01-01"),
  rentalRegistrationDate: new Date("2018-01-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: true,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 26,
  rentalAutoTermination: true,
  terminatedRegistrationType: "long_term_general",
  registrationCancellationDate: new Date("2022-03-01"),
  requirementsConfirmed: true,
  ...patch,
});
const ctx = {
  scenario: "A" as const,
  transferDate: new Date("2024-06-01"),
  residenceAcquisitionDate: new Date("2015-01-10"),
  priorRentalExemptionHistory: "none" as const,
};

describe("HD-2 엔진 ㉓1호", () => {
  it("★ halfDutyRentalMonths 50 → 1/2(48) 충족 → ⑳ 성립", () => {
    const e = checkEligibility([unit({ halfDutyRentalMonths: 50 })], 5, 5, false, ctx);
    expect(e.passed).toBe(true);
  });
  it("미제공(직접 API·옛 기록) → 종전대로 rentalMonths 26 → 불성립 · 문구에 26개월", () => {
    const e = checkEligibility([unit({})], 5, 5, false, ctx);
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.message).join("\n")).toContain("현재: 26개월");
  });
  it("halfDutyRentalMonths 40 → 불성립 · 문구에 그 값", () => {
    const e = checkEligibility([unit({ halfDutyRentalMonths: 40 })], 5, 5, false, ctx);
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.message).join("\n")).toContain("현재: 40개월");
  });
});

function asset(unitPatch: Record<string, unknown>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          ...UNIT_FORM,
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          isApartment: true,
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          ...unitPatch,
        },
      ],
    },
  };
}

type Api = { rentalUnits: Array<Record<string, unknown>> };

describe("HD-3·4 ④ → ⑫ → ⑭", () => {
  it("HD-3 말소 토글 ON이면 50을 싣고, OFF면 싣지 않는다", () => {
    const on = toRentalHousingExceptionApi(
      asset({ rentalAutoTermination: true, terminatedRegistrationType: "long_term_general", registrationCancellationDate: "2022-03-01" }),
    ) as Api;
    expect(on.rentalUnits[0].halfDutyRentalMonths).toBe(50);
    expect(on.rentalUnits[0].rentalMonths).toBe(26);
    const off = toRentalHousingExceptionApi(asset({ rentalAutoTermination: false })) as Api;
    expect(off.rentalUnits[0].halfDutyRentalMonths).toBeUndefined();
  });

  it("HD-4 Zod가 벗기지 않고 매퍼가 엔진 입력까지 넘긴다", () => {
    const api = toRentalHousingExceptionApi(
      asset({ rentalAutoTermination: true, terminatedRegistrationType: "long_term_general", registrationCancellationDate: "2022-03-01" }),
    );
    const parsed = rentalHousingExceptionSchema.parse(api);
    const engine = toRentalHousingExceptionEngineInput(parsed)!;
    expect(engine.rentalUnits[0].halfDutyRentalMonths).toBe(50);
  });
});
