/**
 * 상속·증여 자산 취득가액 산정 엔진 테스트
 *
 * 근거: 소득세법 §97 + 시행령 §163 ⑨, 상증법 §60~§61
 * PDF: 2023 양도·상속·증여세 이론 및 계산실무 p387~391
 */

import { describe, it, expect } from "vitest";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import {
  INHERITANCE_DATE,
  INHERIT_LAND_PRICE_PER_M2,
  LAND_AREA_M2,
  INHERIT_HOUSE_PRICE,
  INHERIT_LAND_SUPPLEMENTARY,
} from "../fixtures/pdf-bundled-farmland";

describe("calculateInheritanceAcquisitionPrice — 소득령 §163⑨ · 상증법 §60~§61", () => {
  describe("보충적평가액 (우선순위 3)", () => {
    it("토지: 개별공시지가 × 면적 = 9,516,000원 (PDF 사례)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
      });

      expect(r.acquisitionPrice).toBe(INHERIT_LAND_SUPPLEMENTARY); // 793 × 12,000 = 9,516,000
      expect(r.method).toBe("supplementary");
      expect(r.legalBasis).toContain("§163");
      expect(r.legalBasis).toContain("§61");
    });

    it("개별주택: 개별주택가격 그대로 = 108,000,000원 (PDF 사례)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: INHERIT_HOUSE_PRICE,
      });

      expect(r.acquisitionPrice).toBe(INHERIT_HOUSE_PRICE);
      expect(r.method).toBe("supplementary");
    });

    it("공동주택: 공동주택가격 그대로", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_apart",
        publishedValueAtInheritance: 450_000_000,
      });

      expect(r.acquisitionPrice).toBe(450_000_000);
      expect(r.method).toBe("supplementary");
    });
  });

  describe("우선순위 결정", () => {
    it("시가 지정 시 시가 우선 (보충적평가액 무시)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
        marketValue: 50_000_000, // 시가
      });

      expect(r.acquisitionPrice).toBe(50_000_000);
      expect(r.method).toBe("market_value");
      expect(r.legalBasis).toContain("§60 ①");
    });

    it("감정가 평균 지정 + 시가 없음 → 감정가 적용", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: 100_000_000,
        appraisalAverage: 120_000_000,
      });

      expect(r.acquisitionPrice).toBe(120_000_000);
      expect(r.method).toBe("appraisal");
      expect(r.legalBasis).toContain("§60 ⑤");
    });

    it("시가 + 감정가 모두 지정 → 시가 우선", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_apart",
        publishedValueAtInheritance: 300_000_000,
        marketValue: 500_000_000,
        appraisalAverage: 400_000_000,
      });

      expect(r.acquisitionPrice).toBe(500_000_000);
      expect(r.method).toBe("market_value");
    });

    it("시가·감정가 0 이하면 보충적평가액으로 fallback", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: 100,
        publishedValueAtInheritance: 50_000,
        marketValue: 0,
        appraisalAverage: 0,
      });

      expect(r.acquisitionPrice).toBe(5_000_000);
      expect(r.method).toBe("supplementary");
    });
  });

  describe("입력 검증", () => {
    it("토지에 landAreaM2 미지정 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "land",
          publishedValueAtInheritance: 12_000,
        }),
      ).toThrow(/landAreaM2/);
    });

    it("토지 면적 0 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "land",
          landAreaM2: 0,
          publishedValueAtInheritance: 12_000,
        }),
      ).toThrow(/landAreaM2/);
    });

    it("음수 공시가격 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "house_individual",
          publishedValueAtInheritance: -1,
        }),
      ).toThrow(/publishedValueAtInheritance/);
    });
  });

  describe("formula 설명 문자열", () => {
    it("토지 보충적평가액 formula", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
      });
      expect(r.formula).toContain("12,000");
      expect(r.formula).toContain("793");
      expect(r.formula).toContain("9,516,000");
    });

    it("주택 보충적평가액 formula", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: INHERIT_HOUSE_PRICE,
      });
      expect(r.formula).toContain("개별주택가격");
      expect(r.formula).toContain("108,000,000");
    });
  });
});
