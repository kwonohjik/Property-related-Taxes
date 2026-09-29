/**
 * E-14n route 관측 — 다건 route가 **자산마다 그 양도일의 세율 행**으로 계산하는가 (단건 = 다건).
 *
 * ## 원인
 *
 * 다건 route는 세율을 **과세기간 말일** 한 날짜로만 읽었다(`app/api/calc/transfer/multi/route.ts` `rateDate`).
 * 단건 route는 양도일로 읽는다(`app/api/calc/transfer/route.ts`). 그래서 **연중에 시작하는 행**이 있는 해에는
 * 그 시작일 전에 양도한 자산이 다건에서만 그 행을 받았다. E-14k(#1872)는 그중 `surcharge:_default` 2022-05-10 행
 * 하나를 엔진 술어로 막았다. 연중 시작 행 전수(fallback seed = live DB `preload_tax_rates` 실측 동일):
 *
 * | 행 (effective_date) | 소비자 | 갈림 (수정 전 단건 / 다건) |
 * |---|---|---|
 * | `surcharge:_default` 2022-05-10 | 중과 유예 판정 | E-14k로 이미 같음 |
 * | `surcharge:_default` 2024-01-10 | 중과 유예 판정 | 같음 — 2023-01-01 행과 유예 값이 같다(`legal_basis` 문자열만 다르고 소비자 0) |
 * | `special:house_count_exclusion` 2018-04-01 | STEP 0.5 정밀 중과 판정 게이트 | **갈림** — 2018.1.1.~3.31. 양도 · 보유 3년 이상: 다건만 정밀 판정을 타 장특 배제가 달라졌다 |
 * | `deduction:long_term_rental_v2` 2020-08-18 | legacy `rentalReductionDetails`(API 직접 입력 전용) 감면·장특 특례율 | **갈림** — 장기일반·공공지원 2020.1.1.~8.17. |
 * | `deduction:new_housing_matrix` 2001-05-23 | legacy `newHousingDetails`(API 직접 입력 전용) 감면 | **갈림** — 2001.1.1.~5.22. |
 *
 * ## 수정
 *
 * - route가 자산별 양도일(중복 제거)마다 세율을 읽어 엔진에 넘긴다(`ratesByTransferDate`). 신고 단위 단계
 *   (§103 기본공제 연 250만원 · §104⑤1호 §55① 누진표)는 과세기간 세율을 그대로 쓴다.
 * - 2018.4.1. 전 양도분 장특 배제: 「소득세법」 §95② 괄호는 2016.1.1.~2018.3.31. 「제104조제3항에 따른 미등기양도자산은
 *   제외한다」뿐이었다(행위시법 MST 199742 · 2018.1.15. 기준). §104⑦ 자산을 넣은 개정은 법률 제15225호 부칙 제1조1호
 *   「제95조제2항 각 표 외의 부분 본문 … : 2018년 4월 1일」. 그래서 이 기간 다주택 양도에 장특이 붙는다 — 단건도 함께 바뀐다
 *   (종전 단건은 원시 플래그 중과 케이스로 장특을 뺐다).
 *
 * 세율은 각 route가 부른 날짜 그대로의 프로덕션 fallback. 강남 · 양도가액 20억 · 취득가액 3억.
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

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
type Inject = (body: Obj) => void;

const GANGNAM = "1168010100";
const row = (id: string, acq: string): HouseEntry => ({
  id,
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: acq,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

function form(acq: string, transfer: string, houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: acq,
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: transfer,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}
/** 2주택 — 종전 주택 2010 취득 · 신규 2017-06 취득(§155① 일시적 2주택) · 보유 8년 */
const twoHouse = (td: string) => form("2010-01-01", td, [row("n", "2017-06-01")]);
/** 3주택 — 양도 주택 2015 취득(보유 3년) */
const threeHouse = (td: string) => form("2015-01-01", td, [row("a", "2012-01-01"), row("b", "2016-06-01")]);
/** 비조정 · 주택 수 3(legacy 감면 경로 관측용 — 중과 없음) */
const plain = (acq: string, td: string, count = "3") =>
  form(acq, td, [], { isRegulatedArea: false, householdHousingCount: count });

