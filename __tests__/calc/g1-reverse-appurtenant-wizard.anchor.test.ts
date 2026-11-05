/**
 * G1 — 사례 28 역방향(첫 자산 주택부수토지 · 주택은 함께 양도) **화면 경로** anchor: 폼 → ⑧ → ④ → route → 엔진.
 *
 * 화면은 이 구성을 **막고 주택을 첫 자산으로 넣도록 안내한다**(⑧ `transfer-tax-validate-asset.ts`). 보유 상황 단계의 1세대1주택 판정 입력
 * (세대·주택 수·거주기간·취득 당시 조정대상지역·일시적 2주택 등)이 첫 자산이 주택일 때만 열려, 그대로 계산하면 숨은 기본값(1세대 해당 · 1주택 ·
 * 조정대상지역 아님 — 조정대상지역 리셋 effect가 false로 둔다)으로 주택·토지가 통째로 비과세된다(검토 실측: 조정대상지역 2018 취득 · 거주 0 ·
 * 배율 이내 300㎡ — 주택 먼저 173,646,000, 토지 먼저 0 · 안내 없음). 주택 먼저 순서는 같은 사실을 #17 K1 경로로 계산한다.
 *
 * route 단위 parity(API 본문으로 들어온 역방향 구성): `__tests__/api/transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts`.
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
import { runCalc, allIssues, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form, aggOf, blocked, type Agg } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { reverseAppurtenantHouseAssetId } from "@/lib/calc/reverse-appurtenant-house";
import { reverseAppurtenantSwapPatch } from "@/lib/calc/reverse-appurtenant-swap";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("G1 화면 경로 — 첫 자산 주택부수토지 + 함께 양도 주택 1건은 막고 주택 먼저 입력을 안내", () => {
  it("짝 주택 판정 leaf — 주택 계열 컴패니언이 일반 주택 1건일 때만", () => {
    const a = (o: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...o }) as never;
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0))])).toBe("h1");
    expect(reverseAppurtenantHouseAssetId([a({ ...LAND("l1", 1), landNature: "standalone" }), a(HOUSE(0))])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a(HOUSE(0)), a({ ...HOUSE(0), assetId: "h2" })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(LAND("l1", 1)), a({ ...HOUSE(0), isMixedUseHouse: true })])).toBeUndefined();
    expect(reverseAppurtenantHouseAssetId([a(HOUSE(0)), a(LAND("l1", 1))])).toBeUndefined();
  });

  it("🔑 ⑧ — 토지 먼저는 1단계(자산)에서 막는다 · 첫 자산의 토지 성격 칸 · 주택 먼저는 막지 않는다", () => {
    const rv = blocked(allIssues(form(LAND("l1", 300), HOUSE(0))));
    expect(rv).toHaveLength(1);
    expect(rv[0]).toMatchObject({ step: 0, field: "landNature" });
    expect(rv[0].message).toContain("주택을 첫 자산으로, 이 토지를 함께 양도하는 자산(주택부수토지)으로 입력하세요");
    expect(blocked(allIssues(form(HOUSE(0), LAND("l1", 300))))).toEqual([]);
    // 부수토지 컴패니언이 더 있어도 막는 자리는 첫 자산 하나다(같은 안내를 카드마다 되풀이하지 않는다).
    const many = blocked(allIssues(form(LAND("l1", 200), HOUSE(0), LAND("l2", 200))));
    expect(many).toHaveLength(1);
  });

  it("🔑 숨은 기본값 비과세 차단 — 조정대상지역 2018 취득 · 거주 0: 주택 먼저는 과세(거주요건 미충족), 토지 먼저는 계산 전에 막힌다", async () => {
    const reg = { acquisitionDate: "2018-01-02", residencePeriodMonthsAsset: "0", residencePeriodMonths: "0" };
    const f = (...assets: Record<string, unknown>[]) =>
      ({ ...(form(...assets) as object), wasRegulatedAtAcquisition: true, wasRegulatedAtAcquisitionTouched: true, residencePeriodMonths: "0" }) as never;
    const fw = await runCalc(f({ ...HOUSE(0), ...reg }, { ...LAND("l1", 300), acquisitionDate: "2018-01-02" }));
    expect(fw.issues).toEqual([]);
    expect(aggOf(fw).totalTax).toBeGreaterThan(0);
    expect(aggOf(fw).properties.some((p) => p.isExempt)).toBe(false);
    const rv = allIssues(f({ ...LAND("l1", 300), acquisitionDate: "2018-01-02" }, { ...HOUSE(0), ...reg }));
    expect(blocked(rv)).toHaveLength(1);
  });

  /**
   * 🔄 반전(NH-14 · 사용자 결정 Q-24) — 종전 단언은 「짝 주택을 정할 수 없는 구성(주택 2건 · 겸용)은 막지 않는다」였다. 그 구성도 첫 자산이 토지라
   * ① 세대·주택 현황이 숨고 주택이 숨은 기본값으로 판정됐다. G1 문구(`blocked`)로는 여전히 막지 않고(짝 주택이 아니다), NH-14 문구로 막는다 —
   * G1 문구만 보는 `toEqual([])`는 넓힌 차단이 있어도 통과하므로 NH-14 문구를 따로 단언한다.
   */
  it("🔄 짝 주택을 정할 수 없는 구성(함께 양도 주택 2건 · 겸용주택)은 G1 문구가 아니라 NH-14 문구로 막는다", () => {
    for (const f of [form(LAND("l1", 300), HOUSE(0), { ...HOUSE(0), assetId: "h2" }), form(LAND("l1", 300), { ...HOUSE(0), isMixedUseHouse: true })]) {
      const issues = allIssues(f);
      expect(blocked(issues)).toEqual([]);
      expect(nh14(issues)).toHaveLength(1);
    }
  });

  it("④ — 짝 주택(신축 아님)에는 정착면적을 싣지 않는다(화면에서 역방향 단위를 만들지 않는다 · 종전 동작)", async () => {
    const body = await captureBody(form(LAND("l1", 400), HOUSE(0)));
    const house = (body.companionAssets as Record<string, unknown>[]).find((c) => c.assetKind === "housing")!;
    expect(house.buildingFootprintArea).toBeUndefined();
  });

  it("결과뷰 — 신고서 양식의 `primary__appurtenant`·`primary__excess` 열은 첫 자산(토지)의 취득일을 쓴다(컴패니언 분리 열과 같은 규약 · route가 API 본문으로 이 구성을 받은 경우)", async () => {
    const f = form({ ...LAND("l1", 400), acquisitionDate: "2012-05-05" }, HOUSE(0));
    const body = await captureBody(f);
    // route 단위를 만드는 사실(짝 주택 정착면적·소재지 구분) — 화면 ④는 싣지 않으므로 본문에 직접 넣는다.
    const withFootprint = {
      ...body,
      companionAssets: (body.companionAssets as Record<string, unknown>[]).map((c) =>
        c.assetId === "h1" ? { ...c, buildingFootprintArea: 100, appurtenantLandZone: "metropolitan_residential", isUrbanArea: true } : c,
      ),
    };
    const r = await postTransfer(withFootprint);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated as Agg;
    const rows = buildAggregateRows(
      {} as unknown as TransferTaxResult,
      { properties: agg.properties, aggregated: agg } as unknown as AggregateMeta,
      f,
    );
    const acq = rows.find((row) => row.label === "취득일자")!.values as Record<string, unknown>;
    expect(acq["primary__appurtenant"]).toBe("2012-05-05");
    expect(acq["primary__excess"]).toBe("2012-05-05");
    expect(acq["h1"]).toBe("2014-01-02");
  });
});

