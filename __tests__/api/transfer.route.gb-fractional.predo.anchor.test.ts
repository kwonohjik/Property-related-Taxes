/**
 * Pre-Do anchor — 일반건물(토지+건물 일괄) × 지분(%) 분할 취득.
 *
 * 계획서:   `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3)
 * 엔진설계: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md`
 * 정책:     `feedback_pre_anchor_verification` — Do 진입 전 **실패하는** anchor로 설계를 환류한다.
 *
 ## ✅ 구현 착지 완료 (2026-08-10)
 *
 * 작성 시점에는 16건이 `it.fails`(의도적 실패)였다 — `generalBuildingShares`가 Zod에 없어
 * z.object가 strip하고 route가 단건 경로(5-a-3)를 타면서 지분 축이 통째로 사라졌기 때문이다.
 * Phase C~F 착지로 **전건 `it` 전환**했다. 이제 이 파일은 **회귀 방어선**이다.
 *
 * ⚠️ 여기서 `it.fails`가 다시 필요해지면 그것은 **결함이 재발했다는 신호**다 — 표기를 바꾸지 말고
 *    원인을 고칠 것.
 *
 * ## 픽스처 (물건-수준 — 전 지분 공통)
 *
 *   토지 100㎡ · 건물 연면적 200㎡ · 바닥면적 50㎡ · 용도지역 general_residential
 *   양도일 2024-03-01 · 총 양도가액 1,000,000,000
 *   양도시 기준시가 — 토지 2,000,000/㎡ × 100 = 200,000,000 · 건물 200,000,000 (합 400,000,000)
 *   ⇒ §166⑥ 안분비 토지:건물 = 50:50
 *
 *   지분 A 60% — 2009-03-01 매매 · 환산 · 취득시 기준시가 토지 100,000,000 / 건물 100,000,000
 *   지분 B 40% — 2015-03-01 매매 · 환산 · 취득시 기준시가 토지 150,000,000 / 건물 150,000,000
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

/** 물건-수준 GB payload (전 지분 동일 — 설계 D1-3 `PROPERTY_LEVEL_PATHS`) */
const PROPERTY_LEVEL = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
};

