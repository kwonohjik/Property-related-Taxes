/**
 * 공익법인등 **운용 의무 위반** 증여세 추징 — 상속세 및 증여세법 §48②8호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * · **법 §48②8호** — 「그 밖에 출연받은 재산 및 직접 공익목적사업을 **대통령령으로 정하는
 *   바에 따라 운용하지 아니하는 경우**」
 * · **상증령 §38⑧** — 위 「대통령령으로 정하는 바」 두 갈래:
 *     **1호** 「공익법인등이 **사업을 종료한 때의 잔여재산**을 국가ㆍ지방자치단체 또는 해당
 *       공익법인등과 동일하거나 주무부장관이 유사한 것으로 인정하는 공익법인등에 **귀속시키지
 *       아니한 때**」
 *     **2호** 「직접 공익목적사업에 사용하는 것이 사회적 지위ㆍ직업ㆍ근무처 및 출생지 등에
 *       의하여 **일부에게만 혜택을 제공**하는 것인 때. **다만**, 주무부장관이 재정경제부장관과
 *       **협의**하여 따로 **수혜자의 범위를 정하여** 이를 다음 각 목의 어느 하나에 해당하는
 *       **조건으로 한 경우를 제외**한다.
 *         가. 해당 공익법인등의 **설립허가의 조건**으로 붙인 경우
 *         나. …재산을 추가출연함에 따라 **정관의 변경허가**를 받는 경우로서 그 **변경허가조건**
 *            으로 붙인 경우」
 * · **상증령 §40①4호** — §38⑧1호: 「…귀속시키지 아니한 **재산가액**」
 * · **상증령 §40①5호** — §38⑧2호 **본문**: 「혜택을 받은 일부에게만 제공된 **재산가액 또는
 *   경제적 이익에 상당하는 가액**」
 * · **집행기준 48-40-1 ⑤⑥** — 위 두 가액과 일치
 *
 * ## 이 파일이 고정하는 두 가지
 *
 * 1. **단서는 2호에만 붙는다** (OV-3). §40①5호가 「제38조제8항제2호 **본문**의 규정에 해당하게
 *    되는 경우」라고 못박아, 단서에 해당하면 애초에 8호가 성립하지 않는다. 1호(잔여재산)에는
 *    단서가 없다 — 근거 없이 넓히지 않는다.
 * 2. **단서는 3요건을 모두** 갖춰야 한다 (OV-3). ① 주무부장관이 재정경제부장관과 **협의**
 *    ② 따로 **수혜자의 범위를 정함** ③ **가목(설립허가) 또는 나목(정관 변경허가) 조건으로 붙임**.
 *    §48②1호 단서와 같은 구조다.
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestOperationViolation } from "@/lib/tax-engine/deductions/public-interest-operation-violation";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestOperationViolationInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

function mk(
  over: Partial<PublicInterestOperationViolationInput> = {},
): PublicInterestOperationViolationInput {
  return {
    violation: "residual_not_transferred",
    unTransferredResidualValue: 500_000_000,
    ...over,
  };
}

describe("OV-1 — §38⑧1호: 사업 종료 시 잔여재산 미귀속 (상증령 §40①4호)", () => {
  it("과세가액 = 귀속시키지 아니한 재산가액", () => {
    const r = calcPublicInterestOperationViolation(mk());
    expect(r.clawbackBase).toBe(500_000_000);
    expect(r.giftTax).toBe(calcInheritanceGiftTax(500_000_000));
    expect(r.giftTax).toBe(90_000_000); // 5억 × 20% − 누진공제 1천만
  });

  it("0이면 추징 없음", () => {
    const r = calcPublicInterestOperationViolation(mk({ unTransferredResidualValue: 0 }));
    expect(r.isClawback).toBe(false);
    expect(r.giftTax).toBe(0);
  });

  it("근거가 §38⑧1호·§40①4호로 표시된다", () => {
    const r = calcPublicInterestOperationViolation(mk());
    const all = r.steps.map((s) => `${s.formula} ${s.legalBasis}`).join(" ");
    expect(all).toMatch(/§38⑧1호/);
    expect(all).toMatch(/§40①4호/);
  });
});

describe("OV-2 — §38⑧2호: 일부에게만 혜택 제공 (상증령 §40①5호)", () => {
  const base = mk({
    violation: "benefit_to_limited_group",
    limitedBenefitValue: 300_000_000,
  });

  it("과세가액 = 혜택을 받은 일부에게만 제공된 재산가액 또는 경제적 이익 상당액", () => {
    const r = calcPublicInterestOperationViolation(base);
    expect(r.clawbackBase).toBe(300_000_000);
    expect(r.giftTax).toBe(50_000_000); // 3억 × 20% − 1천만
  });

  it("근거가 §38⑧2호·§40①5호로 표시된다", () => {
    const r = calcPublicInterestOperationViolation(base);
    const all = r.steps.map((s) => `${s.formula} ${s.legalBasis}`).join(" ");
    expect(all).toMatch(/§38⑧2호/);
    expect(all).toMatch(/§40①5호/);
  });

  it("🔑 유형은 택일이다 — 선택하지 않은 유형의 금액이 섞이지 않는다", () => {
    const r = calcPublicInterestOperationViolation({
      violation: "benefit_to_limited_group",
      limitedBenefitValue: 300_000_000,
      unTransferredResidualValue: 900_000_000, // 무시돼야 한다
    });
    expect(r.clawbackBase).toBe(300_000_000);
  });
});

describe("OV-3 — §38⑧2호 **단서**는 3요건을 모두 갖춰야 한다", () => {
  const base = mk({
    violation: "benefit_to_limited_group",
    limitedBenefitValue: 300_000_000,
  });

  it("협의 + 수혜자 범위 지정 + 가목(설립허가 조건) → 제외", () => {
    const r = calcPublicInterestOperationViolation({
      ...base,
      approvedBeneficiaryScope: {
        consulted: true,
        scopeDefined: true,
        conditionType: "establishment_permit",
      },
    });
    expect(r.isClawback).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.giftTax).toBe(0);
    expect(r.exemptReason).toMatch(/단서/);
  });

  it("협의 + 수혜자 범위 지정 + 나목(정관 변경허가 조건) → 제외", () => {
    const r = calcPublicInterestOperationViolation({
      ...base,
      approvedBeneficiaryScope: {
        consulted: true,
        scopeDefined: true,
        conditionType: "articles_amendment_permit",
      },
    });
    expect(r.isClawback).toBe(false);
  });

  it("❌ 협의가 없으면 제외되지 않는다", () => {
    const r = calcPublicInterestOperationViolation({
      ...base,
      approvedBeneficiaryScope: {
        consulted: false,
        scopeDefined: true,
        conditionType: "establishment_permit",
      },
    });
    expect(r.isClawback).toBe(true);
    expect(r.giftTax).toBeGreaterThan(0);
  });

  it("❌ 수혜자 범위를 따로 정하지 않았으면 제외되지 않는다", () => {
    const r = calcPublicInterestOperationViolation({
      ...base,
      approvedBeneficiaryScope: {
        consulted: true,
        scopeDefined: false,
        conditionType: "establishment_permit",
      },
    });
    expect(r.isClawback).toBe(true);
  });

  it("❌ 가목·나목 조건으로 붙이지 않았으면 제외되지 않는다", () => {
    const r = calcPublicInterestOperationViolation({
      ...base,
      approvedBeneficiaryScope: { consulted: true, scopeDefined: true, conditionType: "none" },
    });
    expect(r.isClawback).toBe(true);
  });

  it("⭐ 단서는 **2호에만** 붙는다 — 1호(잔여재산)에 넣어도 제외되지 않는다", () => {
    const r = calcPublicInterestOperationViolation({
      violation: "residual_not_transferred",
      unTransferredResidualValue: 500_000_000,
      approvedBeneficiaryScope: {
        consulted: true,
        scopeDefined: true,
        conditionType: "establishment_permit",
      },
    });
    expect(r.isClawback).toBe(true);
    expect(r.clawbackBase).toBe(500_000_000);
    expect(r.exemptReason).toBeUndefined();
  });
});

describe("OV-4 — 증여세 공통 규칙", () => {
  it("§55② 과세최저한(50만원)이 적용된다", () => {
    const r = calcPublicInterestOperationViolation(mk({ unTransferredResidualValue: 400_000 }));
    expect(r.clawbackBase).toBe(400_000);
    expect(r.belowMinimumTaxBase).toBe(true);
    expect(r.giftTax).toBe(0);
  });

  it("이자상당액을 가산하지 않는다", () => {
    const r = calcPublicInterestOperationViolation(mk());
    expect(r.giftTax).toBe(calcInheritanceGiftTax(r.taxBase));
    expect(r.warnings.some((w) => w.includes("이자상당액"))).toBe(true);
  });

  it("§38⑨(불법행위·분실·도난 감소분 차감)은 입력 안내로 남긴다", () => {
    const r = calcPublicInterestOperationViolation(mk());
    expect(r.warnings.some((w) => w.includes("§38⑨"))).toBe(true);
  });
});
