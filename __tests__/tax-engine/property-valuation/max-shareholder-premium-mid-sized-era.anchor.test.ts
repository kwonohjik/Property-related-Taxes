/**
 * U-04 (비상장주식 리뷰 2026-11-28) — 상증법 §63③ 중견기업 할증 배제는 평가기준일 2023.1.1. 이후분부터.
 *
 * - 2022.12.31. 개정 전 §63③(MST 237879)은 「대통령령으로 정하는 중소기업 … 은 제외」 — 중견기업은 100분의 20 가산.
 * - 법률 제19195호 부칙 §2 「이 법 시행 이후 상속이 개시되거나 증여를 받는 경우부터 적용」(시행 2023.1.1.).
 * - 2023.1.1.~2.27.은 배제 + 「상증령 §53⑦ 정의 시행 전 — 확인 필요」 고지(사용자 결정 Q-1).
 * - 9호는 규모·날짜로만 판정. 「9호 + 일반기업」은 ⑧·⑫ 같은 술어로 차단(사용자 결정 Q-2 (a′)).
 * - 2019.12.31. 이전 100분의 30 단계는 범위 밖 — 20% 유지 + 확인 필요 고지.
 * - 날짜 없음 = 현행(배제) 유지(U-03 선례).
 */
import { describe, it, expect } from "vitest";
import { calcMaxShareholderPremium } from "@/lib/tax-engine/property-valuation/max-shareholder-premium";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import { SME_REASON_LARGE_SIZE_MESSAGE } from "@/lib/tax-engine/property-valuation/max-shareholder-premium-era";
import { validateListedStockBesshi } from "@/lib/calc/inheritance-validate";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate";
import { estateItemSchema } from "@/lib/validators/estate-item-schema";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const prem = (companySize: "small" | "medium" | "large", date?: string, explicit?: "small_medium_enterprise") =>
  calcMaxShareholderPremium({
    finalPerShareValue: 66_000,
    isMaxShareholder: true,
    companySize,
    explicitExclusionReason: explicit,
    valuationDate: date ? d(date) : undefined,
  });

describe("U-04 — calcMaxShareholderPremium 중견기업 연혁 경계 (⑥ 66,000)", () => {
  it("medium 2022-06-30 → 0.20 · ⑧ 79,200 · ×10,000 = 792,000,000 (종전 0 · 660,000,000)", () => {
    const r = prem("medium", "2022-06-30");
    expect(r.premiumRate).toBe(0.2);
    expect(r.premiumPerShare).toBe(79_200);
    expect(r.exclusionReason).toBeUndefined();
    expect(r.premiumPerShare * 10_000).toBe(792_000_000);
  });

  it("medium 2022-12-31(경계 직전) → 0.20 · 79,200", () => {
    const r = prem("medium", "2022-12-31");
    expect(r.premiumRate).toBe(0.2);
    expect(r.premiumPerShare).toBe(79_200);
  });

  it("medium 2023-01-01 · 2023-02-27 → 0 · 66,000 (Q-1 법률 시행일)", () => {
    for (const date of ["2023-01-01", "2023-02-27"]) {
      const r = prem("medium", date);
      expect(r.premiumRate).toBe(0);
      expect(r.premiumPerShare).toBe(66_000);
      expect(r.exclusionReason).toBe("small_medium_enterprise");
    }
  });

  it("medium 2023-02-28 → 0 · 66,000", () => {
    expect(prem("medium", "2023-02-28").premiumPerShare).toBe(66_000);
  });

  it("날짜 없음 → 현행(배제) 0 · 66,000", () => {
    const r = prem("medium");
    expect(r.premiumRate).toBe(0);
    expect(r.exclusionReason).toBe("small_medium_enterprise");
  });

  it("회귀: small 2019-06-30 → 0 · large 2019-06-30 → 0.20 · 79,200", () => {
    expect(prem("small", "2019-06-30").premiumPerShare).toBe(66_000);
    expect(prem("large", "2019-06-30").premiumPerShare).toBe(79_200);
  });

  it("명시 9호 + medium 2022-06-30 → 규모·날짜로 판정 0.20 · 79,200 (종전 우회 0)", () => {
    const r = prem("medium", "2022-06-30", "small_medium_enterprise");
    expect(r.premiumRate).toBe(0.2);
    expect(r.premiumPerShare).toBe(79_200);
  });

  it("명시 9호 + small → 0 (규모 게이트와 같은 결론)", () => {
    expect(prem("small", "2022-06-30", "small_medium_enterprise").premiumPerShare).toBe(66_000);
  });

  it("명시 9호 + large → 엔진 0.20 (⑧·⑫에서 계산 전 차단)", () => {
    expect(prem("large", "2022-06-30", "small_medium_enterprise").premiumRate).toBe(0.2);
  });
});

