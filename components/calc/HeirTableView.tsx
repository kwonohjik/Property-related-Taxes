"use client";

/**
 * HeirTableView.tsx — 상속인·수유자 구성 요약 테이블
 *
 * 행 전체 클릭 → onSelect(heir.id) → 모달 오픈 구조.
 * 라디오 컬럼 제거. 맨 우측 "✎ 편집" 아이콘 힌트만 표시.
 * deriveHeirKind: isForProfitCorporate 단일 진실 (inheritance-gift-common import).
 * 미성년 배지: differenceInYears(deathDate, birthDate) < 19 (정정 #1, isMinorFromRrn 없음).
 *
 * 설계: docs/02-design/features/inheritance-heir-table-view.ui.design.md §8
 */

import type { Heir, HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";
import { HEIR_RELATION_LABELS } from "@/components/calc/inheritance/heir-relation-meta";
import { parseResidentNumber } from "@/lib/calc/resident-number";
import { differenceInYears } from "date-fns";

// ============================================================
// 타입 정의
// ============================================================

/** 테이블 종류 컬럼 표시용 (6값, 영리/비영리 분리) */
type HeirKind =
  | "heir"           // 상속인 (법정상속인)
  | "legatee"        // 수유자
  | "substitute"     // 대습상속인
  | "for_profit_corp"    // 영리법인
  | "non_profit_corp"    // 비영리법인
  | "other";         // 기타

// ============================================================
// 종류 파생 헬퍼 (single-source-engine-helper: isForProfitCorporate import)
// ============================================================

function deriveHeirKind(heir: Heir): HeirKind {
  if (heir.relation === "legatee") return "legatee";
  if (heir.relation === "corporate") {
    return isForProfitCorporate(heir) ? "for_profit_corp" : "non_profit_corp";
  }
  // other + substituteGroupId 존재 → 대습상속인
  if (heir.substituteGroupId !== undefined) return "substitute";
  if (heir.relation === "other") return "other";
  // spouse | child | lineal_ascendant | sibling
  return "heir";
}

// ============================================================
// 정적 라벨·배지 매핑 (Tailwind 동적 클래스 금지 — feedback_tailwind_static_tone_mapping)
// ============================================================

const HEIR_KIND_LABELS: Record<HeirKind, string> = {
  heir: "상속인",
  legatee: "수유자",
  substitute: "대습상속인",
  for_profit_corp: "영리법인",
  non_profit_corp: "비영리법인",
  other: "기타",
};

/**
 * 이름 미입력 fallback 라벨 (heir-id 노출 금지 — feedback_no_internal_id_in_result)
 */
const CATEGORY_FALLBACK_LABEL: Record<HeirRelation, string> = {
  spouse: "(배우자)",
  child: "(자녀)",
  lineal_ascendant: "(직계존속)",
  sibling: "(형제자매)",
  other: "(기타)",
  legatee: "(수유자)",
  corporate: "(법인)",
};

/** 배지 tone 정적 클래스 매핑 */
const BADGE_TONE_CLASSES: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

// ============================================================
// 관계 컬럼 표시 헬퍼
// ============================================================

function deriveRelationDisplay(heir: Heir): string {
  const kind = deriveHeirKind(heir);
  switch (kind) {
    case "heir":
      return HEIR_RELATION_LABELS[heir.relation];
    case "legatee":
      return heir.isGenerationSkipBeneficiary ? "손자녀 (세대생략)" : "—";
    case "substitute": {
      const baseLabel =
        heir.substituteForRelation === "child" ? "자녀 대습"
        : heir.substituteForRelation === "sibling" ? "형제자매 대습"
        : "대습";
      return heir.substituteAncestorName
        ? `${baseLabel} (故 ${heir.substituteAncestorName})`
        : baseLabel;
    }
    case "for_profit_corp":
    case "non_profit_corp":
      return "법인";
    case "other":
    default:
      return "—";
  }
}

// ============================================================
// 배지 컴포넌트
// ============================================================

function Badge({ text, tone }: { text: string; tone: string }) {
  const cls = BADGE_TONE_CLASSES[tone] ?? BADGE_TONE_CLASSES.sky;
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>
      {text}
    </span>
  );
}

// ============================================================
// HeirTableRow — 개별 행 (클릭 전체 → 편집 모달 오픈)
// ============================================================

interface HeirTableRowProps {
  heir: Heir;
  isSelected: boolean;
  onSelect: () => void;
  deathDate?: string;
}