/** 지분-수준 취득측 — 환산 모드 */
const shareValuation = (acqLandPerSqm: number, acqBuildingStd: number, over: object = {}) => ({
  ...PROPERTY_LEVEL,
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
  valuation: shareValuation(1_000_000, 100_000_000),
};
const SHARE_B = {
  shareId: "share-b",
  shareLabel: "40% 지분",
  ownershipRatio: 0.4,
  acquisitionDate: "2015-03-01",
  valuation: shareValuation(1_500_000, 150_000_000),
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

/**
 * 지분 payload 조립.
 *
 * ⚠️ top-level `generalBuildingValuation`은 **shares[0]의 것과 동일하게** 함께 보낸다(설계 D2 확정).
 *    새 분기가 5-a보다 앞에서 가로채므로 계산에 쓰이지 않지만, `engine-input.ts:341`이 읽는
 *    기존 배선을 undefined로 만들지 않기 위해 유지한다.
 */
const fractionalBody = (shares: object[], over: object = {}) => ({
  ...COMMON,
  transferPrice: TOTAL,
  totalPropertyTransferPrice: TOTAL,
  acquisitionDate: SHARE_A.acquisitionDate,
  generalBuildingValuation: SHARE_A.valuation,
  generalBuildingShares: shares,
  ...over,
});

/** 대조군 — 지분 축 없이 100% 단건 (현행 경로) */
const SINGLE_BODY = {
  ...COMMON,
  transferPrice: TOTAL,
  acquisitionDate: SHARE_A.acquisitionDate,
  generalBuildingValuation: SHARE_A.valuation,
};

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

type Apportioned = {
  assetId: string;
  assetLabel: string;
  allocatedSalePrice: number;
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
  standardPriceAtTransfer: number;
};
type Prop = {
  propertyId: string;
  transferGain: number;
  longTermHoldingDeduction: number;
};

async function call(body: object) {
  const res = await POST(req(body));
  const json = await res.json();
  return {
    status: res.status,
    mode: json.data?.mode as string | undefined,
    apportioned: (json.data?.apportionment?.apportioned ?? []) as Apportioned[],
    properties: (json.data?.aggregated?.properties ?? []) as Prop[],
    determinedTax: json.data?.aggregated?.determinedTax as number | undefined,
    totalTax: json.data?.aggregated?.totalTax as number | undefined,
    hasGbDetail: !!json.data?.aggregated?.generalBuildingValuationDetail,
    error: json.error,
  };
}

/** 지분 인덱스 접미사(설계 D5-2)로 카드를 찾는다. */
const findCard = (rows: Apportioned[], prefix: string, shareIdx: number) =>
  rows.find((r) => r.assetId === `${prefix}#${shareIdx}`);

describe("GB × 지분 분할 — Pre-Do anchor", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-02 — 단건 100% 회귀 불변식 (지금도 green · 계속 green이어야 한다)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-02: 단건 100% 골든 (양성 대조군)", () => {
    /**
     * ⚠️ **회귀 방어용 스냅샷이지 「정본 세액」이 아니다.** mock 세율표(`makeMockRates`) 기준
     *    2026-08-10 실측값이다. 지분 축 구현이 이 값을 **원 단위로도 바꾸면 안 된다**는 뜻일 뿐,
     *    이 숫자가 법령상 정답이라는 주장이 아니다.
     *    (메모리 교훈: 골든 anchor는 스스로 「정본 아님」을 적어야 한다.)
     */
    it("현행 단건 경로가 2파트·determinedTax 115,332,000을 낸다", async () => {
      const r = await call(SINGLE_BODY);
      expect(r.status).toBe(200);
      expect(r.mode).toBe("bundled");
      expect(r.hasGbDetail).toBe(true);
      expect(r.apportioned.map((a) => a.assetId)).toEqual(["land", "building"]);
      expect(r.determinedTax).toBe(115_332_000);
      expect(r.totalTax).toBe(126_865_200);
    });

    it("§166⑥ 안분비 50:50 — 픽스처 자체 검증", async () => {
      const r = await call(SINGLE_BODY);
      expect(r.apportioned[0].allocatedSalePrice).toBe(500_000_000);
      expect(r.apportioned[1].allocatedSalePrice).toBe(500_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-01 — 지분 2개 → 파트 4장
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-01: 60%(2009) + 40%(2015) 환산", () => {
    it("파트 4장(지분 2 × 토지·건물)이 나온다", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(r.status).toBe(200);
      expect(r.mode).toBe("bundled");
      expect(r.hasGbDetail).toBe(true);
      expect(r.apportioned).toHaveLength(4);
    });

    it("카드 id에 지분 인덱스 접미사가 붙는다 (설계 D5-2)", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(r.apportioned.map((a) => a.assetId).sort()).toEqual([
        "building#0",
        "building#1",
        "land#0",
        "land#1",
      ]);
    });

    it("카드 라벨에 지분 이름이 들어간다", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(r.apportioned.every((a) => /60% 지분|40% 지분/.test(a.assetLabel))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-03 — Σ 지분 양도가액 = 총양도가 (잔액 흡수, 설계 D5-1)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-03: 양도가액 불변식", () => {
    /**
     * ⚠️ **이 단언 하나만으로는 판별력이 없다** — 2026-08-10 실행에서 발견.
     *
     * 단건 경로도 `500M + 500M = 1,000,000,000`이라 **지분 축이 없어도 통과**한다.
     * `it.fails`로 세웠더니 「Expect test to fail」로 되레 실패했다
     * (메모리 `feedback_anchor_observes_wrong_stage` — anchor가 「어느 단계를 보는가」가 어긋나면 통과한다).
     *
     * ⇒ 순수 Σ 불변식은 **양쪽 세계에서 참**이므로 green `it`(회귀 가드)로 두고,
     *    판별은 아래 3b(카드 수 결합)가 맡는다.
     */
    it("Σ allocatedSalePrice === 총양도가 — 지분 유무와 무관한 불변식", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(r.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0)).toBe(TOTAL);
    });

    it("3b: 파트 4장에 걸쳐 Σ === 총양도가 (지분 축 도달 후에만 성립)", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(r.apportioned).toHaveLength(4);
      expect(r.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0)).toBe(TOTAL);
    });

    it("지분 A = 600,000,000 (토지 300M + 건물 300M)", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(findCard(r.apportioned, "land", 0)?.allocatedSalePrice).toBe(300_000_000);
      expect(findCard(r.apportioned, "building", 0)?.allocatedSalePrice).toBe(300_000_000);
    });

    it("1/3 × 3 지분 — floor 잔액을 마지막 지분이 흡수한다", async () => {
      const third = (id: string, label: string, date: string) => ({
        shareId: id,
        shareLabel: label,
        ownershipRatio: 1 / 3,
        acquisitionDate: date,
        valuation: shareValuation(1_000_000, 100_000_000),
      });
      const r = await call(
        fractionalBody([
          third("s1", "1/3 A", "2009-03-01"),
          third("s2", "1/3 B", "2012-03-01"),
          third("s3", "1/3 C", "2015-03-01"),
        ]),
      );
      expect(r.apportioned).toHaveLength(6);
      expect(r.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0)).toBe(TOTAL);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-04 — 개산공제(영 §163⑥) 지분율 축소
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-04: 개산공제 지분 축소", () => {
    /**
     * 산식(확정 A — `fractional-lump-sum-deduction` 선례): floor(floor(std × ratio) × rate)
     *   지분 A 토지: floor(floor(100,000,000 × 0.6) × 0.03) = 1,800,000
     *   지분 B 토지: floor(floor(150,000,000 × 0.4) × 0.03) = 1,800,000
     */
    it("지분 A 토지 개산공제 = 1,800,000 (100% 3,000,000이 아니다)", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(findCard(r.apportioned, "land", 0)?.allocatedExpenses).toBe(1_800_000);
    });

    it("지분 B 토지 개산공제 = 1,800,000", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(findCard(r.apportioned, "land", 1)?.allocatedExpenses).toBe(1_800_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-05 — 파트별 실가 취득가액 × 지분율 (설계 D3)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-05: 파트별 실가 취득가액 — route는 **받은 값 그대로** 쓴다", () => {
    /**
     * ⚠️ **계층 구분**(2026-08-10 Do 중 정정). × 지분율은 **④ API 변환**이 한다
     *    (`lib/calc/transfer-tax-api-gb-shares.ts` `applyShareScale` — 설계 D3).
     *    UI 안내문(「100% 기준 입력」)과 같은 계층에서 변환해야 3중 mirror가 성립하고,
     *    기존 지분 경로(`transfer-tax-api-helpers.ts`)도 클라에서 스케일한다.
     *
     *    ⇒ route에 100% 기준 값을 보내면 **그대로** 쓰는 것이 정상이다. 여기서 축소를 기대하면
     *    스케일이 두 번 걸린다. ×r 계약은 `__tests__/calc/gb-fractional-api-shares.anchor.test.ts`.
     */
    const SHARE_B_ACTUAL = {
      ...SHARE_B,
      valuation: shareValuation(1_500_000, 150_000_000, {
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 120_000_000, // 변환기가 이미 × 0.4 한 값
        buildingAcquisitionPrice: 80_000_000,
      }),
    };

    it("지분 B(40%) 파트 실가가 그대로 카드에 실린다", async () => {
      const r = await call(fractionalBody([SHARE_A, SHARE_B_ACTUAL]));
      expect(findCard(r.apportioned, "land", 1)?.allocatedAcquisitionPrice).toBe(120_000_000);
      expect(findCard(r.apportioned, "building", 1)?.allocatedAcquisitionPrice).toBe(80_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-06 — mutation probe: 지분 축이 **세액을 실제로 바꾼다**
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-06: 지분 축 소실 탐지 (mutation probe)", () => {
    /**
     * 🔑 **부정 단언에는 양성 대조군이 필요하다**(메모리 `feedback_negative_assertion_needs_mutation_probe`).
     *
     * 지금은 `generalBuildingShares`가 Zod에서 strip되어 지분 payload를 보내도 **단건과 완전히
     * 같은 결과**가 나온다. 그 동일성이 곧 「지분 축이 도달하지 못했다」는 증거다.
     * 구현이 착지하면 두 값은 반드시 달라진다 — 지분 B의 취득시기·기준시가가 다르기 때문이다.
     */
    it("지분 결과 ≠ 단건 결과", async () => {
      const single = await call(SINGLE_BODY);
      const fractional = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(fractional.determinedTax).not.toBe(single.determinedTax);
    });

    /**
     * 구현 착지(2026-08-10) 전에는 이 자리에 「두 결과가 **동일**하다」가 있었다 —
     * `generalBuildingShares`가 Zod에서 strip되던 상태의 실측 증거였다.
     * 이제 지분 축이 도달하므로 **반대**를 고정한다: 지분 B의 취득시기·취득시 기준시가가
     * 다르니 파트 수도 세액도 달라야 한다.
     */
    it("지분 4장 ≠ 단건 2장 — 지분 축이 결과 구조까지 바꾼다", async () => {
      const single = await call(SINGLE_BODY);
      const fractional = await call(fractionalBody([SHARE_A, SHARE_B]));
      expect(single.apportioned).toHaveLength(2);
      expect(fractional.apportioned).toHaveLength(4);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-09 — 증축 × 지분 (설계 D4-1) 🔴 세액 직결
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-09: 증축 前/後 취득 지분", () => {
    const EXTENSION = {
      extensionInfo: {
        extensionDate: "2012-06-01",
        acquisitionMode: "estimated" as const,
        extensionAcquisitionCause: "newConstruction" as const,
        transferExtensionBuildingStdPrice: 50_000_000,
        acquisitionExtensionBuildingStdPrice: 30_000_000,
      },
    };
    // 물건 사건은 **전 지분에 동일하게** 실린다(설계 D1-3) — 적용 여부는 route가 판정(D4).
    const A_BEFORE = { ...SHARE_A, valuation: shareValuation(1_000_000, 100_000_000, EXTENSION) };
    const B_AFTER = { ...SHARE_B, valuation: shareValuation(1_500_000, 150_000_000, EXTENSION) };

    it("지분 A(증축 前 취득)=3파트 + 지분 B(증축 後)=2파트 → 총 5장", async () => {
      const r = await call(fractionalBody([A_BEFORE, B_AFTER]));
      expect(r.apportioned).toHaveLength(5);
      expect(r.apportioned.filter((a) => a.assetId.endsWith("#0"))).toHaveLength(3);
      expect(r.apportioned.filter((a) => a.assetId.endsWith("#1"))).toHaveLength(2);
    });

    /**
     * 🔴 **폴딩은 양도측만**(설계 D4-1). 취득측(`acquisitionBuildingStdPrice`)은 지분-수준이라
     *    사용자가 이미 증축 포함 값을 넣는다 — 양쪽 다 더하면 환산 분자가 이중 계상된다.
     */
    it("증축 後 취득 지분의 양도시 건물 기준시가 = 본체 200M + 증축 50M = 250M", async () => {
      const r = await call(fractionalBody([A_BEFORE, B_AFTER]));
      expect(findCard(r.apportioned, "building", 1)?.standardPriceAtTransfer).toBe(250_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-10 — 용도변경 × 지분 (설계 D4)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-10: 주택→상가 용도변경 後 취득 지분", () => {
    /**
     * 🔑 **3-way 판별 구조**. 「B가 안 움직인다」는 부정 단언만으로는
     * 「용도변경이 애초에 아무것도 안 한다」와 구별되지 않는다
     * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
     *
     * ⚠️ **`wasMultiHouseAtConversion: true`여야 기산일이 움직인다** — `false`면 이동 자체가 없어
     *    게이트를 검증할 수 없다(2026-08-10 실측). 필드 정의: 「true=다주택 → LTHD 기산일 이동」.
     *
     * ⚠️ 절대 공제**율**은 단언하지 않는다 — 이 엔진의 연수 산정은 (실제 연수 − 1)로 나오는데
     *    그것은 **단건 경로와 동일한 기존 동작**이라 이 작업의 검증 대상이 아니다.
     *    대신 **ON/OFF 차분**으로 판정한다(연수 규약과 무관).
     */
    const CONVERSION = {
      houseToCommercialConversion: true,
      conversionDate: "2018-01-01",
      wasMultiHouseAtConversion: true,
    };
    const mkShares = (bDate: string, conv: object) => [
      { ...SHARE_A, valuation: shareValuation(1_000_000, 100_000_000, conv) },
      { ...SHARE_B, acquisitionDate: bDate, valuation: shareValuation(1_500_000, 150_000_000, conv) },
    ];
    const lthdOf = (r: Awaited<ReturnType<typeof call>>, id: string) =>
      r.properties.find((p) => p.propertyId === id)?.longTermHoldingDeduction;

    it("양성 대조군 — 변경 前 취득 지분(A, 2009)은 용도변경으로 LTHD가 줄어든다", async () => {
      const off = await call(fractionalBody(mkShares("2020-03-01", {})));
      const on = await call(fractionalBody(mkShares("2020-03-01", CONVERSION)));
      expect(lthdOf(off, "building#0")).toBeGreaterThan(lthdOf(on, "building#0")!);
    });

    it("🔑 변경 後 취득 지분(B, 2020)은 용도변경 ON/OFF에서 LTHD가 **동일**하다", async () => {
      const off = await call(fractionalBody(mkShares("2020-03-01", {})));
      const on = await call(fractionalBody(mkShares("2020-03-01", CONVERSION)));
      expect(lthdOf(on, "building#1")).toBe(lthdOf(off, "building#1"));
    });

    it("게이트가 **날짜로** 갈린다 — 변경 前 취득(B'=2015)이면 같은 지분도 줄어든다", async () => {
      const off = await call(fractionalBody(mkShares("2015-03-01", {})));
      const on = await call(fractionalBody(mkShares("2015-03-01", CONVERSION)));
      expect(lthdOf(off, "building#1")).toBeGreaterThan(lthdOf(on, "building#1")!);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-11 — §97②2호 단서는 **환산 지분에만** (계획 §3-4 · 실무 확정)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-11: 단서 판정 단위 = 지분 × 파트", () => {
    /**
     * 지분 A(환산) 가목 = 환산취득가 300,000,000 + 개산공제 3,600,000 = 303,600,000
     * 지분 A 나목 = 자본적지출 600,000,000 × 0.6 = 360,000,000  ⇒ 나목 > 가목 → **단서 발동**
     * 지분 B(실가) — 단서 요건「환산취득가액으로 하는 경우」 **밖** ⇒ 미발동(§97②1호 가산)
     *
     * 단서 발동 카드는 환산취득가를 **미차감**한다(`general-building-route-cards.ts:172`)
     * ⇒ `allocatedAcquisitionPrice === 0`이 발동의 관측 지표다.
     */
    // 자본적지출·양도비는 **valuation 안**에 있다(단일 진실 — 변환기가 × r 후 여기에 넣는다).
    const A_CONV = {
      ...SHARE_A,
      valuation: shareValuation(1_000_000, 100_000_000, {
        capitalExpenditure: 360_000_000, // 100% 기준 600,000,000 × 0.6
      }),
    };
    const B_ACTUAL = {
      ...SHARE_B,
      valuation: shareValuation(1_500_000, 150_000_000, {
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        // 변환기가 이미 × 0.4 한 값 (GBF-05 주석 참조)
        landAcquisitionPrice: 120_000_000,
        buildingAcquisitionPrice: 80_000_000,
      }),
    };

    it("환산 지분(A)에서만 단서 발동 — 취득가액 미차감", async () => {
      const r = await call(fractionalBody([A_CONV, B_ACTUAL]));
      expect(findCard(r.apportioned, "land", 0)?.allocatedAcquisitionPrice).toBe(0);
      expect(findCard(r.apportioned, "building", 0)?.allocatedAcquisitionPrice).toBe(0);
    });

    it("실가 지분(B)은 단서에 끌려들어가지 않는다 — 취득가액 유지", async () => {
      const r = await call(fractionalBody([A_CONV, B_ACTUAL]));
      expect(findCard(r.apportioned, "land", 1)?.allocatedAcquisitionPrice).toBe(120_000_000);
      expect(findCard(r.apportioned, "building", 1)?.allocatedAcquisitionPrice).toBe(80_000_000);
    });
  });
});
