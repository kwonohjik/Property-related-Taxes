import { describe, it, expect } from "vitest";
import { deriveEngineInheritanceAssetKind } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 상속 자산구분 라디오 폐지 → 엔진 assetKind 파생 anchor.
 *
 * 엔진은 land(단가×면적) vs house(총액)만 구분한다. 파생은 상단 assetKind 기준:
 *  - land → "land"
 *  - housing/redevelopment → 개별/공동(inheritanceAssetKind, 미선택 시 동·호 기본)
 *  - 그 외(건물·권리·상가) → "house_apart" (총액 직수 — 안전·정확)
 * (memory: project_transfer_inherited_acquisition_ui_unification)
 */
function asset(patch: Partial<AssetForm>): AssetForm {
  return { ...makeDefaultAsset(1), ...patch };
}

describe("deriveEngineInheritanceAssetKind", () => {
  it("토지 → land (단가×면적 경로)", () => {
    expect(deriveEngineInheritanceAssetKind(asset({ assetKind: "land" }))).toBe("land");
  });

  it("주택 + 개별 선택 → house_individual", () => {
    expect(
      deriveEngineInheritanceAssetKind(
        asset({ assetKind: "housing", inheritanceAssetKind: "house_individual" }),
      ),
    ).toBe("house_individual");
  });

  it("주택 + 공동 선택 → house_apart", () => {
    expect(
      deriveEngineInheritanceAssetKind(
        asset({ assetKind: "housing", inheritanceAssetKind: "house_apart" }),
      ),
    ).toBe("house_apart");
  });

  it("주택 + 미선택(기본 land) + 동·호 없음 → house_individual (동·호 없으면 개별 기본)", () => {
    expect(
      deriveEngineInheritanceAssetKind(
        asset({ assetKind: "housing", inheritanceAssetKind: "land", addressDong: "", addressHo: "" }),
      ),
    ).toBe("house_individual");
  });

  it("주택 + 미선택 + 동·호 있음 → house_apart (공동주택 추정)", () => {
    expect(
      deriveEngineInheritanceAssetKind(
        asset({ assetKind: "housing", inheritanceAssetKind: "land", addressDong: "101", addressHo: "1502" }),
      ),
    ).toBe("house_apart");
  });

  it("재개발 아파트 → 주택 취급(house)", () => {
    expect(
      deriveEngineInheritanceAssetKind(
        asset({ assetKind: "redevelopment_apt", inheritanceAssetKind: "house_apart" }),
      ),
    ).toBe("house_apart");
  });

  it("일반건물·입주권·상가 → house_apart (신고가액 총액 직수, ×면적 없음)", () => {
    // 다건 inheritanceValuation 경로에서 land 오분류 시 발생하던 ×면적 잠재오류 방지.
    expect(deriveEngineInheritanceAssetKind(asset({ assetKind: "building" }))).toBe("house_apart");
    expect(deriveEngineInheritanceAssetKind(asset({ assetKind: "right_to_move_in" }))).toBe("house_apart");
    expect(deriveEngineInheritanceAssetKind(asset({ assetKind: "commercial_building" }))).toBe("house_apart");
  });
});
