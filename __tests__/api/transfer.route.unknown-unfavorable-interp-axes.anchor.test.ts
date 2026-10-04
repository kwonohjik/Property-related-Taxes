/**
 * 「모름은 납세자에게 불리하게」(사용자 결정 2026-10-04) — §155⑳ 세대 구성의 **해석 미확보** 축.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.8 「해석 미확보 축」.
 *
 * #1945가 보류한 세 축(`special_act`·`co_inherited`·`other_special_rule`)은 사실이 아니라 「겹쳐 적용하는가」라는
 * 해석을 모르는 경우였다. taxlaw.nts 재검색(2026-10-04) + 사용자 결정(Q1~Q3 (가), 2026-10-04):
 * - 성립(`met` — 비과세 적용 + 13호·15호 중과 배제 ① 요소, Q1 법문 추론): §155④ 동거봉양(부동산거래관리과-44) ·
 *   §155⑤ 혼인(상속증여세과-21 · 사전-2025-법규재산-1062) · §155⑦3호 귀농(서면-2015-부동산-0193) ·
 *   §155③ 공동상속 소수지분 2중첩(Q3 — 3중첩 불허 0584·0029·2439·4283 · 7265) ·
 *   조특법 §99의2와 같은 문형 조문(Q2 — 2422 등 + 같은 문형) · §99의4(3686 등).
 * - 불성립 + 결론을 가를 때만 「확인 필요」: §155⑦1호·2호 · 조특법 §98(시행령 위임 — 문형 다름) · §98의9.
 *
 * 시료: 강남 · 2015 취득 · 2026-09-18 양도 20억 · 거주 48개월 · 가목 장기일반민간임대 1채(명부 「장기임대」 행) ·
 * 그 밖의 주택 1채(명부 행). mock 아닌 fallback 세율. 「수정 전」 = origin/master(b91a2d0c) 엔진.
 *
 * | 축 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | §155③ 공동상속 소수지분 | 167,360,600 (적용 · 배제 미개방) | 102,086,600 (적용 · 13호 배제 · 단건 = 다건) |
 * | §155⑦1호 상속 농어촌주택 | 167,360,600 (적용) | 1,141,178,500 + 확인 필요 |
 * | 조특법 §98 (명부 행) | 199,997,600 (적용) | 1,327,903,500 + 확인 필요 |
 * | 조특법 §98 (명부 없음 · 폼 전역) | 199,997,600 (적용) | 1,327,903,500 + 확인 필요 |
 * | 조특법 §98의8 (명부 행 · 같은 문형) | 199,997,600 | 102,086,600 (다건 1,327,903,500 — 별건 Q4) |
 * | §155⑤ 혼인 · §155④ 동거봉양 | 199,997,600 (적용 · 배제 미개방) | 102,086,600 (적용 · 13호 배제) |
 * | §155⑦3호 귀농 | 167,360,600 | 102,086,600 |
 * | 조특법 §99의2 (명부 행) | 199,997,600 | 102,086,600 |
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import {
  RENTAL_RESIDENCE_RURAL_CONFIRM_NOTICE,
  rentalResidenceSpecialActConfirmNotice,
} from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const CONFIRM_LABEL = "장기임대주택 거주주택 비과세 특례 — 확인 필요";
const NOT_APPLICABLE_LABEL = "장기임대주택 거주주택 비과세 특례 — 적용 불가";

const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(houses: HouseEntry[], over: Partial<Form> = {}, price = "2,000,000,000"): Form {
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
    contractTotalPrice: price,
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

/** §155⑳ 거주주택 특례 선언 — 가목 장기일반민간임대(2019.3.1. 등록) · 거주 48개월 (E-14gh 시료) */
function withRental(f: Form, residenceMonths = "48"): Form {
  const a = f.assets[0];
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = residenceMonths;
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
  status: number;
  totalTax?: number;
  rentalApplied?: boolean;
  stepLabels: string[];
  confirm?: string;
  exclusions: string[];
  fieldErrors?: Record<string, string[]>;
}
async function singleBody(body: Obj): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as {
    data?: { result: Obj };
    error?: { fieldErrors?: Record<string, string[]> };
  };
  if (res.status !== 200) {
    return { status: res.status, stepLabels: [], exclusions: [], fieldErrors: json.error?.fieldErrors };
  }
  const r = json.data!.result;
  const steps = (r.steps ?? []) as { label: string; formula: string }[];
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons?: { type: string }[] } | undefined;
  return {
    status: 200,
    totalTax: r.totalTax as number,
    rentalApplied: (r.rentalHousingExceptionDetail as { applied?: boolean } | undefined)?.applied === true,
    stepLabels: steps.map((s) => s.label),
    confirm: steps.find((s) => s.label === CONFIRM_LABEL)?.formula,
    exclusions: (mh?.exclusionReasons ?? []).map((e) => e.type),
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const FULLY_TAXED = 1_327_903_500;
/** 특례 불성립 후 일반 과세 — 공동상속 소수지분·농어촌주택 시료의 값(그 밖의 일반주택 시료 FULLY_TAXED와 다르다) */
const TAXED_TWO = 1_141_178_500;
/** 거주주택 특례 + 13호 중과 배제 — E-14gh RH_EXCLUDED와 같은 값 */
const RH_EXCLUDED = 102_086_600;
const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
const CO_INHERITED: HouseEntry = {
  ...ROW,
  id: "h3",
  isInherited: true,
  acquisitionDate: "2019-06-01",
  inheritedDate: "2019-06-01",
  isCoInherited: true,
  isLargestCoInheritedShareholder: false,
};
const SOLE_INHERITED: HouseEntry = { ...CO_INHERITED, isCoInherited: false, isLargestCoInheritedShareholder: undefined };
const RURAL = (ruralHouseKind: "inherited" | "return_to_farm"): HouseEntry => ({
  ...ROW,
  id: "h3",
  regionCode: "4377037000", // 충북 음성군 (수도권 밖 면 지역 시료)
  acquisitionDate: "2024-01-01",
  oneHouseRuralHouse: true,
  ruralHouseKind,
  ruralOutsideCapitalEupMyeon: true,
  ruralDecedentResidenceYears: "6",
  ruralLandAreaSqm: "300",
  ruralWholeHouseholdMoved: true,
  ruralHighPriceAtAcquisition: false,
});
type Special = NonNullable<Form["specialHouseExclusions"]>[number];
const special = (article: Special["article"], contract: string): Special => ({
  article,
  houseAcquisitionDate: contract,
  houseContractDate: contract,
  isNationalHousing: false,
  requirementsConfirmed: true,
});
const SPECIAL_ROW = (article: Special["article"], contract: string): HouseEntry => ({
  ...ROW,
  id: "h3",
  acquisitionDate: contract,
  countExclusion: { kind: "special", special: special(article, contract) },
});
const OTHER: HouseEntry = { ...ROW, id: "h3" };

// ─────────────────────────────────────────────────────────────────────────────
describe("§155③ 공동상속주택 소수지분과의 2중첩 — 성립(Q3), 3중첩은 불성립", () => {
  it("UX-B1 명부: 거주 + 임대 + 공동상속 소수지분 → 적용 + 13호 배제 (수정 전 167,360,600 · 단건 = 다건)", async () => {
    const f = withRental(form([CO_INHERITED, RENTAL_ROW]));
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.exclusions).toContain("long_term_rental_residence");
    expect(s.confirm).toBeUndefined();
    expect(await multi(f)).toBe(RH_EXCLUDED);
  });

  it("UX-B2 (음성 짝) 거주 0개월이면 나머지 요건 불충족 → 적용 불가 · 고지 없음", async () => {
    const s = await single(withRental(form([CO_INHERITED, RENTAL_ROW]), "0"));
    expect(s).toMatchObject({ totalTax: TAXED_TWO, rentalApplied: false });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-B3 (양성 짝) 같은 행이 §155② 단독상속주택이면(0162) → 적용 · 고지 없음", async () => {
    const s = await single(withRental(form([SOLE_INHERITED, RENTAL_ROW])));
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-B4 3중첩(공동상속 소수지분 + 다른 일반주택) → 불성립 · 고지 없음(0584·0029)", async () => {
    const s = await single(withRental(form([CO_INHERITED, { ...ROW, id: "h6", acquisitionDate: "2012-01-01" }, RENTAL_ROW])));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.stepLabels).toContain(NOT_APPLICABLE_LABEL);
    expect(s.confirm).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("§155④⑤⑦ 겹침 — ④⑤·⑦3호는 해석 확보(met), ⑦1·2호는 미확보(불성립)", () => {
  const merged = (over: Partial<Form>) => withRental(form([OTHER, RENTAL_ROW], over));

  it("UX-C1 §155⑤ 혼인 합가 → 적용 + 13호 중과 배제 (수정 전 199,997,600 — 배제 미개방 · 단건 = 다건)", async () => {
    const f = merged({ marriageDate: "2020-01-01", isFirstTransferredInMerge: true });
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.exclusions).toContain("long_term_rental_residence");
    expect(s.confirm).toBeUndefined();
    expect(await multi(f)).toBe(RH_EXCLUDED);
  });

  it("UX-C2 §155④ 동거봉양 합가 → 적용 + 13호 중과 배제 (수정 전 199,997,600)", async () => {
    const s = await single(merged({ parentalCareMergeDate: "2020-01-01", isFirstTransferredInMerge: true }));
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.exclusions).toContain("long_term_rental_residence");
    expect(s.confirm).toBeUndefined();
  });

  it("UX-C3 (음성 짝) 합가 사실이 없으면 그 밖의 주택 → 불성립 · 고지 없음(사실이 확정)", async () => {
    const s = await single(merged({}));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-C4 §155⑦1호 상속 농어촌주택 → 불성립 + 확인 필요 (수정 전 167,360,600 · 단건 = 다건)", async () => {
    const f = withRental(form([RURAL("inherited"), RENTAL_ROW]));
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: TAXED_TWO, rentalApplied: false });
    expect(s.confirm).toBe(RENTAL_RESIDENCE_RURAL_CONFIRM_NOTICE);
    expect(await multi(f)).toBe(TAXED_TWO);
  });

  it("UX-C5 (결론 무관) ⑦1호 + 거주 0개월 → 확인 필요 없음", async () => {
    const s = await single(withRental(form([RURAL("inherited"), RENTAL_ROW]), "0"));
    expect(s).toMatchObject({ totalTax: TAXED_TWO, rentalApplied: false });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-C6 (양성 짝) §155⑦3호 귀농주택 → 적용 + 13호 중과 배제 (수정 전 167,360,600)", async () => {
    const s = await single(withRental(form([RURAL("return_to_farm"), RENTAL_ROW])));
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.confirm).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("조특법 소유주택 제외와의 겹침 — §99의2와 같은 문형(Q2)·§99의4는 성립, §98·§98의9는 불성립", () => {
  const SA_98_NOTICE = rentalResidenceSpecialActConfirmNotice("조특령 §98②·⑥");

  it("UX-A1 명부 행 §98의8(같은 문형) → 적용 + 13호 배제 (수정 전 199,997,600 · 다건은 조특법 제외 미반영 — 별건 Q4)", async () => {
    const s = await single(withRental(form([SPECIAL_ROW("unsold_98_8", "2015-06-01"), RENTAL_ROW])));
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.exclusions).toContain("long_term_rental_residence");
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A2 (음성 짝) §98의8 + 거주 0개월 → 적용 불가 · 고지 없음", async () => {
    const s = await single(withRental(form([SPECIAL_ROW("unsold_98_8", "2015-06-01"), RENTAL_ROW]), "0"));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A3 (양성 짝) 명부 행 §99의2 → 적용 + 13호 배제 (수정 전 199,997,600)", async () => {
    const s = await single(withRental(form([SPECIAL_ROW("unsold_99_2", "2013-06-01"), RENTAL_ROW])));
    expect(s).toMatchObject({ totalTax: RH_EXCLUDED, rentalApplied: true });
    expect(s.exclusions).toContain("long_term_rental_residence");
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A4 명부 없음 · 폼 전역 §98의8 · 세대 3채 → 종전대로 적용(판정 보류) 199,997,600 · 고지 없음", async () => {
    const f = withRental(
      form([], { householdHousingCount: "3", specialHouseExclusions: [special("unsold_98_8", "2015-06-01")] }),
    );
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: 199_997_600, rentalApplied: true });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A5 (양성 짝) 명부 없음 · 폼 전역 §99의2 → 종전대로 적용(판정 보류) 199,997,600 · 고지 없음", async () => {
    const f = withRental(
      form([], { householdHousingCount: "3", specialHouseExclusions: [special("unsold_99_2", "2013-06-01")] }),
    );
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: 199_997_600, rentalApplied: true });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A6 명부 행 §98(시행령 위임 — 문형 다름) → 불성립 + 확인 필요 (수정 전 199,997,600 · 단건 = 다건)", async () => {
    const f = withRental(form([SPECIAL_ROW("unsold_98", "1996-06-01"), RENTAL_ROW]));
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.confirm).toBe(SA_98_NOTICE);
    expect(await multi(f)).toBe(FULLY_TAXED);
  });

  it("UX-A7 (결론 무관) §98 + 거주 0개월 → 확인 필요 없음", async () => {
    const s = await single(withRental(form([SPECIAL_ROW("unsold_98", "1996-06-01"), RENTAL_ROW]), "0"));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.confirm).toBeUndefined();
  });

  it("UX-A8 명부 없음 · 폼 전역 §98 · 세대 3채 → 불성립 + 확인 필요 (수정 전 199,997,600)", async () => {
    const f = withRental(form([], { householdHousingCount: "3", specialHouseExclusions: [special("unsold_98", "1996-06-01")] }));
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.confirm).toBe(SA_98_NOTICE);
  });
});
