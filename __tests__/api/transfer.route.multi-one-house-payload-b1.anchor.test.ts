/**
 * B1 — 다건 합산(`/api/calc/transfer/multi`) ⑬이 1세대1주택 비과세 사실을 **단건과 같이** 싣는다.
 * 리뷰: docs/reviews/one-house-exemption-review-2026-09.md OH-08 · OH-10 · OH-11.
 *
 * 다건 편집 화면은 단건 계산기(`<TransferTaxCalculator />`)를 그대로 마운트한다. 그래서 명부 행의
 * 상속 게이트 토글(HouseEntryEditor)도, 「판정 불러오기」(Step1 → `applyOneHouseFactsToTransferForm`)도
 * 화면에 뜨고 자산 폼에 저장된다. ⑫(Zod)·⑭(multi route)는 이 키를 받고 넘기는데 ⑬
 * (`buildPropertyPayload`)만 싣지 않아, **같은 폼이 「계산」과 「합산 계산」에서 다른 판정**이 됐다
 * (수정 전 실측):
 *
 * | 사실 | 단건 | 다건(수정 전) |
 * |---|---|---|
 * | §155의3 상생임대(판정 불러오기) | 비과세 | 과세 |
 * | §156의2⑤ 대체주택(판정 불러오기) | 비과세 | 과세 |
 * | §155② 단서 — 상속개시 당시 동일세대 | 과세 | **비과세** |
 * | §155② 1~4호 순위 부적격 | 과세 | **비과세** |
 *
 * ⇒ 단건 ④와 **같은 빌더**를 부른다(`buildReplacementHousePayload`·`buildOneHouseExtraFactsPayload`·
 *   `buildOtherHousesPayload`). 규칙을 다건에 한 번 더 쓰지 않는다.
 *
 * 🔑 판정은 **route를 통과시켜** 관측한다 — 「본문에 키가 있다」는 도달을 증명하지 않는다
 *    (`feedback_leaf_anchor_skips_zod_layer`). 부정·긍정 짝을 함께 둔다(사실이 없으면 양쪽 다 같은 답).
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
import { buildPropertyPayload, callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Asset = Form["assets"][number];
type Obj = Record<string, unknown>;

function form(asset: Partial<Asset>, over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", ...asset };
  return Object.assign(f, over);
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

// ───────────────── OH-08 · OH-11 — 판정에서 넘겨받은 사실 ─────────────────

/** §155의3 상생임대 **성립** 사실(직전 18개월 · 상생 24개월 · 증액 4%) — 판정 메뉴 운반 상자. */
const WIN_WIN_FACTS = {
  ...oneHouseJudgmentExtraDefaults,
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "4",
  winWinRentalPriorLeaseMonths: "18",
  winWinRentalLeaseMonths: "24",
};

/** §155의2 장기저당담보 사실 — 본문 도달만 본다(세액 축은 엔진 anchor 소관). */
const MORTGAGE_FACTS = {
  ...oneHouseJudgmentExtraDefaults,
  longTermMortgageSpecial: true,
  longTermMortgageContractDate: "2020-01-01",
  longTermMortgageBorrowerAge: "62",
  longTermMortgageContractYears: "10",
  longTermMortgageMaturityLumpSum: true,
};

/** 조정대상지역에서 취득 · 거주 0개월 1주택 — §154① 본문대로면 과세, §155의3이면 비과세. */
function winWinForm(facts?: typeof WIN_WIN_FACTS): Form {
  return form(
    { acquisitionDate: "2021-03-01", fixedAcquisitionPrice: "500,000,000", residencePeriodMonthsAsset: "0" },
    {
      transferDate: "2026-06-01",
      contractTotalPrice: "900,000,000",
      householdHousingCount: "1",
      residencePeriodMonths: "0",
      wasRegulatedAtAcquisition: true,
      ...(facts ? { importedOneHouseFacts: facts } : {}),
    },
  );
}

/** §156의2⑤ 대체주택 — 사업시행인가 후 취득 · 1년 이상 거주 · 준공 후 3년 내 양도 · 신축 입주 예정. */
function replacementForm(on: boolean): Form {
  return form(
    { acquisitionDate: "2024-01-10", fixedAcquisitionPrice: "300,000,000" },
    {
      transferDate: "2025-06-02",
      contractTotalPrice: "900,000,000",
      householdHousingCount: "1",
      residencePeriodMonths: "16",
      replacementHouseSpecial: on,
      replBusinessApprovalDate: "2020-01-01",
      replCompletionDate: "2025-01-01",
      replResidenceMonths: "16",
      replWillResideNewHouse: true,
    },
  );
}

describe("OH-08 · OH-11 ⑬ — 판정 사실이 다건 본문에 **단건과 같은 모양**으로 실린다", () => {
  it("B1-1 §155의3·§155의2·§156의2⑤ 세 키가 단건 본문과 같다", async () => {
    const cases: [string, Form][] = [
      ["winWinRentalHouse", winWinForm(WIN_WIN_FACTS)],
      ["longTermMortgageHouse", winWinForm(MORTGAGE_FACTS as typeof WIN_WIN_FACTS)],
      ["replacementHouse", replacementForm(true)],
    ];
    for (const [key, f] of cases) {
      const s = await bodyOf(() => callTransferTaxAPI(f));
      const m = buildPropertyPayload(f) as Obj;
      expect(s[key], `${key} 단건 대조군`).toBeDefined();
      expect(m[key], key).toEqual(s[key]);
      // 운반 상자는 UI 메타 — 다건도 전송하지 않는다.
      expect(m).not.toHaveProperty("importedOneHouseFacts");
    }
  });

  it("B1-2 사실이 없으면 세 키가 아예 실리지 않는다 (회귀 0)", () => {
    const m1 = buildPropertyPayload(winWinForm()) as Obj;
    const m2 = buildPropertyPayload(replacementForm(false)) as Obj;
    for (const m of [m1, m2]) {
      expect(m).not.toHaveProperty("winWinRentalHouse");
      expect(m).not.toHaveProperty("longTermMortgageHouse");
      expect(m).not.toHaveProperty("replacementHouse");
    }
  });
});

