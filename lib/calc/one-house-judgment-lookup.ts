/**
 * 「판정 불러오기」 후보 — 저장된 1세대1주택 판정 이력 → 계산기가 고를 수 있는 형태 (P5-b-2)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.3 표 2행 · §27.6.
 *
 * ## 🔑 `candidateTo*`를 만들지 않는다
 *
 * `history-lookup-modal` 스킬의 4-레이어는 mediator에 **후보→폼 변환**(`candidateTo{Target}`)을
 * 두지만, 이 축에는 그 자리가 **이미 채워져 있다** — `applyOneHouseFactsToTransferForm`(P5-a).
 * 여기서 변환을 한 벌 더 쓰면 판정 → 계산기 경로가 **두 갈래**가 되고, 그것이 정확히
 * `transfer-resume-entry.ts` 머리 주석에 기록된 실패다(같은 진입을 카드·드로어에 복제했다가
 * 두 번 갈라졌다). ⇒ 이 파일은 **후보 목록까지만** 만들고, 적용은 P5-a 헬퍼에 넘긴다.
 *
 * ## 🔑 `warnings`가 없다 — 셀 것이 없기 때문이다
 *
 * 스킬 표준은 손상·기간초과 record를 `warnings`로 모으라고 한다. 이 축에는 **해당 모집단이
 * 존재하지 않는다**(실측):
 *
 *   · **판정 전 record가 저장되지 않는다** — `use-auto-save-calculation.ts:85-87`이
 *     `resultData`가 null이거나 `{}`이면 저장을 **skip**한다. 즉 `one_house_exemption` 이력은
 *     전부 판정을 마친 것이다. 「판정 전 draft 제외」 필터는 불가능한 시나리오에 대한 방어다.
 *   · **손상 record로 throw가 나지 않는다** — `normalizeOneHouseJudgmentForm`은 초기값 위에
 *     덮어쓰기만 하므로 어떤 입력에도 완전한 폼을 돌려준다(그 함수 주석: 구 스키마 판별을
 *     하지 않는 이유).
 *   · **기간 제한이 없다** — 판정에는 「소급 3년」 같은 창이 없다(주식 기신고 합산과 다르다).
 *
 * ⇒ 없는 사유를 만들어 두면 화면에 **영원히 0으로 남는 안내문**이 생긴다.
 *
 * ## ⛔ `excludeIds`를 받지 않는다 (재제안 금지)
 *
 * 스킬 표준의 `excludeIds`는 이 저장소에서 이미 한 번 **기각**됐다 — 이미 고른 건이 목록에서
 * 사라져 **선택 해제가 불가능**해진다(`project_stock_prior_aggregation_overwrite` ⛔절).
 *
 * 이 축에서는 더 강한 이유가 있다: 불러오기는 **치환**이라 멱등이고, 「이미 불러온 판정을
 * 다시 불러오기」가 P5-b-1이 띄우는 **`source_changed` 경고의 정규 해소 경로**다. 그 건을
 * 목록에서 빼면 사용자가 경고를 없앨 방법이 사라진다.
 */
import {
  normalizeOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { oneHouseVerdictFromResult, type OneHouseVerdict } from "./one-house-judgment-verdict";
import type { CalculationRecord } from "@/lib/storage/types";

export type OneHouseJudgmentCandidate = {
  calculationId: string;
  /** 이력 카드와 **같은 제목** — `title-generator.ts:195`가 「주소 (양도예정 YYYY-MM-DD)」로 만든다 */
  title: string;
  /** 원본 record가 마지막으로 저장된 시각(ISO) */
  updatedAt: string;
  /** 판정 배지. 구 스키마면 `null` — 그때는 **판정 내용을 말하지 않는다** */
  verdict: OneHouseVerdict | null;
  /** 판정 메뉴 폼 복원본 — 그대로 `applyOneHouseFactsToTransferForm`에 넘긴다 */
  form: OneHouseJudgmentFormData;
};

/**
 * 이력 record 목록 → 후보 목록.
 *
 * 🔑 **세목을 여기서 한 번 더 건다.** 호출부가 `list({ taxType })`로 이미 거르지만, 그 인자를
 *    빠뜨리면 양도세·상속세 record가 그대로 목록에 뜨고 `normalizeOneHouseJudgmentForm`이
 *    **그것들도 폼으로 만들어 준다**(어떤 입력에도 완전한 폼을 돌려주므로 조용히 통과한다).
 *    `detectJudgmentProvenance`가 같은 이유로 같은 가드를 둔다.
 *
 * 🔑 정렬 축은 **`updatedAt`** 이다 — 저장소의 기본 정렬은 `createdAt` 역순인데
 *    (`calculation-repository.ts:358`), 판정은 같은 주소·양도예정일이면 **제자리 갱신**된다
 *    (`business-key.ts:85`). 그래서 방금 다시 판정한 건이 `createdAt` 순서로는 아래에 깔린다.
 *    카드가 보여 주는 날짜와 정렬 축을 같은 것으로 맞춘다.
 */
export function filterOneHouseJudgmentCandidates(
  records: readonly CalculationRecord[],
): OneHouseJudgmentCandidate[] {
  return records
    .filter((r) => r.taxType === "one_house_exemption")
    .map((r) => ({
      calculationId: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
      verdict: oneHouseVerdictFromResult(r.resultData),
      /**
       * 🔑 `record.inputData`를 **그대로 넘기면 안 된다.** 자동저장이 싣는 것은 판정 폼
       *    그 자체지만(`OneHouseJudgmentCalculator.tsx:120`), 자산 마이그레이션(`migrateAsset`)과
       *    §155의2·§155의3 기본값 보정은 `normalize` 안에만 있다. 구 record가 그것을 건너뛰면
       *    계산기로 `undefined` 토글이 넘어간다.
       */
      form: normalizeOneHouseJudgmentForm(r.inputData),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
