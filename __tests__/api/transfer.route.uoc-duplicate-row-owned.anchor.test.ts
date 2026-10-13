/**
 * §155⑧ 행 한 채 — **양도일 현재 보유 행만** 센다 (PR #2163 후속 · 사용자 결정 2026-10-13).
 *
 * 법문(실독 2026-10-13 · MST 290841): §155⑧은 「…주택과 그 밖의 주택(일반주택)을 국내에 각각 1개씩 **소유하고 있는** 1세대」다.
 * 세대 판정(`deriveOneHouseFactsFromHouses` ← `housesOwnedAtTransfer`)과 ④ 엔진 명부(`buildHousesPayload` ← 같은 leaf)는 이미
 * 양도일 현재 보유 행만 본다. 그런데 ⑧ 중복 차단(계산기·판정 메뉴)과 ⑤ 경고는 명부 **전체 행**을 세어, 양도일 뒤에 취득한 행
 * (⑧·엔진 어디에도 실리지 않는 행)에 ⑧ 표시가 겹쳐도 막았다.
 *
 * 수정 후 ⑧·⑤가 `housesOwnedAtTransfer`(같은 날 취득 = 양도 후 취득 · §154⑨ 「먼저 양도」 선택 행 제외 · 양도일 미입력이면
 * 거르지 않음)를 거친다. ⑫는 ④가 이미 거른 명부만 받으므로 그대로다(엔진 4호의 「첫 ⑧ 행」도 같은 명부에서 찾는다).
 *
 * 세율은 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택 2018 취득 · 20억 (형제 앵커 `transfer.route.uoc-duplicate-row`와 같은 시료).
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | A(⑧) + L(⑧ · 양도일 뒤 취득) | ⑧ 차단 | 통과 · 200 · A만과 같은 세액 |
 * | L(⑧ · 양도일 뒤) + A(⑧) | ⑧ 차단(A 행) | 통과 · 200 · A만과 같은 세액 |
 * | A(⑧) + B(⑧ · 보유) | ⑧ 차단 · ⑫ 400 | 같음 |
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 as validateJudgmentStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { otherUocRowNumberOf, uocRowAcquiredAfterTransfer } from "@/lib/calc/house-row-required-issues";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TD = "2026-09-18";
const GANGNAM = "1168010100";
const GYEONGNAM = "4812110100";
const UOC = { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2025-06-01" };

/** ⑧ 주택 — 경남 기준시가 1억 · 해소일 3년 안(형제 앵커 A) */
const A = {
  id: "ha", region: "non_capital", regionCode: GYEONGNAM, acquisitionDate: "2018-01-01", officialPrice: "100000000",
  isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
  acquisitionOrigin: "general", ...UOC,
} as HouseEntry;
/** 다른 ⑧ 표시 행 — 취득일만 바꿔 경계를 짠다 */
const row = (id: string, acquisitionDate: string, over: Partial<HouseEntry> = {}) =>
  ({
    id, region: "non_capital", regionCode: GYEONGNAM, acquisitionDate, officialPrice: "100000000",
    isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
    acquisitionOrigin: "general", ...UOC, ...over,
  }) as HouseEntry;
/** 양도일 뒤 취득 — 해소일을 A와 달리 둬, 세대 판정이 이 행을 읽으면 본문이 갈라지게 한다 */
const L = row("hl", "2026-10-01", { unavoidableOutsideCapitalResolvedDate: "2021-01-01" });

