/**
 * Anchor — G-4 합산배제증여재산 §55① 호분기 + 증여의제 플래그(H-40) + 2스트림 격리(H-30) + M-2
 *
 * 법령(법제처 검증 2026-07-17, mst 276123):
 *  - §47① 합산배제증여재산 = §31①3호·§40①2·3호·§41의3·§41의5·§42의3·§45·§45의2~§45의4
 *  - §55① 과세표준 호분기:
 *      1호 §45의2 명의신탁: 명의신탁재산금액 (3천만 공제 없음)
 *      2호 §45의3·§45의4 일감몰아주기·사업기회: 증여의제이익 (3천만 공제 없음)
 *      3호 그 밖의 합산배제: 증여재산가액 − 3천만
 *
 * 세율(2025): ≤1억 10%·≤5억 20%(누진공제 1천만)·≤10억 30%(누진공제 6천만).
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { calcAggregationExcludedStream } from "@/lib/tax-engine/gift-aggregation-excluded-stream";
import { DEFAULT_INHERITANCE_GIFT_BRACKETS } from "@/lib/tax-engine/inheritance-gift-common";
import { calcNomineeTrustGift } from "@/lib/tax-engine/gift-deemed/nominee-trust";
import { calcValueIncreaseGift } from "@/lib/tax-engine/gift-deemed/value-increase";
import { calcAcquisitionFundPresumption } from "@/lib/tax-engine/gift-deemed/acquisition-fund-presumption";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function aggExclItem(
  cls: "nominee_trust" | "deemed_profit" | "general" | undefined,
  amount: number,
  id = "ae",
): EstateItem {
  return {
    id,
    category: "other",
    name: "합산배제",
    marketValue: amount,
    isAggregationExcludedGift: true,
    ...(cls ? { aggregationExcludedClass: cls } : {}),
  };
}

function baseInput(items: EstateItem[]): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "father",
    giftItems: items,
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: false },
  };
}

describe("G-4 §55① 호분기 — 합산배제 과세표준 (calcGiftTax)", () => {
  it("[G4-1호] 명의신탁(§45의2): 650M → 과세표준 650M (3천만 공제 없음)", () => {
    const r = calcGiftTax(baseInput([aggExclItem("nominee_trust", 650_000_000)]));
    expect(r.aggregationExcludedDetail?.taxBase).toBe(650_000_000);
    // 650M×30% − 6천만 = 135M
    expect(r.aggregationExcludedDetail?.finalTax).toBe(135_000_000);
    expect(r.finalTax).toBe(135_000_000);
  });

  it("[G4-2호] 일감몰아주기(§45의3): 650M → 과세표준 650M (3천만 공제 없음)", () => {
    const r = calcGiftTax(baseInput([aggExclItem("deemed_profit", 650_000_000)]));
    expect(r.aggregationExcludedDetail?.taxBase).toBe(650_000_000);
    expect(r.aggregationExcludedDetail?.finalTax).toBe(135_000_000);
  });

  it("[G4-3호] 그 밖의 합산배제(general/undef): 650M → 620M (−3천만, 현행 보존)", () => {
    const r = calcGiftTax(baseInput([aggExclItem(undefined, 650_000_000)]));
    expect(r.aggregationExcludedDetail?.taxBase).toBe(620_000_000);
    // 620M×30% − 6천만 = 126M
    expect(r.aggregationExcludedDetail?.finalTax).toBe(126_000_000);
  });

  it("[G4-MIXED] 1호 500M + 3호 650M: 호별 과세표준 (500M) + (620M) 별도 산출세액", () => {
    const r = calcGiftTax(
      baseInput([
        aggExclItem("nominee_trust", 500_000_000, "n1"),
        aggExclItem(undefined, 650_000_000, "g1"),
      ]),
    );
    // 1호 500M → 500M×20% − 1천만 = 90M ; 3호 620M → 126M ; 합계 216M
    expect(r.aggregationExcludedDetail?.grossValue).toBe(1_150_000_000);
    expect(r.aggregationExcludedDetail?.taxBase).toBe(1_120_000_000); // 500M + 620M
    expect(r.aggregationExcludedDetail?.finalTax).toBe(216_000_000);
    expect(r.finalTax).toBe(216_000_000);
  });
});

describe("G-4 M-2 — 감정평가수수료 이중공제 방지 (스트림 단위)", () => {
  const appraised: EstateItem = {
    id: "re",
    category: "other",
    name: "부동산",
    appraisedValue: 300_000_000,
    valuationMethod: "appraisal",
    isAggregationExcludedGift: true,
  };
  const streamInput = {
    ...baseInput([appraised]),
    appraisalFee: { realEstateAppraisalFee: 5_000_000 },
  } as GiftTaxInput;

  it("[M2-OFF] 일반 스트림 미차감 → 합산배제 스트림이 수수료 5M 차감 (과세표준 265M)", () => {
    const s = calcAggregationExcludedStream(
      [appraised],
      streamInput,
      DEFAULT_INHERITANCE_GIFT_BRACKETS,
      false,
    );
    expect(s.appraisalFee).toBe(5_000_000);
    expect(s.taxBase).toBe(265_000_000); // 300M − 5M − 3천만
  });

  it("[M2-ON] 일반 스트림 이미 차감 → 합산배제 스트림 재차감 금지 (수수료 0, 과세표준 270M)", () => {
    const s = calcAggregationExcludedStream(
      [appraised],
      streamInput,
      DEFAULT_INHERITANCE_GIFT_BRACKETS,
      true,
    );
    expect(s.appraisalFee).toBe(0);
    expect(s.taxBase).toBe(270_000_000); // 300M − 0 − 3천만
  });
});

describe("G-4 H-30 — 2스트림(조특법 특례) 경로 합산배제 격리", () => {
  function financial(id: string, amount: number, isSpecial?: boolean): EstateItem {
    return { id, category: "financial", name: id, marketValue: amount, isSpecialTreatmentAsset: isSpecial };
  }
  const twoStreamBase: GiftTaxInput = {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      financial("startup-30b", 3_000_000_000, true),
      financial("land-5b", 500_000_000, false),
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
    creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
  };

  it("[H30-BASE] 합산배제 자산 없음 → 현행 2스트림 동작 보존", () => {
    const r = calcGiftTax(twoStreamBase);
    expect(r.ordinaryStreamTax).toBe(77_600_000);
    expect(r.specialStreamTax).toBe(250_000_000);
    expect(r.finalTax).toBe(327_600_000);
    expect(r.aggregationExcludedDetail).toBeUndefined();
  });

  it("[H30-SEP] 특례+합산배제 병존 → 합산배제는 3번째 스트림으로 격리 (일반 스트림 불변)", () => {
    const r = calcGiftTax({
      ...twoStreamBase,
      giftItems: [...twoStreamBase.giftItems, aggExclItem(undefined, 650_000_000, "lg")],
    });
    // 합산배제 650M이 일반 스트림에 합산되지 않음 → ordinaryStreamTax 불변
    expect(r.ordinaryStreamTax).toBe(77_600_000);
    // 별도 §55①3호 스트림: 620M → 산출세액 126M − §69 신고세액공제 3%(2025, isFiledOnTime) = 122,220,000
    expect(r.aggregationExcludedDetail?.taxBase).toBe(620_000_000);
    expect(r.aggregationExcludedDetail?.finalTax).toBe(122_220_000);
    // 최종 = 특례 + 일반 + 합산배제
    expect(r.finalTax).toBe(327_600_000 + 122_220_000);
  });
});

describe("G-4 H-40 — 증여의제 결과 합산배제 플래그·호분기", () => {
  it("[H40-명의신탁] §45의2 → aggregationExcluded + aggExclClass 'nominee_trust'", () => {
    const d = calcNomineeTrustGift({
      hasTaxAvoidancePurpose: true,
      valuationMode: "total",
      propertyValue: 100_000_000,
    });
    expect(d.aggregationExcluded).toBe(true);
    expect(d.aggExclClass).toBe("nominee_trust");
  });

  it("[H40-§42의3] value_increase → aggregationExcluded true, class undefined(3호)", () => {
    const d = calcValueIncreaseGift({
      currentValue: 0,
      acquisitionCost: 0,
      normalIncrease: 0,
      contribution: 0,
    });
    expect(d.aggregationExcluded).toBe(true);
    expect(d.aggExclClass).toBeUndefined();
  });

  it("[H40-§45] acquisition_fund → aggregationExcluded true, class undefined(3호)", () => {
    const d = calcAcquisitionFundPresumption({
      subType: "acquisition",
      acquisitionValue: 0,
      provenAmount: 0,
    });
    expect(d.aggregationExcluded).toBe(true);
    expect(d.aggExclClass).toBeUndefined();
  });
});
