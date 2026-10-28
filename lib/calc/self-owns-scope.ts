/**
 * 「토지·건물 소유자 다름」(`selfOwns`, 소령 §166⑥·§168②) 입력 축의 **적용 범위** 단일 소스 (M2 · 2026-09-30).
 *
 * ## 왜 필요한가 — ⑤만 자산 종류를 보고 ④·⑧은 보지 않았다
 *
 * 토글의 유일한 쓰기 지점(`AssetOwnershipSplitSection`)은 주택·건물이고 겸용주택이 아닐 때만 렌더된다.
 * 그런데 주택에서 켠 뒤 종류를 토지로 바꾸면 `selfOwns`가 남고(끄는 칸이 사라진다), ④는 자산 종류를
 * 보지 않고 전송했다. 실측(2026-09-30):
 *
 * | 경로 | 결과 |
 * |---|---|
 * | 단건 | ⑫ 「소유자 분리는 주택·건물에만」 **400** — ⑧은 통과시켰으므로 화면에서 고칠 수 없는 막다른 길 |
 * | 다건 | ⑫에 그 검사가 없어 **200** — 엔진 `calcSplitGain`은 propertyType 게이트로 무시(세액 동일) |
 *
 * ⇒ 술어를 leaf로 뽑아 ⑤·④·⑧·⑥이 **같은 것**을 쓴다(`feedback_shared_predicate_argument_parity`).
 *    범위 밖이면 저장값과 무관하게 「소유자 같음」(`both`)으로 읽는다 — 값은 지우지 않는다(종류를 되돌리면 복원).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";

/** 토지·건물 분리 계산이 가능한 자산 종류 — 엔진 `calcSplitGain`의 propertyType 게이트와 동일. */
export function isLandBuildingSplitable(assetKind: string | undefined): boolean {
  return assetKind === "housing" || assetKind === "building";
}

/** ⑤ `AssetOwnershipSplitSection` 렌더 게이트와 같은 것 — 겸용주택은 자체 4부분 안분이 축을 지배한다. */
export function selfOwnsSplitApplicable(asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse">): boolean {
  return isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

/**
 * ④·⑧·⑥이 읽는 **유효** 소유 축 — 범위 밖의 잔재는 `both`다. 범위 안이면 저장값을 **그대로** 돌려준다
 * (미설정 처리는 호출부의 종전 규칙을 바꾸지 않기 위해 각자에 둔다).
 */
export function effectiveSelfOwns(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">,
): AssetForm["selfOwns"] | undefined {
  return selfOwnsSplitApplicable(asset) ? asset.selfOwns : "both";
}

/**
 * V-3′ — 「건물(주택) 소유자가 양도일 현재 본인과 같은 세대인가」를 묻는가. 토지만 본인인 **주택**만이다(건물 자산은 1세대1주택
 * 비과세 대상이 아니다). ⑤ 노출·④ 전송·⑧ 필수가 같은 술어를 쓴다 — ⑫ `landOnlyHouseholdIssue`와 같은 범위.
 */
export function asksBuildingOwnerHousehold(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">,
): boolean {
  return asset.assetKind === "housing" && effectiveSelfOwns(asset) === "land_only";
}

/**
 * ⑧ V-3′ 미응답 오류(⑫ `landOnlyHouseholdIssue`와 같은 술어 · Q-2 a). 분리 검증(`validateSplitDirectInputs`)과
 * 그 검증 앞에서 반환하는 매매사례가액 분기(`validateAssetAcquisition`)가 함께 부른다 — 한쪽만 걸면 ⑧ 통과 ↔ ⑫ 400.
 */
export function buildingOwnerHouseholdError(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns" | "buildingOwnerSameHousehold">,
  label: string,
): string | null {
  return asksBuildingOwnerHousehold(asset) && asset.buildingOwnerSameHousehold === undefined
    ? fieldError("buildingOwnerSameHousehold", `${label}: 건물(주택) 소유자가 양도일 현재 본인과 같은 세대인지 선택하세요 (소득세법 시행령 §154①).`)
    : null;
}

/**
 * ⑧ 토지만 본인 × 같은 세대 — 세대 합가 여부(처음부터 / 합가함)와 합가일 필수(⑫ `landOnlyHouseholdMergeIssue`와 같은 술어 · 계획서
 * `land-only-household-merge-date.plan.md` Q-1 b). 합가일은 양도일 이후일 수 없다. 분리 검증과 매매사례가액 분기가 함께 부른다(⑧ 통과 ↔ ⑫ 400 방지).
 */
export function buildingOwnerMergeError(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns" | "buildingOwnerSameHousehold" | "buildingOwnerHouseholdMerged" | "buildingOwnerHouseholdMergeDate">,
  label: string,
  formTransferDate?: string,
): string | null {
  if (!asksBuildingOwnerHousehold(asset) || asset.buildingOwnerSameHousehold !== true) return null;
  if (asset.buildingOwnerHouseholdMerged === undefined) {
    return fieldError("buildingOwnerHouseholdMerged", `${label}: 같은 세대인 건물(주택) 소유자와 처음부터 같은 세대였는지, 중간에 합쳤는지 선택하세요 (재산46014-610).`);
  }
  if (asset.buildingOwnerHouseholdMerged !== true) return null;
  const date = asset.buildingOwnerHouseholdMergeDate;
  if (!date) return fieldError("buildingOwnerHouseholdMergeDate", `${label}: 세대를 합친 날을 입력하세요 (합가 이후 기간만 주택부수토지로서 보유한 기간입니다 — 재산46014-610).`);
  if (formTransferDate && date > formTransferDate) return fieldError("buildingOwnerHouseholdMergeDate", `${label}: 세대를 합친 날은 양도일 이후일 수 없습니다.`);
  return null;
}

/**
 * 토지만 본인 × 같은 세대 × 합가함 — 거주기간 산입의 시작일(합가일). 합가 이전의 거주는 «동일세대원으로서 주택의 소유자와 함께 거주한 기간»이 아니라 통산하지 않는다
 * (기준-2025-법규재산-0040 · 보유기간이 합가일부터인 것과 같은 축 — 재산46014-610). 엔진 `landOnlyHouseholdMergeDate`와 같은 조건이며, 그 밖은 `undefined`(취득일 기준 그대로).
 * ⑧ 거주 구간·직접 입력 상한과 Step4 입력 힌트가 같은 술어를 쓴다(계획서 `land-only-merge-residence-period.plan.md`).
 */
export function landOnlyMergeResidenceStart(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns" | "buildingOwnerSameHousehold" | "buildingOwnerHouseholdMerged" | "buildingOwnerHouseholdMergeDate">,
): string | undefined {
  return asksBuildingOwnerHousehold(asset) && asset.buildingOwnerSameHousehold === true && asset.buildingOwnerHouseholdMerged === true && asset.buildingOwnerHouseholdMergeDate
    ? asset.buildingOwnerHouseholdMergeDate
    : undefined;
}

/** 거주 산입 기준일 — 합가일이 `baseStart`(통상 취득일)보다 늦으면 합가일(+ `kind: "merge"`), 아니면 `baseStart` 그대로. ISO 날짜 문자열 비교. */
export function residenceStartWithMerge(
  baseStart: string,
  asset: Parameters<typeof landOnlyMergeResidenceStart>[0],
): { start: string; kind: "acquisition" | "merge" } {
  const merge = landOnlyMergeResidenceStart(asset);
  return merge !== undefined && merge > baseStart ? { start: merge, kind: "merge" } : { start: baseStart, kind: "acquisition" };
}