// ── V2 통합 (pdf-case-1 사례 1 입력, 180,000주) ──
const ZERO_NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0, paidInCapitalIncrease: 0,
  otherEarnedRights: 0, prepaidExpenses: 0, preGiftRetainedEarnings: 0, bsTotalLiabilities: 0,
  corporateTaxPayable: 0, farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
  retirementProvision: 0, otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
};

const PDF_CASE_1: UnlistedStockValuationInput = {
  corpName: "주식회사",
  businessStartDate: d("2000-01-01"),
  evaluationDate: d("2022-06-30"),
  faceValuePerShare: 5_000,
  totalShares: 180_000,
  ownedShares: 180_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    {
      fiscalYearLabel: "2021",
      fiscalYearEndDate: d("2021-12-31"),
      taxableIncome: 140_000_000,
      addRefundInterest: 1_000_000,
      subEntertainmentExcess: 6_000_000,
      subDonationExcess: 3_800_000,
      subWithholdingPenalty: 500_000,
      subInterestPayment: 3_000_000,
      subCorporateTax: 7_000_000,
      subAdditionalTaxes: 700_000,
    },
    { fiscalYearLabel: "2020", fiscalYearEndDate: d("2020-12-31"), taxableIncome: 110_000_000 },
    { fiscalYearLabel: "2019", fiscalYearEndDate: d("2019-12-31"), taxableIncome: 80_000_000 },
  ],
  capitalChanges: [
    { changeType: "paid_in", changeDate: d("2021-06-30"), sharesIssued: 50_000, pricePerShare: 5_000 },
    { changeType: "free_issue", changeDate: d("2021-10-30"), sharesIssued: 30_000 },
  ],
  netAssetValueRaw: ZERO_NET_ASSET,
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.1,
  isMaxShareholder: true,
  companySize: "medium",
};

const v2 = (evaluationDate: string) => evaluateUnlistedStockV2({ ...PDF_CASE_1, evaluationDate: d(evaluationDate) });
const hasNotice = (ws: string[], frag: string) => ws.some((w) => w.includes(frag));

describe("U-04 — 비상장 V2 통합 (중견·최대주주)", () => {
  it("2022-06-30 → ⑧ 5,798 · 1,043,640,000 (종전 4,832 · 869,760,000) + 중견 시기 고지", () => {
    const r = v2("2022-06-30");
    expect(r.finalPerShareValue).toBe(4_832);
    expect(r.premiumPerShare).toBe(5_798);
    expect(r.premiumRate).toBe(0.2);
    expect(r.premiumExclusionReason).toBeUndefined();
    expect(r.totalValuation).toBe(1_043_640_000);
    expect(hasNotice(r.warnings, "중견기업 할증 제외는 평가기준일 2023.1.1. 이후분부터")).toBe(true);
    expect(hasNotice(r.warnings, "상증법 법률 제19195호 부칙 §2")).toBe(true);
  });

  it("2023-01-01 → 배제 4,832 · 869,760,000 + 「§53 ⑦ 정의 시행 전 — 확인 필요」", () => {
    const r = v2("2023-01-01");
    expect(r.totalValuation).toBe(869_760_000);
    expect(hasNotice(r.warnings, "상증령 §53 ⑦ 중견기업 정의 시행(2023.2.28.) 전 구간 — 확인 필요")).toBe(true);
  });

  it("2023-02-28 → 배제 869,760,000 · 연혁 고지 없음", () => {
    const r = v2("2023-02-28");
    expect(r.premiumPerShare).toBe(4_832);
    expect(r.totalValuation).toBe(869_760_000);
    expect(hasNotice(r.warnings, "중견기업")).toBe(false);
  });

  it("2019-06-30 → 5,798 · 1,043,640,000 + 중견 고지 + 100분의 30 단계 확인 필요", () => {
    const r = v2("2019-06-30");
    expect(r.premiumPerShare).toBe(5_798);
    expect(r.totalValuation).toBe(1_043_640_000);
    expect(hasNotice(r.warnings, "중견기업 할증 제외는")).toBe(true);
    expect(hasNotice(r.warnings, "상증법 법률 제16846호 부칙 §2")).toBe(true);
    expect(hasNotice(r.warnings, "50% 초과 보유 여부 확인 필요")).toBe(true);
  });
});

