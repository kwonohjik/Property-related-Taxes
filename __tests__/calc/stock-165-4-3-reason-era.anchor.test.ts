/**
 * 영 §165④3 순자산 단독 사유의 **연혁** (Q-3b)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §13
 *
 * 근거(시행본 본문 — 법제처 DRF eflaw, 소득세법 시행령 시행본 195건 전수 대조):
 *   - ~2007.2.27.  §165④3호는 순손익액·순자산가액의 **정의** 규정이다 — 단독 사유 없음
 *                  (2001.1.1.·2002·2003·2004·2005.1.1. 시행본 + 2005.2.19.~2007.2.27. 목록의 시행본 전부)
 *   - 2007.2.28.~2023.2.27.  가(청산·사망) · 나(사업개시 전·1년 미만·휴폐업) ·
 *                  **다(양도일 또는 취득일이 속하는 사업연도 전 3년 이내의 사업연도부터 계속하여 결손금)**
 *                  — 대통령령 제19890호 · 부칙 제3조 「시행 후 최초로 자산을 양도하는 분부터」
 *   - 2023.2.28.~  가 · 나 · **다(자산총액 중 주식등 80% 이상)** · **라(잔여 존속기한 3년 이내)**
 *                  — 대통령령 제33267호 부칙 제9조 「이 영 시행일 이후 주식등을 양도하는 경우부터」 ·
 *                    제23조 「시행 전에 양도한 경우의 기준시가 산정에 관하여는 §165④3호다목의 개정규정에도
 *                    불구하고 종전의 규정에 따른다」
 *
 * 종전 엔진: 사유 4종(가·나·현행 다·라)을 날짜와 무관하게 받았고, 구 다목(3년 연속 결손)은 없었다.
 *
 *   RE-1  2007.2.28.~2023.2.27. — 구 다목(3년 연속 결손)으로 순자산 단독
 *   RE-2  경계 2023-02-27/28 — 구 다목 ↔ 현행 다목·라목
 *   RE-3  경계 2007-02-27/28 — max 구간에는 사유가 없다
 *   RE-4  가목·나목은 2007.2.28. 이후 계속
 *   RE-5  다른 §165④ 경로(취득일 거래정지 · 매매사례가액)도 같은 차단
 *   RE-6  사유를 읽지 않는 경로(실지거래가액 · 취득 후 상장)에는 남은 값을 막지 않는다
 *   RE-7  leaf
 *   RE-8  저장값 복원(normalize)이 구 다목을 지우지 않는다
 *
 * 공통 입력: 양도 6,000,000,000 · 8,000주 · 양도연도 150,000/200,000 · 취득연도 6,000/10,000
 *   순자산 단독: 6e9 × 10,000 ÷ 200,000 = 300,000,000
 *   2022 가중평균: 양도 (150,000×3+200,000×2)÷5 = 170,000(80% 하한 160,000 미발동) ·
 *                 취득 (6,000×3+10,000×2)÷5 = 7,600 → 하한 8,000 → 6e9 × 8,000 ÷ 170,000 = 282,352,941
 *   2015 가중평균(하한 없음): 6e9 × 7,600 ÷ 170,000 = 268,235,294
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
import { isNetAssetOnlyReasonInEra } from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";

type Reason = StockTransferFormData["netAssetOnlyReason"];

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "사유연혁법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2021-12-31",
    acquisitionDate: "2010-01-01",
    transferDate: "2022-06-01",
    shareCount: "8000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    transferYearNetIncomePerShare: "150000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "6000",
    acquisitionYearNetAssetPerShare: "10000",
    filingType: "preliminary",
    filingDate: "2022-08-31",
    ...o,
  } as StockTransferFormData;
}

const AT = (transferDate: string, priorYearEndDate: string, filingDate: string): Partial<StockTransferFormData> => ({
  transferDate,
  priorYearEndDate,
  filingDate,
});
const R = (netAssetOnlyReason: Reason): Partial<StockTransferFormData> => ({ netAssetOnlyReason });

type Run =
  | { blocked: true; issues: { path: string; message: string }[]; step2: { field: string; message: string }[] }
  | { blocked: false; acq: number; reason?: string; step2: { field: string; message: string }[] };

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
  return { blocked: false, acq: r.acquisitionPrice, reason: r.valuationDetail?.netAssetOnlyReason, step2 };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.issues.map((i) => `${i.path} ${i.message}`).join(" | ")}`);
  expect(r.step2).toEqual([]);
  return r;
}
/** ⑧·⑫ 둘 다 `netAssetOnlyReason` 칸에서 같은 문구로 막는다 */
function expectReasonBlocked(r: Run) {
  expect(r.step2.filter((e) => e.field === "netAssetOnlyReason").map((e) => e.message)).toEqual([
    UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
  ]);
  expect(r.blocked).toBe(true);
  if (!r.blocked) return;
  expect(r.issues.filter((i) => i.path === "netAssetOnlyReason").map((i) => i.message)).toEqual([
    UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
  ]);
}