/** legacy 장기임대 감면(`rentalReductionDetails`) — ④가 만들지 않는 API 직접 입력 전용 경로 */
const rental =
  (td: string, type: string): Inject =>
  (b) => {
    b.rentalReductionDetails = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: "2010-01-01",
      rentalHousingType: type,
      propertyType: "apartment",
      region: "capital",
      officialPriceAtStart: 200_000_000,
      rentalStartDate: "2010-01-01",
      transferDate: td,
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };
  };
/** legacy 신축주택 감면(`newHousingDetails`) — API 직접 입력 전용 경로 */
const newHousing =
  (td: string): Inject =>
  (b) => {
    b.newHousingDetails = {
      acquisitionDate: "1999-01-15",
      transferDate: td,
      region: "nationwide",
      acquisitionPrice: 300_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };
  };

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

interface AssetView {
  lthd: number;
  appliedRate: number;
  rentalEligible?: boolean;
  newHousingEligible?: boolean;
}
const view = (r: Obj): AssetView => ({
  lthd: r.longTermHoldingDeduction as number,
  appliedRate: r.appliedRate as number,
  rentalEligible: (r.rentalReductionDetail as { isEligible?: boolean } | undefined)?.isEligible,
  newHousingEligible: (r.newHousingReductionDetail as { isEligible?: boolean } | undefined)?.isEligible,
});

async function single(f: Form, inject?: Inject): Promise<{ totalTax: number; asset: AssetView }> {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  inject?.(body);
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { totalTax: json.data.result.totalTax as number, asset: view(json.data.result) };
}

