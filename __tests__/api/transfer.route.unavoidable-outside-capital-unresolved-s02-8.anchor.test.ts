/**
 * #31(S02-8) 「소득세법 시행령」 §155⑧ 수도권 밖 부득이 주택 — 해소일 ↔ 「사유가 양도일 현재 해소되지 않음」 택일
 *
 * 법문(MST 242735 §155⑧ 실독): 「…부득이한 사유로 취득한 수도권 밖에 소재하는 주택과 그 밖의 주택(일반주택)을 국내에 각각 1개씩 소유하고 있는
 * 1세대가 부득이한 사유가 해소된 날부터 3년 이내에 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」.
 * 부칙 <대통령령 제23588호, 2012.2.2.> 제10조 「제155조제8항의 개정규정은 이 영 시행 후 부득이한 사유가 해소된 분부터 적용한다」 — 종전 ⑧
 * (2008.11.28. 신설)에는 해소 개념도 3년 기한도 없었다(DRF eflaw 2011-12-08 시행본·2012-02-02 시행본 실독 2026-10-11).
 *
 * | 사례(2주택 · 일반주택 8억 · 양도 2026-09-18) | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 해소일·「미해소」 모두 없음(빈 칸 = 모름) | 비과세 0원 + 판정 보류 | ⑧ 차단 · ⑫ 400 (엔진 직접 호출은 불성립) |
 * | 「사유가 양도일 현재 해소되지 않음」 선택 | (빈 칸과 같음) 0원 | 비과세 0원 — 의도적 선택은 유지 |
 * | 해소일 3년 안 | 비과세 | 비과세 |
 * | 해소일 3년 경과 | 과세 | 과세 |
 * | 해소일 2012.2.2. 전 | 3년 경과로 과세 | 기한 없이 비과세(부칙 제10조) |
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
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 as validateJudgmentStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { houseUnavoidableOutsideCapitalIssue } from "@/lib/calc/house-row-required-issues";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import { unavoidableOutsideCapitalHouseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  qualifiesUnavoidableOutsideCapital,
  unavoidableResolvedDeadlineApplies,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const BUSAN_GIJANG = "2671025000"; // 수도권 밖

/** 수도권 밖 부득이 주택 행 — 해소일·「미해소」는 케이스가 정한다 */
function uocRow(over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h-uoc",
    region: "non_capital",
    regionCode: BUSAN_GIJANG,
    acquisitionDate: "2020-03-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseUnavoidableOutsideCapital: true,
    unavoidableOutsideCapitalReason: "work",
    // 양도 주택보다 나중에 취득한 행은 신규 주택 취득 경위를 답해야 한다(결정 #43) — 이 시험의 관심사가 아니라 일반 취득으로 둔다.
    acquisitionOrigin: "general",
    ...over,
  };
}

