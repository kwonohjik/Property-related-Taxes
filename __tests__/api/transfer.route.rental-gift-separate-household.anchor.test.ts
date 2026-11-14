/**
 * S-4 — 별도세대에서 증여받기 전에 증여자의 임대사업자 등록이 말소된 주택은 장기임대주택(소령 §167의3①2호)으로 보지 않는다
 * (교재 329쪽 · 계획서 `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md` §14). 동일세대원 증여는 종전대로
 * (기획재정부 재산세제과-1591 → 서면-2021-법규재산-4283). 별도세대 정면 해석은 확인하지 못했다 — 결론이 갈리면 확인 필요 고지.
 * 폼 → ④ → ⑫ → ⑭ → 엔진 `isSeparateHouseholdGiftOfCancelledRental`.
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


const NOTICE = "별도세대에서 증여받기 전에 증여자의 임대사업자 등록이 말소된 주택이라";
/** 가목 다세대 · 증여자 2017-01-02 두 등록 · 3억 */
const ga = (o: Partial<HouseEntry> = {}) =>
  rental({
    rentalType: "A",
    acquisitionDate: "2016-01-01",
    businessRegistrationDate: "2017-01-02",
    rentalRegistrationDate: "2017-01-02",
    rentalStartDate: "2017-01-02",
    isExcluded918Rule: false,
    ...o,
  });

describe("S-4 명부 행 — 강남 일반주택(2013 취득) 2022-03-01 양도 · h2 = 2022-02-01 증여받은 가목(2021-01-02 자동말소) · h3 = 가목 2017 등록", () => {
  const h2 = (g?: "same" | "separate") =>
    ga({ acquisitionDate: "2022-02-01", rentalCancelledDate: "2021-01-02", rentalCancellationReason: "auto", rentalGiftDonorHousehold: g });
  it("G-1 ★ 별도세대 → 장기임대주택 아님 · 3주택 중과 1,328,497,500 + 확인 필요 고지 (종전 633,682,500)", async () => {
    const r = await run(form(h2("separate"), { extra: [ga({ id: "h3" })] }));
    expect((r.body.houses as Obj[])[1]).toMatchObject({ rentalGiftDonorHousehold: "separate" });
    expect(r).toMatchObject({ totalTax: 1_328_497_500, surcharge: "multi_house_3plus" });
    expect(r.warnings.some((w) => w.includes(NOTICE) && w.includes("확인 필요"))).toBe(true);
  });
  it("G-2 짝 — 동일세대원 → 종전대로 633,682,500 · 고지 없음", async () => {
    const r = await run(form(h2("same"), { extra: [ga({ id: "h3" })] }));
    expect(r).toMatchObject({ totalTax: 633_682_500, surcharge: "none" });
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });
  it("G-3 짝 — 미답(아니오) → 633,682,500", async () => {
    expect(await run(form(h2(), { extra: [ga({ id: "h3" })] }))).toMatchObject({ totalTax: 633_682_500, surcharge: "none" });
  });
  it("G-4 짝 — 말소일이 증여 뒤(수증자 자신의 등록 말소) → 별도세대여도 종전대로", async () => {
    const r = await run(
      form(ga({ rentalCancelledDate: "2021-01-02", rentalCancellationReason: "auto", rentalGiftDonorHousehold: "separate" }), {
        extra: [ga({ id: "h3" })],
      }),
    );
    expect(r).toMatchObject({ totalTax: 633_682_500, surcharge: "none" });
  });
});

describe("S-4 양도 주택 자신 — 2021-03-01 증여받은 가목(증여자 2017 등록 · 2021-01-02 자동말소) 2026-07-01 양도 · 다른 주택 일반", () => {
  const f = (g?: "separate") => {
    const x = form(
      rental({ isLongTermRental: false, isRegisteredRental: false, rentalType: undefined, acquisitionDate: "2010-01-01" }),
      { transferDate: "2026-07-01" },
    );
    x.assets[0] = { ...x.assets[0], acquisitionDate: "2021-03-01" };
    return Object.assign(x, {
      sellingHouseExclusion: {
        longTermRental: {
          isLongTermRental: true,
          isApartment: false,
          isRegisteredRental: true,
          rentalType: "A" as const,
          businessRegistrationDate: "2017-01-02",
          rentalRegistrationDate: "2017-01-02",
          rentalRegisteredDate: "2017-01-02",
          rentalStartDate: "2017-01-02",
          rentalStartOfficialPrice: "300000000",
          rentIncreaseUnder5Pct: true,
          rentalCancelledDate: "2021-01-02",
          rentalCancellationReason: "auto" as const,
          rentalGiftDonorHousehold: g,
        },
      },
    });
  };
  it("G-5 ★ 별도세대 → 2호 아님 · 2주택 중과 1,141,178,500 (종전 683,578,500)", async () => {
    const r = await run(f("separate"));
    expect((r.body.houses as Obj[]).find((h) => h.id === "selling")).toMatchObject({ rentalGiftDonorHousehold: "separate" });
    expect(r).toMatchObject({ totalTax: 1_141_178_500, surcharge: "multi_house_2" });
  });
  it("G-6 짝 — 미답 → 683,578,500 · 장기임대주택 배제", async () => {
    expect(await run(f())).toMatchObject({ totalTax: 683_578_500, surcharge: "none", reasons: "long_term_rental_house" });
  });
});
