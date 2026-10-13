/**
 * 사례 28 역방향(G1) — **주 자산이 주택부수토지**(토지 · `landNature: "appurtenant_to_housing"`)이고 주택은 함께 양도 자산인 일괄양도.
 *
 * 종전에는 route가 주 자산이 주택일 때만 1세대1주택 단위 역할(F-13 `oneHouseUnitRole`)과 배율 이내·초과 분리(G-2)를 붙여, 같은 사실을
 * 토지 먼저 넣으면 토지가 일반 토지로 따로 과세됐다(실측: 주택 8억 + 토지 3억 · 한도 300㎡ — 주택 먼저 0, 토지 먼저 18,628,498).
 *
 * 사용자 결정(2026-10-13):
 * ① 첫 자산 토지도 배율 이내분과 초과분 두 항목으로 나눈다 — 컴패니언 분리와 같은 leaf(`resolveCompanionSplit` · `splitCompanionIntoTwo`)라
 *    항목 id는 `primary__appurtenant` / `primary__excess`다(컴패니언 `{assetId}__appurtenant` / `__excess` 규약).
 * ② 토지가 첫 자산이어도 「1세대1주택 단위」(함께 양도 주택 카드 + 배율 이내 토지)로 합산 판정한다 — 주택 카드에 `house` 역할.
 * ③ 배율 한도는 함께 양도 주택 카드의 토지가 먼저 쓰고, 남은 한도를 부수토지(첫 자산 토지 + 부수토지 컴패니언)가 면적 비율로 나눈다
 *    (K1 `appurtenantCardLimitShare`와 같은 규칙 — `appurtenantLimitShareOf`에 그대로 넣는다).
 *
 * 성립 조건: 주택 계열 컴패니언이 **일반 주택 1건뿐**이고 그 주택의 건물 정착면적을 안다(주 자산 주택 순서도 정착면적이 있어야 단위를 만든다 —
 * `route.ts` `primaryCtxForSplit`). 그 밖(주택 2건 이상 · 겸용주택 · 재개발 완공주택 · 정착면적 없음)은 종전대로 두고 합산 엔진이 안내한다
 * (`transfer-tax-one-house-unit.ts`).
 */
import type { z } from "zod";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { companionAssetSchema } from "@/lib/api/transfer-tax-schema-sub";
import {
  appurtenantLimitShareOf,
  resolveCompanionSplit,
  splitCompanionIntoTwo,
  type PrimarySplitContext,
} from "./bundled-companion-split";

type CompanionRawAsset = z.infer<typeof companionAssetSchema>;
type HouseCtx = NonNullable<TransferTaxItemInput["primaryContextForCompanionRate"]>;

/** 주택 계열 컴패니언 — 이 중 하나라도 일반 주택이 아니거나 2건 이상이면 짝 주택을 정하지 않는다. */
const HOUSE_LIKE_KINDS: ReadonlySet<string> = new Set(["housing", "mixed_use_house", "redevelopment_apt"]);

export interface ReverseAppurtenantUnit {
  houseAssetId: string;
  /** 짝 주택 컨텍스트(정착면적 > 0) — 첫 자산 토지·부수토지 컴패니언의 일체과세·배율 판정에 쓴다. */
  houseCtx: HouseCtx & { buildingFootprintArea: number };
  /**
   * 짝 주택의 거주기간 — 주택 카드 자신의 값, 없으면 주 자산(토지) 행의 값. 주 자산 부수토지의 `residencePeriodMonths`는 엔진에서 «주택과 공유하는
   * 거주기간»으로만 쓰인다(장특 L-1b) — 즉 이 구성에서 그 값이 곧 짝 주택의 거주기간이다. 부수토지(첫 자산 토지 · 부수토지 컴패니언)도 같은 값을 쓴다
   * (F12 — 주택 먼저 순서에서 부수토지 컴패니언이 주 자산 주택의 값을 받는 것과 같다).
   */
  houseResidenceMonths: number;
  /** 첫 자산 토지의 배율 판정 면적(㎡) — 컴패니언 `areaM2`와 같이 양도면적 우선, 없으면 취득면적. */
  primaryLandAreaM2: number | undefined;
  limitShare: Pick<PrimarySplitContext, "houseLandAreaM2" | "appurtenantCardsAreaM2">;
}

