/**
 * 상속·증여 자산 취득가액 산정 엔진 테스트
 *
 * 근거: 소득세법 §97 + 시행령 §163 ⑨, 상증법 §60~§61
 *       소득세법 시행령 §176조의2 ④ (의제취득일 전 상속 물가상승률 환산)
 * PDF: 2023 양도·상속·증여세 이론 및 계산실무 p387~391, 이미지 §13 계산 사례
 */

import { describe, it, expect } from "vitest";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { DEEMED_ACQUISITION_DATE } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import {
  INHERITANCE_DATE,
  INHERIT_LAND_PRICE_PER_M2,
  LAND_AREA_M2,
  INHERIT_HOUSE_PRICE,
  INHERIT_LAND_SUPPLEMENTARY,
} from "../fixtures/pdf-bundled-farmland";
import { BEFORE_DEEMED, AFTER_DEEMED, PDF_SCENARIO } from "./_helpers/inheritance-fixture";

describe("calculateInheritanceAcquisitionPrice — 소득령 §163⑨ · 상증법 §60~§61", () => {
  describe("보충적평가액 (우선순위 3)", () => {
    it("토지: 개별공시지가 × 면적 = 9,516,000원 (PDF 사례)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
      });

      expect(r.acquisitionPrice).toBe(INHERIT_LAND_SUPPLEMENTARY); // 793 × 12,000 = 9,516,000
      expect(r.method).toBe("supplementary");
      expect(r.legalBasis).toContain("§163");
      expect(r.legalBasis).toContain("§61");
    });

    it("개별주택: 개별주택가격 그대로 = 108,000,000원 (PDF 사례)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: INHERIT_HOUSE_PRICE,
      });

      expect(r.acquisitionPrice).toBe(INHERIT_HOUSE_PRICE);
      expect(r.method).toBe("supplementary");
    });

    it("공동주택: 공동주택가격 그대로", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_apart",
        publishedValueAtInheritance: 450_000_000,
      });

      expect(r.acquisitionPrice).toBe(450_000_000);
      expect(r.method).toBe("supplementary");
    });
  });

  describe("우선순위 결정", () => {
    it("시가 지정 시 시가 우선 (보충적평가액 무시)", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
        marketValue: 50_000_000, // 시가
      });

      expect(r.acquisitionPrice).toBe(50_000_000);
      expect(r.method).toBe("market_value");
      expect(r.legalBasis).toContain("§60 ①");
    });

    it("감정가 평균 지정 + 시가 없음 → 감정가 적용", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: 100_000_000,
        appraisalAverage: 120_000_000,
      });

      expect(r.acquisitionPrice).toBe(120_000_000);
      expect(r.method).toBe("appraisal");
      expect(r.legalBasis).toContain("§60 ⑤");
    });

    it("시가 + 감정가 모두 지정 → 시가 우선", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_apart",
        publishedValueAtInheritance: 300_000_000,
        marketValue: 500_000_000,
        appraisalAverage: 400_000_000,
      });

      expect(r.acquisitionPrice).toBe(500_000_000);
      expect(r.method).toBe("market_value");
    });

    it("시가·감정가 0 이하면 보충적평가액으로 fallback", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: 100,
        publishedValueAtInheritance: 50_000,
        marketValue: 0,
        appraisalAverage: 0,
      });

      expect(r.acquisitionPrice).toBe(5_000_000);
      expect(r.method).toBe("supplementary");
    });
  });

  describe("입력 검증", () => {
    it("토지에 landAreaM2 미지정 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "land",
          publishedValueAtInheritance: 12_000,
        }),
      ).toThrow(/landAreaM2/);
    });

    it("토지 면적 0 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "land",
          landAreaM2: 0,
          publishedValueAtInheritance: 12_000,
        }),
      ).toThrow(/landAreaM2/);
    });

    it("음수 공시가격 → 에러", () => {
      expect(() =>
        calculateInheritanceAcquisitionPrice({
          inheritanceDate: INHERITANCE_DATE,
          assetKind: "house_individual",
          publishedValueAtInheritance: -1,
        }),
      ).toThrow(/publishedValueAtInheritance/);
    });
  });

  describe("formula 설명 문자열", () => {
    it("토지 보충적평가액 formula", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "land",
        landAreaM2: LAND_AREA_M2,
        publishedValueAtInheritance: INHERIT_LAND_PRICE_PER_M2,
      });
      expect(r.formula).toContain("12,000");
      expect(r.formula).toContain("793");
      expect(r.formula).toContain("9,516,000");
    });

    it("주택 보충적평가액 formula", () => {
      const r = calculateInheritanceAcquisitionPrice({
        inheritanceDate: INHERITANCE_DATE,
        assetKind: "house_individual",
        publishedValueAtInheritance: INHERIT_HOUSE_PRICE,
      });
      expect(r.formula).toContain("개별주택가격");
      expect(r.formula).toContain("108,000,000");
    });
  });
});

