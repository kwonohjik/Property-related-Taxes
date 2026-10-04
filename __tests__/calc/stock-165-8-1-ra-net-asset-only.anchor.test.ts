/**
 * 영 §165⑧1호 후단 — 법 §94①4 라목 주식등이 법 §99①4(비상장 등)에 해당하면 영 §165④1호 나목(순자산가치) **단독**
 *
 * 계획서 `docs/00-pm/stock-165-8-1-ra-net-asset-only.plan.md` §1~§3 · §6 · §10
 *
 * 시행: 대통령령 제33267호(2023.2.28.) 부칙 제9조 — 「이 영 시행일 이후 주식등을 양도하는 경우부터 적용」
 *
 *   RA-2  전 경로(④ → ⑫ → 엔진) — 라목이면 순자산 단독 (비상장·기타자산 양쪽, «반전» 토글 무시, 다목 동시 성립도 라목)
 *   RA-3  연혁 경계 — 2023-02-27 양도는 종전(3:2), 2023-02-28 양도부터 단독
 *   RA-4  부정 짝 — 라목이 아니면 불변 (일반 3:2 · 사용자 2:3 반전)
 *   RA-5  사례 49(취득시 장부분실) + 라목 — 양도기준시가가 순자산 단독
 *   RA-6  ⑧·⑫ — 라목이면 순손익가치 칸을 요구하지 않는다 (엔진이 쓰지 않는 값)
 *   RA-1  leaf 경계 — `resolveNetAssetOnlyBasis` (시행일 당일 포함 · 사유 우선 · 날짜 없음)
 *   RA-7  단측 경로 직접 호출 — 취득일 거래정지(C-1) 취득측 · 사례 49 양도측 (전 경로 anchor가 닿지 않는 함수)
 *
 * 수치(손계산): 양도 6,000,000,000 · 8,000주
 *   양도연도 순손익 150,000 / 순자산 200,000 · 취득연도 순손익 6,000 / 순자산 10,000
 *   단독  : 6,000,000,000 × (10,000 × 8,000) ÷ (200,000 × 8,000)                     = 300,000,000
 *   3:2   : 양도 170,000 · 취득 max(7,600, 8,000) = 8,000 → 6,000,000,000 × 8,000 ÷ 170,000 = 282,352,941
 *   2:3   : 양도 180,000 · 취득 8,400                     → 6,000,000,000 × 8,400 ÷ 180,000 = 280,000,000
 *   사례49: 양도 단독 200,000 · 취득 액면 12,500 → 6,000,000,000 × 12,500 ÷ 200,000          = 375,000,000
 *           (일반 비상장은 3:2 → 하한 160,000 → 468,750,000 — 교재 사례 49 그대로)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import {
  resolveNetAssetOnlyBasis,
  isRaMokNetAssetOnly,
} from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";
import {
  calcAcquisitionStdPerShareSupplementary,
  calcTransferStdPriceForFaceValue,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted-single-side";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "라목법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "1990-01-01",
    transferDate: "2024-06-01",
    shareCount: "8000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    unlistedInputMode: "simple",
    transferYearNetIncomePerShare: "150000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "6000",
    acquisitionYearNetAssetPerShare: "10000",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    ...o,
  } as StockTransferFormData;
}

const RA: Partial<StockTransferFormData> = { isHeavyRealEstateForRate: true };
const OTHER_RA: Partial<StockTransferFormData> = { marketType: "other_asset", isHeavyRealEstateForRate: true };
/** 2023-02-27 · 02-28 양도 — 직전 사업연도·신고일을 함께 옮긴다 */
const AT = (transferDate: string): Partial<StockTransferFormData> => ({
  transferDate,
  priorYearEndDate: "2022-12-31",
  filingDate: "2023-04-30",
});

