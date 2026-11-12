/**
 * §155⑳ 임대기간 계산 — 기산일 자르기·3월 이내 공실 산입·상속 합산 anchor
 * (계획서 `docs/01-plan/features/rental-155-20-period-count.plan.md` §6).
 *
 * - 소득세법 시행령 §167의3③ 후단: 사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대 개시로 본다.
 * - 조특령 §97⑤5호 → 조세특례제한법 시행규칙 §44: 기존 임차인 퇴거일부터 다음 임차인 입주일까지 3월이내 기간은 산입.
 * - 조특령 §97⑤3호: 상속인이 상속으로 취득해 임대하면 피상속인 임대기간을 합산.
 *
 * 실측(2026-11-12 probe, 변경 전): RP-1 입력은 59개월, RP-4 입력은 60개월이었다.
 */
import { describe, it, expect } from "vitest";
import {
  deriveRentalMonths,
  recognizedRentalMonths,
  rentalRegistrationBasisDate,
  type RentalPeriod,
} from "@/lib/stores/calc-wizard-asset-rental-period";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const P = (start: string, end: string): RentalPeriod => ({ start, end });

describe("recognizedRentalMonths — 3월 이내 공실 산입(조특칙 §44)", () => {
  it("RP-1 ★ 공백 2개월은 산입 — 36 + 2 + 23 = 61 (변경 전 59)", () => {
    expect(recognizedRentalMonths([P("2015-01-01", "2018-01-01"), P("2018-03-01", "2020-02-01")], "")).toBe(61);
  });

  it("RP-2 공백 정확히 3개월은 산입(「이내」 경계 포함)", () => {
    // 2016-01-01~2018-01-01(24) + 공백 3 + 2018-04-01~2019-04-01(12) = 39
    expect(recognizedRentalMonths([P("2016-01-01", "2018-01-01"), P("2018-04-01", "2019-04-01")], "")).toBe(39);
  });

  it("RP-3 공백 3개월 + 1일은 공백 전체를 뺀다", () => {
    // 24 + 2018-04-02~2019-04-02(12) = 36
    expect(recognizedRentalMonths([P("2016-01-01", "2018-01-01"), P("2018-04-02", "2019-04-02")], "")).toBe(36);
  });

  it("RP-3b 월말 경계 — 1/31 퇴거 + 3개월 = 4/30 입주까지 산입", () => {
    // 2017-01-31~2018-01-31(12) → 2018-04-30 시작: 산입 → 2017-01-31~2019-04-30 = 26 (diffMonthsClamped: 30 < 31 → 27-1)
    expect(recognizedRentalMonths([P("2017-01-31", "2018-01-31"), P("2018-04-30", "2019-04-30")], "")).toBe(26);
  });

  it("RP-8 입력 순서와 무관(정렬 후 판단)", () => {
    expect(recognizedRentalMonths([P("2018-03-01", "2020-02-01"), P("2015-01-01", "2018-01-01")], "")).toBe(61);
  });
});

describe("recognizedRentalMonths — 기산일 자르기(소령 §167의3③)", () => {
  it("RP-4 ★ 등록일(2016-01-01) 전 임대분은 뺀다 — 60 → 36", () => {
    expect(recognizedRentalMonths([P("2014-01-01", "2019-01-01")], "2016-01-01")).toBe(36);
  });

  it("RP-5 구간 전체가 등록일 전이면 0", () => {
    expect(recognizedRentalMonths([P("2010-01-01", "2012-01-01")], "2016-01-01")).toBe(0);
  });

  it("RP-5b 자르기 후 공백으로 판단 — 등록 전 구간은 이어 붙이는 근거가 되지 않는다", () => {
    // 등록 2016-01-01: 첫 구간 2014~2015-12-01 전부 잘림 → 둘째 구간만 2016-02-01~2019-02-01 = 36
    expect(
      recognizedRentalMonths([P("2014-01-01", "2015-12-01"), P("2016-02-01", "2019-02-01")], "2016-01-01"),
    ).toBe(36);
  });

  it("기산 기준일 = 세무서 사업자등록일·지자체 등록신청일 중 늦은 날", () => {
    expect(rentalRegistrationBasisDate({ businessRegistrationDate: "2016-03-01", rentalRegistrationDate: "2016-01-01", rentalRegisteredDate: "2016-01-01" })).toBe("2016-03-01");
    expect(rentalRegistrationBasisDate({ businessRegistrationDate: "", rentalRegistrationDate: "2016-01-01", rentalRegisteredDate: "2016-01-01" })).toBe("2016-01-01");
    expect(rentalRegistrationBasisDate({})).toBe("");
  });
});

