/**
 * ⑧ 감정가액·매매사례가액에서 **취득시 기준시가 필수** — 차단 범위 anchor (Q-1 사용자 확정 2026-09-15).
 *
 * §97②2호 본문이 개산공제를 「더한다」고 정하므로 미입력을 0으로 두면 **납세자에게 불리한**
 * 방향으로 조용히 과대과세된다. 분리(split) 축은 `requiresAcqStdPricePart`가 `mode !== "actual"`로
 * **이미 같은 규칙**을 적용하고 있었다 — 비-분리 단일 자산 경로만 규칙 밖이었다.
 *
 * ⚠️ 차단은 ⑤가 입력칸을 **렌더하는 범위 안에서만** 성립한다. A-11~A-13이 그 경계를 잠근다 —
 *    넓히면 「화면에 없는 칸을 채우라」는 dead-end가 된다.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md
 */
import { describe, it, expect } from "vitest";

import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function singleForm(over: Partial<AssetForm> = {}): TransferFormData {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "200,000,000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-09",
    actualSalePrice: "200,000,000",
    fixedAcquisitionPrice: "100,000,000",
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "150000000",
    ...over,
  };
  return form;
}

function bundledForm(companionOver: Partial<AssetForm>): TransferFormData {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "1,800,000,000";
  form.bundledSaleMode = "actual";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000",
  };
  form.assets.push({
    ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    actualSalePrice: "800,000,000",
    standardPriceAtAcq: "100000000",
    ...companionOver,
  } as AssetForm);
  return form;
}

const SALES_CASE = { isSalesCaseAcquisition: true, similarSalesValue: "100,000,000" } as const;
const APPRAISAL = { isAppraisalAcquisition: true } as const;

// ════════════════════════════════════════════════════════════════
// A-10 ~ A-13 — ⑧ 필수화 (Q-1 사용자 확정 2026-09-15)
// ════════════════════════════════════════════════════════════════

describe("A-10~A-13 — ⑧ 취득시 기준시가 필수", () => {
  const STD_MSG = "취득 당시 기준시가";

  it("A-10a: 매매사례 + 기준시가 미입력 → 차단(칸을 지목한다)", () => {
    const asset = singleForm({ ...SALES_CASE, standardPriceAtAcq: "" }).assets[0];
    expect(validateAssetAcquisition(asset, "자산1", "2026-02-16")).toContain(STD_MSG);
  });

  it("A-10b: 감정 + 기준시가 미입력 → 차단", () => {
    const asset = singleForm({ ...APPRAISAL, standardPriceAtAcq: "" }).assets[0];
    expect(validateAssetAcquisition(asset, "자산1", "2026-02-16")).toContain(STD_MSG);
  });

  it("A-10c: 입력하면 통과", () => {
    for (const mode of [APPRAISAL, SALES_CASE]) {
      expect(validateAssetAcquisition(singleForm(mode).assets[0], "자산1", "2026-02-16")).toBeNull();
    }
  });

  it("A-10d: 컴패니언 감정도 같은 규칙으로 차단된다", () => {
    const form = bundledForm({ ...APPRAISAL, fixedAcquisitionPrice: "700,000,000", standardPriceAtAcq: "" });
    const issues = collectStepIssues(0, form);
    expect(issues.some((i) => i.message.includes(STD_MSG) && i.assetIndex === 1)).toBe(true);
  });

  it("A-11: 🔴 **분리 취득**은 이 차단을 타지 않는다 — 파트별 검증이 담당(이중 차단·거짓 요구 금지)", () => {
    const asset = singleForm({
      ...SALES_CASE,
      standardPriceAtAcq: "",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2015-01-08",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: "50,000,000",
      buildingAcquisitionPrice: "50,000,000",
    }).assets[0];
    const err = validateAssetAcquisition(asset, "자산1", "2026-02-16");
    expect(err === null || !err.includes(STD_MSG), `err=${err}`).toBe(true);
  });

  it("A-12: PHD(§164⑤) 경로는 타지 않는다 — ④가 기준시가를 undefined로 보내는 경로다", () => {
    const asset = singleForm({
      ...APPRAISAL,
      standardPriceAtAcq: "",
      acquisitionDate: "2003-05-01",
      usePreHousingDisclosure: true,
    }).assets[0];
    const err = validateAssetAcquisition(asset, "자산1", "2026-02-16");
    expect(err === null || !err.includes(STD_MSG), `err=${err}`).toBe(true);
  });

  it("A-13: 일반건물·재개발·입주권·겸용주택은 영향 없음 (early return 경계 트립와이어)", () => {
    for (const kind of ["general_building", "redevelopment_apt", "right_to_move_in"] as const) {
      const asset = singleForm({ ...SALES_CASE, assetKind: kind, standardPriceAtAcq: "" }).assets[0];
      const err = validateAssetAcquisition(asset, "자산1", "2026-02-16");
      expect(err === null || !err.includes(STD_MSG), `${kind}: ${err}`).toBe(true);
    }
    const mixed = singleForm({ ...SALES_CASE, isMixedUseHouse: true, standardPriceAtAcq: "" }).assets[0];
    const mErr = validateAssetAcquisition(mixed, "자산1", "2026-02-16");
    expect(mErr === null || !mErr.includes(STD_MSG), `mixed: ${mErr}`).toBe(true);
  });
});
