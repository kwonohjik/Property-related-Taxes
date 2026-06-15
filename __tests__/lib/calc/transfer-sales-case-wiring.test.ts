/**
 * 양도세 매매사례가액 추계(§176의2③1호) 결선 — ④⑬ API 변환 + ⑧ validate (Part C)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §5
 * TypeScript 미감지 영역(⑬⑭) 실행 경로 가드 + validate 모순 방지.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ data: { mode: "single", result: {} } }),
      } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

describe("[SC-WIRE] salesCase 결선 — ④⑬ API 변환 + ⑧ validate", () => {
  it("⑬ isSalesCaseAcquisition=true → body.acquisitionMethod='salesCase' + similarSalesValue 전달", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-03-01";
    form.contractTotalPrice = "1,200,000,000";
    form.assets[0] = {
      ...form.assets[0],
      acquisitionDate: "2020-01-01",
      isSalesCaseAcquisition: true,
      similarSalesValue: "900,000,000",
      similarSalesSource: "rtms_auto",
    };
    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    expect(body.acquisitionMethod).toBe("salesCase");
    expect(body.similarSalesValue).toBe(900_000_000);
  });

  it("비-salesCase 모드는 similarSalesValue 미전달(undefined)", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-03-01";
    form.contractTotalPrice = "1,000,000,000";
    form.assets[0] = {
      ...form.assets[0],
      acquisitionDate: "2020-01-01",
      fixedAcquisitionPrice: "600,000,000",
    };
    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    expect(body.acquisitionMethod).toBe("actual");
    expect(body.similarSalesValue).toBeUndefined();
  });

  it("⑧ salesCase 모드 + 매매사례가액 미입력 → 차단", () => {
    const base = createDefaultTransferFormData().assets[0];
    const asset = {
      ...base,
      acquisitionDate: "2020-01-01",
      isSalesCaseAcquisition: true,
      similarSalesValue: "",
    } as AssetForm;
    const err = validateAssetAcquisition(asset, "자산1", "2026-03-01");
    expect(err).toMatch(/매매사례가액/);
  });

  it("⑧ salesCase 모드 + 매매사례가액 입력 → 통과", () => {
    const base = createDefaultTransferFormData().assets[0];
    const asset = {
      ...base,
      acquisitionDate: "2020-01-01",
      isSalesCaseAcquisition: true,
      similarSalesValue: "900,000,000",
    } as AssetForm;
    const err = validateAssetAcquisition(asset, "자산1", "2026-03-01");
    expect(err).toBeNull();
  });
});
