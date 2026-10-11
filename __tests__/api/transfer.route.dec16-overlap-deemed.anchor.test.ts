/**
 * #16 (G8-3) route 관측 — 상속주택(§155②③) 제외로 1주택이 된 세대에 §155⑥·⑧(·⑦)이 겹칠 때, 비과세가 인정하는 1주택 의제를
 * 중과 배제(영 §167의10①15호 · §167의3①13호)에도 같은 술어로 넣는다. 폼 → ④ → ⑫ → ⑭ route → 엔진.
 *
 * 근거: 15호·13호는 「제155조 … 에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나 1세대 1주택으로 보아 제154조제1항이
 * 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」을 배제한다(MST 290841). 2중첩 자체를 정면으로 다룬 해석은 없고
 * 인접 조합만 원문으로 확인했다 — 서면-2022-부동산-1896(상속주택 + 조특법 §99의4 농어촌주택 보유 상태의 일반주택 양도: 1세대1주택) ·
 * 상속증여세과-212(문화재주택 + 일반주택 + 신규주택: 일시적 2주택 특례) ⇒ 결론은 세우되 「2중첩 해석 미확보 — 확인 필요」를 고지한다.
 * 세율은 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택 2015 취득 · 20억.
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---:|---:|
 * | ⑧ + 상속(2019) 3주택 (U2) | 497,046,000 | 204,355,800 |
 * | ⑥ + 상속(2019) 3주택 (C2) | 497,046,000 | 204,355,800 |
 * | ⑧(기준시가 1억) + 상속 (U3) | 422,521,000 | 204,355,800 |
 * | ⑧ + 공동상속 소수지분 (K1) | 422,521,000 | 204,355,800 |
 * | ⑧ + 조특법 감면주택(확인된 조문) (S1) | 497,046,000 | 204,355,800 |
 * | 상속 + 조특법 감면주택(E-14a 잔여) | 497,046,000 | 204,355,800 |
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { qualifiesUnavoidableOutsideCapital } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const P20 = "2,000,000,000";

const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2025-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
/**
 * §155② 상속주택 — 2019 상속(5년 경과 — 중과 주택 수에 산입, §167의3①7호 아님 · 양도 주택 2015는 상속개시 당시
 * 보유한 일반주택). 명부에 양도 주택보다 나중 취득한 행이 둘(신규·상속)이라 명부 도출은 신규 주택을 고르지
 * 않는다(`resolveTemporaryTwoHouse` — 억측 금지) ⇒ 일시적 2주택은 직접 선언 경로(`temporaryTwoHouseSpecial`)로 준다.
 */
const INH_OLD: HouseEntry = { ...ROW, id: "h3", isInherited: true, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01" };
/** 조특법 §99의2 감면주택(명부에 감면 표시 없음) */
const SPECIAL_ROW: HouseEntry = { ...ROW, id: "h5", acquisitionDate: "2013-06-01" };

function form(houses: HouseEntry[], over: Partial<Form> = {}): Form {
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
    contractTotalPrice: P20,
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

async function multiTotal(f: Form): Promise<number> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());



const BUSAN = "2614010100";
const GYEONGNAM = "4812110100";
const AFTER = 204_355_800;

/** §155⑧ 수도권 밖 부득이 주택(근무상 형편) — 해소일 입력(양도 2026-09-18 기준 3년 내) */
const UNAV = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    ...ROW, id: "hu", region: "non_capital", regionCode: BUSAN, acquisitionDate: "2018-01-01", officialPrice: "400000000",
    isApartment: true, oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work",
    unavoidableOutsideCapitalResolvedDate: "2025-06-01", ...over,
  }) as HouseEntry;
const HERITAGE_ROW: HouseEntry = {
  ...ROW, id: "hh", region: "non_capital", regionCode: BUSAN, acquisitionDate: "2018-01-01", officialPrice: "400000000",
  isApartment: false, oneHouseCulturalHeritage: true,
} as HouseEntry;
/** §155③ 공동상속 소수지분(최대지분자 아님) — 비과세·중과 모두 주택 수에서 빠진다 */
const CO_INH: HouseEntry = {
  ...ROW, id: "hc", region: "non_capital", regionCode: BUSAN, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01",
  isInherited: true, isCoInherited: true, isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: false,
} as HouseEntry;
const RURAL_ROW: HouseEntry = {
  ...ROW, id: "hr", region: "non_capital", regionCode: BUSAN, acquisitionDate: "2018-01-01", officialPrice: "100000000", isApartment: false,
  oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOwnerResidenceYears: "6", ruralOutsideCapitalEupMyeon: true, ruralReturnedToFarmExitHouse: false,
} as HouseEntry;
const SPECIAL_DECL = [
  { article: "unsold_99_2", houseAcquisitionDate: "2013-06-01", houseContractDate: "2013-06-01", isNationalHousing: false, requirementsConfirmed: true },
] as Form["specialHouseExclusions"];

async function run(f: Form) {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string }[]; effectiveHouseCount: number; warnings: string[] };
  const notice = (ws: unknown) => ((ws ?? []) as string[]).some((w) => w.includes("2중첩") && w.includes("확인이 필요합니다"));
  return {
    totalTax: r.totalTax as number,
    reasons: mh.exclusionReasons.map((x) => x.type).join(","),
    eff: mh.effectiveHouseCount,
    topNotice: notice(r.warnings),
    mhNotice: notice(mh.warnings),
  };
}

