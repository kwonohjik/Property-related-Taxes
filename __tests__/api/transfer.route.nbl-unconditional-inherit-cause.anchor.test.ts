/**
 * 무조건 사업용 의제 중 상속 관련 3종(「소득세법 시행령」 §168의14③1호·1의2호·4호 나목)은 취득원인·상속개시일로 정한다 (2026-10-19)
 * 계획서: docs/00-pm/nbl-unconditional-inherit-cause.plan.md
 *
 * 종전(master `f719e27dc` 실측 — 계획서 §3):
 *  - 1의2호: 매매 자산에서 선언하면 사업용 214,335,000(법령대로 비사업용 274,780,000).
 *  - 4호 나목: 자기 입력칸이 없어 상속 2022 + 선언이 비사업용 302,236,000. ③1호 칸에 남은 상속일로만 사업용이 됐고,
 *    그 값이 남으면 매매(B3)·5년 경과 상속(B4)도 사업용.
 *  - 1호: 매매·증여에서 선언+상속일이면 사업용 187,440,000, 상속인데 상속일을 비우거나 선언하지 않으면 비사업용 300,685,000.
 * ⑧ 오류는 어느 경우에도 없었다. 아래 시료는 옛 선언·상속일 저장값을 남겨 둔 채 넣어 무시되는지 본다.
 *
 * 입력은 화면 폼 → ⑧ → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 엔진. 수치는 mock 세율표 실측값이다.
 */
import { describe, it, expect, vi } from "vitest";
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 농지 3,000㎡ · 취득가 4억 · 양도가 10억 — 재촌·자경 없음(의제가 없으면 비사업용) */
const FARM = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "farmland",
} as Partial<AssetForm>;
const RURAL = { nblZoneType: "agriculture_forest" } as Partial<AssetForm>;
const URBAN = { nblZoneType: "general_residential", addressJibun: "서울 강남구 테스트동 1", nblUrbanIncorporationDate: "2000-01-01" } as Partial<AssetForm>;
const BUY = (d: string) => ({ acquisitionCause: "purchase", acquisitionDate: d }) as Partial<AssetForm>;
const GIFT = (d: string) => ({ acquisitionCause: "gift", acquisitionDate: d, publishedValueAtGift: "400000000" }) as Partial<AssetForm>;
const INH = (d: string) =>
  ({ acquisitionCause: "inheritance", acquisitionDate: d, decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" }) as Partial<AssetForm>;
const ANCESTOR = { nblExemptAncestor8YearFarming: true } as Partial<AssetForm>;
/** 옛 저장값 — 이제 판정에 닿지 않아야 한다 */
const OLD_1HO = (d: string) => ({ nblExemptInheritBefore2007: true, nblExemptInheritDate: d }) as Partial<AssetForm>;
const OLD_4HO = (d: string) => ({ nblExemptUrbanFarmlandJongjoong: true, nblExemptInheritDate: d }) as Partial<AssetForm>;

const T = "2024-06-03";
const T09 = "2009-06-01";

function form(transferDate: string, ...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.filingDate = `${transferDate.slice(0, 4)}-08-31`;
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, FARM, ...parts) as AssetForm];
  return f;
}

async function run(f: TransferFormData) {
  const cap: { body?: unknown } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  const json = (await res.json()) as {
    data?: {
      result?: {
        totalTax?: number;
        nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean; judgmentSteps?: Array<{ id: string; status: string }> };
      };
    };
  };
  const detail = json.data?.result?.nonBusinessLandJudgmentDetail;
  return {
    status: res.status,
    issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)),
    total: json.data?.result?.totalTax,
    nbl: detail?.isNonBusinessLand,
    uncond: detail?.judgmentSteps?.find((x) => x.id === "unconditional_exemption")?.status,
  };
}

const C4_TOTAL = 234_960_000;

