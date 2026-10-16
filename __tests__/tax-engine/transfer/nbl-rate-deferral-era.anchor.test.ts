/**
 * anchor: 비사업용 토지 §104①8호·9호 세율의 **양도일 기준 한시 유예** — 양도 2009.3.16.~2015.12.31.
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §5 (사용자 결정 2026-10-16: A3 ① — 지정지역 입력 신설, 미입력 = 중과 유지 + 확인 필요)
 *
 * [법령] (KoreanLaw 시행본·부칙 원문 실독, 2026-10-16)
 *  - 제9672호(2009.5.21.) §104⑥ — 2의7·2의8호(비사업용 토지)를 유예 대상에 추가. 부칙 ②: 제104조제4항·제6항 개정규정은 **2009.3.16. 이후 최초 양도분**부터.
 *  - 제10408호 → 2012.12.31.까지 / 제11611호 → 2013.12.31.까지 / 제12169호 부칙 제20조 `<개정 2014.12.23>` → 2015.12.31.까지 (**지정지역 부동산 제외**).
 *  - 유예 효과: 8호·9호 세율을 적용하지 않고 §104①1호 세율(보유 2년 미만은 2·3호). 지정지역은 «기본세율 +10%p» 그대로(= 엔진의 종전 결과).
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 1. 기간 경계(2009-03-15 ↔ 03-16, 2015-12-31 ↔ 2016-01-01)와 4가지 판정(outside · deferred · designated_area · area_unconfirmed)
 * 2. 단건 엔진: 지정지역 «아님»으로 선언했을 때만 중과가 꺼진다 — 미선언(모름)·지정지역은 종전 그대로 + 미선언이면 «확인 필요» 고지
 * 3. 단기 보유(2년 미만)는 단기세율이 이겨 유예가 세액을 바꾸지 않으므로 고지도 내지 않는다
 * 4. 위기취득 사유와 겹치면 사유는 취득일 기준(영구 배제)을 먼저 적는다
 * 5. 다건: 유예된 비사업용 토지는 §104①1호 버킷에 합류한다(8호 버킷 아님)
 * 6. 주식 9호: 양도일만 본다(지정지역 개념 없음)
 *
 * ⚠️ 금액은 mock 세율표(2022 단일표) 기준이다 — 구조 증거이지 연혁 세율의 금액 확정이 아니다.
 */
import { describe, it, expect } from "vitest";
import {
  NBL_RATE_DEFERRAL_FROM,
  NBL_RATE_DEFERRAL_TO,
  isNblRateDeferralWindow,
  judgeNblRateDeferral,
  isNblSurchargeDeferred,
} from "@/lib/tax-engine/data/nbl-rate-deferral-era";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import {
  nblExclusionBadgeText,
  nblExclusionBannerText,
  nblExclusionReasonOf,
} from "@/components/calc/results/transfer/nbl-surcharge-exclusion-label";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { passingBlockShareholderGate } from "../stock-transfer/_block-shareholder-fixture";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

describe("N-1: 기간 경계와 판정", () => {
  it("상수는 2009-03-16 ~ 2015-12-31", () => {
    expect(NBL_RATE_DEFERRAL_FROM).toBe("2009-03-16");
    expect(NBL_RATE_DEFERRAL_TO).toBe("2015-12-31");
  });
  it("경계일 포함 — 2009-03-15 밖 · 03-16 안 · 2015-12-31 안 · 2016-01-01 밖", () => {
    expect(isNblRateDeferralWindow("2009-03-15")).toBe(false);
    expect(isNblRateDeferralWindow("2009-03-16")).toBe(true);
    expect(isNblRateDeferralWindow("2015-12-31")).toBe(true);
    expect(isNblRateDeferralWindow("2016-01-01")).toBe(false);
  });
  it("Date 입력도 같다(로컬 달력 기준)", () => {
    expect(isNblRateDeferralWindow(new Date(2009, 2, 15))).toBe(false);
    expect(isNblRateDeferralWindow(new Date(2009, 2, 16))).toBe(true);
    expect(isNblRateDeferralWindow(new Date(2015, 11, 31))).toBe(true);
    expect(isNblRateDeferralWindow(new Date(2016, 0, 1))).toBe(false);
  });
  it("판정 4종 — 모름·지정지역은 유예가 아니다", () => {
    expect(judgeNblRateDeferral({ transferDate: "2012-06-01", isDesignatedArea: false })).toBe("deferred");
    expect(judgeNblRateDeferral({ transferDate: "2012-06-01", isDesignatedArea: true })).toBe("designated_area");
    expect(judgeNblRateDeferral({ transferDate: "2012-06-01" })).toBe("area_unconfirmed");
    expect(judgeNblRateDeferral({ transferDate: "2016-01-01", isDesignatedArea: false })).toBe("outside");
    expect(isNblSurchargeDeferred({ transferDate: "2012-06-01", isDesignatedArea: false })).toBe(true);
    expect(isNblSurchargeDeferred({ transferDate: "2012-06-01" })).toBe(false);
  });
});

