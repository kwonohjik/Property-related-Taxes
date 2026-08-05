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

describe("Case A — 의제취득일 전 상속·증여 max(①,②,③) (소령 §163⑨·§176조의2④)", () => {
  it("A-1: ③ 환산이 ①보다 큼 → ③ 채택", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
    });

    // ③ 환산 = 920,000,000 × 50,000,000 / 250,000,000 = 184,000,000, ① 없음 → ③ 채택
    expect(r.acquisitionPrice).toBe(184_000_000);
    expect(r.method).toBe("pre_deemed_max");
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(184_000_000);
    expect(r.preDeemedBreakdown?.reportedAmount).toBeNull();
  });

  it("A-2: ① 상증법 평가액(신고가액)이 ②③보다 큼 → ① 채택 (실제공제)", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      reportedValue: 1_000_000_000, // ① 상증법 평가액
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
    });

    // ① 1,000,000,000 > ③ 184,000,000 > ② 50,000,000
    expect(r.acquisitionPrice).toBe(1_000_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("reported");
    expect(r.preDeemedBreakdown?.reportedAmount).toBe(1_000_000_000);
  });

  it("A-3: ①② 부존재 → ③ 환산 채택 (개산공제)", () => {
    // ⚠️ 종전에는 `reportedValue: 1_000`(① 미미)을 두고 "③이 ①②보다 크므로 ③ 채택"을 기대했다.
    //    법 §97①1호 단서상 **가목이 확인되면 금액 크기와 무관하게 나목에 도달하지 않으므로**
    //    그 기대는 성립하지 않는다(①=1,000이면 취득가액도 1,000이다 — 오입력은 validate 계층의 몫).
    //    이 anchor의 의도는 「③ 채택 + 개산공제」이므로 **①②가 모두 부존재**하는 형태로 고쳤다.
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 200_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
    });

    // ③ 환산 = 920M × 200M/250M = 736,000,000
    expect(r.preDeemedBreakdown?.convertedAmount).toBe(736_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.acquisitionPrice).toBe(736_000_000);
  });

  it("A-4: 후보 정보 모두 부족 → acquisitionPrice=0 + warnings", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      // reportedValue, standardPriceAtDeemedDate, transferPrice 모두 미입력
    });

    expect(r.acquisitionPrice).toBe(0);
    expect(r.method).toBe("pre_deemed_max");
    expect(r.warnings).toBeDefined();
    expect(r.warnings!.length).toBeGreaterThan(0);
  });

  it("A-5: standardPriceAtTransfer=0 → 환산 불가(=0), ① 없으면 취득가=0 (throw 하지 않음)", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 0, // ③ 환산 분모 0 → converted=0
    });

    // ③=0, ① 없음 → 취득가=0 + warnings (§164 raw는 후보 아님 — Phase 2)
    expect(r.acquisitionPrice).toBe(0);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.warnings).toBeDefined();
  });

  it("A-6: PDF 첨부 이미지 사례 — ③ 환산취득가 채택 (소령 §176조의2④, ① 없음)", () => {
    // 1983.7.26. 상속 / 2023.2.16. 양도 / 양도가 920,000,000원
    // ③ 환산 = 920,000,000 × (의제취득일 기준시가 ÷ 양도시 기준시가) = 149,878,732원(floor)
    // ① 상증법 평가액 미입력 → ③ 환산 채택 (Excel/PDF anchor: 환산 선택)
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
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(r.acquisitionPrice).toBe(expectedConverted);
    expect(r.method).toBe("pre_deemed_max");
  });

  it("A-7: 물가상승률 방식 제거 — 피상속인 실가·취득일 입력해도 무시 (max(①,②,③)만)", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BEFORE_DEEMED,
      assetKind: "house_individual",
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000,
      transferDate: new Date("2023-02-16"),
      decedentActualPrice: 10_000_000_000, // 100억 — 반영되면 이게 채택될 값(무시되어야 함)
      decedentAcquisitionDate: new Date("1983-07-26"),
    });

    // 물가상승률 미적용 → max(0, 50M, 184M) = 184M(③ 환산). 100억 무시.
    expect(r.acquisitionPrice).toBe(184_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
    // inflationAdjustedAmount 필드 자체가 제거됨
    expect(
      (r.preDeemedBreakdown as unknown as Record<string, unknown>).inflationAdjustedAmount,
    ).toBeUndefined();
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

// ─── pre-deemed §163⑨1호·2호 — ②(§164④~⑦) max 비교 ────────────────────────
//
// 계획서: docs/02-design/features/inheritance-pre-deemed-164-max.plan.md
//
// 「소득세법 시행령」 §163⑨은 **의제취득일로 나뉘지 않는다** — 조건은 오직
// 「기준시가 고시 전 상속·증여」다(1호 토지 §164④ / 2호 건물 §164⑤~⑦).
// 1985년 이전 상속이면 개별공시지가(1990)·건물 기준시가(2005) 둘 다 고시 전이라 당연히 해당한다.
// ⇒ post-deemed와 **같은 조문**이 근거인데 현행은 post에서만 ②를 비교한다.
describe("pre-deemed §163⑨ — ②(§164④~⑦ 취득당시 기준시가) max 비교", () => {
  /** ③ 환산 = 5억 × 5천만 ÷ 2.5억 = 1억 */
  const CONVERTED_BASE = {
    inheritanceDate: new Date("1984-12-31"),
    assetKind: "house_individual" as const,
    transferPrice: 500_000_000,
    standardPriceAtDeemedDate: 50_000_000,
    standardPriceAtTransfer: 250_000_000,
  };

  it("P-1 ②가 ①·③보다 크면 ②가 취득가액이 된다", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...CONVERTED_BASE,
      reportedValue: 100_000_000, // ①
      houseValuationStdPrice: 150_000_000, // ② §164⑦ — 가장 크다
    });

    // 현행은 max(①,③)=1억만 보고 ②를 무시한다 → 취득가액 과소 → 세액 과대
    expect(r.acquisitionPrice).toBe(150_000_000);
  });

  it("P-7 ② 미주입이면 현행과 동일 — opt-in 회귀 0", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...CONVERTED_BASE,
      reportedValue: 100_000_000,
    });

    expect(r.method).toBe("pre_deemed_max");
    expect(r.acquisitionPrice).toBe(100_000_000);
  });
});

