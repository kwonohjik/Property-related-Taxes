import { describe, it, expect } from "vitest";

// ── 단기재상속 ────────────────────────────────────────────────
import {
  getShortTermReinheritRate,
  calcShortTermReinheritCredit,
  deriveShortTermReinheritBand,
} from "@/lib/tax-engine/credits/short-term-reinheritance";

// ── 외국납부세액 ───────────────────────────────────────────────
import {
  calcForeignTaxCredit,
} from "@/lib/tax-engine/credits/foreign-tax-credit";

// ── 신고세액공제 ───────────────────────────────────────────────
import {
  calcFilingCredit,
} from "@/lib/tax-engine/credits/filing-credit";

// ── 조특법 특례 ────────────────────────────────────────────────
import {
  calcStartupFundSpecialTax,
  calcFamilyBusinessSpecialTax,
  getFamilyBusinessLimit,
} from "@/lib/tax-engine/credits/special-tax-treatment";

// ── 세액공제 통합 ─────────────────────────────────────────────
import {
  calcGiftTaxCredit,
  calcInheritanceTaxCredits,
  calcGiftTaxCredits,
} from "@/lib/tax-engine/inheritance-gift-tax-credit";

// ── 공통 유틸 ─────────────────────────────────────────────────
import {
  calcInheritanceGiftTax,
  calcGenerationSkipSurcharge,
  calcFuneralExpenseDeduction,
  aggregatePriorGiftsForInheritance,
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
} from "@/lib/tax-engine/inheritance-gift-common";

// ============================================================
// 1. 단기재상속세액공제 (§30)
// ============================================================

