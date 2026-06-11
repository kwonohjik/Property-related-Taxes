/**
 * 재산세 폼 변환 레이어 (components/calc/property/shared.ts) — R1 회귀
 *
 * - 면적 소수점: DecimalInput + parseDecimal (CurrencyInput 소수부 절단 버그 회귀 방어)
 * - 주택 previousYearTax 미전송 (§122 단서 — 엔진·UI 3중 동기화)
 * - 분리과세 옵션: 대중·간이 골프장 / 기타 제거 (엔진 비해당 → 무조건 422였던 옵션)
 */

import { describe, it, expect } from "vitest";
import {
  buildPropertyTaxRequestBody,
  validateStep,
  INITIAL_FORM,
  SEPARATED_TYPE_OPTIONS,
  type FormState,
} from "../../../components/calc/property/shared";

function makeForm(overrides: Partial<FormState>): FormState {
  return { ...INITIAL_FORM, ...overrides };
}

describe("별도합산 면적 소수점 (R1 회귀)", () => {
  it("토지 면적 '333.06' → landArea 333.06 (소수부 보존) + 공시지가 역산", () => {
    const body = buildPropertyTaxRequestBody(
      makeForm({
        objectType: "land",
        publishedPrice: "1,000,000,000",
        landTaxType: "separate_aggregate",
        saZoningDistrict: "commercial",
        saLandArea: "333.06",
        saBuildingFloorArea: "100.5",
      }),
    );
    const item = body.separateAggregateItem as Record<string, unknown>;
    expect(item.landArea).toBe(333.06);
    // floor(1,000,000,000 / 333.06) = 3,002,462
    expect(item.officialLandPrice).toBe(3_002_462);
    expect(item.buildingFloorArea).toBe(100.5);
  });

  it("validateStep — 소수점 면적 입력 통과", () => {
    const form = makeForm({
      objectType: "land",
      landTaxType: "separate_aggregate",
      saZoningDistrict: "commercial",
      saLandArea: "333.06",
      saBuildingFloorArea: "100.5",
    });
    expect(validateStep(2, form)).toBeNull();
  });

  it("validateStep — 면적 미입력은 차단 유지", () => {
    const form = makeForm({
      objectType: "land",
      landTaxType: "separate_aggregate",
      saZoningDistrict: "commercial",
      saLandArea: "",
    });
    expect(validateStep(2, form)).toContain("토지 면적");
  });
});

describe("주택 previousYearTax 미전송 (§122 단서, R1 회귀)", () => {
  it("주택: 전년도 세액 입력해도 body에서 제외", () => {
    const body = buildPropertyTaxRequestBody(
      makeForm({
        objectType: "housing",
        publishedPrice: "200,000,000",
        previousYearTax: "300,000",
      }),
    );
    expect(body.previousYearTax).toBeUndefined();
  });

  it("건축물: 전년도 세액 전송 유지 (150% 상한 계산용)", () => {
    const body = buildPropertyTaxRequestBody(
      makeForm({
        objectType: "building",
        publishedPrice: "200,000,000",
        previousYearTax: "300,000",
      }),
    );
    expect(body.previousYearTax).toBe(300_000);
  });
});

describe("분리과세 옵션 정리 (R1 회귀)", () => {
  it("엔진 비해당 옵션(대중·간이 골프장, 기타) 미노출 — 선택 시 무조건 422였던 경로", () => {
    const values = SEPARATED_TYPE_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("golf_public");
    expect(values).not.toContain("other");
    expect(values).toContain("golf_member");
  });

  it("회원제 골프장 매핑 — golfCourseType 'member' 전송", () => {
    const body = buildPropertyTaxRequestBody(
      makeForm({
        objectType: "land",
        publishedPrice: "1,000,000,000",
        landTaxType: "separated",
        stSeparatedType: "golf_member",
      }),
    );
    const st = body.separateTaxationItem as Record<string, unknown>;
    expect(st.isGolfCourse).toBe(true);
    expect(st.golfCourseType).toBe("member");
  });
});
