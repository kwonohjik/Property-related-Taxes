/**
 * 양도세 ⑫ — 의제취득일(1985.1.1.) 전 상속·증여 취득가액 원천 (PD-1).
 *
 * `transfer-tax-schema-required-refines-2a.ts`의 「PD」 구획을 옮겼다(그 파일 777줄 — 계획서
 * `pre-deemed-converted-half-input.plan.md` §3.4). ⑧ 짝은 `lib/calc/transfer-tax-validate-clause-a.ts`
 * `preDeemedConversionInputError`다.
 */
import { z } from "zod";
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { Required2aLike } from "./transfer-tax-schema-required-refines-2a";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
const positive = (v: number | undefined) => typeof v === "number" && v > 0;

/**
 * pre-deemed(1985.1.1. 전 상속·증여) 취득가액 원천 (⑧ `transfer-tax-validate-clause-a.ts` E-1).
 *
 * 원천은 5종이다: ① 상증법 평가액(`reportedValue`) · ② §164④~⑦(`inheritedHouseValuation`·
 * `commercialInheritanceValuation`·`pre1990Land`) · ③ 환산(`standardPriceAtDeemedDate` + 양도시 기준시가).
 * 모두 비면 엔진은 `max(①,②) = 0`이고 ③ 분자도 0이라 **취득가액 0**으로 계산했다(50,000,000 → 0).
 * ⑧은 ①② 없이 ③으로 가려면 「가목 확인 불가」 선언을 요구하고, ③의 분자·분모는 환산 검증이 요구한다.
 *
 * 자체 서브객체로 취득가액을 잡는 자산(일반건물·재개발·겸용·상가)과 감정가액·매매사례 모드는 제외한다
 * (취득가액의 실제 소스가 따로 있다 — ⑧ `postDeemedClauseARequiredError`의 제외 표와 같은 이유).
 */
type PreDeemedLike = Pick<
  Required2aLike,
  | "inheritedAcquisition"
  | "generalBuildingValuation"
  | "redevelopment"
  | "mixedUse"
  | "commercialBuildingValuation"
  | "acquisitionMethod"
  | "inheritedHouseValuation"
  | "commercialInheritanceValuation"
  | "pre1990Land"
  | "standardPriceAtTransfer"
> &
  Partial<Pick<Required2aLike, "propertyType" | "acquisitionCause" | "transferType" | "useEstimatedAcquisition">> & {
    isSuccessorRightToMoveIn?: boolean;
    /** 컴패니언은 `assetKind`로 온다 */
    assetKind?: string;
    burdenedGiftInfo?: { valuationMode?: string } | null;
    burdenedGiftWholeInfo?: unknown;
    ownershipRatio?: number;
    companionAssets?: ReadonlyArray<unknown>;
  };

/**
 * 시가 평가 부담부증여에서 담보평가(상증법 §66)가 이겨 취득가액이 기준시가로 강제되는가 — ⑧ `bgCollateralForcesStdAcq`와 같은 범위
 * (단독 소유 단건 주 자산만). 승자는 엔진 함수로 판정한다 — 지분·묶음이 없으면 엔진의 지분 축소가 일어나지 않아 같은 값이다.
 */
function bgCollateralWinsSingle(d: PreDeemedLike, prefix: (string | number)[]): boolean {
  if (prefix.length > 0 || d.transferType !== "burdened_gift" || d.burdenedGiftWholeInfo) return false;
  if ((d.ownershipRatio ?? 1) < 1 || (d.companionAssets?.length ?? 0) > 0) return false;
  const info = d.burdenedGiftInfo as BurdenedGiftInfo | null | undefined;
  if (info?.valuationMode !== "sangjeungbeop_market") return false;
  return computeSangjeungbeopValuation(info.landStdPriceAtTransfer, info.buildingStdPriceAtTransfer, info).selectedMode === "mortgage";
}

