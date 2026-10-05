/**
 * PR-3 — §155④⑤ 합가 전 구성 판정에서 **제외 행을 빼고 판정**한다 (route 경유 · 단건 = 다건).
 * 계획서 `docs/00-pm/merge-composition-unknown-unfavorable.plan.md` §3-4 · 사용자 결정 Q-4.
 *
 * `resolveMergeComposition`이 §155②③ 상속주택처럼 **명부 행으로 특정된** 알려진 제외
 * (`knownHouseExclusionHouseIds`)를 먼저 명부에서 빼고 남은 행으로 혼인·동거봉양 합가 전 구성을
 * 실제로 판정한다(PR-2까지는 행 수 불일치가 알려진 제외 「건수」로 설명되기만 하면 구성을 보지
 * 않고 통과시켰다 — `unknown`/`count_mismatch`를 `holds`와 같이 취급).
 *
 * 엔진 단위 테스트(앞선 anchor `one-house-merge-composition.anchor.test.ts` MC-6)는 `resolveMergeComposition`을
 * 직접 호출해 전 분기를 고정한다. 여기서는 **route를 통과시켜**(Zod 포함) 같은 결론이 실제로
 * 도달하는지, 그리고 단건(`/api/calc/transfer`)과 다건(`/api/calc/transfer/multi`)이 같은 값을
 * 내는지만 확인한다.
 *
 * 시료: 양도 주택(selling) 2010-01-01 취득(§155② 「상속개시 당시 보유」 판정 기산일 2013-02-15 이전이라
 * `inheritedDate` 없이도 적격) · 세대 주택 3채(selling + 상속주택 1채 + 그 밖의 주택 1채) · 혼인
 * 2020-01-01 · 비조정지역(거주요건 없음) · 양도 2026-03-01(혼인 10년 이내) · 8억(12억 이하 — 전액
 * 비과세면 totalTax 0).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

function form(houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2010-01-01",
    fixedAcquisitionPrice: "300,000,000",
  };
  return Object.assign(f, {
    transferDate: "2026-03-01",
    contractTotalPrice: "800,000,000",
    residencePeriodMonths: "0",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    householdHousingCount: String(houses.length + 1),
    marriageDate: "2020-01-01",
    isFirstTransferredInMerge: true,
    houses,
    ...over,
  });
}

/** 화면이 실제로 보내는 본문 — 클라이언트의 fetch를 가로챈다. */
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

/** 상대 쪽이 혼인 전부터 보유하던 §155② 상속주택 — 제외되면 명부에서 빠진다. */
const INHERITED_COUNTERPART: HouseEntry = {
  id: "h-inh",
  region: "capital",
  acquisitionDate: "2014-01-01",
  inheritedDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: true,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
/** 그 밖의 주택 — 혼인 전 취득 · 소유 쪽을 테스트마다 바꾼다. */
const other = (mergeOrigin: "seller_side" | "counterpart_side"): HouseEntry => ({
  id: "h2",
  region: "capital",
  acquisitionDate: "2017-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  mergeOrigin,
});

describe("PR-3 §155②③ 상속주택 행을 빼고 합가 전 구성을 판정 — 단건 = 다건", () => {
  it("[a] 상속주택을 빼면 (1,1) 성립 → 비과세 0 (수정 전에는 건수만으로도 통과했다)", async () => {
    const f = form([INHERITED_COUNTERPART, other("counterpart_side")]);
    const s = await single(f);
    expect(s).toMatchObject({ isExempt: true, totalTax: 0 });
    expect(await multi(f)).toMatchObject({ isExempt: true, totalTax: 0 });
  });

  it("[d] 상속주택을 빼도 남은 주택이 양도자 쪽이면(각자 1주택 아님) → 불성립 · 과세(수정 전에는 결함으로 비과세였다)", async () => {
    const f = form([INHERITED_COUNTERPART, other("seller_side")]);
    const s = await single(f);
    expect(s.isExempt).toBe(false);
    expect(s.totalTax).toBeGreaterThan(0);
    expect(await multi(f)).toMatchObject({ isExempt: false, totalTax: s.totalTax });
  });
});
