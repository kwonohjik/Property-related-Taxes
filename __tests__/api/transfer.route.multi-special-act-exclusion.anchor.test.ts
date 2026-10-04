/**
 * 다건(연간 합산) route — 조특법 소유주택 제외(보유 감면주택 · 명부 행 ⑥ special)가 **단건과 같은 세액**을 낸다.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.8 「다건 조특법 소유주택 제외(Q4)」.
 *
 * 원인(층): ⑬ `multi-transfer-tax-api.ts` `buildPropertyPayload`가 `specialHouseExclusions`를 **싣지 않았다**
 * (단건 ⑬ `transfer-tax-api.ts`는 `specialHouseExclusionsWithRows(form)`로 싣는다). ⑫ 다건 스키마는 top-level 키만
 * 받고, ⑭ 다건 route는 그 top-level 값을 전 자산에 주입했다 — ⑬이 보내지 않으니 엔진에는 늘 빈 배열이 닿았다.
 * UI는 ⑧(`validateMultiSupportedMode`)이 「단건 계산기에서만」으로 막아 침묵 오산은 아니었지만, route 직접 호출은
 * 200으로 다른 세액을 냈다.
 *
 * 시료: 강남 · 2015 취득 · 2026-09-18 양도 20억 · fallback 세율(mock 아닌 로컬 표). 「수정 전」 = origin/master 5a208cf9.
 *
 * | # | 축 | 단건 | 다건 수정 전 | 다건 수정 후 |
 * |---|---|---|---|---|
 * | MS-1 | §99의2 명부 행 + §155⑳ 거주주택 특례 | 102,086,600 | 1,327,903,500 | 102,086,600 |
 * | MS-2 | §98의8 명부 행 + §155⑳ | 102,086,600 | 1,327,903,500 | 102,086,600 |
 * | MS-3 | §97 임대주택 명부 행(#1924 · 15호) | 204,355,800 | 1,141,178,500 | 204,355,800 |
 * | MS-4 | §97 임대 2채(13호) | 204,355,800 | 1,327,903,500 | 204,355,800 |
 * | MS-5 | §99의2 명부 행 단독(E-14a · §89①3호 의제 + 15호) | 204,355,800 | 1,141,178,500 | 204,355,800 |
 * | MS-6 | §155③ 공동상속 소수지분(#1949 — 회귀) | 102,086,600 | 102,086,600 | 102,086,600 |
 * | MS-7 | §98 명부 행(불성립 + 확인 필요) | 1,327,903,500 + 고지 | 1,327,903,500 · 고지 없음 | 1,327,903,500 + 고지 |
 * | MS-8 | 조특법 제외 없는 일반 행(회귀) | 1,327,903,500 | 같음 | 같음 |
 * | MS-9 | 다건에 토지가 섞임 — 토지 자산은 불변 · 주택 자산만 제외 반영 | — | — | — |
 * | MS-10 | §99의4 명부 행(reduction 종류 — 종전부터 건별 전송, 회귀) | 단건 = 다건 | 같음 | 같음 |
 * | MS-11 | API 직접 호출 — top-level `specialHouseExclusions`(종전 계약) 그대로 동작 | — | — | — |
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
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { rentalResidenceSpecialActConfirmNotice } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
interface Step {
  label: string;
  formula: string;
}

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const CONFIRM_LABEL = "장기임대주택 거주주택 비과세 특례 — 확인 필요";
const SPECIAL_STEP = "보유 감면주택 주택수 제외 (§89①3호 의제)";

const FULLY_TAXED = 1_327_903_500;
const RH_EXCLUDED = 102_086_600;
const EXCLUDED_15HO = 204_355_800;

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

/** §155⑳ 거주주택 특례 — 가목 장기일반민간임대(2019.3.1. 등록) · 거주 48개월 (#1949 시료) */
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

/** 토지 자산(비사업용 아님) — 다건에 섞어도 주택 제외가 새지 않는지 본다. */
function landForm(): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    acquisitionDate: "2010-01-01",
    fixedAcquisitionPrice: "100,000,000",
  };
  return Object.assign(f, {
    transferDate: "2026-03-02",
    contractTotalPrice: "300,000,000",
    householdHousingCount: "0",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
  });
}

type Special = SpecialHouseExclusionFormItem;
const special = (article: Special["article"], date: string, over: Partial<Special> = {}): Special => ({
  article,
  houseAcquisitionDate: date,
  houseContractDate: date,
  isNationalHousing: false,
  requirementsConfirmed: true,
  ...over,
});
const SPECIAL_ROW = (article: Special["article"], date: string, id = "h3", over: Partial<Special> = {}): HouseEntry => ({
  ...ROW,
  id,
  acquisitionDate: date,
  countExclusion: { kind: "special", special: special(article, date, over) },
});
/** §97 임대주택 행 — 임대개시 1999-03-01 (#1924 시료) */
const RENTAL_97_ROW = (id: string): HouseEntry =>
  SPECIAL_ROW("rental_97", "1998-01-01", id, { houseAcquisitionDate: "", houseContractDate: "", houseRentalStartDate: "1999-03-01" });
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

