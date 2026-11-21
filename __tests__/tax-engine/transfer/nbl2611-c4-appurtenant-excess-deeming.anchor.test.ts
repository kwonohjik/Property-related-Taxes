/**
 * anchor — 배율 초과분을 «비사업용 토지로 보지 않는» 사유 (NBL2611-C4 · 로드맵 R16 · Q-3b · Q-11 · 리뷰 §1 V3-BX03 + 신규 발견 #5 + V2-C1 주택 유예)
 *
 * ## 결함 (수정 전 master 50a83e108 — FAIL 상태)
 *
 * 영 §168의14③3호(공익수용 무조건 의제 — 기간·지역·면적 기준과 무관한 강행 의제)는 NBL 엔진 Step 0.6·building_site·컴패니언 토지 카드에만 걸려 있었다.
 * 같은 토지가 «토지 자산»이면 사업용인데, 주택 부수토지 배율 초과분(G-2·동일일 분리·§155⑳·함께 양도 주택 카드)과 일반건물·상업용건물 부속토지
 * 초과분은 이 의제를 보지 못해 초과분이 비사업용(+10%p)으로 남았다 — 고시일을 받을 입구 자체가 없었다(기존 입력만으로는 재현할 수 없다 →
 * 새 입력 `appurtenantExcessFacts`를 넣어도 master는 그 값을 읽지 않아 같은 세액이다). 주택 초과분의 유예(영 §168의14①)도 같은 입구가 못 읽었다(D1은 NBL 정밀판정 경로만).
 *
 * ## Pre-Do 실측 (mock 세율)
 *
 * | 시료 | 수정 전 | 수정 후 | 독립 검산 |
 * |---|---|---|---|
 * | 주택 G-2 · 2주택 · 초과 700㎡ · 고시 2021-03-01 · 토지 2014-01-01 취득 | 154,500,000 | 149,460,000 | 같은 사실에 소재지만 10배(초과 없음) = 149,460,000 · 누진세율표 438.5M×40%−25.94M |
 * | 1세대1주택(비과세) · 같은 초과 | 113,260,000 | 85,510,000 | 초과분 몫만 일반 토지 한 자산으로 넣은 값 85,510,000 |
 * | 일반건물 환산 · 초과 55㎡ | 455,692,578 | 422,455,601 | 같은 건물 바닥면적 30(초과 없음) = 422,455,601 |
 * | 일반건물 증축 | 454,431,059 | 421,600,188 | 초과 없음 대조 = 421,600,188 |
 * | 일반건물 실거래가 | 514,907,576 | 472,288,357 | 초과 없음 대조 = 472,288,357 |
 * | 상가(CB) 초과 0.75 · 토지 몫 80% | 170,120,000 | 165,060,000 | 초과 없는 같은 상가 = 165,060,000 |
 *
 * ## 설계 결정
 * - 비과세 범위(영 §154⑦)는 의제와 무관하다 — 의제는 «비사업용 토지 여부»만 바꾼다. 그래서 주택 초과분은 여전히 분리해 과세하고 세율만 일반 토지다(+10%p 없음).
 * - 취득일 소급(나목 괄호)은 §104② 기산일과 같은 규칙(`resolveRateBasis`) — 상속=피상속인 · 이월과세 적용(시나리오 A)=증여자 · 그 밖=자기 취득일.
 * - 고시일 미입력은 차단하지 않는다 — 의제 불성립 + 확인 필요 고지(「모름 = 혜택 불성립」).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { gbExcessExpropriationDeem, housingExcessExpropriationOutcome, housingExcessGraceOutcome } from "@/lib/tax-engine/appurtenant-excess-deeming";
import { NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();
const D = (s: string) => new Date(s);
const NOTICE_2021 = D("2021-03-01");
const expro = (notice: Date | undefined, o: Record<string, unknown> = {}) => ({
  transferCause: "public_expropriation",
  ...(notice ? { appurtenantExcessFacts: { expropriationNoticeDate: notice } } : {}),
  ...o,
});

// ══════════════════════════════════════════════════════════════════════
// 1. 주택 배율 초과분 — 2주택(비과세 아님)
// ══════════════════════════════════════════════════════════════════════
/** 토지 2014-01-01 취득 · 주택 2015-01-01 · 양도 2024-09-01 · 토지 1,000㎡ · 정착 100㎡ · 서울 주거(3배) → 초과 700㎡ */
function house(o: Record<string, unknown> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: D("2024-09-01"),
    acquisitionPrice: 450_000_000,
    acquisitionDate: D("2015-01-01"),
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 300_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 250_000_000,
    landAcquisitionDate: D("2014-01-01"),
    appurtenantLandZone: "metropolitan_residential",
    buildingFootprintArea: 100,
    acquisitionArea: 1000,
    ...o,
  } as Partial<TransferTaxInput>);
}
const calc = (i: TransferTaxInput) => calculateTransferTax(i, RATES);
const excessNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((w) => /배율 초과분|고시일/.test(w));

