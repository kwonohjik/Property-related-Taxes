/**
 * §118 recompute end-to-end 통합 anchor — A-3 P6
 *
 * UI 폼(buildPropertyTaxRequestBody) → API body → 엔진(calculatePropertyTax) 전 경로 정합.
 * - 건축물 recompute: body 변환 + determinedTax 일치(P4 C-2와 동일 375,000)
 * - 별도합산 recompute: 비대상 → direct fallback(taxCapMode 미전송)
 * - 주택 recompute: 세부담상한 미전송(§122 단서)
 */

import { describe, it, expect } from "vitest";
import {
  buildPropertyTaxRequestBody,
  INITIAL_FORM,
  type FormState,
} from "../../../components/calc/property/shared";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type EngineInput = Parameters<typeof calculatePropertyTax>[0];

describe("P6: §118 recompute end-to-end (UI 변환 → 엔진)", () => {
  it("건축물 recompute — body 변환 + 엔진 determinedTax 375,000 (P4 C-2 정합)", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "building",
      publishedPrice: "1000000000",
      taxCapMode: "recompute",
      previousYearTaxBase: "100000000",
    };
    const body = buildPropertyTaxRequestBody(form);
    expect(body.taxCapMode).toBe("recompute");
    expect(body.previousYearTaxBase).toBe(100_000_000);

    const r = calculatePropertyTax(body as unknown as EngineInput);
    expect(r.calculatedTax).toBe(1_750_000);
    expect(r.determinedTax).toBe(375_000);
  });

  it("별도합산 recompute form — 비대상 → direct fallback (taxCapMode 미전송)", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "land",
      landTaxType: "separate_aggregate",
      taxCapMode: "recompute",
      previousYearTaxBase: "100000000",
      previousYearTax: "500000",
    };
    const body = buildPropertyTaxRequestBody(form);
    expect(body.taxCapMode).toBeUndefined();
    expect(body.previousYearTaxBase).toBeUndefined();
    expect(body.previousYearTax).toBe(500_000);
  });

  it("주택 recompute form — 세부담상한 미전송 (§122 단서)", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "housing",
      taxCapMode: "recompute",
      previousYearTaxBase: "100000000",
    };
    const body = buildPropertyTaxRequestBody(form);
    expect(body.taxCapMode).toBeUndefined();
    expect(body.previousYearTaxBase).toBeUndefined();
    expect(body.previousYearTax).toBeUndefined();
  });

  it("건축물 direct form — recompute 미선택 시 previousYearTax 전송", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "building",
      publishedPrice: "1000000000",
      previousYearTax: "300000",
    };
    const body = buildPropertyTaxRequestBody(form);
    expect(body.taxCapMode).toBeUndefined();
    expect(body.previousYearTax).toBe(300_000);
    const r = calculatePropertyTax(body as unknown as EngineInput);
    expect(r.determinedTax).toBe(450_000); // 300,000 × 150%
  });
});