function form(houses: HouseEntry[], transferDate = TD): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM };
  return Object.assign(f, {
    transferDate, contractTotalPrice: "2,000,000,000", residencePeriodMonths: "0", householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, houses,
  });
}
const calcDup = (f: Form) => collectStepIssues(1, f).filter((x) => x.message.includes("한 채만"));
function judgmentDup(houses: HouseEntry[], transferDate = TD) {
  const j = createInitialOneHouseJudgmentForm();
  j.houses = houses;
  j.transferDate = transferDate;
  j.assets[0] = { ...j.assets[0], assetKind: "housing" };
  return validateJudgmentStep2(j).filter((e) => e.message.includes("한 채만")).map((e) => e.field);
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
async function single(f: Form) {
  const body = await bodyOf(f);
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data?: { result: { totalTax: number } }; error?: { fieldErrors?: Record<string, string[]> } };
  return { status: res.status, totalTax: json.data?.result.totalTax, fieldErrors: json.error?.fieldErrors ?? {}, body };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("§155⑧ 행 한 채 — 양도일 현재 보유 행만 (PR #2163 후속)", () => {
  it("O1 ★ 양도일 뒤 취득 행이 둘째 ⑧ → ⑧·판정 ⑧ 통과 · ⑫ 200 · A만과 같은 세액 (수정 전: ⑧ 차단)", async () => {
    const f = form([A, L]);
    expect(calcDup(f)).toEqual([]);
    expect(judgmentDup([A, L])).toEqual([]);
    const s = await single(f);
    const only = await single(form([A]));
    expect(s.status).toBe(200);
    expect(only.status).toBe(200);
    expect(s.totalTax).toBe(only.totalTax);
    // ④가 L을 싣지 않고, 세대 단위 ⑧ 사실은 A의 해소일이다(세대 판정과 엔진이 같은 행).
    expect((s.body.houses as Obj[]).map((h) => h.id)).toEqual(["selling", "ha"]);
    expect(s.body.unavoidableOutsideCapitalHouse).toEqual(only.body.unavoidableOutsideCapitalHouse);
  });

  it("O2 ★ 양도일 뒤 취득 행이 **첫** ⑧ → 통과 · 보유 행 A가 세대 판정·엔진의 ⑧ 행 (수정 전: A 행에서 차단)", async () => {
    const f = form([L, A]);
    expect(calcDup(f)).toEqual([]);
    expect(judgmentDup([L, A])).toEqual([]);
    const s = await single(f);
    expect(s.status).toBe(200);
    expect(s.totalTax).toBe((await single(form([A]))).totalTax);
    expect((s.body.houses as Obj[]).filter((h) => h.isUnavoidableOutsideCapital === true).map((h) => h.id)).toEqual(["ha"]);
    expect(s.body.unavoidableOutsideCapitalHouse).toEqual({ reason: "work", resolvedDate: "2025-06-01" });
  });

  it("O3 부정 짝 — 양도일 현재 보유 2행 중복이면 그대로 차단 · ⑫ 400", async () => {
    const B = row("hb", "2019-06-01");
    const f = form([A, B]);
    expect(calcDup(f).map((x) => x.field)).toEqual(["houses.1"]);
    expect(judgmentDup([A, B])).toEqual(["houses.1.oneHouseUnavoidableOutsideCapital"]);
    const s = await single(f);
    expect(s.status).toBe(400);
    expect(Object.keys(s.fieldErrors)).toContain("houses.2.isUnavoidableOutsideCapital");
  });

  it("O4 경계 — 취득일 = 양도일은 양도 후 취득(통과) · 하루 전은 보유(차단)", () => {
    const sameDay = row("hs", TD);
    const dayBefore = row("hd", "2026-09-17");
    expect(calcDup(form([A, sameDay]))).toEqual([]);
    expect(judgmentDup([A, sameDay])).toEqual([]);
    expect(calcDup(form([A, dayBefore])).map((x) => x.field)).toEqual(["houses.1"]);
    expect(judgmentDup([A, dayBefore])).toEqual(["houses.1.oneHouseUnavoidableOutsideCapital"]);
  });

  it("O5 경계 — 같은 날 양도(§154⑨): 「먼저 양도」 선택 행은 통과 · 「나중에」는 보유라 차단", () => {
    const first = row("hf", "2019-06-01", { soldSameDay: true, sameDayTransferOrder: "first" });
    const later = row("hn", "2019-06-01", { soldSameDay: true, sameDayTransferOrder: "later" });
    expect(calcDup(form([A, first]))).toEqual([]);
    expect(judgmentDup([A, first])).toEqual([]);
    expect(calcDup(form([A, later])).map((x) => x.field)).toEqual(["houses.1"]);
    expect(judgmentDup([A, later])).toEqual(["houses.1.oneHouseUnavoidableOutsideCapital"]);
  });

  it("O6 양도일 미입력 — 보유 판정 leaf가 거르지 않으므로 종전대로 차단", () => {
    expect(calcDup(form([A, L], "")).map((x) => x.field)).toEqual(["houses.1"]);
    expect(judgmentDup([A, L], "")).toEqual(["houses.1.oneHouseUnavoidableOutsideCapital"]);
  });

  it("O7 ⑤ 경고 — 같은 술어: 양도일 뒤 취득 행과는 겹침 아님 · 보유 행끼리만 번호", () => {
    expect(otherUocRowNumberOf([A, L], "ha", TD, "housing")).toBeUndefined();
    expect(otherUocRowNumberOf([A, L], "hl", TD, "housing")).toBeUndefined();
    expect(otherUocRowNumberOf([L, A], "ha", TD, "housing")).toBeUndefined();
    const B = row("hb", "2019-06-01");
    expect(otherUocRowNumberOf([L, A, B], "hb", TD, "housing")).toBe(2);
    expect(otherUocRowNumberOf([A, L], "ha", "", "housing")).toBe(2);
  });

  it("O8 ⑤ 경고 — §154⑨ 「먼저 양도」 행은 주택 양도에서만 빠진다(⑧ O5와 같은 축 · `primaryKind` 전달)", () => {
    const F = row("hf", "2019-06-01", { soldSameDay: true, sameDayTransferOrder: "first" });
    expect(otherUocRowNumberOf([A, F], "ha", TD, "housing")).toBeUndefined();
    // 입주권 양도에는 §154⑨가 닿지 않는다(`sameDayOrderApplies`) — 남은 선택값으로 빼지 않고 보유 행으로 센다
    expect(otherUocRowNumberOf([A, F], "ha", TD, "right_to_move_in")).toBe(2);
  });
  it("O9 「반영 안 됨」 안내(⑤)가 실제 동작과 일치 — 안내가 뜨는 행은 ④ 명부에서 빠지고 ⑧ 사실·세액에 실리지 않는다", async () => {
    // L은 양도일 뒤 취득 ⑧ 행 — 안내 대상. A는 보유 ⑧ 행 — 안내 없음.
    expect(uocRowAcquiredAfterTransfer(L, TD)).toBe(true);
    expect(uocRowAcquiredAfterTransfer(A, TD)).toBe(false);
    // 경계: 당일 = 안내(양도 후 취득), 하루 전 = 없음
    expect(uocRowAcquiredAfterTransfer(row("hs", TD), TD)).toBe(true);
    expect(uocRowAcquiredAfterTransfer(row("hd", "2026-09-17"), TD)).toBe(false);
    // 양도일 미입력은 단정하지 않는다
    expect(uocRowAcquiredAfterTransfer(L, "")).toBe(false);
    // L만 ⑧인 세대: ④ 명부에 L이 없고, ⑧ 사실이 비어 있으며, 세액은 ⑧ 표시가 없는 L과 같다
    const withMark = await single(form([L]));
    const withoutMark = await single(form([{ ...L, oneHouseUnavoidableOutsideCapital: undefined } as HouseEntry]));
    expect((withMark.body.houses as Obj[]).map((h) => h.id)).toEqual(["selling"]);
    expect(withMark.body.unavoidableOutsideCapitalHouse).toBeUndefined();
    expect(withMark.status).toBe(200);
    expect(withMark.totalTax).toBe(withoutMark.totalTax);
  });

  // ── 리뷰 지적 — 「반영 안 됨」 안내 행에 ⑧ 검증이 해소일 택일을 요구하던 모순 ──
  const blank = (id: string, acq: string) => row(id, acq, { unavoidableOutsideCapitalResolvedDate: "", unavoidableOutsideCapitalUnresolved: undefined });
  const calcUoc = (f: Form) => collectStepIssues(1, f).filter((x) => x.message.includes("사유 해소일")).map((x) => x.field);
  const judgUoc = (houses: HouseEntry[], transferDate = TD) => {
    const j = createInitialOneHouseJudgmentForm();
    j.houses = houses;
    j.transferDate = transferDate;
    j.assets[0] = { ...j.assets[0], assetKind: "housing" };
    return validateJudgmentStep2(j).filter((e) => e.message.includes("사유 해소일")).map((e) => e.field);
  };

  it("O10 ★ 해소일·미해소를 비운 ⑧ 행 — 양도일 당일·뒤 취득 행은 안내만 뜨고 막지 않는다 · 보유 행·양도일 미입력은 종전대로 막는다", () => {
    // [취득일, 양도일, 막힘 기대] — 안내(uocRowAcquiredAfterTransfer)가 뜨는 칸과 정확히 반대
    const grid: Array<[string, string, boolean]> = [
      ["2026-10-01", TD, false],
      [TD, TD, false],
      ["2026-09-17", TD, true],
      ["2019-06-01", TD, true],
      ["2026-10-01", "", true],
    ];
    for (const [acq, td, blocked] of grid) {
      const h = blank("hx", acq);
      expect(uocRowAcquiredAfterTransfer(h, td), `${acq}/${td}`).toBe(!blocked && td !== "");
      expect(calcUoc(form([h], td)).length > 0, `계산기 ${acq}/${td}`).toBe(blocked);
      expect(judgUoc([h], td).length > 0, `판정 ${acq}/${td}`).toBe(blocked);
    }
    // 보유 ⑧ 행은 비워도 그대로 막는다 — 같은 시료에서 L만 풀린다
    expect(calcUoc(form([blank("ha", "2018-01-01"), blank("hl", "2026-10-01")]))).toEqual(["houses.0"]);
    expect(judgUoc([blank("ha", "2018-01-01"), blank("hl", "2026-10-01")])).toEqual(["houses.0.unavoidableOutsideCapitalResolvedDate"]);
    // ⑧ 토글이 꺼진 행은 처음부터 요구하지 않는다
    expect(calcUoc(form([{ ...blank("hx", "2018-01-01"), oneHouseUnavoidableOutsideCapital: false } as HouseEntry]))).toEqual([]);
  });

  it("O11 ⑫ 거울 — 비운 채 양도일 뒤 취득 ⑧ 행이 있어도 ⑫는 200(④가 그 행을 싣지 않는다) · ⑧도 막지 않아 두 층이 같다", async () => {
    const f = form([A, blank("hl", "2026-10-01")]);
    expect(calcUoc(f)).toEqual([]);
    const s = await single(f);
    expect(s.status).toBe(200);
    expect(s.totalTax).toBe((await single(form([A]))).totalTax);
  });

  it("O12 레거시 스칼라(옛 저장값) — 행 표시와 별개의 세대 단위 선언이라 ④에 그대로 실린다 · 행 값은 안 실린다 · OH-30 안내가 레거시 단독임을 밝힌다", async () => {
    // 레거시 스칼라를 켤 수 있는 화면은 없다 — 옛 저장값 복원으로만 도달한다(`unavoidableOutsideCapitalSpecial`).
    const f = form([L]);
    Object.assign(f, { unavoidableOutsideCapitalSpecial: true, unavoidableOutsideCapitalReason: "study", unavoidableOutsideCapitalResolvedDate: "2025-06-01" });
    const s = await single(f);
    expect(s.status).toBe(200);
    // 실리는 값은 레거시(사유 study · 해소일 2025-06-01) — ⑧ 행 L(사유 work · 해소일 2021-01-01)의 값이 아니다.
    expect(s.body.unavoidableOutsideCapitalHouse).toEqual({ reason: "study", resolvedDate: "2025-06-01" });
    expect((s.body.houses as Obj[]).map((h) => h.id)).toEqual(["selling"]);
    // 그 상태를 화면이 감추지 않는다 — 행이 보유 명부에서 빠지므로 「레거시 단독」(OH-30 안내 조건)이다.
    const facts = deriveOneHouseFactsFromHouses([L], { unavoidableOutsideCapitalHouse: { reason: "study" } }, TD);
    expect(facts.fromLegacyOnly).toBe(true);
    expect(uocRowAcquiredAfterTransfer(L, TD)).toBe(true);
  });
});
