/**
 * anchor: 부담부증여 ④ 「증여재산 평가」 상속·증여 건물 기준시가 계산기 — 주입 규칙
 *
 * ## 무엇을 잡는가
 *
 * 계산기는 건물분과 부수토지를 **따로** 내주는데, ④ 필드가 무엇의 자리인지가 자산마다 다르다.
 * 두 규칙이 **서로 반대**라 한쪽만 고정하면 나머지가 조용히 뒤집힌다:
 *
 *  · `general_building`에서 **합산하면** → 토지 이중계상(토지분은 이미 별도 산출된다)
 *  · `building`에서 **합산을 빼면**     → 부수토지 통째 누락
 *
 * 둘 다 화면에 아무 오류를 띄우지 않고 증여재산가액 C만 조용히 틀어진다. C는 채무비율의
 * 분모(소령 §159①)라 양도가액·취득가액 안분 전체가 함께 어긋난다.
 *
 * 설계: docs/02-design/features/burdened-gift-valuation-std-price-calculator.plan.md §3
 */
import { describe, it, expect } from "vitest";
import { bgGiftStdPriceLauncherSpec } from "@/lib/calc/burdened-gift-std-price-launcher";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Arg = Parameters<typeof bgGiftStdPriceLauncherSpec>[0];

const make = (over: Partial<Arg>): Arg => ({
  assetKind: "housing" as AssetForm["assetKind"],
  gbBuildingArea: "",
  gbLandArea: "",
  gbTransferLandPricePerSqm: "",
  buildingFloorArea: "",
  transferArea: "",
  standardPricePerSqmAtTransfer: "",
  ...over,
});

const BUILDING_STD = 600_000_000;
const LAND_STD = 400_000_000;

describe("A-7 general_building — 건물분 단독(부수토지 인자 무시)", () => {
  it("land 인자가 와도 건물분만 반환한다 (토지 이중계상 방지)", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "general_building" }));
    expect(spec).not.toBeNull();
    expect(spec!.compose(BUILDING_STD, LAND_STD)).toBe(BUILDING_STD);
  });

  it("land 미입력도 같은 값", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "general_building" }));
    expect(spec!.compose(BUILDING_STD, undefined)).toBe(BUILDING_STD);
  });

  it("부수토지 안내를 띄우지 않는다", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "general_building" }));
    expect(spec!.needsAppurtenantLand).toBe(false);
  });

  it("연면적 prefill은 전체(`gbBuildingArea`) — 원건물분이 아니다", () => {
    const spec = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "general_building", gbBuildingArea: "300", gbLandArea: "150" }),
    );
    expect(spec!.floorArea).toBe("300");
    expect(spec!.landAreaM2).toBe("150");
  });

  it("R-2 공시지가는 양도시 토지 공시지가(`gbTransferLandPricePerSqm`)에서 온다", () => {
    const spec = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "general_building", gbTransferLandPricePerSqm: "6215000" }),
    );
    expect(spec!.landPricePerSqm).toBe("6215000");
  });
});

describe("A-8 building — 건물 + 부수토지 합산", () => {
  it("두 값을 더한다", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "building" }));
    expect(spec).not.toBeNull();
    expect(spec!.compose(BUILDING_STD, LAND_STD)).toBe(1_000_000_000);
  });

  it("land 미입력이면 건물분만 — crash 없이 통과(경고는 UI 담당)", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "building" }));
    expect(spec!.compose(BUILDING_STD, undefined)).toBe(BUILDING_STD);
  });

  it("부수토지 안내를 띄운다", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "building" }));
    expect(spec!.needsAppurtenantLand).toBe(true);
  });

  it("연면적은 축 B(`buildingFloorArea`) · 토지면적은 축 A(`transferArea`)", () => {
    const spec = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "building", buildingFloorArea: "220", transferArea: "180" }),
    );
    expect(spec!.floorArea).toBe("220");
    expect(spec!.landAreaM2).toBe("180");
  });

  it("R-2 공시지가는 통합 기준시가 카드의 단가(`standardPricePerSqmAtTransfer`)에서 온다", () => {
    const spec = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "building", standardPricePerSqmAtTransfer: "7500000" }),
    );
    expect(spec!.landPricePerSqm).toBe("7500000");
  });

  it("🔴 R-2 구별력 — 두 자산이 서로 다른 필드를 본다(뒤바뀌면 조용히 빈 값)", () => {
    const gb = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "general_building", gbTransferLandPricePerSqm: "6215000", standardPricePerSqmAtTransfer: "7500000" }),
    )!;
    const b = bgGiftStdPriceLauncherSpec(
      make({ assetKind: "building", gbTransferLandPricePerSqm: "6215000", standardPricePerSqmAtTransfer: "7500000" }),
    )!;
    expect(gb.landPricePerSqm).toBe("6215000");
    expect(b.landPricePerSqm).toBe("7500000");
  });

  it("값이 비어도 null이 아니다 — 모달 조회 필드가 폴백이다(dead-end 금지)", () => {
    const spec = bgGiftStdPriceLauncherSpec(make({ assetKind: "building" }));
    expect(spec!.landPricePerSqm).toBe("");
  });
});

describe("A-8c 대상 밖 자산은 null (런처 미노출)", () => {
  it.each(["housing", "commercial_building", "land"] as const)("%s", (kind) => {
    expect(bgGiftStdPriceLauncherSpec(make({ assetKind: kind }))).toBeNull();
  });

  it("🔴 구별력 — 두 규칙이 서로 다른 값을 낸다(같으면 이 anchor가 무의미)", () => {
    const gb = bgGiftStdPriceLauncherSpec(make({ assetKind: "general_building" }))!;
    const b = bgGiftStdPriceLauncherSpec(make({ assetKind: "building" }))!;
    expect(gb.compose(BUILDING_STD, LAND_STD)).not.toBe(b.compose(BUILDING_STD, LAND_STD));
  });
});
