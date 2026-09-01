/**
 * Phase 1 anchor — resolveValuationAnchor + buildSurroundingSlotsFromAnchor.
 *
 * 이미지 13 ㉮·㉯·㉰ + AS-04~AS-08 사례 정합 검증.
 * Plan: docs/00-pm/listed-stock-valuation-anchor-shift-fix.plan.md §2
 */

import { describe, it, expect } from "vitest";
import {
  resolveValuationAnchor,
  buildSurroundingSlotsFromAnchor,
} from "@/lib/kiwoom/calendar";
import { isYearEndNonTrading, yearEndNonTradingLabel } from "@/lib/kiwoom/year-end-holiday";

describe("isYearEndNonTrading — 납회기간 year-agnostic 판정", () => {
  it.each([
    ["2001-12-29", true],
    ["2001-12-30", true],
    ["2001-12-31", true],
    ["2024-12-29", true],
    ["2024-12-30", true],
    ["2024-12-31", true],
    ["2025-12-31", true],
    ["2022-12-28", false], // 12.28은 납회 아님
    ["2022-12-15", false],
    ["2022-01-01", false],
    ["invalid", false],
  ])("'%s' → %s", (iso, expected) => {
    expect(isYearEndNonTrading(iso)).toBe(expected);
  });

  it("yearEndNonTradingLabel — 납회면 '납회기간', 아니면 undefined", () => {
    expect(yearEndNonTradingLabel("2024-12-30")).toBe("납회기간");
    expect(yearEndNonTradingLabel("2024-12-28")).toBeUndefined();
  });
});

describe("resolveValuationAnchor — 이미지 13 사례", () => {
  it("AS-01 (㉮) 2022-12-03 토요일 → 12-02 (금)", () => {
    expect(resolveValuationAnchor("2022-12-03")).toBe("2022-12-02");
  });

  it("AS-02 (㉯) 2022-12-15 목 (거래일) → 그대로", () => {
    expect(resolveValuationAnchor("2022-12-15")).toBe("2022-12-15");
  });

  it("AS-03 (㉰) 2001-12-31 납회 → 12-28 (금)", () => {
    // 2001-12-28 = 금요일 (거래일)
    expect(resolveValuationAnchor("2001-12-31")).toBe("2001-12-28");
  });

  it("AS-04 2022-12-04 일요일 → 12-02 (금)", () => {
    expect(resolveValuationAnchor("2022-12-04")).toBe("2022-12-02");
  });

  it("AS-05 2024-01-01 신년 휴장 → 2023-12-28 (목)", () => {
    // 2024-01-01(월)은 신년 휴장(KRX 휴장 fixture) → 12-31 납회 → 12-30 토 → 12-29 일 → 12-28 목
    expect(resolveValuationAnchor("2024-01-01")).toBe("2023-12-28");
  });

  it("AS-07 2024-12-30 납회·월 → 12-28(토) → 12-27 (금)", () => {
    // 2024-12-30 ∈ 납회 → jump 12-28(토) → search 12-27(금)
    expect(resolveValuationAnchor("2024-12-30")).toBe("2024-12-27");
  });

  it("AS-08 2025-12-31 납회·수 → 12-28(일) → 12-27(토) → 12-26 (금)", () => {
    // 2025-12-28 = 일요일, 12-27 = 토, 12-26 = 금
    expect(resolveValuationAnchor("2025-12-31")).toBe("2025-12-26");
  });
});

describe("buildSurroundingSlotsFromAnchor — 시작·종료 경계일 포함", () => {
  it("AS-01: anchor 2022-12-02 → 시작 10-02, 종료 2023-02-02", () => {
    const slots = buildSurroundingSlotsFromAnchor("2022-12-02");
    expect(slots[0]).toBe("2022-10-02");
    expect(slots[slots.length - 1]).toBe("2023-02-02");
  });

  it("AS-02: anchor 2022-12-15 → 시작 10-15, 종료 2023-02-15", () => {
    const slots = buildSurroundingSlotsFromAnchor("2022-12-15");
    expect(slots[0]).toBe("2022-10-15");
    expect(slots[slots.length - 1]).toBe("2023-02-15");
  });

  it("AS-03: anchor 2001-12-28 → 시작 10-28, 종료 2002-02-28", () => {
    const slots = buildSurroundingSlotsFromAnchor("2001-12-28");
    expect(slots[0]).toBe("2001-10-28");
    expect(slots[slots.length - 1]).toBe("2002-02-28");
  });

  it("AS-05: anchor 2023-12-28 → 시작 2023-10-28, 종료 2024-02-28", () => {
    const slots = buildSurroundingSlotsFromAnchor("2023-12-28");
    expect(slots[0]).toBe("2023-10-28");
    expect(slots[slots.length - 1]).toBe("2024-02-28");
  });

  it("AS-07: anchor 2024-12-27 → 시작 2024-10-27, 종료 2025-02-27", () => {
    const slots = buildSurroundingSlotsFromAnchor("2024-12-27");
    expect(slots[0]).toBe("2024-10-27");
    expect(slots[slots.length - 1]).toBe("2025-02-27");
  });

  it("AS-08: anchor 2025-12-26 → 시작 2025-10-26, 종료 2026-02-26", () => {
    const slots = buildSurroundingSlotsFromAnchor("2025-12-26");
    expect(slots[0]).toBe("2025-10-26");
    expect(slots[slots.length - 1]).toBe("2026-02-26");
  });

  it("LS-01 H사 (회귀): anchor 2022-07-06 → 시작 2022-05-06, 종료 2022-09-06", () => {
    const slots = buildSurroundingSlotsFromAnchor("2022-07-06");
    expect(slots[0]).toBe("2022-05-06");
    expect(slots[slots.length - 1]).toBe("2022-09-06");
  });
});
