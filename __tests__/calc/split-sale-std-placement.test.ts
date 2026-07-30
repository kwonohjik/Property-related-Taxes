/**
 * `saleStdPlacement` / `needsSaleStdPart` — 양도시 기준시가 배치 술어 (전수 조합).
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §5.1 (A8)
 *
 * 이 술어가 UI 노출·validate 요구의 **단일 소스**다. 어긋나면 "입력 칸이 없는데 차단"
 * (dead-end)이 되거나, 같은 카드가 두 곳에 동시 노출돼 E2E strict mode가 깨진다.
 */
import { describe, it, expect } from "vitest";
import {
  saleStdPlacement,
  needsSaleStdPart,
  type PartAcqMode,
  type SaleStdPlacementCtx,
} from "@/lib/calc/transfer-tax-split-acq-mode";

const MODES: PartAcqMode[] = ["actual", "estimated", "appraisal", "salesCase"];
const SALE_MODES: Array<"actual" | "apportioned"> = ["actual", "apportioned"];
const OWNS: Array<SaleStdPlacementCtx["selfOwns"]> = ["both", "building_only", "land_only"];

function allCtx(): SaleStdPlacementCtx[] {
  const out: SaleStdPlacementCtx[] = [];
  for (const saleSplitMode of SALE_MODES)
    for (const landMode of MODES)
      for (const buildingMode of MODES)
        for (const selfOwns of OWNS) out.push({ saleSplitMode, landMode, buildingMode, selfOwns });
  return out;
}

describe("A8 — 배치 불변식 (전수 96조합)", () => {
  it("`saleAxis && (landPart || buildingPart)`가 참인 조합이 없다", () => {
    const violations = allCtx().filter((c) => {
      const p = saleStdPlacement(c);
      return p.saleAxis && (p.landPart || p.buildingPart);
    });
    expect(
      violations,
      "축 A와 파트 카드가 동시에 뜨면 같은 폼 필드를 두 곳에서 편집하고 testid도 중복된다",
    ).toEqual([]);
  });

  it("일괄양도는 항상 축 A — 파트 모드·소유와 무관 (안분 비율은 양도가액 축의 값)", () => {
    for (const c of allCtx().filter((x) => x.saleSplitMode === "apportioned")) {
      expect(saleStdPlacement(c)).toEqual({ saleAxis: true, landPart: false, buildingPart: false });
    }
  });

  it("구분양도는 환산 파트에만 — 비환산 파트는 엔진이 분모로 쓰지 않는다", () => {
    for (const c of allCtx().filter((x) => x.saleSplitMode === "actual")) {
      const p = saleStdPlacement(c);
      expect(p.saleAxis).toBe(false);
      if (c.landMode !== "estimated") expect(p.landPart).toBe(false);
      if (c.buildingMode !== "estimated") expect(p.buildingPart).toBe(false);
    }
  });
});

describe("소유 여부 — 비소유 파트의 양도차익은 폐기되므로 분모도 불요", () => {
  it("building_only → 토지 파트 카드 없음", () => {
    const p = saleStdPlacement({
      saleSplitMode: "actual",
      landMode: "estimated",
      buildingMode: "estimated",
      selfOwns: "building_only",
    });
    expect(p.landPart).toBe(false);
    expect(p.buildingPart).toBe(true);
  });

  it("land_only → 건물 파트 카드 없음", () => {
    const p = saleStdPlacement({
      saleSplitMode: "actual",
      landMode: "estimated",
      buildingMode: "estimated",
      selfOwns: "land_only",
    });
    expect(p.landPart).toBe(true);
    expect(p.buildingPart).toBe(false);
  });

  it("일괄양도는 비소유여도 축 A — 안분 비율에는 양쪽 기준시가가 필요하다", () => {
    const p = saleStdPlacement({
      saleSplitMode: "apportioned",
      landMode: "actual",
      buildingMode: "actual",
      selfOwns: "building_only",
    });
    expect(p.saleAxis).toBe(true);
  });
});

describe("needsSaleStdPart — UI 노출과 validate 요구가 같은 값에서 나온다", () => {
  it("전 조합에서 `노출 ⇔ 필수`가 일치한다 (dead-end 0)", () => {
    for (const c of allCtx()) {
      const p = saleStdPlacement(c);
      expect(needsSaleStdPart("land", c)).toBe(p.saleAxis || p.landPart);
      expect(needsSaleStdPart("building", c)).toBe(p.saleAxis || p.buildingPart);
    }
  });

  it("구분양도 + 양쪽 실가 → 어느 파트도 요구하지 않는다", () => {
    const c: SaleStdPlacementCtx = {
      saleSplitMode: "actual",
      landMode: "actual",
      buildingMode: "actual",
      selfOwns: "both",
    };
    expect(needsSaleStdPart("land", c)).toBe(false);
    expect(needsSaleStdPart("building", c)).toBe(false);
  });
});