/** NH-14 ⑧ 문구의 식별 부분 문자열. */
const NH14 = "첫 자산이 주택이 아니고 주택을 함께 양도하는 자산으로 넣으면";
const nh14 = (issues: { step: number; field?: string; message: string }[]) => issues.filter((i) => i.message.includes(NH14));

/**
 * NH-14(사용자 결정 Q-24) — 첫 자산이 주택 계열이 아니고 주택을 함께 양도하면 ① 세대·주택 현황이 열리지 않아, 함께 양도한 주택이 숨은 기본값
 * (1세대 해당 · 1주택 · 거주 0 · 조정대상지역 아님)으로 1세대1주택 판정을 받았다. G1(부수토지 + 일반 주택 1건)만 막던 ⑧을 넓힌다.
 */
describe("NH-14 — 첫 자산이 주택이 아닌 함께 양도는 막고 주택 먼저로 안내", () => {
  const SA = { ...LAND("l1", 300), landNature: "standalone" };
  const OTHER = { id: "o1", region: "non_capital", regionCode: "4682025021", acquisitionDate: "2015-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false };
  const withFacts = (f: never, o: object) => ({ ...(f as object), ...o }) as never;
  /** 실제 세대 사실 — 다른 주택 1채(주택 먼저에서만 입력할 수 있다) */
  const TWO = { houses: [OTHER], householdHousingCount: "2", householdNoOtherHousesConfirmed: false };
  /** 토지 먼저에서 사용자가 볼 수 없는 기본값 그대로 */
  const HIDDEN = { householdHousingCount: "1", householdNoOtherHousesConfirmed: false, residencePeriodMonths: "0" };

  it("💰 숨은 기본값 비과세 — 독립 나대지 먼저 18,628,500(⑧ 없음이던 값) vs 주택 먼저 154,286,000 · 이제 토지 먼저는 1단계에서 막힌다", async () => {
    const rv = await runCalc(withFacts(form(SA, HOUSE(0)), HIDDEN));
    expect(aggOf(rv).totalTax).toBe(18_628_500); // route는 그대로 계산한다 — 막는 곳은 ⑧
    const issues = nh14(rv.issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ step: 0, field: "assetKind" });
    const fw = await runCalc(withFacts(form(HOUSE(0), SA), TWO));
    expect(nh14(fw.issues)).toEqual([]);
    expect(aggOf(fw).totalTax).toBe(154_286_000);
  });

  it("🔑 넓힌 범위 — 독립 나대지·재개발 완공주택·일반건물 먼저도 막는다 · G1 구성은 G1 문구 하나만", () => {
    expect(nh14(allIssues(form(SA, HOUSE(0))))).toHaveLength(1);
    expect(nh14(allIssues(form(LAND("l1", 300), { ...HOUSE(0), assetKind: "redevelopment_apt" })))).toHaveLength(1);
    expect(nh14(allIssues(form({ ...SA, assetKind: "general_building", landNature: undefined }, HOUSE(0))))).toHaveLength(1);
    const g1 = allIssues(form(LAND("l1", 300), HOUSE(0)));
    expect(blocked(g1)).toHaveLength(1);
    expect(nh14(g1)).toEqual([]);
  });

  it("💰 전환 버튼 — 독립 나대지 먼저를 바꾸면 주택 먼저 폼과 같은 세액 154,286,000 · ⑧ 없음", async () => {
    const f = withFacts(form(SA, HOUSE(0)), TWO) as TransferFormData;
    const p = reverseAppurtenantSwapPatch(f, "h1")!;
    const sw = await runCalc({ ...f, ...p } as never);
    expect(nh14(sw.issues)).toEqual([]);
    expect(aggOf(sw).totalTax).toBe(154_286_000);
  });

  it("형제 안전망 — 주택 먼저 · 주택 없는 토지 묶음 · 지분 분할 묶음은 막지 않는다", () => {
    expect(nh14(allIssues(form(HOUSE(0), SA)))).toEqual([]);
    expect(nh14(allIssues(form(SA, { ...SA, assetId: "l2" })))).toEqual([]);
    const frac = { ...(form({ ...SA, ownershipNumerator: "50", ownershipDenominator: "100" }, { ...SA, assetId: "l2", ownershipNumerator: "50", ownershipDenominator: "100" }) as object), assetSplitMode: "fractional" } as never;
    expect(nh14(allIssues(frac))).toEqual([]);
  });
});