function form(houses: HouseEntry[], price = "800,000,000"): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: price,
    residencePeriodMonths: "36",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
    householdNoPresaleRightsConfirmed: true,
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
async function single(f: Form) {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as {
    data?: { result: { totalTax: number; isExempt?: boolean; exemptReason?: string; warnings?: string[] } };
    error?: { fieldErrors?: Record<string, string[]> };
  };
  return { status: res.status, result: json.data?.result, fieldErrors: json.error?.fieldErrors };
}
async function multi(f: Form): Promise<number> {
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

describe("#31 화면·API — 해소일 또는 「미해소」 택일 (14지점 ④⑤⑧⑫⑭)", () => {
  it("V1 ★ 해소일·「미해소」 모두 없음 → ⑧ 차단 + ⑫ 400 (수정 전: 비과세 0원 + 판정 보류)", async () => {
    const f = form([uocRow()]);
    expect(collectStepIssues(1, f).map((x) => x.message).join("\n")).toContain("「사유가 양도일 현재 해소되지 않음」");
    const s = await single(f);
    expect(s.status).toBe(400);
    expect(Object.keys(s.fieldErrors ?? {}).join()).toContain("unavoidableOutsideCapitalHouse");
  });

  it("V2 「사유가 양도일 현재 해소되지 않음」 선택 → 통과 · 비과세 0원 (단건 = 다건)", async () => {
    const f = form([uocRow({ unavoidableOutsideCapitalUnresolved: true })]);
    expect(collectStepIssues(1, f)).toEqual([]);
    const s = await single(f);
    expect(s.status).toBe(200);
    expect(s.result?.totalTax).toBe(0);
    expect(await multi(f)).toBe(0);
  });

  it("V3 해소일 3년 안(2025-06-01) → 비과세 0원 / 3년 경과(2020-01-01) → 과세 (날짜 경로 — 기한 판정은 종전과 같다)", async () => {
    expect((await single(form([uocRow({ unavoidableOutsideCapitalResolvedDate: "2025-06-01" })]))).result?.totalTax).toBe(0);
    const late = await single(form([uocRow({ unavoidableOutsideCapitalResolvedDate: "2020-01-01" })]));
    expect(late.status).toBe(200);
    expect(late.result?.totalTax).toBeGreaterThan(0);
  });

  it("V4 ④ — 「미해소」를 고르면 남은 날짜(stale)는 싣지 않는다 · ⑫는 둘을 함께 받으면 400", async () => {
    const f = form([uocRow({ unavoidableOutsideCapitalUnresolved: true, unavoidableOutsideCapitalResolvedDate: "2010-01-01" })]);
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect(body.unavoidableOutsideCapitalHouse).toEqual({ reason: "work", unresolvedAtTransfer: true });
    const both = { ...body, unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: "2025-06-01", unresolvedAtTransfer: true } };
    expect((await post(SINGLE, "http://l/api/calc/transfer", both)).status).toBe(400);
  });

  it("V5 판정 메뉴 ⑧도 같은 요구 — 빈 값이면 해당 행·칸에서 막는다", () => {
    const j = createInitialOneHouseJudgmentForm();
    j.houses = [uocRow()];
    const errors = validateJudgmentStep2(j);
    expect(errors.some((e) => e.field === "houses.0.unavoidableOutsideCapitalResolvedDate")).toBe(true);
    j.houses = [uocRow({ unavoidableOutsideCapitalUnresolved: true })];
    expect(validateJudgmentStep2(j).some((e) => e.field === "houses.0.unavoidableOutsideCapitalResolvedDate")).toBe(false);
  });

  it("V6 ⑧ leaf — 토글이 꺼진 행은 요구하지 않는다(부정 짝)", () => {
    expect(houseUnavoidableOutsideCapitalIssue({})).toBeNull();
    expect(houseUnavoidableOutsideCapitalIssue({ oneHouseUnavoidableOutsideCapital: true })?.field).toBe("unavoidableOutsideCapitalResolvedDate");
    expect(houseUnavoidableOutsideCapitalIssue({ oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalUnresolved: true })).toBeNull();
    expect(
      houseUnavoidableOutsideCapitalIssue({ oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalResolvedDate: "2025-01-01" }),
    ).toBeNull();
  });

  it("V7 Zod 스키마 ⑫ — 빈 객체 거절 · 택일 각각 통과 · 함께 보내면 거절", () => {
    const ok = (v: unknown) => unavoidableOutsideCapitalHouseSchema.safeParse(v).success;
    expect(ok({ reason: "work" })).toBe(false);
    expect(ok({ reason: "work", unresolvedAtTransfer: true })).toBe(true);
    expect(ok({ reason: "work", resolvedDate: "2025-06-01" })).toBe(true);
    expect(ok({ reason: "work", resolvedDate: "2025-06-01", unresolvedAtTransfer: true })).toBe(false);
  });

  it("V8 ④ 명부 행 도출 — 해소일 / 미해소 / 빈 값", () => {
    const d = (r: HouseEntry) => deriveOneHouseFactsFromHouses([r], {}, TRANSFER_DATE).unavoidableOutsideCapitalHouse;
    expect(d(uocRow({ unavoidableOutsideCapitalResolvedDate: "2025-06-01" }))).toEqual({ reason: "work", resolvedDate: "2025-06-01" });
    expect(d(uocRow({ unavoidableOutsideCapitalUnresolved: true }))).toEqual({ reason: "work", unresolvedAtTransfer: true });
    expect(d(uocRow())).toEqual({ reason: "work" }); // 「모름」 — 어느 쪽도 싣지 않는다(⑧·⑫가 막는다)
  });
});

