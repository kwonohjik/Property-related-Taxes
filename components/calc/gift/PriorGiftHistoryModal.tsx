"use client";

/**
 * PriorGiftHistoryModal — 증여세 사전증여 이력 조회 모달
 *
 * Design: docs/02-design/features/gift-tax-prior-gift-history-lookup.design.md §4.3
 *
 * 책임:
 *   - 마운트 시 calculationRepository.list({taxType:"gift"}) 1회 호출
 *   - filterPriorGiftCandidates 로 same_group / other 2-tier 분류
 *   - 사용자 선택 → candidateToPriorGift → onSelect 콜백
 *
 * 정책:
 *   - selectionMode: "single" 고정 (Phase 1) — 클릭 즉시 닫힘
 *   - hasInnerPriorGifts 카드는 sky 배지 + 펼침 안내 (이중 합산 위험)
 *   - "other" 그룹은 회색 톤 접힘 섹션 (기본 닫힘)
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
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import {
  filterPriorGiftCandidates,
  filterInheritancePriorGiftCandidates,
  candidateToPriorGift,
  type PriorGiftCandidate,
  type LookupWarning,
} from "@/lib/calc/prior-gift-lookup";
import type {
  GiftDonorRelation,
  PriorGift,
  DonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 라벨 매핑
// ============================================================

const DONOR_LABEL: Record<GiftDonorRelation, string> = {
  father: "부",
  mother: "모",
  grandparent: "조부모",
  spouse: "배우자",
  lineal_descendant: "직계비속",
  sibling: "형제자매",
  other_relative: "기타친족",
  other: "기타",
};

const RELATION_LABEL: Partial<Record<DonorRelation, string>> = {
  spouse: "배우자",
  lineal_ascendant_adult: "직계존속(성인)",
  lineal_ascendant_minor: "직계존속(미성년)",
  lineal_descendant: "직계비속",
  other_relative: "기타친족",
};

// ============================================================
// Props
// ============================================================

export interface PriorGiftHistoryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentGiftDate: string;
  /** 정보 표시용 (현 회차 §47 그룹 라벨) — 증여세 모드 전용 */
  currentDonor: GiftDonorRelation;
  /** 수증자(=의뢰인) 식별자. null = 본인 (일반 납세자 모드) */
  currentClientId: string | null;
  excludeCalculationIds: string[];
  onSelect: (priorGift: PriorGift) => void;
  /** PR-E: 영리법인 1-클릭 import 활성화. 상속세 모드에서 true 권장. */
  enableCorporateOption?: boolean;
  /**
   * PR 1 (2026-05-22) — 모드 분기.
   *   "gift": 증여세 §47 동일인 그룹 매칭 + clientId 격리 (기존)
   *   "inheritance": 상속세 옵션 B 전수 조회 (currentDonor·currentClientId 무시)
   * 기본값: "gift" (호환)
   */
  mode?: "gift" | "inheritance";
  /** "직접 입력하기" — 빈 PriorGift 1건 추가 */
  onManualAdd?: () => void;
}

// ============================================================
// 카드 컴포넌트
// ============================================================

