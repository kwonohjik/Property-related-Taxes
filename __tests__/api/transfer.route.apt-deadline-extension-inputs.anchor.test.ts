/**
 * anchor — 소령 §167의3⑪ 기한 연장 사유 입력(2호) · 「연장 사유 없음」 확정(2호·3호) — 폼 → ④ → ⑫ → ⑭ → 엔진.
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「⑪ 제1항제2호가목2)ㆍ나목2)ㆍ라목8)ㆍ마목4) 및 같은 항 제3호
 * 후단에 따른 기한은 2027년 12월 31일로 한다. 다만, 해당 주택이 다음 각 호의 어느 하나에 해당하는 주택인
 * 경우에는 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 *   1. 임대의무기간이 2027년 1월 1일 이후 종료되는 주택: 같은 법 제6조제5항에 따라 임대주택 등록이 말소되는 날부터 1년이 되는 날
 *   2. 2027년 1월 1일 이후 조정대상지역으로 신규 지정된 지역 …: 조정대상지역의 공고일부터 1년이 되는 날
 *   3. … 인가 또는 지정이 있는 경우 해당 사업의 대상이 되는 주택: 해당 목에서 정하는 이전고시일부터 1년이 되는 날
 *
 * ## 결함 (수정 전)
 *
 * - 2호(#1910): 엔진 `NormalizedRentalUnit.aptDeadlineExtension`에 값을 싣는 어댑터가 0곳 — 폼 칸·⑫ 키·⑭ 매핑이
 *   없어 2028.1.1. 이후 양도는 날짜를 알아도 **늘 판정 보류**였다(다주택 중과 · §155⑳ 모두).
 * - 2호·3호: 「연장 사유 없음」을 확정할 입력이 없어 `hasAnyAptDeadlineExtensionFact`가 「모름」으로만 읽었다.
 *
 * 실측 전후 수치는 각 it의 주석. leaf anchor(`check.test.ts`)는 정규화 입력을 직접 만들어 이 배관을
 * 증명하지 못한다([[feedback_leaf_anchor_skips_zod_layer]]) ⇒ 이 파일은 **폼부터** 보낸다.
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
import type { AptDeadlineExtensionForm, HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Obj = Record<string, unknown>;
type Form = TransferFormData;
type UnitForm = Form["assets"][number]["rentalHousingException"]["rentalUnits"][number];

const GANGNAM = "1168010100";
const PENDING = "판정하지 못해";

// ── 다주택 중과 축 (§167의3①2호 · §167의10①10호) ──────────────────────────────

/** 가목 요건을 갖춘 장기임대 아파트(명부 행) — 2018.1.1. 등록(가·다목 등록상한 2018.4.2 이내) */
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
  /** §155⑳ 「적용 불가」 단계 사유 문구 — 미적용이면 엔진이 steps에 남긴다 */
  rentalRejectText: string;
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
    rentalRejectText: ((r.steps as { label: string; formula?: string }[] | undefined) ?? [])
      .filter((s) => s.label.includes("적용 불가"))
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
const houseOf = (body: Obj, id: string) => (body.houses as Obj[]).find((h) => h.id === id) as Obj;

afterEach(() => vi.unstubAllGlobals());

const NONE: AptDeadlineExtensionForm = { status: "none" };
const HAS = (d: Partial<AptDeadlineExtensionForm>): AptDeadlineExtensionForm => ({ status: "has", ...d });

