/**
 * anchor: 국외주식 이월과세 §97의2① — **폼 → ④ body → route(⑫⑭) → 엔진 배선** (14 동기화 지점 ①~⑧·⑫⑬⑭)
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §8.1 (FW-1~FW-6)
 *
 * ⚠️ ⑫⑬⑭는 TypeScript가 잡지 못한다 — 그래서 「값이 세액까지 도달했는가」를 **세액으로** 단언한다.
 * 🔑 **폼 필드에서 출발한다**(`feedback_api_trigger_without_input_path_is_noop`) — 입력 UI가 없으면
 *    payload 테스트만 통과하고 세액은 움직이지 않는다.
 *
 * 사례(FC-1): 100주 · 증여자 취득 2025-08-01 USD 400 @1,250 = 50,000,000 → 수증 2026-01-05 USD 800 @1,250
 *   = 100,000,000 → 양도 2026-12-02 USD 2,000 @1,500 = 300,000,000
 *   A(적용) 산출세액 49,500,000 / B(미적용) 39,500,000
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
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockValidationError } from "@/lib/calc/stock-transfer-tax-validate";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
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

/** 국외 기준 폼 — 수증자(B) 기준 취득가액 */
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

/** 이월과세 선언 + 증여자 취득가액 승계 입력 */
const CARRY: Partial<StockTransferFormData> = {
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2025-08-01",
  donorRelation: "spouse",
  donorAcquisitionModeFS: "actual",
  donorPerShareAcquisitionPriceForeign: "400",
  donorAcquisitionCurrencyCode: "USD",
  donorAcquisitionExchangeRate: "1250",
};

const DONOR_BODY_KEYS = [
  "acquisitionCause",
  "donorRelation",
  "donorDeceased",
  "donorAcquisitionDate",
  "donorAcquisitionMode",
  "donorPerShareAcquisitionPriceForeign",
  "donorAcquisitionCurrencyCode",
  "donorAcquisitionExchangeRate",
  "donorCapitalExpenditureForeign",
  "donorCapitalExpenditureExchangeRate",
  "giftTaxAmount",
  "transferredAssetValue",
  "giftTaxableValue",
] as const;

const uiErrors = (f: StockTransferFormData): StockValidationError[] =>
  validateAllSteps(f).filter((e) => e.severity === "error");
const paths = (json: { issues?: { path: (string | number)[] }[] }) =>
  (json.issues ?? []).map((i) => i.path.join("."));

describe("FW-1 폼 → body → route → 엔진 — 이월과세 입력이 세액까지 도달한다", () => {
  it("FC-1 49,500,000 · applied · 비교 49,500,000/39,500,000", async () => {
    const f = form(CARRY);
    const body = buildStockTransferApiBody(f);
    // ⑬ body spread — 13개 계약 키가 철자 그대로 실린다
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.donorRelation).toBe("spouse");
    expect(body.donorAcquisitionDate).toBe("2025-08-01");
    expect(body.donorAcquisitionMode).toBe("actual");
    expect(body.donorPerShareAcquisitionPriceForeign).toBe(400);
    expect(body.donorAcquisitionCurrencyCode).toBe("USD");
    expect(body.donorAcquisitionExchangeRate).toBe(1250);
    // ⑧ 통과 ⇒ ⑫ 통과
    expect(uiErrors(f)).toEqual([]);
    const r = await post(body);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.incomeTax).toBe(49_500_000);
    expect(r.json.result.carryoverOutcome).toBe("applied");
    expect(r.json.result.carryoverComparison).toEqual({ appliedTotalTax: 49_500_000, excludedTotalTax: 39_500_000 });
  });

  it("증여자 자본적지출·증여세가 필요경비로 도달한다 (환율 1,200 · 증여세 안분)", async () => {
    const f = form({
      ...CARRY,
      donorCapitalExpenditureForeign: "10",
      donorCapitalExpenditureExchangeRate: "1200",
      giftTaxAmount: "1000000",
      transferredAssetValue: "50000000",
      giftTaxableValue: "100000000",
    });
    const body = buildStockTransferApiBody(f);
    expect(body.donorCapitalExpenditureForeign).toBe(10);
    expect(body.donorCapitalExpenditureExchangeRate).toBe(1200);
    expect(body.giftTaxAmount).toBe(1_000_000);
    expect(body.transferredAssetValue).toBe(50_000_000);
    expect(body.giftTaxableValue).toBe(100_000_000);
    expect(uiErrors(f)).toEqual([]);
    const r = await post(body);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.carryoverDonorCapexKrw).toBe(12_000); // 10 × 1,200
    expect(r.json.result.carryoverGiftTaxIncluded).toBe(500_000); // 1,000,000 × 50% (한도 안)
  });

  it("다종목 items[] 국외 갈래에도 같은 body가 실려 비교 echo가 도달한다 (단건·다건 한 빌더)", async () => {
    const r = await post({ items: [buildStockTransferApiBody(form(CARRY))], deductionMode: "aggregate" });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.items[0].carryoverDetail.outcome).toBe("applied");
  });
});

