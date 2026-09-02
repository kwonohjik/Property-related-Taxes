/**
 * anchor: 비사업용 토지 장기보유특별공제 연혁 (「소득세법」 §95②·§95④)
 *
 * 발견 H-1·H-2·H-3 (docs/reviews/nbl-code-review-2026-09.md)
 *
 * §95②의 괄호는 시기마다 달랐고 비사업용 토지는 2016.1.1.에 빠졌다.
 * KoreanLaw `legal_analysis(mode=applicable_law)` 시행일별 본문 실측 + 저장소 내 DRF 실측표
 * (`data/lthd-multi-house-exclusion-era.ts`)가 같은 구간을 적고 있다:
 *
 *   · ~2011.12.31   「§104①4~10호 세율 적용 자산 및 §104⑥ 적용 자산」 → 비사토(§104①8호) **배제**
 *   · 2012.1.1~2015.12.31 「미등기 **및 §104의3에 따른 비사업용 토지**」 → **배제**
 *   · 2016.1.1~     괄호에서 삭제 → **적용**. 단 §95④ 단서로 2016.1.1. 이전 취득분은 2016.1.1. 기산
 *   · 2017.1.1~     §95④ 단서 삭제 → 취득일 기산 환원
 *
 * 종전에는 비사업용 축의 배제 분기와 기산 단서가 **둘 다 없어** 과거 양도분에 표1 공제가
 * 그대로 붙었다(실측 44,000,000원 과소과세). 엔진은 과거 양도일을 설계상 지원한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveLTHDStartDate } from "@/lib/tax-engine/transfer-tax-lthd-start";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const d = (s: string) => new Date(s);

/** 비사업용 토지 — 보유 10년 이상이라 표1 공제가 실제로 걸리는 조건 */
function nblLand(transferDate: string, acquisitionDate = "2004-01-01"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    isNonBusinessLand: true,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    acquisitionDate: d(acquisitionDate),
    transferDate: d(transferDate),
    transferPrice: 900_000_000,
    acquisitionPrice: 500_000_000,
  });
}

describe("[H-2] §95② — 2016.1.1. 전 양도 비사업용 토지는 장특공 배제", () => {
  it("🔴 2014년 양도 → 공제 0 + 배제 사유 echo", () => {
    const r = calculateTransferTax(nblLand("2014-06-01"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("non_business_land_pre_2016");
  });

  it("🔴 2011년 양도(구 §104①4~10호 괄호기)도 배제", () => {
    const r = calculateTransferTax(nblLand("2011-06-01"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("경계: 2015-12-31 양도 → 배제", () => {
    const r = calculateTransferTax(nblLand("2015-12-31"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("경계: 2016-01-01 양도 → **배제 아님** (괄호에서 빠진 날)", () => {
    // ⚠️ 이 날의 공제액은 0이지만 사유가 다르다 — §95④ 단서로 기산일이 2016-01-01이 되어
    //    보유기간이 0일이기 때문이다(배제가 아니라 **보유 3년 미달**). 두 사유를 구분해 단언한다.
    const r = calculateTransferTax(nblLand("2016-01-01"), makeMockRates());
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("경계: 2016-01-01 취득·2019 양도 → 공제 적용 (단서 창 밖 + 배제 창 밖)", () => {
    const r = calculateTransferTax(nblLand("2019-06-01", "2016-01-02"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("현행(2024년) 양도 → 공제 적용 — 비사토는 §104①8호라 §95② 제외 열거에 없다", () => {
    const r = calculateTransferTax(nblLand("2024-06-01"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("사업용 토지는 시기와 무관하게 배제되지 않는다 (과대적용 방지)", () => {
    const input = { ...nblLand("2014-06-01"), isNonBusinessLand: false } as TransferTaxInput;
    const r = calculateTransferTax(input, makeMockRates());
    expect(r.lthdExclusionReason).not.toBe("non_business_land_pre_2016");
  });
});

describe("[H-3] §95④ 단서 — 2016년 양도분은 2016.1.1. 기산", () => {
  it("🔴 2016년 양도 + 2016.1.1. 이전 취득 → 기산일이 2016-01-01", () => {
    expect(resolveLTHDStartDate(nblLand("2016-06-01", "2004-01-01"))).toEqual(d("2016-01-01"));
  });

  it("2016년 양도 + 2016.1.1. 이후 취득 → 취득일 기산 (단서 불요)", () => {
    expect(resolveLTHDStartDate(nblLand("2016-12-01", "2016-03-01"))).toEqual(d("2016-03-01"));
  });

  it("🔴 2017년 양도 → 단서 삭제로 취득일 기산 환원", () => {
    expect(resolveLTHDStartDate(nblLand("2017-06-01", "2004-01-01"))).toEqual(d("2004-01-01"));
  });

  it("사업용 토지에는 단서를 적용하지 않는다", () => {
    const input = { ...nblLand("2016-06-01", "2004-01-01"), isNonBusinessLand: false } as TransferTaxInput;
    expect(resolveLTHDStartDate(input)).toEqual(d("2004-01-01"));
  });

  it("2016년 양도분은 기산 이동으로 보유 3년 미만 → 공제 0 (단서의 실제 효과)", () => {
    const r = calculateTransferTax(nblLand("2016-06-01", "2004-01-01"), makeMockRates());
    expect(r.longTermHoldingDeduction).toBe(0);
    // 배제가 아니라 **보유기간 미달**이므로 배제 사유 echo는 없다.
    expect(r.lthdExclusionReason).toBeUndefined();
  });
});