// ── 상장 (50,000원 × 10,000주) ──
const listed = (over: Partial<EstateItem> = {}): EstateItem =>
  ({
    id: "ls-1",
    name: "상장주식",
    category: "listed_stock",
    listedStockAvgPrice: 50_000,
    listedStockShares: 10_000,
    isMaxShareholder: true,
    companySize: "medium",
    ...over,
  }) as EstateItem;

describe("U-04 — 상장 resolveListedPremiumRate", () => {
  it("일반 분기 medium 2022-06-30 → 600,000,000 (종전 500,000,000) · 라벨 없음 · 고지", () => {
    const r = evaluateListedStock(listed(), { valuationDate: "2022-06-30" });
    expect(r.valuatedAmount).toBe(600_000_000);
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
    expect(r.besshiData?.page1Values.premiumExclusionLabel).toBeUndefined();
    expect(hasNotice(r.warnings ?? [], "중견기업 할증 제외는")).toBe(true);
    expect(hasNotice(r.warnings ?? [], "할증 20% 적용 (중견기업)")).toBe(true);
  });

  it("§63②3호 분기 medium 2022-06-30 → ⑰ 60,000 × 10,000 = 600,000,000", () => {
    const r = evaluateListedStock(
      listed({ isCapitalIncreaseUnlistedShare: true, listedStockDividendDifference: 0, dividendBaseDateSameAsListed: true }),
      { valuationDate: "2022-06-30" },
    );
    expect(r.valuatedAmount).toBe(600_000_000);
    expect(hasNotice(r.warnings ?? [], "중견기업 할증 제외는")).toBe(true);
  });

  it("2023-01-01 → 500,000,000 + 확인 필요 고지 · 날짜 없음 → 500,000,000", () => {
    const r = evaluateListedStock(listed(), { valuationDate: "2023-01-01" });
    expect(r.valuatedAmount).toBe(500_000_000);
    expect(hasNotice(r.warnings ?? [], "확인 필요")).toBe(true);
    expect(evaluateListedStock(listed(), {}).valuatedAmount).toBe(500_000_000);
  });

  it("명시 9호 + medium 2022-06-30 → 600,000,000 (종전 우회 500,000,000)", () => {
    const r = evaluateListedStock(listed({ premiumExclusionReason: "small_medium_enterprise" }), {
      valuationDate: "2022-06-30",
    });
    expect(r.valuatedAmount).toBe(600_000_000);
  });
});

describe("U-04 — 「9호 + 일반기업」 ⑧·⑫ 같은 술어 차단 (Q-2 (a′))", () => {
  it("상장 ⑧ validateListedStockBesshi · ⑫ estateItemSchema", () => {
    const bad = listed({ companySize: "large", premiumExclusionReason: "small_medium_enterprise" });
    expect(validateListedStockBesshi(bad)).toContain(SME_REASON_LARGE_SIZE_MESSAGE);
    const z = estateItemSchema.safeParse(bad);
    expect(z.success).toBe(false);
    expect(z.error?.issues.some((i) => i.message === SME_REASON_LARGE_SIZE_MESSAGE)).toBe(true);
    // 9호 + 중견은 통과 (엔진이 날짜로 판정)
    const ok = listed({ premiumExclusionReason: "small_medium_enterprise" });
    expect(validateListedStockBesshi(ok)).toBeNull();
    expect(estateItemSchema.safeParse(ok).success).toBe(true);
  });

  it("비상장 V2 ⑧ validateUnlistedStockV2 · ⑫ unlistedStockValuationV2Schema", () => {
    const badV2 = { ...PDF_CASE_1, companySize: "large" as const, premiumExclusionReason: "small_medium_enterprise" as const };
    const item = { id: "u-1", name: "비상장", category: "unlisted_stock", unlistedStockValuationV2: badV2 } as EstateItem;
    expect(validateUnlistedStockV2(item)).toContain(SME_REASON_LARGE_SIZE_MESSAGE);
    const z = unlistedStockValuationV2Schema.safeParse(badV2);
    expect(z.success).toBe(false);
    expect(z.error?.issues.some((i) => i.message === SME_REASON_LARGE_SIZE_MESSAGE)).toBe(true);
    const okV2 = { ...badV2, companySize: "medium" as const };
    expect(validateUnlistedStockV2({ ...item, unlistedStockValuationV2: okV2 } as EstateItem)).toBeNull();
    expect(unlistedStockValuationV2Schema.safeParse(okV2).success).toBe(true);
  });
});
