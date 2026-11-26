/**
 * F-1 PR-1c — 주식 양도 §97의2④ 가업상속공제 자산 의제 취득가액 route 배선 anchor (⑨⑩⑫⑭)
 *
 * 폼 → body(JSON) → Zod(⑫) → ⑩ refine → coerceDates → ⑭ 매핑 → 엔진 전 구간을 실제 route로 태운다.
 * 엔진 anchor(`fb-97-2-4-stock*.anchor.test.ts`)는 엔진을 직접 부르므로 ⑫⑭ 누락을 못 잡는다.
 *
 * 기준 사례(계획서 §7.2): 비상장 대주주 비중소 · 1만 주 · 상속평가 5만/주 · 피상속인 5천/주 · 양도 8만/주 ·
 *   상속 2024-03-01 · 양도 2026-06-01 · 법인 ③2호 총자산 50억 / 사업무관 10억(적용률 0.8)
 *   → 의제 취득가 140,000,000 · 산출 149,375,000 · §18의2⑩ 공제 89,875,000.
 *
 * W-1 단건 · W-2 lot(분할) · W-3 다종목(F1-11) · W-4 ⑩ 차단(단건·lot·다종목) · W-5 엔진 throw의 HTTP 상태
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
const messages = (json: { issues?: { message: string }[] }) => (json.issues ?? []).map((i) => i.message);
async function expectRejected(body: unknown, path: string, messagePart?: RegExp) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(400);
  expect(paths(r.json)).toContain(path);
  if (messagePart) expect(messages(r.json).join("\n")).toMatch(messagePart);
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

/** 신 ③2호 — 적용률 (50억 − 10억) ÷ 50억 = 0.8 */
const CORP_08 = { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 };
/** 구 ③ — 공제금액 ÷ 가업상속 재산가액 = 0.8 (양도일 2026.2.26. 이전) */
const DEDUCTION_08 = { kind: "deduction_ratio", deductionAmount: 8, businessEstateValue: 10 };
const FB = { decedentAcquisitionPricePerShare: 5_000, fbRateBasis: CORP_08 };

/** 종목 공통 필드 — 엔진 픽스처 `unlisted()`의 JSON 형태 */
const COMMON = {
  marketType: "unlisted",
  isMajorShareholder: true,
  selfShareRatio: 0.6,
  selfMarketCap: 2_000_000_000,
  isLargestShareholderGroup: false,
  combinedShareRatio: 0,
  combinedMarketCap: 0,
  priorYearEndDate: "2025-12-31",
  isQualifyingBlockShareholder: false,
  isHeavyRealEstateForRate: false,
  isHeavyRealEstateForValuation: false,
  isSmallMediumEnterprise: false,
  isMidsizeEnterprise: false,
  isListedSmallShareholder: false,
  isVentureCompany: false,
  isKOTCTrading: false,
  totalIssuedShares: 1_000_000,
  transferPriceMode: "actual",
  transferActualInputMode: "per_share",
  acquisitionMode: "actual",
  acquiredBeforeListing: false,
  tradingHaltAtTransfer: false,
  bookLost: false,
  expenseMode: "actual",
  actualExpenses: 0,
  filingType: "preliminary",
  filingDate: "2026-08-31",
  isElectronicFiling: false,
  filingViolation: "none",
  isFraudulent: false,
  isInternationalTransaction: false,
  realEstateGroupBasicDeductionUsed: 0,
};

/** 단건 — 상속 · 가업상속 입력 포함 */
const SINGLE = {
  ...COMMON,
  acquisitionDate: "2024-03-01",
  transferDate: "2026-06-01",
  shareCount: 10_000,
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2015-01-01",
  perShareTransferPrice: 80_000,
  perShareAcquisitionPrice: 50_000,
  familyBusinessInheritance: FB,
};

/** lot(분할) — 가업 상속 lot 1개를 전량 양도(단건 ≡ lot 1개 전량 양도) */
const FB_LOT = {
  id: "b",
  acquisitionDate: "2024-03-01",
  shareCount: 10_000,
  perShareAcquisitionPrice: 50_000,
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2015-01-01",
  familyBusinessInheritance: FB,
};
const SALE = { id: "t", transferDate: "2026-06-01", shareCount: 10_000, perShareTransferPrice: 80_000 };
const split = (lot: Record<string, unknown> = FB_LOT, sales: Record<string, unknown>[] = [SALE]) => ({
  ...COMMON,
  acquisitionDate: "2024-03-01",
  transferDate: String(sales[sales.length - 1].transferDate),
  shareCount: sales.reduce((s, t) => s + (t.shareCount as number), 0),
  acquisitionCause: "purchase",
  costAllocationMethod: "fifo",
  acquisitionLots: [lot],
  transferLots: sales,
});

