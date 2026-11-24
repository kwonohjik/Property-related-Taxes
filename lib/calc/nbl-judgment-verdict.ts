/**
 * 비사업용 토지 판정 **한 줄 결론** — 결과뷰·이력 카드·드로어의 단일 소스
 *
 * 계획서 `docs/01-plan/features/nbl-judgment-menu.ui.plan.md` §6-1 · UV-5.
 *
 * 🔑 이력 카드가 배지를 **다시 유도하지 않는다** — 술어는 여기 하나뿐이다(1주택 `one-house-judgment-verdict.ts`와 같은 이유).
 * 🔑 판정 자체는 하지 않는다 — 엔진이 낸 `isNonBusinessLand`·`areaProportioning.nonBusinessRatio`를 라벨로 옮길 뿐이다.
 *
 * 「일부 비사업용」 = `isNonBusinessLand === true` 이면서 면적 안분 비율이 `0 < r < 1`(주택·목장·기타토지·연접 다필지의 기준면적 초과분 안분).
 * 실측: 주택 부수토지(정착 100㎡ · 수도권 밖 · 1,000㎡)는 `isNonBusinessLand=true` · `nonBusinessRatio=0.5`로 나온다.
 *
 * 🔴 이월과세(`carryover_gift`)는 A(증여자 취득일 기산)·B(수증일 기산) 두 판정이 함께 온다. 어느 쪽이 적용되는지는 이 메뉴가 정하지 않으므로
 *    두 결론이 **다르면** 한쪽을 고르지 않고 「이월과세 적용 여부에 따라 다름」으로 적는다.
 */

/** 이력 resultData는 JSON을 거쳐 오므로 필드 존재를 가정하지 않는다. */
type JudgmentLike = {
  isNonBusinessLand?: boolean;
  areaProportioning?: { nonBusinessRatio?: number } | null;
};

export type NblVerdictLabel = "사업용" | "비사업용" | "일부 비사업용" | "이월과세 적용 여부에 따라 다름";

export type NblVerdict = {
  label: NblVerdictLabel;
  tone: "emerald" | "rose" | "amber" | "violet";
  detail: string;
};

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

/** 판정 한 건 → 결론. */
export function nblVerdictOf(judgment: JudgmentLike): NblVerdict {
  if (judgment.isNonBusinessLand !== true) {
    return { label: "사업용", tone: "emerald", detail: "입력한 사실로는 사업용 토지로 판정됩니다." };
  }
  const ratio = judgment.areaProportioning?.nonBusinessRatio;
  if (typeof ratio === "number" && ratio > 0 && ratio < 1) {
    return {
      label: "일부 비사업용",
      tone: "amber",
      detail: `기준면적을 넘는 부분(전체의 ${pct(ratio)})만 비사업용으로 판정됩니다.`,
    };
  }
  return { label: "비사업용", tone: "rose", detail: "입력한 사실로는 비사업용 토지로 판정됩니다." };
}

/**
 * 저장된 `resultData`(= `NonBusinessLandJudgmentResponse` 직렬화)에서 결론을 읽는다. 판정 전(draft)이나 구 스키마면 `null`.
 * 이월과세 B 판정(`judgmentIfCarryoverExcluded`)이 있고 A와 결론이 다르면 어느 쪽도 고르지 않는다.
 */
export function nblVerdictFromResult(
  resultData: Record<string, unknown> | null | undefined,
): NblVerdict | null {
  const a = resultData?.judgment as JudgmentLike | undefined;
  if (!a || typeof a !== "object") return null;
  const verdictA = nblVerdictOf(a);
  const b = resultData?.judgmentIfCarryoverExcluded as JudgmentLike | undefined;
  if (b && typeof b === "object") {
    const verdictB = nblVerdictOf(b);
    if (verdictB.label !== verdictA.label) {
      return {
        label: "이월과세 적용 여부에 따라 다름",
        tone: "violet",
        detail: `이월과세가 적용되면 ${verdictA.label}, 적용되지 않으면 ${verdictB.label}입니다. 어느 쪽이 적용되는지는 양도소득세 계산기에서 세액 비교로 정해집니다.`,
      };
    }
  }
  return verdictA;
}

/** 이력 목록·드로어용 — 라벨만. 판정 전이나 구 스키마면 `"-"`. */
export function nblVerdictLabel(resultData: Record<string, unknown> | null | undefined): string {
  return nblVerdictFromResult(resultData)?.label ?? "-";
}