/**
 * V-3 — 가목(§163⑨) 우선, 나목(③ 환산)은 가목 확인 불가 시에만.
 *
 * 근거: 「소득세법」법 §97①1호 **단서** — "가목의 실지거래가액을 확인할 수 없는 경우에
 *       **한정하여** 나목의 금액을 적용한다".
 *       시행령 §163⑫가 나목 = §176조의2②~④로 정하므로 ③(환산)은 **나목**이고,
 *       §163⑨이 상속·증여 자산의 상증법 평가액을 실지거래가액으로 보므로 ①②는 **가목**이다.
 * 판례·심판례: 대법원 2006두1326 · 국심2003부0627(pre-deemed 정면 — 처분청의 §176조의2④
 *       환산 경정을 취소) · 조심2018서0513("체계상 환산가액 규정보다 실지거래가액 규정을 먼저 적용").
 */
describe("pre-deemed 가목 우선 — ③ 환산은 가목 확인 불가 시에만", () => {
  const BASE = {
    inheritanceDate: new Date("1984-12-31"),
    assetKind: "house_individual" as const,
    // ③ 환산 = 920,000,000 × 200,000,000 / 250,000,000 = 736,000,000
    transferPrice: 920_000_000,
    standardPriceAtDeemedDate: 200_000_000,
    standardPriceAtTransfer: 250_000_000,
  };

  it("W-1: ②만 확인되면 ③이 더 커도 ②가 취득가액이다", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BASE,
      houseValuationStdPrice: 300_000_000, // ② < ③(736M)
    });

    expect(r.acquisitionPrice).toBe(300_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("sec164");
  });

  it("W-2: ①만 확인되면 ③이 더 커도 ①이 취득가액이다", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BASE,
      reportedValue: 400_000_000, // ① < ③(736M)
    });

    expect(r.acquisitionPrice).toBe(400_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("reported");
  });

  it("W-3: ①② 모두 있으면 그중 큰 값 — ③은 비교 대상이 아니다", () => {
    const r = calculateInheritanceAcquisitionPrice({
      ...BASE,
      reportedValue: 400_000_000, // ①
      houseValuationStdPrice: 500_000_000, // ② — 가목 안에서 최대
    });

    expect(r.acquisitionPrice).toBe(500_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("sec164");
  });

  it("W-4(회귀): ①② 모두 부존재면 ③ 환산 — 가목 확인 불가", () => {
    const r = calculateInheritanceAcquisitionPrice(BASE);

    expect(r.acquisitionPrice).toBe(736_000_000);
    expect(r.preDeemedBreakdown?.selectedMethod).toBe("converted");
  });

  it("W-5: 가목이 채택되면 selectedMethod가 converted가 아니다 — 개산공제 게이트 자동 배제", () => {
    // §163⑥ 개산공제는 추계(나목)에만 적용된다. 가목은 실제 필요경비 공제.
    const r = calculateInheritanceAcquisitionPrice({
      ...BASE,
      reportedValue: 400_000_000,
    });

    expect(r.preDeemedBreakdown?.selectedMethod).not.toBe("converted");
  });
});
