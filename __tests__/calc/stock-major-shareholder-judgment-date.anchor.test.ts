/**
 * 대주주 판정 기준일(priorYearEndDate) — 차단 검증 + 오늘-fallback 제거 anchor.
 *
 * Plan: docs/00-pm/stock-major-shareholder-toggle-removal.plan.md §7 (T-3·T-4·T-5)
 *
 * 배경(실측):
 *   - 종전 `stock-transfer-tax-api.ts:372`가 미입력 시 **오늘 날짜**로 조용히 채웠다.
 *     대주주 임계는 시기별로 다르므로(코스피 시총 2020-04~ 10억 / 2024-01~ 50억)
 *     2021년 양도 건의 분류가 listed_major ↔ listed_non_major_in_market 로 뒤집혔다.
 *   - `validate`에는 이 필드 검증이 없었다(FieldCard는 이미 `required` 표시 — 표시/검증 드리프트).
 */

import { describe, it, expect } from "vitest";
import { validateStep1 } from "@/lib/calc/stock-transfer-tax-validate";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 계산까지 통과하는 최소 폼 — 판정 기준일만 비워 둔다 */
function form(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트종목",
    marketType: "kospi",
    acquisitionDate: "2018-01-01",
    transferDate: "2021-06-01",
    shareCount: "10000",
    totalIssuedShares: "1000000",
    perShareTransferPrice: "50000",
    perShareAcquisitionPrice: "20000",
    priorYearEndDate: "",
    ...patch,
  };
}

const hasJudgmentDateError = (f: StockTransferFormData) =>
  validateStep1(f).some((e) => e.field === "priorYearEndDate");

describe("T-3 — 판정 기준일 미입력은 차단된다", () => {
  it.each(["kospi", "kosdaq", "konex", "unlisted"] as const)(
    "%s · 기준일 미입력 → error",
    (marketType) => {
      expect(hasJudgmentDateError(form({ marketType }))).toBe(true);
    },
  );

  it("기준일이 채워지면 통과한다", () => {
    expect(hasJudgmentDateError(form({ priorYearEndDate: "2020-12-31" }))).toBe(false);
  });

  it("대주주 판정 비대상 시장은 요구하지 않는다 (other_asset — 섹션 자체가 없다)", () => {
    expect(
      hasJudgmentDateError(
        form({ marketType: "other_asset", isQualifyingBlockShareholder: true }),
      ),
    ).toBe(false);
  });
});

describe("T-4 — API 변환이 오늘 날짜를 채우지 않는다", () => {
  it("기준일 미입력 → body에 오늘 날짜가 실리지 않는다", () => {
    const body = buildStockTransferApiBody(form());
    const today = new Date().toISOString().split("T")[0];
    expect(body.priorYearEndDate).not.toBe(today);
  });

  it("입력된 기준일은 그대로 전달된다", () => {
    const body = buildStockTransferApiBody(form({ priorYearEndDate: "2020-12-31" }));
    expect(body.priorYearEndDate).toBe("2020-12-31");
  });
});

describe("T-5 — 과잉 차단 방지 (F-24 본인 미보유 강제 합산)", () => {
  /**
   * 기획재정부 금융세제-327(2020.12.10.) — 직전 사업연도 종료일에 본인이 보유하지 않으면
   * 특수관계 기타주주를 합산해 §157 판정한다. 본인 지분·시총이 0인 것이 **정상**이므로
   * 지분·시총 요구가 이 경로를 막아서는 안 된다.
   */
  it("본인 0 + 합산 지분 >0 → 대주주 관련 error 없음", () => {
    const errs = validateStep1(
      form({
        priorYearEndDate: "2020-12-31",
        isMajorShareholder: true,
        selfShareRatio: "",
        selfMarketCap: "",
        isLargestShareholderGroup: true,
        combinedShareRatio: "5",
      }),
    );
    expect(errs.some((e) => e.field === "majorShareholder")).toBe(false);
  });
});