// ─── 의제취득일 경계 분기 ─────────────────────────────────────────────────

describe("의제취득일(1985.1.1.) 경계 분기 — 소령 §176조의2④", () => {
  it("D-1: 1984-12-31 상속 → case A (pre-deemed) 분기", () => {
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date("1984-12-31"),
      assetKind: "house_individual",
      transferPrice: 500_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
    });
    expect(r.method).toBe("pre_deemed_max");
  });

  it("D-2: 1985-01-01 상속 → case B (post-deemed) 분기", () => {
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date("1985-01-01"),
      assetKind: "house_individual",
      reportedValue: 200_000_000,
      reportedMethod: "supplementary",
    });
    expect(r.method).toBe("supplementary");
    expect(r.acquisitionPrice).toBe(200_000_000);
  });

  it("DEEMED_ACQUISITION_DATE 상수 = 1985-01-01", () => {
    expect(DEEMED_ACQUISITION_DATE.toISOString().startsWith("1985-01-01")).toBe(true);
  });
});

// ─── Case A: 의제취득일 전 상속 ──────────────────────────────────────────

describe("Case A — 의제취득일 전 상속 (소령 §176조의2 ④)", () => {
  it("A-1: 환산만 (피상속인 실가 미입증) — 환산값이 취득가로 선택", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
    });

    // 환산 = 920,000,000 × 50,000,000 / 250,000,000 = 184,000,000
    expect(r.acquisitionPrice).toBe(184_000_000);
    expect(r.method).toBe("pre_deemed_max");
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(184_000_000);
    expect(r.preDeemedBreakdown?.inflationAdjustedAmount).toBeNull();
  });

  it("A-2: 실가×CPI가 환산보다 큰 경우 → 실가×CPI 채택", () => {
    // 피상속인 실가 10억, CPI 비율 3배(가정) → 30억 > 환산 18.4억
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
      decedentActualPrice: 1_000_000_000,
      // decedentAcquisitionDate는 BEFORE_DEEMED에서 1983-07-26 설정됨
    });

    const converted = 184_000_000; // 920M × 50M/250M
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(converted);
    expect(r.preDeemedBreakdown?.inflationAdjustedAmount).not.toBeNull();
    // inflationAdjusted가 환산보다 크면 inflation 채택
    if (r.preDeemedBreakdown!.inflationAdjustedAmount! > converted) {
      expect(r.preDeemedBreakdown?.selectedMethod).toBe("inflation_adjusted");
      expect(r.acquisitionPrice).toBe(r.preDeemedBreakdown!.inflationAdjustedAmount);
    } else {
      expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
      expect(r.acquisitionPrice).toBe(converted);
    }
  });

  it("A-3: 환산이 실가×CPI보다 큰 경우 → 환산 채택", () => {
    // 피상속인 실가 1,000원(미미), 환산은 크게 나오도록 설정
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 200_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
      decedentActualPrice: 1_000, // 매우 작은 실가
    });

    // 환산 = 920M × 200M/250M = 736,000,000
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(736_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.acquisitionPrice).toBe(736_000_000);
  });

  it("A-4: 양쪽 정보 모두 부족 → acquisitionPrice=0 + warnings", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      // standardPriceAtDeemedDate, standardPriceAtTransfer, transferPrice 모두 미입력
    });

    expect(r.acquisitionPrice).toBe(0);
    expect(r.method).toBe("pre_deemed_max");
    expect(r.warnings).toBeDefined();
    expect(r.warnings!.length).toBeGreaterThan(0);
  });

  it("A-5: standardPriceAtTransfer=0 → converted=0, throw 하지 않음", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 0, // 분모 0
    });

    expect(r.acquisitionPrice).toBe(0);
    expect(r.warnings).toBeDefined();
  });

  it("A-6: PDF 첨부 이미지 사례 — 환산취득가 산정 (소령 §176조의2④)", () => {
    // 1983.7.26. 상속 / 2023.2.16. 양도 / 양도가 920,000,000원
    // 의제취득일(1985.1.1.) 개별공시지가 1,100,000원/㎡ × 184.2㎡ = 202,620,000원
    // 양도시(2022.1.1.) 개별공시지가 6,750,000원/㎡ × 184.2㎡ = 1,243,350,000원
    // 환산취득가 = 920,000,000 × 202,620,000 / 1,243,350,000 = 149,878,732원(floor)
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: PDF_SCENARIO.inheritanceDate,
      assetKind: PDF_SCENARIO.assetKind,
      transferPrice: PDF_SCENARIO.transferPrice,
      standardPriceAtDeemedDate: PDF_SCENARIO.standardPriceAtDeemedDate,
      standardPriceAtTransfer: PDF_SCENARIO.standardPriceAtTransfer,
      transferDate: PDF_SCENARIO.transferDate,
    });

    const expectedConverted = Math.floor(
      920_000_000 * PDF_SCENARIO.standardPriceAtDeemedDate / PDF_SCENARIO.standardPriceAtTransfer,
    );
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(expectedConverted);
    expect(r.method).toBe("pre_deemed_max");
  });

  it("A-7: CPI 범위 외 취득 연도 → warnings에 'CPI 데이터 범위 외' 포함", () => {
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date("1960-01-01"), // 의제취득일 전
      assetKind: "house_individual",
      transferDate: new Date("2023-02-16"),
      decedentActualPrice: 10_000_000,
      decedentAcquisitionDate: new Date("1960-01-01"), // CPI_MIN_YEAR(1965) 미만
    });

    expect(r.warnings).toBeDefined();
    expect(r.warnings!.some((w) => w.includes("CPI"))).toBe(true);
  });

  it("A-8: 피상속인 실가 있는데 취득일 미입력 → throw", () => {
    expect(() =>
      calculateInheritanceAcquisitionPrice({
        ...BEFORE_DEEMED,
        assetKind: "house_individual",
        decedentActualPrice: 10_000_000,
        // decedentAcquisitionDate 없음
        decedentAcquisitionDate: undefined,
      }),
    ).toThrow(/decedentAcquisitionDate/);
  });
});