/** 다종목 F1-11 — 매매 종목(먼저 양도해 기본공제를 가져간다) + 가업 종목 */
const PURCHASE_ITEM = {
  ...COMMON,
  isMajorShareholder: false,
  selfShareRatio: 0.001,
  selfMarketCap: 10_000_000,
  isSmallMediumEnterprise: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2025-01-10",
  transferDate: "2026-03-01",
  shareCount: 1_000,
  perShareAcquisitionPrice: 10_000,
  perShareTransferPrice: 47_500,
};

describe("W-1 단건 — 폼 body → route → 엔진 (⑫⑭)", () => {
  it("🟢 의제 취득가 140,000,000 · 산출 149,375,000 · 지방세 14,937,500 · 공제 89,875,000", async () => {
    const r = await post(SINGLE);
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    const res = r.json.result;
    expect(res.acquisitionPrice).toBe(140_000_000);
    expect(res.familyBusinessDetail.imputedAcquisitionPrice).toBe(140_000_000);
    expect(res.calculatedTax).toBe(149_375_000);
    expect(res.finalTax).toBe(149_375_000);
    expect(res.localIncomeTax).toBe(14_937_500);
    expect(res.familyBusinessDetail).toMatchObject({
      decedentAcquisitionPrice: 50_000_000,
      inheritanceMarketValue: 500_000_000,
      appliedRate: 0.8,
      appliedRateBasis: CORP_08,
      cgtUnderSection97_2_4: 149_375_000,
      cgtUnderSection97: 59_500_000,
      creditAmount: 89_875_000,
      fbItemCount: 1,
    });
  });

  it("미선언 body는 종전 그대로 — 상속개시일 평가액 5억 · 59,500,000 · detail 없음", async () => {
    const r = await post(without(SINGLE, "familyBusinessInheritance"));
    expect(r.status).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(500_000_000);
    expect(r.json.result.finalTax).toBe(59_500_000);
    expect(r.json.result.familyBusinessDetail).toBeUndefined();
  });

  it("자본적지출 1천만 — (5천만 + 1천만) × 0.8 + 5억 × 0.2 = 148,000,000", async () => {
    const r = await post({ ...SINGLE, familyBusinessInheritance: { ...FB, decedentCapitalExpenditure: 10_000_000 } });
    expect(r.status).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(148_000_000);
    expect(r.json.result.familyBusinessDetail.decedentCapitalExpenditure).toBe(10_000_000);
  });

  it("양도일 2026-02-26 + 구 ③(deduction_ratio) — 같은 의제 140,000,000, basis kind가 echo로 돌아온다", async () => {
    const r = await post({ ...SINGLE, transferDate: "2026-02-26", familyBusinessInheritance: { ...FB, fbRateBasis: DEDUCTION_08 } });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(140_000_000);
    expect(r.json.result.familyBusinessDetail.appliedRateBasis).toEqual(DEDUCTION_08);
  });

  it("상속개시일 2013-12-31 — G-1 미적용 + 안내(400 아님) · 일반 §97 산식", async () => {
    const r = await post({ ...SINGLE, acquisitionDate: "2013-12-31", decedentAcquisitionDate: "2005-01-01" });
    expect(r.status).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(500_000_000);
    expect(r.json.result.familyBusinessDetail).toBeUndefined();
    expect(r.json.result.warnings.join("\n")).toContain("2014.1.1. 전");
  });
});

describe("W-2 lot(분할) — acquisitionLots[].familyBusinessInheritance (⑫ lot · ⑭ 통째 전달)", () => {
  it("🟢 lot 1개 전량 양도 = 단건과 같은 의제 140,000,000 · 149,375,000 · 공제 89,875,000", async () => {
    const r = await post(split());
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    const res = r.json.result;
    expect(res.acquisitionPrice).toBe(140_000_000);
    expect(res.calculatedTax).toBe(149_375_000);
    expect(res.familyBusinessDetail).toMatchObject({
      imputedAcquisitionPrice: 140_000_000,
      cgtUnderSection97_2_4: 149_375_000,
      cgtUnderSection97: 59_500_000,
      creditAmount: 89_875_000,
      fbItemCount: 1,
    });
  });

  it("lot 가업 입력이 없으면 종전 그대로(5억 · 59,500,000)", async () => {
    const r = await post(split(without(FB_LOT, "familyBusinessInheritance")));
    expect(r.status).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(500_000_000);
    expect(r.json.result.finalTax).toBe(59_500_000);
  });
});

