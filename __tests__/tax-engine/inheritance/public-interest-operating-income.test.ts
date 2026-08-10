/**
 * 공익법인등 **운용소득 목적 외 사용** 증여세 추징 — 상증법 §48②3호
 *
 * ## 법령 (2026-08-10 실측)
 *
 * · **법 §48②3호** — 「출연받은 재산을 수익용 또는 수익사업용으로 운용하는 경우로서 그
 *   **운용소득을 직접 공익목적사업 외에 사용**한 경우」 → 증여세
 * · **상증령 §40①2의2호** — 과세가액:
 *   「재정경제부령이 정하는 출연재산(직접공익목적사업에 사용한 분을 제외한다)의 **평가가액**
 *    × (**공익목적사업외에 사용한 금액** ÷ 제38조제5항의 규정에 의한 **운용소득**)」
 * · **상증칙 §13②** — 위 「평가가액」이란 「운용소득을 사용하여야 할 과세기간·사업연도의
 *   **직전** 과세기간·사업연도 **말 현재** 수익용이나 수익사업용으로 운용하는 …출연받은 재산의
 *   **재무상태표상 가액**」. **다만 그 가액이 법 제4장에 따라 평가한 가액의 100분의 70 이하이면
 *   법 제4장 평가액**으로 한다.
 * · **상증칙 §13③** — 「제2항에 따른 출연재산 중 공익법인등이 **1년 이상 보유한 주식등**의
 *   평가가액은 제2항에도 불구하고 **그 액면가액**으로 한다」
 * · **집행기준 48-40-1 ③** — 「직접공익목적사업에 사용하지 않은 출연재산의 평가가액 ×
 *   (공익목적사업 외에 사용한 금액 ÷ 운용소득)」
 *
 * ## 이 파일이 고정하는 세 함정
 *
 * 1. **분자는 「운용소득 중 외부사용액」이지만 곱하는 대상은 「출연재산 평가가액」이다** (OI-1).
 *    운용소득에 비율을 곱하는 게 아니다 — 소득의 몇 배가 과세될 수 있다.
 * 2. **70% 단서는 「이하」다** (OI-2). 경계에서 발동해 평가가액이 뛴다.
 * 3. ⭐ **1년 이상 보유 주식등은 「액면가액」** (OI-3). 시가·장부가가 아니다 — 상증칙 §13③이
 *    §13②을 명시적으로 배제한다. 놓치면 평가가액이 통째로 틀린다.
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestOperatingIncome } from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestOperatingIncomeInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

/** 운용소득 2억 중 5천만을 목적 외 사용 · 출연재산 재무상태표 40억 / 제4장 50억 */
function mk(
  over: Partial<PublicInterestOperatingIncomeInput> = {},
): PublicInterestOperatingIncomeInput {
  return {
    operatingIncome: 200_000_000,
    outsideUseAmount: 50_000_000,
    bookValue: 4_000_000_000,
    chapter4Value: 5_000_000_000,
    ...over,
  };
}

describe("OI-1 — 상증령 §40①2의2호 산식", () => {
  it("과세가액 = 출연재산 평가가액 × (외부사용액 ÷ 운용소득)", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    // 40억 × (5천만 ÷ 2억) = 40억 × 0.25 = 10억
    expect(r.assetValue).toBe(4_000_000_000);
    expect(r.clawbackBase).toBe(1_000_000_000);
    expect(r.giftTax).toBe(calcInheritanceGiftTax(1_000_000_000));
    expect(r.giftTax).toBe(240_000_000); // 10억 × 30% − 누진공제 6천만
  });

  it("🔑 운용소득에 비율을 곱하는 게 아니다 — 과세가액이 **운용소득보다 클 수 있다**", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    expect(r.clawbackBase).toBeGreaterThan(200_000_000); // 운용소득 2억
    expect(r.clawbackBase).not.toBe(50_000_000); // 외부사용액 그 자체도 아니다
  });

  it("외부사용액이 0이면 추징 없음", () => {
    const r = calcPublicInterestOperatingIncome(mk({ outsideUseAmount: 0 }));
    expect(r.clawbackBase).toBe(0);
    expect(r.isClawback).toBe(false);
    expect(r.giftTax).toBe(0);
  });

  it("외부사용액이 운용소득을 넘으면 운용소득으로 제한된다 (비율 ≤ 1)", () => {
    const r = calcPublicInterestOperatingIncome(mk({ outsideUseAmount: 300_000_000 }));
    expect(r.cappedOutsideUse).toBe(200_000_000);
    expect(r.clawbackBase).toBe(4_000_000_000); // 비율 1 → 평가가액 전액
    expect(r.warnings.some((w) => w.includes("초과"))).toBe(true);
  });

  it("운용소득이 0 이하면 산식이 성립하지 않는다 (0으로 나누지 않는다)", () => {
    const r = calcPublicInterestOperatingIncome(mk({ operatingIncome: 0 }));
    expect(r.clawbackBase).toBe(0);
    expect(r.giftTax).toBe(0);
    expect(r.warnings.some((w) => w.includes("운용소득"))).toBe(true);
  });
});

