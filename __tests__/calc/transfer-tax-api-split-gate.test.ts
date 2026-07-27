/**
 * 토지/건물 취득·양도가액 독립 산정 모드 — API 전송 게이트.
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md (§7.2·§9)
 *
 * 취득 6필드(land/buildingAcquisitionPrice·매매사례가·자본적지출)는 파트별 모드(landAcqMode/
 * buildingAcqMode) 게이트, 양도가액 2필드(land/buildingTransferPrice)는 saleSplitMode 게이트,
 * 양도시 기준시가 2필드는 `saleSplitMode==="apportioned" || 파트 estimated`로 확장된 게이트를 쓴다
 * (구 `landSplitMode` 단일 게이트는 폐기 — "죽은 모드" 재발 방지).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** fetch를 가로채 실제 전송 body를 캡처 */
function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () => ({ mode: "single", result: {} }),
      } as unknown as Response;
    }),
  );
  return captured;
}

function makeForm(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2005-06-10",
    hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    // 직접 입력 필드 — 모드와 무관하게 폼에는 값이 남아 있는 상태를 재현
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "300,000,000",
    landAcquisitionPrice: "250,000,000",
    buildingAcquisitionPrice: "150,000,000",
    landDirectExpenses: "60,000,000",
    buildingDirectExpenses: "40,000,000",
    landStandardPriceAtTransfer: "1,200,000",
    buildingStandardPriceAtTransfer: "800,000",
    landSalesCaseValue: "500,000,000",
    buildingSalesCaseValue: "200,000,000",
    ...over,
  };
  return {
    transferDate: "2026-02-16",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1,000,000,000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

beforeEach(() => captureBody());
afterEach(() => vi.unstubAllGlobals());

describe("API 전송 게이트 — 양도가액 2필드 (saleSplitMode)", () => {
  it('saleSplitMode="actual" → 전송된다', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "actual" }));
    expect(cap.body?.landTransferPrice).toBeDefined();
    expect(cap.body?.buildingTransferPrice).toBeDefined();
  });

  it('🔴 saleSplitMode="apportioned"(기본) → 미전송 (유령 값 차단)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "apportioned" }));
    expect(cap.body?.landTransferPrice, "안분 모드로 되돌렸는데 이전 직접 입력값이 엔진에 도달하면 안 됨").toBeUndefined();
    expect(cap.body?.buildingTransferPrice).toBeUndefined();
  });

  it("🔴 취득일 분리 OFF → 미전송 (분리 칸 자체가 미노출)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ hasSeperateLandAcquisitionDate: false, saleSplitMode: "actual" }));
    expect(cap.body?.landTransferPrice).toBeUndefined();
    expect(cap.body?.buildingTransferPrice).toBeUndefined();
  });
});

describe("API 전송 게이트 — 취득가액 2필드 (landAcqMode/buildingAcqMode, 양도 모드와 독립)", () => {
  it('파트 모드 미선택(레거시 fallback "actual") → 전송된다', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "apportioned" }));
    expect(cap.body?.landAcquisitionPrice, "레거시 fallback actual 모드에서는 전송").toBeDefined();
    expect(cap.body?.buildingAcquisitionPrice).toBeDefined();
  });

  it('파트 모드="estimated" → 취득가액 직접입력 미전송(총액을 사용자가 입력하지 않음)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landAcqMode: "estimated", buildingAcqMode: "estimated" }));
    expect(cap.body?.landAcquisitionPrice).toBeUndefined();
    expect(cap.body?.buildingAcquisitionPrice).toBeUndefined();
  });

  it('파트 모드="salesCase" → landSalesCaseValue/buildingSalesCaseValue 전송, 취득가액 직접입력 미전송', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landAcqMode: "salesCase", buildingAcqMode: "salesCase" }));
    expect(cap.body?.landSalesCaseValue).toBeDefined();
    expect(cap.body?.buildingSalesCaseValue).toBeDefined();
    expect(cap.body?.landAcquisitionPrice).toBeUndefined();
    expect(cap.body?.buildingAcquisitionPrice).toBeUndefined();
  });

  it("혼합 모드(토지 실가+건물 환산) — 파트별 독립 전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landAcqMode: "actual", buildingAcqMode: "estimated" }));
    expect(cap.body?.landAcquisitionPrice, "토지=실가 → 전송").toBeDefined();
    expect(cap.body?.buildingAcquisitionPrice, "건물=환산 → 미전송").toBeUndefined();
    expect(cap.body?.landAcqMode).toBe("actual");
    expect(cap.body?.buildingAcqMode).toBe("estimated");
  });
});

describe("API 전송 게이트 — 자본적지출 2필드 (모드·양도방식 무관, isSplitActive만 게이트)", () => {
  it("saleSplitMode 무관하게 항상 전송된다(분리 활성 시)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "apportioned" }));
    expect(cap.body?.landDirectExpenses).toBeDefined();
    expect(cap.body?.buildingDirectExpenses).toBeDefined();
  });

  it("취득일 분리 OFF → 미전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ hasSeperateLandAcquisitionDate: false }));
    expect(cap.body?.landDirectExpenses).toBeUndefined();
    expect(cap.body?.buildingDirectExpenses).toBeUndefined();
  });
});

describe("API 전송 게이트 — 양도시 기준시가 2필드 (§7.2 확장 게이트)", () => {
  it('saleSplitMode="apportioned"(기본) → 전송된다(안분 분모)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "apportioned" }));
    expect(cap.body?.landStandardPriceAtTransfer).toBeDefined();
    expect(cap.body?.buildingStandardPriceAtTransfer).toBeDefined();
  });

  it('saleSplitMode="actual" + 파트 모두 실가 → 미전송(환산 분모 불필요)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ saleSplitMode: "actual", landAcqMode: "actual", buildingAcqMode: "actual" }),
    );
    expect(cap.body?.landStandardPriceAtTransfer).toBeUndefined();
    expect(cap.body?.buildingStandardPriceAtTransfer).toBeUndefined();
  });

  it('saleSplitMode="actual" + 파트 estimated → 전송된다(환산 분모, §7.2 재발 방지)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ saleSplitMode: "actual", landAcqMode: "estimated", buildingAcqMode: "actual" }),
    );
    expect(cap.body?.landStandardPriceAtTransfer, "미확장 게이트라면 여기서 침묵 strip되어 §4-B 재발").toBeDefined();
    expect(cap.body?.buildingStandardPriceAtTransfer).toBeDefined();
  });

  it("취득일 분리 OFF → 미전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ hasSeperateLandAcquisitionDate: false }));
    expect(cap.body?.landStandardPriceAtTransfer).toBeUndefined();
    expect(cap.body?.buildingStandardPriceAtTransfer).toBeUndefined();
  });
});

describe("게이트가 다른 필드를 건드리지 않는다 (회귀 방어)", () => {
  it("총양도가액·토지 취득일은 게이트와 무관하게 그대로 전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ saleSplitMode: "apportioned" }));
    expect(cap.body?.transferPrice, "총양도가액은 그대로 전송").toBeDefined();
    expect(cap.body?.landAcquisitionDate, "토지 취득일은 그대로").toBeDefined();
    expect(cap.body?.saleSplitMode, "양도 분리 모드 자체는 엔진 명시 입력으로 전송").toBe("apportioned");
  });
});
