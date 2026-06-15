/**
 * 양도세 매매사례가액 취득가액 추계 — §176의2③1호 + 개산공제 §163⑥·§163⑫ (Part C)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §5
 * 법령(KoreanLaw 2026-06-15 검증):
 *   - 소득세법 시행령 §176의2③: 취득가액 추계 순차 — ①매매사례가액 →②감정가액 →③환산 →④기준시가
 *   - §176의2③1호: 취득일 전후 각 3개월 이내 동일·유사 자산 매매사례가액
 *   - §163⑫: §97①1호나목 "매매사례가액"=§176의2②~④ 가액 → §97②2호 개산공제 대상
 *   - §163⑥: 토지·주택·건물 취득당시 기준시가 × 3/100 (필요경비 개산공제)
 *   - §114조의2: 신축·증축 가산세는 "감정가액 또는 환산취득가액"만 — 매매사례가액 제외
 *     → salesCase 는 penaltyBase 분기에 포함하지 않음(현행 유지)이 법령 정합.
 */
import { describe, it, expect } from "vitest";

import { calcTransferGain } from "@/lib/tax-engine/transfer-tax-helpers";
import { baseTransferInput } from "../_helpers/mock-rates";

describe("[SC] 매매사례가액 취득가액 추계(§176의2③1호) + 개산공제(§163⑥)", () => {
  it("SC-1: salesCase → 취득가액=매매사례가액, 개산공제=취득시 기준시가×3%, 양도차익 검증", () => {
    const input = baseTransferInput({
      transferPrice: 1_200_000_000,
      acquisitionMethod: "salesCase",
      similarSalesValue: 900_000_000,
      standardPriceAtAcquisition: 300_000_000,
    });
    const result = calcTransferGain(input);

    expect(result.usedEstimated).toBe(true);
    expect(result.estimatedBase).toBe(900_000_000);
    expect(result.estimatedDeduction).toBe(9_000_000); // 300,000,000 × 3%
    expect(result.necessaryExpenseMode).toBe("estimated_with_deduction");
    expect(result.expenses).toBe(9_000_000); // 개산공제만
    expect(result.gain).toBe(1_200_000_000 - 900_000_000 - 9_000_000); // 291,000,000
  });

  it("SC-2: similarSalesValue 미입력 시 acquisitionPrice fallback (개산공제는 동일)", () => {
    const input = baseTransferInput({
      transferPrice: 1_000_000_000,
      acquisitionMethod: "salesCase",
      acquisitionPrice: 600_000_000,
      standardPriceAtAcquisition: 200_000_000,
    });
    const result = calcTransferGain(input);

    expect(result.estimatedBase).toBe(600_000_000);
    expect(result.estimatedDeduction).toBe(6_000_000); // 200,000,000 × 3%
    expect(result.gain).toBe(1_000_000_000 - 600_000_000 - 6_000_000); // 394,000,000
  });

  it("SC-3: 동일 금액일 때 salesCase 와 appraisal 의 양도차익·개산공제 동치", () => {
    const common = {
      transferPrice: 1_000_000_000,
      standardPriceAtAcquisition: 300_000_000,
    } as const;
    const sc = calcTransferGain(
      baseTransferInput({
        ...common,
        acquisitionMethod: "salesCase",
        similarSalesValue: 700_000_000,
      }),
    );
    const ap = calcTransferGain(
      baseTransferInput({
        ...common,
        acquisitionMethod: "appraisal",
        appraisalValue: 700_000_000,
      }),
    );
    expect(sc.gain).toBe(ap.gain);
    expect(sc.estimatedDeduction).toBe(ap.estimatedDeduction);
    expect(sc.estimatedBase).toBe(ap.estimatedBase);
  });
});
