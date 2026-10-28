/**
 * V-3′ — 토지만 본인(`selfOwns === "land_only"`)인 주택에서 건물(주택) 소유자가 **양도일 현재 다른 세대**인 경우.
 *
 * 그 토지는 이 세대가 보유한 1주택에 딸린 토지가 아니다(「소득세법 시행령」 §154① 「1세대가 양도일 현재 국내에 1주택을 보유」).
 * 국세청 서면인터넷방문상담4팀-311(2006.02.17.): 「주택과 그 부수토지를 각각 다른 세대가 소유하다가 양도하는 경우 당해 토지는
 * … 1세대 1주택 부속토지로 보지 아니하는 것」 · 재일46014-1793(1996.07.30.): 「주택의 소유자와 세대를 달리하는 지분소유자의
 * 주택 부수토지에 대하여는 소유자별로 양도소득세가 과세」(둘 다 서면4팀-2512 본문 유사사례) · 조심 2008중3554(2009.04.28. 기각):
 * 「주택과 부수토지의 소유자가 상이하며 동일세대원이 아닌 경우 주택소유자가 아닌 다른 세대원이 양도한 부수토지는 과세됨」.
 *
 * ⇒ 1세대1주택 비과세(고가주택 12억 안분 포함)와 장기보유특별공제 표2(§95② 단서 — 「1세대 1주택(이에 딸린 토지를 포함한다)」)를
 *   적용하지 않는다. §155⑳ 거주주택 특례(「1세대가」 보유한 거주주택)도 건너뛴다(`transfer-tax.ts` STEP 2.5).
 *   미응답은 ⑧·⑫가 막는다(계획서 `carryover-phd-owner-split-residuals.plan.md` Q-2 a — 예·아니오 2택).
 *
 * 같은 세대면 1세대1주택으로 보되(재산46014-610 — 「동일세대원이 주택과 그 부수토지를 각각 소유하고 있는 경우에도 1세대가 1주택을
 * 소유하고 있는 것으로 보아」), 같은 회신은 「세대합가 이전기간」을 주택부수토지로서의 보유에서 뺀다. 나중에 취득한 토지의 보유요건은
 * G-3(`isLaterAcquiredLandExemptExcluded`)가 판정하고, 합가일은 입력받지 않아 고지만 단다(계획서 `land-only-later-land-holding.plan.md` Q-3 a).
 */
import { revokeOneHouseExemption } from "./one-house/revoke-exemption";
import type { OneHouseJudgment } from "./one-house/types";
import { calculateHoldingPeriod } from "./tax-utils";
import type { TransferTaxInput } from "./types/transfer.types";

export const LAND_ONLY_OTHER_HOUSEHOLD_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 이 토지에는 1세대1주택 비과세와 " +
  "장기보유특별공제 표2(장기임대주택 거주주택 특례 포함)를 적용하지 않았습니다(「소득세법 시행령」 §154① · 조심 2008중3554).";

/** 중과가 원래 걸렸을 조합에만 단다(`transfer-tax.ts` — 다른 세대 조건을 뺀 반사실 판정). */
export const LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 주택 수는 건물 소유자를 기준으로 보아 이 토지에는 " +
  "다주택 중과세율과 그에 따른 장기보유특별공제 배제를 적용하지 않았습니다(재산세과-3172 · 서면인터넷방문상담5팀-695).";

/** 다른 세대 토지의 단기세율(2년 미만 보유)이 주택이 아닌 일반 토지 기준으로 판정됐을 때 단다 — `landOnlyOtherHouseholdRateNotice`. */
export const LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 이 토지의 단기 양도세율(보유 2년 미만)은 「주택, 조합원입주권」이 아닌 " +
  "일반 토지 기준으로 판정했습니다(서면법규과-944 · 「소득세법 시행령」 §167의5). 이 회신은 2014.1.1. 시행 세율 사건이고, 현행 세율표에 옮긴 적용은 " +
  "같은 문언 구조에 따른 해석이라 확인이 필요합니다.";

export const LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 같은 세대라 이 토지를 그 주택의 부수토지로 보아 1세대1주택 비과세를 판정했습니다. " +
  "다만 건물 소유자와 세대를 합치기 전의 기간은 이 토지를 주택부수토지로서 보유한 기간에 들어가지 않습니다(재산46014-610). " +
  "세대를 합친 날부터 양도일까지가 「소득세법 시행령」 §154①의 보유요건에 못 미치면 비과세 대상이 아닙니다 — 세대를 합친 날은 입력받지 않았으므로 확인이 필요합니다.";

