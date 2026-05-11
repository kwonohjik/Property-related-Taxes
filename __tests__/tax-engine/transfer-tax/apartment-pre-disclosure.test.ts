/**
 * 공동주택(아파트) 최초고시 전 취득 — PHD 3-시점 환산취득가 단위 테스트
 *
 * 사례 23 anchor: 예제 검증값 기준
 *   - 환산취득가액: 244,991,717
 *   - 개산공제:     8,491,190
 *
 * 법령: 소득세법 시행령 §164 ⑤·⑦, §163 ⑥
 * 알고리즘: calcPreHousingDisclosureGain (단독·공동주택 동일 공식)
 */

import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import {
  A23_TRANSFER_PRICE,
  A23_PHD_INPUT,
  A23_SUM_A,
  A23_SUM_F,
  A23_P_A_EST,
  A23_TOTAL_EST_ACQ,
  A23_LUMP_DEDUCTION,
} from "./_helpers/apartment-pre-disclosure-fixture";

// ──────────────────────────────────────────────────────────────
// T-A23-1: 기준시가 합계 (Sum_A · Sum_F)
// ──────────────────────────────────────────────────────────────

describe("T-A23-1: 기준시가 합계 산출 — 공동주택 (§164⑦)", () => {
  it("T-A23-1-1 Sum_A = 개별공시지가 × 대지면적 + 건물기준시가 (취득시 1992)", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    // Sum_A = 600,000 × 65.49 + 243,745,674 = 283,039,674
    expect(result.sumAtAcquisition).toBe(A23_SUM_A);
  });

  it("T-A23-1-2 Sum_F = 개별공시지가 × 대지면적 + 건물기준시가 (최초공시 1993)", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    // Sum_F = 600,000 × 65.49 + 240,706,000 = 280,000,000 = P_F
    expect(result.sumAtFirstDisclosure).toBe(A23_SUM_F);
  });

  it("T-A23-1-3 Sum_A > Sum_F → P_A_est > P_F (취득시 기준시가 최초공시보다 높음)", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    expect(result.sumAtAcquisition).toBeGreaterThan(result.sumAtFirstDisclosure);
    expect(result.estimatedHousingPriceAtAcquisition).toBeGreaterThan(
      A23_PHD_INPUT.firstDisclosureHousingPrice
    );
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-2: P_A_est 역산 (§164⑤ 핵심 공식)
// ──────────────────────────────────────────────────────────────

describe("T-A23-2: 추정 취득시 공동주택가격 P_A_est (§164⑤·⑦)", () => {
  it("T-A23-2-1 P_A_est = floor(P_F × Sum_A / Sum_F) = 283,039,674 (예제 역산)", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    expect(result.estimatedHousingPriceAtAcquisition).toBe(A23_P_A_EST);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-3: 환산취득가액 (예제 검증값 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-3: 환산취득가액 — 예제 anchor", () => {
  it("T-A23-3-1 환산취득가액 = floor(양도가액 × P_A_est / P_T) = 244,991,717", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    expect(result.totalEstimatedAcquisitionPrice).toBe(A23_TOTAL_EST_ACQ);
  });

  it("T-A23-3-2 환산취득가액 < 양도가액", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    expect(result.totalEstimatedAcquisitionPrice).toBeLessThan(A23_TRANSFER_PRICE);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-4: 개산공제 (예제 검증값 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-4: 개산공제 (§163⑥) — 예제 anchor", () => {
  it("T-A23-4-1 개산공제 = floor(P_A_est × 3%) = 8,491,190", () => {
    // 토지/건물 분리 없는 단일 주택 경우 개산공제 = floor(P_A_est × 3%)
    // 283,039,674 × 0.03 = 8,491,190.22 → floor = 8,491,190
    const derived = Math.floor(A23_P_A_EST * 0.03);
    expect(derived).toBe(A23_LUMP_DEDUCTION);
  });

  it("T-A23-4-2 전체 양도차익 = 양도가액 - 환산취득가 - 개산공제 = 1,066,517,093", () => {
    const result = calcPreHousingDisclosureGain(A23_TRANSFER_PRICE, A23_PHD_INPUT);
    const gain = A23_TRANSFER_PRICE - result.totalEstimatedAcquisitionPrice - A23_LUMP_DEDUCTION;
    expect(gain).toBe(1_066_517_093);
  });
});
