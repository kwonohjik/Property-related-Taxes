/**
 * §105① 예정신고 대상·기한 — 순수 함수 anchor
 *
 * 종전 Step3은 `marketType` 분기 없이 전 종목에 「반기 말일 +2개월(§105①2호)」을 제시했다.
 * 법문은 ① 국외주식(§94①3호다목)을 **본문 괄호로 제외**하고 ② 기타자산(§94①4호)에는
 * **1호(달의 말일 +2개월)**를 적용한다.
 */

import { describe, it, expect } from "vitest";
import {
  isForeignStockMarket,
  isForeignOnlyFiling,
  resolveStockFilingType,
  resolvePreliminaryClause,
  calcPreliminaryDeadline,
} from "@/lib/calc/stock-filing-type";

describe("FD-1 국외주식은 예정신고 대상이 아니다 (§105① 본문 괄호)", () => {
  it("FD-1-1: 호 판정이 excluded", () => {
    expect(resolvePreliminaryClause("foreign_stock")).toBe("excluded");
  });
  it("FD-1-2: 기한이 만들어지지 않는다 — 날짜가 유효해도", () => {
    expect(calcPreliminaryDeadline("2025-03-15", "foreign_stock")).toBeUndefined();
  });
  it("FD-1-3: 🔑 양성 대조군 — 같은 날짜라도 국내주식이면 기한이 나온다", () => {
    expect(calcPreliminaryDeadline("2025-03-15", "kospi")).toBe("2025-08-31");
  });
});

describe("FD-2 §105①2호 — 국내주식 가·나목은 반기 말일 +2개월", () => {
  it.each([
    ["2025-01-01", "2025-08-31"],
    ["2025-03-15", "2025-08-31"],
    ["2025-06-30", "2025-08-31"],
    ["2025-07-01", "2026-02-28"],
    ["2025-09-10", "2026-02-28"],
    ["2025-12-31", "2026-02-28"],
  ])("%s → %s", (d, want) => {
    expect(calcPreliminaryDeadline(d, "kospi")).toBe(want);
    expect(calcPreliminaryDeadline(d, "unlisted")).toBe(want);
  });
});

describe("FD-3 §105①1호 — 기타자산(§94①4호)은 **달의** 말일 +2개월", () => {
  it.each([
    ["2025-03-15", "2025-05-31"],
    ["2025-01-05", "2025-03-31"],
    ["2025-11-20", "2026-01-31"],
    ["2025-12-01", "2026-02-28"],
  ])("%s → %s", (d, want) => {
    expect(calcPreliminaryDeadline(d, "other_asset")).toBe(want);
  });

  it("FD-3-1: 🔑 2호와 실제로 갈린다 — 같은 날짜에 다른 값", () => {
    expect(calcPreliminaryDeadline("2025-03-15", "other_asset")).not.toBe(
      calcPreliminaryDeadline("2025-03-15", "kospi"),
    );
  });
});

describe("FD-4 신고 단위 판정", () => {
  it("FD-4-1: 전부 국외면 true", () => {
    expect(isForeignOnlyFiling(["foreign_stock", "foreign_stock"])).toBe(true);
  });
  it("FD-4-2: 🔑 하나라도 국내면 false — 그 종목은 예정신고 대상이다", () => {
    expect(isForeignOnlyFiling(["foreign_stock", "kospi"])).toBe(false);
  });
  it("FD-4-3: 빈 배열은 false — 「국외 전용」이라고 단정하지 않는다", () => {
    expect(isForeignOnlyFiling([])).toBe(false);
  });
  it("FD-4-4: 시장 판별", () => {
    expect(isForeignStockMarket("foreign_stock")).toBe(true);
    expect(isForeignStockMarket("kosdaq")).toBe(false);
    expect(isForeignStockMarket(undefined)).toBe(false);
  });
});

describe("FD-5 표시용 신고유형", () => {
  it("FD-5-1: 국외 전용이면 예정신고는 확정신고로 읽는다 (선택지 자체가 없다)", () => {
    expect(resolveStockFilingType("preliminary", true, "preliminary")).toBe("final");
  });
  it("FD-5-2: 🔑 국외 전용이 아니면 그대로 — 상수가 아니다", () => {
    expect(resolveStockFilingType("preliminary", false, "preliminary")).toBe("preliminary");
  });
  it("FD-5-3: 확정·수정신고는 국외 전용이어도 그대로", () => {
    expect(resolveStockFilingType("final", true, "preliminary")).toBe("final");
    expect(resolveStockFilingType("revised", true, "preliminary")).toBe("revised");
  });
  it("FD-5-4: 미저장이면 fallback을 거쳐 같은 규칙", () => {
    expect(resolveStockFilingType(undefined, true, "preliminary")).toBe("final");
    expect(resolveStockFilingType(undefined, false, "preliminary")).toBe("preliminary");
  });
});
