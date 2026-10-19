/**
 * 축 B(같은 땅을 지분으로 나눠 취득) 토지 — 비사업용 정밀판정을 지분마다 한다 (2026-10-19)
 * 계획서: docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md
 *
 * 종전(master `27612a286` 실측): 정밀판정 입력이 첫 지분에만 실려 둘째 지분은 첫 카드 표지 `true`만 받았다 —
 *   판정 «사업용»이어도 둘째 지분만 §104①8호 +10%p. N1 시료 181,852,000(단건 100% 181,566,000, +286,000).
 * 지분별 판정: 땅 사실은 첫 카드, 취득 사실(취득일·취득원인·지분율)은 지분 카드(Q-1 a). 취득원인·취득일이 첫 카드와
 *   다른 지분에는 취득 경위 의존 의제 선언 6종을 적용하지 않고 「확인 필요」로 고지한다(Q-2 a).
 *
 * 입력은 화면 폼 → ⑧ → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 다건 엔진. 수치는 mock 세율표 실측값이다.
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

/** 토지 300㎡ · 공익수용(사업인정고시일 2020-01-01) · 물건 전체 취득가 4억 — 2014-01-02 취득이면 §168의14③3호 나목 의제 성립 */
const LAND = {
  assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
} as Partial<AssetForm>;
/** 농지 상속(피상속인 1990 취득) + 「직계존속 8년 재촌·자경」 선언 — 공익수용 아님 */
const INHERITED_FARM = {
  ...LAND, transferCause: "general", expropriationNoticeDate: "", acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01",
  publishedValueAtInheritance: "400000000", nblLandType: "farmland", nblZoneType: "agricultural", nblExemptAncestor8YearFarming: true,
} as Partial<AssetForm>;
const share = (pct: string, o: Partial<AssetForm> = {}) => ({ ownershipNumerator: pct, ownershipDenominator: "100", ...o });
const LATE = { acquisitionDate: "2019-06-03" } as Partial<AssetForm>; // 고시일 전 7개월 — 나목 불성립

