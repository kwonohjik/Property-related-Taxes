/**
 * 재개발·재건축 자산(§166 — 완공 아파트·원조합원 입주권, 승계 완공 아파트 포함) — 이전 입력 형식 「필요경비」(`directExpenses`)가
 * **계산에 쓰이지 않는다** (⑤ 안내 · ⑧ 차단이 같은 술어를 읽는다).
 *
 * 계획서 `docs/02-design/features/redev-transfer-expense-residual.plan.md` Q-1 a.
 *
 * ④는 옛 칸을 `expenses`로 보내지만(`transfer-tax-api.ts` · 컴패니언 `transfer-tax-api-companion-payload.ts`) 재개발 산식은
 * `redevelopment` 서브객체의 칸(인가전 분 필요경비 · 자본적지출 · 양도비)만 읽는다 — 단건·함께 양도·부담부증여·이월과세 모두 값이 침묵 누락된다(실측).
 * 옛 칸은 자본적지출과 양도비가 섞인 금액이라 인가 전·후 어느 칸으로 옮길지 지어내지 않고 입력자가 나눠 입력하게 한다
 * (일반건물 `gbLegacyExpenseUnused` 와 같은 교리).
 *
 * 거짓인 경우(막지 않는다):
 *  · 승계 입주권 — §166 밖이고 ④ 옛 칸이 그대로 필요경비가 된다(실측).
 *  · 자본적지출·양도비 칸에 값이 있다 — 옛 칸은 화면에서 숨는다(`AssetSectionExpense` 게이트). 숨은 칸을 지목하지 않는다.
 *
 * 분리 계산 술어(`legacyExpenseMovesToParts`)로 거르지 않는다 — 재개발 자산에 남은 「토지·건물 취득일 다름」 토글이 그 술어를 참으로 만들지만
 * 분리 ⑧은 재개발 자산에 돌지 않아 아무도 막지 않았다(실측).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-redevelopment";
import { parseAmount } from "./number-parse";
import { isRedevelopmentSec166Asset } from "./redev-acquisition-price-source";
import { redevPreApprovalExpensesUnused } from "./redev-pre-approval-acq-mode";

export function redevLegacyExpenseUnused(asset: AssetForm): boolean {
  if (!isRedevelopmentSec166Asset(asset)) return false;
  if (!parseAmount(asset.directExpenses)) return false;
  return !parseAmount(asset.capitalExpenditure) && !parseAmount(asset.transferExpense);
}

/** 옮길 칸 — 「인가전 분 필요경비」는 그 칸이 보이는 경우(원조합원 · 인가 전 실비를 쓰는 모드)에만 지목한다(`RedevelopmentBlock` 같은 조건). */
export function redevLegacyExpenseUnusedMessage(asset: AssetForm): string {
  const preApprovalField = asset.redevIsSuccessorMember !== "yes" && !redevPreApprovalExpensesUnused(asset);
  return preApprovalField
    ? `「직접 귀속 필요경비 — 이전 입력 형식」은 재개발·재건축 자산의 계산에 쓰이지 않습니다. 필요경비는 관리처분계획인가 전·후로 나누어 계산하므로(${REDEVELOPMENT.GAIN_BASE}) 금액을 「③ 취득정보 › 재개발 일정·금액」의 「인가전 분 필요경비」(인가 전 지출)와 「자본적지출」·「양도비」 칸에 나눠 입력하고 이 칸은 비우세요.`
    : "「직접 귀속 필요경비 — 이전 입력 형식」은 재개발·재건축 자산의 계산에 쓰이지 않습니다. 금액을 「자본적지출」과 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요.";
}
