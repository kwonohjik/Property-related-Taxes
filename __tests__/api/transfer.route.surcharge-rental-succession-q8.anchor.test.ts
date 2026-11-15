/**
 * Q-8 — 다주택 명부 장기임대 행(소령 §167의3①2호) 임대사업 승계: 상속·동일세대원 증여·포괄양수.
 * 계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` Q-8. 명부 행 폼 → ④ → ⑫ → ⑭ → 엔진 `houseRegistrationBasis`.
 *
 * 시료: 강남 일반주택(2013 취득 · 3억 → 20억) 2022-03-01 양도 + h2 가목 임대 + h3 가목 임대(2017 등록) = 3주택.
 * (2주택이면 일시적 2주택 배제가 결과를 덮는다 — 실측.) h2가 장기임대주택이면 h3과 함께 빠져 중과 없음 633,682,500,
 * 아니면 3주택 중과 1,328,497,500(h2를 일반주택으로 둔 대조와 같다).
 *
 * 근거: 서면-2020-법규재산-1959 질의1(피상속인 2018.3.31. 이전 사업자등록등 → 가목) · 기준-2020-법령해석재산-0296(1세대 기준) ·
 * 기획재정부 재산세제과-1591 질의2(동일세대원 증여 → 중과배제 가능) · 기준-2021-법무재산-0225(포괄양수 → 전 소유자 임대기간 합산).
 * 수정 전 실측(2026-11-15): 상속인 날짜 2019 + 피상속인 39개월 1,328,497,500 · 피상속인 날짜를 주 칸에 넣으면 633,682,500 ·
 * 동일세대 증여 수증자 날짜 1,328,497,500 / 증여자 날짜 633,682,500.
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
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
const GANGNAM = "1168010100";

const rental = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2019-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  isRegisteredRental: true,
  rentalType: "E",
  businessRegistrationDate: "2019-02-01",
  rentalRegistrationDate: "2019-02-01",
  rentalStartDate: "2019-02-01",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  isExcluded918Rule: true,
  hasContractDepositProof: false,
  ...over,
});

function form(h2: HouseEntry, o: { transferDate?: string; extra?: HouseEntry[] } = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2013-06-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: o.transferDate ?? "2022-03-01",
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(2 + (o.extra?.length ?? 0)),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses: [h2, ...(o.extra ?? [])],
  });
}

async function bodyOf(f: Form): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
async function run(f: Form): Promise<{ totalTax: number; surcharge: unknown; reasons: string; body: Obj; warnings: string[] }> {
  const body = await bodyOf(f);
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withIdentityStdInBody(body)),
    }),
  );
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as
    | { surchargeType?: string; exclusionReasons: { type: string }[]; warnings: string[] }
    | undefined;
  return {
    warnings: mh?.warnings ?? [],
    totalTax: r.totalTax as number,
    surcharge: mh?.surchargeType,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    body,
  };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());





import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { buildSellingRentalPayload } from "@/lib/calc/transfer-tax-api-houses";

const dates = (d: string) => ({ businessRegistrationDate: d, rentalRegistrationDate: d, rentalRegisteredDate: d, rentalStartDate: d });
const ga = (o: Partial<HouseEntry> = {}) => rental({ rentalType: "A", isExcluded918Rule: false, ...o });
const h3 = () => rental({ id: "h3", acquisitionDate: "2016-01-01", rentalType: "A", isExcluded918Rule: false, ...dates("2017-01-02") });
const three = (h2: HouseEntry) => form(h2, { extra: [h3()] });
const NONE = 633_682_500;
const SURCHARGE = 1_328_497_500;

/** 상속: 피상속인 2016-03-01 등록 → 2019-06-01 상속 · 상속인 등록·임대개시 2019-06-01 · 피상속인 39개월 */
const inherited = (o: Partial<HouseEntry> = {}) =>
  ga({
    acquisitionDate: "2019-06-01",
    ...dates("2019-06-01"),
    rentalSuccession: "inheritance",
    decedentRentalMonths: "39",
    predecessorBusinessRegistrationDate: "2016-03-01",
    predecessorRentalRegistrationDate: "2016-03-01",
    ...o,
  });
/** 동일세대원 증여: 증여자 2016-04-01 등록 → 2021-11-01 증여 · 수증자 등록·임대개시 2021-12-01 · 증여자 67개월 */
const gifted = (o: Partial<HouseEntry> = {}) =>
  ga({
    acquisitionDate: "2021-11-01",
    ...dates("2021-12-01"),
    rentalSuccession: "household_gift",
    decedentRentalMonths: "67",
    predecessorBusinessRegistrationDate: "2016-04-01",
    predecessorRentalRegistrationDate: "2016-04-01",
    ...o,
  });

const has = (ws: string[], s: string) => ws.some((w) => w.includes(s));

