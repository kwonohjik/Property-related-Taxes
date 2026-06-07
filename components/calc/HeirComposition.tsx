"use client";

/**
 * HeirComposition — 상속인 구성 입력 컴포넌트 (#28)
 * 상속세 계산 마법사에서 Heir[] 입력에 사용
 *
 * 상속인 관계: 배우자, 자녀, 직계존속, 형제자매, 기타
 * 배우자·자녀는 인적공제, 동거주택공제, 세대생략할증 등에 영향
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
import { CohabitRequirementBlock } from "@/components/calc/inheritance/CohabitRequirementBlock";

// ============================================================
// 관계 메타 (라벨은 공유 모듈에서 import)
// ============================================================

// HeirComposition 전용 로컬 상수 (heir-relation-meta에 없는 것들)
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

const RELATION_HINTS: Record<HeirRelation, string> = {
  spouse: "배우자 공제 최소 5억 ~ 최대 30억 (§19)",
  child: "1인당 5,000만원 인적공제. 미성년자는 추가 공제 (§20)",
  lineal_ascendant: "1인당 5,000만원 인적공제. 만 65세 이상 추가 공제 (§20)",
  sibling: "기타 인적공제 (상속 우선순위 낮음)",
  other: "기타 법정상속인 (4촌 이내 방계혈족 등) — 법정상속분 배분 대상",
  legatee: "유증받은 수유자 (법정상속인 외) — 상속인 외 유증액 자동 집계 (§19·§24)",
  corporate: "법인 수유자",
};

// ============================================================
// 관계 변경 시 정합성 정리
// ============================================================

/**
 * 이미 추가된 상속인/수유자/법인의 관계(relation)를 변경할 때, 새 관계에서 의미 없는
 * 입력 필드를 정리한다. id·이름·자산 협의분할(heirAllocations 참조)은 보존되므로
 * 삭제·재추가와 달리 배분 데이터가 소실되지 않는다.
 *
 * 정리 규칙 (엔진 계산 정합성):
 *  - 법인(corporate)으로 변경: 자연인 전용 필드 제거(birthDate·isDisabled·isCohabitant·
 *    isGenerationSkipBeneficiary). 법인은 인적공제(§20)·동거주택(§23의2)·세대생략(§27) 대상 아님.
 *  - 자연인으로 변경: 법인 전용 필드 제거(isForProfit·shareholders·사업자번호·사업장·
 *    corporateGiftComputedTax).
 *  - 자녀(child) 외로 변경: 동거주택(§23의2) 해제(자녀 전용 UI).
 *  - 생년월일 비대상 관계(배우자·기타·수유자·법인)로 변경: birthDate 제거 — 화면에 보이지
 *    않는 잔류 데이터가 미성년·연로자·장애인 공제(§20: birthDate/isDisabled만 검사, 관계 무관)에
 *    영향 주는 것을 차단.
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
    // 법인 — 자연인 전용 필드 제거
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
    // 관계 변경 후 next를 기반으로 판정 (deathDate 미전달 = "9999-12-31" → 2022 이후로 처리)
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

  return next;
}

// ============================================================
// 개별 상속인 편집기
// ============================================================

interface HeirEditorProps {
  heir: Heir;
  index: number;
  deathDate?: string;
  /** 상속인 목록 전체 — CorporateHeirFields ⑦ 드롭다운 자동채움용 */
  allHeirs: Heir[];
  onUpdate: (updated: Heir) => void;
  onRemove: () => void;
}

