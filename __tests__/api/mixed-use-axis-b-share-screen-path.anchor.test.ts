/**
 * anchor — 겸용주택 × 지분 분할 취득(축 B) **화면 경로** (계획서 `bg-mixed-use-m2-bundle-share.plan.md` V-0).
 *
 * 둘째 이후 지분 카드는 `makeDefaultAsset`로 생기고 ① 기본정보(겸용 토글 · 면적)가 숨는다. 종전 병합(`mergePrimaryBasic`)은 `assetKind`만 이어
 * ④가 그 지분을 **일반 주택**으로 보냈다 — ⑧ 0건으로 계산되며 상가분까지 주택으로 보고 12억 안분 · 부수토지 초과분을 비과세했다
 * (V-0 실측: 고가 −20,220,815 · 12억 이하 −1,765,771).
 *
 * 기존 FB anchor(`mixed-use-fractional-axis-b.anchor.test.ts`)는 두 카드에 겸용 칸을 **직접** 넣는다 — 그 값이 정답(oracle)이다.
 * 화면 상태 = 지분 카드에 **취득 쪽 칸만**(취득일 · 취득가액 · 취득시 기준시가) 있고 물건 단위 칸(겸용 여부 · 면적 · 용도지역 · 양도시 가격)은 없다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { allIssues } from "../calc/_one-house-pr3a-calc-route";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 물건 단위 칸 — 자산 1(① 기본정보 · ③ 양도시 기준시가)에서만 입력한다. */
const OBJECT = {
  assetKind: "housing", isMixedUseHouse: true, mixedZoneType: "green",
  residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "300",
  mixedTransferHousingPrice: "1600000000", mixedTransferCommercialBuildingPrice: "200000000", mixedTransferLandPricePerSqm: "1000000",
};
/** 취득 쪽 칸 — 지분마다 자기 카드에서 입력한다(취득일이 다를 수 있다). 금액은 물건 전체 기준(④가 ×지분율). */
const ACQ_2009 = {
  acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "500000000", capitalExpenditure: "100000000", transferExpense: "20000000",
  mixedAcqHousingPrice: "400000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "300000",
};
const ACQ_2015 = {
  acquisitionCause: "purchase", acquisitionDate: "2015-05-01", useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "900000000", capitalExpenditure: "0", transferExpense: "20000000",
  mixedAcqHousingPrice: "700000000", mixedAcqCommercialBuildingPrice: "80000000", mixedAcqLandPricePerSqm: "600000",
};
const LOW = { mixedTransferHousingPrice: "500000000", mixedTransferCommercialBuildingPrice: "150000000", mixedTransferLandPricePerSqm: "800000" };
const OK = { addressJibun: "제주특별자치도 강남구 테스트동 1-1" };
/** 지분별 취득일이 다르면 ⑧이 거주 구간(입주일 · 퇴거일)을 요구한다 — 두 지분 모두 2015-05-01부터 거주. */
const RES = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2015-05-01", moveOutDate: "2024-06-01" }] };
const R = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });

function form(assets: Record<string, unknown>[], extra: Record<string, unknown> = {}): TransferFormData {
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), assets, transferDate: "2024-06-01", filingDate: "2024-08-31",
    contractTotalPrice: "2000000000", householdHousingCount: "1", isOneHousehold: true,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
  } as unknown as TransferFormData);
}
const card = (i: number, ...o: Record<string, unknown>[]) => Object.assign({ ...makeDefaultAsset(i) }, OK, RES, ...o);
const AXIS_B = { assetSplitMode: "fractional" };

async function run(f: TransferFormData) {
  let captured: Loose = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  } finally {
    global.fetch = orig;
  }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }));
  return { body: captured, status: res.status, j: (await res.json()) as Loose };
}

/**
 * 화면 · 정답 한 쌍. 취득시 주택건물 기준시가(나목)는 **취득 쪽 칸**이라 지분 카드가 직접 입력한다 — 정답 카드에 항등 헬퍼가 채운 값을
 * 화면 카드에 그대로 옮긴다(사용자가 그 지분 카드에 입력한 값).
 */
