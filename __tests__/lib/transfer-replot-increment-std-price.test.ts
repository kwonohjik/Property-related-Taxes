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

// ── ⑥ 사이드바 안분 — L-8 실체 ─────────────────────────────────────
/**
 * 🔴 **관측되는 구성은 「당초분 + 증환지 증가분」 2자산 안분이다.**
 *
 * 증가분은 자기 「양도시 기준시가」를 입력받지 않는데, 종전 사이드바는 raw만 읽어
 * 안분 자체를 포기했다(`sale: 0, pending: true`). 반면 ④는 파생해서 엔진에 보내므로
 * **엔진은 안분하는데 화면은 아무것도 못 보여주는** 상태였다.
 *
 * ⚠️ 단건(자산 1건)에는 적용하지 않는다 — ④가 `slice(1)`에만 파생하므로 primary를
 *    파생하면 엔진이 재현할 수 없는 금액이 된다.
 */
describe("⑥ 안분 프리뷰가 증환지 파생값을 본다 (L-8)", () => {
  function seed(incExtra: Partial<AssetForm> = {}) {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        transferDate: "2005-11-01",
        contractTotalPrice: "600000000",
        bundledSaleMode: "apportioned" as const,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land" as const,
            acquisitionDate: "2005-03-01",
            standardPricePerSqmAtTransfer: "1000000",
            standardPriceAtTransfer: "100000000",
          },
          {
            ...makeDefaultAsset(2),
            assetKind: "land" as const,
            isReplotIncrement: true,
            acquisitionDate: "2005-03-01",
            transferArea: "20",
            standardPriceAtTransfer: "",     // ← 파생 대상 (1,000,000 × 20 = 20,000,000)
            ...incExtra,
          },
        ],
      },
    }));
    const { formData, result } = useCalcWizardStore.getState();
    return computeTransferPerAssetSummary(formData, result).rows;
  }

  it("증가분 칸이 비어도 파생값으로 안분한다", () => {
    const rows = seed();
    // 기준시가 1억 : 2천만 = 5 : 1 ⇒ 6억을 5억 / 1억으로 안분
    expect(rows.map((r) => r.salePrice)).toEqual([500_000_000, 100_000_000]);
  });

  it("파생 불가면 종전대로 안분하지 않는다 — 추정 금지", () => {
    const rows = seed({ transferArea: "" });
    expect(rows.every((r) => r.salePrice === 0)).toBe(true);
  });

  it("증가분이 자기 값을 직접 입력하면 그 값이 우선한다", () => {
    const rows = seed({ standardPriceAtTransfer: "20000000" });
    expect(rows.map((r) => r.salePrice)).toEqual([500_000_000, 100_000_000]);
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
