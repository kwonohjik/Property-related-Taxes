"use client";

/**
 * Cross1045AdjustmentCard — §104⑤ 본문 후단(8호·9호 **동일 자산 의제**) 조정액 안내.
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-2 / 2-3′** (v1.2 §5-B)
 *
 * ── 왜 「안내」인가 ────────────────────────────────────────────────────
 * §104⑤은 **전체** 양도소득 산출세액을 하나로 정하므로 조정액에 **귀속이 없다** — 부동산 몫도
 * 주식 몫도 아니다(G-4). 주식 `calculatedTax`에 더하면 **주식 신고서 금액이 틀어진다**.
 * ⇒ 세액에 반영하지 않고 **금액만 제시**한다.
 *
 * ⚠️ **§104⑤1호(과세표준 합계액 × 기본세율) 비교는 포함되지 않는다**(G-5) — 그러려면 반대편
 *   부동산의 과세표준 합계·산출세액까지 받아야 해 입력이 4칸이 된다. 8호·9호가 있으면 +10%p가
 *   붙어 2호가 커지는 것이 보통이라 1호가 이기는 경우는 드물지만, **0은 아니다.**
 *   그래서 카드가 그 한계를 직접 적는다.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { Cross1045Adjustment } from "@/lib/tax-engine/comparative-104-5-cross";

const won = (n: number) => n.toLocaleString();

export function Cross1045AdjustmentCard({ detail }: { detail: Cross1045Adjustment }) {
  return (
    <ToneCard
      tone="amber"
      title="§104⑤ 비사업용 토지 합산 — 추가 확인이 필요합니다"
      titleExtra={<LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" />}
      className="print:hidden"
    >
      <p className="text-sm">
        <LawArticleModal legalBasis="소득세법 §104 ⑤" label="§104⑤" /> 본문 후단은 같은 과세기간에
        양도한 <strong>비사업용 토지(§104①8호)</strong>와{" "}
        <strong>비사업용 토지 과다소유법인 주식(§104①9호)</strong>을{" "}
        <strong>「동일한 자산으로 보아」</strong> 과세표준을 합산해 세율을 적용하도록 정하고 있습니다.
      </p>

      <div className="rounded-lg bg-amber-100/60 px-3 py-2 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">부동산 §104①8호 과세표준</dt>
            <dd className="font-mono tabular-nums">{won(detail.clause8TaxBase)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">이 신고의 §104①9호 과세표준</dt>
            <dd className="font-mono tabular-nums">{won(detail.clause9TaxBase)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-amber-300/60 pt-1">
            <dt>합산하여 계산한 세액</dt>
            <dd className="font-mono tabular-nums">{won(detail.merged89Tax)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">각각 계산한 세액의 합</dt>
            <dd className="font-mono tabular-nums">{won(detail.separate89Tax)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-amber-300/60 pt-1 font-semibold">
            <dt>차이</dt>
            <dd className="font-mono tabular-nums">+{won(detail.adjustment)}</dd>
          </div>
        </dl>
      </div>

      <p className="text-sm">
        위 <strong>차이 {won(detail.adjustment)}원</strong>은 이 계산기의 산출세액에{" "}
        <strong>포함되어 있지 않습니다</strong>. §104⑤은 부동산과 주식을 합한{" "}
        <strong>전체</strong> 산출세액을 정하는 규정이라 이 금액이 어느 쪽에 귀속되는지 정해져 있지
        않기 때문입니다. 신고 시 세무대리인의 확인을 받으시기 바랍니다.
      </p>

      <p className="text-caption text-muted-foreground">
        이 안내는 §104⑤ <strong>2호</strong>(호별로 합산한 산출세액)만 반영합니다.{" "}
        <strong>1호</strong>(과세표준 합계액에 기본세율을 적용한 세액)와의 비교는 부동산 쪽 과세표준
        합계·산출세액이 있어야 가능해 포함하지 못했습니다. 1호가 더 큰 경우에는 세액이 위 금액보다
        더 늘어날 수 있습니다.
      </p>
    </ToneCard>
  );
}
