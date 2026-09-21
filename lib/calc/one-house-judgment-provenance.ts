/**
 * 계산기 결과의 **출처 판정** — provenance + staleness (P5-b-1)
 *
 * 계획서 §5.3 「출처 표시」 · OH-18.
 *
 * ## 왜 이것이 필요한가 — 저장만 하고 대조하지 않으면 결함 서식지다
 *
 * P5-a가 `sourceJudgmentId`를 심었지만 **읽는 곳이 없었다**. 「사본 + 원본 식별자」를 들고
 * 다니면서 원본이 움직인 것을 아무도 보지 않는 상태는 이 저장소가 이미 한 번 크게 당한
 * 모양이다(다건 합산 — 실측 9,902,200원 과대, PR #1644).
 * ⇒ `feedback_snapshot_copy_without_staleness_detection`.
 *
 * ## 🔑 비교 축은 **하나뿐**이다 — `record.inputHash` ↔ `form.sourceJudgmentInputHash`
 *
 * 둘 다 저장소가 **같은 대상(`record.inputData`)에 대해** 계산한 값이라 잡음이 없다.
 * 다건 합산의 `detectStaleSources`(`transfer-multi-load-entry.ts`)와 **같은 규약**이다.
 *
 * ⛔ **폼 해시와 비교하지 말 것.** 두 실측 사실이 그 축을 죽인다:
 *   · 저장 시 `inputData`에 키가 덧붙는다(`use-auto-save-calculation.ts` — `buildingStdSnapshots`)
 *     ⇒ `record.inputData ≠ formData`
 *   · 편집 왕복이 **기본값 키를 덧붙인다**(`updateFormData`가 `{...state.formData, ...data}`)
 *     ⇒ **사용자가 아무것도 안 고쳐도 해시가 바뀐다**
 *   ⇒ 「로컬 편집함」과 「폼이 정규화됨」을 구분할 수 없어 정상 편집마다 오탐이 난다.
 *
 * ## 🔑 이 결과를 **store에 넣지 않는다**
 *
 * 파생값을 persist되는 store에 넣으면 `partialize`가 sessionStorage에 싣고, 계산기 자동저장
 * `inputData`를 타고 **이력 record에까지 저장된다**. 호출부의 지역 state가 정본이다.
 *
 * ## ⚠️ 감지하지 못하는 경로
 *
 * 판정 메뉴에서 **저장되지 않은** 변경(판정을 다시 돌리지 않아 자동저장이 안 돈 경우)은
 * 원리상 감지할 수 없다. 그때 방어선은 화면에 그대로 보이는 **넘겨받은 사실 카드**다
 * (`ImportedOneHouseFactsCard` — 값이 눈에 보이므로 사용자가 다름을 알아챌 수 있다).
 */
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { oneHouseVerdictLabel } from "./one-house-judgment-verdict";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

/**
 * - `fresh` — 원본 판정 record가 전달 당시 그대로다.
 * - `source_changed` — 원본이 **다시 판정돼 바뀌었다**. 아래 세액은 **넘겨받을 당시의 사실**로 계산한 것이다.
 * - `unknown` — 기준선이 없어 **판정할 수 없다**(구 세션·구 record). 추측하지 않는다.
 */
export type JudgmentProvenanceState = "fresh" | "source_changed" | "unknown";

export type JudgmentProvenance = {
  state: JudgmentProvenanceState;
  /**
   * 원본 record에서 읽은 값. **record를 못 찾으면 `null`** — 그때는 「넘겨받았다」는 사실만
   * 말하고 판정 내용은 말하지 않는다(모르는 것을 지어내지 않는다).
   */
  record: {
    calculationId: string;
    /** 판정 당시 양도(예정)일 — `taxLawVersion`에 그 값이 들어간다 */
    judgedFor: string;
    /** 원본 record가 마지막으로 저장된 시각(ISO) */
    updatedAt: string;
    /** 「비과세」·「부분 비과세」·「조건부」·「과세」 — 이력 카드·판정 화면과 **같은 술어** */
    verdictLabel: string;
  } | null;
};

