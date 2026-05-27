/**
 * PR-L — §63②1호 기업공개 준비 중 법인 평가 anchor (PL-1~11 + 회귀)
 *
 * 법령: 상증법 §63②1호·§63③ + 상증령 §57① (KoreanLaw MCP 2026-05-27)
 *   평가기준일 ∈ [유가증권신고일(미신고 시 상장신청일) − 6개월(상속)/3개월(증여), 거래소 상장 전)
 *   → MAX(공모가격, §54 보충적평가). §63③ 할증은 override값 기준.
 *
 * Plan:   docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.engine.design.md
 */

import { describe, it, expect } from "vitest";
import {
  applyPreIpoListing,
  type PreIpoListingInput,
} from "@/lib/tax-engine/property-valuation/pre-ipo-listing-section-63-2";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";

// ── 공용 입력 빌더 (평가기준일 2024-05-01, 12월 결산 3년) ──
function baseInput(
  overrides: Partial<UnlistedStockValuationInput> = {},
): UnlistedStockValuationInput {
  return {
    corpName: "㈜예제",
    businessStartDate: new Date("2000-01-01"),
    evaluationDate: new Date("2024-05-01"),
    faceValuePerShare: 5_000,
    totalShares: 50_000,
    ownedShares: 26_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
      { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 2_476_889_520,
      assetValuationDelta: 91_548_350,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 65_400_500,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 1_833_780_000,
      corporateTaxPayable: 32_627_890,
      farmingSurtax: 0,
      localIncomeTax: 3_262_780,
      dividendPayable: 0,
      retirementProvision: 445_785_000,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 301_770_000,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "large",
    ...overrides,
  };
}

function preIpo(overrides: Partial<PreIpoListingInput> = {}): PreIpoListingInput {
  return {
    publicOfferingPrice: 20_000,
    securitiesFilingDate: new Date("2024-03-01"),
    taxKind: "inheritance",
    ...overrides,
  };
}

const EVAL_WITHIN = new Date("2024-05-01"); // 신고일(2024-03-01) 이후·상장 전 → 윈도우 내

describe("PR-L §63②1호 기업공개 준비 중 평가 — applyPreIpoListing (모듈)", () => {
  it("PL-1: 상속·윈도우 내·공모가>보충적 → appliedValue=공모가", () => {
    const r = applyPreIpoListing(preIpo(), 12_000, EVAL_WITHIN);
    expect(r.withinWindow).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.appliedValue).toBe(20_000); // MAX(20,000, 12,000)
    expect(r.windowMonths).toBe(6);
  });

  it("PL-3: 공모가<보충적 → MAX=보충적(override 무효과)·applied=true", () => {
    const r = applyPreIpoListing(preIpo({ publicOfferingPrice: 8_000 }), 12_000, EVAL_WITHIN);
    expect(r.applied).toBe(true);
    expect(r.appliedValue).toBe(12_000); // MAX(8,000, 12,000)
  });

  it("PL-4: 윈도우 밖(신고일 −8개월) → withinWindow=false·applied=false", () => {
    // 신고일 2024-03-01, 평가일 2023-07-01 (8개월 전 > 6개월) → 윈도우 시작(2023-09-01) 이전
    const r = applyPreIpoListing(preIpo(), 12_000, new Date("2023-07-01"));
    expect(r.withinWindow).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.appliedValue).toBe(12_000); // 현행 §54 유지
  });

  it("PL-5: 증여 3개월 — 상속이면 포함이나 증여는 윈도우 밖", () => {
    // 신고일 2024-03-01, 평가일 2023-11-01 (4개월 전)
    const evalDate = new Date("2023-11-01");
    const giftR = applyPreIpoListing(preIpo({ taxKind: "gift" }), 12_000, evalDate);
    expect(giftR.windowMonths).toBe(3);
    expect(giftR.withinWindow).toBe(false); // 윈도우 시작 2023-12-01 이후라 밖
    expect(giftR.applied).toBe(false);

    const inhR = applyPreIpoListing(preIpo({ taxKind: "inheritance" }), 12_000, evalDate);
    expect(inhR.windowMonths).toBe(6);
    expect(inhR.withinWindow).toBe(true); // 윈도우 시작 2023-09-01 이후라 포함
    expect(inhR.applied).toBe(true);
  });

  it("PL-6: 상장 후(listingDate < evaluationDate) → withinWindow=false", () => {
    const r = applyPreIpoListing(
      preIpo({ listingDate: new Date("2024-04-01") }),
      12_000,
      new Date("2024-05-01"), // 상장(2024-04-01) 후
    );
    expect(r.withinWindow).toBe(false);
    expect(r.applied).toBe(false);
  });

  it("PL-6b 경계: 평가일 = 상장일 → 미포함(상장 전까지)", () => {
    const r = applyPreIpoListing(
      preIpo({ listingDate: new Date("2024-04-01") }),
      12_000,
      new Date("2024-04-01"),
    );
    expect(r.withinWindow).toBe(false); // evaluationDate < listingDate 아님
  });

  it("D-5 경계: 공모가 ≤ 0 → 미적용(applied=false)", () => {
    const r = applyPreIpoListing(preIpo({ publicOfferingPrice: 0 }), 12_000, EVAL_WITHIN);
    expect(r.withinWindow).toBe(true);
    expect(r.applied).toBe(false); // 공모가 0
    expect(r.appliedValue).toBe(12_000);
  });
});

