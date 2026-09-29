/**
 * E-14g·E-14h route 관측 — 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건·다건) → 엔진 §155⑳ 경로.
 *
 * ## E-14g — 다건 route가 §155⑳ 자산의 소득금액·중과를 다시 만들었다
 *
 * 원인 둘(쓰기 지점 전수 — `transfer-tax-aggregate-asset-records.ts` · `transfer-tax-rental-housing-step.ts`):
 * 1. 집계가 `income = taxableGain − longTermHoldingDeduction`으로 소득금액을 다시 만든다. §155⑳ 경로는
 *    `taxableGain`에 이미 장특·§161 안분이 끝난 과세대상 양도소득금액을 싣는다 → 장특 이중 차감
 *    (299,200,000 − 374,000,000 = −74,800,000 → 총세액 0).
 * 2. §155⑳ 경로 결과에 `multiHouseSurchargeEvaluation`(중과 판정 echo)이 없어, 집계가 원시 플래그로 중과를
 *    되살렸다(1만 고치면 다건 167,360,600 — 단건이 15호로 배제한 중과).
 * 형제 경로(재개발·입주권·겸용·다필지·이월과세·일반 고가주택)는 전체 vitest 계측(자산별 `taxableGain − 장특`
 * ≠ 과세표준)에서 기본공제 2,500,000 차이만 났다 — §155⑳만 이 축의 결함이다.
 *
 * ## E-14h — 비과세(STEP 2.5)가 「그 밖의 1주택」을 보지 않았다
 *
 * 영 §155⑳ 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대가 … 해당 1주택(거주주택)을 양도하는
 * 경우」(MST 286211). 중첩 해석은 `lib/tax-engine/transfer-tax-rental-residence-composition.ts` 헤더 표.
 * 비과세와 중과 배제 ① 요소가 같은 판정(`resolveRentalResidenceComposition`)을 쓴다.
 *
 * 세율은 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택 2015 취득 · 20억 (E-14c 시료와 같다).
 *
 * | 시료 | 수정 전 단건 / 다건 | 수정 후 (단건 = 다건) |
 * |---|---:|---:|
 * | G-1 거주 + 임대 | 102,086,600 / 0 | 102,086,600 |
 * | G-2 거주 + 임대 + 신규(§155①) | 102,086,600 / 0 | 102,086,600 |
 * | H-1 거주 + 임대 + 다른 일반주택(특례 없음) | 199,997,600 / 0 | 1,327,903,500 (특례 불성립) |
 * | H-2 거주 + 임대 + 상속(§155②) | 199,997,600 / 0 | 102,086,600 (0162 · 13호) |
 * | H-3 거주 + 임대 + 상속 + 신규(3중첩) | 199,997,600 / 0 | 1,327,903,500 (3009) |
 * | H-4 명부 없음 · 주택 수 3(판정 보류) | 199,997,600 / 0 | 199,997,600 (종전 동작) |
 * | H-5 임대주택이 유일한 나중 취득 행 + 다른 일반주택 | 102,086,600 / 0 | 1,327,903,500 |
 * | G-3 시나리오 B(RH-B1 · mock 세율) | 67,309,000 / 22,093,500 | 67,309,000 |
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
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";

const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2025-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
/** 장기임대주택 행 — 등록 정보 없이 표시만(영 §167의3①2호 판정 불가 → 중과 주택 수에 들어간다) */
const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
/** 일시적 2주택의 신규 주택(2025) */
const NEW_HOUSE: HouseEntry = { ...ROW };
/** §155② 상속주택 — 2019 상속(양도 주택 2015는 상속개시 당시 보유) */
const INHERITED: HouseEntry = { ...ROW, id: "h3", isInherited: true, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01" };
/** 어느 특례에도 걸리지 않는 일반주택(양도 주택보다 먼저 취득) */
const OTHER_OLD: HouseEntry = { ...ROW, id: "h6", acquisitionDate: "2012-01-01" };

function form(houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

/** §155⑳ 거주주택 특례 선언 — 가목 장기일반민간임대(2019.3.1. 등록) · 거주 48개월 */
function withRental(f: Form): Form {
  const a = f.assets[0];
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2019-03-01",
        rentalRegistrationDate: "2019-03-01",
        standardPriceAtRentalStart: "250,000,000",
        rentalInputMode: "direct",
        rentalMonths: "90",
        requirementsConfirmed: true,
      },
    ],
  };
  return f;
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