describe("C4-H1 — 주택 G-2 초과분: 수용 의제로 +10%p 가산이 빠진다", () => {
  it("수용 · 고시일 2021-03-01(2년 구간) · 토지 2014 취득 → 149,460,000 (수정 전 154,500,000) — 초과 없는 대조·누진표와 일치", () => {
    const before = calc(house({ transferCause: "public_expropriation" })); // 고시일 없음 = master와 같은 입력
    const after = calc(house(expro(NOTICE_2021)));
    const control = calc(house({ appurtenantLandZone: "non_urban" })); // 10배 → 한도 1,000㎡ → 초과 없음
    expect(before.calculatedTax).toBe(154_500_000);
    expect(control.calculatedTax).toBe(149_460_000);
    // 독립 검산 — 과세표준 438,500,000 × 40% − 누진공제 25,940,000 (2024 누진표 5억 이하 구간)
    expect(Math.floor(438_500_000 * 0.4) - 25_940_000).toBe(149_460_000);
    expect(after.calculatedTax).toBe(149_460_000);
    // 초과분은 여전히 분리된 파트다(비과세 범위와 무관) — 세율만 비사업용이 아니다
    expect(after.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 700, deemedBusiness: { reason: "public_expropriation" } });
    expect(after.splitDetail?.nonBusinessLandPart?.deemedBusiness?.legalBasis).toContain("§168조의14 ③ 3호");
  });

  it("고시일 미입력 → 의제 불성립(비사업용 유지) + 확인 필요 고지 — 차단하지 않는다", () => {
    const r = calc(house(expro(undefined)));
    expect(r.calculatedTax).toBe(154_500_000);
    expect(r.splitDetail?.nonBusinessLandPart?.deemedBusiness).toBeUndefined();
    expect(excessNotice(r)).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });

  it("고시일 2013-03-01 · 토지 2014 취득(고시일 이후 취득) → 불성립 · 154,500,000", () => {
    const r = calc(house(expro(D("2013-03-01"))));
    expect(r.calculatedTax).toBe(154_500_000);
    expect(r.splitDetail?.nonBusinessLandPart?.deemedBusiness).toBeUndefined();
  });

  it("양도원인이 수용이 아니면 고시일을 보내도 읽지 않는다", () => {
    const r = calc(house({ appurtenantExcessFacts: { expropriationNoticeDate: NOTICE_2021 } }));
    expect(r.calculatedTax).toBe(154_500_000);
    expect(excessNotice(r)).toEqual([]);
  });

  it("초과분이 없으면(배율 이내) 수용이어도 고지하지 않는다 — 말할 거리가 없다", () => {
    const r = calc(house(expro(NOTICE_2021, { appurtenantLandZone: "non_urban" })));
    expect(excessNotice(r)).toEqual([]);
  });
});

