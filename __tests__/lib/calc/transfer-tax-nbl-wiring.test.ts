/**
 * NBL 정밀판정 입력 ④⑬ 결선 — body.nonBusinessLandRaw 운반
 *
 * Plan: docs/00-pm/nbl-detailed-input-restoration.plan.md §6 Anchor-0
 * Pre-Do: 현재 빌더는 8필드만(`nonBusinessLandDetails`) 전송 → 상세 strip.
 *          본 anchor는 `nonBusinessLandRaw`로 지목별 상세·유예기간이 운반됨을 단언(현재 FAIL).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

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

describe("[NBL-WIRE] 정밀판정 입력 ④⑬ — body.nonBusinessLandRaw 운반", () => {
  it("forest 정밀판정 → body.nonBusinessLandRaw가 forest 상세 + grace 운반", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-06-01";
    form.contractTotalPrice = "500,000,000";
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "land",
      acquisitionDate: "2018-01-01",
      acquisitionArea: "1000",
      fixedAcquisitionPrice: "200,000,000",
      isNonBusinessLand: true,
      nblUseDetailedJudgment: true,
      nblLandType: "forest",
      nblZoneType: "agriculture_forest",
      nblForestHasPlan: true,
      nblGracePeriods: [
        { reasonCode: "other_justifiable", anchorDate: "2022-07-01", endDate: "2023-06-30", description: "질병" },
      ],
    };
    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    const raw = body.nonBusinessLandRaw as Record<string, unknown> | undefined;
    expect(raw).toBeDefined();
    expect(raw!.nblLandType).toBe("forest");
    expect(raw!.nblForestHasPlan).toBe(true);
    expect((raw!.nblGracePeriods as unknown[]).length).toBe(1);
  });

  it("간편 모드(nblUseDetailedJudgment=false) → nonBusinessLandRaw 미전달", async () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-06-01";
    form.contractTotalPrice = "500,000,000";
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "land",
      acquisitionDate: "2018-01-01",
      acquisitionArea: "1000",
      fixedAcquisitionPrice: "200,000,000",
      isNonBusinessLand: true,
      nblUseDetailedJudgment: false,
    };
    const { run, get } = captureBody(form);
    await run();
    const body = get()!;
    expect(body.nonBusinessLandRaw).toBeUndefined();
  });
});
