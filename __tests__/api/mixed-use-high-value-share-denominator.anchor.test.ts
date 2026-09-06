/**
 * anchor — 겸용주택 **공유지분** 양도의 §89①3호 고가주택(12억) 분모.
 *
 * ## 🔴 살아 있던 오산
 *
 * 겸용 엔진은 12억 판정·안분 분모로 `apportionment.housingTransferPrice`를 썼는데, 그 값은
 * **내 지분분**이다. 지분 60%면 문턱이 `1/0.6`만큼 올라가 물건 전체 주택분 16.7억이
 * 「10억 ≤ 12억」으로 판정돼 **전액 비과세**가 됐다.
 *
 * ⚠️ 도달 경로가 실제로 있었다 — 「나머지 지분은 타인 소유」(축 A 선언)를 고르면 ⑧을 통과한다.
 *
 * ## 법령
 *
 * [「소득세법 시행령」 제156조 제1항] "1주택 및 이에 딸린 토지의 일부를 양도하거나 **일부가
 * 타인 소유인 경우**로서 실지거래가액 합계액에 양도하는 부분(**타인 소유부분을 포함한다**)의
 * 면적이 전체 주택면적에서 차지하는 비율을 나누어 계산한 금액이 12억원을 초과하는 경우에는
 * 고가주택으로 본다."
 * [같은 조 제2항] 겸용주택은 "제154조제3항 본문에 따라 **주택으로 보는 부분**(이에 부수되는
 * 토지를 포함한다)에 해당하는 실지거래가액을 포함한다."
 *
 * ⇒ 분모 = **물건 전체 양도가액 × 주택 기준시가 비율**.
 *
 * 일반 주택 경로는 `TransferTaxInput.totalPropertyTransferPrice`로 이미 같은 규약을 쓰고 있었다
 * (`transfer-tax-helpers.ts` `calcOneHouseProration`) — 겸용만 그 축이 없었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 주택 비중이 커 **물건 전체 주택분이 12억을 넘고**, 60% 지분분은 12억 이하가 되는 픽스처. */
const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "500000000",
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "300",
  // 부수토지가 정착면적의 3배를 넘어 배율이 세액을 가른다 ⇒ 용도지역 필수 (2026-09-06 · UI 리뷰).
  // 이 anchor의 주제(12억 분모)와 무관한 축이라 값만 채운다.
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferCommercialBuildingPrice: "200000000",
  mixedTransferLandPricePerSqm: "1000000",
  mixedAcqHousingPrice: "400000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqLandPricePerSqm: "300000",
};

function form(assetOver: Record<string, unknown> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), ...MIXED, ...assetOver }],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "2000000000",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "120",
  } as unknown as TransferFormData;
}

type MixedResult = {
  apportionment?: { housingTransferPrice?: number; wholeHousingTransferPrice?: number };
  housingPart?: { isExempt?: boolean };
  total?: { transferTax?: number };
};

async function run(f: TransferFormData) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  const json = (await res.json()) as { data?: { result?: MixedResult } };
  return { status: res.status, result: json.data?.result };
}

/** 축 A — 나머지 지분이 타인 소유(영 §156① "일부가 타인 소유인 경우"). */
const SHARE_60 = {
  ownershipNumerator: "60",
  ownershipDenominator: "100",
  ownershipRemainderThirdParty: "yes",
};

describe("겸용 공유지분 × §89①3호 12억 분모 (영 §156①·②)", () => {
  it("HV-1 단독 소유(100%) — 물건 전체 주택분이 12억 초과라 과세", async () => {
    const r = await run(form());
    expect(r.status).toBe(200);
    expect(r.result?.apportionment?.housingTransferPrice).toBe(1_666_666_666);
    // 단독 소유면 분모 축이 아예 생기지 않는다(= 양도가액이 곧 분모).
    expect(r.result?.apportionment?.wholeHousingTransferPrice).toBeUndefined();
    expect(r.result?.housingPart?.isExempt).toBe(false);
    expect(r.result?.total?.transferTax).toBe(153_322_963);
  });

  it("HV-2 🔴 60% 지분 — 분모가 **물건 전체 주택분**이라 계속 과세된다", async () => {
    const r = await run(form(SHARE_60));
    // ⑧이 막지 않는다 — 축 A 선언이 게이트를 통과시킨다(도달 가능한 경로였다).
    expect(collectStepIssues(0, form(SHARE_60)).map((i) => i.message)).toEqual([]);
    expect(r.status).toBe(200);
    // 내 지분분은 10억(12억 이하)이지만…
    expect(r.result?.apportionment?.housingTransferPrice).toBe(1_000_000_000);
    // …판정 분모는 물건 전체 주택분이다.
    expect(r.result?.apportionment?.wholeHousingTransferPrice).toBe(1_666_666_666);
    expect(r.result?.housingPart?.isExempt).toBe(false);
    /**
     * 🔑 **구별력** — 종전(지분분 분모)에서는 `isExempt: true`가 되어 주택분이 통째로 빠지고
     *    세액이 **17,983,739**(상가분만)였다. 그 차이를 상수로 고정한다.
     *
     * 🔄 **58,057,815 → 81,859,889 (2026-09-04, 같은 날 후속).** 이 축을 조사하다 **두 번째
     *    오산**을 찾았다 — 취득가액·자본적지출·양도비 같은 **절대금액이 100% 값 그대로**
     *    실려 지분 60%에서 과대 계상됐다(차익 과소 ⇒ 세액 과소).
     *    `buildMixedUsePayload`가 그 성분만 지분 스케일하도록 고쳐 값이 올라갔다
     *    (취득가액 5억 → 3억). 기준시가·면적은 물건 전체 유지다.
     */
    expect(r.result?.total?.transferTax).toBe(81_859_889);
  });

  it("HV-3 대조군 — 물건 전체 주택분이 12억 **이하**면 지분이어도 비과세다", async () => {
    /** 주택 기준시가를 낮춰 물건 전체 주택분을 12억 미만으로 만든다(안분 비율이 내려간다). */
    const low = {
      ...SHARE_60,
      mixedTransferHousingPrice: "600000000",
      mixedTransferCommercialBuildingPrice: "1000000000",
    };
    const r = await run(form(low));
    expect(r.result?.apportionment?.wholeHousingTransferPrice).toBeLessThanOrEqual(1_200_000_000);
    expect(r.result?.housingPart?.isExempt).toBe(true);
  });
});