describe("C4-H2 — 연혁 N(2년/5년)과 경계일 (영 §168의14③3호나목 · 부칙 제31659호 제4조)", () => {
  const deemed = (landAcq: string, notice: string, transfer = "2024-09-01") =>
    calc(house(expro(D(notice), { landAcquisitionDate: D(landAcq), transferDate: D(transfer) }))).splitDetail?.nonBusinessLandPart?.deemedBusiness !== undefined;
  it("고시 2021-05-03(2년 구간): 취득 2019-05-03 성립 / 2019-05-04 불성립", () => {
    expect(deemed("2019-05-03", "2021-05-03")).toBe(true);
    expect(deemed("2019-05-04", "2021-05-03")).toBe(false);
  });
  it("고시 2021-05-04(5년 구간): 취득 2016-05-04 성립 / 2016-05-05 불성립", () => {
    expect(deemed("2016-05-04", "2021-05-04")).toBe(true);
    expect(deemed("2016-05-05", "2021-05-04")).toBe(false);
  });
  it("고시 2006-12-31 이전(가목): 취득일과 무관하게 성립 — 2007-01-01 고시는 나목으로 간다", () => {
    expect(deemed("2005-06-01", "2006-12-31", "2012-09-01")).toBe(true);
  });
});

describe("C4-H3 — 취득일 소급 (Q-11): 상속=피상속인 · 이월과세 적용=증여자 · 그 밖=자기 취득일", () => {
  const facts = (o: Partial<TransferTaxInput>) => ({
    transferCause: "public_expropriation" as const,
    appurtenantExcessFacts: { expropriationNoticeDate: NOTICE_2021 },
    transferDate: D("2024-09-01"),
    acquisitionDate: D("2020-06-01"),
    ...o,
  });
  it("상속: 상속개시일 2020-06-01은 고시일 2년 전(2019-03-01)보다 늦지만 피상속인 취득 2012-01-01로 소급하면 성립", () => {
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "inheritance", decedentAcquisitionDate: D("2012-01-01") }))?.status).toBe("deemed");
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "inheritance" }))?.status).toBe("not_deemed");
  });
  it("상속인이 아닌 수유자(유증·사인증여)는 소급하지 않는다", () => {
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "inheritance", decedentAcquisitionDate: D("2012-01-01"), nonHeirBequest: true }))?.status).toBe("not_deemed");
  });
  it("이월과세 적용(시나리오 A — 취득원인 carryover_gift + 증여자 취득일)이면 증여자 취득일, 배제(시나리오 B — purchase)면 수증일", () => {
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "carryover_gift", donorAcquisitionDate: D("2012-01-01") }))?.status).toBe("deemed");
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "purchase", donorAcquisitionDate: D("2012-01-01") }))?.status).toBe("not_deemed");
  });
  it("단순 증여(gift)는 증여자 취득일로 소급하지 않는다 — 법 §97의2①을 적용받는 경우만이다", () => {
    expect(housingExcessExpropriationOutcome(facts({ acquisitionCause: "gift", donorAcquisitionDate: D("2012-01-01") }))?.status).toBe("not_deemed");
  });
  it("엔진 경로: 상속 주택 — 피상속인 취득일로 소급하면 초과분이 비사업용이 아니다", () => {
    const base = { acquisitionCause: "inheritance", decedentAcquisitionDate: D("2010-01-01"), landAcquisitionDate: D("2020-06-01"), acquisitionDate: D("2020-06-01") };
    const r = calc(house(expro(NOTICE_2021, base)));
    expect(r.splitDetail?.nonBusinessLandPart?.deemedBusiness?.reason).toBe("public_expropriation");
  });
});

