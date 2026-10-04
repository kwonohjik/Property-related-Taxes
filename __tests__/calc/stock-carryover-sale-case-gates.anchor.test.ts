/**
 * 이월과세 × 매매사례 · 영 §163⑨ — 입력 게이트 anchor (폼 → ④ → ⑫ Zod → ⑭ → 엔진)
 *
 * 계획서 `docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md` §6 · §7
 *
 *   CO-5   단순 증여 + 매매사례 → ⑧·⑫ 차단 (영 §163⑨ · 국심2007중1761)
 *   CO-5b  같은 입력을 실가(평가액)로 → 통과 · 개산공제 없음 (CO-5의 긍정 짝)
 *   CO-6   상속 + 환산 → 차단 (Q-2 상속 포함)
 *   CO-7   날짜가 아니라 장부분실로 가른다 — 의제취득일 «전»이어도 장부분실이 아니면 차단 (2026-10-04 재기준 — 계획서 stock-163-9-valuation-unavailable-exception.plan.md)
 *   CO-8   복원 마이그레이션 — 이월과세 + 수증자 환산 → 증여자 방식으로 이관 · 수증자 실가
 *   CO-3   증여자 매매사례인데 기준시가 없음 → 경고(개산공제 미적용) · 계산은 진행
 *   CO-11  상장 + 증여자 매매사례 → 차단 (영 §176의2③1호 괄호)
 *   CO-12  증여자 환산 분모 미입력 → ⑧·⑫ 오류
 *   CO-13  코스닥 양도일 거래정지 + 증여자 환산 → 분모 = 양도연도 보충평가 (Phase 3 수증자 경로와 같은 값)
 *   AP-1   ④ body — 방식별 입력만 싣고 stale 분자 갈래(취득후상장)를 끊는다
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep1Domestic } from "@/lib/calc/stock-transfer-tax-validate-step1";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { isGiftLikeEstimationBlocked } from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

type Run =
  | { blocked: true; paths: string[] }
  | { blocked: false; result: StockTransferResult; body: Record<string, unknown> };

function runFullStack(form: StockTransferFormData): Run {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")) };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}
function ok(run: Run) {
  if (run.blocked) throw new Error(`blocked: ${run.paths.join(", ")}`);
  return run;
}

/** 비상장 100주 · 양도 2억 · 수증일 2025-03-01 · 양도 2025-12-01 · 증여일 평가액 1,500,000/주 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "1000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2025-03-01",
    transferDate: "2025-12-01",
    shareCount: "100",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "1500000",
    filingType: "preliminary",
    filingDate: "2026-02-28",
    ...o,
  } as StockTransferFormData;
}
const CARRYOVER: Partial<StockTransferFormData> = {
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2015-06-01",
  donorRelation: "spouse",
};
const errFields = (errs: { field: string; severity: string }[], sev = "error") =>
  errs.filter((e) => e.severity === sev).map((e) => e.field);

describe("CO-5·5b·6·7: 영 §163⑨ — 증여·상속 자산은 평가액이 실지거래가액 (매매사례 불가 · 환산은 장부분실일 때만)", () => {
  it("CO-5: 단순 증여 + 매매사례 → ⑧ 차단", () => {
    const f = form({ acquisitionCause: "gift", acquisitionMode: "sale_case", acquisitionMarketSamplePrice: "1400000" });
    expect(errFields(validateStep2Domestic(f))).toContain("acquisitionMode");
  });
  it("CO-5: 같은 입력은 ⑫도 막는다", () => {
    const run = runFullStack(
      form({
        acquisitionCause: "gift",
        acquisitionMode: "sale_case",
        acquisitionMarketSamplePrice: "1400000",
        acquisitionYearNetIncomePerShare: "300000",
        acquisitionYearNetAssetPerShare: "300000",
      }),
    );
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("acquisitionMode");
  });
  it("CO-5b: 실가(증여일 평가액)로 바꾸면 통과 — 취득가액 1억5천만원 · 개산공제 없음", () => {
    const { result } = ok(runFullStack(form({ acquisitionCause: "gift" })));
    expect(result.acquisitionPrice).toBe(150_000_000);
    expect(result.estimatedDeduction).toBeUndefined();
    expect(errFields(validateStep2Domestic(form({ acquisitionCause: "gift" })))).not.toContain("acquisitionMode");
  });
  it("CO-6: 상속 + 환산 → 차단 (국심2007중1761은 상속 사례 자체)", () => {
    const f = form({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01", acquisitionMode: "estimated" });
    expect(errFields(validateStep2Domestic(f))).toContain("acquisitionMode");
  });
  it("CO-7: 날짜가 아니라 장부분실로 가른다 — 의제취득일 «전»이어도 장부분실이 아니면 막는다 (계획서 Q-4)", () => {
    // 2026-10-04 재기준 — 종전 CO-7은 「의제취득일 전 증여는 막지 않는다(영 §176의2④)」를 고정했다.
    //   그 괄호는 추계를 «적용하게 된 경우»의 산정 방법이지 허용 근거가 아니며(국심2003부0627),
    //   술어는 날짜를 받지 않는다. 장부분실은 stock-163-9-book-lost-exception BL-1~5.
    for (const date of ["1985-12-31", "1986-01-01", "2025-01-01"]) {
      const f = form({ acquisitionCause: "gift", acquisitionDate: date, acquisitionMode: "estimated" });
      expect(errFields(validateStep2Domestic(f)), date).toContain("acquisitionMode");
    }
    expect(isGiftLikeEstimationBlocked("gift", "estimated", false)).toBe(true);
    expect(isGiftLikeEstimationBlocked("gift", "estimated", true)).toBe(false); // 긍정 짝 — 장부분실
    expect(isGiftLikeEstimationBlocked("gift", "sale_case", true)).toBe(true); // 매매사례는 장부분실이어도 막는다
    expect(isGiftLikeEstimationBlocked("purchase", "estimated", false)).toBe(false);
    expect(isGiftLikeEstimationBlocked("gift", "actual", false)).toBe(false);
  });
});

describe("CO-8: 복원 마이그레이션 — ⑧과 같은 술어일 때만 되돌린다", () => {
  it("이월과세 + 수증자 환산(구 Phase 3 화면) → 증여자 방식 「환산」으로 이관 · 수증자 실가", () => {
    const n = normalizeStockFormData({ ...form(CARRYOVER), acquisitionMode: "estimated", donorAcquisitionMethod: undefined });
    expect(n.acquisitionMode).toBe("actual");
    expect(n.donorAcquisitionMethod).toBe("estimated");
  });
  it("단순 증여 + 매매사례 → 실가", () => {
    const n = normalizeStockFormData({ ...form({ acquisitionCause: "gift" }), acquisitionMode: "sale_case" });
    expect(n.acquisitionMode).toBe("actual");
  });
  it("의제취득일 이전 상속 + 환산(장부분실 아님) → 실가 (날짜는 기준이 아니다)", () => {
    const n = normalizeStockFormData({
      ...form({ acquisitionCause: "inheritance", acquisitionDate: "1985-09-13" }),
      acquisitionMode: "estimated",
    });
    expect(n.acquisitionMode).toBe("actual");
  });
  it("긍정 짝 — 의제취득일 이전 상속 + 환산 + 장부분실 → 그대로 (사례 49)", () => {
    const n = normalizeStockFormData({
      ...form({ acquisitionCause: "inheritance", acquisitionDate: "1985-09-13", acqFaceValueOnly: true, acqFaceValuePerShare: "12500" }),
      acquisitionMode: "estimated",
    });
    expect(n.acquisitionMode).toBe("estimated");
  });
  it("매수 + 환산 → 그대로 (술어 밖)", () => {
    const n = normalizeStockFormData({ ...form(), acquisitionMode: "estimated" });
    expect(n.acquisitionMode).toBe("estimated");
  });
});

describe("CO-3·11: 증여자 매매사례 입력 게이트", () => {
  it("CO-3: 기준시가 없음 → 경고만 · 계산은 진행되고 개산공제 0", () => {
    const f = form({
      ...CARRYOVER,
      donorAcquisitionMethod: "sale_case",
      donorAcquisitionMarketSamplePrice: "300000",
      donorAcquisitionMarketSampleDate: "2015-07-01",
    });
    expect(errFields(validateStep1Domestic(f), "warning")).toContain("donorAcquisitionStdPrice");
    expect(errFields(validateStep1Domestic(f))).not.toContain("donorAcquisitionStdPrice");
    const { result } = ok(runFullStack(f));
    expect(result.acquisitionPrice).toBe(30_000_000);
    expect(result.estimatedDeduction).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("증여자 취득 당시 기준시가가 없어");
  });
  it("CO-11: 상장 + 증여자 매매사례 → ⑧·⑫ 차단", () => {
    const f = form({
      ...CARRYOVER,
      marketType: "kosdaq",
      donorAcquisitionMethod: "sale_case",
      donorAcquisitionMarketSamplePrice: "300000",
      donorAcquisitionStdPrice: "50000",
    });
    expect(errFields(validateStep1Domestic(f))).toContain("donorAcquisitionMethod");
    const run = runFullStack(f);
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("donorAcquisitionMethod");
  });
});

describe("CO-12·13: 증여자 기준 환산의 분모", () => {
  const conv = (o: Partial<StockTransferFormData> = {}) =>
    form({ ...CARRYOVER, donorAcquisitionMethod: "estimated", donorAcquisitionStdPrice: "50000", ...o });

  it("CO-12: 비상장 — 양도연도 순손익·순자산 미입력 → ⑧·⑫ 오류", () => {
    const f = conv();
    const fields = errFields(validateStep2Domestic(f));
    expect(fields).toContain("transferYearNetIncomePerShare");
    expect(fields).toContain("transferYearNetAssetPerShare");
    const run = runFullStack(f);
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("transferYearNetAssetPerShare");
  });
  it("CO-12: 코스닥 — 양도일 1개월 종가평균 미입력 → ⑧·⑫ 오류", () => {
    const f = conv({ marketType: "kosdaq" });
    expect(errFields(validateStep2Domestic(f))).toContain("transferDatePriceAvg1Month");
    const run = runFullStack(f);
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("transferDatePriceAvg1Month");
  });
  it("CO-12 긍정 짝: 비상장 분모 입력 → 환산취득가 = 2억 × 50,000 / 양도기준시가", () => {
    const { result, body } = ok(
      runFullStack(conv({ transferYearNetIncomePerShare: "100000", transferYearNetAssetPerShare: "100000" })),
    );
    expect(body.acquisitionMode).toBe("actual");
    expect(result.carryoverDetail?.outcome).toBe("applied");
    // 양도기준시가 100,000(순손익=순자산) → 2억 × 50,000 / 100,000 = 1억
    expect(result.acquisitionPrice).toBe(100_000_000);
    expect(result.estimatedDeduction).toBe(50_000); // 50,000 × 100주 × 1%
  });
  it("CO-13: 코스닥 양도일 거래정지 — 분모는 양도연도 보충평가, Phase 3 수증자 경로와 같은 값", () => {
    const f = conv({
      marketType: "kosdaq",
      acquisitionStdMode: "halt_transfer",
      transferYearNetIncomePerShare: "120000",
      transferYearNetAssetPerShare: "100000",
    });
    const { result, body } = ok(runFullStack(f));
    expect(body.tradingHaltAtTransfer).toBe(true);
    // Phase 3 경로(수증자 모드 estimated가 A 방식을 겸하던 입력)로 같은 A를 직접 계산
    const legacy = calculateStockTransferTax(
      buildEngineInput(
        coerceDates({ ...body, acquisitionMode: "estimated", donorAcquisitionMethod: undefined }, [...STOCK_DATE_FIELDS]),
      ),
    );
    expect(result.carryoverDetail?.outcome).toBe("applied");
    expect(result.acquisitionPrice).toBe(legacy.acquisitionPrice);
    expect(result.acquisitionPrice).toBeGreaterThan(0);
  });
});

describe("AP-1: ④ body — 방식별 입력만 · stale 분자 갈래 차단", () => {
  it("증여자 매매사례 → 사례가·일자·기준시가만 싣고 증여자 실가 잔존값은 싣지 않는다", () => {
    const body = buildStockTransferApiBody(
      form({
        ...CARRYOVER,
        donorAcquisitionMethod: "sale_case",
        donorAcquisitionPrice: "999999",
        donorAcquisitionMarketSamplePrice: "300000",
        donorAcquisitionMarketSampleDate: "2015-07-01",
        donorAcquisitionStdPrice: "50000",
      }),
    );
    expect(body.donorAcquisitionMethod).toBe("sale_case");
    expect(body.donorAcquisitionMarketSamplePrice).toBe(300_000);
    expect(body.donorAcquisitionMarketSampleDate).toBe("2015-07-01");
    expect(body.donorAcquisitionStdPrice).toBe(50_000);
    expect(body.donorAcquisitionPrice).toBeUndefined();
  });
  it("증여자 환산 + 수증자 환산 시절의 stale `post_listing` → 취득후상장 플래그를 세우지 않는다", () => {
    const body = buildStockTransferApiBody(
      form({
        ...CARRYOVER,
        marketType: "kosdaq",
        donorAcquisitionMethod: "estimated",
        donorAcquisitionStdPrice: "50000",
        acquisitionStdMode: "post_listing",
        transferDatePriceAvg1Month: "100000",
      }),
    );
    expect(body.acquiredBeforeListing).toBe(false);
    expect(body.tradingHaltAtAcquisition).toBe(false);
    expect(body.transferDatePriceAvg1Month).toBe(100_000);
  });
});
