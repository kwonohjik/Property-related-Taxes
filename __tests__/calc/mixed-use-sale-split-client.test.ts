/**
 * 겸용주택 양도가액 안분 기준·감가상각비·건물 귀속 양도비 — 클라이언트 ④ 전송 · R-4 이중 전송 차단 · ⑧ 검증 · 범위 술어.
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4 · §9.1 R-4
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateMixedSaleSplit } from "@/lib/calc/transfer-tax-validate-mixed-use-sale-split";
import { mixedSaleSplitScope } from "@/lib/calc/mixed-use-sale-split-scope";
import { depreciationSupport } from "@/lib/calc/depreciation-scope";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "mixed-use", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}
afterEach(() => vi.unstubAllGlobals());

function mixedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    acquisitionDate: "2023-03-20",
    landAcquisitionDate: "2020-12-01",
    hasSeperateLandAcquisitionDate: true,
    residentialFloorArea: "30",
    nonResidentialFloorArea: "70",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "400",
    ...over,
  } as AssetForm;
}

function form(assets: AssetForm[], over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    transferDate: "2026-07-01",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "200000000",
    totalTransferExpense: "0",
    ...over,
  } as unknown as TransferFormData;
}

async function bodyOf(f: TransferFormData) {
  const cap = captureBody();
  await callTransferTaxAPI(f);
  return cap.body as Record<string, unknown> & { mixedUse?: Record<string, unknown> };
}

describe("④ 전송 — mixedUse 서브객체로만", () => {
  it("[C-1] 감정 모드 — mixedUse에 감정가액, 최상위에는 없다(R-4: 별개 취득이라 split 페이로드가 활성인데도)", async () => {
    const b = await bodyOf(form([mixedAsset({
      saleSplitMode: "appraisal", landAppraisalAtTransfer: "150000000", buildingAppraisalAtTransfer: "100000000",
    })]));
    expect(b.mixedUse?.landAppraisalAtTransfer).toBe(150_000_000);
    expect(b.mixedUse?.buildingAppraisalAtTransfer).toBe(100_000_000);
    expect(b.landAppraisalAtTransfer).toBeUndefined();
    expect(b.buildingAppraisalAtTransfer).toBeUndefined();
  });

  it("[C-2] 계약서 구분 + 지분 1/3 — 건물분은 잔액이라 합이 양도가액과 1원까지 같다", async () => {
    // 토지·건물 모두 3으로 나눈 나머지가 2 → 각각 절사하면 합이 1원 모자란다(66,666,666 + 1 ≠ 각각 절사 합).
    const b = await bodyOf(form([mixedAsset({
      saleSplitMode: "actual", landTransferPrice: "110000000", buildingTransferPrice: "90000002",
      ownershipNumerator: "1", ownershipDenominator: "3",
    })], { contractTotalPrice: "200000002" }));
    const land = b.mixedUse?.landTransferPrice as number;
    const building = b.mixedUse?.buildingTransferPrice as number;
    expect(land).toBe(applyRatio(110_000_000, 1 / 3));
    expect(building).not.toBe(applyRatio(90_000_002, 1 / 3)); // 각각 절사였다면 이 값
    expect(land + building).toBe(b.transferPrice);
    expect(b.landTransferPrice).toBeUndefined();
  });

  it("[C-3] 기준시가 모드에 남은 감정값·구분값은 보내지 않는다", async () => {
    const b = await bodyOf(form([mixedAsset({
      saleSplitMode: "apportioned", landAppraisalAtTransfer: "150000000", buildingAppraisalAtTransfer: "100000000", landTransferPrice: "1",
    })]));
    expect(b.mixedUse?.landAppraisalAtTransfer).toBeUndefined();
    expect(b.mixedUse?.landTransferPrice).toBeUndefined();
  });

  it("[C-4] 감가상각비·건물 귀속 양도비 — 겸용 페이로드로만, 최상위 depreciationAmount는 없다", async () => {
    const b = await bodyOf(form([mixedAsset({ depreciationAmount: "2250000", mixedBuildingDirectTransferExpense: "1000000" })]));
    expect(b.mixedUse?.commercialBuildingDepreciation).toBe(2_250_000);
    expect(b.mixedUse?.buildingDirectTransferExpense).toBe(1_000_000);
    expect(b.depreciationAmount).toBeUndefined();
  });

  it("[C-5] 범위 밖(보유 중 일부 용도변경) — 어느 키도 싣지 않는다", async () => {
    const b = await bodyOf(form([mixedAsset({
      saleSplitMode: "appraisal", landAppraisalAtTransfer: "150000000", buildingAppraisalAtTransfer: "100000000",
      depreciationAmount: "2250000", hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial",
    })]));
    expect(b.mixedUse?.landAppraisalAtTransfer).toBeUndefined();
    expect(b.mixedUse?.commercialBuildingDepreciation).toBeUndefined();
  });

  it("[C-6] 2026.1.1. 이후 양도 + §166⑧ 예외 — 구분 기재 모드에서만 싣는다", async () => {
    const b = await bodyOf(form([mixedAsset({
      saleSplitMode: "actual", landTransferPrice: "180000000", buildingTransferPrice: "20000000",
      saleSplitExemption: "other_law", saleSplitExemptionNote: "근거",
    })]));
    expect(b.mixedUse?.saleSplitExemption).toBe("other_law");
  });
});

describe("범위 술어 — ⑤·④·⑧ 공용", () => {
  it("[S-1] 단건 겸용 = ok · 자산 2건 = blocked · 비겸용 = not_applicable", () => {
    expect(mixedSaleSplitScope(mixedAsset(), { isSingleAsset: true }).status).toBe("ok");
    expect(mixedSaleSplitScope(mixedAsset(), { isSingleAsset: false }).status).toBe("blocked");
    expect(mixedSaleSplitScope(mixedAsset({ isMixedUseHouse: false }), { isSingleAsset: true }).status).toBe("not_applicable");
  });

  it("[S-2] 공익수용·부담부증여·PHD → blocked (엔진 가드와 같은 사유)", () => {
    expect(mixedSaleSplitScope(mixedAsset({ transferCause: "public_expropriation" } as Partial<AssetForm>), { isSingleAsset: true })).toMatchObject({ status: "blocked", reason: expect.stringMatching(/공익수용/) });
    expect(mixedSaleSplitScope(mixedAsset({ transferType: "burdened_gift" } as Partial<AssetForm>), { isSingleAsset: true }).status).toBe("blocked");
    expect(mixedSaleSplitScope(mixedAsset({ usePreHousingDisclosure: true }), { isSingleAsset: true }).status).toBe("blocked");
  });

  it("[S-3] 감가상각 — 단건 겸용만 ok, 문맥이 없으면(컴패니언·다건 빌더) unsupported", () => {
    expect(depreciationSupport(mixedAsset(), { isSingleAsset: true }).status).toBe("ok");
    expect(depreciationSupport(mixedAsset()).status).toBe("unsupported");
    expect(depreciationSupport(mixedAsset(), { isSingleAsset: false }).status).toBe("unsupported");
  });
});

describe("⑧ validateMixedSaleSplit", () => {
  const v = (a: AssetForm, f = form([a])) => validateMixedSaleSplit(a, "자산", f);

  it("[V-1] 계약서 구분 — 한쪽만 입력하면 차단(자동 계산 없음)", () => {
    expect(v(mixedAsset({ saleSplitMode: "actual", landTransferPrice: "110000000", buildingTransferPrice: "" }))).toMatch(/둘 다/);
  });

  it("[V-2] 계약서 구분 — 합이 양도가액과 다르면 차단", () => {
    expect(v(mixedAsset({ saleSplitMode: "actual", landTransferPrice: "110000000", buildingTransferPrice: "80000000" }))).toMatch(/합/);
    expect(v(mixedAsset({ saleSplitMode: "actual", landTransferPrice: "110000000", buildingTransferPrice: "90000000" }))).toBeNull();
  });

  it("[V-3] 감정 — 비었거나 한쪽만이면 차단", () => {
    expect(v(mixedAsset({ saleSplitMode: "appraisal" }))).toMatch(/감정평가가액을 입력/);
    expect(v(mixedAsset({ saleSplitMode: "appraisal", landAppraisalAtTransfer: "150000000" }))).toMatch(/양쪽 모두/);
    expect(v(mixedAsset({ saleSplitMode: "appraisal", landAppraisalAtTransfer: "150000000", buildingAppraisalAtTransfer: "100000000" }))).toBeNull();
  });

  it("[V-4] §166⑧ 예외를 골랐으면 근거 필수(2025.1.1. 이후)", () => {
    expect(v(mixedAsset({
      saleSplitMode: "actual", landTransferPrice: "180000000", buildingTransferPrice: "20000000", saleSplitExemption: "other_law",
    }))).toMatch(/근거/);
  });

  it("[V-5] 범위 밖(자산 2건)은 검사하지 않는다 — ④도 보내지 않는다", () => {
    const a = mixedAsset({ saleSplitMode: "actual", landTransferPrice: "1" });
    expect(validateMixedSaleSplit(a, "자산 1", form([a, mixedAsset()]))).toBeNull();
  });
});
