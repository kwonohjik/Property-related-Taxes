/**
 * G1 — 사례 28 역방향(첫 자산이 주택부수토지 · 주택은 함께 양도) 구성의 **짝 주택** 판정(폼 기준).
 *
 * route `resolveReverseAppurtenantUnit`(`app/api/calc/transfer/bundled-reverse-appurtenant.ts`)과 같은 구성 판정이다 — 첫 자산이 토지이고
 * `landNature === "appurtenant"`, 함께 양도 자산 중 주택 계열(주택 · 겸용주택 · 재개발 완공주택)이 **일반 주택 1건뿐**일 때 그 자산.
 * (route는 겸용주택을 `mixed_use_house`로 받으므로 여기서는 `housing` + `isMixedUseHouse`를 주택 계열·겸용으로 센다.)
 *
 * ⑧(`transfer-tax-validate-asset.ts`)이 이 구성을 **막는다** — 보유 상황 단계의 1세대1주택 판정 입력(세대·거주기간·조정대상지역 등)이
 * 첫 자산이 주택일 때만 열려, 그대로 계산하면 숨은 기본값으로 주택·토지가 통째로 비과세되기 때문이다. 주택을 첫 자산으로 넣도록 안내한다.
 * (route는 API 본문으로 이 구성을 받으면 같은 사실을 주택 먼저 순서와 같게 계산한다 — 화면 경로를 열려면 보유 상황 단계의 판정 대상
 * 자산을 짝 주택으로 바꾸는 작업이 먼저다.)
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