describe("무조건 사업용 의제 상속 3종 — 취득원인·상속개시일 (§168의14③1호·1의2호·4호 나목)", () => {
  it.each([
    // 1의2호 — 비도시(농림지역)
    ["A0 1의2호 · 매매 · 선언 없음", form(T, RURAL, BUY("2020-01-01")), true, 274_780_000],
    ["A1 1의2호 · 매매 + 선언 → 상속·증여가 아니라 불성립", form(T, RURAL, BUY("2020-01-01"), ANCESTOR), true, 274_780_000],
    ["A2 1의2호 · 상속 + 선언", form(T, RURAL, INH("2020-01-01"), ANCESTOR), false, 214_335_000],
    ["A3 1의2호 · 증여 + 선언", form(T, RURAL, GIFT("2020-01-01"), ANCESTOR), false, 214_335_000],
    // 상속 2015 — 2020이면 4호 나목(도시지역 농지 상속 5년)이 자동으로 성립해 1의2호 단서를 가린다
    ["A6 1의2호 · 상속 2015 + 선언 · 도시지역(주거) → 단서 제외", form(T, URBAN, INH("2015-01-01"), ANCESTOR), true, 240_691_000],
    ["A6' 같은 시료 · 선언 없음(부정 짝)", form(T, URBAN, INH("2015-01-01")), true, 240_691_000],
    // 4호 나목 — 도시지역(주거) 농지
    ["B1 4호 나목 · 상속 2022 · 선언 없이 자동 성립", form(T, URBAN, INH("2022-01-01")), false, 236_511_000],
    ["B2 4호 나목 · 상속 2022 + 옛 선언·상속일", form(T, URBAN, INH("2022-01-01"), OLD_4HO("2022-01-01")), false, 236_511_000],
    ["B3 4호 나목 · 매매 2022 + 옛 선언·상속일", form(T, URBAN, BUY("2022-01-01"), OLD_4HO("2022-01-01")), true, 302_236_000],
    ["B4 4호 나목 · 상속 2017(5년 경과) + 옛 상속일 2022", form(T, URBAN, INH("2017-01-01"), OLD_4HO("2022-01-01")), true, 254_188_000],
    // 1호 — 2009-06-01 양도
    ["C0 1호 · 매매 2000 · 선언 없음", form(T09, RURAL, BUY("2000-01-01")), true, 300_685_000],
    ["C1 1호 · 매매 2000 + 옛 선언·상속일", form(T09, RURAL, BUY("2000-01-01"), OLD_1HO("2000-01-01")), true, 300_685_000],
    ["C6 1호 · 증여 2000 + 옛 선언·상속일", form(T09, RURAL, GIFT("2000-01-01"), OLD_1HO("2000-01-01")), true, 300_685_000],
    ["C2 1호 · 상속 2000 + 옛 선언 · 상속일 빈칸", form(T09, RURAL, INH("2000-01-01"), OLD_1HO("")), false, 187_440_000],
    // 1호는 불성립(상속 2008)이지만 양도 2009는 상속개시일부터 3년 안이라 §168의8③2호로 사업용이다(2008.1.1. 시행본에도
    // 같은 2호가 있다 — 계획서 nbl-farmland-inherit-inong-3y.plan.md). 종전 값은 비사업용 300,685,000.
    ["C4 1호 · 상속 2008 + 옛 상속일 2005(오입력) → 1호 불성립 · ③2호 사업용", form(T09, RURAL, INH("2008-01-01"), OLD_1HO("2005-01-01")), false, C4_TOTAL],
    ["C5 1호 · 상속 2000 · 선언 없이 자동 성립", form(T09, RURAL, INH("2000-01-01")), false, 187_440_000],
  ] as const)("%s", async (_name, f, nbl, total) => {
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
  });

  /** 4호 나목 「상속개시일부터 5년 이내에 양도」 — 엔진 경계(`transferDate <= addYears(상속개시일, 5)`) 고정 */
  it("4호 나목 5년 경계: 상속 2019-06-03 사업용 · 2019-06-02 비사업용 (양도 2024-06-03)", async () => {
    expect((await run(form(T, URBAN, INH("2019-06-03")))).nbl).toBe(false);
    expect((await run(form(T, URBAN, INH("2019-06-02")))).nbl).toBe(true);
  });

  /** 1호 「2006년 12월 31일 이전에 상속받은」 경계 */
  /**
   * 1호 경계는 무조건 의제 단계로 본다 — 2007-01-01 상속은 1호가 불성립하지만 양도 2009-06-01이 상속개시일부터 3년 안이라
   * §168의8③2호로 결국 사업용이다(종전 단언 「2007-01-01 비사업용」은 ③2호가 엔진에 없던 때의 값).
   */
  it("1호 상속개시일 경계: 2006-12-31 1호 성립 · 2007-01-01 1호 불성립(③2호로 사업용) (양도 2009-06-01)", async () => {
    const on = await run(form(T09, RURAL, INH("2006-12-31")));
    expect([on.uncond, on.nbl]).toEqual(["PASS", false]);
    const off = await run(form(T09, RURAL, INH("2007-01-01")));
    expect([off.uncond, off.nbl]).toEqual(["NOT_APPLICABLE", false]);
  });
});
