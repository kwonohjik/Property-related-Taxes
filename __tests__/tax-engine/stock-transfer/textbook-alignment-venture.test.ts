/**
 * Phase B — 비상장 벤처기업 시총 40억 임계 anchor (PHB-01~04)
 *
 * 시행령 §167의8①2호 나목 **본문 괄호** — 비상장 벤처기업 시총 임계 40억 적용.
 *
 * 🔴 2026-08-28 갱신(리뷰 #14) — 종전 이 파일은 헤더가 「KoreanLaw MCP 검증 생략 — 교재 기준
 *   채택」이라 적고 **조문을 보지 않은 채** 「벤처면 40억」을 고정하고 있었다. 법문을 실측하니
 *   40억 예외에는 **거래 방법 요건**이 함께 붙는다(lawId 003956, 시행 2026-07-01):
 *     「… 시가총액이 10억원(**「자본시장과 금융투자업에 관한 법률 시행령」 제178조제1항에
 *      따라 거래되는** 「벤처기업육성에 관한 특별법」 제2조제1항에 따른 벤처기업의 주식등의
 *      경우에는 40억원으로 한다) 이상인 경우」
 *   ⇒ PHB-01·02 픽스처에 `isKOTCTrading: true` 를 더해 **법문이 40억을 주는 조합**으로 맞췄다.
 *     「벤처인데 장외면 10억」 대조는 `classification-94-2-venture-kotc.anchor.test.ts` CL-VC-2.
 *   또한 「단서」가 아니라 **본문 괄호**이므로 인용 표기도 정정했다.
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
        { isVentureCompany: true, isKOTCTrading: true },
      );
      // 지분율 임계는 비벤처와 동일 (4%)
      expect(t.shareRatioThreshold).toBe(0.04);
      // 시총 임계만 40억으로 변경 (§167의8①2호 나목 본문 괄호)
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
        { isVentureCompany: true, isKOTCTrading: true },
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
