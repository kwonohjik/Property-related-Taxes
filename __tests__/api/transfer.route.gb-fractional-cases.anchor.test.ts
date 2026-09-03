/**
 * 일반건물 × 지분(%) 분할 취득 — **케이스 인벤토리 잔여분** anchor.
 *
 * 계획서:   `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3)
 * 엔진설계: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md`
 * 선행 anchor: `transfer.route.gb-fractional.predo.anchor.test.ts` (GBF-01~11)
 *
 * ## 왜 별도 파일인가
 *
 * PR #1161은 케이스 인벤토리 **C-04·C-06·C-11·C-12·C-14**를 「공용 경로를 그대로 타므로
 * 동작할 것으로 보지만 **검증하지 않았다**」고 명시하고 머지됐다. 이 파일이 그 유보를 닫는다.
 * 선행 파일(481줄)에 붙이면 800줄 정책을 넘긴다.
 *
 * ## 이 파일이 실제로 잡은 것 (2026-08-10)
 *
 * 🔴 **C-12에서 표시 드리프트를 찾았다.** `buildApportionment`가
 *    `card.propertyId === "land_business"`로 비교하는데 지분 카드는 `land_business#0`이라
 *    **항상 false** → 사업용 토지 카드가 비사업용 비율로 표시됐다(기준시가 160,000,000이
 *    40,000,000으로, `displayRatio` 0.4가 0.1로 — 지분당 비율 합이 1.0이 아니라 0.7).
 *    세액은 이 값을 쓰지 않아 **표시만** 틀렸다(메모리 `feedback_engine_result_display_drift`).
 *    `baseCardId()`로 접미사를 벗겨 정정했다.
 *
 * ⚠️ **같은 뿌리의 UI-계층 드리프트는 이 PR에서 고치지 않았다** — 아래 C-12 주석 참조.
 *
 * ## 공통 픽스처 (선행 파일과 동일 — 값이 갈리면 두 파일을 함께 고칠 것)
 *
 *   토지 100㎡ · 건물 연면적 200㎡ · 바닥면적 50㎡ · 용도지역 general_residential
 *   양도일 2024-03-01 · 총 양도가액 1,000,000,000
 *   양도시 기준시가 — 토지 2,000,000/㎡ × 100 = 200,000,000 · 건물 200,000,000
 *   ⇒ §166⑥ 안분비 토지:건물 = 50:50 · 지분 A 60% = 600,000,000 · 지분 B 40% = 400,000,000
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

// ── 픽스처 ────────────────────────────────────────────────────────────
const TRANSFER_DATE = "2024-03-01";
const TOTAL = 1_000_000_000;

const PROPERTY_LEVEL = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
};

/**
 * NBL 초과용 물건-수준 — 바닥면적만 20㎡로 줄인다.
 * 일반주거지역 배율 **4배**(「지방세법 시행령」 §101② 표) ⇒ 기준면적 20 × 4 = 80㎡ < 토지 100㎡
 * ⇒ 초과 20㎡ · 비사업용 비율 0.2.
 */
const PROPERTY_LEVEL_NBL = { ...PROPERTY_LEVEL, buildingFootprintArea: 20 };

const valuation = (
  base: typeof PROPERTY_LEVEL,
  acqLandPerSqm: number,
  acqBuildingStd: number,
  over: object = {},
) => ({
  ...base,
  acquisitionLandPricePerSqm: acqLandPerSqm,
  acquisitionBuildingStdPrice: acqBuildingStd,
  buildingAcquisitionCause: "purchase" as const,
  ...over,
});

const SHARE_A = {
  shareId: "share-a",
  shareLabel: "60% 지분",
  ownershipRatio: 0.6,
  acquisitionDate: "2009-03-01",
  valuation: valuation(PROPERTY_LEVEL, 1_000_000, 100_000_000),
};
const SHARE_B = {
  shareId: "share-b",
  shareLabel: "40% 지분",
  ownershipRatio: 0.4,
  acquisitionDate: "2015-03-01",
  valuation: valuation(PROPERTY_LEVEL, 1_500_000, 150_000_000),
};

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

type Share = { acquisitionDate: string; valuation: object };

