/**
 * PR6b — 장기임대주택 특례(소령 §155⑳·§154⑩) ⑧ 막다른 오류 3건 (S16-2 · S06-10 · S16-6)
 *
 * 세 건 모두 「⑧이 엔진이 판정할 수 있는 사례를 막거나(S16-2 · S16-6) ⑤가 필수로 띄운 칸을 안 막는(S06-10)」
 * 게이트 불일치다. 계산기(full)는 세액을 내려면 확정이 필요해 호별 요건 토글을 종전대로 막는다(짝).
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "../one-house-rulings/harness";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { allIssues, handoff, mkCase, runJudgment, withToday } from "./_helpers";
import cases from "../one-house-rulings/cases/E177.json";

// ───────────────────────── S16-2 — 거주주택 보유 2년 = 엔진과 같은 함수 ─────────────────────────
const e177 = (cases as RulingCase[]).find((c) => c.id === "E177-era")!;
function mkS162(transferDate: string, acq: string): RulingCase {
  const asset = { ...(e177.form!.asset as Record<string, unknown>) };
  const rhe = { ...(asset.rentalHousingException as Record<string, unknown>) };
  delete rhe.residenceTransitionUnderAddendum;
  delete rhe.residenceTransitionBasis;
  rhe.priorRentalExemptionHistory = "none";
  return {
    ...e177,
    today: transferDate,
    form: { ...e177.form!, transferDate, asset: { ...asset, acquisitionDate: acq, residencePeriodMonthsAsset: "24", fixedAcquisitionPrice: "300000000", addressJibun: "서울특별시 종로구 청운동 1", rentalHousingException: rhe } },
  };
}
const HOLD_ERR = /거주주택 보유기간 2년/;

describe("S16-2 ⑧ 거주주택 보유 2년 — 엔진 calculateHoldingPeriod(초일 산입)와 같은 날 경계", () => {
  it("응당일 전날(2021-05-10→2023-05-09): 엔진 2년 충족 → ⑧도 차단하지 않는다", async () => {
    expect(calculateHoldingPeriod(new Date("2021-05-10"), new Date("2023-05-09")).years).toBe(2);
    const c = mkS162("2023-05-09", "2021-05-10");
    await withToday(c.today, async () => {
      const form = buildCaseForm(c);
      expect((await runJudgment(form)).data?.judgment?.isExempt).toBe(true);
      expect(allIssues(handoff(form)).filter((m) => HOLD_ERR.test(m))).toEqual([]);
    });
  });
  it("[짝] 이틀 전(2023-05-08): 엔진 미충족 → ⑧ 차단 유지, 문구에 일수(730일) 대신 연·월·일", async () => {
    expect(calculateHoldingPeriod(new Date("2021-05-10"), new Date("2023-05-08")).years).toBe(1);
    const c = mkS162("2023-05-08", "2021-05-10");
    await withToday(c.today, async () => {
      const hits = allIssues(handoff(buildCaseForm(c))).filter((m) => HOLD_ERR.test(m));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("1년 11개월 29일");
      expect(hits[0]).not.toContain("730");
    });
  });
  it("윤일 구간: 2022-03-01→2024-02-28은 미충족(차단), 2024-02-29는 충족(무차단) — 엔진과 일치", async () => {
    for (const [td, blocked] of [["2024-02-28", true], ["2024-02-29", false]] as const) {
      expect(calculateHoldingPeriod(new Date("2022-03-01"), new Date(td)).years >= 2).toBe(!blocked);
      const c = mkS162(td, "2022-03-01");
      await withToday(c.today, async () => {
        const n = allIssues(handoff(buildCaseForm(c))).filter((m) => HOLD_ERR.test(m)).length;
        expect(n, td).toBe(blocked ? 1 : 0);
      });
    }
  });
});

// ───────────────────────── S06-10 — §154⑩ 경로 직전거주주택 양도일 ─────────────────────────
function mkS0610(date?: string): RulingCase {
  return mkCase("2026-10-06", {
    isOneHousehold: true, transferDate: "2026-03-01", contractTotalPrice: "800000000",
    asset: {
      assetKind: "housing", acquisitionDate: "2020-05-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "40",
      rentalHousingException: { applyException: true, scenario: "B", rentalUnits: [], ...(date ? { priorResidenceTransferDate: date } : {}), wasRegisteredRentalOrChildcare: true, postRegistrationResidenceMonths: "30" },
    },
  });
}

describe("S06-10 §154⑩ 경로(B · 임대 0호) — 직전거주주택 양도일 ⑤ required ↔ ⑧", () => {
  it("날짜 없음: 판정 메뉴 ⑧이 날짜 칸으로 막는다(조용한 비과세 회수 아님)", async () => {
    const c = mkS0610();
    await withToday(c.today, async () => {
      const r = await runJudgment(buildCaseForm(c));
      const err = r.ve.find((x) => x.startsWith("error") && x.includes("직전거주주택 양도일을 입력하세요"));
      expect(err, JSON.stringify(r.ve)).toBeDefined();
    });
  });
  it("[짝] 날짜 입력: ⑧ 무차단 + 비과세", async () => {
    const c = mkS0610("2023-01-10");
    await withToday(c.today, async () => {
      const r = await runJudgment(buildCaseForm(c));
      expect(r.ve.filter((x) => x.startsWith("error"))).toEqual([]);
      expect(r.data?.judgment?.isExempt).toBe(true);
    });
  });
  it("[짝] 임대주택 1호 이상인 B는 facts에서 이 날짜를 묻지 않는다(판정에 쓰이지 않음)", () => {
    const a = makeDefaultAsset(1);
    const asset: AssetForm = {
      ...a, assetKind: "housing", acquisitionDate: "2010-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
      rentalHousingException: {
        ...a.rentalHousingException, applyException: true, scenario: "B", postRegistrationResidenceMonths: "30",
        rentalUnits: [{
          ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01",
          rentalCategory: "long_general", rentalAcquisitionType: "purchase", standardPriceAtRentalStart: "250000000",
          rentalInputMode: "direct", rentalMonths: "80", requirementsConfirmed: true,
        }],
      },
    };
    expect(validateRentalHousingException(asset.rentalHousingException, asset, 0, "임대", "2026-03-15", "facts")).toBeNull();
    // 같은 입력이 full(계산기)에서는 날짜를 요구한다 — 기존 동작 유지
    expect(validateRentalHousingException(asset.rentalHousingException, asset, 0, "임대", "2026-03-15", "full")).toMatch(/직전거주주택 양도일/);
  });
});

// ───────────────────────── S16-6 — facts ⑧은 호별 요건 「충족」 토글을 막지 않는다 ─────────────────────────
type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];
const NA = { businessRegistrationDate: "2003-05-01", rentalRegistrationDate: "2003-05-01", rentalCategory: "existing_business", rentalAcquisitionType: "purchase", region: "seoul-metro", acquisitionOfficialPrice: "200000000", standardPriceAtRentalStart: "200000000", isNationalSizeHousing: true, hasMinimum2Units: true };
const LA = { businessRegistrationDate: "2009-05-01", rentalRegistrationDate: "2009-05-01", rentalCategory: "unsold_08_09", rentalAcquisitionType: "purchase", region: "non-metro", acquisitionOfficialPrice: "200000000", standardPriceAtRentalStart: "200000000", firstSaleContractDate: "2008-12-01", hasMinimum5UnitsInCity: true, rentalLandArea: "200", rentalTotalFloorArea: "100" };
const DA = { businessRegistrationDate: "2015-05-01", rentalRegistrationDate: "2015-05-01", rentalCategory: "long_general", rentalAcquisitionType: "construction", standardPriceAtRentalStart: "300000000", hasMinimum2Units: true, rentalLandArea: "200", rentalTotalFloorArea: "100" };

function asset(unit: Record<string, unknown>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a, assetKind: "housing", acquisitionDate: "2010-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException, applyException: true, scenario: "A",
      rentalUnits: [{ ...makeDefaultRentalUnit(), rentalInputMode: "direct", rentalMonths: "130", requirementsConfirmed: true, ...unit } as Unit],
    },
  };
}
const V = (unit: Record<string, unknown>, mode: "facts" | "full") => {
  const a = asset(unit);
  return validateRentalHousingException(a.rentalHousingException, a, 0, "임대", "2026-03-15", mode);
};

const OFF: [string, Record<string, unknown>][] = [
  ["나목 국민주택 OFF", { ...NA, isNationalSizeHousing: false }],
  ["나목 2호 OFF", { ...NA, hasMinimum2Units: false }],
  ["나목 ⑳2호 자기확인 OFF", { ...NA, requirementsConfirmed: false }],
  ["라목 5호 OFF", { ...LA, hasMinimum5UnitsInCity: false }],
  ["라목 ⑳2호 자기확인 OFF", { ...LA, requirementsConfirmed: false }],
  ["다목 ⑳2호 자기확인 OFF", { ...DA, requirementsConfirmed: false }],
];

describe("S16-6 호별 요건 토글 — facts 비차단 / full 차단(짝)", () => {
  it.each([["나목", NA], ["라목", LA], ["다목", DA]] as const)("[대조] %s 전 토글 ON: facts·full 모두 통과", (_n, u) => {
    expect(V(u, "facts")).toBeNull();
    expect(V(u, "full")).toBeNull();
  });
  it.each(OFF)("%s: facts null, full 차단", (_n, u) => {
    expect(V(u, "facts")).toBeNull();
    expect(V(u, "full")).not.toBeNull();
  });
});

describe("S16-6 엔진 — OFF는 불성립 + 목별 사유(「건설임대」 문구 아님), 자기확인 OFF는 「확인 필요」", () => {
  const menu = (u: Record<string, unknown>) => ({
    isOneHousehold: true, transferDate: "2026-03-15", contractTotalPrice: "800000000",
    asset: {
      assetKind: "housing", acquisitionDate: "2010-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [{ unitId: "b", rentalMonths: "130", requirementsConfirmed: true, isApartment: false, ...u }] },
    },
    houses: [],
  });
  const reasons = async (u: Record<string, unknown>) => {
    const c = mkCase("2026-10-06", menu(u));
    return withToday(c.today, async () => {
      const r = await runJudgment(buildCaseForm(c));
      return { r, msgs: (r.data.rentalHousingException.unitFailReasons as { message: string }[]).map((x) => x.message).join(" | ") };
    });
  };
  it("나목 2호 OFF: facts ⑧ 오류 0 · 불성립 · 「매입임대 … 2호」", async () => {
    const { r, msgs } = await reasons({ ...NA, hasMinimum2Units: false });
    expect(r.ve.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.data.rentalHousingException.passed).toBe(false);
    expect(r.data.judgment.isExempt).toBe(false);
    expect(msgs).toMatch(/나목은 국민주택규모 민간매입임대주택을 2호 이상/);
    expect(msgs).not.toMatch(/건설임대/);
  });
  it("라목 5호 OFF: 불성립 · 「같은 시·군 5호」", async () => {
    const { r, msgs } = await reasons({ ...LA, hasMinimum5UnitsInCity: false });
    expect(r.data.rentalHousingException.passed).toBe(false);
    expect(msgs).toMatch(/같은 시·군에서 5호 이상/);
    expect(msgs).not.toMatch(/건설임대/);
  });
  it("[짝] 다목 2호 OFF: 건설임대 문구 유지", async () => {
    const { msgs } = await reasons({ ...DA, hasMinimum2Units: false });
    expect(msgs).toMatch(/건설임대는 2호 이상/);
  });
  it("나목 자기확인 OFF: facts ⑧ 오류 0 · 불성립 + 「확인 필요」 사유(모름 = 혜택 불성립 + 확인 필요)", async () => {
    const { r, msgs } = await reasons({ ...NA, requirementsConfirmed: false });
    expect(r.ve.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.data.rentalHousingException.passed).toBe(false);
    expect(r.data.judgment.isExempt).toBe(false);
    expect(msgs).toMatch(/확인 필요/);
  });
  it("[대조] 전 토글 ON: 충족 · 비과세", async () => {
    const { r } = await reasons(NA);
    expect(r.data.rentalHousingException.passed).toBe(true);
    expect(r.data.judgment.isExempt).toBe(true);
  });
});
