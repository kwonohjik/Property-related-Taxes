/**
 * anchor — 소령 §167의3⑪ 「연장 사실 전무」(모름) · 3호 후단 대상 여부 모름 → **납세자 불리 적용** — 폼 → ④ → ⑫ → ⑭ → 엔진.
 *
 * 사용자 결정(2026-10-04): 「모름은 납세자에게 불리하게 적용하는 것으로 해. 모르는 상태에서 유리하게 적용하는 것이
 * 가산세 부담이 있어」 — #1935(⑪3호 인가·지정일·단서 모름)의 원칙을 #1910(2호 가·나·라·마목)·#1912(3호 후단)·
 * §155⑳의 「연장 사실 전무」 판정 보류에도 적용한다.
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독):
 * - ⑪ 「제1항제2호가목2)ㆍ나목2)ㆍ라목8)ㆍ마목4) 및 같은 항 제3호 후단에 따른 기한은 2027년 12월 31일로 한다.
 *   다만, 해당 주택이 다음 각 호의 어느 하나에 해당하는 주택인 경우에는 … 가장 늦은 날을 그 기한으로 한다.」
 *   ⇒ 연장은 각 호 사실이 있어야 성립한다. 사실을 모르면 기한 = 2027.12.31.
 * - ①3호 후단 「이 경우 감면대상장기임대주택이 … 아파트 … 민간매입임대주택인 경우에는 제11항에 따른 기한까지
 *   양도하는 주택으로 **한정한다**」 ⇒ 후단은 3호(중과 제외 주택)를 **좁히기만** 한다. 대상 여부를 모를 때 대상으로
 *   보면 3호가 불성립할 수 있을 뿐 넓어지지 않는다 — 「모름 → 후단 적용」이 불리 방향이다.
 *
 * 규칙: 사실이 「모름」이면 그 사실이 있어야 성립하는 유리한 요건은 불성립으로 계산하고, 결론을 가를 때만
 * 「~이면 결과가 달라진다 — 확인 필요」를 고지한다(양도일이 2027.12.31. 이하면 고지 없음).
 *
 * ## 실측 (route 경유)
 *
 * | 시나리오 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | NF-a 명부 행 2호 가목 아파트 · 연장 모름 · 강남 15억 · 양도 2028-03-01 | 412,071,000 + 「판정하지 못해」 | **926,678,500(중과)** + 확인 필요 |
 * | NF-b 같은 조건 · 양도 2027-12-31 | 412,071,000 · 고지 없음 | 412,071,000 · 고지 없음 |
 * | NF-c §155⑳ 가목 아파트 · 연장 모름 · 8억 · 양도 2028-03-01 | 0 + 「판정하지 못해」 | **118,206,000** + 「확인 필요」 단계 |
 * | NF-d 3호 후단 대상 여부 모름(매입 여부 모름) · 양도 2028-03-01 | 412,071,000(③ 배제) + 고지 | **926,678,500(중과)** + 확인 필요 |
 * | NF-d2 3호 후단 대상 확인 · 연장 모름 · 양도 2028-03-01 | 412,071,000 + 고지 | **926,678,500(중과)** + 확인 필요 |
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type {
  AptDeadlineExtensionForm,
  HouseEntry,
  TaxIncentiveRentalFacts,
} from "@/lib/stores/calc-wizard-asset-nbl";

type Obj = Record<string, unknown>;
type Form = TransferFormData;
type UnitForm = Form["assets"][number]["rentalHousingException"]["rentalUnits"][number];

const GANGNAM = "1168010100";
/** 종전(#1910) 판정 보류 고지 — 수정 후에는 어디에도 없어야 한다 */
const OLD_PENDING = "판정하지 못해";
/** 신규 — 연장 사실 전무 → 기한 2027.12.31. 경과로 계산 고지(2호·3호 후단·§155⑳ 공용 문구) */
const NO_FACT = "연장 사유를 확인하지 못해";
/** 신규 — 3호 후단 대상 여부 모름 → 대상으로 보고 기한 적용 고지 */
const GATE_UNKNOWN = "3호 후단 대상";

