/**
 * anchor — ⑥ 사이드바가 ④·⑦과 **같은 숫자**를 보여준다 (C1-04 · C1-05 · U2-04)
 *
 * 세 결함은 모두 **표시 전용**이다(세액은 옳다). 공통 구조는 「⑥이 폼 원본을 자기 규칙으로 읽고,
 * ④가 실제로 보낸 값·⑦이 실제로 표시하는 값과 갈린다」 — dual-truth
 * (memory `feedback_ui_engine_dual_truth_avoidance` · `feedback_shared_predicate_argument_parity`).
 *
 * 2026-08-26 실측(수정 전):
 *
 * | | ⑥ 사이드바 | ④ / ⑦ 정본 |
 * |---|---|---|
 * | `U2-04` 승계 입주권 + 환산 | 취득가액 **500,000,000**(실가 2칸 합) | ④ `acquisitionPrice: 0` + `useEstimatedAcquisition: true` |
 * | `C1-05` 청산금 수령분 단독신고 | 양도가액 **1,200,000,000**(계약 총액) | ④ `transferPrice: 300,000,000`(수령 청산금) |
 * | `C1-04` §166 환산 | 계산 前 «계산 후 표시» → 계산 後 **«-»** | 엔진 `preApproval.apportionedAcquisition` 등 값이 존재 |
 *
 * ## C1-04 — 「계산 후 표시」 약속이 지켜지지 않았다
 *
 * §166 경로의 `directAcqRaw`는 실가 필드만 읽으므로 환산 모드에서 항상 0이고, 계산 후 fallback은
 * `singleResult.estimatedBase`를 보는데 §166 결과는 `usedEstimatedAcquisition: true`만 싣고
 * `estimatedBase`를 싣지 않는다(실측). 렌더러는 「0이고 pending도 아니면 «-»」라 값이 끝내 안 나온다.
 *
 * ⇒ 신고서·계산명세서가 쓰는 **같은 leaf**(`redevBranchTotals` + `inverseRedevAcquisition`)를
 *   사이드바도 쓰게 한다. 파트 합이 아니라 **역산**인 이유는 §166이 단계별 의제라
 *   파트 합 ≠ 양도가액이 설계상 정상이기 때문이다(그 leaf의 헤더 주석 참조).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import {
  redevBranchTotals,
  inverseRedevAcquisition,
} from "@/components/calc/results/transfer/redev-acquisition-inverse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** ④가 실제로 fetch에 실은 body — 재구성하지 않는다. */
async function buildBody(): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(useCalcWizardStore.getState().formData);
  vi.unstubAllGlobals();
  return captured.body!;
}

function setAsset(over: Partial<AssetForm>, formOver: Record<string, unknown> = {}) {
  useCalcWizardStore.setState((st) => ({
    formData: {
      ...st.formData,
      transferDate: "2026-02-16",
      ...formOver,
      assets: [{ ...makeDefaultAsset(1), ...over }],
    },
  }));
}

const summary = () => {
  const { formData, result } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, result);
};

beforeEach(() => useCalcWizardStore.getState().reset());

// ─────────────────────────────────────────────────────────────────────────────
// U2-04 — 승계조합원 입주권의 산정 방식 축
// ─────────────────────────────────────────────────────────────────────────────

const SUCCESSOR_BASE: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: true,
  acquisitionDate: "2020-05-01",
  actualSalePrice: "800000000",
  successorRightAcqPrice: "400000000",
  successorRightAddedContribution: "100000000",
};

