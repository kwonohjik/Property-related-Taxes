"use client";

/**
 * 「판정 불러오기」 모달 — 계산기가 저장된 1세대1주택 판정에서 사실을 가져온다 (P5-b-2)
 *
 * 계획서 §5.3 표 2행. 가장 가까운 선례는 같은 도메인의
 * `MultiTransferHistoryLoadModal.tsx`(다건 「📂 이력에서 불러오기」)다 — 껍데기·로딩 3분기·
 * 카드 형태를 그대로 따른다.
 *
 * ## 🔴 **이동하지 않는다** — 이 파일의 존재 이유 절반이 이것이다
 *
 * P5-a는 사실 전달 헬퍼를 **두 개** 만들어 두었고 차이는 `router.push` 하나다:
 *
 * | | store | 이동 |
 * |---|---|---|
 * | `applyOneHouseFactsToTransferForm` | 쓴다 | **안 한다** ← 여기가 쓰는 것 |
 * | `openTransferWithOneHouseFacts` | 쓴다 | 한다 |
 *
 * 이 모달의 런처는 계산기 0단계에 있고, **다건 편집 화면도 그 0단계를 그대로 마운트한다**
 * (`MultiTransferTaxCalculator.tsx:472` — `isEmbeddedInMulti`는 헤더·하단 nav만 가린다).
 * 이동하는 쪽을 부르면 다건 편집 중에 **단건 마법사로 튕겨 나간다**(계획서 V-12 실측).
 * 정적 가드가 이 파일에 `router`가 없음을 고정한다.
 *
 * ## 🔑 적용은 **P5-a 헬퍼에 넘긴다** — 여기서 store를 직접 쓰지 않는다
 *
 * `updateFormData`를 여기서 부르면 판정 → 계산기 경로가 두 갈래가 된다. 특히
 * `sourceJudgmentInputHash`(staleness 기준선)를 심는 것은 그 헬퍼 안에만 있어서, 복제한
 * 쪽은 **기능이 살아 있는 채로 아무것도 감지하지 못하는** 상태가 된다(P5-b-1 뮤테이션 M8).
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  filterOneHouseJudgmentCandidates,
  type OneHouseJudgmentCandidate,
} from "@/lib/calc/one-house-judgment-lookup";
import { applyOneHouseFactsToTransferForm } from "@/lib/calc/one-house-judgment-handoff";

/** 판정 배지 톤 → 정적 클래스. Tailwind는 동적 조합을 빌드에서 못 본다. */
const VERDICT_CLASS = {
  emerald: "border-emerald-300 text-emerald-700",
  amber: "border-amber-300 text-amber-700",
  rose: "border-rose-300 text-rose-700",
} as const;

export function OneHouseJudgmentLoadModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /**
   * 🔑 `null` = 아직 안 읽음 / `[]` = 0건. 한 상태로 합치면 열자마자 「판정 이력이 없습니다」가
   *    한 프레임 깜빡인다(`BlockShareholderPriorTransferModal`이 같은 이유로 같은 규약을 쓴다).
   */
  const [candidates, setCandidates] = useState<OneHouseJudgmentCandidate[] | null>(null);
  /**
   * 🔑 의뢰인 격리는 **세무사 모드의 요구사항**이다 — 판정 record도 `clientId: activeClientId`로
   *    저장된다(`OneHouseJudgmentCalculator.tsx:123`). 걸지 않으면 다른 의뢰인의 판정이 뜬다.
   */
  const activeClientId = useProfessionalStore((s) => s.activeClientId);

  /** 🔑 setState는 전부 Promise 콜백·cleanup에서만 — effect 본문 동기 호출은 cascading render다. */
  useEffect(() => {
    if (!open) {
      return () => {
        setCandidates(null);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "one_house_exemption", clientId: activeClientId })
      .then((records) => {
        if (alive) setCandidates(filterOneHouseJudgmentCandidates(records));
      })
      .catch(() => {
        // 조회 실패는 **빈 목록으로 흡수**한다 — 별도 에러 화면을 띄워도 사용자가 할 일이 같다.
        if (alive) setCandidates([]);
      });
    return () => {
      alive = false;
    };
  }, [open, activeClientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* E2E가 「이 모달이 지금 열려 있는가」를 판정하는 유일한 신호 — 목록 항목 텍스트로
          판정하면 닫히는 중인 모달의 잔상과 구분되지 않는다(선례 모달 주석의 2026-08-05 실측). */}
      <DialogContent
        data-testid="one-house-judgment-load-modal"
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>판정 불러오기</DialogTitle>
          <DialogDescription className="text-xs">
            1세대1주택 비과세 판정 메뉴에서 저장한 판정을 골라 그 <b>사실</b>을 이 계산기로
            가져옵니다. 계산기는 판정 결과를 복사하지 않고 <b>같은 엔진으로 다시 판정</b>합니다.
            현재 입력한 자산·세대 정보는 <b>불러온 값으로 대체됩니다</b>.
          </DialogDescription>
        </DialogHeader>

        {candidates === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            저장된 1세대1주택 판정이 없습니다. 판정 메뉴에서 먼저 판정해 주세요.
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.calculationId}
                type="button"
                data-testid={`load-judgment-${c.calculationId}`}
                onClick={() => {
                  /**
                   * 🔑 **쓰기가 끝난 뒤에 닫는다.** 먼저 닫으면 「모달이 사라졌다」가 곧
                   *    「폼이 채워졌다」를 뜻하지 않게 되어, E2E가 기댈 신호가 사라진다
                   *    (기준선 해시를 읽느라 이 헬퍼는 저장소 왕복을 한 번 한다).
                   */
                  void applyOneHouseFactsToTransferForm(c.form, c.calculationId).then(() =>
                    onOpenChange(false),
                  );
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* 🔑 판정 결과를 **다시 유도하지 않는다** — 이력 목록·출처 한 줄과 같은 술어다. */}
                    {c.verdict && (
                      <Badge variant="outline" className={`text-xs ${VERDICT_CLASS[c.verdict.tone]}`}>
                        {c.verdict.label}
                      </Badge>
                    )}
                    <span className="truncate font-medium">{c.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    저장{" "}
                    <span className="font-mono tabular-nums">{c.updatedAt.slice(0, 10)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          ⓘ 판정 메뉴가 묻지 않은 <b>취득가액·필요경비</b>는 이 계산기에서 이어서 입력해야
          세액이 나옵니다.
        </p>
      </DialogContent>
    </Dialog>
  );
}
