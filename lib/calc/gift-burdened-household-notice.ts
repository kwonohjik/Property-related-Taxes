/**
 * 증여세 부담부증여 양도 경로 — 「증여자 세대가 1세대에 해당」 토글 안내·결과 고지 (1h-G1-7 · 결정 #24 B).
 *
 * 토글(`bgt.isOneHousehold`)은 엔진 필드 `isOneHousehold`(소득세법 §88 6호의 「1세대」 여부)다. 비과세 요건(1세대1주택)을
 * 묻는 질문이 아니다. 기본값 OFF를 그대로 두고(손대지 않은 값을 유리하게 쓰지 않는다 — 원칙 1), 라벨·상시 안내·
 * 결론을 가를 때만 뜨는 결과 고지로 닫는다. 고지는 증여 화면 전용이다 — 엔진 경고로 넣으면 양도세 계산기에서 일부러
 * 끈 경우에도 소음이 된다.
 *
 * ⑤(토글 설명·결과 카드)와 같은 술어를 쓴다 — 화면마다 따로 계산하면 고지가 갈린다.
 */
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { resolvePropertyType } from "@/lib/calc/gift-burdened-transfer-api";

/** 토글 아래에 **늘** 보이는 안내 — 끄면 무엇이 판정되지 않는지. */
export const GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT =
  "끄면 1세대가 아닌 것으로 보아 비과세·장기보유특별공제 표2·§155 특례를 판정하지 않습니다(확인 필요).";

/** 결과 고지 — 1세대 여부가 결론을 가를 때만. */
export const GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE =
  "증여자 세대를 1세대로 보지 않아 1세대1주택 비과세·장기보유특별공제 표2·§155 특례를 판정하지 않고 계산했습니다. " +
  "증여자 세대가 1세대에 해당하면 비과세·장기보유특별공제 판정이 달라집니다 — 확인 필요.";

/**
 * 1세대 여부가 결론을 가를 수 있는가 — 주택이고 1세대 토글이 꺼져 있으며 (주택 수 1이거나, §155① 두 취득일이 있거나, 합가일을
 * 입력했을 때). 입력이 없는 세대(주택 수 2 이상 · 특례 사실 없음)는 1세대여도 과세라 고지하지 않는다.
 */
export function giftBurdenedNotOneHouseholdNoticeNeeded(bgt: BurdenedGiftTransferTaxInput, isHousing: boolean): boolean {
  if (!isHousing || bgt.isOneHousehold === true) return false;
  const count = bgt.householdHousingCount ?? 1;
  if (count <= 1) return true;
  if (count === 2 && !!bgt.temporaryTwoHouse?.newAcquisitionDate) return true;
  return !!bgt.marriageDate || !!bgt.parentalCareMergeDate;
}

/** 결과 화면용 — 부담부증여 토글 ON 자산 하나로 고지 문구(없으면 null). */
export function giftBurdenedNotOneHouseholdNotice(item: EstateItem): string | null {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt) return null;
  const isHousing = resolvePropertyType(item.category, bgt.isHousing) === "housing";
  return giftBurdenedNotOneHouseholdNoticeNeeded(bgt, isHousing) ? GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE : null;
}
