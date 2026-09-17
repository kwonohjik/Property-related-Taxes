/**
 * anchor — 취득가액 **합계 직접 입력**의 배선 (④⑬ · ⑫ · ⑭ · ⑧)
 *
 * ## 왜 leaf anchor로는 부족한가
 *
 * 엔진 anchor(`__tests__/tax-engine/stock-transfer/acquisition-total-input-mode.predo.anchor.test.ts`)는
 * 엔진 input을 **직접 만들어** 넣는다 — 「폼이 그 필드를 보내는가」·「Zod가 통과시키는가」·
 * 「route가 엔진에 싣는가」를 하나도 보지 못한다. ④⑬⑫⑭는 **TypeScript가 못 잡는 구간**이라
 * 한 곳만 빠져도 total 모드가 **조용히 1주당 단가로 되돌아간다**
 * ([[feedback_leaf_anchor_skips_zod_layer]] · [[feedback_api_zod_schema_sync]]).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { callStockTransferTaxAPI } from "@/lib/calc/stock-transfer-tax-api";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

function form(over: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "5",
    acquisitionDate: "2021-01-02",
    transferDate: "2024-06-01",
    priorYearEndDate: "2023-12-31",
    shareCount: "4000",
    totalIssuedShares: "1000000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "39,000,000",
    acquisitionMode: "actual",
    expenseMode: "actual",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    ...over,
  } as StockTransferFormData;
}

async function captureBody(f: StockTransferFormData): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: {} }) } as unknown as Response;
    }),
  );
  await callStockTransferTaxAPI(f);
  return captured.body ?? {};
}

afterEach(() => vi.unstubAllGlobals());

describe("AT-W: 취득가액 합계 배선", () => {
  it("AT-W1 🔴 ④⑬ — body에 모드와 합계가 실린다", async () => {
    const body = await captureBody(
      form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "21,000,000" }),
    );
    expect(body.acquisitionActualInputMode).toBe("total");
    expect(body.acquisitionTotalPrice).toBe(21_000_000);
  });

  it("AT-W1b 🟢 per_share 모드면 합계 키가 아예 없다 (오염 0)", async () => {
    const body = await captureBody(
      form({ acquisitionActualInputMode: "per_share", perShareAcquisitionPrice: "5,000" }),
    );
    expect("acquisitionTotalPrice" in body).toBe(false);
    expect(body.perShareAcquisitionPrice).toBe(5_000);
  });

  it("AT-W2 🔴 ⑫ — Zod가 두 필드를 안다 (strip 되지 않는다)", async () => {
    const body = await captureBody(
      form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "21,000,000" }),
    );
    const parsed = stockTransferInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const d = parsed.data as Record<string, unknown>;
    expect(d.acquisitionActualInputMode).toBe("total");
    expect(d.acquisitionTotalPrice).toBe(21_000_000);
  });

  it("AT-W3 🔴 ⑭ — route 매핑이 두 필드를 엔진 input에 싣는다", () => {
    const built = buildEngineInput({
      acquisitionActualInputMode: "total",
      acquisitionTotalPrice: 21_000_000,
    } as Record<string, unknown>);
    expect(built.acquisitionActualInputMode).toBe("total");
    expect(built.acquisitionTotalPrice).toBe(21_000_000);
  });

  it("AT-W4 🔴 ⑧ — 합계 미입력이면 차단한다", () => {
    const blocked = validateStep2Domestic(
      form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "" }),
    );
    expect(blocked.some((e) => e.field === "acquisitionTotalPrice")).toBe(true);

    const ok = validateStep2Domestic(
      form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "21,000,000" }),
    );
    expect(ok.some((e) => e.field === "acquisitionTotalPrice")).toBe(false);
  });

  it("AT-W5 🟢 ⑧ — per_share는 종전대로 1주당 단가를 요구한다 (구별력 짝)", () => {
    const blocked = validateStep2Domestic(
      form({ acquisitionActualInputMode: "per_share", perShareAcquisitionPrice: "" }),
    );
    expect(blocked.some((e) => e.field === "perShareAcquisitionPrice")).toBe(true);
  });
});
