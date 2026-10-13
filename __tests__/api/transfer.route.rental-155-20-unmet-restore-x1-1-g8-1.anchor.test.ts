/**
 * 결정 #19(X1-1)·#20(G8-1) route 관측 — §155⑳ A **불성립**이면 비과세와 중과 배제 ① 요소가 **같은 규칙**으로 임대주택을 주택 수에 되돌린다.
 *
 * 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건 = 다건) → 엔진. 시료는 E-14g·h와 같다: 세율 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택
 * 2015 취득 · §155⑳ A 임대 1호(2019.3.1. 등록) · 호별 요건 불충족은 임대개시일 기준시가 7억(수도권 상한 6억 초과).
 *
 * | 시료 | 전 | 후 |
 * |---|---:|---:|
 * | RS-1 명부 [신규] · 15억 · 임대 상한 초과 | 22,709,500 (일시적 2주택 비과세 · 표2 · 15호 배제) | 915,403,500 (과세 · 중과 3주택) |
 * | RS-3 명부 [상속] · 20억 · 임대 상한 초과 (P2a-cap) | 582,598,500 (15호 배제) | 1,327,903,500 |
 * | RS-4 H-6 명부 [상속·신규] · 3중첩(임대 행 없음) | 582,598,500 (13호 배제) | 1,327,903,500 (= 임대 행을 명부에 넣은 H-3) |
 *
 * 후의 값은 임대 행을 명부에 넣은 법령 기준값과 같다(15억 915,403,500 · 20억 1,327,903,500). 결정 #20 A(#2119)는 ① 요소만 고쳐 그 아래(783,678,500 ·
 * 1,141,178,500)였고, **C(2026-10-12)** 가 카드의 임대 호를 중과 판정 명부에 더해 메웠다. 영 §155⑳은 요건을 충족한 때만 「1개의 주택을 소유하고 있는
 * 것으로 보아」이므로 불성립이면 §155①·②의 「1주택」이 서지 않고, 임대주택은 중과 주택 수에도 들어간다(조심 2021서1571 · 영 §167의3① 본문).
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
  // 양도 주택보다 나중에 취득한 행(신규 주택 후보)은 취득 경위를 답해야 한다(결정 #43) — 이 시험의 관심사가 아니라 일반 취득으로 둔다.
  acquisitionOrigin: "general",
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
  it("RS-1 ★ 명부 [신규] · 주택 수 2 · 15억 · 임대 상한 초과 → 일시적 2주택 비과세·15호 배제가 서지 않고 중과 3주택 (22,709,500 → 915,403,500)", async () => {
    const f = failRental(withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(915_403_500);
    expect(s.raw.isExempt).toBe(false);
    expect(s.raw.isPartialExempt).toBe(false);
    expect(s.longTermHoldingRate).toBe(0);
    expect(mh(s).exclusionReasons).toEqual([]);
    expect(mh(s).surchargeType).toBe("multi_house_3plus");
    expect(mh(s).effectiveHouseCount).toBe(3);
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("임대주택 1호를 세대 주택 수에 넣어(3주택)");
    // C — 중과 주택 수에도 넣었다(조정대상지역 · 한시 배제 밖). 종전의 「명부에 넣어 다시 계산」 처방은 없다.
    expect(w).toContain("다주택 중과 판정의 주택 수에도 임대주택 1호를 넣었습니다");
    expect(w).not.toContain("「장기임대」로 넣어");
    expect(await multi(f)).toBe(s.totalTax);
  });
  it("RS-2 대조 기준값 — 임대 행을 명부에 넣은 법령 기준 입력은 915,403,500(= RS-1)이고 되돌림 고지가 없다", async () => {
    const f = failRental(withRental(form([RENTAL_ROW, NEW_HOUSE], { contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(915_403_500);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
  it("RS-3 ★ 명부 [상속] · 20억 · 임대 상한 초과 → 15호(inherited_general_house) 배제가 서지 않고 중과 3주택 (582,598,500 → 1,327,903,500)", async () => {
    const f = failRental(withRental(form([INHERITED])));
    const s = await single(f);
    expect(s.totalTax).toBe(1_327_903_500);
    expect(mh(s).exclusionReasons).toEqual([]);
    expect(mh(s).surchargeType).toBe("multi_house_3plus");
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
    // C — 중과 판정 명부에도 임대 호를 더했다(3주택 → 4주택, 세율은 같다)
    expect(mh(s).effectiveHouseCount).toBe(4);
    expect(w).toContain("다주택 중과 판정의 주택 수에도 임대주택 1호를 넣었습니다");
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
  it("RS-7 ★ 명부 없음 · 주택 수 1 → 더한다 — 임대 호가 2호가 아니라 거주주택이 10호를 못 받고 중과 2주택 (391,743,000 → 783,678,500)", async () => {
    const f = failRental(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" })));
    const s = await single(f);
    expect(s.totalTax).toBe(783_678_500);
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(mh(s).exclusionReasons).toEqual([]);
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("(2주택)");
    expect(w).toContain("다주택 중과 판정의 주택 수에도 임대주택 1호를 넣었습니다");
    // 수도권 임대 호(주소 없음)는 지역기준으로 보아 1호 확인 필요 고지를 붙이지 않는다
    expect(w).not.toContain("§167의3①1호");
    expect(await multi(f)).toBe(s.totalTax);
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
    // 양도 주택 소재지가 입력돼 있으면 조정 여부는 주소 판정이 정한다(결정 #3·#4·#5 — 토글은 숨김) — 비조정 소재지(청주)로 둔다.
    const f = failRental(withRental(form([NEW_HOUSE], { contractTotalPrice: "1,500,000,000", isRegulatedArea: false })));
    f.assets[0].regionCode = "4311110100";
    const w = hasRestoreNotice((await single(f)).warnings);
    expect(w).toContain("(3주택)");
    expect(w).not.toContain("다주택 중과 판정");
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
    expect(w).not.toContain("다주택 중과 판정");
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
  it("BC-1 ★ 명부 [상속·신규](임대 행 없음) · B 3중첩 → 일시적 2주택 비과세도 중과 13호 배제도 서지 않는다 (결정 #20 C — B 포함)", async () => {
    const s = await single(withPrhp(form([INHERITED, NEW_HOUSE], tri)));
    expect(s.raw.isExempt).toBe(false);
    expect(s.raw.isPartialExempt).toBe(false);
    expect(s.rentalApplied).toBe(false);
    expect(hasRestoreNotice(s.warnings)).toContain("세대 구성 요건");
    // 불성립이면 B도 ⑳이 서지 않는 일반 주택이다(사용자 결정 2026-10-12) — ① 요소가 서지 않고 임대 호도 중과 주택 수에 든다.
    expect(mh(s).exclusionReasons).toEqual([]);
    expect(mh(s).effectiveHouseCount).toBe(4);
  });
  it("BC-2 짝 — 상속주택 하나만(⑳·② 2중첩)이면 B도 특례 유지", async () => {
    const s = await single(withPrhp(form([INHERITED])));
    expect(s.rentalApplied).toBe(true);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
});

/**
 * 결정 #20 C — ⑳ 불성립이면 카드의 임대 호를 중과 판정 명부에 더한다. 2호 장기임대주택 여부는 **중과 술어**로 판정한다
 * (사용자 결정 2026-10-12 — ⑳ 호별 판정과 다르다: 가목 1) 2018.3.31. 등록기한 · 마목 1) 조정대상지역 신규 취득 · ㉓ 말소).
 * 정답은 「같은 사실을 명부 장기임대 행으로 넣은 입력」이다 — 카드 행과 명부 행이 같은 값을 내야 한다.
 */
