/**
 * 분할·다건 lot 의제취득일 전 매수 ① 비교 — 전 스택(폼 ④ → ⑫ Zod → ⑭ → 엔진) · ⑧⇔⑫ 격자 · ③ · 미리보기
 *
 * 계획서 `docs/00-pm/stock-lot-pre-deemed-clause1.plan.md` §6·§7. 엔진 단독 anchor 는
 * `__tests__/tax-engine/stock-transfer/pre-deemed-lots-clause1.anchor.test.ts`.
 * leaf 직접호출 anchor 는 ⑫ 를 거치지 않는다(feedback_leaf_anchor_skips_zod_layer) — 여기는 전 스택이다.
 *
 *   FS-1  분할 · 코스피 환산 ① — 40,000,000 · 31,460,000 (단건 P1 패리티)
 *   FS-2  다건(lots-only) — 폼 전역 양도 종가평균이 합성 매도 lot 에 실린다
 *   FS-3  방식 «none» · stale 값은 body 에 안 실린다
 *   FS-4  ⑧ ⇔ ⑫ 격자 — 같은 입력에 같은 차단/통과
 *   FS-5  ③ normalize · ④ 게이트 · ⑤⑥ 미리보기 = 엔진
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import {
  PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE,
  PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE,
  PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1";
import {
  PRE_DEEMED_LOT_DEEMED_STD_REQUIRED_MESSAGE,
  PRE_DEEMED_LOT_SAMPLE_REQUIRED_MESSAGE,
  PRE_DEEMED_LOT_SAMPLE_STD_REQUIRED_MESSAGE,
  preDeemedLotTransferStdMessage,
} from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1-check";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function parseBody(form: StockTransferFormData) {
  return addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
}
function runFullStack(form: StockTransferFormData) {
  const parsed = parseBody(form);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | "));
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return calculateStockTransferTax(buildEngineInput(coerced));
}
const zodMessages = (f: StockTransferFormData) => {
  const r = parseBody(f);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};
const step2Messages = (f: StockTransferFormData) => validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message);

const BASE = {
  ...createInitialStockFormData(),
  securityName: "테스트",
  isMajorShareholder: true,
  selfShareRatio: "20",
  selfMarketCap: "6000000000",
  totalIssuedShares: "100000",
  priorYearEndDate: "2024-12-31",
  transferPriceMode: "actual",
  transferActualInputMode: "per_share",
  acquisitionMode: "actual",
  filingType: "preliminary",
  filingDate: "2026-07-31",
} as StockTransferFormData;

/** 분할 · 코스피 · 1980-06 1,000주 × 10,000 → 2025-12-01 1,000주 × 200,000 · ① 환산(의제일 20,000 · 양도 100,000) */
function splitForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...BASE,
    marketType: "kospi",
    lotsMode: "split",
    costAllocationMethod: "fifo",
    preDeemedLotClause1Mode: "estimated",
    acquisitionDatePriceAvg1Month: "20000",
    acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    transferLots: [{ id: "t1", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000", transferStdPricePerShare: "100000" }],
    ...o,
  } as StockTransferFormData;
}

/** 다건(lots-only) — 단건 양도 1,000주 · 폼 전역 양도 종가평균 100,000 */
function lotsOnlyForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...BASE,
    marketType: "kospi",
    lotsMode: "single",
    transferDate: "2025-12-01",
    shareCount: "1000",
    perShareTransferPrice: "200000",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    preDeemedLotClause1Mode: "estimated",
    acquisitionDatePriceAvg1Month: "20000",
    transferDatePriceAvg1Month: "100000",
    acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    ...o,
  } as StockTransferFormData;
}

describe("FS-1·2 전 스택 — 단건 P1 패리티", () => {
  it("FS-1 분할 코스피 환산 ① → 취득 40,000,000 · 개산공제 200,000 · 세액 31,460,000", () => {
    const r = runFullStack(splitForm());
    expect(r.acquisitionPrice).toBe(40_000_000);
    expect(r.expenses).toBe(200_000);
    expect(r.calculatedTax).toBe(31_460_000);
    expect(r.preDeemedLotsDetail?.clause1?.settlement?.estimatedDeduction).toBe(200_000);
  });
  it("FS-2 다건(lots-only) — 폼 전역 양도 종가평균이 합성 매도 lot 으로 도달한다 → 같은 값", () => {
    const body = buildStockTransferApiBody(lotsOnlyForm()) as { transferLots: { transferStdPricePerShare?: number }[] };
    expect(body.transferLots[0].transferStdPricePerShare).toBe(100_000);
    const r = runFullStack(lotsOnlyForm());
    expect(r.acquisitionPrice).toBe(40_000_000);
    expect(r.calculatedTax).toBe(31_460_000);
  });
  it("FS-1b 단서 swap(실비 30,000,000 · 의제일 6,500) — 양도소득금액 170,000,000 · 세액 33,500,000 (단건 P5)", () => {
    const r = runFullStack(splitForm({ acquisitionDatePriceAvg1Month: "6500", actualExpenses: "30000000" }));
    expect(r.transferIncome).toBe(170_000_000);
    expect(r.calculatedTax).toBe(33_500_000);
    expect(r.preDeemedLotsDetail?.clause1?.settlement?.swapApplied).toBe(true);
  });
  it("FS-1c 비상장 매매사례 ① — 취득 60,000,000 · 개산공제 1,000,000 (전 스택)", () => {
    const f = splitForm({
      marketType: "unlisted",
      preDeemedLotClause1Mode: "sale_case",
      acquisitionDatePriceAvg1Month: "",
      acquisitionMarketSamplePrice: "60000",
      acquisitionMarketSampleDate: "1985-12-20",
      acquisitionYearNetIncomePerShare: "100000",
      acquisitionYearNetAssetPerShare: "100000",
    });
    const r = runFullStack(f);
    expect(r.acquisitionPrice).toBe(60_000_000);
    expect(r.expenses).toBe(1_000_000);
  });
});

