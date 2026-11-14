/**
 * 소득세법 시행령 §167의3①2호 마목 1) 괄호 — 조정대상지역 공고 전 취득 또는 매매계약 + 계약금 지급 증빙이면
 * 1)의 배제에서 제외(계획서 `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md` S-1 · Q-1 a).
 * 폼 → ④ → ⑫ → ⑭ → 엔진 10호(일반주택 양도 · 마목 임대주택은 ④ 의무기간 전 의제).
 *
 * 강남 일반주택(2013-06-01 취득 · 3억 → 20억) 양도 2022-03-01 · 다른 주택 = 마목 매입 다세대(강남 2019-01-01 취득 ·
 * 2019-02-01 두 등록·임대개시 · 기준시가 3억 · 5% 충족 · 918 조정취득).
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

function form(h2: HouseEntry): Form {
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
    transferDate: "2022-03-01",
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses: [h2],
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
async function run(f: Form): Promise<{ totalTax: number; surcharge: unknown; reasons: string; body: Obj }> {
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
  const mh = r.multiHouseSurchargeEvaluation as { surchargeType?: string; exclusionReasons: { type: string }[] } | undefined;
  return {
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

describe("마목 1) 공고 전 계약 증빙 — 폼부터 route까지", () => {
  it("MA-1 ★ 918 ✓ + 증빙 ✓ → 10호 배제 633,682,500 (종전 증빙 무시 · 중과 1,141,772,500)", async () => {
    const r = await run(form(rental({ hasContractDepositProof: true })));
    expect((r.body.houses as Obj[])[1]).toMatchObject({ isExcluded918Rule: true, hasContractDepositProof: true });
    expect(r).toMatchObject({ totalTax: 633_682_500, surcharge: "none", reasons: "only_general_two_house" });
  });
  it("MA-2 짝 — 918 ✓ · 증빙 없음 → 중과 1,141,772,500 (불변)", async () => {
    expect(await run(form(rental()))).toMatchObject({ totalTax: 1_141_772_500, surcharge: "multi_house_2" });
  });
  it("C-1 S-3 — ④ 의무기간 전 일반주택 양도 고지에 6개월 미임대 · ⑤2호 산정특례", async () => {
    const body = await bodyOf(form(rental({ isExcluded918Rule: false })));
    const res = await SINGLE(
      new NextRequest("http://l/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withIdentityStdInBody(body)),
      }),
    );
    const text = JSON.stringify(await res.json());
    expect(text).toContain("임대의무호수를 임대하지 않은 기간이 6개월을 지난 경우도 그 사유에 포함됩니다");
    expect(text).toContain("소득세법 시행령 §167의3⑤2호");
  });
  it("MA-3 짝 — 918 아님 → 10호 배제 633,682,500 (불변)", async () => {
    expect(await run(form(rental({ isExcluded918Rule: false })))).toMatchObject({
      totalTax: 633_682_500,
      reasons: "only_general_two_house",
    });
  });
});