describe("RE-1: 2007.2.28.~2023.2.27. — 구 다목(3년 연속 결손)", () => {
  it("2022 양도 + 3년 연속 결손 → 순자산 단독 300,000,000 · echo", () => {
    const r = ok(run(form(R("consecutive_loss_3y"))));
    expect(r.acq).toBe(300_000_000);
    expect(r.reason).toBe("consecutive_loss_3y");
  });
  it("대조 — 사유 없음 → 가중평균 + 80% 하한 282,352,941", () => {
    expect(ok(run(form())).acq).toBe(282_352_941);
  });
  it("2015 양도 + 3년 연속 결손 → 300,000,000 (사유 없으면 268,235,294)", () => {
    const at = AT("2015-06-01", "2014-12-31", "2015-08-31");
    expect(ok(run(form({ ...at, ...R("consecutive_loss_3y") }))).acq).toBe(300_000_000);
    expect(ok(run(form(at))).acq).toBe(268_235_294);
  });
});

describe("RE-2: 경계 2023-02-27/28", () => {
  const before = AT("2023-02-27", "2022-12-31", "2023-04-30");
  const after = AT("2023-02-28", "2022-12-31", "2023-04-30");
  it("2023-02-27 — 구 다목 계산 · 현행 다목·라목 차단", () => {
    expect(ok(run(form({ ...before, ...R("consecutive_loss_3y") }))).acq).toBe(300_000_000);
    expectReasonBlocked(run(form({ ...before, ...R("stock_holding_company") })));
    expectReasonBlocked(run(form({ ...before, ...R("remaining_term_under_3y") })));
  });
  it("2023-02-28 — 현행 다목·라목 계산 · 구 다목 차단", () => {
    expect(ok(run(form({ ...after, ...R("stock_holding_company") }))).acq).toBe(300_000_000);
    expect(ok(run(form({ ...after, ...R("remaining_term_under_3y") }))).acq).toBe(300_000_000);
    expectReasonBlocked(run(form({ ...after, ...R("consecutive_loss_3y") })));
  });
});

describe("RE-3: 2007.2.27. 이전(max 구간)에는 사유가 없다", () => {
  const max = AT("2006-06-01", "2005-12-31", "2006-08-31");
  it.each<Reason>([
    "liquidation_or_owner_death",
    "no_business_or_short_or_closed",
    "consecutive_loss_3y",
    "stock_holding_company",
    "remaining_term_under_3y",
  ])("2006 양도 + %s → 차단", (reason) => {
    expectReasonBlocked(run(form({ ...max, ...R(reason) })));
  });
  it("경계 — 2007-02-27 차단 · 2007-02-28 계산(구 다목)", () => {
    expectReasonBlocked(run(form({ ...AT("2007-02-27", "2006-12-31", "2007-04-30"), ...R("consecutive_loss_3y") })));
    expect(
      ok(run(form({ ...AT("2007-02-28", "2006-12-31", "2007-04-30"), ...R("consecutive_loss_3y") }))).acq,
    ).toBe(300_000_000);
  });
  it("2000.4.2. 이전은 산식 차단만 — 사유 오류를 겹쳐 내지 않는다", () => {
    const r = run(form({ ...AT("1999-06-01", "1998-12-31", "1999-08-31"), ...R("liquidation_or_owner_death") }));
    expect(r.step2.map((e) => e.field)).not.toContain("netAssetOnlyReason");
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.issues.map((i) => i.path)).not.toContain("netAssetOnlyReason");
  });
});

