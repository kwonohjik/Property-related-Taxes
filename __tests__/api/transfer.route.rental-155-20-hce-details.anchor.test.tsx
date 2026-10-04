/**
 * anchor — §155⑳ 거주주택 특례 경로(`runRentalHousingExceptionStep`, 조기반환)도 §99의4·§98의9 주택 수 제외 판정
 * (`new994Detail`·`unsold989Detail`·`houseCountExclusionDetails`)을 결과에 싣고, 결과 화면에 그 카드가 뜬다.
 * route 경유(Zod 포함) · 단건 = 다건 · 세액 불변.
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 — #1961 「알게 된 것(범위 밖)」의 별건(사용자 결정
 * 2026-10-04 「별건으로 진행」). #1961은 같은 반환에 `specialHouseExclusionDetail`만 실었다.
 *
 * 세 필드는 STEP 0.9 `runHouseCountExclusionStep`(`transfer-tax-house-exclusion-step.ts`)이 만들고 일반 경로는
 * `finalizeTransferTax`·`buildExemptEarlyResult` 등이 싣는다. §155⑳ 특례 경로는 조기반환이라 넘겨받지 않으면
 * 단건·다건 결과 화면에서 `New994DetailCard`·`Unsold989DetailCard`가 사라진다(수정 전 세 필드 모두 `undefined` 실측).
 *
 * 시료: 강남 · 2015 취득 · 2026-09-18 양도 20억 · fallback 세율 · §155⑳ 가목(#1949·MS-1 시료와 같은 임대 카드).
 * 「일반 경로」 짝 = 같은 명부에서 §155⑳ 특례만 끈 입력(STEP 0.9 판정은 임대 특례와 무관하다).
 *
 * | # | 명부 | 세액(수정 전 = 후) | 수정 전 단건·다건 | 수정 후 |
 * |---|---|---|---|---|
 * | RH-1 | (a) §99의4 농어촌 + 장기임대 | 102,086,600 | 세 필드 없음 · 카드 없음 | 일반 경로와 같은 값 |
 * | RH-2 | (b) §98의9 미분양 + 장기임대 | 102,086,600 | 〃 | 〃 |
 * | RH-3 | (c) §99의4 + §98의9 + 장기임대 — `houseCountExclusionDetails` 2건 | 102,086,600 | 〃 | 〃 |
 * | RH-4 | (음성) 장기임대만 | 102,086,600 | 없음 | 없음 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const EUMSEONG = "4377037000"; // 충북 음성군 (수도권 밖 · 광역시 아님)
const FIELDS = ["new994Detail", "unsold989Detail", "houseCountExclusionDetails"] as const;
/** §155⑳ 특례 적용 후 세액 — 수정 전 실측값과 같다(표시 전용 수정) */
const RH_TAX = 102_086_600;
const RURAL_TITLE = "§99의4 — 농어촌주택 소유주택 제외";
const UNSOLD_TITLE = "§98의9 — 준공후미분양주택 소유주택 제외";

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

/** §155⑳ 거주주택 특례 — 가목 장기일반민간임대(2019.3.1. 등록) · 거주 48개월 (#1949·MS-1 시료) */
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

const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };

