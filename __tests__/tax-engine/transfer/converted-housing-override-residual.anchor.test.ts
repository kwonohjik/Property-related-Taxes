/**
 * F-42 Pre-Do anchor — 환산주택가격 override 가 토지분을 원/㎡ 로 왕복 절사해 합계가 새어 나간다.
 *
 * 결함 위치: `lib/tax-engine/general-building-converted-housing.ts`
 *   `applyConvertedHousingPriceOverride` —
 *     acquisitionLandPricePerSqm: Math.floor(d.convertedLand / input.landArea)
 *     acquisitionBuildingStdPrice: d.convertedBuilding
 *
 * `buildConvertedHousingDetail` 은 잔액 흡수로 `convertedLand + convertedBuilding === converted`
 * 불변식을 지킨다(파일 주석이 스스로 "잔액은 건물분이 흡수한다(토지 floor의 반대편)" 라고 적는다).
 * 그런데 override 가 토지분을 **원/㎡ 로 되돌리면서** 그 나눗셈의 잔액을 재흡수하지 않는다.
 * 하류 4곳이 다시 `floor(perSqm × landArea)` 로 복원하므로 최대 `landArea − 1` 원이 사라진다.
 *
 * ⇒ 즉 **override 경로만** 파일 자신이 규정한 잔액 흡수 정책을 이행하지 않는다.
 *   (저장소 정책: memory `feedback_floor_residual_absorption` — 안분 마지막 분기가 잔액을 흡수한다.)
 *
 * 실측(아래 픽스처): `landArea = 100` → convertedLand 4,290,569,794 · perSqm 42,905,697 ·
 *   복원 4,290,569,700 ⇒ **94원 소실**. `landArea = 317` 이면 **300원**(≈ landArea−17) 소실.
 *   같은 화면에서 안분 카드와 상세명세서 산식이 그만큼 어긋난다.
 *
 * 법령: 「소득세법」 제99조 제1항 제1호 나목 · 같은 법 시행령 제164조 제10항(최초 고시 전 취득 환산).
 *   합계 보존은 산술 불변식이라 조문 해석에 의존하지 않는다.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import {
  buildConvertedHousingDetail,
  applyConvertedHousingPriceOverride,
} from "@/lib/tax-engine/general-building-converted-housing";
import type { GeneralBuildingInput } from "@/lib/tax-engine/types/general-building.types";

const BASE: GeneralBuildingInput = {
  totalTransferPrice: 5_000_000_000,
  transferDate: new Date("2024-02-19"),
  acquisitionDate: new Date("1995-03-15"),
  landArea: 100,
  buildingArea: 300,
  buildingFootprintArea: 150,
  transferLandPricePerSqm: 40_000_000,
  transferBuildingStdPrice: 900_000_000,
  acquisitionLandPricePerSqm: 20_000_000,
  acquisitionBuildingStdPrice: 1_665_346_385,
  buildingAcquisitionCause: "purchase",
  hasFirstDisclosure: true,
  firstDisclosurePrice: 2_500_000_000,
  firstDisclosureLandPricePerSqm: 25_000_000,
  firstDisclosureBuildingStdPrice: 1_165_346_385,
} as GeneralBuildingInput;

/** override 결과로 하류가 복원하는 토지 총액 — `floor(perSqm × landArea)` */
const restoredLand = (input: GeneralBuildingInput) => {
  const o = applyConvertedHousingPriceOverride(input);
  return Math.floor((o.acquisitionLandPricePerSqm ?? 0) * input.landArea);
};

describe("F-42 환산주택가격 override — §1 합계 보존 불변식 (수정 전 실패)", () => {
  it.each([[100], [317], [263], [999]])(
    "landArea %s㎡ — 복원 토지분 + 건물분 = 환산주택가격",
    (landArea) => {
      const input = { ...BASE, landArea };
      const detail = buildConvertedHousingDetail(input)!;
      const o = applyConvertedHousingPriceOverride(input);
      expect(restoredLand(input) + (o.acquisitionBuildingStdPrice ?? 0)).toBe(detail.converted);
    },
  );

  it("landArea 100 — 소실 94원이 건물분으로 흡수된다", () => {
    const detail = buildConvertedHousingDetail(BASE)!;
    const o = applyConvertedHousingPriceOverride(BASE);
    const lost = detail.convertedLand - restoredLand(BASE);
    expect(lost).toBe(94);
    expect(o.acquisitionBuildingStdPrice).toBe(detail.convertedBuilding + lost);
  });
});

describe("F-42 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("토지 원/㎡ 는 종전과 동일 — 잔액만 건물분으로 옮긴다", () => {
    expect(applyConvertedHousingPriceOverride(BASE).acquisitionLandPricePerSqm).toBe(42_905_697);
  });

  it("환산 합계 자체는 변하지 않는다", () => {
    expect(buildConvertedHousingDetail(BASE)!.converted).toBe(7_863_212_243);
  });

  it("나눗셈이 딱 떨어지면 흡수할 잔액이 없다", () => {
    // convertedLand 가 landArea 로 정확히 나눠떨어지는 경우 건물분이 그대로여야 한다
    const detail = buildConvertedHousingDetail(BASE)!;
    const exactArea = 1; // landArea 1 이면 나머지 0
    const input = { ...BASE, landArea: exactArea };
    const d2 = buildConvertedHousingDetail(input)!;
    const o = applyConvertedHousingPriceOverride(input);
    expect(d2.convertedLand % exactArea).toBe(0);
    expect(o.acquisitionBuildingStdPrice).toBe(d2.convertedBuilding);
    expect(detail.converted).toBeGreaterThan(0);
  });

  it("환산 대상이 아니면 입력을 그대로 돌려준다", () => {
    const notApplicable = { ...BASE, hasFirstDisclosure: false } as GeneralBuildingInput;
    expect(applyConvertedHousingPriceOverride(notApplicable)).toBe(notApplicable);
  });
});
