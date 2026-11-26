/**
 * 국외주식 이월과세 §97의2① — route 배관 anchor (W-1~W-4 · ⑨⑩⑫⑭)
 *
 * · W-1 문자열 날짜가 ⑭ coerce를 거쳐 ⓒⓓ 게이트·echo에 **Date로** 도달한다
 *       (`FOREIGN_STOCK_DATE_FIELDS` 누락 뮤테이션을 잡는다)
 * · W-2 `items[]` 국외 갈래에도 같은 필드가 도달한다(침묵 strip 없음)
 * · W-3 ⑩ refine이 ⑧과 같은 술어로 막는다
 * · W-4 엔진 내부 전용 필드(`carryover*`) 주입은 Zod가 strip한다
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
const paths = (json: { issues?: { path: (string | number)[] }[] }) =>
  (json.issues ?? []).map((i) => i.path.join("."));

/** FC-1 — JSON 직렬화 후 형태(날짜 문자열) */
const BASE_BODY = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,
  isListedForeignCorp: true,
  stockName: "Example Corp",
  countryCode: "US",
  shareCount: 100,
  transferDate: "2026-12-02",
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 2000,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1500,
  acquisitionDate: "2026-01-05",
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 800,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1250,
  capitalExpenditureForeign: 0,
  transferCostForeign: 0,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};
const CARRY_BODY = {
  ...BASE_BODY,
  acquisitionCause: "carryover_gift",
  donorRelation: "spouse",
  donorDeceased: false,
  donorAcquisitionDate: "2025-08-01",
  donorAcquisitionMode: "actual",
  donorPerShareAcquisitionPriceForeign: 400,
  donorAcquisitionCurrencyCode: "USD",
  donorAcquisitionExchangeRate: 1250,
};
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

describe("W-1 단건 — 문자열 날짜 coerce 후 엔진 도달", () => {
  it("FC-1 49,500,000 · applied · 증여자 취득일이 Date(ISO)로 도달", async () => {
    const r = await post(CARRY_BODY);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.incomeTax).toBe(49_500_000);
    expect(r.json.result.carryoverOutcome).toBe("applied");
    expect(r.json.result.carryoverComparison).toEqual({ appliedTotalTax: 49_500_000, excludedTotalTax: 39_500_000 });
    // JSON 문자열 "2025-08-01"이 그대로면 coerce 누락 — Date는 toISOString으로 직렬화된다
    expect(r.json.result.carryoverDonorAcquisitionDate).toBe("2025-08-01T00:00:00.000Z");
    expect(r.json.result.carryoverDonorExchangeRate).toBe(1250);
  });

  it("미선언 body는 종전 그대로(39,500,000, echo 없음)", async () => {
    const r = await post(BASE_BODY);
    expect(r.status).toBe(200);
    expect(r.json.result.incomeTax).toBe(39_500_000);
    expect(r.json.result.carryoverOutcome).toBeUndefined();
  });

  it("purchase 선언 + donor 잔존값은 무시된다", async () => {
    const r = await post({ ...CARRY_BODY, acquisitionCause: "purchase" });
    expect(r.status).toBe(200);
    expect(r.json.result.incomeTax).toBe(39_500_000);
  });
});

describe("W-2 items[] 국외 갈래", () => {
  it("합산 n=1에서도 필드가 도달해 carryoverDetail·foreignDetail.carryover가 실린다", async () => {
    const r = await post({ items: [CARRY_BODY], deductionMode: "aggregate" });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.totalFinalTax).toBe(49_500_000);
    const item = r.json.result.items[0];
    expect(item.carryoverDetail.outcome).toBe("applied");
    expect(item.foreignDetail.carryover.donorAcquisitionPriceKrw).toBe(50_000_000);
    expect(item.foreignDetail.carryover.giftDateAcquisitionPriceKrw).toBe(100_000_000);
  });
});

describe("W-3 ⑩ refine — ⑧과 같은 술어로 차단", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["관계 미선택", without(CARRY_BODY, "donorRelation"), "donorRelation"],
    ["증여자 취득일 없음", without(CARRY_BODY, "donorAcquisitionDate"), "donorAcquisitionDate"],
    ["증여자 취득일 > 수증일", { ...CARRY_BODY, donorAcquisitionDate: "2026-02-01" }, "donorAcquisitionDate"],
    ["산정 방식 없음", without(CARRY_BODY, "donorAcquisitionMode"), "donorAcquisitionMode"],
    ["증여자 단가 없음", without(CARRY_BODY, "donorPerShareAcquisitionPriceForeign"), "donorPerShareAcquisitionPriceForeign"],
    ["증여자 환율 없음", without(CARRY_BODY, "donorAcquisitionExchangeRate"), "donorAcquisitionExchangeRate"],
    [
      "자본적지출만 있고 지출일 환율 없음(양도일 환율로 대신하지 않는다)",
      { ...CARRY_BODY, donorCapitalExpenditureForeign: 100 },
      "donorCapitalExpenditureExchangeRate",
    ],
    [
      "증여세 산출세액만 있고 안분 분자·분모 없음",
      { ...CARRY_BODY, giftTaxAmount: 1_000_000 },
      "transferredAssetValue",
    ],
    [
      "안분 분자·분모만 있고 산출세액 칸이 빔",
      { ...CARRY_BODY, transferredAssetValue: 1_000_000, giftTaxableValue: 2_000_000 },
      "giftTaxAmount",
    ],
    ["수증일 > 양도일", { ...CARRY_BODY, acquisitionDate: "2026-12-03" }, "acquisitionDate"],
  ];
  for (const [name, body, path] of cases) {
    it(`${name} → 400 (${path})`, async () => {
      const r = await post(body);
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
      expect(paths(r.json)).toContain(path);
    });
  }

  it("items[] 갈래도 같은 차단", async () => {
    const r = await post({ items: [without(CARRY_BODY, "donorAcquisitionExchangeRate")] });
    expect(r.status).toBe(400);
  });

  it("증여세 산출세액 0 + 분자·분모 입력은 허용(배우자 공제로 증여세 0)", async () => {
    const r = await post({ ...CARRY_BODY, giftTaxAmount: 0, transferredAssetValue: 100_000_000, giftTaxableValue: 100_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.result.incomeTax).toBe(49_500_000);
  });
});

describe("W-4 엔진 내부 전용 필드 주입은 strip된다", () => {
  it("carryoverOutcome·carryoverGiftTaxExpense·carryoverDonorCapexKrw를 실어도 세액이 바뀌지 않는다", async () => {
    const r = await post({
      ...CARRY_BODY,
      carryoverOutcome: "excluded",
      carryoverGiftTaxExpense: 999_999_999,
      carryoverDonorCapexKrw: 999_999_999,
      carryoverComparison: { appliedTotalTax: 0, excludedTotalTax: 0 },
    });
    expect(r.status).toBe(200);
    expect(r.json.result.incomeTax).toBe(49_500_000);
    expect(r.json.result.carryoverGiftTaxIncluded).toBe(0);
  });
});
