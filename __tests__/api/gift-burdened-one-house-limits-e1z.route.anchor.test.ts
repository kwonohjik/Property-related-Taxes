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
