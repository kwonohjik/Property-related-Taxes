"use client";

/**
 * CohabitantTableView.tsx — 동거가족 (인적공제 §20·시령§18①) 요약 테이블
 *
 * 행 전체 클릭 → onSelect(dep.id) → 모달 오픈 구조.
 * 라디오 컬럼 없음 — 전부 동거가족 단일 종류.
 * 맨 우측 "✎ 편집" 아이콘 힌트만 표시.
 * 미입력(birthDate 없음) → amber 경고 배지 (미성년·연로자 판정 불가).
 * 장애인 → violet 배지.
 * 이름 fallback: name?.trim() || "(동거가족)" — id 노출 금지.
 *
 * 설계: docs/02-design/features/inheritance-cohabitant-table-view.ui.design.md
 */

import { differenceInYears } from "date-fns";
import type { CohabitantDependent } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 정적 라벨 (Tailwind 동적 클래스 금지 — feedback_tailwind_static_tone_mapping)
// ============================================================

const RELATION_LABELS: Record<CohabitantDependent["relation"], string> = {
  lineal_descendant: "직계비속(손자녀)",
  lineal_ascendant: "직계존속(부모·조부모·장인·장모)",
  sibling: "형제자매",
};

/** 배지 tone 정적 클래스 매핑 */
const BADGE_TONE_CLASSES: Record<string, string> = {
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

// ============================================================
// Badge 컴포넌트
// ============================================================

function Badge({ text, tone }: { text: string; tone: string }) {
  const cls = BADGE_TONE_CLASSES[tone] ?? BADGE_TONE_CLASSES.sky;
  return (
    <span
      className={`inline-flex items-center text-micro px-1.5 py-0.5 rounded-full ${cls}`}
    >
      {text}
    </span>
  );
}

// ============================================================
// CohabitantTableRow — 개별 행
// ============================================================

interface RowProps {
  dep: CohabitantDependent;
  isSelected: boolean;
  onSelect: () => void;
  deathDate?: string;
}

function CohabitantTableRow({ dep, isSelected, onSelect, deathDate }: RowProps) {
  // 이름 fallback — id 노출 금지 (feedback_no_internal_id_in_result)
  const nameDisplay = dep.name?.trim() || "(동거가족)";

  // 생년월일·성별 표시
  const birthMissing = !dep.birthDate;
  let birthGenderDisplay: React.ReactNode;

  if (birthMissing) {
    birthGenderDisplay = (
      <span
        className={`${BADGE_TONE_CLASSES.amber} inline-flex items-center text-micro px-1.5 py-0.5 rounded-full`}
      >
        미입력
      </span>
    );
  } else {
    const genderLabel =
      dep.gender === "male" ? " · 남" : dep.gender === "female" ? " · 여" : "";
    birthGenderDisplay = `${dep.birthDate}${genderLabel}`;
  }

  // 나이 계산 (미성년·연로자 배지용)
  const age =
    dep.birthDate && deathDate
      ? (() => {
          try {
            const death = new Date(deathDate);
            const birth = new Date(dep.birthDate);
            if (isNaN(death.getTime()) || isNaN(birth.getTime())) return null;
            return differenceInYears(death, birth);
          } catch {
            return null;
          }
        })()
      : null;

  const isMinor = age !== null && age < 19;
  const isElderly = age !== null && age >= 65;

  // 특이사항 배지
  const badges: React.ReactNode[] = [];
  if (dep.isDisabled) badges.push(<Badge key="disabled" text="장애인" tone="violet" />);
  if (isMinor) badges.push(<Badge key="minor" text="미성년" tone="amber" />);
  if (isElderly) badges.push(<Badge key="elderly" text="연로자" tone="sky" />);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={`${nameDisplay} 편집`}
      data-testid={`cohabitant-table-row-${dep.id}`}
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 " +
        (isSelected
          ? "bg-sky-50/70 dark:bg-sky-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
    >
      {/* 관계 */}
      <td className="pl-3 py-1.5 text-xs text-gray-600 dark:text-gray-400">
        {RELATION_LABELS[dep.relation]}
      </td>
      {/* 이름 */}
      <td className="pl-2 py-1.5 text-xs font-medium">{nameDisplay}</td>
      {/* 생년월일·성별 */}
      <td
        className={`pl-2 py-1.5 text-xs font-mono ${
          birthMissing ? "" : "text-gray-500"
        }`}
      >
        {birthGenderDisplay}
      </td>
      {/* 특이사항 배지 */}
      <td className="pl-2 py-1.5">
        <div className="flex flex-wrap gap-1">{badges}</div>
      </td>
      {/* 편집 아이콘 힌트 */}
      <td className="pr-3 py-1.5 text-right text-gray-300 dark:text-gray-600 text-xs select-none">
        ✎
      </td>
    </tr>
  );
}

// ============================================================
// CohabitantTableView — 메인 export
// ============================================================

export interface CohabitantTableViewProps {
  deps: CohabitantDependent[];
  selectedDepId: string | null;
  onSelect: (id: string) => void;
  deathDate?: string;
}

export function CohabitantTableView({
  deps,
  selectedDepId,
  onSelect,
  deathDate,
}: CohabitantTableViewProps) {
  if (deps.length === 0) return null;

  return (
    <div className="overflow-x-auto" role="group" aria-label="동거가족 목록">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">
              관계
            </th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              이름
            </th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              생년월일·성별
            </th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              특이사항
            </th>
            <th className="w-8 py-2 text-right pr-3 text-gray-400 font-medium text-micro">
              편집
            </th>
          </tr>
        </thead>
        <tbody>
          {deps.map((dep) => (
            <CohabitantTableRow
              key={dep.id}
              dep={dep}
              isSelected={dep.id === selectedDepId}
              onSelect={() => onSelect(dep.id)}
              deathDate={deathDate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
