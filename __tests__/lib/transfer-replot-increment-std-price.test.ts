/**
 * 증환지 증가분 「양도시 기준시가」 파생 — ⑤·⑥·④·⑧ **단일 소스** anchor.
 *
 * 같은 규칙이 세 곳에 복제돼 있었고 네 번째(⑥ 사이드바 프리뷰)가 그것을 빠뜨렸다.
 * leaf로 묶은 뒤 각 호출부가 같은 값을 보는지 고정한다.
 */
import { describe, it, expect } from "vitest";
import { replotIncrementStdPriceAtTransfer } from "@/lib/calc/replot-increment-std-price";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const primary = { standardPricePerSqmAtTransfer: "1,000,000" };

describe("leaf — 파생 조건", () => {
  it("증가분 + 당초분 ㎡당 + 면적 ⇒ 총액", () => {
    expect(
      replotIncrementStdPriceAtTransfer(
        { isReplotIncrement: true, standardPriceAtTransfer: "", transferArea: "50" },
        primary,
      ),
    ).toBe(50_000_000);
  });

  it("자기 입력값이 있으면 파생하지 않는다 — 사용자 입력 우선", () => {
    expect(
      replotIncrementStdPriceAtTransfer(
        { isReplotIncrement: true, standardPriceAtTransfer: "70,000,000", transferArea: "50" },
        primary,
      ),
    ).toBeUndefined();
  });

  it("증가분이 아니면 파생하지 않는다", () => {
    expect(
      replotIncrementStdPriceAtTransfer(
        { isReplotIncrement: false, standardPriceAtTransfer: "", transferArea: "50" },
        primary,
      ),
    ).toBeUndefined();
  });

  it("면적·㎡당 중 하나라도 비면 파생하지 않는다 — 추정 금지", () => {
    expect(
      replotIncrementStdPriceAtTransfer(
        { isReplotIncrement: true, standardPriceAtTransfer: "", transferArea: "" },
        primary,
      ),
    ).toBeUndefined();
    expect(
      replotIncrementStdPriceAtTransfer(
        { isReplotIncrement: true, standardPriceAtTransfer: "", transferArea: "50" },
        { standardPricePerSqmAtTransfer: "" },
      ),
    ).toBeUndefined();
  });
});

// ── ⑥ 사이드바 — L-8 ────────────────────────────────────────────────
describe("⑥ 사이드바 §164⑧ 프리뷰가 증환지 파생값을 본다 (L-8)", () => {
  function seed(extra: Partial<AssetForm> = {}) {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        transferDate: "2005-11-01",
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "land",
          isReplotIncrement: true,
          standardPricePerSqmAtTransfer: "1000000",
          acquisitionDate: "2005-03-01",
          transferArea: "50",
          standardPriceAtTransfer: "",       // ← 파생 대상
          standardPriceAtAcq: "50000000",
          actualSalePrice: "100000000",
          useEstimatedAcquisition: true,
          sapEnabled: true,
          sapFormula: "prev" as const,
          sapPriorStdPrice: "45000000",
          ...extra,
        }],
      },
    }));
    const { formData, result } = useCalcWizardStore.getState();
    return computeTransferPerAssetSummary(formData, result).rows[0];
  }

  it("파생값으로 §164⑧ 요건이 성립해 환산취득가액이 나온다", () => {
    // 파생 양도시 기준시가 5천만 = 취득당시 5천만 ⇒ §164⑧ 발동
    // 양도당시 = 5천만 + (5천만 − 4.5천만) × 9 ÷ 12 = 53,750,000
    // 환산취득 = 1억 × 5천만 ÷ 53,750,000
    const row = seed();
    expect(row.acqPrice).toBe(93_023_255);
    expect(row.acqPending).toBe(false);
  });

  it("파생이 불가능하면 종전대로 「계산 후 표시」", () => {
    const row = seed({ transferArea: "" });
    expect(row.acqPrice).toBe(0);
    expect(row.acqPending).toBe(true);
  });
});

// ── ⑧ validate — 같은 술어를 쓴다 ───────────────────────────────────
describe("⑧ 검증도 같은 leaf로 파생 가능성을 본다", () => {
  const form = {
    ...useCalcWizardStore.getState().formData,
    transferDate: "2005-11-01",
    bundledSaleMode: "apportioned" as const,
    assets: [
      { ...makeDefaultAsset(1), standardPricePerSqmAtTransfer: "1000000" },
      { ...makeDefaultAsset(2), isReplotIncrement: true, transferArea: "50", standardPriceAtTransfer: "" },
    ],
  };

  it("파생 가능하면 「양도시 기준시가를 입력하세요」로 막지 않는다", () => {
    const err = validateAssetEntry(form.assets[1], 1, form);
    expect(err ?? "").not.toContain("양도시 기준시가를 입력하세요");
  });

  it("면적이 없어 파생 불가면 막는다", () => {
    const f = { ...form, assets: [form.assets[0], { ...form.assets[1], transferArea: "" }] };
    expect(validateAssetEntry(f.assets[1], 1, f)).toContain("양도시 기준시가를 입력하세요");
  });
});
