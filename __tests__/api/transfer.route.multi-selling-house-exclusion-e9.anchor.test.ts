/**
 * E-9 — 다건 합산(`/api/calc/transfer/multi`)이 **양도 주택 자신의** 중과 배제 사실(`sellingHouseExclusion`)을
 * 단건과 **같은 빌더**로 싣는다. 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.3 E-9.
 *
 * 다건 편집 화면은 단건 계산기를 그대로 마운트한다 — `HousesListSection`의 세 섹션
 * (`SellingHouseExclusionSection`·`SellingHouseTwoHouseExclusionSection`·
 * `SellingHouseLongTermRentalSection`)이 `hideSellingHouseExclusion` 없이 **그대로 뜬다**. ⑫(`houseSchema`)·
 * ⑭(`mapHousesToEngine`)는 두 route가 공유한다. 그런데 ⑬(`buildPropertyPayload`)만 `selling` 행을 손으로
 * 만들며 장기임대(`longTermRental`) 하나만 옮겨, 나머지 선언(§167의3①4·5·6·8·8의2호 · §167의10①3·7호
 * 등)이 합산 계산에서 조용히 사라졌다.
 *
 * ⇒ 단건 ④의 `buildHousesPayload`를 다건도 부른다(명부 행은 B1에서 이미 공유 — `buildOtherHousesPayload`).
 *
 * 🔑 판정은 **route를 통과시켜** 관측한다(`feedback_leaf_anchor_skips_zod_layer`). 각 배제마다
 *    [대조군] 배제 없음 세액과 **달라야** 한다(시료가 그 호를 실제로 태우는지 — 부정·긍정 짝).
 *    세율은 프로덕션 fallback(`loadFallbackTransferRates`) — 중과가 실제로 걸리는 연혁.
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
import { buildPropertyPayload, callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Exclusion = NonNullable<Form["sellingHouseExclusion"]>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
/** 서울 강남구 역삼동 — 양도일 현재 조정대상지역. */
const GANGNAM = "1168010100";

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

/** 조정지역 양도 주택 · 거주 0 · 8억 양도 — 명부 `others`채 + 양도 주택 = 세대 주택 수. */
function form(others: number, se?: Exclusion, acquisitionDate = "2015-01-01"): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate,
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "800,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(others + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    houses: Array.from({ length: others }, (_, i) => ({ ...ROW, id: `h${i + 2}` })),
    ...(se ? { sellingHouseExclusion: se } : {}),
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

interface Verdict {
  isExempt: boolean;
  totalTax: number;
}

async function single(f: Form): Promise<Verdict> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  expect(res.status).toBe(200);
  const r = ((await res.json()) as { data: { result: Verdict } }).data.result;
  return { isExempt: r.isExempt, totalTax: r.totalTax };
}
async function multi(f: Form): Promise<Verdict> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  expect(res.status).toBe(200);
  const d = ((await res.json()) as {
    data: { totalTax: number; properties: { isExempt: boolean }[] };
  }).data;
  return { isExempt: d.properties[0].isExempt, totalTax: d.totalTax };
}

const sellingOf = (houses: unknown) => (houses as Obj[]).find((h) => h.id === "selling");

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 3주택+ 전용(§167의3①) — 명부 2채. 저당권 실행은 취득 후 3년 내 양도라야 태워진다. */
const THREE_PLUS: [string, Exclusion, string?][] = [
  ["저당권 실행 취득 3년 내(§167의3①8호)", { isMortgageExecution: true }, "2024-06-01"],
  ["사원용 주택 10년 이상(§167의3①4호)", { isEmployeeHousing: true, freeProvisionYears: "12" }],
  ["조특법 특례 주택(§167의3①5호)", { isTaxSpecialExemption: true }],
  ["국가유산주택(§167의3①6호)", { isCulturalHeritage: true }],
  ["어린이집 5년 이상(§167의3①8호의2)", { isDayCareCenter: true, dayCareOperationYears: "6" }],
  [
    "장기임대 등록 완비 6년(§167의3①2호)",
    {
      longTermRental: {
        isLongTermRental: true,
        isRegisteredRental: true,
        rentalRegistrationDate: "2017-01-01",
        businessRegistrationDate: "2017-01-01",
        rentalPeriodYears: "6",
      },
    },
  ],
];