describe("PR-L §63② orchestrator override (통합)", () => {
  it("PL-2: 윈도우 내·공모가 큰 값 → finalPerShareValue(할증 전)=공모가·applied=true", () => {
    const input = baseInput({ preIpoListing: preIpo({ publicOfferingPrice: 1_000_000 }) });
    const r = evaluateUnlistedStockV2(input);
    expect(r.preIpoListingResult?.applied).toBe(true);
    expect(r.finalPerShareValue).toBe(1_000_000); // §54 결과보다 큰 공모가로 override
    expect(r.appliedRules.some((s) => s.includes("§63②1호"))).toBe(true);
  });

  it("PL-7: §63③ 할증 — override값(1,000,000) 기준 ×120%", () => {
    const input = baseInput({
      isMaxShareholder: true,
      companySize: "large",
      preIpoListing: preIpo({ publicOfferingPrice: 1_000_000 }),
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.finalPerShareValue).toBe(1_000_000);
    expect(r.premiumPerShare).toBe(1_200_000); // 1,000,000 × 1.2
    expect(r.finalPerShareForReporting).toBe(1_200_000);
  });

  it("PL-9: §54⑥ 동시 — 범위 기준=보충적평가(override 전), override값 무오염", () => {
    // 보충적평가(baseline finalPerShareValue) = preIpo 없이 산출
    const baseline = evaluateUnlistedStockV2(baseInput()).finalPerShareValue;
    const input = baseInput({
      preIpoListing: preIpo({ publicOfferingPrice: 1_000_000 }),
      evaluationCommittee: { method: "dcf", taxpayerPerShareValuation: baseline },
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.finalPerShareValue).toBe(1_000_000); // override 적용
    // §54⑥ 범위는 보충적평가(baseline) 기준 — override(1,000,000) 아님
    expect(r.evaluationCommitteeApplied?.supplementary).toBe(baseline);
    expect(r.evaluationCommitteeApplied?.lower).toBe(Math.floor(baseline * 0.7));
    expect(r.evaluationCommitteeApplied?.upper).toBe(Math.floor(baseline * 1.3));
  });

  it("PL-10: 순자산단독(liquidation) + §63② override — §54 보충적평가가 순자산단독 포섭", () => {
    const baselineNa = evaluateUnlistedStockV2(
      baseInput({ netAssetOnlyReason: "liquidation" }),
    ).finalPerShareValue;
    const input = baseInput({
      netAssetOnlyReason: "liquidation",
      preIpoListing: preIpo({ publicOfferingPrice: 1_000_000 }),
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.preIpoListingResult?.applied).toBe(true);
    expect(r.preIpoListingResult?.supplementaryValue).toBe(baselineNa); // 순자산단독값이 보충적
    expect(r.finalPerShareValue).toBe(1_000_000); // MAX(1,000,000, 순자산단독)
  });

  it("PL-11: 날짜 string(JSON 경유) 방어 — withinWindow 정상(silent-false 아님)", () => {
    const dateInput = baseInput({ preIpoListing: preIpo({ publicOfferingPrice: 1_000_000 }) });
    const dateResult = evaluateUnlistedStockV2(dateInput);
    // securitiesFilingDate·evaluationDate를 ISO string으로 주입 (JSON 직렬화 모사)
    const stringInput = baseInput({
      evaluationDate: "2024-05-01" as unknown as Date,
      preIpoListing: {
        ...preIpo({ publicOfferingPrice: 1_000_000 }),
        securitiesFilingDate: "2024-03-01" as unknown as Date,
      },
    });
    const stringResult = evaluateUnlistedStockV2(stringInput);
    expect(stringResult.preIpoListingResult?.applied).toBe(true);
    expect(stringResult.preIpoListingResult?.applied).toBe(dateResult.preIpoListingResult?.applied);
    expect(stringResult.finalPerShareValue).toBe(dateResult.finalPerShareValue);
  });

  it("PL-4(통합): 윈도우 밖 → 현행 §54 유지 (override 없음)", () => {
    const baseline = evaluateUnlistedStockV2(baseInput()).finalPerShareValue;
    const input = baseInput({
      preIpoListing: preIpo({ publicOfferingPrice: 1_000_000, securitiesFilingDate: new Date("2025-06-01") }),
      // 신고일 2025-06-01, 평가일 2024-05-01 → 신고일보다 1년 이상 전 → 윈도우 밖
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.preIpoListingResult?.applied).toBe(false);
    expect(r.finalPerShareValue).toBe(baseline); // 불변
  });
});

describe("PR-L Zod (PL-8) + 회귀", () => {
  function v2Raw(overrides: Record<string, unknown> = {}) {
    const b = baseInput();
    return {
      ...b,
      ...overrides,
    } as unknown as Record<string, unknown>;
  }

  it("PL-8: preIpoListing 정의인데 공모가 0 → parse 실패", () => {
    const parsed = unlistedStockValuationV2Schema.safeParse(
      v2Raw({
        preIpoListing: {
          publicOfferingPrice: 0,
          securitiesFilingDate: new Date("2024-03-01"),
          taxKind: "inheritance",
        },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("PL-8b: preIpoListing 정상 → parse 성공 + 필드 보존(strip 0)", () => {
    const parsed = unlistedStockValuationV2Schema.safeParse(
      v2Raw({
        preIpoListing: {
          publicOfferingPrice: 20_000,
          securitiesFilingDate: new Date("2024-03-01"),
          taxKind: "inheritance",
        },
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { preIpoListing?: unknown }).preIpoListing).toBeDefined();
    }
  });

  it("회귀: preIpoListing 미입력 시 전체 불변", () => {
    const r = evaluateUnlistedStockV2(baseInput());
    expect(r.preIpoListingResult).toBeUndefined();
    expect(r.finalPerShareValue).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// PR-L2 — §63②2호 거래소 상장신청·협회 등록 준비 중 (preparationType 판별자)
//   법 §63②2호 + 령 §57② — MAX(공모가, §54 보충적평가). 윈도우·MAX·할증 동일, 문자열만 분기.
// ════════════════════════════════════════════════════════════════════

describe("PR-L2 §63②2호 association_registration (모듈)", () => {
  it("PL2-1: type=association·상속·윈도우 내·공모가>보충적 → appliedValue=공모가·applied=true", () => {
    const r = applyPreIpoListing(
      preIpo({ preparationType: "association_registration" }),
      12_000,
      EVAL_WITHIN,
    );
    expect(r.applied).toBe(true);
    expect(r.appliedValue).toBe(20_000);
    expect(r.preparationType).toBe("association_registration"); // echo
  });

  it("PL2-3: type=association·gift 신고일−4개월 → 윈도우 밖(상속 동일입력은 포함)", () => {
    const evalDate = new Date("2023-11-01"); // 신고일 2024-03-01 − 4개월
    const gift = applyPreIpoListing(
      preIpo({ preparationType: "association_registration", taxKind: "gift" }),
      12_000,
      evalDate,
    );
    expect(gift.windowMonths).toBe(3);
    expect(gift.applied).toBe(false);
    const inh = applyPreIpoListing(
      preIpo({ preparationType: "association_registration", taxKind: "inheritance" }),
      12_000,
      evalDate,
    );
    expect(inh.windowMonths).toBe(6);
    expect(inh.applied).toBe(true);
  });

  it("PL2-6: echo preparationType=association", () => {
    const r = applyPreIpoListing(preIpo({ preparationType: "association_registration" }), 12_000, EVAL_WITHIN);
    expect(r.preparationType).toBe("association_registration");
  });

  it("PL2-7: 윈도우 밖 → warnings '협회 등록 전'·'§63②2호' 포함, '거래소 상장 전' 부재", () => {
    const r = applyPreIpoListing(
      preIpo({ preparationType: "association_registration", securitiesFilingDate: new Date("2025-06-01") }),
      12_000,
      new Date("2024-05-01"), // 신고일 −1년 이상 전 → 윈도우 밖
    );
    expect(r.withinWindow).toBe(false);
    const w = r.warnings.join(" ");
    expect(w).toContain("협회 등록 전");
    expect(w).toContain("§63②2호");
    expect(w).not.toContain("거래소 상장 전");
  });

  it("회귀(default): preparationType 미입력 → echo exchange_listing", () => {
    const r = applyPreIpoListing(preIpo(), 12_000, EVAL_WITHIN);
    expect(r.preparationType).toBe("exchange_listing");
  });
});

describe("PR-L2 §63②2호 orchestrator + Zod", () => {
  it("PL2-2: type=association → appliedRules '§63②2호 + §57②' 포함(§63②1호 부재)", () => {
    const input = baseInput({
      preIpoListing: preIpo({ preparationType: "association_registration", publicOfferingPrice: 1_000_000 }),
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.preIpoListingResult?.applied).toBe(true);
    expect(r.preIpoListingResult?.preparationType).toBe("association_registration");
    const rules = r.appliedRules.join(" ");
    expect(rules).toContain("§63②2호");
    expect(rules).toContain("§57②");
    expect(rules).toContain("협회 등록");
    expect(rules).toContain("거래소 상장신청"); // D-1 병기
    expect(r.appliedRules.some((s) => s.includes("§63②1호"))).toBe(false);
  });

  it("PL2-4: type=association·isMaxShareholder → override 1,000,000 기준 할증 1,200,000", () => {
    const input = baseInput({
      isMaxShareholder: true,
      companySize: "large",
      preIpoListing: preIpo({ preparationType: "association_registration", publicOfferingPrice: 1_000_000 }),
    });
    const r = evaluateUnlistedStockV2(input);
    expect(r.finalPerShareValue).toBe(1_000_000);
    expect(r.premiumPerShare).toBe(1_200_000);
  });

  it("PL2-5: Zod preparationType='association_registration' parse 성공", () => {
    const b = baseInput();
    const parsed = unlistedStockValuationV2Schema.safeParse({
      ...b,
      preIpoListing: {
        publicOfferingPrice: 20_000,
        securitiesFilingDate: new Date("2024-03-01"),
        taxKind: "inheritance",
        preparationType: "association_registration",
      },
    } as unknown as Record<string, unknown>);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const pil = (parsed.data as { preIpoListing?: { preparationType?: string } }).preIpoListing;
      expect(pil?.preparationType).toBe("association_registration");
    }
  });
});
