/**
 * 영 §167의10①15호·§167의3①13호 **단독** 축(E-14a) — 조특법 §98의9·§99의4(STEP 0.9 `hceApplied`)도 확인된
 * 조특법 제외로 대조한다 (route 경유 · Zod 포함 · 단건 = 다건).
 *
 * - 사용자 결정(2026-10-04): 「§98의9를 13호·15호 『단독』 축에서도 확인된 것으로」. §98의9① 「… 그 준공후미분양주택을
 *   해당 1세대의 소유주택이 아닌 것으로 보아 같은 법 제89조제1항제3호를 적용한다」는 §99의4①과 같은 문형이다.
 * - §99의4는 리드 판단으로 함께 연다 — §98의9를 여는 근거가 「§99의4와 같은 문형」이므로 §99의4가 미확인으로 남으면
 *   근거가 뒤집힌다(§99의4 해석: 서면-2016-법령해석재산-3686 「소유주택에서 제외되므로」 등). 직접 15호 해석은 둘 다 없다.
 *
 * 시료: 강남 · 2015 취득 · 2026-09-18 양도 20억 · 거주 0개월 · 조정대상지역. mock 아닌 fallback 세율.
 * 「수정 전」 = origin/master(9b2d832b) 엔진.
 *
 * | 축 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | §98의9 명부 행(공시 4억) 단독 — 15호 | 422,521,000 (2주택 중과) | 204,355,800 (15호 배제 · 단건 = 다건) |
 * | §98의9 + §99의2 명부 행 — 3주택 13호 | 497,046,000 (§99의2만 확인 → 2로 세어 15호·13호 미개방) | 204,355,800 |
 * | §99의4 농어촌(취득 당시 2.5억 · 양도 당시 공시 4억) 단독 — 15호 | 422,521,000 | 204,355,800 |
 * | §99의4 농어촌(양도 당시 공시 2억 — §167의3①1호 불산입) | 일반세율 | 같음(이 축과 무관) |
 * | §98의9 취득기간 밖(요건 미충족) | 1,141,178,500 (비과세 없음 · 2주택 중과) | 같음 |
 * | §99의2 명부 행 단독(special 축) | 204,355,800 | 같음 |
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
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const EUMSEONG = "4377037000"; // 충북 음성군 (수도권 밖 · 광역시 아님)

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

function form(houses: HouseEntry[]): Form {
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
  });
}

const UNSOLD = {
  type: "unsold_98_9",
  unsoldHouseAcquisitionDate: "",
  unsoldHouseAcquisitionPrice: "",
  unsoldHouseExclusiveArea: "",
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
} as unknown as RowCountExclusionReduction;
/** §98의9 명부 행 — 수도권 밖 · 취득가 5억 · 85㎡ 이하 (#1956 UX-D 시료와 같다) */
const UNSOLD_ROW = (acquisitionDate: string, officialPrice = "400000000"): HouseEntry => ({
  ...ROW,
  id: "h3",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate,
  officialPrice,
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  countExclusion: { kind: "reduction", reduction: UNSOLD },
});
/** §99의4 농어촌주택 명부 행 — 취득 당시 기준시가 2.5억(①1호나목 3억 이하) · 2020 취득(3년 보유) */
const RURAL_ROW = (officialPrice: string): HouseEntry => ({
  ...ROW,
  id: "h4",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2020-01-01",
  officialPrice,
  countExclusion: {
    kind: "reduction",
    reduction: {
      type: "new_99_4_rural",
      ruralHouseAcquisitionDate: "",
      ruralHouseStdPrice: "250000000",
      isRegisteredHanok: false,
      isAdjacentArea: false,
      meetsLocationRequirement: true,
    } as RowCountExclusionReduction,
  },
});
const SPECIAL_99_2_ROW: HouseEntry = {
  ...ROW,
  id: "h5",
  acquisitionDate: "2013-06-01",
  countExclusion: {
    kind: "special",
    special: {
      article: "unsold_99_2",
      houseAcquisitionDate: "2013-06-01",
      houseContractDate: "2013-06-01",
      isNationalHousing: false,
      requirementsConfirmed: true,
    },
  },
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

interface Single {
  status: number;
  totalTax?: number;
  surchargeType?: string;
  exclusions: string[];
  exclusionDetail: string;
}
async function single(f: Form): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data?: { result: Obj } };
  if (res.status !== 200) return { status: res.status, exclusions: [], exclusionDetail: JSON.stringify(json).slice(0, 400) };
  const r = json.data!.result;
  const mh = r.multiHouseSurchargeEvaluation as
    | { surchargeType?: string; exclusionReasons?: { type: string; detail?: string }[] }
    | undefined;
  return {
    status: 200,
    totalTax: r.totalTax as number,
    surchargeType: mh?.surchargeType,
    exclusions: (mh?.exclusionReasons ?? []).map((e) => e.type),
    exclusionDetail: (mh?.exclusionReasons ?? []).map((e) => e.detail ?? "").join(" | "),
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 조특법 제외 불성립 — 비과세 없이 2주택 중과 */
const TAXED_TWO = 1_141_178_500;
/** 15호·13호 조특법 경로로 중과 배제 — E-14a A-1(§99의2)과 같은 값 */
const DEEMED_EXCLUDED = 204_355_800;

describe("15호 단독 축 — §98의9(사용자 결정)", () => {
  it("HV-1 §98의9 명부 행(공시 4억) 단독 → 15호 배제 204,355,800 (수정 전 422,521,000 · 단건 = 다건)", async () => {
    const f = form([UNSOLD_ROW("2025-03-01")]);
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: DEEMED_EXCLUDED });
    expect(s.exclusions).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain("§98의9");
    expect(await multi(f)).toBe(DEEMED_EXCLUDED);
  });

  it("HV-2 3주택 — §98의9(공시 4억) + §99의2 명부 행 → 13호 배제 (단건 = 다건)", async () => {
    const f = form([UNSOLD_ROW("2025-03-01"), SPECIAL_99_2_ROW]);
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: DEEMED_EXCLUDED });
    expect(s.exclusions).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain("§98의9");
    expect(s.exclusionDetail).toContain("§99의2");
    expect(await multi(f)).toBe(DEEMED_EXCLUDED);
  });

  it("HV-1n (음성 짝) §98의9 취득기간(2024.1.10.~) 밖 → 요건 미충족 → 비과세 없이 2주택 중과 1,141,178,500 (종전과 같음)", async () => {
    const f = form([UNSOLD_ROW("2023-06-01")]);
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: TAXED_TWO, surchargeType: "multi_house_2" });
    expect(s.exclusions).not.toContain("special_act_house_exclusion");
    expect(await multi(f)).toBe(TAXED_TWO);
  });
});

