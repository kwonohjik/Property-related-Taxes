/**
 * 과세 무상주 규칙 — ⑧ ⇔ ⑫ 정합 (미결 3)
 *
 * ④가 취득원인을 「매매」로 매핑해 보내므로 종전 ⑫ Zod 는 과세 무상주를 알지 못했다 — ⑧을 건너뛴 body
 * (복원 이력·직접 호출)가 환산취득가로 계산됐다. 폼 원인을 `acquisitionCauseDetail`로 실어 ⑫가 ⑧과
 * 같은 술어(`isBonusTaxedEstimationBlocked` · `isBonusTaxedPreDeemedFaceValueMissing`)로 막는다.
 *
 *   ZP-1  ④ — 유상증자·과세 무상주만 detail 을 싣는다 · 엔진 원인은 여전히 purchase
 *   ZP-2  격자 — ⑧ 차단 ⇔ ⑫ 차단 (취득일 2010/1980 × 모드 × 액면가 유무)
 *   ZP-3  분할 모드는 detail 이 없다(단건 원인은 화면 밖)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import {
  BONUS_TAXED_ACTUAL_ONLY_MESSAGE,
  BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE,
} from "@/lib/calc/stock-acquisition-cause";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

/** 코스피 1,000주 · 2025-12-01 양도 2억 · 환산 입력 완비 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "10000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2010-06-01",
    transferDate: "2025-12-01",
    shareCount: "1000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "estimated",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "500",
    acquisitionStdMode: "monthly_avg",
    transferStdInputMode: "direct",
    acquisitionStdInputMode: "direct",
    transferDatePriceAvg1Month: "100000",
    acquisitionDatePriceAvg1Month: "20000",
    acquisitionCause: "bonus_taxed",
    filingType: "preliminary",
    filingDate: "2026-02-28",
    ...o,
  } as StockTransferFormData;
}

const BONUS_MESSAGES = [BONUS_TAXED_ACTUAL_ONLY_MESSAGE, BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE];

/** ⑧ — 과세 무상주 문구만 */
const step2 = (f: StockTransferFormData) =>
  validateStep2(f).filter((e) => e.severity === "error" && BONUS_MESSAGES.includes(e.message)).map((e) => e.message).sort();

/** ⑫ — ⑧을 건너뛴 body 가 서버에서 받는 과세 무상주 문구만 */
const zod = (f: StockTransferFormData) => {
  const r = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
  return r.success ? [] : r.error.issues.map((i) => i.message).filter((m) => BONUS_MESSAGES.includes(m)).sort();
};

describe("ZP-1 ④ body", () => {
  it.each(["rights_issue", "bonus_taxed"] as const)("%s → detail 실음 · 엔진 원인 purchase", (cause) => {
    const body = buildStockTransferApiBody(form({ acquisitionCause: cause }));
    expect(body.acquisitionCauseDetail).toBe(cause);
    expect(body.acquisitionCause).toBe("purchase");
  });
  it.each(["purchase", "inheritance", "gift"] as const)("%s → detail 없음", (cause) => {
    expect(buildStockTransferApiBody(form({ acquisitionCause: cause }))).not.toHaveProperty("acquisitionCauseDetail");
  });
});

describe("ZP-2 ⑧ 차단 ⇔ ⑫ 차단", () => {
  const grid: [string, Partial<StockTransferFormData>, string[]][] = [
    ["2010 과세 무상주 + 환산", {}, [BONUS_TAXED_ACTUAL_ONLY_MESSAGE]],
    ["2010 과세 무상주 + 실가", { acquisitionMode: "actual" }, []],
    ["2010 유상증자 + 환산", { acquisitionCause: "rights_issue" }, []],
    ["1980 과세 무상주 + 환산 + 액면가", { acquisitionDate: "1980-06-01", preDeemedActualPricePerShare: "500" }, []],
    [
      "1980 과세 무상주 + 환산 + 액면가 비움",
      { acquisitionDate: "1980-06-01", preDeemedActualPricePerShare: "" },
      [BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE],
    ],
    ["1980 매수 + 환산 + 실가 비움", { acquisitionDate: "1980-06-01", acquisitionCause: "purchase" }, []],
  ];
  it.each(grid)("%s", (_label, o, expected) => {
    const f = form(o);
    expect(step2(f)).toEqual([...expected].sort());
    expect(zod(f)).toEqual([...expected].sort());
  });
});

describe("ZP-3 분할 모드", () => {
  it("단건 원인이 과세 무상주로 남아 있어도 detail 을 싣지 않는다", () => {
    expect(buildStockTransferApiBody(reportedSplitForm({ acquisitionCause: "bonus_taxed" }))).not.toHaveProperty(
      "acquisitionCauseDetail",
    );
  });
});
