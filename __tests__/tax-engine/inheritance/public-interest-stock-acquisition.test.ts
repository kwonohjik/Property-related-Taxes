/**
 * 공익법인등 **주식등 취득 시 보유비율 초과** 증여세 추징 — 상증법 §48②2호
 *
 * ## 법령 (2026-08-10 실측 · 계획서 `docs/02-design/features/public-interest-48-2-2-stock-acquisition.plan.md`)
 *
 * · **법 §48②2호** — 「출연받은 재산(…운용소득 포함) 및 출연받은 재산의 매각대금을 내국법인의
 *   주식등을 **취득하는 데 사용**하는 경우로서 그 취득하는 주식등과 다음 각 목의 주식등을 합한
 *   것이 그 내국법인의 의결권 있는 발행주식총수등의 **제16조제2항제2호에 따른 비율을 초과**하는
 *   경우. 다만, 제16조제3항**제1호 또는 제3호**에 해당하는 경우(이 경우 "출연"은 "취득"으로
 *   본다)와 …**산학협력단**이 주식등을 취득하는 경우로서 대통령령으로 정하는 요건을 갖춘 경우는
 *   제외한다.
 *     가. **취득 당시** 해당 공익법인등이 보유하고 있는 동일한 내국법인의 주식등
 *     나. **해당 내국법인과 특수관계에 있는 출연자**가 해당 공익법인등 외의 다른 공익법인등에
 *        출연한 동일한 내국법인의 주식등
 *     다. **해당 내국법인과 특수관계에 있는 출연자**로부터 재산을 출연받은 다른 공익법인등이
 *        보유하고 있는 동일한 내국법인의 주식등」
 * · **법 §16②2호** — 원칙 **10%** / 가목(①의결권 미행사 ②자선·장학·사회복지 목적) **20%** /
 *   나목(상호출자제한기업집단 특수관계) **5%** / 다목(§48⑪ 요건 미충족) **5%**
 * · **상증령 §37①** — 초과부분 계산 **기준일**: 1호 매매·출연=취득일 / 2호 유상증자·4호 합병=
 *   주주명부 폐쇄일·권리행사 기준일 / 3호 감자=감자 주주총회결의일이 속하는 연도의 주주명부폐쇄일
 * · **상증령 §37⑥** — 산학협력단 단서 **3요건**
 * · **상증령 §40①2호** — 과세가액 = 「그 **초과부분을 취득하는데 사용한 재산의 가액**」
 * · **상증칙 §13①** — 그 가액 **산정이 곤란한 경우** → 초과분의 **법 §60~§66 평가액**
 *
 * ## ⭐ 이 파일이 고정하는 세 가지
 *
 * 1. **과세 단위는 「추가로 취득하는 주식」이다** (SA-2). 합산분(가·나·다목)만으로 이미 한도를
 *    넘었더라도 **취득하지 않은 주식에는 과세할 수 없다** — 과세가액이 「취득하는데 **사용한**
 *    재산의 가액」이기 때문이다. ⇒ `taxableShares = min(초과주식수, 이번 취득주식수)`.
 *    근거 4건은 계획서 §5.1 (법 §48②2호 본문 · 상증령 §40①2호 · 집행기준 48-40-1 ⑧ ·
 *    국세청 서면법규과-557).
 * 2. **과세가액은 취득자금이지 평가액이 아니다** (SA-1). 1·3·4·6·8호는 전부 「재산의 가액」
 *    (평가액)이었다. 2호만 다르다 — 「초과 주식수 × 주당 **평가액**」으로 계산하면 틀린다.
 * 3. **나목·다목이 가목을 이긴다** (SA-3). §16②2호가목 괄호가 「나목 또는 다목에 해당하는
 *    공익법인등은 제외한다」라고 명시한다 — 가목 요건을 다 갖춰도 나목이면 20%가 아니라 5%다.
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestStockAcquisition } from "@/lib/tax-engine/deductions/public-interest-stock-acquisition";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestStockAcquisitionInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

/** 발행 100만주 · 이번 취득 5만주(취득가액 10억 → 주당 2만원) · 가목 보유 8만주 · 원칙 10% */
function mk(
  over: Partial<PublicInterestStockAcquisitionInput> = {},
): PublicInterestStockAcquisitionInput {
  return {
    acquisitionForm: "purchase_or_donation",
    assessmentDate: "2025-04-10",
    totalShares: 1_000_000,
    acquiredShares: 50_000,
    heldSharesAtAcquisition: 80_000,
    otherCorpDonatedShares: 0,
    otherCorpHeldShares: 0,
    holdingRatio: {
      isMutualInvestmentRestrictedGroup: false,
      failsClause11Requirements: false,
      noVotingRights: false,
      isCharityPurpose: false,
    },
    acquisitionCost: 1_000_000_000,
    ...over,
  };
}

