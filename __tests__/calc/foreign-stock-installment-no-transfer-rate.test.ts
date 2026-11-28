/**
 * 국외주식 장기할부 분할 수령 — 양도일 기준환율 없이 (계획서 F-1 · 브라우저 재현 V-2: POST 400 `transferExchangeRate`)
 *
 * 분할 수령 모드는 화면이 양도일 기준환율 칸을 숨기고 ⑧도 검증하지 않는다. ⑫가 그 칸을 필수로 받아 「화면 통과 ↔ API 400」이었다.
 * 고친 뒤 고정하는 것:
 *   I-1 ⑫ 분할 수령 + 양도일 환율 없음 + 필요경비 없음 → 통과 · route 200 · 양도가액 = 수령일별 환산 합
 *   I-2 ⑫ 단일 수령은 여전히 양도일 환율 필수 (⑧과 같은 칸)
 *   I-3 형제 모순: 필요경비 금액 > 0 · 지출일 환율 없음 · 양도일 환율 없음 → 엔진이 «환율 미입력 불가»로 던진다.
 *       ⑫·⑧이 **같은 칸·같은 메시지**로 막고 route는 400 (엔진 도달 전)
 *   I-4 지출일 환율을 넣으면 통과 · 그 환율로 환산
 *   I-5 양도일 환율이 남아 있으면(단일 모드에서 넣고 전환) 대체가 살아 있으므로 막지 않는다 — 대체 폐지는 Q-2 PR
 *
 * ⚠️ 기존 패리티 격자(`foreign-stock-fx-limits.parity.test.ts`)의 분할 수령 픽스처는 기본 폼의 양도일 환율 1500을 그대로 들고 있어
 *    이 결함을 가렸다 — 여기서는 `transferExchangeRate: ""`로 **비운다**.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/stock-transfer/route";
import { foreignStockInputSchema } from "@/lib/api/stock-transfer-foreign-schema";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/stock-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

/** 분할 수령 · 양도일 환율 **빈 칸** (화면 신규 입력 그대로) */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "Example Corp",
    marketType: "foreign_stock",
    yearsResidentInKorea: "7",
    isListedForeignCorp: true,
    fgCountryCode: "US",
    acquisitionDate: "2021-01-05",
    transferDate: "2025-09-30",
    shareCount: "1000",
    transferCurrencyCode: "USD",
    transferExchangeRate: "",
    fsTransferReceiptMode: "installments",
    fsTransferInstallmentReceipts: [
      { receiptDate: "2025-09-30", amountForeign: "100000", exchangeRate: "1300" },
      { receiptDate: "2026-10-30", amountForeign: "100000", exchangeRate: "1350" },
    ],
    perShareAcquisitionPriceForeign: "100",
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: "1000",
    ...o,
  };
}

const uiErrors = (f: StockTransferFormData) => validateAllSteps(f).filter((e) => e.severity === "error");

describe("F-1 분할 수령 — 양도일 기준환율 없이", () => {
  it("I-1 필요경비 없음: ⑫ 통과 · ⑧ 통과 · route 200 · 양도가액 = 130,000,000 + 135,000,000", async () => {
    const f = form();
    const body = buildStockTransferApiBody(f) as Record<string, unknown>;
    expect(body.transferExchangeRate).toBeUndefined();
    const parsed = foreignStockInputSchema.safeParse(body);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
    expect(uiErrors(f)).toEqual([]);

    const res = await post(body);
    expect(res.status, JSON.stringify(res.json).slice(0, 300)).toBe(200);
    expect(res.json.result.transferPriceKrw).toBe(265_000_000);
    expect(res.json.result.transferExchangeRate).toBeUndefined();
  });

  it("I-2 단일 수령은 양도일 환율 필수 — ⑫·⑧ 같은 칸", async () => {
    const f = form({ fsTransferReceiptMode: "single", perShareTransferPriceForeign: "200" });
    const parsed = foreignStockInputSchema.safeParse(buildStockTransferApiBody(f));
    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("transferExchangeRate");
    expect(uiErrors(f).map((e) => e.field)).toContain("transferExchangeRate");
    expect((await post(buildStockTransferApiBody(f))).status).toBe(400);
  });

  for (const c of [
    { name: "자본적지출", amount: "capitalExpenditureForeign", rate: "capitalExpenditureExchangeRate" },
    { name: "양도비", amount: "transferCostForeign", rate: "transferCostExchangeRate" },
  ] as const) {
    it(`I-3 ${c.name} 금액만 · 지출일 환율 없음 → ⑫·⑧ 같은 칸·같은 메시지 · route 400`, async () => {
      const f = form({ [c.amount]: "1000" });
      const body = buildStockTransferApiBody(f);
      const parsed = foreignStockInputSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      const zod = parsed.success ? undefined : parsed.error.issues.find((i) => i.path.join(".") === c.rate)?.message;
      expect(zod, `⑫ ${c.rate}`).toBeDefined();
      const ui = uiErrors(f).find((e) => e.field === c.rate)?.message;
      expect(ui, `⑧이 통과시키면 UI 통과 ↔ API 400`).toBe(zod);
      expect(zod).toContain("§178의5①");

      const res = await post(body);
      expect(res.status).toBe(400);
    });

    it(`I-4 ${c.name} 지출일 환율 입력 → 통과 · 그 환율로 환산`, async () => {
      const f = form({ [c.amount]: "1000", [c.rate]: "1320" });
      expect(uiErrors(f)).toEqual([]);
      const res = await post(buildStockTransferApiBody(f));
      expect(res.status, JSON.stringify(res.json).slice(0, 300)).toBe(200);
      expect(res.json.result.necessaryExpensesKrw).toBe(1_320_000);
    });
  }

  it("I-5 양도일 환율이 남아 있으면 대체가 살아 있다 — 막지 않는다(대체 폐지는 Q-2 PR)", async () => {
    const f = form({ transferExchangeRate: "1500", transferCostForeign: "1000" });
    expect(uiErrors(f)).toEqual([]);
    const res = await post(buildStockTransferApiBody(f));
    expect(res.status).toBe(200);
    expect(res.json.result.necessaryExpensesKrw).toBe(1_500_000);
  });

  it("I-6 다종목 items[] 국외 갈래도 같은 규칙 — 양도일 환율 없이 200", async () => {
    const body = buildStockTransferApiBody(form());
    const res = await post({ items: [body, { ...body, stockName: "Second Corp" }] });
    expect(res.status, JSON.stringify(res.json).slice(0, 300)).toBe(200);
  });
});