describe("#16 ⑧·⑥ + 상속 제외 — 비과세 의제를 중과 배제에도 (A)", () => {
  it("U2 ⑧ + 상속(2019) 3주택 → 13호 배제 204,355,800 (수정 전 497,046,000) + 2중첩 고지(결과·중과 상세)", async () => {
    const r = await run(form([UNAV(), INH_OLD]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital_house", eff: 3, topNotice: true, mhNotice: true });
    expect(await multiTotal(form([UNAV(), INH_OLD])), "다건 route도 단건과 같은 세액").toBe(AFTER);
  });
  it("C2 ⑥ + 상속(2019) 3주택 → 13호 배제 204,355,800 (수정 전 497,046,000)", async () => {
    const r = await run(form([HERITAGE_ROW, INH_OLD]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "cultural_heritage_house", eff: 3, topNotice: true, mhNotice: true });
  });
  it("U3 ⑧(기준시가 1억·중과 주택 수 밖) + 상속 → 15호 배제 204,355,800 (수정 전 422,521,000)", async () => {
    const r = await run(form([UNAV({ officialPrice: "100000000", regionCode: GYEONGNAM }), INH_OLD]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital_house", eff: 2 });
  });
  it("K1 ⑧ + 공동상속 소수지분(③) → 배제 204,355,800 (수정 전 422,521,000) — 4호 슬롯이 제외 후 수로 선다", async () => {
    const r = await run(form([UNAV(), CO_INH]));
    expect(r).toMatchObject({ totalTax: AFTER, eff: 2, topNotice: true });
    expect(r.reasons).not.toBe("");
  });
  it("S1 ⑧ + 확인된 조특법 감면주택 제외 → 배제 204,355,800 (수정 전 497,046,000) · 상속 제외가 아니라 2중첩 고지 없음", async () => {
    const r = await run(form([UNAV(), SPECIAL_ROW], { specialHouseExclusions: SPECIAL_DECL }));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital_house", topNotice: false, mhNotice: false });
  });
  it("E-14a 잔여 — 상속 제외 + 확인된 조특법 제외가 섞인 1주택 → 15호 배제 204,355,800 (수정 전 497,046,000)", async () => {
    const r = await run(form([INH_OLD, SPECIAL_ROW], { specialHouseExclusions: SPECIAL_DECL }));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "inherited_general_house" });
  });

  // ── 부정 짝 — 제외가 없는 단독 2주택은 종전 호·세액·라벨 그대로 ──
  it("U1 ⑧ 단독 2주택 → 종전대로 4호 슬롯 (라벨 불변 · 고지 없음)", async () => {
    const r = await run(form([UNAV()]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital", eff: 2, topNotice: false, mhNotice: false });
  });
  it("C1 ⑥ 단독 2주택 → 종전대로 10호 (라벨 불변 · 고지 없음)", async () => {
    const r = await run(form([HERITAGE_ROW]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "only_general_two_house", topNotice: false });
  });
  it("U0 상속(2019) + 일반주택 3주택(⑥·⑧ 선언 없음) → 종전대로 3주택 중과 1,327,903,500", async () => {
    const r = await run(form([INH_OLD, { ...ROW, id: "hz", acquisitionDate: "2018-01-01" }]));
    expect(r).toMatchObject({ totalTax: 1_327_903_500, reasons: "", topNotice: false });
  });
  it("⑧ 해소일이 3년을 넘기면 의제가 서지 않는다 — 상속과 겹친 3주택 중과 그대로", async () => {
    const r = await run(form([UNAV({ unavoidableOutsideCapitalResolvedDate: "2022-01-01" }), INH_OLD]));
    expect(r.totalTax).toBeGreaterThan(AFTER);
    expect(r.reasons).toBe("");
  });
  it("R2 ⑦ + 상속 → 세액·배제 사유 불변(13호), 같은 문형이라 2중첩 고지만 추가", async () => {
    const r = await run(form([RURAL_ROW, INH_OLD]));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "rural_house", topNotice: true, mhNotice: true });
  });
  it("2023.2.28. 전 양도 2주택(U3형)은 15호가 없어 새 경로가 열리지 않는다 — 종전 세액 230,082,600", async () => {
    const r = await run(form([UNAV({ officialPrice: "100000000", regionCode: GYEONGNAM }), INH_OLD], { transferDate: "2022-09-18" }));
    expect(r.totalTax).toBe(230_082_600);
    expect(r.reasons).toBe("only_general_two_house");
  });

  /**
   * 의존 가드(#16 조건 «S02-8을 먼저 정하거나 같은 PR에서 고친다») — ⑧ 해소일·「미해소」 모두 공란(= 모름)인 세대가 새 13·15호 경로로
   * 3주택 중과를 면하면 안 된다. 공란 처리(S02-8)는 결정 #31(PR8)이 «불성립 + ⑧·⑫ 차단»으로 바꾼다 — 그 변경이 들어오기 전
   * 브랜치(공란 = 유리)에서는 이 시험이 성립하지 않으므로, 술어 leaf가 공란을 불성립으로 읽을 때만 활성화된다(PR8 → PR5 머지 순서의 자기 점검).
   */
  const blankIsUnqualified = !qualifiesUnavoidableOutsideCapital({
    householdHousingCount: 2,
    transferDate: new Date(TRANSFER_DATE),
    unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: undefined },
  } as never);
  it.skipIf(!blankIsUnqualified)("⑧ 해소일·미해소 공란 + 상속 3주택 → 모름은 혜택 불성립 — 차단되거나 3주택 중과로 남고, 13·15호 배제 세액으로 새지 않는다", async () => {
    const f = form([UNAV({ unavoidableOutsideCapitalResolvedDate: undefined }), INH_OLD]);
    const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
    if (res.status === 200) {
      const json = (await res.json()) as { data: { result: { totalTax: number } } };
      expect(json.data.result.totalTax).toBeGreaterThan(AFTER);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});
