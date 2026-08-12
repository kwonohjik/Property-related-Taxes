/**
 * 주식 부담부증여 양도소득세 — 응답 키(D-F) · §103①2호 기본공제 그룹 1회(D-E) anchor
 *
 * 계획서: docs/02-design/features/stock-102-2-loss-offset-and-103-deduction-order.plan.md §3.5
 *
 * ── 두 결함이 겹쳐 있다 ────────────────────────────────────────────────
 * **D-F (응답 키)** — `/api/calc/stock-transfer` 단건 라우트는 `{ result }`를 반환하는데
 *   `callGiftStockBurdenedTransferAPI`가 `json.data`를 읽어 **항상 throw**했고,
 *   `GiftTaxForm`의 빈 `catch`가 그것을 삼켜 **주식 부담부증여 양도세가 화면에 아예 뜨지
 *   않았다**. 실측: 라우트 응답 `hasData:false / hasResult:true`.
 *
 * **D-E (기본공제 중복)** — D-F를 고치면 곧바로 활성화된다. 종목마다 단건 API를 호출하면
 *   §103①2호 주식 그룹 기본공제 250만원을 **각각** 받아 그룹 연 1회 한도를 넘는다.
 *   실측: 단건 2회 = 3,000,000 vs aggregate = 3,500,000 (**500,000 과소**).
 *
 * 법령:
 *   §103①2호 — 「제94조제1항제3호에 따른 소득」에 **해당 과세기간의** 양도소득금액에서 연 250만원.
 *   별지 제84호서식 작성요령 7번 — 「주식은 ’20.1.1. 이후 양도분부터 국내ㆍ국외주식
 *     양도소득금액 통산액에서 **연 250만원**을 공제」.
 *
 * 하네스: `global.fetch`를 실제 Route Handler(POST)로 연결한다. 상대경로 fetch를 브라우저 없이
 *   실제 Zod·`buildEngineInput`·엔진까지 통과시키므로 **응답 키 계약까지** 검증된다.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/calc/stock-transfer/route";
import {
  callGiftStockBurdenedTransferAPI,
  callGiftStockBurdenedTransferAggregateAPI,
} from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

// ── fetch → Route Handler 브리지 ───────────────────────────────────────
const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (!url.includes("/api/calc/stock-transfer")) {
      throw new Error(`예상치 못한 fetch 대상: ${url}`);
    }
    const req = new Request("http://localhost" + url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-bypass-rate-limit": "1" },
      body: init?.body as string,
    });
    return POST(req as never);
  }) as typeof global.fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

// ── 픽스처 ────────────────────────────────────────────────────────────
// 평가액 10억 · 채무인수 1억 → debtRatio 0.1
// 당초취득가 5억 → 안분 5천만 → 1,000주 → 주당 50,000
// 양도가액 = 채무인수액 1억 → 주당 100,000
// ⇒ 종목당 양도차익 50,000,000
const VALUATION = 1_000_000_000;
const DEBT = 100_000_000;
const SHARES = 1_000;

function stockItem(id: string): EstateItem {
  return {
    id,
    name: `종목${id}`,
    category: "listed_stock",
    marketValue: VALUATION,
    listedStockShares: SHARES,
    assumedDebtForGift: DEBT,
    burdenedGiftStockTransferTax: {
      marketType: "kospi",
      acquisitionDate: "2020-03-02",
      acquisitionMode: "actual",
      actualAcquisitionPrice: 500_000_000,
      isMajorShareholder: true,
    },
  } as unknown as EstateItem;
}

// 빌더가 form에서 쓰는 것은 giftDate 하나뿐이다(`buildGiftStockBurdenedTransferBody`).
const FORM = { giftDate: "2024-06-01" } as never;

// 종목당 과세표준 = 50,000,000 − 기본공제. 대주주·비단기 → §104①11호가목2) 20%.
const GAIN_PER_ITEM = 50_000_000;
const BASIC_DEDUCTION = 2_500_000;

describe("주식 부담부증여 — 응답 키(D-F)", () => {
  it("A-1: 단건 호출이 결과를 반환한다 (라우트가 주는 키를 읽어야 한다)", async () => {
    const r = await callGiftStockBurdenedTransferAPI(stockItem("1"), FORM);
    expect(r.transferIncome).toBe(GAIN_PER_ITEM);
  });
});

describe("주식 부담부증여 — §103①2호 그룹 1회(D-E)", () => {
  it("A-2: 2종목 — 기본공제 합계는 2,500,000 (250만 × 2 아님)", async () => {
    const results = await callGiftStockBurdenedTransferAggregateAPI(
      [stockItem("1"), stockItem("2")],
      FORM,
    );
    const sum = results.reduce((s, r) => s + r.basicDeduction, 0);
    expect(sum).toBe(BASIC_DEDUCTION);
  });

  it("A-3: 2종목 — 산출세액 합계 (20% × (1억 − 250만))", async () => {
    const results = await callGiftStockBurdenedTransferAggregateAPI(
      [stockItem("1"), stockItem("2")],
      FORM,
    );
    const total = results.reduce((s, r) => s + r.calculatedTax, 0);
    // 과세표준 100,000,000 − 2,500,000 = 97,500,000 → 20% = 19,500,000
    expect(total).toBe(19_500_000);
  });

  it("A-4 대조군: 1종목이면 기본공제 2,500,000 그대로", async () => {
    const results = await callGiftStockBurdenedTransferAggregateAPI([stockItem("1")], FORM);
    expect(results.map((r) => r.basicDeduction)).toEqual([BASIC_DEDUCTION]);
  });

  it("A-5: 1종목 aggregate 결과 == 단건 결과 (경로 통합 정당화)", async () => {
    const [agg] = await callGiftStockBurdenedTransferAggregateAPI([stockItem("1")], FORM);
    const single = await callGiftStockBurdenedTransferAPI(stockItem("1"), FORM);
    expect({
      transferIncome: agg.transferIncome,
      taxBase: agg.taxBase,
      calculatedTax: agg.calculatedTax,
      finalTax: agg.finalTax,
    }).toEqual({
      transferIncome: single.transferIncome,
      taxBase: single.taxBase,
      calculatedTax: single.calculatedTax,
      finalTax: single.finalTax,
    });
  });

  it("A-6: 종목 순서·개수가 보존된다", async () => {
    // 채무인수액을 서로 다르게 두어 종목별 양도차익이 구별되게 한다
    // (`stockName`은 국외주식 전용 필드라 국내 결과에는 실리지 않는다 — 값으로 식별).
    // 평가액 10억 고정 · 당초취득가 5억 → 차익 = 채무 − floor(5억 × 채무/10억)
    const items = [
      { ...stockItem("1"), assumedDebtForGift: 100_000_000 },
      { ...stockItem("2"), assumedDebtForGift: 200_000_000 },
      { ...stockItem("3"), assumedDebtForGift: 300_000_000 },
    ] as EstateItem[];
    const results = await callGiftStockBurdenedTransferAggregateAPI(items, FORM);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.transferIncome)).toEqual([
      50_000_000, // 1억 − 5천만
      100_000_000, // 2억 − 1억
      150_000_000, // 3억 − 1.5억
    ]);
  });
});