const fractionalBody = (shares: Share[]) => ({
  ...COMMON,
  transferPrice: TOTAL,
  totalPropertyTransferPrice: TOTAL,
  // top-level은 shares[0]과 동일하게 — 계산에 쓰이지 않지만 기존 배선을 undefined로 두지 않는다.
  acquisitionDate: shares[0].acquisitionDate,
  generalBuildingValuation: shares[0].valuation,
  generalBuildingShares: shares,
});

/** 지분 축 없는 100% 단건 — 양성 대조군. */
const singleBody = (share: Share) => ({
  ...COMMON,
  transferPrice: TOTAL,
  acquisitionDate: share.acquisitionDate,
  generalBuildingValuation: share.valuation,
});

type Apportioned = {
  assetId: string;
  allocatedSalePrice: number;
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
  displayRatio: number;
  standardPriceAtTransfer: number;
  standardPriceAtAcquisition: number;
};
type Prop = {
  propertyId: string;
  transferGain: number;
  longTermHoldingDeduction: number;
  carryoverTaxationDetail?: {
    isEligible: boolean;
    adoptedScenario: string;
    exclusionReason?: string;
  };
};

async function call(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  return {
    status: res.status,
    apportioned: (json.data?.apportionment?.apportioned ?? []) as Apportioned[],
    properties: (json.data?.aggregated?.properties ?? []) as Prop[],
    determinedTax: json.data?.aggregated?.determinedTax as number | undefined,
    error: json.error,
  };
}

type Result = Awaited<ReturnType<typeof call>>;
const card = (r: Result, id: string) => r.apportioned.find((a) => a.assetId === id);
const prop = (r: Result, id: string) => r.properties.find((p) => p.propertyId === id);

