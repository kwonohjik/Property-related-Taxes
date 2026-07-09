"use client";

/**
 * FamilyBusinessInheritanceHistoryModal — 가업상속공제 적용 자산 양도세 prefill 모달
 *
 * Track 2 K10 — 상속세 마법사 이력에서 가업상속공제 적용 사례 + 가업 자산 1건 선택
 *               → 양도세 마법사 4 필드 prefill (decedentAcquisitionPrice 제외).
 *
 * Source 매핑:
 *   - fbDeductionAppliedRate ← detail.appliedRate
 *   - inheritanceDate        ← input.deathDate
 *   - inheritanceMarketValue ← 선택된 EstateItem.marketValue
 *   - decedentAcquisitionPrice ← 0 (사용자 별도 입력 필요 — rose 안내)
 *
 * 정책:
 *   - 모달 오픈 시 calculationRepository.list({taxType:"inheritance"}) 1회 호출
 *   - 후보 카드별 자산 라디오 → 선택 후 onSelect 콜백 + 모달 닫힘
 *   - 손상/미적용/날짜 역전 사례는 warnings 영역에 회색 경고
 */

import { useEffect, useMemo, useState } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
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
  filterFamilyBusinessInheritanceCandidates,
  candidateToPrefill,
  type FamilyBusinessInheritanceCandidate,
  type FamilyBusinessInheritancePrefill,
  type FbLookupWarning,
} from "@/lib/calc/family-business-inheritance-lookup";

// ============================================================
// 라벨 매핑
// ============================================================

const CATEGORY_LABEL: Record<string, string> = {
  business_real_estate: "가업용 부동산",
  business_equipment: "가업용 기계·설비",
  corporate_stock: "가업 법인 주식",
  intangible_asset: "영업권·특허 등 무형자산",
  inventory: "가업 재고자산",
  other: "기타 가업용 자산",
};

// ============================================================
// Props
// ============================================================

export interface FamilyBusinessInheritanceHistoryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 현재 양도일 — deathDate < transferDate 가드 */
  currentTransferDate: string;
  /** 선택 콜백 — 호출 후 모달 자동 닫힘 */
  onSelect: (prefill: FamilyBusinessInheritancePrefill) => void;
}

// ============================================================
// 카드 컴포넌트
// ============================================================