function pair(low: Record<string, unknown>, acq2: Record<string, unknown>, lc: Record<string, unknown> = {}) {
  const oracle = form([card(1, OBJECT, low, ACQ_2009, R("60")), card(2, OBJECT, low, acq2, R("40"))], { ...AXIS_B, ...lc });
  const acqN = { mixedAcqHousingBuildingStdPrice: (oracle.assets[1] as Loose).mixedAcqHousingBuildingStdPrice };
  const screen = form([card(1, OBJECT, low, ACQ_2009, R("60")), card(2, acq2, acqN, R("40"))], { ...AXIS_B, ...lc });
  return { screen, oracle };
}

/** 화면 상태 — 둘째 지분 카드는 취득 쪽 칸만. 정답 — 같은 카드에 물건 단위 칸을 직접 넣은 것(FB 픽스처 방식). */
const cases = [
  { name: "A 고가 · 같은 취득", lc: {}, low: {}, acq2: ACQ_2009, sameAcq: true },
  { name: "B 12억 이하(부수토지 초과분) · 같은 취득", lc: { contractTotalPrice: "900000000" }, low: LOW, acq2: ACQ_2009, sameAcq: true },
  { name: "C 고가 · 지분 2는 2015년 다른 가격으로 취득", lc: {}, low: {}, acq2: ACQ_2015, sameAcq: false },
] as const;

describe("겸용 × 축 B 화면 경로 — 지분 카드가 물건 단위 겸용 칸을 첫 카드에서 잇는다", () => {
  for (const c of cases) {
    it(`[${c.name}] ⑧ 0건 · 화면 경로 총세액 = 두 카드에 겸용 칸을 직접 넣은 정답`, async () => {
      const { screen, oracle } = pair(c.low, c.acq2, c.lc);
      expect(allIssues(screen as never)).toEqual([]);
      expect(allIssues(oracle as never)).toEqual([]);
      const s = await run(screen);
      const o = await run(oracle);
      expect(s.status).toBe(200);
      expect(o.status).toBe(200);
      // 지분 카드는 겸용으로 간다 — 종전 「housing · mixedUse 없음」
      expect(s.body.companionAssets[0].propertyType ?? s.body.companionAssets[0].assetKind).toBe("mixed_use_house");
      expect(s.body.companionAssets[0].mixedUse).toBeDefined();
      expect(s.j.data.aggregated.totalTax).toBe(o.j.data.aggregated.totalTax);
      // 같은 취득이면 정답은 단건 100%와 독립 대조된다 — 다건 `totalTax`는 산출세액 + 지방소득세(10%)라 단건 × 1.1(원 미만 절사)
      if (c.sameAcq) {
        const one = await run(form([card(1, OBJECT, c.low, ACQ_2009)], c.lc));
        expect(one.j.data.mode).toBe("mixed-use");
        // 축 B는 지분 카드마다 원 미만을 절사해 합한다 — 단건과 수 원 차이는 법령상 올바른 절사(V-P1b-2 완료 처리). 이 차이보다 큰 어긋남만 결함이다.
        const diff = s.j.data.aggregated.totalTax - Math.floor(one.j.data.result.total.transferTax * 1.1);
        expect(Math.abs(diff)).toBeLessThanOrEqual(2);
      }
    });
  }

  it("[C] 🔑 취득 쪽은 지분 카드 값이다 — 첫 카드의 취득시 기준시가 · 취득가액으로 덮지 않는다", async () => {
    const s = await run(pair({}, ACQ_2015).screen);
    const mu0 = s.body.mixedUse as Loose;
    const mu1 = s.body.companionAssets[0].mixedUse as Loose;
    // 정답 카드도 병합을 지나므로 총세액 대조만으로는 «취득 쪽까지 병합»을 못 잡는다 — 지분 카드 값을 직접 고정한다(뮤테이션 실측: 취득 3칸 병합 시 74,332,369 → 75,279,053).
    expect(mu1.acquisitionStandardPrice).toMatchObject({ housingPrice: 700_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 600_000 });
    expect(mu0.acquisitionStandardPrice).toMatchObject({ housingPrice: 400_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 300_000 });
    expect(s.j.data.aggregated.totalTax).toBe(74_332_369);
    expect(mu1.acquisitionActualTotalPrice).toBe(360_000_000); // 900,000,000 × 40%
    // 물건 단위는 첫 카드 값(양도시 주택가격 · 면적)
    expect(mu1.transferStandardPrice).toEqual(mu0.transferStandardPrice);
    expect(mu1.totalLandArea).toBe(300);
  });
});