describe("SA-1 — 상증령 §40①2호: 과세가액은 「초과부분을 취득하는데 사용한 재산의 가액」", () => {
  it("한도 10만주 · 합산 13만주 → 초과 3만주 → 취득가액 중 3/5", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.ratioPercent).toBe(10);
    expect(r.limitShares).toBe(100_000);
    expect(r.totalCountedShares).toBe(130_000);
    expect(r.excessShares).toBe(30_000);
    expect(r.taxableShares).toBe(30_000);
    // 10억 × 3만/5만 = 6억
    expect(r.clawbackBase).toBe(600_000_000);
    expect(r.giftTax).toBe(calcInheritanceGiftTax(600_000_000));
    expect(r.giftTax).toBe(120_000_000); // 6억 × 30% − 누진공제 6천만
  });

  it("🔑 평가액이 아니라 **취득자금**이다 — 취득단가가 바뀌면 세액이 바뀐다", () => {
    const cheap = calcPublicInterestStockAcquisition(mk({ acquisitionCost: 500_000_000 }));
    const dear = calcPublicInterestStockAcquisition(mk({ acquisitionCost: 2_000_000_000 }));
    expect(cheap.taxableShares).toBe(dear.taxableShares); // 주식수는 같다
    expect(cheap.clawbackBase).toBe(300_000_000);
    expect(dear.clawbackBase).toBe(1_200_000_000);
  });

  it("경계 — 합산이 한도와 같으면 초과가 없다 (「초과」이므로)", () => {
    const r = calcPublicInterestStockAcquisition(mk({ heldSharesAtAcquisition: 50_000 }));
    expect(r.totalCountedShares).toBe(100_000);
    expect(r.excessShares).toBe(0);
    expect(r.isClawback).toBe(false);
    expect(r.giftTax).toBe(0);
  });

  it("나목·다목도 합산 대상이다", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({ heldSharesAtAcquisition: 0, otherCorpDonatedShares: 60_000, otherCorpHeldShares: 20_000 }),
    );
    expect(r.totalCountedShares).toBe(130_000); // 5만 + 6만 + 2만
    expect(r.excessShares).toBe(30_000);
  });

  it("한도 주식수를 정수로 반올림하지 않는다 (발행주식수가 10의 배수가 아닐 때)", () => {
    // 발행 1,000,001주의 10% = 100,000.1주 → 합산 100,000주는 「초과」가 아니다.
    const r = calcPublicInterestStockAcquisition(
      mk({ totalShares: 1_000_001, acquiredShares: 20_000, heldSharesAtAcquisition: 80_000 }),
    );
    expect(r.totalCountedShares).toBe(100_000);
    expect(r.excessShares).toBe(0);
  });

  it("취득한 주식이 없으면 §48②2호에 해당하지 않는다 (과세 계기가 취득이다)", () => {
    const r = calcPublicInterestStockAcquisition(mk({ acquiredShares: 0 }));
    expect(r.applies).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.nonApplicableReason).toMatch(/취득/);
  });
});

