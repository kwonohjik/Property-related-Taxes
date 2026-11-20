/**
 * anchor(화면 경로 ④⑧⑫⑭) — 축 B(같은 물건 지분 분할) 둘째 이후 지분의 배율 초과분 «수용 의제·유예» 도달 (NBL2611-C6).
 *
 * 지분 카드는 ① 기본정보·② 양도정보를 숨겨 사업인정 고시일(`ExpropriationBlock`)과 유예 행(`AssetAreaSection`)을 받을 칸이 없다 — 두 사실은 첫 카드에만 있다.
 * 종전에는 둘째 이후 지분이 transferCause만 병합받아 «수용인데 고시일 없음 → 의제 불성립 + 확인 필요»가 되었고 유예 행도 닿지 않아 첫 지분과 판정이 갈렸다.
 * 수정 = ④ 한 지점(`appurtenantExcessShareView`) — `mergePrimaryBasic`에는 넣지 않았다(⑧·감면 변환이 함께 읽는다 — 아래 «병합 비채택» 블록이 이유를 고정한다).
 *
 * 정답(oracle) = 지분 카드에도 같은 사실을 직접 넣은 폼. 수정 전 수치는 같은 시료를 `git stash`로 수정 없이 돌린 실측이다(2026-11-21).
 * 금액은 mock 세율표 실측값이지 정본 세액이 아니다.
 *
 * ⚠️ 주택 지분 시료는 **지분 카드에도 「부수토지 소재지 구분」을 넣었다**. 이 칸은 ① 영역이라 지분 카드 화면에 없고 `mergePrimaryBasic`도 병합하지 않아,
 *    화면에서는 ⑧이 «자산 2: 소재지 구분을 선택하세요»로 막는 별건 한계가 있다(이 PR 범위 밖 — PR 본문 «남은 한계»). 상가·겸용은 이 한계가 없다(구 칸이 병합된다).
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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CB_PART_FORM_LAND_ONLY } from "../tax-engine/_helpers/cb-part-basis";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Over = Record<string, unknown>;

async function run(f: TransferFormData) {
  const body = (await captureBody(f as never)) as Loose;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  const agg = j?.data?.aggregated ?? {};
  return {
    status: res.status,
    body,
    j,
    total: (agg.totalTax ?? j?.data?.result?.totalTax) as number,
    clause8Base: agg.clause8TaxBase as number,
    props: (agg.properties ?? []) as Loose[],
    warnings: (agg.warnings ?? []) as string[],
    shareFacts: body.companionAssets?.[0]?.appurtenantExcessFacts as Loose | undefined,
  };
}
const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f as never)).map((i) => `${i.assetIndex ?? "-"}:${i.field ?? ""}`);
const NOTICE_MISSING = /사업인정 고시일이 입력되지 않아/;
const USE_PROHIBITED = { reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "2023-12-31", description: "" };

// ── 주택 지분 (G-2 별개취득 · 1세대1주택 · 토지 3,000㎡ / 정착 100㎡ / 수도권 주거 3배 → 초과 2,700㎡ · 지분 10% / 90%) ──────────────────
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
const hForm = (first: Over, second: Over = ZONE) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-09-01", filingDate: "2024-11-30", contractTotalPrice: "1000000000", isOneHousehold: true,
    householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0",
    assetSplitMode: "fractional", bundledSaleMode: "actual", assets: [hShare(1, { ...H_OBJECT, ...first }), hShare(2, second)],
  }) as unknown as TransferFormData;

describe("C6 — 주택 지분(G-2) · 수용 의제 고시일", () => {
  it("🔑 첫 카드에만 고시일: 둘째 지분도 같은 고시일을 싣는다 → 정답(지분 카드에 직접 입력)과 같은 세액 52,261,000 (수정 전 63,866,000)", async () => {
    const f = hForm(H_EXPRO);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.shareFacts).toEqual({ expropriationNoticeDate: "2021-03-01" });
    expect(r.total).toBe(52_261_000);
    expect(r.warnings.some((w) => NOTICE_MISSING.test(w))).toBe(false); // 수정 전: 「[자산 2] … 고시일이 입력되지 않아」
    const oracle = await run(hForm(H_EXPRO, { ...ZONE, expropriationNoticeDate: "2021-03-01" }));
    expect(oracle.total).toBe(52_261_000);
  });

  it("판별력 — 수용이 아니면(일반 양도) 의제 없음: 71,786,000 · 첫 카드의 남은 고시일(stale)도 싣지 않는다", async () => {
    const r = await run(hForm({ expropriationNoticeDate: "2021-03-01" }));
    expect(r.total).toBe(71_786_000);
    expect(r.shareFacts).toBeUndefined();
  });

  it("지분 카드 자신의 남은 고시일(숨은 칸)은 읽지 않는다 — 첫 카드 값이 이긴다", async () => {
    const r = await run(hForm(H_EXPRO, { ...ZONE, expropriationNoticeDate: "1999-01-01" }));
    expect(r.shareFacts).toEqual({ expropriationNoticeDate: "2021-03-01" });
  });
});

describe("C6 — 주택 지분(G-2) · 유예 행", () => {
  it("🔑 첫 카드의 유예 행이 둘째 지분에도 닿는다 → 52,261,000 (수정 전 63,866,000) · 정답과 같다", async () => {
    const f = hForm({ nblGracePeriods: [USE_PROHIBITED] });
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.shareFacts).toEqual({ graceIntervals: [{ startDate: "2014-01-01", endDate: "2023-12-31" }] });
    expect(r.total).toBe(52_261_000);
    expect(r.warnings.filter((w) => w.includes("유예기간 3650일")).length).toBe(2); // 주 자산 + 자산 2
    const oracle = await run(hForm({ nblGracePeriods: [USE_PROHIBITED] }, { ...ZONE, nblGracePeriods: [USE_PROHIBITED] }));
    expect(oracle.total).toBe(52_261_000);
  });

  it("🔑 지분별 취득일 기산 — 같은 «6호 저당권 실행·청산» 행이 각 지분의 토지 취득일로 따로 풀린다", async () => {
    const mortgage = { reasonCode: "mortgage_or_liquidation", anchorDate: "", endDate: "", description: "" };
    const f = hForm({ nblGracePeriods: [mortgage] }, { ...ZONE, landAcquisitionDate: "2018-01-01" });
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.body.appurtenantExcessFacts.graceIntervals).toEqual([{ startDate: "2014-01-01", endDate: "2016-01-01" }]); // 첫 지분: 토지 2014-01-01 + 2년
    expect(r.shareFacts?.graceIntervals).toEqual([{ startDate: "2018-01-01", endDate: "2020-01-01" }]); // 둘째 지분: 자기 토지 취득일 2018-01-01 + 2년
  });

  it("초과분이 없는 지분(한도 이내)의 남은 유예 행은 싣지 않는다 — 칸이 없는 자산의 stale", async () => {
    const f = hForm({ nblGracePeriods: [USE_PROHIBITED], acquisitionArea: "250" });
    const r = await run(f);
    expect(r.shareFacts).toBeUndefined();
  });
});

describe("C6 — 병합 비채택: 두 키를 mergePrimaryBasic에 넣으면 바뀌는 것(2026-11-21 실측)이 그대로다", () => {
  it("mergePrimaryBasic은 고시일·유예 행을 병합하지 않는다(⑧·감면 변환·사이드바가 같은 병합 자산을 읽는다)", () => {
    const first = hShare(1, { ...H_OBJECT, ...H_EXPRO, nblGracePeriods: [USE_PROHIBITED], nblBusinessIsRealEstateDealer: true });
    const merged = mergePrimaryBasic(hShare(2, ZONE), first);
    expect(merged.transferCause).toBe("public_expropriation"); // 양도원인은 병합(종전)
    expect(merged.expropriationNoticeDate ?? "").toBe("");
    expect(merged.nblGracePeriods ?? []).toEqual([]);
    expect(merged.nblBusinessIsRealEstateDealer).not.toBe(true);
  });

  it("⑧ — 첫 카드의 잘못된 유예 행 오류는 자산 1에만 뜬다(지분 카드에는 고칠 칸이 없다)", () => {
    const bad = { ...USE_PROHIBITED, endDate: "" };
    const issues = issuesOf(hForm({ ...H_EXPRO, nblGracePeriods: [bad] }));
    expect(issues).toEqual(["0:nblGracePeriods.0.endDate"]);
  });

  it("감면 — 지분 카드의 공익수용 감면 행(고시일 공란)은 ⑧이 막고 첫 카드 고시일로 조용히 채우지 않는다", async () => {
    const LAND = {
      assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
      fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true,
      transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
    };
    const reductions = [{ type: "public_expropriation", expropriationCash: "100000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "" }];
    const f = {
      ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), ...LAND, nblLandType: "other_land", nblZoneType: "residential", ownershipNumerator: "50", ownershipDenominator: "100" },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2019-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100", reductions },
      ],
    } as unknown as TransferFormData;
    expect(issuesOf(f)).toEqual(["1:reduction.public_expropriation.expropriationApprovalDate"]);
    const body = (await captureBody(f as never)) as Loose;
    expect(body.companionAssets[0].reductions[0].businessApprovalDate).toBe("");
  });
});

describe("C6 — 토지 지분은 변하지 않는다(이미 `buildFractionalShareNblRecord`로 땅 사실은 첫 카드 값)", () => {
  const LAND = {
    assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
    fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land",
    nblZoneType: "residential", transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
  };
  const landForm = (first: Over = {}) =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "50", ownershipDenominator: "100", ...first },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2019-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100" },
      ],
    }) as unknown as TransferFormData;

  it("둘째 지분만 고시일 7개월 전 취득: 세액 197,692,000(수정 전과 같다) · 지분 카드는 `appurtenantExcessFacts`를 싣지 않고 `nonBusinessLandRaw`만 싣는다", async () => {
    const r = await run(landForm());
    expect(r.total).toBe(197_692_000);
    const c = r.body.companionAssets[0];
    expect(c).not.toHaveProperty("appurtenantExcessFacts");
    expect(c.nonBusinessLandRaw).toBeDefined();
  });

  it("첫 카드의 유예 행도 같다: 194,931,000(수정 전과 같다)", async () => {
    const r = await run(landForm({ nblGracePeriods: [USE_PROHIBITED] }));
    expect(r.total).toBe(194_931_000);
    expect(r.body.companionAssets[0]).not.toHaveProperty("appurtenantExcessFacts");
  });
});

// ── 상가 지분 (수용 의제만 — 영 §168의12는 주택 배율이라 상가는 유예 대상이 아니다) ─────────────────────────────────────────────
describe("C6 — 상가 지분 · 수용 의제", () => {
  const CB = {
    assetKind: "commercial_building", fixedAcquisitionPrice: "600000000", useEstimatedAcquisition: false, cbTotalLandArea: "1200", cbTotalBuildingFootprintArea: "200",
    cbZoneType: "commercial", addressJibun: "서울 강남구 테스트동 1", ...CB_PART_FORM_LAND_ONLY,
  };
  const cbForm = (first: Over, second: Over = {}) =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1200000000", householdHousingCount: "0", isOneHousehold: false,
      assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), acquisitionCause: "purchase", acquisitionDate: "2014-06-01", ownershipNumerator: "10", ownershipDenominator: "100", ...CB, ...first },
        {
          ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-06-01", ownershipNumerator: "90", ownershipDenominator: "100", fixedAcquisitionPrice: "600000000",
          useEstimatedAcquisition: false, cbPartAcqLandStd: CB_PART_FORM_LAND_ONLY.cbPartAcqLandStd, cbPartAcqBuildingStd: CB_PART_FORM_LAND_ONLY.cbPartAcqBuildingStd, ...second,
        },
      ],
    }) as unknown as TransferFormData;
  const EXPRO = { transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01" };

  it("🔑 둘째 지분도 의제 성립: 세율군 non_business_land → progressive · 8항 버킷 과세표준 213,500,000 → 0 (정답과 같다)", async () => {
    const f = cbForm(EXPRO);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.shareFacts).toEqual({ expropriationNoticeDate: "2020-01-01" });
    expect(r.props.map((p) => p.rateGroup)).toEqual(["progressive", "progressive"]); // 수정 전 [progressive, non_business_land]
    expect(r.clause8Base).toBe(0); // 수정 전 213,500,000
    expect(r.warnings.some((w) => NOTICE_MISSING.test(w))).toBe(false);
    const oracle = await run(cbForm(EXPRO, { expropriationNoticeDate: "2020-01-01" }));
    expect(oracle.props.map((p) => p.rateGroup)).toEqual(["progressive", "progressive"]);
    expect(oracle.clause8Base).toBe(0);
    // 총세액은 이 시료에서 변하지 않는다 — 산출세액은 «8항 중과 합계 vs 일반 누진 합계» 중 큰 쪽(§104⑦)이라 일반 누진 합계 165,060,000이 둘 다 이긴다(수정 전 후 모두 181,566,000).
    expect(r.total).toBe(181_566_000);
  });

  it("판별력 — 수용이 아니면 두 지분 모두 비사업용 토지 세율군(181,852,000)", async () => {
    const r = await run(cbForm({}));
    expect(r.props.map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]);
    expect(r.total).toBe(181_852_000);
    expect(r.shareFacts).toBeUndefined();
  });

  it("상가는 유예 행을 싣지 않는다(영 §168의12는 주택 배율) — 첫 카드의 남은 행은 닿지 않는다", async () => {
    const r = await run(cbForm({ ...EXPRO, nblGracePeriods: [USE_PROHIBITED] }));
    expect(r.shareFacts).toEqual({ expropriationNoticeDate: "2020-01-01" });
  });
});

// ── 겸용 지분 (C5 — 주택분 부수토지 초과분 · `mixedZoneType` 등 면적 칸은 병합돼 화면에서도 도달) ──────────────────────────────────
describe("C6 — 겸용 지분 · 수용 의제와 유예", () => {
  const R = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
  /** 주택 150㎡ > 상가 100㎡(OH-17) · 정착 100㎡ · 대지 400㎡ · 수도권 일반주거(3배) → 초과 100㎡ (C5 시료와 같다) */
  const OBJECT = {
    assetKind: "housing", isMixedUseHouse: true, mixedZoneType: "general_residential", mixedIsMetropolitanArea: true, residentialFloorArea: "150",
    nonResidentialFloorArea: "100", buildingFootprintArea: "100", mixedUseTotalLandArea: "400", mixedTransferHousingPrice: "500000000",
    mixedTransferCommercialBuildingPrice: "100000000", mixedTransferLandPricePerSqm: "2000000",
  };
  const ACQ = {
    acquisitionCause: "purchase", acquisitionDate: "2015-06-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", capitalExpenditure: "0", transferExpense: "0",
    mixedAcqHousingPrice: "350000000", mixedAcqCommercialBuildingPrice: "80000000", mixedAcqLandPricePerSqm: "1500000",
  };
  const RES = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2015-06-01", moveOutDate: "2024-06-01" }] };
  const COMP = {
    housingCompensationTotal: "900000000", housingCompensationBasisTotal: "900000000", mixedCommercialLandCompensationTotal: "400000000",
    mixedCommercialLandCompensationBasisTotal: "400000000",
  };
  // 겸용 수용은 환산 모드 + 보상액 4칸(⑫ 필수 — 이 파일은 의제 도달을 본다)
  const EXPRO = { transferCause: "public_expropriation", expropriationNoticeDate: "2019-01-01", useEstimatedAcquisition: true, ...COMP };
  const GRACE = [{ reasonCode: "other_justifiable", anchorDate: "2015-06-02", endDate: "2023-12-31", description: "" }];

  /** 지분 카드는 취득 쪽 칸만(⑧이 요구하는 취득시 주택건물 기준시가는 정답 카드에서 채워진 값을 옮긴다 — `mixed-use-axis-b-share-screen-path` 방식). */
  function mForm(first: Over, second: Over) {
    const build = (sec: Over) =>
      withIdentityHousingBuildingStdOnForm({
        ...createDefaultTransferFormData(), transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000", householdHousingCount: "1", isOneHousehold: true,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assetSplitMode: "fractional",
        assets: [
          Object.assign({ ...makeDefaultAsset(1) }, { addressJibun: "제주특별자치도 강남구 테스트동 1-1" }, RES, OBJECT, ACQ, R("10"), first),
          Object.assign({ ...makeDefaultAsset(2) }, { addressJibun: "제주특별자치도 강남구 테스트동 1-1" }, RES, { ...ACQ, fixedAcquisitionPrice: "320000000" }, R("90"), sec),
        ],
      } as never) as unknown as TransferFormData;
    const oracle = build({ ...OBJECT, ...second });
    return build({ ...second, mixedAcqHousingBuildingStdPrice: (oracle.assets[1] as AssetForm).mixedAcqHousingBuildingStdPrice });
  }

  it("🔑 수용: 첫 카드에만 고시일 → 둘째 지분도 의제 — 5,323,720 (수정 전 8,894,719) · 정답과 같다", async () => {
    const f = mForm(EXPRO, { useEstimatedAcquisition: true, ...COMP });
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.shareFacts).toEqual({ expropriationNoticeDate: "2019-01-01" });
    expect(r.total).toBe(5_323_720);
    expect(r.props.filter((p) => String(p.propertyId).startsWith("mu-nbl")).map((p) => p.rateGroup)).toEqual(["progressive", "progressive"]); // 수정 전 [progressive, non_business_land]
    const oracle = await run(mForm(EXPRO, { expropriationNoticeDate: "2019-01-01", useEstimatedAcquisition: true, ...COMP }));
    expect(oracle.total).toBe(5_323_720);
  });

  it("🔑 유예: 첫 카드의 유예 행 → 둘째 지분 초과분도 사업용으로 본다 — 28,582,578 (수정 전 36,277,531) · 정답과 같다", async () => {
    const f = mForm({ nblGracePeriods: GRACE }, {});
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.shareFacts).toEqual({ graceIntervals: [{ startDate: "2015-06-02", endDate: "2023-12-31" }] });
    expect(r.total).toBe(28_582_578);
    const oracle = await run(mForm({ nblGracePeriods: GRACE }, { nblGracePeriods: GRACE }));
    expect(oracle.total).toBe(28_582_578);
  });

  it("판별력 — 일반 양도 · 유예 없음: 41,601,600 (두 지분 모두 비사업용 토지 세율군)", async () => {
    const r = await run(mForm({}, {}));
    expect(r.total).toBe(41_601_600);
    expect(r.props.filter((p) => String(p.propertyId).startsWith("mu-nbl")).map((p) => p.rateGroup)).toEqual(["non_business_land", "non_business_land"]);
    expect(r.shareFacts).toBeUndefined();
  });
});
