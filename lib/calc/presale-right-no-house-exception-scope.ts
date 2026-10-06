/**
 * 분양권(`presale_right`) §104①4호 단서(영 §167의6) 확인 2종 — ⑤ UI 노출 · ④ 전송 공용 단일 소스.
 *
 * 구 소득세법 §104①4호(조정대상지역 주택분양권 50%, 2018.1.1~2021.5.31 양도분)의 단서는
 * 「1세대가 보유하고 있는 주택이 없는 경우로서 대통령령으로 정하는 경우는 제외한다」다. 영
 * §167의6이 정하는 요건은 두 가지(1호 다른 분양권 미보유, 2호 30세 이상 또는 배우자)이고,
 * 이 둘은 「세대 보유 주택 수 0채」(무주택)까지 **모두 확인**돼야 비로소 단서가 성립한다
 * (계획서 `docs/00-pm/roster-required-other-assets.plan.md` §4-4 별건 5).
 *
 * ⚠️ 영 §167의6의 **내용 있는 존재 구간**은 법 §104①4호 자체의 존재 구간(2018.1.1~2021.5.31)보다
 *    43일 좁다(2018.1.1~2018.2.12는 영 §167의6이 "삭제" 상태로 내용이 없었다 — KoreanLaw DRF
 *    efYd 실독, 2026-10-06). `PRESALE_RIGHT_CLAUSE4_PROVISO_WINDOW`가 그 좁은 구간의 단일
 *    소스이고, 엔진(`resolveShortTermRate`)도 같은 상수로 가드한다.
 *
 * UI 순서 = 판정 순서: 「세대 보유 주택 수 0채」를 먼저 확정해야(스칼라, 기존 1/2/3+ 버튼에 0을
 * 추가) 이 두 토글이 열린다 — 0채가 아니면 단서 자체가 어차피 불성립이므로 추가 확인을 물을
 * 필요가 없다(불필요한 입력 축소).
 */
import { PRESALE_RIGHT_CLAUSE4_PROVISO_WINDOW } from "@/lib/tax-engine/data/short-term-rate-history";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 양도일이 영 §167의6 단서가 내용 있게 존재하는 구간(2018.2.13~2021.5.31)에 속하는가. */
export function presaleRightClause4ProvisoEra(transferDate: string | undefined): boolean {
  if (!transferDate) return false;
  return (
    transferDate >= PRESALE_RIGHT_CLAUSE4_PROVISO_WINDOW.start &&
    transferDate <= PRESALE_RIGHT_CLAUSE4_PROVISO_WINDOW.end
  );
}

/**
 * §104①4호 단서 확인 2종(영 §167의6 1·2호) 토글을 보이는가.
 *
 * 분양권 양도 + 그 시행 구간 + 조정대상지역 + 「세대 보유 주택 수 0채」 선언까지 전부 맞아야 한다.
 */
export function presaleRightNoHouseExceptionVisible(
  form: Pick<TransferFormData, "transferDate" | "isRegulatedArea" | "householdHousingCount">,
  primaryKind: string | undefined,
): boolean {
  if (primaryKind !== "presale_right") return false;
  if (!presaleRightClause4ProvisoEra(form.transferDate)) return false;
  if (form.isRegulatedArea !== true) return false;
  return form.householdHousingCount === "0";
}
