/**
 * E-14a·b·c route 관측 — 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건·다건) → 엔진 중과 배제 호.
 * leaf·엔진 anchor와 법령 근거: `__tests__/tax-engine/transfer/surcharge-deemed-clauses-e14abc.anchor.test.ts`.
 *
 * 🔑 route를 통과시켜 관측한다(`feedback_leaf_anchor_skips_zod_layer`) — 명부에서 일시적 2주택을 도출하는 ④,
 *    §155⑳ 임대주택 행 ⑫⑭, 분양권·입주권 ④⑭가 새 판정에 실제로 도달하는지.
 * 세율은 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택 2015 취득 · 20억.
 *
 * | 시료 | 수정 전 | 수정 후 | 근거 |
 * |---|---:|---:|---|
 * | 일반 + 신규(2025) + 상속(2019) | 497,046,000 | 204,355,800 | §167의3①13호 (E-14b) |
 * | 거주 + §155⑳ 임대(영 §167의3①2호 아님) | 167,360,600 | 102,086,600 | §167의10①15호 (E-14c) — 단건만(아래 ⚠️) |
 * | 주택 1 + 조합원입주권 1(3년 내) | 422,521,000 | 204,355,800 | §167의11①13호 (E-14c) |
 * | §99의2 감면주택 + 양도 주택 | 422,521,000 | 204,355,800 | §167의10①15호 (E-14a) — 다건은 모드 2 미지원(⑧ 차단) |
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
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const P20 = "2,000,000,000";

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
/** 일시적 2주택의 신규 주택 — 양도 주택(2015)보다 나중 취득 → 명부 도출이 「신규 주택」으로 고른다 */
const NEW_GANGNAM: HouseEntry = { ...ROW };
/**
 * §155② 상속주택 — 2019 상속(5년 경과 — 중과 주택 수에 산입, §167의3①7호 아님 · 양도 주택 2015는 상속개시 당시
 * 보유한 일반주택). 명부에 양도 주택보다 나중 취득한 행이 둘(신규·상속)이라 명부 도출은 신규 주택을 고르지
 * 않는다(`resolveTemporaryTwoHouse` — 억측 금지) ⇒ 일시적 2주택은 직접 선언 경로(`temporaryTwoHouseSpecial`)로 준다.
 */
const INH_OLD: HouseEntry = { ...ROW, id: "h3", isInherited: true, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01" };
/** 장기임대주택 행 — 등록 정보 없이 표시만(영 §167의3①2호 판정 불가 → §167의10①10호로 빠지지 않는다) */
const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
/** 조특법 §99의2 감면주택(명부에 감면 표시 없음) */
const SPECIAL_ROW: HouseEntry = { ...ROW, id: "h5", acquisitionDate: "2013-06-01" };

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
    contractTotalPrice: P20,
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

/** §155⑳ 거주주택 특례 선언 — 가목 장기일반민간임대(2019.3.1. 등록 — 영 §167의3①2호 가목 단서 기한 밖) */
function withRentalException(f: Form): Form {
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

async function single(f: Form): Promise<{ totalTax: number; reasons: string; rate: number }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string }[] } | undefined;
  return {
    totalTax: r.totalTax as number,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    rate: r.appliedRate as number,
  };
}
async function multiTotal(f: Form): Promise<number> {
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

/** 2주택 일시적 2주택 15호 배제와 같은 세액(E-14 E14-2) */
const DEEMED_EXCLUDED_20 = 204_355_800;

describe("E-14b §167의3①13호 — 3주택(중과) · 비과세 기준 2주택", () => {
  it("RB-1 일반 + 신규(2025) + 상속(2019) → 13호 배제 204,355,800 (수정 전 497,046,000 · 단건 = 다건)", async () => {
    const f = form([NEW_GANGNAM, INH_OLD], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" });
    expect(await single(f)).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "temporary_two_house" });
    expect(await multiTotal(f)).toBe(DEEMED_EXCLUDED_20);
  });
});

/**
 * ⚠️ §155⑳ 경로는 **단건만** 관측한다. 다건 route는 이 시료(고가 거주주택 · RH-A2)에서 수정 전·후 모두
 * 자산 소득금액을 −74,800,000(「과세대상 299,200,000 − 장특 374,000,000」과 같은 값 — 원인 미분석)으로 집계해 총세액 0을
 * 낸다(base `6e0a96ef`에서 같은 값 실측). 이 PR 범위 밖의 별건이다 — 계획서 §9.3 E-14 후속 항목.
 */
describe("E-14c §155⑳ 거주주택 — 15호", () => {
  it("RC-1 거주 + §155⑳ 임대(2호 아님) → 15호 배제 102,086,600 (수정 전 167,360,600)", async () => {
    const f = withRentalException(form([RENTAL_ROW]));
    expect(await single(f)).toMatchObject({ totalTax: 102_086_600, rate: 0.38 });
  });

  it("RC-1n 부정 짝 — 임대주택이 아닌 일반주택 행이 하나 더(§155⑳ 「그 밖의 1주택」 초과) → 3주택 중과 유지", async () => {
    const f = withRentalException(form([RENTAL_ROW, { ...ROW, id: "h6", acquisitionDate: "2012-01-01" }]));
    expect(await single(f)).toMatchObject({ totalTax: 199_997_600, rate: 0.68 });
  });
});

describe("E-14c §156의2 — §167의11①13호", () => {
  it("RR-1 주택 1 + 조합원입주권 1(2025 취득 · 3년 내) → 배제 204,355,800 (수정 전 422,521,000 · 단건 = 다건)", async () => {
    const f = form([], {
      householdHousingCount: "1",
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: "2025-01-01", region: "capital", regionCode: GANGNAM },
      ] as Form["presaleRights"],
    });
    expect(await single(f)).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "right_holding_one_house" });
    expect(await multiTotal(f)).toBe(DEEMED_EXCLUDED_20);
  });
});

describe("E-14a 조특법 감면주택 — 15호 (부동산납세과-1627)", () => {
  it("RA-1 §99의2 감면주택(보유 감면주택 모드 2) + 양도 주택 → 15호 배제 204,355,800 (수정 전 422,521,000)", async () => {
    const f = form([SPECIAL_ROW], {
      specialHouseExclusions: [
        {
          article: "unsold_99_2",
          houseAcquisitionDate: "2013-06-01",
          houseContractDate: "2013-06-01",
          isNationalHousing: false,
          requirementsConfirmed: true,
        },
      ] as Form["specialHouseExclusions"],
    });
    expect(await single(f)).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "special_act_house_exclusion" });
  });
});
