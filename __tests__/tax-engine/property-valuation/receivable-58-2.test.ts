import { describe, it, expect } from "vitest";
import {
  evaluateReceivable,
  resolveReceivableRecoveryYears,
} from "@/lib/tax-engine/property-valuation";
import { resolveReceivableDiscountRate } from "@/lib/tax-engine/data/gift-deemed-rates";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 채권가액 평가 — 상증령 §58② / 상증칙 §18의2② / 상증칙 §18의3(적정할인율).
 * - 기타채권(회수기간 5년 이내): 원본 + 평가기준일까지 미수이자상당액
 * - 장기·변경채권(5년 초과·회사정리 등): Σ 회수금액(원본+이자) ÷ (1+적정할인율)ⁿ, round-half-up
 * - 회수불가능: §58② 단서 산입 제외
 * 설계: docs/02-design/features/inheritance-receivable-valuation.engine.design.md
 * anchor RC-B1: 교재 정리채권 — 인가일 2020.12.20, 원금 50억 10년거치 5년분할, 평가기준일 2022.12.20, 8%.
 */

const base = (p: Partial<EstateItem>): EstateItem => ({
  id: "rc-1",
  name: "테스트 채권",
  category: "receivable",
  ...p,
});

describe("채권가액 평가 (§58②·상증칙§18의2②)", () => {
  // ── 케이스 B: 장기 정리채권 현가할인 ──────────────────────────
  it("[RC-B1] 정리채권 현가 — 5회차 합계 2,837,396,278 (8%, round-half-up)", () => {
    const r = evaluateReceivable(
      base({
        receivableKind: "reorg",
        receivableMode: "discounted",
        receivableValuationDate: new Date("2022-12-20"),
        receivableSchedule: [
          { recoverDate: new Date("2031-12-20"), amount: 1_500_000_000 }, // 10억+이자5억
          { recoverDate: new Date("2032-12-20"), amount: 1_400_000_000 },
          { recoverDate: new Date("2033-12-20"), amount: 1_300_000_000 },
          { recoverDate: new Date("2034-12-20"), amount: 1_200_000_000 },
          { recoverDate: new Date("2035-12-20"), amount: 1_100_000_000 },
        ],
      }),
    );
    expect(r.valuatedAmount).toBe(2_837_396_278);
    expect(r.method).toBe("standard_price");
  });

  it("[RC-B1a] 첫 회차 검산 — 1.5억 ÷ 1.08^9 = 750,373,451 (round)", () => {
    const r = evaluateReceivable(
      base({
        receivableMode: "discounted",
        receivableValuationDate: new Date("2022-12-20"),
        receivableSchedule: [
          { recoverDate: new Date("2031-12-20"), amount: 1_500_000_000 },
        ],
      }),
    );
    expect(r.valuatedAmount).toBe(750_373_451);
  });

  // ── 케이스 A: 기타채권 단순합산 ──────────────────────────────
  it("[RC-A1] 원본 1억 + 미수이자 300만 = 103,000,000", () => {
    const r = evaluateReceivable(
      base({
        receivableMode: "simple",
        receivablePrincipal: 100_000_000,
        receivableAccruedInterest: 3_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(103_000_000);
  });

  it("[RC-A2] 무이자 단기채권 — 원본만 50,000,000", () => {
    const r = evaluateReceivable(
      base({ receivableMode: "simple", receivablePrincipal: 50_000_000 }),
    );
    expect(r.valuatedAmount).toBe(50_000_000);
  });

  // ── 케이스 C: 회수불가능 (§58② 단서) ────────────────────────
  it("[RC-C1] 전부 회수불가능 → 0", () => {
    const r = evaluateReceivable(
      base({
        receivableMode: "simple",
        receivablePrincipal: 50_000_000,
        receivableUncollectible: 50_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(0);
  });

  it("[RC-C2] 원본 5천만 − 회수불가 2천만 + 미수이자 100만 = 31,000,000", () => {
    const r = evaluateReceivable(
      base({
        receivableMode: "simple",
        receivablePrincipal: 50_000_000,
        receivableUncollectible: 20_000_000,
        receivableAccruedInterest: 1_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(31_000_000);
  });

  // ── 시대표 분기 ──────────────────────────────────────────────
  it("[RC-rate] 적정할인율 시점별 — 2010.6.1=6.5% / 2020.1.1=8.0%", () => {
    expect(resolveReceivableDiscountRate("2010-06-01")).toEqual({ numer: 65, denom: 1000 });
    expect(resolveReceivableDiscountRate("2020-01-01")).toEqual({ numer: 80, denom: 1000 });
  });

  // ── 회수기간 단일 헬퍼 ──────────────────────────────────────
  it("[RC-years] 최종 회수일 − 평가기준일 = 13년", () => {
    const years = resolveReceivableRecoveryYears(
      [
        { recoverDate: new Date("2031-12-20"), amount: 1 },
        { recoverDate: new Date("2035-12-20"), amount: 1 },
      ],
      new Date("2022-12-20"),
    );
    expect(years).toBe(13);
  });
});