describe("FW-2 토글 OFF — body에 donor 키가 새지 않는다 (부정 + 긍정 짝)", () => {
  const stale: Partial<StockTransferFormData> = {
    ...CARRY,
    acquisitionCause: "purchase", // 토글 OFF — 값은 남아 있다(지우지 않는다)
    donorDeceased: true,
    donorCapitalExpenditureForeign: "10",
    donorCapitalExpenditureExchangeRate: "1200",
    giftTaxAmount: "1000000",
    transferredAssetValue: "50000000",
    giftTaxableValue: "100000000",
  };

  it("부정 — OFF면 13개 키 전부 미전송 · 산출세액 39,500,000", async () => {
    const f = form(stale);
    const body = buildStockTransferApiBody(f);
    for (const k of DONOR_BODY_KEYS) expect(body, k).not.toHaveProperty(k);
    expect(uiErrors(f)).toEqual([]);
    const r = await post(body);
    expect(r.json.result.incomeTax).toBe(39_500_000);
    expect(r.json.result.carryoverOutcome).toBeUndefined();
  });

  it("긍정 짝 — 같은 잔존값이라도 ON이면 실린다 (술어가 막는 것이지 필드를 지운 게 아니다)", () => {
    const body = buildStockTransferApiBody(form({ ...stale, acquisitionCause: "carryover_gift" }));
    for (const k of DONOR_BODY_KEYS.filter((x) => x !== "donorDeceased")) expect(body, k).toHaveProperty(k);
    expect(body.donorDeceased).toBe(true);
  });

  it("빈 칸은 키 자체를 싣지 않는다 (0이 엔진 `??` fallback을 죽이는 선례)", () => {
    const body = buildStockTransferApiBody(form({ ...CARRY, donorAcquisitionExchangeRate: "" }));
    expect(body).not.toHaveProperty("donorAcquisitionExchangeRate");
    expect(body).not.toHaveProperty("donorCapitalExpenditureForeign");
    expect(body).not.toHaveProperty("giftTaxAmount");
  });
});

describe("FW-3 국내 donor 원화 필드가 국외 body에 섞이지 않는다", () => {
  it("국내에서 입력한 원화 donor 값이 남아 있어도 국외 body는 국내 키를 싣지 않는다", () => {
    const f = form({
      ...CARRY,
      donorAcquisitionPrice: "30000",
      donorAcquisitionMethod: "estimated",
      donorAcquisitionStdPrice: "20000",
      donorCapitalExpenditure: "5000000",
    });
    const body = buildStockTransferApiBody(f);
    for (const k of ["donorAcquisitionPrice", "donorAcquisitionMethod", "donorAcquisitionStdPrice", "donorCapitalExpenditure"]) {
      expect(body, k).not.toHaveProperty(k);
    }
  });
});

