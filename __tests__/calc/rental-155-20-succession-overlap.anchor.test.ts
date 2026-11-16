/**
 * V-9 — 임대사업 승계(증여·상속) 전 임대사업자 개월과 본인 기간의 이중 계산 차단(⑧·⑫ 같은 술어 `successionPeriodOverlap`).
 * 계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` V-9.
 *
 * 전 사업자 개월은 그의 등록 뒤 승계일 전까지 흐른 기간이고 본인은 승계 뒤 등록한다 →
 * 「전 사업자 이른 등록일 + 전 사업자 개월」 ≤ 승계일 ≤ 본인 기산일(세무서·지자체 등록 중 늦은 날). 어기면 같은 달을 두 번 센다.
 *
 * 수정 전 실측(2026-11-16): 증여자 2016-01 등록·60개월 · 수증자 등록 2018-01(증여 전) · 구간 2018-01~2023-01 → ⑧ 통과 · 전송 120개월
 * (증여 2021-01 이후 실제 본인 기간은 최대 24개월 → 84) · 수증자 등록 = 증여자 등록 2016-01 · 구간 2016-01~2024-01 → ⑧ 통과 · 156개월.
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { successionPeriodOverlap } from "@/lib/calc/rental-succession-overlap";
import { deriveRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema-rental-exception";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type U = AssetForm["rentalHousingException"]["rentalUnits"][number];

function asset(o: Partial<U>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2015-06-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          isApartment: false,
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          rentalInputMode: "interval",
          ...o,
        },
      ],
    },
  } as AssetForm;
}

/** 증여자 2016-01-01 등록 · 60개월 → 증여일은 2021-01-01 이후 */
const GIFT: Partial<U> = {
  rentalSuccession: "household_gift",
  decedentRentalMonths: "60",
  donorBusinessRegistrationDate: "2016-01-01",
  donorRentalRegistrationDate: "2016-01-01",
  donorRentalRegisteredDate: "2016-01-01",
};
const DONOR = { businessRegistrationDate: "2016-01-01", rentalRegistrationDate: "2016-01-01", rentalRegisteredDate: "2016-01-01" };
const own = (d: string, end = "2024-02-01"): Partial<U> => ({
  businessRegistrationDate: d,
  rentalRegistrationDate: d,
  rentalRegisteredDate: d,
  rentalPeriods: [{ start: d, end }],
});

