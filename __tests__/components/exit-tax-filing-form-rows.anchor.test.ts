/**
 * anchor: 국외전출세 → 별지 제84호서식 편입 (`exit-tax-filing-adapter` + `buildRows`)
 *
 * 제보 —「일반 주식양도신고서와 동일해 주식 신고서 양식으로 만들면 돼」
 *
 * ## 무엇을 고정하는가
 *
 * E2E(`exit-tax-filing-form-first.spec.ts`)는 **기본 케이스**만 지난다 — 조정공제·외국납부세액공제·
 * 비거주자 공제·보유현황 미신고 가산세가 **모두 0**이라 조건부 행(25-E1~E4)이 하나도 만들어지지
 * 않는다. 그 행들이 없으면 25행 산출세액과 29행 결정세액이 어긋나 **서식이 자기모순**이 되므로,
 * 값이 있는 케이스를 여기서 고정한다.
 *
 * 🔑 자기일관성은 **행 값끼리** 검증한다 — 엔진 필드를 그대로 다시 읽으면 서식이 무엇을
 *   보여주는지가 증명되지 않는다.
 */

import { describe, it, expect } from "vitest";
import { toStockTransferResultFromExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax-filing-adapter";
import {
  buildRows,
  deriveColumns,
} from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

/** 최소 ExitTaxResult — 공제·가산세 축만 케이스별로 바꾼다. */
function makeExitResult(over: Partial<ExitTaxResult> = {}): ExitTaxResult {
  return {
    taxCategory: "exit_tax",
    isLiable: true,
    residencyEligible: true,
    majorShareholderEligible: true,
    holdingDetails: [
      {
        id: "h1",
        stockName: "삼성전자",
        departureDayValue: 80_000_000,
        departureDayValuePerShare: 80_000,
        acquisitionCost: 50_000_000,
        transferGain: 30_000_000,
        valuationMode: "market_price",
      },
    ],
    totalTransferGain: 30_000_000,
    basicDeduction: 2_500_000,
    taxBase: 27_500_000,
    incomeTax: 5_500_000,
    appliedRate: 0.2,
    progressiveDeduction: 0,
    localIncomeTax: 550_000,
    deferralYears: 0,
    deferredTaxAmount: 0,
    deferralInterestNote: "",
    finalTax: 5_500_000,
    totalTax: 6_050_000,
    warnings: [],
    appliedRules: [],
    ...over,
  };
}

function rowsOf(r: ExitTaxResult) {
  const adapted = toStockTransferResultFromExitTax(r, {
    departureDate: new Date("2025-06-01"),
    totalShareCount: 1000,
  });
  const { columns } = deriveColumns(adapted, undefined);
  return buildRows(adapted, columns, undefined);
}

const cell = (rows: ReturnType<typeof rowsOf>, prefix: string) => {
  const row = rows.find((x) => x.label.startsWith(prefix));
  expect(row, `행 없음: ${prefix}`).toBeDefined();
  return row!.values["total"];
};

describe("국외전출세 별지 제84호서식 편입", () => {
  it("ETA-1: 공제·가산세가 없으면 25-E 행을 **만들지 않는다** (0 ≠ 부재)", () => {
    const rows = rowsOf(makeExitResult());
    expect(rows.filter((r) => r.label.startsWith("25-E"))).toHaveLength(0);
    // 25행 = 29행 (차감·가산이 없으므로)
    expect(cell(rows, "25.")).toBe(5_500_000);
    expect(cell(rows, "29.")).toBe(5_500_000);
  });

  it("ETA-2: 조정공제·외국납부·비거주자·보유현황가산세가 각각 자기 행으로 나온다", () => {
    const rows = rowsOf(
      makeExitResult({
        adjustmentDeduction: 1_000_000,
        foreignTaxCreditApplied: 500_000,
        domesticTaxCreditApplied: 300_000,
        holdingsReportPenalty: 200_000,
        // 엔진 규약: finalTax = (산출 − 조정 − 외국 − 비거주자) + 보유현황가산세
        finalTax: 5_500_000 - 1_000_000 - 500_000 - 300_000 + 200_000,
      }),
    );

    expect(cell(rows, "25-E1")).toBe(1_000_000);
    expect(cell(rows, "25-E2")).toBe(500_000);
    expect(cell(rows, "25-E3")).toBe(300_000);
    expect(cell(rows, "25-E4")).toBe(200_000);

    // 자기일관성 — 25행에서 E1~E3을 빼고 E4를 더하면 29행이 된다.
    //   §118의15④가 「… 산출세액에 **더한다**」이므로 E4만 부호가 반대다.
    const calc =
      (cell(rows, "25.") as number) -
      (cell(rows, "25-E1") as number) -
      (cell(rows, "25-E2") as number) -
      (cell(rows, "25-E3") as number) +
      (cell(rows, "25-E4") as number);
    expect(calc).toBe(cell(rows, "29."));
  });

  it("ETA-3: 국내 양도 전용 근거가 인쇄되지 않는다 (§103①2호·§105①2호·§104①11 직접인용)", () => {
    const labels = rowsOf(makeExitResult()).map((r) => r.label).join("\n");

    expect(labels).toContain("§118의10④");   // 03·20 기본공제
    expect(labels).toContain("§118의15②");   // 32 신고기한
    expect(labels).not.toContain("§103①2호");
    expect(labels).not.toContain("§105①2호");
    // 24행 세율 근거는 **준용** 표기여야 한다 — §104①11 을 직접 인용하면 틀리다.
    expect(labels).not.toContain("(§55 / §104①11 가목2)");
  });

  it("ETA-4: 보유기간·단기보유는 비운다 (간주양도 — 0개월로 찍으면 틀린 사실)", () => {
    const rows = rowsOf(makeExitResult());
    expect(cell(rows, "05.")).toBe("-");
    expect(cell(rows, "06.")).toBe("-");
  });
});