describe("단기재상속세액공제 — §30", () => {
  it("[C1] 경과 연수 0년 → 공제율 100%", () => {
    expect(getShortTermReinheritRate(0)).toBe(1.0);
  });

  it("[C2] 경과 1년 이내 → 100%", () => {
    expect(getShortTermReinheritRate(1)).toBe(1.0);
  });

  it("[C3] 경과 2년 → 90%", () => {
    expect(getShortTermReinheritRate(2)).toBe(0.9);
  });

  it("[C4] 경과 5년 → 60%", () => {
    expect(getShortTermReinheritRate(5)).toBe(0.6);
  });

  it("[C5] 경과 10년 → 10%", () => {
    expect(getShortTermReinheritRate(10)).toBe(0.1);
  });

  it("[C6] 경과 11년 → 공제 없음 (0%)", () => {
    expect(getShortTermReinheritRate(11)).toBe(0);
  });

  it("[C7] 전 납부세액 1억, 5년 경과 → 공제 6,000만", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 5,
      currentComputedTax: 200_000_000,
    });
    expect(result.creditAmount).toBe(60_000_000); // 1억 × 60%
    expect(result.creditRate).toBe(0.6);
  });

  it("[C8] 공제 기본액이 당해 산출세액 초과 → 산출세액으로 절사", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 200_000_000,
      elapsedYears: 1, // 100%
      currentComputedTax: 150_000_000, // 한도
    });
    expect(result.creditAmount).toBe(150_000_000);
  });

  it("[C9] 10년 초과 → 공제 0", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 11,
      currentComputedTax: 200_000_000,
    });
    expect(result.creditAmount).toBe(0);
  });

  // ── Pre-Do anchor: M-3 §30②1호 안분 분수 수정 ─────────────────
  // 약분 검증: §30②1호 = 전의 산출세액 × (재상속분가액 × 전의과세가액/전의상속재산가액) ÷ 전의과세가액
  //           = 전의 산출세액 × 재상속분가액 / 전의상속재산가액 (전의과세가액 상쇄)
  // → 공제액 = floor(전의산출세액 × 재상속분가액 / 전의상속재산가액) × 공제율

  it("[C7b] PRE-DO BUGGY — 부분재상속(3/10억): 현재는 전액×공제율로 과대산정됨", () => {
    // 전(前) 산출세액 1억, 전 상속재산 10억, 재상속분 3억, 경과 3년(80%)
    // 정정 후 공제액: floor(1억 × 3억/10억) × 80% = floor(30,000,000 × 0.8) = 24,000,000
    // 현재 buggy:   floor(1억 × 80%) = 80,000,000 (과대)
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 3,
      currentComputedTax: 200_000_000,
      shortTermReinheritAssetValue: 300_000_000,       // 재상속분 재산가액 (분자)
      shortTermReinheritPriorEstateValue: 1_000_000_000, // 전의 상속재산가액 (분모)
    });
    // 수정 후 정합값
    expect(result.creditAmount).toBe(24_000_000);
    expect(result.prorationApplied).toBe(true);
  });

  it("[C7c] 전부재상속 fallback — 신규 필드 미입력 시 분수=1 (하위호환)", () => {
    // 신규 필드 없음 → 전부 재상속 가정(기존 동작 유지)
    // 공제액 = 1억 × 60% = 60,000,000 (C7과 동일)
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 5,
      currentComputedTax: 200_000_000,
    });
    expect(result.creditAmount).toBe(60_000_000);
    expect(result.prorationApplied).toBe(false); // 안분 미적용 echo
  });

  it("[C7d] 분자=분모(전부재상속 명시) — 분수=1로 동작", () => {
    // 재상속분 = 전 상속재산 (전부 재상속)
    // 공제액 = floor(1억 × 5억/5억) × 60% = floor(1억) × 60% = 60,000,000
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 5,
      currentComputedTax: 200_000_000,
      shortTermReinheritAssetValue: 500_000_000,       // 분자 = 분모
      shortTermReinheritPriorEstateValue: 500_000_000, // 분모
    });
    expect(result.creditAmount).toBe(60_000_000);
    expect(result.prorationApplied).toBe(true);
  });

  it("[C7e] 분모=0 가드 — 분수 미적용 fallback", () => {
    // 분모 0 → ZeroDivision 방어, fallback=전부재상속
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 5,
      currentComputedTax: 200_000_000,
      shortTermReinheritAssetValue: 300_000_000,
      shortTermReinheritPriorEstateValue: 0, // 분모 0
    });
    // fallback: 분수 미적용(=1) → 1억 × 60% = 60,000,000
    expect(result.creditAmount).toBe(60_000_000);
    expect(result.prorationApplied).toBe(false);
  });

  it("[C7f] 대형 금액 BigInt 정밀도 — 부분재상속(50억/200억), 경과 2년(90%)", () => {
    // 전 산출세액 30억, 전 상속재산 200억, 재상속분 50억, 경과 2년(90%)
    // 안분 기준: safeMultiplyThenDivide(30억, 50억, 200억)
    //          = 3_000_000_000 × 5_000_000_000 / 20_000_000_000 = 750_000_000
    // 공제액: floor(750_000_000 × 0.9) = 675,000,000
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 3_000_000_000,
      elapsedYears: 2,
      currentComputedTax: 10_000_000_000,
      shortTermReinheritAssetValue: 5_000_000_000,
      shortTermReinheritPriorEstateValue: 20_000_000_000,
    });
    expect(result.creditAmount).toBe(675_000_000);
    expect(result.prorationApplied).toBe(true);
  });
});

// ============================================================
// 1-B. 단기재상속 공제율 구간 자동 도출 (deriveShortTermReinheritBand §30②2호)
// ============================================================

describe("단기재상속 공제율 구간 자동 도출 — deriveShortTermReinheritBand", () => {
  it("[R-1] 정확히 2년 → band 2 (2년 이내 90%)", () => {
    expect(deriveShortTermReinheritBand("2020-07-05", "2022-07-05")).toBe(2);
    expect(getShortTermReinheritRate(2)).toBe(0.9);
  });
  it("[R-1b] 2년+1일 → band 3 (3년 이내 80%)", () => {
    expect(deriveShortTermReinheritBand("2020-07-05", "2022-07-06")).toBe(3);
    expect(getShortTermReinheritRate(3)).toBe(0.8);
  });
  it("[R-2] 교재 사례 2020.7.5→2022.10.10 (2년3개월) → band 3 (80%)", () => {
    expect(deriveShortTermReinheritBand("2020-07-05", "2022-10-10")).toBe(3);
  });
  it("[R-3] 10년+1일 → band 11 (10년 초과 → 0%)", () => {
    expect(deriveShortTermReinheritBand("2010-07-05", "2020-07-06")).toBe(11);
    expect(getShortTermReinheritRate(11)).toBe(0);
  });
  it("[R-4] 동일일(부부 동시사망) → band 0 (100%)", () => {
    expect(deriveShortTermReinheritBand("2020-07-05", "2020-07-05")).toBe(0);
    expect(getShortTermReinheritRate(0)).toBe(1.0);
  });
  it("[R-1y] 정확히 1년 → band 1 (100%)", () => {
    expect(deriveShortTermReinheritBand("2020-07-05", "2021-07-05")).toBe(1);
  });
});

