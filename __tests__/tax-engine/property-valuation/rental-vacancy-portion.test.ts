import { describe, it, expect } from "vitest";
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * §61⑤ 임대보증금 평가특례 — 미임대(공실) 부분 처리 anchor.
 * 계획: docs/00-pm/rental-conversion-vacancy-portion.plan.md
 * 법령: 상증법 §61⑤(임대 부동산 Max)·시행령 §50⑦⑧1호(임대료환산·소유자 동일 면적 안분)·
 *       시행규칙 §15의2(율 12%). 1동 일부 임대 시 구분 평가는 사전법령해석재산2020-(교재 인용·미검증).
 *
 * 평가액 = Max(전체 기준시가, 임대분 환산가액 + 미임대분 기준시가)
 *   미임대분 기준시가 = 미임대분 건물 기준시가(직접입력) + 미임대분 토지 기준시가
 *   미임대분 토지 기준시가 = 전체 부수토지 기준시가 × (미임대 건물면적 / 전체 건물면적)  [면적 직접 안분]
 */

const building = (p: Partial<EstateItem>): EstateItem => ({
  id: "vac1",
  name: "테스트 상가",
  category: "real_estate_building",
  ...p,
});

// 교재 사례 (서대문구 연희동 △빌딩, 2026.02.18 증여) 공통 입력
const TEXTBOOK = {
  standardPrice: 321_300_000, // 건물 전체 기준시가
  appurtenantLandStandardPrice: 330_000_000, // 부수토지 전체 개별공시지가
  monthlyRent: 2_000_000, // 연 24,000,000
  leaseDeposit: 500_000_000,
  totalBuildingArea: 720,
  vacantBuildingArea: 180,
  vacantBuildingStandardPrice: 75_600_000, // 4층 미임대
};

describe("§61⑤ 임대보증금 평가특례 — 미임대(공실) 부분", () => {
  it("[VAC-1] 교재 사례: Max(전체기준시가 651,300,000, 임대분 700,000,000 + 미임대분 158,100,000) = 858,100,000", () => {
    const r = evaluateEstateItem(building(TEXTBOOK));
    expect(r.method).toBe("standard_price");
    // 임대분 환산 = floor(2,000,000×12÷0.12) + 500,000,000 = 700,000,000
    // 미임대분 토지 = floor(330,000,000 × 180/720) = 82,500,000
    // 미임대분 기준시가 = 75,600,000 + 82,500,000 = 158,100,000
    expect(r.valuatedAmount).toBe(858_100_000);
  });

  it("[VAC-1b] breakdown에 임대분·미임대분 건물·미임대분 토지·합계 분해 표시", () => {
    const r = evaluateEstateItem(building(TEXTBOOK));
    const labels = r.breakdown.map((b) => b.label);
    expect(labels).toContain("§61⑤ 임대료환산가액 (임대분)");
    expect(labels).toContain("미임대분 건물 기준시가");
    expect(labels).toContain("미임대분 토지 기준시가 (면적안분)");
    const total = r.breakdown.find((b) => b.label === "임대보증금 평가특례 합계");
    expect(total?.amount).toBe(858_100_000);
    expect(r.breakdown.find((b) => b.label === "§61⑤ 임대료환산가액 (임대분)")?.amount).toBe(700_000_000);
    expect(r.breakdown.find((b) => b.label === "미임대분 건물 기준시가")?.amount).toBe(75_600_000);
    expect(r.breakdown.find((b) => b.label === "미임대분 토지 기준시가 (면적안분)")?.amount).toBe(82_500_000);
  });

  it("[VAC-2] 미임대 미입력(회귀): 임대료환산 단일 비교 = 700,000,000 (하위호환)", () => {
    const r = evaluateEstateItem(
      building({
        standardPrice: 321_300_000,
        appurtenantLandStandardPrice: 330_000_000,
        monthlyRent: 2_000_000,
        leaseDeposit: 500_000_000,
      }),
    );
    // 전체기준시가 651,300,000 < 임대료환산 700,000,000 → 700,000,000
    expect(r.valuatedAmount).toBe(700_000_000);
  });

  it("[VAC-3] 임대분 환산 + 미임대분 < 전체 기준시가: 전체 기준시가 채택", () => {
    // 전체기준시가 = 600,000,000 + 300,000,000 = 900,000,000
    // 특례 = 700,000,000 + (75,600,000 + floor(300,000,000×180/720)=75,000,000) = 850,600,000 < 900,000,000
    const r = evaluateEstateItem(
      building({
        standardPrice: 600_000_000,
        appurtenantLandStandardPrice: 300_000_000,
        monthlyRent: 2_000_000,
        leaseDeposit: 500_000_000,
        totalBuildingArea: 720,
        vacantBuildingArea: 180,
        vacantBuildingStandardPrice: 75_600_000,
      }),
    );
    expect(r.valuatedAmount).toBe(900_000_000);
  });

  it("[VAC-4] 경로 A 방어: 부수토지 미입력 + 미임대 입력 → 미임대분 토지 0(건물분만)", () => {
    // 전체기준시가 651,300,000(통합), 특례 = 700,000,000 + (75,600,000 + 0) = 775,600,000
    const r = evaluateEstateItem(
      building({
        standardPrice: 651_300_000,
        monthlyRent: 2_000_000,
        leaseDeposit: 500_000_000,
        totalBuildingArea: 720,
        vacantBuildingArea: 180,
        vacantBuildingStandardPrice: 75_600_000,
      }),
    );
    expect(r.valuatedAmount).toBe(775_600_000);
  });

  it("[VAC-5] 면적 안분 정밀(무한소수 100/720): floor 1원 정합", () => {
    // 미임대분 토지 = floor(330,000,000 × 100/720) = floor(45,833,333.33) = 45,833,333
    // 특례 = 700,000,000 + (75,600,000 + 45,833,333) = 821,433,333 > 651,300,000
    const r = evaluateEstateItem(
      building({
        standardPrice: 321_300_000,
        appurtenantLandStandardPrice: 330_000_000,
        monthlyRent: 2_000_000,
        leaseDeposit: 500_000_000,
        totalBuildingArea: 720,
        vacantBuildingArea: 100,
        vacantBuildingStandardPrice: 75_600_000,
      }),
    );
    expect(r.valuatedAmount).toBe(821_433_333);
  });

  it("[VAC-6] 시가 우선: marketValue 입력 시 특례 무시", () => {
    const r = evaluateEstateItem(building({ ...TEXTBOOK, marketValue: 1_000_000_000 }));
    expect(r.method).toBe("market_value");
    expect(r.valuatedAmount).toBe(1_000_000_000);
  });

  it("[VAC-7] §66 담보채권 하한 동시: Max(특례 858,100,000, 담보채권액)", () => {
    // 담보채권 = mortgageNet(900,000,000) + leaseDeposit(500,000,000) = 1,400,000,000 > 858,100,000
    const r = evaluateEstateItem(building({ ...TEXTBOOK, mortgageAmount: 900_000_000 }));
    expect(r.valuatedAmount).toBe(1_400_000_000);
  });
});