function CandidateCard({
  candidate,
  onSelect,
  onSelectAsCorporate,
  showCorporateOption = false,
}: {
  candidate: PriorGiftCandidate;
  onSelect: (c: PriorGiftCandidate) => void;
  /** PR-E: 영리법인 1-클릭 import 콜백 (상속세 모드 전용) */
  onSelectAsCorporate?: (c: PriorGiftCandidate) => void;
  /** PR-E: 영리법인 버튼 노출 — 상속세 모드 + heirs 존재 시 */
  showCorporateOption?: boolean;
}) {
  const [expandInnerInfo, setExpandInnerInfo] = useState(false);

  const recipient = candidate.donorRelation
    ? RELATION_LABEL[candidate.donorRelation] ?? "본인"
    : "본인";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-2">
      {/* 헤더 — 증여 회차 정보 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {candidate.giftDate} · {DONOR_LABEL[candidate.donor]} 증여 → {recipient}
        </div>
        {candidate.hasInnerPriorGifts && (
          <button
            type="button"
            onClick={() => setExpandInnerInfo((p) => !p)}
            className="text-[10px] bg-sky-100 text-sky-800 rounded px-2 py-0.5 cursor-help hover:bg-sky-200"
            aria-label="이전 합산 결과 안내 펼치기"
          >
            🔁 이전 합산 결과 포함
          </button>
        )}
      </div>

      {candidate.hasInnerPriorGifts && expandInnerInfo && (
        <div className="text-[11px] bg-sky-50 border border-sky-200 rounded p-2 text-sky-700">
          이 회차의 합산과세표준 ⑤·산출세액 ⑦은 이미 그 시점 이전의 사전증여를 합산한 결과입니다.
          추가로 같은 §47 그룹의 더 과거 회차를 별도로 더하면 이중 합산이 발생할 수 있습니다.
          가장 최근 합산 회차 1건만 선택하는 것을 권장합니다.
        </div>
      )}

      {/* 금액 그리드 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-600">증여재산가액 ②③</span>
        <span className="text-right font-medium">{formatKRW(candidate.grossGiftValue)}</span>

        <span className="text-gray-600">합산과세표준 ⑤</span>
        <span className="text-right font-medium">{formatKRW(candidate.taxBase)}</span>

        <span className="text-gray-600">산출세액 ⑦</span>
        <span className="text-right font-medium">{formatKRW(candidate.computedTax)}</span>

        {candidate.additionalGenerationSkipSurcharge > 0 && (
          <>
            <span className="text-gray-600">세대생략 ⑫</span>
            <span className="text-right font-medium">
              {formatKRW(candidate.additionalGenerationSkipSurcharge)}
            </span>
          </>
        )}

        <span className="text-gray-600 border-t border-gray-200 pt-1 mt-1">납부세액</span>
        <span className="text-right font-semibold border-t border-gray-200 pt-1 mt-1">
          {formatKRW(candidate.finalTax)}
        </span>
      </div>

      {/* 동일 수증자 일치 배지 */}
      <p className="text-[11px] text-violet-700">
        ✓ 동일 수증자(=의뢰인) 이력
      </p>

      {/* 버튼 */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSelect(candidate)}
          className="flex-1 rounded-md py-2 text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          📋 이 회차 선택
        </button>
        {showCorporateOption && onSelectAsCorporate && (
          <button
            type="button"
            onClick={() => onSelectAsCorporate(candidate)}
            className="rounded-md py-2 px-3 text-xs font-medium bg-violet-100 text-violet-800 hover:bg-violet-200 border border-violet-300 transition-colors"
            title="영리법인 사전증여로 가져오기 (§13①2호 + §3의2②). 자연인 정보는 제거되고 산출세액 상당액 입력 필드가 활성화됩니다."
          >
            🏢 영리법인
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 메인 모달
// ============================================================

export function PriorGiftHistoryModal({
  open,
  onOpenChange,
  currentGiftDate,
  currentDonor,
  currentClientId,
  excludeCalculationIds,
  onSelect,
  onManualAdd,
  enableCorporateOption = false,
  mode = "gift",
}: PriorGiftHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PriorGiftCandidate[]>([]);
  const [warnings, setWarnings] = useState<LookupWarning[]>([]);

  // 모달 오픈 시점에만 fetch — setState는 모두 Promise 콜백 내부에서 (cascading render 방지)
  useEffect(() => {
    if (!open) {
      // 닫힘 시 cleanup 패스에서 loading=true 복원 (다음 오픈 때 스피너 표시)
      return () => {
        setLoading(true);
        setError(null);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "gift" })
      .then((records) => {
        if (!alive) return;
        // PR 1 (2026-05-22) — 상속세 모드 분기: 옵션 B 전수 조회
        const { candidates, warnings } =
          mode === "inheritance"
            ? filterInheritancePriorGiftCandidates(
                records,
                currentGiftDate,
                excludeCalculationIds,
              )
            : filterPriorGiftCandidates(
                records,
                currentGiftDate,
                currentClientId,
                excludeCalculationIds,
              );
        setCandidates(candidates);
        setWarnings(warnings);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "이력을 불러올 수 없습니다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, currentGiftDate, currentClientId, excludeCalculationIds]);

  // 필터 기준 문자열 (10년 전 일자)
  const tenYearsAgo = useMemo(() => {
    const d = new Date(currentGiftDate);
    d.setFullYear(d.getFullYear() - 10);
    d.setDate(d.getDate() + 1); // "10년 이내" = differenceInYears <= 10
    return d.toISOString().split("T")[0];
  }, [currentGiftDate]);

  const handleSelect = (c: PriorGiftCandidate) => {
    const priorGift = candidateToPriorGift(c);
    onSelect(priorGift);
    onOpenChange(false);
  };

  // PR-E: 영리법인 1-클릭 import — candidateToPriorGift options.asCorporate
  const handleSelectAsCorporate = (c: PriorGiftCandidate) => {
    const priorGift = candidateToPriorGift(c, { asCorporate: true });
    onSelect(priorGift);
    onOpenChange(false);
  };

  const handleManualAdd = () => {
    onManualAdd?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📋 사전증여 이력 조회</DialogTitle>
          <DialogDescription className="text-xs">
            저장된 증여세 계산 이력에서 동일인 합산 대상 회차를 선택해 자동 입력합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 필터 요약 */}
        <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3 text-xs space-y-1 text-sky-800">
          <div>
            <span className="text-sky-600">현재 증여일:</span> {currentGiftDate}
          </div>
          <div>
            <span className="text-sky-600">수증자:</span>{" "}
            {currentClientId
              ? "현재 의뢰인의 사전증여 이력"
              : "본인(일반 납세자)의 사전증여 이력"}
          </div>
          <div>
            <span className="text-sky-600">증여자 관계:</span>{" "}
            {DONOR_LABEL[currentDonor]}
          </div>
          <div className="text-sky-600">
            필터: 10년 이내 ({tenYearsAgo} 이후) + 동일 수증자(=의뢰인)
          </div>
        </div>

        {/* 본문 — 상태별 분기 */}
        <div className="space-y-3">
          {loading && (
            <div className="space-y-3">
              <div className="animate-pulse h-24 bg-gray-100 rounded-md" />
              <div className="animate-pulse h-24 bg-gray-100 rounded-md" />
              <p className="text-xs text-gray-500 text-center">이력을 불러오는 중...</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {candidates.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-violet-700">
                    사전증여 이력 — {candidates.length}건
                  </h4>
                  <div className="space-y-3">
                    {candidates.map((c) => (
                      <CandidateCard
                        key={c.calculationId}
                        candidate={c}
                        onSelect={handleSelect}
                        onSelectAsCorporate={handleSelectAsCorporate}
                        showCorporateOption={enableCorporateOption}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-gray-100 p-6 text-center text-sm text-gray-500">
                  현재 수증자(=의뢰인)의 증여세 이력이 없습니다.
                  {warnings.length > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      {warnings.length}건의 이력이 필터·검증 조건에 의해 제외되었습니다.
                    </div>
                  )}
                </div>
              )}

              {warnings.length > 0 && (
                <details className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
                  <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
                    ⚠️ 제외된 이력 {warnings.length}건 (펼침)
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                    {warnings.slice(0, 20).map((w, i) => (
                      <li key={`${w.calculationId}-${i}`}>• {w.message}</li>
                    ))}
                    {warnings.length > 20 && (
                      <li className="text-amber-600">(외 {warnings.length - 20}건)</li>
                    )}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex flex-row gap-2 justify-between sm:justify-between">
          <button
            type="button"
            onClick={handleManualAdd}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            + 직접 입력하기
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
