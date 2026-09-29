/**
 * ⑧ 계산기 ② 보유 상황 — 조특법 주택 수 제외(§99의4·§98의9·보유 감면주택)
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md`. 판정 메뉴 짝:
 * `one-house-exemption-validate.ts`(같은 필수값 leaf `collectHouseCountExclusionReductionErrors`).
 *
 * - **게이트 안**(주택·재개발 아파트 양도 — `countExclusionRowsInScope`, Q-2′): 입력은 명부 행 ⑥이다.
 *   행 필수값을 행 번호로 막고, **어느 주택인지 모르는** 옛 선언을 막는다(Q-1). 옛 선언은 1채를
 *   명부와 무관하게 빼 준다 — 명부에 없는 주택을 빼는 과소과세(C6)가 그대로 남는다.
 *   해소 경로는 ② 화면의 안내 카드(「기존 선언 삭제」)다 — 입력 칸 없는 영구 차단이 아니다.
 * - **게이트 밖**: 종전 폼 전역 감면주택 섹션이 그대로 보이므로 종전 검증을 그대로 한다(D4-03).
 *   §99의4·§98의9 옛 선언은 **그 선언이 붙은 자산**이 게이트 안(함께 양도하는 주택 등)일 때만 막는다 —
 *   권리 양도 자산의 선언은 효과가 없다(V-1).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectHouseCountExclusionReductionErrors } from "./house-count-exclusion-reduction-validate";
import {
  countExclusionRowsInScope,
  rowCountExclusionReductions,
  rowSpecialHouseExclusions,
  unlinkedCountExclusionDeclarations,
} from "./house-count-exclusion-rows";

export const UNLINKED_COUNT_EXCLUSION_MESSAGE = (n: number) =>
  `주택 수 제외(조특법) 선언 ${n}건이 어느 주택인지 지정되지 않았습니다. 보유 주택 목록에서 해당 주택의 「편집」 → 「주택 수 제외(조특법)」로 다시 지정한 뒤, 안내 카드에서 기존 선언을 삭제하세요.`;

export function collectCountExclusionIssues(form: TransferFormData): string[] {
  const messages: string[] = [];

  // 옛 선언 — 게이트는 선언이 붙은 자산 자신의 종류(컴패니언 포함, V-4). 대표 자산 게이트와 따로 본다.
  const { reductions, specials } = unlinkedCountExclusionDeclarations(form);
  const n = reductions.length + specials.length;
  if (n > 0) messages.push(UNLINKED_COUNT_EXCLUSION_MESSAGE(n));

  if (!countExclusionRowsInScope(form.assets?.[0]?.assetKind)) {
    /**
     * P5 모드 2 (⑧): 보유 감면주택 행 — 조문·취득일 필수 (확인 토글은 낙관 — 엔진 불적용 사유)
     *
     * 🔴 D4-03 — 종전에는 `surchargeSuppressed`면 이 검증을 **건너뛰었다**. 그런데
     * `transfer-tax-api.ts`는 값을 그대로 전송하므로, 창 밖에서 입력한 뒤 양도일을 창
     * 안으로 옮기면 **무검증 통과**가 됐다(비대칭). 한시배제 기간에도 ⑤ 입력 경로가 열려
     * 있으므로(§89①3호 비과세는 §104⑦ 중과와 무관) skip하지 않는다.
     */
    const she = form.specialHouseExclusions ?? [];
    for (let i = 0; i < she.length; i++) {
      if (!she[i].article) {
        messages.push(`보유 감면주택 ${i + 1}: 적용 조문을 선택하세요.`);
        continue; // 행 내부는 첫 오류 1건
      }
      if (!she[i].houseAcquisitionDate && !she[i].houseContractDate)
        messages.push(`보유 감면주택 ${i + 1}: 감면주택의 취득일(또는 매매계약일)을 입력하세요.`);
    }
    return messages;
  }

  // 선언은 행 값(취득일·가액·면적)으로 채워져 온다 — 그 칸이 비면 행 기본 정보가 빈 것이다.
  const rowNo = (id: string | undefined) => (form.houses ?? []).findIndex((h) => h.id === id) + 1;
  for (const r of rowCountExclusionReductions(form.houses)) {
    for (const m of collectHouseCountExclusionReductionErrors(r)) messages.push(`보유 주택 ${rowNo(r.houseId)}: ${m}`);
  }
  for (const e of rowSpecialHouseExclusions(form.houses)) {
    if (!e.article) messages.push(`보유 주택 ${rowNo(e.houseId)}: 주택 수 제외 — 감면주택의 적용 조문을 선택하세요.`);
  }

  return messages;
}
