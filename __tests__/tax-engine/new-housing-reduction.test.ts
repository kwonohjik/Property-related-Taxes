/**
 * 신축주택·미분양주택 양도소득세 감면 엔진 테스트
 *
 * 조세특례제한법 §98의2, §99①~⑥, §99의3 관련 케이스 커버
 */
import { describe, expect, it } from "vitest";
import {
  determineNewHousingReduction,
  type NewHousingReductionInput,
} from "@/lib/tax-engine/new-housing-reduction";
import type { NewHousingMatrixData } from "@/lib/tax-engine/schemas/rate-table.schema";

// ============================================================
// RULES 픽스처
// ============================================================

/**
 * 테스트용 신축주택 감면 매트릭스
 *
 * articles 구성:
 *   "99-1"    — §99 ①  2001.5.23~2003.6.30  수도권 과밀억제권역 외 신축
 *   "99-2-low" — §99 ②  2009.2.12~2010.2.11  비수도권 미분양 6억 이하 100%
 *   "99-2-mid" — §99 ②  6억 초과~9억 이하 80%
 *   "99-2-high"— §99 ②  9억 초과 60%
 *   "99-5-c"  — §99 ⑤  2013.4.1~2013.12.31  수도권 6억 이하
 *   "99-5-nc" — §99 ⑤  비수도권 3억 이하
 *   "99-6-c"  — §99 ⑥  2014.1.1~2014.12.31  수도권 6억 이하
 *   "99-6-nc" — §99 ⑥  비수도권 3억 이하
 *   "99-3-2"  — §99의3 ②  2013.4.1~2013.12.31  전국 6억 이하 미분양 60%
 *   "99-3-10" — §99의3 ⑩  2015.1.1~2015.12.31  전국 미분양 100%
 */