// ─── Case B: 의제취득일 이후 상속 ────────────────────────────────────────

describe("Case B — 의제취득일 이후 상속 (소령 §163 ⑨ · 상증법 §60)", () => {
  it("B-1: 매매사례가액 신고 → 그대로 취득가", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "house_individual",
      reportedValue: 500_000_000,
      reportedMethod: "market_value",
    });

    expect(r.acquisitionPrice).toBe(500_000_000);
    expect(r.method).toBe("market_value");
    expect(r.legalBasis).toContain("§60 ①");
  });

  it("B-2: 감정평가액 신고", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "house_individual",
      reportedValue: 480_000_000,
      reportedMethod: "appraisal",
    });

    expect(r.acquisitionPrice).toBe(480_000_000);
    expect(r.method).toBe("appraisal");
    expect(r.legalBasis).toContain("§60 ⑤");
  });

  it("B-3: 보충적평가액 신고 — 토지 184.2㎡ × 5,804,000 anchor", () => {
    // PDF 이미지 표: 2019.1.1. 개별공시지가 5,804,000원/㎡
    const reportedValue = Math.floor(5_804_000 * 184.2); // 1,069,096,800

    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "land",
      landAreaM2: 184.2,
      reportedValue,
      reportedMethod: "supplementary",
    });

    expect(r.acquisitionPrice).toBe(1_069_096_799); // floor(5,804,000 × 184.2) — JS 부동소수점
    expect(r.method).toBe("supplementary");
    expect(r.legalBasis).toContain("§61");
  });

  it("B-4: 수용·경매·공매가액 신고", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "land",
      landAreaM2: 100,
      reportedValue: 600_000_000,
      reportedMethod: "auction_public_sale",
    });

    expect(r.acquisitionPrice).toBe(600_000_000);
    expect(r.method).toBe("auction_public_sale");
    expect(r.legalBasis).toContain("§60 ②");
  });

  it("B-5: 유사매매사례가액 신고", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "house_apart",
      reportedValue: 550_000_000,
      reportedMethod: "similar_sale",
    });

    expect(r.acquisitionPrice).toBe(550_000_000);
    expect(r.method).toBe("similar_sale");
    expect(r.legalBasis).toContain("§49");
  });

  it("B-6: 신고가액 미입력 → 기존 폴백(시가) 동작", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "house_individual",
      marketValue: 500_000_000,
      // reportedValue / reportedMethod 미입력
    });

    expect(r.acquisitionPrice).toBe(500_000_000);
    expect(r.method).toBe("market_value");
  });

  it("B-7: 신고가액 + 신고방법 모두 없음 → 보충적평가 폴백", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...AFTER_DEEMED,
      assetKind: "house_individual",
      publishedValueAtInheritance: 300_000_000,
    });

    expect(r.acquisitionPrice).toBe(300_000_000);
    expect(r.method).toBe("supplementary");
  });
});