describe("FW-4 ⑧ ↔ ⑫ 격자 정합 — UI 통과 ⇒ API 통과, ⑧이 막는 칸은 ⑫도 막는다", () => {
  const cases: [string, Partial<StockTransferFormData>, string][] = [
    ["관계 미선택", { donorRelation: "" }, "donorRelation"],
    ["증여자 취득일 없음", { donorAcquisitionDate: "" }, "donorAcquisitionDate"],
    ["증여자 취득일 > 수증일", { donorAcquisitionDate: "2026-02-01" }, "donorAcquisitionDate"],
    ["증여자 1주당 취득가 없음", { donorPerShareAcquisitionPriceForeign: "" }, "donorPerShareAcquisitionPriceForeign"],
    ["증여자 취득일 환율 없음", { donorAcquisitionExchangeRate: "" }, "donorAcquisitionExchangeRate"],
    ["증여자 취득일 환율 0", { donorAcquisitionExchangeRate: "0" }, "donorAcquisitionExchangeRate"],
    [
      "증여자 자본적지출>0인데 지출일 환율 없음 (양도일 환율로 대신하지 않는다)",
      { donorCapitalExpenditureForeign: "10", donorCapitalExpenditureExchangeRate: "" },
      "donorCapitalExpenditureExchangeRate",
    ],
    [
      "증여세만 넣고 분자·분모 없음",
      { giftTaxAmount: "1000000" },
      "transferredAssetValue",
    ],
    [
      "증여세 분자만 있고 분모 없음",
      { giftTaxAmount: "1000000", transferredAssetValue: "50000000" },
      "giftTaxableValue",
    ],
  ];

  for (const [label, patch, field] of cases) {
    it(`차단 — ${label}: ⑧도 ⑫도 같은 칸을 막는다`, async () => {
      const f = form({ ...CARRY, ...patch });
      expect(uiErrors(f).map((e) => e.field), "⑧").toContain(field);
      const r = await post(buildStockTransferApiBody(f));
      expect(r.status).toBe(400);
      expect(paths(r.json), "⑫").toContain(field);
    });
  }

  const pass: [string, Partial<StockTransferFormData>][] = [
    ["승계 필수 입력만", {}],
    ["자본적지출 + 지출일 환율", { donorCapitalExpenditureForeign: "10", donorCapitalExpenditureExchangeRate: "1200" }],
    [
      "증여세 3종 완비",
      { giftTaxAmount: "1000000", transferredAssetValue: "50000000", giftTaxableValue: "100000000" },
    ],
    ["시가 산정(§178의3)", { donorAcquisitionModeFS: "market_price" }],
    ["직계존비속 + 사망 아님", { donorRelation: "lineal" }],
    ["증여자 취득일 = 수증일", { donorAcquisitionDate: "2026-01-05" }],
  ];
  for (const [label, patch] of pass) {
    it(`통과 — ${label}: ⑧ 통과면 ⑫도 통과한다`, async () => {
      const f = form({ ...CARRY, ...patch });
      expect(uiErrors(f)).toEqual([]);
      const r = await post(buildStockTransferApiBody(f));
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    });
  }

  it("OFF면 잔존 오입력이 있어도 ⑧·⑫ 모두 막지 않는다 (숨은 값이 차단 사유가 되면 안 된다)", async () => {
    const f = form({ ...CARRY, acquisitionCause: "purchase", donorAcquisitionExchangeRate: "0", donorRelation: "" });
    expect(uiErrors(f)).toEqual([]);
    const r = await post(buildStockTransferApiBody(f));
    expect(r.status).toBe(200);
  });

  it("⑧은 Step별로 나뉜다 — 관계·증여자 취득일=1단계, 증여자 취득가·환율=2단계, 환율(지출일)·증여세=3단계", () => {
    const stepOf = (f: StockTransferFormData, step: number, field: string) =>
      // validateAllSteps는 단계 구분을 하지 않으므로 단계별 진입점으로 확인한다
      import("@/lib/calc/stock-transfer-tax-validate-foreign").then((m) => {
        const fn = [m.validateStep1Foreign, m.validateStep2Foreign, m.validateStep3Foreign][step - 1];
        return fn(f).some((e) => e.field === field && e.severity === "error");
      });
    return Promise.all([
      stepOf(form({ ...CARRY, donorRelation: "" }), 1, "donorRelation"),
      stepOf(form({ ...CARRY, donorAcquisitionDate: "" }), 1, "donorAcquisitionDate"),
      stepOf(form({ ...CARRY, donorPerShareAcquisitionPriceForeign: "" }), 2, "donorPerShareAcquisitionPriceForeign"),
      stepOf(form({ ...CARRY, donorAcquisitionExchangeRate: "" }), 2, "donorAcquisitionExchangeRate"),
      stepOf(
        form({ ...CARRY, donorCapitalExpenditureForeign: "10" }),
        3,
        "donorCapitalExpenditureExchangeRate",
      ),
      stepOf(form({ ...CARRY, giftTaxAmount: "1000000" }), 3, "transferredAssetValue"),
    ]).then((rs) => expect(rs).toEqual([true, true, true, true, true, true]));
  });
});