describe("#31 엔진 — 빈 값(모름)은 불성립, 선택·해소일은 종전대로", () => {
  const mockRates = makeMockRates();
  const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
  const D = (s: string) => new Date(s);
  const base = (uoc: TransferTaxInput["unavoidableOutsideCapitalHouse"], transfer = TRANSFER_DATE): TransferTaxInput =>
    baseTransferInput({
      householdHousingCount: 2,
      acquisitionDate: D("2015-01-01"),
      transferDate: D(transfer),
      residencePeriodMonths: 36,
      unavoidableOutsideCapitalHouse: uoc,
    });
  const calc = (i: TransferTaxInput) => calculateTransferTax(i, mockRates);
  const judge = (i: TransferTaxInput) => checkExemption(i as OneHouseJudgeInput, rules, D("2026-09-26"));

  it("E1 ★ 엔진 직접 — 빈 값은 불성립(과세) · 「미해소」는 비과세 · 해소일 3년 경과 빈 값과 같은 과세", () => {
    const blank = calc(base({ reason: "work" }));
    expect(blank.isExempt).toBe(false);
    expect(calc(base({ reason: "work", unresolvedAtTransfer: true })).isExempt).toBe(true);
    expect(calc(base({ reason: "work", resolvedDate: D("2019-01-01") })).determinedTax).toBe(blank.determinedTax);
  });

  it("E2 술어 — qualifiesUnavoidableOutsideCapital", () => {
    const q = (uoc: TransferTaxInput["unavoidableOutsideCapitalHouse"], t = TRANSFER_DATE) =>
      qualifiesUnavoidableOutsideCapital({
        householdHousingCount: 2,
        transferDate: D(t),
        unavoidableOutsideCapitalHouse: uoc,
      });
    expect(q({ reason: "work" })).toBe(false);
    expect(q({ reason: "work", unresolvedAtTransfer: true })).toBe(true);
    expect(q({ reason: "work", resolvedDate: D("2023-09-18") })).toBe(true); // 3년 당일
    expect(q({ reason: "work", resolvedDate: D("2023-09-17") })).toBe(false); // 3년 + 1일
  });

  it("E3 ★ 부칙 제23588호 제10조 — 2012.2.2. 전 해소분은 3년 기한 없이 적용 (종전: 3년 경과로 과세)", () => {
    expect(unavoidableResolvedDeadlineApplies(D("2012-02-01"))).toBe(false);
    expect(unavoidableResolvedDeadlineApplies(D("2012-02-02"))).toBe(true); // 시행일 당일은 「시행 후」로 보아 3년 적용
    const q = (resolved: string) =>
      qualifiesUnavoidableOutsideCapital({
        householdHousingCount: 2,
        transferDate: D("2026-09-18"),
        unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D(resolved) },
      });
    expect(q("2012-01-31")).toBe(true);
    expect(q("2012-02-01")).toBe(true);
    expect(q("2012-02-02")).toBe(false); // 기한 적용 → 2015-02-02 경과
  });

  it("E4 판정 메뉴 — 종전 판정 보류 155-8-resolved-date-missing은 사라졌다(빈 값은 입력 단계에서 막힌다)", () => {
    for (const uoc of [{ reason: "work" as const }, { reason: "work" as const, unresolvedAtTransfer: true }]) {
      expect(judge(base(uoc)).undetermined.map((u) => u.id)).not.toContain("155-8-resolved-date-missing");
    }
  });

  it("E5 판정 메뉴 — 빈 값이면 불성립 사유에 확인 필요를 싣는다(직접 호출 방어)", () => {
    const j = judge(base({ reason: "work" }));
    expect(j.isExempt).toBe(false);
    const reasons = (j.unmetExceptions ?? []).flatMap((u) => u.reasons).join("\n");
    expect(reasons).toContain("확인 필요");
  });
});
