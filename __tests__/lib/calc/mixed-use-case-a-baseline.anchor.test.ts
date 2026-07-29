/**
 * Pre-Do anchor — 겸용주택 Case A 자산-우선 재편 전/후 페이로드 불변 baseline
 *
 * Case A = isMixedUseHouse && hasPartialUsageChange && dir="house_to_commercial"
 *          && phdFirstDisclosureDate < partialChangeDate (splitMode 4부분).
 * 재편은 UI-only(ThreePoint asset-major 렌더 + legacy isCaseA in-place 전환)이며
 * `callTransferTaxAPI`(API 변환)는 손대지 않는다. 동일 AssetForm → 동일 엔진 페이로드여야 함
 * (계획 §3·§8). 특히 preHousingDisclosure Case A 게이트(commercialBuildingStdPriceAtAcq·
 * commercialBuildingStdPriceAtFirstDisclosure·totalTransferPriceForFourPart)와
 * mixedTransferHousingPrice 게이트를 동결. 재편 후에도 값 변경 없이 통과해야 한다.
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
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/** Case A — 용도변경(house→commercial) + 최초공시(2015) < 용도변경(2018) + PHD */
function caseAForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2025-05-01";
  form.contractTotalPrice = "1,500,000,000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    isMixedUseHouse: true,
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial",
    partialChangeDate: "2018-06-01",
    useEstimatedAcquisition: true,
    acquisitionDate: "2010-06-15",
    // 면적
    residentialFloorArea: "120",
    nonResidentialFloorArea: "80",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    // 양도 개별주택공시가격 (PHD 게이트)
    mixedTransferHousingPrice: "872,000,000",
    // 주택건물 3시점
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdBuildingStdPriceAtFirst: "150,000,000",
    phdBuildingStdPriceAtTransfer: "200,000,000",
    // 상가건물 3시점 (취득=mixedAcq, 최초공시=phdCommercial…First, 양도=mixedTransfer)
    mixedAcqCommercialBuildingPrice: "50,000,000",
    phdCommercialBuildingStdPriceAtFirst: "60,000,000",
    mixedTransferCommercialBuildingPrice: "70,000,000",
    // 토지 ㎡당 3시점
    phdLandPricePerSqmAtAcq: "2,000,000",
    phdLandPricePerSqmAtFirst: "2,500,000",
    phdLandPricePerSqmAtTransfer: "3,000,000",
    // PHD 스칼라
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2015-01-01", // < partialChangeDate → Case A
    phdFirstDisclosureHousingPrice: "300,000,000",
  };
  return form;
}

type MixedBody = {
  mixedUse?: {
    transferStandardPrice?: { housingPrice?: number; commercialBuildingPrice?: number };
    acquisitionStandardPrice?: { commercialBuildingPrice?: number };
    preHousingDisclosure?: {
      commercialBuildingStdPriceAtAcq?: number;
      commercialBuildingStdPriceAtFirstDisclosure?: number;
      totalTransferPriceForFourPart?: number;
      buildingStdPriceAtAcquisition?: number;
      buildingStdPriceAtFirstDisclosure?: number;
      buildingStdPriceAtTransfer?: number;
      landPricePerSqmAtAcquisition?: number;
      landPricePerSqmAtFirstDisclosure?: number;
      landPricePerSqmAtTransfer?: number;
      transferHousingPrice?: number;
    };
  };
};

describe("[MIX-CASE-A-BASELINE] Case A 페이로드 불변 anchor (재편 전/후 동일)", () => {
  it("preHousingDisclosure Case A 4부분 게이트 — 상가 취득/최초공시 + 총양도가액", async () => {
    const { run, get } = captureBody(caseAForm());
    await run();
    const phd = (get()! as MixedBody).mixedUse!.preHousingDisclosure!;
    expect(phd).toBeDefined();
    expect(phd.commercialBuildingStdPriceAtAcq).toBe(50_000_000);
    expect(phd.commercialBuildingStdPriceAtFirstDisclosure).toBe(60_000_000);
    expect(phd.totalTransferPriceForFourPart).toBe(1_500_000_000);
  });

  it("preHousingDisclosure 3시점 주택건물·토지 + 양도개별주택가격(게이트)", async () => {
    const { run, get } = captureBody(caseAForm());
    await run();
    const phd = (get()! as MixedBody).mixedUse!.preHousingDisclosure!;
    expect(phd.buildingStdPriceAtAcquisition).toBe(100_000_000);
    expect(phd.buildingStdPriceAtFirstDisclosure).toBe(150_000_000);
    expect(phd.buildingStdPriceAtTransfer).toBe(200_000_000);
    expect(phd.landPricePerSqmAtAcquisition).toBe(2_000_000);
    expect(phd.landPricePerSqmAtFirstDisclosure).toBe(2_500_000);
    expect(phd.landPricePerSqmAtTransfer).toBe(3_000_000);
    expect(phd.transferHousingPrice).toBe(872_000_000);
  });

  it("양도/취득 상가건물 — transferStandardPrice·acquisitionStandardPrice 도달", async () => {
    const { run, get } = captureBody(caseAForm());
    await run();
    const mu = (get()! as MixedBody).mixedUse!;
    expect(mu.transferStandardPrice!.commercialBuildingPrice).toBe(70_000_000);
    expect(mu.transferStandardPrice!.housingPrice).toBe(872_000_000);
    expect(mu.acquisitionStandardPrice!.commercialBuildingPrice).toBe(50_000_000);
  });
});