/** (a) §99의4 농어촌주택 명부 행 — 취득 당시 기준시가 2.5억 · 2020 취득 (HV-3 시료) */
const RURAL_ROW: HouseEntry = {
  ...ROW,
  id: "h5",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2020-01-01",
  officialPrice: "400000000",
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
};
/** (b) §98의9 명부 행 — 수도권 밖 · 취득가 5억 · 85㎡ 이하 · 2025-03-01 취득 (HV-1 시료) */
const UNSOLD_ROW: HouseEntry = {
  ...ROW,
  id: "h3",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2025-03-01",
  officialPrice: "400000000",
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  countExclusion: {
    kind: "reduction",
    reduction: {
      type: "unsold_98_9",
      unsoldHouseAcquisitionDate: "",
      unsoldHouseAcquisitionPrice: "",
      unsoldHouseExclusiveArea: "",
      isNonCapitalRegion: true,
      wasOneHouseholdAtAcquisition: true,
      meetsSellerAndContractRequirement: true,
    } as unknown as RowCountExclusionReduction,
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

interface Out {
  single: TransferTaxResult & Obj;
  multi: PerPropertyBreakdown & Obj;
  multiTotalTax: number;
}
async function run(f: Form): Promise<Out> {
  const sres = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const sj = (await sres.json()) as { data: { result: Out["single"] } };
  expect(sres.status, JSON.stringify(sj).slice(0, 400)).toBe(200);
  const mf = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const mbody = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const mres = await post(MULTI, "http://l/api/calc/transfer/multi", mbody);
  const mj = (await mres.json()) as { data: { totalTax: number; properties: Out["multi"][] } };
  expect(mres.status, JSON.stringify(mj).slice(0, 400)).toBe(200);
  return { single: sj.data.result, multi: mj.data.properties[0], multiTotalTax: mj.data.totalTax };
}
const pick = (o: Obj) => Object.fromEntries(FIELDS.map((k) => [k, o[k]]));

/** §155⑳ 특례 경로를 탔는가 + 세액 불변 + 단건 = 다건 세액 */
function expectRentalPathTax(r: Out) {
  expect(r.single.rentalHousingExceptionDetail?.applied).toBe(true);
  expect(r.single.totalTax).toBe(RH_TAX);
  expect(r.multiTotalTax).toBe(RH_TAX);
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("RH route — §155⑳ 경로 반환에 §99의4·§98의9 판정이 실린다(일반 경로와 같은 값 · 단건 = 다건)", () => {
  it("RH-1 (a) §99의4 농어촌 명부 행 + §155⑳", async () => {
    const rows = [RURAL_ROW, RENTAL_ROW];
    const r = await run(withRental(form(rows)));
    const g = await run(form(rows));
    expectRentalPathTax(r);
    expect(r.single.new994Detail).toMatchObject({ id: "new_99_4_rural", isEligible: true, houseId: "h5" });
    expect(r.single.unsold989Detail).toBeUndefined();
    expect(r.single.houseCountExclusionDetails?.map((d) => d.id)).toEqual(["new_99_4_rural"]);
    expect(pick(r.single)).toEqual(pick(g.single));
    expect(pick(r.multi)).toEqual(pick(r.single));
  });

  it("RH-2 (b) §98의9 미분양 명부 행 + §155⑳", async () => {
    const rows = [UNSOLD_ROW, RENTAL_ROW];
    const r = await run(withRental(form(rows)));
    const g = await run(form(rows));
    expectRentalPathTax(r);
    expect(r.single.unsold989Detail).toMatchObject({ id: "unsold_98_9", isEligible: true, houseId: "h3" });
    expect(r.single.new994Detail).toBeUndefined();
    expect(r.single.houseCountExclusionDetails?.map((d) => d.id)).toEqual(["unsold_98_9"]);
    expect(pick(r.single)).toEqual(pick(g.single));
    expect(pick(r.multi)).toEqual(pick(r.single));
  });

  it("RH-3 (c) §99의4 + §98의9 명부 행 + §155⑳ — 선언 전건(`houseCountExclusionDetails`) 2건", async () => {
    const rows = [RURAL_ROW, UNSOLD_ROW, RENTAL_ROW];
    const r = await run(withRental(form(rows)));
    const g = await run(form(rows));
    expectRentalPathTax(r);
    expect(r.single.houseCountExclusionDetails?.map((d) => [d.id, (d as { houseId?: string }).houseId])).toEqual([
      ["new_99_4_rural", "h5"],
      ["unsold_98_9", "h3"],
    ]);
    expect(pick(r.single)).toEqual(pick(g.single));
    expect(pick(r.multi)).toEqual(pick(r.single));
  });

  it("RH-4 (음성) 장기임대 행만 — 세 필드 모두 없음(단건·다건)", async () => {
    const r = await run(withRental(form([RENTAL_ROW])));
    expectRentalPathTax(r);
    for (const k of FIELDS) {
      expect(r.single[k], k).toBeUndefined();
      expect(r.multi[k], k).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("RH 결과 화면 — 단건 결과뷰·다건 건별 상세에 카드가 뜬다(route 응답 그대로 렌더)", () => {
  const property = (f: Form) => ({ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }) as PropertyItem;

  it("RC-1 (c) 단건 `TransferTaxResultView` — §99의4·§98의9 카드 + 그 명부의 「보유 주택 N」", async () => {
    const f = withRental(form([RURAL_ROW, UNSOLD_ROW, RENTAL_ROW]));
    const { single } = await run(f);
    render(<TransferTaxResultView result={single} formData={f} onReset={() => {}} onBack={() => {}} />);
    expect(screen.getByText(RURAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText(UNSOLD_TITLE)).toBeInTheDocument();
    expect(screen.getByText("대상: 보유 주택 1 (2020-01-01 취득)")).toBeInTheDocument();
    expect(screen.getByText("대상: 보유 주택 2 (2025-03-01 취득)")).toBeInTheDocument();
  });

  it("RC-2 (c) 다건 건별 상세 `PropertyBreakdownAccordion` — 같은 카드 2장", async () => {
    const f = withRental(form([RURAL_ROW, UNSOLD_ROW, RENTAL_ROW]));
    const { multi } = await run(f);
    render(<PropertyBreakdownAccordion breakdown={multi} property={property(f)} />);
    expect(screen.getByText(RURAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText(UNSOLD_TITLE)).toBeInTheDocument();
    expect(screen.getByText("대상: 보유 주택 1 (2020-01-01 취득)")).toBeInTheDocument();
  });

  it("RC-3 (음성) 장기임대 행만 — 단건·다건 모두 카드 없음", async () => {
    const f = withRental(form([RENTAL_ROW]));
    const { single, multi } = await run(f);
    render(
      <>
        <TransferTaxResultView result={single} formData={f} onReset={() => {}} onBack={() => {}} />
        <PropertyBreakdownAccordion breakdown={multi} property={property(f)} />
      </>,
    );
    expect(screen.queryByText(RURAL_TITLE)).toBeNull();
    expect(screen.queryByText(UNSOLD_TITLE)).toBeNull();
  });
});
