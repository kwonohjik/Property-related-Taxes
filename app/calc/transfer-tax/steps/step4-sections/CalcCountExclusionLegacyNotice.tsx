"use client";

/**
 * ② 보유 상황 — **어느 주택인지 지정되지 않은** 옛 조특법 주택 수 제외 선언 (계산기)
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md` Q-1 · Q-3.
 * 종전 계산기는 §99의4·§98의9를 ③ 감면 패널(자산별 `reductions`)에서, 보유 감면주택을 폼 전역
 * `specialHouseExclusions`에서 받았다. 이제 입력은 명부 행 ⑥뿐이고 ⑧
 * (`transfer-tax-validate-count-exclusion.ts`)이 옛 선언을 막는다 — 이 카드가 그 차단을 푸는 경로다.
 *
 * 🔑 감지는 ⑧과 **같은 함수**(`unlinkedCountExclusionDeclarations`) — 선언이 붙은 자산이 권리면
 *    효과가 없어(V-1) 막지도 안내하지도 않는다. 명부가 보이지 않는 주택 수(1채)에서도 차단은 걸리므로
 *    명부 밖에 그린다.
 */
import { CountExclusionLegacyNotice } from "@/components/calc/transfer/CountExclusionLegacyNotice";
import {
  clearUnlinkedCountExclusions,
  countExclusionDeclarationLine,
  unlinkedCountExclusionDeclarations,
} from "@/lib/calc/house-count-exclusion-rows";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function CalcCountExclusionLegacyNotice({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  // 게이트는 감지 함수 안에 있다(선언이 붙은 자산 자신의 종류 — ⑧과 같은 함수).
  const { reductions, specials } = unlinkedCountExclusionDeclarations(form);
  return (
    <CountExclusionLegacyNotice
      lines={[...reductions, ...specials].map(countExclusionDeclarationLine)}
      onClear={() => onChange(clearUnlinkedCountExclusions(form))}
      actionLabel="계산"
    />
  );
}
