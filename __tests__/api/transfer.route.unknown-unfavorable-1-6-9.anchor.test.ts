/**
 * 「모름은 납세자에게 불리하게」(사용자 결정 2026-10-04) — #1939 후속 분기 1·6·9.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.8 「모름 → 불리 적용 (분기 1·6·9)」.
 *
 * 원칙: 사실이 「모름」이면 그 사실이 있어야 성립하는 유리한 요건은 불성립으로 계산하고, 그 사실이
 * **결론을 가를 때만** 「확인 필요」를 고지한다. 빈 값이 설계상 다른 뜻(「진행 중」 등)과 겹치면 입력을 갈라
 * 「모름」이 들어올 수 없게 한다.
 *
 * | 분기 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 1 §155⑳ 명부 없음 · 세대 3채(거주 + 임대 1 + 그 밖 1) | 199,997,600 (특례 적용) | 1,327,903,500 + 확인 필요 |
 * | 1 명부 없음 · 세대 4채(그 밖 2 — 3중첩) | 199,997,600 | 1,327,903,500 (고지 없음 — 결론 무관) |
 * | 1 명부 없음 · 세대 2채(그 밖 0) | 167,360,600 | 167,360,600 (사실이 확정 — 불변) → #1947 102,086,600 (15호 정밀 판정) |
 * | 6 §155② 상속개시일 없음(엔진 직접) | 제외 유지(1주택 · 비과세) | 제외 배제 + 「상속개시일 미확인」 단계 |
 * | 9 §167의10①7호 확정판결일 미입력(진행 중 뜻) | 141,966,000 (배제) | ⑧·⑫ 차단 — 「진행 중」 명시 선택 시 141,966,000 |
 * | 9 §167의10①3호 해소일 미입력(미해소 뜻) | 141,966,000 (배제) | ⑧·⑫ 차단 — 「미해소」 명시 선택 시 141,966,000 |
 * | 9 엔진 직접 · 날짜·선택 모두 없음 | 141,966,000 | 299,816,000 (불성립) |
 *
 * 법문(MST 290841 실독): §155⑳ 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대」 ·
 * §167의10①3호 「…취득 후 1년 이상 거주하고 해당 사유가 해소된 날부터 3년이 경과하지 아니한 경우에 한정한다」 ·
 * 7호 「주택의 소유권에 관한 소송이 진행 중이거나 해당 소송결과로 취득한 주택(소송으로 인한 확정판결일부터 3년이
 * 경과하지 아니한 경우에 한정한다)」 · §155② 괄호 「상속개시 당시 보유한 주택」.
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 as validateJudgmentStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Exclusion = NonNullable<Form["sellingHouseExclusion"]>;
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

// ─────────────────────────────────────────────────────────────────────────────
describe("분기 1 — §155⑳ 명부 없음: 「그 밖의 주택」 특례 해당 여부를 모르면 불성립", () => {
  it("U1-a 세대 3채(거주 + 임대 1 + 그 밖 1) → 특례 불성립 + 확인 필요 (수정 전 199,997,600 · 단건 = 다건)", async () => {
    const f = withRental(form([], { householdHousingCount: "3" }));
    const s = await single(f);
    expect(s).toMatchObject({ status: 200, totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.stepLabels).toContain(NOT_APPLICABLE_LABEL);
    expect(s.confirm).toBe(RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE);
    expect(await multi(f)).toBe(FULLY_TAXED);
  });

  it("U1-b 세대 4채(그 밖 2 — 명부가 있어도 3중첩) → 불성립 · 확인 필요 없음(결론 무관)", async () => {
    const s = await single(withRental(form([], { householdHousingCount: "4" })));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.stepLabels).toContain(NOT_APPLICABLE_LABEL);
    expect(s.confirm).toBeUndefined();
  });

  it("U1-c (음성 짝) 세대 2채(거주 + 임대 1 — 그 밖 0) → 특례 적용 · 고지 없음 (세액 102,086,600은 #1947 — 명부 없음 15호 정밀 판정)", async () => {
    const s = await single(withRental(form([], { householdHousingCount: "2" })));
    expect(s).toMatchObject({ totalTax: 102_086_600, rentalApplied: true });
    expect(s.stepLabels).not.toContain(NOT_APPLICABLE_LABEL);
    expect(s.confirm).toBeUndefined();
  });

  it("U1-d (입력 경로) 그 밖의 주택을 명부에 §155② 상속주택으로 입력 → 특례 적용 · 고지 없음", async () => {
    const inherited: HouseEntry = {
      ...ROW,
      id: "h3",
      isInherited: true,
      acquisitionDate: "2019-06-01",
      inheritedDate: "2019-06-01",
    };
    const s = await single(withRental(form([inherited], { householdHousingCount: "3" })));
    expect(s).toMatchObject({ status: 200, rentalApplied: true });
    expect(s.confirm).toBeUndefined();
  });

  it("U1-e 나머지 요건 불충족(거주 0개월)이면 그 사실이 결론을 가르지 않는다 → 적용 불가만 · 확인 필요 없음", async () => {
    const s = await single(withRental(form([], { householdHousingCount: "3" }), "0"));
    expect(s).toMatchObject({ totalTax: FULLY_TAXED, rentalApplied: false });
    expect(s.stepLabels).toContain(NOT_APPLICABLE_LABEL);
    expect(s.confirm).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("분기 6 — §155② 상속개시일 모름: route는 ⑫가 막고, 엔진은 제외를 배제", () => {
  const inheritedRow = (inheritedDate?: Date) =>
    ({
      id: "inh",
      acquisitionDate: new Date("2019-06-01"),
      officialPrice: 300_000_000,
      region: "capital",
      isInherited: true,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...(inheritedDate ? { inheritedDate } : {}),
    }) as NonNullable<TransferTaxInput["houses"]>[number];
  const engine = (acquisitionDate: string, inheritedDate?: Date) =>
    baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date(acquisitionDate),
      transferDate: new Date("2026-08-01"),
      householdHousingCount: 2,
      residencePeriodMonths: 48,
      houses: [
        {
          id: "selling",
          acquisitionDate: new Date(acquisitionDate),
          officialPrice: 500_000_000,
          region: "capital",
          isInherited: false,
          isLongTermRental: false,
          isApartment: true,
          isOfficetel: false,
          isUnsoldHousing: false,
        },
        inheritedRow(inheritedDate),
      ] as TransferTaxInput["houses"],
      sellingHouseId: "selling",
    });
  const calc = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const labels = (i: TransferTaxInput) => calc(i).steps.map((s) => s.label);
  const UNKNOWN_STEP = "상속개시일 미확인 상속주택 — 주택수 제외 배제 (§155② 괄호)";
  const SOLE_STEP = "상속주택 주택수 제외 (§155② 일반주택 양도)";

  it("U6-a route — 명부 상속주택에 상속개시일이 없으면 ⑫ 400 (분기 도달 불가의 근거)", async () => {
    const inh: HouseEntry = { ...ROW, id: "h3", isInherited: true, acquisitionDate: "2019-06-01" };
    const s = await single(form([inh], {}, "900,000,000"));
    expect(s.status).toBe(400);
    expect(Object.keys(s.fieldErrors ?? {})).toContain("houses.1.inheritedDate");
  });

  it("U6-b 엔진 직접 — 2013.2.15. 이후 취득 · 상속개시일 없음 → 제외 배제(수정 전: 제외 → 비과세)", () => {
    const i = engine("2015-01-01");
    expect(calc(i).isExempt).toBe(false);
    expect(labels(i)).toContain(UNKNOWN_STEP);
    expect(labels(i)).not.toContain(SOLE_STEP);
  });

  it("U6-c (양성 짝) 상속개시일이 양도 주택 취득 뒤(상속개시 당시 보유) → 제외 → 비과세", () => {
    const i = engine("2015-01-01", new Date("2019-06-01"));
    expect(calc(i).isExempt).toBe(true);
    expect(labels(i)).toContain(SOLE_STEP);
    expect(labels(i)).not.toContain(UNKNOWN_STEP);
  });

  it("U6-d (결론 무관) 2013.2.15. 전 취득이면 괄호 한정이 없어 상속개시일 없이도 제외 · 미확인 단계 없음", () => {
    const i = engine("2012-01-01");
    expect(calc(i).isExempt).toBe(true);
    expect(labels(i)).not.toContain(UNKNOWN_STEP);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("분기 9 — §167의10①3호·7호: 빈 날짜(진행 중·미해소 / 모름)를 명시 선택으로 가른다", () => {
  const EXCLUDED = 141_966_000;
  const SURCHARGED = 299_816_000;
  const two = (se: Exclusion) => form([ROW], { sellingHouseExclusion: se }, "800,000,000");
  const UNAV = { isUnavoidableReason: true, unavoidableResidenceYears: "2", acquisitionOfficialPrice: "250,000,000" };

  it("U9-a 7호 확정판결일·「진행 중」 모두 없음(수정 전 = 진행 중 → 141,966,000) → ⑧ 차단 + ⑫ 400", async () => {
    const f = two({ isLitigationHousing: true });
    expect(collectStepIssues(1, f).map((x) => x.field)).toContain("sellingHouseExclusion.litigationAcquisitionDate");
    const s = await single(f);
    expect(s.status).toBe(400);
    expect(Object.keys(s.fieldErrors ?? {})).toContain("houses.0.litigationAcquisitionDate");
  });

  it("U9-b 7호 「양도일 현재 소송 진행 중」 선택 → 배제 141,966,000 (단건 = 다건)", async () => {
    const f = two({ isLitigationHousing: true, litigationPending: true });
    expect(collectStepIssues(1, f)).toEqual([]);
    expect(await single(f)).toMatchObject({ totalTax: EXCLUDED, exclusions: ["litigation_housing_two_house"] });
    expect(await multi(f)).toBe(EXCLUDED);
  });

  it("U9-c 7호 확정판결일 3년 안 → 배제 · 3년 경과 → 중과 (날짜 경로 불변)", async () => {
    expect((await single(two({ isLitigationHousing: true, litigationAcquisitionDate: "2024-01-01" }))).totalTax).toBe(EXCLUDED);
    expect((await single(two({ isLitigationHousing: true, litigationAcquisitionDate: "2020-01-01" }))).totalTax).toBe(SURCHARGED);
  });

  it("U9-d 3호 해소일·「미해소」 모두 없음(수정 전 = 미해소 → 141,966,000) → ⑧ 차단 + ⑫ 400", async () => {
    const f = two(UNAV);
    expect(collectStepIssues(1, f).map((x) => x.field)).toContain("sellingHouseExclusion.unavoidableReasonResolvedDate");
    const s = await single(f);
    expect(s.status).toBe(400);
    expect(Object.keys(s.fieldErrors ?? {})).toContain("houses.0.unavoidableReasonResolvedDate");
  });

  it("U9-e 3호 「양도일 현재 사유가 해소되지 않음」 선택 → 배제 141,966,000 · 해소일 3년 경과 → 중과", async () => {
    const f = two({ ...UNAV, unavoidableReasonUnresolved: true });
    expect(collectStepIssues(1, f)).toEqual([]);
    expect(await single(f)).toMatchObject({ totalTax: EXCLUDED, exclusions: ["unavoidable_reason_two_house"] });
    expect(await multi(f)).toBe(EXCLUDED);
    expect((await single(two({ ...UNAV, unavoidableReasonResolvedDate: "2020-06-01" }))).totalTax).toBe(SURCHARGED);
  });

  it("U9-f 다른 보유 주택 행도 같은 요구(⑧ 명부 행 · ⑫) — 선택하면 배제", async () => {
    const lit = { ...ROW, isLitigationHousing: true };
    expect(collectStepIssues(1, form([lit], {}, "800,000,000")).map((x) => x.message).join()).toMatch(/소송 진행 중/);
    expect((await single(form([lit], {}, "800,000,000"))).status).toBe(400);
    expect((await single(form([{ ...lit, litigationPending: true }], {}, "800,000,000"))).totalTax).toBe(EXCLUDED);
    const unav = { ...ROW, isUnavoidableReason: true, unavoidableResidenceYears: "2", acquisitionOfficialPrice: "250000000" };
    expect((await single(form([unav], {}, "800,000,000"))).status).toBe(400);
    expect((await single(form([{ ...unav, unavoidableReasonUnresolved: true }], {}, "800,000,000"))).totalTax).toBe(EXCLUDED);
  });

  it("U9-g ④ — 「진행 중·미해소」를 고르면 남은 날짜는 싣지 않는다(stale 값) · ⑫는 둘을 함께 받으면 400", async () => {
    const f = two({
      isLitigationHousing: true,
      litigationPending: true,
      litigationAcquisitionDate: "2010-01-01",
      ...UNAV,
      unavoidableReasonUnresolved: true,
      unavoidableReasonResolvedDate: "2010-01-01",
    });
    const body = await bodyOf(() => callTransferTaxAPI(f));
    const selling = (body.houses as Obj[]).find((h) => h.id === "selling")!;
    expect(selling).toMatchObject({ litigationPending: true, unavoidableReasonUnresolved: true });
    expect(selling.litigationAcquisitionDate).toBeUndefined();
    expect(selling.unavoidableReasonResolvedDate).toBeUndefined();
    expect((await singleBody(body)).totalTax).toBe(EXCLUDED);
    const tamper = (extra: Obj) => ({
      ...body,
      houses: (body.houses as Obj[]).map((h) => (h.id === "selling" ? { ...h, ...extra } : h)),
    });
    for (const [extra, field] of [
      [{ litigationAcquisitionDate: "2024-01-01" }, "houses.0.litigationAcquisitionDate"],
      [{ unavoidableReasonResolvedDate: "2025-06-01" }, "houses.0.unavoidableReasonResolvedDate"],
    ] as const) {
      const s = await singleBody(tamper(extra));
      expect(s.status).toBe(400);
      expect(Object.keys(s.fieldErrors ?? {})).toContain(field);
    }
  });

  it("U9-h 판정 메뉴 ⑧ — 명부 행 ④ 칸이 열리므로 같은 요구(⑫ 400과 모순 없음)", () => {
    const j = createInitialOneHouseJudgmentForm();
    j.houses = [{ ...ROW, isLitigationHousing: true }];
    expect(validateJudgmentStep2(j).map((e) => e.field)).toContain("houses.0.litigationAcquisitionDate");
    j.houses = [{ ...ROW, isLitigationHousing: true, litigationPending: true }];
    expect(validateJudgmentStep2(j).map((e) => e.field)).not.toContain("houses.0.litigationAcquisitionDate");
  });

  it("U9-i 엔진 직접 — 날짜도 선택도 없으면 불성립 299,816,000 (수정 전 141,966,000)", () => {
    const h = (id: string, over: Obj = {}) => ({
      id,
      acquisitionDate: new Date("2015-01-01"),
      officialPrice: 500_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...over,
    });
    const i = (selling: Obj) =>
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionDate: new Date("2015-01-01"),
        transferDate: new Date("2026-08-01"),
        isRegulatedArea: true,
        residencePeriodMonths: 48,
        householdHousingCount: 2,
        houses: [h("selling", selling), h("h2")] as TransferTaxInput["houses"],
        sellingHouseId: "selling",
      });
    const tax = (x: TransferTaxInput) => calculateTransferTax(x, loadFallbackTransferRates(x.transferDate)).totalTax;
    expect(tax(i({ isLitigationHousing: true }))).toBe(SURCHARGED);
    expect(tax(i({ isLitigationHousing: true, litigationPending: true }))).toBe(EXCLUDED);
    const u = { isUnavoidableReason: true, unavoidableResidenceYears: 2, acquisitionOfficialPrice: 250_000_000 };
    expect(tax(i(u))).toBe(SURCHARGED);
    expect(tax(i({ ...u, unavoidableReasonUnresolved: true }))).toBe(EXCLUDED);
  });
});
