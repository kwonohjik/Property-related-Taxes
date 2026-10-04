/**
 * 의제취득일(영 §162⑦) × §163⑨ 차단 · 4호 판정 parity · 종가 잔재 리셋 · Y-2 인용
 *
 * 계획서 `docs/00-pm/stock-deemed-date-other-asset-and-conversion-citation.plan.md` §6
 *
 *   Y1-2   증여 · 기타자산 1985-06-01 · 환산 → ⑧·⑫ 차단 + 복원 마이그레이션이 실가로 (4호 의제일 1985.1.1. 이후)
 *   Y1-2b  같은 날짜의 주식(3호) → 차단 안 함 (영 §176의2④ — 3호 의제일 1986.1.1. 전)   ← Y1-2의 긍정 짝
 *   Y1-2c  기타자산 1984-06-01 → 차단 안 함 · 의제일 당일 1985-01-01 → 차단
 *   Y1-3   parity — 폼 판정(`isSection94_4Form`) · 입력 판정(`isSection94_4Asset`) == 엔진 분류 전 칸
 *   Y1-6   R-1 — 4호 판정이 바뀌어 기준일이 움직이면 취득측 종가 잔재를 비운다
 *   Y2-1   환산 분자·분모 메시지 4건 — 영 §176의2②1호 (§163⑨ 아님)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { classifyStockTransfer, isSection94_4Category } from "@/lib/tax-engine/stock-transfer/stock-classification";
import { isSection94_4Asset } from "@/lib/tax-engine/stock-transfer/stock-deemed-acquisition-date";
import { isGiftLikeEstimationBlocked } from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import { isSection94_4Form, withDeemedBaseReset } from "@/lib/calc/stock-transfer-section94-4-form";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 비상장 100주 · 양도 2억 · 양도 2025-12-01 · 평가액 1,500,000/주 */
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
const OTHER_ASSET: Partial<StockTransferFormData> = { marketType: "other_asset", isHeavyRealEstateForRate: true };
const GIFT_ESTIMATED: Partial<StockTransferFormData> = {
  acquisitionCause: "gift",
  acquisitionMode: "estimated",
  acquisitionYearNetIncomePerShare: "300000",
  acquisitionYearNetAssetPerShare: "300000",
};

const errFields = (errs: { field: string; severity: string }[]) =>
  errs.filter((e) => e.severity === "error").map((e) => e.field);
/** ⑫ Zod(refines 포함) issue 경로 — 통과면 빈 배열 */
function zodPaths(f: StockTransferFormData): string[] {
  const r = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
}

describe("Y1-2: 기타자산 의제취득일은 1985.1.1. — 1985년 증여는 §163⑨ 차단 대상", () => {
  const f = form({ ...OTHER_ASSET, ...GIFT_ESTIMATED, acquisitionDate: "1985-06-01" });
  it("⑧ validate 오류", () => {
    expect(errFields(validateStep2Domestic(f))).toContain("acquisitionMode");
  });
  it("⑫ Zod 차단", () => {
    expect(zodPaths(f)).toContain("acquisitionMode");
  });
  it("③ 복원 마이그레이션 → 실가", () => {
    expect(normalizeStockFormData(f).acquisitionMode).toBe("actual");
  });
  it("§94②(비상장 + 라목)도 같다 — 4호는 분류 결과로 판정", () => {
    const g = form({ isHeavyRealEstateForRate: true, ...GIFT_ESTIMATED, acquisitionDate: "1985-06-01" });
    expect(errFields(validateStep2Domestic(g))).toContain("acquisitionMode");
    expect(zodPaths(g)).toContain("acquisitionMode");
  });
});

describe("Y1-2b·2c: 긍정 짝 — 의제취득일 «전» 증여는 차단하지 않는다 (영 §176의2④)", () => {
  it("Y1-2b: 주식(3호) 1985-06-01 → 통과 (3호 의제일 1986.1.1. 전)", () => {
    const f = form({ ...GIFT_ESTIMATED, acquisitionDate: "1985-06-01" });
    expect(errFields(validateStep2Domestic(f))).not.toContain("acquisitionMode");
    expect(zodPaths(f)).not.toContain("acquisitionMode");
    expect(normalizeStockFormData(f).acquisitionMode).toBe("estimated");
  });
  it("Y1-2c: 기타자산 1984-06-01 → 통과", () => {
    const f = form({ ...OTHER_ASSET, ...GIFT_ESTIMATED, acquisitionDate: "1984-06-01" });
    expect(errFields(validateStep2Domestic(f))).not.toContain("acquisitionMode");
    expect(zodPaths(f)).not.toContain("acquisitionMode");
  });
  it("Y1-2c: 술어 경계 — 의제일 당일은 «전»이 아니다", () => {
    expect(isGiftLikeEstimationBlocked("gift", "1984-12-31", "estimated", true)).toBe(false);
    expect(isGiftLikeEstimationBlocked("gift", "1985-01-01", "estimated", true)).toBe(true);
    expect(isGiftLikeEstimationBlocked("gift", "1985-12-31", "estimated", false)).toBe(false);
    expect(isGiftLikeEstimationBlocked("gift", "1986-01-01", "estimated", false)).toBe(true);
  });
});

