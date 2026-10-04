/**
 * 명부 없음 + §155⑳ 거주주택 — 정밀 중과 판정이 돌지 않던 결함 (#1945 범위 밖 발견 · 계획서
 * docs/00-pm/one-house-exemption-fix.plan.md §9.8 「명부 없음 2채 중과」).
 *
 * 원인: STEP 0.5(`runMultiHouseSurchargeStep`)는 `houses[]`가 있을 때만 `determineMultiHouseSurcharge`를 불렀고,
 * 명부가 없으면 `resolveSurchargeApplication`이 원시 플래그(조정지역 · 세대 주택 수 ≥ 2)로 2주택 중과를 걸었다.
 * 세대 구성 판정(`resolveRentalResidenceComposition`)도 명부 없는 「그 밖의 주택 0채」를 판정 보류로 두어
 * 15호 ① 요소(`long_term_rental_residence`)가 열리지 않았다.
 *
 * 법문(MST 290841 실독): 영 §167의10① 본문 「국내에 주택을 2개(제1호 또는 제12호에 해당하는 주택은 주택의 수를
 * 계산할 때 산입하지 않는다) 소유하고 있는 1세대가 소유하는 주택으로서 다음 각 호의 어느 하나에 해당하지 않는
 * 주택」 · 15호 「제155조 또는 「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나
 * 1세대 1주택으로 보아 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」 · 10호 「1세대가
 * 제1호부터 제7호까지의 규정에 해당하는 주택을 제외하고 1개의 주택만을 소유하고 있는 경우 그 해당 주택」.
 *
 * 수정: 「세대 주택 수 = 거주주택 1 + 임대주택 카드 수」이면 그 밖의 주택이 없다는 사실이 확정 → `met`. 그때 §155⑳
 * 요건 판정까지 통과하면 입력된 사실로 행을 구성해 같은 정밀 판정을 돌린다(모르는 임대주택 소재지·기준시가는 산입 쪽).
 *
 * 강남 · 양도 2026-09-18 · 2015 취득 · 20억 · fallback 세율 (E-14gh·#1945와 같은 시료).
 *
 * | 시료 | 수정 전 | 수정 후 | 명부 입력 경로 |
 * |---|---:|---:|---:|
 * | N-1 명부 없음 · 거주 + 임대 1 | 167,360,600 | **102,086,600** (15호) | 102,086,600 |
 * | N-3 같은 세대 · 임대 카드 기타 요건 미확인(모름) | 1,141,178,500 | 1,141,178,500 + 「확인 필요」 | 1,141,178,500 |
 * | N-4 같은 세대 · 거주 0개월(사실 확정 — 불충족) | 1,141,178,500 | 1,141,178,500 | 1,141,178,500 |
 * | N-5 명부 없음 · 거주 + 임대 2 (3채) | 199,997,600 | **102,086,600** (13호 꼬리) | 102,086,600 |
 * | N-6 명부 없음 · 거주 + 임대 1 + 그 밖 1 (3채) | 1,327,903,500 + 확인 필요 | 불변 | — |
 * | N-7 비조정지역(부산) · 거주 + 임대 1 | 102,086,600 | 102,086,600 | 102,086,600 |
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
  RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE,
  resolveRentalResidenceComposition,
} from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import type { ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const BUSAN = "2635010500";
const NOT_APPLICABLE_LABEL = "장기임대주택 거주주택 비과세 특례 — 적용 불가";
const CONFIRM_LABEL = "장기임대주택 거주주택 비과세 특례 — 확인 필요";

/** 명부의 임대주택 행 — 등록 유형 매트릭스 없이 「장기임대」 표시만(E-14gh RENTAL_ROW와 같다) */
const RENTAL_ROW: HouseEntry = {
  id: "h4",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2016-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
};

const unit = (unitId: string) => ({
  ...makeDefaultRentalUnit(),
  unitId,
  businessRegistrationDate: "2019-03-01",
  rentalRegistrationDate: "2019-03-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "90",
  requirementsConfirmed: true,
});

/** §155⑳ 시나리오 A 거주주택(거주 48개월) — 임대주택 카드 `units`장 · 세대 주택 수 `count` */
function form(opts: { count: number; units?: number; houses?: HouseEntry[]; regionCode?: string; residence?: string }): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  const regionCode = opts.regionCode ?? GANGNAM;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: opts.residence ?? "48",
  };
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: Array.from({ length: opts.units ?? 1 }, (_, i) => unit(`u${i + 1}`)),
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(opts.count),
    isRegulatedArea: regionCode === GANGNAM,
    wasRegulatedAtAcquisition: false,
    houses: opts.houses ?? [],
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

