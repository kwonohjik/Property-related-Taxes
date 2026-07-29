/**
 * 감사 확정 결함 회귀 테스트
 * ref: lib/tax-engine/exemption-evaluator.ts:59 (금양임야)·76 (묘토)
 *
 * 결함: 금양임야·묘토 면적 안분에서 exemptRatio = limitM2 / claimedM2 를 float으로
 * 먼저 나눈 뒤 Math.floor(claimedAmount × ratio)로 곱해, 정확값이 정수여도 IEEE-754
 * 표현오차로 비과세액이 1원 과소(과세 1원 과다) 산정된다.
 * 수정: safeMultiplyThenDivide(claimedAmount, limitM2, claimedM2) — 정수 곱 후 floor(÷).
 *
 * 기대값은 상증령 §8③ 면적 안분식 floor(claimedAmount × limitM2 / claimedM2)에서
 * 정수 산술로 독립 도출(엔진 출력 복사 아님):
 *   금양임야: 2,704,770 × 9,900 / 36,531 = 26,777,223,000 / 36,531 = 733,000 (정확)
 *   묘토:     3,017,997 × 1,980 / 47,230 = 5,975,634,060 / 47,230 = 126,522 (정확)
 * 현행 float 경로는 각각 732,999 / 126,521 (1원 과소).
 */
import { describe, it, expect } from "vitest";
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";

// 클램프(min(total, grossEstate)) 미발동을 위한 충분히 큰 재산총액
const HUGE_ESTATE = 100_000_000_000;

describe("audit-fix: exemption-evaluator 면적 안분 정수 절사 (상증령 §8③)", () => {
  it("금양임야 초과분 안분 — 정확값 733,000 (float 경로의 732,999 아님)", () => {
    const res = evaluateExemptions(
      [
        {
          ruleId: "inh_forest_burial",
          claimedAmount: 2_704_770,
          claimedAreaM2: 36_531, // > 9,900㎡ 한도 → 안분
        },
      ],
      HUGE_ESTATE,
    );
    const item = res.itemResults[0];
    // floor(2,704,770 × 9,900 / 36,531) = 733,000
    expect(item.exemptAmount).toBe(733_000);
    // taxableOverflow = claimedAmount − exemptAmount (총액 보존)
    expect(item.taxableOverflow).toBe(2_704_770 - 733_000);
    expect(item.exemptAmount + item.taxableOverflow).toBe(2_704_770);
  });

  it("묘토 초과분 안분 — 정확값 126,522 (float 경로의 126,521 아님)", () => {
    const res = evaluateExemptions(
      [
        {
          ruleId: "inh_grave_land",
          claimedAmount: 3_017_997,
          claimedAreaM2: 47_230, // > 1,980㎡ 한도 → 안분
        },
      ],
      HUGE_ESTATE,
    );
    const item = res.itemResults[0];
    // floor(3,017,997 × 1,980 / 47,230) = 126,522
    expect(item.exemptAmount).toBe(126_522);
    expect(item.taxableOverflow).toBe(3_017_997 - 126_522);
    expect(item.exemptAmount + item.taxableOverflow).toBe(3_017_997);
  });

  it("회귀 무발생 — 정확히 나누어떨어지는 입력은 양 경로 동일 (100,000,000)", () => {
    const res = evaluateExemptions(
      [
        {
          ruleId: "inh_forest_burial",
          claimedAmount: 300_000_000,
          claimedAreaM2: 29_700, // = 9,900 × 3 → 정확히 1/3
        },
      ],
      HUGE_ESTATE,
    );
    const item = res.itemResults[0];
    // floor(300,000,000 × 9,900 / 29,700) = 100,000,000
    expect(item.exemptAmount).toBe(100_000_000);
    expect(item.taxableOverflow).toBe(200_000_000);
  });

  it("한도 이내(안분 미발동) — 전액 비과세 유지", () => {
    const res = evaluateExemptions(
      [
        {
          ruleId: "inh_grave_land",
          claimedAmount: 5_000_000,
          claimedAreaM2: 1_500, // < 1,980㎡ 한도
        },
      ],
      HUGE_ESTATE,
    );
    const item = res.itemResults[0];
    expect(item.exemptAmount).toBe(5_000_000);
    expect(item.taxableOverflow).toBe(0);
  });
});