const RULES: NewHousingMatrixData = {
  type: "new_housing_matrix",
  articles: [
    // ── §99 ① ──────────────────────────────────────
    {
      code: "99-1",
      article: "§99 ①",
      acquisitionPeriod: { start: "2001-05-23", end: "2003-06-30" },
      region: "outside_overconcentration",
      maxAcquisitionPrice: null,
      maxArea: null,
      requiresFirstSale: true,
      requiresUnsoldCertificate: false,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: true,
      isExcludedFromMultiHouseSurcharge: true,
    },
    // ── §99 ② 취득가액 구간별 ──────────────────────
    {
      code: "99-2-low",
      article: "§99 ② (6억 이하)",
      acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
      region: "non_metropolitan",
      maxAcquisitionPrice: 600_000_000,
      maxArea: null,
      requiresFirstSale: false,
      requiresUnsoldCertificate: true,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: true,
      isExcludedFromMultiHouseSurcharge: true,
    },
    {
      code: "99-2-mid",
      article: "§99 ② (6억~9억)",
      acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
      region: "non_metropolitan",
      maxAcquisitionPrice: 900_000_000,
      maxArea: null,
      requiresFirstSale: false,
      requiresUnsoldCertificate: true,
      reductionScope: "capital_gain",
      reductionRate: 0.8,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: true,
      isExcludedFromMultiHouseSurcharge: true,
    },
    {
      code: "99-2-high",
      article: "§99 ② (9억 초과)",
      acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
      region: "non_metropolitan",
      maxAcquisitionPrice: null,
      maxArea: null,
      requiresFirstSale: false,
      requiresUnsoldCertificate: true,
      reductionScope: "capital_gain",
      reductionRate: 0.6,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: true,
      isExcludedFromMultiHouseSurcharge: true,
    },
    // ── §99 ⑤ ──────────────────────────────────────
    {
      code: "99-5-c",
      article: "§99 ⑤ (수도권)",
      acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
      region: "metropolitan",
      maxAcquisitionPrice: 600_000_000,
      maxArea: 85,
      requiresFirstSale: false,
      requiresUnsoldCertificate: false,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
    {
      code: "99-5-nc",
      article: "§99 ⑤ (비수도권)",
      acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
      region: "non_metropolitan",
      maxAcquisitionPrice: 300_000_000,
      maxArea: 85,
      requiresFirstSale: false,
      requiresUnsoldCertificate: false,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
    // ── §99 ⑥ ──────────────────────────────────────
    {
      code: "99-6-c",
      article: "§99 ⑥ (수도권)",
      acquisitionPeriod: { start: "2014-01-01", end: "2014-12-31" },
      region: "metropolitan",
      maxAcquisitionPrice: 600_000_000,
      maxArea: 85,
      requiresFirstSale: false,
      requiresUnsoldCertificate: false,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
    {
      code: "99-6-nc",
      article: "§99 ⑥ (비수도권)",
      acquisitionPeriod: { start: "2014-01-01", end: "2014-12-31" },
      region: "non_metropolitan",
      maxAcquisitionPrice: 300_000_000,
      maxArea: 85,
      requiresFirstSale: false,
      requiresUnsoldCertificate: false,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
    // ── §99의3 ② 미분양 60% ────────────────────────
    {
      code: "99-3-2",
      article: "§99의3 ②",
      acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
      region: "nationwide",
      maxAcquisitionPrice: 600_000_000,
      maxArea: null,
      requiresFirstSale: false,
      requiresUnsoldCertificate: true,
      reductionScope: "capital_gain",
      reductionRate: 0.6,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
    // ── §99의3 ⑩ 미분양 100% ──────────────────────
    {
      code: "99-3-10",
      article: "§99의3 ⑩",
      acquisitionPeriod: { start: "2015-01-01", end: "2015-12-31" },
      region: "nationwide",
      maxAcquisitionPrice: null,
      maxArea: null,
      requiresFirstSale: false,
      requiresUnsoldCertificate: true,
      reductionScope: "capital_gain",
      reductionRate: 1.0,
      fiveYearWindowRule: true,
      isExcludedFromHouseCount: false,
      isExcludedFromMultiHouseSurcharge: false,
    },
  ],
};

// ============================================================
// 입력 팩토리
// ============================================================

function makeInput(override: Partial<NewHousingReductionInput> = {}): NewHousingReductionInput {
  return {
    acquisitionDate: new Date("2002-01-01"),
    transferDate: new Date("2005-01-01"),
    region: "outside_overconcentration",
    acquisitionPrice: 300_000_000,
    exclusiveAreaSquareMeters: 84.9,
    isFirstSale: true,
    hasUnsoldCertificate: false,
    totalCapitalGain: 50_000_000,
    calculatedTax: 10_000_000,
    ...override,
  };
}

// ============================================================
// NH-01: §99 ① 취득, 5년 이내 양도 → 100% 감면
// ============================================================

describe("NH-01: §99 ① 취득 — 5년 이내 양도 → 100% 감면", () => {
  it("취득 3년 후 양도 → isEligible true, reductionRate 1.0, reductionAmount ≈ calculatedTax", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-01-01"),
        transferDate: new Date("2005-01-01"), // 취득 후 3년
        region: "outside_overconcentration",
        isFirstSale: true,
        calculatedTax: 10_000_000,
        totalCapitalGain: 50_000_000,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-1");
    expect(result.reductionRate).toBe(1.0);
    // 5년 이내: ratio = totalDays / totalDays = 1.0 → reductionAmount = calculatedTax
    expect(result.reductionAmount).toBe(10_000_000);
    expect(result.isWithinFiveYearWindow).toBe(true);
  });
});

// ============================================================
// NH-02: §99 ① 취득, 5년 후 양도 → 5년간 양도차익 안분 감면
// ============================================================

describe("NH-02: §99 ① 취득 — 5년 초과 양도 → 5년간 양도차익 안분 감면", () => {
  it("취득 8년 후 양도 → isWithinFiveYearWindow false, reductionAmount < calculatedTax", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-01-01"),
        transferDate: new Date("2010-01-01"), // 취득 후 8년
        region: "outside_overconcentration",
        isFirstSale: true,
        calculatedTax: 10_000_000,
        totalCapitalGain: 50_000_000,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-1");
    expect(result.isWithinFiveYearWindow).toBe(false);
    // 5년 초과 → fiveYearTaxAmount < calculatedTax → reductionAmount < calculatedTax
    expect(result.reductionAmount).toBeGreaterThan(0);
    expect(result.reductionAmount).toBeLessThan(10_000_000);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("5년 경계값: 취득일+5년 당일 양도 → isWithinFiveYearWindow true", () => {
    const acquisitionDate = new Date("2002-01-01");
    // 정확히 5년 후: 2007-01-01
    const transferDate = new Date("2007-01-01");
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate,
        transferDate,
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.isWithinFiveYearWindow).toBe(true);
  });

  it("5년 다음날 양도 → isWithinFiveYearWindow false", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-01-01"),
        transferDate: new Date("2007-01-02"), // 5년+1일
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.isWithinFiveYearWindow).toBe(false);
  });
});

// ============================================================
// NH-03: §99의3 ② 2013.4.1 취득, 6억 이하 미분양, 60% 감면
// ============================================================

describe("NH-03: §99의3 ② 미분양 60% 감면", () => {
  it("2013.4.1 취득, 5억(6억 이하), 5년 이내 양도 → reductionAmount = floor(tax * 0.6)", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-04-01"),
        transferDate: new Date("2016-01-01"), // 약 2.75년
        region: "nationwide",
        acquisitionPrice: 500_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: true,
        calculatedTax: 10_000_000,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-3-2");
    expect(result.reductionRate).toBe(0.6);
    expect(result.reductionAmount).toBe(6_000_000); // 5년 이내, ratio=1.0 → 10M * 0.6 = 6M
  });
});

// ============================================================
// NH-04: §99의3 ② 6억 초과 → 비대상
// ============================================================

describe("NH-04: §99의3 ② 취득가액 6억 초과 → 비대상", () => {
  it("7억 취득가, 미분양확인서 있음 → PRICE_EXCEEDED 사유로 isEligible false", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-04-01"),
        transferDate: new Date("2016-01-01"),
        region: "nationwide",
        acquisitionPrice: 700_000_000, // 7억 — 6억 초과
        isFirstSale: false,
        hasUnsoldCertificate: true,
      }),
      RULES,
    );

    // "99-3-2" maxAcquisitionPrice = 6억. 7억 → 초과.
    // 그 외 매칭 가능한 article 없음 (2013-04-01이 §99-5-c의 period이지만 region 등 다름)
    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some(
        (r) => r.code === "PRICE_EXCEEDED" || r.code === "NO_UNSOLD_CERTIFICATE" || r.code === "NO_MATCHING_ARTICLE",
      ),
    ).toBe(true);
  });
});

