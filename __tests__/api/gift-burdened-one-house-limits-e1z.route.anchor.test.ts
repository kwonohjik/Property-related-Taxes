/**
 * E-1 한계(e1z) — 증여세 부담부증여 양도 경로의 남은 갭 (계획서 §9.3 E-1 행 · 「남은 것」).
 *
 * 경로: 증여세 마법사(⑤) → `bgt`(①) → `buildGiftBurdenedTransferBody`(④) → POST `/api/calc/transfer`(⑫ · ⑭) → 엔진.
 * 각 축은 route 결과로 관측하고(`feedback_leaf_anchor_skips_zod_layer`), 같은 사실을 양도세 계산기
 * (`callTransferTaxAPI`)에 넣은 결론과 대조한다.
 *
 * | 축 | 종전(base) | 고친 뒤 |
 * |---|---|---|
 * | G1 — 비주택(토지·건물) 상속 자산의 「소득세법」 §104②1호 | 상속 칸이 주택 필드 세트에만 있어 상속개시일부터 단기세율 | 같은 위젯(비주택 모드)으로 `acquisitionCause`·`decedentAcquisitionDate` |
 * | G2 — 「소득세법 시행령」 §155의3 상생임대주택 | 입력 없음 → 거주요건(§154①)·표2 거주 2년(§159의4) 그대로 요구 | 판정 메뉴 위젯 재사용 → `winWinRentalHouse` |
 * | G4 — §155④⑤ 합가 | 입력 없음 → 세대 2주택 과세 | 계산기 위젯(`MergeDateSection`) 재사용 → `marriageMerge`·`parentalCareMerge`·`isFirstTransferredInMerge` |
 * | G5 — §155⑳ A 미충족 + 주택 수 1(엔진 — 계산기 공통) | 과세하면서 표2 장특 · 「1세대1주택 비과세」 사유 | 임대주택을 주택 수에 되돌려 판정(2주택 입력과 같은 값) |
 * | G3 — §155⑯ 공공기관 이전 · §155⑱ 처분 지연 사유 | 입력 없음 → 3년(연혁 기한) 경과면 과세 | 판정 메뉴 위젯 재사용 → `temporaryTwoHouse.publicInstitutionRelocation`·`disposalDelayReason` |
 *
 * 시료: 채무 1.5억 · 증여시 기준시가 3억 · 취득시 1.5억(토지·건물은 기준시가 모드) — 양도차익 72,750,000.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

type Obj = Record<string, unknown>;
type R = {
  isExempt: boolean;
  determinedTax: number;
  appliedRate: number;
  transferGain: number;
  longTermHoldingRate: number;
  exemptReason?: string;
  warnings?: string[];
};

/** 서울 강남구 역삼동 — 2017-08-03 조정대상지역 지정 이후 계속 조정(`judgment-transfer-regulated-region-code` 시료) */
const GANGNAM = "1168010100";
const GANGNAM_PNU = `${GANGNAM}100120034`;

// ─── 증여세 쪽 ────────────────────────────────────────────────────────────────

const giftForm = (giftDate: string): FormState =>
  ({ giftDate, donor: "father", donorRelation: "lineal_ascendant_adult", priorGifts: [] }) as unknown as FormState;

function giftItem(bgt: Partial<BurdenedGiftTransferTaxInput>, pnu?: string): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    ...(pnu ? { estateAddress: { jibun: "서울특별시 강남구 역삼동 12-34", pnu } } : {}),
    burdenedGiftTransferTax: {
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      ...bgt,
    },
  } as EstateItem;
}

// ─── 양도세 계산기 쪽(패리티) ──────────────────────────────────────────────────

function transferForm(
  transferDate: string,
  acquisitionDate: string,
  over: Partial<TransferFormData>,
  asset: Obj = {},
  regionCode = "",
): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "1";
  f.isOneHousehold = true;
  f.isRegulatedArea = false;
  f.wasRegulatedAtAcquisition = false;
  f.residencePeriodMonths = "0";
  f.contractTotalPrice = "300,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate,
    actualSalePrice: "300,000,000",
    fixedAcquisitionPrice: "150,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    regionCode,
    ...asset,
  });
  return { ...f, ...over };
}

// ─── 공통 ────────────────────────────────────────────────────────────────────

const post = (body: unknown) =>
  SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(body),
    }),
  );
