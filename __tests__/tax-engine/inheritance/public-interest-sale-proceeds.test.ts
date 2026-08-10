/**
 * 공익법인등 출연재산 **매각대금** 사후관리 추징 — 상증법 §48②4호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * · **법 §48②4호** — 「출연받은 재산을 매각하고 그 매각대금을 매각한 날부터 3년이 지난 날까지
 *   **대통령령으로 정하는 바에 따라** 사용하지 아니한 경우」
 * · **상증령 §38④** — 위 「대통령령으로 정하는 바」:
 *   「**매각한 날이 속하는 과세기간 또는 사업연도의 종료일부터 3년 이내**에 매각대금 중 직접
 *    공익목적사업에 사용한 실적(…재산을 취득한 경우를 포함…)이 **매각대금의 100분의 90에 미달**
 *    하는 경우」
 * · **상증령 §40①3호** — 과세가액
 *   가목: 「사용기준금액 × (공익목적사업외에 사용한 금액 / 매각대금)」
 *   나목: 「당해 **미달사용금액**」
 * · **법 §55②** — 「과세표준이 50만원 미만이면 증여세를 부과하지 아니한다」
 *
 * ## 이 파일이 고정하는 네 가지 — 전부 **§48②1호와 다른 축**이다
 *
 * 1. **기산점이 「매각한 날」이 아니다** (SP-1). 법 본문은 「매각한 날부터 3년」이라 읽히지만
 *    시행령이 「매각한 날이 **속하는 과세기간 종료일**부터 3년」으로 정했다. 12월 결산이면
 *    최대 1년 가까이 늦어진다. 1호(출연받은 **날**)를 그대로 베끼면 조용히 틀린다
 *    — 그래서 1호를 **양성 대조군**으로 같은 파일에서 함께 단언한다.
 * 2. **정량 기준(90%)이 있다** (SP-2). 1호는 「사용하지 아니한 재산의 가액」이라 정성 판정이다.
 * 3. **부득이한 사유 단서가 없다** (SP-4). 단서는 §48②1호에만 붙어 있고 상증령 §38③도
 *    「법 제48조제2항**제1호** 단서」를 정의한다. 근거 없이 4호로 넓히지 않는다.
 * 4. **§48②5호(1년 30%·2년 60%)는 가산세라 이 엔진이 계산하지 않는다** (SP-5).
 *
 * ## 🔑 §55② 과세최저한은 4호에서 **실제로 도달한다** (SP-6)
 *
 * 1호는 「미사용 재산의 가액」이라 보통 억 단위지만, 4호 나목의 과세가액은 **90% 기준 대비
 * 미달분**이라 수십만원이 나온다. 그래서 이 축은 4호에서 처음으로 세액을 가른다.
 */

import { describe, it, expect } from "vitest";
import {
  calcPublicInterestSaleProceeds,
  calcPublicInterestPostMgmt,
} from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestSaleProceedsInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

/** 매각대금 10억 · 2021-05-20 매각 · 12월 결산 · 2026-06-30 판정 */
const PROCEEDS = 1_000_000_000;
/** 상증령 §38④ — 매각대금의 90% */
const THRESHOLD = 900_000_000;

function mk(over: Partial<PublicInterestSaleProceedsInput> = {}): PublicInterestSaleProceedsInput {
  return {
    saleProceeds: PROCEEDS,
    saleDate: "2021-05-20",
    fiscalYearEndDate: "2021-12-31",
    assessmentDate: "2026-06-30",
    violation: "under_use_threshold",
    directUseAmount: 800_000_000,
    ...over,
  };
}

describe("SP-1 — 기산점은 「매각한 날」이 아니라 「매각한 날이 속하는 과세기간 종료일」 (상증령 §38④)", () => {
  it("12월 결산 법인: 2021-05-20 매각 → 기한은 2024-12-31 (❌ 2024-05-20 아님)", () => {
    const r = calcPublicInterestSaleProceeds(mk());
    expect(r.threeYearDeadline).toBe("2024-12-31");
    expect(r.threeYearDeadline).not.toBe("2024-05-20");
    expect(r.isAfterThreeYears).toBe(true);
  });

  it("🔑 결산일이 다르면 같은 매각일도 기한이 달라진다 (2월 결산 학교법인)", () => {
    const r = calcPublicInterestSaleProceeds(mk({ fiscalYearEndDate: "2022-02-28" }));
    expect(r.threeYearDeadline).toBe("2025-02-28");
  });

  it("⭐ 양성 대조군 — §48②1호는 「출연받은 **날**」 기산이라 같은 날짜에서 값이 갈린다", () => {
    // 같은 2021-05-20을 1호는 출연일로, 4호는 매각일로 받는다.
    const clause1 = calcPublicInterestPostMgmt({
      donatedValue: PROCEEDS,
      donationDate: "2021-05-20",
      assessmentDate: "2026-06-30",
      violation: "unused_within_3y",
      violatedValue: 100_000_000,
    });
    const clause4 = calcPublicInterestSaleProceeds(mk());

    expect(clause1.threeYearDeadline).toBe("2024-05-20"); // 날 기산
    expect(clause4.threeYearDeadline).toBe("2024-12-31"); // 과세기간 종료일 기산
    expect(clause1.threeYearDeadline).not.toBe(clause4.threeYearDeadline);
  });

  it("판정일이 아직 3년 이내면 확정되지 않았다는 경고가 붙는다", () => {
    const r = calcPublicInterestSaleProceeds(mk({ assessmentDate: "2024-06-30" }));
    expect(r.isAfterThreeYears).toBe(false);
    expect(r.warnings.some((w) => w.includes("3년 이내"))).toBe(true);
  });
});