describe("GB × 지분 분할 — 케이스 인벤토리 잔여분", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-23 (C-04) — 60% 매매(환산) + 40% **증여**
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-23: 증여 지분은 환산 대상이 아니다 (법 §97①1호 단서 · 영 §163⑨)", () => {
    /**
     * 「소득세법」 §97①1호 단서 + 같은 법 시행령 §163⑨ — 상속·증여로 취득한 자산은
     * 「상속세 및 증여세법」에 따라 평가한 가액이 **취득 당시 실지거래가액으로 의제**된다.
     * ⇒ 실지거래가액이 확인되는 자산이므로 §176의2② 환산의 요건(「확인할 수 없는 경우」) 밖이다.
     *
     * 저장소는 이 판정을 이미 단건에서 강제한다(`transfer-tax-validate-gb.ts:118,126~127`).
     * 지분 축에서 검증할 것은 **그 판정이 지분마다 따로 선다**는 점이다 —
     * 혼합 지분(환산 60% + 증여 40%)이 흔하기 때문이다.
     *
     * 증여 지분의 payload 모양: 파트별 `actual` 모드 + 평가액(× 지분율). 개산공제(§163⑥)는
     * 「환산·감정·매매사례」 모드 전용이므로 실가 파트에서는 0이다.
     */
    const B_GIFT = {
      ...SHARE_B,
      valuation: valuation(PROPERTY_LEVEL, 1_500_000, 150_000_000, {
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        // 증여 당시 상증법 평가액 × 40% (④ 변환이 스케일한 값 — GBF-05 주석)
        landAcquisitionPrice: 100_000_000,
        buildingAcquisitionPrice: 60_000_000,
        landAcquisitionCause: "gift",
        buildingAcquisitionCause: "gift",
      }),
    };

    it("증여 지분의 취득가액 = 입력한 평가액 그대로 (환산되지 않는다)", async () => {
      const r = await call(fractionalBody([SHARE_A, B_GIFT]));
      expect(r.status).toBe(200);
      expect(card(r, "land#1")?.allocatedAcquisitionPrice).toBe(100_000_000);
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).toBe(60_000_000);
    });

    /**
     * 🔑 **양성 대조군** — 같은 지분을 환산으로 두면 다른 값이 나온다.
     * 이게 없으면 「평가액을 그대로 쓴다」가 「환산 결과가 우연히 같다」와 구별되지 않는다.
     *   환산: 200,000,000 × 150,000,000 / 200,000,000 = 150,000,000 (토지·건물 각각)
     */
    it("대조군 — 같은 지분을 환산 모드로 두면 150,000,000 (≠ 평가액)", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(card(r, "land#1")?.allocatedAcquisitionPrice).toBe(150_000_000);
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).toBe(150_000_000);
    });

    it("증여 지분은 개산공제(영 §163⑥)가 0 — 실가 파트라 적용 대상이 아니다", async () => {
      const gift = await call(fractionalBody([SHARE_A, B_GIFT]));
      const conv = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(card(gift, "land#1")?.allocatedExpenses).toBe(0);
      // 대조군: 환산 지분은 floor(floor(150,000,000 × 0.4) × 3%) = 1,800,000
      expect(card(conv, "land#1")?.allocatedExpenses).toBe(1_800_000);
    });

    it("환산 지분(A)은 증여 지분과 무관하게 자기 환산값을 유지한다", async () => {
      const r = await call(fractionalBody([SHARE_A, B_GIFT]));
      expect(card(r, "land#0")?.allocatedAcquisitionPrice).toBe(150_000_000);
      expect(card(r, "building#0")?.allocatedAcquisitionPrice).toBe(150_000_000);
    });

    /**
     * §97②2호 **단서**는 「취득가액을 환산취득가액으로 하는 경우」에만 걸린다.
     * ⇒ 증여 지분은 요건 밖이라 A에서 단서가 발동해도 끌려들어가지 않는다(계획 §3-4 · C-13과 같은 축).
     *   지분 A 가목 = 환산 300,000,000 + 개산공제 3,600,000 · 나목 = 자본적지출 360,000,000 → 나목 채택.
     */
    it("A에서 단서가 발동해도 증여 지분(B)은 취득가액을 유지한다", async () => {
      const A_CAPEX = {
        ...SHARE_A,
        valuation: valuation(PROPERTY_LEVEL, 1_000_000, 100_000_000, {
          capitalExpenditure: 360_000_000,
        }),
      };
      const r = await call(fractionalBody([A_CAPEX, B_GIFT]));
      // A: 단서 발동 — 환산취득가 미차감(0) · 필요경비 = 배분된 나목
      expect(card(r, "land#0")?.allocatedAcquisitionPrice).toBe(0);
      expect(card(r, "building#0")?.allocatedAcquisitionPrice).toBe(0);
      // B: 불변
      expect(card(r, "land#1")?.allocatedAcquisitionPrice).toBe(100_000_000);
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).toBe(60_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-24 (C-06) — 지분 × 토지·건물 취득일 분리 (M-1a)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-24: 지분 안에서 토지·건물 취득일이 갈린다 (법 §95④ · 영 §166⑥)", () => {
    /**
     * `generalBuildingShares[].acquisitionDate`는 그 지분의 **토지** 취득일이고,
     * 건물은 `valuation.buildingAcquisitionDate`가 정본이다(영 §162①4호).
     * 장기보유특별공제(법 §95④)는 자산별 보유기간으로 계산되므로 두 파트가 갈려야 한다.
     *
     * ⚠️ 절대 공제**율**은 단언하지 않는다 — 이 엔진의 연수 산정은 (실제 연수 − 1)로 나오는데
     *    그것은 **단건 경로와 동일한 기존 동작**이라 이 작업의 검증 대상이 아니다(GBF-10 주석).
     *    대신 **같은 양도차익에서 LTHD만 갈리는지**로 판정한다.
     */
    const A_SPLIT = {
      ...SHARE_A,
      acquisitionDate: "2005-03-01", // 토지
      valuation: valuation(PROPERTY_LEVEL, 1_000_000, 100_000_000, {
        buildingAcquisitionDate: "2015-03-01", // 건물
      }),
    };
    const A_OFF = {
      ...SHARE_A,
      acquisitionDate: "2015-03-01",
      valuation: valuation(PROPERTY_LEVEL, 1_000_000, 100_000_000, {
        buildingAcquisitionDate: "2015-03-01",
      }),
    };

    it("대조군(분리 OFF) — 토지·건물 LTHD가 같다", async () => {
      const r = await call(fractionalBody([A_OFF, SHARE_B]));
      expect(prop(r, "land#0")?.longTermHoldingDeduction).toBe(23_712_000);
      expect(prop(r, "building#0")?.longTermHoldingDeduction).toBe(23_712_000);
    });

    it("분리 ON — 양도차익은 같은데 토지 LTHD만 커진다", async () => {
      const r = await call(fractionalBody([A_SPLIT, SHARE_B]));
      // 양도차익이 동일해야 「LTHD 차이 = 날짜 차이」가 성립한다
      expect(prop(r, "land#0")?.transferGain).toBe(148_200_000);
      expect(prop(r, "building#0")?.transferGain).toBe(148_200_000);
      expect(prop(r, "land#0")?.longTermHoldingDeduction).toBe(44_460_000);
      expect(prop(r, "building#0")?.longTermHoldingDeduction).toBe(23_712_000);
    });

    it("🔑 지분 A의 분리가 지분 B로 새지 않는다", async () => {
      const off = await call(fractionalBody([A_OFF, SHARE_B]));
      const on = await call(fractionalBody([A_SPLIT, SHARE_B]));
      expect(prop(on, "land#1")?.longTermHoldingDeduction).toBe(
        prop(off, "land#1")?.longTermHoldingDeduction,
      );
      expect(prop(on, "building#1")?.longTermHoldingDeduction).toBe(
        prop(off, "building#1")?.longTermHoldingDeduction,
      );
      expect(prop(on, "land#1")?.longTermHoldingDeduction).toBe(7_712_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-25 (C-11) — 지분 × §99-164-10 최초공시 환산주택가격
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-25: 최초공시 산식이 지분별 취득기준시가로 자동 분기한다", () => {
    /**
     * 「양도소득세 집행기준 99-164-10」 환산주택가격:
     *
     *   환산주택가격 = 최초공시주택가격
     *                × (취득당시 토지기준시가 + 취득당시 건물기준시가)
     *                ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
     *
     * 🔑 **분기 로직이 따로 없다.** 최초공시 3필드는 물건-수준(전 지분 동일)이지만 **분자가
     *    지분-수준**이라, 지분마다 다른 환산주택가격이 나오고 그 값이 취득기준시가를 override한다.
     *    설계는 이것을 「자동 분기」라 적었고, 이 anchor가 그 서술을 검증한다.
     *
     * 픽스처 — 최초공시 250,000,000 / 최초공시 당시 토지 120,000,000 + 건물 80,000,000(합 200,000,000)
     *   ⇒ 배율 k = 250,000,000 ÷ 200,000,000 = 1.25
     *   지분 A: 취득 기준시가 100,000,000 + 100,000,000 = 200,000,000 → 환산 250,000,000 → 토지·건물 각 125,000,000
     *   지분 B: 취득 기준시가 150,000,000 +  50,000,000 = 200,000,000 → 환산 250,000,000 → 토지 187,500,000 / 건물 62,500,000
     *
     * ⚠️ **지분 B의 토지·건물을 일부러 비대칭으로** 뒀다. 대칭 픽스처(양쪽 150,000,000)에서는
     *    네 카드가 모두 같은 값이 되어 「지분별로 갈린다」가 검증되지 않는다(2026-08-10 실측).
     */
    const FIRST_DISCLOSURE = {
      hasFirstDisclosure: true,
      firstDisclosurePrice: 250_000_000,
      firstDisclosureLandStdPrice: 120_000_000,
      firstDisclosureBuildingStdPrice: 80_000_000,
    };
    const mk = (fd: object) => [
      { ...SHARE_A, valuation: valuation(PROPERTY_LEVEL, 1_000_000, 100_000_000, fd) },
      { ...SHARE_B, valuation: valuation(PROPERTY_LEVEL, 1_500_000, 50_000_000, fd) },
    ];

    it("대조군(OFF) — 취득기준시가 그대로 환산", async () => {
      const r = await call(fractionalBody(mk({})));
      // 지분 A 토지: 300,000,000 × 100,000,000 / 200,000,000
      expect(card(r, "land#0")?.allocatedAcquisitionPrice).toBe(150_000_000);
      // 지분 B 건물: 200,000,000 × 50,000,000 / 200,000,000
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).toBe(50_000_000);
    });

    it("ON — 지분 A는 토지·건물 모두 187,500,000", async () => {
      const r = await call(fractionalBody(mk(FIRST_DISCLOSURE)));
      // 300,000,000 × 125,000,000 / 200,000,000
      expect(card(r, "land#0")?.allocatedAcquisitionPrice).toBe(187_500_000);
      expect(card(r, "building#0")?.allocatedAcquisitionPrice).toBe(187_500_000);
    });

    it("🔑 ON — 지분 B는 토지 187,500,000 / 건물 62,500,000 (A와 다르다)", async () => {
      const r = await call(fractionalBody(mk(FIRST_DISCLOSURE)));
      expect(card(r, "land#1")?.allocatedAcquisitionPrice).toBe(187_500_000);
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).toBe(62_500_000);
      // 지분 A 건물과 **달라야** 「지분별 분기」다 — 같으면 첫 지분 값이 전 지분에 복사된 것이다.
      expect(card(r, "building#1")?.allocatedAcquisitionPrice).not.toBe(
        card(r, "building#0")?.allocatedAcquisitionPrice,
      );
    });

    it("override는 개산공제 base까지 끌고 간다 — 지분 A 토지 1,800,000 → 2,250,000", async () => {
      const off = await call(fractionalBody(mk({})));
      const on = await call(fractionalBody(mk(FIRST_DISCLOSURE)));
      expect(card(off, "land#0")?.allocatedExpenses).toBe(1_800_000);
      // floor(floor(1,250,000 × 100 × 0.6) × 3%) = floor(75,000,000 × 3%) = 2,250,000
      expect(card(on, "land#0")?.allocatedExpenses).toBe(2_250_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-26 (C-12) — 지분 × NBL 부수토지 초과 🔴 표시 드리프트를 잡은 케이스
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-26: 지분마다 토지 카드가 2장으로 갈린다 (지방세령 §101①2호·②)", () => {
    /**
     * 근거 체인: 법 §104의3①4호나목 → 「지방세법」 §106①2호 → 같은 법 시행령 §101①2호·②.
     * 바닥면적 20㎡ × 일반주거지역 4배 = 기준면적 80㎡ < 토지 100㎡ ⇒ 초과 20㎡(비율 0.2).
     *
     * ⚠️ **이 픽스처에서 세액은 변하지 않는다** — §104⑤ 비교과세가 1호 합산을 채택하기 때문이다
     *    (초과분 중과 +10%p보다 합산 누진이 커서 MAX가 합산 쪽으로 간다).
     *    ⇒ 세액으로는 이 케이스를 검증할 수 없고, **카드 구조와 표시 값**이 관측 지표다.
     */
    const A_NBL = { ...SHARE_A, valuation: valuation(PROPERTY_LEVEL_NBL, 1_000_000, 100_000_000) };
    const B_NBL = { ...SHARE_B, valuation: valuation(PROPERTY_LEVEL_NBL, 1_500_000, 150_000_000) };

    it("지분 2 × (토지 2 + 건물 1) = 카드 6장", async () => {
      const r = await call(fractionalBody([A_NBL, B_NBL]));
      expect(r.status).toBe(200);
      expect(r.apportioned.map((a) => a.assetId).sort()).toEqual([
        "building#0",
        "building#1",
        "land_business#0",
        "land_business#1",
        "land_nbl#0",
        "land_nbl#1",
      ]);
    });

    it("양도가액이 인정면적 비율 80:20으로 갈린다 (지분 A 토지 300,000,000)", async () => {
      const r = await call(fractionalBody([A_NBL, B_NBL]));
      expect(card(r, "land_business#0")?.allocatedSalePrice).toBe(240_000_000);
      expect(card(r, "land_nbl#0")?.allocatedSalePrice).toBe(60_000_000);
      // 지분 B 토지 200,000,000
      expect(card(r, "land_business#1")?.allocatedSalePrice).toBe(160_000_000);
      expect(card(r, "land_nbl#1")?.allocatedSalePrice).toBe(40_000_000);
    });

    /**
     * 🔴 **회귀 가드 — 접미사 매칭**(2026-08-10 실측 결함).
     *
     * `buildApportionment`가 `card.propertyId === "land_business"`로 비교하던 시절,
     * 지분 카드는 `land_business#0`이라 **항상 false**가 되어 사업용 토지도 비사업용 비율로
     * 표시됐다(기준시가 40,000,000 · `displayRatio` 0.1). `baseCardId()`로 정정했다.
     *
     * ⚠️ **같은 뿌리가 UI 계층에 남아 있다** — `#k` 접미사를 모르는 정확 비교가
     *    `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts`(`isLandProp` 외 8곳)와
     *    `FilingFormTableAggregateHelpers.ts:62`에 있다. 그쪽은 산식이 **표시되지 않거나**
     *    신고서 메타 조회가 실패하는 방향이라 별건으로 남겼다(이 파일의 단언 범위 밖).
     */
    it("🔑 사업용 토지 카드의 표시 기준시가 = 160,000,000 (비사업용 40,000,000)", async () => {
      const r = await call(fractionalBody([A_NBL, B_NBL]));
      expect(card(r, "land_business#0")?.standardPriceAtTransfer).toBe(160_000_000);
      expect(card(r, "land_nbl#0")?.standardPriceAtTransfer).toBe(40_000_000);
      expect(card(r, "land_business#1")?.standardPriceAtTransfer).toBe(160_000_000);
      expect(card(r, "land_nbl#1")?.standardPriceAtTransfer).toBe(40_000_000);
    });

    it("🔑 지분마다 displayRatio 합 = 1 (0.4 + 0.1 + 0.5)", async () => {
      const r = await call(fractionalBody([A_NBL, B_NBL]));
      for (const k of [0, 1]) {
        const sum = r.apportioned
          .filter((a) => a.assetId.endsWith(`#${k}`))
          .reduce((s, a) => s + a.displayRatio, 0);
        expect(sum, `지분 ${k}의 displayRatio 합이 1이 아니다 — 접미사 매칭 회귀 의심`).toBeCloseTo(1, 10);
      }
      expect(card(r, "land_business#0")?.displayRatio).toBeCloseTo(0.4, 10);
      expect(card(r, "land_nbl#0")?.displayRatio).toBeCloseTo(0.1, 10);
    });

    it("취득시 기준시가도 지분별로 80:20 (지분 B 150,000,000 → 120,000,000 / 30,000,000)", async () => {
      const r = await call(fractionalBody([A_NBL, B_NBL]));
      expect(card(r, "land_business#1")?.standardPriceAtAcquisition).toBe(120_000_000);
      expect(card(r, "land_nbl#1")?.standardPriceAtAcquisition).toBe(30_000_000);
    });

    it("양성 대조군 — 단건(100%)도 같은 규칙으로 갈린다", async () => {
      const r = await call(singleBody(A_NBL));
      expect(card(r, "land_business")?.standardPriceAtTransfer).toBe(160_000_000);
      expect(card(r, "land_nbl")?.standardPriceAtTransfer).toBe(40_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-27 (C-14) — 지분 × 이월과세(토지 파트, 법 §97의2)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-27: 이월과세가 지분 단위로 선다 (법 §97의2)", () => {
    /**
     * ⚠️ **폼에서는 도달할 수 없는 경로다** — `landCarryoverTaxation`의 생산자가 `lib/calc/`·
     *    `components/`에 **0건**이다(2026-08-10 grep). 일반건물 토지 이월과세는 지금
     *    **API 전용**이고, 그것은 단건도 마찬가지라 지분 축이 만든 갭이 아니다
     *    (메모리 `feedback_api_trigger_without_input_path_is_noop` — 입력 UI가 생기면
     *    ④ 변환의 지분율 스케일 대상에 이 서브객체를 넣을지 **그때 판단해야 한다**).
     *
     *    ⇒ 이 anchor가 지키는 것은 「엔진·API 계층에서 지분마다 따로 선다」까지다.
     *
     * 「소득세법」 §97의2① — 양도일로부터 소급 5년(2023.1.1. 이후 증여분 10년) 이내에 배우자·
     * 직계존비속으로부터 증여받은 토지등을 양도하면 취득가액을 **증여자의 취득 당시 가액**으로
     * 하고, 납부한 증여세는 필요경비에 산입한다.
     */
    const carryover = (giftDate: string) => ({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: {
        giftRegistryDate: giftDate,
        donorAcquisitionDate: "2005-06-15",
        donorAcquisitionPrice: 60_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 12_000_000,
        giftDateValuation: 160_000_000,
      },
    });
    /** 증여일 = 그 지분의 취득일이어야 한다(취득시기 = 증여등기 접수일). */
    const shareB = (giftDate: string, on: boolean) => ({
      ...SHARE_B,
      acquisitionDate: giftDate,
      valuation: valuation(
        PROPERTY_LEVEL,
        1_500_000,
        150_000_000,
        on ? carryover(giftDate) : {},
      ),
    });

    describe("5년 이내 증여(2021) — 적용", () => {
      it("지분 B 토지 양도차익 48,200,000 → 128,000,000 (= 200,000,000 − 60,000,000 − 12,000,000)", async () => {
        const off = await call(fractionalBody([SHARE_A, shareB("2021-03-01", false)]));
        const on = await call(fractionalBody([SHARE_A, shareB("2021-03-01", true)]));
        expect(prop(off, "land#1")?.transferGain).toBe(48_200_000);
        expect(prop(on, "land#1")?.transferGain).toBe(128_000_000);
      });

      it("이월과세 판정이 그 지분 카드에 실린다 — isEligible · Scenario A 채택", async () => {
        const on = await call(fractionalBody([SHARE_A, shareB("2021-03-01", true)]));
        expect(prop(on, "land#1")?.carryoverTaxationDetail?.isEligible).toBe(true);
        expect(prop(on, "land#1")?.carryoverTaxationDetail?.adoptedScenario).toBe("A");
      });

      it("보유기간 기산이 증여자 취득일(2005)로 당겨진다 — LTHD 0 → 38,400,000", async () => {
        const off = await call(fractionalBody([SHARE_A, shareB("2021-03-01", false)]));
        const on = await call(fractionalBody([SHARE_A, shareB("2021-03-01", true)]));
        expect(prop(off, "land#1")?.longTermHoldingDeduction).toBe(0);
        expect(prop(on, "land#1")?.longTermHoldingDeduction).toBe(38_400_000);
      });

      it("🔑 지분 A는 이월과세와 무관하다 — 지분별 독립", async () => {
        const off = await call(fractionalBody([SHARE_A, shareB("2021-03-01", false)]));
        const on = await call(fractionalBody([SHARE_A, shareB("2021-03-01", true)]));
        for (const id of ["land#0", "building#0"]) {
          expect(prop(on, id)?.transferGain).toBe(prop(off, id)?.transferGain);
          expect(prop(on, id)?.longTermHoldingDeduction).toBe(
            prop(off, id)?.longTermHoldingDeduction,
          );
        }
        expect(prop(on, "land#0")?.transferGain).toBe(148_200_000);
      });

      it("건물 파트는 이월과세를 받지 않는다 (§97의2는 토지 카드 전용 배선)", async () => {
        const off = await call(fractionalBody([SHARE_A, shareB("2021-03-01", false)]));
        const on = await call(fractionalBody([SHARE_A, shareB("2021-03-01", true)]));
        expect(prop(on, "building#1")?.transferGain).toBe(prop(off, "building#1")?.transferGain);
        expect(prop(on, "building#1")?.carryoverTaxationDetail).toBeUndefined();
      });
    });

    describe("5년 초과 증여(2015) — 배제", () => {
      /**
       * 배제되면 **통상 취득가액**(증여 당시 평가액 = `giftDateValuation`)으로 돌아간다.
       *   200,000,000 − 160,000,000 − 개산공제 1,800,000 = 38,200,000
       * ⇒ 「배제」가 「이월과세 입력 자체를 무시」가 아니라는 점이 관측 지표다
       *   (무시했다면 환산 150,000,000이 남아 48,200,000이 나온다).
       */
      it("적용배제 사유가 period_exceeded로 기록된다", async () => {
        const on = await call(fractionalBody([SHARE_A, shareB("2015-03-01", true)]));
        expect(prop(on, "land#1")?.carryoverTaxationDetail?.isEligible).toBe(false);
        expect(prop(on, "land#1")?.carryoverTaxationDetail?.exclusionReason).toBe("period_exceeded");
      });

      it("취득가액이 증여 당시 평가액 160,000,000으로 돌아간다 — 양도차익 38,200,000", async () => {
        const off = await call(fractionalBody([SHARE_A, shareB("2015-03-01", false)]));
        const on = await call(fractionalBody([SHARE_A, shareB("2015-03-01", true)]));
        expect(prop(off, "land#1")?.transferGain).toBe(48_200_000);
        expect(prop(on, "land#1")?.transferGain).toBe(38_200_000);
      });
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 G-13 (2026-09-03): 지분분할 경로도 **신고서 단위 가산세**를 엔진에 전달한다
//
// 종전에는 세 GB 경로 중 이 경로만 `filingPenaltyDetails`·`delayedPaymentDetails`를
// 함수 시그니처에도 aggregate 호출에도 갖고 있지 않아, **지분 칸을 1개에서 2개로 늘린
// 것만으로 가산세가 0원**이 됐다. 형제 두 경로는 `GbAssetLevelInputs`로 이미 전달했다
// (`-route-helper.ts:251-252` · `-route-actual.ts:664-665`).
//
// 가산세는 국세기본법 §47의2~§47의4 어디에도 **양도 자산의 종류·지분 수에 따른 예외가 없다**.
// ────────────────────────────────────────────────────────────────────────────

/** 무신고(20%) — determinedTax는 aggregate가 집계값으로 주입한다. */
const G13_FILING = {
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none",
  penaltyReason: "normal",
};

async function callPenalty(body: object, withPenalty: boolean) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withPenalty ? { ...body, filingPenaltyDetails: G13_FILING } : body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const agg = json.data?.aggregated;
  return {
    determinedTax: agg?.determinedTax as number,
    penaltyTax: agg?.penaltyTax as number,
    totalTax: agg?.totalTax as number,
    filingUnitPenaltyDetail: agg?.filingUnitPenaltyDetail as { totalPenalty: number } | undefined,
  };
}

describe("G-13 지분분할 GB 경로의 신고서 단위 가산세", () => {
  const body = fractionalBody([SHARE_A, SHARE_B]);

  it("GP-1: 대조군 — 가산세 입력이 없으면 0", async () => {
    const r = await callPenalty(body, false);
    expect(r.penaltyTax).toBe(0);
    expect(r.filingUnitPenaltyDetail).toBeUndefined();
  });

  it("GP-2: 🔴 무신고 가산세가 실제로 세액을 움직인다 (종전 Δ 0)", async () => {
    const base = await callPenalty(body, false);
    const pen = await callPenalty(body, true);

    // 결정세액은 그대로, 가산세만 더해진다
    expect(pen.determinedTax).toBe(base.determinedTax);
    expect(pen.penaltyTax).toBeGreaterThan(0);
    // 국세기본법 §47의2①2호 — 무신고 일반 20%
    expect(pen.penaltyTax).toBe(Math.floor(base.determinedTax * 0.2));
    expect(pen.filingUnitPenaltyDetail?.totalPenalty).toBe(pen.penaltyTax);
    expect(pen.totalTax).toBe(base.totalTax + pen.penaltyTax);
  });

  it("GP-3: 지분 1개(단건 경로)와 2개(지분 경로)가 같은 규약이다 — 지분 수로 갈리면 안 된다", async () => {
    const single = await callPenalty(singleBody(SHARE_A), true);
    const fractional = await callPenalty(body, true);
    // 세액은 격자가 달라 다르지만, **가산세가 붙는다는 사실**은 같아야 한다
    expect(single.penaltyTax).toBeGreaterThan(0);
    expect(fractional.penaltyTax).toBeGreaterThan(0);
  });
});