type Run =
  | { blocked: true; paths: string[]; step2: string[] }
  | {
      blocked: false;
      acq: number;
      method?: string;
      basis?: string;
      section?: string;
      step2: string[];
    };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")), step2 };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  const r = calculateStockTransferTax(buildEngineInput(coerced));
  return {
    blocked: false,
    acq: r.acquisitionPrice,
    method: r.valuationDetail?.method,
    basis: r.valuationDetail?.netAssetOnlyReason,
    section: r.appliedSection94,
    step2,
  };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.paths.join(", ")}`);
  return r;
}

describe("RA-2: 라목이면 순자산가치 단독 — 영 §165⑧1호 후단", () => {
  it("비상장 + 라목(§94② → 기타자산) → 300,000,000 · net_asset_only (종전 282,352,941)", () => {
    const r = ok(run(form(RA)));
    expect(r.acq).toBe(300_000_000);
    expect(r.method).toBe("net_asset_only");
    expect(r.basis).toBe("ra_mok_heavy_real_estate");
  });
  it("기타자산 + 라목 → 300,000,000", () => {
    const r = ok(run(form(OTHER_RA)));
    expect(r.acq).toBe(300_000_000);
    expect(r.method).toBe("net_asset_only");
  });
  it("라목 + «반전» 토글 → 토글을 무시하고 300,000,000 (종전 280,000,000)", () => {
    expect(ok(run(form({ ...OTHER_RA, isHeavyRealEstateForValuation: true }))).acq).toBe(300_000_000);
  });
  it("다목·라목 동시 성립(분류 ①4다) → 라목 단독 우선 (Q-2)", () => {
    const r = ok(
      run(
        form({
          ...OTHER_RA,
          isQualifyingBlockShareholder: true,
          blockShareholderRealEstateRatio: "90",
          blockShareholderOwnershipRatio: "70",
          cumulativeTransferRatio: "70",
          aggregationFirstTransferDate: "2024-06-01",
        }),
      ),
    );
    expect(r.section).toBe("①4다");
    expect(r.acq).toBe(300_000_000);
  });
  it("사용자가 고른 §165④3 사유가 있으면 그 사유가 echo된다 (값은 같은 단독)", () => {
    const r = ok(run(form({ ...OTHER_RA, netAssetOnlyReason: "remaining_term_under_3y" })));
    expect(r.acq).toBe(300_000_000);
    expect(r.basis).toBe("remaining_term_under_3y");
  });
});

describe("RA-3: 연혁 경계 — 대통령령 제33267호 부칙 제9조", () => {
  it("2023-02-27 양도 → 종전 3:2 (282,352,941)", () => {
    const r = ok(run(form({ ...OTHER_RA, ...AT("2023-02-27") })));
    expect(r.acq).toBe(282_352_941);
    expect(r.method).toBe("weighted_avg");
  });
  it("2023-02-28 양도 → 단독 (300,000,000)", () => {
    const r = ok(run(form({ ...OTHER_RA, ...AT("2023-02-28") })));
    expect(r.acq).toBe(300_000_000);
    expect(r.method).toBe("net_asset_only");
  });
  it("2023-02-27 양도 + «반전» 토글 → 종전처럼 2:3 (280,000,000)", () => {
    expect(ok(run(form({ ...OTHER_RA, ...AT("2023-02-27"), isHeavyRealEstateForValuation: true }))).acq).toBe(
      280_000_000,
    );
  });
});

describe("RA-4: 부정 짝 — 라목이 아니면 불변", () => {
  it("일반 비상장 → 282,352,941 · weighted_avg", () => {
    const r = ok(run(form()));
    expect(r.acq).toBe(282_352_941);
    expect(r.method).toBe("weighted_avg");
    expect(r.basis).toBeUndefined();
  });
  it("라목 아님 + «반전» 토글 → 2:3 (280,000,000)", () => {
    expect(ok(run(form({ isHeavyRealEstateForValuation: true }))).acq).toBe(280_000_000);
  });
});

describe("RA-5: 사례 49(취득시 장부분실) + 라목 — 양도기준시가가 순자산 단독", () => {
  const BOOK_LOST: Partial<StockTransferFormData> = {
    transferYearNetIncomePerShare: "30000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "",
    acquisitionYearNetAssetPerShare: "",
    acqFaceValueOnly: true,
    acqFaceValuePerShare: "12500",
  };
  it("기타자산 + 라목 → 375,000,000 (종전 468,750,000)", () => {
    const r = ok(run(form({ ...OTHER_RA, ...BOOK_LOST })));
    expect(r.acq).toBe(375_000_000);
    expect(r.method).toBe("acq_face_value_only");
    expect(r.basis).toBe("ra_mok_heavy_real_estate");
  });
  it("일반 비상장(교재 사례 49) → 468,750,000 그대로", () => {
    expect(ok(run(form(BOOK_LOST))).acq).toBe(468_750_000);
  });
});

describe("RA-6: ⑧·⑫ — 라목이면 순손익가치 칸을 요구하지 않는다", () => {
  const NO_NI: Partial<StockTransferFormData> = {
    transferYearNetIncomePerShare: "",
    acquisitionYearNetIncomePerShare: "",
  };
  it("기타자산 + 라목 + 순손익 비움 → ⑧ 통과 · ⑫ 통과 · 300,000,000", () => {
    const r = run(form({ ...OTHER_RA, ...NO_NI }));
    expect(r.step2).not.toContain("transferYearNetIncomePerShare");
    expect(r.step2).not.toContain("acquisitionYearNetIncomePerShare");
    expect(ok(r).acq).toBe(300_000_000);
  });
  it("부정 짝 — 2023-02-27 양도면 순손익 칸을 요구한다 (⑧·⑫ 둘 다)", () => {
    const r = run(form({ ...OTHER_RA, ...NO_NI, ...AT("2023-02-27") }));
    expect(r.step2).toContain("transferYearNetIncomePerShare");
    expect(r.blocked).toBe(true);
  });
  it("부정 짝 — 라목이 아니면 순손익 칸을 요구한다", () => {
    const r = run(form(NO_NI));
    expect(r.step2).toContain("transferYearNetIncomePerShare");
    expect(r.blocked).toBe(true);
  });
});

describe("RA-1: leaf 경계 — resolveNetAssetOnlyBasis", () => {
  const d = (s: string) => new Date(s);
  it.each([
    [true, "2023-02-28", "ra_mok_heavy_real_estate"],
    [true, "2023-02-27", undefined],
    [true, "2026-10-04", "ra_mok_heavy_real_estate"],
    [false, "2024-06-01", undefined],
    [undefined, "2024-06-01", undefined],
  ] as const)("라목=%s · 양도 %s → %s", (ra, date, expected) => {
    expect(resolveNetAssetOnlyBasis({ isHeavyRealEstateForRate: ra, transferDate: d(date) })).toBe(expected);
  });
  it("사용자 사유가 있으면 사유가 우선 echo (라목이어도)", () => {
    expect(
      resolveNetAssetOnlyBasis({
        netAssetOnlyReason: "stock_holding_company",
        isHeavyRealEstateForRate: true,
        transferDate: d("2024-06-01"),
      }),
    ).toBe("stock_holding_company");
  });
  it("양도일 없음·무효 → 라목 후단 미적용 (판정 불가를 불리하게 적용하지 않는다)", () => {
    expect(isRaMokNetAssetOnly({ isHeavyRealEstateForRate: true, transferDate: undefined })).toBe(false);
    expect(isRaMokNetAssetOnly({ isHeavyRealEstateForRate: true, transferDate: d("x") })).toBe(false);
  });
});

describe("RA-7: 단측 경로 직접 호출", () => {
  const base = {
    transferDate: new Date("2024-06-01"),
    isHeavyRealEstateForRate: true,
    isHeavyRealEstateForValuation: true, // 라목이면 무시돼야 한다
    transferYearNetIncomePerShare: 150_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 6_000,
    acquisitionYearNetAssetPerShare: 10_000,
  } as unknown as StockTransferInput;
  it("C-1 취득측 — 라목이면 순자산 10,000 (종전 2:3 반전 8,400)", () => {
    const r = calcAcquisitionStdPerShareSupplementary(base);
    expect(r.perShare).toBe(10_000);
    expect(r.floorApplied).toBe(false);
  });
  it("C-1 취득측 — 2023-02-27 양도면 종전 2:3 반전 8,400", () => {
    expect(
      calcAcquisitionStdPerShareSupplementary({ ...base, transferDate: new Date("2023-02-27") }).perShare,
    ).toBe(8_400);
  });
  it("사례 49 양도측 — 라목이면 순자산 200,000 (종전 2:3 반전 180,000)", () => {
    expect(calcTransferStdPriceForFaceValue(base).perShare).toBe(200_000);
  });
});

describe("RA-8: 취득일 거래정지(코스닥·영 §165③) + 라목 — 취득측이 법 §99①4라 단독 · 결과뷰 echo", () => {
  // 취득측 순손익 18,000 / 순자산 22,000 → 3:2 = 19,600 · 단독 = 22,000
  // 환산 = 500,000,000 × 22,000 ÷ 50,000(양도 종가평균) = 220,000,000 (3:2면 196,000,000)
  const haltForm = (o: Partial<StockTransferFormData> = {}) =>
    form({
      marketType: "kosdaq",
      securityCode: "000000",
      isHeavyRealEstateForRate: true,
      selfShareRatio: "60",
      selfMarketCap: "20000000000",
      priorYearEndDate: "2024-12-31",
      acquisitionDate: "2015-03-15",
      transferDate: "2025-02-26",
      shareCount: "10000",
      totalIssuedShares: "1000000",
      transferTotalPrice: "500000000",
      acquisitionStdMode: "halt_acquisition",
      transferStdInputMode: "direct",
      transferDatePriceAvg1Month: "50000",
      acquisitionYearNetIncomePerShare: "18000",
      acquisitionYearNetAssetPerShare: "22000",
      filingDate: "2025-08-31",
      ...o,
    });
  it("라목 → 220,000,000 · echo가 라목 후단 (결과뷰가 «순자산 단독 §165⑧1호 후단»을 고른다)", () => {
    const r = ok(run(haltForm()));
    expect(r.method).toBe("halt_acquisition_conversion");
    expect(r.acq).toBe(220_000_000);
    expect(r.basis).toBe("ra_mok_heavy_real_estate");
  });
  it("부정 짝 — 라목 아님 → 196,000,000 · echo 없음", () => {
    const r = ok(run(haltForm({ isHeavyRealEstateForRate: false })));
    expect(r.acq).toBe(196_000_000);
    expect(r.basis).toBeUndefined();
  });
});

/**
 * RA-9 — 리뷰(acquisition-cost-review) 지적 «anchor 부재» 분기. 값이 아니라 **순손익 칸을 요구하는가**만 본다.
 * 부정 짝은 같은 라목·2023-02-27 양도 — 날짜 게이트까지 구별한다.
 */
describe("RA-9: ⑧·⑫·④ 부수 경로 — 라목 후단이면 순손익을 요구하지 않는다", () => {
  function demanded(f: StockTransferFormData, field: string) {
    const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
    const zod = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
    return { step2: step2.includes(field), zod: zod.includes(field) };
  }
  const PRE = AT("2023-02-27");

  const halt = (o: Partial<StockTransferFormData> = {}) =>
    form({
      marketType: "kosdaq",
      securityCode: "000000",
      isHeavyRealEstateForRate: true,
      acquisitionStdMode: "halt_acquisition",
      transferStdInputMode: "direct",
      transferDatePriceAvg1Month: "50000",
      acquisitionYearNetIncomePerShare: "",
      ...o,
    });
  it("취득일 거래정지(⑧ :172 · ⑫ both/acquisition) — 취득연도 순손익", () => {
    expect(demanded(halt(), "acquisitionYearNetIncomePerShare")).toEqual({ step2: false, zod: false });
    expect(demanded(halt(PRE), "acquisitionYearNetIncomePerShare")).toEqual({ step2: true, zod: true });
  });

  const saleCase = (o: Partial<StockTransferFormData> = {}) =>
    form({
      ...OTHER_RA,
      acquisitionMode: "sale_case",
      acquisitionMarketSamplePrice: "50000",
      acquisitionYearNetIncomePerShare: "",
      ...o,
    });
  it("매매사례 개산공제 base(⑫ :484) — 취득연도 순손익", () => {
    expect(demanded(saleCase(), "acquisitionYearNetIncomePerShare").zod).toBe(false);
    expect(demanded(saleCase(PRE), "acquisitionYearNetIncomePerShare").zod).toBe(true);
  });

  const sameBiz = (o: Partial<StockTransferFormData> = {}) =>
    form({
      ...OTHER_RA,
      unlistedSameBizYearToggle: true,
      prePriorYearNetAssetPerShare: "100000",
      prePriorYearNetIncomePerShare: "",
      ...o,
    });
  it("동일 사업연도 월할(⑧ :135 · ⑫ :360) — 전전연도 순손익", () => {
    expect(demanded(sameBiz(), "prePriorYearNetIncomePerShare")).toEqual({ step2: false, zod: false });
    expect(demanded(sameBiz(PRE), "prePriorYearNetIncomePerShare")).toEqual({ step2: true, zod: true });
  });

  const donor = (o: Partial<StockTransferFormData> = {}) =>
    form({
      ...OTHER_RA,
      acquisitionCause: "carryover_gift",
      donorAcquisitionDate: "2015-03-01",
      donorRelation: "spouse",
      donorAcquisitionMethod: "estimated",
      acquisitionMode: "actual",
      acquisitionActualInputMode: "per_share",
      perShareAcquisitionPrice: "80000",
      transferYearNetIncomePerShare: "",
      ...o,
    } as Partial<StockTransferFormData>);
  it("이월과세 증여자 기준 환산의 분모(⑧ :657 · ⑫ :468) — 양도연도 순손익", () => {
    expect(demanded(donor(), "transferYearNetIncomePerShare")).toEqual({ step2: false, zod: false });
    expect(demanded(donor(PRE), "transferYearNetIncomePerShare")).toEqual({ step2: true, zod: true });
  });

  it("④ 결산서(full) 모드 — 라목이면 어댑터가 순손익을 싣지 않는다 (순자산은 싣는다)", () => {
    // 간이 모드 칸은 비운다 — `:339-345` 간이 매핑이 화면에 남은 값을 따로 싣기 때문(엔진은 단독이면 읽지 않는다,
    // 사유 4종과 같은 기존 동작). 여기서는 결산서 어댑터(`:446-450`)의 niSkip만 본다.
    const full: Partial<StockTransferFormData> = {
      ...OTHER_RA,
      unlistedValuationMode: "full",
      transferYearNetIncomePerShare: "",
      acquisitionYearNetIncomePerShare: "",
    };
    const b = buildStockTransferApiBody(form(full)) as Record<string, unknown>;
    expect(b).not.toHaveProperty("transferYearNetIncomePerShare");
    expect(b).not.toHaveProperty("acquisitionYearNetIncomePerShare");
    expect(typeof b.transferYearNetAssetPerShare).toBe("number");
    const pre = buildStockTransferApiBody(form({ ...full, ...PRE })) as Record<string, unknown>;
    expect(typeof pre.transferYearNetIncomePerShare).toBe("number");
  });
});
