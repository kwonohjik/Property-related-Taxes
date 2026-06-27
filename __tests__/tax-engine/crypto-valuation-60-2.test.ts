import { describe, it, expect } from "vitest";
// ⚠️ Pre-Do anchor — computeCryptoUnitPrice·evaluateCryptoAsset은 아직 미구현(Do에서 추가). 본 anchor는 실패 확보용.
// 산식 근거: 상증법 §65② → 상증령 §60②1호 (평가기준일 전·후 각 1개월 일평균가액의 평균액)
// 확정 anchor: 교재(국세청 2024 상속세·증여세 실무해설 p.595) 문1·문2 1단계 일평균가액 평균
import {
  computeCryptoUnitPrice,
  evaluateCryptoAsset,
} from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const crypto = (over: Partial<EstateItem>): EstateItem =>
  ({
    id: "c1",
    name: "가상자산 A",
    category: "crypto_asset",
    ...over,
  }) as EstateItem;

describe("Pre-Do anchor — 가상자산 §60② 평가", () => {
  // ── 1단계: 거래일별 일평균가액의 평균액 (교재 확정값) ──
  it("[crypto-daily-avg-4providers] 4사 [11000,12000,13000,13000] → 12,250 (교재 문1)", () => {
    expect(computeCryptoUnitPrice([11000, 12000, 13000, 13000])).toBe(12250);
  });

  it("[crypto-daily-avg-3providers] 3사 [11000,12000,13000] → 12,000 (교재 문2)", () => {
    expect(computeCryptoUnitPrice([11000, 12000, 13000])).toBe(12000);
  });

  // ── 2단계: 기간 평균 (자기일관) ──
  it("[crypto-period-avg] [10000,20000,30000] → 20,000", () => {
    expect(computeCryptoUnitPrice([10000, 20000, 30000])).toBe(20000);
  });

  // ── evaluateCryptoAsset: timeseries 모드 (1호) ──
  it("[crypto-eval-timeseries] dailyPrices [10000,20000,30000] × qty 2 → 40,000 (crypto_statutory)", () => {
    const r = evaluateCryptoAsset(
      crypto({
        cryptoValuationMode: "timeseries",
        cryptoIsListedProvider: true,
        cryptoDailyPrices: [10000, 20000, 30000],
        cryptoQuantity: 2,
      }),
    );
    expect(r.valuatedAmount).toBe(40000);
    expect(r.method).toBe("crypto_statutory");
  });

  // ── evaluateCryptoAsset: direct 모드 ──
  it("[crypto-eval-direct] unitPrice 50000 × qty 1.5 → 75,000 (market_value)", () => {
    const r = evaluateCryptoAsset(
      crypto({
        cryptoValuationMode: "direct",
        cryptoUnitPrice: 50000,
        cryptoQuantity: 1.5,
      }),
    );
    expect(r.valuatedAmount).toBe(75000);
    expect(r.method).toBe("market_value");
  });

  // ── 2호(고시사업장 외) timeseries → method market_value ──
  it("[crypto-eval-other] timeseries + isListed=false → market_value (§60②2호)", () => {
    const r = evaluateCryptoAsset(
      crypto({
        cryptoValuationMode: "timeseries",
        cryptoIsListedProvider: false,
        cryptoDailyPrices: [10000, 20000, 30000],
        cryptoQuantity: 2,
      }),
    );
    expect(r.valuatedAmount).toBe(40000);
    expect(r.method).toBe("market_value");
  });

  // ── BigInt 분수연산 1원 정밀 (부동소수 곱 floor 오차 회피) ──
  it("[crypto-bigint-precision] unitPrice 2100 × qty 0.29 → 609 (float면 608.9999→608)", () => {
    const r = evaluateCryptoAsset(
      crypto({
        cryptoValuationMode: "direct",
        cryptoUnitPrice: 2100,
        cryptoQuantity: 0.29,
      }),
    );
    expect(r.valuatedAmount).toBe(609);
  });

  // ── 소수 수량 floor (safeMultiply 금지 검증) ──
  it("[crypto-floor] unitPrice 33333 × qty 0.00000003 → floor(0.00099999)=0", () => {
    const r = evaluateCryptoAsset(
      crypto({
        cryptoValuationMode: "direct",
        cryptoUnitPrice: 33333,
        cryptoQuantity: 0.00000003,
      }),
    );
    expect(r.valuatedAmount).toBe(0);
  });
});
