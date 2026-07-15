/**
 * 일괄양도 companion 자산 1세대1주택 비과세 게이팅 버그 — isOneHousehold 소스 정정 앵커.
 *
 * 버그: Step4 "1세대 해당" 토글은 form.isOneHousehold에만 쓰는데, companion 자산 payload는
 *   buildAssetPayload가 asset.isOneHousehold(기본 false·동기화 부재)를 읽어
 *   일괄양도의 companion 주택이 토글 ON에도 항상 1세대1주택 비과세 미적용.
 * 수정: buildAssetPayload isOneHousehold를 form.isOneHousehold(세대 단위)에서 도출.
 *
 * Pre-Do: 현재는 asset.isOneHousehold(false) → anchor-A RED. 수정 후 GREEN.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "bundled", result: {} } }) } as Response;
  }));
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

function bundledForm(oneHousehold: boolean) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "2000000000";
  form.isOneHousehold = oneHousehold; // Step4 토글 = form-level
  form.householdHousingCount = "1";
  form.bundledSaleMode = "actual";
  // primary = 토지
  form.assets[0] = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2010-01-01",
    acquisitionArea: "300",
    fixedAcquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
  };
  // companion = 주택 (1세대1주택 비과세 대상). asset.isOneHousehold은 기본 false(동기화 부재) 유지.
  form.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionDate: "2005-01-01",
    acquisitionArea: "84",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "1000000000",
  });
  return form;
}

function companion0(body: Record<string, unknown>) {
  const arr = body.companionAssets as Array<{ isOneHousehold?: boolean; assetKind?: string }> | undefined;
  return arr?.[0];
}

describe("[BUNDLED-1SE1JU] 일괄양도 companion 1세대1주택 — form.isOneHousehold 소스", () => {
  it("anchor-A: 토글 ON → companion 주택 isOneHousehold=true (자산 기본 false 무관)", async () => {
    const { run, get } = captureBody(bundledForm(true));
    await run();
    expect(companion0(get()!)?.isOneHousehold).toBe(true);
  });

  it("anchor-B: 토글 OFF → companion isOneHousehold=false", async () => {
    const { run, get } = captureBody(bundledForm(false));
    await run();
    expect(companion0(get()!)?.isOneHousehold).toBe(false);
  });

  it("anchor-C: primary(top-level)도 form.isOneHousehold와 일치", async () => {
    const { run, get } = captureBody(bundledForm(true));
    await run();
    expect(get()!.isOneHousehold).toBe(true);
  });
});
