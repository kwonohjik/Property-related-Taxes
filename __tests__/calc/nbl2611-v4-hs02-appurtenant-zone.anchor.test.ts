/**
 * NBL2611-V4-HS02 — 함께 양도 부수토지 카드: 소재지 미선택이면 최소 배율(3배)이 조용한 기본값이 되던 것을 ⑧·⑫로 막는다.
 * (리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.7 · R02)
 *
 * 종전: ⑧ `appurtenantZoneRequiredError`는 주택 카드 «자기 토지»만 정착면적 × 3과 비교했다. 주택 카드에 토지가 없고(또는 한도 이내이고)
 *   같은 묶음의 부수토지 카드가 한도를 넘는 경우 소재지 미선택이 통과해, 컴패니언 분리(`resolveCompanionSplit`)가 default 3배로 한도를 잡았다.
 *   수도권 밖(5배) 시료에서 5배 한도 이내인 토지가 초과분(비사업용 토지)으로 과세됐다. 응답에는 배율·소재지 고지가 없다.
 * 규칙: 「주택 카드 토지(본인 소유일 때) + 같은 묶음 부수토지 카드 면적 합계 > 정착면적 × 3」이면 소재지 구분이 필수다(⑧). ⑫는 같은 술어로 직접 API도 400.
 *   엔진 default를 «판정 생략»으로 바꾸지 않는다(조용한 비과세).
 *
 * 시료: 주택 2014-01-01 취득 · 2026-02-16 양도 · 정착면적 100㎡(3배 한도 300㎡ · 5배 한도 500㎡) · 부수토지 카드 400㎡(취득 2억 · 양도 4억).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { postTransfer, runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function form(houseOver: Loose = {}, landOvers: Loose[] = [{}]) {
  const f = createDefaultTransferFormData();
  const house = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    standardPriceAtTransfer: "500000000",
    addressJibun: "전북 전주시 덕진구 테스트동 1",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    buildingFootprintArea: "100",
    ...houseOver,
  } as unknown as AssetForm;
  const lands = landOvers.map((o, i) => ({
    ...makeDefaultAsset(i + 2),
    assetKind: "land",
    landNature: "appurtenant",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "200000000",
    actualSalePrice: "400000000",
    standardPriceAtTransfer: "200000000",
    addressJibun: "전북 전주시 덕진구 테스트동 1",
    acquisitionArea: "400",
    transferArea: "400",
    ...o,
  })) as unknown as AssetForm[];
  return {
    ...f,
    transferDate: "2026-02-16",
    contractTotalPrice: String(1_000_000_000 + 400_000_000 * lands.length),
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "60",
    assets: [house, ...lands],
  } as never;
}

const ZONE5 = { appurtenantLandZone: "non_metropolitan_or_green" };
const zoneIssues = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => i.field === "appurtenantLandZone");
const totalOf = (r: Awaited<ReturnType<typeof runCalc>>): number => r.json.data.aggregated.totalTax;

describe("NBL2611-V4-HS02 · 부수토지 카드 합계 기준 소재지 필수", () => {
  it("H1 기준 — 소재지 5배 선택: 한도 500㎡ ≥ 400㎡ → 초과 없음 · 총세액 기준값", async () => {
    const r = await runCalc(form(ZONE5));
    expect(zoneIssues(r)).toEqual([]);
    expect(r.status).toBe(200);
    expect(totalOf(r)).toBe(H1_TOTAL);
  });

  it("H2 ⑧ — 소재지 미선택 + 부수토지 카드 400㎡ > 정착면적 × 3(300㎡) → 「자산 1」 소재지 구분 칸으로 차단(종전: 통과 · 3배 default로 초과 100㎡ 과세)", async () => {
    const r = await runCalc(form({}));
    const hit = zoneIssues(r);
    expect(hit.length, JSON.stringify(r.issues)).toBe(1);
    expect(hit[0].message).toContain("자산 1");
    expect(hit[0].message).toContain("부수토지");
  });

  it("H3 ⑫ — API 직접 호출도 소재지 없이 부수토지가 3배를 넘으면 400 (종전: 200 · 총세액 과대)", async () => {
    const ok = await runCalc(form(ZONE5));
    const body = { ...ok.body };
    delete (body as Loose).appurtenantLandZone;
    const res = await postTransfer(body as Loose);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("소재지");
  });

  it("H4 합계가 3배 이하면 소재지를 요구하지 않는다(차단 범위 최소화) — 부수토지 카드 250㎡", async () => {
    const r = await runCalc(form({}, [{ acquisitionArea: "250", transferArea: "250" }]));
    expect(zoneIssues(r)).toEqual([]);
    expect(r.status).toBe(200);
  });

  it("H5 주택 카드 자기 토지 + 부수토지 카드 합계 — 자기 토지 150㎡ + 카드 200㎡ = 350㎡ > 300㎡ → 차단 (종전: 자기 토지만 비교해 통과)", async () => {
    const r = await runCalc(form({ acquisitionArea: "150", transferArea: "150" }, [{ acquisitionArea: "200", transferArea: "200" }]));
    expect(zoneIssues(r).length, JSON.stringify(r.issues)).toBe(1);
  });

  it("H6 토지가 없는 건물만 본인 주택 — 부수토지 카드 합계만으로 판단한다(자기 토지는 세지 않는다)", async () => {
    const own = { selfOwns: "building_only", buildingOwnerSameHousehold: true, acquisitionArea: "500", transferArea: "500" };
    const over = await runCalc(form(own));
    expect(zoneIssues(over).length, JSON.stringify(over.issues)).toBe(1);
    const within = await runCalc(form(own, [{ acquisitionArea: "250", transferArea: "250" }]));
    expect(zoneIssues(within)).toEqual([]);
  });

  it("H7 부수토지 카드 둘의 합계 — 각 카드는 한도 이내(200㎡씩)여도 합계 400㎡ > 300㎡면 차단", async () => {
    const two = [{ acquisitionArea: "200", transferArea: "200" }, { acquisitionArea: "200", transferArea: "200" }];
    const r = await runCalc(form({}, two));
    expect(zoneIssues(r).length, JSON.stringify(r.issues)).toBe(1);
    const ok = await runCalc(form(ZONE5, two));
    expect(zoneIssues(ok)).toEqual([]);
  });

  it("H8 독립 나대지(landNature=standalone) 카드는 합계에 들지 않는다", async () => {
    const r = await runCalc(form({}, [{ landNature: "standalone" }]));
    expect(zoneIssues(r)).toEqual([]);
  });
});


describe("NBL2611-V6-PU01 후속 · 부수토지 카드가 쥔 정밀판정은 배율 초과분을 사업용으로 만들지 않는다", () => {
  const NBL_BUSINESS = {
    isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
    nblOtherHasBuilding: true, nblOtherPropertyTaxType: "separate", nblOtherBuildingValue: "50000000", nblOtherLandValue: "400000000",
    nblOtherBuildingFloorArea: "200",
  };
  const ZONE3 = { appurtenantLandZone: "metropolitan_residential" };
  const excessOf = (r: Awaited<ReturnType<typeof runCalc>>) => r.json.data.aggregated.properties.find((p: Loose) => String(p.propertyId).endsWith("__excess"));

  it("U1 3배 지역 · 카드 400㎡(한도 300㎡) · 카드가 정밀판정(별도합산 «사업용»)을 쥐어도 초과 100㎡는 §104①8호로 과세 — 판정이 없는 카드와 같은 값", async () => {
    const plain = await runCalc(form(ZONE3));
    const detailed = await runCalc(form(ZONE3, [NBL_BUSINESS]));
    expect(detailed.status).toBe(200);
    expect(excessOf(detailed).rateClause).toBe("104-1-8");
    expect(totalOf(detailed)).toBe(totalOf(plain));
    expect(totalOf(plain)).toBe(11_704_785);
  });
});

/** 소재지 5배 선택 기준 총세액(수도권 밖 5배 — 한도 500㎡ ≥ 400㎡ · 초과 없음). */
const H1_TOTAL = 4_801_500;