describe("RE-4: 가목·나목은 2007.2.28. 이후 계속", () => {
  it.each([
    ["2007-02-28", "2006-12-31", "2007-04-30"],
    ["2022-06-01", "2021-12-31", "2022-08-31"],
    ["2024-06-01", "2023-12-31", "2024-08-31"],
  ])("%s 양도 + 가목·나목 → 300,000,000", (td, py, fd) => {
    for (const reason of ["liquidation_or_owner_death", "no_business_or_short_or_closed"] as const)
      expect(ok(run(form({ ...AT(td, py, fd), ...R(reason) }))).acq).toBe(300_000_000);
  });
});

describe("RE-5: 다른 §165④ 경로도 같은 차단", () => {
  it("취득일 거래정지(코스닥) + 2022 양도 + 현행 다목 → 차단", () => {
    expectReasonBlocked(
      run(
        form({
          marketType: "kosdaq",
          acquisitionStdMode: "halt_acquisition",
          transferDatePriceAvg1Month: "750000",
          ...R("stock_holding_company"),
        }),
      ),
    );
  });
  it("매매사례가액(비상장) + 2022 양도 + 현행 라목 → 차단", () => {
    expectReasonBlocked(
      run(form({ acquisitionMode: "sale_case", acquisitionMarketSamplePrice: "30000", ...R("remaining_term_under_3y") })),
    );
  });
});

describe("RE-6: 사유를 읽지 않는 경로에는 남은 값을 막지 않는다 — 칸이 화면에 없다", () => {
  it("실지거래가액 + 2022 양도 + 남은 현행 다목 → 통과", () => {
    const r = ok(
      run(form({ acquisitionMode: "actual", acquisitionActualInputMode: "per_share", perShareAcquisitionPrice: "30000", ...R("stock_holding_company") })),
    );
    expect(r.acq).toBe(240_000_000);
  });
  it("상장 환산(1개월 평균) + 2022 양도 + 남은 현행 다목 → 사유 오류 없음", () => {
    const r = run(
      form({
        marketType: "kospi",
        acquisitionStdMode: "monthly_avg",
        transferDatePriceAvg1Month: "750000",
        acquisitionDatePriceAvg1Month: "30000",
        ...R("stock_holding_company"),
      }),
    );
    expect(r.step2.map((e) => e.field)).not.toContain("netAssetOnlyReason");
    if (r.blocked) expect(r.issues.map((i) => i.path)).not.toContain("netAssetOnlyReason");
  });
});

describe("RE-7: leaf", () => {
  const d = (s: string) => new Date(s);
  it.each<[Reason, string, boolean]>([
    ["", "2006-06-01", true],
    ["liquidation_or_owner_death", "2007-02-27", false],
    ["liquidation_or_owner_death", "2007-02-28", true],
    ["no_business_or_short_or_closed", "2026-01-01", true],
    ["consecutive_loss_3y", "2007-02-27", false],
    ["consecutive_loss_3y", "2007-02-28", true],
    ["consecutive_loss_3y", "2023-02-27", true],
    ["consecutive_loss_3y", "2023-02-28", false],
    ["stock_holding_company", "2023-02-27", false],
    ["stock_holding_company", "2023-02-28", true],
    ["remaining_term_under_3y", "2023-02-27", false],
    ["remaining_term_under_3y", "2023-02-28", true],
  ])("%s @ %s → %s", (reason, date, expected) => {
    expect(isNetAssetOnlyReasonInEra(reason || undefined, d(date))).toBe(expected);
  });
  it("양도일 미상 → 판정하지 않는다(true) — 날짜 오류는 다른 검증이 낸다", () => {
    expect(isNetAssetOnlyReasonInEra("consecutive_loss_3y", undefined)).toBe(true);
    expect(isNetAssetOnlyReasonInEra("consecutive_loss_3y", d("x"))).toBe(true);
  });
});

describe("RE-8: 저장값 복원", () => {
  it("normalize가 consecutive_loss_3y를 보존한다", () => {
    expect(normalizeStockFormData({ ...form(), netAssetOnlyReason: "consecutive_loss_3y" }).netAssetOnlyReason).toBe(
      "consecutive_loss_3y",
    );
  });
});
