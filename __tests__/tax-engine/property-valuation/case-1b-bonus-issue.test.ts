/**
 * PR-D 후속 anchor — 무상증자 환산식 별도 검증
 *
 * 검증 대상 (계획서 §3 PR-D + 디자인 §1 BI-1):
 *   BI-1 무상증자 단독 (free_issue) → §56⑤ 순손익액 조정 = 0
 *
 * 법령 근거:
 *   상증령 §56③: "평가기준일이 속하는 사업연도 이전 3년 이내에 증자 또는 감자를 한 사실이
 *               있는 경우에는 증자 또는 감자전의 각 사업연도 종료일 현재의 발행주식총수는
 *               재정경제부령으로 정하는 바에 따른다."
 *   상증령 §56⑤: 유상증자·유상감자의 순손익액 조정 (★ 유상만 적용 — 무상증자는 미적용)
 *   상증규 §17의3⑤: "증자 또는 감자" 통합 환산식 — 환산주식수에는 무상증자 포함
 *
 * 결론:
 *   - §56③ + §17의3⑤ 환산주식수: 무상증자 포함 (paid_in·free_issue·capital_reduction 동일 처리)
 *   - §56⑤ 순손익액 조정: 유상증자·유상감자만 적용. 무상증자는 미적용 (납입금액 0이므로 산식상 0)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §3 PR-D
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1 BI-1
 */

import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAdjustment } from "@/lib/tax-engine/property-valuation/capital-increase-adjustment";

// ============================================================
// BI-1 — 무상증자 단독 (§56⑤ 미적용)
// ============================================================

describe("[BI-1] 무상증자 단독 — §56⑤ 순손익액 조정 미적용", () => {
  it("BI-1a: 무상증자 50,000주 (납입금액 X) → 조정액 [0, 0, 0]", () => {
    // 사례 1 유상증자 입력값을 무상증자로 변경
    const adj = calcCapitalIncreaseAdjustment(
      [
        {
          changeType: "free_issue", // 무상증자
          changeDate: new Date("2021-06-30"),
          sharesIssued: 50_000,
          // pricePerShare 미지정 (무상이므로 0)
        },
      ],
      [
        new Date("2021-12-31"), // 1년전
        new Date("2020-12-31"), // 2년전
        new Date("2019-12-31"), // 3년전
      ],
      0.10,
    );

    // 무상증자는 §56⑤ 미적용 — 3개년 모두 조정액 0
    expect(adj[0]).toBe(0);
    expect(adj[1]).toBe(0);
    expect(adj[2]).toBe(0);
  });

  it("BI-1b: 무상증자 + pricePerShare 명시 (실수 입력) → 여전히 조정 0", () => {
    // 사용자가 무상증자에 잘못 pricePerShare를 명시한 경우에도 changeType 가드로 무시
    const adj = calcCapitalIncreaseAdjustment(
      [
        {
          changeType: "free_issue",
          changeDate: new Date("2021-06-30"),
          sharesIssued: 50_000,
          pricePerShare: 5_000, // 무상증자엔 무의미한 입력
        },
      ],
      [
        new Date("2021-12-31"),
        new Date("2020-12-31"),
        new Date("2019-12-31"),
      ],
      0.10,
    );

    // changeType !== "paid_in" && !== "capital_reduction" 가드로 무시
    expect(adj[0]).toBe(0);
    expect(adj[1]).toBe(0);
    expect(adj[2]).toBe(0);
  });

  it("BI-1c 비교: 동일 50,000주를 유상증자로 변경 시 조정액 발생 (사례 1 정합)", () => {
    // 비교용 — 유상증자(paid_in) + 납입금액 5,000원 → 조정 발생 확인
    const adj = calcCapitalIncreaseAdjustment(
      [
        {
          changeType: "paid_in",
          changeDate: new Date("2021-06-30"),
          sharesIssued: 50_000,
          pricePerShare: 5_000,
        },
      ],
      [
        new Date("2021-12-31"),
        new Date("2020-12-31"),
        new Date("2019-12-31"),
      ],
      0.10,
    );

    // 사례 1 anchor (case-4-integration.test.ts) 동일:
    // 2021 (6개월 월할): 50,000 × 5,000 × 10% × 6/12 = 12,500,000
    expect(adj[0]).toBe(12_500_000);
    // 2020·2019 (1년 full): 50,000 × 5,000 × 10% = 25,000,000
    expect(adj[1]).toBe(25_000_000);
    expect(adj[2]).toBe(25_000_000);
  });

  it("BI-1d: 유상감자 (capital_reduction)는 음수 조정 발생", () => {
    // 유상감자 — capital_reduction은 §56⑤에 적용 (음수 부호)
    const adj = calcCapitalIncreaseAdjustment(
      [
        {
          changeType: "capital_reduction",
          changeDate: new Date("2021-06-30"),
          sharesIssued: 10_000,
          pricePerShare: 5_000,
        },
      ],
      [
        new Date("2021-12-31"),
        new Date("2020-12-31"),
        new Date("2019-12-31"),
      ],
      0.10,
    );

    // 2021 (6개월 월할): −10,000 × 5,000 × 10% × 6/12 = −2,500,000
    expect(adj[0]).toBe(-2_500_000);
    // 2020·2019: −10,000 × 5,000 × 10% = −5,000,000
    expect(adj[1]).toBe(-5_000_000);
    expect(adj[2]).toBe(-5_000_000);
  });
});
