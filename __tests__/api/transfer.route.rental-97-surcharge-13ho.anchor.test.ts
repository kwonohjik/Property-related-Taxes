/**
 * anchor — 조특법 §97②·§97의2② 임대주택 소유주택 제외로 1주택이 되면 다주택 중과 배제
 *          (영 §167의10①15호 · §167의3①13호 — 「「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고
 *          있는 것으로 보거나 …제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」)
 *
 * 법문(KoreanLaw MCP 실독 2026-10-02):
 * - 조특법(MST 284389) §97② 「「소득세법」 제89조제1항제3호를 적용할 때 임대주택은 그 거주자의 소유주택으로
 *   보지 아니한다.」 · §97의2② 「신축임대주택에 관하여는 제97조제2항부터 제4항까지의 규정을 준용한다.」
 *   — §99의2② 「「소득세법」 제89조제1항제3호를 적용할 때 제1항을 적용받는 주택은 해당 거주자의 소유주택으로
 *   보지 아니한다」와 **같은 문형**.
 * - 국세청 서면-2023-부동산-0197(2023.6.22.) — §99의2② 감면주택 제외로 1주택이 된 양도 주택(고가):
 *   「…같은 영 제154조제1항의 요건을 모두 충족하는 경우에는 같은 영 제167조의10제1항제15호에 따라
 *   중과세율을 적용하지 아니하며 장기보유특별공제도 적용할 수 있는 것」 (E-14a — 같은 문형 조문 확장 기준).
 * - ⚠️ 중과 **주택 수**는 줄이지 않는다 — 영 §167의3① 본문 괄호 「제1호 또는 제12호에 해당하는 주택은 주택의
 *   수를 계산할 때 산입하지 않는다」(§167의10① 본문도 같다)가 주택 수 불산입을 1호·12호로 한정한다.
 *   §97 임대주택(3호 감면대상장기임대주택)은 산입된다.
 *
 * 사실관계: 강남(조정) · 양도 2026-09-18(§167의10①12의2 유예 종료 후) · 양도 주택 2015-01-01 취득(취득 당시
 * 비조정 — 거주요건 없음) · 3억 → 20억. 세율은 프로덕션 fallback. route 경유(④ → ⑫ Zod → ⑭ → 엔진).
 * 다건 = 단건은 `transfer.route.multi-special-act-exclusion.anchor.test.ts` MS-3·MS-4가 고정한다(Q4 — 종전 ⑧ 차단 해제).
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | RT-0 | 기준 — 다른 주택을 일반 행으로 두면 비과세 2주택 · 2주택 중과 1,141,178,500 |
 * | RT-1 | §97 임대주택(명부 ⑥ special) + 양도 주택 → 15호 배제 204,355,800 (수정 전 422,521,000) |
 * | RT-2 | §97의2 신축임대주택 → 같은 값 |
 * | RT-3 | 3주택(§97 임대 2채 + 양도 주택) → 13호 배제 204,355,800 (수정 전 3주택 중과 497,046,000) |
 * | RT-N1 | 음성 — 임대개시 2001-01-01(§97① 시한 밖) → 의제 불성립 · 2주택 중과 1,141,178,500 |
 * | RT-N2 | 음성 — 본 요건 확인 끔 → 같은 값 |
 * | RT-N3 | 음성 — §154① 미충족(보유 2년 미만) → 15호 불성립 |
 * | RT-X | 3호 칩(중과 축)만 → 종전 10호 그대로 · special과 함께 켜도 배제 |
 * | RT-R | 3주택 일시적 2주택 + §97 임대 — 종전에도 13호(§155①) — 회귀 없음 |
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
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";

/** §97 의제로 비과세 기준 1주택(12억 초과분만 과세)인데 2주택 중과(기본 + 20%p · 장특 배제) — 수정 전 */
const SURCHARGED_2 = 422_521_000;
/** 의제 불성립 — 비과세 기준 2주택(양도차익 전액 과세) · 2주택 중과 */
const NOT_DEEMED_SURCHARGED_2 = 1_141_178_500;
/** 3주택 중과(기본 + 30%p) — RT-3 수정 전 */
const SURCHARGED_3 = 497_046_000;
/** 15호·13호 배제 — 일반세율 · 12억 초과분 안분 · 장특 표2 (E-14a §99의2와 같은 값) */
const EXCLUDED = 204_355_800;

const ROW: HouseEntry = {
  id: "r",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "1998-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

const special = (over: Partial<SpecialHouseExclusionFormItem> = {}): SpecialHouseExclusionFormItem => ({
  article: "rental_97",
  houseAcquisitionDate: "",
  houseContractDate: "",
  isNationalHousing: false,
  houseRentalStartDate: "1999-03-01",
  requirementsConfirmed: true,
  ...over,
});
const rental = (id = "r", over: Partial<SpecialHouseExclusionFormItem> = {}): HouseEntry => ({
  ...ROW,
  id,
  countExclusion: { kind: "special", special: special(over) },
});
/** 3호 칩(감면대상장기임대주택 — 중과 축) */
const THREE_HO: Partial<HouseEntry> = {
  isTaxIncentiveRental: true,
  isTaxIncentiveRentalPurchase: false,
  rentalPeriodYears: "20",
  isNationalSizeHousing: true,
  isApartment: false,
};

function form(houses: HouseEntry[], over: Partial<Form> = {}, acquisitionDate = "2015-01-01"): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate,
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
    ...over,
  });
}

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

