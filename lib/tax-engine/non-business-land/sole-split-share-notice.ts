/**
 * 축 B(같은 땅을 지분으로 나눠 취득) 토지 — 첫 지분의 취득 경위 의존 사업용 의제 선언을 이 지분에 적용하지 않았다는 「확인 필요」 고지.
 *
 * ④(`buildFractionalShareNblRecord`)는 지분의 취득원인·취득일이 첫 지분과 다르면 취득 경위에 달린 의제 선언 6종을 끄고
 * 정밀판정 입력을 싣는다(계획서 `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md` §4-2). 세액은 그 입력대로이고
 * 여기서는 바꾸지 않는다 — 꺼진 선언을 말로 밝힐 뿐이다. 지분 전부를 함께 보는 다건 엔진(`transfer-tax-aggregate-asset-records.ts`)이 부른다.
 *
 * 조건(AND): 축 B · 이 지분에 정밀판정 입력이 있음 · 첫 지분에서 켜진 6종 중 이 지분에서 꺼진 것이 있음.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { UnconditionalExemptionInput } from "./types";
import { NBL } from "../legal-codes";

const ACQUISITION_DEPENDENT: ReadonlyArray<[keyof UnconditionalExemptionInput, string]> = [
  ["isInheritedBefore2007", "2006.12.31. 이전 상속"],
  ["ownedOver20YearsBefore2007", "2006.12.31. 이전 20년 이상 소유"],
  ["isAncestor8YearFarming", "직계존속 8년 이상 재촌·자경 토지의 상속·증여"],
  ["isJongjoongOwned", "종중 소유"],
  ["isUrbanFarmlandJongjoongOrInherited", "도시지역 농지(종중·상속)"],
  ["isInong", "이농"],
];

export function nblShareExemptionWithheldNotice(
  share: Pick<TransferTaxInput, "soleSplitAcquisition" | "nonBusinessLandDetails">,
  first: Pick<TransferTaxInput, "nonBusinessLandDetails">,
): string | undefined {
  if (share.soleSplitAcquisition !== true || !share.nonBusinessLandDetails) return undefined;
  const firstU = first.nonBusinessLandDetails?.unconditionalExemption;
  const shareU = share.nonBusinessLandDetails.unconditionalExemption;
  const withheld = ACQUISITION_DEPENDENT.filter(([k]) => firstU?.[k] === true && shareU?.[k] !== true).map(([, l]) => l);
  if (withheld.length === 0) return undefined;
  return (
    `같은 토지를 지분별로 나눠 취득했고 이 지분의 취득원인·취득일이 첫 지분과 다릅니다 — 첫 지분 카드에서 선언한 ` +
    `비사업용 토지 무조건 사업용 의제(${withheld.join(" · ")} — ${NBL.UNCONDITIONAL})는 이 지분의 취득 경위에도 ` +
    `해당하는지 확인되지 않아 이 지분의 판정에는 적용하지 않았습니다 — 확인 필요.`
  );
}
