/**
 * G1 — 사례 28 역방향(첫 자산이 주택부수토지 · 주택은 함께 양도) 구성의 **짝 주택** 판정(폼 기준).
 *
 * route `resolveReverseAppurtenantUnit`(`app/api/calc/transfer/bundled-reverse-appurtenant.ts`)과 같은 구성 판정이다 — 첫 자산이 토지이고
 * `landNature === "appurtenant"`, 함께 양도 자산 중 주택 계열(주택 · 겸용주택 · 재개발 완공주택)이 **일반 주택 1건뿐**일 때 그 자산.
 * (route는 겸용주택을 `mixed_use_house`로 받으므로 여기서는 `housing` + `isMixedUseHouse`를 주택 계열·겸용으로 센다.)
 * ④는 이 자산에 정착면적·소재지 구분을 싣는다 — route가 그 값으로 배율 한도를 잰다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function reverseAppurtenantHouseAssetId(
  assets: readonly Pick<AssetForm, "assetId" | "assetKind" | "landNature" | "isMixedUseHouse">[],
): string | undefined {
  const [primary, ...companions] = assets;
  if (!primary || primary.assetKind !== "land" || primary.landNature !== "appurtenant") return undefined;
  const houseLike = companions.filter((a) => a.assetKind === "housing" || a.assetKind === "redevelopment_apt");
  if (houseLike.length !== 1) return undefined;
  const [house] = houseLike;
  return house.assetKind === "housing" && !house.isMixedUseHouse ? house.assetId : undefined;
}
