/**
 * 기타자산(주식등) 환산취득가 — 비상장 보충평가 경로 편입 (영 §165⑧1호 → 법 §99①4 → 영 §165④)
 *
 * 계획서 `docs/00-pm/stock-other-asset-estimated-supplementary-valuation.plan.md` §1 · §3 · §4
 *
 *   SV-1  술어 `usesUnlistedSupplementaryValuation` — 비상장·기타자산만 참
 *   SV-2  D-1 — 기타자산 + 환산(장부 있음)이 비상장과 같은 보충평가를 탄다 (종전: 상장 종가평균 경로 → 취득가액 0)
 *   SV-3  D-2 — 기타자산 + 장부분실 토글이 ④로 실려 ⑫를 통과한다 (종전: 토글이 숨긴 취득연도 칸을 ⑫가 요구 — 막다른 길)
 *   SV-4  §163⑨ 예외(#1936)가 기타자산에도 닿는다 — 상속·증여 + 장부분실
 *   SV-5  결산서(full) 모드 어댑터(④)도 기타자산에 합성한다
 *   SV-6  불변 — 상장 환산 · 기타자산 실가·매매사례
 *
 * 수치: 사례 49 — 6,000,000,000 × 12,500 ÷ 160,000 = 468,750,000 (독립 손계산, 이전 PR과 같은 값).
 *       장부 있음 — 양도기준시가 floor(30,000×3/5 + 200,000×2/5)=98,000 → 하한 160,000 · 취득기준시가 floor(5,000×3/5 + 20,000×2/5)=11,000
 *       → 하한 16,000 → 6,000,000,000 × 16,000 ÷ 160,000 = 600,000,000 (비상장 대조군과 같다)
 *
 * 🔁 2026-10-04 재기준 — 영 §165⑧1호 후단(라목 주식등은 순자산가치 단독, 2023.2.28. 이후 양도).
 *    이 파일의 기타자산 픽스처는 **라목**이라 위 3:2 수치는 비상장 대조군에만 남는다. 기타자산(라목)은:
 *      장부 있음  : 6,000,000,000 × 20,000 ÷ 200,000 = 600,000,000 (값은 우연히 같다 — 방식이 net_asset_only)
 *      장부분실   : 6,000,000,000 × 12,500 ÷ 200,000 = 375,000,000 (468,750,000 아님)
 *    계획서 `docs/00-pm/stock-165-8-1-ra-net-asset-only.plan.md` §8 · anchor `stock-165-8-1-ra-net-asset-only.anchor.test.ts`
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { usesUnlistedSupplementaryValuation } from "@/lib/tax-engine/stock-transfer/supplementary-valuation-market";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "기타자산",
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
    transferYearNetIncomePerShare: "30000",
    transferYearNetAssetPerShare: "200000",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    ...o,
  } as StockTransferFormData;
}

/** §94①4 라목(부동산과다보유법인) 기타자산 */
const OTHER: Partial<StockTransferFormData> = { marketType: "other_asset", isHeavyRealEstateForRate: true };
const BOOK_LOST: Partial<StockTransferFormData> = { acqFaceValueOnly: true, acqFaceValuePerShare: "12500" };
const BOOKS_KEPT: Partial<StockTransferFormData> = {
  acquisitionYearNetIncomePerShare: "5000",
  acquisitionYearNetAssetPerShare: "20000",
};
const INHERIT: Partial<StockTransferFormData> = { acquisitionCause: "inheritance", decedentAcquisitionDate: "1988-01-01" };

