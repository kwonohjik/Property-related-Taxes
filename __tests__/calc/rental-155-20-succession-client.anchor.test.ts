/**
 * §155⑳ 임대사업 승계(G-3·G-5) — 클라이언트 데이터 계층 (①②③④⑧ · 계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` PR-2).
 *
 * 폼 `rentalSuccession`(승계 종류) · `donorBusinessRegistrationDate` · `donorRentalRegistrationDate` · `donorRentalRegisteredDate`.
 * 개월 칸은 기존 `decedentRentalMonths`를 3종류가 공유한다(의미 = 전 임대사업자 임대개월).
 */
import { describe, it, expect } from "vitest";
import {
  deriveHalfDutyRentalMonths,
  deriveRentalMonths,
  rentalSuccessionOf,
  withRentalSuccession,
  type RentalPeriod,
} from "@/lib/stores/calc-wizard-asset-rental-period";
import {
  rentalUnitDonorRegistrationInScope,
  rentalUnitRegApplicationDate,
  rentalUnitRegistrationBasis,
} from "@/lib/calc/rental-succession";
import { rentalUnitTerminationInScope } from "@/lib/calc/rental-unit-termination-scope";
import { rentalUnitUrbanLifeQuestionInScope } from "@/lib/calc/apt-deadline-extension-scope";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateRentalHousingException } from "@/lib/stores/calc-wizard-asset-migrate-rhe";
import { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema-rental-exception";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const P = (start: string, end: string): RentalPeriod => ({ start, end });
type UnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

const TRANSFER = "2024-06-01";

function asset(unitOver: Partial<UnitForm>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2019-06-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2021-03-01",
          rentalRegistrationDate: "2021-03-01",
          rentalRegisteredDate: "2021-03-01",
          isApartment: true,
          standardPriceAtRentalStart: "300,000,000",
          rentalMonths: "36",
          requirementsConfirmed: true,
          ...unitOver,
        },
      ],
    },
  };
}
const unitOf = (a: AssetForm) => a.rentalHousingException.rentalUnits[0];
const validate = (a: AssetForm) =>
  validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full");
const api = (a: AssetForm) =>
  toRentalHousingExceptionApi(a) as {
    rentalUnits: Array<{ rentalMonths: number; halfDutyRentalMonths?: number; succession?: Record<string, unknown>; donorRegistration?: Record<string, unknown> }>;
  };

const GIFT: Partial<UnitForm> = {
  rentalSuccession: "household_gift",
  decedentRentalMonths: "24",
  donorBusinessRegistrationDate: "2019-06-01",
  donorRentalRegistrationDate: "2019-06-01",
  donorRentalRegisteredDate: "2019-06-01",
};

describe("① ② ③ — 승계 종류 읽기 헬퍼·초기값·마이그레이션", () => {
  it("C-1 rentalSuccessionOf — 명시 값이 우선, 없으면 옛 isInheritedRental(true)을 상속으로", () => {
    expect(rentalSuccessionOf({ rentalSuccession: "household_gift" })).toBe("household_gift");
    expect(rentalSuccessionOf({ isInheritedRental: true })).toBe("inheritance");
    expect(rentalSuccessionOf({ rentalSuccession: "", isInheritedRental: true })).toBe("inheritance");
    expect(rentalSuccessionOf({ rentalSuccession: "assumption", isInheritedRental: true })).toBe("assumption");
    expect(rentalSuccessionOf({})).toBe("");
    expect(rentalSuccessionOf({ isInheritedRental: false })).toBe("");
  });

  it("C-2 ② 빈 호 초기값 — 승계 없음·증여자 날짜 빈 값", () => {
    const u = makeDefaultRentalUnit();
    expect(u.rentalSuccession).toBe("");
    expect(u.donorBusinessRegistrationDate).toBe("");
    expect(u.donorRentalRegistrationDate).toBe("");
    expect(u.donorRentalRegisteredDate).toBe("");
  });

  it("C-3 ③ migrate — isInheritedRental=true·승계 종류 없음 → 상속, 증여자 칸은 빈 값", () => {
    const a = {
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        rentalUnits: [{ isInheritedRental: true, decedentRentalMonths: "30" }, { isInheritedRental: false }, { rentalSuccession: "household_gift" }, { rentalSuccession: "bogus" }],
      },
    } as Record<string, unknown>;
    migrateRentalHousingException(a);
    const us = (a.rentalHousingException as { rentalUnits: Array<Record<string, unknown>> }).rentalUnits;
    expect(us[0].rentalSuccession).toBe("inheritance");
    expect(us[1].rentalSuccession).toBe("");
    expect(us[2].rentalSuccession).toBe("household_gift");
    expect(us[3].rentalSuccession).toBe("");
    expect(us[0].donorRentalRegistrationDate).toBe("");
    expect(us[0].donorBusinessRegistrationDate).toBe("");
    expect(us[0].donorRentalRegisteredDate).toBe("");
  });

  it("C-4 withRentalSuccession — 종류를 바꾸면 개월·증여자 칸을 비우고 옛 상속 플래그도 끈다(한 번의 갱신)", () => {
    const u = { ...makeDefaultRentalUnit(), ...GIFT, isInheritedRental: true };
    const none = withRentalSuccession(u, "");
    expect(none).toMatchObject({ rentalSuccession: "", isInheritedRental: false, decedentRentalMonths: "", donorBusinessRegistrationDate: "", donorRentalRegistrationDate: "", donorRentalRegisteredDate: "" });
    const inh = withRentalSuccession(u, "inheritance");
    expect(inh).toMatchObject({ rentalSuccession: "inheritance", decedentRentalMonths: "", donorRentalRegistrationDate: "" });
    // 같은 종류를 다시 고르면 입력을 지우지 않는다
    expect(withRentalSuccession(u, "household_gift")).toMatchObject({ decedentRentalMonths: "24", donorRentalRegistrationDate: "2019-06-01" });
  });
});