describe("FS-3 방식 «none» · stale 값", () => {
  it("none 이면 ① 필드가 body 에 실리지 않고 현행 ②만 (취득 12,910,000 · 세액 36,918,000)", () => {
    const f = splitForm({ preDeemedLotClause1Mode: "none" });
    const body = buildStockTransferApiBody(f) as Record<string, unknown> & { transferLots: Record<string, unknown>[] };
    expect(body.preDeemedLotClause1).toBeUndefined();
    expect(body.acquisitionDatePriceAvg1Month).toBeUndefined();
    expect(body.transferLots[0].transferStdPricePerShare).toBeUndefined();
    const r = runFullStack(f);
    expect(r.acquisitionPrice).toBe(12_910_000);
    expect(r.calculatedTax).toBe(36_918_000);
  });
  it("의제 lot 이 없으면(취득일을 2000년으로 바꿈) 방식이 남아 있어도 싣지 않는다 — 막을 것도 없다", () => {
    const f = splitForm({
      acquisitionLots: [{ id: "a1", acquisitionDate: "2000-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    });
    const body = buildStockTransferApiBody(f) as Record<string, unknown>;
    expect(body.preDeemedLotClause1).toBeUndefined();
    expect(step2Messages(f)).toEqual([]);
    expect(zodMessages(f)).toEqual([]);
    expect(runFullStack(f).acquisitionPrice).toBe(10_000_000);
  });
  it("단건 모드(lotsMode single · 실가 per_share)에서는 방식 값이 있어도 싣지 않는다", () => {
    const f = {
      ...BASE, marketType: "kospi", lotsMode: "single", transferDate: "2025-12-01", acquisitionDate: "1980-06-10",
      shareCount: "1000", perShareTransferPrice: "200000", perShareAcquisitionPrice: "10000", acquisitionActualInputMode: "per_share",
      preDeemedLotClause1Mode: "estimated",
    } as StockTransferFormData;
    expect((buildStockTransferApiBody(f) as Record<string, unknown>).preDeemedLotClause1).toBeUndefined();
  });
});

describe("FS-4 ⑧ ⇔ ⑫ 격자 — 같은 입력에 같은 차단/통과", () => {
  type Case = { name: string; form: StockTransferFormData; msg?: string };
  const unlistedSale = (o: Partial<StockTransferFormData> = {}) =>
    splitForm({
      marketType: "unlisted",
      preDeemedLotClause1Mode: "sale_case",
      acquisitionDatePriceAvg1Month: "",
      acquisitionMarketSamplePrice: "60000",
      acquisitionMarketSampleDate: "1985-12-20",
      acquisitionYearNetIncomePerShare: "100000",
      acquisitionYearNetAssetPerShare: "100000",
      ...o,
    });
  const twoSales = (o: Partial<StockTransferFormData> = {}) =>
    splitForm({
      // 매수 A 1980(500주) · B 2010(1,500주) → 매도1 500주(A 전량) · 매도2 1,000주(B) — 매도2 는 의제 lot 을 소진하지 않는다
      // 두 매도는 같은 하반기다 — 예정신고(BASE)에서 반기가 갈리면 신고기간 게이트(§105①2호)가 막는다
      acquisitionLots: [
        { id: "A", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "500", perShareAcquisitionPrice: "10000" },
        { id: "B", acquisitionDate: "2010-03-02", acquisitionCause: "purchase", shareCount: "1500", perShareAcquisitionPrice: "50000" },
      ],
      transferLots: [
        { id: "t1", transferDate: "2025-08-01", shareCount: "500", perShareTransferPrice: "200000", transferStdPricePerShare: "100000" },
        { id: "t2", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000" },
      ],
      ...o,
    });
  const cases: Case[] = [
    { name: "정상 — 상장 환산", form: splitForm() },
    { name: "정상 — 비상장 매매사례", form: unlistedSale() },
    { name: "정상 — 방식 none", form: splitForm({ preDeemedLotClause1Mode: "none" }) },
    { name: "정상 — 매도2 는 의제 lot 을 소진하지 않아 기준시가 불요", form: twoSales() },
    { name: "정상 — 다건(lots-only)", form: lotsOnlyForm() },
    { name: "차단 — 비상장 + 환산(Phase 2)", form: splitForm({ marketType: "unlisted" }), msg: PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE },
    { name: "차단 — 기타자산 + 환산(Phase 2)", form: splitForm({ marketType: "other_asset", isHeavyRealEstateForRate: true }), msg: PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE },
    { name: "차단 — 상장 + 매매사례", form: splitForm({ preDeemedLotClause1Mode: "sale_case" }), msg: PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE },
    {
      name: "차단 — 자본조정 동반",
      form: splitForm({ capitalAdjustments: [{ type: "bonus_capital_reserve", eventDate: "2000-01-01", ratio: "0.1" }] } as Partial<StockTransferFormData>),
      msg: PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE,
    },
    { name: "차단 — 의제일 종가평균 누락", form: splitForm({ acquisitionDatePriceAvg1Month: "" }), msg: PRE_DEEMED_LOT_DEEMED_STD_REQUIRED_MESSAGE },
    {
      name: "차단 — 의제 lot 을 소진하는 매도의 양도 종가평균 누락",
      form: splitForm({ transferLots: [{ id: "t1", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000" }] }),
      msg: preDeemedLotTransferStdMessage(1),
    },
    {
      name: "차단 — 매도1(의제 lot 소진)의 종가평균 누락 · 매도2 는 불요",
      form: twoSales({
        transferLots: [
          { id: "t1", transferDate: "2025-08-01", shareCount: "500", perShareTransferPrice: "200000" },
          { id: "t2", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000" },
        ],
      }),
      msg: preDeemedLotTransferStdMessage(1),
    },
    { name: "차단 — 다건 양도 종가평균 누락", form: lotsOnlyForm({ transferDatePriceAvg1Month: "" }), msg: preDeemedLotTransferStdMessage(1) },
    { name: "차단 — 매매사례가 누락", form: unlistedSale({ acquisitionMarketSamplePrice: "" }), msg: PRE_DEEMED_LOT_SAMPLE_REQUIRED_MESSAGE },
    {
      name: "차단 — 매매사례 개산공제 base(취득측 순손익·순자산) 누락",
      form: unlistedSale({ acquisitionYearNetIncomePerShare: "", acquisitionYearNetAssetPerShare: "" }),
      msg: PRE_DEEMED_LOT_SAMPLE_STD_REQUIRED_MESSAGE,
    },
  ];
  it.each(cases)("$name", ({ form, msg }) => {
    const s2 = step2Messages(form);
    const zd = zodMessages(form);
    if (msg === undefined) {
      expect(s2).toEqual([]);
      expect(zd).toEqual([]);
    } else {
      expect(s2).toContain(msg);
      expect(zd).toContain(msg);
    }
  });
  it("매도2 기준시가 누락은 «불요» 쪽에서만 통과한다(긍정 짝) — 매도1 값이 있으면 매도2 값 없이 계산된다", () => {
    const r = runFullStack(twoSales());
    // 매도1: A 500주 ① = 200,000 × 20,000 ÷ 100,000 = 40,000 · 매도2: B 1,000주 실가 50,000
    expect(r.acquisitionPrice).toBe(500 * 40_000 + 1000 * 50_000);
  });
});

describe("FS-5 ③ normalize · ⑤⑥ 미리보기 = 엔진", () => {
  it("③ 미지값 → none · 유효값·lot 의 양도 기준시가 보존", () => {
    const f = splitForm();
    const round = normalizeStockFormData(JSON.parse(JSON.stringify(f)));
    expect(round.preDeemedLotClause1Mode).toBe("estimated");
    expect(round.transferLots[0].transferStdPricePerShare).toBe("100000");
    expect(normalizeStockFormData({ ...JSON.parse(JSON.stringify(f)), preDeemedLotClause1Mode: "bogus" }).preDeemedLotClause1Mode).toBe("none");
    expect(normalizeStockFormData({}).preDeemedLotClause1Mode).toBe("none");
  });
  it("⑥ 미리보기(`previewSplitAllocation`) 취득가액 = 엔진 lotMatchingDetail (① 채택 · swap 없음)", () => {
    const f = splitForm();
    const prev = previewSplitAllocation(f);
    expect(prev?.totalAcquisitionPrice).toBe(40_000_000);
    expect(prev?.totalAcquisitionPrice).toBe(runFullStack(f).lotMatchingDetail?.totalAcquisitionPrice);
    expect(prev?.preDeemedClause1Summary).toMatchObject({ method: "estimated", clause1Shares: 1000 });
  });
});
