/**
 * E-1 잔여 — 증여세 부담부증여 양도 경로에 남은 1세대1주택 갭 (계획서 §9.3 E-1 행 · E-1 잔여).
 *
 * 경로: 증여세 마법사 `BurdenedGiftHousingFieldSet`(⑤) → `bgt`(①) → `buildGiftBurdenedTransferBody`(④) →
 *       POST `/api/calc/transfer`(⑫ · ⑭) → 엔진. 「본문에 키가 있다」는 도달을 증명하지 않는다 — route 결과로
 *       관측한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * | 축 | 종전(base) | 고친 뒤 | 패리티(양도세 계산기 `callTransferTaxAPI`) |
 * |---|---|---|---|
 * | A — 「양도시 조정대상지역」 토글 ↔ 증여 주택 주소 | 주소가 있어도 토글(기본 OFF)만 중과·단기세율에 쓰임 | 안 만진 토글은 주소 판정(`giftBurdenedEffectiveIsRegulatedArea`) | 계산기 `useRegulatedAreaAutoTip`이 주소로 채운 토글 |
 * | B — §155①2호 신규 주택 소재지 | 신규 주택 조정 여부는 선언으로만(미선언이면 판정 보류·대리 지표) | 주소 한 칸 → `temporaryTwoHouse.newHouseRegionCode` | 보유 주택 명부 행 `regionCode` |
 * | D — 상속받은 주택(§104②1호 · §154⑧3호) | 취득 원인 칸 없음 → 상속개시일부터 세율·보유 기산 | `InheritedSameHouseholdField` 재사용 → `acquisitionCause` · `decedent*` | `assets[0].acquisitionCause` · `decedent*` |
 *
 * 시료는 모두 아파트 1채 부담부증여(증여일 = 양도일) · 채무 1.5억 · 증여시 기준시가 3억 · 취득시 1.5억.
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

// ═══ D — 상속받은 주택 (§104②1호 · §154⑧3호) ══════════════════════════════════

/** 상속개시 2020-06-01(= 취득일) · 피상속인 취득 2010-01-01 · 증여 2021-06-01(보유 1년 — 단기세율 구간) */
const INHERITED = { acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" } as const;
const SAME_HOUSEHOLD = {
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2012-01-01",
  decedentCohabitationResidenceMonths: "60",
} as const;
const ACQ = { acquisitionDate: new Date("2020-06-01") };

describe("D ④ — 상속 사실을 계산기와 같은 키로 싣는다 (주택만)", () => {
  it("D-B1 상속 + 동일세대 → acquisitionCause · decedentAcquisitionDate · §154⑧3호 3필드", () => {
    const body = buildGiftBurdenedTransferBody(giftItem({ ...ACQ, ...INHERITED, ...SAME_HOUSEHOLD }), giftForm("2021-06-01"));
    expect(body).toMatchObject({
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2010-01-01",
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2012-01-01",
      decedentCohabitationResidenceMonths: 60,
    });
  });
  it("D-B2 부정 짝 — 원인이 매매(토글 OFF)면 남은 상속 값을 싣지 않는다", () => {
    const body = buildGiftBurdenedTransferBody(
      giftItem({ ...ACQ, ...INHERITED, ...SAME_HOUSEHOLD, acquisitionCause: "purchase" }),
      giftForm("2021-06-01"),
    );
    expect(body).not.toHaveProperty("acquisitionCause");
    expect(body).not.toHaveProperty("decedentAcquisitionDate");
    expect(body.decedentSameHouseholdBeforeInheritance).toBeUndefined();
  });
});

describe("D ⑭ route — 축별 기여 (같은 시료에서 한 축씩 연다)", () => {
  it("D-0 종전(base) — 상속개시일부터 1년 보유 · 비과세 아님 · 주택 1~2년 세율 60% → 42,150,000", async () => {
    const r = await gift("2021-06-01", ACQ);
    expect(r.isExempt).toBe(false);
    expect(r.appliedRate).toBe(0.6);
    expect(r.determinedTax).toBe(42_150_000);
  });

  it("D-1 ★ §104②1호만(동일세대 아님) — 세율 보유기간을 피상속인 취득일부터 → 기본세율 24% · 11,640,000 (양도차익·장특 불변), 계산기와 같은 세율", async () => {
    const base = await gift("2021-06-01", ACQ);
    const r = await gift("2021-06-01", { ...ACQ, ...INHERITED });
    expect(r.isExempt).toBe(false);
    expect(r.appliedRate).toBe(0.24);
    expect(r.determinedTax).toBe(11_640_000);
    expect(r.transferGain).toBe(base.transferGain);
    expect(r.longTermHoldingRate).toBe(base.longTermHoldingRate);
    // 패리티 — 같은 양도차익(72,750,000)이 되도록 계산기 가액을 맞춘다: 양도 1.5억 · 취득 77,250,000
    const same = { actualSalePrice: "150,000,000", fixedAcquisitionPrice: "77,250,000" };
    const calcBase = await transfer(
      transferForm("2021-06-01", "2020-06-01", { contractTotalPrice: "150,000,000" }, same),
    );
    expect(calcBase.determinedTax).toBe(42_150_000);
    const calc = await transfer(
      transferForm("2021-06-01", "2020-06-01", { contractTotalPrice: "150,000,000" }, { ...same, ...INHERITED }),
    );
    expect(calc.appliedRate).toBe(0.24);
    expect(calc.determinedTax).toBe(11_640_000);
  });

  it("D-2 ★ §154⑧3호만(피상속인 취득일 = 상속개시 전날 → 세율 축은 그대로) — 동일세대 보유 통산 → 비과세, 계산기와 같은 결론", async () => {
    const onlySame = { ...ACQ, ...INHERITED, decedentAcquisitionDate: "2020-05-31", ...SAME_HOUSEHOLD };
    // 세율 축이 움직이지 않음을 먼저 확인(동일세대 없이 같은 피상속인 취득일)
    const rateOnly = await gift("2021-06-01", { ...ACQ, ...INHERITED, decedentAcquisitionDate: "2020-05-31" });
    expect(rateOnly.determinedTax).toBe(42_150_000);
    const r = await gift("2021-06-01", onlySame);
    expect(r.isExempt).toBe(true);
    expect(r.determinedTax).toBe(0);
    const calc = await transfer(
      transferForm("2021-06-01", "2020-06-01", {}, {
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "2020-05-31",
        ...SAME_HOUSEHOLD,
      }),
    );
    expect(calc.isExempt).toBe(true);
  });

  it("D-3 ★ §154⑧3호 거주 통산 — 강남(조정) 2018-06-01 상속·상속 후 거주 0: 과세 10,592,400 → 동일세대 거주 60개월 통산으로 비과세, 계산기와 같은 결론", async () => {
    const bgt = { acquisitionDate: new Date("2018-06-01") };
    const base = await gift("2021-06-01", bgt, GANGNAM_PNU);
    expect(base.isExempt).toBe(false);
    expect(base.determinedTax).toBe(10_592_400);
    // 상속만(동일세대 아님) — 거주요건 그대로 과세
    expect((await gift("2021-06-01", { ...bgt, ...INHERITED }, GANGNAM_PNU)).determinedTax).toBe(10_592_400);
    const r = await gift("2021-06-01", { ...bgt, ...INHERITED, ...SAME_HOUSEHOLD }, GANGNAM_PNU);
    expect(r.isExempt).toBe(true);
    const calc = await transfer(
      transferForm("2021-06-01", "2018-06-01", {}, { ...INHERITED, ...SAME_HOUSEHOLD }, GANGNAM),
    );
    expect(calc.isExempt).toBe(true);
  });

  it("D-4 시가 모드(K-4 실지 · K-5 환산)에서도 바뀌는 축은 세율뿐이다 — 양도차익 그대로", async () => {
    const market = {
      ...ACQ,
      householdHousingCount: 2,
      valuationMode: "sangjeungbeop_market" as const,
      marketValueAtTransfer: 400_000_000,
    };
    for (const m of [
      { acquisitionMethod: "actual" as const, actualAcquisitionTotal: 250_000_000 },
      { acquisitionMethod: "converted" as const },
    ]) {
      const base = await gift("2021-06-01", { ...market, ...m });
      const r = await gift("2021-06-01", { ...market, ...m, ...INHERITED });
      expect(base.appliedRate).toBe(0.6);
      expect(r.appliedRate).toBe(0.24);
      expect(r.transferGain).toBe(base.transferGain);
      expect(r.longTermHoldingRate).toBe(base.longTermHoldingRate);
    }
  });
});

// ═══ A — 「양도시(증여일) 조정대상지역」 토글 ↔ 증여 주택 주소 ═══════════════════════════════

/**
 * 계산기 규칙(`useRegulatedAreaAutoTip`): 주소가 있으면 `/api/address/regulated-area`(= `checkRegulatedAreaByCode`)의
 * 양도일 판정으로 토글을 채운다 — **사용자가 직접 만진 토글은 덮어쓰지 않는다**(`isRegulatedAreaTouched`).
 * 이 경로는 store에 쓰지 않고 같은 규칙을 파생한다: 저장값이 없으면(= 안 만짐) 주소 판정, 있으면 그 값.
 */
describe("A ⑭ route — 주소가 있으면 안 만진 토글은 주소 판정을 따른다 (계산기와 같은 규칙)", () => {
  /** 강남 · 2주택(일시적 2주택 아님) · 증여 2021-06-01(중과 유예 전) */
  const TWO = { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 2, isRegulatedArea: undefined };

  it("A-0 종전(base 재현) — 토글 저장값 false면 중과 없음 9,544,800", async () => {
    const r = await gift("2021-06-01", { ...TWO, isRegulatedArea: false }, GANGNAM_PNU);
    expect(r.determinedTax).toBe(9_544_800);
  });

  it("A-1 ★ 안 만진 토글(저장값 없음) + 강남 주소 → 조정 2주택 중과 25,690,000, 계산기(주소로 채운 토글)와 같은 세액", async () => {
    const r = await gift("2021-06-01", TWO, GANGNAM_PNU);
    expect(r.determinedTax).toBe(25_690_000);
    // 패리티 — 계산기는 주소 판정값(`checkRegulatedAreaByCode`)으로 토글을 채운다
    const { checkRegulatedAreaByCode } = await import("@/lib/regulated-area");
    const filled = checkRegulatedAreaByCode(GANGNAM, "2021-06-01").isRegulated;
    expect(filled).toBe(true);
    const same = { actualSalePrice: "150,000,000", fixedAcquisitionPrice: "77,250,000" };
    const calc = await transfer(
      transferForm(
        "2021-06-01",
        "2015-01-01",
        { contractTotalPrice: "150,000,000", householdHousingCount: "2", isRegulatedArea: filled },
        same,
        GANGNAM,
      ),
    );
    expect(calc.determinedTax).toBe(25_690_000);
  });

  it("A-2 부정 짝 — 주소가 없으면 저장값 그대로(없음 = 아님) · 사용자가 끈 토글(false)은 주소가 있어도 이긴다", async () => {
    expect((await gift("2021-06-01", TWO)).determinedTax).toBe(9_544_800);
    expect((await gift("2021-06-01", { ...TWO, isRegulatedArea: false }, GANGNAM_PNU)).determinedTax).toBe(9_544_800);
    expect((await gift("2021-06-01", { ...TWO, isRegulatedArea: true })).determinedTax).toBe(25_690_000);
  });

  it("A-3 부정 짝 — 증여일에 조정이 아닌 주소(강남 2017-08-02 = 지정 전)면 안 만진 토글은 「아님」", async () => {
    const r = await gift("2017-08-02", { ...TWO, acquisitionDate: new Date("2010-01-01") }, GANGNAM_PNU);
    const on = await gift("2017-08-02", { ...TWO, acquisitionDate: new Date("2010-01-01"), isRegulatedArea: true }, GANGNAM_PNU);
    const off = await gift("2017-08-02", { ...TWO, acquisitionDate: new Date("2010-01-01"), isRegulatedArea: false }, GANGNAM_PNU);
    expect(r.determinedTax).toBe(off.determinedTax);
    expect(r.determinedTax).not.toBe(on.determinedTax);
  });
});

// ═══ B — §155①2호 신규 주택 소재지 → 신규 주택 취득일 현재 조정대상지역 ═══════════════════════

/**
 * 계산기는 신규 주택 법정동코드를 **보유 주택 명부 행의 주소**에서만 얻는다(`resolveTemporaryTwoHouse` →
 * `newHouseRegionCode`). 이 경로에는 명부가 없어 신규 주택 소재지 한 칸을 같은 주소 위젯(`AddressSearch`)으로
 * 받고 같은 leaf(`toTemporaryTwoHouseEraFacts`)로 싣는다.
 * 시료는 계산기 anchor `transfer.route.temp-two-house-a2b` R-4와 같다: 인천 서구는 2020-06-19 조정 지정.
 */
describe("B ⑭ route — 신규 주택 주소가 선언 없이 신규 주택 조정 여부를 정한다 (계산기 명부와 같은 결론)", () => {
  const SEO_GU = "2826010100";
  const at = (newAcq: string, newHouseRegionCode?: string) => ({
    acquisitionDate: new Date("2015-01-01"),
    householdHousingCount: 2,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date(newAcq),
      ...(newHouseRegionCode ? { newHouseRegionCode } : {}),
    },
  });

  it("B-0 종전(base) — 신규 주택 선언·주소 없음: 판정 보류(양도일 기준 대리 지표 = 조정) → 1년 기한 경과로 과세", async () => {
    const r = await gift("2021-08-01", at("2020-06-18"), GANGNAM_PNU);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(9_544_800);
    expect((r.warnings ?? []).some((w) => w.includes("신규주택 취득일 기준"))).toBe(true);
  });

  it("B-1 ★ 신규 주택 서구 2020-06-18 취득(지정 전) → 조정→비조정이라 3년 기한 → 비과세, 계산기 명부와 같은 결론", async () => {
    const r = await gift("2021-08-01", at("2020-06-18", SEO_GU), GANGNAM_PNU);
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).some((w) => w.includes("신규주택 취득일 기준"))).toBe(false);
  });

  it("B-2 부정 짝 — 2020-06-19 취득(지정 당일)이면 조정→조정 1년 기한 → 과세 9,544,800, 판정 보류 고지 없음", async () => {
    const r = await gift("2021-08-01", at("2020-06-19", SEO_GU), GANGNAM_PNU);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(9_544_800);
    expect((r.warnings ?? []).some((w) => w.includes("신규주택 취득일 기준"))).toBe(false);
  });

  it("B-3 패리티 — 계산기에 같은 사실(명부 행 서구 주소)을 넣으면 같은 결론", async () => {
    const calcAt = (newAcq: string) => {
      const f = transferForm("2021-08-01", "2015-01-01", { householdHousingCount: "2" }, {}, GANGNAM);
      f.houses = [
        {
          // 명부 1행 — UI가 만드는 모양(`transfer.route.temp-two-house-a2b`의 `house()`와 같다)
          id: "h-new",
          region: "capital",
          acquisitionDate: newAcq,
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
          regionCode: SEO_GU,
        } as unknown as TransferFormData["houses"][number],
      ];
      return f;
    };
    expect((await transfer(calcAt("2020-06-18"))).isExempt).toBe(true);
    expect((await transfer(calcAt("2020-06-19"))).isExempt).toBe(false);
  });
});