function form(shares: Array<Partial<AssetForm>>, first: Partial<AssetForm> = LAND): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-03";
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = shares.map((o, i) =>
    ({ ...makeDefaultAsset(i + 1), ...(i === 0 ? first : { acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000" }), ...o }) as AssetForm);
  if (shares.length > 1) f.assetSplitMode = "fractional";
  return f;
}

const v8 = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f));

type Prop = { nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean } };
async function run(f: TransferFormData) {
  const cap: { body?: { companionAssets?: Array<Record<string, unknown>> } } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  const json = (await res.json()) as { data?: { aggregated?: { totalTax?: number; properties?: Prop[]; warnings?: string[] }; result?: { totalTax?: number } } };
  const agg = json.data?.aggregated;
  return {
    status: res.status,
    shareRaw: (cap.body?.companionAssets ?? []).map((c) => c.nonBusinessLandRaw !== undefined),
    total: agg?.totalTax ?? json.data?.result?.totalTax,
    nbl: (agg?.properties ?? []).map((p) => p.nonBusinessLandJudgmentDetail?.isNonBusinessLand),
    shareWarnings: (agg?.warnings ?? []).filter((w) => w.includes("지분별로 나눠 취득")),
  };
}

const SINGLE_100 = 181_566_000;

describe("축 B 토지 — 비사업용 정밀판정은 지분마다", () => {
  it("N1 같은 날 취득 50/50: 둘째 지분도 «사업용» 판정 → 단건 100%와 같다(종전 181,852,000)", async () => {
    const single = await run(form([share("100")]));
    expect(single.total).toBe(SINGLE_100);
    const f = form([share("50"), share("50")]);
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.shareRaw).toEqual([true]);
    // 판정 상세가 둘 다 있어야 「양쪽 다 미판정」과 구분된다
    expect(r.nbl).toEqual([false, false]);
    expect(r.total).toBe(SINGLE_100);
    expect(r.shareWarnings).toEqual([]);
  });

  it("N2 둘째 지분만 고시일 7개월 전 취득 · 지목 미입력: ⑧이 첫 카드 지목을 요구한다", () => {
    const issues = v8(form([share("50"), share("50", LATE)]));
    expect(issues).toEqual([
      expect.objectContaining({
        assetIndex: 0,
        field: "nblLandType",
        message: "자산 1: 자산 2 지분은 취득일·취득원인이 달라 무조건 사업용 의제가 성립하지 않습니다 — 비사업용 토지 정밀판정에 지목을 선택하세요.",
      }),
    ]);
  });

  it("N2' 지목은 있고 용도지역만 비면 용도지역을 요구한다", () => {
    const issues = v8(form([share("50"), share("50", LATE)], { ...LAND, nblLandType: "other_land" } as Partial<AssetForm>));
    expect(issues.map((i) => [i.assetIndex, i.field])).toEqual([[0, "nblZoneType"]]);
  });

  it("N3 지목·용도지역 입력: 둘째 지분은 자기 취득일로 의제 불성립 → 일반 판정(첫 지분은 의제 성립)", async () => {
    const f = form([share("50"), share("50", LATE)], { ...LAND, nblLandType: "other_land", nblZoneType: "residential" } as Partial<AssetForm>);
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.shareRaw).toEqual([true]);
    expect(r.nbl).toEqual([false, true]);
    expect(r.total).toBe(197_692_000);
  });

  it("N4 Q-2: 둘째 지분 매매 취득 → 첫 카드 「직계존속 8년 자경」 선언을 적용하지 않고 고지한다", async () => {
    const f = form([share("50"), share("50", { acquisitionCause: "purchase", ...LATE })], INHERITED_FARM);
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.nbl).toEqual([false, true]);
    expect(r.total).toBe(197_692_000);
    expect(r.shareWarnings).toEqual([
      "[자산 2] 같은 토지를 지분별로 나눠 취득했고 이 지분의 취득원인·취득일이 첫 지분과 다릅니다 — 첫 지분 카드에서 선언한 " +
        "비사업용 토지 무조건 사업용 의제(직계존속 8년 이상 재촌·자경 토지의 상속·증여 — 소득세법 시행령 §168조의14 ③)는 " +
        "이 지분의 취득 경위에도 해당하는지 확인되지 않아 이 지분의 판정에는 적용하지 않았습니다 — 확인 필요.",
    ]);
  });

  it("N5 Q-2 부정 짝: 취득원인·취득일이 같으면 선언을 그대로 적용하고 고지하지 않는다", async () => {
    const f = form([share("50"), share("50", { acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" })], INHERITED_FARM);
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.nbl).toEqual([false, false]);
    expect(r.total).toBe(SINGLE_100);
    expect(r.shareWarnings).toEqual([]);
  });

  it("N6 정밀판정 OFF(표지만): 지분 입력을 싣지 않고 종전대로 전 지분 중과 — 단건과 같다(V10-f 경로)", async () => {
    const off = { ...LAND, nblUseDetailedJudgment: false } as Partial<AssetForm>;
    const single = await run(form([share("100")], off));
    const r = await run(form([share("50"), share("50")], off));
    expect(r.shareRaw).toEqual([false]);
    expect(r.total).toBe(single.total);
    expect(r.total).toBe(234_091_000);
  });

  it("N7 함께 양도(서로 다른 물건)는 첫 카드 정밀판정을 둘째 물건에 싣지 않는다", async () => {
    const other = { assetKind: "land", landNature: "standalone", addressJibun: "서울 강남구 테스트동 2", acquisitionArea: "300", transferArea: "300", standardPriceAtTransfer: "500000000" } as Partial<AssetForm>;
    const f = form([share("100", { landNature: "standalone" } as Partial<AssetForm>), share("100", other)]);
    f.assetSplitMode = "companion";
    expect(v8(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.shareRaw).toEqual([false]);
  });
});
