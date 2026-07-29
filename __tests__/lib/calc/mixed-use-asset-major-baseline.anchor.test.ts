/**
 * Pre-Do anchor — 겸용주택 자산-우선 재편 전/후 페이로드 불변 baseline (케이스 2)
 *
 * 케이스 2 = isMixedUseHouse && hasPartialUsageChange === false && PHD(§164⑤) ON.
 * 재편은 UI-only(위젯 위치만 자산-우선으로 이동)이며 `callTransferTaxAPI`(API 변환)는
 * 손대지 않는다. 동일 AssetForm → 동일 엔진 페이로드여야 함(계획 §4·§10).
 * 이 anchor는 상가건물(취득·양도)·개별주택공시가격·PHD 필드가 재편 후에도
 * 동일하게 엔진에 도달함을 동결한다. 재편 후에도 값 변경 없이 통과해야 한다.
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

/** 케이스 2 — 용도변경 없음 + 개별주택가격 미공시(PHD) 겸용주택 */
function case2Form() {
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
    // 면적
    residentialFloorArea: "60",
    nonResidentialFloorArea: "40",
    mixedUseTotalLandArea: "200",
    // 주택 — 양도 개별주택공시가격 (취득은 PHD 환산)
    mixedTransferHousingPrice: "872,000,000",
    // 상가건물 — 취득·양도 (재편 후 상가 섹션 통합모달 대상)
    mixedTransferCommercialBuildingPrice: "143,506,350",
    mixedAcqCommercialBuildingPrice: "95,370,017",
    // 상가부수토지 개별공시지가 — 취득·양도
    mixedTransferLandPricePerSqm: "6,216,000",
    mixedAcqLandPricePerSqm: "3,000,000",
    // PHD §164⑤ 주택 3-시점
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "1997-01-01",
    phdFirstDisclosureHousingPrice: "300,000,000",
    phdLandPricePerSqmAtFirst: "2,000,000",
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdBuildingStdPriceAtFirst: "150,000,000",
    phdBuildingStdPriceAtTransfer: "200,000,000",
  };
  return form;
}

type MixedBody = {
  mixedUse?: {
    isMixedUseHouse?: boolean;
    transferStandardPrice?: { housingPrice?: number; commercialBuildingPrice?: number; landPricePerSqm?: number };
    acquisitionStandardPrice?: { housingPrice?: number; commercialBuildingPrice?: number; landPricePerSqm?: number };
    usePreHousingDisclosure?: boolean;
    preHousingDisclosure?: {
      firstDisclosureHousingPrice?: number;
      buildingStdPriceAtAcquisition?: number;
      transferHousingPrice?: number;
      landPricePerSqmAtAcquisition?: number;
      landPricePerSqmAtTransfer?: number;
    };
  };
};

describe("[MIX-ASSET-MAJOR-BASELINE] 케이스 2 페이로드 불변 anchor (재편 전/후 동일)", () => {
  it("양도시 기준시가 — 주택·상가건물·상가토지가 mixed* 필드에서 엔진에 도달", async () => {
    const { run, get } = captureBody(case2Form());
    await run();
    const mu = (get()! as MixedBody).mixedUse!;
    expect(mu.isMixedUseHouse).toBe(true);
    expect(mu.transferStandardPrice).toEqual({
      housingPrice: 872_000_000,
      commercialBuildingPrice: 143_506_350,
      landPricePerSqm: 6_216_000,
    });
  });

  it("취득시 기준시가 — 상가건물(mixedAcq)·상가토지(mixedAcq) 도달, 주택은 PHD 환산(housingPrice undefined)", async () => {
    const { run, get } = captureBody(case2Form());
    await run();
    const acq = (get()! as MixedBody).mixedUse!.acquisitionStandardPrice!;
    expect(acq.commercialBuildingPrice).toBe(95_370_017);
    expect(acq.landPricePerSqm).toBe(3_000_000);
    // 취득 개별주택공시가격 미입력(PHD 환산) → undefined
    expect(acq.housingPrice).toBeUndefined();
  });

  it("PHD 페이로드 — 개별주택가격 미공시 3-시점 값 전달", async () => {
    const { run, get } = captureBody(case2Form());
    await run();
    const mu = (get()! as MixedBody).mixedUse!;
    expect(mu.usePreHousingDisclosure).toBe(true);
    const phd = mu.preHousingDisclosure!;
    expect(phd).toBeDefined();
    expect(phd.firstDisclosureHousingPrice).toBe(300_000_000);
    expect(phd.buildingStdPriceAtAcquisition).toBe(100_000_000);
    // 양도시 개별주택가격 fallback (phdTransferHousingPrice 미입력 → mixedTransferHousingPrice)
    expect(phd.transferHousingPrice).toBe(872_000_000);
    // 취득 토지 ㎡ = mixedAcqLandPricePerSqm, 양도 토지 ㎡ = mixedTransferLandPricePerSqm fallback
    expect(phd.landPricePerSqmAtAcquisition).toBe(3_000_000);
    expect(phd.landPricePerSqmAtTransfer).toBe(6_216_000);
  });
});
