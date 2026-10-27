"use client";

/**
 * 이월과세 비교 카드 A 열 — 당초 증여 때 인수한 채무 부분(매입분)을 나눈 「증여분 · 매입분」 두 블록 + 산식 + 방법 고지.
 *
 * 값·문장은 전부 엔진 echo(`purchasedPartSplit`)를 공용 view(`carryoverPurchasedPartView`)가 풀어쓴 것이다 — 여기서 계산하지 않는다.
 * 계획서 `docs/00-pm/carryover-gift-debt-purchased-part.plan.md` Q-4 a · 설계서 ui.design §7.3.
 * 접힘이 없어(항상 렌더) 인쇄에도 그대로 나온다.
 */
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { carryoverPurchasedPartView, type PurchasedPartPieceView } from "@/lib/tax-engine/transfer-tax-carryover-purchased-part-display";
import type { CarryoverPurchasedPartSplit } from "@/lib/tax-engine/types/transfer-carryover.types";

/** 카드의 `InfoRow`와 같은 모양 — 카드 파일이 이 파일을 import하므로 순환을 피해 여기서 다시 그린다(금액 칸 정렬 규약 `font-mono tabular-nums`). */
function PieceRow({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs" data-testid={id}>
      <span>{label}</span>
      <span className="font-mono tabular-nums font-medium whitespace-nowrap">{value}</span>
    </div>
  );
}

function PieceBlock({ kind, view }: { kind: "gift" | "purchased"; view: PurchasedPartPieceView }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-1" data-testid={`carryover-piece-${kind}`}>
      <p className="text-xs font-semibold">{view.title}</p>
      {view.rows.map((r) => (
        <PieceRow key={r.key} id={`carryover-piece-${kind}-${r.key}`} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

/** 취득가액·보유기간·양도차익 3줄 자리에 들어가는 조각 블록들. */
export function CarryoverPurchasedPartBlocks({ split }: { split: CarryoverPurchasedPartSplit }) {
  const v = carryoverPurchasedPartView(split);
  return (
    <div className="space-y-2">
      {v.gift ? (
        <PieceBlock kind="gift" view={v.gift} />
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="carryover-piece-gift-none">
          {v.giftNone}
        </p>
      )}
      <PieceBlock kind="purchased" view={v.purchased} />
    </div>
  );
}

/** 산식(한국어 풀어쓰기)과 방법 고지 — 증여세 상당액·자본적지출 가산 줄 뒤에 둔다. */
export function CarryoverPurchasedPartNotes({ split }: { split: CarryoverPurchasedPartSplit }) {
  const v = carryoverPurchasedPartView(split);
  return (
    <>
      {v.formulaLines.length > 0 && (
        <div className="text-micro text-muted-foreground pl-2 leading-relaxed space-y-0.5" data-testid="carryover-piece-formula">
          {v.formulaLines.map((l, i) => (
            <p key={i}>
              * {l.lead}{" "}
              {l.frac && (
                <>
                  <Frac top={l.frac.top} bottom={l.frac.bottom} />{" "}
                </>
              )}
              = <b>{l.result}</b>
            </p>
          ))}
        </div>
      )}
      <p className="text-micro text-muted-foreground pl-2 leading-relaxed" data-testid="carryover-piece-method-notice">
        * {v.notice}
      </p>
    </>
  );
}
