"use client";

/**
 * CohabitantDependentSection — 동거가족 인적공제 입력 (§20 P1, 시령 §18①)
 *
 * Step 0 HeirComposition 하단. 비상속인 부양 직계존비속·형제자매.
 * 구조: 요약 테이블(CohabitantTableView) + 편집 모달(Dialog) + 추가/삭제.
 *
 * 3-state: undefined=OFF / []=ON 빈 / [...]=ON 데이터
 * 행 클릭 → 모달 오픈. 추가 직후 자동 선택 → 모달 자동 오픈.
 * 삭제 → 선택 해제 → 모달 닫힘.
 * 모달 닫기만(실시간 onChange 반영 — 저장/취소·폐기확인 불필요).
 *
 * 설계: docs/02-design/features/inheritance-cohabitant-table-view.ui.design.md
 */

import { useState } from "react";
import { differenceInYears } from "date-fns";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CohabitantTableView } from "@/components/calc/CohabitantTableView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CohabitantDependent } from "@/lib/tax-engine/types/inheritance-gift.types";

const RELATION_OPTIONS = [
  { value: "lineal_descendant", label: "직계비속(손자녀)" },
  { value: "lineal_ascendant", label: "직계존속(부모·조부모·장인·장모)" },
  { value: "sibling", label: "형제자매" },
];

// ============================================================
// ID 생성 (오케스트레이터 전용)
// ============================================================

let _nextDepId = 1;
function generateDepId() {
  return `cohabitant-${Date.now()}-${_nextDepId++}`;
}

// ============================================================
// DepEditor — 단일 동거가족 편집 폼 (모달 내부)
// ============================================================

interface DepEditorProps {
  dep: CohabitantDependent;
  deathDate: string;
  onUpdate: (patch: Partial<CohabitantDependent>) => void;
  onRemove: () => void;
}