// ============================================================
// 1-C. 재산별 구분 계산 (교재 p.468~469 사례 — floor 일관)
// ============================================================

describe("단기재상속 재산별 구분 계산 — §30②1호·집행 30-22-1②", () => {
  const PRIOR_TAX = 440_000_000; // 전의 산출세액(1차 전체)
  const PRIOR_ESTATE = 4_300_000_000; // 전의 상속재산가액(채무공제 전)
  const ASSETS = [
    { name: "비상장주식", priorValue: 1_300_000_000 },
    { name: "토지1", priorValue: 700_000_000 },
    { name: "토지2", priorValue: 490_000_000 },
  ];

  it("[R-5] 재산별 3건 합산 → 203,832,555 (floor; 교재 round 203,832,558 Δ3)", () => {
    const r = calcShortTermReinheritCredit({
      priorTaxPaid: PRIOR_TAX,
      elapsedYears: 3, // 80%
      currentComputedTax: 704_000_000,
      assets: ASSETS,
      shortTermReinheritPriorEstateValue: PRIOR_ESTATE,
    });
    expect(r.creditAmount).toBe(203_832_555);
    expect(r.prorationApplied).toBe(true);
    expect(r.perAsset).toHaveLength(3);
    expect(r.band).toBe(3);
    expect(r.creditRate).toBe(0.8);
  });

  it("[R-6] 재산별 개별 공제세액 (floor; 교재 round 자산당 +1)", () => {
    const r = calcShortTermReinheritCredit({
      priorTaxPaid: PRIOR_TAX,
      elapsedYears: 3,
      currentComputedTax: 704_000_000,
      assets: ASSETS,
      shortTermReinheritPriorEstateValue: PRIOR_ESTATE,
    });
    expect(r.perAsset[0]).toMatchObject({ name: "비상장주식", base: 133_023_255, credit: 106_418_604 });
    expect(r.perAsset[1]).toMatchObject({ name: "토지1", base: 71_627_906, credit: 57_302_324 });
    expect(r.perAsset[2]).toMatchObject({ name: "토지2", base: 50_139_534, credit: 40_111_627 });
  });

  it("[R-9] §30② 보조 한도 — 합이 당해 산출세액 초과 시 클램핑", () => {
    const r = calcShortTermReinheritCredit({
      priorTaxPaid: PRIOR_TAX,
      elapsedYears: 3,
      currentComputedTax: 100_000_000, // 한도 < 합(203M)
      assets: ASSETS,
      shortTermReinheritPriorEstateValue: PRIOR_ESTATE,
    });
    expect(r.creditAmount).toBe(100_000_000);
  });

  it("[R-asset-name] 명칭 미입력 시 fallback '재상속재산 N'", () => {
    const r = calcShortTermReinheritCredit({
      priorTaxPaid: PRIOR_TAX,
      elapsedYears: 1,
      currentComputedTax: 704_000_000,
      assets: [{ priorValue: 1_000_000_000 }],
      shortTermReinheritPriorEstateValue: PRIOR_ESTATE,
    });
    expect(r.perAsset[0].name).toBe("재상속재산 1");
  });
});

// ============================================================
// 2. 외국납부세액공제 (§29·§59)
// ============================================================

