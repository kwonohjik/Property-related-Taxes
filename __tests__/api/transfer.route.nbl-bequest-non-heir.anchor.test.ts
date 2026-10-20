/**
 * 상속인이 아닌 사람(수유자)이 유증·사인증여로 받은 토지 — 비사업용 토지의 상속 특례를 적용하지 않는다 (2026-10-20)
 * 계획서: docs/00-pm/nbl-bequest-non-heir.plan.md
 *
 * 토글 `nonHeirBequest`를 끄면(상속인) 종전 값 그대로, 켜면(수유자) 같은 조건의 매매 시료와 같은 값이어야 한다.
 *  - ③1호: 서면인터넷방문상담5팀-927 · ③1의2호: 사전-2024-법규재산-0820 · ③4호 나목: 기준-2019-법령해석재산-0324
 *  - 임야·목장 상속 3년: 직접 해석 없음(같은 낱말) — 결과 안내에 확인 필요
 * 종전 값은 #2282·#2277 anchor(`transfer.route.nbl-unconditional-inherit-cause.anchor.test.ts` ·
 * `transfer.route.nbl-forest-pasture-inherit-3y.anchor.test.ts`)와 같은 시료·같은 수치다.
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

/** 3,000㎡ · 취득가 4억 · 양도가 10억 — 재촌·자경 없음(특례가 없으면 비사업용) */
const LAND = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true,
} as Partial<AssetForm>;
const FARM = { nblLandType: "farmland" } as Partial<AssetForm>;
const FOREST = { nblLandType: "forest" } as Partial<AssetForm>;
const PASTURE = { nblLandType: "pasture" } as Partial<AssetForm>;
const RURAL = { nblZoneType: "agriculture_forest" } as Partial<AssetForm>;
const URBAN = { nblZoneType: "general_residential", addressJibun: "서울 강남구 테스트동 1", nblUrbanIncorporationDate: "2000-01-01" } as Partial<AssetForm>;
const BUY = (d: string) => ({ acquisitionCause: "purchase", acquisitionDate: d }) as Partial<AssetForm>;
const INH = (d: string) =>
  ({ acquisitionCause: "inheritance", acquisitionDate: d, decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" }) as Partial<AssetForm>;
const NON_HEIR = { nonHeirBequest: true } as Partial<AssetForm>;
const ANCESTOR = { nblExemptAncestor8YearFarming: true } as Partial<AssetForm>;

const T = "2024-06-03";
const T09 = "2009-06-01";

function form(transferDate: string, ...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.filingDate = `${transferDate.slice(0, 4)}-08-31`;
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, LAND, ...parts) as AssetForm];
  return f;
}

async function run(f: TransferFormData) {
  const cap: { body?: { nonBusinessLandRaw?: Record<string, unknown> } } = {};
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
    data?: { result?: { totalTax?: number; nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean; warnings?: string[] } } };
  };
  const d = json.data?.result?.nonBusinessLandJudgmentDetail;
  return {
    status: res.status,
    issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)),
    total: json.data?.result?.totalTax,
    nbl: d?.isNonBusinessLand,
    warnings: (d?.warnings ?? []).join("\n"),
    raw: cap.body?.nonBusinessLandRaw,
  };
}

