/**
 * anchor(화면 경로 ④⑧⑫⑭) — 주택 축 B(같은 주택 지분 분할) 둘째 이후 지분의 «부수토지 소재지 구분» 막다른 길 해소 (NBL2611-C7).
 *
 * 지분 카드는 ① 기본정보를 숨겨 `appurtenantLandZone` 칸이 없는데 `mergePrimaryBasic`도 병합하지 않았다. 건물 정착면적(`buildingFootprintArea`)·토지 면적은
 * 병합되므로 토지 면적이 정착면적의 3배를 넘으면 ⑧(V9)이 «자산 2: 소재지 구분을 선택하세요»로 막는데 고칠 칸이 없었다(CLAUDE.md ⑧ UI↔validate 막다른 길).
 * 직접 API로 소재지 구분이 빠지면 엔진은 지분 초과분을 판정하지 않고 «확인 필요»만 냈다 — 같은 시료에서 둘째 지분이 비과세로 새었다.
 *
 * 수정 = `mergePrimaryBasicAll`이 일반 주택 첫 카드의 값을 병합한다(소재지 구분은 같은 땅의 성질 — 물건 단위). ⑫⑭는 `companionHousingLand.zone`으로 이미 수용.
 * 새 입력 칸 없음 · 병합 소비처 실측은 이 파일 말미 «병합 소비처» 블록이 고정한다.
 *
 * 정답(oracle) = ① 지분 카드에 소재지 구분을 직접 넣은 폼 ② 같은 주택을 100% 단건으로 넣은 폼(지분 분할이 땅의 성질을 바꾸지 않는다).
 * 수정 전 수치는 같은 시료를 수정 없이 돌린 실측이다(2026-11-21). 금액은 mock 세율표 실측값이지 정본 세액이 아니다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (io) => {
  const actual = await io<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CB_PART_FORM_LAND_ONLY } from "../tax-engine/_helpers/cb-part-basis";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Over = Record<string, unknown>;

async function post(body: Loose) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  const agg = j?.data?.aggregated ?? {};
  return {
    status: res.status,
    j,
    total: (agg.totalTax ?? j?.data?.result?.totalTax) as number,
    props: (agg.properties ?? []) as Loose[],
    warnings: (agg.warnings ?? []) as string[],
  };
}
async function run(f: TransferFormData) {
  const body = (await captureBody(f as never)) as Loose;
  return { ...(await post(body)), body, shareLand: body.companionAssets?.[0]?.companionHousingLand as Loose | undefined };
}
const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f as never)).map((i) => `${i.assetIndex ?? "-"}:${i.field ?? ""}`);
const ZONE_MISSING = /소재지 구분이 없어 배율 한도/;
const NOTICE_MISSING = /사업인정 고시일이 입력되지 않아/;
const USE_PROHIBITED = { reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "2023-12-31", description: "" };

// ── 주택 지분 (G-2 별개취득 · 1세대1주택 · 토지 3,000㎡ / 정착 100㎡ / 수도권 주거 3배 → 초과 2,700㎡ · 지분 10% / 90%) — C6 anchor와 같은 시료 ──
const hShare = (n: number, o: Over = {}) =>
  ({
    ...makeDefaultAsset(n), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2014-01-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "450,000,000", buildingAcquisitionPrice: "50,000,000", actualSalePrice: "1,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000", landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "300,000,000", ownershipNumerator: n === 1 ? "10" : "90", ownershipDenominator: "100",
    residenceInputMode: "direct", residencePeriodMonthsAsset: "0", ...o,
  }) as unknown as AssetForm;
const H_OBJECT = { acquisitionArea: "3000", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential" };
const ZONE = { appurtenantLandZone: "metropolitan_residential" };
const H_EXPRO = { transferCause: "public_expropriation", expropriationNoticeDate: "2021-03-01" };
const BASE = {
  transferDate: "2024-09-01", filingDate: "2024-11-30", contractTotalPrice: "1000000000", isOneHousehold: true, householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0",
};
/** 첫 카드만 소재지 구분을 입력(화면과 같다) — 둘째 지분은 칸이 없어 `second` 기본값이 빈 객체다. */
const hForm = (first: Over, second: Over = {}) =>
  ({ ...createDefaultTransferFormData(), ...BASE, assetSplitMode: "fractional", assets: [hShare(1, { ...H_OBJECT, ...first }), hShare(2, second)] }) as unknown as TransferFormData;