describe("④ 개월 합산 — 3종류 공통(엔진 개월 계산 불변)", () => {
  const base = { businessRegistrationDate: "2016-01-01", rentalRegistrationDate: "2016-01-01", rentalRegisteredDate: "2016-01-01" };

  it("5-1 ★ 포괄양수 — 전 임대사업자 24 + 양수인 12 = 36 (현행 12)", () => {
    expect(deriveRentalMonths({ ...base, rentalMonths: "12", rentalSuccession: "assumption", decedentRentalMonths: "24" })).toBe(36);
  });

  it("5-2 전 임대사업자 개월 0 → 12(불성립 쪽)", () => {
    expect(deriveRentalMonths({ ...base, rentalMonths: "12", rentalSuccession: "assumption", decedentRentalMonths: "0" })).toBe(12);
  });

  it("3-4 증여 — 증여자 24 + 수증자 구간 30 = 54", () => {
    expect(
      deriveRentalMonths({
        ...base,
        rentalInputMode: "interval",
        rentalPeriods: [P("2021-03-01", "2023-09-01")],
        rentalSuccession: "household_gift",
        decedentRentalMonths: "24",
      }),
    ).toBe(54);
  });

  it("승계 없음이면 개월 칸 잔재를 더하지 않는다 · 옛 상속 플래그는 그대로 더한다", () => {
    expect(deriveRentalMonths({ ...base, rentalMonths: "12", rentalSuccession: "", decedentRentalMonths: "30" })).toBe(12);
    expect(deriveRentalMonths({ ...base, rentalMonths: "12", isInheritedRental: true, decedentRentalMonths: "30" })).toBe(42);
  });

  it("㉓1호 1/2 개월(deriveHalfDutyRentalMonths)도 3종류 모두 합산한다", () => {
    for (const k of ["inheritance", "household_gift", "assumption"] as const) {
      expect(
        deriveHalfDutyRentalMonths({ rentalMonths: "12", rentalRegisteredDate: "2016-01-01", rentalSuccession: k, decedentRentalMonths: "24" }),
      ).toBe(36);
    }
  });

  it("④ rentalMonths·halfDutyRentalMonths로 엔진에 간다", () => {
    const a = asset({ ...GIFT, rentalAutoTermination: true, registrationCancellationDate: "2022-03-01", terminatedRegistrationType: "short_term", terminationReason: "auto" });
    const [u] = api(a).rentalUnits;
    expect(u.rentalMonths).toBe(60);
    expect(u.halfDutyRentalMonths).toBe(60);
  });
});

