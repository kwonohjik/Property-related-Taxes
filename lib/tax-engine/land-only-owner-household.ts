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
 */
import { revokeOneHouseExemption } from "./one-house/revoke-exemption";
import type { OneHouseJudgment } from "./one-house/types";
import type { TransferTaxInput } from "./types/transfer.types";

export const LAND_ONLY_OTHER_HOUSEHOLD_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 이 토지에는 1세대1주택 비과세와 " +
  "장기보유특별공제 표2(장기임대주택 거주주택 특례 포함)를 적용하지 않았습니다(「소득세법 시행령」 §154① · 조심 2008중3554).";

/** 중과가 원래 걸렸을 조합에만 단다(`transfer-tax.ts` — 다른 세대 조건을 뺀 반사실 판정). */
export const LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE =
  "토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 주택 수는 건물 소유자를 기준으로 보아 이 토지에는 " +
  "다주택 중과세율과 그에 따른 장기보유특별공제 배제를 적용하지 않았습니다(재산세과-3172 · 서면인터넷방문상담5팀-695).";

export function landOnlyBuildingOwnerOtherHousehold(
  input: Pick<TransferTaxInput, "selfOwns" | "buildingOwnerSameHousehold">,
): boolean {
  return input.selfOwns === "land_only" && input.buildingOwnerSameHousehold === false;
}

/**
 * 판정이 비과세·부분 비과세를 냈으면 거두고 고지를 단다 — 과세 판정은 그대로(표2는 `isLthdTable2SubjectAsset`이 따로 끈다).
 * §155⑳ 특례를 선언했으면 판정이 과세여도 고지한다 — 그 특례 단계를 건너뛰는 이유를 말한다(리뷰 게이트 F-1).
 */
export function revokeExemptionOnLandOnlyOtherHousehold(
  judgment: OneHouseJudgment,
  input: Pick<TransferTaxInput, "selfOwns" | "buildingOwnerSameHousehold" | "rentalHousingException">,
): { judgment: OneHouseJudgment; notice?: string } {
  if (!landOnlyBuildingOwnerOtherHousehold(input)) return { judgment };
  const settled = judgment.isExempt || judgment.isPartialExempt;
  if (!settled && input.rentalHousingException?.applyException !== true) return { judgment };
  return { judgment: settled ? revokeOneHouseExemption(judgment) : judgment, notice: LAND_ONLY_OTHER_HOUSEHOLD_NOTICE };
}