/** 역방향 단위를 찾는다. 성립하지 않으면 undefined(종전 계산). */
export function resolveReverseAppurtenantUnit(
  primary: Pick<
    TransferTaxItemInput,
    "propertyType" | "landNature" | "manualHoldingPeriodOverride" | "transferArea" | "acquisitionArea" | "residencePeriodMonths"
  >,
  companions: readonly CompanionRawAsset[],
  houseCtx: HouseCtx | undefined,
): ReverseAppurtenantUnit | undefined {
  if (primary.propertyType !== "land" || primary.landNature !== "appurtenant_to_housing") return undefined;
  const houseLike = companions.filter((c) => HOUSE_LIKE_KINDS.has(c.assetKind));
  if (houseLike.length !== 1 || houseLike[0].assetKind !== "housing") return undefined;
  const footprint = houseCtx?.buildingFootprintArea;
  if (!houseCtx || footprint === undefined || !(footprint > 0)) return undefined;
  const house = houseLike[0];
  const primaryLandAreaM2 = primary.transferArea ?? primary.acquisitionArea;
  return {
    houseAssetId: house.assetId,
    houseCtx: { ...houseCtx, buildingFootprintArea: footprint },
    houseResidenceMonths: house.residencePeriodMonths ?? primary.residencePeriodMonths,
    primaryLandAreaM2,
    limitShare: appurtenantLimitShareOf(
      // 주택 카드 토지 — ④가 함께 양도 주택에 싣는 부수토지 면적 사실(`companionHousingLand`). 주 자산 주택의 `acquisitionArea`와 같은 값이다.
      { propertyType: "housing", selfOwns: house.selfOwns, acquisitionArea: house.companionHousingLand?.landAreaM2 ?? house.acquisitionArea },
      [
        {
          assetKind: "land",
          landNature: primary.landNature,
          areaM2: primaryLandAreaM2,
          manualHoldingPeriodOverride: primary.manualHoldingPeriodOverride,
        },
        ...companions,
      ],
    ),
  };
}

/**
 * 부수토지 컴패니언이 받는 짝 주택 사실 — 주택 먼저 순서에서 주 자산 주택이 주던 값(`primaryEngineInput`)을 함께 양도 주택으로 바꾼다.
 * `buildCompanionEngineInputs`는 이 값으로만 배율 분리(`resolveCompanionSplit`)·거주기간 상속을 한다.
 */
export function reverseUnitHouseFacts(unit: ReverseAppurtenantUnit) {
  return {
    propertyType: "housing" as const,
    buildingFootprintArea: unit.houseCtx.buildingFootprintArea,
    isUrbanArea: unit.houseCtx.isUrbanArea,
    appurtenantLandZone: unit.houseCtx.appurtenantLandZone,
    residencePeriodMonths: unit.houseResidenceMonths,
  };
}

/**
 * 첫 자산 토지 → 배율 이내·초과 항목(결정 ①). 분리 판정·금액 안분은 컴패니언 부수토지와 같은 leaf다.
 * 면적이 없어 판정하지 못하면 역할 없이 한 항목으로 둔다 — 합산 엔진이 «판정 불가»로 알린다(F13-5와 같다).
 */
export function splitReversePrimaryLand(
  primaryItem: TransferTaxItemInput,
  unit: ReverseAppurtenantUnit,
  transferDate: Date,
): TransferTaxItemInput[] {
  const base: TransferTaxItemInput = {
    ...primaryItem,
    residencePeriodMonths: unit.houseResidenceMonths,
    primaryContextForCompanionRate: unit.houseCtx,
  };
  const split = resolveCompanionSplit(
    {
      assetId: "primary",
      assetLabel: primaryItem.propertyLabel ?? "",
      assetKind: "land",
      areaM2: unit.primaryLandAreaM2,
      manualHoldingPeriodOverride: primaryItem.manualHoldingPeriodOverride,
      landNature: primaryItem.landNature,
    },
    {
      buildingFootprintArea: unit.houseCtx.buildingFootprintArea,
      isUrbanArea: unit.houseCtx.isUrbanArea,
      appurtenantLandZone: unit.houseCtx.appurtenantLandZone,
      holdingMonths: unit.houseCtx.holdingMonths,
      propertyType: "housing",
      bundledSaleMode: unit.houseCtx.bundledSaleMode,
      ...unit.limitShare,
    },
    transferDate,
  );
  /**
   * 판정이 된 토지는 비사업용 토지 정밀판정 입력을 떼어 낸다 — 배율 이내분은 주택부수토지(§89①3호)이고 초과분은 비사업용 토지로
   * 정해진다(§104의3①5호, F-13 Q-2). 부수토지 컴패니언에는 애초에 그 입력이 없다(주택 먼저 순서와 같은 계산).
   */
  const decided = { ...base, nonBusinessLandDetails: undefined };
  if (split.applied) return splitCompanionIntoTwo(decided, split, unit.houseCtx);
  if (split.withinLimit) return [{ ...decided, oneHouseUnitRole: "appurtenant_land" }];
  return [base];
}