async function run(body: unknown): Promise<R> {
  const res = await post(body);
  const json = (await res.json()) as { data: { result: R } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result;
}
const gift = (giftDate: string, bgt: Partial<BurdenedGiftTransferTaxInput>, pnu?: string) =>
  run(buildGiftBurdenedTransferBody(giftItem(bgt, pnu), giftForm(giftDate)));
async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const transfer = async (f: TransferFormData) => run(await bodyOf(() => callTransferTaxAPI(f)));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());


// ═══ G1 — 비주택(토지·건물) 상속 자산의 §104②1호 ═══════════════════════════════════

/**
 * 「소득세법」 §104② 「제1항제2호ㆍ제3호 … 의 보유기간은 해당 자산의 취득일부터 양도일까지로 한다. 다만 …
 * 1. 상속받은 자산은 피상속인이 그 자산을 취득한 날」(MST 280405 실독) — 자산 종류·양도 형태의 한정이 없다.
 * 부담부증여의 채무액 부분은 「양도로 본다」(같은 법 §88 1호 후단) ⇒ 증여자가 상속받은 토지·건물이면 그 양도분에도 적용된다.
 * 장기보유특별공제 보유기간은 §95④ 본문(「그 자산의 취득일부터」 — 상속 단서 없음)이라 바뀌지 않는다.
 */
function nonHousingItem(
  category: "real_estate_land" | "real_estate_building",
  bgt: Partial<BurdenedGiftTransferTaxInput>,
): EstateItem {
  return {
    id: "nh-1",
    category,
    name: category === "real_estate_land" ? "테스트 토지" : "테스트 상가",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: { standardPriceAtAcquisition: 150_000_000, isUnregistered: false, ...bgt },
  } as EstateItem;
}
const nh = (category: "real_estate_land" | "real_estate_building", giftDate: string, bgt: Partial<BurdenedGiftTransferTaxInput>) =>
  run(buildGiftBurdenedTransferBody(nonHousingItem(category, bgt), giftForm(giftDate)));