const validate = (a: AssetForm) => validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", "2024-06-01", "full");
const zod = (a: AssetForm) => rentalHousingExceptionSchema.safeParse(toRentalHousingExceptionApi(a));
const zodMessages = (a: AssetForm) => {
  const r = zod(a);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("V-9 ⑧ — 증여자 개월과 수증자 기간이 겹치면 막는다", () => {
  it("O-1 정상 — 수증자 2021-02-01 등록(증여 뒤) → 통과 · 60 + 36 = 96", () => {
    const a = asset({ ...GIFT, ...own("2021-02-01") });
    expect(validate(a)).toBeNull();
    expect(zod(a).success).toBe(true);
    expect(deriveRentalMonths(a.rentalHousingException.rentalUnits[0])).toBe(96);
  });

  it("O-2 ★ 수증자 등록 2018-01-01(증여 전) → 차단 · 경계일 2021-01-01 · 기산일 2018-01-01을 적는다", () => {
    const m = validate(asset({ ...GIFT, ...own("2018-01-01", "2023-01-01") }));
    expect(m).toContain("겹칩니다");
    expect(m).toContain("증여자 임대기간 60개월");
    expect(m).toContain("2021-01-01");
    expect(m).toContain("2018-01-01");
  });

  it("O-3 ★ 수증자 등록 = 증여자 등록(2016-01-01) → 차단", () => {
    expect(validate(asset({ ...GIFT, ...own("2016-01-01") }))).toContain("겹칩니다");
  });

  it("O-4 경계 — 기산일 = 경계일(2021-01-01) 통과 · 하루 전(2020-12-31) 차단", () => {
    expect(validate(asset({ ...GIFT, ...own("2021-01-01") }))).toBeNull();
    expect(validate(asset({ ...GIFT, ...own("2020-12-31") }))).toContain("겹칩니다");
  });

  it("O-5 수증자 세무서 사업자등록이 증여 전이어도(다른 주택 사업) 지자체 등록이 증여 뒤면 기산일은 늦은 날 → 통과", () => {
    const a = asset({ ...GIFT, ...own("2021-02-01"), businessRegistrationDate: "2017-05-01" });
    expect(validate(a)).toBeNull();
    expect(zod(a).success).toBe(true);
  });

  it("O-6 경계는 증여자의 이른 등록일로 잡는다 — 증여자 지자체 2016-01 · 세무서 2017-01이면 2021-01-01 기준(관대)", () => {
    expect(validate(asset({ ...GIFT, donorBusinessRegistrationDate: "2017-01-01", ...own("2021-01-01") }))).toBeNull();
  });

  it("O-7 상속 — 피상속인 날짜를 넣었으면 같은 규칙(피상속인 문구) · 비우면 판정하지 않는다", () => {
    const INH = { ...GIFT, rentalSuccession: "inheritance" as const };
    expect(validate(asset({ ...INH, ...own("2018-01-01") }))).toContain("피상속인 임대기간 60개월");
    expect(
      validate(asset({ ...INH, ...own("2018-01-01"), donorBusinessRegistrationDate: "", donorRentalRegistrationDate: "", donorRentalRegisteredDate: "" })),
    ).toBeNull();
  });

  it("O-8 포괄양수 — 전 사업자 날짜 칸이 없어 판정하지 않는다", () => {
    expect(validate(asset({ rentalSuccession: "assumption", decedentRentalMonths: "60", ...own("2018-01-01") }))).toBeNull();
  });

  it("O-9 수증자 구간이 등록 전부터 시작해도 등록일로 잘려 이중 계산이 없다(구간 2019-01~ · 등록 2021-02 → 36)", () => {
    const a = asset({ ...GIFT, ...own("2021-02-01"), rentalPeriods: [{ start: "2019-01-01", end: "2024-02-01" }] });
    expect(validate(a)).toBeNull();
    expect(deriveRentalMonths(a.rentalHousingException.rentalUnits[0])).toBe(96);
  });
});

describe("V-9 ⑫ — 같은 술어로 400", () => {
  it("Z-1 O-2·O-3 입력 → 400 · 경로 succession.predecessorMonths · 문구 같음", () => {
    for (const d of ["2018-01-01", "2016-01-01"]) {
      const a = asset({ ...GIFT, ...own(d) });
      const r = zod(a);
      expect(r.success).toBe(false);
      const issue = r.success ? undefined : r.error.issues.find((i) => i.message.includes("겹칩니다"));
      expect(issue?.path).toEqual(["rentalUnits", 0, "succession", "predecessorMonths"]);
      expect(validate(a)).toContain(issue!.message);
    }
  });

  it("G-1 ⑧ ↔ ⑫ 격자 — 수증자 기산일 × 증여자 개월 × 승계 종류, 겹침 판정이 일치한다", () => {
    const owns = ["2016-01-01", "2018-01-01", "2020-12-31", "2021-01-01", "2021-02-01"];
    const months = ["1", "59", "60", "61", "120"];
    const kinds = ["household_gift", "inheritance"] as const;
    const mismatches: string[] = [];
    for (const d of owns) {
      for (const mo of months) {
        for (const k of kinds) {
          const a = asset({ ...GIFT, rentalSuccession: k, decedentRentalMonths: mo, ...own(d) });
          const ui = (validate(a) ?? "").includes("겹칩니다");
          const api = zodMessages(a).some((m) => m.includes("겹칩니다"));
          const expected = successionPeriodOverlap({ businessRegistrationDate: d, rentalRegistrationDate: d, rentalRegisteredDate: d }, DONOR, Number(mo)) !== null;
          if (ui !== api || ui !== expected) mismatches.push(`${k} 기산일=${d} 개월=${mo}: ⑧=${ui} ⑫=${api} 기대=${expected}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
