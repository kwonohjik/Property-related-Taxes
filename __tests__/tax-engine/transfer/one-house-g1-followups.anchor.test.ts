/**
 * anchor — G1 후속 (엔진·헬퍼 표시 문자열 · 사이드바 게이트)
 *
 *  - 중과 배제(영 §167의10①15호) 합가 detail의 연수 — 양도일 연혁(`resolveMergeExemptionYears`).
 *    동거봉양 2018-02-12/13 · 혼인 2024-11-11/12 경계 twin.
 *  - G-3(주택보다 나중 취득 부수토지) STEP 문구가 9억 시대 양도에서 「12억 안분」이라 적지 않는다.
 *  - 판정 메뉴 사이드바 「선언한 특례」가 대체주택을 ⑤·④·⑧과 같은 게이트로만 적는다.
 */
import { describe, it, expect } from "vitest";
import { determineSurchargeExclusion } from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-exemption-validate";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeHouse, makeInput } from "../_helpers/multi-house-mock";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const D = (s: string) => new Date(s);

function mergeDetail(kind: "marriage" | "parental", transferDate: string): string {
  const input = makeInput([makeHouse("h1"), makeHouse("h2")], {
    transferDate: D(transferDate),
    ...(kind === "marriage"
      ? { marriageMerge: { marriageDate: D("2020-01-01") }, deemedOneHouseBy155: "marriage_merge" as const }
      : { parentalCareMerge: { mergeDate: D("2014-01-01") }, deemedOneHouseBy155: "parental_care_merge" as const }),
  });
  const r = determineSurchargeExclusion(input, 2, null, null, new Set(), false);
  return r.exclusionReasons.map((x) => x.detail).join(" / ");
}

describe("중과 배제 합가 detail — 양도일 연혁", () => {
  it("[G1E-1] 동거봉양 2018-02-12 양도 → 5년", () => {
    expect(mergeDetail("parental", "2018-02-12")).toContain("동거봉양 합가일(2014-01-01) 5년 내 먼저 양도");
  });
  it("[G1E-2] 동거봉양 2018-02-13 양도 → 10년", () => {
    expect(mergeDetail("parental", "2018-02-13")).toContain("동거봉양 합가일(2014-01-01) 10년 내 먼저 양도");
  });
  it("[G1E-3] 혼인 2024-11-11 양도 → 5년", () => {
    expect(mergeDetail("marriage", "2024-11-11")).toContain("혼인일(2020-01-01) 5년 내 먼저 양도");
  });
  it("[G1E-4] 혼인 2024-11-12 양도 → 10년", () => {
    expect(mergeDetail("marriage", "2024-11-12")).toContain("혼인일(2020-01-01) 10년 내 먼저 양도");
  });
});

describe("G-3 부수토지 비과세 제외 STEP — 기준금액 리터럴 없음", () => {
  /** 주택 2012 취득 · 토지 2020-06-01 나중 취득(보유 2년 미만) · 2021-11-30 양도 10억(9억 시대) */
  function g3(transferDate: string) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferDate: D(transferDate),
        acquisitionDate: D("2012-01-01"),
        landAcquisitionDate: D("2020-06-01"),
        isSeparateAcquisition: true,
        selfOwns: "both",
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        transferPrice: 1_000_000_000,
        landTransferPrice: 600_000_000,
        buildingTransferPrice: 400_000_000,
        landStandardPriceAtTransfer: 600_000_000,
        buildingStandardPriceAtTransfer: 400_000_000,
        acquisitionPrice: 500_000_000,
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 200_000_000,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 60,
        isRegulatedArea: false,
      }),
      makeMockRates(),
    );
  }
  it("[G1E-5] 9억 시대 양도 — 「12억 안분」이라 적지 않는다", () => {
    const step = g3("2021-11-30").steps.find((s) => s.label === "부수토지 비과세 제외");
    expect(step).toBeDefined();
    expect(step!.formula).toContain("보유요건 미충족");
    expect(step!.formula).not.toContain("12억");
  });
});

describe("판정 메뉴 사이드바 — 대체주택 선언은 게이트 안에서만", () => {
  function baseForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
    const f = createInitialOneHouseJudgmentForm();
    return {
      ...f,
      isOneHousehold: true,
      transferDate: "2024-06-01",
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2019-06-01" }],
      replacementHouseSpecial: true,
      ...over,
    };
  }
  const declared = (f: OneHouseJudgmentFormData) =>
    computeOneHouseJudgmentSummary(f).find((i) => i.label === "선언한 특례")?.value ?? "";

  it("[G1E-6] 1주택 · 조합원입주권 없음(섹션 숨김) → 대체주택을 적지 않는다", () => {
    expect(String(declared(baseForm()))).not.toContain("대체주택");
  });
  it("[G1E-7] 긍정 짝 — 2주택(섹션 노출) → 대체주택을 적는다", () => {
    const house = {
      id: "h1",
      region: "capital",
      acquisitionDate: "2018-01-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
    } as HouseEntry;
    expect(String(declared(baseForm({ houses: [house] })))).toContain("대체주택");
  });
});
