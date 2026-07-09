"use client";

/**
 * UnlistedStockHistoryModal — 비상장주식 평가 이력 조회 모달
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md §4.1
 *
 * 책임:
 *   - 마운트 시 calculationRepository.list({taxType: undefined}) 1회 호출
 *     ※ taxType 미지정 = 상속·증여 모두 (Q6 A안 cross 조회)
 *   - filterUnlistedStockCandidates 로 same_corp / other_corp 2-tier 분류
 *   - 사용자 선택 → candidateToUnlistedStockInput → onSelect 콜백
 *
 * 정책 (memory `history-lookup-modal`):
 *   - selectionMode: "single" 고정 — 클릭 즉시 닫힘
 *   - "다른 법인" 그룹은 회색 톤 접힘 섹션 (기본 닫힘)
 *   - 후보 없음 시 안내 메시지 (Q5 B안)
 *   - sourceCalculationId 메타 부착 — 카드 측 mirror-pattern으로 수정 시 제거
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import {
  filterUnlistedStockCandidates,
  candidateToUnlistedStockInput,
  type UnlistedStockCandidate,
} from "@/lib/calc/unlisted-stock-valuation-lookup";
import type { CalculationRecord } from "@/lib/storage/types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface UnlistedStockHistoryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 현재 입력 중인 법인명 (있으면 같은 법인 우선 그룹화) */
  currentCorpName: string | undefined;
  /** 세무사 모드 의뢰인 ID (null = 본인) */
  currentClientId: string | null;
  /** 이미 자산 목록에 추가된 calculationId 배열 — `${recordId}-${itemId}` 형식 */
  excludeCalculationIds: string[];
  /**
   * 사용자 선택 콜백 — partial input + sourceCalculationId 전달
   * - partial: Q1 B안 (법인 정보만 — evaluationDate·ownedShares·isMaxShareholder 제외)
   * - sourceCalculationId: `${recordId}-${itemId}` 메타 추적용
   */
  onSelect: (
    partial: Partial<UnlistedStockValuationInput>,
    sourceCalculationId: string,
  ) => void;
}

interface ModalData {
  records: CalculationRecord[];
  loaded: boolean;
}

