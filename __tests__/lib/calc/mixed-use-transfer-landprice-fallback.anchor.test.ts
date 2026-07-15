/**
 * anchor — 상가부수토지 **양도시** 개별공시지가 PHD fallback: API 변환 + validate.
 *
 * UI 표시(`MixedUseAssetMajorStdPrice.tsx:257`)·파생 계산(`:70`)과 동일 우선순위
 * (`mixedTransferLandPricePerSqm || phdLandPricePerSqmAtTransfer`)가
 * API 페이로드·validate에도 적용되어야 한다 (3중 패턴 — mirror-pattern 스킬).
 *
 * 주택부수토지·상가부수토지는 동일 필지 → 개별공시지가(원/㎡) 공유가 정당.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/** 겸용 + PHD ON. 양도시 공시지가를 mixed/phd 중 어디에 넣을지 인자로 제어. */
function mixedForm(over: { mixed?: string; phd?: string }) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "1,500,000,000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    isMixedUseHouse: true,
    hasPartialUsageChange: false,
    useEstimatedAcquisition: true,
    acquisitionDate: "1997-05-01",
    residentialFloorArea: "60",
    nonResidentialFloorArea: "40",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "872,000,000",
    mixedTransferCommercialBuildingPrice: "143,506,350",
    mixedAcqCommercialBuildingPrice: "95,370,017",
    mixedAcqLandPricePerSqm: "3,000,000",
    mixedTransferLandPricePerSqm: over.mixed ?? "",
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "1997-01-01",
    phdFirstDisclosureHousingPrice: "300,000,000",
    phdLandPricePerSqmAtFirst: "2,000,000",
    phdLandPricePerSqmAtTransfer: over.phd ?? "",
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdBuildingStdPriceAtFirst: "150,000,000",
    phdBuildingStdPriceAtTransfer: "200,000,000",
  };
  return form;
}

type MixedBody = {
  mixedUse?: { transferStandardPrice?: { landPricePerSqm?: number } };
};

describe("[MIX-TRANSFER-LANDPRICE-FALLBACK] API 변환", () => {
  it("C3: mixed 빈값 + phd 6,216,000 → 엔진 페이로드에 6,216,000 도달", async () => {
    const cap = captureBody(mixedForm({ phd: "6,216,000" }));
    await cap.run();
    const body = cap.get() as MixedBody | null;
    expect(body?.mixedUse?.transferStandardPrice?.landPricePerSqm).toBe(6216000);
  });

  it("C4: mixed 우선 — mixed 6,216,000 / phd 5,000,000 → 6,216,000", async () => {
    const cap = captureBody(mixedForm({ mixed: "6,216,000", phd: "5,000,000" }));
    await cap.run();
    const body = cap.get() as MixedBody | null;
    expect(body?.mixedUse?.transferStandardPrice?.landPricePerSqm).toBe(6216000);
  });

  it("C5: 둘 다 빈값 → 0 (validate가 차단하므로 엔진 도달 전 걸러짐)", async () => {
    const cap = captureBody(mixedForm({}));
    await cap.run();
    const body = cap.get() as MixedBody | null;
    expect(body?.mixedUse?.transferStandardPrice?.landPricePerSqm).toBe(0);
  });
});

describe("[MIX-TRANSFER-LANDPRICE-FALLBACK] validate ⑧ 동기화", () => {
  const transferDate = "2026-02-16";

  it("C3: mixed 빈값 + phd 있음 → 통과 (UI 통과 ↔ validate 차단 모순 방지)", () => {
    const form = mixedForm({ phd: "6,216,000" });
    const err = validateAssetAcquisition(form.assets[0], "자산 1", transferDate);
    expect(err ?? "").not.toMatch(/양도시 개별공시지가/);
  });

  it("C1: mixed 있음 → 통과", () => {
    const form = mixedForm({ mixed: "6,216,000" });
    const err = validateAssetAcquisition(form.assets[0], "자산 1", transferDate);
    expect(err ?? "").not.toMatch(/양도시 개별공시지가/);
  });

  it("C5: 둘 다 빈값 → 차단", () => {
    const form = mixedForm({});
    const err = validateAssetAcquisition(form.assets[0], "자산 1", transferDate);
    expect(err).toMatch(/양도시 개별공시지가/);
  });

  it("C6: phd = 0 → 차단 (0은 유효 공시지가 아님)", () => {
    const form = mixedForm({ phd: "0" });
    const err = validateAssetAcquisition(form.assets[0], "자산 1", transferDate);
    expect(err).toMatch(/양도시 개별공시지가/);
  });
});