describe("외국납부세액공제 — §29·§59", () => {
  it("[C10] 외국납부세액 < 산출세액 → 전액 공제", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 30_000_000,
      computedTax: 100_000_000,
      mode: "inheritance",
    });
    expect(result.creditAmount).toBe(30_000_000);
  });

  it("[C11] 외국납부세액 > 산출세액 → 산출세액으로 절사", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 150_000_000,
      computedTax: 100_000_000,
      mode: "gift",
    });
    expect(result.creditAmount).toBe(100_000_000);
  });

  it("[C12] 국외 과세표준 점유비 → 한도 = 산출세액 × (국외과표 ÷ 전체과표) (상증령 §21①)", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 80_000_000,
      computedTax: 100_000_000,
      foreignInheritanceTaxBase: 50_000_000,
      overallTaxBase: 100_000_000,
      mode: "inheritance",
    });
    // 한도 = 100M × (50M ÷ 100M) = 50M → min(80M, 50M) = 50M
    expect(result.creditAmount).toBe(50_000_000);
  });

  it("[C13] 외국납부세액 0 → 공제 0", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 0,
      computedTax: 100_000_000,
      mode: "inheritance",
    });
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 3. 신고세액공제 (§69)
// ============================================================

describe("신고세액공제 — §69 (3%)", () => {
  it("[C14] 기한 내 신고, 산출세액 1억 → 300만 공제", () => {
    const result = calcFilingCredit({
      isFiledOnTime: true,
      taxBeforeFilingCredit: 100_000_000,
    });
    expect(result.creditAmount).toBe(3_000_000);
  });

  it("[C15] 기한 내 미신고 → 공제 0", () => {
    const result = calcFilingCredit({
      isFiledOnTime: false,
      taxBeforeFilingCredit: 100_000_000,
    });
    expect(result.creditAmount).toBe(0);
  });

  it("[C16] 산출세액 0 → 공제 0", () => {
    const result = calcFilingCredit({
      isFiledOnTime: true,
      taxBeforeFilingCredit: 0,
    });
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 4. 조특법 과세특례 (§30의5·§30의6)
// ============================================================

describe("조특법 과세특례", () => {
  it("[C17] 창업자금 3억 → 5억 공제 후 과세표준 0 → 특례세액 0", () => {
    const result = calcStartupFundSpecialTax({
      giftAmount: 300_000_000,
      normalComputedTax: 20_000_000,
    });
    expect(result.specialTax).toBe(0);
    expect(result.creditAmount).toBe(20_000_000); // 절감액 = 일반세액 전액
  });

  it("[C18] 창업자금 10억 → 과세표준 5억 × 10% = 5천만", () => {
    const result = calcStartupFundSpecialTax({
      giftAmount: 1_000_000_000,
      normalComputedTax: 140_000_000, // 일반세액 (10억 과세표준시 약 1.4억)
    });
    // 과세표준 = 10억 - 5억 = 5억, 5억 ≤ 50억이므로 10%
    expect(result.specialTax).toBe(50_000_000);
    expect(result.creditAmount).toBe(90_000_000); // 140M - 50M
  });

  it("[C19] 가업승계 영위 기간 10년 → 한도 300억", () => {
    expect(getFamilyBusinessLimit(10)).toBe(30_000_000_000);
  });

  it("[C20] 가업승계 영위 기간 30년 → 한도 600억", () => {
    expect(getFamilyBusinessLimit(30)).toBe(60_000_000_000);
  });

  it("[C21] 가업승계 영위 기간 5년 → 특례 불가 (한도 0)", () => {
    expect(getFamilyBusinessLimit(5)).toBe(0);
  });

  it("[C22] 가업승계 20억 → 과세표준 10억 × 10% = 1억", () => {
    const result = calcFamilyBusinessSpecialTax({
      giftAmount: 2_000_000_000,
      businessYears: 15,
      normalComputedTax: 340_000_000,
    });
    // 과세표준 = 20억 - 10억 = 10억, 10% → 1억
    expect(result.specialTax).toBe(100_000_000);
  });
});

// ============================================================
// 5. 세액공제 통합 (§28~§30·§59·§69)
// ============================================================

describe("세액공제 통합 — 적용 순서", () => {
  it("[C23] 상속세: 증여세액공제 → 신고세액공제 순으로 적용", () => {
    // 산출세액 1억, 사전증여세 납부 1천만, 기한 내 신고
    // 과세가액 6억(>5억) — §28① 단서 미적용 (정상 공제 케이스).
    // taxBase=5억 명시: ratioLimit = floor(50M×100M/500M) = 10M → credit = min(10M,10M) = 10M
    // ※ 구 taxableEstateValue=5억 → §28① 단서(≤5억→배제) 적용으로 credit=0이 되므로
    //    과세가액을 6억(>5억)으로 조정하고 taxBase=5억으로 분모 고정 (M-2 법령 정합 재산정)
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 50_000_000,
            giftTaxPaid: 10_000_000,
          },
        ],
        isFiledOnTime: true,
      },
      computedTax: 100_000_000,
      generationSkipSurcharge: 0,
      taxableEstateValue: 600_000_000, // 6억(>5억) — §28① 단서 미적용
      taxBase: 500_000_000,            // 과세표준 5억 (안분 분모 명시)
      deathDate: "2025-01-01", // 2020-01-01 → 5년, 상속인(isHeir=true) 10년 이내 → 포함
    });

    // 1. 증여세액공제: ratioLimit = floor(50M × 100M / 500M) = 10,000,000 → credit = 10,000,000
    expect(result.giftTaxCredit).toBe(10_000_000);
    // 2. 외국납부: 0
    expect(result.foreignTaxCredit).toBe(0);
    // 3. 단기재상속: 0
    expect(result.shortTermReinheritCredit).toBe(0);
    // 4. 신고세액공제: (100M - 10M) × 3% = 2,700,000
    expect(result.filingCredit).toBe(2_700_000);
    // 합계: 10M + 2.7M = 12.7M
    expect(result.totalCredit).toBe(12_700_000);

    // [INH-ECHO-1] §69 산출근거 echo 2필드 (상속세 경로) — PR1
    // totalComputedTaxWithSurcharge = computedTax + surcharge = 100M + 0
    expect(result.totalComputedTaxWithSurcharge).toBe(100_000_000);
    // filingCreditBase = §28·§29·§30 차감 후 base = 100M − 10M = 90M
    expect(result.filingCreditBase).toBe(90_000_000);
    // [INH-ECHO-2] filingCreditBase × 3% === filingCredit (법정기한 내)
    expect(Math.floor(result.filingCreditBase! * 0.03)).toBe(result.filingCredit);
  });

  it("[C23b][INH-ECHO-3] 상속세 단기재상속공제(§30)>0 — echo 역산 일치", () => {
    // 산출세액 1억, 단기재상속 1년 경과(100% 공제율), 전 납부세액 3천만, 기한 내 신고
    const result = calcInheritanceTaxCredits({
      creditInput: {
        shortTermReinheritYears: 1,
        shortTermReinheritTaxPaid: 30_000_000,
        isFiledOnTime: true,
      },
      computedTax: 100_000_000,
      generationSkipSurcharge: 0,
      taxableEstateValue: 500_000_000,
    });

    // §30 단기재상속공제: 30M × 100% = 30M (한도 100M 내)
    expect(result.shortTermReinheritCredit).toBe(30_000_000);
    // echo: totalComputedTaxWithSurcharge = 100M
    expect(result.totalComputedTaxWithSurcharge).toBe(100_000_000);
    // filingCreditBase = 100M − 0(§28) − 0(§29) − 30M(§30) = 70M
    expect(result.filingCreditBase).toBe(70_000_000);
    // [INH-ECHO-3] 카드 역산 산식 일치: tWS − gift − foreign − shortTerm === base
    expect(
      result.totalComputedTaxWithSurcharge! -
        result.giftTaxCredit -
        result.foreignTaxCredit -
        result.shortTermReinheritCredit,
    ).toBe(result.filingCreditBase);
    // 신고세액공제: 70M × 3% = 2,100,000
    expect(result.filingCredit).toBe(2_100_000);
  });

  it("[R-10] 상속세 §30 재산별 자동 banding + echo (교재 2020.7.5→2022.10.10)", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        shortTermReinheritPriorDeathDate: "2020-07-05",
        shortTermReinheritTaxPaid: 440_000_000,
        shortTermReinheritPriorEstateValue: 4_300_000_000,
        shortTermReinheritAssets: [
          { name: "비상장주식", priorValue: 1_300_000_000 },
          { name: "토지1", priorValue: 700_000_000 },
          { name: "토지2", priorValue: 490_000_000 },
        ],
        isFiledOnTime: true,
      },
      computedTax: 704_000_000, // 2차 산출세액
      generationSkipSurcharge: 0,
      taxableEstateValue: 2_660_000_000,
      deathDate: "2022-10-10", // 2020-07-05 → band 3 (80%)
    });

    // 재산별 floor 합 = 203,832,555 (한도 704M 내 — §30③ 미클램핑)
    expect(result.shortTermReinheritCredit).toBe(203_832_555);
    expect(result.shortTermReinheritDetail).toBeDefined();
    expect(result.shortTermReinheritDetail!.band).toBe(3);
    expect(result.shortTermReinheritDetail!.creditRate).toBe(0.8);
    expect(result.shortTermReinheritDetail!.perAsset).toHaveLength(3);
    expect(result.shortTermReinheritDetail!.creditAmount).toBe(203_832_555);
    expect(result.shortTermReinheritDetail!.limit).toBe(704_000_000);
    // 신고세액공제: (704M − 203,832,555) × 3%
    expect(result.filingCredit).toBe(
      Math.floor((704_000_000 - 203_832_555) * 0.03),
    );
  });

  it("[C24] 증여세: 기한 내 신고 3% 공제 단독", () => {
    const result = calcGiftTaxCredits({
      creditInput: {
        isFiledOnTime: true,
      },
      computedTax: 50_000_000,
      generationSkipSurcharge: 0,
    });
    // 외국납부 0, 특례 0 → 신고세액공제: 50M × 3% = 1.5M
    expect(result.filingCredit).toBe(1_500_000);
    expect(result.totalCredit).toBe(1_500_000);
  });

  it("[C25] 세대생략 30% 할증 + 신고세액공제", () => {
    // 과세표준 5억, 산출세액 = 30% × 5억 - 6천만 = 9천만
    const taxBase = 500_000_000;
    const computedTax = calcInheritanceGiftTax(taxBase);
    // = 500M × 0.3 - 60M = 90,000,000
    expect(computedTax).toBe(90_000_000);

    const { surchargeAmount } = calcGenerationSkipSurcharge(
      computedTax,
      true,
      false,
      taxBase,
    );
    expect(surchargeAmount).toBe(27_000_000); // 90M × 30%

    const result = calcInheritanceTaxCredits({
      creditInput: { isFiledOnTime: true },
      computedTax,
      generationSkipSurcharge: surchargeAmount,
      taxableEstateValue: 500_000_000,
    });
    // 산출 + 할증 = 117M, 신고공제: 117M × 3% = 3,510,000
    expect(result.filingCredit).toBe(3_510_000);
    expect(result.totalCredit).toBe(3_510_000);

    // [INH-ECHO-1] echo: 할증 포함 산출세액 = 90M + 27M = 117M, 선행공제 0 → base = 117M
    expect(result.totalComputedTaxWithSurcharge).toBe(117_000_000);
    expect(result.filingCreditBase).toBe(117_000_000);
  });
});

