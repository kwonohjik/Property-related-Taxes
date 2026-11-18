/**
 * NBL2611-V6-PU01 — 함께 양도 컴패니언 토지의 정밀판정 입력(`nonBusinessLandRaw`)이 서버로 간다.
 * (리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.9 · R02)
 *
 * 종전: `transfer-tax-api-bundled.ts`가 축 B 지분일 때만 raw를 실어, 비지분 컴패니언 토지는 표지(`isNonBusinessLand: true`)만 받았다.
 *   화면 배너가 「무조건 사업용」·「사업용」을 확정해도 서버는 표지만 보고 컴패니언 전량에 +10%p를 붙였다(과대).
 *
 * 시료: 주 자산 토지(표지 없음) + 컴패니언 토지 300㎡(actual 모드 · 양도 4억 · 취득 2억) · 2024-06-03 양도.
 *   - 의제: 공익수용(고시 2020-01-01) · 2014-01-02 취득 → §168의14③3호 나목 무조건 사업용
 *   - 기타토지 사업용: 별도합산 · 건축물 바닥면적 100㎡ × 일반주거 4배 = 400㎡ ≥ 300㎡
 *   - 부분 초과: 건축물 바닥면적 15㎡ × 4배 = 60㎡ → 초과 240㎡ = 0.8 (0.4 시료는 §104⑤ 1호 합산 누진이 흡수해 표지 유무 차이 0 — 리뷰 §1.8)
 * 대조군 = 같은 컴패니언의 표지만 끈 값(`isNonBusinessLand: false`) — 판정이 «사업용»이면 표지를 끈 값과 같아야 한다.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EXPROPRIATION = {
  transferCause: "public_expropriation",
  expropriationNoticeDate: "2020-01-01",
  nblExemptPublicExpropriation: true,
} as Partial<AssetForm>;
const OTHER_LAND = {
  nblLandType: "other_land",
  nblZoneType: "general_residential",
  nblOtherHasBuilding: true,
  nblOtherPropertyTaxType: "separate",
  nblOtherBuildingValue: "50000000",
  nblOtherLandValue: "400000000",
} as Partial<AssetForm>;

/** 컴패니언 토지 카드(자산 2) — `over`가 표지·정밀판정 입력을 정한다. */
function form(over: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-03";
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "700,000,000";
  f.bundledSaleMode = "actual";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300",
    fixedAcquisitionPrice: "280,000,000", actualSalePrice: "300,000,000", addressJibun: "서울 강남구 테스트동 1",
  } as AssetForm;
  f.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2014-01-02", acquisitionArea: "300",
    transferArea: "300", fixedAcquisitionPrice: "200,000,000", actualSalePrice: "400,000,000", addressJibun: "서울 강남구 테스트동 2",
    ...over,
  } as AssetForm);
  return f;
}

type Prop = { propertyId: string; nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean; areaProportioning?: { nonBusinessRatio: number } } };
async function run(over: Partial<AssetForm>) {
  const r = await runCalc(form(over));
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  const agg = (r.json as Loose).data.aggregated as { totalTax: number; properties: Prop[] };
  const companion = (r.body.companionAssets as Loose[])[0];
  return {
    issues: r.issues,
    raw: companion.nonBusinessLandRaw as Loose | undefined,
    flag: companion.isNonBusinessLand as boolean | undefined,
    total: agg.totalTax,
    nbl: agg.properties.find((p) => p.propertyId !== "primary")?.nonBusinessLandJudgmentDetail,
  };
}

const OFF = { isNonBusinessLand: false } as Partial<AssetForm>;
const ON = { isNonBusinessLand: true, nblUseDetailedJudgment: true } as Partial<AssetForm>;

describe("NBL2611-V6-PU01 · 컴패니언 토지 정밀판정 raw 전송", () => {
  it("P1 의제 성립(공익수용 · 나목): raw가 실려 «사업용» — 표지를 끈 값과 같다(종전: 표지만 가 전량 +10%p)", async () => {
    const off = await run({ ...OFF, ...EXPROPRIATION });
    const on = await run({ ...ON, ...EXPROPRIATION });
    expect(on.issues).toEqual([]);
    expect(on.flag).toBe(true);
    expect(on.raw).toBeDefined();
    expect(on.nbl?.isNonBusinessLand).toBe(false);
    expect(on.total).toBe(off.total);
    expect(on.total).toBe(49_920_200); // 종전 62,216,000(+12,295,800)
  });

  it("P2 기타토지 사업용(별도합산 · 배율 이내): raw가 실려 «사업용» — 표지를 끈 값과 같다", async () => {
    const own = { ...OTHER_LAND, nblOtherBuildingFloorArea: "100" } as Partial<AssetForm>;
    const off = await run({ ...OFF, ...own });
    const on = await run({ ...ON, ...own });
    expect(on.issues).toEqual([]);
    expect(on.raw).toBeDefined();
    expect(on.nbl?.isNonBusinessLand).toBe(false);
    expect(on.total).toBe(off.total);
    expect(on.total).toBe(49_920_200); // 종전 62,216,000(+12,295,800)
  });

  it("P3 부분 초과(배율 초과 0.8): raw가 실려 초과분(0.8)만 비사업용 — 표지만 보낸 값(전량 비사업용)보다 작다", async () => {
    const own = { ...OTHER_LAND, nblOtherBuildingFloorArea: "15" } as Partial<AssetForm>;
    const off = await run({ ...OFF, ...own });
    const on = await run({ ...ON, ...own });
    expect(on.issues).toEqual([]);
    expect(on.raw).toBeDefined();
    expect(on.nbl?.isNonBusinessLand).toBe(true);
    expect(on.nbl?.areaProportioning?.nonBusinessRatio).toBe(0.8);
    expect(on.total).toBeGreaterThan(off.total);
    // 종전(표지만 → 컴패니언 전량 +10%p)은 62,216,000이었다 — 초과분(0.8)만 중과하면 51,408,500
    expect(on.total).toBe(51_408_500);
    expect(on.total).toBeLessThan(62_216_000);
  });
});
