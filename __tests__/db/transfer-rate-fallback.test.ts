/**
 * transfer-rate-fallback.test.ts — 로컬 세율 fallback anchor
 *
 * loadFallbackTransferRates() 가 Supabase 미도달 시에도 양도세 계산에 충분한
 * 세율 맵을 제공하는지 검증. preload_tax_rates RPC와 동일 의미론
 * (effective_date <= targetDate 중 키별 최신) 보장.
 *
 * 데이터 단일 소스: lib/tax-engine/data/transfer-rate-seed{,-historical}.ts
 */

import { describe, it, expect } from "vitest";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

describe("loadFallbackTransferRates — Supabase 미도달 시 로컬 세율", () => {
  it("2024 양도: 필수 키 7개 모두 존재 → parseRatesFromMap throw 안 함", () => {
    const rates = loadFallbackTransferRates(new Date("2024-03-01"));
    expect(() => parseRatesFromMap(rates)).not.toThrow();
  });

  it("현행 누진세율(progressive_rate:_default) 첫 구간 6%, effective 2023-01-01", () => {
    const rates = loadFallbackTransferRates(new Date("2024-03-01"));
    const prog = rates.get("transfer:progressive_rate:_default");
    expect(prog).toBeDefined();
    expect(prog!.effectiveDate).toBe("2023-01-01");
    const brackets = (prog!.rateTable as { brackets: { rate: number }[] }).brackets;
    expect(brackets[0].rate).toBe(0.06);
  });

  it("DISTINCT ON: 2020 양도는 현행(2023) 미적용 → effective_date < 2023-01-01", () => {
    const rates = loadFallbackTransferRates(new Date("2020-06-01"));
    const prog = rates.get("transfer:progressive_rate:_default");
    expect(prog).toBeDefined();
    expect(prog!.effectiveDate < "2023-01-01").toBe(true);
  });

  it("effective_date > targetDate 행은 제외 (미래 세율 누출 방지)", () => {
    // 2010 시점: 2023 현행 세율은 effective_date(2023) > target(2010) → 선택 불가
    const rates = loadFallbackTransferRates(new Date("2010-06-01"));
    const prog = rates.get("transfer:progressive_rate:_default");
    if (prog) expect(prog.effectiveDate <= "2010-06-01").toBe(true);
  });

  it("fallback 세율만으로 calculateTransferTax 완주 (DB 없이 계산 — 핵심 보증)", () => {
    const rates = loadFallbackTransferRates(new Date("2024-03-01"));
    const input = baseTransferInput();
    const result = calculateTransferTax(input, rates);
    // 5억→3억 1주택 5년 보유 표준 케이스: 비과세 또는 정상 계산(throw 없음)이 핵심
    expect(result).toBeDefined();
    expect(typeof result.totalTax).toBe("number");
    expect(result.totalTax).toBeGreaterThanOrEqual(0);
  });
});
