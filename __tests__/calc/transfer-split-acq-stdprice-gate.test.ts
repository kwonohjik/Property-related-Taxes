/**
 * 분리 모드 취득시 기준시가 전송 게이트 (P1) — "조용한 분리 비활성" 회귀 가드.
 *
 * 계획서: docs/02-design/features/transfer-separate-acq-date-per-part-completion.plan.md §3.1 · §12 P1
 *
 * 버그: `standardPriceAtAcquisition`이 `isEstimated`(환산 모드)일 때만 전송돼,
 * 실거래가·감정·매매사례 + 토지·건물 분리 모드에서는 엔진에 도달하지 않았다.
 * → `calcApportionRatio`(split-gain.ts:26-36)가 `sqm<=0 || area<=0 || total<=0`으로 null
 * → `calcSplitGain`(:241-242)이 **전체 null** → 토지·건물 분리 계산이 **오류 없이 비활성**되고
 *   건물 취득일 기준 단일 계산으로 강등됐다(과세 결과 상이).
 *
 * UI도 동일 게이트였다(`CompanionAcqPurchaseBlock.tsx:454`) — 입력칸 자체가 환산 모드에서만
 * 노출돼 사용자가 값을 넣을 방법도 없었다. 본 커밋에서 UI·API 양쪽을 함께 해소한다.
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
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2025-08-29",      // 건물(주택) 취득일 — 사용승인일
    landAcquisitionDate: "2025-01-08",  // 토지 취득일
    hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "100,000,000",
    // 취득시 기준시가 3요소 (§166⑥ 안분 비율 소스).
    // CurrencyInput은 콤마를 제거한 raw 숫자열을 store에 넣는다(CurrencyInput.tsx:96-99) —
    // 실제 저장 형식과 동일하게 콤마 없이 둔다. `standardPricePerSqmAtAcq`는 API가
    // parseFloat로 읽으므로(transfer-tax-api.ts:381-383) 콤마가 섞이면 값이 무너진다.
    standardPriceAtAcq: "500000000",
    standardPricePerSqmAtAcq: "1000000",
    acquisitionArea: "200",
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

describe("P1 — 분리 모드 취득시 기준시가 전송 게이트", () => {
  it("실거래가 모드 + 분리 → standardPriceAtAcquisition 전송 (구: 미전송 → 분리 비활성)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ useEstimatedAcquisition: false }));
    expect(
      cap.body?.standardPriceAtAcquisition,
      "실거래가 분리 모드에서 미전송되면 calcApportionRatio가 null → 분리 계산이 조용히 비활성된다",
    ).toBe(500_000_000);
    // 안분 비율 산정에 함께 필요한 나머지 2요소
    expect(cap.body?.standardPricePerSqmAtAcquisition).toBe(1_000_000);
    expect(cap.body?.acquisitionArea).toBe(200);
  });

  it("감정가액 모드 + 분리 → 전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ useEstimatedAcquisition: false, isAppraisalAcquisition: true }),
    );
    expect(cap.body?.standardPriceAtAcquisition).toBe(500_000_000);
  });

  it("매매사례가액 모드 + 분리 → 전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ useEstimatedAcquisition: false, isSalesCaseAcquisition: true }),
    );
    expect(cap.body?.standardPriceAtAcquisition).toBe(500_000_000);
  });

  it("환산 모드 + 분리 → 전송 (회귀 방어 — 종전부터 정상)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ useEstimatedAcquisition: true }));
    expect(cap.body?.standardPriceAtAcquisition).toBe(500_000_000);
  });

  it("🔴 비분리 + 실거래가 → 미전송 (회귀 0 — 종전 동작 유지)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false }),
    );
    expect(
      cap.body?.standardPriceAtAcquisition,
      "비분리 실거래가는 취득시 기준시가를 쓰지 않는다 — 전송 확대는 분리 모드 한정",
    ).toBeUndefined();
  });
});

/**
 * P2a ⑬ 배관 — `isSeparateAcquisition`은 TypeScript가 잡지 못하는 침묵 stripping 구간
 * (body spread → Zod → route → 엔진 input)을 지난다. 미도달 시 엔진이 종전 총액 모델로
 * 조용히 되돌아가므로 전송 자체를 anchor한다.
 */
describe("P2a — 별개 취득 게이트(isSeparateAcquisition) 전송", () => {
  it("취득일 상이 + 분리 → true 전송", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ useEstimatedAcquisition: false }));
    expect(cap.body?.isSeparateAcquisition).toBe(true);
  });

  it("🔴 취득일 동일 → false (겸용·selfOwns가 분리를 강제해도 총액은 실재한다)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ useEstimatedAcquisition: false, landAcquisitionDate: "2025-08-29" }),
    );
    expect(
      cap.body?.isSeparateAcquisition,
      "취득일이 같으면 취득가액 총액이 실재하므로 §166⑥ 안분이 정당 — 파트별 완결을 강제하면 안 된다",
    ).toBe(false);
  });

  it("🔴 겸용주택 → false (4부분 안분이 별도 축을 지배 — 범위 밖)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ useEstimatedAcquisition: false, isMixedUseHouse: true }),
    );
    expect(cap.body?.isSeparateAcquisition).toBe(false);
  });

  it("비분리 → 미전송 (isSplitActive 게이트 밖)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false }),
    );
    expect(cap.body?.isSeparateAcquisition).toBeUndefined();
  });
});