describe("U2-04 · 승계 입주권 — 산정 방식이 바뀌면 사이드바도 따라간다", () => {
  it("U2-04-01: 실지거래가액 모드 — 실가 2칸 합이 ④와 일치한다 (대조군)", async () => {
    setAsset(SUCCESSOR_BASE, { contractTotalPrice: "800000000" });
    const s = summary();
    expect(s.rows[0].acqPrice).toBe(500_000_000);
    expect((await buildBody()).acquisitionPrice).toBe(500_000_000);
  });

  it("U2-04-02: 🔑 환산 모드 — 실가 2칸을 표시하지 않는다 (④는 0을 보낸다)", async () => {
    setAsset(
      {
        ...SUCCESSOR_BASE,
        useEstimatedAcquisition: true,
        standardPriceAtAcq: "100000000",
        standardPriceAtTransfer: "400000000",
      },
      { contractTotalPrice: "800000000" },
    );
    const s = summary();
    // 수정 전: 500,000,000이 확정값으로 표시됐다(엔진 환산취득가는 200,000,000).
    expect(s.rows[0].acqPrice).toBe(0);
    expect(s.rows[0].acqPending).toBe(true); // «계산 후 표시»
    const body = await buildBody();
    expect(body.acquisitionPrice).toBe(0);
    expect(body.useEstimatedAcquisition).toBe(true);
  });

  it("U2-04-03: 🔑 매매사례가액 모드 — ④가 보내는 값을 그대로 표시한다", async () => {
    setAsset(
      { ...SUCCESSOR_BASE, isSalesCaseAcquisition: true, similarSalesValue: "300000000" },
      { contractTotalPrice: "800000000" },
    );
    expect(summary().rows[0].acqPrice).toBe(300_000_000);
    expect((await buildBody()).similarSalesValue).toBe(300_000_000);
  });

  it("U2-04-04: 🔑 감정가액 모드 — ④ `appraisalValue`와 같은 필드를 읽는다", async () => {
    setAsset(
      { ...SUCCESSOR_BASE, isAppraisalAcquisition: true, fixedAcquisitionPrice: "350000000" },
      { contractTotalPrice: "800000000" },
    );
    expect(summary().rows[0].acqPrice).toBe(350_000_000);
    expect((await buildBody()).appraisalValue).toBe(350_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C1-05 — 청산금 수령분 단독 신고
// ─────────────────────────────────────────────────────────────────────────────

const RECEIVE_ONLY: Partial<AssetForm> = {
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  acquisitionDate: "2005-03-10",
  actualSalePrice: "1200000000",
  redevApprovalDate: "2018-10-23",
  redevRightsValue: "800000000",
  redevSettlementDirection: "receive",
  redevSettlementAmount: "300000000",
  redevReceiveOnlyMode: "yes",
  redevSettlementSaleDate: "2023-05-02",
  redevActualAcquisitionPrice: "200000000",
};

describe("C1-05 · 청산금 수령분 단독신고 — 신고단위 양도가액", () => {
  it("C1-05-01: 🔑 사이드바 양도가액이 ④ `transferPrice`와 같다", async () => {
    setAsset(RECEIVE_ONLY, { transferDate: "2023-09-01", contractTotalPrice: "1200000000" });
    const s = summary();
    // 수정 전: 계약 총액 1,200,000,000이 표시되고 합계에도 들어갔다.
    expect(s.rows[0].salePrice).toBe(300_000_000);
    expect(s.totalSalePrice).toBe(300_000_000);
    expect((await buildBody()).transferPrice).toBe(300_000_000);
  });

  it("C1-05-02: 단독신고를 끄면 계약 총액으로 돌아간다 (게이트가 실제로 축이다)", async () => {
    setAsset(
      { ...RECEIVE_ONLY, redevReceiveOnlyMode: "no" },
      { transferDate: "2023-09-01", contractTotalPrice: "1200000000" },
    );
    expect(summary().rows[0].salePrice).toBe(1_200_000_000);
    expect((await buildBody()).transferPrice).toBe(1_200_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C1-04 — §166 환산: 계산 후에도 «-»
// ─────────────────────────────────────────────────────────────────────────────

const LAND_ESTIMATED: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  redevSubject: "right",
  acquisitionDate: "2002-04-09",
  actualSalePrice: "520000000",
  redevApprovalDate: "2018-10-23",
  redevRightsValue: "300000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "90000000",
  redevOriginalAssetType: "land",
  useEstimatedAcquisition: true,
  redevLandStdPriceAtAcq: "60000000",
  redevLandStdPriceAtApproval: "200000000",
};

async function calcInto(): Promise<TransferTaxResult> {
  const body = await buildBody();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        isOneHousehold: false,
        householdHousingCount: 2,
        annualBasicDeductionUsed: 0,
        residencePeriodMonths: 0,
        ...body,
      }),
    }),
  );
  const json = (await res.json()) as {
    data?: { mode: "single"; result: TransferTaxResult };
    error?: unknown;
  };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const result = json.data!.result;
  useCalcWizardStore.setState({ result: { mode: "single", result } });
  return result;
}

describe("C1-04 · §166 환산 — 「계산 후 표시」가 실제로 이행된다", () => {
  it("C1-04-01: 계산 전에는 «계산 후 표시»다 (대조군)", () => {
    setAsset(LAND_ESTIMATED, { transferDate: "2023-03-02", contractTotalPrice: "520000000" });
    const s = summary();
    expect(s.rows[0].acqPrice).toBe(0);
    expect(s.rows[0].acqPending).toBe(true);
  });

  it("C1-04-02: 🔑 계산 후 취득가액이 신고서와 **같은 leaf**로 채워진다", async () => {
    setAsset(LAND_ESTIMATED, { transferDate: "2023-03-02", contractTotalPrice: "520000000" });
    const result = await calcInto();
    const detail = result.redevelopmentDetail!;
    const totals = redevBranchTotals(detail);
    const expected = inverseRedevAcquisition({
      totalTransferPrice: 520_000_000,
      totalExpenses: totals.expenses,
      totalGain: totals.gain,
    });

    const s = summary();
    // 수정 전: 0 + pending false → 화면 «-» (약속했던 값이 끝내 안 나온다)
    expect(s.rows[0].acqPrice).toBe(expected);
    expect(s.rows[0].acqPrice).toBeGreaterThan(0);
    expect(s.rows[0].acqPending).toBe(false);
  });

  it("C1-04-03: 🔑 계산 후 필요경비도 엔진 분기 합과 같다 (§163⑥ 개산공제 포함)", async () => {
    setAsset(LAND_ESTIMATED, { transferDate: "2023-03-02", contractTotalPrice: "520000000" });
    const result = await calcInto();
    const totals = redevBranchTotals(result.redevelopmentDetail!);
    expect(totals.expenses).toBeGreaterThan(0); // 개산공제가 실제로 붙어 있다
    expect(summary().rows[0].expense).toBe(totals.expenses);
  });

  it("C1-04-04: 🔑 자기정합 — 양도가액 = 취득가액 + 필요경비 + 양도차익", async () => {
    setAsset(LAND_ESTIMATED, { transferDate: "2023-03-02", contractTotalPrice: "520000000" });
    const result = await calcInto();
    const totals = redevBranchTotals(result.redevelopmentDetail!);
    const row = summary().rows[0];
    expect(row.acqPrice + row.expense + totals.gain).toBe(row.salePrice);
  });
});
