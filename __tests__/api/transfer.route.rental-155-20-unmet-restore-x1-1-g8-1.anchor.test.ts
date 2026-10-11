/**
 * 결정 #19(X1-1)·#20(G8-1) route 관측 — §155⑳ A **불성립**이면 비과세와 중과 배제 ① 요소가 **같은 규칙**으로 임대주택을 주택 수에 되돌린다.
 *
 * 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건 = 다건) → 엔진. 시료는 E-14g·h와 같다: 세율 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택
 * 2015 취득 · §155⑳ A 임대 1호(2019.3.1. 등록) · 호별 요건 불충족은 임대개시일 기준시가 7억(수도권 상한 6억 초과).
 *
 * | 시료 | 전 | 후 |
 * |---|---:|---:|
 * | RS-1 명부 [신규] · 15억 · 임대 상한 초과 | 22,709,500 (일시적 2주택 비과세 · 표2 · 15호 배제) | 783,678,500 (과세 · 중과 2주택) |
 * | RS-3 명부 [상속] · 20억 · 임대 상한 초과 (P2a-cap) | 582,598,500 (15호 배제) | 1,141,178,500 |
 * | RS-4 H-6 명부 [상속·신규] · 3중첩(임대 행 없음) | 582,598,500 (13호 배제) | 1,327,903,500 (= 임대 행을 명부에 넣은 H-3) |
 *
 * 법령 기준값(임대 행을 명부에 넣은 경우)은 15억 915,403,500 · 20억 1,327,903,500이다. 후의 값이 그 아래인 이유 — **중과 주택 수의 엔진 반영(C)은
 * 후속**이라 임대주택을 중과 산입 주택 수에 넣지 않는다(남은 과소분은 고지로 처방). 영 §155⑳은 요건을 충족한 때만 「1개의 주택을 소유하고 있는 것으로
 * 보아」이므로 불성립이면 §155①·②의 「1주택」이 서지 않는다(조심 2021서1571).
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
  longTermHoldingRate: number | undefined;
  rentalApplied: boolean;
  notApplicable: string | undefined;
  warnings: string[];
  raw: Obj;
}
async function single(f: Form): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const steps = (r.steps ?? []) as { label: string; formula: string }[];
  return {
    totalTax: r.totalTax as number,
    longTermHoldingRate: r.longTermHoldingRate as number | undefined,
    rentalApplied: (r.rentalHousingExceptionDetail as { applied?: boolean } | undefined)?.applied === true,
    notApplicable: steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")?.formula,
    warnings: (r.warnings ?? []) as string[],
    raw: r,
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


const RENTAL_UNIT_CAP_FAIL = "700,000,000";
function failRental(f: Form): Form {
  f.assets[0].rentalHousingException.rentalUnits[0].standardPriceAtRentalStart = RENTAL_UNIT_CAP_FAIL;
  return f;
}
const hasRestoreNotice = (w: string[]) => w.find((x) => x.includes("세대 주택 수에 넣어")) ?? "";
const mh = (s: Single) =>
  s.raw.multiHouseSurchargeEvaluation as { surchargeType: string; effectiveHouseCount: number; exclusionReasons: { type: string }[] };

describe("RS 비과세·중과 배제 ① 요소가 같은 규칙 — A 불성립 + 명부에 장기임대 행 없음", () => {
  it("RS-1 ★ 명부 [신규] · 주택 수 2 · 15억 · 임대 상한 초과 → 일시적 2주택 비과세·15호 배제가 서지 않는다 (22,709,500 → 783,678,500)", async () => {
    const f = failRental(withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(783_678_500);
    expect(s.raw.isExempt).toBe(false);
    expect(s.raw.isPartialExempt).toBe(false);
    expect(s.longTermHoldingRate).toBe(0);
    expect(mh(s).exclusionReasons).toEqual([]);
    expect(mh(s).surchargeType).toBe("multi_house_2");
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("임대주택 1호를 세대 주택 수에 넣어(3주택)");
    // 중과 주택 수는 다시 세지 않는다 — 고지로 처방(조정대상지역 · 한시 배제 밖 · 중과 주택 수 2)
    expect(w).toContain("중과를 다시 판정하지 않았습니다");
    expect(w).toContain("「장기임대」로 넣어 다시 계산하세요");
    expect(await multi(f)).toBe(s.totalTax);
  });
  it("RS-2 대조 기준값 — 임대 행을 명부에 넣은 법령 기준 입력은 915,403,500이고 되돌림 고지가 없다 (엔진 반영 C는 후속)", async () => {
    const f = failRental(withRental(form([RENTAL_ROW, NEW_HOUSE], { contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(915_403_500);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
  it("RS-3 ★ 명부 [상속] · 20억 · 임대 상한 초과 → 15호(inherited_general_house) 배제가 서지 않는다 (582,598,500 → 1,141,178,500)", async () => {
    const f = failRental(withRental(form([INHERITED])));
    const s = await single(f);
    expect(s.totalTax).toBe(1_141_178_500);
    expect(mh(s).exclusionReasons).toEqual([]);
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(hasRestoreNotice(s.warnings)).toContain("(2주택)");
    expect(await multi(f)).toBe(s.totalTax);
  });
  it("RS-4 ★ H-6 3중첩을 임대 행 없이 입력 → 13호 배제가 서지 않는다 — 임대 행을 명부에 넣은 H-3과 같은 값 (582,598,500 → 1,327,903,500)", async () => {
    const f = withRental(
      form([INHERITED, NEW_HOUSE], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" }),
    );
    const s = await single(f);
    expect(s.totalTax).toBe(1_327_903_500);
    expect(mh(s).exclusionReasons).toEqual([]);
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("세대 구성 요건");
    expect(w).toContain("(3주택)");
    // 중과 산입 주택 수가 이미 3이라 임대주택을 더해도 세율이 바뀌지 않는다 — 중과 문장을 싣지 않는다
    expect(w).not.toContain("중과");
    expect(await multi(f)).toBe(s.totalTax);
  });
});

describe("RS 짝 — 되돌리지 않는 경우", () => {
  it("RS-5 ★ 긍정 짝 — 요건을 충족하면 특례·15호 배제 그대로 (22,709,500 · 고지 없음)", async () => {
    const f = withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000" }));
    const s = await single(f);
    expect(s.totalTax).toBe(22_709_500);
    expect(s.rentalApplied).toBe(true);
    expect(mh(s).exclusionReasons.map((x) => x.type)).toEqual(["temporary_two_house"]);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
  it("RS-6 명부 없음 · 주택 수 2(임대주택을 이미 센 입력) → 임대 호수를 더하지 않는다 — 비과세·배제 불변 102,086,600", async () => {
    const f = failRental(
      withRental(form([], { householdHousingCount: "2", temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" })),
    );
    const s = await single(f);
    expect(s.totalTax).toBe(102_086_600);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
  it("RS-7 명부 없음 · 주택 수 1 → 더한다 (단건 391,743,000 불변) · 중과 문장은 목록 대신 주택 수 입력을 처방한다", async () => {
    const f = failRental(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(391_743_000);
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("(2주택)");
    expect(w).toContain("세대 보유 주택 수에 임대주택을 포함해 다시 입력하세요");
    expect(w).not.toContain("「장기임대」로 넣어");
  });
  it("RS-8 임대주택을 명부에 「장기임대」로 표시한 행이 있으면 더하지 않는다 (이중 계상 방지) — 3중첩 H-3 1,327,903,500 불변", async () => {
    const f = withRental(
      form([RENTAL_ROW, INHERITED, NEW_HOUSE], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" }),
    );
    const s = await single(f);
    expect(s.totalTax).toBe(1_327_903_500);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
  it("RS-9 고지의 중과 문장은 양도일 조정대상지역일 때만 — 비조정이면 문장 없이 되돌림만 알린다", async () => {
    const f = failRental(withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000", isRegulatedArea: false })));
    const w = hasRestoreNotice((await single(f)).warnings);
    expect(w).toContain("(3주택)");
    expect(w).not.toContain("중과를 다시 판정하지 않았습니다");
  });
});

describe("RS 한시 배제 기간 — 중과 문장을 싣지 않는다 (영 §167의3①12의2호가목 · 2026.5.9.까지 양도)", () => {
  const SUSPENDED = "2026-03-02";
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(
      async () => loadFallbackTransferRates(new Date(SUSPENDED)) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
  });
  it("RS-10 양도 2026-03-02 · 명부 [신규] · 임대 상한 초과 → 되돌림 고지에 중과 문장이 없다", async () => {
    const f = failRental(withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000", transferDate: SUSPENDED })));
    const w = hasRestoreNotice((await single(f)).warnings);
    expect(w).toContain("(3주택)");
    expect(w).not.toContain("중과를 다시 판정하지 않았습니다");
  });
});

describe("X1-1 ⑫⑭ 계산 route — 임대 1호 이상 B는 §161 기준시가 3개를 필수로 받는다", () => {
  function phrpForm(prices: { acq: string; prior: string; transfer: string }, units = true): Form {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-03-03";
    f.householdHousingCount = "1";
    f.contractTotalPrice = "1,500,000,000";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2009-08-12",
      actualSalePrice: "1,500,000,000",
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
      standardPriceAtAcquisitionForPhrp: prices.acq,
      standardPriceAtPriorTransfer: prices.prior,
      standardPriceAtTransferForPhrp: prices.transfer,
      postRegistrationResidenceMonths: "24",
      rentalUnits: units
        ? [
            {
              ...makeDefaultRentalUnit(),
              businessRegistrationDate: "2016-06-01",
              rentalRegistrationDate: "2016-06-01",
              standardPriceAtRentalStart: "300,000,000",
              rentalInputMode: "direct",
              rentalMonths: "96",
              requirementsConfirmed: true,
            },
          ]
        : [],
    };
    return f;
  }
  async function status(f: Form): Promise<{ status: number; fieldErrors: Record<string, string[]> | undefined }> {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
    const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
    const json = (await res.json()) as { error?: { fieldErrors?: Record<string, string[]> } };
    return { status: res.status, fieldErrors: json.error?.fieldErrors };
  }
  it("G-1 ★ 기준시가 3개가 빠지면 400 — 종전: §161 안분 없이 주택 수 1 일반 경로로 부분 비과세", async () => {
    const r = await status(phrpForm({ acq: "", prior: "", transfer: "" }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors ?? {})).toEqual(
      expect.arrayContaining([
        "rentalHousingException.standardPriceAtAcquisitionForPhrp",
        "rentalHousingException.standardPriceAtPriorTransfer",
        "rentalHousingException.standardPriceAtTransferForPhrp",
      ]),
    );
  });
  it("G-2 긍정 짝 — 3개를 입력하면 통과한다", async () => {
    const r = await status(phrpForm({ acq: "300,000,000", prior: "450,000,000", transfer: "500,000,000" }));
    expect(r.status).toBe(200);
  });
  it("G-3 짝 — 임대 0호(§154⑩ 경로)는 범위 밖이라 막지 않는다", async () => {
    const r = await status(phrpForm({ acq: "", prior: "", transfer: "" }, false));
    expect(r.status).not.toBe(400);
  });
});

describe("X1-1 B + 세대 구성 불성립(3중첩) — 요건은 충족해도 비과세를 거둔다", () => {
  /** B(직전거주주택보유주택): 요건 충족(임대 상한 이내 · 등록 후 거주 48개월) · §161 기준시가 3·4.5·5억 */
  function withPrhp(f: Form): Form {
    withRental(f);
    Object.assign(f.assets[0].rentalHousingException, {
      scenario: "B",
      priorResidenceTransferDate: "2020-08-25",
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtPriorTransfer: "450,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
      postRegistrationResidenceMonths: "48",
    });
    return f;
  }
  const tri = { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" };
  it("BC-1 ★ 명부 [상속·신규](임대 행 없음) · B 3중첩 → 일시적 2주택 비과세가 서지 않는다 (중과 13호 배제는 B 범위 밖이라 종전 그대로)", async () => {
    const s = await single(withPrhp(form([INHERITED, NEW_HOUSE], tri)));
    expect(s.raw.isExempt).toBe(false);
    expect(s.raw.isPartialExempt).toBe(false);
    expect(s.rentalApplied).toBe(false);
    expect(hasRestoreNotice(s.warnings)).toContain("세대 구성 요건");
    // 시나리오 B의 중과 ① 요소는 열지 않는다(해석 미확보 — A 결론을 B로 자동 확장하지 않는다): 중과 판정은 종전 그대로(결정 #19 조건).
    expect(mh(s).exclusionReasons.map((x) => x.type)).toEqual(["temporary_two_house"]);
  });
  it("BC-2 짝 — 상속주택 하나만(⑳·② 2중첩)이면 B도 특례 유지", async () => {
    const s = await single(withPrhp(form([INHERITED])));
    expect(s.rentalApplied).toBe(true);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
});