interface Single {
  totalTax: number;
  rentalApplied: boolean;
  sentHouses: boolean;
  /** 정밀 판정 echo — 없으면 원시 플래그 경로 */
  evaluated: boolean;
  exclusions: string[];
  surchargeType?: string;
  notApplicable?: string;
  confirm?: string;
}
async function single(f: Form): Promise<Single> {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const steps = (r.steps ?? []) as { label: string; formula: string }[];
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons?: { type: string }[] } | undefined;
  return {
    totalTax: r.totalTax as number,
    rentalApplied: (r.rentalHousingExceptionDetail as { applied?: boolean } | undefined)?.applied === true,
    sentHouses: Array.isArray(body.houses),
    evaluated: mh !== undefined,
    exclusions: (mh?.exclusionReasons ?? []).map((e) => e.type),
    surchargeType: r.surchargeType as string | undefined,
    notApplicable: steps.find((s) => s.label === NOT_APPLICABLE_LABEL)?.formula,
    confirm: steps.find((s) => s.label === CONFIRM_LABEL)?.formula,
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

const EXCLUDED_15 = 102_086_600;
const TWO_HOUSE_SURCHARGED = 1_141_178_500;
const FULLY_TAXED = 1_327_903_500;

describe("명부 없음 · §155⑳ 거주주택 — 사실이 입력돼 있으면 명부 경로와 같은 정밀 중과 판정", () => {
  it("N-1 거주 + 임대 1 (세대 2채) → 15호 배제 102,086,600 (수정 전 167,360,600 — 원시 플래그 2주택 중과) · 단건 = 다건", async () => {
    const f = form({ count: 2 });
    const s = await single(f);
    expect(s.sentHouses).toBe(false); // 명부 없음 — ④는 houses를 싣지 않는다(엔진이 행을 구성한다)
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, rentalApplied: true, evaluated: true });
    expect(s.exclusions).toEqual(["long_term_rental_residence"]);
    expect(s.confirm).toBeUndefined();
    expect(await multi(f)).toBe(EXCLUDED_15);
  });

  it("N-2 (대조 · 회귀) 같은 세대를 명부에 입력 → 같은 판정·같은 세액", async () => {
    const f = form({ count: 2, houses: [RENTAL_ROW] });
    const s = await single(f);
    expect(s.sentHouses).toBe(true);
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, rentalApplied: true, evaluated: true });
    expect(s.exclusions).toEqual(["long_term_rental_residence"]);
    expect(await multi(f)).toBe(EXCLUDED_15);
  });

  it("N-3 (모름) 임대주택 카드 기타 요건 미확인 → §155⑳ 불성립 · 중과 유지 + 「확인 필요」 사유 · 명부 경로와 같은 세액", async () => {
    const unconfirmed = (f: Form) => {
      f.assets[0].rentalHousingException.rentalUnits[0].requirementsConfirmed = false;
      return f;
    };
    const s = await single(unconfirmed(form({ count: 2 })));
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, rentalApplied: false, evaluated: false });
    expect(s.surchargeType).toBe("multi_house_2");
    expect(s.notApplicable).toMatch(/기타 요건.*확인 필요/);
    expect((await single(unconfirmed(form({ count: 2, houses: [RENTAL_ROW] })))).totalTax).toBe(TWO_HOUSE_SURCHARGED);
  });

  it("N-4 (사실 확정 · 불충족) 거주 0개월 → 중과 유지 · 명부 경로와 같은 세액", async () => {
    const s = await single(form({ count: 2, residence: "0" }));
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, rentalApplied: false, evaluated: false });
    expect(s.confirm).toBeUndefined();
    expect((await single(form({ count: 2, houses: [RENTAL_ROW], residence: "0" }))).totalTax).toBe(TWO_HOUSE_SURCHARGED);
  });

  it("N-5 거주 + 임대 2 (세대 3채) → 102,086,600 (수정 전 199,997,600 — 원시 3주택 중과) = 명부 경로", async () => {
    const s = await single(form({ count: 3, units: 2 }));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, rentalApplied: true, evaluated: true });
    expect(s.exclusions).toEqual(["long_term_rental_residence"]);
    const roster = await single(form({ count: 3, units: 2, houses: [RENTAL_ROW, { ...RENTAL_ROW, id: "h5" }] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, exclusions: ["long_term_rental_residence"] });
  });

  it("N-6 (회귀) 거주 + 임대 1 + 그 밖 1 (세대 3채) → #1945 그대로 불성립 1,327,903,500 + 확인 필요 · 정밀 판정 없음", async () => {
    const s = await single(form({ count: 3 }));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false, evaluated: false });
    expect(s.confirm).toBe(RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE);
  });

  it("N-7 (무관) 비조정지역(부산) → 중과 없음 102,086,600 · 명부 경로와 같다", async () => {
    const s = await single(form({ count: 2, regionCode: BUSAN }));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, rentalApplied: true });
    expect(s.exclusions).toEqual([]);
    expect(
      (await single(form({ count: 2, regionCode: BUSAN, houses: [{ ...RENTAL_ROW, regionCode: BUSAN }] }))).totalTax,
    ).toBe(EXCLUDED_15);
  });
});

describe("세대 구성 판정(명부 없음) — 「그 밖의 주택」 수가 확정될 때만 met", () => {
  const compose = (householdHousingCount: number, units: number) =>
    resolveRentalResidenceComposition(
      baseTransferInput({
        householdHousingCount,
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: Array.from({ length: units }, () => ({})),
        } as unknown as TransferTaxInput["rentalHousingException"],
      }),
      {} as ParsedRates,
    ).status;

  it("N-8 주택 수 = 거주 1 + 임대 카드 수 → met · 주택 수가 임대 카드보다 적으면(입력 모순) 판정 보류 · 1채 남으면 exceeded", () => {
    expect(compose(2, 1)).toBe("met");
    expect(compose(3, 2)).toBe("met");
    expect(compose(1, 1)).toBe("undetermined");
    expect(compose(3, 1)).toBe("exceeded");
  });
});
