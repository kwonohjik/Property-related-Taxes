/**
 * anchor: **컴패니언(함께 양도) 겸용주택** × §155의3 상생임대 — 전달 경로 (P5-c)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §29.
 *
 * ## 이 파일이 지키는 것 — **④ → 컴패니언 겸용 카드까지의 효과**
 *
 * 판정 메뉴에서 넘어온 폼-전역 사실이 함께 양도한 겸용주택의 세액까지 닿는지를 고정한다.
 * 실측 차이 **121,500,000원**(1,039,935,001 → 918,435,001). ④ 변환(`buildWinWinRentalPayload`)을
 * 지우면 KILLED된다.
 *
 * ## ⚠️ **구별하지 못하는 것을 적어 둔다** — 뮤테이션 실측
 *
 * `mixed-use-part-cards.ts`의 `winWinRentalHouse: g.winWinRentalHouse`를 `undefined`로 바꿔도
 * 이 파일은 **초록이다(SURVIVED)**. 그 값은 겸용 엔진의 `isOneHouseExempt`(→ 12억 안분)에만
 * 쓰이는데, 컴패니언 파트 카드는 `...companionEngine`을 펼쳐 만들어져 **표2도 §154①도
 * 폼-전역 값으로 이미 판정**되기 때문이다. 관측 축을 두 번 옮기고(표2 → 비과세) 픽스처의
 * 배율초과를 없애 주택분을 12억 위로 올려도 카드 `transferPrice`·`transferGain`이 **동일**했다.
 *
 * ⇒ 그 매핑은 **지금 도달하는 효과가 없다**. 그래도 넘기는 이유는 leaf의 해당 필드가
 *   **필수**라 무언가는 반드시 주어야 하고, `undefined`를 박아 두면 「의도적으로 버린 값」이
 *   되기 때문이다. 「막았다」고 주장하지 않는다
 *   (`feedback_mutation_zero_discrimination_is_not_proof`).
 *
 * ## 🔑 도달 조건
 *
 * 표2·비과세 모두 1세대1주택 축이므로 primary를 **토지**로 두어 세대 주택 수를 1로 유지한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { OneHouseJudgmentExtraFields } from "@/lib/stores/one-house-extra-fields.types";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/**
 * ④ → ⑬ → ⑭ 전 구간. 클라이언트 변환이 만든 **진짜 body**를 route에 넣는다 —
 * body를 손으로 적으면 ④가 필드를 빠뜨려도 초록이다.
 */
async function pipeline(form: TransferFormData) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
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
  const json = (await res.json()) as {
    data?: { aggregated?: { determinedTax?: number; properties?: unknown[] } };
  };
  return { status: res.status, body: captured as Record<string, unknown>, json };
}

/** 겸용주택 자산 필드 — 선례(`transfer.route.companion-mixed-use.anchor`)와 같은 형태. */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  // ⚠️ 2017-08-03 **이후** — 그 이전 취득은 §154① 부칙이 거주요건을 이미 면제해 관측 불가.
  acquisitionDate: "2018-06-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  /**
   * 🔴 **배율초과가 없어야 한다.** 600㎡로 두면 초과분이 비사토 카드로 빠져나가 주택분이
   *    8억으로 떨어지고, 그러면 **12억 안분이 애초에 안 걸려** 구별력이 0이 된다(실측:
   *    winWin 유무로 카드 `transferPrice`·`transferGain`이 완전히 동일했다).
   *    정착 50㎡ × 3배 = 150㎡로 맞춘다.
   */
  mixedUseTotalLandArea: "150",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i),
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

/** §155의3① 1~3호 충족 — 판정 메뉴에서 넘어오는 **FLAT 13필드 상자** 형태 그대로. */
const IMPORTED_WIN_WIN: OneHouseJudgmentExtraFields = {
  ...oneHouseJudgmentExtraDefaults,
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-05-01",
  winWinRentalIncreaseRatePct: "5",
  winWinRentalPriorLeaseMonths: "18",
  winWinRentalLeaseMonths: "24",
};

/**
 * primary **토지** + companion **겸용주택**. 세대 주택 수는 1(겸용 1채)로 유지한다.
 */
function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [
      asset(1, { assetKind: "land", standardPriceAtTransfer: "500000000" }),
      asset(2, { ...MIXED_FIELDS, actualSalePrice: "3000000000" }),
    ],
    transferDate: "2026-06-01",
    filingDate: "2026-08-31",
    contractTotalPrice: "3600000000",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "0",
    // 🔴 관측 축 — 조정대상지역 취득이라야 §154① 거주요건이 실제로 걸린다.
    wasRegulatedAtAcquisition: true,
    ...over,
  } as TransferFormData;
}

describe("컴패니언 겸용주택 × §155의3 상생임대", () => {
  /**
   * 🔴 **핵심.** 판정 메뉴에서 넘어온 폼-전역 사실이 **컴패니언 겸용 카드까지** 닿아야 한다.
   *    `globals`의 `Pick`이나 `mixed-use-part-cards`의 매핑이 빠지면 세액이 그대로다.
   */
  it("[CW-1] 넘겨받은 상생임대 사실이 컴패니언 겸용 비과세를 살린다", async () => {
    const without = await pipeline(form());
    const withWinWin = await pipeline(form({ importedOneHouseFacts: IMPORTED_WIN_WIN }));

    expect(without.status, JSON.stringify(without.json).slice(0, 300)).toBe(200);
    expect(withWinWin.status, JSON.stringify(withWinWin.json).slice(0, 300)).toBe(200);

    const a = without.json.data?.aggregated?.determinedTax;
    const b = withWinWin.json.data?.aggregated?.determinedTax;
    expect(typeof a).toBe("number");
    expect(b!).toBeLessThan(a!);
  });

  /**
   * 🔑 **④가 실제로 싣는지**를 함께 고정한다. 클라이언트 변환이 상자를 빠뜨리면 위 CW-1이
   *    「route 배관은 멀쩡한데 값이 안 온다」로 깨지는데, 원인이 어느 층인지 구분되지 않는다.
   */
  it("[CW-2] ④ 변환이 body 최상위에 상생임대를 싣는다", async () => {
    const { body } = await pipeline(form({ importedOneHouseFacts: IMPORTED_WIN_WIN }));
    expect(body.winWinRentalHouse).toMatchObject({
      winWinContractDate: "2022-05-01",
      increaseRatePct: 5,
      priorLeaseMonths: 18,
      winWinLeaseMonths: 24,
    });
  });

  /** 🔑 부정 짝 — 요건 미달이면 세액이 그대로다(게이트를 통째로 연 것이 아니다). */
  it("[CW-3] 요건 미달이면 컴패니언 세액도 그대로다", async () => {
    const base = await pipeline(form());
    const broken = await pipeline(
      form({
        importedOneHouseFacts: { ...IMPORTED_WIN_WIN, winWinRentalPriorLeaseMonths: "17" },
      }),
    );
    expect(broken.json.data?.aggregated?.determinedTax).toBe(
      base.json.data?.aggregated?.determinedTax,
    );
  });
});
