import { describe, it, expect } from "vitest";
import {
  EXCESS_DIVIDEND_RATE_TABLE_6BRACKET,
  EXCESS_DIVIDEND_RATE_TABLE_7BRACKET,
  applyExcessDividendRateTable,
  resolveExcessDividendRateTable,
} from "@/lib/tax-engine/data/gift-deemed-rates";
import { computeExcessDividendAmount } from "@/lib/tax-engine/gift-deemed/excess-dividend";
import type { ShareholderDividend } from "@/lib/tax-engine/gift-deemed/types";

/**
 * §41의2 초과배당 — 보완 Pre-Do anchor (디자인 동결)
 *
 * 기대값은 법령 정합값 — 변경 시 법령 근거 필수
 * (memory feedback_anchor_correction_legal_priority).
 * anchor: 교재 img26(현행 7구간)·img29(구법 6구간), 시행령 §31의2②, 시행규칙 §10의3①.
 */

describe("§41의2 소득세상당액 율표 (시행규칙 §10의3①)", () => {
  // A1: 현행 7구간(2024.3.22~), 초과배당 2억 → 1.5억~3억 구간 base 3,706만 + 5천만×38%
  it("[A1] 현행 7구간 2억 → 3,706만 + 5천만×38% = 56,060,000", () => {
    expect(applyExcessDividendRateTable(200_000_000, EXCESS_DIVIDEND_RATE_TABLE_7BRACKET)).toBe(
      56_060_000,
    );
  });

  // A2: 구법 6구간(2018~2024.3.21), 동일 2억 → base 3,760만 + 5천만×38%
  it("[A2] 구법 6구간 2억 → 3,760만 + 5천만×38% = 56,600,000", () => {
    expect(applyExcessDividendRateTable(200_000_000, EXCESS_DIVIDEND_RATE_TABLE_6BRACKET)).toBe(
      56_600_000,
    );
  });

  // 최저구간 경계 14% (현행 1구간 상한 5,760만 정확 경계)
  it("[A1-b] 현행 5,760만 경계 → ×14% = 8,064,000", () => {
    expect(applyExcessDividendRateTable(57_600_000, EXCESS_DIVIDEND_RATE_TABLE_7BRACKET)).toBe(
      8_064_000,
    );
  });

  // 최고구간 (현행 10억 초과 45%) — 12억 → base 3억8,406만 + 2억×45%
  it("[A1-c] 현행 12억 → 3억8,406만 + 2억×45% = 474,060,000", () => {
    expect(applyExcessDividendRateTable(1_200_000_000, EXCESS_DIVIDEND_RATE_TABLE_7BRACKET)).toBe(
      474_060_000,
    );
  });

  // 율표 선택: 2024-03-22 경계
  it("[A1-set] 2024-03-22 이후 → 7구간 / 이전 → 6구간", () => {
    expect(resolveExcessDividendRateTable(new Date("2024-03-22"))).toBe(
      EXCESS_DIVIDEND_RATE_TABLE_7BRACKET,
    );
    expect(resolveExcessDividendRateTable(new Date("2024-03-21"))).toBe(
      EXCESS_DIVIDEND_RATE_TABLE_6BRACKET,
    );
  });
});

describe("§41의2 초과배당금액 자동산정 (시행령 §31의2②)", () => {
  // A3 (교차검토 정정): ②비율 < 1 — 기타 과소배당 주주가 분모(총과소배당)에 포함
  it("[A3] 최대주주(60%,0)·특수관계인(30%,1억)·기타(10%,5백만) → 63,000,000", () => {
    const shareholders: ShareholderDividend[] = [
      { id: "1", role: "major_shareholder", ownershipRatio: { numer: 60, denom: 100 }, actualDividend: 0 },
      { id: "2", role: "related_party", ownershipRatio: { numer: 30, denom: 100 }, actualDividend: 100_000_000 },
      { id: "3", role: "other", ownershipRatio: { numer: 10, denom: 100 }, actualDividend: 5_000_000 },
    ];
    // 총배당 105,000,000 / 특수관계인 비례 31,500,000 / ①가액 68,500,000
    // 최대주주 과소 63,000,000 + 기타 과소 5,500,000 = 총과소 68,500,000
    // ②비율 = 63,000,000 / 68,500,000
    // 초과배당 = 68,500,000 × (63,000,000 / 68,500,000) = 63,000,000
    expect(computeExcessDividendAmount(shareholders).excessDividendAmount).toBe(63_000_000);
  });

  // A3-b: ②비율 = 1 (기타 주주 없음, 최대주주만 과소) → ①가액 = 초과배당금액
  it("[A3-b] 최대주주(70%,0)·특수관계인(30%,1억) → 70,000,000", () => {
    const shareholders: ShareholderDividend[] = [
      { id: "1", role: "major_shareholder", ownershipRatio: { numer: 70, denom: 100 }, actualDividend: 0 },
      { id: "2", role: "related_party", ownershipRatio: { numer: 30, denom: 100 }, actualDividend: 100_000_000 },
    ];
    // 총배당 1억 / 특수관계인 비례 30,000,000 / ①가액 70,000,000
    // 최대주주 과소 70,000,000 = 총과소 → ②비율 1.0 → 70,000,000
    expect(computeExcessDividendAmount(shareholders).excessDividendAmount).toBe(70_000_000);
  });
});
