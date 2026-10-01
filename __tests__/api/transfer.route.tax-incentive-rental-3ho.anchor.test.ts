/**
 * anchor — 소령 §167의3①3호 「감면대상장기임대주택」 입력 경로 (폼 → ④ → ⑫ → ⑭ → 엔진).
 *
 * ## 결함 — 엔진은 판정하는데 입력 경로가 0곳이었다
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「3. 「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라
 * 양도소득세가 감면되는 임대주택으로서 5년 이상 임대한 국민주택(이하 이 조에서 "감면대상장기임대주택"
 * 이라 한다). 이 경우 … 아파트 … 민간매입임대주택인 경우에는 제11항에 따른 기한까지 양도하는 주택으로
 * 한정한다.」
 *
 * 엔진(`isTaxIncentiveRentalHousingExempt` · #1912 후단)은 이 호를 판정하지만 `HouseInfo.isTaxIncentiveRental`
 * 과 후단 4사실에 값을 쓰는 운영 코드가 없었고, ⑫ `houseSchema`가 키를 벗겨 ⑭ 매퍼도 옮기지 않았다.
 * 엔진 leaf anchor(`tax-incentive-rental-apt-deadline-167-3-3.anchor.test.ts`)는 `HouseInfo`를 직접 만들어
 * 이 배관을 증명하지 못한다([[feedback_leaf_anchor_skips_zod_layer]]) ⇒ 이 파일은 **폼부터** 보낸다.
 *
 * ## 실측 (강남 · 양도 2026-08-01 · 양도가액 15억 · 취득 1995-03-01 · 취득가액 1억 · 다른 주택 강남 일반)
 *
 * | 시나리오 | 수정 전 | 3호 반영 |
 * |---|---|---|
 * | A2 2주택 · 양도 주택이 3호 | 926,678,500 | 412,071,000 |
 * | A3 3주택 · 양도 주택이 3호 | 1,080,403,500 | 412,071,000 |
 * | A3 + §97 본문 50% 감면 | 638,420,250 | 243,496,500 |
 * | B2 2주택 · 다른 주택이 3호(10호) | 926,678,500 | 412,071,000 |
 *
 * 수정 전에는 **과다 과세** 방향이었다(중과 배제 근거가 있는데 입력할 칸이 없었다).
 * §98 자동 경로(`resolveSurchargeExclusionByReduction`)는 그대로 두고 OR로 공존한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
type SellingTir = NonNullable<NonNullable<Form["sellingHouseExclusion"]>["taxIncentiveRental"]>;

const GANGNAM = "1168010100";

const general = (id: string): HouseEntry => ({
  id,
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 양도 주택 3호 선언 — 감면 임대주택 · 6년 임대 · 국민주택 (후단 사실은 모름) */
const SELLING_3HO: SellingTir = {
  isTaxIncentiveRental: true,
  rentalPeriodYears: "6",
  isNationalSizeHousing: true,
  isApartment: true,
};

