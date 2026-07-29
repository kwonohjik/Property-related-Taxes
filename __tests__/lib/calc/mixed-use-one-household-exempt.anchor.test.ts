/**
 * 겸용주택 1세대1주택 비과세·표2 게이팅 버그 — isOneHouseExempt 소스 정정 앵커.
 *
 * 버그: Step4 "1세대 해당" 토글은 form.isOneHousehold에만 쓰는데, 겸용 payload는
 *   primary.isOneHousehold(자산-level, makeDefaultAsset 기본 false·동기화 부재)를 읽어
 *   isOneHouseExempt가 항상 false → 12억 비과세 미적용 + 표1(거주공제 0).
 * 수정: 겸용 isOneHouseExempt를 form.isOneHousehold에서 도출(일반 엔진 :467과 동일 소스).
 *
 * Pre-Do: 현재는 primary.isOneHousehold(false) 사용 → anchor-A RED. 수정 후 GREEN.
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

/** 1세대1주택 겸용주택 폼 — form.isOneHousehold=true, asset.isOneHousehold은 기본(false) 유지(버그 재현). */
function oneHouseholdMixedForm(oneHousehold: boolean) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.filingDate = "2026-04-30";
  form.contractTotalPrice = "2300000000";
  form.householdHousingCount = "1";
  form.isOneHousehold = oneHousehold; // Step4 토글 = form-level
  form.assets[0] = {
    ...form.assets[0],
    // isOneHousehold는 의도적으로 미설정 → makeDefaultAsset 기본 false (동기화 부재 재현)
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "1997-09-12",
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    residenceInputMode: "interval",
    residencePeriods: [{ moveInDate: "1997-09-12", moveOutDate: "2022-02-16" }],
  };
  return form;
}

function mixedUse(body: Record<string, unknown>) {
  return body.mixedUse as { isOneHouseExempt?: boolean; residencePeriodYears?: number } | undefined;
}

describe("[MIXED-1SE1JU] 겸용 1세대1주택 비과세·표2 게이팅 — form.isOneHousehold 소스", () => {
  it("anchor-A: 토글 ON(form.isOneHousehold=true) + 1채 → isOneHouseExempt=true (자산 기본 false 무관)", async () => {
    const { run, get } = captureBody(oneHouseholdMixedForm(true));
    await run();
    expect(mixedUse(get()!)?.isOneHouseExempt).toBe(true);
  });

  it("anchor-B: 토글 OFF(form.isOneHousehold=false) → isOneHouseExempt=false", async () => {
    const { run, get } = captureBody(oneHouseholdMixedForm(false));
    await run();
    expect(mixedUse(get()!)?.isOneHouseExempt).toBe(false);
  });

  it("anchor-C: 정합 — 1세대1주택 ON이면 거주 도출(24년)도 함께 → 표2 조건 충족", async () => {
    const { run, get } = captureBody(oneHouseholdMixedForm(true));
    await run();
    const mu = mixedUse(get()!)!;
    expect(mu.isOneHouseExempt).toBe(true);
    expect(mu.residencePeriodYears).toBe(24); // isOneHouseExempt && residence>=2 → 표2
  });
});