export function landOnlyBuildingOwnerOtherHousehold(
  input: Pick<TransferTaxInput, "selfOwns" | "buildingOwnerSameHousehold">,
): boolean {
  return input.selfOwns === "land_only" && input.buildingOwnerSameHousehold === false;
}

/**
 * STEP 1 — 토지만 본인 주택의 건물 소유자 세대에 따른 판정 보정.
 *
 * - 다른 세대: 판정이 비과세·부분 비과세를 냈으면 거두고 고지를 단다 — 과세 판정은 그대로(표2는 `isLthdTable2SubjectAsset`이 따로 끈다).
 *   §155⑳ 특례를 선언했으면 판정이 과세여도 고지한다 — 그 특례 단계를 건너뛰는 이유를 말한다(리뷰 게이트 F-1).
 * - 같은 세대: 판정은 그대로 두고 합가일 고지를 단다(비과세·부분 비과세 또는 §155⑳ 선언). 나중 취득 토지가 이미 G-3로 비과세에서
 *   빠졌거나 보유요건이 면제되는 단서면(`mergeNoticeSuppressed` — `landOnlyMergeNoticeSuppressed`) 말하지 않는다.
 */
export function applyLandOnlyHouseholdRule(
  judgment: OneHouseJudgment,
  input: Pick<TransferTaxInput, "selfOwns" | "buildingOwnerSameHousehold" | "rentalHousingException">,
  mergeNoticeSuppressed: boolean,
): { judgment: OneHouseJudgment; notice?: string } {
  if (input.selfOwns !== "land_only") return { judgment };
  const settled = judgment.isExempt || judgment.isPartialExempt;
  if (!settled && input.rentalHousingException?.applyException !== true) return { judgment };
  if (landOnlyBuildingOwnerOtherHousehold(input)) {
    return { judgment: settled ? revokeOneHouseExemption(judgment) : judgment, notice: LAND_ONLY_OTHER_HOUSEHOLD_NOTICE };
  }
  return mergeNoticeSuppressed ? { judgment } : { judgment, notice: LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE };
}

/**
 * 토지만 본인 — 세율 판정 입력의 취득일을 토지 취득일로 바꾼다(STEP 7 `transfer-tax.ts`와 같은 치환).
 * §155⑳ 특례의 G-3 세율 판정이 쓴다 — 특례 on/off가 같은 사실에서 같은 세율이어야 한다(계획서 `land-only-later-land-holding.plan.md` Q-1 a).
 */
export function landOnlyRateInput(input: TransferTaxInput): TransferTaxInput {
  if (input.selfOwns !== "land_only" || !input.landAcquisitionDate) return input;
  // 다른 세대 — 그 토지는 이 세대 주택의 부수토지가 아니라 일반 토지다(서면법규과-944 · 영 §167의5): 토지 취득일 · 비주택 세율.
  if (landOnlyBuildingOwnerOtherHousehold(input)) return { ...input, acquisitionDate: input.landAcquisitionDate, nonHousingForRate: true };
  // 비주택(상가·토지 등)은 주택부수토지가 아니라 토지 취득일 그대로다.
  if (input.propertyType !== "housing") return { ...input, acquisitionDate: input.landAcquisitionDate };
  // 같은 세대 — 주택부수토지로서의 보유기간 = `max(토지, 주택)`(소유자 같음과 같은 규칙 · `resolveAppurtenantLandRateBasisDate`).
  return input.landAcquisitionDate.getTime() > input.acquisitionDate.getTime() ? { ...input, acquisitionDate: input.landAcquisitionDate } : input;
}

/** 다른 세대 토지만 본인 주택의 토지 보유가 2년 미만이면 일반 토지 단기세율 고지(그 밖에는 세율 종류가 값에 닿지 않아 말하지 않는다). */
export function landOnlyOtherHouseholdRateNotice(input: TransferTaxInput): string | undefined {
  if (!landOnlyBuildingOwnerOtherHousehold(input) || input.propertyType !== "housing" || !input.landAcquisitionDate) return undefined;
  return calculateHoldingPeriod(input.landAcquisitionDate, input.transferDate).years < 2 ? LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE : undefined;
}
