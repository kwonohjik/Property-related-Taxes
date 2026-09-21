/**
 * anchor: ⑫⑬⑭ route → 겸용 엔진 **§155의3 상생임대 사실 전달** (P5-c)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §29.
 *
 * ## 🔴 엔진 anchor로는 이 배관을 못 잡는다
 *
 * 형제 파일 `mixed-use-155-3-win-win-rental.anchor.test.ts`는 `calcMixedUseTransferTax`에
 * `winWinRentalHouse`를 **직접 주입**하므로, route가 그 필드를 안 넘겨도 초록이다.
 * ⑫⑬⑭는 TypeScript도 잡지 못해 **침묵 stripping**된다
 * (`feedback_leaf_anchor_skips_zod_layer` · `feedback_api_zod_schema_sync`).
 *
 * 실제로 이 축에는 침묵 누락 자리가 **셋**이었다:
 *   · `MixedUseAssetInputSources` — 필드 부재(누락 시 컴파일 실패 ✅ 가드 있음)
 *   · `buildHousingPart`의 **optional 파라미터** — 안 넘겨도 `undefined`로 통과(❌ 가드 없음)
 *   · `MixedUseCompanionContext.globals`의 **손으로 나열한 `Pick`** (❌ 가드 없음)
 *
 * ⇒ 여기서는 **body만 주고** 표2와 비과세가 실제로 움직이는지 본다.
 *
 * ## 🔑 날짜 변환이 이 파일의 두 번째 관측 지점이다
 *
 * `winWinContractDate`는 Zod 출력에서 **string**이고, `qualifiesWinWinRental`은 `Date`로
 * 비교한다. route가 raw `data.*`를 넘기면 `Date < string`이 **조용히 false**가 되어
 * 요건이 영원히 미충족이 된다(`lib/api/date-coerce.ts`의 존재 이유). 실제로 `engineInput`
 * 변환본을 넘기는지는 **여기서만** 관측된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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

/** §155의3① 1~3호를 모두 충족하는 값 — **계약일은 string**(Zod 입력 형태 그대로). */
const WIN_WIN_OK = {
  winWinContractDate: "2022-05-01",
  increaseRatePct: 5,
  priorLeaseMonths: 18,
  winWinLeaseMonths: 24,
};

/**
 * 1세대1주택 겸용 · 거주 0년 · 고가주택.
 *
 * ⚠️ 건물 취득일을 **2018-06-01**로 둔다 — 2017-08-03 이전 취득은 §154① 부칙 경과규정이
 *    거주요건을 **이미 면제**해 관측 자체가 불가능해진다(형제 엔진 anchor 머리 주석 ①).
 */
const MIXED = {
  transferPrice: 3_000_000_000,
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2018-06-01",
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: "2018-06-01",
    buildingAcquisitionDate: "2018-06-01",
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 2_500_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

interface MixedResult {
  total: { transferTax: number };
  housingPart: { longTermDeductionTable: 1 | 2; longTermDeductionAmount: number };
  calculationRoute: { highValueRule: string; housingDeductionTableReason: string };
}

async function call(over: Record<string, unknown> = {}): Promise<MixedResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  const json = (await res.json()) as { data: { mode: string; result: MixedResult } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data.mode).toBe("mixed-use");
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("⑫⑬⑭ 겸용 × §155의3 상생임대 — route 배관", () => {
  /**
   * 🔴 **핵심.** body에 `winWinRentalHouse`만 실어 보내면 표2가 열려야 한다.
   *    배관 어느 한 층이라도 끊기면 표1 그대로다.
   */
  it("[MR-1] body의 상생임대 사실만으로 장특 표2가 열린다", async () => {
    const without = await call();
    const withWinWin = await call({ winWinRentalHouse: WIN_WIN_OK });

    expect(without.housingPart.longTermDeductionTable).toBe(1);
    expect(withWinWin.housingPart.longTermDeductionTable).toBe(2);
    expect(withWinWin.housingPart.longTermDeductionAmount).toBeGreaterThan(
      without.housingPart.longTermDeductionAmount,
    );
    expect(withWinWin.total.transferTax).toBeLessThan(without.total.transferTax);
  });

  /**
   * 🔴 **같은 body가 §154① 비과세 거주요건도 연다** — 조정대상지역 취득일 때.
   *    실측상 이쪽 금액 영향이 표2보다 훨씬 크다(455,160,286 vs 17,148,449).
   */
  it("[MR-2] 조정대상지역이어도 상생임대면 비과세가 선다", async () => {
    const reg = { wasRegulatedAtAcquisition: true };
    const without = await call(reg);
    const withWinWin = await call({ ...reg, winWinRentalHouse: WIN_WIN_OK });

    expect(without.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(withWinWin.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(withWinWin.total.transferTax).toBeLessThan(without.total.transferTax);
  });

  /**
   * 🔑 **날짜 변환 관측 지점.** 계약일이 창 밖이면 요건이 깨져야 한다. route가 raw string을
   *    넘겼다면 `Date < string` 비교가 **양쪽 다 false**가 되어 이 시료와 MR-1이
   *    **같은 결과**를 낸다 — 그러면 MR-1의 초록이 배관 증명이 아니게 된다.
   */
  it("[MR-3] 계약일이 창 밖이면 표2가 열리지 않는다 (Date 변환 관측)", async () => {
    const r = await call({
      winWinRentalHouse: { ...WIN_WIN_OK, winWinContractDate: "2021-12-19" },
    });
    expect(r.housingPart.longTermDeductionTable).toBe(1);
  });

  /** 🔑 요건 미달이면 그대로다 — 게이트를 통째로 연 것이 아니다. */
  it("[MR-4] 요건 미달이면 종전과 같다", async () => {
    const base = await call();
    const broken = await call({
      winWinRentalHouse: { ...WIN_WIN_OK, priorLeaseMonths: 17 },
    });
    expect(broken.housingPart.longTermDeductionTable).toBe(1);
    expect(broken.total.transferTax).toBe(base.total.transferTax);
  });

  /** 표시 문구까지 route를 타고 나온다 — 화면이 근거를 말할 수 있어야 한다. */
  it("[MR-5] 표2 사유 문구가 상생임대를 근거로 나온다", async () => {
    const r = await call({ winWinRentalHouse: WIN_WIN_OK });
    expect(r.calculationRoute.housingDeductionTableReason).toContain("상생임대주택");
    expect(r.calculationRoute.housingDeductionTableReason).not.toContain("0년 ≥ 2년");
  });
});
