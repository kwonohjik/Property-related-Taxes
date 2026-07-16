/**
 * 분리 직접 입력 6필드 — API 전송 게이트 (C-4).
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (§3-C C-4)
 *
 * 엔진은 `landSplitMode`를 읽지 않고(죽은 모드) 필드별 `?? fallback`으로만 동작한다.
 * → "직접 입력"으로 값을 채운 뒤 "기준시가 비율 안분"으로 되돌려도 그 값이 계속 엔진에 도달했다(유령 값).
 * UI에서 필드를 클리어하는 대신 **전송 게이트**로 막는다(폼값 보존 → 재토글 시 복원).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const SPLIT_FIELDS = [
  "landTransferPrice",
  "buildingTransferPrice",
  "landAcquisitionPrice",
  "buildingAcquisitionPrice",
  "landDirectExpenses",
  "buildingDirectExpenses",
  "landStandardPriceAtTransfer",
  "buildingStandardPriceAtTransfer",
] as const;

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
    // 직접 입력 6필드 — 모드와 무관하게 폼에는 값이 남아 있는 상태를 재현
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "300,000,000",
    landAcquisitionPrice: "250,000,000",
    buildingAcquisitionPrice: "150,000,000",
    landDirectExpenses: "60,000,000",
    buildingDirectExpenses: "40,000,000",
    landStandardPriceAtTransfer: "1,200,000",
    buildingStandardPriceAtTransfer: "800,000",
    ...over,
  };
  // defaultFormData는 export되지 않으므로 callTransferTaxAPI가 실제로 읽는 필드만 최소 구성.
  return {
    transferDate: "2026-02-16",
    assets: [asset],
    houses: [],
    presaleRights: [],
    sellingHouseRegion: "non_regulated",
    contractTotalPrice: "1,000,000,000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

beforeEach(() => captureBody());
afterEach(() => vi.unstubAllGlobals());

describe("API 전송 게이트 — 분리 직접 입력 6필드", () => {
  it('landSplitMode="actual" → 전송된다', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landSplitMode: "actual" }));
    for (const f of SPLIT_FIELDS) {
      expect(cap.body?.[f], `${f}는 직접 입력 모드에서 전송되어야 함`).toBeDefined();
    }
  });

  it('🔴 landSplitMode="apportioned" → 미전송 (유령 값 차단)', async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landSplitMode: "apportioned" }));
    for (const f of SPLIT_FIELDS) {
      expect(
        cap.body?.[f],
        `${f}: "기준시가 비율 안분"으로 되돌렸는데 이전 직접 입력값이 엔진에 도달하면 안 됨`,
      ).toBeUndefined();
    }
  });

  it("🔴 취득일 분리 OFF → 미전송 (분리 칸 자체가 미노출)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ hasSeperateLandAcquisitionDate: false, landSplitMode: "actual" }),
    );
    for (const f of SPLIT_FIELDS) {
      expect(cap.body?.[f], `${f}는 분리 OFF에서 전송되면 안 됨`).toBeUndefined();
    }
  });

  it("게이트가 다른 필드를 건드리지 않는다 (회귀 방어)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ landSplitMode: "apportioned" }));
    expect(cap.body?.transferPrice, "총양도가액은 그대로 전송").toBeDefined();
    expect(cap.body?.landSplitMode, "모드 자체는 전송(엔진 미소비이나 계약 유지)").toBe("apportioned");
    expect(cap.body?.landAcquisitionDate, "토지 취득일은 그대로").toBeDefined();
  });
});
