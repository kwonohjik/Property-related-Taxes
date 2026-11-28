/**
 * ⑧↔⑫ 패리티 격자 (국외주식 환산 입력 한도, 계획서 엔진 A-1-4 · Q-5)
 *
 * 엔진 환산 leaf(`fx-krw.ts`)는 외화액·환율 소수 4자리 초과 · 외화액 > 1e11 · 환율 > 1e7 · 환산 원화 안전 정수 초과를 던진다.
 * 그래서 서버 ⑫ Zod가 **엔진 전에** 같은 판정으로 막아야 하고(500 방지), ⑧ validate가 같은 판정으로 «다음»을 막아야 한다
 * (UI 통과 ↔ API 400 모순 금지). 두 층은 단일 소스 `foreignStockFxIssues`를 부르며, 이 격자는
 *   (1) **route의 실제 스키마**(`foreignStockInputSchema` — 인라인 superRefine 포함)가 막고
 *   (2) ⑧(`validateAllSteps`)이 **같은 칸·같은 메시지**로 막고
 *   (3) POST route가 500이 아니라 400이며
 *   (4) 모든 칸(`FOREIGN_STOCK_FX_FIELDS`)이 격자에 있음을
 * 고정한다. ⑫의 한도 refine을 지우면 (1)이, ⑧ 호출을 지우면 (2)가 빨개진다.
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
import { FOREIGN_STOCK_FX_FIELDS } from "@/lib/calc/foreign-stock-fx-limits";
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

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "Example Corp",
    marketType: "foreign_stock",
    yearsResidentInKorea: "7",
    isListedForeignCorp: true,
    fgCountryCode: "US",
    acquisitionDate: "2026-01-05",
    transferDate: "2026-12-02",
    shareCount: "100",
    perShareTransferPriceForeign: "2000",
    transferCurrencyCode: "USD",
    transferExchangeRate: "1500",
    perShareAcquisitionPriceForeign: "800",
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: "1250",
    ...o,
  };
}

const CARRY: Partial<StockTransferFormData> = {
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2025-08-01",
  donorRelation: "spouse",
  donorAcquisitionModeFS: "actual",
  donorPerShareAcquisitionPriceForeign: "400",
  donorAcquisitionCurrencyCode: "USD",
  donorAcquisitionExchangeRate: "1250",
};

const INSTALLMENTS: Partial<StockTransferFormData> = {
  fsTransferReceiptMode: "installments",
  fsTransferInstallmentReceipts: [
    { receiptDate: "2026-03-01", amountForeign: "100000", exchangeRate: "1300" },
    { receiptDate: "2026-09-01", amountForeign: "100000", exchangeRate: "1310" },
  ],
};

interface Row {
  name: string;
  form: StockTransferFormData;
  /** ⑫ 이슈 경로 (`.` 연결) = ⑧ 입력칸 이름의 서버 쪽 표기 */
  path: string;
  /** ⑧ 이슈 field — 분할 수령 행만 폼 이름(`fsTransferInstallmentReceipts[i].…`)이 다르다 */
  field: string;
}

const rows = (a: Partial<StockTransferFormData>["fsTransferInstallmentReceipts"]) => ({
  ...INSTALLMENTS,
  fsTransferInstallmentReceipts: a,
});

