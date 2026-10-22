/**
 * anchor: 공통 양도비 5단 배관 — 폼 → ④ → ⑬ fetch body → ⑫ Zod (2026-09-05 · 코드리뷰 Q08)
 *
 * ⑫⑬은 TypeScript가 잡지 못한다 — 한 계층을 빠뜨리면 값이 조용히 사라진다.
 * 안분 산식 자체는 `companion-common-transfer-expense.anchor.test.ts`가 고정한다.
 *
 * ## 이 anchor가 지키는 두 불변식
 *
 * 1. 폼-수준 「총 양도비」는 **신고 단위 1회**(`commonTransferExpense`)로만 나간다.
 * 2. 그때 **어느 자산에도** 폼-수준 값이 실리지 않는다 — 엔진이
 *    `allocatedExpenses = directExpenses + commonShare`로 더하므로 이중 계상이 된다.
 *
 * 종전에는 주 자산이 총액 100%를 받고 컴패니언은 0을 받았다(§100② 후단 위반).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

afterEach(() => vi.unstubAllGlobals());

const TOTAL_EXPENSE = "10,000,000";

function companionForm(over: Partial<TransferFormData> = {}): TransferFormData {
  const primary = {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-02-10",
    actualSalePrice: "700,000,000",
    fixedAcquisitionPrice: "300,000,000",
    standardPriceAtTransfer: "700,000,000",
  };
  const companion = {
    ...makeDefaultAsset(2),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-02-10",
    actualSalePrice: "300,000,000",
    fixedAcquisitionPrice: "100,000,000",
    standardPriceAtTransfer: "300,000,000",
  };
  return {
    transferDate: "2026-01-27",
    assets: [primary, companion],
    houses: [],
    presaleRights: [],
    isOneHousehold: false,
    householdHousingCount: "0",
    residencePeriodMonths: "0",
    annualBasicDeductionUsed: "0",
    contractTotalPrice: "1,000,000,000",
    bundledSaleMode: "actual",
    totalTransferExpense: TOTAL_EXPENSE,
    ...over,
  } as unknown as TransferFormData;
}

describe("⑬ 공통 양도비 — 신고 단위 1회 전송", () => {
  it("🔴 `commonTransferExpense`가 body에 실린다 (종전에는 이 키가 없었다)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(companionForm());
    expect(cap.body?.commonTransferExpense).toBe(10_000_000);
  });

  it("🔑 주 자산에 총액이 실리지 않는다 (종전에는 100%가 실렸다 — 이중 계상)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(companionForm());
    expect(cap.body?.transferExpense).toBeUndefined();
  });

  it("🔑 컴패니언에도 폼-수준 값이 실리지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(companionForm());
    const companions = cap.body?.companionAssets as { transferExpense?: number }[];
    expect(companions).toHaveLength(1);
    expect(companions[0].transferExpense).toBeUndefined();
  });

  it("총 양도비가 있으면 꺼진 자산 양도비 칸의 값은 싣지 않는다 (O-9 — 그 칸은 화면에서 잠겨 있다)", async () => {
    // 종전 단언은 「직접분 + 공통분 합산」이었으나 실측은 직접분이 그 자산의 공통분 몫을 **대체**했고(Σ ≠ 총 양도비),
    // 화면은 그 칸을 잠가 사용자가 볼 수도 고칠 수도 없었다(계획서 `burdened-gift-residuals-o9-o11.plan.md` §5).
    const cap = captureBody();
    const f = companionForm();
    f.assets[1].transferExpense = "2,000,000";
    await callTransferTaxAPI(f);
    const companions = cap.body?.companionAssets as { transferExpense?: number }[];
    expect(companions[0].transferExpense).toBeUndefined();
    expect(cap.body?.commonTransferExpense).toBe(10_000_000);
  });

  it("대조군 — 총 양도비가 비면 자산별 직접 입력 양도비는 그대로 실린다", async () => {
    const cap = captureBody();
    const f = companionForm({ totalTransferExpense: "" } as Partial<TransferFormData>);
    f.assets[1].transferExpense = "2,000,000";
    await callTransferTaxAPI(f);
    const companions = cap.body?.companionAssets as { transferExpense?: number }[];
    expect(companions[0].transferExpense).toBe(2_000_000);
    expect(cap.body?.commonTransferExpense).toBeUndefined();
  });

  it("대조군 — 단건(자산 1건)은 총 양도비를 싣지 않는다 (O-9 — 단건에는 그 칸이 없다)", async () => {
    // 종전에는 주 자산에 그대로 실었다 — 「함께 양도」를 끄거나 세션 복원으로 단건이 되면 칸이 사라진 값이 필요경비가 됐다.
    const cap = captureBody();
    const f = companionForm();
    f.assets = [f.assets[0]];
    await callTransferTaxAPI(f);
    expect(cap.body?.commonTransferExpense).toBeUndefined();
    expect(cap.body?.transferExpense).toBeUndefined();
  });

  it("대조군 — 총 양도비가 비면 키를 보내지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(companionForm({ totalTransferExpense: "" } as Partial<TransferFormData>));
    expect(cap.body?.commonTransferExpense).toBeUndefined();
  });
});

describe("⑫ Zod — 키가 스키마에 정의돼 있다 (없으면 조용히 strip된다)", () => {
  it("commonTransferExpense가 파싱 결과에 남는다", () => {
    const parsed = propertySchema.parse({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      transferDate: "2026-01-27",
      acquisitionPrice: 400_000_000,
      acquisitionDate: "2018-02-10",
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      annualBasicDeductionUsed: 0,
      commonTransferExpense: 10_000_000,
    });
    expect((parsed as { commonTransferExpense?: number }).commonTransferExpense).toBe(10_000_000);
  });
});