async function single(
  f: Form,
): Promise<{ totalTax: number; reasons: string; details: string; rate: number; lthdRate: number }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string; detail?: string }[] } | undefined;
  return {
    totalTax: r.totalTax as number,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    details: (mh?.exclusionReasons ?? []).map((x) => x.detail ?? "").join(" | "),
    rate: r.appliedRate as number,
    lthdRate: r.longTermHoldingRate as number,
  };
}
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("RT 2주택 — 영 §167의10①15호", () => {
  it("[RT-0] 기준 — 다른 주택을 일반 행으로 두면 2주택 중과", async () => {
    expect(await single(form([ROW]))).toMatchObject({
      totalTax: NOT_DEEMED_SURCHARGED_2,
      reasons: "",
      rate: 0.65,
      lthdRate: 0,
    });
  });

  it("[RT-1] §97 임대주택 + 양도 주택 → 15호 배제 (수정 전 422,521,000)", async () => {
    const r = await single(form([rental()]));
    expect(r).toMatchObject({ totalTax: EXCLUDED, reasons: "special_act_house_exclusion" });
    expect(r.details).toContain("조특법 §97②");
    expect(r.details).toContain("§167의10①15호");
    // 일반세율(누진 최고 42% — 중과 +20%p 아님) · 장특 부활(표1 — 거주 0이라 표2 거주 2년 요건 미충족 · 11년 22%)
    expect(r).toMatchObject({ rate: 0.42, lthdRate: 0.22 });
  });

  it("[RT-2] §97의2 신축임대주택 → 15호 배제 · 근거 §97의2②", async () => {
    const r = await single(form([rental("r", { article: "rental_97_2", houseRentalStartDate: "2001-06-01" })]));
    expect(r).toMatchObject({ totalTax: EXCLUDED, reasons: "special_act_house_exclusion" });
    expect(r.details).toContain("조특법 §97의2②");
  });
});

describe("RT 3주택 — 영 §167의3①13호", () => {
  it("[RT-3] §97 임대 2채 + 양도 주택 → 13호 배제 (중과 주택 수는 3 그대로)", async () => {
    const r = await single(form([rental("r1"), rental("r2")]));
    expect(r.totalTax).not.toBe(SURCHARGED_3);
    expect(r).toMatchObject({ totalTax: EXCLUDED, reasons: "special_act_house_exclusion" });
    expect(r.details).toContain("§167의3①13호");
  });
});

describe("RT 음성 짝 — 중과 유지", () => {
  it("[RT-N1] 임대개시 2001-01-01(§97① 「2000년 12월 31일 이전」 밖) → 2주택 중과", async () => {
    expect(await single(form([rental("r", { houseRentalStartDate: "2001-01-01" })]))).toMatchObject({
      totalTax: NOT_DEEMED_SURCHARGED_2,
      reasons: "",
    });
  });
  it("[RT-N2] 본 요건 확인 끔 → 2주택 중과", async () => {
    expect(await single(form([rental("r", { requirementsConfirmed: false })]))).toMatchObject({
      totalTax: NOT_DEEMED_SURCHARGED_2,
      reasons: "",
    });
  });
  it("[RT-N3] §154① 미충족(양도 주택 2025-01-01 취득 — 보유 2년 미만) → 15호 불성립", async () => {
    const r = await single(form([rental()], {}, "2025-01-01"));
    expect(r.reasons).not.toContain("special_act_house_exclusion");
    expect(r.reasons).toBe("");
  });
});

describe("RT-X 3호 칩(중과 축)과 섞이지 않는다", () => {
  it("[RT-X] 3호 칩만 → 종전 10호(일반주택) 배제 그대로 — special 의제 아님", async () => {
    const r = await single(form([{ ...ROW, ...THREE_HO }]));
    expect(r.reasons).not.toContain("special_act_house_exclusion");
    expect(r.reasons).not.toBe("");
  });
  it("[RT-X+] 3호 칩 + special 둘 다 → 배제(중과 아님)", async () => {
    const r = await single(form([{ ...rental(), ...THREE_HO }]));
    expect(r.reasons).not.toBe("");
    expect(r.totalTax).toBeLessThan(SURCHARGED_2);
  });
});

describe("RT-R 회귀 — 3주택 일시적 2주택 + §97 임대", () => {
  it("[RT-R] 양도 주택 + 신규(2025) + §97 임대 → §155① 의제 13호 (종전과 같다)", async () => {
    const NEW: HouseEntry = { ...ROW, id: "n", acquisitionDate: "2025-01-01" };
    const r = await single(
      form([NEW, rental()], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-01-01" }),
    );
    expect(r).toMatchObject({ totalTax: EXCLUDED, reasons: "temporary_two_house" });
  });
});
