/**
 * 축 B(같은 물건 지분 분할) 지분 카드가 **실제로 무엇인가** — ⑧ 자산 검증·감면 검증·⑤ 감면 패널의 단일 소스.
 *
 * 지분 카드(i > 0)는 ① 기본정보를 숨기므로 저장된 `assetKind`는 기본값 «주택»이다(`calc-wizard-asset-factory.ts`의
 * `makeDefaultAsset`). ④는 첫 카드의 물건 값을 병합해 보낸다 — 일반건물은 GB 물건-수준까지(`mergeGbPropertyLevel`),
 * 그 밖에는 `mergePrimaryBasic`. 저장값을 읽으면 일반건물 지분 카드에 주택 감면이 열리고 ⑧이 통과시키는데
 * 엔진에는 그 감면이 닿지 않았다(계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` §1.2 — 화면 실측
 * 「현재 자산: 주택」·장기임대 3/6·미분양 7/9 선택 가능).
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isFullFractionalBundle, mergePrimaryBasic } from "./transfer-tax-api-helpers";
import { mergeGbPropertyLevel } from "./transfer-tax-api-gb-shares";

export function axisBEffectiveAsset(
  form: Pick<TransferFormData, "assets" | "assetSplitMode">,
  index: number,
): AssetForm {
  const asset = form.assets[index];
  const primary = form.assets[0];
  if (index === 0 || !primary || !isFullFractionalBundle(form.assets, form.assetSplitMode)) return asset;
  return primary.assetKind === "general_building" ? mergeGbPropertyLevel(asset, primary) : mergePrimaryBasic(asset, primary);
}
