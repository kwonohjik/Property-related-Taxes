import { describe, it, expect } from "vitest";
import {
  evaluateLand,
  evaluateApartment,
  evaluateDetachedHouse,
  evaluateBuilding,
  evaluateRentalConversion,
  evaluateFinancial,
  evaluateEstateItem,
  convertLeaseToValue,
} from "@/lib/tax-engine/property-valuation";
import {
  evaluateListedStock,
  evaluateListedStockValue,
  evaluateUnlistedStock,
  calcUnlistedStockPerShareValue,
  calcPerShareNetIncomeValue,
  calcPerShareNetAssetValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { detectBargainTransfer } from "@/lib/tax-engine/bargain-transfer";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼: 기본 자산 항목 생성
// ============================================================

const makeItem = (partial: Partial<EstateItem> & { category: EstateItem["category"] }): EstateItem => ({
  id: "test-1",
  name: "테스트 자산",
  ...partial,
});

// ============================================================
// 1. 부동산 평가 — property-valuation.ts
// ============================================================

describe("재산평가 — 부동산", () => {
  it("[T1] 토지 시가 우선 평가", () => {
    const item = makeItem({ category: "real_estate_land", marketValue: 200_000_000 });
    const result = evaluateLand(item);
    expect(result.valuatedAmount).toBe(200_000_000);
    expect(result.method).toBe("market_value");
  });

  it("[T2] 토지 보충적 평가 (개별공시지가) — 시가 없을 때", () => {
    const item = makeItem({ category: "real_estate_land", standardPrice: 150_000_000 });
    const result = evaluateLand(item);
    expect(result.valuatedAmount).toBe(150_000_000);
    expect(result.method).toBe("standard_price");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("[T3] 토지 저당권 차감", () => {
    const item = makeItem({
      category: "real_estate_land",
      marketValue: 200_000_000,
      mortgageAmount: 50_000_000,
    });
    const result = evaluateLand(item);
    expect(result.valuatedAmount).toBe(150_000_000);
  });

  it("[T4] 아파트 시가 — 임대보증금 차감", () => {
    const item = makeItem({
      category: "real_estate_apartment",
      marketValue: 800_000_000,
      leaseDeposit: 200_000_000,
    });
    const result = evaluateApartment(item);
    expect(result.valuatedAmount).toBe(600_000_000);
    expect(result.warnings.some(w => w.includes("임대보증금"))).toBe(true);
  });

  it("[T5] 아파트 보충적 평가 + 저당권 + 임대보증금 복합 차감", () => {
    const item = makeItem({
      category: "real_estate_apartment",
      standardPrice: 500_000_000,
      leaseDeposit: 100_000_000,
      mortgageAmount: 50_000_000,
    });
    const result = evaluateApartment(item);
    expect(result.valuatedAmount).toBe(350_000_000);
  });

  it("[T6] 단독주택 평가", () => {
    const item = makeItem({ category: "real_estate_building", marketValue: 600_000_000 });
    const result = evaluateDetachedHouse(item);
    expect(result.valuatedAmount).toBe(600_000_000);
    expect(result.method).toBe("market_value");
  });

  it("[T7] 건물(상업용) 보충적 평가", () => {
    const item = makeItem({ category: "real_estate_building", standardPrice: 300_000_000 });
    const result = evaluateBuilding(item);
    expect(result.valuatedAmount).toBe(300_000_000);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("[T8] 임대보증금 환산 헬퍼 (convertLeaseToValue — 임대수익 자본환원용)", () => {
    // 이 헬퍼는 §61 임대수익 환원율 계산에 사용 (보증금을 직접 자산화하는 용도가 아님)
    const converted = convertLeaseToValue(100_000_000);
    expect(converted).toBe(833_333_333);
  });

  it("[T9] 전세보증금 반환채권 평가 (evaluateRentalConversion) — 액면가 그대로", () => {
    // 설계 수정: 피상속인이 임차인으로서 맡긴 전세보증금 = 반환받을 채권
    // 채권 가치 = 액면가 (÷12% 환원은 임대수익 재산에 적용하는 공식으로 여기 맞지 않음)
    const item = makeItem({ category: "deposit", leaseDeposit: 100_000_000 });
    const result = evaluateRentalConversion(item);
    expect(result.valuatedAmount).toBe(100_000_000);
  });

  it("[T10] 금융재산 평가 (예금·펀드·채권)", () => {
    const item = makeItem({ category: "financial", marketValue: 50_000_000 });
    const result = evaluateFinancial(item);
    expect(result.valuatedAmount).toBe(50_000_000);
    expect(result.warnings).toHaveLength(0);
  });

  it("[T11] 현금 평가 — 액면가 = 시가, §22 금융재산공제 미적용 주석 포함", () => {
    const item = makeItem({ category: "cash", marketValue: 30_000_000 });
    const result = evaluateEstateItem(item);
    expect(result.valuatedAmount).toBe(30_000_000);
    expect(result.method).toBe("market_value");
    expect(result.breakdown[0].note).toContain("금융재산공제 대상 아님");
  });
});

// ============================================================
// 2. 주식 평가 — property-valuation-stock.ts
// ============================================================

describe("재산평가 — 주식", () => {
  it("[T11] 상장주식: 평균가 × 주식 수", () => {
    const value = evaluateListedStockValue(50_000, 1_000);
    expect(value).toBe(50_000_000);
  });

  it("[T12] 상장주식 evaluateListedStock", () => {
    const item = makeItem({
      category: "listed_stock",
      listedStockAvgPrice: 50_000,
      listedStockShares: 2_000,
    });
    const result = evaluateListedStock(item);
    expect(result.valuatedAmount).toBe(100_000_000);
    expect(result.method).toBe("market_value");
  });

  it("[T13] 비상장주식 1주당 순손익가치 (10% 환원율)", () => {
    // 1주당 가중평균 순손익 2,000원 ÷ 자본환원율 10% = 20,000원
    const value = calcPerShareNetIncomeValue(2_000, 0.10);
    expect(value).toBe(20_000);
  });

  it("[T14] 비상장주식 1주당 순자산가치 (주식 수 나눔)", () => {
    const value = calcPerShareNetAssetValue(1_000_000_000, 100_000);
    expect(value).toBe(10_000);
  });

  it("[T15] 비상장주식 일반법인 가중평균 (60:40)", () => {
    const data = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 200_000_000, // 1주당 순손익가치 = 2억 ÷ 0.1 = 20억 → 1주당 2만원
      netAssetValue: 500_000_000,     // 1주당 순자산가치 = 5천원
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 순손익가치: 200,000,000 / 0.1 / 100,000 = 20,000
    // 순자산가치: 500,000,000 / 100,000 = 5,000
    // 가중평균: (20,000*3 + 5,000*2) / 5 = (60,000 + 10,000) / 5 = 14,000
    expect(r.perShareIncomeValue).toBe(20_000);
    expect(r.perShareAssetValue).toBe(5_000);
    expect(r.perShareWeightedValue).toBe(14_000);
  });

  it("[T16] 비상장주식 최솟값 (순자산가치 80%) 적용", () => {
    const data = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 0, // 적자법인
      netAssetValue: 500_000_000,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 순손익가치 0 → 가중평균 = 순자산가치 40% = 5,000*2/5 = 2,000
    // 최솟값 = 5,000 * 80% = 4,000
    expect(r.perShareFinalValue).toBe(4_000);
    expect(r.perShareMinValue).toBe(4_000);
  });

  it("[T17] 비상장주식 부동산과다보유법인 가중치 (40:60)", () => {
    const data = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 200_000_000,
      netAssetValue: 500_000_000,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, true); // isRealEstateHeavy
    // (20,000*2 + 5,000*3) / 5 = (40,000 + 15,000) / 5 = 11,000
    expect(r.perShareWeightedValue).toBe(11_000);
  });

  it("[T17b] 비상장주식 evaluateUnlistedStock 총 평가액 확인", () => {
    const item = makeItem({
      category: "unlisted_stock",
      unlistedStockData: {
        totalShares: 100_000,
        ownedShares: 10_000,
        weightedNetIncome: 200_000_000,
        netAssetValue: 500_000_000,
        capitalizationRate: 0.10,
      },
    });
    const result = evaluateUnlistedStock(item, false);
    // perShareFinalValue = 14,000 * 10,000주 = 140,000,000
    expect(result.valuatedAmount).toBe(140_000_000);
  });
});

// ============================================================
// 3. 저가·고가 양도 증여의제 판정 — bargain-transfer.ts
// ============================================================

describe("저가·고가 양도 증여의제 (상증법 §35)", () => {
  it("[T18a] 특수관계인 — 30% 초과: 과세 대상", () => {
    const result = detectBargainTransfer({
      transactionPrice: 600_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: true,
      transactionType: "purchase",
    });
    // 차액 4억 > 시가30%(3억) AND 3억 → 과세
    expect(result.isSubjectToGiftTax).toBe(true);
    expect(result.deemedGiftAmount).toBe(400_000_000);
  });

  it("[T18b] 특수관계인 — 차액 3억 이상 (30% 미만)도 과세", () => {
    // 시가 11억, 거래가 8억 → 차액 3억(27%) — 30% 미만이지만 3억 이상 → 특수관계인 과세
    const result = detectBargainTransfer({
      transactionPrice: 800_000_000,
      marketValue: 1_100_000_000,
      isRelatedParty: true,
      transactionType: "purchase",
    });
    expect(result.isSubjectToGiftTax).toBe(true);
    expect(result.thresholdCheck.rateThresholdMet).toBe(false);
    expect(result.thresholdCheck.absoluteThresholdMet).toBe(true);
  });

  it("[T18c] 비특수관계인 — 30% 이상 but 3억 미만: 비과세", () => {
    // 시가 5천만, 거래가 3천만 → 차액 2천만 (40%) — 30% 초과지만 3억 미만
    const result = detectBargainTransfer({
      transactionPrice: 30_000_000,
      marketValue: 50_000_000,
      isRelatedParty: false,
      transactionType: "purchase",
    });
    expect(result.isSubjectToGiftTax).toBe(false);
  });

  it("[T18d] 비특수관계인 — 30% 이상 AND 3억 이상: 과세 (§35 ② 단서 공제 적용)", () => {
    // 시가 10억, 거래가 6억 → 차액 4억 (40%) — 두 기준 모두 충족
    // §35 ② 단서: 비특수관계인 공제 = min(시가×30%, 3억) = min(3억, 3억) = 3억
    // 증여의제 이익 = 4억 - 3억 = 1억
    const result = detectBargainTransfer({
      transactionPrice: 600_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: false,
      transactionType: "purchase",
    });
    expect(result.isSubjectToGiftTax).toBe(true);
    expect(result.deemedGiftAmount).toBe(100_000_000); // 4억 - min(3억, 3억) = 1억
  });

  it("[T18e] 고가 양도 — 수증인=매도인 (transactionType: sale)", () => {
    const result = detectBargainTransfer({
      transactionPrice: 1_400_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: true,
      transactionType: "sale",
    });
    expect(result.isSubjectToGiftTax).toBe(true);
    expect(result.deemedGiftAmount).toBe(400_000_000);
  });
});