/** 기준시가로 평가한 부담부증여 — ③이 없고(Q-25) 의제취득일 기준시가·양도시 기준시가 누락은 엔진 fail-fast가 §159① 이유로 막는다. */
const isBgStandardValuation = (d: PreDeemedLike) =>
  d.transferType === "burdened_gift" && d.burdenedGiftInfo?.valuationMode === "sangjeungbeop_standard";
/** 입주권 × 부담부증여 × 1985 전은 범위 밖 · 차단 유지(Q-30) — 엔진 `bgBasis`가 입주권을 빼 의제취득일 기준시가 fail-fast가 걸리지 않는다. */
const isRightToMoveIn = (d: PreDeemedLike) => d.propertyType === "right_to_move_in" || d.assetKind === "right_to_move_in";

export function refinePreDeemedAcquisitionSource(
  d: PreDeemedLike,
  ctx: z.RefinementCtx,
  prefix: (string | number)[] = [],
) {
  const ia = d.inheritedAcquisition;
  if (ia?.mode !== "pre-deemed") return;
  const base = issuer(ctx);
  const issue: Issue = (path, message) => base([...prefix, ...path], message);
  const clauseA =
    positive(ia.reportedValue) || !!d.inheritedHouseValuation || !!d.commercialInheritanceValuation || !!d.pre1990Land;

  // 재개발·재건축 종전자산(상속) — ③은 §166③이고 엔진은 환산 모드에서만 쓴다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
  // ①② 없이 실가 모드면 취득가액 0 — ⑧ `redevPreDeemedEstimatedRequiredError`. 증여는 ⑧ E-1이 환산 모드에서만 걸려 제외.
  // 승계조합원(완공 아파트 `isSuccessorMember` · 승계 입주권)은 §166③ 대상이 아니다 — ⑧ `isRedev166_3PreDeemedAsset`와 같은 축.
  const redevSuccessor =
    (d.redevelopment as { isSuccessorMember?: boolean } | null | undefined)?.isSuccessorMember === true ||
    d.isSuccessorRightToMoveIn === true;
  if (
    d.redevelopment &&
    !redevSuccessor &&
    d.acquisitionCause === "inheritance" &&
    d.transferType !== "burdened_gift" &&
    !clauseA &&
    d.useEstimatedAcquisition !== true
  ) {
    issue(
      ["useEstimatedAcquisition"],
      "의제취득일(1985.1.1.) 전 상속 재개발·재건축 종전자산에 상증법 평가액·§164④~⑦ 기준시가가 없으면 §166③ 환산취득가액으로 계산합니다 — useEstimatedAcquisition을 true로 보내고 §166③ 입력을 채우세요 (소득세법 시행령 §163⑨·§166③)",
    );
    return;
  }
  if (d.generalBuildingValuation || d.redevelopment || d.mixedUse || d.commercialBuildingValuation) return;
  if (d.acquisitionMethod === "appraisal" || d.acquisitionMethod === "salesCase") return;
  // 상가 §164⑥은 ②이자 ③의 분자다(사용자 결정 A안 · 계획서 commercial-pre-deemed-converted-numerator.plan.md) — 분모(양도시 기준시가)가
  // 없으면 ③이 조용히 0이 된다. ①② 원천이 있어도 막는다(아래 clauseA 반환 전). 기준시가로 평가한 부담부증여는 ③이 없다(Q-25). ⑧ 같은 판정.
  if (
    d.commercialInheritanceValuation &&
    !isBgStandardValuation(d) &&
    // 담보 승이면 ③을 비교하지 않는다(Q-2 a · 계획서 bg-std-mode-transfer-std-required.plan.md §3.3). ⑧ 같은 범위.
    !bgCollateralWinsSingle(d, prefix) &&
    !positive(ia.standardPriceAtTransfer) &&
    !positive(d.standardPriceAtTransfer)
  ) {
    issue(
      ["inheritedAcquisition", "standardPriceAtTransfer"],
      "의제취득일(1985.1.1.) 전 상속·증여 상가는 §164⑥ 취득당시 기준시가로 환산취득가액도 비교합니다 — 양도시 기준시가를 보내세요 (소득세법 시행령 §176의2④·§164⑥)",
    );
    return;
  }
  if (clauseA) {
    // ①② 원천이 있어도 ③의 분자만 있고 분모가 없으면 ③이 조용히 비교에서 빠진다(계획서 pre-deemed-converted-half-input.plan.md F4 ·
    // ⑧ `preDeemedConversionInputError` 같은 판정). 분자 원천 = 보낸 분자 · 주택 §164⑦ · 토지 §164④(엔진이 자동 주입).
    // 분모 원천 = 엔진이 쓰는 그대로(보낸 분모 · 양도 당시 개별주택가격 · 최상위 fallback — `inheritance-acquisition-helpers.ts`).
    // 분자 없이 분모만 있는 것은 막지 않는다 — 양도시 기준시가 키는 §167의3 판정·공익수용과 함께 쓴다(Q-2). 상가는 위 규칙이 먼저 막는다.
    const house = d.inheritedHouseValuation as { housePriceAtTransfer?: number } | null | undefined;
    const numerator = positive(ia.standardPriceAtDeemedDate) || !!house || !!d.pre1990Land;
    const denominator =
      positive(ia.standardPriceAtTransfer) || positive(d.standardPriceAtTransfer) || positive(house?.housePriceAtTransfer);
    if (numerator && !denominator && !isBgStandardValuation(d) && !bgCollateralWinsSingle(d, prefix))
      issue(
        ["inheritedAcquisition", "standardPriceAtTransfer"],
        "의제취득일(1985.1.1.) 전 상속·증여 자산은 상증법 평가액·§164④~⑦ 기준시가와 함께 환산취득가액도 비교합니다 — 의제취득일 기준시가가 있으면 양도시 기준시가도 보내세요 (소득세법 시행령 §176의2④)",
      );
    return;
  }
  if (!positive(ia.standardPriceAtDeemedDate) && !(isBgStandardValuation(d) && !isRightToMoveIn(d))) {
    issue(
      ["inheritedAcquisition", "reportedValue"],
      "의제취득일(1985.1.1.) 전 상속·증여 자산은 취득가액 원천이 필요합니다 — 상증법 평가액, §164④~⑦ 기준시가, 또는 환산(의제취득일 기준시가) 중 하나를 보내세요 (소득세법 §97①1호·시행령 §163⑨·§176의2④)",
    );
    return;
  }
  // 기준시가로 평가한 부담부증여는 ③이 없다(Q-25) — 엔진 fail-fast가 §159①2호 이유로 막는다(계획서 bg-gb-std-sides-and-pre-deemed-msg.plan.md §3.2).
  if (
    !positive(ia.standardPriceAtTransfer) &&
    !positive(d.standardPriceAtTransfer) &&
    !isBgStandardValuation(d)
  )
    issue(["inheritedAcquisition", "standardPriceAtTransfer"], "의제취득일 전 상속·증여 자산의 환산취득가액은 양도시 기준시가가 필요합니다 (소득세법 시행령 §176의2④)");
}

/**
 * 컴패니언(`companionAssets[i]`) — 같은 PD-1 규칙(취득가액 리뷰 게이트 지적, 2026-09-30).
 *
 * CP-3가 컴패니언에 `inheritedAcquisition`(pre-deemed 포함) 운반을 처음 열었다. 이 호출이 없으면 같은 자산을
 * 주 자산에 두면 400, 컴패니언에 두면 **200 + 취득가액 0**이었다(379,731,000 vs 355,725,900).
 * 컴패니언 payload에는 감정·매매사례 모드(`acquisitionMethod`)가 없어 그 제외는 걸리지 않는다 — ⑧
 * `preDeemedConversionInputError`도 컴패니언은 감정·매매사례를 제외하지 않는다.
 */
export function refineCompanionPreDeemedAcquisitionSource(
  c: PreDeemedLike,
  ctx: z.RefinementCtx,
  prefix: (string | number)[],
) {
  refinePreDeemedAcquisitionSource(c, ctx, prefix);
}
