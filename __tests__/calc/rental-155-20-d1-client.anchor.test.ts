/**
 * §155⑳ D1 — 클라이언트 층(⑧ validate · ④ API 변환 · Step4 거주요건 빌더)이 엔진과 같은 축을 보는지.
 *
 * | # | OH | 주장 |
 * |---|---|---|
 * | V-42 | OH-42 | 상생임대(§155의3①) 사실이 있으면 ⑧이 거주 24개월 미만을 막지 않는다(엔진·판정 메뉴와 같은 결론) |
 * | V-15 | OH-15 | B는 등록 이후 거주기간이 필수이고, 24개월 판정도 그 값으로 한다 |
 * | V-39 | OH-39 | 말소 토글 ON(가·다·라·마목)이면 등록 유형 필수 |
 * | V-41 | OH-41 | 나·라목도 ⑳2호 자기확인 필수 |
 * | V-40 | OH-40 | 판정 메뉴(facts)는 구간 내 A의 이력 선택을 요구, 계산기(full)는 막지 않는다 |
 * | A-*  | ④ | 신규 필드 전송 규약 |
 * | R-58 | OH-58 | Step4 빌더가 상생임대 사실을 실어 거주요건 경고가 엔진과 일치 |
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api-residence";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

function unit(over: Partial<Unit> = {}): Unit {
  return {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2016-06-01",
    rentalRegistrationDate: "2016-06-01",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    standardPriceAtRentalStart: "300,000,000",
    requirementsConfirmed: true,
    rentalMonths: "96",
    ...over,
  };
}

function asset(rhe: Partial<AssetForm["rentalHousingException"]> = {}, over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2016-01-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    ...over,
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [unit()],
      ...rhe,
    },
  };
}

const V = (a: AssetForm, transfer = "2026-06-01", mode: "full" | "facts" = "full", winWin = false) =>
  validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", transfer, mode, winWin);

const WIN_WIN_FACTS = {
  ...oneHouseJudgmentExtraDefaults,
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "5",
  winWinRentalPriorLeaseMonths: "24",
  winWinRentalLeaseMonths: "24",
};

describe("V-42 OH-42 — 상생임대 거주요건 면제", () => {
  it("V-42a 거주 0개월 · 상생임대 아님 → 차단(짝)", () => {
    expect(V(asset({}, { residencePeriodMonthsAsset: "0" }))).toContain("거주기간 2년");
  });
  it("V-42b 거주 0개월 · 상생임대 → 통과", () => {
    expect(V(asset({}, { residencePeriodMonthsAsset: "0" }), "2026-06-01", "full", true)).toBeNull();
  });
  it("V-42c 계산기 ⑧ 진입점(validateAssetEntry)이 운반 상자의 상생임대 사실을 넘긴다", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-06-01";
    const a = asset({}, {
      residencePeriodMonthsAsset: "0",
      addressJibun: "서울 강남구 테스트동 1-1",
      acquisitionCause: "purchase",
      actualSalePrice: "800,000,000",
      fixedAcquisitionPrice: "400,000,000",
    });
    f.assets = [a];
    const withFacts = { ...f, importedOneHouseFacts: WIN_WIN_FACTS };
    const blocked = validateAssetEntry(a, 0, f);
    const passed = validateAssetEntry(a, 0, withFacts);
    expect(blocked ?? "").toContain("거주기간 2년");
    expect(passed ?? "").not.toContain("장기임대주택 특례");
  });
});

describe("V-15 OH-15 — B 등록 이후 거주기간", () => {
  const b = (m: string, over: Partial<AssetForm> = {}) =>
    asset(
      {
        scenario: "B",
        priorResidenceTransferDate: "2020-01-01",
        standardPriceAtAcquisitionForPhrp: "300,000,000",
        standardPriceAtPriorTransfer: "450,000,000",
        standardPriceAtTransferForPhrp: "500,000,000",
        postRegistrationResidenceMonths: m,
      },
      over,
    );
  it("V-15a 미입력 → 두 모드 모두 차단", () => {
    expect(V(b(""))).toContain("등록 이후 거주기간");
    expect(V(b(""), "2026-06-01", "facts")).toContain("등록 이후 거주기간");
  });
  it("V-15b 전체 60개월이어도 등록 이후 23개월 → 차단 / 24개월 → 통과", () => {
    expect(V(b("23"))).toContain("등록 이후 거주기간이 2년");
    expect(V(b("24"))).toBeNull();
  });
  it("V-15c 등록 이후가 전체보다 길면 차단", () => {
    expect(V(b("70"))).toContain("전체 거주기간(60개월)보다 깁니다");
  });
  it("V-15d A는 등록 이후 거주기간을 요구하지 않는다(짝)", () => {
    expect(V(asset())).toBeNull();
  });
});

describe("V-39 · V-41 — 호별 판정 사실", () => {
  it("V-39a 말소 토글 ON + 등록 유형 미선택 → 차단 / 선택 → 통과", () => {
    const off = asset({ rentalUnits: [unit({ rentalAutoTermination: true })] });
    expect(V(off)).toContain("등록 유형");
    const on = asset({ rentalUnits: [unit({ rentalAutoTermination: true, terminatedRegistrationType: "short_term" })] });
    expect(V(on)).toBeNull();
  });
  it("V-41a 나목 자기확인 없음 → 차단 / 있음 → 통과", () => {
    const na = (confirmed: boolean) =>
      asset({
        rentalUnits: [
          unit({
            businessRegistrationDate: "2003-01-01",
            rentalRegistrationDate: "2003-01-01",
            rentalCategory: "existing_business",
            acquisitionOfficialPrice: "200,000,000",
            isNationalSizeHousing: true,
            hasMinimum2Units: true,
            requirementsConfirmed: confirmed,
          }),
        ],
      });
    expect(V(na(false))).toContain("기타 요건 자기확인");
    expect(V(na(true))).toBeNull();
  });
});

describe("V-40 OH-40 — 구간 내 A 이력(판정 메뉴에서만 요구)", () => {
  const inEra = (h: "" | "none" | "used", transition = false) =>
    asset({ priorRentalExemptionHistory: h, residenceTransitionUnderAddendum: transition }, { acquisitionDate: "2019-06-01" });
  it("V-40a facts 모드 · 2019-06-01 취득 · 2024-06-01 양도 · 미선택 → 차단", () => {
    expect(V(inEra(""), "2024-06-01", "facts")).toContain("이력");
  });
  it("V-40b 선택하면 통과 · 경과조치면 묻지 않는다", () => {
    expect(V(inEra("none"), "2024-06-01", "facts")).toBeNull();
    expect(V(inEra("", true), "2024-06-01", "facts")).toBeNull();
  });
  it("V-40c 구간 밖(2025-02-28 양도) → 묻지 않는다(경계 짝)", () => {
    expect(V(inEra(""), "2025-02-28", "facts")).toBeNull();
    expect(V(inEra(""), "2025-02-27", "facts")).toContain("이력");
  });
  it("V-40d 계산기(full)는 막지 않는다 — 판정 사실 칸이 없다(엔진이 판정 보류 고지)", () => {
    expect(V(inEra(""), "2024-06-01", "full")).toBeNull();
  });
});

describe("A-* ④ API 변환 — 신규 필드 전송 규약", () => {
  it("A-1 말소 OFF면 등록 유형을 보내지 않는다 / ON이면 보낸다", () => {
    const p = (u: Partial<Unit>) =>
      (toRentalHousingExceptionApi(asset({ rentalUnits: [unit(u)] })) as { rentalUnits: Record<string, unknown>[] })
        .rentalUnits[0].terminatedRegistrationType;
    expect(p({ rentalAutoTermination: false, terminatedRegistrationType: "short_term" })).toBeUndefined();
    expect(p({ rentalAutoTermination: true, terminatedRegistrationType: "short_term" })).toBe("short_term");
  });
  it("A-2 B만 등록 이후 거주기간을 숫자로 보낸다 · 빈값은 undefined(0과 구별)", () => {
    const p = (rhe: Partial<AssetForm["rentalHousingException"]>) =>
      (toRentalHousingExceptionApi(asset(rhe)) as Record<string, unknown>).postRegistrationResidenceMonths;
    expect(p({ scenario: "B", postRegistrationResidenceMonths: "30" })).toBe(30);
    expect(p({ scenario: "B", postRegistrationResidenceMonths: "0" })).toBe(0);
    expect(p({ scenario: "B", postRegistrationResidenceMonths: "" })).toBeUndefined();
    expect(p({ scenario: "A", postRegistrationResidenceMonths: "30" })).toBeUndefined();
  });
  it("A-3 이력은 A에서 선택값만 · 경과조치는 true일 때만", () => {
    const p = (rhe: Partial<AssetForm["rentalHousingException"]>) =>
      toRentalHousingExceptionApi(asset(rhe)) as Record<string, unknown>;
    expect(p({ priorRentalExemptionHistory: "used" }).priorRentalExemptionHistory).toBe("used");
    expect(p({ priorRentalExemptionHistory: "" }).priorRentalExemptionHistory).toBeUndefined();
    expect(p({ residenceTransitionUnderAddendum: true }).residenceTransitionUnderAddendum).toBe(true);
    expect(p({ residenceTransitionUnderAddendum: false }).residenceTransitionUnderAddendum).toBeUndefined();
  });
});

describe("R-58 OH-58 — Step4 거주요건 빌더가 상생임대 사실을 싣는다", () => {
  function step4Form(withFacts: boolean) {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-06-01";
    f.wasRegulatedAtAcquisition = true;
    f.householdHousingCount = "1";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionDate: "2018-01-10",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "6",
    });
    return withFacts ? { ...f, importedOneHouseFacts: WIN_WIN_FACTS } : f;
  }
  it("R-58a 상생임대 사실 없음 → 거주요건 불충족(짝)", () => {
    expect(meetsOneHouseResidenceRequirement(buildResidenceReqInput(step4Form(false)), ONE_HOUSE_RESIDENCE)).toBe(false);
  });
  it("R-58b 상생임대 사실 있음 → 면제(엔진과 같은 결론)", () => {
    const input = buildResidenceReqInput(step4Form(true));
    expect(input.winWinRentalHouse?.winWinContractDate).toBeInstanceOf(Date);
    expect(meetsOneHouseResidenceRequirement(input, ONE_HOUSE_RESIDENCE)).toBe(true);
  });
});
