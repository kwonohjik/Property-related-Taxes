/**
 * 「함께 양도」에 같은 날 양도하는 주택이 2채 이상 묶였을 때의 차단 (소득세법 시행령 §154⑨ · 결정 #40 하위 1 가).
 *
 * 함께 양도는 명부를 **주 자산에만** 두고 컴패니언은 주 자산의 세대 주택 수를 그대로 받는다
 * (`bundled-split-helpers.ts`). 같은 날 판 주택끼리의 양도 순서(§154⑨)를 넣을 길이 없어, 명부에 상대 주택을 넣으면 둘 다 과세,
 * 비우면 둘 다 비과세(어느 순서로도 나오지 않는 값)로 계산된다. 그래서 **순서가 결론을 가를 수 있을 때**(1세대 비과세가 가능한
 * 세대이거나 조정대상지역 주택)만 막고 주택별 계산으로 안내한다. 한 계약 총액을 자동으로 나눠 주던 편의는 사라진다.
 *
 * 같은 물건을 지분으로 나눠 넣은 묶음(`isFullFractionalBundle`)은 주택 한 채라 대상이 아니다.
 */
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { isFullFractionalBundle } from "@/lib/calc/transfer-tax-api-asset-basics";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { sameDayOrderMayDecide } from "@/lib/calc/same-day-transfer-order";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 차단 사유 + 사유를 붙일 자산 인덱스(첫 번째 컴패니언 주택). 해당 없으면 null. */
export function sameDayHousingBundleIssue(
  form: Pick<TransferFormData, "assets" | "isOneHousehold" | "isRegulatedArea" | "assetSplitMode">,
): { message: string; assetIndex: number } | null {
  const assets = form.assets ?? [];
  if (assets.length < 2 || isFullFractionalBundle(assets, form.assetSplitMode)) return null;
  const housing = assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => isOneHouseExemptionAsset(asset.assetKind));
  if (housing.length < 2) return null;
  if (!sameDayOrderMayDecide(form)) return null;

  // 다건(연간 합산)이 받는 자산이면 「다건의 별도 양도 건」으로, 막는 자산(재개발 아파트·겸용주택·부담부증여·이월과세 등)이 섞이면 주택별 단건 + 칩으로 보낸다.
  const multiCan = (asset: AssetForm) =>
    validateMultiSupportedMode({ ...(form as TransferFormData), assets: [asset] }) === null;
  const allMultiCan = housing.every(({ asset }) => multiCan(asset));
  const how = allMultiCan
    ? "연간 합산(다건) 계산에서 주택마다 별도 양도 건으로 입력하고, 각 건의 「다른 보유 주택 목록」에 같은 날 양도하는 다른 주택을 넣어 양도 순서를 고르세요."
    : "주택마다 단건으로 계산하되, 각 건의 「다른 보유 주택 목록」에 같은 날 양도하는 다른 주택을 넣어 양도 순서를 고르세요(연간 합산은 별도로 합니다).";
  return {
    assetIndex: housing[1].index,
    message:
      `같은 날 양도하는 주택이 ${housing.length}채 함께양도로 묶여 있습니다. 2개 이상의 주택을 같은 날 양도하면 거주자가 선택하는 순서대로 양도한 것으로 보는데` +
      `(${TRANSFER.SAME_DAY_TRANSFER_ORDER}), 함께양도에서는 그 순서를 입력할 수 없어 비과세·중과 판정이 어긋납니다. ${how}`,
  };
}