// ============================================================
// NH-05: §99의3 ⑩ 2015년 취득 100% 감면
// ============================================================

describe("NH-05: §99의3 ⑩ 2015년 취득, 미분양 → 100% 감면", () => {
  it("2015.6.1 취득, 미분양 확인서, 5년 이내 양도 → 100% 감면", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2015-06-01"),
        transferDate: new Date("2018-01-01"),
        region: "nationwide",
        acquisitionPrice: 800_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: true,
        calculatedTax: 5_000_000,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-3-10");
    expect(result.reductionRate).toBe(1.0);
    expect(result.reductionAmount).toBe(5_000_000); // 5년 이내 → 100%
  });
});

// ============================================================
// NH-06: 취득일 1일 초과 — §99 ① 기간 외
// ============================================================

describe("NH-06: 취득일이 §99 ① 감면 기간 1일 초과", () => {
  it("2003.7.1 취득 (§99 ① 기간 2003.6.30 종료) → ACQUISITION_PERIOD_NOT_MATCHED", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2003-07-01"), // 기간 종료 다음날
        transferDate: new Date("2006-01-01"),
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    // 어떤 article과도 취득 기간 매칭 없음 (§99-5는 2013~, §99-3은 2013~)
    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some((r) => r.code === "ACQUISITION_PERIOD_NOT_MATCHED"),
    ).toBe(true);
  });

  it("2003.6.30 취득 (경계값 마지막 날) → §99 ① 매칭 성공", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2003-06-30"), // 기간 마지막 날
        transferDate: new Date("2006-01-01"),
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-1");
  });
});

