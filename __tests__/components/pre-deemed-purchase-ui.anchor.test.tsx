/**
 * anchor — 의제취득일(1985.1.1.) 전 «매수» 영 §176조의2④ 화면 경로 (PR-2 · ①~⑧ · ⑫⑬⑭)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.2·§4.3·§6
 *
 * 취득일 칸 덮어쓰기(1984 → 1985-01-01) 때 원 입력이 실제 취득일로 남고, ⑤ 카드 · ⑧ · ④ · ⑫ · ⑭ · 엔진 · ⑥ · ⑦이 같은 술어를 읽는다.
 * 결정세액은 mock 세율. 1984.6. 실가 1억 → ② = 1억 × 50.29 ÷ 49.59 = 101,411,574.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NextRequest } from "next/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

import { CompanionAcqDateSection } from "@/components/calc/transfer/CompanionAcqDateSection";
import type { BlockProps } from "@/components/calc/transfer/CompanionAcqPurchaseBlock.types";
import { PreDeemedPurchaseCard } from "@/components/calc/transfer/PreDeemedPurchaseCard";
import { PreDeemedPurchaseResultCard } from "@/components/calc/results/transfer/PreDeemedPurchaseResultCard";
import { isPreDeemedPurchaseAsset } from "@/lib/calc/transfer-pre-deemed-purchase-form";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { MULTI_REJECT_RULES } from "@/lib/api/transfer-tax-schema-multi-refines";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "500000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
    ...extra,
  }) as TransferFormData;

async function postBody(body: Body): Promise<{ status: number; data: Body; error?: Body }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  return { status: res.status, data: json.data ?? {}, error: json.error };
}

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await postBody(body);
  return { issue, body, ...r, res: r.data?.result };
}
const issueText = (r: { issue: unknown }) => (r.issue ? String((r.issue as { message?: string }).message ?? r.issue) : "");
const asset = (o: A) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;

// 토지 · 매매 · 취득일 칸 = 의제취득일(덮어쓰기 결과) · 양도 5억
const LAND = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 9-1", assetKind: "land", landNature: "standalone", acquisitionArea: "200", transferArea: "200",
  acquisitionCause: "purchase", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", transferType: "regular",
  acquisitionDate: "1985-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "250000000", ...o,
});
// 환산: 1990.8.30. 전 토지라 취득시 기준시가는 §164④ 칸(1990.1.1. ㎡당 500,000 × 등급 비율 1 × 200㎡ = 1억) · 양도시 2.5억 → ① 2억
const EST: A = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", pre1990Enabled: true, pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "100000", pre1990PricePerSqm_1990: "500000" };

describe("취득일 칸 덮어쓰기 — 원 입력을 실제 취득일로 보존(Q-1 B)", () => {
  function Harness({ initial }: { initial: string }) {
    const [a, setA] = useState<AssetForm>(asset({ assetKind: "land", acquisitionCause: "purchase", acquisitionDate: initial }));
    const patch = (p: Partial<AssetForm>) => setA((x) => ({ ...x, ...p }));
    const block = { acquisitionDate: a.acquisitionDate, onAcquisitionDateChange: (v: string) => patch({ acquisitionDate: v }), asset: a, onAssetChange: patch, assetKind: a.assetKind } as unknown as BlockProps;
    return (
      <>
        <CompanionAcqDateSection block={block} isSplitable={false} isSplit={false} isMixedUse={false} acqDateLabel="취득일" saleStdInSaleAxis />
        <output data-testid="state">{`${a.acquisitionDate}|${a.preDeemedOriginalAcquisitionDate}`}</output>
      </>
    );
  }
  it("1984-06-01 → 취득일 1985-01-01 · 실제 취득일 1984-06-01", () => {
    render(<Harness initial="1984-06-01" />);
    fireEvent.blur(screen.getByTestId("acq-date-building"));
    expect(screen.getByTestId("state").textContent).toBe("1985-01-01|1984-06-01");
  });
  it("1990-03-01 → 덮어쓰지 않는다 · 실제 취득일 빈칸", () => {
    render(<Harness initial="1990-03-01" />);
    fireEvent.blur(screen.getByTestId("acq-date-building"));
    expect(screen.getByTestId("state").textContent).toBe("1990-03-01|");
  });
});

describe("게이트 isPreDeemedPurchaseAsset — 엔진 1차 범위와 같은 자산", () => {
  it.each([
    ["토지 매매 1985-01-01", LAND(), true],
    ["주택", LAND({ assetKind: "housing" }), true],
    ["건물", LAND({ assetKind: "building" }), true],
    ["상가", LAND({ assetKind: "commercial_building" }), true],
    ["주택 PHD(같은 날 두 칸)", LAND({ assetKind: "housing", hasSeperateLandAcquisitionDate: true, usePreHousingDisclosure: true }), true],
    ["취득일 1985-06-01", LAND({ acquisitionDate: "1985-06-01" }), false],
    ["상속", LAND({ acquisitionCause: "inheritance" }), false],
    ["부담부증여", LAND({ transferType: "burdened_gift" }), false],
    ["겸용주택", LAND({ assetKind: "housing", isMixedUseHouse: true }), false],
    ["토지·건물 취득일 분리", LAND({ assetKind: "housing", hasSeperateLandAcquisitionDate: true }), false],
    ["다필지", LAND({ parcelMode: true }), false],
    ["일반건물", LAND({ assetKind: "general_building" }), false],
    ["입주권", LAND({ assetKind: "right_to_move_in" }), false],
  ] as [string, A, boolean][])("%s → %s", (_n, o, v) => {
    expect(isPreDeemedPurchaseAsset(asset(o))).toBe(v);
  });
});

describe("⑤ 카드", () => {
  const card = (o: A) => render(<PreDeemedPurchaseCard asset={asset(LAND(o))} onAssetChange={() => {}} />);
  it("실가 모드 — 실제 취득일 칸 + 「취득가액 칸이 기준」 안내 · 견줄 실가 칸 없음", () => {
    card({ preDeemedOriginalAcquisitionDate: "1984-06-01" });
    expect(screen.getByTestId("pre-deemed-purchase-original-date")).toBeTruthy();
    expect(screen.getByTestId("pre-deemed-purchase-actual-note")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-purchase-actual-price")).toBeNull();
    expect(screen.queryByTestId("pre-deemed-purchase-ppi-ratio")).toBeNull();
  });
  it.each([["환산", EST], ["감정가액", { isAppraisalAcquisition: true }], ["매매사례가액", { isSalesCaseAcquisition: true }]])("%s 모드 — 함께 견줄 실가 칸", (_n, m) => {
    card({ ...m, preDeemedOriginalAcquisitionDate: "1984-06-01" });
    expect(screen.getByTestId("pre-deemed-purchase-actual-price")).toBeTruthy();
  });
  it("1965.01. 전 → 배율 칸 · 1984.9. → 배율 1 미만 안내", () => {
    card({ preDeemedOriginalAcquisitionDate: "1963-05-01" });
    expect(screen.getByTestId("pre-deemed-purchase-ppi-ratio")).toBeTruthy();
    cleanup();
    card({ preDeemedOriginalAcquisitionDate: "1984-09-01" });
    expect(screen.getByTestId("pre-deemed-purchase-ratio-below-one")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-purchase-ppi-ratio")).toBeNull();
  });
  it("범위 밖(1985-06-01 · 겸용)은 렌더하지 않는다", () => {
    card({ acquisitionDate: "1985-06-01" });
    expect(screen.queryByTestId("pre-deemed-purchase-card")).toBeNull();
    card({ assetKind: "housing", isMixedUseHouse: true });
    expect(screen.queryByTestId("pre-deemed-purchase-card")).toBeNull();
  });
});

describe("⑧ → ④ → ⑫ → ⑭ → 엔진 (단건)", () => {
  it("실가 1억 · 실제 취득 1984-06-01 → 요청에 실제 취득일만 · ② 101,411,574 · 양도차익 398,588,426", async () => {
    const r = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1984-06-01", preDeemedActualPrice: "999,000,000" })]));
    expect(issueText(r)).toBe("");
    expect(r.body.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    expect(r.status).toBe(200);
    expect(r.res.preDeemedPurchaseDetail).toMatchObject({ clause2Amount: 101_411_574, selected: "clause2" });
    expect(r.res.transferGain).toBe(398_588_426);
  });
  it("실제 취득일 빈칸 → ⑧ 차단 · 요청에 없음", async () => {
    const r = await check(mk([LAND()]));
    expect(issueText(r)).toContain("실제 취득일을 입력하세요");
    expect(r.body.preDeemedPurchase).toBeUndefined();
  });
  it("실제 취득일 1990 → ⑧ 차단(취득일 칸에 넣을 것)", async () => {
    const r = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1990-01-01" })]));
    expect(issueText(r)).toContain("1985.1.1. 이후입니다");
  });
  it("실제 취득일 = 1985-01-01(실제로 그날 매수) → 통과 · 요청에 없음", async () => {
    const r = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1985-01-01" })]));
    expect(issueText(r)).toBe("");
    expect(r.body.preDeemedPurchase).toBeUndefined();
    expect(r.res.transferGain).toBe(400_000_000);
  });
  it("1963 · 배율 빈칸 → ⑧ 차단 · 3.5 → ② 350,000,000", async () => {
    const blocked = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1963-05-01" })]));
    expect(issueText(blocked)).toContain("물가상승 배율을 직접 입력해야 합니다");
    const r = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1963-05-01", preDeemedPpiRatio: "3.5" })]));
    expect(issueText(r)).toBe("");
    expect(r.body.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1963-05-01", ppiRatio: 3.5 });
    expect(r.res.preDeemedPurchaseDetail?.clause2Amount).toBe(350_000_000);
  });
  it("환산 + 함께 견줄 실가 3억 → ② 304,234,724 채택 · 실가 1억이면 ① · 빈칸이면 요청에 실제 취득일만", async () => {
    const two = await check(mk([LAND({ ...EST, preDeemedOriginalAcquisitionDate: "1984-06-01", preDeemedActualPrice: "300,000,000" })]));
    expect(issueText(two)).toBe("");
    expect(two.body.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01", actualPrice: 300_000_000 });
    expect(two.res.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, selected: "clause2" });
    expect(two.res.transferGain).toBe(195_765_276);
    const one = await check(mk([LAND({ ...EST, preDeemedOriginalAcquisitionDate: "1984-06-01", preDeemedActualPrice: "100,000,000" })]));
    expect(issueText(one)).toBe("");
    expect(one.res.preDeemedPurchaseDetail?.selected).toBe("clause1");
    const none = await check(mk([LAND({ ...EST, preDeemedOriginalAcquisitionDate: "1984-06-01" })]));
    expect(issueText(none)).toBe("");
    expect(none.res.transferGain).toBe(297_000_000);
    expect(none.body.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    expect(none.res.preDeemedPurchaseDetail).toBeUndefined();
  });
  it("지분 1/2 · 환산 · 견줄 실가 6억(물건 전체) → 요청 3억(지분 금액)", async () => {
    const r = await check(mk([LAND({ ...EST, ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", preDeemedOriginalAcquisitionDate: "1984-06-01", preDeemedActualPrice: "600,000,000" })]));
    expect(issueText(r)).toBe("");
    expect(r.body.preDeemedPurchase?.actualPrice).toBe(300_000_000);
  });
  it("범위 밖(1985-06-01 취득)에 남은 값은 보내지 않는다", async () => {
    const r = await check(mk([LAND({ acquisitionDate: "1985-06-01", preDeemedOriginalAcquisitionDate: "1984-06-01" })]));
    expect(r.body.preDeemedPurchase).toBeUndefined();
  });
});

describe("⑫ 직접 호출", () => {
  const base = async () => (await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1984-06-01" })]))).body;
  it.each([
    ["실제 취득일 1985 이후", { originalAcquisitionDate: "1990-01-01" }, "originalAcquisitionDate"],
    ["1965.01. 전 · 배율 없음", { originalAcquisitionDate: "1963-05-01" }, "ppiRatio"],
  ])("%s → 400", async (_n, pd, field) => {
    const r = await postBody({ ...(await base()), preDeemedPurchase: pd });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain(field);
  });
});

describe("함께 양도(컴패니언) — 같은 leaf", () => {
  it("주 자산 토지 2015 + 컴패니언 토지 1984-06 실가 → 요청 companionAssets에 실제 취득일 · 자산별 결과에 비교 내역", async () => {
    const f = mk(
      [LAND({ acquisitionDate: "2015-06-01" }), LAND({ addressJibun: "서울 강남구 테스트동 9-2", preDeemedOriginalAcquisitionDate: "1984-06-01" })],
      { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1000000000" },
    );
    const r = await check(f);
    expect(issueText(r)).toBe("");
    expect(r.body.companionAssets?.[0]?.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    expect(r.status).toBe(200);
    const props = (r.data.result?.aggregated ?? r.data.aggregated)?.properties as Body[];
    expect(props?.some((p) => p.preDeemedPurchaseDetail?.clause2Amount === 101_411_574)).toBe(true);
  });
  it("컴패니언 실제 취득일 빈칸 → ⑧ 차단", async () => {
    const f = mk([LAND({ acquisitionDate: "2015-06-01" }), LAND({ addressJibun: "서울 강남구 테스트동 9-2" })], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1000000000" });
    const r = await check(f);
    expect(issueText(r)).toContain("실제 취득일을 입력하세요");
  });
});

describe("다건 계산기 차단(Q-11 b)", () => {
  it("⑧ — 의제취득일 매매 토지 → 단건 안내", () => {
    expect(validateMultiSupportedMode({ assets: [asset(LAND())] } as never)).toBe(MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE);
    expect(validateMultiSupportedMode({ assets: [asset(LAND({ acquisitionDate: "1990-01-01" }))] } as never)).toBeNull();
  });
  it("⑫ 다건 거부 규칙 — preDeemedPurchase 키가 오면 같은 문구", () => {
    expect(MULTI_REJECT_RULES.preDeemedPurchase({ originalAcquisitionDate: "1984-06-01" })).toBe(MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE);
    expect(MULTI_REJECT_RULES.preDeemedPurchase(undefined)).toBeNull();
  });
});

describe("⑥ 사이드바 · ⑦ 결과 카드", () => {
  it("계산 전 취득가액·필요경비 「계산 후 확정」 · ② 채택 결과 후 101,411,574", async () => {
    const f = mk([LAND({ preDeemedOriginalAcquisitionDate: "1984-06-01" })]);
    const before = computeTransferPerAssetSummary(f, null).rows[0];
    expect(before.acqPending).toBe(true);
    expect(before.expensePending).toBe(true);
    const r = await check(f);
    const after = computeTransferPerAssetSummary(f, { mode: "single", result: r.res } as never).rows[0];
    expect(after.acqPending).toBe(false);
    expect(after.acqPrice).toBe(101_411_574);
  });
  it("결과 카드 — ② 채택 행 · ① 미산정 문구", async () => {
    const r = await check(mk([LAND({ preDeemedOriginalAcquisitionDate: "1984-06-01" })]));
    render(<PreDeemedPurchaseResultCard detail={r.res.preDeemedPurchaseDetail} />);
    const t = screen.getByTestId("pre-deemed-purchase-result-card").textContent!;
    expect(t).toContain("101,411,574");
    expect(t).toContain("← 채택");
    expect(t).toContain("미산정");
    expect(t).toContain("1984.6.1.");
  });
});