// ============================================================
// 6. 공통 유틸 추가 검증
// ============================================================

describe("공통 유틸 — §14 장례비 공제", () => {
  // 일반 장례비 한도: 1,000만원 (시행령 §9 ①) / 봉안시설 추가: +500만원
  it("[C26] 장례비 800만 → 한도(1,000만) 내이므로 800만 공제", () => {
    const { deduction } = calcFuneralExpenseDeduction(8_000_000, false);
    expect(deduction).toBe(8_000_000);
  });

  it("[C27] 장례비 1,200만 → 일반 한도 1,000만으로 절사", () => {
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, false);
    expect(deduction).toBe(10_000_000);
  });

  it("[C28] 장례비 0원 → 최소값 500만 인정", () => {
    const { deduction } = calcFuneralExpenseDeduction(0, false);
    expect(deduction).toBe(5_000_000);
  });

  it("[C29] 봉안시설 포함 + 장례비 1,200만 → 봉안 한도(1,500만) 내이므로 1,200만 공제", () => {
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, true);
    expect(deduction).toBe(12_000_000);
  });

  it("[C30] 봉안시설 포함 + 장례비 2,000만 → 봉안 한도 1,500만으로 절사", () => {
    const { deduction } = calcFuneralExpenseDeduction(20_000_000, true);
    expect(deduction).toBe(15_000_000);
  });
});

