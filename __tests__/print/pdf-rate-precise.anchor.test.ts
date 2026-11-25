/**
 * PDF 세율·면적 표기 — 재산세 세율(0.07%·0.15%·0.25%)이 공용 `fmtRate`(소수 첫째 자리)로 «0.1%»·«0.2%»·«0.3%»가 되던 표기 결함 고정(PSE 리뷰).
 */
import { it, expect } from "vitest";
import { fmtRatePrecise } from "@/lib/pdf/ResultPdfPrimitives";
import { fmtArea } from "@/lib/pdf/ResultPdfPrimitives";

it("fmtRatePrecise — 재산세 단일세율을 유효 자리까지", () => {
  expect(fmtRatePrecise(0.0007)).toBe("0.07%");
  expect(fmtRatePrecise(0.0015)).toBe("0.15%");
  expect(fmtRatePrecise(0.0025)).toBe("0.25%");
  expect(fmtRatePrecise(0.002)).toBe("0.2%");
  expect(fmtRatePrecise(0.04)).toBe("4%");
  expect(fmtRatePrecise(undefined)).toBe("-");
});

it("fmtArea — 소수 둘째 자리까지 ㎡", () => {
  expect(fmtArea(12000)).toBe("12,000㎡");
  expect(fmtArea(3000.004)).toBe("3,000㎡");
  expect(fmtArea(625.5)).toBe("625.5㎡");
  expect(fmtArea(null)).toBe("-");
});
