/**
 * 영 §163⑨ 추계 차단의 예외 기준 — «의제취득일»이 아니라 «평가액 확인 불가(장부분실 — 법 §99①4 후단)»
 *
 * 계획서 `docs/00-pm/stock-163-9-valuation-unavailable-exception.plan.md` §1 · §3 · §5
 *
 *   BL-1  술어 — 상속·증여 ∧ 추계 모드 ∧ ¬(환산 ∧ 장부분실). 날짜는 보지 않는다
 *   BL-2  leaf  — 장부분실 = 토글 ∧ 액면가>0 ∧ (비상장·기타자산 ∨ 양도일 거래정지). 엔진이 그 분기를 타는 조건과 같다
 *   BL-3  풀스택(폼 → ④ → ⑫ Zod → ⑭ → 엔진) — 사례 49 수치로 P1~P7
 *   BL-4  ③ 복원 마이그레이션 — 같은 술어
 *   BL-5  엔진 B(이월과세 수증자 측) — 같은 술어
 *
 * 사례 49: 양도가 6,000,000,000 · 8,000주 · 액면가 12,500 · 양도기준시가 = max(30,000×3/5 + 200,000×2/5, 200,000×0.8) = 160,000
 *          → 환산취득가 = 6,000,000,000 × 12,500 ÷ 160,000 = 468,750,000 (독립 손계산)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildStockScenarioB } from "@/lib/tax-engine/stock-transfer/stock-carryover";
import {
  isBookLostAtAcquisition,
  isGiftLikeEstimationBlocked,
} from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import { isBookLostAtAcquisitionForm } from "@/lib/calc/stock-transfer-section94-4-form";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "사례49",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "1985-09-13",
    transferDate: "2024-06-01",
    shareCount: "8000",
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: "1980-01-01",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    acqFaceValueOnly: true,
    acqFaceValuePerShare: "12500",
    transferYearNetIncomePerShare: "30000",
    transferYearNetAssetPerShare: "200000",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    ...o,
  } as StockTransferFormData;
}

/** 장부 있음 — 취득연도 순손익·순자산으로 환산(액면가 토글 OFF) */
const BOOKS_KEPT: Partial<StockTransferFormData> = {
  acqFaceValueOnly: false,
  acqFaceValuePerShare: "",
  acquisitionYearNetIncomePerShare: "5000",
  acquisitionYearNetAssetPerShare: "20000",
};

type Run =
  | { blocked: true; paths: string[]; step2: string[] }
  | { blocked: false; acq: number; step2: string[] };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
  const body = buildStockTransferApiBody(f);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")), step2 };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, acq: calculateStockTransferTax(buildEngineInput(coerced)).acquisitionPrice, step2 };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.paths.join(", ")}`);
  return r;
}

describe("BL-1: 술어 — 날짜가 아니라 장부분실로 가른다", () => {
  const T = true, F = false;
  it.each([
    // [원인, 모드, 장부분실, 기대(차단)]
    ["inheritance", "estimated", F, T],
    ["inheritance", "estimated", T, F],
    ["gift", "estimated", T, F],
    ["carryover_gift", "estimated", T, F],
    ["inheritance", "sale_case", F, T],
    ["inheritance", "sale_case", T, T], // 매매사례는 장부분실이어도 막는다 (계획서 Q-3)
    ["gift", "actual", F, F],
    ["gift", "actual", T, F],
    ["purchase", "estimated", F, F],
    ["merger_split", "sale_case", F, F],
    [undefined, "estimated", F, F],
  ] as const)("%s · %s · 장부분실=%s → 차단=%s", (cause, mode, bookLost, expected) => {
    expect(isGiftLikeEstimationBlocked(cause, mode, bookLost)).toBe(expected);
  });
});

describe("BL-2: leaf — 엔진이 장부분실 분기를 타는 조건과 같다", () => {
  const base = { acqFaceValueOnly: true, acqFaceValuePerShare: 12_500, marketType: "unlisted" };
  it("비상장 · 토글 ON · 액면가>0 → 참", () => expect(isBookLostAtAcquisition(base)).toBe(true));
  it("양도일 거래정지(코스닥) → 참", () =>
    expect(isBookLostAtAcquisition({ ...base, marketType: "kosdaq", tradingHaltAtTransfer: true })).toBe(true));
  it("토글 OFF · 액면가 없음/0 → 거짓 (반쪽 입력은 예외 통로가 아니다)", () => {
    expect(isBookLostAtAcquisition({ ...base, acqFaceValueOnly: false })).toBe(false);
    expect(isBookLostAtAcquisition({ ...base, acqFaceValuePerShare: undefined })).toBe(false);
    expect(isBookLostAtAcquisition({ ...base, acqFaceValuePerShare: 0 })).toBe(false);
  });
  it("상장(거래정지 아님) → 거짓 — 토글 값이 남아 있어도", () => {
    expect(isBookLostAtAcquisition({ ...base, marketType: "kospi" })).toBe(false);
    expect(isBookLostAtAcquisition({ ...base, marketType: "kosdaq" })).toBe(false);
  });
  it("기타자산 → 참 — 영 §165⑧1호: 기타자산 주식등도 §99①4로 평가한다 (2026-10-04 재기준 — 종전 «기타자산 차단»은 S-1 결함이었다)", () => {
    expect(isBookLostAtAcquisition({ ...base, marketType: "other_asset" })).toBe(true);
    expect(isBookLostAtAcquisition({ ...base, marketType: "other_asset", acqFaceValueOnly: false })).toBe(false);
  });
  it("폼 leaf — 같은 판정 (문자열 입력 · 코스피 거래정지 stale은 성립하지 않는다)", () => {
    const f = (o: Partial<StockTransferFormData>) =>
      isBookLostAtAcquisitionForm({ ...form(), ...o } as StockTransferFormData);
    expect(f({})).toBe(true);
    expect(f({ acqFaceValuePerShare: "" })).toBe(false);
    expect(f({ marketType: "kosdaq", acquisitionStdMode: "halt_transfer" })).toBe(true);
    expect(f({ marketType: "kospi", acquisitionStdMode: "halt_transfer" })).toBe(false);
    expect(f({ marketType: "kosdaq", acquisitionStdMode: "monthly_avg" })).toBe(false);
  });
});