/** 토지 양도 8억 · 취득 2억(2000-01-01) · 비사업용 — 양도차익 6억, 장특 0(비사업용 배제 연혁) */
const land = (transferDate: string, extra: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 800_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: D("2000-01-01"),
    transferDate: D(transferDate),
    isNonBusinessLand: true,
    ...extra,
  } as never);
type R = {
  calculatedTax: number;
  surchargeType?: string;
  rateClause?: string;
  nblSurchargeExcluded?: boolean;
  nblSurchargeExcludedBy?: string;
  warnings?: string[];
};
const calc = (d: string, extra: Record<string, unknown> = {}) => calculateTransferTax(land(d, extra), rates) as unknown as R;
const areaNotices = (r: R) => (r.warnings ?? []).filter((w) => /지정지역/.test(w));

const WITH_SURCHARGE = 274_760_000; // 기본세율 + 10%p
const DEFERRED = 215_010_000; // §104①1호 기본세율

describe("N-2: 단건 엔진 — 지정지역 «아님»을 선언했을 때만 중과가 꺼진다", () => {
  it("유예 기간 밖(2009-03-15)은 선언과 무관하게 종전 그대로", () => {
    const r = calc("2009-03-15", { isDesignatedArea: false });
    expect(r.calculatedTax).toBe(WITH_SURCHARGE);
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.rateClause).toBe("104-1-8");
    expect(r.nblSurchargeExcluded).toBeUndefined();
  });
  it("2009-03-16 · 지정지역 아님 → §104①1호 기본세율 215,010,000 (중과분 59,750,000 감소)", () => {
    const r = calc("2009-03-16", { isDesignatedArea: false });
    expect(r.calculatedTax).toBe(DEFERRED);
    expect(r.surchargeType).toBeUndefined();
    expect(r.rateClause).toBe("104-1-1");
    expect(r.nblSurchargeExcluded).toBe(true);
    expect(r.nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(WITH_SURCHARGE - DEFERRED).toBe(59_750_000);
  });
  it("2012-06-01 · 2013-12-31 · 2014-01-01 · 2015-12-31 모두 유예(제12169호 부칙 제20조 포함)", () => {
    for (const d of ["2012-06-01", "2013-12-31", "2014-01-01", "2015-12-31"]) {
      expect(calc(d, { isDesignatedArea: false }).calculatedTax, d).toBe(DEFERRED);
    }
  });
  it("2016-01-01은 다시 중과", () => {
    const r = calc("2016-01-01", { isDesignatedArea: false });
    expect(r.calculatedTax).toBe(WITH_SURCHARGE);
    expect(r.nblSurchargeExcluded).toBeUndefined();
  });
  it("지정지역이면 유예 제외 — 종전 그대로 · 고지 없음", () => {
    const r = calc("2012-06-01", { isDesignatedArea: true });
    expect(r.calculatedTax).toBe(WITH_SURCHARGE);
    expect(r.rateClause).toBe("104-1-8");
    expect(areaNotices(r)).toHaveLength(0);
  });
  it("⭐ 미선언(모름)은 중과 유지 + «확인 필요» 고지 — 모르는데 유리하게 적용하지 않는다", () => {
    const r = calc("2012-06-01");
    expect(r.calculatedTax).toBe(WITH_SURCHARGE);
    expect(r.surchargeType).toBe("non_business_land");
    const notices = areaNotices(r);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("확인 필요");
    expect(notices[0]).toContain("제104조의2제2항");
    expect(notices[0]).toContain("제12169호 부칙 제20조");
    expect(notices[0]).toContain("2012.06.01");
  });
  it("지정지역 «아님»을 선언하면 고지가 없다", () => {
    expect(areaNotices(calc("2012-06-01", { isDesignatedArea: false }))).toHaveLength(0);
  });
  it("비사업용 토지가 아니면 선언이 있어도 아무 일도 없다 · 고지도 없다", () => {
    const r = calc("2012-06-01", { isNonBusinessLand: false, isDesignatedArea: false });
    expect(r.calculatedTax).toBe(155_460_000);
    expect(r.nblSurchargeExcluded).toBeUndefined();
    expect(areaNotices(r)).toHaveLength(0);
  });
  it("유예 기간 밖에서는 미선언이어도 고지가 없다", () => {
    expect(areaNotices(calc("2016-01-01"))).toHaveLength(0);
    expect(areaNotices(calc("2009-03-15"))).toHaveLength(0);
  });
});

