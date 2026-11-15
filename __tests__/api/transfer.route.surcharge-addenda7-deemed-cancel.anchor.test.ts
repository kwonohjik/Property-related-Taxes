/**
 * Q-3 — 다주택 중과 §167의3①2호 단서 × 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조(2020.8.18. 전 의무기간 경과 → 2020.8.18. 말소 간주).
 * 서면-2021-법규재산-6391(→ 기획재정부 재산세제과-861): 2003.03. 단기 등록 → 2020.08.18. 자동말소에도 단서 적용.
 * 명부 행 폼 → ④ → ⑫ → ⑭ → 엔진 `rentalCancellationStatus`. 같은 사실을 종료일로 넣든 2020-08-18로 넣든 세액이 같아야 한다.
 * 엔진 단위: `__tests__/tax-engine/rental-cancellation-addenda7.anchor.test.ts`.
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



const NOTICE = "부칙 제7조에 따라 2020.8.18.에 등록이 말소된 것으로 봅니다";
/** 가목 다세대 · 단기 2014-03-01 등록 · 4년 의무기간 2018-03-01 종료 · 자동말소 */
const ga = (o: Partial<HouseEntry> = {}) =>
  rental({
    rentalType: "A",
    acquisitionDate: "2013-01-01",
    businessRegistrationDate: "2014-03-01",
    rentalRegistrationDate: "2014-03-01",
    rentalStartDate: "2014-03-01",
    isExcluded918Rule: false,
    rentalCancellationReason: "auto",
    ...o,
  });

describe("Q-3 명부 행 — 강남 일반주택(2013 취득) + h2 가목 단기(2014 등록 · 2018-03-01 의무기간 종료 · 자동말소)", () => {
  it("R-1 ★ 2022-03-01 양도 · 말소일 = 종료일 2018-03-01 → 10호 배제 633,682,500 + 간주 고지 (종전 2주택 중과 1,141,772,500)", async () => {
    const r = await run(form(ga({ rentalCancelledDate: "2018-03-01" })));
    expect((r.body.houses as Obj[])[1]).toMatchObject({ rentalCancelledDate: "2018-03-01", rentalCancellationReason: "auto" });
    expect(r.totalTax).toBe(633_682_500);
    expect(r.surcharge).toBe("none");
    expect(r.reasons).toContain("only_general_two_house");
    expect(r.warnings.some((w) => w.includes(NOTICE) && w.includes("서면-2021-법규재산-6391"))).toBe(true);
  });
  it("R-2 짝 — 같은 사실을 2020-08-18로 입력 → 같은 세액 633,682,500 · 간주 고지 없음", async () => {
    const r = await run(form(ga({ rentalCancelledDate: "2020-08-18" })));
    expect(r.totalTax).toBe(633_682_500);
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });
  it("R-3 ★ 2020-05-01 양도(2020.8.18. 전) → 등록 중 = 말소일 미입력과 같은 651,057,000 (종전 932,030,000)", async () => {
    const cut = await run(form(ga({ rentalCancelledDate: "2018-03-01" }), { transferDate: "2020-05-01" }));
    const none = await run(form(ga({ rentalCancelledDate: undefined, rentalCancellationReason: undefined }), { transferDate: "2020-05-01" }));
    expect(cut.totalTax).toBe(651_057_000);
    expect(none.totalTax).toBe(651_057_000);
    expect(cut.warnings.some((w) => w.includes("아직 등록 중인 주택으로 판정했습니다"))).toBe(true);
  });
  it("R-4 짝 — 자진말소 2018-03-01 → 간주 없음 · 2주택 중과 그대로 1,141,772,500", async () => {
    const r = await run(form(ga({ rentalCancelledDate: "2018-03-01", rentalCancellationReason: "voluntary" })));
    expect(r.totalTax).toBe(1_141_772_500);
    expect(r.surcharge).toBe("multi_house_2");
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });
});
