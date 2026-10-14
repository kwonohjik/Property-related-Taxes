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
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-asset-basics";

type ReverseAppurtenantAsset = Pick<
  AssetForm,
  "assetId" | "assetKind" | "landNature" | "isMixedUseHouse" | "ownershipNumerator" | "ownershipDenominator"
>;

/**
 * 「같은 물건 지분 분할」(축 B) 묶음인가 — `Step1`이 `splitMode`를 복원하는 판정과 같은 모양이다(전 자산이 빈칸 또는 지분 < 1).
 * 빈칸을 허용하는 것은 토글 B 진입 직후(지분율을 아직 입력하지 않은) 상태를 담기 위해서다 — 함께 양도(다른 물건) 묶음의 자산은 기본 100/100이라 빈칸이 아니다.
 *
 * 이 묶음의 형제 자산은 `makeDefaultAsset(2)`라 원본 `assetKind`가 `"housing"`이다(`Step1.handleFractionalToggle`) — 같은 토지의 다른 지분이지 짝 주택이 아니다.
 */
function isFractionalSplitBundle(assets: readonly ReverseAppurtenantAsset[]): boolean {
  return (
    assets.length > 1 &&
    assets.every((a) => {
      const blank = !a.ownershipNumerator?.trim() || !a.ownershipDenominator?.trim();
      return blank || isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator);
    })
  );
}

export function reverseAppurtenantHouseAssetId(assets: readonly ReverseAppurtenantAsset[]): string | undefined {
  // 지분 분할 묶음의 형제는 짝 주택이 아니다 — 이 묶음을 역방향으로 읽으면 ⑧이 「주택을 첫 자산으로」 안내를 하는데 따를 방법이 없다(막다른 길).
  if (isFractionalSplitBundle(assets)) return undefined;
  const [primary, ...companions] = assets;
  if (!primary || primary.assetKind !== "land" || primary.landNature !== "appurtenant") return undefined;
  const houseLike = companions.filter((a) => a.assetKind === "housing" || a.assetKind === "redevelopment_apt");
  if (houseLike.length !== 1) return undefined;
  const [house] = houseLike;
  return house.assetKind === "housing" && !house.isMixedUseHouse ? house.assetId : undefined;
}