describe("다주택 중과 — 명부 행 2호 가목 아파트 (§167의10①10호)", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-03-01"))));

  it("EX-a 모름(기본) · 2028-03-01 → 종전 기준(중과 배제) + 확인 필요 고지", async () => {
    const r = await single(mhForm([rentalRow()], "2028-03-01"));
    expect(r.surcharge).toBe(false);
    expect(r.mhWarnings.some((w) => w.includes(PENDING))).toBe(true);
    expect(r.totalTax).toBe(412_071_000);
  });

  it("EX-b 「연장 사유 없음」 확인 · 2028-03-01 → 기한(2027.12.31.) 경과로 2호 불인정 → 중과, 고지 없음", async () => {
    // 수정 전: 확정 입력이 없어 EX-a와 같은 412,071,000(판정 보류 · 중과 배제 유지)
    const r = await single(mhForm([rentalRow(NONE)], "2028-03-01"));
    expect(r.surcharge).toBe(true);
    expect(r.mhWarnings.some((w) => w.includes(PENDING))).toBe(false);
    expect(r.totalTax).toBe(926_678_500);
    expect(await multi(mhForm([rentalRow(NONE)], "2028-03-01"))).toBe(926_678_500);
  });

  it("EX-c 등록말소일 2027-06-01 → 기한 2028-06-01 · 2028-03-01 양도 → 배제 유지, 고지 없음", async () => {
    // 수정 전: 날짜 칸·⑫ 키가 없어 EX-a와 같은 판정 보류(고지 남음)
    const r = await single(mhForm([rentalRow(HAS({ dutyPeriodEndCancellationDate: "2027-06-01" }))], "2028-03-01"));
    expect(r.surcharge).toBe(false);
    expect(r.mhWarnings.some((w) => w.includes(PENDING))).toBe(false);
    expect(r.totalTax).toBe(412_071_000);
  });

  it("EX-d 경계 — 기한 당일(2028-06-01) 배제 · 익일(2028-06-02) 중과", async () => {
    const ext = HAS({ dutyPeriodEndCancellationDate: "2027-06-01" });
    vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-06-01")));
    expect((await single(mhForm([rentalRow(ext)], "2028-06-01"))).surcharge).toBe(false);
    expect((await single(mhForm([rentalRow(ext)], "2028-06-02"))).surcharge).toBe(true);
  });

  it("EX-d2 민법 §161 — 1년이 되는 날이 토요일(2028-06-03)이면 월요일(2028-06-05)까지", async () => {
    const ext = HAS({ dutyPeriodEndCancellationDate: "2027-06-03" });
    vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-06-05")));
    expect((await single(mhForm([rentalRow(ext)], "2028-06-05"))).surcharge).toBe(false);
    expect((await single(mhForm([rentalRow(ext)], "2028-06-06"))).surcharge).toBe(true);
  });

  it("EX-e 양도 주택 자신이 2호 가목 아파트 — 「없음」이면 자기 배제(§167의3①2호) 불가", async () => {
    const other: HouseEntry = { ...rentalRow(), id: "g1", isLongTermRental: false, rentalType: undefined };
    const selling = (ext?: AptDeadlineExtensionForm) =>
      mhForm([other], "2028-03-01", {
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
            rentalAptDeadlineExtension: ext,
          },
        },
      });
    const unknown = await single(selling());
    const none = await single(selling(NONE));
    expect(unknown.surcharge).toBe(false);
    expect(unknown.mhWarnings.some((w) => w.includes(PENDING))).toBe(true);
    expect(none.surcharge).toBe(true);
    expect(none.totalTax).toBeGreaterThan(unknown.totalTax);
  });

  it("EX-f 건설임대(다목)·비아파트는 연장 사실을 싣지 않고 결과도 그대로", async () => {
    const da = rentalRow(NONE, {
      rentalType: "C",
      rentalLandArea: "200",
      rentalTotalFloorArea: "100",
      hasMinimum2Units: true,
    });
    const nonApt = rentalRow(NONE, { isApartment: false });
    for (const row of [da, nonApt]) {
      const body = await bodyOf(() => callTransferTaxAPI(mhForm([row], "2028-03-01")));
      expect(houseOf(body, "r1").rentalAptDeadlineExtension).toBeUndefined();
      const r = await singleBody(body);
      expect(r.mhWarnings.some((w) => w.includes(PENDING))).toBe(false);
    }
  });

  it("EX-z ⑫ — 「없음」과 날짜를 함께 보내면 400 (상호 배타)", async () => {
    const body = await bodyOf(() => callTransferTaxAPI(mhForm([rentalRow(NONE)], "2028-03-01")));
    (houseOf(body, "r1").rentalAptDeadlineExtension as Obj).relocationAnnouncementDate = "2027-06-01";
    const res = await post(SINGLE, "http://l/api/calc/transfer", body);
    expect(res.status).toBe(400);
  });
});