describe("W-3 다종목(items[]) — F1-11 (신고 단위 결정세액 비교)", () => {
  it("🟢 가업(0.8) + 매매 — 합계 153,500,000 · A 153,500,000 · B 63,500,000 · 공제 90,000,000", async () => {
    const r = await post({ items: [PURCHASE_ITEM, SINGLE] });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    const res = r.json.result;
    expect(res.totalFinalTax).toBe(153_500_000);
    expect(res.items[0].familyBusinessDetail).toBeUndefined();
    expect(res.items[1].acquisitionPrice).toBe(140_000_000);
    expect(res.items[1].familyBusinessDetail).toMatchObject({
      cgtUnderSection97_2_4: 153_500_000,
      cgtUnderSection97: 63_500_000,
      creditAmount: 90_000_000,
      fbItemCount: 1,
    });
  });

  it("단건 ≡ 합산 n=1 — 같은 세액·detail", async () => {
    const single = await post(SINGLE);
    const agg = await post({ items: [SINGLE] });
    expect(agg.status).toBe(200);
    expect(agg.json.result.totalFinalTax).toBe(single.json.result.finalTax);
    expect(agg.json.result.items[0].familyBusinessDetail).toEqual(single.json.result.familyBusinessDetail);
  });

  it("items[] lot 축도 도달 — 가업 lot 종목의 의제 140,000,000", async () => {
    const r = await post({ items: [split()] });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.json.result.items[0].acquisitionPrice).toBe(140_000_000);
  });
});

