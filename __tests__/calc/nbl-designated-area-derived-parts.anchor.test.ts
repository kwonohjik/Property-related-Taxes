/**
 * anchor: 엔진이 **자동으로 비사업용 토지로 가르는 파트**에도 지정지역 선언(`isDesignatedArea`)이 닿는다 (양도 2009.3.16.~2015.12.31. 8호 중과 유예).
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §5.5 한계 1 (후속 — 파생 비사업용 토지 파트)
 *
 * 실측으로 갈린 흐름(2026-10-17, 양도일 2012-09-01):
 *  · 주택 배율초과 부수토지(`splitDetail.nonBusinessLandPart`) — 엔진은 부모 주택 입력을 펼쳐 쓰므로 값이 닿았는데 ④가 «토지만» 실어 도달 못 했고,
 *    8호 중과가 걸려도 «확인 필요» 고지가 **0건**이었다(고지가 자산 단위 `isNonBusinessLand`만 봤다).
 *  · 주택 부수토지 컴패니언의 한도 초과분 카드(`__excess`) — 엔진은 컴패니언 값을 `...base`로 물려받아 이미 존중했고 **입력칸만 없었다**.
 *  · 일반건물 배율초과 토지 카드(`land_nbl`) — 입력·카드 전달 모두 없었다(payload 어디에 넣어도 무시).
 *  · 겸용 — 엔진이 2022.1.1. 전 양도분을 거부(`MIXED_USE_EFFECTIVE_DATE`)해 유예 기간과 겹치지 않는다. 대상 아님.
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
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2012-09-01";
const NOTICE = "지정지역";
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "144",
    assets,
    ...over,
  }) as never;

// ── 주택 배율초과 부수토지 ───────────────────────────────────────────
// 2000-01-01 취득 · 토지 900㎡ · 정착면적 100㎡ · 수도권 주거(2012년 배율 5배 → 한도 500㎡ · 초과 400㎡) · 1세대1주택이라 주택분은 비과세, 초과분만 과세.
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2000-01-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "1000000000",
  standardPriceAtTransfer: "1000000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "144",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "900",
  transferArea: "900",
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "200000",
  buildingStandardPriceAtAcq: "120000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const house = (n: number, over: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(n), ...HOUSE, addressJibun: `서울 테스트동 ${n}`, ...over }) as unknown as AssetForm;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = any[];
const aggOf = (r: Awaited<ReturnType<typeof runCalc>>) => r.json?.data?.aggregated;
const noticesOf = (list: string[] | undefined) => (list ?? []).filter((w) => w.includes(NOTICE)).length;
// 같은 날 함께양도에 주택 2채가 묶이면 결정 #40이 ⑧에서 따로 막는다 — 그 차단 외의 오류만 본다(계산은 API가 그대로 낸다).
const exceptSameDay = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => !i.message.includes("함께양도로 묶여 있습니다"));

describe("H — 주택 배율초과 부수토지 파트 (단건)", () => {
  it("🔑 미선언 = 중과 유지 + «확인 필요» 고지 1건 (수정 전: 중과가 걸려도 고지 0건)", async () => {
    const r = await runCalc(form([house(1)]));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(60_202_055);
    expect(r.result.appliedRate).toBe(0.48);
    expect(r.result.nblSurchargeExcludedBy).toBeUndefined();
    expect(noticesOf(r.result.warnings)).toBe(1);
    expect(r.body.isDesignatedArea).toBeUndefined();
  });
  it("🔑 지정지역 «아님» 선언 → 유예(8호 중과 해제) · 총세액 −15,253,227 · 사유 transfer_deferral · 고지 없음 (수정 전: 값이 ④에서 사라져 도달 못 함)", async () => {
    const r = await runCalc(form([house(1, { isDesignatedArea: false })]));
    expect(r.body.isDesignatedArea).toBe(false);
    expect(r.result.totalTax).toBe(44_948_828);
    expect(60_202_055 - r.result.totalTax).toBe(15_253_227);
    expect(r.result.appliedRate).toBe(0.38);
    expect(r.result.nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(noticesOf(r.result.warnings)).toBe(0);
  });
  it("«지정지역» 선언 → 지정지역은 유예 제외라 중과 유지 · 미선언과 같은 세액 · 고지 없음", async () => {
    const r = await runCalc(form([house(1, { isDesignatedArea: true })]));
    expect(r.body.isDesignatedArea).toBe(true);
    expect(r.result.totalTax).toBe(60_202_055);
    expect(r.result.nblSurchargeExcludedBy).toBeUndefined();
    expect(noticesOf(r.result.warnings)).toBe(0);
  });
  it("대조 — 양도일이 유예 기간 밖(2016-01-04)이면 «아님» 선언이 있어도 중과 유지 · 고지도 없다", async () => {
    const out = await runCalc(form([house(1, { isDesignatedArea: false })], { transferDate: "2016-01-04" }));
    const und = await runCalc(form([house(1)], { transferDate: "2016-01-04" }));
    expect(out.result.totalTax).toBe(und.result.totalTax);
    expect(out.result.nblSurchargeExcludedBy).toBeUndefined();
    expect(noticesOf(out.result.warnings)).toBe(0);
    expect(noticesOf(und.result.warnings)).toBe(0);
  });
  it("대조 — 배율 이내(토지 400㎡ ≤ 한도 500㎡)면 비사업용 파트가 없어 선언이 있어도 세액·고지가 같다", async () => {
    const a = await runCalc(form([house(1, { acquisitionArea: "400", transferArea: "400", isDesignatedArea: false })]));
    const b = await runCalc(form([house(1, { acquisitionArea: "400", transferArea: "400" })]));
    expect(a.result.totalTax).toBe(b.result.totalTax);
    expect(a.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(noticesOf(b.result.warnings)).toBe(0);
  });
});

describe("C-H — 함께 양도 컴패니언 주택의 배율초과 파트", () => {
  const run = (over: Record<string, unknown>) =>
    runCalc(form([house(1, { acquisitionArea: "400", transferArea: "400" }), house(2, over)], { contractTotalPrice: "2000000000" }));
  it("미선언 → 중과 유지 55,929,141 + 고지 1건 / «아님» → 41,812,571 · transfer_deferral · 고지 없음 / «지정지역» → 55,929,141", async () => {
    const und = await run({});
    expect(exceptSameDay(und)).toEqual([]);
    expect((aggOf(und).properties as Props)[1].determinedTax).toBe(55_929_141);
    expect(noticesOf(aggOf(und).warnings)).toBe(1);
    expect((und.body.companionAssets as { isDesignatedArea?: boolean }[])[0].isDesignatedArea).toBeUndefined();

    const no = await run({ isDesignatedArea: false });
    expect((no.body.companionAssets as { isDesignatedArea?: boolean }[])[0].isDesignatedArea).toBe(false);
    expect((aggOf(no).properties as Props)[1].determinedTax).toBe(41_812_571);
    expect((aggOf(no).properties as Props)[1].nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(noticesOf(aggOf(no).warnings)).toBe(0);

    const yes = await run({ isDesignatedArea: true });
    expect((aggOf(yes).properties as Props)[1].determinedTax).toBe(55_929_141);
    expect(noticesOf(aggOf(yes).warnings)).toBe(0);
  });
});

// ── 주택 부수토지 컴패니언 한도 초과분 ───────────────────────────────
const landCompanion = (n: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(n), assetKind: "land", landNature: "appurtenant", landType: "building_site", isNonBusinessLand: false,
    addressJibun: `서울 테스트동 ${n}`, acquisitionCause: "purchase", acquisitionDate: "2000-06-01", useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "200000000", actualSalePrice: "500000000", standardPriceAtTransfer: "300000000", standardPriceAtAcq: "150000000",
    acquisitionArea: "800", transferArea: "800", areaScenario: "same", ...over,
  }) as unknown as AssetForm;
const mainHouse = () =>
  ({
    ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "서울 테스트동 0", acquisitionCause: "purchase", acquisitionDate: "2000-06-01",
    useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000", actualSalePrice: "600000000", standardPriceAtTransfer: "600000000",
    standardPriceAtAcq: "300000000", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true,
    residenceInputMode: "direct", residencePeriodMonthsAsset: "144",
  }) as unknown as AssetForm;

describe("L — 주택 부수토지 컴패니언 한도 초과분 카드(__excess)", () => {
  const run = (over: Record<string, unknown>) => runCalc(form([mainHouse(), landCompanion(2, over)], { contractTotalPrice: "1100000000" }));
  const excess = (r: Awaited<ReturnType<typeof runCalc>>) => (aggOf(r).properties as Props).find((p) => String(p.propertyId).endsWith("__excess"));
  it("미선언 → 초과분 세율 0.34(중과 유지) + 고지 1건 · 결정세액 15,918,181", async () => {
    const r = await run({});
    expect(r.issues).toEqual([]);
    expect(excess(r).appliedRate).toBe(0.34);
    expect(excess(r).nblSurchargeExcludedBy).toBeUndefined();
    expect(noticesOf(aggOf(r).warnings)).toBe(1);
    expect(aggOf(r).determinedTax).toBe(15_918_181);
  });
  it("🔑 «아님» 선언 → 초과분 세율 0.24 · 사유 transfer_deferral · 고지 없음 · 결정세액 12,089,090 (수정 전: 부수토지 컴패니언은 토글이 꺼져 있어 질문이 뜰 자리가 없었다)", async () => {
    const r = await run({ isDesignatedArea: false });
    expect((r.body.companionAssets as { isDesignatedArea?: boolean }[])[0].isDesignatedArea).toBe(false);
    expect(excess(r).appliedRate).toBe(0.24);
    expect(excess(r).nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(noticesOf(aggOf(r).warnings)).toBe(0);
    expect(aggOf(r).determinedTax).toBe(12_089_090);
  });
  it("«지정지역» 선언 → 0.34 유지 · 고지 없음", async () => {
    const r = await run({ isDesignatedArea: true });
    expect(excess(r).appliedRate).toBe(0.34);
    expect(noticesOf(aggOf(r).warnings)).toBe(0);
    expect(aggOf(r).determinedTax).toBe(15_918_181);
  });
});

// ── 일반건물 배율초과 토지 ───────────────────────────────────────────
const GB_FIELDS = {
  assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2000-03-01",
  gbLandArea: "900", gbBuildingFootprintArea: "100", gbZoneType: "commercial", gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000", gbTransferBuildingValue: "200000000", gbAcqLandPricePerSqm: "750000", gbAcqBuildingValue: "100000000",
};
const gbEstimated = { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" };
const gbActual = {
  useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", actualSalePrice: "1200000000", fixedAcquisitionPrice: "300000000",
  landAcquisitionPrice: "200000000", buildingAcquisitionPrice: "100000000",
};
const gb = (n: number, extra: Record<string, unknown>, over: Record<string, unknown>) =>
  ({ ...makeDefaultAsset(n), addressJibun: `서울 테스트동 ${n}`, standardPriceAtTransfer: "500000000", ...GB_FIELDS, ...extra, ...over }) as unknown as AssetForm;
const nblCard = (r: Awaited<ReturnType<typeof runCalc>>) => (aggOf(r).properties as Props).find((p) => String(p.propertyId).startsWith("land_nbl"));
const single = { isOneHousehold: false, householdHousingCount: "0" };

describe("G — 일반건물 배율초과 토지 카드(land_nbl)", () => {
  // [경로, 폼 필드, 미선언 세율, 유예 세율]
  for (const [mode, extra, base, deferred] of [
    ["환산", gbEstimated, 0.48, 0.38],
    ["실가", gbActual, 0.5, 0.4],
  ] as const) {
    it(`🔑 단건 ${mode} — 미선언 ${base}(중과 유지 + 고지 1건) / «아님» ${deferred}(transfer_deferral · 고지 없음) / «지정지역» ${base} (수정 전: payload 어디에 넣어도 무시)`, async () => {
      const und = await runCalc(form([gb(1, extra, {})], single));
      expect(und.issues).toEqual([]);
      expect(nblCard(und).appliedRate).toBe(base);
      expect(nblCard(und).nblSurchargeExcludedBy).toBeUndefined();
      expect(noticesOf(aggOf(und).warnings)).toBe(1);

      const no = await runCalc(form([gb(1, extra, { isDesignatedArea: false })], single));
      expect(nblCard(no).appliedRate).toBe(deferred);
      expect(nblCard(no).nblSurchargeExcludedBy).toBe("transfer_deferral");
      expect(noticesOf(aggOf(no).warnings)).toBe(0);

      const yes = await runCalc(form([gb(1, extra, { isDesignatedArea: true })], single));
      expect(nblCard(yes).appliedRate).toBe(base);
      expect(noticesOf(aggOf(yes).warnings)).toBe(0);
    });
  }
  it("허가·사용승인 미이행(토지 전체 비사업용 1장 카드 — 환산) — 미선언 중과 유지 + 고지 1건 / «아님» 유예 · transfer_deferral", async () => {
    const un = { gbUnapprovedBuilding: true };
    const und = await runCalc(form([gb(1, gbEstimated, un)], single));
    expect(und.issues).toEqual([]);
    expect((aggOf(und).properties as Props).map((p) => p.propertyId)).toEqual(["land_nbl", "building"]);
    expect(nblCard(und).nblSurchargeExcludedBy).toBeUndefined();
    expect(noticesOf(aggOf(und).warnings)).toBe(1);
    const no = await runCalc(form([gb(1, gbEstimated, { ...un, isDesignatedArea: false })], single));
    expect(nblCard(no).nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(nblCard(no).appliedRate).toBeLessThan(nblCard(und).appliedRate);
    expect(noticesOf(aggOf(no).warnings)).toBe(0);
  });
  it("사업용 토지 카드·건물 카드는 선언의 영향을 받지 않는다 (land_nbl 카드만 유예)", async () => {
    const und = await runCalc(form([gb(1, gbEstimated, {})], single));
    const no = await runCalc(form([gb(1, gbEstimated, { isDesignatedArea: false })], single));
    const pick = (r: Awaited<ReturnType<typeof runCalc>>, id: string) => (aggOf(r).properties as Props).find((p) => p.propertyId === id);
    for (const id of ["land_business", "building"]) {
      expect(pick(no, id).appliedRate).toBe(pick(und, id).appliedRate);
      expect(pick(no, id).nblSurchargeExcludedBy).toBeUndefined();
    }
  });
  it("함께 양도 컴패니언(환산) — 미선언 0.48 + 고지 1건 / «아님» 0.38 · transfer_deferral / «지정지역» 0.48", async () => {
    const run = (over: Record<string, unknown>) => runCalc(form([house(1, { acquisitionArea: "400", transferArea: "400" }), gb(2, gbEstimated, over)], { contractTotalPrice: "2200000000" }));
    const und = await run({});
    expect(und.issues).toEqual([]);
    expect(nblCard(und).appliedRate).toBe(0.48);
    expect(noticesOf(aggOf(und).warnings)).toBe(1);
    const no = await run({ isDesignatedArea: false });
    expect(nblCard(no).appliedRate).toBe(0.38);
    expect(nblCard(no).nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(noticesOf(aggOf(no).warnings)).toBe(0);
    const yes = await run({ isDesignatedArea: true });
    expect(nblCard(yes).appliedRate).toBe(0.48);
    expect(noticesOf(aggOf(yes).warnings)).toBe(0);
  });
});

describe("④ 게이트 — 선언을 싣는 자산 종류", () => {
  it("토지·주택은 싣고 그 밖의 종류는 폼 값이 남아 있어도 싣지 않는다 (화면에 없는 값이 세액을 바꾸지 않도록)", async () => {
    const { nblDesignatedAreaPayload } = await import("@/lib/calc/nbl-designated-area");
    expect(nblDesignatedAreaPayload({ assetKind: "land", isDesignatedArea: false })).toBe(false);
    expect(nblDesignatedAreaPayload({ assetKind: "housing", isDesignatedArea: true })).toBe(true);
    expect(nblDesignatedAreaPayload({ assetKind: "housing", isDesignatedArea: undefined })).toBeUndefined();
    expect(nblDesignatedAreaPayload({ assetKind: "general_building", isDesignatedArea: false })).toBeUndefined();
    expect(nblDesignatedAreaPayload({ assetKind: "presale_right", isDesignatedArea: true })).toBeUndefined();
    expect(nblDesignatedAreaPayload(undefined)).toBeUndefined();
  });
});

describe("④ 일반건물 payload — 환산·실가 두 조립 경로가 같은 값을 싣는다", () => {
  it("선언 false/true는 그대로, 미선언은 undefined(모름을 false로 바꿔 싣지 않는다)", async () => {
    const { captureBody } = await import("./_helpers/redev-one-house-route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gbv = async (extra: Record<string, unknown>, over: Record<string, unknown>) => ((await captureBody(form([gb(1, extra, over)], single)))?.generalBuildingValuation as any);
    for (const extra of [gbEstimated, gbActual]) {
      expect((await gbv(extra, { isDesignatedArea: false }))?.isDesignatedArea).toBe(false);
      expect((await gbv(extra, { isDesignatedArea: true }))?.isDesignatedArea).toBe(true);
      expect((await gbv(extra, {}))?.isDesignatedArea).toBeUndefined();
    }
  });
});

describe("⑫ 일반건물 지분(%) 분할 — 물건-수준이라 전 지분이 같은 선언을 쓴다", () => {
  it("primary의 선언이 지분 자산으로 복사되고, Zod 물건-수준 동일성 목록에 든다", async () => {
    const { mergeGbPropertyLevel } = await import("@/lib/calc/transfer-tax-api-gb-shares");
    const { GB_SHARE_PROPERTY_LEVEL_PATHS } = await import("@/lib/api/transfer-tax-building-schemas");
    const A = gb(1, gbEstimated, { isDesignatedArea: false });
    const B = gb(2, gbEstimated, {});
    expect(mergeGbPropertyLevel(B, A).isDesignatedArea).toBe(false);
    expect((GB_SHARE_PROPERTY_LEVEL_PATHS as readonly string[]).includes("isDesignatedArea")).toBe(true);
  });
});

describe("G-증축 — 증축 경로(환산, building1·building2)의 land_nbl 카드", () => {
  const EXT = { gbHasExtension: true, gbExtensionDate: "2010-05-01", gbExtensionAcquisitionCause: "newConstruction", gbExtensionAcquisitionMode: "estimated",
    gbExtensionArea: "50", gbTransferExtensionBuildingStdPrice: "5000000", gbAcquisitionExtensionBuildingStdPrice: "4000000" };
  it("카드 빌더가 3곳(환산 2·증축 1)이라 증축도 따로 고정한다 — 미선언 0.48 + 고지 1건 / «아님» 0.38 · transfer_deferral / «지정지역» 0.48", async () => {
    const run = (over: Record<string, unknown>) => runCalc(form([gb(1, { ...gbEstimated, ...EXT }, over)], single));
    const und = await run({});
    expect(und.issues).toEqual([]);
    expect((aggOf(und).properties as Props).map((p) => p.propertyId)).toEqual(["land_business", "land_nbl", "building1", "building2"]);
    expect(nblCard(und).appliedRate).toBe(0.48);
    expect(noticesOf(aggOf(und).warnings)).toBe(1);
    const no = await run({ isDesignatedArea: false });
    expect(nblCard(no).appliedRate).toBe(0.38);
    expect(nblCard(no).nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(noticesOf(aggOf(no).warnings)).toBe(0);
    const yes = await run({ isDesignatedArea: true });
    expect(nblCard(yes).appliedRate).toBe(0.48);
    expect(noticesOf(aggOf(yes).warnings)).toBe(0);
  });
});
