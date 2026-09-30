/**
 * 주식 양도세 — 엔진이 필요로 하는데 ⑫가 비워 두게 두던 값 (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 비우면 400이 아니라 200 + 다른 세액이었다(엔진이 0으로 읽는다). ⑧은 모두 이미 요구한다.
 * - B3·B4 양도가액(1주당·교환) → 양도가액 0 → 세액 0
 * - B1·B2 취득가액(1주당·합계) → 취득가액 0 → 세액 증가
 * - B7 동일 사업연도 토글의 전전사업연도 평가 → 소칙 §81④ 보정 누락
 * - B19 국내 · B20 국외(화면 도달) 미납세액만 있고 납부기한 없음 → 납부지연가산세 0
 * - B22 국외 외국납부세액 환율 → 양도일 환율로 대신
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
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";

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
async function expectRejected(body: unknown, path: string) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(paths(r.json)).toContain(path);
}
async function expectFinalTax(body: unknown, tax: number) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  expect(r.json.result.finalTax).toBe(tax);
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

const BASE = {
  marketType: "unlisted",
  isMajorShareholder: true,
  selfShareRatio: 0.6,
  selfMarketCap: 2e9,
  isLargestShareholderGroup: false,
  combinedShareRatio: 0,
  combinedMarketCap: 0,
  priorYearEndDate: "2024-12-31",
  isQualifyingBlockShareholder: false,
  isHeavyRealEstateForRate: false,
  isHeavyRealEstateForValuation: false,
  isSmallMediumEnterprise: false,
  isMidsizeEnterprise: false,
  isListedSmallShareholder: false,
  isVentureCompany: false,
  isKOTCTrading: false,
  acquisitionDate: "2020-01-10",
  transferDate: "2025-07-01",
  shareCount: 1200,
  totalIssuedShares: 1000000,
  acquisitionCause: "purchase",
  transferPriceMode: "actual",
  transferActualInputMode: "per_share",
  perShareTransferPrice: 18000,
  acquisitionMode: "actual",
  perShareAcquisitionPrice: 10000,
  acquiredBeforeListing: false,
  tradingHaltAtTransfer: false,
  bookLost: false,
  expenseMode: "actual",
  filingType: "preliminary",
  filingDate: "2025-08-31",
  isElectronicFiling: false,
  filingViolation: "none",
  isFraudulent: false,
  isInternationalTransaction: false,
  realEstateGroupBasicDeductionUsed: 0,
};
const UNLISTED_EST = {
  ...without(BASE, "perShareAcquisitionPrice"),
  acquisitionMode: "estimated",
  expenseMode: "estimated",
  transferYearNetIncomePerShare: 20000,
  transferYearNetAssetPerShare: 15000,
  acquisitionYearNetIncomePerShare: 10000,
  acquisitionYearNetAssetPerShare: 8000,
};

describe("국내 — 양도가액·취득가액", () => {
  it("🟢 BASE 1,420,000", async () => {
    await expectFinalTax(BASE, 1_420_000);
  });
  it("B3 🔴 1주당 양도가액 없음 → 400 (종전 세액 0)", async () => {
    await expectRejected(without(BASE, "perShareTransferPrice"), "perShareTransferPrice");
  });
  it("B4 🔴 교환 양도가액 3항목 모두 없음 → 400 (종전 세액 0)", async () => {
    const ex = { ...without(BASE, "perShareTransferPrice", "transferActualInputMode"), transferPriceMode: "exchange" };
    expect((await post({ ...ex, exchangePropertyValue: 21_600_000 })).status).toBe(200);
    await expectRejected(ex, "exchangePropertyValue");
  });
  it("B1 🔴 1주당 취득가액 없음 → 400 (종전 3,820,000) · 0은 허용", async () => {
    await expectRejected(without(BASE, "perShareAcquisitionPrice"), "perShareAcquisitionPrice");
    expect((await post({ ...BASE, perShareAcquisitionPrice: 0 })).status).toBe(200);
  });
  it("B2 🔴 취득가액 합계 모드 합계 없음 → 400 · 🟢 있으면 1,420,000", async () => {
    const b = { ...without(BASE, "perShareAcquisitionPrice"), acquisitionActualInputMode: "total" };
    await expectFinalTax({ ...b, acquisitionTotalPrice: 12_000_000 }, 1_420_000);
    await expectRejected(b, "acquisitionTotalPrice");
  });
});

describe("국내 — 비상장 동일 사업연도(소칙 §81④1호)", () => {
  const B7 = {
    ...UNLISTED_EST,
    acquisitionDate: "2025-01-10",
    acquisitionYearNetIncomePerShare: 20000,
    acquisitionYearNetAssetPerShare: 15000,
    unlistedSameBizYearToggle: true,
    prePriorYearNetIncomePerShare: 10000,
    prePriorYearNetAssetPerShare: 8000,
  };
  it("B7 🟢 458,050 / 🔴 전전사업연도 없음 → 400 (종전 보정 누락 0)", async () => {
    await expectFinalTax(B7, 458_050);
    await expectRejected(without(B7, "prePriorYearNetAssetPerShare"), "prePriorYearNetAssetPerShare");
    await expectRejected(without(B7, "prePriorYearNetIncomePerShare"), "prePriorYearNetIncomePerShare");
  });
});

describe("납부지연가산세 — 법정납부기한", () => {
  it("B19 국내 🟢 1,588,620 / 🔴 기한 없음 → 400 (종전 1,562,000 — 가산세 0)", async () => {
    const p = { ...BASE, filingViolation: "under_report", unpaidTax: 1_000_000, paymentDeadline: "2025-08-31", actualPaymentDate: "2025-12-31" };
    await expectFinalTax(p, 1_588_620);
    await expectRejected(without(p, "paymentDeadline"), "paymentDeadline");
  });
});

const FOREIGN = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 10,
  isListedForeignCorp: true,
  stockName: "AAPL",
  countryCode: "US",
  shareCount: 100,
  transferDate: "2025-07-01",
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 200,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1400,
  acquisitionDate: "2020-01-10",
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 100,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1200,
  capitalExpenditureForeign: 0,
  transferCostForeign: 0,
  hasForeignTax: true,
  foreignTaxPaidForeign: 1000,
  foreignTaxCurrencyCode: "USD",
  foreignTaxExchangeRate: 1300,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

describe("국외주식", () => {
  it("B22 🟢 1,400,000 / 🔴 외국납부세액 환율 없음 → 400 (종전 양도일 환율로 1,300,000)", async () => {
    await expectFinalTax(FOREIGN, 1_400_000);
    await expectRejected(without(FOREIGN, "foreignTaxExchangeRate"), "foreignTaxExchangeRate");
  });

  it("B20 🟢 2,996,620 / 🔴 기한 없음 → 400 (종전 2,970,000 — 가산세 0)", async () => {
    const p = {
      ...FOREIGN,
      hasForeignTax: false,
      filingViolation: "under_report",
      unpaidTax: 1_000_000,
      paymentDeadline: "2025-08-31",
      actualPaymentDate: "2025-12-31",
    };
    await expectFinalTax(p, 2_996_620);
    await expectRejected(without(p, "paymentDeadline"), "paymentDeadline");
  });

  it("B20-UI 🔴 ⑧ 국외주식도 미납세액만 있고 기한이 없으면 차단 (화면 도달 — 종전 오류 0건)", () => {
    const f = {
      ...createInitialStockFormData(),
      marketType: "foreign_stock",
      filingViolation: "under_report",
      unpaidTax: "1,000,000",
      paymentDeadline: "",
    } as ReturnType<typeof createInitialStockFormData>;
    expect(validateAllSteps(f).some((e) => e.field === "paymentDeadline" && e.severity === "error")).toBe(true);
    // ④는 기한 없이 미납세액을 싣는다 — ⑧이 막지 않으면 route까지 간다
    const body = buildStockTransferApiBody({ ...f, paymentDeadline: "" });
    expect(body.paymentDeadline).toBeUndefined();
  });
});