/**
 * 계산기 폼에 **출처 표시를 붙일 근거가 있는가**.
 *
 * 🔑 4종 결과뷰가 **이 술어 하나**를 공유한다. 뷰마다 조건을 따로 쓰면 「단건엔 뜨는데
 *    겸용엔 안 뜨는」 상태가 조용히 생긴다(§5.9 ②).
 */
export function hasJudgmentProvenance(
  form:
    | Pick<TransferFormData, "sourceJudgmentId" | "importedOneHouseFacts">
    | null
    | undefined,
): boolean {
  /**
   * 🔴 **id만 보면 안 된다.** 판정 메뉴의 CTA는 자동저장 훅의 `savedId`를 넘기는데, 그 값은
   *    저장이 끝나야 채워진다 — 사용자가 결과 화면이 뜨자마자 누르면 `undefined`로 넘어온다.
   *    그때도 **사실은 실제로 전달됐다**. id만 게이트로 쓰면 그 경로에서 출처가 조용히 사라진다.
   *
   * 🔑 `importedOneHouseFacts`는 전달의 **직접 증거**다 — `undefined`(미전달)와
   *    「전달됐으나 두 토글이 OFF」를 구분한다(`calc-wizard-form.types.ts` 주석).
   */
  return !!form?.sourceJudgmentId || !!form?.importedOneHouseFacts;
}

/**
 * 출처 record를 읽어 staleness까지 판정한다.
 *
 * 규약은 `detectStaleSources`와 같다 — id가 없으면 `null`, record 조회 실패·삭제·세목 불일치도
 * **조용히 `null`**(throw 금지). 결과 화면이 이것 때문에 죽어서는 안 된다.
 */
export async function detectJudgmentProvenance(
  form: Pick<
    TransferFormData,
    "sourceJudgmentId" | "sourceJudgmentInputHash" | "importedOneHouseFacts"
  >,
): Promise<JudgmentProvenance | null> {
  if (!hasJudgmentProvenance(form)) return null;
  const id = form.sourceJudgmentId;

  /**
   * 🔑 **id가 없어도 「전달됐다」는 말은 한다.** 다만 원본을 짚을 수 없으므로 staleness는
   *    `unknown`이다 — 「확인할 수 없다」가 정직하고, 침묵보다 낫다.
   */
  if (!id) return { state: "unknown", record: null };

  let rec;
  try {
    rec = await calculationRepository.get(id);
  } catch {
    return { state: "unknown", record: null };
  }
  // record가 지워졌거나 세목이 다르면 — 짚을 원본이 없다.
  if (!rec || rec.taxType !== "one_house_exemption") return { state: "unknown", record: null };

  /**
   * 🔑 **기준선이 없으면 「판정 불가」다** — 폼 해시로 추측하지 않는다(머리 주석 ⛔).
   *    구 세션(P5-a 이전 전달)·구 record가 여기에 해당한다.
   */
  const state: JudgmentProvenanceState =
    !form.sourceJudgmentInputHash || !rec.inputHash
      ? "unknown"
      : rec.inputHash !== form.sourceJudgmentInputHash
        ? "source_changed"
        : "fresh";

  return {
    state,
    record: {
      calculationId: id,
      judgedFor: rec.taxLawVersion,
      updatedAt: rec.updatedAt,
      verdictLabel: oneHouseVerdictLabel(rec.resultData),
    },
  };
}

/**
 * 전달 시점의 기준선을 읽는다 — **원본 record의 `inputHash`**.
 *
 * 🔑 자동저장 훅은 `savedId`만 돌려주므로 해시는 record에서 직접 읽는다. 실패하면
 *    `undefined`를 돌려주고, 그때 나중 판정은 `unknown`이 된다 — **추측하지 않는다**.
 */
export async function readJudgmentInputHash(id: string): Promise<string | undefined> {
  try {
    return (await calculationRepository.get(id))?.inputHash;
  } catch {
    return undefined;
  }
}