describe("15호 단독 축 — §99의4(같은 문형 · 리드 판단)", () => {
  it("HV-3 §99의4 농어촌주택(취득 당시 2.5억 · 양도 당시 공시 4억 — 중과 주택 수 산입) 단독 → 15호 배제 (수정 전 422,521,000)", async () => {
    const f = form([RURAL_ROW("400000000")]);
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: DEEMED_EXCLUDED });
    expect(s.exclusions).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain("§99의4");
    expect(await multi(f)).toBe(DEEMED_EXCLUDED);
  });

  it("HV-3z §99의4 농어촌주택(양도 당시 공시 2억 — §167의3①1호 불산입) → 처음부터 중과 아님 (이 축과 무관 · 수정 전후 같음)", async () => {
    const s = await single(form([RURAL_ROW("200000000")]));
    expect(s).toMatchObject({ status: 200, surchargeType: "none" });
    expect(s.exclusions).not.toContain("special_act_house_exclusion");
  });
});

describe("회귀 없음 — special 축(§99의2)", () => {
  it("HV-4 §99의2 명부 행 단독 → 15호 배제 204,355,800 (종전과 같음 · 단건 = 다건)", async () => {
    const f = form([SPECIAL_99_2_ROW]);
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: DEEMED_EXCLUDED });
    expect(s.exclusions).toEqual(["special_act_house_exclusion"]);
    expect(await multi(f)).toBe(DEEMED_EXCLUDED);
  });
});
