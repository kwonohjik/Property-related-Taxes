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
 * | C — §155⑳ 거주주택 특례(I-4 §155㉓ 말소일 포함) | 특례 칸 없음 → 거주주택 부담부증여가 2주택 과세 | 계산기 카드·leaf 재사용 → `rentalHousingException` | `assets[0].rentalHousingException` |
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

  it("A-3 부정 짝 — 증여일에 조정이 아닌 주소(인천 서구 2020-06-18 = 지정 전날)면 안 만진 토글은 「아님」", async () => {
    // ⚠️ 종전 시료(강남 2017-08-02)는 E-14n 뒤 구별력이 없다 — 이 시료(2010 취득 · 2주택)에서 2018.4.1. 전에는 조정 여부가 세액에 닿지 않는다
    //    (§104⑦ 가산세율은 2018.4.1.부터 · §95② 괄호의 §104⑦ 자산 배제도 법률 제15225호 부칙 제1조1호로 2018.4.1.부터).
    //    종전 on ≠ off는 2018.4.1. 전에도 장특을 빼던 결함이 만든 차이였다. 지정일 전날이 세액에 닿는 시기로 옮긴다.
    const SEO_GU_PNU = "2826010100100120034";
    const { checkRegulatedAreaByCode } = await import("@/lib/regulated-area");
    expect(checkRegulatedAreaByCode("2826010100", "2020-06-18").isRegulated).toBe(false);
    const r = await gift("2020-06-18", TWO, SEO_GU_PNU);
    const on = await gift("2020-06-18", { ...TWO, isRegulatedArea: true }, SEO_GU_PNU);
    const off = await gift("2020-06-18", { ...TWO, isRegulatedArea: false }, SEO_GU_PNU);
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

  // L-7(2026-09-30): 지정·공고 당일(2020-06-19) 취득은 「공고가 있은 날 이전」이라 부정 짝을 06-20으로 옮겼다.
  it("B-2 부정 짝 — 2020-06-20 취득(공고 다음 날)이면 조정→조정 1년 기한 → 과세 9,544,800, 판정 보류 고지 없음", async () => {
    const r = await gift("2021-08-01", at("2020-06-20", SEO_GU), GANGNAM_PNU);
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
    expect((await transfer(calcAt("2020-06-20"))).isExempt).toBe(false);
  });

  it("B-4 L-7 — 신규 주택 서구 2020-06-19(공고일) 취득 → 「공고가 있은 날 이전」 → 3년 → 비과세(계산기 R-4와 같은 결론)", async () => {
    const r = await gift("2021-08-01", at("2020-06-19", SEO_GU), GANGNAM_PNU);
    expect(r.isExempt).toBe(true);
    // 계산기 쪽 같은 사실(명부 행 서구 2020-06-19)은 `transfer.route.temp-two-house-a2b` R-4가 비과세로 고정한다.
  });

  it("B-5 L-7 — 계약일(2020-06-19 공고일) 입력도 증여 경로에 도달한다: 취득 2020-07-15 비과세 / 계약 06-20 과세", async () => {
    const withContract = (c: string) => {
      const x = at("2020-07-15", SEO_GU);
      return { ...x, temporaryTwoHouse: { ...x.temporaryTwoHouse, newHouseContractDate: c } };
    };
    expect((await gift("2021-08-01", withContract("2020-06-19"), GANGNAM_PNU)).isExempt).toBe(true);
    expect((await gift("2021-08-01", withContract("2020-06-20"), GANGNAM_PNU)).isExempt).toBe(false);
  });
});

// ═══ C — §155⑳ 장기임대주택 보유자 거주주택 특례 (I-4 §155㉓ 말소일 포함) ═══════════════════════

