/**
 * anchor(화면 경로 ④⑧⑫⑭ + 엔진) — 조특법 §77의2(대토보상) 「사업인정고시일 소급 2년 이전 취득」 요건이 고시일 미입력 시 검증 없이 통과하던 결함 (NBL2611-C10).
 *
 * 법 §77의2① — 「사업인정고시일(사업인정고시일 전에 양도하는 경우에는 양도일)부터 소급하여 2년 이전에 취득한 토지등을 … 해당 공익사업의 시행자에게 양도」.
 * 시행자 양도(수용·협의매수)가 전제이고 고시일은 취득시기 요건 판정의 필수 사실이다.
 *
 * 종전: 엔진이 고시일 미입력이면 요건 검증을 건너뛰고(`acquisitionDate !== undefined && businessApprovalDate !== undefined`일 때만 검증), ⑧은 고시일도 양도원인도 보지 않았다 →
 *   양도원인 «일반»(시행자 양도 아님) + 고시일 없음 + §77의2 행 = 감면 100,000,000(연간 한도까지) · 고지 없음.
 * 이제: ⑧이 막고(양도원인 · 고시일 · 축 B 지분은 첫 카드 칸으로), ⑧을 우회한 직접 API는 엔진이 불성립 + 「확인 필요」로 둔다.
 *
 * 수치는 mock 세율표 실측값이지 정본 세액이 아니다. 수정 전 수치는 같은 시료를 수정 없이 돌린 실측(2026-11-21)이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (io) => {
  const actual = await io<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { REPLACEMENT_LAND_NOTICE_UNKNOWN_REASON } from "@/lib/tax-engine/replacement-land-reduction";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Over = Record<string, unknown>;

async function run(f: TransferFormData) {
  const body = (await captureBody(f as never)) as Loose;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  const agg = j?.data?.aggregated ?? {};
  return { status: res.status, body, j, total: (agg.totalTax ?? j?.data?.result?.totalTax) as number, props: (agg.properties ?? []) as Loose[], result: (j?.data?.result ?? undefined) as Loose | undefined };
}
const step2 = (f: TransferFormData) => collectStepIssues(2, f as never);
const rlRow = (land = "1000000000", cash = "0") => ({ type: "replacement_land_comp", rlCashComp: cash, rlLandComp: land });

// ── 토지 단건 (양도 2024-06-03 · 취득 2014-01-02 · 대토보상 10억) ───────────────────────────────────────────────
const LAND = {
  assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", actualSalePrice: "1000000000",
};
const EXPR = { transferCause: "public_expropriation", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "residential" };
const single = (over: Over) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), ...LAND, reductions: [rlRow()], ...over }],
  }) as unknown as TransferFormData;

describe("C10 — ⑧ 화면 검증 (단건)", () => {
  it("🔑 양도원인 «일반» + §77의2 → 차단 · 양도 형태·원인 칸(transferType)으로 점프 (수정 전 ⑧ 0건 = 통과)", () => {
    const issues = step2(single({}));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 0, field: "transferType" });
    expect(issues[0].message).toMatch(/^대토보상\(§77의2\)은 공익사업 시행자에게 양도\(수용·협의매수\)한 경우에만 적용됩니다/);
    expect(issues[0].message).toContain("「공익수용·협의매수」를 선택하세요");
  });

  it("🔑 공익수용 + 고시일 공란 → 차단 · 사업인정고시일 칸(expropriationNoticeDate)으로 점프", () => {
    const issues = step2(single({ ...EXPR, expropriationNoticeDate: "" }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 0, field: "expropriationNoticeDate" });
    expect(issues[0].message).toMatch(/^대토보상\(§77의2\): 사업인정고시일을 입력하세요/);
  });

  it("공익수용 + 고시일 입력 → ⑧ 0건", () => {
    expect(step2(single({ ...EXPR, expropriationNoticeDate: "2020-01-01" }))).toEqual([]);
  });

  it("§77의2 행이 없으면 양도원인 «일반»도 막지 않는다(불변)", () => {
    expect(step2(single({ reductions: [] }))).toEqual([]);
  });

  it("고시일은 양도일보다 늦어도 막지 않는다 — 법 문언이 「고시 전 양도 시 양도일」 기준을 두므로 §77과 달리 선후를 요구하지 않는다", () => {
    expect(step2(single({ ...EXPR, expropriationNoticeDate: "2024-12-01" }))).toEqual([]);
  });
});

describe("C10 — 엔진 (⑧ 우회 직접 API · ④ → ⑭)", () => {
  it("🔑 양도원인 «일반» + 고시일 없음(⑧ 우회): 감면 0 + 「확인 필요」 사유 — 수정 전 감면 66,024,000(결정세액 122,144,400) · 고지 없음", async () => {
    const r = await run(single({}));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.body.reductions?.[0]?.businessApprovalDate).toBeUndefined();
    const d = r.result?.replacementLandDetail;
    expect(d?.isEligible).toBe(false);
    expect(d?.notEligibleReason).toBe(REPLACEMENT_LAND_NOTICE_UNKNOWN_REASON);
    expect(d?.notEligibleReason).toContain("확인 필요");
    expect(r.result?.reductionAmount ?? 0).toBe(0);
    expect(r.total).toBeGreaterThan(122_144_400); // 감면이 빠진 만큼 세액이 늘어난다
  });

  it("🔑 공익수용 + 고시일 2020-01-01 · 취득 2014-01-02(고시일 소급 2년 이전) → 감면 성립 — 기존 값 불변", async () => {
    const f = single({ ...EXPR, expropriationNoticeDate: "2020-01-01" });
    expect(step2(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.result?.replacementLandDetail?.isEligible).toBe(true);
    expect(r.result?.reductionAmount).toBe(66_024_000);
  });

  it("🔑 요건 밖 — 취득 2019-06-03(고시일 2020-01-01 소급 2년 이내) → 감면 0 · 취득시기 미충족 사유(고시일 미입력 사유가 아니다)", async () => {
    const r = await run(single({ ...EXPR, expropriationNoticeDate: "2020-01-01", acquisitionDate: "2019-06-03" }));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const d = r.result?.replacementLandDetail;
    expect(d?.isEligible).toBe(false);
    expect(d?.notEligibleReason).toContain("취득시기 요건 미충족");
    expect(r.result?.reductionAmount ?? 0).toBe(0);
  });
});

// ── 축 B(지분 분할) · 컴패니언 ─────────────────────────────────────────────────────────────────────────────
const shareForm = (first: Over, second: Over) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
    assets: [
      { ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "50", ownershipDenominator: "100", reductions: [rlRow("500000000")], ...first },
      { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2015-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100", reductions: [rlRow("500000000")], ...second },
    ],
  }) as unknown as TransferFormData;

describe("C10 — 축 B 지분 카드: 칸이 있는 첫 카드로 안내 · C9 fallback", () => {
  it("🔑 첫 카드가 «일반» → 지분 카드(1) §77의2도 첫 카드 ② 「양도 형태·원인」으로 안내 — assetIndex 0 · transferType (지분 카드엔 ②가 숨는다)", () => {
    const issues = step2(shareForm({ reductions: [] }, {})); // 첫 카드엔 행이 없다 — 지분 카드(1)만 §77의2
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 0, field: "transferType" });
    expect(issues[0].message).toContain("첫 번째 자산의 ② 양도정보");
  });

  it("🔑 첫 카드 공익수용 · 고시일 공란 → 지분 카드 §77의2는 첫 카드 고시일 칸으로 안내 — assetIndex 0 · expropriationNoticeDate", () => {
    const issues = step2(shareForm({ ...EXPR, expropriationNoticeDate: "" }, { expropriationNoticeDate: "2020-01-01" }));
    // 첫 카드가 먼저 막힌다(자기 카드 안내) — 지분 카드가 숨은 고시일(2020-01-01)을 갖고 있어도 읽지 않는다(C9)
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 0, field: "expropriationNoticeDate" });
  });

  it("🔑 첫 카드 고시일 2020-01-01 · 첫 카드 §77의2 행 없음 → 지분 카드 §77의2가 첫 카드 고시일로 통과(C9 fallback) · ④가 같은 값을 싣는다", async () => {
    const f = shareForm({ ...EXPR, expropriationNoticeDate: "2020-01-01", reductions: [] }, {});
    expect(step2(f)).toEqual([]);
    const body = (await captureBody(f as never)) as Loose;
    expect(body.companionAssets?.[0]?.reductions?.[0]?.businessApprovalDate).toBe("2020-01-01");
  });

  it("🔑 첫 카드가 공익수용·고시일 없음 + 지분 카드만 §77의2 → 첫 카드로 안내(assetIndex 0 · expropriationNoticeDate)", () => {
    const issues = step2(shareForm({ ...EXPR, expropriationNoticeDate: "", reductions: [] }, {}));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 0, field: "expropriationNoticeDate" });
  });
});

describe("C10 — 컴패니언(함께 양도)은 자기 ②를 가진다 — 자기 고시일", () => {
  const companion = (second: Over) => ({ ...shareForm({ reductions: [] }, second), assetSplitMode: "companion" }) as unknown as TransferFormData;

  it("컴패니언 «일반» → 자기 카드(assetIndex 1)의 양도 형태·원인으로", () => {
    const issues = step2(companion({}));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 1, field: "transferType" });
    expect(issues[0].message).toContain("② 양도정보");
    expect(issues[0].message).not.toContain("첫 번째 자산");
  });

  it("컴패니언 공익수용 · 자기 고시일 공란 → 자기 카드(assetIndex 1)의 고시일 칸으로 (첫 카드 값으로 채우지 않는다)", () => {
    const f = { ...companion({ ...EXPR, expropriationNoticeDate: "" }) } as TransferFormData;
    (f.assets[0] as any).expropriationNoticeDate = "2020-01-01";
    const issues = step2(f);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ assetIndex: 1, field: "expropriationNoticeDate" });
  });

  it("컴패니언 공익수용 · 자기 고시일 입력 → 통과 · ④가 자기 고시일을 싣는다", async () => {
    const f = companion({ ...EXPR, expropriationNoticeDate: "2020-01-01" });
    expect(step2(f)).toEqual([]);
    const body = (await captureBody(f as never)) as Loose;
    expect(body.companionAssets?.[0]?.reductions?.[0]?.businessApprovalDate).toBe("2020-01-01");
  });
});
