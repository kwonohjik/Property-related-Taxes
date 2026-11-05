/**
 * NH-12·NH-13(한 주택을 주택 수 제외에 두 번 쓰는 결함) route anchor 공용 harness.
 *
 * 계산기(`callTransferTaxAPI` → `/api/calc/transfer`)·다건(`/multi`)·판정 메뉴(`/api/calc/one-house-exemption`) 세 경로에
 * 같은 사실(명부 행)을 건다. 호출하는 테스트 파일이 `@/lib/db/tax-rates`·`@/lib/api/rate-limit`을 vi.mock 해야 한다
 * (vi.mock 은 파일 단위 hoist).
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE_POST } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import { resolveExemptionHousingCount } from "@/lib/calc/exemption-house-count";

// route 응답·body 는 형상이 자유로운 JSON 이라 any 로 둔다(테스트 harness).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Obj = Record<string, any>;

export const TRANSFER_DATE = "2024-06-01";
export const BUSAN = "2635010500";
export const GANGNAM = "1168010100";
export const RURAL_CODE = "4783025000";

const RURAL_994: RowCountExclusionReduction = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "100000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
} as RowCountExclusionReduction;

export const base = (id: string, acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "non_capital",
    regionCode: BUSAN,
    acquisitionDate,
    officialPrice: "200000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionOrigin: "general",
    ...over,
  }) as HouseEntry;

/** §155⑦1호 상속 농어촌주택 사실(행) */
export const rural7 = {
  region: "non_capital",
  regionCode: RURAL_CODE,
  officialPrice: "100000000",
  oneHouseRuralHouse: true,
  ruralHouseKind: "inherited",
  ruralOutsideCapitalEupMyeon: true,
  ruralDecedentResidenceYears: "10",
  decedentSameHouseholdAtInheritance: false,
  decedentHouseholdSeparate: true,
} as Partial<HouseEntry>;
export const rural7b = { ...rural7, ruralDecedentResidenceYears: "12" } as Partial<HouseEntry>;
/** §99의4 행 선언 */
export const ce994 = (r: Partial<RowCountExclusionReduction> = {}) =>
  ({ region: "non_capital", regionCode: RURAL_CODE, officialPrice: "100000000", countExclusion: { kind: "reduction", reduction: { ...RURAL_994, ...r } } }) as Partial<HouseEntry>;
/** §155② 상속주택 사실(행) */
export const inherited = (date: string) =>
  ({ isInherited: true, inheritedDate: date, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }) as Partial<HouseEntry>;
export const ruralLoc = { region: "non_capital", regionCode: RURAL_CODE, officialPrice: "100000000" } as Partial<HouseEntry>;
/** §155⑥1호 국가유산주택 행 표시 */
export const heritage6 = { oneHouseCulturalHeritage: true } as Partial<HouseEntry>;
/** §155⑧ 수도권 밖 부득이 주택 행 표시(양도일 현재 미해소) */
export const unavoid8 = { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalUnresolved: true } as Partial<HouseEntry>;

export function calcForm(houses: HouseEntry[], over: Record<string, unknown> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2012-11-21",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: BUSAN,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "48",
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "800,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

export function jForm(houses: HouseEntry[], over: Record<string, unknown> = {}): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2012-11-21", regionCode: BUSAN } as AssetForm,
    ],
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    newHouseRegulatedAtAcquisition: "no",
    prevHouseRegulatedAtNewAcquisition: "no",
    houses,
    presaleRights: [],
    ...over,
  } as unknown as OneHouseJudgmentFormData;
}

/** 폼 → 계산기 body 를 캡처한다(fetch stub). */
export async function captureCalcBody(f: TransferFormData): Promise<Obj> {
  let body: Obj = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  return body;
}