function HeirTableRow({ heir, isSelected, onSelect, deathDate }: HeirTableRowProps) {
  const kind = deriveHeirKind(heir);
  const relationDisplay = deriveRelationDisplay(heir);
  const nameDisplay = heir.name?.trim() || CATEGORY_FALLBACK_LABEL[heir.relation];

  // 생년월일·성별 표시
  const parsedRrn = parseResidentNumber(heir.residentNumber ?? "");
  const isCorporate = heir.relation === "corporate";

  let birthGenderDisplay: React.ReactNode;
  let rrnMissing = false;

  if (isCorporate) {
    birthGenderDisplay = <span className="text-gray-400">—</span>;
  } else if (parsedRrn) {
    const genderLabel = parsedRrn.gender === "male" ? "남" : "여";
    birthGenderDisplay = `${parsedRrn.birthDate} · ${genderLabel}`;
  } else if (heir.birthDate) {
    // 주민번호 미입력이나 birthDate 직접입력이 있는 경우
    birthGenderDisplay = heir.birthDate;
    rrnMissing = true; // 주민번호 없으므로 경고
  } else {
    // 미입력
    rrnMissing = true;
    birthGenderDisplay = (
      <span className={`${BADGE_TONE_CLASSES.amber} inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full`}>
        미입력
      </span>
    );
  }

  // 미성년 배지 조건 (정정 #1: differenceInYears 직접 계산, isMinorFromRrn 없음)
  const birthDateForMinor = parsedRrn?.birthDate ?? heir.birthDate;
  const isMinor =
    !isCorporate &&
    !!birthDateForMinor &&
    !!deathDate &&
    (() => {
      try {
        const death = new Date(deathDate);
        const birth = new Date(birthDateForMinor);
        if (isNaN(death.getTime()) || isNaN(birth.getTime())) return false;
        return differenceInYears(death, birth) < 19;
      } catch {
        return false;
      }
    })();

  // 특이사항 배지 목록
  const badges: React.ReactNode[] = [];
  if (heir.isDisabled) badges.push(<Badge key="disabled" text="장애인" tone="violet" />);
  if (heir.isCohabitant) badges.push(<Badge key="cohabit" text="동거주택" tone="violet" />);
  if (heir.isGenerationSkipBeneficiary) badges.push(<Badge key="genSkip" text="세대생략" tone="rose" />);
  if (heir.substituteGroupId !== undefined) badges.push(<Badge key="subst" text="대습 §1001" tone="amber" />);
  if (kind === "for_profit_corp") badges.push(<Badge key="forProfit" text="영리법인" tone="sky" />);
  if (kind === "non_profit_corp") badges.push(<Badge key="nonProfit" text="비영리법인" tone="sky" />);
  if (isMinor) badges.push(<Badge key="minor" text="미성년" tone="rose" />);

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
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 " +
        (isSelected
          ? "bg-violet-50/70 dark:bg-violet-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
      data-testid={`heir-table-row-${heir.id}`}
    >
      {/* 종류 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs">
        {HEIR_KIND_LABELS[kind]}
      </td>
      {/* 관계 */}
      <td className="pl-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">
        {relationDisplay}
      </td>
      {/* 이름 */}
      <td className="pl-2 py-1.5 text-xs font-medium">
        {nameDisplay}
      </td>
      {/* 생년월일·성별 (주민번호 미입력 자연인은 amber 경고) */}
      <td className={`pl-2 py-1.5 text-xs font-mono ${rrnMissing && !isCorporate && !heir.birthDate ? "" : "text-gray-500"}`}>
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
// HeirTableView — 메인 export
// ============================================================

export interface HeirTableViewProps {
  heirs: Heir[];
  selectedHeirId: string | null;
  onSelect: (id: string) => void;
  deathDate?: string;
}

export function HeirTableView({ heirs, selectedHeirId, onSelect, deathDate }: HeirTableViewProps) {
  if (heirs.length === 0) return null;

  return (
    <div className="overflow-x-auto" role="group" aria-label="상속인·수유자 목록">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">종류</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">관계</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">이름</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">생년월일·성별</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">특이사항</th>
            <th className="w-8 py-2 text-right pr-3 text-gray-400 font-medium text-[10px]">편집</th>
          </tr>
        </thead>
        <tbody>
          {heirs.map((heir) => (
            <HeirTableRow
              key={heir.id}
              heir={heir}
              isSelected={heir.id === selectedHeirId}
              onSelect={() => onSelect(heir.id)}
              deathDate={deathDate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