describe("SA-2 — ⭐ 과세 단위는 「추가로 취득하는 주식」 (계획서 §5.1 근거 4건)", () => {
  it("합산분만으로 이미 한도를 넘었어도 **취득분을 넘어 과세하지 않는다**", () => {
    // 가목 12만주(12%) 보유 상태에서 1만주 취득 → 합산 13만, 한도 10만, 초과 3만
    const r = calcPublicInterestStockAcquisition(
      mk({ acquiredShares: 10_000, heldSharesAtAcquisition: 120_000, acquisitionCost: 200_000_000 }),
    );
    expect(r.excessShares).toBe(30_000);
    expect(r.taxableShares).toBe(10_000); // ❌ 3만주가 아니다
    expect(r.excessCappedByAcquired).toBe(true);
    // 취득분 전부가 과세 → 취득가액 전액
    expect(r.clawbackBase).toBe(200_000_000);
    expect(r.giftTax).toBe(30_000_000); // 2억 × 20% − 1천만
  });

  it("🔑 캡이 없었다면 3배가 된다 — 초과주식 기준 과세가액과 다름을 확인", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({ acquiredShares: 10_000, heldSharesAtAcquisition: 120_000, acquisitionCost: 200_000_000 }),
    );
    // 초과 3만주 × 주당 2만원 = 6억 (❌ 이 값이 되면 안 된다)
    expect(r.clawbackBase).not.toBe(600_000_000);
  });

  it("초과가 취득분보다 적으면 캡이 걸리지 않는다 (양성 대조군)", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.excessCappedByAcquired).toBe(false);
    expect(r.taxableShares).toBe(r.excessShares);
  });
});

describe("SA-3 — §16②2호 비율 (원칙 10% · 가목 20% · 나목·다목 5%)", () => {
  it("기본은 10%", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.ratioPercent).toBe(10);
    expect(r.ratioClause).toBe("default");
  });

  it("가목 — 의결권 미행사 + 자선·장학·사회복지 목적 → 20%", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        holdingRatio: {
          isMutualInvestmentRestrictedGroup: false,
          failsClause11Requirements: false,
          noVotingRights: true,
          isCharityPurpose: true,
        },
      }),
    );
    expect(r.ratioPercent).toBe(20);
    expect(r.ratioClause).toBe("ga");
    // 한도 20만 > 합산 13만 → 초과 없음
    expect(r.excessShares).toBe(0);
  });

  it("가목은 **두 요건 모두** 갖춰야 한다 — 하나만이면 10%", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        holdingRatio: {
          isMutualInvestmentRestrictedGroup: false,
          failsClause11Requirements: false,
          noVotingRights: true,
          isCharityPurpose: false,
        },
      }),
    );
    expect(r.ratioPercent).toBe(10);
  });

  it("나목 — 상호출자제한기업집단과 특수관계 → 5%", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        holdingRatio: {
          isMutualInvestmentRestrictedGroup: true,
          failsClause11Requirements: false,
          noVotingRights: false,
          isCharityPurpose: false,
        },
      }),
    );
    expect(r.ratioPercent).toBe(5);
    expect(r.ratioClause).toBe("na");
    // 한도 5만 · 합산 13만 → 초과 8만이지만 취득 5만이 캡
    expect(r.taxableShares).toBe(50_000);
    expect(r.clawbackBase).toBe(1_000_000_000);
  });

  it("다목 — §48⑪ 요건 미충족 → 5%", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        holdingRatio: {
          isMutualInvestmentRestrictedGroup: false,
          failsClause11Requirements: true,
          noVotingRights: false,
          isCharityPurpose: false,
        },
      }),
    );
    expect(r.ratioPercent).toBe(5);
    expect(r.ratioClause).toBe("da");
  });

  it("⭐ 나목·다목이 가목을 이긴다 (§16②2호가목 괄호 「나목 또는 다목…은 제외」)", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        holdingRatio: {
          isMutualInvestmentRestrictedGroup: true,
          failsClause11Requirements: false,
          noVotingRights: true, // 가목 요건을 다 갖췄어도
          isCharityPurpose: true,
        },
      }),
    );
    expect(r.ratioPercent).toBe(5); // ❌ 20이 아니다
    expect(r.ratioClause).toBe("na");
  });
});