/**
 * 계산기와 같은 카드(`RentalHousingExceptionSection`)·같은 ④ leaf(`toRentalHousingExceptionApi`)를 쓴다.
 * 시료는 계산기 I-4 anchor(`rental-155-23-cancellation-date-i4.route`)와 같다: 가목(2018-06-01 등록) 자진말소
 * (단기 4년) · 30개월 임대 · 거주주택 2016-01-10 취득 · 거주 60개월. 말소 2021-03-03 → 기한 2026-03-03.
 * 근거(부담부증여에 §155⑳ 적용): 사전-2020-법령해석재산-0097 — 「장기임대주택과 1거주주택을 … 소유하고 있는
 * 1세대가 거주주택을 양도(부담부증여)하는 경우 국내에 1개의 주택을 소유하고 있는 것으로 보아 1세대1주택 비과세
 * 규정을 적용하는 것」.
 */
describe("C ⑭ route — §155⑳ 거주주택 특례 · ㉓ 말소일이 엔진에 닿는다 (계산기와 같은 결론)", () => {
  const unit = async (date: string) => {
    const { makeDefaultRentalUnit } = await import("@/lib/stores/calc-wizard-asset-factory");
    return {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2018-06-01",
      rentalRegistrationDate: "2018-06-01",
      standardPriceAtRentalStart: "300,000,000",
      rentalInputMode: "direct" as const,
      rentalMonths: "30",
      requirementsConfirmed: true,
      rentalAutoTermination: true,
      terminatedRegistrationType: "short_term" as const,
      registrationCancellationDate: date,
    };
  };
  const rhe = async () => ({
    applyException: true,
    scenario: "A" as const,
    rentalUnits: [await unit("2021-03-03")],
    postRegistrationResidenceMonths: "",
    priorRentalExemptionHistory: "" as const,
    residenceTransitionUnderAddendum: false,
  });
  const RESIDENCE = { acquisitionDate: new Date("2016-01-10"), residencePeriodMonths: 60, householdHousingCount: 2 };

  it("C-0 종전(base) — 특례 입력 없음: 2주택 과세 7,957,200", async () => {
    const r = await gift("2025-06-01", RESIDENCE);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(7_957_200);
  });

  it("C-1 ★ 말소 후 5년 안(증여 2025-06-01) → §155⑳ 비과세 · ㉓ 기한 2026-03-03, 계산기와 같은 결론", async () => {
    const r = await gift("2025-06-01", { ...RESIDENCE, rentalHousingException: await rhe() } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("§155⑳");
    expect((r as unknown as { rentalHousingExceptionDetail: { eligibility: { cancellationWindow: Obj } } })
      .rentalHousingExceptionDetail.eligibility.cancellationWindow).toMatchObject({ deadline: "2026-03-03", withinDeadline: true });
    const f = transferForm("2025-06-01", "2016-01-10", { householdHousingCount: "2" }, { residencePeriodMonthsAsset: "60" });
    f.assets[0].rentalHousingException = { ...f.assets[0].rentalHousingException, ...(await rhe()) };
    expect((await transfer(f)).isExempt).toBe(true);
  });

  it("C-2 부정 짝 — 말소 후 5년 밖(증여 2026-06-01) → 특례 불성립 · 과세 7,608,000(입력 없음과 같은 값), 계산기도 과세", async () => {
    const r = await gift("2026-06-01", { ...RESIDENCE, rentalHousingException: await rhe() } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(7_608_000);
    expect((await gift("2026-06-01", RESIDENCE)).determinedTax).toBe(7_608_000);
    const f = transferForm("2026-06-01", "2016-01-10", { householdHousingCount: "2" }, { residencePeriodMonthsAsset: "60" });
    f.assets[0].rentalHousingException = { ...f.assets[0].rentalHousingException, ...(await rhe()) };
    expect((await transfer(f)).isExempt).toBe(false);
  });

  it("C-3 ④ 게이트 — 1세대 1주택 OFF면 남은 특례 선언을 싣지 않는다(⑤·⑧과 같은 게이트)", async () => {
    const body = buildGiftBurdenedTransferBody(
      giftItem({ ...RESIDENCE, isOneHousehold: false, rentalHousingException: await rhe() } as Partial<BurdenedGiftTransferTaxInput>),
      giftForm("2025-06-01"),
    );
    expect(body).not.toHaveProperty("rentalHousingException");
  });
});
