"use client";

/**
 * HeirComposition — 상속인 구성 입력 컴포넌트
 * 상속세 계산 마법사에서 Heir[] 입력에 사용.
 *
 * 구조: 요약 테이블(HeirTableView) + 편집 모달(Dialog+HeirEditor) + 2단계 추가 picker.
 * 행 클릭 → 모달 오픈. 추가 직후 자동 선택(E-1) → 모달 자동 오픈.
 * 설계: docs/02-design/features/inheritance-heir-table-view.ui.design.md
 *
 * 분리 이력 (800줄 정책):
 *  - HeirEditor (changeHeirRelation 포함) → components/calc/HeirEditor.tsx
 *  - HeirTableView → components/calc/HeirTableView.tsx
 */

import type {
  Heir,
  HeirRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { useState } from "react";
import { HeirEditor, changeHeirRelation, RelationButton } from "@/components/calc/HeirEditor";
import { HeirTableView } from "@/components/calc/HeirTableView";
import { HEIR_PERSON_RELATIONS } from "@/components/calc/inheritance/heir-relation-meta";
import { generateSubstituteGroupId } from "@/lib/calc/substitute-group-id";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// 추가 picker 타입 (테이블 종류 컬럼 HeirKind와 구분)
// ============================================================

/**
 * 추가 picker 1단계 종류 선택 (5값, 법인 통합).
 * 영리/비영리는 추가 후 편집 카드 토글로 분기 (법인 통합 5종).
 */
type AddKind =
  | "heir"        // → 2단계 관계 선택(4종)으로
  | "legatee"     // → relation="legatee" 즉시 추가
  | "substitute"  // → relation="other" + subst- 그룹 즉시 발급
  | "corporate"   // → relation="corporate" 즉시 추가(isForProfit 미설정=영리 기본)
  | "other";      // → relation="other" 즉시 추가

// ============================================================
// generateHeirId (오케스트레이터 전용)
// ============================================================

let _nextHeirId = 1;
function generateHeirId() {
  return `heir-${Date.now()}-${_nextHeirId++}`;
}

// ============================================================
// KindButton — 1단계 종류 선택 버튼
// ============================================================

const KIND_ICONS: Record<AddKind, string> = {
  heir: "👥",
  legatee: "📜",
  substitute: "🔄",
  corporate: "🏢",
  other: "👤",
};

const KIND_LABELS: Record<AddKind, string> = {
  heir: "상속인",
  legatee: "수유자",
  substitute: "대습상속인",
  corporate: "법인",
  other: "기타",
};

interface KindButtonProps {
  kind: AddKind;
  onPick: (k: AddKind) => void;
}

function KindButton({ kind, onPick }: KindButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(kind)}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-xs"
    >
      <span className="text-xl">{KIND_ICONS[kind]}</span>
      <span className="text-gray-600 dark:text-gray-300 text-center leading-tight">
        {KIND_LABELS[kind]}
      </span>
    </button>
  );
}

// ============================================================
// PersonRelationPicker — 2단계 상속인 관계 선택 (4종 전용)
// ============================================================

/**
 * 추가 흐름 2단계 — HEIR_PERSON_RELATIONS 4종(상속인 전용, other 제외).
 * RelationPickerGrid(SPECIAL_RELATIONS 포함) 재사용 금지.
 */