const rentalRow = (ext?: AptDeadlineExtensionForm, over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "r1",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2017-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  isRegisteredRental: true,
  rentalRegistrationDate: "2018-01-01",
  businessRegistrationDate: "2018-01-01",
  rentalPeriodYears: "9",
  rentalType: "A",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  rentalAptDeadlineExtension: ext,
  ...over,
});

function mhForm(houses: HouseEntry[], transferDate: string, over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "1995-03-01",
    fixedAcquisitionPrice: "100,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate,
    contractTotalPrice: "1,500,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

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
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

type Verdict = {
  totalTax: number;
  surcharge?: boolean;
  mhWarnings: string[];
  notices: string[];
  /** §155⑳ 미적용 경로의 「확인 필요」 단계 문구(#1935) */
  confirmStepText: string;
};
async function singleBody(body: Obj): Promise<Verdict> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; warnings?: string[] } | undefined;
  return {
    totalTax: r.totalTax as number,
    surcharge: mh?.surchargeApplicable,
    mhWarnings: mh?.warnings ?? [],
    notices: (r.warnings as string[] | undefined) ?? [],
    confirmStepText: ((r.steps as { label: string; formula?: string }[] | undefined) ?? [])
      .filter((s) => s.label.includes("확인 필요"))
      .map((s) => s.formula ?? "")
      .join(" "),
  };
}
const single = async (f: Form) => singleBody(await bodyOf(() => callTransferTaxAPI(f)));
async function multi(f: Form): Promise<number> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}

afterEach(() => vi.unstubAllGlobals());

const has = (texts: string[], mark: string) => texts.some((t) => t.includes(mark));
const NONE: AptDeadlineExtensionForm = { status: "none" };

// ── 2호 가·나·라·마목 (#1910) ──────────────────────────────────────────────

describe("2호 가목 아파트 명부 행 — 연장 사실 모름", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-03-01"))));

  it("NF-a 양도 2028-03-01 → 기한 2027.12.31. 경과(2호 불인정) → 중과 + 확인 필요 고지", async () => {
    // 수정 전: 412,071,000(중과 배제 유지) + 「판정하지 못해」
    const r = await single(mhForm([rentalRow()], "2028-03-01"));
    expect(r.surcharge).toBe(true);
    expect(r.totalTax).toBe(926_678_500);
    expect(has(r.mhWarnings, NO_FACT)).toBe(true);
    expect(has(r.mhWarnings, OLD_PENDING)).toBe(false);
    expect(await multi(mhForm([rentalRow()], "2028-03-01"))).toBe(926_678_500);
  });

  it("NF-a2 결과는 「연장 사유 없음」 확정과 같다 — 다른 점은 확인 필요 고지뿐", async () => {
    const unknown = await single(mhForm([rentalRow()], "2028-03-01"));
    const none = await single(mhForm([rentalRow(NONE)], "2028-03-01"));
    expect(unknown.totalTax).toBe(none.totalTax);
    expect(has(none.mhWarnings, NO_FACT)).toBe(false);
  });

  it("NF-a3 양도 주택 자신이 2호 가목 아파트 · 모름 → 자기 배제 불가(중과) + 고지", async () => {
    const other: HouseEntry = { ...rentalRow(), id: "g1", isLongTermRental: false, rentalType: undefined };
    const f = mhForm([other], "2028-03-01", {
      sellingHouseExclusion: {
        longTermRental: {
          isLongTermRental: true,
          isApartment: true,
          isRegisteredRental: true,
          rentalRegistrationDate: "2018-01-01",
          businessRegistrationDate: "2018-01-01",
          rentalPeriodYears: "9",
          rentalType: "A",
          rentalStartOfficialPrice: "300000000",
          rentIncreaseUnder5Pct: true,
        },
      },
    });
    const r = await single(f);
    expect(r.surcharge).toBe(true);
    expect(has(r.mhWarnings, NO_FACT)).toBe(true);
  });

  it("NF-b 경계 — 양도 2027-12-31(기한 당일)이면 연장 사실과 무관하게 기한 내 · 고지 없음", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2027-12-31")));
    const r = await single(mhForm([rentalRow()], "2027-12-31"));
    expect(r.surcharge).toBe(false);
    expect(r.totalTax).toBe(412_071_000);
    expect(has(r.mhWarnings, NO_FACT)).toBe(false);
    expect(has(r.mhWarnings, OLD_PENDING)).toBe(false);
  });

  it("NF-e 비아파트 · 다목 건설임대는 ⑪ 대상이 아니다 — 모름이어도 배제 유지 · 고지 없음", async () => {
    const nonApt = rentalRow(undefined, { isApartment: false });
    const da = rentalRow(undefined, {
      rentalType: "C",
      rentalLandArea: "200",
      rentalTotalFloorArea: "100",
      hasMinimum2Units: true,
    });
    for (const row of [nonApt, da]) {
      const r = await single(mhForm([row], "2028-03-01"));
      expect(r.surcharge).toBe(false);
      expect(has(r.mhWarnings, NO_FACT)).toBe(false);
    }
  });
});