async function single(f: Form): Promise<{ totalTax: number; labels: string[]; confirm?: string }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const steps = (json.data.result.steps ?? []) as Step[];
  return {
    totalTax: json.data.result.totalTax as number,
    labels: steps.map((s) => s.label),
    confirm: steps.find((s) => s.label === CONFIRM_LABEL)?.formula,
  };
}

interface MultiOut {
  totalTax: number;
  props: { labels: string[]; confirm?: string; determinedTax: number; income: number }[];
}
const multiForm = (): MultiTransferFormData =>
  ({ taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" }) as MultiTransferFormData;
const multiBody = (forms: Form[]) =>
  bodyOf(() =>
    callMultiTransferTaxAPI(
      multiForm(),
      forms.map((f, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `p${i + 1}`, form: f, completionPercent: 100 })),
    ),
  );
async function multiOf(body: Obj): Promise<MultiOut> {
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as {
    data: { totalTax: number; properties: { steps: Step[]; determinedTax: number; income: number }[] };
  };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return {
    totalTax: json.data.totalTax,
    props: json.data.properties.map((p) => ({
      labels: p.steps.map((s) => s.label),
      confirm: p.steps.find((s) => s.label === CONFIRM_LABEL)?.formula,
      determinedTax: p.determinedTax,
      income: p.income,
    })),
  };
}
const multi = async (...forms: Form[]) => multiOf(await multiBody(forms));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

// ─────────────────────────────────────────────────────────────────────────────
describe("MS 단건 = 다건 — 조특법 소유주택 제외(명부 행 ⑥ special)", () => {
  it("MS-1 §99의2 명부 행 + 거주주택 특례 → 102,086,600 (다건 수정 전 1,327,903,500)", async () => {
    const f = withRental(form([SPECIAL_ROW("unsold_99_2", "2013-06-01"), RENTAL_ROW]));
    const s = await single(f);
    const m = await multi(f);
    expect(s.totalTax).toBe(RH_EXCLUDED);
    expect(m.totalTax).toBe(s.totalTax);
    expect(m.props[0].labels).toContain(SPECIAL_STEP);
  });

  it("MS-2 §98의8 명부 행 + 거주주택 특례 → 102,086,600 (#1949 UX-A1 「단건 = 다건」 복원)", async () => {
    const f = withRental(form([SPECIAL_ROW("unsold_98_8", "2015-06-01"), RENTAL_ROW]));
    const s = await single(f);
    expect(s.totalTax).toBe(RH_EXCLUDED);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });

  it("MS-3 §97 임대주택 명부 행 → 15호 배제 204,355,800 (다건 수정 전 1,141,178,500)", async () => {
    const f = form([RENTAL_97_ROW("r")]);
    const s = await single(f);
    expect(s.totalTax).toBe(EXCLUDED_15HO);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });

  it("MS-4 §97 임대 2채 → 13호 배제 204,355,800", async () => {
    const f = form([RENTAL_97_ROW("r1"), RENTAL_97_ROW("r2")]);
    const s = await single(f);
    expect(s.totalTax).toBe(EXCLUDED_15HO);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });

  it("MS-5 §99의2 명부 행 단독 → §89①3호 의제 + 15호 배제 204,355,800", async () => {
    const f = form([SPECIAL_ROW("unsold_99_2", "2013-06-01")]);
    const s = await single(f);
    expect(s.totalTax).toBe(EXCLUDED_15HO);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });

  it("MS-6 (회귀) §155③ 공동상속 소수지분 + 거주주택 특례 → 102,086,600", async () => {
    const f = withRental(form([CO_INHERITED, RENTAL_ROW]));
    const s = await single(f);
    expect(s.totalTax).toBe(RH_EXCLUDED);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });

  it("MS-7 §98 명부 행 → 불성립 1,327,903,500 + 확인 필요 고지가 다건 자산 단계에도 실린다", async () => {
    const f = withRental(form([SPECIAL_ROW("unsold_98", "1996-06-01"), RENTAL_ROW]));
    const s = await single(f);
    const m = await multi(f);
    expect(s.totalTax).toBe(FULLY_TAXED);
    expect(s.confirm).toBe(rentalResidenceSpecialActConfirmNotice("조특령 §98②·⑥"));
    expect(m.totalTax).toBe(s.totalTax);
    expect(m.props[0].confirm).toBe(s.confirm);
  });

  it("MS-8 (회귀) 조특법 제외 없는 일반 행 → 1,327,903,500 · 감면주택 단계 없음", async () => {
    const f = withRental(form([{ ...ROW, id: "h3" }, RENTAL_ROW]));
    const s = await single(f);
    const m = await multi(f);
    expect(s.totalTax).toBe(FULLY_TAXED);
    expect(m.totalTax).toBe(s.totalTax);
    expect(m.props[0].labels).not.toContain(SPECIAL_STEP);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MS-9 다건에 토지가 섞인 경우 — 제외는 그 주택 자산에만 닿는다", () => {
  it("토지 자산의 소득·세액은 주택 자산의 감면주택 행 유무와 무관하다", async () => {
    const withRow = await multi(form([SPECIAL_ROW("unsold_99_2", "2013-06-01")]), landForm());
    const withoutRow = await multi(form([{ ...ROW, id: "h3" }]), landForm());
    // 토지(2번째 자산) — 같은 값
    expect(withRow.props[1].income).toBe(withoutRow.props[1].income);
    expect(withRow.props[1].labels).not.toContain(SPECIAL_STEP);
    // 주택(1번째 자산) — 감면주택 행이 있을 때만 의제 단계가 서고 소득이 줄어든다(고가주택 12억 초과분만 과세)
    expect(withRow.props[0].labels).toContain(SPECIAL_STEP);
    expect(withoutRow.props[0].labels).not.toContain(SPECIAL_STEP);
    expect(withRow.props[0].income).toBeLessThan(withoutRow.props[0].income);
  });

  it("토지 자산 본문에는 명부 행 선언이 실리지 않는다(게이트 = 단건과 같은 술어)", async () => {
    const land = landForm();
    land.houses = [SPECIAL_ROW("unsold_99_2", "2013-06-01")];
    const body = await multiBody([land]);
    const props = body.properties as Obj[];
    expect(props[0].specialHouseExclusions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MS-10 (회귀) §99의4 명부 행(reduction 종류) — 종전부터 건별 전송", () => {
  const RURAL: RowCountExclusionReduction = {
    type: "new_99_4_rural",
    ruralHouseAcquisitionDate: "",
    ruralHouseStdPrice: "150000000",
    isRegisteredHanok: false,
    isAdjacentArea: false,
    meetsLocationRequirement: true,
  };
  it("단건 = 다건", async () => {
    const f = form([
      { ...ROW, id: "h3", region: "non_capital", regionCode: undefined, acquisitionDate: "2021-01-01", officialPrice: "150000000", countExclusion: { kind: "reduction", reduction: RURAL } },
    ]);
    const s = await single(f);
    expect((await multi(f)).totalTax).toBe(s.totalTax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MS-11 API 직접 호출 — top-level `specialHouseExclusions`(종전 계약)", () => {
  it("건별 선언이 빈 배열이면(④가 늘 싣는 모양) top-level이 전 자산에 주입된다(MS-5와 같은 값 · R97-10과 같은 계약)", async () => {
    const f = form([{ ...ROW, id: "h3", acquisitionDate: "2013-06-01" }]);
    const body = await multiBody([f]);
    expect((body.properties as Obj[])[0].specialHouseExclusions).toEqual([]);
    body.specialHouseExclusions = [
      { article: "unsold_99_2", houseId: "h3", houseAcquisitionDate: "2013-06-01", houseContractDate: "2013-06-01", isNationalHousing: false, requirementsConfirmed: true },
    ];
    expect((await multiOf(body)).totalTax).toBe(EXCLUDED_15HO);
  });

  it("건별 키 없이 top-level만 보내도 전 자산에 주입된다(MS-5와 같은 값)", async () => {
    const f = form([{ ...ROW, id: "h3", acquisitionDate: "2013-06-01" }]);
    const body = await multiBody([f]);
    for (const p of body.properties as Obj[]) delete p.specialHouseExclusions;
    body.specialHouseExclusions = [
      { article: "unsold_99_2", houseId: "h3", houseAcquisitionDate: "2013-06-01", houseContractDate: "2013-06-01", isNationalHousing: false, requirementsConfirmed: true },
    ];
    expect((await multiOf(body)).totalTax).toBe(EXCLUDED_15HO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MS-12 ⑧ — 다건이 더는 감면주택을 막지 않는다(⑬·⑭가 단건과 같은 leaf로 싣는다)", () => {
  it("명부 행 special → 차단 없음", () => {
    expect(validateMultiSupportedMode(form([SPECIAL_ROW("unsold_99_2", "2013-06-01")]))).toBeNull();
  });
});
