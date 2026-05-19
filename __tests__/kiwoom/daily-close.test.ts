import { describe, it, expect } from "vitest";
import { isKrxTradingDay } from "@/lib/kiwoom/calendar";

describe("F-04 daily-close — anchor (UI 계산 검증)", () => {
  // K-CAP-01: 시총 산정 — 종가 × 보유 주식수 = 시가총액 (BigInt 미사용, 안전 정수 범위)
  it("K-CAP-01: 종가 53,200 × 5,846,279,000주 → 시총 311,022 억원 (Math.floor)", () => {
    const close = 53_200;
    const shares = 5_846_279_000;
    const marketCap = Math.floor(close * shares);
    // 5,846,279,000 × 53,200 = 311,022,042,800,000 (311조)
    expect(marketCap).toBe(311_022_042_800_000);
    // 50억 임계 비교 — 매우 큼
    expect(marketCap).toBeGreaterThan(5_000_000_000);
  });

  it("K-CAP-02: 시총 49억 9천만 (임계 미달) — 종가 1,000 × 4,999,000주", () => {
    const close = 1_000;
    const shares = 4_999_000;
    const marketCap = Math.floor(close * shares);
    expect(marketCap).toBe(4_999_000_000);
    expect(marketCap < 5_000_000_000).toBe(true);
  });

  it("K-CAP-03: 시총 50억 1천 (임계 충족) — 종가 1,000 × 5,001,000주", () => {
    const close = 1_000;
    const shares = 5_001_000;
    const marketCap = Math.floor(close * shares);
    expect(marketCap).toBe(5_001_000_000);
    expect(marketCap >= 5_000_000_000).toBe(true);
  });

  it("K-CAP-04: 2024-12-31 사업연도말 거래일 판정 (KRX 휴장일)", () => {
    // 2024-12-31는 KRX 임시휴장일 → 직전 거래일 fallback 필요
    expect(isKrxTradingDay("2024-12-31")).toBe(false);
    // 2024-12-30 (월) → 거래일
    expect(isKrxTradingDay("2024-12-30")).toBe(true);
  });
});
