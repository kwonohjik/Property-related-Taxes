/**
 * anchor — 일반건물 **지분(%) 분할 × 이월과세(§97의2)**: ④가 지분율로 스케일하는가.
 *
 * 결함 기록: `docs/00-pm/transfer-review-2026-08-open-items.plan.md` 「GB 지분 경로 이월과세 미스케일」
 * 선례:     `lib/calc/transfer-tax-api-carryover.ts`(컴패니언 F16 A-10) · anchor
 *           `__tests__/calc/transfer-carryover-fractional-ratio.anchor.test.ts`(R-1a~R-1c)
 *
 * ## 왜 route까지 태우는가
 *
 * 스케일은 **④(`buildGeneralBuildingShares`)에서** 일어난다. route는 받은 payload를 그대로 쓴다.
 * ⇒ payload를 손으로 적어 POST하면 이 결함을 **관측할 수 없다**. 그래서 여기서는
 *   폼 → ④ → route → 엔진의 **전 구간**을 태우고, 세액까지 고정한다.
 *
 * ## 픽스처 (물건-수준 — 전 지분 공통)
 *
 *   토지 100㎡ · 건물 연면적 200㎡ · 바닥 50㎡ · general_residential
 *   양도일 2024-03-01 · 총 양도가액 1,000,000,000 · 환산 모드
 *   양도시 기준시가 — 토지 2,000,000/㎡ × 100 = 200,000,000 · 건물 200,000,000 ⇒ §166⑥ 50:50
 *
 *   지분 A 60% — 2009-03-01 매매
 *   지분 B 40% — 토지만 이월과세(증여등기 2021-03-01 · 증여자 취득 2005-06-15)
 *                100% 기준 입력: 증여자 취득가 300,000,000 · 자본적지출 40,000,000 ·
 *                증여당시 평가액 600,000,000 · 증여세 상당액 30,000,000
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
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

const TRANSFER_DATE = "2024-03-01";
const TOTAL = 1_000_000_000;

/** 100% 기준 입력 — 화면 배너(「모든 금액을 100% 기준으로 입력하세요」)가 요구하는 그대로. */
const carryoverForm = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-03-01",
  donorAcquisitionDate: "2005-06-15",
  donorAcquisitionPrice: "300,000,000",
  donorCapitalExpenditure: "40,000,000",
  giftTaxAmount: "30,000,000",
  giftDateValuation: "600,000,000",
  ...over,
});

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

const share = (id: string, num: string, over: Partial<AssetForm> = {}) =>
  gbAsset({
    assetId: id,
    ownershipNumerator: num,
    ownershipDenominator: "100",
    ...over,
  });

/** 지분 B — 토지만 이월과세. `carryoverOver`로 legacy/part·환산 변형. */
const carryoverShare = (num: string, carryoverOver: object = {}) =>
  share("share-b", num, {
    acquisitionDate: "2021-03-01",
    acquisitionCause: "carryover_gift",
    carryover: carryoverForm(carryoverOver) as never,
  });