/** 2주택 전용(§167의10①) — 명부 1채. */
const TWO: [string, Exclusion][] = [
  [
    "부득이한 사유 취득(§167의10①3호)",
    {
      isUnavoidableReason: true,
      unavoidableResidenceYears: "2",
      unavoidableReasonResolvedDate: "2025-06-01",
      acquisitionOfficialPrice: "250,000,000",
    },
  ],
  ["소송 확정판결 3년 내(§167의10①7호)", { isLitigationHousing: true, litigationAcquisitionDate: "2024-01-01" }],
];

describe("E-9 ⑬ — 다건 `selling` 행 = 단건 `selling` 행 (같은 빌더)", () => {
  it("E9-1 배제 선언 종류마다 두 본문의 `selling` 행이 같다", async () => {
    const cases: Form[] = [
      ...THREE_PLUS.map(([, se, acq]) => form(2, se, acq)),
      ...TWO.map(([, se]) => form(1, se)),
      form(2),
    ];
    for (const f of cases) {
      const s = sellingOf((await bodyOf(() => callTransferTaxAPI(f))).houses);
      const m = sellingOf((buildPropertyPayload(f) as Obj).houses);
      expect(s, "단건 대조군").toBeDefined();
      expect(m).toEqual(s);
    }
  });

  it("E9-2 분양권·입주권만 있고 명부가 비어도 두 경로가 같이 `houses`를 싣는다 (게이트 공유)", async () => {
    const right: PresaleRightEntry = {
      id: "r1",
      type: "presale_right",
      acquisitionDate: "2022-01-01",
      region: "capital",
    };
    const f = Object.assign(form(0), { householdHousingCount: "2", presaleRights: [right] });
    const s = await bodyOf(() => callTransferTaxAPI(f));
    const m = buildPropertyPayload(f) as Obj;
    expect(s.houses, "단건 대조군").toBeDefined();
    expect(m.houses).toEqual(s.houses);
    expect(m.sellingHouseId).toBe(s.sellingHouseId);
  });

  /**
   * `gracePeriod`의 게이트도 단건 ④·⑤·⑧과 **같은 술어**(`gracePeriodInScope`, Q03)다. 종전 다건은
   * `housesPayload && …`라 한시배제 창(2026.5.9. 이전 양도 · 보유 2년 이상) 안의 stale 값까지 실었다.
   */
  it("E9-6 한시 유예 입력 — 창 안이면 두 경로 모두 싣지 않고, 창 밖이면 둘 다 싣는다", async () => {
    const grace = { contractDate: "2026-04-01", isLandPermitTarget: false, depositReceiptConfirmed: true };
    const inWindow = Object.assign(form(1), { transferDate: "2025-06-02", gracePeriod: grace });
    const outWindow = Object.assign(form(1), { gracePeriod: grace });
    for (const [f, expected] of [
      [inWindow, undefined],
      [outWindow, grace],
    ] as const) {
      const s = await bodyOf(() => callTransferTaxAPI(f));
      const m = buildPropertyPayload(f) as Obj;
      expect(s.gracePeriod, "단건 대조군").toEqual(expected);
      expect(m.gracePeriod).toEqual(s.gracePeriod);
    }
  });
});

describe("E-9 판정 — 화면 경로(⑬→⑫→⑭)가 단건과 같다", () => {
  it("E9-3 [대조군] 배제 선언이 없으면 3주택 중과 · 2주택 중과로 단건 = 다건", async () => {
    for (const n of [2, 1]) {
      const f = form(n);
      expect(validateMultiSupportedMode(f)).toBeNull();
      expect(await multi(f)).toEqual(await single(f));
    }
  });

  it.each(THREE_PLUS)("E9-4 3주택+ %s — 단건에서 배제되고 다건도 같은 세액", async (_name, se, acq) => {
    const base = await single(form(2, undefined, acq));
    const f = form(2, se, acq);
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    // 시료가 그 호를 실제로 태운다 — 배제되지 않으면 이 비교가 무의미하다.
    expect(s.totalTax).toBeLessThan(base.totalTax);
    expect(await multi(f)).toEqual(s);
  });

  it.each(TWO)("E9-5 2주택 %s — 단건에서 배제되고 다건도 같은 세액", async (_name, se) => {
    const base = await single(form(1));
    const f = form(1, se);
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    expect(s.totalTax).toBeLessThan(base.totalTax);
    expect(await multi(f)).toEqual(s);
  });
});