describe("다주택 중과 — 3호 후단 「연장 사유 없음」", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date("2028-03-01"))));

  const other: HouseEntry = { ...rentalRow(), id: "g1", isLongTermRental: false, rentalType: undefined };
  const tir = (ext?: AptDeadlineExtensionForm) =>
    mhForm([other], "2028-03-01", {
      sellingHouseExclusion: {
        taxIncentiveRental: {
          isTaxIncentiveRental: true,
          rentalPeriodYears: "6",
          isNationalSizeHousing: true,
          isApartment: true,
          isTaxIncentiveRentalPurchase: true,
          taxIncentiveRentalRegistrationType: "long_term_general",
          isUrbanLifeHousingApartment: false,
          taxIncentiveRentalAptDeadlineExtension: ext,
        },
      },
    });

  it("EX-g 모름 → 종전(3호 배제 유지) + 고지 / 없음 → 3호 불인정 → 중과", async () => {
    const unknown = await single(tir());
    const none = await single(tir(NONE));
    expect(unknown.surcharge).toBe(false);
    expect(unknown.mhWarnings.some((w) => w.includes(PENDING))).toBe(true);
    // 수정 전: 「없음」 확정 경로가 없어 unknown과 같은 값(판정 보류)
    expect(none.surcharge).toBe(true);
    expect(none.mhWarnings.some((w) => w.includes(PENDING))).toBe(false);
  });

  it("EX-h 기존 3호 날짜 입력(구 저장분 — status 없음)도 「있음」으로 읽는다", async () => {
    const legacy = await single(tir({ dutyPeriodEndCancellationDate: "2027-06-01" }));
    expect(legacy.surcharge).toBe(false);
    expect(legacy.mhWarnings.some((w) => w.includes(PENDING))).toBe(false);
  });
});

// ── §155⑳ 장기임대주택 보유자 거주주택 비과세 특례 ──────────────────────────────

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

describe("§155⑳ — 임대주택(가목 아파트) ⑪ 기한", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

  it("EX-i 모름 → 비과세 유지 + 확인 필요 고지 / 없음 → 부적격(과세) / 기한 내 날짜 → 비과세·고지 없음", async () => {
    const unknown = await single(rheForm({}));
    const none = await single(rheForm({ aptDeadlineExtension: NONE }));
    // 3호 연장은 인가·지정일이 기한 전으로 확인돼야 성립한다(#1935 — 모르면 불성립)
    const within = await single(
      rheForm({ aptDeadlineExtension: HAS({ relocationAuthorizationDate: "2026-06-01", relocationAnnouncementDate: "2027-06-01" }) }),
    );
    expect(unknown.totalTax).toBe(0);
    expect(unknown.notices.some((n) => n.includes(PENDING))).toBe(true);
    // 수정 전: 「없음」·날짜가 엔진에 닿지 않아 셋 다 0 + 확인 필요 고지(판정 보류)
    expect(none.rentalRejectText).toContain("양도기한");
    expect(none.totalTax).toBe(118_206_000);
    expect(within.totalTax).toBe(0);
    expect(within.notices.some((n) => n.includes(PENDING))).toBe(false);
    expect(await multi(rheForm({ aptDeadlineExtension: NONE }))).toBe(118_206_000);
  });

  it("EX-j §155㉓(말소 후 5년 내) 경로는 ⑪ 비적용 — 「없음」을 싣지 않고 비과세 유지", async () => {
    const f = rheForm({
      rentalAutoTermination: true,
      terminatedRegistrationType: "long_term_general",
      registrationCancellationDate: "2024-06-01",
      aptDeadlineExtension: NONE,
    });
    const body = await bodyOf(() => callTransferTaxAPI(f));
    const units = ((body.rentalHousingException as Obj).rentalUnits as Obj[]);
    expect(units[0].aptDeadlineExtension).toBeUndefined();
    const r = await singleBody(body);
    expect(r.totalTax).toBe(0);
  });

  it("EX-k 판정 메뉴 route(같은 ⑫·⑭) — 모름: 충족 + 확인 필요 고지 / 없음: 미충족(양도기한 사유)", async () => {
    const f = rheForm({ aptDeadlineExtension: NONE });
    const rheNone = (await bodyOf(() => callTransferTaxAPI(f))).rentalHousingException as Obj;
    const rheUnknown = (await bodyOf(() => callTransferTaxAPI(rheForm({})))).rentalHousingException as Obj;
    const judge = async (rhe: Obj) => {
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
      const json = (await res.json()) as { data: { rentalHousingException: { passed: boolean; notices: string[]; unitFailReasons: { message: string }[] } } };
      expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
      return json.data.rentalHousingException;
    };
    const unknown = await judge(rheUnknown);
    const none = await judge(rheNone);
    expect(unknown.passed).toBe(true);
    expect(unknown.notices.some((n) => n.includes(PENDING))).toBe(true);
    expect(none.passed).toBe(false);
    expect(none.unitFailReasons.some((r) => r.message.includes("양도기한"))).toBe(true);
  });
});
