/**
 * Phase A — 시기별 매트릭스 행 추가 anchor (PHA-01~08)
 *
 * 교재 §3장 이미지 48 ⑤ (2016.4.1.~2016.12.31. 양도분) 정합화:
 *  F-01: KOSPI 1% / 25억
 *  F-02: KOSDAQ 2% / 20억
 *  F-03: UNLISTED 2% / 50억
 *  (코넥스는 단일 임계 통합으로 변경 없음)
 *
 * 법령 검증 정책: KoreanLaw MCP 검증 생략 (사용자 지시 2026-05-19) — 교재 기준 채택.
 * 2016.1.1.~3.31. 구간은 교재 미명시 → 추정 금지, 현행 행 유지.
 *
 * Plan v4 §4 + Engine Design v2 STEP 1 anchor 매트릭스 기준.
 */

import { describe, it, expect } from "vitest";
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

describe("Phase A — 2016.4.1. 시기 경계 매트릭스 행 신설", () => {
  describe("PHA-01: KOSPI 2016-03-31 현행 행 유지 (2013~ 행 매칭)", () => {
    it("priorYearEndDate=2016-03-31, kospi → 2% / 50억", () => {
      const t = getMajorShareholderThreshold("kospi", new Date("2016-03-31"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
    });
  });

  describe("PHA-02: KOSPI 2016-04-01 F-01 신설 행 매칭", () => {
    it("priorYearEndDate=2016-04-01, kospi → 1% / 25억 (교재 ⑤)", () => {
      const t = getMajorShareholderThreshold("kospi", new Date("2016-04-01"));
      expect(t.shareRatioThreshold).toBe(0.01);
      expect(t.marketCapThreshold).toBe(2_500_000_000);
      expect(t.ruleSource).toBe("§157");
      expect(t.isVentureRule).toBe(false);
    });
  });

  describe("PHA-03: KOSDAQ 2016-03-31 현행 행 유지 (2013.8.29~ 행 매칭)", () => {
    it("priorYearEndDate=2016-03-31, kosdaq → 2% / 40억", () => {
      const t = getMajorShareholderThreshold("kosdaq", new Date("2016-03-31"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(4_000_000_000);
    });
  });

  describe("PHA-04: KOSDAQ 2016-04-01 F-02 신설 행 매칭", () => {
    it("priorYearEndDate=2016-04-01, kosdaq → 2% / 20억 (교재 ⑤)", () => {
      const t = getMajorShareholderThreshold("kosdaq", new Date("2016-04-01"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(2_000_000_000);
      expect(t.ruleSource).toBe("§157");
    });
  });

  describe("PHA-05: UNLISTED 2016-03-31 현행 행 유지 (★ v3 추정 금지)", () => {
    it("priorYearEndDate=2016-03-31, unlisted → 4% / 50억 (교재 미명시 — 현행 유지)", () => {
      const t = getMajorShareholderThreshold("unlisted", new Date("2016-03-31"));
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
    });
  });

  describe("PHA-06: UNLISTED 2016-04-01 F-03 신설 행 매칭", () => {
    it("priorYearEndDate=2016-04-01, unlisted → 2% / 50억 (교재 ⑤)", () => {
      const t = getMajorShareholderThreshold("unlisted", new Date("2016-04-01"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
      expect(t.ruleSource).toBe("§167의8①2호");
      expect(t.isVentureRule).toBe(false);
    });
  });

  describe("PHA-07: 2024-01-01 4종 시장 회귀 (현행 임계)", () => {
    it("kospi → 1% / 50억", () => {
      const t = getMajorShareholderThreshold("kospi", new Date("2024-01-01"));
      expect(t.shareRatioThreshold).toBe(0.01);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
    });
    it("kosdaq → 2% / 50억", () => {
      const t = getMajorShareholderThreshold("kosdaq", new Date("2024-01-01"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
    });
    it("konex → 4% / 50억", () => {
      const t = getMajorShareholderThreshold("konex", new Date("2024-01-01"));
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(5_000_000_000);
    });
    it("unlisted → 4% / 10억", () => {
      const t = getMajorShareholderThreshold("unlisted", new Date("2024-01-01"));
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
    });
  });

  describe("PHA-08: 2020-04-01 4종 시장 회귀", () => {
    it("kospi → 1% / 10억", () => {
      const t = getMajorShareholderThreshold("kospi", new Date("2020-04-01"));
      expect(t.shareRatioThreshold).toBe(0.01);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
    });
    it("kosdaq → 2% / 10억", () => {
      const t = getMajorShareholderThreshold("kosdaq", new Date("2020-04-01"));
      expect(t.shareRatioThreshold).toBe(0.02);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
    });
    it("konex → 4% / 10억", () => {
      const t = getMajorShareholderThreshold("konex", new Date("2020-04-01"));
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
    });
    it("unlisted → 4% / 10억", () => {
      const t = getMajorShareholderThreshold("unlisted", new Date("2020-04-01"));
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
    });
  });
});
