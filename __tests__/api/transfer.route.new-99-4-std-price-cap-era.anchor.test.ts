/**
 * 조특법 §99의4① 가액 한도 시기 분기 — route 경유(계산기 폼 → ④ → ⑫ Zod → ⑭ → 엔진) 관측 (NH-05 PR-2a · 계획서 P2a-1)
 *
 * 시료: 강남 일반주택(2015 취득) 양도 20억 · 거주 0개월 · 조정대상지역 · 명부 §99의4 농어촌주택 행
 * (2020-01-01 취득 · 취득 당시 기준시가 2.5억 · 양도 당시 공시 4억 — 중과 주택 수 산입). mock 아닌 fallback 세율.
 *
 * | 양도일 | 한도(R4) | 2.5억 | 기대 |
 * |---|---|---|---|
 * | 2021-12-20 (C3) | 2억 | 초과 | 선언 불성립 = 선언 뺀 대조와 같은 세액 · new994Detail STD_PRICE_EXCEEDED |
 * | 2026-09-18 (C4) | 3억 | 이내 | 선언 적격 · 선언 뺀 대조와 다른 세액 |
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
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

let TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const EUMSEONG = "4377037000"; // 충북 음성군 (수도권 밖 · 광역시 아님)

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

/** §99의4 농어촌주택 명부 행 — 취득 당시 기준시가 2.5억(①1호나목 3억 이하) · 2020 취득(3년 보유) */
const RURAL_ROW = (officialPrice: string): HouseEntry => ({
  ...ROW,
  id: "h4",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2020-01-01",
  officialPrice,
  countExclusion: {
    kind: "reduction",
    reduction: {
      type: "new_99_4_rural",
      ruralHouseAcquisitionDate: "",
      ruralHouseStdPrice: "250000000",
      isRegisteredHanok: false,
      adjacentArea994: "no" as const,
      meetsLocationRequirement: true,
    } as RowCountExclusionReduction,
  },
});
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
  status: number;
  totalTax?: number;
  surchargeType?: string;
  exclusions: string[];
  exclusionDetail: string;
  /** new994Detail — 적격이면 "eligible", 아니면 불성립 사유 코드 */
  new994: string | undefined;
}
async function single(f: Form): Promise<Single> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data?: { result: Obj } };
  if (res.status !== 200) return { status: res.status, exclusions: [], exclusionDetail: JSON.stringify(json).slice(0, 400), new994: undefined };
  const r = json.data!.result;
  const d = r.new994Detail as { isEligible: boolean; ineligibleReasons?: { code: string }[] } | undefined;
  const mh = r.multiHouseSurchargeEvaluation as
    | { surchargeType?: string; exclusionReasons?: { type: string; detail?: string }[] }
    | undefined;
  return {
    status: 200,
    totalTax: r.totalTax as number,
    surchargeType: mh?.surchargeType,
    exclusions: (mh?.exclusionReasons ?? []).map((e) => e.type),
    exclusionDetail: (mh?.exclusionReasons ?? []).map((e) => e.detail ?? "").join(" | "),
    new994: d ? (d.isEligible ? "eligible" : (d.ineligibleReasons ?? []).map((x) => x.code).join(",")) : undefined,
  };
}

const withoutDeclaration = (row: HouseEntry): HouseEntry => ({ ...row, countExclusion: undefined });

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  TRANSFER_DATE = "2026-09-18";
});

describe("§99의4 가액 한도 — route 시기 분기 (P2a-1)", () => {
  it("R4 × C3(2021-12-20 양도): 기준시가 2.5억은 한도 2억 초과 → 선언 불성립 = 선언 뺀 대조와 같은 세액", async () => {
    TRANSFER_DATE = "2021-12-20";
    const declared = await single(form([RURAL_ROW("400000000")]));
    const control = await single(form([withoutDeclaration(RURAL_ROW("400000000"))]));
    expect(declared.status).toBe(200);
    expect(declared.new994).toBe("STD_PRICE_EXCEEDED");
    expect(declared.totalTax).toBe(control.totalTax);
    expect(declared.exclusions).not.toContain("special_act_house_exclusion");
  });

  it("R4 × C4(2026-09-18 양도) [짝]: 같은 시료가 한도 3억 이내 → 선언 적격 · 대조와 다른 세액", async () => {
    TRANSFER_DATE = "2026-09-18";
    const declared = await single(form([RURAL_ROW("400000000")]));
    const control = await single(form([withoutDeclaration(RURAL_ROW("400000000"))]));
    expect(declared.new994).toBe("eligible");
    expect(declared.totalTax).not.toBe(control.totalTax);
  });
});
