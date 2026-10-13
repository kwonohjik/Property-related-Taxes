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
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
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
const INH_OLD: HouseEntry = { ...ROW, id: "h3", isInherited: true, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01", decedentSameHouseholdAtInheritance: false };
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
    mhWarnings: (mh.warnings ?? []) as string[],
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

/**
 * #16-1 영 §167의10①4호 가드 — ⑧ 주택이 중과 주택 수 2채 **안**에 있을 때만 배제한다(15호가 없는 2023.2.28. 전 양도분).
 * 4호 슬롯은 제외 **후** 주택 수로 서므로(#16), ⑧ 주택이 중과 주택 수 밖이고 남은 2채가 상속주택이 아닌 다른 주택이면 종전 대리 지표
 * (「다른 효과 주택이 상속주택인가」)가 통과시켜 2주택 중과를 면했다. 명부 ⑧ 행 표시를 엔진에 echo해 그 주택이 2채 안인지 본다.
 * 해소일은 양도일 전(2020-06-01 — 3년 내)으로 둔다.
 *
 * 시료의 다른 주택은 **영 §167의3①2호~8호 밖**이어야 한다 — 그 안이면 §167의10①2호에 해당해 10호(「제1호부터 제7호까지 …
 * 제외하고 1개의 주택만」)가 4호와 무관하게 배제한다(MST 231965). 조특법 §98 미분양주택(조특령 §98② — 주택 수 제외)은
 * 영 §167의3①5호 열거(§77·§98의2·§98의3·§98의5~8·§99·§99의2·§99의3)에 없고, 3호는 「§98에 따라 … 감면되는 **임대주택**으로서
 * 5년 이상 임대한 국민주택」이라 임대하지 않은 §98 미분양은 들지 않는다. §98은 「서울특별시외」 국민주택이라 경기에 둔다.
 *
 * | 시료 (양도 2021-09-18) | 수정 전 | 수정 후 |
 * |---|---:|---:|
 * | ⑧(경남 1억 — 중과 주택 수 밖) + 임대하지 않은 §98 미분양(경기) (Q1) | 340,038,600 (4호) | 597,025,000 (2주택 중과) |
 * | 같은 세대 ⑧ 선언 없음 (Q0 대조) | 1,141,772,500 | 1,141,772,500 |
 * | ⑧(경남 1억) + §99의2 감면주택 · 행 「조특법 감면주택(5호)」 표시 (S5) | 340,038,600 (4호) | 340,038,600 (10호) |
 * | ⑧(부산 4억 — 2채 안) + 공동상속 소수지분 (K1 짝) | 340,038,600 (4호) | 340,038,600 (4호) |
 *
 * ⑥ ↔ 10호 연결(같은 세대 · ⑧ 경남 1억) — 아래 「수정 전」은 B1 뒤·연결 전:
 *
 * | 시료 | 연결 전 | 연결 후 |
 * |---|---:|---:|
 * | §99의2 명부 행 ⑥만 (L1) · 넘겨받은 행 id 선언 (L2) | 597,025,000 | 340,038,600 (10호) |
 * | 칩 + ⑥ 같은 행 (L3) | 340,038,600 | 340,038,600 |
 * | 요건 미확인 ⑥ (L4) · 취득기간 밖 ⑥ (L5) | 1,141,772,500 | 1,141,772,500 |
 * | 행 id 없는 옛 선언 (L6) | 597,025,000 | 597,025,000 |
 * | §97 장기임대(3호) ⑥만 (L7) | 597,025,000 | 597,025,000 + 확인 필요 |
 * | §99 신축주택 ⑥만 (L9 — 2007.12.31. 시한은 §89①3호 의제 전용) | 1,141,772,500 | 667,342,500 (= 칩) |
 */
describe("#16-1 4호 가드 — ⑧ 주택이 중과 주택 수 2채 안에 있을 때만 (2023.2.28. 전 양도)", () => {
  const TD_2021 = "2021-09-18";
  const UNAV_2021 = (over: Partial<HouseEntry> = {}) => UNAV({ unavoidableOutsideCapitalResolvedDate: "2020-06-01", ...over });
  const UNAV_OUT = UNAV_2021({ officialPrice: "100000000", regionCode: GYEONGNAM });
  /** 조특법 §98 미분양(1997 취득 · 경기 · 임대하지 않음) — 주택 수 제외(조특령 §98②), 영 §167의3①2호~8호 밖 */
  const UNSOLD_98_ROW: HouseEntry = { ...ROW, id: "h5", regionCode: "4113510300", acquisitionDate: "1997-06-01" };
  const UNSOLD_98_DECL = [
    { article: "unsold_98", houseAcquisitionDate: "1997-06-01", houseContractDate: "1997-06-01", isNationalHousing: true, requirementsConfirmed: true },
  ] as Form["specialHouseExclusions"];
  const Q1 = () => form([UNAV_OUT, UNSOLD_98_ROW], { specialHouseExclusions: UNSOLD_98_DECL, transferDate: TD_2021 });

  it("Q1 ⑧(중과 주택 수 밖) + 임대하지 않은 §98 미분양 → 4호 배제 없음, 2주택 중과 597,025,000 (수정 전 340,038,600)", async () => {
    const r = await run(Q1());
    expect(r).toMatchObject({ totalTax: 597_025_000, reasons: "", eff: 2 });
    expect(await multiTotal(Q1()), "다건 route도 단건과 같은 세액").toBe(597_025_000);
  });
  it("Q0 대조 — 같은 세대 ⑧ 선언 없음 → 1,141,772,500 (⑧ 비과세 의제가 없어 전액 과세)", async () => {
    const plain = { ...UNAV_OUT, oneHouseUnavoidableOutsideCapital: false } as HouseEntry;
    const r = await run(form([plain, UNSOLD_98_ROW], { specialHouseExclusions: UNSOLD_98_DECL, transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 1_141_772_500, reasons: "", eff: 2 });
  });
  it("S5 짝 — §99의2 감면주택에 행 「조특법 감면주택(5호)」 표시 → 4호가 아니어도 10호 배제 340,038,600", async () => {
    const f = () =>
      form([UNAV_OUT, { ...SPECIAL_ROW, isUnsoldHousing: true }], { specialHouseExclusions: SPECIAL_DECL, transferDate: TD_2021 });
    expect(await run(f())).toMatchObject({ totalTax: 340_038_600, reasons: "only_general_two_house", eff: 2 });
    expect(await multiTotal(f()), "다건 route도 단건과 같은 세액").toBe(340_038_600);
  });
  /**
   * ⑥ 선언 ↔ 중과 10호 연결(결정 #16 공백 — `surcharge-tax-incentive-house-link.ts`). 영 §167의3①5호 조문을 ⑥ 주택 수 제외로만
   * 선언해도(5호 칩 없음 — 판정 메뉴는 칩을 숨긴다) 「확인된」 선언이면 10호 「일반주택」 판정에서 그 행을 2~8호 주택으로 뺀다.
   * 수정 전에는 597,025,000(2주택 중과)이었다.
   */
  const SPECIAL_ROW6: HouseEntry = {
    ...SPECIAL_ROW,
    countExclusion: {
      kind: "special",
      special: { article: "unsold_99_2", houseAcquisitionDate: "", houseContractDate: "2013-06-01", isNationalHousing: false, requirementsConfirmed: true },
    },
  } as HouseEntry;
  it("L1 §99의2를 명부 행 ⑥으로만 선언(5호 칩 없음) → 10호 배제 340,038,600 (수정 전 597,025,000) · 다건 같음", async () => {
    const f = () => form([UNAV_OUT, SPECIAL_ROW6], { transferDate: TD_2021 });
    expect(await run(f())).toMatchObject({ totalTax: 340_038_600, reasons: "only_general_two_house", eff: 2 });
    expect(await multiTotal(f()), "다건 route도 단건과 같은 세액").toBe(340_038_600);
  });
  it("L2 판정 메뉴에서 넘겨받은 선언(폼 전역 · 행 id 있음)도 같은 leaf → 340,038,600", async () => {
    const decl = [{ ...SPECIAL_DECL![0], houseId: SPECIAL_ROW.id }] as Form["specialHouseExclusions"];
    const r = await run(form([UNAV_OUT, SPECIAL_ROW], { specialHouseExclusions: decl, transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 340_038_600, reasons: "only_general_two_house", eff: 2 });
  });
  it("L3 칩 + ⑥이 같은 행 → 한 번만 — 칩만 켠 S5와 같은 세액·사유", async () => {
    const r = await run(form([UNAV_OUT, { ...SPECIAL_ROW6, isUnsoldHousing: true }], { transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 340_038_600, reasons: "only_general_two_house", eff: 2 });
  });
  it("L4 반대 짝 — 요건 미확인 ⑥(requirementsConfirmed=false)은 잇지 않는다 → 10호 없음", async () => {
    const unconfirmed = { ...SPECIAL_ROW6, countExclusion: { kind: "special", special: { ...(SPECIAL_ROW6.countExclusion as { special: object }).special, requirementsConfirmed: false } } } as HouseEntry;
    const r = await run(form([UNAV_OUT, unconfirmed], { transferDate: TD_2021 }));
    // ⑥이 서지 않아 비과세 주택 수도 3 — 연결 전후 1,141,772,500 그대로
    expect(r).toMatchObject({ totalTax: 1_141_772_500, reasons: "", eff: 2 });
  });
  it("L5 반대 짝 — 취득기간 밖 ⑥(최초 매매계약 2014)은 잇지 않는다 → 10호 없음", async () => {
    const outside = { ...SPECIAL_ROW6, countExclusion: { kind: "special", special: { ...(SPECIAL_ROW6.countExclusion as { special: object }).special, houseContractDate: "2014-06-01" } } } as HouseEntry;
    const r = await run(form([UNAV_OUT, outside], { transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 1_141_772_500, reasons: "", eff: 2 });
  });
  it("L6 반대 짝 — 행 id 없는 옛 선언은 어느 주택인지 몰라 잇지 않는다 → 597,025,000 그대로", async () => {
    const r = await run(form([UNAV_OUT, SPECIAL_ROW], { specialHouseExclusions: SPECIAL_DECL, transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 597_025_000, reasons: "", eff: 2 });
  });
  it("L10 판정 메뉴 → 계산기 넘김(`toTransferFormPatch`) — 칩이 없는 ⑥ 행 그대로 10호 340,038,600", async () => {
    const jf = Object.assign(createInitialOneHouseJudgmentForm(), {
      isOneHousehold: true,
      transferDate: TD_2021,
      contractTotalPrice: P20,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: false,
      houses: [UNAV_OUT, SPECIAL_ROW6],
    }) as OneHouseJudgmentFormData;
    jf.assets = [{ ...jf.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM }];
    const f = Object.assign(createDefaultTransferFormData(), toTransferFormPatch(jf)) as Form;
    expect(f.houses.find((h) => h.id === SPECIAL_ROW6.id)?.isUnsoldHousing, "판정 메뉴는 5호 칩이 없다").toBe(false);
    expect(await run(f)).toMatchObject({ totalTax: 340_038_600, reasons: "only_general_two_house", eff: 2 });
  });
  const row6 = (base: HouseEntry, special: Record<string, unknown>): HouseEntry =>
    ({ ...base, countExclusion: { kind: "special", special: { houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: true, ...special } } }) as HouseEntry;
  /** 조특법 §97 장기임대주택(1999 임대개시 · 경기) — 영 §167의3①3호 후보, 5년 임대·국민주택 사실은 ⑥에 없다 */
  const RENTAL97_ROW = row6({ ...ROW, id: "h7", regionCode: "4113510300", acquisitionDate: "1999-01-01" }, { article: "rental_97", houseRentalStartDate: "1999-06-01" });
  it("L7 반대 짝 — 3호(§97 장기임대) ⑥만 → 잇지 않는다(2주택 중과 597,025,000) + 결론을 가르므로 확인 필요 고지", async () => {
    const r = await run(form([UNAV_OUT, RENTAL97_ROW], { transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 597_025_000, reasons: "", eff: 2 });
    expect(r.mhWarnings.some((w) => w.includes("§167의3①3호") && w.includes("확인이 필요합니다"))).toBe(true);
  });
  it("L8 3호 행에 「조특법 감면 임대주택(3호)」 사실이 있으면 고지하지 않는다(그 칩이 판정한다 — 여기서는 국민주택 아님이라 중과)", async () => {
    const chip = { ...RENTAL97_ROW, isTaxIncentiveRental: true, rentalPeriodYears: "6", isNationalSizeHousing: false } as HouseEntry;
    const r = await run(form([UNAV_OUT, chip], { transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 597_025_000, reasons: "" });
    expect(r.mhWarnings.some((w) => w.includes("§167의3①3호") && w.includes("확인이 필요합니다"))).toBe(false);
  });
  it("L9 §99 신축주택(1999) — ⑥의 2007.12.31. 양도시한(§99②)은 5호 판정에 쓰지 않는다: ⑥만 = 칩 + ⑥ (10호)", async () => {
    const NEW99 = row6({ ...ROW, id: "h9", acquisitionDate: "1999-03-01" }, { article: "new_99", houseAcquisitionDate: "1999-03-01", houseContractDate: "1999-03-01", isNationalHousing: true });
    const only6 = await run(form([UNAV_OUT, NEW99], { transferDate: TD_2021 }));
    const chip = await run(form([UNAV_OUT, { ...NEW99, isUnsoldHousing: true }], { transferDate: TD_2021 }));
    // ⑥은 §89①3호 의제가 서지 않아(2007.12.31. 시한) 비과세 주택 수 3 — 수정 전 1,141,772,500 → 667,342,500(칩과 같음)
    expect(only6).toMatchObject({ totalTax: 667_342_500, reasons: "only_general_two_house", eff: 2 });
    expect(only6.totalTax).toBe(chip.totalTax);
  });
  it("K1 짝 — ⑧(2채 안) + 공동상속 소수지분 → 4호 배제 그대로 340,038,600", async () => {
    const r = await run(form([UNAV_2021(), CO_INH], { transferDate: TD_2021 }));
    expect(r).toMatchObject({ totalTax: 340_038_600, reasons: "unavoidable_outside_capital", eff: 2 });
  });
  it("2023.2.28. 이후 양도(2026-09-18)는 15호가 받아 세액 불변 204,355,800", async () => {
    const r = await run(form([UNAV({ officialPrice: "100000000", regionCode: GYEONGNAM }), UNSOLD_98_ROW], { specialHouseExclusions: UNSOLD_98_DECL }));
    expect(r).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital_house", eff: 2 });
  });
});

/**
 * #16-2 영 §167의3①13호 연혁 — 13호는 2021.2.17. 이후 양도분부터 있다(그 전에는 ⑧ + 상속 3주택이 중과).
 * ⑧(부산 4억) + 상속(2019) 3주택 · 해소일 2020-06-01. 13호는 「같은 항(§154①)의 요건을 모두 충족」해야 하므로 보유 2년 미만 양도 주택에는 서지 않는다.
 *
 * | 양도일 | ⑧ 선언 | ⑧ 미선언(U0) |
 * |---|---:|---:|
 * | 2020-09-18 (13호 신설 전) | 597,025,000 (배제 없음) | — |
 * | 2021-09-18 | 340,038,600 (13호) | 1,328,497,500 |
 * | 2022-03-18 | 230,082,600 (13호) | — |
 * | 2026-09-18 · 2025-03-01 상속 · 양도 주택 2015 취득 | 204,355,800 (13호) | — |
 * | 2026-09-18 · 2025-03-01 상속 · 양도 주택 2025-01-01 취득(보유 2년 미만) | 1,327,903,500 (배제 없음) | — |
 *
 * 경계 짝의 상속은 양도 주택 취득 **뒤**(2025-03-01)로 둔다 — 상속(2019)보다 늦게 취득한 주택은 §155② 「상속개시 당시 보유한 일반주택」이
 * 아니어서 의제 ① 요소부터 서지 않으므로, §154① 요건(② 요소)만 가르는 짝이 되지 않는다.
 */
describe("#16-2 13호 연혁 — ⑧ + 상속 3주택", () => {
  const U2 = (transferDate: string, over: Partial<Form> = {}) =>
    form([UNAV({ unavoidableOutsideCapitalResolvedDate: "2020-06-01" }), INH_OLD], { transferDate, ...over });

  it("2021-09-18 → 13호 배제 340,038,600 (⑧ 미선언 대조 1,328,497,500)", async () => {
    expect(await run(U2("2021-09-18"))).toMatchObject({ totalTax: 340_038_600, reasons: "unavoidable_outside_capital_house", eff: 3 });
    const u0 = await run(form([INH_OLD, { ...ROW, id: "hz", acquisitionDate: "2018-01-01" }], { transferDate: "2021-09-18" }));
    expect(u0).toMatchObject({ totalTax: 1_328_497_500, reasons: "" });
  });
  it("2022-03-18 → 13호 배제 230,082,600", async () => {
    expect(await run(U2("2022-03-18"))).toMatchObject({ totalTax: 230_082_600, reasons: "unavoidable_outside_capital_house", eff: 3 });
  });
  it("2020-09-18 → 13호 신설 전이라 배제 없음 597,025,000", async () => {
    expect(await run(U2("2020-09-18"))).toMatchObject({ totalTax: 597_025_000, reasons: "", eff: 3 });
  });
  const INH_2025: HouseEntry = { ...INH_OLD, acquisitionDate: "2025-03-01", inheritedDate: "2025-03-01" };
  it("2026-09-18 · 양도 주택 2015 취득(§154① 충족) → 13호 배제 204,355,800", async () => {
    expect(await run(form([UNAV(), INH_2025]))).toMatchObject({ totalTax: AFTER, reasons: "unavoidable_outside_capital_house", eff: 3 });
  });
  it("양도 주택 보유 2년 미만(2025-01-01 취득 · 2026 양도) → §154① 요건 미충족이라 13호 불성립, 3주택 중과 1,327,903,500", async () => {
    const f = form([UNAV(), INH_2025]);
    f.assets[0] = { ...f.assets[0], acquisitionDate: "2025-01-01" };
    expect(await run(f)).toMatchObject({ totalTax: 1_327_903_500, reasons: "", eff: 3 });
  });
});