describe("SP-2 — 나목: 과세가액은 「미달사용금액」 (상증령 §40①3호 나목)", () => {
  it("사용기준금액 = 매각대금 × 90%", () => {
    const r = calcPublicInterestSaleProceeds(mk());
    expect(r.useThreshold).toBe(THRESHOLD);
  });

  it("8억 사용 → 미달 1억 → 1억에 §56 누진세율", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: 800_000_000 }));
    expect(r.shortfall).toBe(100_000_000);
    expect(r.clawbackBase).toBe(100_000_000);
    expect(r.giftTax).toBe(calcInheritanceGiftTax(100_000_000));
    expect(r.giftTax).toBe(10_000_000); // 1억 × 10%
  });

  it("경계 — 정확히 90% 사용이면 추징 없다 (「미달」이 아니다)", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: THRESHOLD }));
    expect(r.shortfall).toBe(0);
    expect(r.isClawback).toBe(false);
    expect(r.giftTax).toBe(0);
  });

  it("🔑 과세가액은 **매각대금 전액**이 아니라 미달분이다", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: 800_000_000 }));
    expect(r.clawbackBase).not.toBe(PROCEEDS);
    expect(r.clawbackBase).not.toBe(THRESHOLD);
  });

  it("사용실적이 매각대금을 넘으면 매각대금으로 제한된다", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: PROCEEDS + 200_000_000 }));
    expect(r.shortfall).toBe(0);
    expect(r.warnings.some((w) => w.includes("초과"))).toBe(true);
  });
});

describe("SP-3 — 가목: 공익목적사업 외 사용분은 안분한다 (상증령 §40①3호 가목)", () => {
  it("사용기준금액 × (외부사용액 / 매각대금)", () => {
    const r = calcPublicInterestSaleProceeds(
      mk({ violation: "used_outside_purpose", outsideUseAmount: 200_000_000 }),
    );
    // 9억 × 2억/10억 = 1.8억
    expect(r.outsideUseTaxable).toBe(180_000_000);
    expect(r.clawbackBase).toBe(180_000_000);
    // 1.8억 × 20% − 누진공제 1천만 = 2,600만
    expect(r.giftTax).toBe(26_000_000);
  });

  it("🔑 가목을 고르면 나목(미달사용)은 계산하지 않는다 — §40①3호는 「각목의 **구분**에 따라」", () => {
    const r = calcPublicInterestSaleProceeds(
      mk({ violation: "used_outside_purpose", outsideUseAmount: 200_000_000, directUseAmount: 0 }),
    );
    expect(r.clawbackBase).toBe(180_000_000);
    expect(r.shortfall).toBe(0); // 나목 값이 섞여 들어오지 않는다
  });

  it("외부사용액이 매각대금 전액이면 안분액 = 사용기준금액", () => {
    const r = calcPublicInterestSaleProceeds(
      mk({ violation: "used_outside_purpose", outsideUseAmount: PROCEEDS }),
    );
    expect(r.outsideUseTaxable).toBe(THRESHOLD);
  });
});

describe("SP-4 — §48②1호 **단서**(부득이한 사유)는 4호에 없다", () => {
  it("결과 안내가 그 사실을 명시한다 (근거 없는 유리·불리 적용 금지)", () => {
    const r = calcPublicInterestSaleProceeds(mk());
    expect(r.warnings.some((w) => w.includes("단서"))).toBe(true);
  });
});

describe("SP-5 — §48②5호(1년 30%·2년 60%)는 가산세라 이 엔진이 계산하지 않는다", () => {
  it("안내에 5호·§78⑨를 구분해 남긴다", () => {
    const r = calcPublicInterestSaleProceeds(mk());
    expect(r.warnings.some((w) => w.includes("5호"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("가산세"))).toBe(true);
  });

  it("이자상당액을 가산하지 않는다 — 세액이 §56 산출액과 정확히 같다", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: 700_000_000 }));
    expect(r.giftTax).toBe(calcInheritanceGiftTax(200_000_000));
  });
});

describe("SP-6 — §55② 과세최저한 50만원", () => {
  it("미달 40만원 → 위반은 성립하지만 세액은 0", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: THRESHOLD - 400_000 }));
    expect(r.shortfall).toBe(400_000);
    expect(r.isClawback).toBe(true);
    expect(r.belowMinimumTaxBase).toBe(true);
    expect(r.taxBase).toBe(0);
    expect(r.giftTax).toBe(0);
  });

  it("경계 — 미달 50만원은 「50만원 미만」이 아니므로 과세된다", () => {
    const r = calcPublicInterestSaleProceeds(mk({ directUseAmount: THRESHOLD - 500_000 }));
    expect(r.shortfall).toBe(500_000);
    expect(r.belowMinimumTaxBase).toBe(false);
    expect(r.giftTax).toBe(50_000); // 50만 × 10%
  });

  it("⭐ 같은 축이 §48②1호에도 적용된다 (누락 정정)", () => {
    const r = calcPublicInterestPostMgmt({
      donatedValue: 1_000_000_000,
      donationDate: "2021-03-01",
      assessmentDate: "2025-06-30",
      violation: "unused_within_3y",
      violatedValue: 400_000,
    });
    expect(r.taxBase).toBe(0);
    expect(r.giftTax).toBe(0);
  });
});

describe("SP-7 — 위반 유형 라벨이 상증령 §40①3호 각 목과 대응한다", () => {
  it.each([
    ["used_outside_purpose", /가목/],
    ["under_use_threshold", /나목/],
  ] as const)("%s → %s", (violation, pattern) => {
    const r = calcPublicInterestSaleProceeds(mk({ violation, outsideUseAmount: 100_000_000 }));
    expect(r.steps[0].formula).toMatch(pattern);
  });
});
