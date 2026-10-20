/**
 * §69 자경농지 — 상속인이 아닌 수유자는 피상속인 경작기간을 합산하지 않는다 · ⑤ ④ ⑧ (계획서 `docs/00-pm/sp69-77-non-heir-bequest.plan.md`)
 *
 * 세 층이 술어 `selfFarmingDecedentAggregable`(상속 ∧ ¬수유자) 하나를 쓴다:
 *  ⑤ Step5 — 수유자면 피상속인 칸을 숨기고 안내(Q-2 (a))
 *  ④ `toEngineReductions` — 숨긴 칸의 값을 싣지 않는다
 *  ⑧ `validateStep2Reductions` — 숨긴 칸의 「§66⑪·⑫ 요건 확인」으로 막지 않는다
 * 엔진 쪽은 `__tests__/tax-engine/transfer/sp69-77-non-heir-bequest.anchor.test.ts`.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { getStandaloneDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { selfFarmingDecedentAggregable } from "@/lib/calc/self-farming-own-years";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 본인 2년 + 피상속인 10년 · §66⑪ 「1년 이상 계속 경작」 미선언 — 상속인이면 ⑧이 막는 입력 */
const selfFarming = (o: Partial<AssetReductionForm> = {}): AssetReductionForm =>
  ({ ...getStandaloneDefault("self_farming"), farmingYears: "2", decedentFarmingYears: "10", ...o }) as AssetReductionForm;

const asset = (nonHeirBequest: boolean, r: AssetReductionForm = selfFarming()): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2019-01-01",
    decedentAcquisitionDate: "2000-01-01",
    nonHeirBequest: nonHeirBequest || undefined,
    reductions: [r],
  }) as AssetForm;

const form = (a: AssetForm) => ({ assets: [a], transferDate: "2026-05-01" }) as unknown as TransferFormData;

async function renderStep5(a: AssetForm) {
  const { Step5 } = await import("@/app/calc/transfer-tax/steps/Step5");
  render(<Step5 form={form(a) as never} onChange={vi.fn()} />);
}

describe("술어 — 상속 ∧ 수유자 아님", () => {
  it("상속인 true · 수유자 false · 매매 false", () => {
    expect(selfFarmingDecedentAggregable({ acquisitionCause: "inheritance" })).toBe(true);
    expect(selfFarmingDecedentAggregable({ acquisitionCause: "inheritance", nonHeirBequest: true })).toBe(false);
    expect(selfFarmingDecedentAggregable({ acquisitionCause: "purchase" })).toBe(false);
  });
});

describe("⑤ Step5 — 수유자면 피상속인 자경기간 칸 대신 안내", () => {
  it("상속인 — 피상속인 자경기간 칸이 보이고 안내는 없다", async () => {
    await renderStep5(asset(false));
    expect(screen.getByText("피상속인 자경기간:")).toBeTruthy();
    expect(screen.queryByTestId("self-farming-non-heir-notice")).toBeNull();
  }, 30_000); // 첫 렌더가 Step5 모듈 import 비용을 진다 — 부하 중 5초 기본값을 넘는다(실측 5,366ms)

  it("수유자 — 칸이 없고 「합산하지 않습니다」 안내(조심2021구1132)", async () => {
    await renderStep5(asset(true));
    expect(screen.queryByText("피상속인 자경기간:")).toBeNull();
    const notice = screen.getByTestId("self-farming-non-heir-notice");
    expect(notice.textContent).toContain("피상속인 자경기간을 합산하지 않습니다");
    expect(notice.textContent).toContain("조심2021구1132");
  }, 30_000);
});

describe("④ toEngineReductions — 수유자면 피상속인 경작기간을 싣지 않는다", () => {
  const sf = (a: AssetForm) => toEngineReductions(a.reductions ?? [], a)[0] as Record<string, unknown>;

  it("상속인 — 피상속인 10년 전송", () => {
    expect(sf(asset(false, selfFarming({ heirContinuedFarming1Year: true }))).decedentFarmingYears).toBe(10);
  });

  it("수유자 — 전송하지 않는다(§66⑪·⑫ 요건 플래그도 없음)", () => {
    const r = sf(asset(true, selfFarming({ heirContinuedFarming1Year: true })));
    expect(r.decedentFarmingYears).toBeUndefined();
    expect(r.heirContinuedFarming1Year).toBeUndefined();
    expect(r.farmingYears).toBe(2);
  });

  it("종전 시그니처(취득원인 문자열)는 상속인으로 본다", () => {
    const r = toEngineReductions([selfFarming({ heirContinuedFarming1Year: true })], "inheritance")[0] as Record<string, unknown>;
    expect(r.decedentFarmingYears).toBe(10);
  });
});

describe("⑧ validateStep2Reductions — 숨긴 칸으로 막지 않는다", () => {
  it("상속인 — §66⑪·⑫ 요건 미선언이면 차단(종전과 같음)", () => {
    expect(validateStep2Reductions(2, form(asset(false)))?.message).toContain("조특령 §66⑪");
  });

  it("수유자 — 같은 입력이어도 그 이유로는 막지 않는다", () => {
    const issue = validateStep2Reductions(2, form(asset(true)));
    expect(issue?.message ?? "").not.toContain("조특령 §66⑪");
  });
});

describe("④ 화면 경로 호출부 — 실제 전송 body (단건 · 동반)", () => {
  async function body(f: TransferFormData): Promise<Record<string, unknown>> {
    let captured: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }));
    try { await callTransferTaxAPI(f).catch(() => undefined); } finally { vi.unstubAllGlobals(); }
    return captured;
  }
  const landBase = {
    addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", fixedAcquisitionPrice: "100000000",
    standardPriceAtTransfer: "150000000", actualSalePrice: "300000000",
  };
  const decedentYears = (rs: unknown) =>
    ((rs as Record<string, unknown>[] | undefined) ?? []).find((r) => r.type === "self_farming")?.decedentFarmingYears;

  it("단건 — 상속인 10 · 수유자 미전송", async () => {
    for (const [nonHeir, want] of [[false, 10], [true, undefined]] as const) {
      const f = createDefaultTransferFormData();
      Object.assign(f, { transferDate: "2026-05-01", filingDate: "2026-07-31", contractTotalPrice: "300000000" });
      f.assets = [{ ...asset(nonHeir, selfFarming({ heirContinuedFarming1Year: true })), ...landBase } as AssetForm];
      expect(decedentYears((await body(f)).reductions)).toBe(want);
    }
  });

  it("동반 — 둘째 자산이 수유자면 그 자산 감면에 미전송", async () => {
    for (const [nonHeir, want] of [[false, 10], [true, undefined]] as const) {
      const f = createDefaultTransferFormData();
      Object.assign(f, { transferDate: "2026-05-01", filingDate: "2026-07-31", contractTotalPrice: "600000000",
        assetSplitMode: "companion", bundledSaleMode: "actual" });
      f.assets = [
        { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", ...landBase } as AssetForm,
        { ...asset(nonHeir, selfFarming({ heirContinuedFarming1Year: true })), ...landBase, assetId: "a2" } as AssetForm,
      ];
      const companions = (await body(f)).companionAssets as Record<string, unknown>[];
      expect(decedentYears(companions[0].reductions)).toBe(want);
    }
  });
});

