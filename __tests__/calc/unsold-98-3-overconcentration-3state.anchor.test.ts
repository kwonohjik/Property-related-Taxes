/**
 * 리뷰 Q-20 (2026-11-10 결정) — §98의3 수도권과밀억제권역 3-state(예·아니오·미선택) + 미선택 ⑧ 차단.
 *
 * 종전 2-state boolean 기본 OFF는 확인하지 않은 과밀 사안을 100% 감면으로 보냈다(과밀이면 60%).
 * 세액은 바뀌지 않는다 — «아니오» = 종전 false(100%), «예» = 종전 true(60%). 바뀐 것은 미선택을 막는 것이다.
 */
import { describe, it, expect } from "vitest";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset";
import { overconcentration983FromLegacy } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const form = (over: Record<string, unknown>): TransferFormData => {
  const reduction = {
    ...getReductionDefault("unsold_98_3"),
    residencyType983: "resident",
    houseType983: "purchased",
    contractDate983: "2009-06-15",
    isOutsideSeoulNotDesignated983: true,
    standardPriceAtAcquisition983: "200000000",
    standardPriceAt5Years983: "300000000",
    standardPriceAtTransfer983: "400000000",
    ...over,
  } as AssetReductionForm;
  const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2009-12-01", reductions: [reduction] };
  return { assets: [asset], transferDate: "2024-08-01" } as unknown as TransferFormData;
};

describe("Q-20 ② initial — 새 카드의 과밀 여부는 미선택(\"\")", () => {
  it("getReductionDefault('unsold_98_3').isOverconcentration983 === \"\"", () => {
    expect((getReductionDefault("unsold_98_3") as { isOverconcentration983: unknown }).isOverconcentration983).toBe("");
  });
});

describe("Q-20 ⑧ validate", () => {
  it("미선택 → 차단 (field = reduction.unsold_98_3.isOverconcentration983)", () => {
    const issue = collectStepIssues(2, form({}))[0];
    expect(issue?.message).toContain("수도권과밀억제권역에 있는지");
    expect(issue?.field).toBe("reduction.unsold_98_3.isOverconcentration983");
  });
  it("«아니오» → 과밀 질문으로 차단하지 않는다", () => {
    const issue = validateStep2Reductions(2, form({ isOverconcentration983: "no" }));
    expect(issue?.message ?? "").not.toContain("수도권과밀억제권역");
  });
  it("«예» + 면적 미입력 → 면적 차단(종전 true와 동일)", () => {
    expect(validateStep2Reductions(2, form({ isOverconcentration983: "yes" }))?.message).toContain("대지면적");
  });
});

describe("Q-20 ④ API 변환 — 엔진 boolean (엔진 무변경, 세액 불변)", () => {
  const payload = (v: string) =>
    toEngineReductions(
      [{ ...getReductionDefault("unsold_98_3"), isOverconcentration983: v, landAreaSqm983: "400", floorAreaSqm983: "120" } as AssetReductionForm],
      "purchase",
    )[0] as Record<string, unknown>;
  it("\"yes\" → true + 면적 전달 / \"no\" → false + 면적 strip / \"\" → undefined", () => {
    expect(payload("yes")).toMatchObject({ isOverconcentration983: true, landAreaSqm983: 400, floorAreaSqm983: 120 });
    const no = payload("no");
    expect(no.isOverconcentration983).toBe(false);
    expect(no.landAreaSqm983).toBeUndefined();
    expect(payload("").isOverconcentration983).toBeUndefined();
  });
  it("⑫ Zod: 변환 결과(boolean)는 통과, 3-state 문자열은 거부(엔진 경계는 boolean)", () => {
    const base = { ...payload("yes") };
    expect(reductionSchema.safeParse(base).success).toBe(true);
    expect(reductionSchema.safeParse({ ...base, isOverconcentration983: "yes" }).success).toBe(false);
  });
});

describe("Q-20 ③ normalize — 종전 저장 폼 boolean 이관", () => {
  it("true → \"yes\", false → \"\"(미선택), 없음 → \"\", 3-state는 그대로(멱등)", () => {
    expect(overconcentration983FromLegacy(true)).toBe("yes");
    expect(overconcentration983FromLegacy(false)).toBe("");
    expect(overconcentration983FromLegacy(undefined)).toBe("");
    expect(overconcentration983FromLegacy("yes")).toBe("yes");
    expect(overconcentration983FromLegacy("no")).toBe("no");
  });
  it("migrateAsset: 종전 false 폼 → 미선택 / 종전 true → yes(면적 유지) / «no»는 재정규화에도 유지", () => {
    const old = (v: unknown) =>
      migrateAsset({
        assetKind: "housing",
        acquisitionDate: "2009-12-01",
        reductions: [
          { type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: "2009-06-15", isOverconcentration983: v, landAreaSqm983: "400", floorAreaSqm983: "120" },
        ],
      });
    expect((old(false).reductions![0] as { isOverconcentration983: string }).isOverconcentration983).toBe("");
    const t = old(true).reductions![0] as { isOverconcentration983: string; landAreaSqm983: string };
    expect(t.isOverconcentration983).toBe("yes");
    expect(t.landAreaSqm983).toBe("400");
    expect((old("no").reductions![0] as { isOverconcentration983: string }).isOverconcentration983).toBe("no");
  });
});
