/**
 * anchor — 소령 §167의3⑪3호 「인가 또는 지정」 시점 조건 · 이전고시 전 · 단서(협의·수용재결·매도청구소송)
 * — 폼 → ④ → ⑫ → ⑭ → 엔진.
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「3. 2027년 12월 31일 이전 또는 제1호나 제2호에 따른 기한 이전에
 * 다음 각 목에 따른 인가 또는 지정이 있는 경우 해당 사업의 대상이 되는 주택: 해당 목에서 정하는 이전고시일부터
 * 1년이 되는 날. 다만, 해당 사업의 대상이 되는 주택이 「도시 및 주거환경정비법」 제73조 또는 「빈집 및 소규모주택
 * 정비에 관한 특례법」 제36조에 따른 협의, 수용재결 또는 매도청구소송에 따라 양도되는 경우에는 이 호에 따른 기한
 * 내에 양도한 것으로 본다.」
 *
 * ## 결함 (수정 전)
 *
 * - 엔진이 이전고시일만 받았다 — 인가·지정이 2027.12.31.(또는 1·2호 기한) **뒤**인 사업도 3호 연장을 줬다(과소과세).
 * - 「인가는 있었으나 양도일 현재 이전고시 전」을 입력할 수 없었다 — 「있음」+빈 날짜는 ⑧이 막고, 「모름」은 판정 보류.
 * - 단서(협의·수용재결·매도청구소송 → 기한 내 간주)가 없었다 — 이전고시일+1년 경과면 늘 기한 초과(과다과세).
 *
 * 판정 보류(사용자 결정 2026-10-04 「모르면 확인 필요」): 인가·지정일 모름 → 종전 결과(3호 후보 인정) + 고지 ·
 * 수용 여부 모름 + 기한 경과 → 종전 결과(기한 초과) + 고지. 고지는 결론을 가를 때만 낸다.
 *
 * ## 실측 (강남 · 양도가액 15억 · 취득 1995-03-01 1억 · 명부 행 가목 아파트 1채 · route 경유)
 *
 * | 시나리오 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | C3-b 인가 2028-03-01 · 이전고시 2033-05-01 · 양도 2030-01-01 | 412,071,000(배제) | **926,678,500(중과)** |
 * | C3-e 인가 2027-06-01 · 이전고시 2033-05-01 · 수용 예 · 양도 2035-01-01 | 926,678,500(중과) | **412,071,000(배제)** |
 * | C3-d 인가 2026-01-01 · 이전고시 전 · 양도 2029-06-01 | 412,071,000 + 사실 전무 보류 고지 | 412,071,000 · 고지 없음 |
 * | C3-c 인가 모름 · 이전고시 2033-05-01 · 양도 2030-01-01 | 412,071,000 · 고지 없음 | 412,071,000 + 인가·지정 확인 필요 고지 |
 * | C3-g 수용 모름 · 양도 2035-01-01 | 926,678,500 · 고지 없음 | 926,678,500 + 단서 확인 필요 고지 |
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
/** 종전 「사실 전무」 판정 보류 고지(#1910) */
const PENDING = "판정하지 못해";
/** 신규 — 인가·지정 시점 모름 고지 */
const AUTH_NOTICE = "인가 또는 지정";
/** 신규 — 단서(협의·수용재결·매도청구소송) 모름 고지 */
const EXPROP_NOTICE = "매도청구소송";

const rentalRow = (ext?: AptDeadlineExtensionForm): HouseEntry => ({
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

type Verdict = { totalTax: number; surcharge?: boolean; mhWarnings: string[]; notices: string[]; rentalRejectText: string };
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
const single = async (f: Form) => {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date(f.transferDate)));
  return singleBody(await bodyOf(() => callTransferTaxAPI(f)));
};
async function multi(f: Form): Promise<number> {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date(f.transferDate)));
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
const has = (s: string[], needle: string) => s.some((w) => w.includes(needle));

afterEach(() => vi.unstubAllGlobals());

const HAS = (d: Partial<AptDeadlineExtensionForm>): AptDeadlineExtensionForm => ({ status: "has", ...d });