describe("C4-H4 — 주택 초과분 유예기간 (영 §168의14① · Q-3a (나) — D1과 같은 규칙)", () => {
  /** 소유 2014-01-01 ~ 2024-09-01 = 3,896일. 유예 2014-01-01 ~ 2023-12-31(3,651일 ≈ 93.7%) → 80% 기준 충족 */
  const grace = (startDate: string, endDate: string) => ({ appurtenantExcessFacts: { graceIntervals: [{ startDate: D(startDate), endDate: D(endDate) }] } });
  it("유예가 소유기간 대부분을 덮으면 초과분을 비사업용으로 보지 않는다 → 149,460,000 (수정 전 154,500,000)", () => {
    const r = calc(house(grace("2014-01-01", "2023-12-31")));
    expect(r.calculatedTax).toBe(149_460_000);
    expect(r.splitDetail?.nonBusinessLandPart?.deemedBusiness).toMatchObject({ reason: "grace_period" });
  });
  it("유예 1년뿐이면 기간기준 미충족 — 비사업용 유지 + 그 사실을 고지한다", () => {
    const r = calc(house(grace("2014-01-01", "2014-12-31")));
    expect(r.calculatedTax).toBe(154_500_000);
    expect(excessNotice(r).some((n) => n.includes("유예기간") && n.includes("충족하지 못해"))).toBe(true);
  });
  it("유예 입력이 없으면 아무것도 바꾸지 않는다", () => {
    expect(housingExcessGraceOutcome({ transferDate: D("2024-09-01"), acquisitionDate: D("2015-01-01") })).toBeUndefined();
  });
  it("수용 의제가 유예보다 먼저다(기간과 무관한 무조건 의제)", () => {
    const r = calc(house({ transferCause: "public_expropriation", appurtenantExcessFacts: { expropriationNoticeDate: NOTICE_2021, ...grace("2014-01-01", "2014-12-31").appurtenantExcessFacts } }));
    expect(r.splitDetail?.nonBusinessLandPart?.deemedBusiness?.reason).toBe("public_expropriation");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. 1세대1주택(비과세) × 배율 초과분 — 의제는 비과세 범위를 넓히지 않는다
// ══════════════════════════════════════════════════════════════════════
describe("C4-H5 — 비과세 주택: 초과분은 여전히 과세되고 세율만 일반 토지다", () => {
  const exempt = (o: Record<string, unknown> = {}) => house({ isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120, ...o });
  it("수정 전 113,260,000 → 수정 후 85,510,000 — 초과분 몫을 일반 토지 한 자산으로 넣은 값과 같다(세액 0이 아니다)", () => {
    const before = calc(exempt(expro(undefined)));
    const after = calc(exempt(expro(NOTICE_2021)));
    expect(before.calculatedTax).toBe(113_260_000);
    expect(after.isExempt).toBe(false);
    expect(after.taxableGain).toBe(350_000_000);
    // 독립 검산 — 초과분(토지분 양도차익 500,000,000 × 700/1,000)을 비사업용이 아닌 토지 한 자산으로
    const landCard = baseTransferInput({
      propertyType: "land", isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0,
      transferPrice: Math.floor(700_000_000 * 0.7), acquisitionPrice: Math.floor(200_000_000 * 0.7),
      acquisitionDate: D("2014-01-01"), transferDate: D("2024-09-01"), isNonBusinessLand: false,
    } as Partial<TransferTaxInput>);
    expect(calc(landCard).calculatedTax).toBe(85_510_000);
    expect(after.calculatedTax).toBe(85_510_000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. 일반건물(GB) 3경로 — 수용 의제만(유예는 주택 배율 축)
// ══════════════════════════════════════════════════════════════════════
function gbAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "2005-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "100000000",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "10",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as never;
}
function gb(over: Record<string, unknown>, exp?: Record<string, unknown>) {
  const asset = gbAsset(over) as { acquisitionDate: string };
  const payload = buildGeneralBuildingValuation(asset as never) as Record<string, unknown>;
  const r = dispatchGeneralBuilding(payload, 2_000_000_000, D("2026-02-16"), D(asset.acquisitionDate), 0, 0, 2026, undefined, [], RATES, undefined, exp as never, undefined);
  const a = r.aggregated as unknown as { totalTax: number; warnings: string[] };
  return { totalTax: a.totalTax, warnings: a.warnings };
}
const EST = { landAcqMode: "estimated", buildingAcqMode: "estimated", gbAcqLandPricePerSqm: "3000000", gbAcqBuildingValue: "10000000", landAcquisitionPrice: "", buildingAcquisitionPrice: "" };
const EXT = { ...EST, gbHasExtension: true, gbExtensionDate: "2018-01-01", gbExtensionArea: "20", gbExtensionAcquisitionCause: "purchase", gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "5000000", gbAcquisitionExtensionBuildingStdPrice: "3000000" };
const GB_EXPRO = { transferCause: "public_expropriation", expropriationNoticeDate: NOTICE_2021 };
const NO_EXCESS = { gbBuildingFootprintArea: "30" }; // 바닥 30 × 상업 3배 = 90㎡ ≥ 토지 85㎡

describe("C4-G — 일반건물 3경로: 수용 의제로 초과분 중과가 빠진다 (토지 자산이면 사업용인 같은 토지)", () => {
  const cases: [string, Record<string, unknown>, number, number][] = [
    ["실거래가", {}, 514_907_576, 472_288_357],
    ["환산", EST, 455_692_578, 422_455_601],
    ["증축", EXT, 454_431_059, 421_600_188],
  ];
  for (const [name, o, before, after] of cases) {
    it(`${name}: 수정 전 ${before.toLocaleString()} → ${after.toLocaleString()} (초과 없는 대조와 같다)`, () => {
      expect(gb(o, { transferCause: "public_expropriation" }).totalTax).toBe(before); // 고시일 없음 = 종전과 같은 입력
      expect(gb({ ...o, ...NO_EXCESS }).totalTax).toBe(after); // 독립 대조 — 초과 면적이 없는 같은 건물
      const r = gb(o, GB_EXPRO);
      expect(r.totalTax).toBe(after);
      expect(r.warnings.some((w) => w.includes("초과분 55㎡") && w.includes("고시일 2021-03-01"))).toBe(true);
    });
  }
  it("고시일 미입력 → 불성립 + 확인 필요 고지(차단하지 않는다)", () => {
    const r = gb({}, { transferCause: "public_expropriation" });
    expect(r.warnings).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });
  it("무허가 단서(전량 비사업용)도 수용 의제가 성립하면 사업용 — 초과 55㎡가 아니라 85㎡ 전량이 의제 대상", () => {
    const r = gb({ gbUnapprovedBuilding: true }, GB_EXPRO);
    expect(r.totalTax).toBe(472_288_357);
  });
  it("이월과세 토지(카드 조립 시점에는 적용 여부를 모른다)는 수증일을 취득일로 판정하고, 증여자 취득일 기준으로만 성립하면 확인 필요 고지를 남긴다", () => {
    const f = {
      transferCause: "public_expropriation" as const,
      expropriationNoticeDate: NOTICE_2021,
      transferDate: D("2024-09-01"),
      acquisitionDate: D("2023-06-01"),
      landAcquisitionCause: "carryover_gift" as const,
      donorAcquisitionDate: D("2010-01-01"),
      hasLandCarryover: true,
    };
    const onlyDonorBasis = gbExcessExpropriationDeem(f);
    expect(onlyDonorBasis.deem).toBeUndefined();
    expect(onlyDonorBasis.carryoverBasisNotice).toBe(true);
    // 수증일 자체가 고시일 2년 전이면 이월과세 적용 여부와 무관하게 성립 — 고지도 없다
    const ownBasis = gbExcessExpropriationDeem({ ...f, acquisitionDate: D("2012-06-01") });
    expect(ownBasis.deem?.deemed).toBe(true);
    expect(ownBasis.carryoverBasisNotice).toBe(false);
    // 이월과세가 아닌 상속 토지는 피상속인 취득일로 소급
    const inherited = gbExcessExpropriationDeem({ ...f, landAcquisitionCause: "inheritance", decedentAcquisitionDate: D("2010-01-01"), hasLandCarryover: false });
    expect(inherited.deem?.deemed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. 상업용건물(CB) STEP 0.62 + 비사업용 파트
// ══════════════════════════════════════════════════════════════════════
describe("C4-C — 상가 부수토지 초과분: 수용 의제로 비사업용 파트가 사라진다", () => {
  const T = 1_200_000_000;
  const A = 600_000_000;
  const EXCESS_75 = { totalLandArea: 2400, totalBuildingFootprintArea: 200, zoneType: "commercial" };
  const std = { transferLandStd: 800_000_000, transferBuildingStd: 200_000_000, acquisitionLandStd: 800_000_000, acquisitionBuildingStd: 200_000_000 };
  const cb = (o: Partial<TransferTaxInput> = {}, cal: object = { ...EXCESS_75, partBasis: std }): TransferTaxInput =>
    baseTransferInput({
      isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0,
      acquisitionDate: D("2014-06-01"), transferDate: D("2024-06-01"),
      propertyType: "commercial_building", transferPrice: T, acquisitionPrice: A, commercialAppurtenantLand: cal, ...o,
    } as Partial<TransferTaxInput>);
  it("초과 0.75 · 토지 몫 80% · 고시일 2021-03-01 → 165,060,000 (수정 전 170,120,000) — 초과 없는 같은 상가와 같다", () => {
    const before = calculateTransferTax(cb({ transferCause: "public_expropriation" }), RATES);
    const control = calculateTransferTax(cb({}, { totalLandArea: 600, totalBuildingFootprintArea: 200, zoneType: "commercial" }), RATES);
    const after = calculateTransferTax(cb(expro(NOTICE_2021) as Partial<TransferTaxInput>), RATES);
    expect(before.calculatedTax).toBe(170_120_000);
    expect(control.calculatedTax).toBe(165_060_000);
    expect(after.calculatedTax).toBe(165_060_000);
    expect(after.commercialNblPart).toBeUndefined(); // 비사업용 파트가 만들어지지 않는다
    expect(before.commercialNblPart).toBeDefined();
    expect(after.warnings?.some((w) => w.includes("고시일 2021-03-01"))).toBe(true);
  });
  it("고시일 미입력 → 불성립 + 확인 필요", () => {
    const r = calculateTransferTax(cb(expro(undefined) as Partial<TransferTaxInput>), RATES);
    expect(r.calculatedTax).toBe(170_120_000);
    expect(r.warnings).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });
  it("무허가 단서(전량) 상가도 의제 성립이면 비사업용이 아니다 — 파트 기준시가 없이도 계산된다", () => {
    const r = calculateTransferTax(cb(expro(NOTICE_2021) as Partial<TransferTaxInput>, { totalLandArea: 1200, totalBuildingFootprintArea: 200, unapprovedBuilding: true }), RATES);
    expect(r.calculatedTax).toBe(165_060_000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. 다건 엔진 — 같은 입력 하나가 단건과 같은 값을 낸다 (입구 일치)
// ══════════════════════════════════════════════════════════════════════
describe("C4-M — 다건(aggregate) 경로도 단건과 같은 의제를 읽는다", () => {
  it("주택 초과분 의제 자산 1건의 다건 결정세액 = 단건 결정세액", () => {
    const input = house(expro(NOTICE_2021));
    const single = calc(input);
    const multi = calculateTransferTaxAggregate(
      { properties: [{ ...input, propertyId: "H", propertyLabel: "H" } as unknown as TransferTaxItemInput], taxYear: 2024, annualBasicDeductionUsed: 0 },
      RATES,
    );
    expect(multi.determinedTax).toBe(single.determinedTax);
  });
});