describe("수유자 토글 — 상속인(끔)은 종전 값, 수유자(켬)는 매매와 같은 값", () => {
  it.each([
    // [이름, 상속인 시료, 수유자 시료, 매매 대조 시료, 상속인 (nbl, 세액), 수유자 (nbl, 세액)]
    ["P1 ③1호 · 비도시 농지 · 2000 상속 · 2009-06-01 양도",
      form(T09, FARM, RURAL, INH("2000-01-01")), form(T09, FARM, RURAL, INH("2000-01-01"), NON_HEIR), form(T09, FARM, RURAL, BUY("2000-01-01")),
      [false, 187_440_000], [true, 300_685_000]],
    ["P2 ③4호 나목 · 도시 농지 · 2022 상속",
      form(T, FARM, URBAN, INH("2022-01-01")), form(T, FARM, URBAN, INH("2022-01-01"), NON_HEIR), form(T, FARM, URBAN, BUY("2022-01-01")),
      [false, 236_511_000], [true, 302_236_000]],
    ["P3 임야 상속 3년 · 2022-06 상속",
      form(T, FOREST, RURAL, INH("2022-06-01")), form(T, FOREST, RURAL, INH("2022-06-01"), NON_HEIR), form(T, FOREST, RURAL, BUY("2022-06-01")),
      [false, 236_511_000], [true, 302_236_000]],
    ["P3b 목장 상속 3년 · 2022-06 상속",
      form(T, PASTURE, RURAL, INH("2022-06-01")), form(T, PASTURE, RURAL, INH("2022-06-01"), NON_HEIR), form(T, PASTURE, RURAL, BUY("2022-06-01")),
      [false, 236_511_000], [true, 302_236_000]],
    ["P6 ③1의2호 · 비도시 농지 · 2020 상속 + 선언",
      form(T, FARM, RURAL, INH("2020-01-01"), ANCESTOR), form(T, FARM, RURAL, INH("2020-01-01"), ANCESTOR, NON_HEIR), form(T, FARM, RURAL, BUY("2020-01-01")),
      [false, 214_335_000], [true, 274_780_000]],
  ] as const)("%s", async (_name, heir, nonHeir, bought, [heirNbl, heirTotal], [nonHeirNbl, nonHeirTotal]) => {
    const h = await run(heir);
    const n = await run(nonHeir);
    const b = await run(bought);
    for (const r of [h, n, b]) {
      expect(r.status).toBe(200);
      expect(r.issues).toEqual([]);
    }
    expect([h.nbl, h.total]).toEqual([heirNbl, heirTotal]);
    expect([n.nbl, n.total]).toEqual([nonHeirNbl, nonHeirTotal]);
    expect([b.nbl, b.total]).toEqual([n.nbl, n.total]);
    // ⑫ strip 없이 raw에 실린다 · 상속인 시료에는 키가 없다
    expect(n.raw?.nonHeirBequest).toBe(true);
    expect(h.raw?.nonHeirBequest).toBeUndefined();
  });

  it("결과 안내 — 수유자면 상속 특례 미적용과 근거 해석을 밝히고, 임야·목장에만 확인 필요를 붙인다", async () => {
    const farm = await run(form(T, FARM, URBAN, INH("2022-01-01"), NON_HEIR));
    expect(farm.warnings).toContain("상속인이 아닌 사람이 유증·사인증여로 받은 토지라 상속 특례");
    expect(farm.warnings).toContain("기준-2019-법령해석재산-0324");
    expect(farm.warnings).not.toContain("확인이 필요합니다");
    const forest = await run(form(T, FOREST, RURAL, INH("2022-06-01"), NON_HEIR));
    expect(forest.warnings).toContain("소득세법 시행령 §168조의9 ③ 7호(상속 3년)은 직접 해석이 없어 같은 기준으로 판정했습니다 — 확인이 필요합니다.");
    const pasture = await run(form(T, PASTURE, RURAL, INH("2022-06-01"), NON_HEIR));
    expect(pasture.warnings).toContain("소득세법 시행령 §168조의10 ② 1호(상속 3년)");
    // 상속인 시료에는 안내가 없다
    expect((await run(form(T, FARM, URBAN, INH("2022-01-01")))).warnings).not.toContain("상속인이 아닌 사람");
  });

  it("취득원인을 매매로 바꾼 뒤 남은 토글 값은 실리지 않고 판정에도 닿지 않는다", async () => {
    const r = await run(form(T, FARM, URBAN, BUY("2022-01-01"), NON_HEIR));
    expect(r.raw?.nonHeirBequest).toBeUndefined();
    expect([r.nbl, r.total]).toEqual([true, 302_236_000]);
    expect(r.warnings).not.toContain("상속인이 아닌 사람");
  });
});
