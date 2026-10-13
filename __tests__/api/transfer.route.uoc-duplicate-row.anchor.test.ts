/**
 * §155⑧ 행은 한 채 — PR #2155(결정 #16-1) 후속. 폼 → ⑧ → ④ → ⑫ → ⑭ route → 엔진.
 *
 * 법문(실독 2026-10-13 · MST 290841): §155⑧은 「부득이한 사유로 취득한 수도권 밖에 소재하는 주택과 그 밖의 주택(일반주택)을
 * 국내에 **각각 1개씩** 소유하고 있는 1세대」에만 적용되고, 영 §167의10①4호는 「제155조제8항에 따른 수도권 밖에 소재하는 주택」을
 * 그대로 인용한다 ⇒ ⑧ 주택은 한 채다.
 *
 * 결함: 세대 판정(`findUnavoidableOutsideCapitalRow`)은 **첫 ⑧ 행**의 사유·해소일로 4호 슬롯을 세우는데, 중과 4호 분기는 ⑧ 행
 * **아무거나**(`some`)가 중과 주택 수 2채 안이면 배제했다. 첫 행이 중과 주택 수 밖(지방 3억 이하 — 영 §167의3①1호)이고 둘째 행이
 * 2채 안이면, 첫 행의 사실로 선 슬롯을 둘째 행의 위치로 배제했다.
 *
 * 세율은 프로덕션 fallback · 양도 2026-09-18 · 강남 양도 주택 2018 취득(조정 취득 · 거주 0 — 비과세·15호 불성립) · 20억.
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---:|---:|
 * | A(⑧·경남 1억)만 | 633,088,500 | 633,088,500 |
 * | A + B(상속·강남, ⑧ 아님) | 1,141,178,500 | 1,141,178,500 |
 * | A + B(⑧ 중복 표시) | 633,088,500 (4호 배제 — B의 위치로) | ⑧ 차단 · ⑫ 400 |
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
import {
  duplicateUnavoidableOutsideCapitalRows,
  otherUocRowNumberOf,
} from "@/lib/calc/house-row-required-issues";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TD = "2026-09-18";
const GANGNAM = "1168010100";
const GYEONGNAM = "4812110100";

/** ⑧ 주택 — 경남 기준시가 1억(중과 주택 수 밖 · 영 §167의3①1호) · 해소일 3년 안 */
const A = {
  id: "ha", region: "non_capital", regionCode: GYEONGNAM, acquisitionDate: "2018-01-01", officialPrice: "100000000",
  isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
  acquisitionOrigin: "general",
  oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2025-06-01",
} as HouseEntry;
/** 상속주택(2019 — 5년 경과, 중과 주택 수 안 · §155② 비과세 주택 수 밖) */
const B = {
  id: "hb", region: "capital", regionCode: GANGNAM, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01", officialPrice: "300000000",
  isInherited: true, decedentSameHouseholdAtInheritance: false, isLongTermRental: false, isApartment: true, isOfficetel: false,
  isUnsoldHousing: false, acquisitionOrigin: "general",
} as HouseEntry;
const B_DUP = {
  ...B, oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2025-06-01",
} as HouseEntry;

function form(houses: HouseEntry[]): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM };
  return Object.assign(f, {
    transferDate: TD, contractTotalPrice: "2,000,000,000", residencePeriodMonths: "0", householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, houses,
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
async function single(f: Form) {
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(f)),
    }),
  );
  const json = (await res.json()) as {
    data?: { result: { totalTax: number; multiHouseSurchargeEvaluation: { exclusionReasons: { type: string }[] } } };
    error?: { fieldErrors?: Record<string, string[]> };
  };
  return {
    status: res.status,
    totalTax: json.data?.result.totalTax,
    uoc: json.data?.result.multiHouseSurchargeEvaluation.exclusionReasons.some((e) => e.type === "unavoidable_outside_capital"),
    fieldErrors: json.error?.fieldErrors ?? {},
  };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("§155⑧ 행 한 채 — ⑧·⑫ 차단 (PR #2155 후속)", () => {
  it("D1 ★ ⑧ 행 둘 → 계산기 ⑧이 둘째 행에서 막고 첫 행을 가리킨다 · ⑫ 400 (수정 전: 200 · 633,088,500 · 4호 배제)", async () => {
    const f = form([A, B_DUP]);
    const issues = collectStepIssues(1, f);
    const dup = issues.find((x) => x.message.includes("한 채만"));
    expect(dup?.message).toMatch(/^보유 주택 2: §155⑧ 수도권 밖 부득이 주택은 한 채만 표시할 수 있습니다 — 보유 주택 1에도/);
    expect(dup?.field).toBe("houses.1");
    expect(issues.some((x) => x.field === "houses.0")).toBe(false);
    const s = await single(f);
    expect(s.status).toBe(400);
    // 양도 주택이 houses[0]이라 명부 둘째 행은 houses[2]
    expect(Object.keys(s.fieldErrors)).toContain("houses.2.isUnavoidableOutsideCapital");
  });

  it("D2 부정 짝 — ⑧ 행 하나면 막지 않고 종전 세액 그대로", async () => {
    expect(collectStepIssues(1, form([A, B])).some((x) => x.message.includes("한 채만"))).toBe(false);
    const one = await single(form([A]));
    expect(one).toMatchObject({ status: 200, totalTax: 633_088_500, uoc: false });
    const ab = await single(form([A, B]));
    expect(ab).toMatchObject({ status: 200, totalTax: 1_141_178_500, uoc: false });
  });

  it("D3 판정 메뉴 ⑧ — 같은 leaf · 둘째 행의 ⑧ 토글 칸", () => {
    const j = createInitialOneHouseJudgmentForm();
    j.houses = [A, B_DUP];
    const dup = validateJudgmentStep2(j).filter((e) => e.message.includes("한 채만"));
    expect(dup.map((e) => e.field)).toEqual(["houses.1.oneHouseUnavoidableOutsideCapital"]);
    expect(dup[0].message).toContain("보유 주택 1에도");
    j.houses = [A, B];
    expect(validateJudgmentStep2(j).some((e) => e.message.includes("한 채만"))).toBe(false);
  });

  it("D4 leaf — 첫 ⑧ 행 다음 행마다 · ⑤ 다른 행 번호", () => {
    expect(duplicateUnavoidableOutsideCapitalRows([undefined, true, false, true, true])).toEqual([
      { index: 3, firstIndex: 1 },
      { index: 4, firstIndex: 1 },
    ]);
    expect(duplicateUnavoidableOutsideCapitalRows([true, undefined])).toEqual([]);
    expect(duplicateUnavoidableOutsideCapitalRows([])).toEqual([]);
    expect(otherUocRowNumberOf([A, B_DUP], "hb")).toBe(1);
    expect(otherUocRowNumberOf([A, B_DUP], "ha")).toBe(2);
    expect(otherUocRowNumberOf([A, B], "ha")).toBeUndefined();
  });
});
