/**
 * 상속인이 아닌 수유자(유증·사인증여) — 후속 묶음 route anchor (2026-10-20)
 * 계획서: docs/00-pm/non-heir-bequest-followups.plan.md
 *
 * 화면 폼 → ④(`callTransferTaxAPI` · `callMultiTransferTaxAPI`) → ⑫ → ⑭(단건·다건 route) → 엔진.
 *  - A §167의3①7호: 「제155조제2항에 해당하는 상속받은 주택」 — 수유자 주택은 중과 배제가 서지 않는다
 *    (부동산거래관리과-307 · 조심2013중2654 · 수원지방법원 2013구단4853).
 *  - B §104②1호: 수유자는 피상속인 취득일부터 세율 보유기간을 세지 않는다(서면인터넷방문상담4팀-3304).
 *  - C §156의2⑥: 수유자 입주권은 상속받은 입주권이 아니다(직접 해석 없음 — 확인 필요).
 * 세율은 A·B 프로덕션 fallback(양도 2026-09-18) · C mock 세율이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";

const ROW: HouseEntry = {
  id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2015-01-01", officialPrice: "300000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general",
};

/** 상속 주택(피상속인 2010 취득 · 별도세대) 양도 — `nonHeir`면 수유자 토글을 켠다 */
function inheritedForm(o: { acq: string; price: string; regulated: boolean; houses: HouseEntry[]; nonHeir: boolean }): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: o.acq,
    decedentAcquisitionDate: "2010-01-01",
    decedentSameHouseholdBeforeInheritance: false,
    fixedAcquisitionPrice: "300,000,000",
    publishedValueAtInheritance: "300000000",
    regionCode: o.regulated ? GANGNAM : "",
    nonHeirBequest: o.nonHeir || undefined,
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: o.price,
    residencePeriodMonths: "0",
    householdHousingCount: String(o.houses.length + 1),
    isRegulatedArea: o.regulated,
    wasRegulatedAtAcquisition: false,
    houses: o.houses,
  });
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function single(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string }[]; surchargeType: string } | undefined;
  return {
    body,
    totalTax: r.totalTax as number,
    surcharge: mh?.surchargeType,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    shortTermNote: (r.shortTermNote as string | undefined) ?? "",
    resultText: JSON.stringify(r),
  };
}
async function multiTotal(f: Form): Promise<number> {
  const mf = { taxYear: Number(f.transferDate.slice(0, 4)), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() => callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}

const useFallbackRates = () =>
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
afterEach(() => vi.unstubAllGlobals());

describe("A §167의3①7호 — 강남 상속 주택(2024-01-01 상속) 20억 양도 + 일반주택 1채", () => {
  const s1 = (nonHeir: boolean) => inheritedForm({ acq: "2024-01-01", price: "2,000,000,000", regulated: true, houses: [ROW], nonHeir });

  it("상속인 → 7호 중과 배제 · 수유자 → 2주택 중과 (단건)", async () => {
    useFallbackRates();
    const heir = await single(s1(false));
    expect(heir).toMatchObject({ totalTax: 767_728_500, surcharge: "none", reasons: "inherited_house_5years" });
    const nonHeir = await single(s1(true));
    expect(nonHeir).toMatchObject({ totalTax: 1_141_178_500, surcharge: "multi_house_2", reasons: "" });
    // ④ 최상위 본문과 양도 주택 명부 행 모두에 실린다 · 상속인 본문에는 키가 없다
    expect(nonHeir.body.nonHeirBequest).toBe(true);
    const sold = (nonHeir.body.houses as Obj[]).find((h) => h.isInherited === true);
    expect(sold?.nonHeirBequest).toBe(true);
    expect(heir.body.nonHeirBequest).toBeUndefined();
  });

  it("다건 route도 같은 결론", async () => {
    useFallbackRates();
    expect(await multiTotal(s1(false))).toBe(767_728_500);
    expect(await multiTotal(s1(true))).toBe(1_141_178_500);
  });
});

describe("B §104②1호 — 비조정 상속 주택(2026-03-01 상속 · 피상속인 2010) 8억 양도(6개월) · 2주택", () => {
  const s2 = (nonHeir: boolean) => inheritedForm({ acq: "2026-03-01", price: "800,000,000", regulated: false, houses: [{ ...ROW, regionCode: "" }], nonHeir });

  it("상속인 → 피상속인 취득일 기산 · 수유자 → 단기세율 + 통산하지 않았다는 안내 (단건 · 다건)", async () => {
    useFallbackRates();
    const heir = await single(s2(false));
    const nonHeir = await single(s2(true));
    expect([heir.totalTax, nonHeir.totalTax]).toEqual([HEIR_B, NON_HEIR_B]);
    expect(heir.shortTermNote).not.toContain("상속인이 아닌 사람");
    expect(nonHeir.shortTermNote).toContain(
      "상속인이 아닌 사람이 유증·사인증여로 받은 자산이라 피상속인 취득일부터 통산하지 않았습니다(소득세법 §104②1호 · 사인증여는 서면인터넷방문상담4팀-3304, 유증은 직접 해석이 없어 확인 필요)",
    );
    expect(await multiTotal(s2(false))).toBe(HEIR_B);
    expect(await multiTotal(s2(true))).toBe(NON_HEIR_B);
  });
});

describe("C §156의2⑥ — 일반주택(2015) 9억 양도 2024-06-01 + 상속 입주권 1개(2016)", () => {
  const right = (nonHeir: boolean): PresaleRightEntry => ({
    id: "r1", type: "redevelopment_right", acquisitionDate: "2016-10-01", region: "capital",
    isInherited: true, inheritedDate: "2016-10-01", decedentHouseholdSeparate: true, nonHeirBequest: nonHeir || undefined,
  });
  const s3 = (nonHeir: boolean) => {
    const f = createDefaultTransferFormData();
    f.isOneHousehold = true;
    f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-06-01", fixedAcquisitionPrice: "400,000,000" };
    return Object.assign(f, {
      transferDate: "2024-06-01", contractTotalPrice: "900,000,000", residencePeriodMonths: "60", householdHousingCount: "1",
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, householdNoOtherHousesConfirmed: true, presaleRights: [right(nonHeir)],
    }) as Form;
  };

  it("상속인 → 비과세 · 수유자 → 과세 + 확인 필요 사유", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
    const heir = await single(s3(false));
    const nonHeir = await single(s3(true));
    expect([heir.totalTax, nonHeir.totalTax]).toEqual([0, NON_HEIR_C]);
    const sentRight = (nonHeir.body.presaleRights as Obj[])[0];
    expect(sentRight.nonHeirBequest).toBe(true);
    expect(nonHeir.resultText).toContain(
      "상속인이 아닌 사람이 유증·사인증여로 받은 조합원입주권은 상속받은 권리로 보지 않아",
    );
    expect(heir.resultText).not.toContain("상속인이 아닌 사람");
  });
});

// 화면 폼 경로 실측값(상속 평가액 3억 — 계획서 §3의 raw 시료와 취득가액이 달라 값이 다르다).
const HEIR_B = 190_366_000;
const NON_HEIR_B = 383_075_000;
const NON_HEIR_C = 150_766_000;
