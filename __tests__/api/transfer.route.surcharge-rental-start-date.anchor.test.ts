/**
 * anchor — 다주택 중과배제 장기임대주택(소령 §167의3①2호) 임대개시일 → ④ → ⑫ → ⑭ → 엔진 왕복
 * (계획서 `docs/01-plan/features/surcharge-rental-period-dates.plan.md`).
 *
 * | # | 주장 |
 * |---|---|
 * | RD-1 | ④는 임대개시일·종료일·피상속인 개월만 싣고 연수(옛 기록 값)는 싣지 않는다 |
 * | RD-2 ★ | 양도 주택 2호(유형 미선택) · 개시 2019-01-01 · 등록 2023-01-01 · 양도 2026-08-01 → 3년 7개월(등록일부터) → 중과(미선언과 같은 세액) |
 * | RD-3 ★ | 같은 입력 · 등록 2018-01-01 → 7년 7개월 → 2호 중과배제 |
 * | RD-4 | 상속 — 등록 2023-01-01이라도 피상속인 24개월을 더하면 5년 이상 → 중과배제 |
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
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry, RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";

const general = (id: string): HouseEntry => ({
  id,
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

function form(ltr: RentalDeclaration): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "1995-03-01",
    fixedAcquisitionPrice: "100,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: "2026-08-01",
    contractTotalPrice: "1,500,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses: [general("h2")],
    sellingHouseExclusion: { longTermRental: { isLongTermRental: true, isApartment: true, ...ltr } },
  });
}

const reg = (d: string): RentalDeclaration => ({
  isRegisteredRental: true,
  rentalRegistrationDate: d,
  businessRegistrationDate: d,
  rentalStartDate: "2019-01-01",
});

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

async function totalTax(f: Form): Promise<number> {
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(f)),
    }),
  );
  const json = (await res.json()) as Obj;
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return ((json.data as Obj).result as Obj).totalTax as number;
}

const sellingRow = (b: Obj) => ((b.houses as Obj[]) ?? []).find((h) => h.isLongTermRental === true) as Obj;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("중과배제 2호 임대개시일 왕복", () => {
  it("RD-1 ④ — 날짜만 싣고 연수는 싣지 않는다 · 상속 토글 OFF면 피상속인 개월도 싣지 않는다", async () => {
    const b = await bodyOf(
      form({ ...reg("2018-01-01"), rentalEndDate: "2026-07-01", rentalPeriodYears: "9", decedentRentalMonths: "24" }),
    );
    const row = sellingRow(b);
    expect(row.rentalStartDate).toBe("2019-01-01");
    expect(row.rentalEndDate).toBe("2026-07-01");
    expect(row.rentalPeriodYears).toBeUndefined();
    expect(row.decedentRentalMonths).toBeUndefined();
  });

  it("RD-2 ★ 등록 2023-01-01 → 등록일부터 3년 7개월 → 2호 불성립(미선언과 같은 중과 세액 926,678,500)", async () => {
    const f = form(reg("2023-01-01"));
    // ⑧ 임대 칸 관련 차단 없음(이 픽스처의 다른 step1 문구 — 분양권 확인·거주 구간 — 는 route 400과 무관)
    expect(collectStep1Issues(f).some((i) => /임대/.test(i.message))).toBe(false);
    expect(await totalTax(f)).toBe(926_678_500);
  });

  it("RD-3 ★ 등록 2018-01-01 → 7년 7개월 → 2호 중과배제", async () => {
    const f = form(reg("2018-01-01"));
    expect(await totalTax(f)).toBeLessThan(926_678_500);
  });

  it("RD-4 상속 — 등록 2023-01-01 + 피상속인 24개월 → 5년 7개월 → 중과배제(RD-3과 같은 세액)", async () => {
    const inherited = await totalTax(form({ ...reg("2023-01-01"), isInheritedRental: true, decedentRentalMonths: "24" }));
    expect(inherited).toBe(await totalTax(form(reg("2018-01-01"))));
  });

  it("⑧ 상속 토글 ON + 개월 미입력은 막는다", () => {
    const f = form({ ...reg("2023-01-01"), isInheritedRental: true });
    expect(collectStep1Issues(f).some((i) => i.message.includes("피상속인 임대기간(개월)"))).toBe(true);
  });
});