describe("공통 유틸 — §26 누진세율", () => {
  it("[C31] 과세표준 0 → 세액 0", () => {
    expect(calcInheritanceGiftTax(0)).toBe(0);
  });

  it("[C32] 과세표준 1억 → 세액 1,000만 (10%)", () => {
    expect(calcInheritanceGiftTax(100_000_000)).toBe(10_000_000);
  });

  it("[C33] 과세표준 5억 → 세액 9,000만 (30% × 5억 - 6천만)", () => {
    // 5억은 정확히 [500M, 30%, 60M] 구간
    // 하지만 구간 경계: min=500_000_001이므로 5억은 [1억~5억] 구간
    // 5억: 20% × 500M - 10M = 90M
    expect(calcInheritanceGiftTax(500_000_000)).toBe(90_000_000);
  });

  it("[C34] 과세표준 30억 초과(31억) → 세액 50% × 31억 - 4.6억", () => {
    const tax = calcInheritanceGiftTax(3_100_000_000);
    expect(tax).toBe(Math.floor(3_100_000_000 * 0.5) - 460_000_000);
  });
});

describe("공통 유틸 — §13 사전증여 합산", () => {
  it("[C35] 10년 이내 상속인 증여 → 합산 포함", () => {
    const { totalAmount } = aggregatePriorGiftsForInheritance(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 100_000_000,
          giftTaxPaid: 0,
        },
      ],
      "2025-06-01",
    );
    expect(totalAmount).toBe(100_000_000);
  });

  it("[C36] 10년 초과 → 합산 제외", () => {
    const { totalAmount } = aggregatePriorGiftsForInheritance(
      [
        {
          giftDate: "2010-01-01",
          isHeir: true,
          giftAmount: 100_000_000,
          giftTaxPaid: 0,
        },
      ],
      "2025-06-01", // 15년 경과
    );
    expect(totalAmount).toBe(0);
  });
});