describe("Y1-3: parity — 4호 판정 세 갈래가 엔진 분류와 같다", () => {
  const markets = ["kospi", "kosdaq", "konex", "unlisted", "other_asset"] as const;
  const blockCases: Array<[string, Partial<StockTransferFormData>]> = [
    ["다목 미선택", { isQualifyingBlockShareholder: false }],
    [
      "다목 게이트 통과",
      {
        isQualifyingBlockShareholder: true,
        blockShareholderRealEstateRatio: "60",
        blockShareholderOwnershipRatio: "60",
        cumulativeTransferRatio: "60",
        aggregationFirstTransferDate: "2025-06-01",
      },
    ],
    [
      "다목 게이트 불통(누적 30%)",
      {
        isQualifyingBlockShareholder: true,
        blockShareholderRealEstateRatio: "60",
        blockShareholderOwnershipRatio: "60",
        cumulativeTransferRatio: "30",
        aggregationFirstTransferDate: "2025-06-01",
      },
    ],
  ];
  for (const m of markets) {
    for (const heavy of [false, true]) {
      for (const [label, block] of blockCases) {
        it(`${m} · 라목 ${heavy ? "ON" : "OFF"} · ${label}`, () => {
          const f = form({ marketType: m, isHeavyRealEstateForRate: heavy, ...block });
          // refines 없이 스키마만 — other_asset 무조항 같은 «차단될 입력»도 분류 비교에 넣는다
          const parsed = stockTransferInputSchema.parse(buildStockTransferApiBody(f));
          const input = buildEngineInput(coerceDates(parsed as Record<string, unknown>, [...STOCK_DATE_FIELDS]));
          const engine = isSection94_4Category(classifyStockTransfer(input).taxCategory);
          expect(isSection94_4Form(f)).toBe(engine);
          expect(isSection94_4Asset(input)).toBe(engine);
        });
      }
    }
  }
});

describe("Y1-6: R-1 — 기준일이 움직이면 취득측 1개월 종가 잔재를 비운다", () => {
  const STALE: Partial<StockTransferFormData> = {
    acquisitionDatePriceAvg1Month: "10000",
    acquisitionPriceClosing: ["10000"],
    acquisitionPriceDates: ["1985-12-31"],
  };
  it("비상장 1984-06-01: 라목 ON → 기준일 1986.1.1. → 1985.1.1. → 비운다", () => {
    const patch = withDeemedBaseReset(form({ ...STALE, acquisitionDate: "1984-06-01" }), { isHeavyRealEstateForRate: true });
    expect(patch).toMatchObject({ acquisitionDatePriceAvg1Month: "", acquisitionPriceClosing: [], acquisitionPriceDates: [] });
  });
  it("비상장 1985-06-01: 라목 ON → 기준일 1986.1.1. → 실제 취득일 → 비운다", () => {
    const patch = withDeemedBaseReset(form({ ...STALE, acquisitionDate: "1985-06-01" }), { isHeavyRealEstateForRate: true });
    expect(patch.acquisitionDatePriceAvg1Month).toBe("");
  });
  it("의제 대상이 아니면(2010 취득) 그대로", () => {
    const patch = withDeemedBaseReset(form({ ...STALE, acquisitionDate: "2010-01-01" }), { isHeavyRealEstateForRate: true });
    expect(patch).toEqual({ isHeavyRealEstateForRate: true });
  });
  it("판정이 안 바뀌는 patch는 그대로", () => {
    const patch = withDeemedBaseReset(form({ ...STALE, acquisitionDate: "1984-06-01" }), { securityName: "x" });
    expect(patch).toEqual({ securityName: "x" });
  });
});

describe("Y2-1: 환산 분자·분모 메시지는 영 §176의2②1호를 인용한다 (§163⑨는 상속·증여 평가액 조항)", () => {
  const listedEstimated: Partial<StockTransferFormData> = {
    marketType: "kospi",
    acquisitionMode: "estimated",
    acquisitionStdMode: "monthly_avg",
    transferDatePriceAvg1Month: "",
    acquisitionDatePriceAvg1Month: "",
  };
  const msgs = (f: StockTransferFormData, fields: string[]) =>
    validateStep2Domestic(f)
      .filter((e) => e.severity === "error" && fields.includes(e.field))
      .map((e) => e.message);

  it("직접 입력 — 분모·분자 2건", () => {
    const m = msgs(
      form({ ...listedEstimated, transferStdInputMode: "direct", acquisitionStdInputMode: "direct" }),
      ["transferDatePriceAvg1Month", "acquisitionDatePriceAvg1Month"],
    );
    expect(m).toHaveLength(2);
    for (const s of m) {
      expect(s).toContain("소득세법 시행령 §176의2②1호");
      expect(s).not.toContain("163⑨");
    }
  });
  it("일자별 입력 — 분모·분자 2건", () => {
    const m = msgs(
      form({
        ...listedEstimated,
        transferStdInputMode: "daily",
        acquisitionStdInputMode: "daily",
        transferPriceClosing: [],
        acquisitionPriceClosing: [],
      }),
      ["transferPriceClosing", "acquisitionPriceClosing"],
    );
    expect(m).toHaveLength(2);
    for (const s of m) {
      expect(s).toContain("소득세법 시행령 §176의2②1호");
      expect(s).not.toContain("163⑨");
    }
  });
});
