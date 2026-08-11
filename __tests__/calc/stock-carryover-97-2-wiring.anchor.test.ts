/**
 * anchor: 주식 이월과세 §97의2① — **폼 → API → zod → 엔진 배선** (14 동기화 지점 ④⑧⑫⑬⑭)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md Phase 5
 *
 * ⚠️ **⑫⑬⑭는 TypeScript가 잡지 못한다** — zod가 모르는 키를 조용히 버리고(strip),
 *    body spread에서 빠뜨려도 컴파일이 통과한다. 그래서 「값이 세액까지 도달했는가」를
 *    **세액으로** 단언한다(메모리 `feedback_api_zod_schema_sync` ★★★).
 *
 * 🔑 **API 트리거만 열면 no-op이다** — 입력 UI가 없으면 payload 테스트는 통과해도 세액이
 *    움직이지 않는다(`feedback_api_trigger_without_input_path_is_noop`). 그래서 이 파일은
 *    **폼 필드**에서 출발한다.
 */
import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockValidationError } from "@/lib/calc/stock-transfer-tax-validate";

/** route handler와 같은 Date 강제 목록 (`app/api/calc/stock-transfer/route.ts`) */
const DATE_FIELDS = [
  "acquisitionDate",
  "transferDate",
  "priorYearEndDate",
  "filingDate",
  "donorAcquisitionDate",
  "acquisitionLots[].acquisitionDate",
  "acquisitionLots[].donorAcquisitionDate",
  "transferLots[].transferDate",
];