// ── 3호 후단 (#1912) ───────────────────────────────────────────────────────

describe("3호 후단 — 감면대상장기임대주택(양도 주택) 대상 여부·연장 사실 모름", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-03-01"))));

  const other: HouseEntry = { ...rentalRow(), id: "g1", isLongTermRental: false, rentalType: undefined };
  const base: TaxIncentiveRentalFacts = {
    isTaxIncentiveRental: true,
    rentalPeriodYears: "6",
    isNationalSizeHousing: true,
    isApartment: true,
  };
  const tir = (facts: Partial<TaxIncentiveRentalFacts>, transferDate = "2028-03-01") =>
    mhForm([other], transferDate, { sellingHouseExclusion: { taxIncentiveRental: { ...base, ...facts } } });
  const TARGET: Partial<TaxIncentiveRentalFacts> = {
    isTaxIncentiveRentalPurchase: true,
    taxIncentiveRentalRegistrationType: "long_term_general",
    isUrbanLifeHousingApartment: false,
  };

  it("NF-d 매입 여부 모름 → 후단 대상으로 보고 기한 적용 → 기한 경과 → 3호 불인정(중과) + 대상 여부·연장 고지", async () => {
    // 수정 전: 412,071,000(③ 배제 유지) + 「판정하지 못해」
    const r = await single(tir({}));
    expect(r.surcharge).toBe(true);
    expect(r.totalTax).toBe(926_678_500);
    expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(true);
    expect(has(r.mhWarnings, NO_FACT)).toBe(true);
    expect(has(r.mhWarnings, OLD_PENDING)).toBe(false);
  });

  it("NF-d1 등록 유형 모름 · 도시형 생활주택 여부 모름도 같은 결론", async () => {
    for (const facts of [
      { isTaxIncentiveRentalPurchase: true },
      { isTaxIncentiveRentalPurchase: true, taxIncentiveRentalRegistrationType: "short_term" as const },
    ]) {
      const r = await single(tir(facts));
      expect(r.surcharge).toBe(true);
      expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(true);
    }
  });

  it("NF-d2 후단 대상 확인 · 연장 모름 → 중과 + 연장 고지(대상 여부 고지는 없음)", async () => {
    const r = await single(tir(TARGET));
    expect(r.surcharge).toBe(true);
    expect(r.totalTax).toBe(926_678_500);
    expect(has(r.mhWarnings, NO_FACT)).toBe(true);
    expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(false);
  });

  it("NF-d3 대상 여부 모름이어도 연장 사실로 기한 안이면 3호 유지 · 고지 없음(결론을 가르지 않음)", async () => {
    const r = await single(
      tir({ taxIncentiveRentalAptDeadlineExtension: { status: "has", dutyPeriodEndCancellationDate: "2027-06-01" } }),
    );
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(false);
    expect(has(r.mhWarnings, NO_FACT)).toBe(false);
  });

  it("NF-d4 후단 대상 아님(건설임대 · 그 밖의 유형 · 도시형 생활주택)은 기한 없이 3호 유지 · 고지 없음", async () => {
    for (const facts of [
      { isTaxIncentiveRentalPurchase: false },
      { isTaxIncentiveRentalPurchase: true, taxIncentiveRentalRegistrationType: "other" as const },
      { ...TARGET, isUrbanLifeHousingApartment: true },
    ]) {
      const r = await single(tir(facts));
      expect(r.surcharge).toBe(false);
      expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(false);
      expect(has(r.mhWarnings, NO_FACT)).toBe(false);
    }
  });

  it("NF-d5 경계 — 양도 2027-12-31이면 대상 여부·연장 모름이어도 3호 유지 · 고지 없음", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2027-12-31")));
    const r = await single(tir({}, "2027-12-31"));
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, GATE_UNKNOWN)).toBe(false);
    expect(has(r.mhWarnings, NO_FACT)).toBe(false);
  });
});