describe("C 카드 임대 호 → 중과 판정 명부 (결정 #20 C)", () => {
  /** 카드의 임대 호(withRental)와 같은 사실의 명부 장기임대 행 — 마목(E) · 2019.3.1. 등록 · 90개월 */
  const cardEquivalentRow = (rentalStartPrice: string, over: Partial<HouseEntry> = {}): HouseEntry => ({
    ...ROW,
    id: "h4",
    acquisitionDate: "2016-01-01",
    isApartment: false,
    isLongTermRental: true,
    isRegisteredRental: true,
    businessRegistrationDate: "2019-03-01",
    rentalRegistrationDate: "2019-03-01",
    rentalPeriodYears: "7.5",
    rentalType: "E",
    rentIncreaseUnder5Pct: true,
    rentalStartOfficialPrice: rentalStartPrice,
    ...over,
  });
  /** ⑳ 거주요건(2년) 불충족 — 임대 호는 ⑳ 호별 요건을 충족한다 */
  const noResidence = (f: Form): Form => {
    f.assets[0].residencePeriodMonthsAsset = "0";
    return f;
  };

  it("C-1 ★ RS-7(명부 없음 · 임대 상한 초과) = 같은 사실을 명부 장기임대 행으로 넣은 입력 — 783,678,500 · 중과 2주택", async () => {
    const card = await single(failRental(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" }))));
    const roster = await single(
      failRental(withRental(form([cardEquivalentRow("700000000")], { contractTotalPrice: "1,500,000,000" }))),
    );
    expect(roster.totalTax).toBe(783_678_500);
    expect(card.totalTax).toBe(roster.totalTax);
    expect(mh(card).surchargeType).toBe(mh(roster).surchargeType);
  });

  it("C-2 ★ 거주요건만 불충족 · 임대 호는 2호(§167의3④ 의무기간 충족 전) → 거주주택이 10호로 중과 배제 — 명부 행 입력과 같은 값", async () => {
    const card = await single(noResidence(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" }))));
    expect(card.rentalApplied).toBe(false);
    expect(mh(card).effectiveHouseCount).toBe(2);
    expect(mh(card).surchargeType).toBe("none");
    expect(mh(card).exclusionReasons.map((x) => x.type)).toEqual(["only_general_two_house"]);
    const roster = await single(noResidence(withRental(form([cardEquivalentRow("250000000")], { contractTotalPrice: "1,500,000,000" }))));
    expect(card.totalTax).toBe(roster.totalTax);
    expect(await multi(noResidence(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" }))))).toBe(
      card.totalTax,
    );
  });

  it("C-3 ★ 목 후보 — 2018.3.1. 등록 매입 · 2020.7.11. 이후 단기→장기 변경 신고(마목 3) 배제)여도 가목으로 2호 → 10호 배제", async () => {
    const f = noResidence(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" })));
    Object.assign(f.assets[0].rentalHousingException.rentalUnits[0], {
      businessRegistrationDate: "2018-03-01",
      rentalRegistrationDate: "2018-03-01",
      isExcludedShortToLongChange: true,
      rentalMonths: "70",
    });
    const s = await single(f);
    expect(mh(s).surchargeType).toBe("none");
    expect(mh(s).exclusionReasons.map((x) => x.type)).toEqual(["only_general_two_house"]);
  });

  it("C-4 짝 — 같은 호를 2018.5.1. 등록하면 가목 등록기한(2018.3.31.)에 걸리고 마목 3)으로도 배제 → 2호 아님 → 중과 2주택", async () => {
    const f = noResidence(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" })));
    Object.assign(f.assets[0].rentalHousingException.rentalUnits[0], {
      businessRegistrationDate: "2018-05-01",
      rentalRegistrationDate: "2018-05-01",
      isExcludedShortToLongChange: true,
      rentalMonths: "70",
    });
    const s = await single(f);
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(mh(s).exclusionReasons).toEqual([]);
  });

  it("C-6 짝 — 명부 없음 · 주택 수 2(조특법 감면주택 1채 제외 후 1)면 비과세는 되돌리지만 중과 명부는 합성하지 않는다 — 고지에 중과 문장 없음", async () => {
    const f = failRental(withRental(form([], { householdHousingCount: "2", contractTotalPrice: "1,500,000,000" })));
    Object.assign(f, {
      specialHouseExclusions: [
        {
          article: "unsold_99_2",
          houseAcquisitionDate: "2013-06-01",
          houseContractDate: "2013-06-01",
          isNationalHousing: false,
          requirementsConfirmed: true,
        },
      ],
    });
    const w = hasRestoreNotice((await single(f)).warnings);
    expect(w).toContain("(2주택)");
    expect(w).not.toContain("다주택 중과 판정");
  });

  it("C-5 짝 — ⑳ 요건을 충족하면 카드 행을 더하지 않는다(15호 · 임대 행 없는 2주택 의제 그대로)", async () => {
    const s = await single(withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" })));
    expect(s.rentalApplied).toBe(true);
    expect(hasRestoreNotice(s.warnings)).toBe("");
  });
});

/**
 * 결정 #20 C 후속 — 카드 임대 호의 영 §167의3①1호(수도권·광역시 등 밖 지방 주택으로서 거주주택 양도 당시 기준시가 3억 이하 →
 * 중과 주택 수 불산입). 소재지 주소(법정동코드)와 「거주주택 양도일 현재 기준시가」 칸으로 판정한다(명부 행과 같은 분기).
 * 모르면 산입(불리) + 확인 필요 고지.
 */
describe("L 지방 임대 호 — 영 §167의3①1호 (결정 #20 C 후속)", () => {
  const CHEONGJU = "4311110100"; // 충북 청주 — 가액기준(VALUE)
  const BUSAN = "2611010100"; // 부산 중구 — 지역기준(REGION, 광역시)
  /** 명부 없음 · 주택 수 1 · 지방 임대 호(임대개시일 기준시가 4억 — 비수도권 상한 3억 초과로 ⑳ 불성립) */
  function localRental(regionCode: string, priceAtTransfer: string): Form {
    const f = withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" }));
    Object.assign(f.assets[0].rentalHousingException.rentalUnits[0], {
      region: "non-metro",
      regionCode,
      standardPriceAtRentalStart: "400,000,000",
      officialPriceAtResidenceTransfer: priceAtTransfer,
    });
    return f;
  }

  it("L-1 ★ 청주 · 양도일 기준시가 2억 → 1호로 주택 수에서 빠져 1주택 — 중과 없음 · 확인 필요 고지 없음", async () => {
    const s = await single(localRental(CHEONGJU, "200,000,000"));
    expect(mh(s).surchargeType).toBe("none");
    expect(mh(s).effectiveHouseCount).toBe(1);
    expect(hasRestoreNotice(s.warnings)).not.toContain("확인 필요");
    expect(await multi(localRental(CHEONGJU, "200,000,000"))).toBe(s.totalTax);
  });

  it("L-2 짝 — 같은 호 양도일 기준시가 3억 1천만 → 산입 · 중과 2주택 (783,678,500 = 수도권 임대 호와 같은 값)", async () => {
    const s = await single(localRental(CHEONGJU, "310,000,000"));
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(s.totalTax).toBe(783_678_500);
    expect(hasRestoreNotice(s.warnings)).not.toContain("확인 필요");
  });

  it("L-3 ★ 기준시가를 비우면 모름 → 산입(불리) · 중과 2주택 + 1호 확인 필요 고지", async () => {
    const s = await single(localRental(CHEONGJU, ""));
    expect(mh(s).surchargeType).toBe("multi_house_2");
    const w = hasRestoreNotice(s.warnings);
    expect(w).toContain("임대주택 1호는 소재지 주소 또는 거주주택 양도일 현재 기준시가를 입력하지 않아");
    expect(w).toContain("소득세법 시행령 §167의3①1호, 확인 필요");
  });

  it("L-4 짝 — 광역시(부산)는 지역기준이라 기준시가와 무관하게 산입 · ④가 칸 값을 보내지 않는다 · 고지 없음", async () => {
    const f = localRental(BUSAN, "200,000,000");
    const body = await bodyOf(() => callTransferTaxAPI(f));
    const unit = ((body.rentalHousingException as Obj).rentalUnits as Obj[])[0];
    expect(unit.regionCode).toBe(BUSAN);
    expect(unit.officialPriceAtTransfer).toBeUndefined();
    const s = await single(f);
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(hasRestoreNotice(s.warnings)).not.toContain("확인 필요");
  });

  it("L-5 짝 — 주소 없이 비수도권만 고르면 모름 → 산입 + 확인 필요 고지", async () => {
    const s = await single(localRental("", ""));
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(hasRestoreNotice(s.warnings)).toContain("확인 필요");
  });
});

/**
 * #20 C 후속 — 말소된 임대 호(㉓)의 중과 2호 판정. 영 §167의3①2호 단서: 가·다~마목 장기임대주택이 자동말소(민특법 §6⑤)되면
 * 임대의무기간이 끝난 날 임대기간요건을 갖춘 것으로 본다(말소 5년 뒤 일반주택 양도도 10호 — 서면-2022-법규재산-1999).
 * 자진말소(§6①11호)·사유 미선택은 2호로 보지 않고, 자동말소였다면 결론이 달라질 때만 확인 필요 고지(사용자 결정 2026-10-13).
 *
 * 시료: 명부 없음 · 주택 수 1 · ⑳ 거주요건 불충족 · 가목 매입(2018.3.1. 등록) 단기 4년 → 2022.3.1. 말소 · 임대 48개월(가목 5년 미달).
 */
describe("M 말소된 임대 호 — 영 §167의3①2호 단서 (#20 C 후속)", () => {
  const CANCELLED = "2022-03-01";
  function cancelledCard(reason: "" | "auto" | "voluntary", over: Record<string, unknown> = {}): Form {
    const f = withRental(form([], { householdHousingCount: "1", contractTotalPrice: "1,500,000,000" }));
    f.assets[0].residencePeriodMonthsAsset = "0";
    Object.assign(f.assets[0].rentalHousingException.rentalUnits[0], {
      businessRegistrationDate: "2018-03-01",
      rentalRegistrationDate: "2018-03-01",
      rentalMonths: "48",
      rentalAutoTermination: true,
      registrationCancellationDate: CANCELLED,
      terminatedRegistrationType: "short_term",
      terminationReason: reason,
      ...over,
    });
    return f;
  }
  /** 같은 사실의 명부 장기임대 행(가목 · 4년 · 2022.3.1. 말소) */
  const cancelledRow = (reason: "" | "auto" | "voluntary", over: Partial<HouseEntry> = {}): HouseEntry => ({
    ...ROW,
    id: "h4",
    acquisitionDate: "2016-01-01",
    isApartment: false,
    isLongTermRental: true,
    isRegisteredRental: true,
    businessRegistrationDate: "2018-03-01",
    rentalRegistrationDate: "2018-03-01",
    rentalPeriodYears: "4",
    rentalType: "A",
    rentIncreaseUnder5Pct: true,
    rentalStartOfficialPrice: "250000000",
    rentalCancelledDate: CANCELLED,
    rentalCancellationReason: reason,
    ...over,
  });
  /** 중과 상세 카드(⑦ `MultiHouseSurchargeDetailCard`)의 경고 중 말소 사유 확인 필요 고지 */
  const cancelNotice = (s: Single) =>
    (((s.raw.multiHouseSurchargeEvaluation as Obj).warnings ?? []) as string[]).filter(
      (x) => x.includes("말소") && x.includes("확인 필요") && x.includes("§167의3①2호"),
    );

  it("M-1 ★ 카드 자동말소 → 임대기간요건 간주(2호) → 거주주택 10호 중과 배제 — 명부 행 입력과 같은 값 · 단건 = 다건", async () => {
    const s = await single(cancelledCard("auto"));
    expect(s.rentalApplied).toBe(false);
    expect(mh(s).effectiveHouseCount).toBe(2);
    expect(mh(s).surchargeType).toBe("none");
    expect(mh(s).exclusionReasons.map((x) => x.type)).toEqual(["only_general_two_house"]);
    expect(cancelNotice(s)).toEqual([]);
    expect(s.totalTax).toBe(391_743_000);
    const f = withRental(form([cancelledRow("auto")], { contractTotalPrice: "1,500,000,000" }));
    f.assets[0].residencePeriodMonthsAsset = "0";
    const roster = await single(f);
    expect(mh(roster).surchargeType).toBe("none");
    expect(roster.totalTax).toBe(s.totalTax);
    expect(await multi(cancelledCard("auto"))).toBe(s.totalTax);
  });

  it("M-2 ★ 카드 자진말소 → 2호 아님 → 중과 2주택(783,678,500) + 자진말소 확인 필요 고지", async () => {
    const s = await single(cancelledCard("voluntary"));
    expect(mh(s).surchargeType).toBe("multi_house_2");
    expect(s.totalTax).toBe(783_678_500);
    const n = cancelNotice(s);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("임대주택 1호: 자진말소(민간임대주택에 관한 특별법 §6 ① 11호)");
    expect(n[0]).toContain("소득세법 시행령 §167의3①2호 사목");
  });

  it("M-3 ★ 카드 말소 사유 미선택 → 2호 아님(모름 = 불리) → 중과 2주택 + 「자동말소」를 고르라는 확인 필요 고지", async () => {
    const s = await single(cancelledCard(""));
    expect(mh(s).surchargeType).toBe("multi_house_2");
    const n = cancelNotice(s);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("임대주택 1호: 임대사업자 등록이 말소됐는데 말소 사유를 고르지 않아");
    expect(n[0]).toContain("소득세법 시행령 §167의3①2호 단서");
  });

  it("M-4 짝 — 자동말소여도 면제되는 것은 기간뿐: 임대개시일 기준시가 7억(수도권 6억 초과)이면 2호 아님 · 고지 없음(사유가 결론을 가르지 않음)", async () => {
    for (const reason of ["auto", "voluntary"] as const) {
      const s = await single(cancelledCard(reason, { standardPriceAtRentalStart: RENTAL_UNIT_CAP_FAIL }));
      expect(mh(s).surchargeType).toBe("multi_house_2");
      expect(cancelNotice(s)).toEqual([]);
    }
  });

  it("M-5 짝 — 자동말소는 법률 제17482호(2020.8.18. 시행)로 생겼다: 그 전 말소일이면 간주하지 않는다", async () => {
    const s = await single(cancelledCard("auto", { registrationCancellationDate: "2020-08-17" }));
    expect(mh(s).surchargeType).toBe("multi_house_2");
  });

  it("M-6 ★ 명부 행 — 「임대사업자 말소일」 + 자동말소면 2호(10호 배제), 미선택·자진말소면 중과 2주택 + 확인 필요 고지", async () => {
    const roster = (reason: "" | "auto" | "voluntary") =>
      single(form([cancelledRow(reason)], { contractTotalPrice: "1,500,000,000" }));
    const auto = await roster("auto");
    expect(mh(auto).surchargeType).toBe("none");
    expect(mh(auto).exclusionReasons.map((x) => x.type)).toEqual(["only_general_two_house"]);
    const none = await roster("");
    expect(mh(none).surchargeType).toBe("multi_house_2");
    expect(cancelNotice(none)[0]).toContain("주택 h4: 임대사업자 등록이 말소됐는데 말소 사유를 고르지 않아");
    const vol = await roster("voluntary");
    expect(mh(vol).surchargeType).toBe("multi_house_2");
    expect(cancelNotice(vol)[0]).toContain("주택 h4: 자진말소");
  });

  it("M-7 ④ — 말소 사유는 말소 토글·말소일이 있을 때만 보낸다(카드 · 명부)", async () => {
    const card = await bodyOf(() => callTransferTaxAPI(cancelledCard("auto")));
    expect(((card.rentalHousingException as Obj).rentalUnits as Obj[])[0].terminationReason).toBe("auto");
    const off = cancelledCard("auto", { rentalAutoTermination: false });
    const offBody = await bodyOf(() => callTransferTaxAPI(off));
    expect(((offBody.rentalHousingException as Obj).rentalUnits as Obj[])[0].terminationReason).toBeUndefined();
    const rowBody = await bodyOf(() => callTransferTaxAPI(form([cancelledRow("auto", { rentalCancelledDate: "" })])));
    expect(((rowBody.houses as Obj[]).find((h) => h.id === "h4") as Obj).rentalCancellationReason).toBeUndefined();
  });
});
