"use client";

/**
 * HeirEditor.tsx — 개별 상속인 편집 카드
 *
 * HeirComposition.tsx(800줄 정책)에서 분리.
 * changeHeirRelation + HeirEditor 컴포넌트 전담.
 */

import type {
  Heir,
  HeirRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { useState, useMemo } from "react";
import { differenceInYears } from "date-fns";
import { CorporateHeirFields } from "@/components/calc/inheritance/CorporateHeirFields";
import {
  HEIR_RELATION_LABELS,
  HEIR_RELATIONS,
  SPECIAL_RELATIONS,
} from "@/components/calc/inheritance/heir-relation-meta";
import { isCohabitDeductionEligibleRelation } from "@/lib/tax-engine/deductions/inheritance-cohabit-helpers";
import { deriveIsHeirFromHeir } from "@/lib/calc/prior-gift-donee-derive";
import { CohabitRequirementBlock } from "@/components/calc/inheritance/CohabitRequirementBlock";
import { SubstituteHeirPanel } from "@/components/calc/inheritance/SubstituteHeirPanel";
import { parseResidentNumber } from "@/lib/calc/resident-number";

// ============================================================
// 관계 메타 (라벨은 공유 모듈에서 import)
// ============================================================

const RELATION_LABELS = HEIR_RELATION_LABELS;

const RELATION_ICONS: Record<HeirRelation, string> = {
  spouse: "💑",
  child: "👶",
  lineal_ascendant: "👴",
  sibling: "🤝",
  other: "👤",
  legatee: "📜",
  corporate: "🏢",
};

// ============================================================
// 관계 변경 시 정합성 정리
// ============================================================

/**
 * 이미 추가된 상속인/수유자/법인의 관계(relation)를 변경할 때, 새 관계에서 의미 없는
 * 입력 필드를 정리한다. id·이름·자산 협의분할(heirAllocations 참조)은 보존되므로
 * 삭제·재추가와 달리 배분 데이터가 소실되지 않는다.
 */
export function changeHeirRelation(heir: Heir, newRelation: HeirRelation): Heir {
  if (heir.relation === newRelation) return heir;

  const next: Heir = { ...heir, relation: newRelation };
  // B-2 (2026-06-01): legatee 추가 — §27 미성년 판정용 생년월일 보존
  const showBirthDate =
    newRelation === "child" ||
    newRelation === "lineal_ascendant" ||
    newRelation === "sibling" ||
    newRelation === "legatee";

  if (newRelation === "corporate") {
    // 법인 — 자연인 전용 필드 제거 (주민번호는 사업자등록번호로 대체)
    next.residentNumber = undefined;
    next.gender = undefined;
    next.birthDate = undefined;
    next.isDisabled = undefined;
    next.isCohabitant = undefined;
    next.isGenerationSkipBeneficiary = undefined;
    next.isMinorOverride = undefined;
    next.isSubstituteInheritance = undefined;
  } else {
    // 자연인 — 법인 전용 필드 제거
    next.isForProfit = undefined;
    next.shareholders = undefined;
    next.businessRegistrationNumber = undefined;
    next.businessAddress = undefined;
    next.corporateGiftComputedTax = undefined;
    // 동거주택(§23의2): G5 적격 관계 외(legatee-순수세대생략·child·대습배우자other)면 해제
    if (!isCohabitDeductionEligibleRelation(next, undefined)) {
      next.isCohabitant = undefined;
      next.cohabitStartDate = undefined;
      next.cohabitExcludedYears = undefined;
      next.cohabitReasons = undefined;
    }
    // 세대생략 체크는 legatee 전용 — legatee 외로 변경 시 제거
    if (newRelation !== "legatee") {
      next.isGenerationSkipBeneficiary = undefined;
      next.isMinorOverride = undefined;
      next.isSubstituteInheritance = undefined;
    }
    // 생년월일 UI 비대상 관계면 제거 (보이지 않는 데이터의 공제 영향 차단)
    if (!showBirthDate) next.birthDate = undefined;
  }

  // 대습상속(§1001) 필드는 "기타(other)" 전용 — 다른 관계로 변경 시 정리(stale 법정상속분 오염 차단)
  if (newRelation !== "other") {
    next.substituteGroupId = undefined;
    next.substituteForRelation = undefined;
    next.substituteRole = undefined;
    next.substituteAncestorName = undefined;
  }

  // 상속인 여부(isHeir)는 "기타(other)" 전용 명시값 — 관계 전이 시 정리.
  //   진입: 기본 비상속인(false, handleAdd와 동일) — 며느리·사위 등 §13①2호 5년.
  //   이탈: relation 추론 복원(undefined) — false 잔존 시 자녀 등이 비상속인 처리되는 치명 경로 차단(T-4).
  if (newRelation === "other") {
    next.isHeir = false;
  } else {
    next.isHeir = undefined;
  }

  return next;
}

// ============================================================
// 관계 추가 버튼 (RelationPickerGrid 전용)
// ============================================================

interface RelationButtonProps {
  relation: HeirRelation;
  onAdd: (r: HeirRelation) => void;
  isCurrent?: boolean;
}

export function RelationButton({ relation, onAdd, isCurrent }: RelationButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(relation)}
      aria-current={isCurrent ? "true" : undefined}
      className={
        "relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-colors text-xs " +
        (isCurrent
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-300 dark:ring-indigo-600"
          : "border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20")
      }
    >
      <span className="text-xl">{RELATION_ICONS[relation]}</span>
      <span className="text-gray-600 dark:text-gray-300 text-center leading-tight">
        {RELATION_LABELS[relation]}
      </span>
      {isCurrent && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-micro font-bold leading-none text-white">
          현재
        </span>
      )}
    </button>
  );
}