interface Single {
  totalTax: number;
  rentalApplied: boolean;
  notApplicable: string | undefined;
}
async function single(f: Form): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const steps = (r.steps ?? []) as { label: string; formula: string }[];
  return {
    totalTax: r.totalTax as number,
    rentalApplied: (r.rentalHousingExceptionDetail as { applied?: boolean } | undefined)?.applied === true,
    notApplicable: steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")?.formula,
  };
}
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

const fallbackRates = () =>
  vi
    .mocked(preloadTaxRates)
    .mockImplementation(
      async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
beforeEach(fallbackRates);
afterEach(() => vi.unstubAllGlobals());

/** 거주주택 특례 RH-A2 + 15호(13호) 중과 배제 — E-14c RC-1과 같은 값 */
const RH_EXCLUDED = 102_086_600;
/** 특례 불성립 → 일반 과세(3주택 중과) */
const FULLY_TAXED = 1_327_903_500;

describe("E-14g 다건 route — §155⑳ 자산의 소득금액·중과 판정을 단건과 같게", () => {
  it("G-1 거주 + 임대(RH-A2 고가) → 단건 = 다건 = 102,086,600 (수정 전 다건 0)", async () => {
    const f = withRental(form([RENTAL_ROW]));
    expect(await single(f)).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(await multi(f)).toBe(RH_EXCLUDED);
  });

  it("G-2 거주 + 임대 + 신규(§155① 중첩) → 단건 = 다건 = 102,086,600 (수정 전 다건 0)", async () => {
    const f = withRental(
      form([RENTAL_ROW, NEW_HOUSE], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" }),
    );
    expect(await single(f)).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(await multi(f)).toBe(RH_EXCLUDED);
  });

  it("G-3 시나리오 B(RH-B1 · mock 세율) → 단건 = 다건 = 67,309,000 (수정 전 다건 22,093,500)", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-03-03";
    f.householdHousingCount = "1";
    f.contractTotalPrice = "800,000,000";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2009-08-12",
      actualSalePrice: "800,000,000",
      fixedAcquisitionPrice: "400,000,000",
      useEstimatedAcquisition: false,
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "48",
    });
    f.assets[0].rentalHousingException = {
      ...f.assets[0].rentalHousingException,
      applyException: true,
      scenario: "B",
      priorResidenceTransferDate: "2016-08-25",
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtPriorTransfer: "450,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
      postRegistrationResidenceMonths: "24",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2016-06-01",
          rentalRegistrationDate: "2016-06-01",
          standardPriceAtRentalStart: "300,000,000",
          rentalInputMode: "direct",
          rentalMonths: "96",
          requirementsConfirmed: true,
        },
      ],
    };
    const s = await single(f);
    // 수정 전 다건 22,093,500(장특 이중 차감)
    expect(s).toMatchObject({ totalTax: 67_309_000, rentalApplied: true });
    expect(await multi(f)).toBe(67_309_000);
  });
});

describe("E-14h 비과세 — 「장기임대주택 … 과 그 밖의 1주택」 (중과 배제와 같은 판정)", () => {
  it("H-1 거주 + 임대 + 다른 일반주택(특례 없음) → 특례 불성립·일반 과세 (수정 전 비과세 적용 199,997,600)", async () => {
    const f = withRental(form([RENTAL_ROW, OTHER_OLD]));
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.notApplicable).toMatch(/그 밖의 1주택/);
    expect(await multi(f)).toBe(FULLY_TAXED);
  });

  it("H-2 긍정 짝 — 거주 + 임대 + §155② 상속주택 → 특례 적용 + 13호 배제 102,086,600 (사전-2025-법규재산-0162)", async () => {
    const f = withRental(form([RENTAL_ROW, INHERITED]));
    expect(await single(f)).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(await multi(f)).toBe(RH_EXCLUDED);
  });

  it("H-3 거주 + 임대 + 상속 + 신규(§155⑳·②·① 3중첩) → 특례 불성립 (서면-2018-부동산-3009)", async () => {
    const f = withRental(
      form([RENTAL_ROW, INHERITED, NEW_HOUSE], {
        temporaryTwoHouseSpecial: true,
        newHouseAcquisitionDate: "2025-01-01",
      }),
    );
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.notApplicable).toMatch(/2채/);
    expect(await multi(f)).toBe(FULLY_TAXED);
  });

  it("H-4 명부 없음(간이 입력 · 주택 수 3) → 판정 보류 · 종전 동작(특례 적용) 199,997,600", async () => {
    const f = withRental(form([], { householdHousingCount: "3" }));
    expect(await single(f)).toMatchObject({ totalTax: 199_997_600, rentalApplied: true, notApplicable: undefined });
    expect(await multi(f)).toBe(199_997_600);
  });

  it("H-5 명부의 유일한 나중 취득 행이 임대주택 + 다른 일반주택 → §155①로 보지 않는다 → 특례 불성립", async () => {
    const f = withRental(form([{ ...RENTAL_ROW, acquisitionDate: "2025-01-01" }, OTHER_OLD]));
    expect(await single(f)).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(await multi(f)).toBe(FULLY_TAXED);
  });
});