async function multiRaw(fs: Form[], injects: (Inject | undefined)[] = []) {
  const mf = {
    taxYear: Number(fs[0].transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(
      mf,
      fs.map((form, i) => ({ propertyId: `p${i}`, propertyLabel: `p${i}`, form, completionPercent: 100 })),
    ),
  );
  (body.properties as Obj[]).forEach((p, i) => injects[i]?.(p));
  return post(MULTI, "http://l/api/calc/transfer/multi", body);
}
async function multi(fs: Form[], injects: (Inject | undefined)[] = []) {
  const res = await multiRaw(fs, injects);
  const json = (await res.json()) as { data: { totalTax: number; properties: Obj[] } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { totalTax: json.data.totalTax, assets: json.data.properties.map(view) };
}

/** 1건 신고: 단건 = 다건 (총세액 · 자산 관측값) */
async function expectSame(f: Form, inject?: Inject): Promise<number> {
  const s = await single(f, inject);
  const m = await multi([f], [inject]);
  expect(m.totalTax).toBe(s.totalTax);
  expect(m.assets[0]).toEqual(s.asset);
  return s.totalTax;
}

beforeEach(() => {
  // route가 넘긴 날짜 그대로 — DB `preload_tax_rates(date)`와 같은 의미론.
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(preloadTaxRates).mockReset();
});

describe("E-14n ① house_count_exclusion 2018-04-01 행 — 2018.1.1.~3.31. 양도", () => {
  it("H-1 2주택(§155① 일시적 2주택) · 2018-01-15 → 단건 = 다건 = 119,064,000 (수정 전 단건 391,875,000 / 다건 119,064,000)", async () => {
    // 고가주택 과세분 935,000,000 × 표2 64%(보유 8년) = 598,400,000 — §95② 괄호가 다주택을 빼지 않던 시기.
    expect(await expectSame(twoHouse("2018-01-15"))).toBe(119_064_000);
  });

  it("H-2 2주택 · 2018-03-31(행 시작 전날) → 119,064,000", async () => {
    expect(await expectSame(twoHouse("2018-03-31"))).toBe(119_064_000);
  });

  it("H-3 3주택 · 2018-01-15 → 장특 배제 없음 · 단건 = 다건 (수정 전 양쪽 745,305,000 — 장특 0)", async () => {
    // ⚠️ 금액은 고정하지 않는다 — 표1 공제율 연혁(법률 제15225호 부칙 제1조3호: 「제95조제2항 표 1」 2019.1.1. 시행,
    //    그 전 3년 이상 10%)을 엔진이 두지 않아(현행 연 2%) 이 시료의 공제액은 별건 확인 필요다. 여기서는 배제 여부만 본다.
    const total = await expectSame(threeHouse("2018-01-15"));
    expect(total).toBeLessThan(745_305_000);
    expect((await single(threeHouse("2018-01-15"))).asset.lthd).toBeGreaterThan(0);
  });

  it("H-4 긍정 짝 — 3주택 · 2018-04-01(§104⑦ 시행일) → 중과 62% · 장특 배제 1,118,755,000 (불변)", async () => {
    expect(await expectSame(threeHouse("2018-04-01"))).toBe(1_118_755_000);
  });
});

describe("E-14n ② long_term_rental_v2 2020-08-18 행 — legacy 장기임대 감면(API 직접 입력)", () => {
  // ⚠️ 2020-08-18 전 값은 **현행 seed 결과**다(그 전 시점의 행이 없다) — 법령 판정이 아니라 단건과 같은지만 본다.
  for (const type of ["long_term_private", "public_support_private"]) {
    it(`R-${type} 2020-03-02 · 2020-08-17 → 단건 = 다건`, async () => {
      expect(await expectSame(plain("2009-06-01", "2020-03-02"), rental("2020-03-02", type))).toBe(347_587_500);
      expect(await expectSame(plain("2009-06-01", "2020-08-17"), rental("2020-08-17", type))).toBe(338_305_500);
    });
  }
  it("R-긍정 짝 — 장기일반 2020-08-18 → 208,357,500 (불변)", async () => {
    expect(await expectSame(plain("2009-06-01", "2020-08-18"), rental("2020-08-18", "long_term_private"))).toBe(
      208_357_500,
    );
  });
});

describe("E-14n ②′ 가산세 base(예정신고 세액)도 양도일 세율", () => {
  it("P-1 장기일반 legacy · 2020-03-02 · 무신고 가산세 → 단건 = 다건", async () => {
    const penalty: Inject = (b) => {
      rental("2020-03-02", "long_term_private")(b);
      b.filingPenaltyDetails = {
        determinedTax: 0,
        reductionAmount: 0,
        priorPaidTax: 0,
        originalFiledTax: 0,
        excessRefundAmount: 0,
        interestSurcharge: 0,
        filingType: "none",
        penaltyReason: "normal",
      };
    };
    const s = await single(plain("2009-06-01", "2020-03-02"), penalty);
    const m = await multi([plain("2009-06-01", "2020-03-02")], [penalty]);
    expect(s.totalTax).toBeGreaterThan(347_587_500); // 가산세가 실제로 붙었다
    expect(m.totalTax).toBe(s.totalTax);
  });
});

describe("E-14n ③ new_housing_matrix 2001-05-23 행 — legacy 신축주택 감면(API 직접 입력)", () => {
  // ⚠️ 2001-05-23 전 값은 현행 seed 결과(행 없음 → NO_RULES)다. 법령 판정이 아니다.
  it("N-1 2001-03-02 · 2001-05-22 → 단건 = 다건 = 718,960,000", async () => {
    expect(await expectSame(plain("1999-01-15", "2001-03-02", "2"), newHousing("2001-03-02"))).toBe(718_960_000);
    expect(await expectSame(plain("1999-01-15", "2001-05-22", "2"), newHousing("2001-05-22"))).toBe(718_960_000);
  });
  it("N-긍정 짝 — 2001-05-23 → 130,720,000 (불변)", async () => {
    expect(await expectSame(plain("1999-01-15", "2001-05-23", "2"), newHousing("2001-05-23"))).toBe(130_720_000);
  });
});

describe("E-14n ④ 연중 경계 양쪽 자산을 한 신고에", () => {
  it("B-1 2018 — 2주택 3.15.(장특 표2) + 3주택 6.1.(중과 62%) → 자산별 = 각 단건 · 총세액 1,239,524,000", async () => {
    const a = twoHouse("2018-03-15");
    const b = threeHouse("2018-06-01");
    const m = await multi([a, b]);
    expect(m.assets[0]).toEqual((await single(a)).asset);
    expect(m.assets[1]).toEqual((await single(b)).asset);
    expect(m.assets[0].lthd).toBe(598_400_000);
    expect(m.assets[1]).toMatchObject({ lthd: 0, appliedRate: 0.62 });
    // §104⑤2호 세율군별 합계(108,240,000 + 1,018,600,000) > 1호 전체 누진(818,922,000) → ×1.1
    expect(m.totalTax).toBe(1_239_524_000);
  });

  it("B-2 2020 — 장기일반 3.2.(행 전) + 9.1.(행 후) → 자산별 장특·감면 적격이 각 단건과 같다", async () => {
    const fa = plain("2009-06-01", "2020-03-02");
    const fb = plain("2009-06-01", "2020-09-01");
    const ia = rental("2020-03-02", "long_term_private");
    const ib = rental("2020-09-01", "long_term_private");
    const m = await multi([fa, fb], [ia, ib]);
    expect(m.assets[0]).toEqual((await single(fa, ia)).asset);
    expect(m.assets[1]).toEqual((await single(fb, ib)).asset);
    expect(m.assets[0].lthd).not.toBe(m.assets[1].lthd);
  });

  it("B-3 2001 — 신축 3.2.(행 전) + 6.1.(행 후) → 감면 적격이 각 단건과 같다", async () => {
    const fa = plain("1999-01-15", "2001-03-02", "2");
    const fb = plain("1999-01-15", "2001-06-01", "2");
    const m = await multi([fa, fb], [newHousing("2001-03-02"), newHousing("2001-06-01")]);
    expect(m.assets.map((x) => x.newHousingEligible)).toEqual([false, true]);
    expect(m.assets[0]).toEqual((await single(fa, newHousing("2001-03-02"))).asset);
    expect(m.assets[1]).toEqual((await single(fb, newHousing("2001-06-01"))).asset);
  });

  it("B-4 2022 — 3주택 3.15.(중과) + 6.1.(한시 배제) → 자산별 세율이 각 단건과 같다 (E-14k 짝)", async () => {
    const a = threeHouse("2022-03-15");
    const b = threeHouse("2022-06-01");
    const m = await multi([a, b]);
    expect(m.assets[0]).toEqual((await single(a)).asset);
    expect(m.assets[1]).toEqual((await single(b)).asset);
    expect(m.assets.map((x) => x.appliedRate)).toEqual([0.75, 0.45]);
  });

  it("B-6 2022 — 명부 없는 3주택(원시 판정) 1.3.(중과) + 6.1.(한시 배제) → 자산별 = 각 단건 · 총세액 1,980,247,500", async () => {
    // 원시 판정은 유예 여부를 **세율 행**에서 읽는다 — 집계 M-5가 자산 세액을 다시 낼 때도 그 자산의 행이어야 한다.
    const a = form("2015-01-01", "2022-01-03", [], { householdHousingCount: "3" });
    const b = form("2015-01-01", "2022-06-01", [], { householdHousingCount: "3" });
    const m = await multi([a, b]);
    expect(m.assets[0]).toEqual((await single(a)).asset);
    expect(m.assets[1]).toEqual((await single(b)).asset);
    // §104⑤2호: 중과군 1,697,500,000×75%−65,400,000 = 1,207,725,000 · 누진군 1,462,000,000×45%−65,400,000 = 592,500,000
    //   합 1,800,225,000 > 1호 전체 누진 1,356,375,000 → ×1.1
    expect(m.totalTax).toBe(1_980_247_500);
  });

  it("B-5 과세연도가 다른 자산은 한 신고에 담을 수 없다 — 400 (종전 동작)", async () => {
    const f2 = twoHouse("2018-03-15");
    const f3 = threeHouse("2019-06-01");
    const res = await multiRaw([f2, f3]);
    expect(res.status).toBe(400);
  });
});

describe("E-14n ⑤ 세율 로드 횟수 — 양도일 중복 제거 + 과세기간 1회", () => {
  it("L-1 자산 3건(양도일 2개) → 양도일 2개와 과세기간 말일로 읽는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test"); // RPC 경로(`preloadTaxRates`)를 탄다
    await multi([twoHouse("2018-03-15"), threeHouse("2018-03-15"), threeHouse("2018-06-01")]);
    const days = vi.mocked(preloadTaxRates).mock.calls.map(([, d]) => (d as Date).toISOString().slice(0, 10));
    expect(days).toContain("2018-03-15");
    expect(days).toContain("2018-06-01");
    expect(new Set(days).size).toBe(days.length); // 같은 날짜를 두 번 읽지 않는다
    expect(days.length).toBe(3);
  });
});
