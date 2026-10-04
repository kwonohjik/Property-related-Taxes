/**
 * 2007.2.27. 이전 양도분의 §165④ 산식 — **max(순손익가치, 순자산가치)** · 2000.4.2. 이전은 차단 (S-1c-3 2단계)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §11
 *
 * 근거(시행본 본문 — 법제처 DRF eflaw):
 *   - 2001.1.1.~2007.2.27. 영 §165④1·2호(대통령령 제17032호 · 2006.2.9. 제19327호 동일):
 *     「1호 가액이 …순자산가액…에 미달하는 경우에는 …순자산가액…으로 한다」 = max
 *   - 2000.4.3.~2000.12.31. 시행규칙 §81②2호 가·나목(재정경제부령 제138호, 부칙 제3조① 시행 후 양도분부터): 같은 max
 *   - 2007.2.28.~ 영 §165④1호 3:2(대통령령 제19890호, 부칙 제3조 시행 후 양도분부터)
 *   - ~2000.4.2. 시행규칙 §81②2호: (순자산가치 + 순손익액÷15%) ÷ 2 + 순자산 단독 사유 — **미지원(차단)**
 * 종전 엔진: ~1998.12.31. 순자산 단독 · 1999.1.1.~ 3:2 (1999.1.1. 경계는 「총리령→재정경제부령」 명칭 변경뿐)
 *
 *   MX-1  2006 양도 — 공통 입력(순자산 > 순손익)
 *   MX-2  2006 양도 — 순손익 > 순자산
 *   MX-3  경계 2000-04-03 · 2007-02-27 · 2007-02-28
 *   MX-4  2:3 반전 법인 — max 구간엔 반전이 없다
 *   MX-5  사례 49(취득시 장부분실) — 양도측 max
 *   MX-6  상장 후 환산(§165⑤) — 같은 정본
 *   MX-7  2000-04-02 이전 — ⑧·⑫ 차단
 *   MX-8  leaf
 *   MX-9  취득일 거래정지(§165③ — 취득측만 보충평가) · 결과뷰 echo
 *   MX-10 양도일 거래정지(§165③ — 양·취 보충평가) · 결과뷰 echo
 *
 * 공통 입력: 양도 6,000,000,000 · 8,000주 · 양도연도 150,000/200,000 · 취득연도 6,000/10,000
 *   max   : 양도 200,000 · 취득 10,000 → 6e9 × 10,000 ÷ 200,000 = 300,000,000
 *   3:2   : 양도 170,000 · 취득 7,600  → 268,235,294 (종전 엔진값)
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
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { getValuationWeights } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { isSection165_4EraUnsupported } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "max연혁법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2005-12-31",
    acquisitionDate: "1990-01-01",
    transferDate: "2006-06-01",
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
    filingDate: "2006-08-31",
    ...o,
  } as StockTransferFormData;
}

type Run =
  | { blocked: true; issues: { path: string; message: string }[]; step2: { field: string; message: string }[] }
  | { blocked: false; acq: number; method?: string; model?: string; step2: { field: string; message: string }[] };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f)
    .filter((e) => e.severity === "error")
    .map((e) => ({ field: e.field, message: e.message }));
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success)
    return {
      blocked: true,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      step2,
    };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  const r = calculateStockTransferTax(buildEngineInput(coerced));
  return { blocked: false, acq: r.acquisitionPrice, method: r.valuationDetail?.method, model: r.valuationDetail?.section165_4Model, step2 };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.issues.map((i) => i.path).join(", ")}`);
  expect(r.step2).toEqual([]);
  return r;
}

const AT = (transferDate: string, priorYearEndDate: string, filingDate: string): Partial<StockTransferFormData> => ({
  transferDate,
  priorYearEndDate,
  filingDate,
});

describe("MX-1: 2006 양도 — 순자산 > 순손익", () => {
  it("양도 max(150,000, 200,000)=200,000 · 취득 max(6,000, 10,000)=10,000 → 300,000,000 (종전 268,235,294)", () => {
    expect(ok(run(form())).acq).toBe(300_000_000);
  });
});

describe("MX-2: 2006 양도 — 순손익 > 순자산", () => {
  it("양도 300,000 · 취득 12,000 → 6e9 × 12,000 ÷ 300,000 = 240,000,000 (3:2면 258,461,538)", () => {
    const r = ok(
      run(form({ transferYearNetIncomePerShare: "300000", acquisitionYearNetIncomePerShare: "12000" })),
    );
    expect(r.acq).toBe(240_000_000);
  });
});

describe("MX-3: 경계", () => {
  it("2000-04-03 양도 → max · 300,000,000", () => {
    expect(ok(run(form(AT("2000-04-03", "1999-12-31", "2000-05-31")))).acq).toBe(300_000_000);
  });
  it("2007-02-27 양도 → max · 300,000,000", () => {
    expect(ok(run(form(AT("2007-02-27", "2006-12-31", "2007-04-30")))).acq).toBe(300_000_000);
  });
  it("2007-02-28 양도 → 3:2 · 268,235,294", () => {
    expect(ok(run(form(AT("2007-02-28", "2006-12-31", "2007-04-30")))).acq).toBe(268_235_294);
  });
});

describe("MX-4: 2:3 반전 법인 — max 구간엔 반전이 없다", () => {
  it("2006 양도 · 반전 선언 → 그대로 max 300,000,000 (2:3이면 280,000,000)", () => {
    expect(ok(run(form({ isHeavyRealEstateForValuation: true }))).acq).toBe(300_000_000);
  });
  it("대조 — 2007-02-28 양도 · 반전 선언 → 2:3 · 280,000,000", () => {
    const r = ok(run(form({ isHeavyRealEstateForValuation: true, ...AT("2007-02-28", "2006-12-31", "2007-04-30") })));
    expect(r.acq).toBe(280_000_000);
  });
});

describe("MX-5: 사례 49(취득시 장부분실) — 양도측 max", () => {
  it("액면 12,500 · 양도 200,000 → 6e9 × 12,500 ÷ 200,000 = 375,000,000 (3:2면 441,176,470)", () => {
    const r = ok(
      run(
        form({
          acquisitionYearNetIncomePerShare: "",
          acquisitionYearNetAssetPerShare: "",
          acqFaceValueOnly: true,
          acqFaceValuePerShare: "12500",
        }),
      ),
    );
    expect(r.acq).toBe(375_000_000);
    expect(r.method).toBe("acq_face_value_only");
  });
});

describe("MX-6: 상장 후 환산(§165⑤) — 같은 정본", () => {
  const base = {
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    listingDate: new Date("2003-07-01"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForValuation: false,
    isHeavyRealEstateForRate: false,
    listingDatePriceAvg1Month: 1_000,
    listingYearNetIncomePerShare: 100,
    listingYearNetAssetPerShare: 200,
    acquisitionYearNetIncomePerShare: 100,
    acquisitionYearNetAssetPerShare: 200,
  } as unknown as StockTransferInput;
  it("2006 양도 → 상장연도 평가 max(100, 200) = 200 (3:2면 140)", () => {
    expect(calcPostListingConversion({ ...base, transferDate: new Date("2006-06-01") }).listingYearPerShareValue).toBe(200);
  });
});

describe("MX-7: 2000-04-02 이전 양도 — ⑧·⑫ 차단", () => {
  const OLD = AT("2000-04-02", "1999-12-31", "2000-05-31");
  it("비상장 환산 → ⑧ acquisitionMode 오류 · ⑫ 같은 경로·문구", () => {
    const r = run(form(OLD));
    expect(r.step2).toContainEqual({ field: "acquisitionMode", message: UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED });
    expect(r.blocked).toBe(true);
    if (r.blocked)
      expect(r.issues).toContainEqual({ path: "acquisitionMode", message: UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED });
  });
  it("1998 양도(종전 엔진 「순자산 단독」 구간)도 차단", () => {
    const r = run(form(AT("1998-06-01", "1997-12-31", "1998-08-31")));
    expect(r.step2.map((e) => e.field)).toContain("acquisitionMode");
    expect(r.blocked).toBe(true);
  });
  it("매매사례가액(비상장) — 개산공제 기준시가가 §165④라 같이 차단", () => {
    const r = run(form({ ...OLD, acquisitionMode: "sale_case", acquisitionMarketSamplePrice: "5000" }));
    expect(r.step2).toContainEqual({ field: "acquisitionMode", message: UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED });
    expect(r.blocked).toBe(true);
  });
  it("대조 — 실가 취득은 §165④를 쓰지 않으므로 막지 않는다", () => {
    const r = run(form({ ...OLD, acquisitionMode: "actual", acquisitionActualInputMode: "total", acquisitionTotalPrice: "100000000" }));
    expect(r.step2.map((e) => e.field)).not.toContain("acquisitionMode");
    if (r.blocked) expect(r.issues.map((i) => i.path)).not.toContain("acquisitionMode");
  });
});

describe("MX-8: leaf", () => {
  it("getValuationWeights — 2000-04-03·2007-02-27 max · 2007-02-28 weighted", () => {
    expect(getValuationWeights(new Date("2000-04-03")).model).toBe("max");
    expect(getValuationWeights(new Date("2007-02-27")).model).toBe("max");
    expect(getValuationWeights(new Date("2007-02-28")).model).toBe("weighted");
  });
  it("isSection165_4EraUnsupported — 2000-04-02 참 · 2000-04-03 거짓", () => {
    expect(isSection165_4EraUnsupported(new Date("2000-04-02"))).toBe(true);
    expect(isSection165_4EraUnsupported(new Date("2000-04-03"))).toBe(false);
  });
  it("미지원 구간을 엔진에 직접 넣으면 조용히 값을 내지 않는다(throw)", () => {
    expect(() => calcSection165_4Value(150_000, 200_000, false, new Date("1998-06-01"))).toThrow();
  });
  it("max 구간 — 80% 하한·0 하한 전(2009 이전) 음수 순자산", () => {
    const v = calcSection165_4Value(0, -50_000, false, new Date("2006-06-01"));
    expect(v.value).toBe(0);
    expect(v.floorApplied).toBe(false);
  });
});

describe("MX-9: 취득일 거래정지(코스닥) — 취득측 보충평가도 max · 결과뷰 echo", () => {
  const HALT: Partial<StockTransferFormData> = {
    marketType: "kosdaq",
    acquisitionDate: "1999-01-01",
    acquisitionStdMode: "halt_acquisition",
    transferStdInputMode: "direct",
    transferDatePriceAvg1Month: "200000",
    transferYearNetIncomePerShare: "",
    transferYearNetAssetPerShare: "",
  };
  it("취득 max(6,000, 10,000)=10,000 ÷ 양도 종가평균 200,000 → 300,000,000 (3:2면 228,000,000)", () => {
    const r = ok(run(form(HALT)));
    expect(r.method).toBe("halt_acquisition_conversion");
    expect(r.model).toBe("max");
    expect(r.acq).toBe(300_000_000);
  });
});

describe("MX-10: 양도일 거래정지(코스닥) — 양·취 보충평가 max · 결과뷰 echo", () => {
  it("공통 입력 → 300,000,000 · section165_4Model max", () => {
    const r = ok(run(form({ marketType: "kosdaq", acquisitionDate: "1999-01-01", acquisitionStdMode: "halt_transfer" })));
    expect(r.model).toBe("max");
    expect(r.acq).toBe(300_000_000);
  });
});