describe("OI-2 — 상증칙 §13② 단서: 재무상태표상 가액 ≤ 제4장 평가액의 70%", () => {
  it("70%를 넘으면 재무상태표상 가액을 그대로 쓴다", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    // 40억 > 50억 × 70% = 35억
    expect(r.chapter4ClauseApplied).toBe(false);
    expect(r.assetValue).toBe(4_000_000_000);
  });

  it("70% 이하이면 **제4장 평가액**으로 대체된다", () => {
    const r = calcPublicInterestOperatingIncome(mk({ bookValue: 3_000_000_000 }));
    expect(r.chapter4ClauseApplied).toBe(true);
    expect(r.assetValue).toBe(5_000_000_000);
    // 50억 × 0.25 = 12.5억 → 12.5억 × 40% − 1.6억
    expect(r.clawbackBase).toBe(1_250_000_000);
    expect(r.giftTax).toBe(340_000_000);
  });

  it("🔑 경계 — 정확히 70%는 「100분의 70 **이하**」라 단서가 발동한다", () => {
    const r = calcPublicInterestOperatingIncome(mk({ bookValue: 3_500_000_000 }));
    expect(r.chapter4ClauseApplied).toBe(true);
    expect(r.assetValue).toBe(5_000_000_000);
  });

  it("제4장 평가액을 모르면 단서를 적용하지 않고 그 사실을 경고한다", () => {
    const r = calcPublicInterestOperatingIncome(mk({ chapter4Value: undefined }));
    expect(r.chapter4ClauseApplied).toBe(false);
    expect(r.assetValue).toBe(4_000_000_000);
    expect(r.warnings.some((w) => w.includes("제4장"))).toBe(true);
  });
});

describe("OI-3 — ⭐ 상증칙 §13③: 1년 이상 보유 주식등은 **액면가액**", () => {
  it("주식 액면가액이 평가가액에 더해진다 (§13②의 재무상태표가액과 별도)", () => {
    const r = calcPublicInterestOperatingIncome(mk({ longHeldStockParValue: 1_000_000_000 }));
    expect(r.longHeldStockParValue).toBe(1_000_000_000);
    expect(r.assetValue).toBe(5_000_000_000); // 40억 + 10억
    expect(r.clawbackBase).toBe(1_250_000_000); // 50억 × 0.25
  });

  it("🔑 70% 단서는 **주식을 뺀 부분**에만 걸린다 (§13③이 §13②을 배제한다)", () => {
    // 비주식 30억(≤ 50억×70%) → 제4장 50억으로 대체, 주식 액면 10억은 그대로 가산
    const r = calcPublicInterestOperatingIncome(
      mk({ bookValue: 3_000_000_000, longHeldStockParValue: 1_000_000_000 }),
    );
    expect(r.chapter4ClauseApplied).toBe(true);
    expect(r.assetValue).toBe(6_000_000_000); // 50억 + 10억
  });

  it("주식이 없으면 0으로 취급된다 (양성 대조군 — 필드 부재가 값을 바꾸지 않는다)", () => {
    const withZero = calcPublicInterestOperatingIncome(mk({ longHeldStockParValue: 0 }));
    const without = calcPublicInterestOperatingIncome(mk());
    expect(withZero.assetValue).toBe(without.assetValue);
  });
});

describe("OI-4 — 세목·인접 조문과 섞이지 않는다", () => {
  it("⭐ 3호에는 90% 사용기준이 없다 — 그건 §48②4호(매각대금)다", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    // 평가가액이 90%로 깎이지 않는다
    expect(r.assetValue).toBe(4_000_000_000);
    expect(r.assetValue).not.toBe(3_600_000_000);
  });

  it("⭐ 「운용소득 미달사용」(§48②5호 가산세)과 다른 사유다 — 안내로 구분한다", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    expect(r.warnings.some((w) => w.includes("5호"))).toBe(true);
  });

  it("§55② 과세최저한(50만원)이 적용된다 (증여세이므로)", () => {
    const r = calcPublicInterestOperatingIncome({
      operatingIncome: 1_000_000,
      outsideUseAmount: 100_000,
      bookValue: 1_000_000,
    });
    expect(r.clawbackBase).toBe(100_000); // 100만 × 0.1
    expect(r.belowMinimumTaxBase).toBe(true);
    expect(r.giftTax).toBe(0);
  });

  it("이자상당액을 가산하지 않는다", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    expect(r.giftTax).toBe(calcInheritanceGiftTax(r.taxBase));
  });
});

describe("OI-5 — 산출 근거에 조문이 남는다", () => {
  it("§40①2의2호와 상증칙 §13이 근거로 표시된다", () => {
    const r = calcPublicInterestOperatingIncome(mk());
    const bases = r.steps.map((s) => s.legalBasis).join(" ");
    expect(bases).toMatch(/§40①2의2호/);
    expect(bases).toMatch(/§13/);
  });
});