describe("N-3: 단기 보유·위기취득과의 상호작용", () => {
  it("보유 1년 미만 — 단기세율 50%가 중과 누진보다 커서 유예가 세액을 바꾸지 않는다 → 고지도 없다", () => {
    const declared = calc("2012-06-01", { acquisitionDate: D("2011-12-01"), isDesignatedArea: false });
    const undeclared = calc("2012-06-01", { acquisitionDate: D("2011-12-01") });
    expect(declared.calculatedTax).toBe(298_750_000);
    expect(undeclared.calculatedTax).toBe(298_750_000);
    expect(declared.rateClause).toBe("104-1-3");
    expect(areaNotices(undeclared)).toHaveLength(0);
  });
  it("보유 1~2년 — 단기세율 40%도 마찬가지", () => {
    const r = calc("2012-06-01", { acquisitionDate: D("2010-12-01") });
    expect(r.calculatedTax).toBe(239_000_000);
    expect(r.rateClause).toBe("104-1-2");
    expect(areaNotices(r)).toHaveLength(0);
  });
  it("위기취득(2009.3.16.~2012.12.31. 취득)과 겹치면 사유는 취득일 기준을 먼저 적는다", () => {
    const both = calc("2012-06-01", { acquisitionDate: D("2010-01-01"), isDesignatedArea: false });
    expect(both.calculatedTax).toBe(DEFERRED);
    expect(both.nblSurchargeExcludedBy).toBe("crisis_acquisition");
    // 위기취득만 — 지정지역 미선언이어도 이미 중과가 꺼져 있으니 고지할 일이 없다
    const crisisOnly = calc("2012-06-01", { acquisitionDate: D("2010-01-01") });
    expect(crisisOnly.calculatedTax).toBe(DEFERRED);
    expect(crisisOnly.nblSurchargeExcludedBy).toBe("crisis_acquisition");
    expect(areaNotices(crisisOnly)).toHaveLength(0);
  });
});