/** 코스닥 대주주·비중소 · 10,000주 · 양도 10억 · 증여 2025-06-01 → 양도 2025-12-01 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트종목",
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: "10",
    selfMarketCap: "10000000000",
    totalIssuedShares: "100000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2025-06-01",
    transferDate: "2025-12-01",
    shareCount: "10000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "100000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "80000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2026-05-31",
    ...o,
  };
}

/** 폼 → body → zod → coerceDates → 엔진 (route handler와 같은 순서) */
function runPipeline(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = stockTransferInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`zod 실패: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS);
  return { body, result: calculateStockTransferTax(coerced as unknown as StockTransferInput) };
}

const CARRYOVER = {
  acquisitionCause: "carryover_gift" as const,
  donorAcquisitionDate: "2015-03-01",
  donorRelation: "spouse" as const,
};

describe("W. 단건 — §97의2① 필요경비 입력이 세액까지 도달한다", () => {
  it("W-1 ①1호 취득가액 승계 — body·zod를 지나 산출세액 129,375,000", () => {
    const { body, result } = runPipeline(
      form({
        ...CARRYOVER,
        donorAcquisitionPrice: "30000",
        giftTaxAmount: "120000000",
        transferredAssetValue: "1000000000",
        giftTaxableValue: "1000000000",
      }),
    );
    // ⑬ body spread
    expect(body.donorAcquisitionPrice).toBe(30_000);
    expect(body.giftTaxAmount).toBe(120_000_000);
    expect(body.donorRelation).toBe("spouse");
    // ⑫⑭ zod·coerce를 지나 엔진까지 — **세액으로** 도달을 증명한다
    expect(result.acquisitionPrice).toBe(300_000_000);
    expect(result.expenses).toBe(120_000_000);
    expect(result.calculatedTax).toBe(129_375_000);
  });

  it("W-2 ①2호 증여자 자본적지출이 필요경비에 더해진다", () => {
    const { body, result } = runPipeline(
      form({ ...CARRYOVER, donorAcquisitionPrice: "30000", donorCapitalExpenditure: "5000000" }),
    );
    expect(body.donorCapitalExpenditure).toBe(5_000_000);
    expect(result.expenses).toBe(5_000_000);
  });

  it("W-3 ①1호 나목 — 증여자 취득 당시 기준시가로 환산된다", () => {
    const { body, result } = runPipeline(
      form({
        ...CARRYOVER,
        acquisitionMode: "estimated",
        donorAcquisitionStdPrice: "20000",
        acquisitionDatePriceAvg1Month: "80000",
        transferDatePriceAvg1Month: "100000",
      }),
    );
    expect(body.donorAcquisitionStdPrice).toBe(20_000);
    expect(result.acquisitionPrice).toBe(200_000_000);
    expect(result.estimatedDeduction).toBe(2_000_000);
  });

  it("W-4 관계 요건 — 배우자 사별이면 ①이 배제되고 세율도 수증일 기산", () => {
    const { body, result } = runPipeline(
      form({ ...CARRYOVER, donorAcquisitionPrice: "30000", donorDeceased: true }),
    );
    expect(body.donorDeceased).toBe(true);
    expect(result.acquisitionPrice).toBe(800_000_000); // 승계 없음
    expect(result.appliedRate).toBe(0.3); // 단기 30%
  });

  it("W-5 결과에 채택 사유가 실린다 (⑦ 결과 계층 근거)", () => {
    const applied = runPipeline(
      form({ ...CARRYOVER, donorAcquisitionPrice: "30000" }),
    ).result;
    expect(applied.warnings.some((w) => w.includes("§97의2① 이월과세 적용"))).toBe(true);

    const excluded = runPipeline(
      form({ ...CARRYOVER, donorAcquisitionPrice: "150000" }),
    ).result;
    expect(excluded.warnings.some((w) => w.includes("이월과세를 적용하지 않습니다"))).toBe(true);
  });
});

describe("W. split lot — 종전에 **body에서 통째로 누락**되던 경로 (P-7)", () => {
  const splitForm = () =>
    form({
      lotsMode: "split",
      costAllocationMethod: "fifo",
      acquisitionLots: [
        {
          id: "l1",
          acquisitionDate: "2025-06-01",
          shareCount: "10000",
          perShareAcquisitionPrice: "80000",
          acquisitionCause: "carryover_gift",
          donorAcquisitionDate: "2015-03-01",
          donorAcquisitionPrice: "30000",
          donorRelation: "spouse",
        },
      ],
      transferLots: [
        { id: "t1", transferDate: "2025-12-01", shareCount: "10000", perShareTransferPrice: "100000" },
      ],
    });

  it("W-6 lot의 승계 입력이 body에 실리고 sub-lot 단가로 도달한다", () => {
    const { body, result } = runPipeline(splitForm());
    const lot = (body.acquisitionLots as Record<string, unknown>[])[0];
    // ⑬ — 종전에는 split 분기에 `donorAcquisitionDate` 매핑조차 없었다
    expect(lot.donorAcquisitionDate).toBe("2015-03-01");
    expect(lot.donorAcquisitionPrice).toBe(30_000);
    expect(lot.donorRelation).toBe("spouse");
    // 엔진까지 — 승계된 단가로 매칭됐는가
    expect(result.lotMatchingDetail!.matched[0].perShareBuyPrice).toBe(30_000);
  });
});

describe("W. ⑧⑩ 정합 — UI validate 통과 ↔ API zod 통과가 어긋나지 않는다", () => {
  /**
   * 한쪽만 조이면 「입력 없이 다음 단계로 진행 → 계산 요청 400」이 된다.
   * 선행 PR #1207 Phase 4에서 실제로 발생했던 실패 모드다.
   */
  const cases: Array<[string, Partial<StockTransferFormData>]> = [
    ["증여자 취득가액만", { ...CARRYOVER, donorAcquisitionPrice: "30000" }],
    ["기준시가만(환산)", { ...CARRYOVER, donorAcquisitionStdPrice: "20000" }],
    ["증여세 3종 완비", {
      ...CARRYOVER,
      donorAcquisitionPrice: "30000",
      giftTaxAmount: "100000000",
      transferredAssetValue: "1000000000",
      giftTaxableValue: "1000000000",
    }],
    ["자본적지출만 추가", {
      ...CARRYOVER, donorAcquisitionPrice: "30000", donorCapitalExpenditure: "3000000",
    }],
  ];

  for (const [label, patch] of cases) {
    it(`W-7 ${label} — UI 통과면 zod도 통과한다`, () => {
      const f = form(patch);
      const uiErrors = validateAllSteps(f).filter((e: StockValidationError) => e.severity === "error");
      expect(uiErrors).toEqual([]);
      const parsed = stockTransferInputSchema.safeParse(buildStockTransferApiBody(f));
      expect(parsed.success).toBe(true);
    });
  }

  it("W-8 관계 미선택은 **UI가 먼저** 막는다 (§97의2① 본문 요건)", () => {
    const f = form({ acquisitionCause: "carryover_gift", donorAcquisitionDate: "2015-03-01" });
    const uiErrors = validateAllSteps(f).filter((e: StockValidationError) => e.severity === "error");
    expect(uiErrors.some((e: StockValidationError) => e.field === "donorRelation")).toBe(true);
  });

  it("W-9 증여세만 넣고 안분 분모가 없으면 UI가 막는다 (영 §163의2②)", () => {
    const f = form({ ...CARRYOVER, donorAcquisitionPrice: "30000", giftTaxAmount: "100000000" });
    const uiErrors = validateAllSteps(f).filter((e: StockValidationError) => e.severity === "error");
    expect(uiErrors.some((e: StockValidationError) => e.field === "giftTaxableValue")).toBe(true);
  });
});
