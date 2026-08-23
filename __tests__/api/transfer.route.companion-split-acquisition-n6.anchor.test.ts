/**
 * anchor: 함께양도 **컴패니언 자산의 토지·건물 분리취득**(소득령 §166⑥·§168②) — N-6(A), 2026-08-23
 *
 * ## 종전 결함 — 「⑤는 있는데 ⑫가 없다」
 *
 * | 층 | 상태(종전) |
 * |---|---|
 * | ⑤ UI | **렌더된다** — `CompanionAcqPurchaseBlock`의 `isSplitable`은 `assetKind`만 보고 자산 인덱스를 보지 않는다 |
 * | ④ 변환 | `buildAssetPayload`가 **공용 빌더 `buildSplitPayload`를 부르지 않았다** |
 * | ⑫ Zod | `companionAssetSchema`에 분리취득 필드가 **0건** |
 * | ⑭ 매핑 | 손으로 쓴 `CompanionRawAsset`에 필드 없음 |
 *
 * ⇒ 컴패니언 카드에서 「토지·건물 취득일 다름」을 켜고 파트 값을 채워도 **세액이 1원도 움직이지
 * 않았다**. Zod는 모르는 키를 **조용히 떼어내므로**(TypeScript가 못 잡는 층) 400도 나지 않는다.
 *
 * ## 무엇을 고쳤나 — 목록을 두 벌로 만들지 않는다
 *
 * ④는 **처음부터 자산-무관 함수**였다(`buildSplitPayload(asset: AssetForm, …)`) — 컴패니언도
 * 그대로 부른다. ⑫는 `splitAcquisitionShape` 한 벌을 단건·컴패니언이 **spread**하고,
 * ⑭의 타입은 그 shape에서 **파생**(`Pick<z.infer<…>, keyof typeof splitAcquisitionShape>`)해
 * ⑫에 필드가 늘면 자동으로 따라오게 했다. 손으로 유지하면 F13·F15와 같은 침묵 strip이 재발한다.
 *
 * ## 픽스처
 *
 * primary 토지(양도 6억) + 컴패니언 상가건물. 컴패니언은 **건물 2015-01-01 · 토지 2005-01-01**
 * 취득으로 파트별 취득가액(1억 / 5천만)이 실재한다. 총계약 10억 · 안분 키 기준시가 4억:4억.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const BASE = {
  propertyType: "land" as const,
  transferDate: "2024-03-01",
  transferPrice: 600_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionPrice: 200_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  standardPriceAtTransferForApportion: 400_000_000,
  totalSalePrice: 1_000_000_000,
};

/** 컴패니언 = 상가건물 · 토지(2005)와 건물(2015)을 **별개 취득**. */
const SPLIT_FIELDS = {
  landAcquisitionDate: "2005-01-01",
  isSeparateAcquisition: true,
  landAcqMode: "actual" as const,
  buildingAcqMode: "actual" as const,
  landAcquisitionPrice: 100_000_000,
  buildingAcquisitionPrice: 50_000_000,
  landStandardPriceAtTransfer: 250_000_000,
  buildingStandardPriceAtTransfer: 150_000_000,
};

function companion(over: Record<string, unknown> = {}) {
  return [
    {
      assetId: "c1",
      assetLabel: "상가건물",
      assetKind: "building" as const,
      standardPriceAtTransferForApportion: 400_000_000,
      standardPriceAtTransfer: 400_000_000,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: 150_000_000,
      reductions: [] as unknown[],
      isOneHousehold: false,
      ...SPLIT_FIELDS,
      ...over,
    },
  ];
}

interface Card {
  propertyId: string;
  transferGain: number;
  longTermHoldingDeduction: number;
}
interface Agg {
  determinedTax: number;
  properties: Card[];
}

async function post(over: Record<string, unknown> = {}): Promise<Agg> {
  const res = await POST(req({ ...BASE, companionAssets: companion(over) }));
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}

