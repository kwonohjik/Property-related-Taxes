/**
 * 비상장주식 간편평가 — 결손·순자산 음수 직접 입력 anchor
 *
 * Plan: docs/00-pm/unlisted-stock-deficit-negative-direct-input.plan.md
 *
 * 케이스(§7 매트릭스):
 *  - C-2: 결손 가중평균 음수 → 0 (§56① 단서, 엔진 무변경)
 *  - C-3: 결손 토글 경로 ↔ 음수 직접 입력 경로 = 동일 결과 (등가성)
 *  - C-4: 음수 순자산 → 0 (§55① 후단, 엔진 무변경)
 *  - C-5: 양수 순자산 정상
 *  - C-6: Zod netAssetValue 음수 통과 (완화 후) — 현재 RED
 *  - C-8: parseAmount NaN 가드 (전이 "-" → 0) — 현재 RED
 */

import { describe, it, expect } from "vitest";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { unlistedStockDataSchema } from "@/lib/validators/property-valuation-input";
import {
  calcCompanyWeightedNetIncome3Y,
  calcPerShareNetAssetValue,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import type { UnlistedStockData } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("[비상장 간편] 결손·순자산 음수 직접 입력", () => {
  // ── C-2: 결손 가중평균 음수 → 0 (엔진 무변경, 이미 GREEN 예상) ──
  it("C-2: 결손 가중평균 음수 → 0 (§56① 단서)", () => {
    // (−120M×3 + −80M×2 + 65.2M×1) / 6 = −454.8M / 6 = −75.8M → 0
    const w = calcCompanyWeightedNetIncome3Y(-120_000_000, -80_000_000, 65_200_000);
    expect(w).toBe(0);
  });

  // ── C-3: 토글 경로 ↔ 음수 직접 입력 경로 등가 ──
  it("C-3: 결손 토글(−absVal 저장) ↔ 음수 직접 입력 = 동일 결과", () => {
    const base = {
      totalShares: 100_000,
      ownedShares: 30_000,
      capitalizationRate: 0.1,
      netAssetValue: 0,
      weightedNetIncome: 0, // deprecated legacy 필드 (타입 필수)
    };
    // (구) 토글 경로: deficit=true → store에 -absVal 저장
    const togglePath: UnlistedStockData = {
      ...base,
      netIncomeY1: -Math.abs(120_000_000),
      netIncomeY2: -Math.abs(80_000_000),
      netIncomeY3: 65_200_000,
    };
    // (신) 음수 직접 입력: parseAmount("-120,000,000") = -120000000
    const directPath: UnlistedStockData = {
      ...base,
      netIncomeY1: parseAmount("-120,000,000"),
      netIncomeY2: parseAmount("-80,000,000"),
      netIncomeY3: parseAmount("65,200,000"),
    };
    expect(directPath.netIncomeY1).toBe(togglePath.netIncomeY1);
    expect(directPath.netIncomeY2).toBe(togglePath.netIncomeY2);
    const a = calcUnlistedStockPerShareValue(togglePath, false);
    const b = calcUnlistedStockPerShareValue(directPath, false);
    expect(b).toEqual(a);
    // 결손이므로 순손익가치 0
    expect(b.perShareIncomeValue).toBe(0);
  });

  // ── C-4: 음수 순자산 → 0 (§55① 후단) ──
  it("C-4: 음수 순자산 → perShareAssetValue 0", () => {
    expect(calcPerShareNetAssetValue(-50_000_000, 100_000)).toBe(0);
  });

  // ── C-5: 양수 순자산 정상 ──
  it("C-5: 양수 순자산 정상 (5,000,000,000 / 100,000 = 50,000)", () => {
    expect(calcPerShareNetAssetValue(5_000_000_000, 100_000)).toBe(50_000);
  });

  // ── C-6: Zod netAssetValue 음수 통과 (완화 후) — 현재 RED ──
  it("C-6: Zod netAssetValue 음수 safeParse 성공 (완화 후)", () => {
    const result = unlistedStockDataSchema.safeParse({
      totalShares: 100_000,
      ownedShares: 30_000,
      netIncomeY1: -120_000_000,
      netIncomeY2: -80_000_000,
      netIncomeY3: 65_200_000,
      netAssetValue: -50_000_000, // 음수
      capitalizationRate: 0.1,
    });
    expect(result.success).toBe(true);
  });

  it("C-6b: Zod netIncomeY 음수도 통과 (기존 보장)", () => {
    const result = unlistedStockDataSchema.safeParse({
      totalShares: 100_000,
      ownedShares: 30_000,
      netIncomeY1: -120_000_000,
      netAssetValue: 0,
      capitalizationRate: 0.1,
    });
    expect(result.success).toBe(true);
  });

  // ── C-8: parseAmount NaN 가드 + 회귀 — 현재 RED ("-" → NaN) ──
  it("C-8: parseAmount 음수·전이·회귀", () => {
    expect(parseAmount("-")).toBe(0); // 전이 상태 — NaN 금지
    expect(parseAmount("-120,000,000")).toBe(-120_000_000);
    expect(parseAmount("-5")).toBe(-5);
    expect(parseAmount("1,000")).toBe(1_000); // 회귀: 기존 동작 불변
    expect(parseAmount("")).toBe(0);
    expect(Number.isNaN(parseAmount("-"))).toBe(false);
  });
});