// ============================================================
// NH-07: 미분양 확인서 미보유 → 비대상
// ============================================================

describe("NH-07: 미분양 확인서 미보유 → 비대상", () => {
  it("§99의3 ② 매칭 조건 충족, 단 미분양 확인서 없음 → NO_UNSOLD_CERTIFICATE", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-05-01"),
        transferDate: new Date("2016-01-01"),
        region: "nationwide",
        acquisitionPrice: 500_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: false, // 확인서 없음
      }),
      RULES,
    );

    // 2013.5.1은 §99-3-2와 §99-5-c/nc가 매칭 후보.
    // §99-3-2: requiresUnsoldCertificate=true → false → 제외
    // §99-5-c: 수도권 6억 이하, requiresFirstSale=false, requiresUnsoldCertificate=false → region 불일치 (input=nationwide)
    // §99-5-nc: 비수도권 3억 이하 → region 불일치
    // 결국 매칭 없음
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.length).toBeGreaterThan(0);
  });

  it("§99의3 ⑩ 조건에서 미분양 확인서 없음 → 비대상", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2015-03-01"),
        transferDate: new Date("2018-01-01"),
        region: "nationwide",
        acquisitionPrice: 400_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: false, // 없음
      }),
      RULES,
    );

    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some((r) => r.code === "NO_UNSOLD_CERTIFICATE"),
    ).toBe(true);
  });
});

// ============================================================
// NH-08: 신축주택 → 다주택 주택 수 산정 제외
// ============================================================

describe("NH-08: 신축주택 § 99 ① — 다주택 주택 수 산정 제외", () => {
  it("§99 ① 매칭 → isExcludedFromHouseCount true", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-01-01"),
        transferDate: new Date("2005-01-01"),
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.isExcludedFromHouseCount).toBe(true);
  });

  it("§99의3 ② 미분양주택은 isExcludedFromHouseCount false (특례 없음)", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-04-01"),
        transferDate: new Date("2016-01-01"),
        region: "nationwide",
        acquisitionPrice: 500_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.isExcludedFromHouseCount).toBe(false);
  });
});

// ============================================================
// NH-09: 신축주택 → 다주택 중과세 배제
// ============================================================

describe("NH-09: 신축주택 §99 ① — 다주택 중과세 배제", () => {
  it("§99 ① 매칭 → isExcludedFromMultiHouseSurcharge true", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-06-01"),
        transferDate: new Date("2005-06-01"),
        region: "outside_overconcentration",
        isFirstSale: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.isExcludedFromMultiHouseSurcharge).toBe(true);
  });

  it("§99 ⑤는 isExcludedFromMultiHouseSurcharge false", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-06-01"),
        transferDate: new Date("2016-01-01"),
        region: "non_metropolitan",
        acquisitionPrice: 250_000_000, // 3억 이하
        isFirstSale: false,
        hasUnsoldCertificate: false,
        exclusiveAreaSquareMeters: 80,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-5-nc");
    expect(result.isExcludedFromMultiHouseSurcharge).toBe(false);
  });
});

// ============================================================
// NH-10: 시기 매트릭스 분기 정확도
// ============================================================