type Run =
  | { blocked: true; paths: string[]; step2: string[]; body: Record<string, unknown> }
  | { blocked: false; acq: number; method?: string; warnings: string[]; step2: string[]; body: Record<string, unknown> };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")), step2, body };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  const r = calculateStockTransferTax(buildEngineInput(coerced));
  return { blocked: false, acq: r.acquisitionPrice, method: r.valuationDetail?.method, warnings: r.warnings ?? [], step2, body };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.paths.join(", ")}`);
  return r;
}

describe("SV-1: 술어 — 비상장 보충평가를 타는 시장", () => {
  it.each([
    ["unlisted", true],
    ["other_asset", true],
    ["kospi", false],
    ["kosdaq", false],
    ["konex", false],
    ["foreign_stock", false],
    ["exit_tax", false],
    ["", false],
    [undefined, false],
  ] as const)("%s → %s", (m, expected) => {
    expect(usesUnlistedSupplementaryValuation(m)).toBe(expected);
  });
});

describe("SV-2: D-1 — 기타자산 환산(장부 있음)이 비상장과 같은 보충평가를 탄다", () => {
  const control = ok(run(form(BOOKS_KEPT)));
  it("대조군 — 비상장은 600,000,000 · weighted_avg", () => {
    expect(control.acq).toBe(600_000_000);
    expect(control.method).toBe("weighted_avg");
  });
  it("기타자산(라목) → 비상장 보충평가 경로 · 600,000,000 (종전: 0 · monthly_avg_listed)", () => {
    const r = ok(run(form({ ...OTHER, ...BOOKS_KEPT })));
    expect(r.acq).toBe(600_000_000);
    // 라목이라 순자산 단독(영 §165⑧1호 후단) — 대조군(weighted_avg)과 값만 같다
    expect(r.method).toBe("net_asset_only");
  });
  it("«종가평균이 0 이하» 경고가 더는 나오지 않는다 — 상장 경로를 타지 않는다", () => {
    const r = ok(run(form({ ...OTHER, ...BOOKS_KEPT })));
    expect(r.warnings.join("\n")).not.toContain("1개월 종가평균이 0 이하");
  });
});

describe("SV-3: D-2 — 기타자산 + 장부분실 토글이 끝까지 간다", () => {
  it("④가 토글·액면가를 싣고 ⑫를 통과해 375,000,000 (종전: 취득연도 칸 요구로 차단 · 라목 단독 재기준)", () => {
    const r = ok(run(form({ ...OTHER, ...BOOK_LOST })));
    expect(r.body.acqFaceValueOnly).toBe(true);
    expect(r.body.acqFaceValuePerShare).toBe(12_500);
    expect(r.acq).toBe(375_000_000);
    expect(r.method).toBe("acq_face_value_only");
  });
  it("§94②(비상장 + 라목)와 같은 값 — 두 입력 경로가 갈리지 않는다", () => {
    const viaUnlisted = ok(run(form({ isHeavyRealEstateForRate: true, ...BOOK_LOST })));
    const viaOther = ok(run(form({ ...OTHER, ...BOOK_LOST })));
    expect(viaOther.acq).toBe(viaUnlisted.acq);
  });
  it("반쪽 입력 — 토글만 켜고 액면가가 없으면 ⑧이 막는다 (대조군 비상장과 같다)", () => {
    const f = form({ ...OTHER, acqFaceValueOnly: true, acqFaceValuePerShare: "" });
    expect(run(f).step2).toContain("acqFaceValuePerShare");
  });
});

describe("SV-4: §163⑨ 예외가 기타자산에도 닿는다 — 상속·증여 + 장부분실", () => {
  it("1990 상속 + 장부분실 → 통과 · 375,000,000 (종전: ⑧·⑫ 차단)", () => {
    const r = run(form({ ...OTHER, ...BOOK_LOST, ...INHERIT }));
    expect(r.step2).not.toContain("acquisitionMode");
    expect(ok(r).acq).toBe(375_000_000);
  });
  it("1990 증여 + 장부분실 → 통과", () => {
    expect(ok(run(form({ ...OTHER, ...BOOK_LOST, acquisitionCause: "gift" }))).acq).toBe(375_000_000);
  });
  it("부정 짝 — 상속 + 장부 있음(환산)은 차단 (평가액을 구할 수 있다)", () => {
    const r = run(form({ ...OTHER, ...BOOKS_KEPT, ...INHERIT }));
    expect(r.step2).toContain("acquisitionMode");
    expect(r.blocked).toBe(true);
  });
  it("부정 짝 — 상속 + 매매사례는 장부분실이어도 차단", () => {
    const r = run(form({ ...OTHER, ...BOOK_LOST, ...INHERIT, acquisitionMode: "sale_case" }));
    expect(r.blocked).toBe(true);
  });
});

describe("SV-5: 결산서(full) 모드 — ④ 어댑터가 기타자산에도 4값을 합성한다", () => {
  const FULL: Partial<StockTransferFormData> = { unlistedValuationMode: "full", transferYearNetIncomePerShare: "", transferYearNetAssetPerShare: "" };
  it("비상장 대조군 — 양도·취득 순자산가치가 body에 실린다", () => {
    const b = buildStockTransferApiBody(form(FULL)) as Record<string, unknown>;
    expect(typeof b.transferYearNetAssetPerShare).toBe("number");
    expect(typeof b.acquisitionYearNetAssetPerShare).toBe("number");
  });
  it("기타자산도 같다 (종전: 어댑터가 건너뛰어 키가 없었다)", () => {
    const b = buildStockTransferApiBody(form({ ...OTHER, ...FULL })) as Record<string, unknown>;
    expect(typeof b.transferYearNetAssetPerShare).toBe("number");
    expect(typeof b.acquisitionYearNetAssetPerShare).toBe("number");
  });
});

describe("SV-6: 불변 — 상장 환산 · 기타자산 실가·매매사례", () => {
  it("코스피 환산은 여전히 상장 종가평균 경로", () => {
    const r = ok(
      run(
        form({
          marketType: "kospi",
          acquisitionStdMode: "monthly_avg",
          transferStdInputMode: "direct",
          acquisitionStdInputMode: "direct",
          transferDatePriceAvg1Month: "100000",
          acquisitionDatePriceAvg1Month: "20000",
        }),
      ),
    );
    expect(r.method).toBe("monthly_avg_listed");
    expect(r.acq).toBe(1_200_000_000); // 6,000,000,000 × 20,000 ÷ 100,000
  });
  it("기타자산 실가 모드 — 입력 취득가액 그대로", () => {
    const r = ok(
      run(
        form({
          ...OTHER,
          acquisitionMode: "actual",
          acquisitionActualInputMode: "total",
          acquisitionTotalPrice: "500000000",
          acquisitionDate: "2010-01-01",
        }),
      ),
    );
    expect(r.acq).toBe(500_000_000);
  });
});
