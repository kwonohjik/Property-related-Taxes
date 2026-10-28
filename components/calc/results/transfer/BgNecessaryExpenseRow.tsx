/**
 * 부담부증여 §159 명세 카드 — 필요경비 줄 (단건 · 묶음 카드별 행 공용).
 *
 * 카드의 필요경비 슬롯(`perAsset.*.estimatedDeduction`)은 개산공제만이 아니라 실비(자본적지출·양도비)와 환산 단서 나목 채택분도 담는다.
 * 방식에 따라 줄이 보였다 안 보였다 하고, 단서 나목 채택 카드는 개산공제 산식에 실비 금액을 적던 것을 이 한 곳으로 모은다
 * (계획서 `bg-card-necessary-expense-row.plan.md` Q-1 a · Q-2 a · Q-3 a · Q-4 b). 판별은 엔진 echo를 읽는 leaf `bgNecessaryExpenseOf`다 — 카드가 다시 계산하지 않는다.
 * 재개발(§166) 카드는 신고서 필요경비 줄(`BgRedevFilingExpenseRows`)이 맡는다.
 *
 *  · estimated — 「개산공제 = 취득시 기준시가 × 채무비율 × 개산공제율」(의제취득일 전 카드는 의제취득일 기준시가). 적힌 산식이 적힌 값을 만든다.
 *    문구는 묶음 카드의 종전 줄과 같다(기존 단언 유지 — 조문은 인접 안내 문장이 인용한다).
 *  · actual    — 「필요경비 = (자본적지출 + 양도비) × 채무비율」(법 §97①2호·3호).
 *  · swap      — actual과 같은 값 + 환산취득가액과 개산공제의 합보다 커서 이 금액을 쓴 사유(법 §97②2호 단서).
 *  · 이월과세 증여세 상당액 산입분(법 §97의2①3호)은 별도 줄이다.
 */
import { bgNecessaryExpenseOf } from "@/lib/tax-engine/burdened-gift-totals";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");

const SINGLE_IDS = { estimated: "bg-estimated-deduction", expense: "bg-necessary-expense", carryover: "bg-carryover-gift-tax" } as const;
/** 묶음 카드별 행 — 개산공제 줄은 종전 testid를 그대로 쓴다(기존 단언 유지). */
export const BUNDLE_CARD_EXPENSE_IDS = {
  estimated: "bg-bundle-card-estimated-deduction",
  expense: "bg-bundle-card-necessary-expense",
  carryover: "bg-bundle-card-carryover-gift-tax",
} as const;

export function BgNecessaryExpenseRow({
  bg,
  ids = SINGLE_IDS,
  indent = "pl-3",
}: {
  bg: TransferBurdenedGiftBreakdown;
  ids?: { estimated: string; expense: string; carryover: string };
  indent?: string;
}) {
  const v = bgNecessaryExpenseOf(bg);
  if (!v) return null;
  const rate = `${(bg.debtRatio * 100).toFixed(4)}%`;
  const share = bg.ownershipRatio !== undefined ? "(지분분)" : "";
  const label =
    v.kind === "estimated"
      ? `${bg.preDeemed ? "개산공제 = 의제취득일 기준시가" : "개산공제 = 취득시 기준시가"}${share} ${fmt(v.stdBase)} × 채무비율 ${rate} × 개산공제율 ${(v.rate * 100).toFixed(1).replace(/\.0$/, "")}%`
      : `필요경비 = ${
          v.input ? `(자본적지출 ${fmt(v.input.capitalExpenditure)} + 양도비 ${fmt(v.input.transferExpense)})` : "자본적지출·양도비"
        }${share} × 채무비율 ${rate} (${
          v.kind === "swap"
            ? "환산취득가액과 개산공제의 합보다 커서 이 금액을 씀 — 소득세법 제97조 제2항 제2호 단서"
            : "소득세법 제97조 제1항 제2호·제3호"
        })`;
  const id = v.kind === "estimated" ? ids.estimated : ids.expense;
  return (
    <>
      {v.amount > 0 && (
        <tr data-testid={id} data-kind={v.kind}>
          <td className={`py-1 pr-2 ${indent}`}>{label}</td>
          <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(v.amount)}</td>
        </tr>
      )}
      {v.carryoverGiftTax > 0 && (
        <tr data-testid={ids.carryover}>
          <td className={`py-1 pr-2 ${indent}`}>이월과세 증여세 상당액 산입 (소득세법 제97조의2 제1항 제3호)</td>
          <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(v.carryoverGiftTax)}</td>
        </tr>
      )}
    </>
  );
}
