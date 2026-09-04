/**
 * anchor — 겸용 **PHD 4부분 안분(Case A) × 공유지분** (2026-09-04).
 *
 * ## 무엇이 미결이었나
 *
 * #1469에서 겸용의 절대금액을 지분 스케일할 때 `totalTransferPriceForFourPart`도 함께
 * 스케일했지만, **PHD 픽스처로 실측하지 못해** 「판정 근거는 세웠으나 미검증」으로 남았다.
 * 이 파일이 그 항목을 닫는다.
 *
 * ## 왜 스케일이 맞는가 (엔진 실측)
 *
 * 4부분 분기는 `totalTransferPriceForFourPart`(= `totalTransfer4`)에서 **모든 값을 파생**한다
 * (`transfer-tax-pre-housing-disclosure.ts`): 양도가액 4분할이 그 총액을 나눠 갖고,
 * 환산취득가 총액도 `floor(totalTransfer4 × P_A_est / H34)`이다. 기준시가 3시점은
 * **비율 산정에만** 쓰여 물건 전체(100%)로 유지되고, 개산공제는 `ownershipRatio`가 따로 줄인다.
 *
 * ⇒ 지분 양도에서 이 값이 100%로 남으면 **지분인데 물건 전체 차익**이 나온다(실측 아래).
 *
 * ## 🔴 함께 발견 — 겸용 × 환산 컴패니언이 **안내 없는 400**이었다
 *
 * ⑩ `addCompanionAcquisitionCauseRefines`가 컴패니언-수준 `standardPriceAtAcquisition`을
 * 요구하는데, 겸용은 그 값을 **자기 `mixedUse` 서브객체**(3시점 기준시가)가 갖고 ⑧도
 * 요구하지 않는다 ⇒ **⑧ 통과 ↔ ⑩ 400**. 일반건물·부담부증여가 같은 이유로 이미 예외였고
 * 겸용만 빠져 있었다. #1466·#1467의 픽스처가 전부 **실가 모드**라 드러나지 않았다.
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

/** Case A — 최초공시(2015) < 용도변경(2018) + PHD ⇒ 4부분 안분이 켜진다. */
const CASE_A = {
  assetKind: "housing",
  isMixedUseHouse: true,
  hasPartialUsageChange: true,
  partialChangeDirection: "house_to_commercial",
  partialChangeDate: "2018-06-01",
  useEstimatedAcquisition: true,
  acquisitionDate: "2010-06-15",
  residentialFloorArea: "120",
  nonResidentialFloorArea: "80",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "872000000",
  phdBuildingStdPriceAtAcq: "100000000",
  phdBuildingStdPriceAtFirst: "150000000",
  phdBuildingStdPriceAtTransfer: "200000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  phdCommercialBuildingStdPriceAtFirst: "60000000",
  mixedTransferCommercialBuildingPrice: "70000000",
  phdLandPricePerSqmAtAcq: "2000000",
  phdLandPricePerSqmAtFirst: "2500000",
  phdLandPricePerSqmAtTransfer: "3000000",
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2015-01-01",
  phdFirstDisclosureHousingPrice: "300000000",
};

function form(assets: Record<string, unknown>[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets,
    transferDate: "2025-05-01",
    filingDate: "2025-07-31",
    contractTotalPrice: "1500000000",
    householdHousingCount: "2",
  } as unknown as TransferFormData;
}
const A = (i: number, o: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(i), ...CASE_A, ...o });

type Body = { mixedUse?: { preHousingDisclosure?: { totalTransferPriceForFourPart?: number } } };
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
  return {
    body: captured as Body,
    status: res.status,
    json: (await res.json()) as {
      data?: {
        mode?: string;
        result?: {
          total?: { transferTax?: number };
          housingPart?: { transferGain?: number; phdResult?: { fourPartApportionment?: unknown } };
        };
        aggregated?: { totalTax?: number };
      };
    },
  };
}

const SHARE_60 = {
  ownershipNumerator: "60",
  ownershipDenominator: "100",
  ownershipRemainderThirdParty: "yes",
};