function DepEditor({ dep, deathDate, onUpdate, onRemove }: DepEditorProps) {
  const age =
    dep.birthDate && deathDate
      ? (() => {
          try {
            const death = new Date(deathDate);
            const birth = new Date(dep.birthDate!);
            if (isNaN(death.getTime()) || isNaN(birth.getTime())) return null;
            return differenceInYears(death, birth);
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <div className="space-y-3">
      {/* 관계 (시령 §18① — 직계존비속·형제자매) */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          관계
        </p>
        <RadioCardGroup
          name={`cohabitant-relation-${dep.id}`}
          tone="sky"
          layout="stack"
          value={dep.relation}
          onChange={(v) =>
            onUpdate({ relation: v as CohabitantDependent["relation"] })
          }
          options={RELATION_OPTIONS}
        />
      </div>

      {/* 성명 (선택) */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          성명 (선택)
        </p>
        <input
          type="text"
          value={dep.name ?? ""}
          onChange={(e) => onUpdate({ name: e.target.value || undefined })}
          placeholder="성명"
          className="w-full rounded-md border border-sky-200 bg-background px-2.5 py-1.5 text-sm dark:border-sky-800"
        />
      </div>

      {/* 생년월일 (미성년·연로자 판정) */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          생년월일{" "}
          {age !== null && (
            <span className="text-sky-600 dark:text-sky-400 font-normal">
              (상속개시일 현재 만 {age}세)
            </span>
          )}
        </p>
        <DateInput
          value={dep.birthDate ?? ""}
          onChange={(v) => onUpdate({ birthDate: v || undefined })}
        />
        {!dep.birthDate && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            생년월일을 입력해야 미성년·연로자·장애인공제를 계산합니다.
          </p>
        )}
      </div>

      {/* 장애인 + 성별 (§20①4호) */}
      <ToggleCard
        tone="violet"
        size="sm"
        title="장애인"
        description="성별·연령별 기대여명(년) × 1,000만원 (§20①4호, 2023 생명표)"
        checked={dep.isDisabled ?? false}
        onCheckedChange={(v) =>
          onUpdate({ isDisabled: v, gender: v ? dep.gender : undefined })
        }
      />
      {dep.isDisabled === true && (
        <div className="ml-4 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            장애인 성별 (§20①4호 — 성별·연령별 기대여명 기준)
          </p>
          <RadioCardGroup
            name={`cohabitant-gender-${dep.id}`}
            tone="violet"
            layout="inline"
            value={dep.gender ?? ""}
            onChange={(v) => onUpdate({ gender: v as "male" | "female" })}
            options={[
              { value: "male", label: "남성" },
              { value: "female", label: "여성" },
            ]}
          />
          {!dep.gender && (
            <p className="text-[11px] text-violet-600 dark:text-violet-400">
              성별을 선택해야 장애인공제 기대여명을 계산합니다.
            </p>
          )}
        </div>
      )}

      {/* 삭제 버튼 */}
      <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
        >
          이 동거가족 삭제
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CohabitantDependentSection — 메인 export
// ============================================================

interface Props {
  value: CohabitantDependent[] | undefined;
  onChange: (next: CohabitantDependent[] | undefined) => void;
  deathDate: string;
}

export function CohabitantDependentSection({
  value,
  onChange,
  deathDate,
}: Props) {
  // 로컬 ephemeral 상태 — zustand 금지
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);

  const deps = value ?? [];

  // 선택된 dep 파생
  const selectedIndex = deps.findIndex((d) => d.id === selectedDepId);
  const selectedDep = selectedIndex >= 0 ? deps[selectedIndex] : null;

  // ----------------------------------------------------------------
  // 핸들러
  // ----------------------------------------------------------------

  const handleSelect = (id: string) => {
    setSelectedDepId(id);
  };

  const handleAdd = () => {
    const newDep: CohabitantDependent = {
      id: generateDepId(),
      relation: "lineal_descendant",
    };
    onChange([...deps, newDep]);
    setSelectedDepId(newDep.id); // 추가 직후 자동 선택 → 모달 자동 오픈
  };

  const handleUpdate = (id: string, patch: Partial<CohabitantDependent>) => {
    onChange(deps.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleRemove = (id: string) => {
    const next = deps.filter((d) => d.id !== id);
    // 3-state: length 0 → undefined(OFF)
    onChange(next.length > 0 ? next : undefined);
    // 삭제된 row가 선택 중이면 선택 해제 → 모달 닫힘
    if (selectedDepId === id) setSelectedDepId(null);
  };

  // ----------------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------------

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20 p-3 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
          동거가족 (인적공제 대상 부양가족) — §20·시령 §18①
        </p>
        <button
          type="button"
          onClick={handleAdd}
          className="shrink-0 rounded-md border border-sky-300 bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
        >
          + 동거가족 추가
        </button>
      </div>

      {/* 안내문 */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        상속인이 아니지만 피상속인이 상속개시일 현재{" "}
        <strong>사실상 부양</strong>한 직계존비속(배우자의 직계존속 포함)·형제자매.
        미성년·연로자·장애인공제 대상입니다 (자녀공제 제외). 수유자·영리법인은 대상이
        아닙니다.
      </p>

      {/* 요약 테이블 (deps 0명이면 미표시) */}
      {deps.length > 0 && (
        <CohabitantTableView
          deps={deps}
          selectedDepId={selectedDepId}
          onSelect={handleSelect}
          deathDate={deathDate}
        />
      )}

      {/* 빈 상태 안내 */}
      {deps.length === 0 && (
        <p className="text-[11px] text-sky-600 dark:text-sky-400">
          동거가족이 있으면 &quot;+ 동거가족 추가&quot;를 눌러 입력하세요.
        </p>
      )}

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
      <Dialog
        open={selectedDepId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDepId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg w-full p-0" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>동거가족 편집</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3">
            {selectedDep && (
              <DepEditor
                dep={selectedDep}
                deathDate={deathDate}
                onUpdate={(patch) => handleUpdate(selectedDep.id, patch)}
                onRemove={() => handleRemove(selectedDep.id)}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedDepId(null)}
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
