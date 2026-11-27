"use client";

/**
 * §101② 판정 — 「양도세 계산 이력 불러오기」 모달 (P4)
 *
 * 계획서 §7 P4 · §8 Q-6·Q-8′. 1호(수증자)·2호(증여자) 결정세액 칸이 같은 모달을 쓴다.
 * 후보는 단건(`mode: "single"`) 결과 중 결정세액이 0 이상 정수인 이력뿐이다 — 선별은
 * `lib/calc/gift-resale-101-2-history.ts`가 하고, 여기는 읽어서 보여주기만 한다(이력은 쓰지 않는다).
 *
 * 의뢰인 격리: 세무사 모드에서는 활성 의뢰인의 이력만 연다(`OneHouseJudgmentLoadModal`과 같은 규약).
 * setState는 Promise 콜백·cleanup에서만 부른다(effect 본문 동기 호출 금지).
 *
 * 폭: 공용 `DialogContent` 기본값 `sm:max-w-sm`(24rem)은 **`sm:` 접두로만** 덮인다 — 접두 없는 `max-w-*`는
 * 640px 이상에서 무시돼 긴 이력 제목(주소·양도일)이 잘리고 가로 스크롤이 생겼다(2026-11-27). 제목은 줄바꿈한다.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { kstDateOfIso } from "@/lib/utils/kst-date";
import { buildGiftResaleCandidates, type GiftResaleCandidate } from "@/lib/calc/gift-resale-101-2-history";
import { AMOUNT_CLASS } from "./shared";

export const GIFT_RESALE_HISTORY_NOTICE =
  "일괄양도·다건·겸용주택 계산 이력은 목록에 없습니다 — 결정세액을 직접 입력하세요.";
export const GIFT_RESALE_HISTORY_EMPTY = "저장된 단건 양도세 계산 이력이 없습니다";

export function GiftResaleHistoryModal({
  open,
  onOpenChange,
  onSelect,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (candidate: GiftResaleCandidate) => void;
  /** 어느 칸을 채우는지 — 제목에 붙는다 */
  title: string;
}) {
  /** `null` = 아직 안 읽음 / `[]` = 후보 0건 (한 상태로 합치면 열자마자 빈 안내가 깜빡인다) */
  const [candidates, setCandidates] = useState<GiftResaleCandidate[] | null>(null);
  const activeClientId = useProfessionalStore((s) => s.activeClientId);

  useEffect(() => {
    if (!open) {
      return () => {
        setCandidates(null);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "transfer", clientId: activeClientId })
      .then((records) => {
        if (alive) setCandidates(buildGiftResaleCandidates(records));
      })
      .catch(() => {
        // 조회 실패는 빈 목록으로 흡수한다 — 사용자가 할 일(직접 입력)이 같다.
        if (alive) setCandidates([]);
      });
    return () => {
      alive = false;
    };
  }, [open, activeClientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="gr-history-modal" className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">
            양도세 계산기에서 저장한 단건 계산 이력을 골라 결정세액(가산세 제외)을 채웁니다.
          </DialogDescription>
        </DialogHeader>

        {candidates === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="gr-history-empty">
            {GIFT_RESALE_HISTORY_EMPTY}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="gr-history-list">
            {candidates.map((c) => (
              <li key={c.record.id}>
                <button
                  type="button"
                  data-testid={`gr-history-item-${c.record.id}`}
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium break-words">{c.record.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      계산일 <span className="font-mono tabular-nums">{kstDateOfIso(c.record.createdAt)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    결정세액{" "}
                    <span className={`${AMOUNT_CLASS} text-sm font-medium text-foreground`}>{formatKRW(c.determinedTax)}</span>원
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground" data-testid="gr-history-notice">
          {GIFT_RESALE_HISTORY_NOTICE}
        </p>
      </DialogContent>
    </Dialog>
  );
}