/**
 * #1856(E-14e·f) 결합 — 2023.2.28. 전 양도분(2022.3.15. · 중과 한시 배제 2022.5.10. 전 · 고가 기준 12억).
 *
 * 그 기간 §155⑳ 거주주택은 구 §167의10①14호(2021.2.17.~)가 받고, 구 8호(일시적 2주택 — §155①을 인용하지 않고
 * §154① 요건도 없다)가 `resolveOldClauseExclusion`에서 **먼저** 판정된다. 8호의 「다른 주택」은 문언상 장기임대주택을
 * 가리지 않으므로 임대주택을 3년 안에 취득한 세대는 8호로 배제된다(14호와 결론 같음 · 사유만 다름).
 * 세대 구성 판정(E-14h)은 비과세(§155①은 현행 기한 — 조정→조정 1년)와 14호·13호 ① 요소에만 걸린다.
 *
 * OE-3(특례 불성립 3주택)은 E-14k 전까지 단건만 단언했다 — 이 기간 일반 3주택 세대가 다건에서만 12의2 한시 배제를
 * 받아 650,512,500으로 갈렸다(다건 route가 과세기간 말일로 고른 2022-05-10 유예 행에 하한 판정이 없었다). E-14k 이후
 * 단건 = 다건을 단언한다.
 */
describe("#1856 결합 — 2023.2.28. 전 양도분 §155⑳", () => {
  const OLD = "2022-03-15";
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(
      async () => loadFallbackTransferRates(new Date(OLD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
  });
  async function reasons(f: Form): Promise<string> {
    const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
    const r = ((await res.json()) as { data: { result: Obj } }).data.result;
    const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string; detail: string }[] } | undefined;
    return (mh?.exclusionReasons ?? []).map((x) => `${x.type}:${x.detail}`).join(" | ");
  }
  const OLD_EXCLUDED = 138_512_000;

  it("OE-1 거주 + 임대 → 구 14호 배제 138,512,000 (단건 = 다건)", async () => {
    const f = withRental(form([RENTAL_ROW], { transferDate: OLD }));
    expect(await single(f)).toMatchObject({ totalTax: OLD_EXCLUDED, rentalApplied: true });
    expect(await reasons(f)).toMatch(/^long_term_rental_residence:.*§167의10①14호/);
    expect(await multi(f)).toBe(OLD_EXCLUDED);
  });

  it("OE-2 임대주택을 3년 안에 취득(2020) → 구 8호가 먼저 받는다 · 세액 같음 (단건 = 다건)", async () => {
    const f = withRental(form([{ ...RENTAL_ROW, acquisitionDate: "2020-01-01" }], { transferDate: OLD }));
    expect(await single(f)).toMatchObject({ totalTax: OLD_EXCLUDED, rentalApplied: true });
    expect(await reasons(f)).toMatch(/^temporary_two_house:.*§167의10①8호/);
    expect(await multi(f)).toBe(OLD_EXCLUDED);
  });

  it("OE-3 거주 + 임대 + 다른 일반주택 → 특례 불성립 · 14호·8호 모두 불성립 (단건 = 다건 · E-14k 전 다건 650,512,500)", async () => {
    const f = withRental(form([RENTAL_ROW, OTHER_OLD], { transferDate: OLD }));
    expect(await single(f)).toMatchObject({ totalTax: 1_328_497_500, rentalApplied: false });
    expect(await reasons(f)).toBe("");
    expect(await multi(f)).toBe(1_328_497_500);
  });

  it("OE-4 거주 + 임대 + §155② 상속 → 3주택 13호(2021.2.17.~) 배제 (단건 = 다건)", async () => {
    const f = withRental(form([RENTAL_ROW, INHERITED], { transferDate: OLD }));
    expect(await single(f)).toMatchObject({ totalTax: OLD_EXCLUDED, rentalApplied: true });
    expect(await reasons(f)).toMatch(/^long_term_rental_residence:.*§167의3①13호/);
    expect(await multi(f)).toBe(OLD_EXCLUDED);
  });
});