describe("BL-3: 풀스택 — 사례 49 수치", () => {
  it("P1 1985 상속 + 장부분실(사례 49) → 468,750,000 (불변)", () => {
    expect(ok(run(form())).acq).toBe(468_750_000);
  });
  it("P2 1990 상속 + 장부분실 → 통과 · 468,750,000 (D-1 해소 — 종전엔 날짜만 달라 차단)", () => {
    const r = run(form({ acquisitionDate: "1990-01-01", decedentAcquisitionDate: "1988-01-01" }));
    expect(ok(r).acq).toBe(468_750_000);
    expect(r.step2).not.toContain("acquisitionMode");
  });
  it("P4 1990 증여 + 장부분실 → 통과 · 468,750,000", () => {
    expect(ok(run(form({ acquisitionDate: "1990-01-01", acquisitionCause: "gift" }))).acq).toBe(468_750_000);
  });
  it("P5 1985 상속 + 장부 있음(환산) → ⑧·⑫ 차단 (D-2 해소 — 종전엔 날짜 때문에 600,000,000으로 통과)", () => {
    const r = run(form(BOOKS_KEPT));
    expect(r.step2).toContain("acquisitionMode");
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.paths).toContain("acquisitionMode");
  });
  it("P5b 긍정 짝 — 같은 입력을 실가(평가액)로 바꾸면 통과", () => {
    const r = run(form({ ...BOOKS_KEPT, acquisitionMode: "actual", acquisitionActualInputMode: "total", acquisitionTotalPrice: "500000000" }));
    expect(r.step2).not.toContain("acquisitionMode");
    expect(r.blocked).toBe(false);
  });
  it("P6 1985 증여 + 매매사례 → 차단 (장부분실 토글이 남아 있어도 — Q-3)", () => {
    const r = run(form({ acquisitionCause: "gift", acquisitionMode: "sale_case" }));
    expect(r.step2).toContain("acquisitionMode");
    expect(r.blocked).toBe(true);
  });
  it("P7 매수는 날짜·장부분실과 무관 — 통과 (대조군)", () => {
    expect(ok(run(form({ acquisitionCause: "purchase", acquisitionDate: "1990-01-01" }))).acq).toBe(468_750_000);
    expect(ok(run(form({ acquisitionCause: "purchase", acquisitionDate: "1985-09-13" }))).acq).toBe(468_750_000);
  });
  it("P8 반쪽 입력 — 토글만 켜고 액면가가 없으면 차단 (예외 통로가 아니다)", () => {
    const r = run(form({ acquisitionDate: "1990-01-01", decedentAcquisitionDate: "1988-01-01", acqFaceValuePerShare: "" }));
    expect(r.step2).toContain("acquisitionMode");
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.paths).toContain("acquisitionMode");
  });
  it("P9 상장 코스피 + 환산 + 토글 잔존값 → 차단 (토글은 비상장·기타자산·거래정지에서만 성립)", () => {
    const r = run(form({ marketType: "kospi", acquisitionDate: "1990-01-01", decedentAcquisitionDate: "1988-01-01" }));
    expect(r.blocked).toBe(true);
  });
});

describe("BL-4: ③ 복원 마이그레이션 — 같은 술어", () => {
  const restore = (o: Partial<StockTransferFormData>) =>
    normalizeStockFormData(form(o) as unknown as Record<string, unknown>).acquisitionMode;
  it("1990 상속 + 장부분실 → 환산 유지", () =>
    expect(restore({ acquisitionDate: "1990-01-01" })).toBe("estimated"));
  it("1985 상속 + 장부 있음 → 실가로 (종전엔 날짜 때문에 유지)", () =>
    expect(restore(BOOKS_KEPT)).toBe("actual"));
  it("매매사례 → 실가로", () =>
    expect(restore({ acquisitionMode: "sale_case" })).toBe("actual"));
  it("매수는 건드리지 않는다", () =>
    expect(restore({ acquisitionCause: "purchase", ...BOOKS_KEPT })).toBe("estimated"));
});

describe("BL-5: 엔진 B(이월과세 수증자 측) — 같은 술어", () => {
  const input = (o: Partial<StockTransferInput>) =>
    ({
      marketType: "unlisted",
      acquisitionCause: "carryover_gift",
      acquisitionDate: new Date("1990-01-01"),
      acquisitionMode: "estimated",
      expenseMode: "estimated",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 12_500,
      shareCount: 8000,
      ...o,
    }) as StockTransferInput;
  it("장부분실이면 환산을 유지한다", () => {
    expect(buildStockScenarioB(input({})).acquisitionMode).toBe("estimated");
  });
  it("장부분실이 아니면 실가로 되돌린다", () => {
    expect(buildStockScenarioB(input({ acqFaceValueOnly: false })).acquisitionMode).toBe("actual");
  });
});
