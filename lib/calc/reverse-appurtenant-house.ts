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
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isFractionalSplitEntryBundle } from "@/lib/calc/transfer-tax-api-asset-basics";

type ReverseAppurtenantAsset = Pick<
  AssetForm,
  "assetId" | "assetKind" | "landNature" | "isMixedUseHouse" | "ownershipNumerator" | "ownershipDenominator"
>;

export function reverseAppurtenantHouseAssetId(
  assets: readonly ReverseAppurtenantAsset[],
  declaredMode?: TransferFormData["assetSplitMode"],
): string | undefined {
  // 사용자가 «같은 물건 지분 분할»을 골랐으면(폼 `assetSplitMode` — #2246) 형제는 같은 물건의 다른 지분이지 짝 주택이 아니다.
  //   형제 카드의 저장 `assetKind`는 `makeDefaultAsset(2)` 기본값(`"housing"`)이고 ① 기본정보가 숨겨져 바꿀 수 없다 — ④는 첫 카드 종류로 보낸다.
  //   종전에는 지분율이 채워지면 이 묶음을 역방향으로 읽어 ⑧이 막다른 길을 냈다(계획서 `axis-b-appurtenant-land-dead-end.plan.md`).
  if (declaredMode === "fractional") return undefined;
  // 지분 분할(축 B) 토글 진입 **직후**(전 자산 지분율 빈칸)의 형제는 짝 주택이 아니다 — 형제는 `makeDefaultAsset(2)`라 원본 `assetKind`가 `"housing"`일 뿐
  // 같은 토지의 다른 지분이다. 이 묶음을 역방향으로 읽으면 ⑧이 「주택을 첫 자산으로」 안내를 하는데 따를 방법이 없다(막다른 길).
  // ⚠️ **지분율이 채워진 뒤(지분 < 1)는 건드리지 않는다** — 함께 양도 모드의 «전 자산 부분 소유»와 데이터로 구분되지 않고(구분은 `Step1`의 `splitMode`만 안다),
  //    넓게 제외하면 함께 양도 묶음을 ⑧이 풀어 숨은 기본값으로 계산한다(리뷰 M1 실측: 토지 1/2 + 주택 1/2, 계약가 11억 — 주택 먼저 0, 토지 먼저 279,477,000).
  if (isFractionalSplitEntryBundle(assets)) return undefined;
  const [primary, ...companions] = assets;
  if (!primary || primary.assetKind !== "land" || primary.landNature !== "appurtenant") return undefined;
  const houseLike = companions.filter((a) => a.assetKind === "housing" || a.assetKind === "redevelopment_apt");
  if (houseLike.length !== 1) return undefined;
  const [house] = houseLike;
  return house.assetKind === "housing" && !house.isMixedUseHouse ? house.assetId : undefined;
}