function PersonRelationPicker({ onPick }: { onPick: (r: HeirRelation) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {HEIR_PERSON_RELATIONS.map((r) => (
        <RelationButton key={r} relation={r} onAdd={onPick} />
      ))}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface HeirCompositionProps {
  heirs: Heir[];
  onChange: (heirs: Heir[]) => void;
  /** 상속개시일 — legatee §27 미성년 자동 판정용 */
  deathDate?: string;
}

// re-export for backward compat (다른 파일이 HeirComposition에서 import하는 경우 대비)
export { changeHeirRelation };

export function HeirComposition({ heirs, onChange, deathDate }: HeirCompositionProps) {
  // UI 전용 ephemeral 상태 (zustand store 금지)
  const [selectedHeirId, setSelectedHeirId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addStep, setAddStep] = useState<"kind" | "relation" | null>(null);
  const [pendingKind, setPendingKind] = useState<AddKind | null>(null);

  // 선택된 heir 파생
  const selectedIndex = heirs.findIndex((h) => h.id === selectedHeirId);
  const selectedHeir = selectedIndex >= 0 ? heirs[selectedIndex] : null;

  // ----------------------------------------------------------------
  // 핸들러
  // ----------------------------------------------------------------

  /** 테이블 행 선택 (추가 패널 강제 종료 — 정정 #8) */
  const handleSelect = (id: string) => {
    setSelectedHeirId(id);
    setShowAddPanel(false);
    setAddStep(null);
    setPendingKind(null);
  };

  /** 상속인 추가 (relation 확정 후 호출) — 추가 후 자동 선택 (E-1) */
  const handleAdd = (relation: HeirRelation) => {
    const newHeir: Heir = {
      id: generateHeirId(),
      relation,
      // "기타(other)"는 기본 비상속인(§13①2호 5년·법정상속분 제외) — 며느리·사위 등.
      //   4촌 이내 방계혈족(4순위 상속인)은 편집 카드 "상속인 여부" 토글 ON으로 전환.
      ...(relation === "other" ? { isHeir: false } : {}),
    };
    onChange([...heirs, newHeir]);
    setSelectedHeirId(newHeir.id);  // 추가 직후 자동 선택
    setShowAddPanel(false);
    setAddStep(null);
    setPendingKind(null);
  };

  /** 대습상속인 추가 — relation="other" + subst- 그룹 즉시 발급 (정정 #3·#4·#18) */
  const handleAddSubstitute = () => {
    const newHeir: Heir = {
      id: generateHeirId(),
      relation: "other",
      substituteGroupId: generateSubstituteGroupId(),  // 공용 헬퍼(subst- 컨벤션)
    };
    onChange([...heirs, newHeir]);
    setSelectedHeirId(newHeir.id);  // 추가 직후 자동 선택 → 편집 카드에서 순위·역할 입력 유도
    setShowAddPanel(false);
    setAddStep(null);
    setPendingKind(null);
  };

  /** 편집 카드에서 수정 */
  const handleUpdate = (index: number, updated: Heir) => {
    const next = [...heirs];
    next[index] = updated;
    onChange(next);
  };

  /** 삭제 — 삭제된 행이 선택 중이면 선택 해제 (E-2, 인접 자동 선택 없음) */
  const handleRemove = (index: number) => {
    const removedId = heirs[index].id;
    onChange(heirs.filter((_, i) => i !== index));
    if (selectedHeirId === removedId) setSelectedHeirId(null);
  };

  /** 1단계 종류 선택 처리 */
  const handleKindPick = (kind: AddKind) => {
    switch (kind) {
      case "heir":
        setAddStep("relation");
        setPendingKind("heir");
        break;
      case "legatee":
        handleAdd("legatee");
        break;
      case "corporate":
        handleAdd("corporate");
        break;
      case "substitute":
        handleAddSubstitute();
        break;
      case "other":
        handleAdd("other");
        break;
    }
  };

  // ----------------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* 헤더 — ② 섹션 타이틀(번호·제목) + 우측 6명·추가버튼 (동거가족 ③과 동형) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            상속인·수유자 구성
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {heirs.length > 0 && (
            <span className="text-xs text-gray-400">{heirs.length}명</span>
          )}
          {/* picker 열림 시 숨김 — 추가 버튼과 picker는 상호배타 (KindButton "상속인" 텍스트 충돌 방지) */}
          {!showAddPanel && (
            <button
              type="button"
              onClick={() => {
                setShowAddPanel(true);
                setAddStep("kind");
              }}
              className="shrink-0 rounded-md border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-200 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
            >
              + 상속인 추가
            </button>
          )}
        </div>
      </div>

      {/* 추가 picker 패널 — 헤더 아래 (showAddPanel 시 펼침) */}
      {showAddPanel && (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          {addStep === "kind" && (
            <>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                종류 선택 (1단계)
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(["heir", "legatee", "substitute", "corporate", "other"] as AddKind[]).map(
                  (k) => (
                    <KindButton key={k} kind={k} onPick={handleKindPick} />
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddPanel(false);
                  setAddStep(null);
                  setPendingKind(null);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                취소
              </button>
            </>
          )}

          {addStep === "relation" && pendingKind === "heir" && (
            <>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                관계 선택 (2단계 — 상속인)
              </p>
              <PersonRelationPicker onPick={handleAdd} />
              <button
                type="button"
                onClick={() => {
                  setAddStep("kind");
                  setPendingKind(null);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ← 종류 선택으로
              </button>
            </>
          )}
        </div>
      )}

      {/* 요약 테이블 (E-3: heirs 0명이면 미표시) */}
      {heirs.length > 0 && (
        <HeirTableView
          heirs={heirs}
          selectedHeirId={selectedHeirId}
          onSelect={handleSelect}
          deathDate={deathDate}
        />
      )}

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
      <Dialog
        open={selectedHeirId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedHeirId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg w-full p-0"
          showCloseButton={false}
        >
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>상속인 편집</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3">
            {selectedHeir && (
              <HeirEditor
                heir={selectedHeir}
                index={selectedIndex}
                deathDate={deathDate}
                allHeirs={heirs}
                onUpdate={(updated) => handleUpdate(selectedIndex, updated)}
                onRemove={() => {
                  handleRemove(selectedIndex);
                }}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedHeirId(null)}
              className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
