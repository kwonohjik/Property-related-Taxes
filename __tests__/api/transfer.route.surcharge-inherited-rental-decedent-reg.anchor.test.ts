/**
 * Q-8 ① — 다주택 중과 소령 §167의3①2호 가목 「2018년 3월 31일까지 사업자등록등」 × 상속받아 계속 임대하는 주택.
 * 서면-2020-법규재산-1959(법규과-1120, 2024.5.8.): 父가 2016.3. 다세대 등록(단기) → 2019.6. 상속·포괄승계·상속인 등록 →
 * 피상속인이 2018.3.31. 전에 사업자등록등을 했으면 가목을 적용한다.
 * 폼(피상속인 등록 사실 3칸) → ④ `rentalPeriodDatesPayload` → ⑫ → ⑭ → 엔진 `passesRegistrationCap`.
 *
 * | # | 주장 |
 * |---|---|
 * | I-1 ★ | 양도 주택 = 상속 가목 다세대 · 피상속인 등록 2016 → 2호 중과배제 356,631,000(수정 전 640,761,000) |
 * | I-2 | 짝 — 피상속인 칸 비움 → 상속인 2019 등록 → 2주택 중과 |
 * | I-3 | 짝 — 피상속인도 2018-05-01 등록 → 2주택 중과 |
 * | I-4 | 짝 — 상속 토글 OFF(stale 날짜) → ④가 싣지 않음 → 2주택 중과 |
 * | I-5 ★ | 명부 행 = 같은 상속 가목 다세대 · 양도 주택 = 일반주택 → 10호 배제 301,191,000(비우면 2주택 중과 640,761,000) |
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

/** 1959 사실관계 — 가목 다세대 · 상속인 등록 2019-06-20 · 피상속인 임대 39개월(2016.3.~2019.6.) */
const INHERITED: RentalDeclaration = {
  isLongTermRental: true,
  isApartment: false,
  isRegisteredRental: true,
  rentalType: "A",
  businessRegistrationDate: "2019-06-20",
  rentalRegistrationDate: "2019-06-20",
  rentalStartDate: "2019-06-20",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  isInheritedRental: true,
  decedentRentalMonths: "39",
};
const DECEDENT: RentalDeclaration = {
  decedentBusinessRegistrationDate: "2016-03-10",
  decedentRentalRegistrationDate: "2016-03-10",
  decedentRentalRegisteredDate: "2016-03-15",
};

function base(): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  return Object.assign(f, {
    transferDate: "2026-08-01",
    contractTotalPrice: "1,500,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
  });
}
/** 양도 주택 = 상속 임대주택(2019-06-15 상속) · 명부 = 일반주택 1채 */
function sellingRental(ltr: RentalDeclaration): Form {
  const f = base();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2019-06-15", fixedAcquisitionPrice: "500,000,000", regionCode: GANGNAM };
  return Object.assign(f, { houses: [general("h2")], sellingHouseExclusion: { longTermRental: ltr } });
}
/** 양도 주택 = 일반주택(2013 취득) · 명부 = 상속 임대주택 */
function rosterRental(ltr: RentalDeclaration): Form {
  const f = base();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2013-06-01", fixedAcquisitionPrice: "500,000,000", regionCode: GANGNAM };
  const h2: HouseEntry = { ...general("h2"), acquisitionDate: "2019-06-15", isApartment: false, ...ltr } as HouseEntry;
  return Object.assign(f, { houses: [h2] });
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
async function run(f: Form): Promise<{ totalTax: number; surcharge: unknown; rentalRow: Obj }> {
  const body = await bodyOf(f);
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeType?: string } | undefined;
  const rentalRow = ((body.houses as Obj[]) ?? []).find((h) => h.isLongTermRental === true) as Obj;
  return { totalTax: r.totalTax as number, surcharge: mh?.surchargeType, rentalRow };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Q-8 ① 양도 주택 = 상속 가목 다세대(1959 사실관계) · 2026-08-01 양도", () => {
  it("I-1 ★ 피상속인 등록 2016 → 2호 중과배제", async () => {
    const r = await run(sellingRental({ ...INHERITED, ...DECEDENT }));
    expect(r.rentalRow).toMatchObject(DECEDENT);
    expect(r.surcharge).toBe("none");
    expect(r.totalTax).toBe(356_631_000); // 수정 전 640,761,000(2주택 중과)
  });
  it("I-2 짝 — 피상속인 칸 비움 → 상속인 2019 등록으로 판정 → 2주택 중과", async () => {
    const r = await run(sellingRental(INHERITED));
    expect(r.rentalRow).not.toHaveProperty("decedentBusinessRegistrationDate");
    expect(r.surcharge).toBe("multi_house_2");
    expect(r.totalTax).toBe(640_761_000);
  });
  it("I-3 짝 — 피상속인도 2018-05-01 등록 → 상한 넘음 → 2주택 중과", async () => {
    const late = { decedentBusinessRegistrationDate: "2018-05-01", decedentRentalRegistrationDate: "2018-05-01", decedentRentalRegisteredDate: "2018-05-01" };
    const r = await run(sellingRental({ ...INHERITED, ...late }));
    expect(r.surcharge).toBe("multi_house_2");
  });
  it("I-4 짝 — 상속 토글 OFF(stale 피상속인 날짜) → ④가 싣지 않음 → 2주택 중과", async () => {
    const r = await run(sellingRental({ ...INHERITED, ...DECEDENT, isInheritedRental: undefined, rentalStartDate: "2016-03-10" }));
    expect(r.rentalRow).not.toHaveProperty("decedentBusinessRegistrationDate");
    expect(r.surcharge).toBe("multi_house_2");
  });
});

describe("Q-8 ① 명부 행 = 상속 가목 다세대 · 양도 주택 = 일반주택", () => {
  it("I-5 ★ 피상속인 등록 2016 → 10호 배제 / 비우면 2주택 중과", async () => {
    const withReg = await run(rosterRental({ ...INHERITED, ...DECEDENT }));
    const without = await run(rosterRental(INHERITED));
    expect(withReg.rentalRow).toMatchObject(DECEDENT);
    expect(withReg.surcharge).toBe("none");
    expect(without.surcharge).toBe("multi_house_2");
    expect(withReg.totalTax).toBe(301_191_000);
    expect(without.totalTax).toBe(640_761_000);
  });
});