/** 같은 주택을 지분 분할 없이 100% 한 장으로 — 정답 기준. */
const singleForm = (first: Over = {}) =>
  ({
    ...createDefaultTransferFormData(), ...BASE, assetSplitMode: "single",
    assets: [hShare(1, { ...H_OBJECT, ownershipNumerator: "100", ownershipDenominator: "100", ...first })],
  }) as unknown as TransferFormData;

describe("C7 — 주택 축 B · 소재지 구분 막다른 길 해소", () => {
  it("🔑 화면 경로: 지분 카드에 칸이 없어도 ⑧ 0건 · 둘째 지분 초과분 판정 — 71,786,000 (수정 전 ⑧ 「자산 2: 소재지 구분」 차단 · 직접 흘리면 2,876,500)", async () => {
    const f = hForm({});
    expect(issuesOf(f)).toEqual([]); // 수정 전: ["1:appurtenantLandZone"]
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.total).toBe(71_786_000); // 수정 전 2,876,500 — 둘째 지분 초과분이 비과세로 샜다
    expect(r.shareLand).toEqual({ landAreaM2: 3000, footprintM2: 100, zone: "metropolitan_residential" }); // ⑫ `companionHousingLand.zone` → ⑭ 엔진
    expect(r.props.map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]); // 수정 전 [non_business_land, progressive]
    expect(r.warnings.some((w) => ZONE_MISSING.test(w))).toBe(false); // 수정 전 「[자산 2] … 소재지 구분이 없어 배율 한도(초과 여부)를 판정하지 않았습니다」
  });

  it("🔑 정답 기준 ① — 지분 카드에 소재지 구분을 직접 넣은 폼과 같다: 71,786,000", async () => {
    const oracle = await run(hForm({}, ZONE));
    expect(oracle.total).toBe(71_786_000);
    expect(oracle.shareLand?.zone).toBe("metropolitan_residential");
  });

  it("🔑 정답 기준 ② — 같은 주택을 100% 단건으로 넣은 폼과 같다: 71,786,000 (지분 분할이 땅의 성질을 바꾸지 않는다)", async () => {
    const f = singleForm();
    expect(issuesOf(f)).toEqual([]);
    const single = await run(f);
    expect(single.status, JSON.stringify(single.j).slice(0, 300)).toBe(200);
    expect(single.total).toBe(71_786_000);
    expect((await run(hForm({}))).total).toBe(single.total);
  });

  it("지분 2의 초과분 판정 = 지분 1의 판정 — 초과 비율이 같아 소득금액이 지분율(10 : 90)대로 나뉜다 (지분 1 소득 18,000,000 : 지분 2 162,000,000)", async () => {
    const r = await run(hForm({}));
    const [s1, s2] = r.props;
    expect(s1.rateGroup).toBe("non_business_land");
    expect(s2.rateGroup).toBe("non_business_land");
    expect(s1.surchargeRate).toBe(0.1);
    expect(s2.surchargeRate).toBe(0.1);
    expect([s1.income, s2.income]).toEqual([18_000_000, 162_000_000]);
    expect(s1.income * 9).toBe(s2.income); // 수정 전 지분 2 = 비과세 · 소득 0
    expect(s2.transferGain * 1).toBe(s1.transferGain * 9);
  });

  it("직접 API 정직성 — 컴패니언에서 `companionHousingLand.zone`이 빠지면 엔진은 여전히 판정하지 않고 «확인 필요»만 낸다(조용한 3배 기본값 금지)", async () => {
    const body = (await captureBody(hForm({}) as never)) as Loose;
    delete body.companionAssets[0].companionHousingLand.zone;
    const r = await post(body);
    expect(r.status).toBe(200);
    expect(r.total).toBe(2_876_500);
    expect(r.warnings.some((w) => ZONE_MISSING.test(w))).toBe(true);
  });

  it("⑧ 첫 카드가 소재지 구분을 비우면 칸이 있는 자산 1이 막는다 — 지분 카드의 같은 오류는 첫 카드 선택 하나로 함께 풀린다(수정 전에도 같은 모양)", () => {
    expect(issuesOf(hForm({ appurtenantLandZone: undefined }))).toContain("0:appurtenantLandZone");
    expect(issuesOf(hForm({}))).toEqual([]);
  });

  it("지분 카드가 직접 고른 값은 첫 카드 값이 이긴다(물건 단위) — 숨은 칸의 stale이 닿지 않는다", async () => {
    const stale = await run(hForm({}, { appurtenantLandZone: "non_urban" }));
    expect(stale.shareLand?.zone).toBe("metropolitan_residential");
    expect(stale.total).toBe(71_786_000);
  });

  it("배율 이하 시료(정착 100㎡ × 3배 = 300㎡ 이내) — 소재지 구분이 닿아도 세액 불변(초과분 없음)", async () => {
    const small = { acquisitionArea: "250" };
    const f = hForm(small);
    expect(issuesOf(f)).toEqual([]);
    const withZone = await run(hForm(small, ZONE)); // 지분 카드에 직접 넣어도
    const merged = await run(f); // 병합으로 닿아도
    expect(merged.total).toBe(withZone.total);
    expect(merged.props.map((p) => p.rateGroup)).toEqual(withZone.props.map((p) => p.rateGroup));
    expect(merged.props.every((p) => p.rateGroup !== "non_business_land")).toBe(true);
  });

  it("지분 2가 10배 지역(non_urban)이어도 첫 카드 값 그대로 — 초과분 없음(정착 100㎡ × 10 = 1,000㎡ < 3,000㎡ → 초과 2,000㎡)", async () => {
    const r = await run(hForm({ appurtenantLandZone: "non_urban" }));
    expect(r.shareLand?.zone).toBe("non_urban");
    expect(r.props.map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]);
    const oracle = await run(hForm({ appurtenantLandZone: "non_urban" }, { appurtenantLandZone: "non_urban" }));
    expect(r.total).toBe(oracle.total);
  });
});

