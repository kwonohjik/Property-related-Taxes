/**
 * anchor(화면 경로 ④⑫⑭ + 엔진) — 조특법 §77의2(대토보상) 「해당 공익사업의 시행자에게 양도」 요건을 엔진(서버)도 판정 (NBL2611-C11).
 *
 * 법 §77의2① — 「…공익사업의 시행으로 … 사업인정고시일 … 소급하여 2년 이전에 취득한 토지등을 … 해당 공익사업의 시행자에게 양도함으로써 발생하는 양도차익으로서 … 대토보상 … 받는 부분」.
 * 시행자 양도(수용·협의매수)는 `transferCause === "public_expropriation"`이다.
 *
 * 종전(C10): ⑧만 «양도원인 ≠ 공익수용»을 막았고 엔진 §77의2 판정에는 양도원인 입력이 없었다 →
 *   ⑧을 우회한 직접 API(양도원인 «일반» + 고시일 있음 + §77의2 행)는 감면 66,024,000이 성립했다.
 * 이제: 엔진이 양도원인을 본다. 감면 행의 `transferCause`(④가 자산-수준 값을 싣는다 — 고시일 `businessApprovalDate`와 같은 방식)가 우선이고,
 *   행에 없으면 입력 최상위 `transferCause`(직접 API) — 둘 다 없으면 «모름»이라 불성립 + 확인 필요.
 *   행에 싣는 이유: 일반건물 카드·겸용 파트 카드·컴패니언은 엔진에 최상위 `transferCause`가 닿지 않는다(④ 컴패니언은 토지·건물·주택·상가·일반건물만 싣는다) —
 *   최상위만 읽으면 정상 입력(수용 + 고시일)이 «모름»으로 떨어져 막다른 길이 된다. 행은 모든 경로를 지난다.
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-property-payload";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, T, asset as gbAsset, form as gbForm, run as gbRun, LAND as GB_LAND } from "../components/_helpers/gb-bundled-blocks-fixtures";
import {
  REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON,
  REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON,
} from "@/lib/tax-engine/replacement-land-reduction";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Over = Record<string, unknown>;

async function post(body: Loose) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  return { status: res.status, j, result: (j?.data?.result ?? undefined) as Loose | undefined, agg: (j?.data?.aggregated ?? undefined) as Loose | undefined };
}
const run = async (f: TransferFormData) => {
  const body = (await captureBody(f as never)) as Loose;
  return { body, ...(await post(body)) };
};
const rlRow = (land = "1000000000", cash = "0") => ({ type: "replacement_land_comp", rlCashComp: cash, rlLandComp: land });

// ── 토지 단건 (C10 시료 — 양도 2024-06-03 · 취득 2014-01-02 · 대토보상 10억) ────────────────────────────────────
const LAND = {
  assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", actualSalePrice: "1000000000",
};
const EXPR = { transferCause: "public_expropriation", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "residential", expropriationNoticeDate: "2020-01-01" };
const single = (over: Over) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), ...LAND, reductions: [rlRow()], ...over }],
  }) as unknown as TransferFormData;

describe("C11 — 단건: 정상 입력 불변 · 직접 API 양도원인 판정", () => {
  it("🔑 공익수용 + 고시일 + 요건 충족 → 감면 66,024,000 불변 · ④가 행에 양도원인을 싣는다", async () => {
    const r = await run(single(EXPR));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.body.reductions?.[0]?.transferCause).toBe("public_expropriation");
    expect(r.result?.replacementLandDetail?.isEligible).toBe(true);
    expect(r.result?.reductionAmount).toBe(66_024_000);
  });

  it("🔑 직접 API · 양도원인 «일반» + 고시일 있음(⑧ 우회) → 감면 0 + «시행자 양도 아님» 사유 (수정 전 66,024,000 성립 · 사유 없음)", async () => {
    const f = single(EXPR);
    const body = (await captureBody(f as never)) as Loose;
    // ⑧ 우회: 행·최상위 양도원인을 «일반»으로 바꾸고 고시일은 그대로 둔다
    body.reductions[0].transferCause = "general";
    body.transferCause = "general";
    expect(body.reductions[0].businessApprovalDate).toBe("2020-01-01");
    const r = await post(body);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const d = r.result?.replacementLandDetail;
    expect(d?.isEligible).toBe(false);
    expect(d?.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(d?.notEligibleReason).toContain("공익사업 시행자에게 양도(수용·협의매수)한 경우에만 적용");
    expect(d?.notEligibleReason).toContain("양도원인이 일반 양도");
    expect(r.result?.reductionAmount ?? 0).toBe(0);
  });

  it("🔑 직접 API · 최상위만 «일반»(행 양도원인 없음) → 같은 «시행자 양도 아님» 사유 — 직접 API가 쓰는 칸은 최상위다", async () => {
    const body = (await captureBody(single(EXPR) as never)) as Loose;
    delete body.reductions[0].transferCause;
    body.transferCause = "general";
    const r = await post(body);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.result?.replacementLandDetail?.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(r.result?.reductionAmount ?? 0).toBe(0);
  });

  it("🔑 직접 API · 양도원인 누락(행·최상위 모두) → 감면 0 + «확인 필요» 사유 — 「모름」은 혜택 불성립", async () => {
    const body = (await captureBody(single(EXPR) as never)) as Loose;
    delete body.reductions[0].transferCause;
    delete body.transferCause;
    const r = await post(body);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const d = r.result?.replacementLandDetail;
    expect(d?.isEligible).toBe(false);
    expect(d?.notEligibleReason).toBe(REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON);
    expect(d?.notEligibleReason).toContain("양도원인이 확인되지 않아");
    expect(d?.notEligibleReason).toContain("확인 필요");
    expect(r.result?.reductionAmount ?? 0).toBe(0);
  });

  it("직접 API · 행에 양도원인이 없고 최상위가 «공익수용» → 성립(66,024,000) — 최상위가 대체값이다", async () => {
    const body = (await captureBody(single(EXPR) as never)) as Loose;
    delete body.reductions[0].transferCause;
    const r = await post(body);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.result?.reductionAmount).toBe(66_024_000);
  });

  it("직접 API · 행 «일반» + 최상위 «공익수용» → 행이 이긴다(④가 싣는 감면을 단 자산의 값) — 불성립", async () => {
    const body = (await captureBody(single(EXPR) as never)) as Loose;
    body.reductions[0].transferCause = "general";
    const r = await post(body);
    expect(r.result?.replacementLandDetail?.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(r.result?.reductionAmount ?? 0).toBe(0);
  });

  it("⑫ — 행 양도원인은 enum(general · public_expropriation)만 받는다. 빠진 것은 400이 아니라 위처럼 엔진이 «확인 필요»로 둔다", async () => {
    const body = (await captureBody(single(EXPR) as never)) as Loose;
    body.reductions[0].transferCause = "bogus";
    expect((await post(body)).status).toBe(400);
  });
});

// ── 축 B 지분 · 컴패니언 ④ — 행에 양도원인이 실린다 ───────────────────────────────────────────────────────
const shareForm = (first: Over, second: Over) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
    assets: [
      { ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "50", ownershipDenominator: "100", reductions: [rlRow("500000000")], ...first },
      { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2015-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100", reductions: [rlRow("500000000")], ...second },
    ],
  }) as unknown as TransferFormData;

describe("C11 — 축 B 지분: 양도원인은 mergePrimaryBasic 승계(지분 카드 자신의 «일반» 기본값을 읽지 않는다)", () => {
  it("🔑 첫 카드 공익수용 → 지분 카드 §77의2 행도 «공익수용»을 싣고 둘 다 성립(수정 전과 같다) — 지분 카드 자신의 기본값 «일반»이 새지 않는다", async () => {
    const r = await run(shareForm({ ...EXPR, reductions: [rlRow("500000000")] }, {}));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.body.reductions?.[0]?.transferCause).toBe("public_expropriation");
    expect(r.body.companionAssets?.[0]?.reductions?.[0]?.transferCause).toBe("public_expropriation");
    expect(r.agg?.properties?.every((p: Loose) => p.replacementLandDetail?.isEligible === true)).toBe(true);
  });

  it("첫 카드 «일반» → 두 지분 모두 «시행자 양도 아님»(⑧ 우회) — 감면 0", async () => {
    const r = await run(shareForm({ reductions: [rlRow("500000000")] }, {}));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.body.companionAssets?.[0]?.reductions?.[0]?.transferCause).toBe("general");
    expect(r.agg?.properties?.map((p: Loose) => p.replacementLandDetail?.notEligibleReason)).toEqual([REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON, REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON]);
    expect(r.agg?.reductionAmount ?? 0).toBe(0);
  });
});

describe("C11 — ④ 컴패니언: 최상위 양도원인을 안 싣는 자산종류도 행으로 같은 사실이 간다", () => {
  const companion = (kind: Over) =>
    ({
      ...shareForm({ ...EXPR, reductions: [] }, { ...EXPR, ...kind }), assetSplitMode: "companion",
    }) as unknown as TransferFormData;

  it("🔑 재개발 입주권 컴패니언: 컴패니언 최상위 transferCause는 없다(엔진이 undefined를 본다) — 행에는 «공익수용»이 실린다", async () => {
    const body = (await captureBody(companion({ assetKind: "redevelopment_apt" }) as never)) as Loose;
    expect(body.companionAssets?.[0]?.assetKind).toBe("redevelopment_apt");
    expect(body.companionAssets?.[0]?.transferCause).toBeUndefined(); // 최상위만 읽으면 이 경로는 «모름» — 막다른 길
    expect(body.companionAssets?.[0]?.reductions?.[0]?.transferCause).toBe("public_expropriation");
  });

  it("🔑 일반건물: 단건 · 지분 · 함께 양도(둘째 자산) 전 경로에서 정상 입력(수용 + 고시일)이 «모름»으로 떨어지지 않는다 — 감면 성립", async () => {
    const INH = GB_SAMPLES.INH[0][0];
    const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const EXPR_GB = { transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01" } as Partial<ReturnType<typeof makeDefaultAsset>>;
    const rl = { reductions: [rlRow()] } as unknown as Partial<ReturnType<typeof makeDefaultAsset>>;
    const reduced = (r: Awaited<ReturnType<typeof gbRun>>) => r.aggregated.reductionAmount;
    // §77의2 판정을 받은 카드(토지·건물 파트)가 전부 성립 — 둘째 지분·컴패니언 카드가 «모름»으로 새지 않았음을 카드 단위로 본다
    const verdicts = (r: Awaited<ReturnType<typeof gbRun>>) => (r.aggregated.properties as unknown as Loose[]).map((p) => p.replacementLandDetail?.isEligible).filter((v) => v !== undefined);
    // 단건
    const s = await gbRun(gbForm(T, [gbAsset(1, INH, EXPR_GB, rl)]));
    expect(s.status).toBe(200);
    expect(reduced(s)).toBeGreaterThan(0);
    // 축 B 지분 (GB 지분 배열 경로 — 둘째 지분 감면은 `generalBuildingShares[].reductions`)
    const sh = await gbRun(gbForm(T, [gbAsset(1, INH, HALF, EXPR_GB, rl), gbAsset(2, INH, HALF, rl)]));
    expect(sh.status).toBe(200);
    expect(reduced(sh)).toBeGreaterThan(0);
    expect(verdicts(sh)).toEqual([true, true, true, true]); // 첫 지분 2카드 + 둘째 지분 2카드
    // 함께 양도 — 일반건물이 둘째 자산(컴패니언 GB 카드)
    const c = await gbRun(gbForm(T + 300_000_000, [gbAsset(1, GB_LAND, EXPR_GB), gbAsset(2, INH, EXPR_GB, rl)], { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>));
    expect(c.status).toBe(200);
    expect(reduced(c)).toBeGreaterThan(0);
    expect(verdicts(c).length).toBeGreaterThan(0);
    expect(verdicts(c).every((v) => v === true)).toBe(true);
    // 대조 — 같은 시료가 «일반»이면 세 경로 모두 0
    for (const g of [
      await gbRun(gbForm(T, [gbAsset(1, INH, rl)])),
      await gbRun(gbForm(T, [gbAsset(1, INH, HALF, rl), gbAsset(2, INH, HALF, rl)])),
    ]) {
      expect(g.status).toBe(200);
      expect(reduced(g) ?? 0).toBe(0);
      expect(verdicts(g).length).toBeGreaterThan(0);
      expect(verdicts(g).every((v) => v === false)).toBe(true);
    }
  });
});

describe("C11 — 다건 합산: 건별 payload ④ → ⑫ → ⑭", () => {
  const multi = async (first: Over) => {
    const f = (o: Over) => single(o) as unknown as TransferFormData;
    const body = {
      taxYear: 2024, annualBasicDeductionUsed: 0,
      properties: [
        { propertyId: "p1", propertyLabel: "A", ...buildPropertyPayload(f(first)) },
        { propertyId: "p2", propertyLabel: "B", ...buildPropertyPayload(f({ ...EXPR, reductions: [] })) },
      ],
    };
    expect((body.properties[0] as Loose).reductions[0].transferCause).toBe(first.transferCause ?? "general");
    const res = await MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    return { status: res.status, j: (await res.json()) as Loose };
  };

  it("🔑 공익수용 건 → 감면 성립(합산에서도 66,024,000대) · «일반» 건 → 0", async () => {
    const ok = await multi(EXPR);
    expect(ok.status, JSON.stringify(ok.j).slice(0, 300)).toBe(200);
    expect(ok.j.data?.aggregated?.reductionAmount ?? ok.j.data?.reductionAmount).toBeGreaterThan(0);
    const no = await multi({});
    expect(no.status).toBe(200);
    expect(no.j.data?.aggregated?.reductionAmount ?? no.j.data?.reductionAmount ?? 0).toBe(0);
  });
});