// ── §155⑳ ─────────────────────────────────────────────────────────────────

function rheForm(unit: Partial<UnitForm>, transferDate = "2028-03-01"): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "1";
  const a = f.assets[0];
  Object.assign(a, {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-06-01",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: "400,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
  });
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    priorRentalExemptionHistory: "none",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2016-06-01",
        rentalRegistrationDate: "2016-06-01",
        standardPriceAtRentalStart: "300,000,000",
        rentalInputMode: "direct",
        rentalMonths: "96",
        requirementsConfirmed: true,
        isApartment: true,
        ...unit,
      },
    ],
  };
  f.contractTotalPrice = "800,000,000";
  return f;
}

describe("§155⑳ — 임대주택(가목 아파트) 연장 사실 모름", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

  it("NF-c 양도 2028-03-01 → 부적격(과세 118,206,000) + 미적용 경로 「확인 필요」 단계", async () => {
    // 수정 전: 0(비과세 유지) + 「판정하지 못해」
    const r = await single(rheForm({}));
    expect(r.totalTax).toBe(118_206_000);
    expect(r.confirmStepText).toContain(NO_FACT);
    expect(r.confirmStepText).not.toContain(OLD_PENDING);
    expect(await multi(rheForm({}))).toBe(118_206_000);
  });

  it("NF-c2 경계 — 양도 2027-12-31 → 비과세 · 고지 없음", async () => {
    const r = await single(rheForm({}, "2027-12-31"));
    expect(r.totalTax).toBe(0);
    expect(has(r.notices, NO_FACT)).toBe(false);
    expect(r.confirmStepText).toBe("");
  });

  it("NF-c3 §155㉓(말소 후 5년 내) 경로는 ⑪ 비적용 — 모름이어도 비과세 · 고지 없음", async () => {
    const r = await single(
      rheForm({
        rentalAutoTermination: true,
        terminatedRegistrationType: "long_term_general",
        registrationCancellationDate: "2024-06-01",
      }),
    );
    expect(r.totalTax).toBe(0);
    expect(has(r.notices, NO_FACT)).toBe(false);
    expect(r.confirmStepText).toBe("");
  });

  it("NF-c4 판정 메뉴 route — 모름 → 미충족(양도기한 사유) + 확인 필요 고지", async () => {
    const rhe = (await bodyOf(() => callTransferTaxAPI(rheForm({})))).rentalHousingException as Obj;
    const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", {
      propertyType: "housing",
      transferDate: "2028-03-01",
      acquisitionDate: "2019-06-01",
      transferPrice: 800_000_000,
      acquisitionPrice: 400_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 60,
      annualBasicDeductionUsed: 0,
      reductions: [],
      rentalHousingException: rhe,
    });
    const json = (await res.json()) as {
      data: { rentalHousingException: { passed: boolean; notices: string[]; unitFailReasons: { message: string }[] } };
    };
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    const v = json.data.rentalHousingException;
    expect(v.passed).toBe(false);
    expect(v.unitFailReasons.some((r) => r.message.includes("양도기한"))).toBe(true);
    expect(has(v.notices, NO_FACT)).toBe(true);
  });
});