describe("Q-8 상속", () => {
  it("S-1 ★ 상속인 2019 등록 + 피상속인 2016 등록 → 가목 · 중과 없음 633,682,500 (종전 1,328,497,500) + 피상속인 판정 고지", async () => {
    const r = await run(three(inherited()));
    expect((r.body.houses as Obj[])[1]).toMatchObject({
      rentalSuccession: "inheritance",
      decedentRentalMonths: 39,
      predecessorRegistration: { businessRegistrationDate: "2016-03-01", rentalRegistrationDate: "2016-03-01" },
    });
    expect(r.totalTax).toBe(NONE);
    expect(r.surcharge).toBe("none");
    expect(has(r.warnings, "목·등록기한을 피상속인 등록(사업자등록 2016-03-01")).toBe(true);
  });
  it("S-2 짝 — 피상속인 날짜 비움 → 상속인 날짜로 판정(칸 신설 전과 같음) 1,328,497,500 + 확인 필요", async () => {
    const r = await run(three(inherited({ predecessorBusinessRegistrationDate: undefined, predecessorRentalRegistrationDate: undefined })));
    expect((r.body.houses as Obj[])[1].predecessorRegistration).toBeUndefined();
    expect(r.totalTax).toBe(SURCHARGE);
    expect(has(r.warnings, "피상속인 등록일을 넣지 않아")).toBe(true);
  });
  it("S-3 옛 기록 — `isInheritedRental`만 있는 행도 상속으로 읽어 같은 결과(④ rentalSuccession: inheritance)", async () => {
    const legacy = inherited({ rentalSuccession: undefined, isInheritedRental: true, predecessorBusinessRegistrationDate: undefined, predecessorRentalRegistrationDate: undefined });
    const r = await run(three(legacy));
    expect((r.body.houses as Obj[])[1]).toMatchObject({ rentalSuccession: "inheritance", decedentRentalMonths: 39 });
    expect(r.totalTax).toBe(SURCHARGE);
  });
});

describe("Q-8 동일세대원 증여", () => {
  it("S-4 ★ 수증자 2021 등록 + 증여자 2016 등록 → 가목 · 633,682,500 (종전 1,328,497,500) + 확인 필요 고지", async () => {
    const r = await run(three(gifted()));
    expect((r.body.houses as Obj[])[1]).toMatchObject({
      rentalSuccession: "household_gift",
      predecessorRegistration: { businessRegistrationDate: "2016-04-01", rentalRegistrationDate: "2016-04-01" },
    });
    expect(r.totalTax).toBe(NONE);
    expect(has(r.warnings, "목·등록기한을 증여자 등록(사업자등록 2016-04-01")).toBe(true);
    expect(has(r.warnings, "등록기한을 증여자 기준으로 본 정면 해석은 확인하지 못했습니다(확인 필요)")).toBe(true);
  });
  it("S-5 ⑧ 증여자 날짜 없음 → 막는다 · ⑫ 직접 API도 400", async () => {
    const f = three(gifted({ predecessorBusinessRegistrationDate: undefined, predecessorRentalRegistrationDate: undefined }));
    expect(collectStep1Issues(f).some((i) => i.message.includes("증여자 사업자 등록일을 입력하세요"))).toBe(true);
    const body = await bodyOf(f);
    const res = await SINGLE(
      new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)) }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("predecessorRegistration");
  });
});

describe("Q-8 포괄양수", () => {
  it("S-6 전 임대사업자 개월은 싣고 목은 본인 날짜 → 1,328,497,500 + 확인 필요 · 남은 전 사업자 날짜는 싣지 않는다", async () => {
    const r = await run(three(gifted({ rentalSuccession: "assumption" })));
    const row = (r.body.houses as Obj[])[1];
    expect(row).toMatchObject({ rentalSuccession: "assumption", decedentRentalMonths: 67 });
    expect(row.predecessorRegistration).toBeUndefined();
    expect(r.totalTax).toBe(SURCHARGE);
    expect(has(r.warnings, "포괄양수한 장기임대주택")).toBe(true);
  });
  it("S-7 ⑫ 포괄양수에 전 사업자 등록을 실으면 400", async () => {
    const body = await bodyOf(three(gifted({ rentalSuccession: "assumption" })));
    (body.houses as Obj[])[1].predecessorRegistration = { businessRegistrationDate: "2016-04-01", rentalRegistrationDate: "2016-04-01" };
    const res = await SINGLE(
      new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Q-8 대조·양도 주택", () => {
  it("S-8 승계 없음 → 고지 없음 · 승계 필드 없음", async () => {
    const r = await run(three(ga({ acquisitionDate: "2015-01-01", ...dates("2016-03-01") })));
    expect((r.body.houses as Obj[])[1].rentalSuccession).toBeUndefined();
    expect(r.totalTax).toBe(NONE);
    expect(has(r.warnings, "임대사업 승계") || has(r.warnings, "피상속인") || has(r.warnings, "증여자 등록")).toBe(false);
  });
  it("S-9 양도 주택 2호 선언도 같은 leaf로 싣는다(④)", () => {
    expect(
      buildSellingRentalPayload({
        isLongTermRental: true,
        rentalSuccession: "household_gift",
        decedentRentalMonths: "12",
        predecessorBusinessRegistrationDate: "2016-04-01",
        predecessorRentalRegistrationDate: "2016-04-02",
      }),
    ).toMatchObject({
      rentalSuccession: "household_gift",
      decedentRentalMonths: 12,
      predecessorRegistration: { businessRegistrationDate: "2016-04-01", rentalRegistrationDate: "2016-04-02" },
    });
  });
});
