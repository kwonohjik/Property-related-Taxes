/**
 * 재개발·재건축(시행령 §166) 자산 — 이전 입력 형식 「필요경비」(`directExpenses`)는 **계산에 쓰이지 않는다** (⑤ 안내 · ⑧ 차단이 같은 술어를 읽는다).
 *
 * 계획서 `docs/02-design/features/redev-transfer-expense-residual.plan.md` Q-1 a.
 *
 * 옛 칸은 ④가 `input.expenses`로 싣지만 §166 산식은 `redevelopment` 서브객체의 인가 전·후·양도비 칸만 읽는다 — 값이 침묵 누락된다
 * (완공 APT 납부·수령·환산·승계·단독 신고, 입주권 납부·수령, 이월과세, 부담부증여, 함께 양도 둘째 자산 — 실측 전부 0 입력과 같은 세액).
 * 값의 성질(자본적지출/양도비)도 인가 전·후도 알 수 없어 어느 칸으로 옮길지 지어내지 않고 입력자가 나눠 입력하게 한다(일반건물 `gbLegacyExpenseUnused`와 같은 교리).
 *
 * 승계 입주권은 §166 서브객체가 없어 옛 칸이 반영되므로 제외한다(`isRedevelopmentSec166Asset`).
 * 자본적지출·양도비 칸에 값이 있어도 막는다 — ⑤가 이 술어로 옛 칸을 보이게 하므로 숨은 칸을 지목하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "./number-parse";
import { isRedevelopmentSec166Asset } from "./redev-acquisition-price-source";
import { redevPreApprovalExpensesUnused } from "./redev-pre-approval-acq-mode";
import { isRedevCarryoverDonorBasis } from "./redev-carryover-acq-mode";
import { isReceiveOnlyFiling } from "./redev-field-scope";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-redevelopment";

/**
 * ⑤ 안내 · ⑧ 차단 문장 — 앞 문장은 공통이고, 금액을 옮길 곳은 인가 전 분 필요경비 칸이 있는가로 가른다
 * (계획서 `docs/02-design/features/redev-legacy-expense-message-lump.plan.md` Q-1 a). 칸이 없는 개산공제 모드에서
 * 그 칸을 지목하면 같은 ④의 보라 안내(`AssetSectionExpense` — 같은 술어)와 반대가 됐다.
 * 이월과세 ② 환산은 엔진이 B를 고르면 인가 전 실비가 쓰여 개산공제 문장이 틀리므로 종전 문장을 둔다(같은 계획서 Q-2 — 별건).
 */
export function redevLegacyExpenseUnusedMessage(asset: AssetForm): string {
  const head = `「직접 귀속 필요경비 — 이전 입력 형식」은 재개발·재건축 완공 아파트와 조합원입주권에서는 계산에 쓰이지 않습니다(${REDEVELOPMENT.GAIN_BASE}). `;
  if (!redevPreApprovalExpensesUnused(asset) || isRedevCarryoverDonorBasis(asset)) {
    return head + "금액을 「자본적 지출액」과 「양도비」 칸에 나눠 입력하고(원조합원이 관리처분계획 인가 전에 쓴 비용은 「인가전 분 필요경비」) 이 칸은 비우세요.";
  }
  if (isReceiveOnlyFiling(asset)) {
    // 단독 신고 × 환산 — 인가 전 지출도 두 칸에 넣어야 §97②2호 단서 비교에 들어간다. 부담부증여는 그 비교가 없어 두 칸도 쓰이지 않는다(계획서 V-4).
    return asset.transferType === "burdened_gift"
      ? head + "필요경비는 개산공제로 계산하므로 이 칸은 비우세요."
      : head + "인가 전에 쓴 비용을 포함해 자본적 지출은 「자본적 지출액」 칸에, 양도비는 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요.";
  }
  return (
    head +
    "자본적 지출 중 관리처분계획 인가 후에 쓴 금액은 「자본적 지출액」 칸에, 양도비는 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요. " +
    "인가 전에 쓴 비용은 개산공제로 대신하므로 따로 입력하지 않습니다."
  );
}

export function redevLegacyExpenseUnused(asset: AssetForm): boolean {
  return isRedevelopmentSec166Asset(asset) && parseAmount(asset.directExpenses) > 0;
}