describe("N-4: 다건 합산 — 유예된 비사업용 토지는 §104①1호 버킷에 합류한다", () => {
  const mk = (id: string, extra: Record<string, unknown>) => ({
    ...land("2012-06-01", { transferPrice: 500_000_000, acquisitionPrice: 200_000_000, ...extra }),
    propertyId: id,
    propertyLabel: id,
  });
  type Agg = {
    taxBase: number;
    calculatedTax: number;
    calculatedTaxByGroups: number;
    calculatedTaxByGeneral: number;
    comparedTaxApplied: string;
    warnings?: string[];
    properties: { rateClause?: string; nblSurchargeExcluded?: boolean; nblSurchargeExcludedBy?: string }[];
  };
  const agg = (props: object[]) =>
    calculateTransferTaxAggregate({ taxYear: 2012, annualBasicDeductionUsed: 0, properties: props } as never, rates) as unknown as Agg;

  it("유예 비사토 + 사업용 토지 → 둘 다 1호, 합산 한 번(세율군별 = 전체 누진) 184,770,000", () => {
    const r = agg([mk("N", { isDesignatedArea: false }), mk("B", { isNonBusinessLand: false })]);
    expect(r.properties.map((p) => p.rateClause)).toEqual(["104-1-1", "104-1-1"]);
    expect(r.properties[0].nblSurchargeExcluded).toBe(true);
    expect(r.properties[0].nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(r.calculatedTax).toBe(184_770_000);
    expect(r.calculatedTaxByGroups).toBe(r.calculatedTaxByGeneral);
    expect(r.comparedTaxApplied).toBe("none");
  });
  it("미선언 비사토 + 사업용 토지 → 8호 버킷이 따로 서서 세율군별이 더 크다 189,560,000 · 고지 1건", () => {
    const r = agg([mk("N", {}), mk("B", { isNonBusinessLand: false })]);
    expect(r.properties.map((p) => p.rateClause)).toEqual(["104-1-8", "104-1-1"]);
    expect(r.calculatedTax).toBe(189_560_000);
    expect(r.comparedTaxApplied).toBe("groups");
    expect((r.warnings ?? []).filter((w) => /지정지역/.test(w))).toHaveLength(1);
  });
  it("둘 다 유예 비사토 → 215,010,000 (과세표준 597,500,000 하나의 누진)", () => {
    const r = agg([mk("N", { isDesignatedArea: false }), mk("B", { isDesignatedArea: false })]);
    expect(r.taxBase).toBe(597_500_000);
    expect(r.calculatedTax).toBe(215_010_000);
  });
  it("단건 한 필지 다건 경로도 단건과 같다 215,010,000", () => {
    const r = agg([mk("L", { transferPrice: 800_000_000, isDesignatedArea: false })]);
    expect(r.calculatedTax).toBe(DEFERRED);
  });
});

/** 기타자산(과점주주) 양도차익 3억 · 비사업용 토지 비율 `ratio` */
const stockOf = (transferDate: string, ratio: number) =>
  calculateStockTransferTax({
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: D("2023-12-31"),
    ...passingBlockShareholderGate(D(transferDate)),
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: D("2005-01-01"),
    transferDate: D(transferDate),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 3_010_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: D("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    nblRatioOfCorpAssets: ratio,
  } as StockTransferInput);

describe("N-5: 주식 §104①9호 — 양도일만 본다(지정지역 개념 없음)", () => {
  it("유예 기간 안(2009-03-16 · 2012-06-01 · 2015-12-31) 비율 60% → 9호 아님, 기본세율 93,110,000 · 고지", () => {
    for (const d of ["2009-03-16", "2012-06-01", "2015-12-31"]) {
      const r = stockOf(d, 0.6);
      expect(r.taxCategory, d).toBe("other_asset_block_shareholder");
      expect(r.calculatedTax, d).toBe(93_110_000);
      expect(r.warnings?.some((w) => /9호.*유예 기간/.test(w)), d).toBe(true);
    }
  });
  it("기간 밖(2009-03-15 · 2016-01-01) 비율 60% → 9호 122,860,000 · 고지 없음", () => {
    for (const d of ["2009-03-15", "2016-01-01"]) {
      const r = stockOf(d, 0.6);
      expect(r.taxCategory, d).toBe("other_asset_block_shareholder_nbl");
      expect(r.calculatedTax, d).toBe(122_860_000);
      expect(r.warnings?.some((w) => /9호.*유예 기간/.test(w)), d).toBeFalsy();
    }
  });
  it("기간 안이어도 비율 50% 미만이면 원래 9호가 아니므로 고지가 없다", () => {
    const r = stockOf("2012-06-01", 0.4);
    expect(r.taxCategory).toBe("other_asset_block_shareholder");
    expect(r.warnings?.some((w) => /9호.*유예 기간/.test(w))).toBeFalsy();
  });
});

describe("N-6: 결과 화면 문구 — 사유별로 근거 조문이 다르다", () => {
  it("사유가 없는 결과(= 사유 필드가 생기기 전 저장 이력)는 위기취득으로 읽는다", () => {
    expect(nblExclusionReasonOf(undefined)).toBe("crisis_acquisition");
    expect(nblExclusionBannerText(undefined)).toContain("부칙 §9270호 §14①");
    expect(nblExclusionBadgeText(undefined)).toBe("부칙 §14① 중과배제");
  });
  it("양도일 유예 — §104⑥ · 법률 제12169호 부칙 제20조, 지정지역 언급", () => {
    const banner = nblExclusionBannerText("transfer_deferral");
    expect(banner).toContain("§104⑥");
    expect(banner).toContain("제12169호 부칙 제20조");
    expect(banner).toContain("지정지역");
    expect(banner).not.toContain("§9270호");
    expect(nblExclusionBadgeText("transfer_deferral")).toBe("양도일 유예(§104⑥)");
  });
});