export async function postCalcBody(body: Obj) {
  const res = await CALC_POST(
    new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as Obj;
  const r = json?.data?.result ?? {};
  return { status: res.status, err: res.status !== 200 ? JSON.stringify(json).slice(0, 600) : undefined, json, r };
}

export async function runCalc(f: TransferFormData) {
  const body = await captureCalcBody(f);
  const { status, err, r } = await postCalcBody(body);
  return {
    status,
    err,
    body,
    result: {
      isExempt: r.isExempt as boolean | undefined,
      isPartialExempt: r.isPartialExempt as boolean | undefined,
      exemptReason: r.exemptReason as string | undefined,
      determinedTax: r.determinedTax as number | undefined,
      totalTax: r.totalTax as number | undefined,
      warnings: (r.warnings ?? []) as string[],
      steps: (r.steps ?? []) as Obj[],
      raw: r,
    },
  };
}

export async function runJudge(f: OneHouseJudgmentFormData) {
  const res = await JUDGE_POST(
    new NextRequest("http://l/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  const json = (await res.json()) as Obj;
  const d = json?.data ?? {};
  return {
    status: res.status,
    err: res.status !== 200 ? JSON.stringify(json).slice(0, 600) : undefined,
    isExempt: d.judgment?.isExempt as boolean | undefined,
    isPartialExempt: d.judgment?.isPartialExempt as boolean | undefined,
    exemptReason: d.judgment?.exemptReason as string | undefined,
    counted: d.houseCount?.countedForExemption as number | undefined,
    total: d.houseCount?.total as number | undefined,
    excluded: (d.houseCount?.excluded ?? []).map((e: Obj) => `${e.houseId}:${e.label}`) as string[],
    raw: d,
  };
}

export async function runMulti(f: TransferFormData) {
  const mf = { taxYear: Number(f.transferDate.slice(0, 4)), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  let body: Obj = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return { ok: true, json: async () => ({ data: {} }) } as Response; }));
  await callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await MULTI_POST(new NextRequest("http://l/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as Obj;
  return { status: res.status, err: res.status !== 200 ? JSON.stringify(json).slice(0, 400) : undefined, totalTax: json?.data?.totalTax as number | undefined };
}

export const mirrorCount = (f: TransferFormData) => resolveExemptionHousingCount(f as never);

/** 세율 fallback 을 양도일 시점으로 맞춘다. */
export function setRates(rateDate: string) {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(rateDate)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
}

// ── §155⑳ 거주주택·조정대상지역·고가주택 시료 공통 ──
export const withRental = (f: TransferFormData): TransferFormData => {
  const a = f.assets[0] as Obj;
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = {
    ...(a.rentalHousingException as Obj),
    applyException: true,
    scenario: "A",
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }],
  };
  return f;
};
export const RENTAL_ROW = { id: "h4", region: "capital", regionCode: GANGNAM, acquisitionDate: "2016-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: true, isApartment: false, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general" } as HouseEntry;
export const OTHER_OLD = { ...RENTAL_ROW, id: "h6", acquisitionDate: "2012-01-01", isLongTermRental: false, isApartment: true } as HouseEntry;
export const RH_OVER = { transferDate: "2026-09-18", contractTotalPrice: "2,000,000,000", isRegulatedArea: true, wasRegulatedAtAcquisition: false };
export const rhAsset = (f: TransferFormData) => { f.assets[0] = { ...f.assets[0], acquisitionDate: "2015-01-01", regionCode: GANGNAM }; return withRental(f); };
export const HV = { transferDate: "2026-06-01", contractTotalPrice: "1,500,000,000", isRegulatedArea: true, wasRegulatedAtAcquisition: true };
export const REG = { transferDate: "2026-09-18", contractTotalPrice: "1,000,000,000", isRegulatedArea: true, wasRegulatedAtAcquisition: false };
export const regA = (f: TransferFormData) => { f.assets[0] = { ...f.assets[0], acquisitionDate: "2015-01-01", regionCode: GANGNAM }; return f; };
export const R35 = { officialPrice: "350000000" } as Partial<HouseEntry>;
export const XG = (id: string, d: string) => ({ ...base(id, d), region: "capital", regionCode: GANGNAM, officialPrice: "500000000", isApartment: true }) as HouseEntry;

export type Scen = {
  houses: HouseEntry[];
  over?: Record<string, unknown>;
  rateDate?: string;
  multi?: boolean;
  /** §155⑳ 거주주택 시료(판정 메뉴 미실행) */
  rental?: boolean;
  /** 조정대상지역 시료(판정 메뉴 미실행) */
  reg?: boolean;
  judge?: boolean;
};

/** 시료를 세 경로에 걸어 결과를 돌려준다. */
export async function runScen(s: Scen) {
  setRates(s.rateDate ?? TRANSFER_DATE);
  let cf = calcForm(s.houses, s.over ?? {});
  if (s.rental) cf = rhAsset(cf);
  if (s.reg) cf = regA(cf);
  const out: { calc: Awaited<ReturnType<typeof runCalc>>; mirror: number; multi?: Awaited<ReturnType<typeof runMulti>>; judge?: Awaited<ReturnType<typeof runJudge>> } = {
    calc: await runCalc(cf),
    mirror: mirrorCount(cf),
  };
  if (s.multi) out.multi = await runMulti(cf);
  if (s.judge ?? (!s.rental && !s.reg)) out.judge = await runJudge(jForm(s.houses, s.over ?? {}));
  return out;
}
