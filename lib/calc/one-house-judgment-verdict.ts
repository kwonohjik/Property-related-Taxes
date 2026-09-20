/**
 * 1세대1주택 판정 **한 줄 결론** — 결과뷰와 이력 카드의 단일 소스 (P4-2b-3)
 *
 * ## 🔑 이력 카드가 배지를 **다시 유도하지 않는다**
 *
 * 이력 목록은 세목마다 「납부세액」 한 줄을 띄우는데, 판정 메뉴는 **세액이 없다**.
 * 그 자리에 판정을 띄우려면 결론 술어가 필요하고, 그것을 화면마다 손으로 적으면
 * 결과뷰는 「조건부」인데 이력은 「과세」인 상태가 조용히 생긴다
 * (`feedback_aggregate_display_rederives_engine_value`). ⇒ 술어는 여기 하나뿐이다.
 *
 * 🔑 **판정 자체는 하지 않는다** — 엔진이 낸 `isExempt`·`isPartialExempt`·`pending`을
 *    읽어 라벨로 옮길 뿐이다. 요건을 여기서 다시 따지는 순간 dual truth가 된다.
 */

/** 이력 resultData는 JSON을 거쳐 오므로 필드 존재를 가정하지 않는다. */
type JudgmentLike = {
  isExempt?: boolean;
  isPartialExempt?: boolean;
  pending?: unknown[];
};

export type OneHouseVerdict = {
  label: "비과세" | "부분 비과세" | "조건부" | "과세";
  tone: "emerald" | "amber" | "rose";
  detail: string;
};

/** 판정 배지 — 네 갈래(전액 비과세 / 부분 비과세 / 조건부 / 과세). */
export function oneHouseVerdictOf(judgment: JudgmentLike): OneHouseVerdict {
  if (judgment.isExempt) {
    return { label: "비과세", tone: "emerald", detail: "1세대1주택 비과세 요건을 충족합니다." };
  }
  if (judgment.isPartialExempt) {
    return {
      label: "부분 비과세",
      tone: "amber",
      detail: "고가주택이므로 12억 초과분에 해당하는 양도차익만 과세됩니다.",
    };
  }
  if ((judgment.pending?.length ?? 0) > 0) {
    return {
      label: "조건부",
      tone: "amber",
      detail: "아래 조건을 기한 내에 갖추면 비과세로 판정됩니다.",
    };
  }
  return { label: "과세", tone: "rose", detail: "현재 입력으로는 비과세 요건을 충족하지 않습니다." };
}

/**
 * 이력 목록·드로어용 — 저장된 `resultData`(= `OneHouseExemptionResponse` 직렬화)에서 라벨만.
 * 판정 전(draft)이나 구 스키마면 `"-"`.
 */
export function oneHouseVerdictLabel(resultData: Record<string, unknown> | null | undefined): string {
  const judgment = resultData?.judgment as JudgmentLike | undefined;
  if (!judgment || typeof judgment !== "object") return "-";
  return oneHouseVerdictOf(judgment).label;
}