const c1 = (a: Agg) => a.properties.find((p) => p.propertyId === "c1")!;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("N-6(A) · 컴패니언 분리취득", () => {
  it("N6-01: 🔴 분리취득 축이 **세액을 움직인다** (종전 Δ 0)", async () => {
    const split = await post();
    const noSplit = await post({
      landAcquisitionDate: undefined,
      isSeparateAcquisition: undefined,
    });

    expect(split.determinedTax).toBe(164_060_000);
    expect(noSplit.determinedTax).toBe(174_270_000);
    expect(noSplit.determinedTax - split.determinedTax).toBe(10_210_000);
  });

  it("N6-02: 장기보유특별공제가 **파트별 취득일**로 계산된다 (§95④)", async () => {
    const split = await post();
    const noSplit = await post({
      landAcquisitionDate: undefined,
      isSeparateAcquisition: undefined,
    });

    // 토지 2005 취득분이 더 오래 보유돼 공제가 커진다(분리 전에는 건물 2015 단일 기산).
    expect(c1(split).longTermHoldingDeduction).toBe(88_500_000);
    expect(c1(noSplit).longTermHoldingDeduction).toBe(63_000_000);
  });

  it("N6-03: 🔑 **단건과 같은 값**을 낸다 (dual-truth 없음)", async () => {
    const split = await post();
    // 같은 자산을 primary로 계산 — 양도차익·장특공제가 일치해야 한다.
    const res = await POST(
      req({
        ...BASE,
        propertyType: "building",
        transferPrice: 500_000_000,
        acquisitionDate: "2015-01-01",
        acquisitionPrice: 150_000_000,
        standardPriceAtTransfer: 400_000_000,
        ...SPLIT_FIELDS,
        companionAssets: undefined,
        totalSalePrice: undefined,
        standardPriceAtTransferForApportion: undefined,
      }),
    );
    const single = (await res.json()) as {
      data?: { result: { transferGain: number; longTermHoldingDeduction: number; splitDetail?: unknown } };
    };
    expect(res.status).toBe(200);

    expect(single.data!.result.splitDetail).toBeDefined();
    expect(c1(split).transferGain).toBe(single.data!.result.transferGain);
    expect(c1(split).longTermHoldingDeduction).toBe(single.data!.result.longTermHoldingDeduction);
  });

  it("N6-04: 🔴 파트 취득가액이 **Zod를 통과해 엔진까지** 도달한다 (⑫ strip 봉인)", async () => {
    const base = await post();
    // 파트 값만 바꾼다 — ⑫에서 strip되면 이 값이 안 바뀐다.
    const mutated = await post({ landAcquisitionPrice: 1, buildingAcquisitionPrice: 1 });
    expect(mutated.determinedTax).not.toBe(base.determinedTax);
    expect(c1(mutated).transferGain).toBeGreaterThan(c1(base).transferGain);
  });

  it("N6-06: 🔴 **④가 컴패니언에도 분리취득을 싣는다** (payload를 손으로 적으면 못 잡는다)", () => {
    /**
     * ⚠️ 위 테스트들은 route에 body를 **직접** 넣으므로 ④를 태우지 않는다 — 실제로
     *    `buildSplitPayload` 호출을 지워도 전부 통과했다(mutation M7 실측 5/5 green).
     *    ④는 여기서 폼 → payload 변환을 직접 불러 잡는다.
     */
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "building" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2005-01-01",
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: "100,000,000",
      buildingAcquisitionPrice: "50,000,000",
    };
    const payload = buildAssetPayload(asset, "apportioned", "2024-03-01") as Record<
      string,
      unknown
    >;

    expect(payload.landAcquisitionDate).toBe("2005-01-01");
    expect(payload.isSeparateAcquisition).toBe(true);
    expect(payload.landAcquisitionPrice).toBe(100_000_000);
    expect(payload.buildingAcquisitionPrice).toBe(50_000_000);
  });

  it("N6-07: ④ 대조군 — 토글이 꺼져 있으면 분리 필드를 싣지 않는다", () => {
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "building" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
    };
    const payload = buildAssetPayload(asset, "apportioned", "2024-03-01") as Record<
      string,
      unknown
    >;
    expect(payload.landAcquisitionDate).toBeUndefined();
    expect(payload.isSeparateAcquisition).toBeUndefined();
  });

  it("N6-05: 대조군 — 분리취득을 안 켜면 종전 값 그대로다 (회귀 0)", async () => {
    const noSplit = await post({
      landAcquisitionDate: undefined,
      isSeparateAcquisition: undefined,
      landAcqMode: undefined,
      buildingAcqMode: undefined,
      landAcquisitionPrice: undefined,
      buildingAcquisitionPrice: undefined,
      landStandardPriceAtTransfer: undefined,
      buildingStandardPriceAtTransfer: undefined,
    });
    expect(noSplit.determinedTax).toBe(174_270_000);
    expect(c1(noSplit).longTermHoldingDeduction).toBe(63_000_000);
  });
});
