/**
 * anchor: `isNonBusinessLand` — assetKind 전환 시 stale 전송 차단 (P2 · D-5).
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md §4.3
 *
 * 🔴 「비사업용 토지」 토글은 `assetKind === "land"`일 때만 렌더된다
 *   (`app/calc/transfer-tax/steps/Step4.tsx:701`). 그런데 assetKind 변경 시 초기화 useEffect는
 *   `isRegulatedArea`·`isUnregistered`만 되돌리고 `isNonBusinessLand`는 남긴다.
 *   ⇒ land에서 켠 뒤 building/housing으로 바꾸면 **화면에 토글이 없는데 엔진에는 `true`가 간다**
 *   → §104①8호 +10%p 중과가 조용히 붙는다(과대과세).
 *
 * 「비사업용 **토지**」는 「소득세법」 제104조의3이 **토지**에만 규정한 개념이므로, 토지가 아닌
 * 자산에 이 플래그가 도달하는 것 자체가 법령상 성립하지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
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

function makeForm(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2010-03-01",
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    // 토지였을 때 사용자가 켠 값 — assetKind를 바꿔도 폼에는 그대로 남는다
    isNonBusinessLand: true,
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

describe("P2 (D-5) isNonBusinessLand — assetKind 게이트", () => {
  it("B-10(회귀): assetKind가 토지이면 그대로 전송된다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(cap.body?.isNonBusinessLand).toBe(true);
  });

  it("B-9: assetKind를 건물로 바꾸면 stale `true`가 엔진에 도달하지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ assetKind: "building" }));
    expect(
      cap.body?.isNonBusinessLand,
      "화면에서 사라진 토글의 값이 계산에 쓰이면 안 된다 — §104①8호 +10%p 중과 오적용",
    ).toBe(false);
  });

  it("B-9b: assetKind를 주택으로 바꿔도 마찬가지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ assetKind: "housing" }));
    expect(cap.body?.isNonBusinessLand).toBe(false);
  });

  it("B-9c(회귀): 정밀 판정 payload는 이미 토지로 게이트돼 있다", async () => {
    // `buildNonBusinessLandRaw`(lib/calc/non-business-land-request.ts:58)가 이미
    // `assetKind !== "land"`를 막고 있다 — 이 가드가 사라지면 자동 판정 경로로 중과가 되살아난다.
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ assetKind: "building", nblUseDetailedJudgment: true }));
    expect(cap.body?.nonBusinessLand).toBeUndefined();
  });
});