/**
 * 관계 선택 그리드 — 편집 카드 "관계 변경" 전용.
 * 법정상속인 5종 + 상속인 외(수유자·법인) 2종을 동일 레이아웃으로 노출.
 * currentRelation 전달 시 해당 버튼에 "현재" 배지 강조.
 *
 * 추가 흐름에는 사용 금지(SPECIAL_RELATIONS 포함). 추가 상속인 관계 단계는 PersonRelationPicker(4종).
 */
export function RelationPickerGrid({
  onPick,
  currentRelation,
}: {
  onPick: (r: HeirRelation) => void;
  currentRelation?: HeirRelation;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {HEIR_RELATIONS.map((r) => (
          <RelationButton
            key={r}
            relation={r}
            onAdd={onPick}
            isCurrent={r === currentRelation}
          />
        ))}
      </div>
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-micro font-medium text-violet-700 dark:text-violet-300 mb-1">
          수유자(유증)·영리법인 — 상속인 외 (§19·§24 유증액 · §3의2② 부표 5)
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SPECIAL_RELATIONS.map((r) => (
            <RelationButton
              key={r}
              relation={r}
              onAdd={onPick}
              isCurrent={r === currentRelation}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
// 개별 상속인 편집기
// ============================================================

export interface HeirEditorProps {
  heir: Heir;
  index: number;
  deathDate?: string;
  /** 상속인 목록 전체 — CorporateHeirFields ⑦ 드롭다운 자동채움용 */
  allHeirs: Heir[];
  onUpdate: (updated: Heir) => void;
  onRemove: () => void;
}

export function HeirEditor({ heir, index, deathDate, allHeirs, onUpdate, onRemove }: HeirEditorProps) {
  const set = (patch: Partial<Heir>) => onUpdate({ ...heir, ...patch });
  const [changingRelation, setChangingRelation] = useState(false);

  const isLegatee = heir.relation === "legatee";
  // B-2 (2026-06-01): legatee 추가 (§27 미성년 판정용)
  const showBirthDate =
    heir.relation === "child" ||
    heir.relation === "lineal_ascendant" ||
    heir.relation === "sibling" ||
    isLegatee;
  // Phase 2 G5: 엔진 헬퍼로 §23의2①1호 적격 관계 판정
  const showCohabitant = isCohabitDeductionEligibleRelation(heir, deathDate);
  const isCorporate = heir.relation === "corporate";
  // 대습상속(§1001) — "기타(other)" 전용
  const isSubstituteEligible = heir.relation === "other";

  // 주민번호 앞 7자리 → 생년월일·성별 도출 (단일 출처)
  const parsedRrn = useMemo(
    () => parseResidentNumber(heir.residentNumber ?? ""),
    [heir.residentNumber],
  );

  const hasDerivedBirthDate = parsedRrn !== null;

  // 주민번호 입력 처리 — 파싱 성공 시 birthDate·gender 동시 set
  const setResidentNumber = (raw: string) => {
    const value = raw || undefined;
    const parsed = raw ? parseResidentNumber(raw) : null;
    if (parsed) {
      set({
        residentNumber: value,
        birthDate: parsed.birthDate,
        gender: parsed.gender,
      });
    } else {
      set({ residentNumber: value });
    }
  };

  // B-3 미성년 자동 판정 — birthDate + deathDate 있을 때만
  const autoIsMinor = useMemo(() => {
    if (!heir.birthDate || !deathDate) return null;
    try {
      const death = new Date(deathDate);
      const birth = new Date(heir.birthDate);
      if (isNaN(death.getTime()) || isNaN(birth.getTime())) return null;
      return differenceInYears(death, birth) < 19;
    } catch {
      return null;
    }
  }, [heir.birthDate, deathDate]);

  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"
      data-testid={`heir-editor-${index}`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{RELATION_ICONS[heir.relation]}</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            {index + 1}. {RELATION_LABELS[heir.relation]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setChangingRelation((v) => !v)}
            aria-expanded={changingRelation}
            aria-label="관계 변경"
            data-testid={`heir-change-relation-${index}`}
            className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
          >
            관계 변경
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 관계 변경 — 잘못 선택한 경우 삭제·재추가 없이 교정 (이름·자산 배분 보존) */}
      {changingRelation && (
        <div
          className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/20 p-3 space-y-2"
          data-testid={`heir-relation-picker-${index}`}
        >
          <p className="text-caption font-medium text-indigo-700 dark:text-indigo-300">
            변경할 관계를 선택하세요 — 관계에 맞지 않는 입력값(법인·자연인 전용)은 자동
            정리됩니다
          </p>
          <RelationPickerGrid
            currentRelation={heir.relation}
            onPick={(r) => {
              onUpdate(changeHeirRelation(heir, r));
              setChangingRelation(false);
            }}
          />
        </div>
      )}

      {/* 이름 (선택) */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          이름 (선택)
        </label>
        <input
          type="text"
          value={heir.name ?? ""}
          onChange={(e) => set({ name: e.target.value || undefined })}
          placeholder="예: 홍길동"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 주민등록번호 (필수, 법인 제외) — 앞 6자리에서 생년월일·성별 자동 도출 */}
      {!isCorporate && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            주민등록번호 <span className="text-rose-600">(필수)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={heir.residentNumber ?? ""}
            onChange={(e) => setResidentNumber(e.target.value)}
            placeholder="앞 6자리-뒤 7자리"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasDerivedBirthDate ? (
            <p className="text-caption text-emerald-600 dark:text-emerald-400">
              생년월일 <strong>{parsedRrn!.birthDate}</strong> ·{" "}
              {parsedRrn!.gender === "male" ? "남성" : "여성"} 자동 도출 (미성년·연로자·장애인
              공제 판정에 사용)
            </p>
          ) : (
            heir.residentNumber && (
              <p className="text-caption text-amber-600 dark:text-amber-400">
                생년월일을 도출할 수 없습니다. 앞 7자리를 확인하거나, 아래에서 생년월일을 직접
                입력하세요.
              </p>
            )
          )}
        </div>
      )}

      {/* 생년월일 — 주민번호로 도출되지 않은 경우의 보조입력 */}
      {showBirthDate && !hasDerivedBirthDate && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            생년월일{" "}
            {heir.relation === "child" && (
              <span className="text-amber-600">(미성년자 여부 판별용)</span>
            )}
            {heir.relation === "lineal_ascendant" && (
              <span className="text-amber-600">(만 65세 이상 연로자 공제 판별용)</span>
            )}
            {isLegatee && (
              <span className="text-rose-600">(40% 할증·미성년 판별용 — §27②)</span>
            )}
          </label>
          <DateInput
            value={heir.birthDate ?? ""}
            onChange={(v) => set({ birthDate: v || undefined })}
          />
        </div>
      )}

      {/* B-1/B-3 — legatee 전용: 세대생략 할증 토글 + 미성년 3-state override */}
      {isLegatee && (
        <>
          <ToggleCard
            tone="rose"
            title="§27 세대생략 할증 대상 — 자녀를 건너뛴 직계비속 유증(손자녀 등)"
            description="ON 시: 산출세액 × (유증분 / 과세가액) × 30% (미성년+20억 초과 40%) 할증 자동 산출"
            checked={heir.isGenerationSkipBeneficiary ?? false}
            onCheckedChange={(v) =>
              set({
                isGenerationSkipBeneficiary: v || undefined,
                isMinorOverride: v ? heir.isMinorOverride : undefined,
                isSubstituteInheritance: v ? heir.isSubstituteInheritance : undefined,
              })
            }
          />

          {/* §27 단서 — 대습상속 할증 배제 (gen-skip ON일 때만) */}
          {heir.isGenerationSkipBeneficiary && (
            <ToggleCard
              tone="rose"
              title="대습상속 (민법 §1001) — §27 할증 배제"
              description="손자녀가 사망·결격된 부모(피상속인의 자녀)를 갈음하여 상속하는 경우. ON 시 세대생략 할증(30%·40%) 전액 배제."
              checked={heir.isSubstituteInheritance ?? false}
              onCheckedChange={(v) => set({ isSubstituteInheritance: v || undefined })}
            />
          )}

          {/* 미성년 3-state override — 세대생략 ON + birthDate 입력 시만 표시 */}
          {heir.isGenerationSkipBeneficiary && heir.birthDate && autoIsMinor !== null && (
            <div className="ml-4 rounded-lg border border-rose-200 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-900/20 p-3 space-y-2">
              <p className="text-caption text-rose-700 dark:text-rose-300">
                상속개시일 기준 미성년자 (자동 판정:{" "}
                <strong>{autoIsMinor ? "예 (미성년)" : "아니오 (성년)"}</strong>)
                {autoIsMinor && (
                  <span className="ml-1 text-rose-600">
                    — 과세표준 20억 초과 시 40% 할증 적용
                  </span>
                )}
              </p>
              <ToggleCard
                tone="rose"
                size="sm"
                title="미성년 판정 수동 변경"
                description="자동 판정 결과를 재정의합니다 (연령기준 개정 대비)"
                checked={heir.isMinorOverride !== undefined}
                onCheckedChange={(v) =>
                  set({ isMinorOverride: v ? autoIsMinor : undefined })
                }
              >
                {heir.isMinorOverride !== undefined && (
                  <ToggleCard
                    tone="rose"
                    size="sm"
                    title="미성년자로 처리"
                    description="ON: 미성년 (40% 할증 적용 가능) / OFF: 성년 (30% 할증)"
                    checked={heir.isMinorOverride}
                    onCheckedChange={(v) => set({ isMinorOverride: v })}
                  />
                )}
              </ToggleCard>
            </div>
          )}

          {/* birthDate 미입력 시 수동 미성년 toggle (단독 제공) */}
          {heir.isGenerationSkipBeneficiary && !heir.birthDate && (
            <div className="ml-4 rounded-lg border border-rose-200 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-900/20 p-3">
              <ToggleCard
                tone="rose"
                size="sm"
                title="미성년자 (생년월일 미입력 — 수동 지정)"
                description="과세표준 20억 초과 시 40% 할증. 생년월일 입력 시 자동 판정으로 전환됩니다."
                checked={heir.isMinorOverride === true}
                onCheckedChange={(v) =>
                  set({ isMinorOverride: v ? true : undefined })
                }
              />
            </div>
          )}
        </>
      )}

      {/* 상속인 여부 — "기타(other)" 전용 (대습 아닌 일반 기타).
       *   며느리·사위 등은 비상속인(OFF, §13①2호 5년) / 4촌 이내 방계혈족(민법 §1000①4호 4순위)은 상속인(ON, 10년).
       *   checked는 deriveIsHeirFromHeir derive — 기존 데이터(isHeir 미설정)=ON 표시로 표시↔실제 일치. */}
      {isSubstituteEligible && !heir.substituteGroupId && (
        <ToggleCard
          tone="violet"
          title="상속인 여부"
          description="ON: 민법상 상속인(4촌 이내 방계혈족 등) — §13①1호 10년 합산·법정상속분 포함 / OFF: 비상속인(며느리·사위 등) — §13①2호 5년 합산"
          checked={deriveIsHeirFromHeir(heir)}
          onCheckedChange={(v) => set({ isHeir: v })}
        />
      )}

      {/* 대습상속인 (민법 §1001·§1003②) — "기타(other)" 전용 */}
      {isSubstituteEligible && (
        <SubstituteHeirPanel
          heir={heir}
          index={index}
          allHeirs={allHeirs}
          set={set}
        />
      )}

      {/* 장애인 여부 — 자연인 전용 */}
      {!isCorporate && (
        <ToggleCard
          tone="violet"
          title="장애인"
          description="성별·연령별 기대여명(년) × 1,000만원 추가 인적공제 (§20①4호, 2023 생명표)"
          checked={heir.isDisabled ?? false}
          onCheckedChange={(v) => set({ isDisabled: v })}
        />
      )}

      {/* 장애인 성별 — 장애인 ON 시에만 노출 */}
      {!isCorporate && heir.isDisabled === true && (
        <div className="ml-4 mt-1 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            장애인 성별 (§20①4호 — 성별·연령별 기대여명 기준)
          </p>
          {parsedRrn ? (
            <p className="text-caption text-emerald-600 dark:text-emerald-400">
              주민등록번호에서 자동 도출:{" "}
              <strong>{parsedRrn.gender === "male" ? "남성" : "여성"}</strong>
            </p>
          ) : (
            <>
              <RadioCardGroup
                name={`gender-${heir.id}`}
                tone="violet"
                layout="inline"
                value={heir.gender ?? ""}
                onChange={(v) => set({ gender: v })}
                options={[
                  { value: "male", label: "남성" },
                  { value: "female", label: "여성" },
                ]}
              />
              {!heir.gender && (
                <p className="text-caption text-violet-600 dark:text-violet-400">
                  성별을 선택해야 장애인공제 기대여명을 계산합니다.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 동거주택 요건 (G5 적격 관계: 자녀·세대생략 손자녀·2022~ 대습배우자) */}
      {showCohabitant && (
        <>
          <ToggleCard
            tone="violet"
            title="동거주택 상속공제 해당 (§23의2)"
            description={
              deathDate && deathDate >= "2020-01-01"
                ? "피상속인·상속인 10년 이상 동거, 무주택자 요건 등 — 공시가격의 100%, 최대 6억 (2020~)"
                : deathDate && deathDate >= "2009-01-01"
                ? "피상속인·상속인 10년 이상 동거, 무주택자 요건 등 — 공시가격의 80%, 최대 5억 (~2019)"
                : "피상속인·상속인 10년 이상 동거, 무주택자 요건 등 (§23의2)"
            }
            checked={heir.isCohabitant ?? false}
            onCheckedChange={(v) =>
              set({
                isCohabitant: v,
                cohabitStartDate: v ? heir.cohabitStartDate : undefined,
                cohabitExcludedYears: v ? heir.cohabitExcludedYears : undefined,
                cohabitReasons: v ? heir.cohabitReasons : undefined,
              })
            }
          />

          {/* G3 동거기간 입력 블록 — isCohabitant ON 시만 노출 */}
          {heir.isCohabitant && (
            <CohabitRequirementBlock
              cohabitStartDate={heir.cohabitStartDate}
              cohabitReasons={heir.cohabitReasons}
              cohabitExcludedYears={heir.cohabitExcludedYears}
              birthDate={heir.birthDate}
              deathDate={deathDate}
              onChange={(patch) =>
                set({
                  cohabitStartDate: patch.cohabitStartDate,
                  cohabitReasons: patch.cohabitReasons,
                })
              }
            />
          )}
        </>
      )}

      {/* 법인 — 영리법인 여부 */}
      {isCorporate && (
        <div data-testid="heir-is-for-profit">
          <ToggleCard
            tone="violet"
            size="sm"
            title="영리법인 여부"
            description="ON: 영리법인 (사전증여 §3의2② 면제·산출세액 상당액 자동) / OFF: 비영리법인 (§3의2② 미적용)"
            checked={heir.isForProfit !== false}
            onCheckedChange={(v) => set({ isForProfit: v ? undefined : false })}
          />
        </div>
      )}

      {/* 영리법인 전용 — 부표 5 ②③ + 주주 명세 */}
      {isCorporate && heir.isForProfit !== false && (
        <CorporateHeirFields heir={heir} set={set} allHeirs={allHeirs} />
      )}
    </div>
  );
}