const GRID: Row[] = [
  // ── 양도가액
  { name: "양도일 환율 소수 5자리", form: form({ transferExchangeRate: "1500.12345" }), path: "transferExchangeRate", field: "transferExchangeRate" },
  { name: "양도일 환율 상한 초과(1e7)", form: form({ transferExchangeRate: "10000001" }), path: "transferExchangeRate", field: "transferExchangeRate" },
  { name: "1주당 양도가액 소수 5자리", form: form({ perShareTransferPriceForeign: "2000.12345" }), path: "perShareTransferPriceForeign", field: "perShareTransferPriceForeign" },
  { name: "총 양도가액 소수 5자리 (총액 모드)", form: form({ fgTransferPriceMode: "total", totalTransferPriceForeign: "400000.12345" }), path: "totalTransferPriceForeign", field: "totalTransferPriceForeign" },
  { name: "총 양도가액 상한 초과(1e11)", form: form({ fgTransferPriceMode: "total", totalTransferPriceForeign: "100000000001" }), path: "totalTransferPriceForeign", field: "totalTransferPriceForeign" },
  { name: "환산 원화 안전 정수 초과(1주당 × 주수 × 환율)", form: form({ perShareTransferPriceForeign: "99999999999", shareCount: "5000" }), path: "perShareTransferPriceForeign", field: "perShareTransferPriceForeign" },
  // ── 분할 수령 행 (행 번호 보존 — 불완전 행이 앞에 있어도 밀리지 않는다)
  {
    name: "분할 수령 2번째 행 환율 소수 5자리",
    form: form(rows([
      { receiptDate: "2026-03-01", amountForeign: "100000", exchangeRate: "1300" },
      { receiptDate: "2026-09-01", amountForeign: "100000", exchangeRate: "1310.12345" },
    ])),
    path: "transferInstallmentReceipts.1.exchangeRate",
    field: "fsTransferInstallmentReceipts[1].exchangeRate",
  },
  {
    name: "분할 수령 1번째 행 수령액 소수 5자리",
    form: form(rows([
      { receiptDate: "2026-03-01", amountForeign: "100000.12345", exchangeRate: "1300" },
      { receiptDate: "2026-09-01", amountForeign: "100000", exchangeRate: "1310" },
    ])),
    path: "transferInstallmentReceipts.0.amountForeign",
    field: "fsTransferInstallmentReceipts[0].amountForeign",
  },
  // ── 취득가액
  { name: "취득일 환율 소수 5자리", form: form({ acquisitionExchangeRate: "1250.12345" }), path: "acquisitionExchangeRate", field: "acquisitionExchangeRate" },
  { name: "1주당 취득가액 소수 5자리", form: form({ perShareAcquisitionPriceForeign: "800.12345" }), path: "perShareAcquisitionPriceForeign", field: "perShareAcquisitionPriceForeign" },
  // ── 필요경비
  { name: "자본적지출 소수 5자리", form: form({ capitalExpenditureForeign: "5000.12345", capitalExpenditureExchangeRate: "1340" }), path: "capitalExpenditureForeign", field: "capitalExpenditureForeign" },
  { name: "자본적지출 지출일 환율 소수 5자리", form: form({ capitalExpenditureForeign: "5000", capitalExpenditureExchangeRate: "1340.12345" }), path: "capitalExpenditureExchangeRate", field: "capitalExpenditureExchangeRate" },
  { name: "양도비 상한 초과(1e11)", form: form({ transferCostForeign: "100000000001", transferCostExchangeRate: "1340" }), path: "transferCostForeign", field: "transferCostForeign" },
  { name: "양도비 지출일 환율 소수 5자리", form: form({ transferCostForeign: "200", transferCostExchangeRate: "1340.12345" }), path: "transferCostExchangeRate", field: "transferCostExchangeRate" },
  // ── 외국납부세액
  { name: "외국납부세액 소수 5자리", form: form({ hasForeignTax: true, foreignTaxPaidForeign: "5000.12345", foreignTaxExchangeRate: "1300", foreignTaxCurrencyCode: "USD" }), path: "foreignTaxPaidForeign", field: "foreignTaxPaidForeign" },
  { name: "납세일 환율 소수 5자리", form: form({ hasForeignTax: true, foreignTaxPaidForeign: "5000", foreignTaxExchangeRate: "1300.12345", foreignTaxCurrencyCode: "USD" }), path: "foreignTaxExchangeRate", field: "foreignTaxExchangeRate" },
  // ── 이월과세 §97의2① 증여자
  { name: "증여자 1주당 취득가액 소수 5자리", form: form({ ...CARRY, donorPerShareAcquisitionPriceForeign: "400.12345" }), path: "donorPerShareAcquisitionPriceForeign", field: "donorPerShareAcquisitionPriceForeign" },
  { name: "증여자 취득일 환율 소수 5자리", form: form({ ...CARRY, donorAcquisitionExchangeRate: "1250.12345" }), path: "donorAcquisitionExchangeRate", field: "donorAcquisitionExchangeRate" },
  { name: "증여자 자본적지출 소수 5자리", form: form({ ...CARRY, donorCapitalExpenditureForeign: "10.12345", donorCapitalExpenditureExchangeRate: "1200" }), path: "donorCapitalExpenditureForeign", field: "donorCapitalExpenditureForeign" },
  { name: "증여자 자본적지출 지출일 환율 소수 5자리", form: form({ ...CARRY, donorCapitalExpenditureForeign: "10", donorCapitalExpenditureExchangeRate: "1200.12345" }), path: "donorCapitalExpenditureExchangeRate", field: "donorCapitalExpenditureExchangeRate" },
];