describe("겸용 PHD 4부분 안분 × 공유지분", () => {
  it("P4-1 단독 100% — 4부분이 켜지고 분모가 총계약가 그대로다", async () => {
    const r = await run(form([A(1)]));
    expect(r.status).toBe(200);
    expect(r.body.mixedUse?.preHousingDisclosure?.totalTransferPriceForFourPart).toBe(
      1_500_000_000,
    );
    // 🔑 4부분이 실제로 켜져야 이 파일의 나머지 단언이 의미를 갖는다.
    expect(r.json.data?.result?.housingPart?.phdResult?.fourPartApportionment).toBeDefined();
    expect(r.json.data?.result?.housingPart?.transferGain).toBe(919_976_978);
    expect(r.json.data?.result?.total?.transferTax).toBe(325_318_906);
  });

  it("P4-2 🔑 60% 지분 — 4부분 분모가 지분분이라 차익이 지분율에 비례한다", async () => {
    const full = await run(form([A(1)]));
    const share = await run(form([A(1, SHARE_60)]));
    expect(share.status).toBe(200);
    expect(share.body.mixedUse?.preHousingDisclosure?.totalTransferPriceForFourPart).toBe(
      900_000_000,
    );
    expect(share.json.data?.result?.housingPart?.phdResult?.fourPartApportionment).toBeDefined();

    const fullGain = full.json.data?.result?.housingPart?.transferGain ?? 0;
    const shareGain = share.json.data?.result?.housingPart?.transferGain ?? 0;
    /**
     * 🔑 **차익이 지분율에 비례한다** — 스케일이 옳다는 직접 근거다.
     * ⚠️ 1원 허용: 4부분은 성분별로 floor하므로 `합(floor(성분×0.6))`이
     *    `floor(합×0.6)`과 최대 몇 원 어긋난다(P4-3 주석 참조). 실측 551,986,187 vs 551,986,186.
     */
    expect(Math.abs(shareGain - fullGain * 0.6)).toBeLessThanOrEqual(1);
    expect(shareGain).toBe(551_986_187);

    /**
     * 🔑 **구별력** — 분모를 스케일하지 않으면 60% 지분인데 **물건 전체 차익**이 나온다:
     *    차익 921,700,921 · 세액 326,162,218 (**145,766,874 과대**).
     */
    expect(share.json.data?.result?.total?.transferTax).toBe(180_395_344);
  });

  it("P4-3 축 B 60/40 합계 ≈ 단건 100% (4부분 성분별 독립 floor만큼 차)", async () => {
    const single = await run(form([A(1)]));
    const axisB = await run(
      form([
        A(1, { ownershipNumerator: "60", ownershipDenominator: "100" }),
        A(2, { ownershipNumerator: "40", ownershipDenominator: "100" }),
      ]),
    );
    expect(axisB.status).toBe(200);
    expect(axisB.json.data?.mode).toBe("bundled");
    const expected = Math.floor((single.json.data?.result?.total?.transferTax ?? 0) * 1.1);
    const actual = axisB.json.data?.aggregated?.totalTax ?? 0;
    /**
     * ⚠️ **완전 일치가 아니다 — 그 이유가 구조에 있다.** 4부분 안분은 개산공제를 「성분별 독립
     *    floor(잔액 흡수하지 않음)」로 계산한다(`transfer-tax-pre-housing-disclosure.ts` 주석).
     *    지분 카드마다 그 floor가 **다시** 걸리므로 `floor(0.6x) + floor(0.4x) ≤ floor(x)`가
     *    성분 수만큼 누적된다. 비-PHD 겸용 축 B는 **완전 일치**한다(그쪽은 이 floor가 없다).
     *
     * 🔑 **구별력** — 분모를 스케일하지 않으면 각 카드가 물건 전체 4분할을 계산해
     *    **782,727,113**(단건의 2.2배)이 된다. 아래 허용치로는 절대 통과할 수 없다.
     */
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(10);
    expect(actual).toBe(357_850_801);
  });

  it("P4-4 🔴 겸용 × 환산 컴패니언이 **400이 아니다** (⑧ 통과 ↔ ⑩ 400 해소)", async () => {
    const bundled = form([
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        useEstimatedAcquisition: false,
        acquisitionDate: "2015-03-01",
        fixedAcquisitionPrice: "300000000",
        actualSalePrice: "700000000",
        standardPriceAtTransfer: "500000000",
        standardPriceAtAcq: "250000000",
      },
      A(2, { actualSalePrice: "800000000", standardPriceAtTransfer: "500000000" }),
    ]);
    // ⑧이 통과시킨다 — 그러면 ⑩도 통과해야 한다(모순 금지).
    expect(collectStepIssues(0, bundled).map((i) => i.message)).toEqual([]);
    const r = await run(bundled);
    expect(r.status).toBe(200);
    expect(r.json.data?.mode).toBe("bundled");
  });
});
