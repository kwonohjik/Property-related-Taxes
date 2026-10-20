/**
 * 임야·목장 「상속 3년 이내」(「소득세법 시행령」 §168의9③7호·§168의10②1호)는 취득원인·취득일(상속개시일)로 정한다 (2026-10-19)
 * 계획서: docs/00-pm/nbl-forest-pasture-inherit-3y-cause.plan.md
 *
 * 종전(master `6b026125e` 실측): 비사업용 섹션의 별도 입력(임야 토글·상속일, 목장 상속일)만 읽었다 —
 *   매매·증여 자산에서 켜면 사업용 236,511,000(법령대로면 비사업용 302,236,000), 상속 자산에서 안 켜거나 날짜를
 *   틀리거나 비우면 비사업용 302,236,000(법령대로면 사업용 236,511,000). ⑧ 오류는 어느 경우에도 없었다.
 * 이제 그 입력은 읽지 않는다 — 아래 시료는 옛 저장값이 남아 있는 상태를 그대로 넣어 무시되는지 본다.
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

/** 농림지역 3,000㎡ · 취득가 4억 · 양도가 10억 · 양도일 2024-06-03 — 재촌 없음(상속 3년 사유가 없으면 비사업용) */
const RURAL = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "agriculture_forest",
} as Partial<AssetForm>;
const BUY = { acquisitionCause: "purchase", acquisitionDate: "2022-06-01" } as Partial<AssetForm>;
const GIFT = { acquisitionCause: "gift", acquisitionDate: "2022-06-01", publishedValueAtGift: "400000000" } as Partial<AssetForm>;
const INHERIT = (d: string) =>
  ({ acquisitionCause: "inheritance", acquisitionDate: d, decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" }) as Partial<AssetForm>;
const FOREST = { nblLandType: "forest" } as Partial<AssetForm>;
const PASTURE = { nblLandType: "pasture" } as Partial<AssetForm>;
/** 옛 저장값 — 이제 판정에 닿지 않아야 한다 */
const OLD_FOREST = (d: string) => ({ nblForestInheritedWithin3Years: true, nblForestInheritanceDate: d }) as Partial<AssetForm>;
const OLD_PASTURE = (d: string) => ({ nblPastureInheritanceDate: d }) as Partial<AssetForm>;

const BUSINESS = 236_511_000;
const NON_BUSINESS = 302_236_000;

function form(...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-03";
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, RURAL, ...parts) as AssetForm];
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
    data?: { result?: { totalTax?: number; nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean } } };
  };
  return {
    status: res.status,
    issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)),
    total: json.data?.result?.totalTax,
    nbl: json.data?.result?.nonBusinessLandJudgmentDetail?.isNonBusinessLand,
  };
}

describe("임야·목장 상속 3년 이내 — 취득원인·상속개시일로 판정 (§168의9③7호·§168의10②1호)", () => {
  it.each([
    ["C1 임야 · 매매 + 옛 토글·날짜", form(FOREST, BUY, OLD_FOREST("2022-06-01")), true, NON_BUSINESS],
    ["C2 임야 · 증여 + 옛 토글·날짜", form(FOREST, GIFT, OLD_FOREST("2022-06-01")), true, NON_BUSINESS],
    ["C3 목장 · 매매 + 옛 상속일", form(PASTURE, BUY, OLD_PASTURE("2022-06-01")), true, NON_BUSINESS],
    ["C4 임야 · 상속 2022 + 옛 날짜 2020(오입력)", form(FOREST, INHERIT("2022-01-01"), OLD_FOREST("2020-01-01")), false, BUSINESS],
    ["C5 목장 · 상속 2022 + 옛 상속일 2020", form(PASTURE, INHERIT("2022-01-01"), OLD_PASTURE("2020-01-01")), false, BUSINESS],
    ["C6 임야 · 상속 2022 · 옛 입력 없음", form(FOREST, INHERIT("2022-01-01")), false, BUSINESS],
    ["C7 목장 · 상속 2022 · 옛 입력 없음", form(PASTURE, INHERIT("2022-01-01")), false, BUSINESS],
    ["C8 임야 · 상속 2022 + 옛 토글만(날짜 빈칸)", form(FOREST, INHERIT("2022-01-01"), OLD_FOREST("")), false, BUSINESS],
    ["C9 임야 · 상속 2022 + 옛 토글·날짜 정상", form(FOREST, INHERIT("2022-01-01"), OLD_FOREST("2022-01-01")), false, BUSINESS],
    ["임야 · 매매 · 옛 입력 없음(부정 짝)", form(FOREST, BUY), true, NON_BUSINESS],
  ] as const)("%s", async (_name, f, nbl, total) => {
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
  });

  /**
   * 「상속개시일부터 3년이 경과하지 아니한」은 기간이다(계획서 `nbl-farmland-inherit-inong-3y.plan.md` Q-5 b) —
   * 상속 2021-06-03 → 양도 2024-06-03(3년이 되는 날)이어도 그 3년이 보유기간 전부라 사업용이다.
   * 종전에는 양도일만 보아 2021-06-03을 비사업용으로 판정했다. 기간기준에 미달하는 7.4년 보유는
   * `transfer.route.nbl-farmland-inherit-inong-3y.anchor.test.ts` H4·J4가 지킨다.
   */
  it.each([
    ["임야", FOREST],
    ["목장", PASTURE],
  ] as const)("%s 3년 경계: 상속 2021-06-04 · 2021-06-03 모두 사업용", async (_k, land) => {
    expect((await run(form(land, INHERIT("2021-06-04")))).nbl).toBe(false);
    expect((await run(form(land, INHERIT("2021-06-03")))).nbl).toBe(false);
  });
});