function CandidateCard({
  candidate,
  onSelectAsset,
}: {
  candidate: FamilyBusinessInheritanceCandidate;
  onSelectAsset: (itemId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-900">
          {candidate.deathDate} 상속 · {candidate.title}
        </div>
        {candidate.usedDirectInput && (
          <span className="text-micro bg-violet-100 text-violet-800 rounded px-2 py-0.5">
            직접입력 모드
          </span>
        )}
      </div>

      {/* 메타 그리드 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-600">영위 연수</span>
        <span className="text-right font-medium">{candidate.operatingYears}년</span>

        <span className="text-gray-600">가업상속공제 적용액</span>
        <span className="text-right font-medium">{formatKRW(candidate.deduction)}</span>

        <span className="text-gray-600">가업상속공제적용률</span>
        <span className="text-right font-semibold text-emerald-700">
          {(candidate.appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}%
        </span>
      </div>

      {/* 자산 라디오 */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-emerald-800">
          양도할 가업 자산 선택 (1건)
        </p>
        {candidate.familyBusinessAssets.map((a) => (
          <button
            key={a.itemId}
            type="button"
            onClick={() => onSelectAsset(a.itemId)}
            className="w-full text-left rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs hover:bg-emerald-100 hover:border-emerald-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-900">{a.name}</span>
                <span className="ml-2 text-micro text-gray-500">
                  · {CATEGORY_LABEL[a.category] ?? a.category}
                </span>
              </div>
              <span className="text-right font-semibold text-emerald-700">
                {formatKRW(a.marketValue)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* decedentAcquisitionPrice 안내 */}
      <div className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-micro text-rose-800">
        ⚠️ 피상속인 원취득가액은 상속세 마법사에서 추적하지 않습니다 — 선택 후 별도 입력하세요.
      </div>
    </div>
  );
}

// ============================================================
// 메인 모달
// ============================================================

export function FamilyBusinessInheritanceHistoryModal({
  open,
  onOpenChange,
  currentTransferDate,
  onSelect,
}: FamilyBusinessInheritanceHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FamilyBusinessInheritanceCandidate[]>([]);
  const [warnings, setWarnings] = useState<FbLookupWarning[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);

  // 모달 오픈 시점에만 fetch
  useEffect(() => {
    if (!open) {
      return () => {
        setLoading(true);
        setError(null);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "inheritance" })
      .then((records) => {
        if (!alive) return;
        const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
          records,
          currentTransferDate,
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
  }, [open, currentTransferDate]);

  const handleSelectAsset = (candidate: FamilyBusinessInheritanceCandidate, itemId: string) => {
    const prefill = candidateToPrefill(candidate, itemId);
    if (prefill) {
      onSelect(prefill);
      onOpenChange(false);
    }
  };

  const warningsByReason = useMemo(() => {
    const grouped: Record<string, FbLookupWarning[]> = {};
    for (const w of warnings) {
      (grouped[w.reason] ??= []).push(w);
    }
    return grouped;
  }, [warnings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🏭 가업상속공제 적용 자산 이력 조회</DialogTitle>
          <DialogDescription className="text-xs">
            저장된 상속세 계산 이력에서 가업상속공제가 적용된 사례를 선택해 §97의2④
            의제 취득가액 필드를 자동 입력합니다 (소득세법 §97의2④ + 시행령 §163의2③).
          </DialogDescription>
        </DialogHeader>

        {/* 필터 요약 */}
        <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3 text-xs space-y-1 text-sky-800">
          <div>
            <span className="text-sky-600">현재 양도일:</span> {currentTransferDate}
          </div>
          <div className="text-sky-600">
            필터: 상속세 이력 + 가업상속공제 적용액 &gt; 0 + 적용률 &gt; 0 + 상속개시일 ≤ 양도일
          </div>
        </div>

        {/* 본문 */}
        {loading && (
          <div className="py-8 text-center text-sm text-gray-500">이력을 불러오는 중...</div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && candidates.length === 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600 space-y-1">
            <p className="font-medium">가업상속공제 적용 사례가 없습니다</p>
            <p className="text-xs text-gray-500">
              상속세 마법사에서 가업상속공제를 적용한 계산 이력이 필요합니다.
              직접 입력 모드로 진행하세요.
            </p>
          </div>
        )}

        {!loading && !error && candidates.length > 0 && (
          <div className="space-y-3">
            {candidates.map((c) => (
              <CandidateCard
                key={c.calculationId}
                candidate={c}
                onSelectAsset={(itemId) => handleSelectAsset(c, itemId)}
              />
            ))}
          </div>
        )}

        {/* 경고 영역 — 손상/미적용 사례 */}
        {!loading && warnings.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <button
              type="button"
              onClick={() => setWarningsOpen((o) => !o)}
              aria-expanded={warningsOpen}
              className={expandToggleClass("slate")}
            >
              {expandToggleLabel(warningsOpen)} · 제외된 이력 {warnings.length}건
            </button>
            {warningsOpen && (
              <ul className="mt-2 space-y-1">
                {Object.entries(warningsByReason).map(([reason, ws]) => (
                  <li key={reason}>
                    <span className="text-gray-500">[{reason}]</span> {ws.length}건
                    <ul className="ml-4 text-caption text-gray-600">
                      {ws.slice(0, 3).map((w, i) => (
                        <li key={i}>· {w.message}</li>
                      ))}
                      {ws.length > 3 && <li>... 외 {ws.length - 3}건</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