function HeirEditor({ heir, index, deathDate, allHeirs, onUpdate, onRemove }: HeirEditorProps) {
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
  // (직계비속 자녀·세대생략 손자녀 + 2022~ 대습배우자 other+isSubstituteInheritance)
  const showCohabitant = isCohabitDeductionEligibleRelation(heir, deathDate);
  const isCorporate = heir.relation === "corporate";

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
            data-testid={`heir-change-relation-${index}`}
            className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
          >
            종류 변경
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

      {/* 종류(관계) 변경 — 잘못 선택한 경우 삭제·재추가 없이 교정 (이름·자산 배분 보존) */}
      {changingRelation && (
        <div
          className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/20 p-3 space-y-2"
          data-testid={`heir-relation-picker-${index}`}
        >
          <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
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

      {/* 공제 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ {RELATION_HINTS[heir.relation]}
      </p>

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

      {/* 주민등록번호 (선택) — 신고서 인적사항 칸 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          주민등록번호 (선택)
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={heir.residentNumber ?? ""}
          onChange={(e) => set({ residentNumber: e.target.value || undefined })}
          placeholder="앞 6자리-뒤 7자리"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 생년월일 */}
      {showBirthDate && (
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
                // gen-skip OFF 시 대습 플래그 정리(stale 방지)
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
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
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

      {/* 장애인 여부 — 자연인 전용 */}
      {!isCorporate && (
        <ToggleCard
          tone="violet"
          title="장애인"
          description="성별·연령별 기대여명(년) × 1,000만원 추가 인적공제 (§20①4호, 2023 생명표)"
          checked={heir.isDisabled ?? false}
          onCheckedChange={(v) => set({ isDisabled: v, gender: v ? heir.gender : undefined })}
        />
      )}

      {/* 장애인 성별 — 장애인 ON 시에만 노출 (§20①4호 성별·연령별 기대여명) */}
      {!isCorporate && heir.isDisabled === true && (
        <div className="ml-4 mt-1 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            장애인 성별 (§20①4호 — 성별·연령별 기대여명 기준)
          </p>
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
            <p className="text-[11px] text-violet-600 dark:text-violet-400">
              성별을 선택해야 장애인공제 기대여명을 계산합니다.
            </p>
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

      {/* 협의분할은 각 자산 카드에서 입력 — 전역 비율 필드(actualShareRatio) 폐지 (2026-05-26).
          미입력 자산은 법정상속분 자동 배분. 안내는 상속인 섹션 상단에 1회 노출. */}

      {/* 법인 — 영리법인 여부 (donee-phase2). 사전증여 §3의2② 적용 판정. */}
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

      {/* 영리법인 전용 — 부표 5 ②③ + 주주 명세 (비영리법인은 미표시) */}
      {isCorporate && heir.isForProfit !== false && (
        <CorporateHeirFields heir={heir} set={set} allHeirs={allHeirs} />
      )}
    </div>
  );
}

// ============================================================
// 관계 추가 버튼
// ============================================================

interface RelationButtonProps {
  relation: HeirRelation;
  onAdd: (r: HeirRelation) => void;
  isCurrent?: boolean;
}

function RelationButton({ relation, onAdd, isCurrent }: RelationButtonProps) {
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
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
          현재
        </span>
      )}
    </button>
  );
}

/**
 * 관계 선택 그리드 — 상속인 추가 / 종류 변경 공용.
 * 법정상속인 5종 + 상속인 외(수유자·법인) 2종을 동일 레이아웃으로 노출.
 * currentRelation 전달 시 해당 버튼에 "현재" 배지 강조.
 */
function RelationPickerGrid({
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
        <p className="text-[10px] font-medium text-violet-700 dark:text-violet-300 mb-1">
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
// 상속인 구성 요약
// ============================================================

function HeirSummary({ heirs }: { heirs: Heir[] }) {
  if (heirs.length === 0) return null;

  const counts = HEIR_RELATIONS.reduce<Record<string, number>>((acc, r) => {
    const n = heirs.filter((h) => h.relation === r).length;
    if (n > 0) acc[r] = n;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(counts).map(([r, n]) => (
        <span
          key={r}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
        >
          {RELATION_ICONS[r as HeirRelation]} {RELATION_LABELS[r as HeirRelation]} {n}명
        </span>
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
  /** 상속개시일 — legatee §27 미성년 자동 판정용 (B-2) */
  deathDate?: string;
}

let _nextHeirId = 1;
function generateHeirId() {
  return `heir-${Date.now()}-${_nextHeirId++}`;
}

export function HeirComposition({ heirs, onChange, deathDate }: HeirCompositionProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleAdd = (relation: HeirRelation) => {
    onChange([...heirs, { id: generateHeirId(), relation }]);
    setShowAddPanel(false);
  };

  const handleUpdate = (index: number, updated: Heir) => {
    const next = [...heirs];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(heirs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            상속인 구성
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            배우자 공제·인적공제 자동 계산에 사용됩니다
          </p>
        </div>
        {heirs.length > 0 && (
          <span className="text-xs text-gray-400">{heirs.length}명</span>
        )}
      </div>

      <HeirSummary heirs={heirs} />

      {heirs.length > 0 && (
        <div className="space-y-3">
          {heirs.map((heir, i) => (
            <HeirEditor
              key={heir.id}
              heir={heir}
              index={i}
              deathDate={deathDate}
              allHeirs={heirs}
              onUpdate={(updated) => handleUpdate(i, updated)}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}

      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            상속인 관계 선택
          </p>
          <RelationPickerGrid onPick={handleAdd} />
          <button
            type="button"
            onClick={() => setShowAddPanel(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddPanel(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          <span className="text-lg">+</span>
          상속인 추가
        </button>
      )}
    </div>
  );
}
