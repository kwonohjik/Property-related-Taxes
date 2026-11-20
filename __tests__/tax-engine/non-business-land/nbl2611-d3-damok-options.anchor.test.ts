/**
 * NBL2611-V7-S (R18 · D3 · Q-5 (나) · Q-6 (다)) Pre-Do anchor — 다목 선택지 완비 + 14호 정리.
 *
 *   14호(etc_14호)   영 §168의11①14호는 「재정경제부령으로 정하는 토지」인데 규칙 §83조의4에 14호를 정한 항이 없다 →
 *                    선택만으로 전량 사업용(−57,150,000)이던 것을 «사업용 불인정 + 확인 필요»로 (Q-5 (나))
 *   누락 호          1호다·라 · 3호 · 8호 · 9호 · 11호가·나 — 선택지가 없어 비사업용으로 과대 판정(1호다 +27,574,000 등)
 *   3호              「조성이 완료된 날부터 2년이 경과한 토지를 제외한다」 — 상속 3년과 같은 «기간» 구간 [완료일, 완료일+2년)
 *   도소매업         규칙 §83조의4⑭ — 열거 품목만, 농·수·축산물은 「유통산업발전법」 시장·유사 장소에 한함 (Q-6 (다))
 *
 * 판정·비율로 단언한다(모의 세율 금액은 비교 대상이 아니다).
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
type OL = NonNullable<NonBusinessLandInput["otherLand"]>;

function sample(ol: Record<string, unknown>, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "management",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "comprehensive",
      hasBuilding: false,
      isRelatedToResidenceOrBusiness: false,
      ...ol,
    } as OL,
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("Q-5 (나) — 14호는 선택해도 사업용으로 인정하지 않는다 + 확인 필요", () => {
  it("14-1: 🔴 etc_14호 선택 — 전량 비사업용 (종전: 선택만으로 전량 사업용)", () => {
    const j = judgeNonBusinessLand(sample({ relatedBusinessType: "etc_14호" }), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
  });

  it("14-2: 불인정 사유와 «확인 필요» 고지가 남는다 — 위임 규칙 항 없음", () => {
    const r = judgeOtherLand(sample({ relatedBusinessType: "etc_14호" }), R);
    const step = r.steps.find((s) => s.id === "other_ho_etc14_unrecognized");
    expect(step?.status).toBe("FAIL");
    expect(step?.detail).toContain("14호");
    expect((r.warnings ?? []).some((w) => w.includes("확인 필요") && w.includes("14호"))).toBe(true);
  });

  it("14-3: 다른 나목(별도합산 선언 + 배율 이내)이 있으면 14호 불인정과 무관하게 사업용 — 나목은 병렬 제외 사유", () => {
    const j = judgeNonBusinessLand(
      sample({
        relatedBusinessType: "etc_14호",
        propertyTaxType: "separate",
        hasBuilding: true,
        buildingFloorArea: 200, // 관리지역 7배 = 1,400㎡ ≥ 1,000㎡
        buildingStandardValue: 100_000_000,
        landStandardValue: 1_000_000_000,
      }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
  });
});

describe("누락 호 6종 — 선택지가 있고, 면적기준 없이 전량 사업용, 자기 선언 요건은 확인 필요로 남긴다", () => {
  const cases: Array<{ ho: string; basis: string; word: string }> = [
    { ho: "sports_facility_business", basis: "1호 다목", word: "체육시설업" },
    { ho: "stadium_operation", basis: "1호 라목", word: "경기장운영업" },
    { ho: "aggregate_extraction", basis: "8호", word: "골재채취" },
    { ho: "waste_treatment", basis: "9호", word: "폐기물처리업" },
    { ho: "fish_farm_licensed", basis: "11호 가목·나목", word: "양어장" },
  ];

  it.each(cases)("H-1: $ho — 전량 사업용 · 근거 $basis", ({ ho, basis }) => {
    const j = judgeNonBusinessLand(sample({ relatedBusinessType: ho }), R);
    expect(j.isNonBusinessLand).toBe(false);
    const r = judgeOtherLand(sample({ relatedBusinessType: ho }), R);
    const step = r.steps.find((s) => s.id === "other_residence_business");
    expect(step?.legalBasis).toContain(basis);
  });

  it.each(cases)("H-2: $ho — 자기 선언 요건이 «확인 필요»로 결과에 남는다", ({ ho, word }) => {
    const r = judgeOtherLand(sample({ relatedBusinessType: ho }), R);
    expect((r.warnings ?? []).some((w) => w.includes("확인 필요") && w.includes(word))).toBe(true);
  });
});

describe("3호 — 조성 완료일부터 2년 구간만 사업용 기간", () => {
  const three = { relatedBusinessType: "private_investment_land" };

  it("3-1: 완료 2023-06-01 · 취득 2023-06-01 · 양도 2024-01-01 — 2년 안 → 사업용", () => {
    const j = judgeNonBusinessLand(
      sample({ ...three, privateInvestmentCompletionDate: d("2023-06-01") }, { acquisitionDate: d("2023-06-01") }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("3-2: 🔴 완료 2014-01-01 · 취득 2014-01-01 · 양도 2024-01-01 — 사업용 기간은 처음 2년뿐 → 비사업용", () => {
    const j = judgeNonBusinessLand(
      sample({ ...three, privateInvestmentCompletionDate: d("2014-01-01") }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true);
  });

  it("3-3: 완료일 미입력 — 엔진이 차단(⑧·⑫가 먼저 막는 경로의 안전망)", () => {
    expect(() => judgeNonBusinessLand(sample(three), R)).toThrow(TaxCalculationError);
  });
});

describe("12호 도소매업 — 규칙 §83조의4⑭ 열거 품목만", () => {
  const rt = (over: Record<string, unknown>) => ({
    businessType: "wholesale_retail",
    currentRevenue: 100_000_000,
    currentLandValue: 500_000_000, // 20% ≥ 10%
    ...over,
  });
  const withRt = (over: Record<string, unknown>) =>
    sample({ relatedBusinessType: "none" }, { revenueTest: rt(over) } as Partial<NonBusinessLandInput>);

  it("W-1: 열거 품목(철근) — 수입금액비율 충족 시 사업용", () => {
    const j = judgeNonBusinessLand(withRt({ wholesaleItem: "rebar" }), R);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("W-2: 🔴 농산물 + 시장·유사 장소가 아님 — 규칙 ⑭ 괄호 단서 불충족 → 비사업용", () => {
    const j = judgeNonBusinessLand(withRt({ wholesaleItem: "agricultural_product", wholesaleInMarket: false }), R);
    expect(j.isNonBusinessLand).toBe(true);
  });

  it("W-3: 농산물 + 시장 운영 — 사업용", () => {
    const j = judgeNonBusinessLand(withRt({ wholesaleItem: "agricultural_product", wholesaleInMarket: true }), R);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("W-4: 품목 미입력 — 엔진이 차단(자동 fallback 금지)", () => {
    expect(() => judgeNonBusinessLand(withRt({}), R)).toThrow(TaxCalculationError);
  });
});
