/**
 * 축 B(같은 땅을 지분으로 나눠 취득) 토지 — 첫 지분의 취득 경위 의존 사업용 의제 선언을 이 지분에 적용하지 않았다는 「확인 필요」 고지.
 *
 * ④(`buildFractionalShareNblRecord`)는 지분의 취득원인·취득일이 첫 지분과 다르면 취득 경위에 달린 의제 선언 6종을 끄고
 * 정밀판정 입력을 싣는다(계획서 `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md` §4-2). 세액은 그 입력대로이고
 * 여기서는 바꾸지 않는다 — 꺼진 선언을 말로 밝힐 뿐이다. 지분 전부를 함께 보는 다건 엔진(`transfer-tax-aggregate-asset-records.ts`)이 부른다.
 *
 * 조건(AND): 축 B · 이 지분에 정밀판정 입력이 있음 · 첫 지분에서 켜진 4종이나, 첫 지분에 적용된 상속 사유(농지·임야·목장 「상속 3년」,
 * 무조건 의제 ③1호·③4호 나목) 중 이 지분이 상속이 아니어서 빠진 것이 있음.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { UnconditionalExemptionInput } from "./types";
import { NBL } from "../legal-codes";
import { checkUnconditionalExemption } from "./unconditional-exemption";
import { getLandCategoryGroup } from "./land-category";

const ACQUISITION_DEPENDENT: ReadonlyArray<[keyof UnconditionalExemptionInput, string]> = [
  ["ownedOver20YearsBefore2007", "2006.12.31. 이전 20년 이상 소유"],
  ["isAncestor8YearFarming", "직계존속 8년 이상 재촌·자경 토지의 상속·증여"],
  ["isJongjoongOwned", "종중 소유"],
  ["isInong", "이농"],
];

/**
 * 취득원인·상속개시일로 자동 판정하는 무조건 의제 — 첫 지분에서 성립한 사유(엔진 판정)를 근거 조문으로 고른다.
 * (계획서 `docs/00-pm/nbl-unconditional-inherit-cause.plan.md` §4-3 E5)
 */
const AUTO_INHERITANCE_BASIS: ReadonlyArray<[string, string]> = [
  [NBL.UNCONDITIONAL_INHERIT_BEFORE_2007, "2006.12.31. 이전 상속 무조건 사업용 의제"],
  [NBL.UNCONDITIONAL_URBAN_FARMLAND_INHERIT, "도시지역 농지 상속 5년 무조건 사업용 의제"],
];

export function nblShareExemptionWithheldNotice(
  share: Pick<TransferTaxInput, "soleSplitAcquisition" | "nonBusinessLandDetails">,
  first: Pick<TransferTaxInput, "nonBusinessLandDetails">,
): string | undefined {
  if (share.soleSplitAcquisition !== true || !share.nonBusinessLandDetails) return undefined;
  const f = first.nonBusinessLandDetails;
  const s = share.nonBusinessLandDetails;
  const firstU = f?.unconditionalExemption;
  const shareU = s.unconditionalExemption;
  const withheld = ACQUISITION_DEPENDENT.filter(([k]) => firstU?.[k] === true && shareU?.[k] !== true).map(([, l]) => l);
  /**
   * 농지·임야·목장 「상속 3년」 — 서버 매퍼가 지분마다 취득원인·취득일(상속개시일)에서 정한다. 첫 지분에는 그 사유가
   * 적용됐는데 이 지분은 상속이 아니면, 사실로 정해진 결론이라 「확인 필요」 없이 알린다
   * (계획서 `docs/00-pm/nbl-forest-pasture-inherit-3y-cause.plan.md` §3-3 E5).
   * 상속 3년은 기간이라 3년이 지난 뒤 양도해도 첫 지분의 기간기준에 들어간다 — 상속이면 적용된 것으로 본다
   * (계획서 `docs/00-pm/nbl-farmland-inherit-inong-3y.plan.md` Q-1·Q-5. 종전에는 「양도일이 3년 전」일 때만이었다).
   * 첫 지분이 무조건 사업용 의제(Step 2)로 끝났으면 지목별 판정까지 가지 않아 상속 3년은 쓰이지 않았다.
   */
  const firstUncond = f ? checkUnconditionalExemption(f, getLandCategoryGroup(f.landType)) : undefined;
  const appliedToFirst = (start: Date | undefined) => start !== undefined && firstUncond?.isExempt !== true;
  const notInherited = [
    ...AUTO_INHERITANCE_BASIS.filter(([basis]) => firstUncond?.legalBasis === basis && s.unconditionalExemption?.inheritanceDate === undefined)
      .map(([basis, label]) => `${label}(${basis})`),
    ...(appliedToFirst(f?.farmlandDeeming?.inheritanceStartDate) && s.farmlandDeeming?.inheritanceStartDate === undefined
      ? [`상속 3년 이내 농지(${NBL.FARMLAND_INHERIT_3Y})`]
      : []),
    ...(appliedToFirst(f?.forestDetail?.forestInheritanceDate) && s.forestDetail?.forestInheritanceDate === undefined
      ? [`상속 3년 이내 임야(${NBL.FOREST_INHERIT_3Y})`]
      : []),
    ...(appliedToFirst(f?.pasture?.inheritanceDate) && s.pasture?.inheritanceDate === undefined
      ? [`상속 3년 이내 목장용지(${NBL.PASTURE_INHERIT_3Y})`]
      : []),
  ];
  if (withheld.length === 0 && notInherited.length === 0) return undefined;
  const parts = [
    withheld.length > 0
      ? `첫 지분 카드에서 선언한 비사업용 토지 무조건 사업용 의제(${withheld.join(" · ")} — ${NBL.UNCONDITIONAL})는 이 지분의 취득 경위에도 ` +
        `해당하는지 확인되지 않아 이 지분의 판정에는 적용하지 않았습니다 — 확인 필요.`
      : undefined,
    notInherited.length > 0
      ? `이 지분은 상속받은 지분이 아니어서 첫 지분에 적용된 ${notInherited.join(" · ")} 사유를 이 지분의 판정에는 적용하지 않았습니다.`
      : undefined,
  ].filter(Boolean);
  return `같은 토지를 지분별로 나눠 취득했고 이 지분의 취득원인·취득일이 첫 지분과 다릅니다 — ${parts.join(" ")}`;
}
