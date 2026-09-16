/**
 * Pre-Do anchor — 주식 다종목 합산 이력의 **저장 규약**
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.1·§4.2 (PR-1)
 *
 * ## 왜 이 파일이 필요한가
 *
 * 착수 전 mutation 실측(§3 M-2)에서 `StockTransferTaxCalculator.tsx:88`의 이력 저장
 * `inputData`를 오염시키고 **전건 21,549건을 돌렸는데 실패가 0이었다**. 주식 이력에 무엇이
 * 저장되는지를 지키는 테스트가 **하나도 없었다** — 그래서 다종목 합산 결과가 「마지막 종목」만
 * 남기고 사라지는 결함(§2 G-B)이 살아남았다.
 *
 * 규약: 다종목은 `{ __multiStock: true, items: [...] }` · 단건은 폼을 그대로
 *       (부동산 다건 `{ __multiTransfer: true, ...form }`과 같은 층위)
 */
import { describe, it, expect } from "vitest";
import {
  extractStockSecurityName,
  extractStockTransferDate,
  generateTitle,
} from "@/lib/storage/title-generator";
import { extractBusinessKey } from "@/lib/storage/business-key";

const CREATED = "2026-02-20T00:00:00.000Z";

/** 다종목 합산 이력 — 대표(첫) 종목이 식별자다 */
const MULTI = {
  __multiStock: true,
  items: [
    { securityName: "삼성전자", transferDate: "2026-02-20" },
    { securityName: "SK하이닉스", transferDate: "2026-03-10" },
    { securityName: "네이버", transferDate: "2026-04-01" },
  ],
};

/** 같은 대표 종목·같은 양도일을 가진 **단건** 이력 */
const SINGLE = { securityName: "삼성전자", transferDate: "2026-02-20" };

describe("주식 다종목 이력 — 저장 규약 anchor", () => {
  it("S-1 종목명 추출이 items[0]을 본다", () => {
    expect(extractStockSecurityName(MULTI)).toBe("삼성전자");
  });

  it("S-1a 단건 규약은 그대로다 (회귀 방지)", () => {
    expect(extractStockSecurityName(SINGLE)).toBe("삼성전자");
  });

  it("S-2 대표 양도일 추출이 items[0]을 본다", () => {
    expect(extractStockTransferDate(MULTI)).toBe("2026.02.20");
  });

  it("S-2a items[0]의 transferLots 규칙도 그대로 적용된다", () => {
    const withLots = {
      __multiStock: true,
      items: [
        { securityName: "삼성전자", transferLots: [{ transferDate: "2026-01-05" }, { transferDate: "2026-02-20" }] },
      ],
    };
    // 기존 규칙: lots가 있으면 **마지막** lot의 양도일
    expect(extractStockTransferDate(withLots)).toBe("2026.02.20");
  });

  it("S-3 제목이 다종목임을 드러낸다 — 「(다종목)」 + 「외 N건」", () => {
    const title = generateTitle("stock_transfer", MULTI, CREATED);
    expect(title).toContain("(다종목)");
    expect(title).toContain("삼성전자");
    expect(title).toContain("외 2건");
  });

  it("S-3a 단건 제목은 그대로다 (회귀 방지)", () => {
    const title = generateTitle("stock_transfer", SINGLE, CREATED);
    expect(title).toBe("주식 양도세 — 삼성전자 (양도 2026.02.20)");
    expect(title).not.toContain("다종목");
  });

  it("S-4 🔴 다종목 키가 단건 키를 덮어쓰지 않는다", () => {
    const multiKey = extractBusinessKey("stock_transfer", MULTI);
    const singleKey = extractBusinessKey("stock_transfer", SINGLE);
    expect(multiKey).not.toBeNull();
    expect(singleKey).not.toBeNull();
    expect(multiKey).not.toBe(singleKey);
  });

  it("S-4a 단건 키 형식은 그대로다 (회귀 방지)", () => {
    expect(extractBusinessKey("stock_transfer", SINGLE)).toBe("sec:삼성전자|2026.02.20");
  });

  it("S-4b 종목명이 없으면 다종목도 null로 폴백한다", () => {
    expect(
      extractBusinessKey("stock_transfer", { __multiStock: true, items: [{ transferDate: "2026-02-20" }] }),
    ).toBeNull();
  });

  it("S-4c 종목을 추가해도 **같은 신고서**라 키가 유지된다", () => {
    const grown = { __multiStock: true, items: [...MULTI.items, { securityName: "카카오", transferDate: "2026-05-01" }] };
    expect(extractBusinessKey("stock_transfer", grown)).toBe(extractBusinessKey("stock_transfer", MULTI));
  });
});