describe("④ 전송 — succession·donorRegistration (⑤·⑧과 같은 술어)", () => {
  it("W-1 증여 — succession + donorRegistration(3필드)", () => {
    const [u] = api(asset(GIFT)).rentalUnits;
    expect(u.succession).toEqual({ kind: "household_gift", predecessorMonths: 24 });
    expect(u.donorRegistration).toEqual({
      businessRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegisteredDate: "2019-06-01T00:00:00.000Z",
    });
  });

  it("W-2 상속·포괄양수 — succession만. 남아 있는 증여자 칸은 보내지 않는다", () => {
    for (const k of ["inheritance", "assumption"] as const) {
      const [u] = api(asset({ ...GIFT, rentalSuccession: k })).rentalUnits;
      expect(u.succession).toEqual({ kind: k, predecessorMonths: 24 });
      expect(u.donorRegistration).toBeUndefined();
    }
  });

  it("W-3 승계 없음 — 둘 다 없다(옛 isInheritedRental 기록은 상속으로 보낸다)", () => {
    const none = api(asset({ ...GIFT, rentalSuccession: "" })).rentalUnits[0];
    expect(none.succession).toBeUndefined();
    expect(none.donorRegistration).toBeUndefined();
    const legacy = api(asset({ rentalSuccession: undefined, isInheritedRental: true, decedentRentalMonths: "30" })).rentalUnits[0];
    expect(legacy.succession).toEqual({ kind: "inheritance", predecessorMonths: 30 });
  });

  it("W-4 증여자 등록일을 비우면 그 칸만 보내지 않는다(엔진이 신청일로 본다)", () => {
    const [u] = api(asset({ ...GIFT, donorRentalRegisteredDate: "" })).rentalUnits;
    expect(u.donorRegistration).toEqual({
      businessRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegistrationDate: "2019-06-01T00:00:00.000Z",
      rentalRegisteredDate: undefined,
    });
  });
});

describe("클라이언트 목 판정 4곳 — 증여면 증여자 등록 기준(3중 패턴)", () => {
  // 건설임대 · 가/마 구분이 아니라 다/바 구분으로 갈린다: 증여자 2019 → 다목(㉓ 대상) · 수증자 2021 → 바목(㉓ 대상 아님)
  it("D-1 rentalUnitRegistrationBasis·술어", () => {
    const g = unitOf(asset(GIFT));
    expect(rentalUnitDonorRegistrationInScope(g)).toBe(true);
    expect(rentalUnitRegistrationBasis(g)).toEqual({
      businessRegistrationDate: "2019-06-01",
      rentalRegistrationDate: "2019-06-01",
      rentalRegisteredDate: "2019-06-01",
    });
    const own = unitOf(asset({ ...GIFT, rentalSuccession: "assumption" }));
    expect(rentalUnitDonorRegistrationInScope(own)).toBe(false);
    expect(rentalUnitRegistrationBasis(own).rentalRegistrationDate).toBe("2021-03-01");
  });

  it("D-2 rentalUnitRegApplicationDate — 증여자 칸이 비어 있으면 null(본인 날짜로 대신하지 않는다)", () => {
    expect(rentalUnitRegApplicationDate(unitOf(asset(GIFT)))?.toISOString().slice(0, 10)).toBe("2019-06-01");
    expect(rentalUnitRegApplicationDate(unitOf(asset({ ...GIFT, donorRentalRegistrationDate: "" })))).toBeNull();
    expect(rentalUnitRegApplicationDate(unitOf(asset({})))?.toISOString().slice(0, 10)).toBe("2021-03-01");
  });

  it("D-3 rentalUnitTerminationInScope — 건설임대·말소: 증여자 2019(다목) 대상 / 수증자 2021(바목) 대상 아님", () => {
    const common = { rentalAcquisitionType: "construction" as const, rentalAutoTermination: true };
    expect(rentalUnitTerminationInScope(unitOf(asset({ ...common, ...GIFT })))).toBe(true);
    expect(rentalUnitTerminationInScope(unitOf(asset({ ...common })))).toBe(false);
  });

  it("D-4 rentalUnitUrbanLifeQuestionInScope — 증여자 2019 매입 아파트(가목)면 ⑪ 게이트 대상, 말소 호는 ㉓ 대상 목이면 제외", () => {
    expect(rentalUnitUrbanLifeQuestionInScope(unitOf(asset(GIFT)))).toBe(true);
    // 건설임대 + 말소: 증여자 기준 다목(㉓ 대상)이라 ⑪ 경로에서 빠진다 · 수증자 기준 바목은 게이트 대상 목이 아니다
    const c = { rentalAcquisitionType: "construction" as const, rentalAutoTermination: true };
    expect(rentalUnitUrbanLifeQuestionInScope(unitOf(asset({ ...c, ...GIFT })))).toBe(false);
  });

  it("D-5 ⑧ 도출 목 — 증여자 2019 매입(가목)이면 임대개시일 기준시가 필수(나·라목 칸이 아니다)", () => {
    const a = asset({ ...GIFT, standardPriceAtRentalStart: "" });
    expect(validate(a)).toContain("임대개시일 기준시가를 입력하세요");
  });
});