const COMMON = {
  propertyType: "general_building" as const,
  transferDate: TRANSFER_DATE,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

type ShareOut = ReturnType<typeof buildGeneralBuildingShares>;

/** 폼 → ④. 지분 배열이 안 나오면 그 자체가 결함이므로 여기서 터뜨린다. */
function shares(assets: AssetForm[]): NonNullable<ShareOut> {
  const out = buildGeneralBuildingShares(assets, TRANSFER_DATE);
  expect(out).toBeDefined();
  return out as NonNullable<ShareOut>;
}

/** ④ 결과를 그대로 실어 POST → aggregated 결과. */
async function postShares(sharePayloads: object[]) {
  const res = await POST(
    req({
      ...COMMON,
      transferPrice: TOTAL,
      totalPropertyTransferPrice: TOTAL,
      acquisitionDate: "2009-03-01",
      generalBuildingValuation: (sharePayloads[0] as { valuation: object }).valuation,
      generalBuildingShares: sharePayloads,
    }),
  );
  const json = (await res.json()) as {
    data?: { aggregated?: Record<string, unknown> };
  };
  expect(res.status).toBe(200);
  return json.data?.aggregated as {
    determinedTax: number;
    totalTax: number;
    totalTransferGain: number;
    properties: {
      propertyId: string;
      transferGain: number;
      acquisitionPrice: number;
      lossOffsetFromSameGroup?: number;
    }[];
  };
}

/** 지분-수준 carryover 서브객체 꺼내기 (legacy·part 어느 모양이든). */
const ct = (s: { valuation: Record<string, unknown> }) =>
  (s.valuation.landCarryoverTaxation ?? s.valuation.landCarryoverPart) as Record<string, number>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("GBSC — 일반건물 지분 × 이월과세: ④ 지분율 스케일", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBSC-01 — ④ 스케일 대상·비대상 (필드 단위 계약)
  // ══════════════════════════════════════════════════════════════════
  it("GBSC-01: 40% 지분 — 취득가액·자본적지출·증여당시평가액만 × 0.4", () => {
    const s = shares([share("share-a", "60"), carryoverShare("40")]);
    const b = ct(s[1] as never);
    expect(b.donorAcquisitionPrice).toBe(120_000_000); // 300,000,000 × 0.4
    expect(b.donorCapitalExpenditure).toBe(16_000_000); // 40,000,000 × 0.4
    expect(b.giftDateValuation).toBe(240_000_000); // 600,000,000 × 0.4
  });

  it("GBSC-02: 🔴 `giftTaxAmount`(증여세 상당액)는 스케일하지 않는다 (F16 R-1c 승계)", () => {
    const s = shares([share("share-a", "60"), carryoverShare("40")]);
    expect(ct(s[1] as never).giftTaxAmount).toBe(30_000_000);
  });

  /**
   * ⚠️ **이 케이스가 고정하는 것은 ④ 계약뿐이다 — 엔진까지 가지 않는다.**
   *
   * legacy 모양(`landCarryoverTaxation`)의 ⑫ 스키마
   * `carryoverTaxationEngineShape`(`lib/api/transfer-tax-building-schemas.ts:30-44`)에는
   * `donorStandardPriceAtAcquisition` **필드가 아예 없어** Zod가 조용히 strip한다.
   * (`carryoverPartShape`(`:49-61`)에는 있다 — 신규 경로만 통과한다.)
   *
   * ⇒ 「환산 산식 이중 축소 방지」가 **실제로 성립하는 경로**는 아래 GBSC-03b(part)다.
   *   여기서는 ④가 그 값을 스케일하지 않는다는 계약만 고정한다.
   *
   * 🔴 그 strip 자체는 **이 축과 무관한 별건 결함**이다 — `buildEngineShaped`가
   *    「이 경로에서도 실어야 취득가액 0을 피한다(설계 D9-8)」는 주석과 함께 싣는데
   *    ⑫가 버린다. **단건 경로에도 있다.** open-items 문서에 기록했다.
   */
  it("GBSC-03: 🔴 기준시가는 스케일하지 않는다 — legacy 모양 ④ 계약", () => {
    const s = shares([
      share("share-a", "60"),
      carryoverShare("40", {
        useEstimatedAcquisition: true,
        estimationMode: "general",
        donorStandardPriceAtAcquisition: "100,000,000",
      }),
    ]);
    const b = ct(s[1] as never);
    expect(b.donorStandardPriceAtAcquisition).toBe(100_000_000);
    // 실가 칸은 환산 모드에서 애초에 실리지 않는다 (스케일 이전 문제)
    expect(b.donorAcquisitionPrice).toBeUndefined();
  });

  /**
   * GBSC-03b — **엔진까지 도달하는** 기준시가 미스케일 계약.
   *
   * 신규 안분 경로(`landCarryoverPart`)는 ⑫가 `donorStandardPriceAtAcquisition`을 통과시킨다.
   * 환산 분모(양도 당시 기준시가)는 `transferLandPricePerSqm × landArea`로 도출되는데 그 값은
   * `GB_SHARE_PROPERTY_LEVEL_PATHS`가 **전 지분 동일**을 강제하는 물건-수준 값이다(100% 기준).
   * 분자만 × r 하면 분자·분모의 기준이 갈려 취득가액이 **× r 만큼 더 줄어든다**.
   */
  it("GBSC-03b: 🔴 part 경로 기준시가도 미스케일 — 분모가 물건-수준(100%)이라 이중 축소가 난다", () => {
    const s = shares([
      share("share-a", "60"),
      carryoverShare("40", {
        useEstimatedAcquisition: true,
        estimationMode: "general",
        donorStandardPriceAtAcquisition: "100,000,000",
        giftTaxCalculated: "80,000,000",
        giftTaxBase: "1,200,000,000",
      }),
    ]);
    const part = s[1].valuation.landCarryoverPart as Record<string, unknown>;
    expect(part.donorStandardPriceAtAcquisition).toBe(100_000_000);
    // 같은 객체 안에서 금액 칸은 × 0.4 된다 — 「전부 미스케일」이 아니라 필드별로 갈린다.
    expect(part.giftDateAssetValue).toBe(240_000_000);
  });

  it("GBSC-04: 신규 안분 경로(carryoverGiftEvent + Part)도 같은 규칙", () => {
    const s = shares([
      share("share-a", "60"),
      carryoverShare("40", { giftTaxCalculated: "80,000,000", giftTaxBase: "1,200,000,000" }),
    ]);
    const part = s[1].valuation.landCarryoverPart as Record<string, number>;
    const ev = s[1].valuation.carryoverGiftEvent as Record<string, number>;
    expect(part.donorAcquisitionPrice).toBe(120_000_000);
    expect(part.donorCapitalExpenditure).toBe(16_000_000);
    // 영 §163의2②2호 분자 — 분모(과세가액)와 기준을 맞추려면 × 0.4 여야 한다
    expect(part.giftDateAssetValue).toBe(240_000_000);
    // 🔴 사건-수준 두 금액은 증여세 신고서의 사실 — 스케일 0
    expect(ev.giftTaxCalculated).toBe(80_000_000);
    expect(ev.giftTaxBase).toBe(1_200_000_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBSC-05 — 단독소유(r = 1) 대조군: 불변
  // ══════════════════════════════════════════════════════════════════
  it("GBSC-05: 단독소유 payload는 한 글자도 바뀌지 않는다", () => {
    const solo = buildGeneralBuildingValuation(
      gbAsset({
        acquisitionDate: "2021-03-01",
        acquisitionCause: "carryover_gift",
        carryover: carryoverForm() as never,
      }),
      TRANSFER_DATE,
    ) as Record<string, unknown>;
    const c = solo.landCarryoverTaxation as Record<string, number>;
    expect(c.donorAcquisitionPrice).toBe(300_000_000);
    expect(c.donorCapitalExpenditure).toBe(40_000_000);
    expect(c.giftDateValuation).toBe(600_000_000);
    expect(c.giftTaxAmount).toBe(30_000_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBSC-06 — route 세액 (실측 고정) + 허수 차손 소멸
  // ══════════════════════════════════════════════════════════════════
  it("GBSC-06: 세액 실측 고정 — 허수 차손이 사라지고 타 지분 잠식이 0이 된다", async () => {
    const agg = await postShares(shares([share("share-a", "60"), carryoverShare("40")]) as never);
    // 실측값 (mock 세율). 산식 추론이 아니라 route 응답을 그대로 고정한다.
    expect(agg.determinedTax).toBe(107_463_200);
    expect(agg.totalTax).toBe(118_209_520);
    expect(agg.totalTransferGain).toBe(429_200_000);

    // 이월과세 파트가 **양(+)의 양도차익**을 낸다 (종전 −140,000,000)
    const land1 = agg.properties.find((p) => p.propertyId === "land#1");
    expect(land1?.transferGain).toBe(34_000_000);
    expect(land1?.acquisitionPrice).toBe(120_000_000);

    // 🔑 다른 지분이 허수 차손을 흡수하지 않는다 (종전 각 47,848,101)
    for (const p of agg.properties) expect(p.lossOffsetFromSameGroup ?? 0).toBe(0);
  });

  it("GBSC-07: 수렴 — ④ 산출 payload = 손으로 × 0.4 한 payload · 미스케일은 62,914,160 과소", async () => {
    const s = shares([share("share-a", "60"), carryoverShare("40")]);

    // (1) 손으로 × 0.4 한 대조군 — ④를 신뢰하지 않고 값을 직접 적는다
    const hand = JSON.parse(JSON.stringify(s)) as typeof s;
    const hc = ct(hand[1] as never);
    hc.donorAcquisitionPrice = 120_000_000;
    hc.donorCapitalExpenditure = 16_000_000;
    hc.giftDateValuation = 240_000_000;
    hc.giftTaxAmount = 30_000_000; // 미스케일 유지 (GBSC-02)

    // (2) 미스케일(결함 재현) 대조군 — 100% 기준값이 그대로 실린 payload
    const unscaled = JSON.parse(JSON.stringify(s)) as typeof s;
    const uc = ct(unscaled[1] as never);
    uc.donorAcquisitionPrice = 300_000_000;
    uc.donorCapitalExpenditure = 40_000_000;
    uc.giftDateValuation = 600_000_000;

    const [auto, manual, broken] = await Promise.all([
      postShares(s as never),
      postShares(hand as never),
      postShares(unscaled as never),
    ]);

    // 수렴
    expect(auto.determinedTax).toBe(manual.determinedTax);
    expect(auto.totalTransferGain).toBe(manual.totalTransferGain);

    // 양성 대조군 — 미스케일이면 결함이 그대로 재현된다 (이게 없으면 위 수렴이 무의미하다)
    expect(broken.determinedTax).toBe(44_549_040);
    expect(auto.determinedTax - broken.determinedTax).toBe(62_914_160);
  });
});