function form(houses: HouseEntry[], over: Partial<Form> = {}, transferDate = "2026-08-01"): Form {
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
const sellingTir = (tir: SellingTir): Partial<Form> => ({ sellingHouseExclusion: { taxIncentiveRental: tir } });

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

type Single = { totalTax: number; reasons: string; warnings: string[] };
async function singleBody(body: Obj): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as
    | { exclusionReasons: { type: string }[]; warnings?: string[] }
    | undefined;
  return {
    totalTax: r.totalTax as number,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    warnings: mh?.warnings ?? [],
  };
}
const single = async (f: Form) => singleBody(await bodyOf(() => callTransferTaxAPI(f)));
async function multiTotal(f: Form): Promise<number> {
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

/** 조특법 §97① 본문(50%) — 1994 신축 국민주택 · 1995-03-01 임대개시 · 5호 이상 */
const RENTAL_97_MAIN = {
  type: "rental_97_main",
  constructionYear: "1994",
  isNationalHousing: true,
  isMultiUnitHousing: null,
  isUnoccupiedAt1986: null,
  isUnoccupiedAtAcquisition: null,
  hasMin5RentalUnits: true,
  registrationDate: "1995-02-01",
  isTaxRegistered: true,
  rentalStartDate: "1995-03-01",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  rentalContinuesToTransfer: true,
  stdPriceAtRentalEnd: "",
  stdPriceAtAcquisition: "",
  stdPriceAtTransfer: "",
};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("3호 — 양도 주택 자신이 감면대상장기임대주택 (단건 route)", () => {
  it("A2 2주택 → 412,071,000 (수정 전 926,678,500) · 사유 tax_incentive_rental", async () => {
    const f = form([general("h2")], sellingTir(SELLING_3HO));
    const body = await bodyOf(() => callTransferTaxAPI(f));
    // ④ 본문에 실린다 — 양도 주택 행에
    expect((body.houses as Obj[])[0]).toMatchObject({
      id: "selling",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6,
      isNationalSizeHousing: true,
      isApartment: true,
    });
    const r = await singleBody(body);
    expect(r.totalTax).toBe(412_071_000);
    expect(r.reasons).toBe("tax_incentive_rental");
  });

  it("A2 음성 짝 — 미선언이면 중과 926,678,500", async () => {
    expect((await single(form([general("h2")]))).totalTax).toBe(926_678_500);
  });

  it("A3 3주택 → 412,071,000 (수정 전 1,080,403,500)", async () => {
    const f = form([general("h2"), general("h3")], sellingTir(SELLING_3HO));
    const r = await single(f);
    expect(r.totalTax).toBe(412_071_000);
    expect(r.reasons).toBe("tax_incentive_rental");
    expect((await single(form([general("h2"), general("h3")]))).totalTax).toBe(1_080_403_500);
  });

  it("A3 + §97 본문 50% 감면 → 243,496,500 (수정 전 638,420,250)", async () => {
    const withReduction = (o: Partial<Form>) => {
      const f = form([general("h2"), general("h3")], o);
      f.assets[0] = { ...f.assets[0], reductions: [RENTAL_97_MAIN] as never };
      return f;
    };
    expect((await single(withReduction(sellingTir(SELLING_3HO)))).totalTax).toBe(243_496_500);
    expect((await single(withReduction({}))).totalTax).toBe(638_420_250);
  });

  it("요건 미충족 음성 짝 — 4년 임대 · 국민주택 초과 · 감면대상 아님이면 중과 유지", async () => {
    const two = (tir: SellingTir) => single(form([general("h2")], sellingTir(tir)));
    expect((await two({ ...SELLING_3HO, rentalPeriodYears: "4" })).totalTax).toBe(926_678_500);
    expect((await two({ ...SELLING_3HO, isNationalSizeHousing: false })).totalTax).toBe(926_678_500);
    expect((await two({ ...SELLING_3HO, isTaxIncentiveRental: false })).totalTax).toBe(926_678_500);
  });

  it("「합산 계산」(다건 route)도 같은 매퍼로 반영된다", async () => {
    expect(await multiTotal(form([general("h2")], sellingTir(SELLING_3HO)))).toBe(412_071_000);
    expect(await multiTotal(form([general("h2")]))).toBe(926_678_500);
  });
});

describe("3호 — 다른 보유 주택이 감면대상장기임대주택 (10호 「유일한 일반주택」)", () => {
  const rental3ho = (o: Partial<HouseEntry> = {}): HouseEntry => ({
    ...general("h2"),
    isTaxIncentiveRental: true,
    rentalPeriodYears: "6",
    isNationalSizeHousing: true,
    ...o,
  });

  it("B2 2주택 → 412,071,000 (수정 전 926,678,500)", async () => {
    const f = form([rental3ho()]);
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect((body.houses as Obj[])[1]).toMatchObject({
      id: "h2",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6,
      isNationalSizeHousing: true,
    });
    expect((await singleBody(body)).totalTax).toBe(412_071_000);
  });

  it("§167의3④ — 의무기간(5년)만 미달이면 10호 의제로 배제가 유지된다", async () => {
    const r = await single(form([rental3ho({ rentalPeriodYears: "3" })]));
    expect(r.totalTax).toBe(412_071_000);
  });

  it("음성 짝 — 국민주택 초과면 ④도 아니다(기간 외 요건 미충족) → 중과", async () => {
    expect((await single(form([rental3ho({ isNationalSizeHousing: false })]))).totalTax).toBe(926_678_500);
  });
});

describe("3호 후단 — 아파트 민간매입 양도기한 (2027.12.31 이후 양도)", () => {
  const LATE = "2028-03-01";
  const pendingNotice = (w: string[]) => w.some((s) => s.includes("감면대상장기임대주택") && s.includes("판정하지 못해"));

  it("후단 사실 「모름」 → 판정 보류: 종전 기준(배제) 유지 + 확인 필요 고지", async () => {
    const r = await single(form([general("h2")], sellingTir(SELLING_3HO), LATE));
    expect(r.reasons).toBe("tax_incentive_rental");
    expect(pendingNotice(r.warnings)).toBe(true);
  });

  it("매입·장기일반·도시형 아님 + 연장 사실(기한 경과) → 배제 해제(중과), 고지 없음", async () => {
    const r = await single(
      form(
        [general("h2")],
        sellingTir({
          ...SELLING_3HO,
          isTaxIncentiveRentalPurchase: true,
          taxIncentiveRentalRegistrationType: "long_term_general",
          isUrbanLifeHousingApartment: false,
          // ⑪3호 이전고시일 2026-06-01 → 기한 max(2027-12-31, 2027-06-01) = 2027-12-31 < 양도일
          taxIncentiveRentalAptDeadlineExtension: { relocationAnnouncementDate: "2026-06-01" },
        }),
        LATE,
      ),
    );
    expect(r.reasons).not.toContain("tax_incentive_rental");
    expect(pendingNotice(r.warnings)).toBe(false);
  });

  it("건설임대(매입 아님)면 후단 대상이 아니다 → 배제 유지, 고지 없음", async () => {
    const r = await single(
      form([general("h2")], sellingTir({ ...SELLING_3HO, isTaxIncentiveRentalPurchase: false }), LATE),
    );
    expect(r.reasons).toBe("tax_incentive_rental");
    expect(pendingNotice(r.warnings)).toBe(false);
  });
});

describe("§98 자동 경로 — 3호 입력과 OR로 공존한다 (회귀 없음)", () => {
  /** 법 §98① 트랙(1995.11.1~1997.12.31 취득) 적격 — `unsold-98-rental-housing-exclusion.anchor.test.ts` CA-06-7 */
  const REDUCTION_98 = {
    ...getReductionDefault("unsold_98"),
    isNationalScale98: true,
    isOutsideSeoul98: true,
    isUnsoldConfirmed98: true,
    isNotRentalHousing98: true,
    isFirstBuyerNoOccupancy98: true,
    rentedFor5Years98: true,
  };
  const with98 = (o: Partial<Form>) => {
    const f = form([general("h2")], o);
    f.assets[0] = { ...f.assets[0], acquisitionDate: "1996-05-01", reductions: [REDUCTION_98] as never };
    return f;
  };

  it("3호 미선언이어도 §98 적격이면 중과 배제(종전 그대로) · 3호를 함께 선언해도 배제", async () => {
    const auto = await single(with98({}));
    expect(auto.reasons).toBe("tax_special_exemption");
    const both = await single(with98(sellingTir(SELLING_3HO)));
    expect(both.reasons).not.toBe("");
    expect(both.totalTax).toBe(auto.totalTax);
  });
});
