/**
 * 부담부증여 × 재개발(§166) 자산 — 신고서 필요경비 줄 (묶음 카드별 행 · 단건 카드 공용).
 *
 * 명세 카드의 §159 칸은 인가 전 분뿐이라(개산공제도 그렇다) 신고서에 쓰이는 필요경비는 따로 적는다 — 신고서 취득가액 줄과 짝이다.
 * 합이 신고서 필요경비(`redevBranchTotals().expenses`)이고, 아래에 인가 전 · 인가 후 · 청산금 분으로 나눠 보인다(계획서
 * `bg-redev-card-filing-expense.plan.md` Q-2 b). 인가 전 분은 개산공제(「소득세법 시행령」 제163조 제6항)와 실제 필요경비의 택일이다.
 * 0원인 분기는 줄을 그리지 않는다. 카드가 다시 계산하지 않는다 — 값은 엔진 echo(`RedevExpenseParts`)다.
 */
import type { RedevExpenseParts } from "@/lib/tax-engine/redev-acquisition-inverse";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const ACTUAL_BASIS = "자본적지출·양도비 — 「소득세법」 제97조 제1항 제2호·제3호";

export function BgRedevFilingExpenseRows({ parts }: { parts: RedevExpenseParts }) {
  const total = parts.preApproval + parts.postApproval + parts.settlement;
  if (total <= 0) return null;
  // 인가 전 분 합에 이월과세 증여세 상당액이 들어 있으면 택일 몫(개산공제 또는 실비)과 따로 보인다.
  const giftTax = parts.preApprovalGiftTax ?? 0;
  const rows: Array<{ id: string; label: string; amount: number }> = [
    {
      id: "pre",
      label: parts.preApprovalKind === "estimated" ? "인가 전 분 — 개산공제 (「소득세법 시행령」 제163조 제6항)" : `인가 전 분 — ${ACTUAL_BASIS}`,
      amount: parts.preApproval - giftTax,
    },
    { id: "gift", label: "인가 전 분 — 이월과세 증여세 상당액 (「소득세법」 제97조의2 제1항 제3호)", amount: giftTax },
    { id: "post", label: `인가 후 분 — ${ACTUAL_BASIS}`, amount: parts.postApproval },
    { id: "settlement", label: `청산금 분 — ${ACTUAL_BASIS}`, amount: parts.settlement },
  ];
  return (
    <>
      <tr data-testid="bg-redev-filing-expense">
        <td className="py-1 pr-2 pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-400">
          신고서 필요경비 (인가 전 분은 개산공제와 실제 필요경비 중 택일 — 「소득세법 시행령」 제166조 제1항 제1호)
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(total)}</td>
      </tr>
      {rows
        .filter((r) => r.amount > 0)
        .map((r) => (
          <tr key={r.id} data-testid={`bg-redev-filing-expense-${r.id}`}>
            <td className="py-0.5 pr-2 pl-6 text-caption text-fuchsia-700 dark:text-fuchsia-400">{r.label}</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(r.amount)}</td>
          </tr>
        ))}
    </>
  );
}
