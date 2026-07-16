/**
 * validate anchor — §164⑨1호 건물 split 토지분 + 주택 regular split 차단 (계획 P6/D6 · C-06b).
 *
 * - 건물 split + 수용 + 환산 + 2009.02.04 → 토지분 보상 2필드 필수.
 * - 주택 regular split(비-PHD) + 수용 + 환산 → **차단**(총액 미분해, Q6).
 * - 주택 PHD split은 §164⑦ 3시점 환산이 분해 수행 → 차단 제외(D15, 후속).
 */
import { describe, it, expect } from "vitest";
import { validateSplitLandExprAsset } from "@/lib/calc/transfer-tax-validate-expropriation";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TD = "2023-06-01"; // ≥ 2009.02.04

function asset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    hasSeperateLandAcquisitionDate: true,
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation" as const,
    ...over,
  };
}

describe("validateSplitLandExprAsset (P6/D6)", () => {
  it("건물 split 수용 환산 — 토지분 보상 2필드 미입력 → 차단", () => {
    const a = asset({ assetKind: "building" });
    const e = validateSplitLandExprAsset(a, "자산1", TD);
    expect(e).toMatch(/토지분 보상액 총액/);
  });

  it("건물 split — 토지분 2필드 입력 완료 → 통과", () => {
    const a = asset({
      assetKind: "building",
      splitLandCompensationTotal: "150,000,000",
      splitLandCompensationBasisTotal: "200,000,000",
    });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });

  it("C-06b — 주택 regular split(비-PHD) 수용 환산 → 차단(미지원)", () => {
    const a = asset({ assetKind: "housing", usePreHousingDisclosure: false });
    const e = validateSplitLandExprAsset(a, "자산1", TD);
    expect(e).toMatch(/개별주택가격이 총액/);
    expect(e).toMatch(/미지원/);
  });

  it("주택 PHD split은 차단 제외(D15 후속) → null", () => {
    const a = asset({ assetKind: "housing", usePreHousingDisclosure: true });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });

  it("게이트 OFF — 수용 아님(general) → null", () => {
    const a = asset({ assetKind: "building", transferCause: "general" });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });

  it("게이트 OFF — split 아님(단건) → null", () => {
    const a = asset({ assetKind: "building", hasSeperateLandAcquisitionDate: false });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });

  it("게이트 OFF — 양도 2009.02.03 → null", () => {
    const a = asset({ assetKind: "building" });
    expect(validateSplitLandExprAsset(a, "자산1", "2009-02-03")).toBeNull();
  });

  it("게이트 OFF — 환산 아님 → null", () => {
    const a = asset({ assetKind: "building", useEstimatedAcquisition: false });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });

  it("토지 자산은 split 대상 아님 → null(건물만)", () => {
    const a = asset({ assetKind: "land" });
    expect(validateSplitLandExprAsset(a, "자산1", TD)).toBeNull();
  });
});

/**
 * **파이프라인 순서 회귀** — `validateAssetEntry`는 per-sqm(`validateExprValuationAsset`)를
 * split 토지분(`validateSplitLandExprAsset`)보다 **먼저** 실행한다. split 건물에서 per-sqm 가드가
 * 없으면 숨겨진 per-sqm 필드를 요구해 기능이 영구 차단된다(코드리뷰 Critical). 단독 호출로는
 * 못 잡는 순서 버그이므로 전체 진입점으로 검증한다.
 */
function splitForm(assetOver: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = TD;
  form.contractTotalPrice = "1000000000";
  const a = {
    ...makeDefaultAsset(1),
    assetKind: "building" as const,
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2015-06-01",
    landAcquisitionDate: "2010-06-01",
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation" as const,
    actualSalePrice: "1,000,000,000",
    standardPriceAtTransfer: "500,000,000",
    standardPriceAtAcq: "200,000,000",
    ...assetOver,
  };
  form.assets = [a];
  return { form, a };
}

describe("validateAssetEntry 파이프라인 순서 (P6/D6 · 코드리뷰 Critical)", () => {
  it("건물 split 수용 환산 — per-sqm '보상가액(원/㎡)' 에러로 선점되지 않는다", () => {
    const { form, a } = splitForm();
    const e = validateAssetEntry(a, 0, form);
    // per-sqm(원/㎡) 에러가 아니라 split 토지분 에러여야 한다.
    expect(e).not.toMatch(/원\/㎡/);
    expect(e).toMatch(/토지분 보상액 총액/);
  });

  it("건물 split 수용 환산 — 토지분 2필드 입력 시 수용 특례 검증 통과(다른 필드 무관)", () => {
    const { form, a } = splitForm({
      splitLandCompensationTotal: "150,000,000",
      splitLandCompensationBasisTotal: "200,000,000",
    });
    const e = validateAssetEntry(a, 0, form);
    // 수용 특례 관련 에러(원/㎡·토지분 총액)는 없어야 한다.
    expect(e ?? "").not.toMatch(/보상가액|토지분 보상/);
  });

  it("주택 regular split 수용 환산 — C-06b '미지원' 메시지(‘보상액 총액’ false-require 아님)", () => {
    const { form, a } = splitForm({ assetKind: "housing", usePreHousingDisclosure: false });
    const e = validateAssetEntry(a, 0, form);
    expect(e).toMatch(/미지원/);
    expect(e ?? "").not.toMatch(/주택 수용 환산 특례 — 보상액 총액/);
  });

  it("주택 PHD split 수용 환산 — false-require 없음(주택총액 필드 미강제, D15 후속)", () => {
    const { form, a } = splitForm({ assetKind: "housing", usePreHousingDisclosure: true });
    const e = validateAssetEntry(a, 0, form);
    expect(e ?? "").not.toMatch(/보상액 총액|미지원/);
  });
});