export function UnlistedStockHistoryModal({
  open,
  onOpenChange,
  currentCorpName,
  currentClientId,
  excludeCalculationIds,
  onSelect,
}: UnlistedStockHistoryModalProps) {
  const [data, setData] = useState<ModalData>({ records: [], loaded: false });
  const [showOtherCorp, setShowOtherCorp] = useState(false);

  // 모달 open 시 1회 records 로드
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void calculationRepository
      .list()
      .then((records) => {
        if (cancelled) return;
        setData({ records, loaded: true });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ records: [], loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // currentCorpName 매칭 후보 (메인 그룹) + 다른 법인 (접힘 그룹) 분리
  const { sameCorp, otherCorp } = useMemo(() => {
    if (!data.loaded) return { sameCorp: [] as UnlistedStockCandidate[], otherCorp: [] as UnlistedStockCandidate[] };
    // sameCorp: corpName 필터 적용
    const sameCorpResult = filterUnlistedStockCandidates(
      data.records,
      currentClientId,
      currentCorpName,
      excludeCalculationIds,
    );
    // otherCorp: corpName 필터 없이 전체 추출 후 sameCorp에 없는 것만
    const allResult = filterUnlistedStockCandidates(
      data.records,
      currentClientId,
      undefined,
      excludeCalculationIds,
    );
    const sameIds = new Set(sameCorpResult.candidates.map((c) => c.calculationId));
    const otherCorpList = allResult.candidates.filter((c) => !sameIds.has(c.calculationId));
    return { sameCorp: sameCorpResult.candidates, otherCorp: otherCorpList };
  }, [data, currentClientId, currentCorpName, excludeCalculationIds]);

  const handleSelect = (candidate: UnlistedStockCandidate) => {
    const partial = candidateToUnlistedStockInput(candidate);
    onSelect(partial, candidate.calculationId);
    onOpenChange(false);
  };

  const totalCount = sameCorp.length + otherCorp.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="unlisted-stock-history-modal">
        <DialogHeader>
          <DialogTitle>📂 비상장주식 평가 이력 조회</DialogTitle>
          <DialogDescription>
            {currentCorpName ? (
              <>
                현재 법인: <strong>{currentCorpName}</strong> · 선택 시 법인 정보가 자동 채워집니다.{" "}
                <span className="text-amber-700">평가기준일·보유주식수·할증 여부는 보존됩니다.</span>
              </>
            ) : (
              "이력에서 선택 시 법인 정보가 자동 채워집니다. 평가기준일·보유주식수는 사용자 입력을 보존합니다."
            )}
          </DialogDescription>
        </DialogHeader>

        {!data.loaded && (
          <p className="text-sm text-gray-500 py-8 text-center">이력을 불러오는 중...</p>
        )}

        {data.loaded && totalCount === 0 && (
          <p
            className="text-sm text-gray-600 py-8 text-center border border-gray-200 rounded bg-gray-50"
            data-testid="empty-history-notice"
          >
            저장된 비상장주식 평가 이력이 없습니다.
            <br />
            <span className="text-xs text-gray-500 mt-1 block">사례 6 등을 먼저 계산·저장해 보세요.</span>
          </p>
        )}

        {data.loaded && sameCorp.length > 0 && (
          <section className="space-y-2" data-testid="same-corp-section">
            <h3 className="text-xs font-semibold text-indigo-700">
              동일 법인 ({sameCorp.length}건)
            </h3>
            <ul className="space-y-2">
              {sameCorp.map((c) => (
                <li key={c.calculationId}>
                  <CandidateCard candidate={c} onSelect={() => handleSelect(c)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.loaded && otherCorp.length > 0 && (
          <section className="space-y-2 mt-4" data-testid="other-corp-section">
            <button
              type="button"
              onClick={() => setShowOtherCorp((v) => !v)}
              aria-expanded={showOtherCorp}
              className={expandToggleClass("slate")}
              data-testid="other-corp-toggle"
            >
              {expandToggleLabel(showOtherCorp)} · 다른 법인 ({otherCorp.length}건)
            </button>
            {showOtherCorp && (
              <ul className="space-y-2">
                {otherCorp.map((c) => (
                  <li key={c.calculationId}>
                    <CandidateCard candidate={c} onSelect={() => handleSelect(c)} variant="other" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
          >
            취소
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CandidateCardProps {
  candidate: UnlistedStockCandidate;
  onSelect: () => void;
  variant?: "same" | "other";
}

function CandidateCard({ candidate, onSelect, variant = "same" }: CandidateCardProps) {
  const taxTypeLabel = candidate.sourceTaxType === "inheritance" ? "상속" : "증여";
  const fmt = (n: number) => n.toLocaleString();
  const tone =
    variant === "same"
      ? "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50"
      : "border-gray-200 bg-gray-50/40 hover:bg-gray-50";
  const badgeTone =
    candidate.sourceTaxType === "inheritance"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-sky-100 text-sky-800";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-md border ${tone} transition-colors`}
      data-testid={`candidate-card-${candidate.calculationId}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${badgeTone}`}>
          [{taxTypeLabel}]
        </span>
        <span className="text-sm font-semibold">{candidate.corpName}</span>
        <span className="text-xs text-gray-500">· {candidate.evaluationDate} 평가</span>
      </div>
      <div className="text-xs text-gray-700 space-y-0.5">
        <p>
          발행 {fmt(candidate.totalShares)}주 / 액면 {fmt(candidate.faceValuePerShare)}원
        </p>
        {candidate.totalValuation > 0 && (
          <p>
            1주당 <strong>{fmt(candidate.finalPerShareValue)}원</strong> · 총{" "}
            <strong>{fmt(candidate.totalValuation)}원</strong>
          </p>
        )}
        {candidate.totalValuation === 0 && (
          <p className="text-amber-700">⚠ 평가 결과 누락 — 법인 정보만 채워집니다</p>
        )}
      </div>
    </button>
  );
}