describe("OH-08 · OH-11 판정 — 화면 경로(⑬→⑫→⑭)가 단건과 같다", () => {
  it("B1-3 [부정 짝] §155의3 사실이 없으면 단건·다건 모두 과세", async () => {
    const f = winWinForm();
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect((await single(f)).isExempt).toBe(false);
    expect((await multi(f)).isExempt).toBe(false);
  });

  it("B1-4 [긍정 짝] §155의3 사실을 넘겨받으면 다건도 비과세 (OH-08)", async () => {
    const f = winWinForm(WIN_WIN_FACTS);
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    expect(s).toEqual({ isExempt: true, totalTax: 0 });
    expect(await multi(f)).toEqual(s);
  });

  it("B1-5 [부정 짝] §156의2⑤ 토글 OFF면 단건·다건 모두 과세", async () => {
    const f = replacementForm(false);
    expect((await single(f)).isExempt).toBe(false);
    expect((await multi(f)).isExempt).toBe(false);
  });

  it("B1-6 [긍정 짝] §156의2⑤ 대체주택 사실이면 다건도 비과세 (OH-11)", async () => {
    const f = replacementForm(true);
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    expect(s).toEqual({ isExempt: true, totalTax: 0 });
    expect(await multi(f)).toEqual(s);
  });
});

// ───────────────── OH-10 — 명부 행의 §155②·③ 게이트 ─────────────────

const INHERITED_ROW: HouseEntry = {
  id: "h-inh",
  region: "non_capital",
  acquisitionDate: "2020-03-01",
  officialPrice: "200000000",
  isInherited: true,
  inheritedDate: "2020-03-01",
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

/** 비조정 일반주택 2012 취득 → 2025 양도 9억 · 명부에 상속주택 1채. */
function inheritedRosterForm(row: Partial<HouseEntry> = {}): Form {
  return form(
    { acquisitionDate: "2012-01-10", fixedAcquisitionPrice: "300,000,000" },
    {
      transferDate: "2025-06-02",
      contractTotalPrice: "900,000,000",
      householdHousingCount: "2",
      residencePeriodMonths: "0",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      houses: [{ ...INHERITED_ROW, ...row }],
    },
  );
}

const rosterRow = (f: Form) =>
  ((buildPropertyPayload(f) as Obj).houses as Obj[]).find((h) => h.id === "h-inh")!;
const singleRosterRow = async (f: Form) =>
  ((await bodyOf(() => callTransferTaxAPI(f))).houses as Obj[]).find((h) => h.id === "h-inh")!;

describe("OH-10 ⑬ — 명부 행이 단건과 같은 필드를 싣는다", () => {
  it("B1-7 §155② 단서·순위·§155③ 공동상속 5필드가 다건 행에 실린다", () => {
    const r = rosterRow(
      inheritedRosterForm({
        decedentSameHouseholdAtInheritance: true,
        parentalCareMergeInheritedHouse: true,
        isRankingDisqualifiedInheritedHouse: true,
        isCoInherited: true,
        isLargestCoInheritedShareholder: true,
      }),
    );
    expect(r.decedentSameHouseholdAtInheritance).toBe(true);
    expect(r.parentalCareMergeInheritedHouse).toBe(true);
    expect(r.isRankingDisqualifiedInheritedHouse).toBe(true);
    expect(r.isCoInherited).toBe(true);
    expect(r.isLargestCoInheritedShareholder).toBe(true);
  });

  it("B1-8 다건 명부 행 = 단건 명부 행 (같은 빌더 — 경로 간 드리프트 차단)", async () => {
    const f = inheritedRosterForm({ decedentSameHouseholdAtInheritance: true, isCoInherited: true });
    expect(rosterRow(f)).toEqual(await singleRosterRow(f));
  });
});

describe("OH-10 판정 — 화면 경로(⑬→⑫→⑭)가 단건과 같다", () => {
  it("B1-9 [대조군] 게이트를 켜지 않으면 상속주택이 빠져 단건·다건 모두 비과세", async () => {
    const f = inheritedRosterForm();
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect((await single(f)).isExempt).toBe(true);
    expect((await multi(f)).isExempt).toBe(true);
  });

  it("B1-10 §155② 단서(상속개시 당시 동일세대) — 다건도 과세, 세액도 같다", async () => {
    const f = inheritedRosterForm({ decedentSameHouseholdAtInheritance: true });
    const s = await single(f);
    expect(s.isExempt).toBe(false);
    expect(await multi(f)).toEqual(s);
  });

  it("B1-11 §155② 1~4호 순위 부적격 — 다건도 과세, 세액도 같다", async () => {
    const f = inheritedRosterForm({ isRankingDisqualifiedInheritedHouse: true });
    const s = await single(f);
    expect(s.isExempt).toBe(false);
    expect(await multi(f)).toEqual(s);
  });
});
