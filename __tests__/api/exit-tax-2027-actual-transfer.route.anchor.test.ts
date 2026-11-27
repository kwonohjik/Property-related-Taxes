/**
 * 국외전출세 2027.1.1. 개정 — PR-7a: 종목별 실제 양도 route 배관 anchor (⑨⑩⑫⑭)
 *
 * 수치는 엔진 anchor(`exit-tax-2027-actual-transfer.anchor.test.ts`)와 같은 손계산 시료다.
 *   F1 국외주식 1,000주 · 취득 480,000/주 · 출국일 시가 1,400,000/주 · 외화 1,000 × 환율 1,200 = 1,200,000/주 전부 양도
 *   → 산출세액 183,500,000 · 조정공제 40,000,000 · 경정 후 143,500,000 (K-16)
 *
 * · body의 `holdings[].actualTransfer`가 Zod에서 벗겨지지 않고 엔진에 도달한다(⑫)
 * · 안쪽 `transferDate`(문자열)가 Date로 변환돼 엔진 비교에 쓰인다(⑭) — 출국일보다 앞이면 400
 * · 엔진 입력 결함(양도 주수 초과·전역 입력 혼용·V-14 차단)은 400 + 경로 (⑫ refine = 엔진 단일 소스)
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
const issuePaths = (json: { issues?: { path: (string | number)[] }[] }) =>
  (json.issues ?? []).map((i) => i.path.join("."));

const SOLD = { shareCount: 1_000, priceForeign: 1_000, exchangeRate: 1_200 };

const F1 = {
  id: "f1",
  stockName: "F1 국외주식",
  marketType: "foreign_stock",
  isListedForeignCorp: true,
  shareCount: 1_000,
  acquisitionDate: "2018-01-01",
  perShareAcquisitionPrice: 480_000,
  departureDayValuationMode: "market_price",
  departureDayMarketPrice: 1_400_000,
};

function body(holdings: unknown[], over: Record<string, unknown> = {}) {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: "2027-01-01",
    isMajorShareholder: true,
    holdings,
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    ...over,
  };
}

describe("PR-7a · 종목별 실제 양도 — body → Zod → route → 엔진", () => {
  it("K-16 F1 전부 양도 → 조정공제 40,000,000 · 경정 후 143,500,000", async () => {
    const { status, json } = await post(body([{ ...F1, actualTransfer: SOLD }]));
    expect(status).toBe(200);
    expect(json.result.incomeTax).toBe(183_500_000);
    expect(json.result.adjustmentDeduction).toBe(40_000_000);
    expect(json.result.finalTaxAfterAdjustment).toBe(143_500_000);
    expect(json.result.holdingDetails[0].actualTransfer.actualTransferValue).toBe(1_200_000_000);
  });

  it("부분 양도 400주 → 조정공제 16,000,000 (양도 주수가 Zod에서 벗겨지지 않는다)", async () => {
    const { status, json } = await post(body([{ ...F1, actualTransfer: { ...SOLD, shareCount: 400 } }]));
    expect(status).toBe(200);
    expect(json.result.adjustmentDeduction).toBe(16_000_000);
  });

  it("외국납부세액이 종목별 필드로 도달한다 (한도 143,500,000)", async () => {
    const { status, json } = await post(
      body([{ ...F1, actualTransfer: { ...SOLD, foreignTaxPaid: 500_000_000 } }]),
    );
    expect(status).toBe(200);
    expect(json.result.foreignTaxCreditApplied).toBe(143_500_000);
  });

  it("문자열 실제 양도일이 출국일보다 앞이면 400 (Date 변환 후 비교) · 경로 actualTransfer.transferDate", async () => {
    const { status, json } = await post(
      body([{ ...F1, actualTransfer: { ...SOLD, transferDate: "2026-12-31" } }]),
    );
    expect(status).toBe(400);
    expect(issuePaths(json).join(" ")).toContain("actualTransfer.transferDate");
  });

  it("출국일과 같은 날 · 이후는 통과", async () => {
    const { status } = await post(body([{ ...F1, actualTransfer: { ...SOLD, transferDate: "2027-03-01" } }]));
    expect(status).toBe(200);
  });

  it("양도 주수 > 보유 주수 → 400 · 경로 actualTransfer.shareCount", async () => {
    const { status, json } = await post(body([{ ...F1, actualTransfer: { ...SOLD, shareCount: 1_001 } }]));
    expect(status).toBe(400);
    expect(issuePaths(json).join(" ")).toContain("actualTransfer.shareCount");
  });

  it("전역 입력 + 종목별 입력 동시 → 400", async () => {
    const { status } = await post(
      body([{ ...F1, actualTransfer: SOLD }], { actualTransferPricePerShare: 1_200_000 }),
    );
    expect(status).toBe(400);
  });

  it("2호 과세 종목 + 전역 입력만 → 400 (종목별 입력 안내)", async () => {
    const { status } = await post(body([F1], { actualTransferPricePerShare: 1_200_000 }));
    expect(status).toBe(400);
  });

  it("V-14 — 외국법인 발행 2호 종목에 원천징수액 → 400", async () => {
    const { status, json } = await post(
      body([{ ...F1, actualTransfer: { ...SOLD, domesticSourceTaxWithheld: 1_000_000 } }]),
    );
    expect(status).toBe(400);
    expect(issuePaths(json).join(" ")).toContain("domesticSourceTaxWithheld");
  });

  it("2026 교재 갑 전역 경로 불변 — 41,875,000", async () => {
    const { status, json } = await post(
      body(
        [
          {
            id: "h1",
            stockName: "H1",
            marketType: "kosdaq",
            shareCount: 10_000,
            acquisitionDate: "2015-01-01",
            perShareAcquisitionPrice: 10_000,
            departureDayValuationMode: "market_price",
            departureDayMarketPrice: 50_000,
          },
        ],
        {
          departureDate: "2026-09-01",
          deferralRequested: true,
          actualTransferDate: "2027-03-01",
          actualTransferPricePerShare: 45_000,
          foreignTaxPaid: 30_000_000,
        },
      ),
    );
    expect(status).toBe(200);
    expect(json.result.finalTaxAfterAdjustment).toBe(41_875_000);
  });
});
