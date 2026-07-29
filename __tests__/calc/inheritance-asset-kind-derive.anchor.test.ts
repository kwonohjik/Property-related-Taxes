import { describe, it, expect } from "vitest";
import {
  deriveEngineInheritanceAssetKind,
  deriveInheritanceHouseKind,
} from "@/lib/calc/transfer-tax-api-helpers";
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

/**
 * `deriveInheritanceHouseKind` — UI 픽커·게이팅·API 공용 단일 소스 (2026-07-30 신설).
 *
 * 이 파생을 복제하거나 raw 비교(`asset.inheritanceAssetKind === "house_individual"`)로 대체하면
 * 픽커에 "개별"이 선택돼 보이는데 그 소비처만 false가 되어 UI가 막힌다 —
 * HouseValuationSection의 3시점 일괄 계산 버튼이 초기 진입 시 미노출되던 실제 결함.
 * (이미 checked인 native radio는 다시 눌러도 change 이벤트가 나지 않아 사용자가 풀 수 없다.)
 */
describe("deriveInheritanceHouseKind — 픽커 표시값과 소비처 게이트의 단일 소스", () => {
  it("명시 선택은 그대로", () => {
    expect(deriveInheritanceHouseKind(asset({ inheritanceAssetKind: "house_individual" }))).toBe(
      "house_individual",
    );
    expect(deriveInheritanceHouseKind(asset({ inheritanceAssetKind: "house_apart" }))).toBe(
      "house_apart",
    );
  });

  it("🔴 미선택 + 동·호 없음 → house_individual (배치 버튼 게이트가 열려야 한다)", () => {
    expect(
      deriveInheritanceHouseKind(asset({ inheritanceAssetKind: "land", addressDong: "", addressHo: "" })),
    ).toBe("house_individual");
  });

  it("미선택 + 동·호 있음 → house_apart", () => {
    expect(
      deriveInheritanceHouseKind(
        asset({ inheritanceAssetKind: "land", addressDong: "101", addressHo: "1502" }),
      ),
    ).toBe("house_apart");
  });

  it("동만 있고 호가 없으면 개별 (둘 다 있어야 공동 추정)", () => {
    expect(
      deriveInheritanceHouseKind(asset({ inheritanceAssetKind: "land", addressDong: "101", addressHo: "" })),
    ).toBe("house_individual");
  });

  // 엔진 파생이 이 술어에 위임한다 — 주택 자산에서 두 함수 결과가 항상 일치해야 한다
  it("deriveEngineInheritanceAssetKind가 주택에서 동일 결과(위임 회귀)", () => {
    for (const patch of [
      { inheritanceAssetKind: "land" as const, addressDong: "", addressHo: "" },
      { inheritanceAssetKind: "land" as const, addressDong: "101", addressHo: "1502" },
      { inheritanceAssetKind: "house_individual" as const },
      { inheritanceAssetKind: "house_apart" as const },
    ]) {
      const a = asset({ assetKind: "housing", ...patch });
      expect(deriveEngineInheritanceAssetKind(a)).toBe(deriveInheritanceHouseKind(a));
    }
  });
});