describe("NH-10: 시기 매트릭스 각 article 분기 정확도", () => {
  it("§99 ② (비수도권 미분양 6억 이하) 2009.3.1 취득 → 99-2-low 매칭", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2009-03-01"),
        transferDate: new Date("2012-01-01"),
        region: "non_metropolitan",
        acquisitionPrice: 500_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: true,
        calculatedTax: 8_000_000,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-2-low");
    expect(result.reductionRate).toBe(1.0);
  });

  it("§99 ⑤ 수도권 6억 이하 2013.8.1 취득 → 99-5-c 매칭", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-08-01"),
        transferDate: new Date("2016-01-01"),
        region: "metropolitan",
        acquisitionPrice: 500_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: false,
        exclusiveAreaSquareMeters: 80,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-5-c");
    expect(result.reductionRate).toBe(1.0);
  });

  it("§99 ⑤ 수도권 6억 초과 → 매칭 실패 (비수도권 3억 이하 article만 있음)", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-08-01"),
        transferDate: new Date("2016-01-01"),
        region: "metropolitan",
        acquisitionPrice: 700_000_000, // 6억 초과
        exclusiveAreaSquareMeters: 80,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(false);
  });

  it("§99 ⑥ 비수도권 3억 이하 2014.5.1 취득 → 99-6-nc 매칭", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2014-05-01"),
        transferDate: new Date("2017-01-01"),
        region: "non_metropolitan",
        acquisitionPrice: 280_000_000,
        exclusiveAreaSquareMeters: 84.9,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-6-nc");
  });

  it("§99의3 ⑩ 2015.12.31 취득 (기간 마지막 날) → 99-3-10 매칭", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2015-12-31"),
        transferDate: new Date("2019-01-01"),
        region: "nationwide",
        acquisitionPrice: 1_000_000_000,
        isFirstSale: false,
        hasUnsoldCertificate: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-3-10");
  });

  it("2016.1.1 취득 (모든 감면 기간 종료 후) → ACQUISITION_PERIOD_NOT_MATCHED", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2016-01-01"),
        transferDate: new Date("2019-01-01"),
        region: "nationwide",
        hasUnsoldCertificate: true,
      }),
      RULES,
    );

    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some((r) => r.code === "ACQUISITION_PERIOD_NOT_MATCHED"),
    ).toBe(true);
  });
});

// ============================================================
// 추가: rules 없음 → NO_RULES 반환
// ============================================================

describe("rules 없음 처리", () => {
  it("rules = undefined → isEligible false, NO_RULES", () => {
    const result = determineNewHousingReduction(makeInput(), undefined);

    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons[0]?.code).toBe("NO_RULES");
  });

  it("rules.articles 빈 배열 → isEligible false, NO_RULES", () => {
    const emptyRules: NewHousingMatrixData = { type: "new_housing_matrix", articles: [] };
    const result = determineNewHousingReduction(makeInput(), emptyRules);

    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons[0]?.code).toBe("NO_RULES");
  });
});

// ============================================================
// 추가: 최초 분양 요건 미충족
// ============================================================

describe("최초 분양 요건 검사", () => {
  it("§99 ① — 최초 분양 아님 → NOT_FIRST_SALE", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2002-06-01"),
        transferDate: new Date("2005-01-01"),
        region: "outside_overconcentration",
        isFirstSale: false, // 최초 분양 아님
      }),
      RULES,
    );

    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some((r) => r.code === "NOT_FIRST_SALE"),
    ).toBe(true);
  });
});

// ============================================================
// 추가: 전용면적 요건 검사
// ============================================================

describe("전용면적 요건 검사", () => {
  it("§99 ⑤ 85㎡ 초과 → AREA_EXCEEDED", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-06-01"),
        transferDate: new Date("2016-01-01"),
        region: "metropolitan",
        acquisitionPrice: 500_000_000,
        exclusiveAreaSquareMeters: 90, // 85㎡ 초과
      }),
      RULES,
    );

    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some((r) => r.code === "AREA_EXCEEDED"),
    ).toBe(true);
  });

  it("전용면적 85㎡ 정확 (경계값) → 매칭 성공", () => {
    const result = determineNewHousingReduction(
      makeInput({
        acquisitionDate: new Date("2013-06-01"),
        transferDate: new Date("2016-01-01"),
        region: "metropolitan",
        acquisitionPrice: 500_000_000,
        exclusiveAreaSquareMeters: 85, // 정확히 85
      }),
      RULES,
    );

    expect(result.isEligible).toBe(true);
    expect(result.matchedArticleCode).toBe("99-5-c");
  });
});
