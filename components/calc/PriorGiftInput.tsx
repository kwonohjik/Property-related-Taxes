"use client";

/**
 * PriorGiftInput — 사전증여 내역 입력 컴포넌트 (#31)
 * 상속세: 10년(상속인) / 5년(비상속인) 이내 증여 합산 (§13)
 * 증여세: 동일인 10년 이내 증여 합산 (§47)
 *
 * 800줄 분할 (PR Z, 2026-05-22) — 본 파일은 main export + 마법사 합성만 담당.
 * 행 편집·영리법인 펼침·합산 요약은 `components/calc/prior-gift/` 의 sibling 파일에서.
 */

import { useMemo, useState } from "react";
import { PriorGiftHistoryModal } from "@/components/calc/gift/PriorGiftHistoryModal";
import { GiftRowEditor } from "@/components/calc/prior-gift/GiftRowEditor";
import { PriorGiftTableView } from "@/components/calc/prior-gift/PriorGiftTableView";
import { AggregationSummary } from "@/components/calc/prior-gift/AggregationSummary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  hasUserEditedFields,
  makeEmptyGift,
} from "@/components/calc/prior-gift/meta";
import type {
  PriorGift,
  GiftDonorRelation,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 헬퍼 re-export — 외부 모듈이 hasCorporatePriorGift / makeEmptyGift 등에 의존할 가능성에 대비
export {
  hasUserEditedFields,
  hasCorporatePriorGift,
  makeEmptyGift,
} from "@/components/calc/prior-gift/meta";

export interface PriorGiftInputProps {
  gifts: PriorGift[];
  onChange: (gifts: PriorGift[]) => void;
  /** "inheritance": 상속세 모드 (상속인 여부 표시) / "gift": 증여세 모드 */
  mode?: "inheritance" | "gift";
  /** 증여세 모드 — 현재 증여일 (이력 조회 필터 기준) */
  currentGiftDate?: string;
  /** 증여세 모드 — 현재 증여자 관계 (§47 표시용) */
  currentDonor?: GiftDonorRelation;
  /** 증여세 모드 — 수증자(=의뢰인) 식별자. null = 본인 (일반 납세자 모드) */
  currentClientId?: string | null;
  /** 상속세 모드 — 영리법인 사전증여 doneeId select 옵션 (PR-C) */
  heirs?: Heir[];
  /**
   * PR 1 (2026-05-22) — 상속세 모드 — 상속개시일 (deathDate).
   * 모달 활성화 + 옵션 B 전수 조회 기준일.
   */
  currentDeathDate?: string;
  /**
   * PR 1 (2026-05-22) — 영리법인 1-클릭 import 옵션 노출.
   * 영리법인 Heir 존재 시 InheritanceTaxForm 에서 자동 true.
   */
  allowCorporateImport?: boolean;
}

export function PriorGiftInput({
  gifts,
  onChange,
  mode = "inheritance",
  currentGiftDate,
  currentDonor,
  currentClientId = null,
  heirs,
  currentDeathDate,
  allowCorporateImport,
}: PriorGiftInputProps) {
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  // 편집 모달 대상 — PriorGift에 행 id가 없어 index 기반 (UI ephemeral, zustand 금지)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 추가 직후 자동 선택(E-1) → Dialog 자동 오픈. 새 항목은 항상 배열 끝에 push.
  const handleAdd = () => {
    onChange([...gifts, makeEmptyGift()]);
    setSelectedIndex(gifts.length);
  };
  const handleAddFromHistory = (priorGift: PriorGift) => {
    onChange([...gifts, priorGift]);
    setSelectedIndex(gifts.length);
  };

  const handleUpdate = (index: number, updated: PriorGift) => {
    const next = [...gifts];
    // 사용자가 자동 채움 후 어떤 필드라도 수정하면 sourceCalculationId 제거 (배지 자동 사라짐)
    const prev = gifts[index];
    if (prev.sourceCalculationId && hasUserEditedFields(prev, updated)) {
      updated = { ...updated, sourceCalculationId: undefined };
    }
    next[index] = updated;
    onChange(next);
  };

  // 삭제는 모달 내부에서만 호출(테이블에 인라인 삭제 없음) → 항상 모달 닫힘(E-2).
  const handleRemove = (index: number) => {
    onChange(gifts.filter((_, i) => i !== index));
    setSelectedIndex(null);
  };

  const selectedGift =
    selectedIndex !== null && selectedIndex < gifts.length
      ? gifts[selectedIndex]
      : null;

  // PR 1 (2026-05-22): 상속세 모드 모달 활성화 — currentDeathDate 기준
  const canLookup =
    (mode === "gift" && Boolean(currentGiftDate) && Boolean(currentDonor)) ||
    (mode === "inheritance" && Boolean(currentDeathDate));
  // 모달 useEffect dep로 들어가는 배열 — 매 렌더 새 identity면 모달 열린 동안
  // 부모 렌더마다 IndexedDB 재조회 발생 → useMemo로 identity 안정화
  const excludeIds = useMemo(
    () =>
      gifts
        .map((g) => g.sourceCalculationId)
        .filter((v): v is string => Boolean(v)),
    [gifts],
  );

  const windowYears = mode === "inheritance" ? "10년 / 비상속인 5년" : "10년";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {mode === "inheritance"
              ? "사전증여재산 (§13)"
              : "동일인 사전증여 합산 (§47)"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            최근 {windowYears} 이내 증여 내역을 입력하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(mode === "gift" || mode === "inheritance") && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              disabled={!canLookup}
              title={
                !canLookup
                  ? mode === "inheritance"
                    ? "1단계에서 상속개시일을 먼저 입력하세요"
                    : "1단계에서 증여일과 증여자 관계를 먼저 입력하세요"
                  : mode === "inheritance"
                    ? "저장된 증여세 이력에서 사전증여를 선택해 자동 입력합니다 (상속개시일 기준 10년 이내)"
                    : "현재 수증자(=의뢰인)의 저장된 증여세 이력에서 사전증여를 선택해 자동 입력합니다"
              }
              className={`text-xs rounded-md border px-3 py-1.5 transition-colors ${
                canLookup
                  ? "border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700"
                  : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
              }`}
            >
              📋 이력에서 조회
            </button>
          )}
          {gifts.length > 0 && (
            <span className="text-xs text-gray-400">{gifts.length}건</span>
          )}
        </div>
      </div>
      {mode === "gift" && !canLookup && (
        <p className="text-caption text-gray-500 -mt-2">
          ※ 이력 조회는 1단계 증여일·증여자 관계가 입력된 후 활성화됩니다.
        </p>
      )}

      {/* 이력 조회 모달 — 증여세: §47 동일인 매칭 / 상속세: 옵션 B 전수 조회 */}
      {mode === "gift" && canLookup && (
        <PriorGiftHistoryModal
          open={historyModalOpen}
          onOpenChange={setHistoryModalOpen}
          currentGiftDate={currentGiftDate!}
          currentDonor={currentDonor!}
          currentClientId={currentClientId}
          excludeCalculationIds={excludeIds}
          onSelect={handleAddFromHistory}
          onManualAdd={handleAdd}
          mode="gift"
        />
      )}
      {/* PR 1 (2026-05-22): 상속세 모드 모달 — currentDeathDate 기준 옵션 B 전수 조회 */}
      {mode === "inheritance" && canLookup && (
        <PriorGiftHistoryModal
          open={historyModalOpen}
          onOpenChange={setHistoryModalOpen}
          currentGiftDate={currentDeathDate!}
          // 상속세 모드에서는 currentDonor·currentClientId 무시 (필러 — 인터페이스 호환)
          currentDonor={"other" as GiftDonorRelation}
          currentClientId={null}
          excludeCalculationIds={excludeIds}
          onSelect={handleAddFromHistory}
          onManualAdd={handleAdd}
          mode="inheritance"
          enableCorporateOption={allowCorporateImport === true}
        />
      )}

      {/* 요약 테이블 (행 클릭 → 편집 모달) */}
      <PriorGiftTableView
        gifts={gifts}
        selectedIndex={selectedIndex}
        onSelect={(index) => setSelectedIndex(index)}
        mode={mode}
        heirs={heirs}
      />

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈. GiftRowEditor 본문 그대로(hideHeader). */}
      <Dialog
        open={selectedGift !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>
              증여 {selectedIndex !== null ? selectedIndex + 1 : ""}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="prior-gift-edit-dialog"
          >
            {selectedGift && selectedIndex !== null && (
              <GiftRowEditor
                gift={selectedGift}
                index={selectedIndex}
                hideHeader
                showIsHeir={mode === "inheritance"}
                showGiftPhaseA={mode === "gift"}
                showSpecialType={mode === "inheritance"}
                onUpdate={(updated) => handleUpdate(selectedIndex, updated)}
                onRemove={() => handleRemove(selectedIndex)}
                heirs={heirs}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-between">
            <button
              type="button"
              onClick={() =>
                selectedIndex !== null && handleRemove(selectedIndex)
              }
              className="px-4 py-2 rounded-md text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => setSelectedIndex(null)}
              className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
      >
        <span className="text-lg">+</span>
        사전증여 추가
      </button>

      <AggregationSummary gifts={gifts} mode={mode} />
    </div>
  );
}