/** 상속개시 2020-06-01(= 취득일) · 피상속인 취득 2010-01-01 */
const NH_ACQ = { acquisitionDate: new Date("2020-06-01") };
const NH_INHERITED = { acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" } as const;

/** 계산기 패리티 — 같은 양도차익(72,750,000)이 되도록 가액을 맞춘다: 양도 1.5억 · 취득 77,250,000 */
function calcNonHousing(kind: "land" | "building", transferDate: string, asset: Obj = {}) {
  return transfer(
    transferForm(transferDate, "2020-06-01", { contractTotalPrice: "150,000,000", isOneHousehold: false }, {
      assetKind: kind,
      actualSalePrice: "150,000,000",
      fixedAcquisitionPrice: "77,250,000",
      ...asset,
    }),
  );
}

describe("G1 ④ — 비주택 상속 자산도 계산기와 같은 키로 싣는다 (§154⑧3호 통산 키는 주택만)", () => {
  it("G1-B1 ★ 토지 · 비주택 건물 → acquisitionCause · decedentAcquisitionDate", () => {
    for (const category of ["real_estate_land", "real_estate_building"] as const) {
      const body = buildGiftBurdenedTransferBody(nonHousingItem(category, { ...NH_ACQ, ...NH_INHERITED }), giftForm("2021-06-01"));
      expect(body, category).toMatchObject({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" });
    }
  });
  it("G1-B2 부정 짝 — 비주택에 남은 동일세대 통산 값(주택 전용 §154⑧3호)은 싣지 않는다 · 원인 매매면 상속 키 없음", () => {
    const stale = {
      ...NH_ACQ,
      ...NH_INHERITED,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2012-01-01",
      decedentCohabitationResidenceMonths: "60",
    };
    const body = buildGiftBurdenedTransferBody(nonHousingItem("real_estate_land", stale), giftForm("2021-06-01"));
    expect(body.acquisitionCause).toBe("inheritance");
    expect(body.decedentSameHouseholdBeforeInheritance).toBeUndefined();
    expect(body.decedentCohabitationHoldingStartDate).toBeUndefined();
    expect(body.decedentCohabitationResidenceMonths).toBeUndefined();
    const purchase = buildGiftBurdenedTransferBody(
      nonHousingItem("real_estate_land", { ...stale, acquisitionCause: "purchase" }),
      giftForm("2021-06-01"),
    );
    expect(purchase).not.toHaveProperty("acquisitionCause");
    expect(purchase).not.toHaveProperty("decedentAcquisitionDate");
  });
});

describe("G1 ⑭ route — 세율 보유기간만 바뀐다 (양도차익·장기보유특별공제 불변), 계산기와 같은 값", () => {
  it("G1-1 ★ 토지 · 보유 1년(증여 2021-06-01): 40% 28,100,000 → 기본세율 24% 11,640,000", async () => {
    const base = await nh("real_estate_land", "2021-06-01", NH_ACQ);
    expect(base.appliedRate).toBe(0.4);
    expect(base.determinedTax).toBe(28_100_000);
    const r = await nh("real_estate_land", "2021-06-01", { ...NH_ACQ, ...NH_INHERITED });
    expect(r.appliedRate).toBe(0.24);
    expect(r.determinedTax).toBe(11_640_000);
    expect(r.transferGain).toBe(base.transferGain);
    expect(r.longTermHoldingRate).toBe(base.longTermHoldingRate);
    expect((await calcNonHousing("land", "2021-06-01")).determinedTax).toBe(28_100_000);
    expect((await calcNonHousing("land", "2021-06-01", NH_INHERITED)).determinedTax).toBe(11_640_000);
  });

  it("G1-2 ★ 비주택 건물 · 보유 6개월(증여 2020-12-01): 50% 35,125,000 → 11,640,000, 계산기와 같은 값", async () => {
    const base = await nh("real_estate_building", "2020-12-01", NH_ACQ);
    expect(base.appliedRate).toBe(0.5);
    expect(base.determinedTax).toBe(35_125_000);
    const r = await nh("real_estate_building", "2020-12-01", { ...NH_ACQ, ...NH_INHERITED });
    expect(r.appliedRate).toBe(0.24);
    expect(r.determinedTax).toBe(11_640_000);
    expect(r.transferGain).toBe(base.transferGain);
    expect((await calcNonHousing("building", "2020-12-01", NH_INHERITED)).determinedTax).toBe(11_640_000);
  });

  it("G1-3 비사업용 토지(선언) — §104① 후단 큰 세액: 단기 40% 28,100,000 → 8호(기본+10%p) 34% 18,665,000", async () => {
    const base = await nh("real_estate_land", "2021-06-01", { ...NH_ACQ, isNonBusinessLand: true });
    expect(base.determinedTax).toBe(28_100_000);
    const r = await nh("real_estate_land", "2021-06-01", { ...NH_ACQ, isNonBusinessLand: true, ...NH_INHERITED });
    expect(r.appliedRate).toBe(0.34);
    expect(r.determinedTax).toBe(18_665_000);
    expect(
      (await calcNonHousing("land", "2021-06-01", { ...NH_INHERITED, isNonBusinessLand: true })).determinedTax,
    ).toBe(18_665_000);
  });

  it("G1-4 부정 짝 — 상속개시일부터 2년 이상(증여 2023-06-01)이면 세율·세액 그대로 10,052,400 · 장특 6%(상속개시일부터 3년)", async () => {
    const base = await nh("real_estate_land", "2023-06-01", NH_ACQ);
    const r = await nh("real_estate_land", "2023-06-01", { ...NH_ACQ, ...NH_INHERITED });
    expect(r.determinedTax).toBe(base.determinedTax);
    expect(r.determinedTax).toBe(10_052_400);
    expect(r.longTermHoldingRate).toBe(0.06);
  });

  it("G1-5 시가 모드(K-4 실지)에서도 바뀌는 축은 세율뿐 — 양도차익 그대로", async () => {
    const market = {
      ...NH_ACQ,
      valuationMode: "sangjeungbeop_market" as const,
      marketValueAtTransfer: 400_000_000,
      landStdPriceAtTransfer: 300_000_000,
      acquisitionMethod: "actual" as const,
      actualAcquisitionTotal: 250_000_000,
    };
    const base = await nh("real_estate_land", "2021-06-01", market);
    const r = await nh("real_estate_land", "2021-06-01", { ...market, ...NH_INHERITED });
    expect(base.appliedRate).toBe(0.4);
    expect(base.determinedTax).toBe(21_500_000);
    expect(r.appliedRate).toBe(0.24);
    expect(r.determinedTax).toBe(7_680_000);
    expect(r.transferGain).toBe(base.transferGain);
  });
});

// ═══ G2 — §155의3 상생임대주택 거주기간 면제 ════════════════════════════════════════

/**
 * 「소득세법 시행령」 §155의3① 「… 상생임대주택을 양도하는 경우에는 제154조제1항, 제155조제20항제1호 및 제159조의4를
 * 적용할 때 해당 규정에 따른 거주기간의 제한을 받지 않는다」(MST 286211 실독). 부담부증여 채무액 부분은 양도(법 §88
 * 1호 후단)이고 이 경로는 그 부분에 §154①을 적용한다 — 같은 구조(§154① 거주기간 면제 × 부담부증여 채무승계액)의
 * 회신: 사전-2022-법규재산-0298(2022.4.29. — 부동산거래관리과-354 인용, taxlaw.nts Playwright 실독).
 * §155의3 × 부담부증여 정면 해석례는 미확보.
 */
const WW = {
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-01-10",
  winWinRentalIncreaseRatePct: "0",
  winWinRentalPriorLeaseMonths: "24",
  winWinRentalLeaseMonths: "24",
} as const;

describe("G2 ④ — 계산기(판정 메뉴 운반 상자)와 같은 leaf로 winWinRentalHouse를 싣는다", () => {
  it("G2-B1 ★ 1세대 1주택 ON + 특례 → winWinRentalHouse(개월·증가율 숫자)", () => {
    const body = buildGiftBurdenedTransferBody(giftItem({ acquisitionDate: new Date("2018-01-01"), ...WW }), giftForm("2024-06-01"));
    expect(body.winWinRentalHouse).toEqual({
      winWinContractDate: "2022-01-10",
      increaseRatePct: 0,
      priorLeaseMonths: 24,
      winWinLeaseMonths: 24,
    });
  });
  it("G2-B2 부정 짝 — 특례 OFF · 1세대 1주택 OFF(게이트 밖) · 비주택 건물이면 키 없음", () => {
    const off = buildGiftBurdenedTransferBody(giftItem({ ...WW, winWinRentalSpecial: false }), giftForm("2024-06-01"));
    expect(off).not.toHaveProperty("winWinRentalHouse");
    const noOne = buildGiftBurdenedTransferBody(giftItem({ ...WW, isOneHousehold: false }), giftForm("2024-06-01"));
    expect(noOne).not.toHaveProperty("winWinRentalHouse");
    const building = { ...giftItem({ ...WW, isHousing: false }), category: "real_estate_building" } as EstateItem;
    expect(buildGiftBurdenedTransferBody(building, giftForm("2024-06-01"))).not.toHaveProperty("winWinRentalHouse");
  });
});

describe("G2 ⑭ route — 거주요건이 면제된다 (계산기와 같은 결론)", () => {
  /** 강남(2017-08-03 이후 조정) 2018-01-01 취득 · 거주 0 · 증여 2024-06-01 */
  const REG = { acquisitionDate: new Date("2018-01-01") };

  it("G2-1 ★ §154① 거주요건 — 과세 9,004,800 → 상생임대면 비과세, 계산기(운반 상자)와 같은 결론", async () => {
    const base = await gift("2024-06-01", REG, GANGNAM_PNU);
    expect(base.isExempt).toBe(false);
    expect(base.determinedTax).toBe(9_004_800);
    const r = await gift("2024-06-01", { ...REG, ...WW }, GANGNAM_PNU);
    expect(r.isExempt).toBe(true);
    expect(r.determinedTax).toBe(0);
    const { oneHouseJudgmentExtraDefaults } = await import("@/lib/stores/one-house-extra-fields.types");
    const f = transferForm("2024-06-01", "2018-01-01", {}, {}, GANGNAM);
    expect((await transfer(f)).isExempt).toBe(false);
    f.importedOneHouseFacts = { ...oneHouseJudgmentExtraDefaults, ...WW } as TransferFormData["importedOneHouseFacts"];
    expect((await transfer(f)).isExempt).toBe(true);
  });

  it("G2-2 ★ §159의4 표2 거주 2년 — 12억 초과(증여가액 20억) · 비조정 취득(2016) · 거주 0: 표1 16% 41,034,800 → 표2 보유 32% 29,857,000", async () => {
    const hv = (bgt: Partial<BurdenedGiftTransferTaxInput>) =>
      run(
        buildGiftBurdenedTransferBody(
          {
            ...giftItem({ acquisitionDate: new Date("2016-01-01"), standardPriceAtAcquisition: 1_000_000_000, ...bgt }, GANGNAM_PNU),
            standardPrice: 2_000_000_000,
            leaseDeposit: 1_000_000_000,
            mortgageAmount: 0,
            assumedDebtForGift: 1_000_000_000,
          } as EstateItem,
          giftForm("2024-06-01"),
        ),
      );
    const base = await hv({});
    expect(base.longTermHoldingRate).toBe(0.16);
    expect(base.determinedTax).toBe(41_034_800);
    const r = await hv(WW);
    expect(r.longTermHoldingRate).toBe(0.32);
    expect(r.determinedTax).toBe(29_857_000);
    expect(r.transferGain).toBe(base.transferGain);
  });

  it("G2-3 부정 짝 — 요건 미충족(체결일 2021-12-19 · 증가율 6% · 상생임대 23개월)이면 면제 없음 9,004,800", async () => {
    for (const miss of [
      { winWinRentalContractDate: "2021-12-19" },
      { winWinRentalIncreaseRatePct: "6" },
      { winWinRentalLeaseMonths: "23" },
    ]) {
      const r = await gift("2024-06-01", { ...REG, ...WW, ...miss }, GANGNAM_PNU);
      expect(r.isExempt, JSON.stringify(miss)).toBe(false);
      expect(r.determinedTax).toBe(9_004_800);
    }
  });
});

// ═══ G3 — §155⑯ 공공기관·법인 지방이전 · §155⑱ 처분 지연 사유 ════════════════════════════

/**
 * 「소득세법 시행령」 §155⑯ 「… 이전한 시ㆍ군 또는 이와 연접한 시ㆍ군의 지역에 소재하는 경우에는 제1항 중 "3년"을
 * "5년"으로 본다」 · §155⑱ 「다른 주택을 취득한 날부터 3년이 되는 날 현재 다음 각 호의 어느 하나에 해당하는 경우」
 * (§155① 본문 괄호 「제18항에 따른 사유에 해당하는 경우를 포함한다」 — MST 286211 실독). 이 경로의 §155① 적용은
 * E-1(#1836)에서 배선됐고, ⑯·⑱은 그 기한을 바꾸는 같은 항의 입력이다.
 * 시료: 종전(증여) 주택 2015-01-01 · 신규 주택 2020-01-01 · 세대 2주택.
 */
const TT = (extra: Record<string, unknown> = {}) => ({
  acquisitionDate: new Date("2015-01-01"),
  householdHousingCount: 2,
  temporaryTwoHouse: {
    previousAcquisitionDate: new Date("2015-01-01"),
    newAcquisitionDate: new Date("2020-01-01"),
    ...extra,
  },
}) as Partial<BurdenedGiftTransferTaxInput>;
/** 세종(3611) — 연접 목록에 공주(4415)가 있고 인천 서구(2826)는 없다(`getAdjacentSigunguCodes`) */
const SEJONG = "3611000000";
const GONGJU_BJD = "4415010100";
const SEO_GU_BJD = "2826010100";

describe("G3 ④ — 계산기·판정 메뉴와 같은 leaf(`buildTempTwoHouseDeadlineExceptionFacts`)로 싣는다", () => {
  it("G3-B1 ★ ⑯ + 이전지·신규 주택 소재지 → publicInstitutionRelocation · relocatedSigunguCode · newHouseSigunguCode(소재지 법정동코드에서 파생) · ⑱ 사유", () => {
    const body = buildGiftBurdenedTransferBody(
      giftItem(TT({ publicInstitutionRelocation: true, relocatedSigunguCode: SEJONG, newHouseRegionCode: GONGJU_BJD, disposalDelayReason: "auction" })),
      giftForm("2023-06-01"),
    );
    expect(body.temporaryTwoHouse).toMatchObject({
      publicInstitutionRelocation: true,
      relocatedSigunguCode: SEJONG,
      newHouseSigunguCode: "4415000000",
      disposalDelayReason: "auction",
    });
  });
  it("G3-B2 부정 짝 — ⑯ OFF면 코드도 싣지 않는다 · 사유 \"\"(해당 없음) 미전송 · 세대 1주택(게이트 밖)이면 둘 다 없음", () => {
    const off = buildGiftBurdenedTransferBody(
      giftItem(TT({ publicInstitutionRelocation: false, relocatedSigunguCode: SEJONG, disposalDelayReason: "" })),
      giftForm("2023-06-01"),
    ).temporaryTwoHouse as Obj;
    expect(off).not.toHaveProperty("publicInstitutionRelocation");
    expect(off).not.toHaveProperty("relocatedSigunguCode");
    expect(off).not.toHaveProperty("disposalDelayReason");
    const one = buildGiftBurdenedTransferBody(
      giftItem({ ...TT({ publicInstitutionRelocation: true, disposalDelayReason: "auction" }), householdHousingCount: 1 }),
      giftForm("2023-06-01"),
    ).temporaryTwoHouse as Obj | undefined;
    expect(one?.publicInstitutionRelocation).toBeUndefined();
    expect(one?.disposalDelayReason).toBeUndefined();
  });
});

describe("G3 ⑭ route — 처분기한이 바뀐다 (계산기와 같은 결론)", () => {
  it("G3-1 ★ ⑯(자기선언) — 증여 2023-06-01(신규 취득 3년 5개월): 과세 8,306,400 → 5년 기한 비과세", async () => {
    const base = await gift("2023-06-01", TT());
    expect(base.isExempt).toBe(false);
    expect(base.determinedTax).toBe(8_306_400);
    const r = await gift("2023-06-01", TT({ publicInstitutionRelocation: true }));
    expect(r.isExempt).toBe(true);
  });

  it("G3-2 ⑯ 연접 판정 — 세종 이전 · 신규 주택 공주(연접)면 비과세 · 인천 서구(비연접)면 과세 8,306,400 그대로", async () => {
    const adj = await gift("2023-06-01", TT({ publicInstitutionRelocation: true, relocatedSigunguCode: SEJONG, newHouseRegionCode: GONGJU_BJD }));
    expect(adj.isExempt).toBe(true);
    const far = await gift("2023-06-01", TT({ publicInstitutionRelocation: true, relocatedSigunguCode: SEJONG, newHouseRegionCode: SEO_GU_BJD }));
    expect(far.isExempt).toBe(false);
    expect(far.determinedTax).toBe(8_306_400);
  });

  it("G3-3 ★ ⑱ 경매 신청 — 증여 2025-06-01(5년 경과): 과세 7,608,000 → 비과세 · ⑯만으로는(5년 초과) 과세 그대로", async () => {
    expect((await gift("2025-06-01", TT())).determinedTax).toBe(7_608_000);
    expect((await gift("2025-06-01", TT({ disposalDelayReason: "auction" }))).isExempt).toBe(true);
    const r16 = await gift("2025-06-01", TT({ publicInstitutionRelocation: true }));
    expect(r16.isExempt).toBe(false);
    expect(r16.determinedTax).toBe(7_608_000);
  });

  it("G3-4 패리티 — 계산기에 같은 사실(명부 행 신규 주택 · ⑯ · ⑱)을 넣으면 같은 결론", async () => {
    const calcAt = (transferDate: string, over: Partial<TransferFormData>) => {
      const f = transferForm(transferDate, "2015-01-01", { householdHousingCount: "2", ...over });
      f.houses = [
        {
          id: "h-new",
          region: "capital",
          acquisitionDate: "2020-01-01",
          officialPrice: "300000000",
          isInherited: false,
          isLongTermRental: false,
          isApartment: false,
          isOfficetel: false,
          isUnsoldHousing: false,
          acquisitionPrice: "",
          exclusiveArea: "",
          isUnsoldNewHouse: false,
          completionDate: "",
          isSpouseOwned: false,
          isCoInherited: false,
          decedentSameHouseholdAtInheritance: false,
          isRankingDisqualifiedInheritedHouse: false,
        } as unknown as TransferFormData["houses"][number],
      ];
      return f;
    };
    expect((await transfer(calcAt("2023-06-01", {}))).isExempt).toBe(false);
    expect((await transfer(calcAt("2023-06-01", { publicInstitutionRelocation: true }))).isExempt).toBe(true);
    expect((await transfer(calcAt("2025-06-01", { disposalDelayReason: "auction" }))).isExempt).toBe(true);
  });
});

// ═══ G4 — §155④⑤ 합가 ══════════════════════════════════════════════════════════════

/**
 * 「소득세법 시행령」 §155⑤ 「… 혼인함으로써 1세대가 2주택을 보유하게 되는 경우 … 혼인한 날부터 10년 이내에 먼저
 * 양도하는 주택은 이를 1세대1주택으로 보아 제154조제1항을 적용한다」 · ④ 동거봉양 합가(MST 286211 실독).
 * 부담부증여 정면 회신: 서면-2022-법규재산-1634(법규과-1817, 2022.6.17. — 혼인합가 2주택 중 1주택을 별도세대에게
 * 부담부증여 「인계하는 채무액에 해당하는 부분에 대해」 §155⑤ 비과세, taxlaw.nts Playwright 실독).
 * 합가 전 보유 구성(#1876 — 명부 행별 합가 전 보유자)은 이 경로에 명부가 없어 판정하지 않는다(계산기 명부 없음과 같다).
 */
const TWO_HOUSES = { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 2 };

describe("G4 ④ — 계산기와 같은 leaf(`buildMergeFacts`)로 싣는다", () => {
  it("G4-B1 ★ 세대 2주택 + 혼인합가일 · 먼저 양도 → marriageMerge · isFirstTransferredInMerge / 동거봉양 → parentalCareMerge", () => {
    const m = buildGiftBurdenedTransferBody(
      giftItem({ ...TWO_HOUSES, marriageDate: "2020-01-01", isFirstTransferredInMerge: true }),
      giftForm("2023-06-01"),
    );
    expect(m).toMatchObject({ marriageMerge: { marriageDate: "2020-01-01" }, isFirstTransferredInMerge: true });
    const p = buildGiftBurdenedTransferBody(giftItem({ ...TWO_HOUSES, parentalCareMergeDate: "2020-01-01" }), giftForm("2023-06-01"));
    expect(p).toMatchObject({ parentalCareMerge: { mergeDate: "2020-01-01" } });
  });
  it("G4-B2 부정 짝 — 세대 1주택(게이트 밖)의 stale 합가일은 싣지 않는다 · 빈 값이면 키 없음", () => {
    const one = buildGiftBurdenedTransferBody(
      giftItem({ ...TWO_HOUSES, householdHousingCount: 1, marriageDate: "2020-01-01", isFirstTransferredInMerge: true }),
      giftForm("2023-06-01"),
    );
    expect(one).not.toHaveProperty("marriageMerge");
    expect(one).not.toHaveProperty("isFirstTransferredInMerge");
    const empty = buildGiftBurdenedTransferBody(giftItem(TWO_HOUSES), giftForm("2023-06-01"));
    expect(empty).not.toHaveProperty("marriageMerge");
    expect(empty).not.toHaveProperty("parentalCareMerge");
  });
});

describe("G4 ⑭ route — §155⑤ 혼인합가 10년 이내 먼저 양도 → 비과세 (계산기와 같은 결론)", () => {
  it("G4-1 ★ 혼인 2020-01-01 · 증여 2023-06-01 · 세대 2주택: 과세 8,306,400 → 비과세(계산기) · 부담부증여는 명부 입력 경로가 없어 불성립 유지", async () => {
    /**
     * 🔁 2026-10-05 — 부담부증여 양도분(`BurdenedGiftTransferTaxInput`)은 세대 보유 주택
     * 명부(`houses`) 입력 경로가 없다(사용자 결정 Q-10 — 범위 밖, `merge-composition-unknown-
     * unfavorable.plan.md` §7). 합가 전 구성을 알려줄 수 없으므로 「모름」이 되어 §155④⑤
     * 합가 의제가 더는 성립하지 않는다(종전 permissive pass는 정책 변경으로 해소됨).
     * 계산기(`transfer`)는 명부 입력 경로가 있으므로 그대로 비과세다.
     */
    const MERGE_HOUSES = [
      {
        id: "h1",
        region: "capital" as const,
        acquisitionDate: "2012-01-01",
        officialPrice: "300000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        mergeOrigin: "counterpart_side" as const,
      },
    ];
    const base = await gift("2023-06-01", TWO_HOUSES);
    expect(base.isExempt).toBe(false);
    expect(base.determinedTax).toBe(8_306_400);
    const r = await gift("2023-06-01", { ...TWO_HOUSES, marriageDate: "2020-01-01", isFirstTransferredInMerge: true });
    expect(r.isExempt).toBe(false);
    const calc = (over: Partial<TransferFormData>) =>
      transfer(transferForm("2023-06-01", "2015-01-01", { householdHousingCount: "2", ...over }));
    expect((await calc({})).isExempt).toBe(false);
    expect(
      (
        await calc({ marriageDate: "2020-01-01", isFirstTransferredInMerge: true, houses: MERGE_HOUSES })
      ).isExempt,
    ).toBe(true);
  });
  it("G4-2 부정 짝 — 혼인일부터 10년 경과(2013-01-01) 증여면 과세 8,306,400 그대로", async () => {
    const r = await gift("2023-06-01", { ...TWO_HOUSES, marriageDate: "2013-01-01", isFirstTransferredInMerge: true });
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(8_306_400);
  });
});

// ═══ G5 — §155⑳ 시나리오 A 미충족 + 주택 수 1 (엔진 — 계산기 공통) ════════════════════════

/**
 * #1851 C probe의 미분석 결과(증여 2026-06-01 · 주택 수 1 · 특례 입력 → 결정세액 2,730,000에 「1세대1주택 비과세」 사유)의
 * 원인: 카드는 A를 「임대주택 주택수 제외」로 안내해 주택 수 1을 받는데, 특례가 불성립(㉓ 기한 2026-03-03 경과)해도
 * 하류가 주택 수 1을 그대로 봐 **표2 장특 60%**와 비과세 사유를 냈다(F3는 조기반환만 막았다). 영 §155⑳ 「… 1개의
 * 주택을 소유하고 있는 것으로 보아」가 없으면 임대주택은 주택 수에 들어간다 ⇒ 2주택 세대 · 표1 · 사유 없음.
 */
describe("G5 ⑭ route — A 미충족이면 임대주택을 주택 수에 되돌린다 (계산기도 같은 엔진)", () => {
  const rheOf = async () => {
    const { makeDefaultRentalUnit } = await import("@/lib/stores/calc-wizard-asset-factory");
    return {
      applyException: true,
      scenario: "A" as const,
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2018-06-01",
          rentalRegistrationDate: "2018-06-01",
          standardPriceAtRentalStart: "300,000,000",
          rentalInputMode: "direct" as const,
          rentalMonths: "30",
          requirementsConfirmed: true,
          rentalAutoTermination: true,
          terminatedRegistrationType: "short_term" as const,
          registrationCancellationDate: "2021-03-03",
        },
      ],
      postRegistrationResidenceMonths: "",
      priorRentalExemptionHistory: "" as const,
      residenceTransitionUnderAddendum: false,
    };
  };
  const RES = { acquisitionDate: new Date("2016-01-10"), residencePeriodMonths: 60 };

  it("G5-1 ★ 증여 2026-06-01(㉓ 기한 경과) · 주택 수 1: 2,730,000(표2 60% · 비과세 사유) → 7,608,000(표1 20% · 사유 없음) = 주택 수 2 입력과 같은 값", async () => {
    const rhe = await rheOf();
    const r = await gift("2026-06-01", { ...RES, householdHousingCount: 1, rentalHousingException: rhe } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(7_608_000);
    expect(r.longTermHoldingRate).toBe(0.2);
    expect(r.exemptReason).toBeUndefined();
    expect((r.warnings ?? []).some((w) => w.includes("임대주택 1호를 세대 주택 수에 넣어(2주택)"))).toBe(true);
    const two = await gift("2026-06-01", { ...RES, householdHousingCount: 2, rentalHousingException: rhe } as Partial<BurdenedGiftTransferTaxInput>);
    expect(two.determinedTax).toBe(r.determinedTax);
  });

  it("G5-2 ★ 계산기 경로(같은 엔진) — 주택 수 1 + 같은 임대주택: 7,608,000, 주택 수 2와 같은 값", async () => {
    const rhe = await rheOf();
    const calc = async (count: string) => {
      const f = transferForm("2026-06-01", "2016-01-10", { householdHousingCount: count }, { residencePeriodMonthsAsset: "60" });
      f.assets[0].rentalHousingException = { ...f.assets[0].rentalHousingException, ...rhe };
      return transfer(f);
    };
    const one = await calc("1");
    expect(one.isExempt).toBe(false);
    expect(one.exemptReason).toBeUndefined();
    expect(one.determinedTax).toBe((await calc("2")).determinedTax);
  });

  it("G5-3 부정 짝 — 특례 성립(증여 2025-06-01)이면 주택 수 1 그대로 비과세 · 특례 선언 없으면 1주택 비과세 그대로", async () => {
    const rhe = await rheOf();
    const ok = await gift("2025-06-01", { ...RES, householdHousingCount: 1, rentalHousingException: rhe } as Partial<BurdenedGiftTransferTaxInput>);
    expect(ok.isExempt).toBe(true);
    // 종전 경로(STEP 1a 조기반환 — 주택 수 1 그대로) 불변: 특례 성립이면 되돌리지 않는다
    expect(ok.exemptReason).toBe("1세대1주택 비과세");
    expect((ok.warnings ?? []).some((w) => w.includes("세대 주택 수에 넣어"))).toBe(false);
    const none = await gift("2026-06-01", { ...RES, householdHousingCount: 1 });
    expect(none.isExempt).toBe(true);
  });
});
