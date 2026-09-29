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

import { formatHighValueThresholdLabel } from "@/lib/tax-engine/one-house/threshold";

/** 이력 resultData는 JSON을 거쳐 오므로 필드 존재를 가정하지 않는다. */
type JudgmentLike = {
  isExempt?: boolean;
  isPartialExempt?: boolean;
  pending?: unknown[];
};

export type OneHouseVerdict = {
  label: "비과세" | "부분 비과세" | "과세";
  tone: "emerald" | "amber" | "rose";
  detail: string;
};

/**
 * 판정 배지 — 세 갈래(전액 비과세 / 부분 비과세 / 과세).
 *
 * 🔴 **「조건부」 라벨을 폐지했다**(2026-09-29 — 계획서 `one-house-judgment-temp-two-house-review.plan.md`
 *    Q-1=B). 엔진은 **입력한 양도(예정)일**로 판정하고, `pending`은 그 날짜로는 과세일 때만 생긴다.
 *    그런데 종전 배지는 pending이 있으면 「조건부」라 불러, 양도 예정일이 처분기한을 이미 넘긴
 *    사안(제보: 기한 2026-07-01 · 예정일 2026-10-22)을 조건이 남은 것처럼 보이게 했다.
 *    ⇒ 배지는 입력일 기준 결론(과세)이고, pending은 「양도일을 조정하면」 안내로만 남는다.
 *    구 이력의 「조건부」 기록도 이 술어를 거치므로 「과세」로 읽힌다(같은 사실의 정정 표기).
 *
 * @param highValueThreshold 양도일 기준 고가주택 기준금액(원) — 호출부가
 *   `resolveHighValueHouseThreshold(양도일)`로 구해 넘긴다(OH-54). 없으면(이력 목록처럼
 *   양도일을 모르는 곳) 금액을 적지 않는다 — 「12억」 리터럴은 2021-12-07 이전 양도분(9억)에서
 *   판정과 모순되는 문구가 된다.
 */
export function oneHouseVerdictOf(
  judgment: JudgmentLike,
  highValueThreshold?: number,
): OneHouseVerdict {
  if (judgment.isExempt) {
    return { label: "비과세", tone: "emerald", detail: "1세대1주택 비과세 요건을 충족합니다." };
  }
  if (judgment.isPartialExempt) {
    return {
      label: "부분 비과세",
      tone: "amber",
      detail: `고가주택이므로 ${
        highValueThreshold !== undefined
          ? `${formatHighValueThresholdLabel(highValueThreshold)} 초과분`
          : "고가주택 기준금액 초과분"
      }에 해당하는 양도차익만 과세됩니다.`,
    };
  }
  if ((judgment.pending?.length ?? 0) > 0) {
    return {
      label: "과세",
      tone: "rose",
      detail: "입력한 양도(예정)일로는 비과세 요건을 충족하지 않습니다. 아래 안내대로 양도일을 조정하면 요건을 갖출 수 있습니다.",
    };
  }
  return { label: "과세", tone: "rose", detail: "현재 입력으로는 비과세 요건을 충족하지 않습니다." };
}

/**
 * 저장된 `resultData`(= `OneHouseExemptionResponse` 직렬화)에서 배지 **전체**를 읽는다.
 * 판정 전(draft)이나 구 스키마면 `null`.
 *
 * 🔑 라벨만 필요한 곳(`oneHouseVerdictLabel`)도 **이것을 거친다** — 「불러오기 모달은
 *    emerald인데 이력 목록은 과세」처럼 라벨과 톤이 갈리는 상태를 불가능하게 만든다.
 */
export function oneHouseVerdictFromResult(
  resultData: Record<string, unknown> | null | undefined,
): OneHouseVerdict | null {
  const judgment = resultData?.judgment as JudgmentLike | undefined;
  if (!judgment || typeof judgment !== "object") return null;
  return oneHouseVerdictOf(judgment);
}

/**
 * 이력 목록·드로어용 — 라벨만. 판정 전(draft)이나 구 스키마면 `"-"`.
 */
export function oneHouseVerdictLabel(resultData: Record<string, unknown> | null | undefined): string {
  return oneHouseVerdictFromResult(resultData)?.label ?? "-";
}