describe("C7 — C6 효과(고시일·유예)가 화면 입력만으로 주택 지분에 닿는다", () => {
  it("🔑 수용 의제: 첫 카드에만 고시일 · 소재지 구분 → 둘째 지분도 의제 — 52,261,000 (C6 anchor 정답과 같다 · 그때는 지분 카드에도 소재지를 넣었다)", async () => {
    const f = hForm(H_EXPRO);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.total).toBe(52_261_000);
    expect(r.warnings.some((w) => NOTICE_MISSING.test(w) || ZONE_MISSING.test(w))).toBe(false);
    expect(r.body.companionAssets[0].appurtenantExcessFacts).toEqual({ expropriationNoticeDate: "2021-03-01" });
    expect((await run(hForm(H_EXPRO, { ...ZONE, expropriationNoticeDate: "2021-03-01" }))).total).toBe(52_261_000);
  });

  it("🔑 유예 행: 첫 카드의 유예 행 → 둘째 지분 초과분도 사업용 — 52,261,000", async () => {
    const f = hForm({ nblGracePeriods: [USE_PROHIBITED] });
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.total).toBe(52_261_000);
    expect(r.body.companionAssets[0].appurtenantExcessFacts).toEqual({ graceIntervals: [{ startDate: "2014-01-01", endDate: "2023-12-31" }] });
    expect(r.warnings.filter((w) => w.includes("유예기간 3650일")).length).toBe(2); // 주 자산 + 자산 2
  });
});

