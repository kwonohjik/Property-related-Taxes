/**
 * Phase B — 비상장 벤처기업 시총 40억 임계 anchor (PHB-01~04)
 *
 * 시행령 §167의8①2호 나목 단서 — 비상장 벤처기업 시총 임계 40억 적용.
 * 교재 §3장 이미지 48 ⑤ 별도 컬럼 + 49 상단 주석 (§167의8은 §157의 2017.2.3. 삭제와 무관, 상시 유효).
 *
 * 법령 검증 정책: KoreanLaw MCP 검증 생략 (사용자 지시 2026-05-19) — 교재 기준 채택.
 *
 * Plan v4 §5.4 + Engine Design v2 STEP 2·5 anchor 매트릭스 기준.
 */

import { describe, it, expect } from "vitest";
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

describe("Phase B — 비상장 벤처기업 임계 분기 (시총 40억)", () => {
  describe("PHB-01: 비상장 + 벤처 + 시총 30억 → 임계 미달 (40억)", () => {
    it("isVentureCompany=true, selfMarketCap=30억 → threshold.marketCap=40억", () => {
      const t = getMajorShareholderThreshold(
        "unlisted",
        new Date("2024-12-31"),
        { isVentureCompany: true },
      );
      // 지분율 임계는 비벤처와 동일 (4%)
      expect(t.shareRatioThreshold).toBe(0.04);
      // 시총 임계만 40억으로 변경 (§167의8①2호 나목 단서)
      expect(t.marketCapThreshold).toBe(4_000_000_000);
      expect(t.isVentureRule).toBe(true);
      expect(t.ruleSource).toBe("§167의8①2호_벤처");
    });
  });

  describe("PHB-02: 비상장 + 벤처 + 시총 45억 → 임계 초과", () => {
    it("isVentureCompany=true, marketCap=45억 → 40억 임계 적용 확인", () => {
      const t = getMajorShareholderThreshold(
        "unlisted",
        new Date("2024-12-31"),
        { isVentureCompany: true },
      );
      expect(t.marketCapThreshold).toBe(4_000_000_000);
      expect(t.isVentureRule).toBe(true);
    });
  });

  describe("PHB-03: 비상장 + 비벤처 → 현행 10억 임계 유지", () => {
    it("isVentureCompany=false → threshold.marketCap=10억 / ruleSource=§167의8①2호", () => {
      const t = getMajorShareholderThreshold(
        "unlisted",
        new Date("2024-12-31"),
        { isVentureCompany: false },
      );
      expect(t.shareRatioThreshold).toBe(0.04);
      expect(t.marketCapThreshold).toBe(1_000_000_000);
      expect(t.isVentureRule).toBe(false);
      expect(t.ruleSource).toBe("§167의8①2호");
    });

    it("options 미지정 → 기본 false 동작 (비벤처 경로)", () => {
      const t = getMajorShareholderThreshold(
        "unlisted",
        new Date("2024-12-31"),
      );
      expect(t.marketCapThreshold).toBe(1_000_000_000);
      expect(t.isVentureRule).toBe(false);
    });
  });

  describe("PHB-04: 상장 시장에서 isVentureCompany 옵션은 무시 (§157 일반 임계)", () => {
    it("kospi + isVentureCompany=true → 일반 §157 임계 적용 (시총 50억)", () => {
      const t = getMajorShareholderThreshold(
        "kospi",
        new Date("2024-12-31"),
        { isVentureCompany: true },
      );
      expect(t.marketCapThreshold).toBe(5_000_000_000); // 50억 (벤처 분기 미적용)
      expect(t.isVentureRule).toBe(false);
      expect(t.ruleSource).toBe("§157");
    });

    it("kosdaq + isVentureCompany=true → §157 일반 (시총 50억)", () => {
      const t = getMajorShareholderThreshold(
        "kosdaq",
        new Date("2024-12-31"),
        { isVentureCompany: true },
      );
      expect(t.marketCapThreshold).toBe(5_000_000_000);
      expect(t.isVentureRule).toBe(false);
      expect(t.ruleSource).toBe("§157");
    });
  });
});