// ============================================================
// 7. §28① 단서 — 과세가액 5억 이하 증여세액공제 전면 배제 (M-2)
// ============================================================

describe("§28① 단서 — 과세가액 5억 이하 증여세액공제 배제 (M-2)", () => {
  /**
   * [Pre-Do anchor] 결함 발동 케이스:
   *   과세가액 4억(≤5억) + 비상속인 수유자 3억 유증으로 §24 ceiling 1억 →
   *   과세표준 1억(>0), 산출세액 1,000만, giftTaxPaid 500만.
   *   §28① 단서 미구현 현행: credit=5,000,000(과소결정세액).
   *   수정 후 올바른 값: credit=0 (과세가액 ≤5억 → 전면 배제).
   *
   * 수치 근거:
   *   ratioLimit(안분) = floor(50_000_000 × 10_000_000 / 100_000_000) = 5,000,000
   *   현행 credit = min(5_000_000, 5_000_000) = 5,000,000  ← 잘못됨
   *   §28① 단서 적용 후 credit = 0
   */
  it("[M2-BUG] 과세가액 4억(≤5억) + giftTaxPaid 500만 → 현행 credit=5,000,000 (버그 확인용 Pre-Do anchor)", () => {
    const result = calcGiftTaxCredit(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 50_000_000,
          giftTaxPaid: 5_000_000,
        },
      ],
      10_000_000,   // computedTax (산출세액)
      100_000_000,  // taxBase (과세표준)
      400_000_000,  // taxableEstateValue = 4억 (≤5억 → §28① 단서 대상)
    );
    // §28① 단서 미구현 전(현행): 5,000,000 → 수정 후: 0
    // 이 테스트는 수정 전 FAIL, 수정 후 PASS 되어야 함 (Pre-Do anchor)
    expect(result.creditAmount).toBe(0); // §28① 단서: 과세가액 ≤5억 → 전면 배제
  });

  it("[M2-FIX-1] 과세가액 정확히 5억(경계) → 배제 적용 (≤5억)", () => {
    // 과세가액 = 5억 정확히 → 단서 적용 → credit = 0
    const result = calcGiftTaxCredit(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 50_000_000,
          giftTaxPaid: 5_000_000,
        },
      ],
      10_000_000,   // computedTax
      100_000_000,  // taxBase
      500_000_000,  // taxableEstateValue = 정확히 5억 → 배제
    );
    expect(result.creditAmount).toBe(0); // ≤5억: 단서 적용
  });

  it("[M2-FIX-2] 과세가액 5억+1원(경계 초과) → 정상 공제 (>5억)", () => {
    // 과세가액 = 500_000_001 → 단서 미적용 → 정상 공제
    // ratioLimit = floor(50M × 10M / 100M) = 5_000_000
    // credit = min(5_000_000, 5_000_000) = 5_000_000
    const result = calcGiftTaxCredit(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 50_000_000,
          giftTaxPaid: 5_000_000,
        },
      ],
      10_000_000,   // computedTax
      100_000_000,  // taxBase
      500_000_001,  // taxableEstateValue = 5억+1 → 배제 없음
    );
    expect(result.creditAmount).toBe(5_000_000); // 정상 공제
  });

  it("[M2-FIX-3] 자기상쇄 통상 케이스: 과세가액 6억 + §21 일괄공제 5억 → 과세표준 0·산출세액 0 → credit 0", () => {
    // 통상 과세가액 ≤5억 케이스는 §21(5억)로 과세표준=0 → 산출세액=0 → credit=0 (자기상쇄)
    // 이 케이스는 과세가액 6억(>5억)이므로 단서 미적용, 산출세액 0이면 ratioLimit=0 → credit=0
    const result = calcGiftTaxCredit(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 50_000_000,
          giftTaxPaid: 3_000_000,
        },
      ],
      0,            // computedTax = 0 (과세표준 0 → 산출세액 0)
      0,            // taxBase = 0
      600_000_000,  // taxableEstateValue = 6억 (>5억, 단서 미적용이나 산출세액 0)
    );
    // ratioLimit = 0 → credit = 0 (자기상쇄 — §28① 단서 무관하게 결과 동일)
    expect(result.creditAmount).toBe(0);
  });

  it("[M2-FIX-4] 과세가액 4억, 사전증여 없음 → credit 0 (단서 무관)", () => {
    // priorGifts 없으면 totalGiftTaxPaid=0 → 기존 early-return → credit 0
    const result = calcGiftTaxCredit(
      [],
      10_000_000,
      100_000_000,
      400_000_000,
    );
    expect(result.creditAmount).toBe(0);
  });

  it("[M2-INTEGRATION] 통합 — 과세가액 4억 + 사전증여 500만 → calcInheritanceTaxCredits giftTaxCredit=0", () => {
    // calcInheritanceTaxCredits 통합 경로에서도 5억 배제 적용 확인
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 50_000_000,
            giftTaxPaid: 5_000_000,
          },
        ],
        isFiledOnTime: true,
      },
      computedTax: 10_000_000,
      generationSkipSurcharge: 0,
      taxableEstateValue: 400_000_000, // 4억 ≤5억 → §28① 단서
      taxBase: 100_000_000,
      deathDate: "2025-01-01",
    });
    // §28① 단서: credit = 0
    expect(result.giftTaxCredit).toBe(0);
    // 신고세액공제 기준: 10M − 0 = 10M → 10M × 3% = 300,000
    expect(result.filingCredit).toBe(300_000);
    expect(result.totalCredit).toBe(300_000);
  });
});
// M-9 §28 cutoff anchor는 파일 크기 정책상 분리:
// __tests__/tax-engine/inheritance/section28-gift-credit-cutoff.test.ts