// ── 2호 명부 행(가목 아파트) — 다주택 중과 축 ─────────────────────────────────────

describe("⑪3호 인가·지정 시점 조건 (2호 명부 행)", () => {
  it("C3-a 인가 2027-06-01 · 이전고시 2033-05-01 · 양도 2034-03-01 → 3호 연장(기한 2034-05-01) — 배제 유지, 고지 없음", async () => {
    const r = await single(
      mhForm([rentalRow(HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01" }))], "2034-03-01"),
    );
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, PENDING) || has(r.mhWarnings, AUTH_NOTICE)).toBe(false);
  });

  it("C3-b 인가 2028-03-01(바닥 뒤 · 1·2호 없음) · 이전고시 2033-05-01 · 양도 2030-01-01 → 3호 불성립 → 기한 2027.12.31. 경과 → 중과", async () => {
    // 수정 전: 인가일을 받지 않아(⑫가 벗겨냄) 이전고시일+1년(2034-05-01)을 기한으로 인정 → 배제
    const ext = HAS({ relocationAuthorizationDate: "2028-03-01", relocationAnnouncementDate: "2033-05-01" });
    const r = await single(mhForm([rentalRow(ext)], "2030-01-01"));
    expect(r.surcharge).toBe(true);
    expect(has(r.mhWarnings, AUTH_NOTICE)).toBe(false);
    const twin = await single(mhForm([rentalRow(HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01" }))], "2030-01-01"));
    expect(twin.surcharge).toBe(false);
    expect(r.totalTax).toBe(926_678_500);
    expect(twin.totalTax).toBe(412_071_000);
    expect(await multi(mhForm([rentalRow(ext)], "2030-01-01"))).toBe(r.totalTax);
  });

  it("C3-c 인가 모름 · 이전고시 2033-05-01 · 양도 2030-01-01 → 종전 결과(배제) + 인가·지정 시점 확인 필요 고지", async () => {
    const r = await single(mhForm([rentalRow(HAS({ relocationAnnouncementDate: "2033-05-01" }))], "2030-01-01"));
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, AUTH_NOTICE)).toBe(true);
    expect(has(r.mhWarnings, PENDING)).toBe(false);
  });

  it("C3-c2 인가 모름이어도 3호가 결론을 가르지 않으면(1호 기한 안) 고지 없음", async () => {
    const r = await single(
      mhForm([rentalRow(HAS({ dutyPeriodEndCancellationDate: "2029-06-01", relocationAnnouncementDate: "2033-05-01" }))], "2030-01-01"),
    );
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, AUTH_NOTICE)).toBe(false);
  });

  it("C3-d 인가 2026-01-01 · 양도일 현재 이전고시 전 · 양도 2029-06-01 → 기한 안(배제), 고지 없음", async () => {
    // 수정 전: 「이전고시 전」을 실을 칸이 없어 ext 미전송 → 사실 전무 판정 보류(배제 + 고지)
    const f = mhForm([rentalRow(HAS({ relocationAuthorizationDate: "2026-01-01", relocationNotYetAnnounced: true }))], "2029-06-01");
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect(houseOf(body, "r1").rentalAptDeadlineExtension).toEqual({
      relocationAuthorizationDate: "2026-01-01",
      relocationNotYetAnnounced: true,
    });
    const r = await single(f);
    expect(r.surcharge).toBe(false);
    expect(has(r.mhWarnings, "§167조의3⑪")).toBe(false); // 사실 전무·인가·이전고시일 어느 보류 고지도 없다
  });

  it("C3-h 경계 — 인가가 2027.12.31. 당일이면 3호 성립(「이전」은 그날 포함) · 2028-01-01이면 불성립", async () => {
    const at = (auth: string) => HAS({ relocationAuthorizationDate: auth, relocationAnnouncementDate: "2033-05-01" });
    expect((await single(mhForm([rentalRow(at("2027-12-31"))], "2030-01-01"))).surcharge).toBe(false);
    expect((await single(mhForm([rentalRow(at("2028-01-01"))], "2030-01-01"))).surcharge).toBe(true);
  });

  it("C3-h2 1호 기한 이전 인가 — 말소일 2028-06-01(1호 기한 2029-06-01) · 인가 2029-06-01 성립 / 2029-06-02 불성립", async () => {
    const at = (auth: string) =>
      HAS({ dutyPeriodEndCancellationDate: "2028-06-01", relocationAuthorizationDate: auth, relocationAnnouncementDate: "2033-05-01" });
    expect((await single(mhForm([rentalRow(at("2029-06-01"))], "2030-01-01"))).surcharge).toBe(false);
    expect((await single(mhForm([rentalRow(at("2029-06-02"))], "2030-01-01"))).surcharge).toBe(true);
  });

  it("C3-h3 2호 기한 이전 인가 — 공고일 2028-02-01(2호 기한 2029-02-01) · 인가 2029-02-01 성립 / 2029-02-02 불성립", async () => {
    const at = (auth: string) =>
      HAS({ newRegulatedAreaAnnouncementDate: "2028-02-01", relocationAuthorizationDate: auth, relocationAnnouncementDate: "2033-05-01" });
    expect((await single(mhForm([rentalRow(at("2029-02-01"))], "2030-01-01"))).surcharge).toBe(false);
    expect((await single(mhForm([rentalRow(at("2029-02-02"))], "2030-01-01"))).surcharge).toBe(true);
  });
});

describe("⑪3호 단서 — 협의·수용재결·매도청구소송 (2호 명부 행)", () => {
  const ext = (e?: boolean) =>
    HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01", relocationExpropriationTransfer: e });

  it("C3-e 예 · 양도 2035-01-01(이전고시일+1년 2034-05-01 경과) → 기한 내 간주 — 배제 유지", async () => {
    // 수정 전: 단서가 없어 기한 초과 → 중과
    const r = await single(mhForm([rentalRow(ext(true))], "2035-01-01"));
    expect(r.surcharge).toBe(false);
    expect(r.totalTax).toBe(412_071_000);
    expect(has(r.mhWarnings, EXPROP_NOTICE)).toBe(false);
  });

  it("C3-f 아니오 · 같은 날 → 기한 경과 → 중과, 고지 없음", async () => {
    const r = await single(mhForm([rentalRow(ext(false))], "2035-01-01"));
    expect(r.surcharge).toBe(true);
    expect(has(r.mhWarnings, EXPROP_NOTICE)).toBe(false);
  });

  it("C3-g 모름 · 같은 날 → 종전 결과(기한 경과 · 중과) + 확인 필요 고지 / 기한 안이면 고지 없음", async () => {
    const r = await single(mhForm([rentalRow(ext(undefined))], "2035-01-01"));
    expect(r.surcharge).toBe(true);
    expect(has(r.mhWarnings, EXPROP_NOTICE)).toBe(true);
    const inside = await single(mhForm([rentalRow(ext(undefined))], "2034-03-01"));
    expect(inside.surcharge).toBe(false);
    expect(has(inside.mhWarnings, EXPROP_NOTICE)).toBe(false);
  });

  it("C3-e2 수용 「예」여도 인가가 기한 뒤면 3호 주택이 아니다 → 단서 미적용(중과)", async () => {
    const r = await single(
      mhForm([rentalRow(HAS({ relocationAuthorizationDate: "2028-03-01", relocationAnnouncementDate: "2033-05-01", relocationExpropriationTransfer: true }))], "2035-01-01"),
    );
    expect(r.surcharge).toBe(true);
  });

  it("C3-z ⑫ — 3호 사실 없이 수용 여부만 · 이전고시일과 「이전고시 전」 동시 · 「없음」+인가일 → 400", async () => {
    const base = await bodyOf(() => callTransferTaxAPI(mhForm([rentalRow(HAS({ dutyPeriodEndCancellationDate: "2028-06-01" }))], "2030-01-01")));
    const send = async (patch: Obj) => {
      const b = structuredClone(base);
      houseOf(b, "r1").rentalAptDeadlineExtension = patch;
      return (await post(SINGLE, "http://l/api/calc/transfer", b)).status;
    };
    expect(await send({ dutyPeriodEndCancellationDate: "2028-06-01", relocationExpropriationTransfer: true })).toBe(400);
    expect(await send({ relocationAnnouncementDate: "2033-05-01", relocationNotYetAnnounced: true })).toBe(400);
    expect(await send({ confirmedNone: true, relocationAuthorizationDate: "2027-06-01" })).toBe(400);
    expect(await send({ relocationAuthorizationDate: "2027-06-01", relocationExpropriationTransfer: true })).toBe(200);
  });
});

// ── 3호 감면대상장기임대주택 ─────────────────────────────────────────────────────

describe("⑪3호 조건 — 감면대상장기임대주택(3호 후단) 경로", () => {
  const other: HouseEntry = { ...rentalRow(), id: "g1", isLongTermRental: false, rentalType: undefined };
  const tir = (ext: AptDeadlineExtensionForm, transferDate: string) =>
    mhForm([other], transferDate, {
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

  it("C3-i1 인가 기한 뒤 → 3호 불인정(중과) / 기한 앞 → 배제 / 인가 모름 → 배제 + 고지 / 수용 예 → 배제", async () => {
    const late = await single(tir(HAS({ relocationAuthorizationDate: "2028-03-01", relocationAnnouncementDate: "2033-05-01" }), "2030-01-01"));
    const early = await single(tir(HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01" }), "2030-01-01"));
    const unknown = await single(tir(HAS({ relocationAnnouncementDate: "2033-05-01" }), "2030-01-01"));
    const exprop = await single(
      tir(HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01", relocationExpropriationTransfer: true }), "2035-01-01"),
    );
    expect(late.surcharge).toBe(true);
    expect(early.surcharge).toBe(false);
    expect(unknown.surcharge).toBe(false);
    expect(has(unknown.mhWarnings, AUTH_NOTICE)).toBe(true);
    expect(exprop.surcharge).toBe(false);
  });
});

// ── §155⑳ 임대주택 카드 ──────────────────────────────────────────────────────────

function rheForm(unit: Partial<UnitForm>, transferDate: string): Form {
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

describe("⑪3호 조건 — §155⑳ 임대주택(가목 아파트)", () => {
  beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
  const rhe = async (f: Form) => singleBody(await bodyOf(() => callTransferTaxAPI(f)));

  it("C3-i2 인가 기한 뒤 → 부적격(양도기한) / 인가 모름 → 비과세 + 고지 / 수용 예(기한 경과) → 비과세", async () => {
    const late = await rhe(rheForm({ aptDeadlineExtension: HAS({ relocationAuthorizationDate: "2028-03-01", relocationAnnouncementDate: "2033-05-01" }) }, "2030-01-01"));
    const unknown = await rhe(rheForm({ aptDeadlineExtension: HAS({ relocationAnnouncementDate: "2033-05-01" }) }, "2030-01-01"));
    const exprop = await rhe(
      rheForm(
        { aptDeadlineExtension: HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01", relocationExpropriationTransfer: true }) },
        "2035-01-01",
      ),
    );
    expect(late.rentalRejectText).toContain("양도기한");
    expect(late.totalTax).toBeGreaterThan(0);
    expect(unknown.totalTax).toBe(0);
    expect(has(unknown.notices, AUTH_NOTICE)).toBe(true);
    expect(exprop.totalTax).toBe(0);
  });

  it("C3-i3 판정 메뉴 route(같은 ⑫·⑭) — 수용 모름 · 기한 경과 → 미충족 + 확인 필요 고지", async () => {
    const f = rheForm(
      { aptDeadlineExtension: HAS({ relocationAuthorizationDate: "2027-06-01", relocationAnnouncementDate: "2033-05-01" }) },
      "2035-01-01",
    );
    const rheBody = (await bodyOf(() => callTransferTaxAPI(f))).rentalHousingException as Obj;
    const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", {
      propertyType: "housing",
      transferDate: "2035-01-01",
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
      rentalHousingException: rheBody,
    });
    const json = (await res.json()) as { data: { rentalHousingException: { passed: boolean; notices: string[] } } };
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(false);
    expect(has(json.data.rentalHousingException.notices, EXPROP_NOTICE)).toBe(true);
  });
});