describe("FW-5 normalize — 구형 sessionStorage(신규 키 없음)는 기본값으로 복원된다 (③)", () => {
  it("새 필드가 없는 저장본 → 빈 문자열 / actual / USD", () => {
    const legacy: Record<string, unknown> = { ...createInitialStockFormData(), marketType: "foreign_stock" };
    for (const k of [
      "donorAcquisitionModeFS",
      "donorPerShareAcquisitionPriceForeign",
      "donorAcquisitionCurrencyCode",
      "donorAcquisitionExchangeRate",
      "donorCapitalExpenditureForeign",
      "donorCapitalExpenditureExchangeRate",
    ]) {
      delete legacy[k];
    }
    const n = normalizeStockFormData(legacy);
    expect(n.donorAcquisitionModeFS).toBe("actual");
    expect(n.donorPerShareAcquisitionPriceForeign).toBe("");
    expect(n.donorAcquisitionCurrencyCode).toBe("USD");
    expect(n.donorAcquisitionExchangeRate).toBe("");
    expect(n.donorCapitalExpenditureForeign).toBe("");
    expect(n.donorCapitalExpenditureExchangeRate).toBe("");
  });

  it("저장된 값은 그대로 보존된다", () => {
    const n = normalizeStockFormData({
      ...createInitialStockFormData(),
      donorAcquisitionModeFS: "market_price",
      donorPerShareAcquisitionPriceForeign: "400",
      donorAcquisitionCurrencyCode: "JPY",
      donorAcquisitionExchangeRate: "9.5",
    });
    expect(n.donorAcquisitionModeFS).toBe("market_price");
    expect(n.donorPerShareAcquisitionPriceForeign).toBe("400");
    expect(n.donorAcquisitionCurrencyCode).toBe("JPY");
    expect(n.donorAcquisitionExchangeRate).toBe("9.5");
  });

  it("잘못된 enum은 기본값으로 떨어진다", () => {
    const n = normalizeStockFormData({ ...createInitialStockFormData(), donorAcquisitionModeFS: "estimated" });
    expect(n.donorAcquisitionModeFS).toBe("actual");
  });
});

describe("FW-6 술어는 raw acquisitionCause다 — split 잔존값에 화면과 body가 갈리지 않는다", () => {
  it("국내에서 lotsMode=split을 쓰다 해외로 전환해도 body는 이월과세를 싣고 세액이 49,500,000이다", async () => {
    const f = form({ ...CARRY, lotsMode: "split" });
    const body = buildStockTransferApiBody(f);
    expect(body.acquisitionCause).toBe("carryover_gift");
    const r = await post(body);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.incomeTax).toBe(49_500_000);
  });

  it("국내에서 inheritance를 골라 둔 채 해외로 전환하면 토글은 OFF — body 미전송", () => {
    const body = buildStockTransferApiBody(form({ ...CARRY, acquisitionCause: "inheritance" }));
    expect(body).not.toHaveProperty("acquisitionCause");
    expect(body).not.toHaveProperty("donorAcquisitionDate");
  });
});