describe("C7 — 병합 소비처 (mergePrimaryBasic 결과를 읽는 곳)", () => {
  it("병합 범위 — 일반 주택 첫 카드만. 상가·토지·겸용·일반건물 첫 카드의 값은 지분 카드에 닿지 않는다", () => {
    const share = hShare(2, {});
    const stale = { appurtenantLandZone: "non_urban" };
    expect(mergePrimaryBasic(share, hShare(1, H_OBJECT)).appurtenantLandZone).toBe("metropolitan_residential");
    expect(mergePrimaryBasic(share, hShare(1, { assetKind: "commercial_building", ...stale })).appurtenantLandZone).toBeUndefined();
    expect(mergePrimaryBasic(share, hShare(1, { assetKind: "land", ...stale })).appurtenantLandZone).toBeUndefined();
    expect(mergePrimaryBasic(share, hShare(1, { assetKind: "general_building", ...stale })).appurtenantLandZone).toBeUndefined();
    expect(mergePrimaryBasic(share, hShare(1, { isMixedUseHouse: true, ...stale })).appurtenantLandZone).toBeUndefined();
  });

  it("사이드바 요약 — 소재지 구분 병합 전후 행이 같다(요약은 소재지 구분을 읽지 않는다 · 계산 전 미리보기)", () => {
    const f = hForm({});
    const withOwn = hForm({}, ZONE);
    // assetId는 폼 생성마다 달라 행에서 뺀다 — 나머지(취득가액·양도가액·필요경비 등)는 같아야 한다.
    const strip = (s: ReturnType<typeof computeTransferPerAssetSummary>) => ({ ...s, rows: s.rows.map((row) => ({ ...row, assetId: "" })) });
    expect(strip(computeTransferPerAssetSummary(f, null))).toEqual(strip(computeTransferPerAssetSummary(withOwn, null)));
  });

  it("상가 지분 — 회귀 불변: 소재지 구분 없이 ⑧ 0건 · 세율군 non_business_land 두 지분 (C6 anchor 판별력 시료와 같다)", async () => {
    const CB = {
      assetKind: "commercial_building", fixedAcquisitionPrice: "600000000", useEstimatedAcquisition: false, cbTotalLandArea: "1200", cbTotalBuildingFootprintArea: "200",
      cbZoneType: "commercial", addressJibun: "서울 강남구 테스트동 1", ...CB_PART_FORM_LAND_ONLY,
    };
    const f = {
      ...createDefaultTransferFormData(), transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1200000000", householdHousingCount: "0", isOneHousehold: false,
      assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), acquisitionCause: "purchase", acquisitionDate: "2014-06-01", ownershipNumerator: "10", ownershipDenominator: "100", ...CB },
        {
          ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-06-01", ownershipNumerator: "90", ownershipDenominator: "100", fixedAcquisitionPrice: "600000000",
          useEstimatedAcquisition: false, cbPartAcqLandStd: CB_PART_FORM_LAND_ONLY.cbPartAcqLandStd, cbPartAcqBuildingStd: CB_PART_FORM_LAND_ONLY.cbPartAcqBuildingStd,
        },
      ],
    } as unknown as TransferFormData;
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.props.map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]);
    expect(r.total).toBe(181_852_000);
    expect(r.body.companionAssets[0]).not.toHaveProperty("companionHousingLand");
  });

  it("토지 지분 — 회귀 불변: 세액 197,692,000 · 컴패니언은 `companionHousingLand`를 싣지 않는다 (C6 anchor와 같은 시료)", async () => {
    const LAND = {
      assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
      fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land",
      nblZoneType: "residential", transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
    };
    const f = {
      ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "50", ownershipDenominator: "100" },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2019-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100" },
      ],
    } as unknown as TransferFormData;
    const r = await run(f);
    expect(r.total).toBe(197_692_000);
    expect(r.body.companionAssets[0]).not.toHaveProperty("companionHousingLand");
  });
});