describe("⑧ 검증 — 승계 입력", () => {
  it("3-5 ★ 증여 + 증여자 날짜 미입력은 막는다(수증자 날짜로 대신하지 않는다)", () => {
    expect(validate(asset({ ...GIFT, donorBusinessRegistrationDate: "" }))).toContain("증여자");
    expect(validate(asset({ ...GIFT, donorBusinessRegistrationDate: "" }))).toContain("사업자등록일");
    expect(validate(asset({ ...GIFT, donorRentalRegistrationDate: "", donorRentalRegisteredDate: "" }))).toContain("등록신청일");
  });

  it("V-1 증여 개월 미입력 · 포괄양수 개월 미입력은 막는다 · 상속은 기존 문구 유지", () => {
    expect(validate(asset({ ...GIFT, decedentRentalMonths: "" }))).toContain("증여자 임대기간(개월)을 입력하세요");
    expect(validate(asset({ rentalSuccession: "assumption", decedentRentalMonths: "" }))).toContain("전 임대사업자 임대기간(개월)을 입력하세요");
    expect(validate(asset({ rentalSuccession: "inheritance", decedentRentalMonths: "" }))).toContain("피상속인 임대기간(개월)을 입력하세요");
    // 옛 기록(rentalSuccession 없음 + isInheritedRental)도 상속 규칙
    expect(validate(asset({ rentalSuccession: undefined, isInheritedRental: true, decedentRentalMonths: "" }))).toContain("피상속인 임대기간(개월)을 입력하세요");
  });

  it("V-2 순서 — 증여자 신청일이 수증자 신청일보다 뒤면 막고 같은 날은 통과", () => {
    expect(validate(asset({ ...GIFT, donorRentalRegistrationDate: "2021-03-02", donorRentalRegisteredDate: "2021-03-02" }))).toContain("증여자");
    expect(validate(asset({ ...GIFT, donorRentalRegistrationDate: "2021-03-01", donorRentalRegisteredDate: "2021-03-01" }))).toBeNull();
  });

  it("V-3 증여자 등록일은 증여자 신청일 이후여야 한다 · 비워도 된다(엔진이 신청일로 본다)", () => {
    expect(validate(asset({ ...GIFT, donorRentalRegisteredDate: "2019-05-31" }))).toContain("증여자");
    expect(validate(asset({ ...GIFT, donorRentalRegisteredDate: "" }))).toBeNull();
  });

  it("V-4 정상 증여 — 통과 · 증여자 칸 잔재는 승계 없음이면 검사하지 않는다", () => {
    expect(validate(asset(GIFT))).toBeNull();
    expect(validate(asset({ ...GIFT, rentalSuccession: "", donorRentalRegistrationDate: "2030-01-01" }))).toBeNull();
  });
});

describe("⑧ ↔ ⑫ 격자 — 승계 날짜 조합이 UI 통과 ⇔ API 통과로 일치한다", () => {
  // 수증자 신청일 2021-03-01. 증여자 신청일 × 증여자 등록일 × 증여자 사업자등록일 전수.
  const applications = ["2019-06-01", "2021-03-01", "2021-03-02", ""];
  const registered = ["", "2019-05-31", "2019-06-01", "2021-03-01", "2021-03-02"];
  const business = ["2019-06-01", ""];

  it("G-1 ⑧이 통과하면 ⑫도 통과하고, ⑧이 증여자 날짜로 막으면 ④가 보내지 않거나 ⑫가 400이다(모순 0)", () => {
    const contradictions: string[] = [];
    for (const app of applications) {
      for (const reg of registered) {
        for (const biz of business) {
          const a = asset({
            ...GIFT,
            donorBusinessRegistrationDate: biz,
            donorRentalRegistrationDate: app,
            donorRentalRegisteredDate: reg,
          });
          const msg = validate(a);
          const payload = toRentalHousingExceptionApi(a);
          const ok = payload ? rentalHousingExceptionSchema.safeParse(payload).success : false;
          const key = `신청일=${app || "-"} 등록일=${reg || "-"} 사업자=${biz || "-"}`;
          if (msg === null && !ok) contradictions.push(`${key}: ⑧ 통과 · ⑫ 거부`);
          // 증여자 날짜가 정상으로 전송된 조합(④가 donorRegistration을 보냄)에서 ⑫가 거부하는데 ⑧이 막지 않으면 모순 — 위 줄이 잡는다.
          // 반대(⑧ 차단 · ⑫ 통과)는 ⑧이 더 엄격한 필수(빈 칸)일 때만 허용 — 순서 위반은 둘 다 막아야 한다.
          if (msg !== null && ok && app && biz) {
            const orderViolation = app > "2021-03-01" || (reg && reg < app);
            if (orderViolation) contradictions.push(`${key}: 순서 위반인데 ⑫ 통과`);
          }
        }
      }
    }
    expect(contradictions).toEqual([]);
  });
});