const fxMessage = (issues: { path: (string | number)[]; message: string }[], path: string) =>
  issues.find((i) => i.path.join(".") === path && i.message.includes("§178의5"))?.message;

describe("⑧↔⑫ 패리티 — 입력 한도 격자 (route의 실제 스키마 × ⑧)", () => {
  for (const r of GRID) {
    it(`${r.name}: ⑫ Zod가 막고 · ⑧이 같은 칸·같은 메시지로 막고 · POST는 400`, async () => {
      const body = buildStockTransferApiBody(r.form);
      const parsed = foreignStockInputSchema.safeParse(body);
      expect(parsed.success, "⑫가 통과시키면 엔진이 던져 500이 된다").toBe(false);
      const zodMsg = parsed.success ? undefined : fxMessage(parsed.error.issues as never, r.path);
      expect(zodMsg, `⑫ 이슈 경로 ${r.path}`).toBeDefined();

      const ui = validateAllSteps(r.form).filter((e) => e.severity === "error");
      const uiMsg = ui.find((e) => e.field === r.field && e.message.includes("§178의5"))?.message;
      expect(uiMsg, `⑧이 ${r.field}를 통과시키면 UI 통과 ↔ API 400 모순`).toBeDefined();
      expect(uiMsg).toBe(zodMsg);

      const res = await post(body);
      expect(res.status, JSON.stringify(res.json).slice(0, 200)).toBe(400);
    });
  }

  it("다종목 items[] 국외 갈래도 같은 한도에서 400 (aggregate)", async () => {
    const body = buildStockTransferApiBody(form({ transferExchangeRate: "1500.12345" }));
    const res = await post({ items: [body] });
    expect(res.status).toBe(400);
  });

  it("완전성 가드 — 판정이 지키는 모든 칸이 격자에 있다 (새 칸이 생기면 행을 추가해야 한다)", () => {
    const covered = new Set(GRID.map((g) => g.path.replace(/\.\d+\./, ".")).map((p) => p.split(".")[0]));
    const missing = FOREIGN_STOCK_FX_FIELDS.filter((f) => f !== "shareCount" && !covered.has(f));
    expect(missing).toEqual([]);
  });
});

describe("⑧↔⑫ 패리티 — 통과해야 하는 입력 (양성 대조군)", () => {
  const OK: { name: string; form: StockTransferFormData }[] = [
    { name: "기준 폼(정수 환율)", form: form() },
    { name: "환율·외화액 소수 4자리 경계 (1300.1234 · 400000.1234)", form: form({ transferExchangeRate: "1300.1234", perShareTransferPriceForeign: "400000.1234", shareCount: "1" }) },
    { name: "측정 사례 400,000 × 1,300.10 (총액 모드)", form: form({ fgTransferPriceMode: "total", totalTransferPriceForeign: "400000", transferExchangeRate: "1300.10" }) },
    { name: "필요경비 금액 0인데 지출일 환율 칸에 소수 5자리가 남아 있다 (보이지 않는 칸 — 막지 않는다)", form: form({ capitalExpenditureForeign: "0", capitalExpenditureExchangeRate: "1340.12345" }) },
    { name: "외국세 OFF인데 납세일 환율 5자리 잔존 (④가 싣지 않는다)", form: form({ hasForeignTax: false, foreignTaxPaidForeign: "5000.12345", foreignTaxExchangeRate: "1300.12345" }) },
    { name: "분할 수령 모드에서 stale 1주당 양도가액 5자리 (엔진이 읽지 않는다)", form: form({ ...INSTALLMENTS, perShareTransferPriceForeign: "2000.12345" }) },
  ];
  for (const o of OK) {
    it(`${o.name}: ⑫ 통과 · ⑧ 한도 오류 없음`, () => {
      const parsed = foreignStockInputSchema.safeParse(buildStockTransferApiBody(o.form));
      const zodFx = parsed.success ? [] : parsed.error.issues.filter((i) => i.message.includes("§178의5"));
      expect(zodFx).toEqual([]);
      const uiFx = validateAllSteps(o.form).filter((e) => e.severity === "error" && e.message.includes("§178의5") && /소수|이하|범위/.test(e.message));
      expect(uiFx).toEqual([]);
    });
  }
});