describe("W-4 ⑩ 차단 — 엔진 throw와 같은 술어(400)", () => {
  it("상속 외 원인(매매) + 가업 입력", async () => {
    await expectRejected({ ...SINGLE, acquisitionCause: "purchase" }, "familyBusinessInheritance", /취득원인이 상속인 주식/);
  });
  it("환산(estimated) 모드 + 가업 입력", async () => {
    await expectRejected(
      { ...without(SINGLE, "perShareAcquisitionPrice"), acquisitionMode: "estimated", expenseMode: "estimated", transferYearNetIncomePerShare: 20000, transferYearNetAssetPerShare: 15000, acquisitionYearNetIncomePerShare: 10000, acquisitionYearNetAssetPerShare: 8000 },
      "familyBusinessInheritance",
      /실지거래가액/,
    );
  });
  it("매매사례(sale_case) 모드 + 가업 입력", async () => {
    await expectRejected(
      { ...without(SINGLE, "perShareAcquisitionPrice"), acquisitionMode: "sale_case", acquisitionMarketSamplePrice: 50_000, acquisitionMarketSampleDate: "2024-02-01" },
      "familyBusinessInheritance",
      /실지거래가액/,
    );
  });
  it("양도일 02-27 이후인데 구 ③ 법정량(deduction_ratio) — era ↔ kind 불일치", async () => {
    await expectRejected({ ...SINGLE, familyBusinessInheritance: { ...FB, fbRateBasis: DEDUCTION_08 } }, "familyBusinessInheritance", /2026\.2\.27\. 이후/);
  });
  it("양도일 02-26 이전인데 신 ③2호 법정량(corporate_business_assets)", async () => {
    await expectRejected({ ...SINGLE, transferDate: "2026-02-26" }, "familyBusinessInheritance", /2026\.2\.26\. 이전/);
  });
  it("피상속인 1주당 취득가액 0", async () => {
    await expectRejected({ ...SINGLE, familyBusinessInheritance: { ...FB, decedentAcquisitionPricePerShare: 0 } }, "familyBusinessInheritance", /피상속인의 1주당/);
  });
  it("피상속인 1주당 취득가액 소수(원 단위 아님)", async () => {
    await expectRejected({ ...SINGLE, familyBusinessInheritance: { ...FB, decedentAcquisitionPricePerShare: 5_000.5 } }, "familyBusinessInheritance", /원 단위/);
  });
  it("자본적지출 음수·소수", async () => {
    await expectRejected({ ...SINGLE, familyBusinessInheritance: { ...FB, decedentCapitalExpenditure: -1 } }, "familyBusinessInheritance", /자본적지출/);
    await expectRejected({ ...SINGLE, familyBusinessInheritance: { ...FB, decedentCapitalExpenditure: 10.5 } }, "familyBusinessInheritance", /자본적지출/);
  });
  it("법정량 분모 0 — 총자산가액 0", async () => {
    await expectRejected(
      { ...SINGLE, familyBusinessInheritance: { ...FB, fbRateBasis: { kind: "corporate_business_assets", totalAssets: 0, nonBusinessAssets: 0 } } },
      "familyBusinessInheritance",
      /총자산가액을 입력/,
    );
  });
  it("법정량 분자 > 분모 — 사업무관자산이 총자산가액보다 큼", async () => {
    await expectRejected(
      { ...SINGLE, familyBusinessInheritance: { ...FB, fbRateBasis: { ...CORP_08, nonBusinessAssets: 6_000_000_000 } } },
      "familyBusinessInheritance",
      /사업무관자산가액이 법인 총자산가액보다/,
    );
  });
  it("알 수 없는 법정량 kind는 Zod가 막는다(침묵 통과 없음)", async () => {
    const r = await post({ ...SINGLE, familyBusinessInheritance: { ...FB, fbRateBasis: { kind: "percent", rate: 0.8 } } });
    expect(r.status).toBe(400);
  });
  it("종목 축 + 취득 lot 가업 입력 동시", async () => {
    await expectRejected({ ...split(), familyBusinessInheritance: FB }, "acquisitionLots", /함께 있습니다/);
  });
  it("종목 축 가업 입력 + 분할 입력(lot 미입력) — 조용히 버려지지 않는다", async () => {
    await expectRejected(
      { ...split(without(FB_LOT, "familyBusinessInheritance")), acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01", familyBusinessInheritance: FB },
      "familyBusinessInheritance",
      /취득 lot 단위 입력에서는/,
    );
  });
  it("lot 취득원인이 상속이 아님", async () => {
    await expectRejected(split({ ...FB_LOT, acquisitionCause: "purchase" }), "acquisitionLots", /취득원인이 상속인 lot/);
  });
  it("lot 피상속인 1주당 0 · 법정량 era 무관 형식 오류", async () => {
    await expectRejected(split({ ...FB_LOT, familyBusinessInheritance: { ...FB, decedentAcquisitionPricePerShare: 0 } }), "acquisitionLots", /피상속인의 1주당/);
    await expectRejected(
      split({ ...FB_LOT, familyBusinessInheritance: { ...FB, fbRateBasis: { kind: "corporate_business_assets", totalAssets: 0, nonBusinessAssets: 0 } } }),
      "acquisitionLots",
      /총자산가액을 입력/,
    );
  });
  it("다종목 — 한 종목이 상속 외 원인이면 items[]도 같은 400", async () => {
    const r = await post({ items: [PURCHASE_ITEM, { ...SINGLE, acquisitionCause: "purchase" }] });
    expect(r.status).toBe(400);
    expect(messages(r.json).join("\n")).toMatch(/취득원인이 상속인 주식/);
  });
});

describe("W-5 매도 lot 배정에 의존하는 검사 — 정적으로 못 보는 것은 엔진 throw의 HTTP 상태를 확인", () => {
  // 가업 lot(신 ③2호 법정량) 1개 1만 주를 두 매도에 FIFO로 나눠 판다 — 첫 매도는 2026-02-20(구 ③ 시대)
  const twoSales = [
    { id: "t1", transferDate: "2026-02-20", shareCount: 5_000, perShareTransferPrice: 80_000 },
    { id: "t2", transferDate: "2026-06-01", shareCount: 5_000, perShareTransferPrice: 80_000 },
  ];
  it("가업 lot 법정량 kind와 배정된 매도의 양도일 시대가 다르면 — 계산되지 않고 사유가 돌아온다", async () => {
    const r = await post(split(FB_LOT, twoSales));
    // 엔진 입력 오류는 TaxCalculationError(INVALID_INPUT) → route 422(종전 catch-all 500을 바로잡음).
    expect(r.status).toBe(422);
    expect(String(r.json.error)).toContain("적용률 법정량 종류가 맞지 않습니다");
    expect(r.json.result).toBeUndefined();
  });

  it("같은 lot이 한 시대의 매도에만 배정되면(전량 02-20, 구 ③ 법정량) 정상 계산 — 시대 불일치는 배정 결과에만 의존한다", async () => {
    const r = await post(
      split({ ...FB_LOT, familyBusinessInheritance: { ...FB, fbRateBasis: DEDUCTION_08 } }, [
        { id: "t1", transferDate: "2026-02-20", shareCount: 10_000, perShareTransferPrice: 80_000 },
      ]),
    );
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.result.acquisitionPrice).toBe(140_000_000);
  });
});