describe("deriveRentalMonths — 모드·상속 합산", () => {
  const base = { businessRegistrationDate: "2016-01-01", rentalRegistrationDate: "2016-01-01", rentalRegisteredDate: "2016-01-01" };

  it("RP-6 direct 59는 그대로(사용자가 계산한 값 — 자르지 않는다)", () => {
    expect(deriveRentalMonths({ ...base, rentalInputMode: "direct", rentalMonths: "59" })).toBe(59);
  });

  it("RP-7 기존 단언 유지 — 공백 1년 2구간 = 60(등록일이 구간보다 앞)", () => {
    expect(
      deriveRentalMonths({
        businessRegistrationDate: "2018-01-01",
        rentalRegistrationDate: "2018-01-01", rentalRegisteredDate: "2018-01-01",
        rentalInputMode: "interval",
        rentalPeriods: [P("2019-01-01", "2021-01-01"), P("2022-01-01", "2025-01-01")],
      }),
    ).toBe(60);
  });

  it("IH-1 ★ 상속 — 피상속인 30개월 + 상속인 구간(등록일로 잘림) 36개월 = 66", () => {
    expect(
      deriveRentalMonths({
        ...base,
        rentalInputMode: "interval",
        rentalPeriods: [P("2014-01-01", "2019-01-01")],
        isInheritedRental: true,
        decedentRentalMonths: "30",
      }),
    ).toBe(66);
  });

  it("IH-2 상속 토글 OFF면 피상속인 칸 값이 남아 있어도 더하지 않는다", () => {
    expect(
      deriveRentalMonths({
        ...base,
        rentalInputMode: "interval",
        rentalPeriods: [P("2014-01-01", "2019-01-01")],
        isInheritedRental: false,
        decedentRentalMonths: "30",
      }),
    ).toBe(36);
  });
});

const TRANSFER = "2025-03-03";

function asset(unitOver: Record<string, unknown>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2015-01-04",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2015-01-01",
          rentalRegistrationDate: "2015-01-01", rentalRegisteredDate: "2015-01-01",
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          ...unitOver,
        },
      ],
    },
  };
}

describe("④ API 변환·⑧ 검증", () => {
  it("API-1 ★ ④가 인정 개월(61)을 엔진 rentalMonths로 싣는다", () => {
    const a = asset({
      rentalInputMode: "interval",
      rentalPeriods: [P("2015-01-01", "2018-01-01"), P("2018-03-01", "2020-02-01")],
    });
    const api = toRentalHousingExceptionApi(a) as { rentalUnits: Array<{ rentalMonths: number }> };
    expect(api.rentalUnits[0].rentalMonths).toBe(61);
  });

  it("VAL-1 ★ 상속 토글 ON + 피상속인 개월 미입력은 막는다", () => {
    const a = asset({ rentalMonths: "96", isInheritedRental: true, decedentRentalMonths: "" });
    expect(
      validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full"),
    ).toContain("피상속인 임대기간(개월)을 입력하세요");
  });

  it("VAL-2 부정 짝 — 피상속인 개월이 있거나 토글 OFF면 이 사유로 막지 않는다", () => {
    for (const over of [
      { rentalMonths: "96", isInheritedRental: true, decedentRentalMonths: "12" },
      { rentalMonths: "96", isInheritedRental: false, decedentRentalMonths: "" },
    ]) {
      const a = asset(over);
      const r = validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full");
      expect(r ?? "").not.toContain("피상속인 임대기간");
    }
  });
});