describe("SA-4 — 단서 (§16③1호·3호 준용 + 산학협력단 §37⑥)", () => {
  it("§16③1호(주무관청 인정) → 제외", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({ exclusion: { clause16_3_1: true, clause16_3_3: false } }),
    );
    expect(r.applies).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.exemptReason).toMatch(/제1호/);
  });

  it("§16③3호(공익법인법 등 법령에 따른 취득) → 제외", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({ exclusion: { clause16_3_1: false, clause16_3_3: true } }),
    );
    expect(r.applies).toBe(false);
    expect(r.exemptReason).toMatch(/제3호/);
  });

  it("산학협력단 — §37⑥ 3요건을 **모두** 갖추면 제외", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        exclusion: {
          clause16_3_1: false,
          clause16_3_3: false,
          industryAcademic: { establishedByTechContribution: true, ratioMet: true, noOtherShares: true },
        },
      }),
    );
    expect(r.applies).toBe(false);
    expect(r.exemptReason).toMatch(/산학협력단/);
  });

  it("❌ 산학협력단 3요건 중 하나라도 빠지면 제외되지 않는다", () => {
    const r = calcPublicInterestStockAcquisition(
      mk({
        exclusion: {
          clause16_3_1: false,
          clause16_3_3: false,
          industryAcademic: { establishedByTechContribution: true, ratioMet: true, noOtherShares: false },
        },
      }),
    );
    expect(r.applies).toBe(true);
    expect(r.giftTax).toBeGreaterThan(0);
  });

  it("⭐ §16③**2호**(3년 내 매각)는 준용되지 않는다 — 안내로 남긴다", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.warnings.some((w) => w.includes("제2호"))).toBe(true);
  });
});

describe("SA-5 — 상증칙 §13①: 취득가액 산정이 곤란한 경우 §60~§66 평가액", () => {
  it("평가액을 주면 그 값이 과세가액이 된다", () => {
    const r = calcPublicInterestStockAcquisition(mk({ chapter4ValueOfExcess: 750_000_000 }));
    expect(r.usedChapter4Value).toBe(true);
    expect(r.clawbackBase).toBe(750_000_000); // ❌ 취득가액 기준 6억이 아니다
    expect(r.giftTax).toBe(calcInheritanceGiftTax(750_000_000));
  });

  it("평가액을 주지 않으면 취득가액 경로를 쓴다 (양성 대조군)", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.usedChapter4Value).toBe(false);
    expect(r.clawbackBase).toBe(600_000_000);
  });
});

describe("SA-6 — §37① 기준일은 취득 형태별로 다르다", () => {
  it.each([
    ["purchase_or_donation", /취득일/],
    ["paid_in_capital_increase", /주주명부/],
    ["capital_reduction", /감자/],
    ["merger", /합병등기일/],
  ] as const)("%s → %s", (acquisitionForm, pattern) => {
    const r = calcPublicInterestStockAcquisition(mk({ acquisitionForm }));
    expect(r.steps.some((s) => pattern.test(s.formula))).toBe(true);
  });

  it("기준일이 결과·산식에 그대로 남는다", () => {
    const r = calcPublicInterestStockAcquisition(mk({ assessmentDate: "2024-11-30" }));
    expect(r.assessmentDate).toBe("2024-11-30");
    expect(r.steps.some((s) => s.formula.includes("2024-11-30"))).toBe(true);
  });
});

describe("SA-7 — 증여세 공통 규칙", () => {
  it("§55② 과세최저한(50만원)이 적용된다", () => {
    // 초과 1주 · 주당 40만원
    const r = calcPublicInterestStockAcquisition(
      mk({ acquiredShares: 1, heldSharesAtAcquisition: 100_000, acquisitionCost: 400_000 }),
    );
    expect(r.taxableShares).toBe(1);
    expect(r.clawbackBase).toBe(400_000);
    expect(r.belowMinimumTaxBase).toBe(true);
    expect(r.giftTax).toBe(0);
  });

  it("이자상당액을 가산하지 않는다", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    expect(r.giftTax).toBe(calcInheritanceGiftTax(r.taxBase));
  });

  it("근거에 §48②2호·§40①2호가 표시된다", () => {
    const r = calcPublicInterestStockAcquisition(mk());
    const bases = r.steps.map((s) => s.legalBasis).join(" ");
    expect(bases).toMatch(/§48②2호/);
    expect(bases).toMatch(/§40①2호/);
  });
});
