/**
 * title-generator — stock_transfer 분기 anchor 테스트
 *
 * 검증 대상:
 *   - generateTitle: 종목명+대표양도일 조합 title 생성
 *   - extractStockSecurityName: securityName 추출
 *   - extractStockTransferDate: transferLots 마지막 요소 → top-level transferDate 우선순위
 */

import { describe, it, expect } from "vitest";
import {
  generateTitle,
  extractStockSecurityName,
  extractStockTransferDate,
} from "@/lib/storage/title-generator";

describe("title-generator — stock_transfer", () => {
  // ── extractStockSecurityName ────────────────────────────────
  it("TG-S-01: securityName 정상 추출", () => {
    expect(extractStockSecurityName({ securityName: "삼성전자" })).toBe("삼성전자");
  });

  it("TG-S-02: securityName 공백 → null", () => {
    expect(extractStockSecurityName({ securityName: "  " })).toBeNull();
  });

  it("TG-S-03: securityName 미입력 → null", () => {
    expect(extractStockSecurityName({})).toBeNull();
  });

  // ── extractStockTransferDate ────────────────────────────────
  it("TG-D-01: transferLots 비어있지 않으면 마지막 요소 transferDate 반환", () => {
    const input = {
      transferLots: [
        { transferDate: "2024-01-15" },
        { transferDate: "2024-03-20" },
      ],
      transferDate: "2024-01-01",
    };
    // 마지막 lot의 날짜 2024.03.20 반환
    expect(extractStockTransferDate(input)).toBe("2024.03.20");
  });

  it("TG-D-02: transferLots 빈 배열이면 top-level transferDate 반환", () => {
    const input = {
      transferLots: [],
      transferDate: "2024-05-10",
    };
    expect(extractStockTransferDate(input)).toBe("2024.05.10");
  });

  it("TG-D-03: transferLots 없으면 top-level transferDate 반환", () => {
    const input = { transferDate: "2023-12-31" };
    expect(extractStockTransferDate(input)).toBe("2023.12.31");
  });

  it("TG-D-04: 날짜 미입력 → null", () => {
    expect(extractStockTransferDate({})).toBeNull();
  });

  // ── generateTitle ───────────────────────────────────────────
  it("TG-T-01: 종목명 + 대표양도일 모두 있는 경우", () => {
    const input = {
      securityName: "삼성전자",
      transferDate: "2024-06-15",
    };
    expect(generateTitle("stock_transfer", input, "2024-06-20T10:00:00Z")).toBe(
      "주식 양도세 — 삼성전자 (양도 2024.06.15)"
    );
  });

  it("TG-T-02: 종목명만 있고 날짜 없는 경우", () => {
    const input = { securityName: "카카오" };
    expect(generateTitle("stock_transfer", input, "2024-06-20T10:00:00Z")).toBe(
      "주식 양도세 — 카카오"
    );
  });

  it("TG-T-03: 날짜만 있고 종목명 없는 경우", () => {
    const input = { transferDate: "2024-08-01" };
    expect(generateTitle("stock_transfer", input, "2024-09-01T00:00:00Z")).toBe(
      "주식 양도세 — 양도 2024.08.01"
    );
  });

  it("TG-T-04: 종목명·날짜 모두 없으면 저장일시로 fallback", () => {
    const title = generateTitle("stock_transfer", {}, "2024-07-10T00:00:00Z");
    // "주식 양도세 — 2024.07.10" 형태
    expect(title).toMatch(/^주식 양도세 — \d{4}\.\d{2}\.\d{2}$/);
  });

  it("TG-T-05: transferLots 마지막 요소 날짜 우선 사용", () => {
    const input = {
      securityName: "NAVER",
      transferLots: [
        { transferDate: "2024-02-10" },
        { transferDate: "2024-04-30" },
      ],
      transferDate: "2024-01-01",
    };
    expect(generateTitle("stock_transfer", input, "2024-06-01T00:00:00Z")).toBe(
      "주식 양도세 — NAVER (양도 2024.04.30)"
    );
  });
});
