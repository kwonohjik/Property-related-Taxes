/**
 * 화면 일체과세 배지의 한도 공유 면적 — 토지만 본인 주택 카드의 토지가 든다(§6.3 · 계획서 `bundled-land-only-limit-share.plan.md`).
 * route `appurtenantLimitShareOf`(엔진 입력 기준)와 같은 사실을 폼에서 읽는다 — 소유 범위 조건이 갈라지면 배지가 route와 다른 분리를 말한다.
 */
import { describe, expect, it } from "vitest";
import { appurtenantLimitShareOfAssets } from "@/lib/calc/housing-excess-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const house = (selfOwns?: "both" | "land_only" | "building_only", extra: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(),
  assetKind: "housing" as const,
  acquisitionArea: "200",
  transferArea: "200",
  ...(selfOwns ? { selfOwns } : {}),
  ...extra,
});
const card = { ...makeDefaultAsset(), assetKind: "land" as const, landNature: "appurtenant" as const, acquisitionArea: "200", transferArea: "200" };

describe("appurtenantLimitShareOfAssets — 주택 카드 토지 면적을 세는 소유 범위", () => {
  it("both · 미지정 · land_only는 주택 카드 토지 200㎡를 세고, building_only는 세지 않는다", () => {
    expect(appurtenantLimitShareOfAssets(house("both"), [card])).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(appurtenantLimitShareOfAssets(house(), [card])).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(appurtenantLimitShareOfAssets(house("land_only"), [card])).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(appurtenantLimitShareOfAssets(house("building_only"), [card])).toEqual({ houseLandAreaM2: undefined, appurtenantCardsAreaM2: 200 });
  });

  it("겸용주택·주택 아님은 세지 않는다(소유 분리 대상 밖)", () => {
    expect(appurtenantLimitShareOfAssets(house("land_only", { isMixedUseHouse: true }), [card]).houseLandAreaM2).toBeUndefined();
    expect(appurtenantLimitShareOfAssets(house("land_only", { assetKind: "land" }), [card]).houseLandAreaM2).toBeUndefined();
  });
});
