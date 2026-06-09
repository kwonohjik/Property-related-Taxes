"use client";

/**
 * ExemptionChecklist — 비과세 항목 체크리스트
 * 상속세·증여세 계산 마법사 내 비과세 단계에서 사용
 *
 * 사용자가 해당되는 비과세 항목을 선택하고 금액을 입력하면
 * 해당 항목의 비과세 금액과 리스크 경고를 표시합니다.
 */

import { useState } from "react";
import type {
  ExemptionRule,
  ExemptionCategory,
} from "@/lib/tax-engine/exemption-rules";
import {
  getExemptionRulesByCategory,
  getExemptionTreatment,
} from "@/lib/tax-engine/exemption-rules";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import type { Heir, HeirAllocation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  HeirAllocationInput,
  hasDistributableHeir,
} from "@/components/calc/inheritance/HeirAllocationInput";
import { cn } from "@/lib/utils";

// ============================================================
// 개별 항목 행
// ============================================================

interface ExemptionRowProps {
  rule: ExemptionRule;
  checked: boolean;
  amount: number;
  areaM2: number | undefined;
  onToggle: (ruleId: string) => void;
  onAmountChange: (ruleId: string, amount: number) => void;
  onAreaChange: (ruleId: string, areaM2: number | undefined) => void;
  // 작업4: 비과세 협의분할 (상속세 전용)
  isInheritance: boolean;
  heirs: Heir[];
  heirAllocations: HeirAllocation[] | undefined;
  onHeirAllocationsChange: (
    ruleId: string,
    allocs: HeirAllocation[] | undefined,
  ) => void;
}

function YesNoButtons({ checked, onChange }: { checked: boolean; onChange: (yes: boolean) => void }) {
  const base = "px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors min-w-[44px]";
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={checked}
        className={cn(
          base,
          checked
            ? "bg-violet-600 text-white border-violet-600 shadow-sm"
            : "bg-white text-gray-600 border-violet-200 hover:bg-violet-50",
        )}
      >
        여
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!checked}
        className={cn(
          base,
          !checked
            ? "bg-gray-700 text-white border-gray-700 shadow-sm"
            : "bg-white text-gray-600 border-violet-200 hover:bg-violet-50",
        )}
      >
        부
      </button>
    </div>
  );
}

function ExemptionRow({
  rule,
  checked,
  amount,
  areaM2,
  onToggle,
  onAmountChange,
  onAreaChange,
  isInheritance,
  heirs,
  heirAllocations,
  onHeirAllocationsChange,
}: ExemptionRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = rule.requirements.length > 0 || rule.exclusions.length > 0;
  const canDistribute = isInheritance && hasDistributableHeir(heirs);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        checked
          ? "border-violet-300 bg-violet-50/70 ring-1 ring-violet-200/50"
          : "border-violet-200/70 bg-violet-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn("text-sm font-semibold", checked ? "text-violet-900" : "text-gray-800 dark:text-gray-100")}>
            {rule.name}
          </p>
          <span className="text-xs text-gray-400 dark:text-gray-500">{rule.lawRef}</span>
          <p className="text-xs text-gray-600 dark:text-gray-300">{rule.description}</p>
        </div>
        <YesNoButtons checked={checked} onChange={(yes) => { if (yes !== checked) onToggle(rule.id); }} />
      </div>

      {checked && (
        <div className="mt-3 pl-3 border-l-2 border-violet-300 space-y-2">
          {/* 금액 입력 (사회통념 타입 제외하고 모두 표시). 금액 한도(고정)만 라벨에 1회 표기 */}
          {rule.limitType !== "social_norm" && (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                해당 자산 가액
                {rule.limitType === "fixed" && rule.limitAmount && (
                  <span className="ml-1 text-amber-600">
                    (최대 {rule.limitAmount.toLocaleString()})
                  </span>
                )}
              </label>
              <CurrencyInput
                label=""
                value={amount > 0 ? String(amount) : ""}
                onChange={(v) => onAmountChange(rule.id, parseInt(v.replace(/,/g, "") || "0", 10))}
                placeholder="금액 입력"
              />
            </div>
          )}

          {/* 면적 입력 (금양임야·묘토). 면적 한도는 여기 라벨에 1회만 표기(단일 출처) */}
          {rule.limitType === "area" && (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                해당 면적 (㎡)
                {rule.limitAreaM2 && (
                  <span className="ml-1 text-gray-400">한도 {rule.limitAreaM2.toLocaleString()}㎡</span>
                )}
              </label>
              <DecimalInput
                value={areaM2 != null ? String(areaM2) : ""}
                thousandSeparator
                onChange={(v) => {
                  const n = parseDecimal(v);
                  onAreaChange(rule.id, n > 0 ? n : undefined);
                }}
                placeholder="분묘에 속한 면적 (㎡)"
              />
              {areaM2 != null && rule.limitAreaM2 != null && areaM2 > rule.limitAreaM2 && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  한도 초과 — 초과 면적 비율만큼 가액이 안분 과세됩니다.
                </p>
              )}
            </div>
          )}

          {/* 적용 요건·제외 사유 — 기본 접힘 */}
          {hasDetails && (
            <div>
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                aria-expanded={detailsOpen}
                data-testid={`exemption-row-${rule.id}-details-toggle`}
                className="text-xs text-violet-600 hover:text-violet-800 dark:text-violet-400 font-medium"
              >
                {detailsOpen ? "▾" : "▸"} 적용 요건·제외 사유 자세히
              </button>
              {detailsOpen && (
                <div className="mt-2 space-y-2">
                  {rule.requirements.length > 0 && (
                    <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
                      {rule.requirements.map((req, i) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  )}
                  {rule.exclusions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                        적용 제외 사유:
                      </p>
                      <ul className="text-xs text-red-500 dark:text-red-400 space-y-0.5 list-disc list-inside">
                        {rule.exclusions.map((ex, i) => (
                          <li key={i}>{ex}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 협의분할 — 상속인별 귀속 (작업4, 상속세 전용). 미설정 시 법정상속분 */}
          {canDistribute && (
            <ToggleCard
              tone="violet"
              title="협의분할 (상속인별 분배)"
              description="비과세 재산을 상속인별로 나눠 귀속시킵니다. 미설정 시 법정상속분으로 안분."
              checked={heirAllocations !== undefined}
              onCheckedChange={(on) =>
                onHeirAllocationsChange(rule.id, on ? [] : undefined)
              }
            >
              <HeirAllocationInput
                allocations={heirAllocations}
                expectedTotal={amount}
                heirs={heirs}
                onChange={(allocs) => onHeirAllocationsChange(rule.id, allocs)}
                heading={null}
              />
            </ToggleCard>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface ExemptionChecklistProps {
  category: ExemptionCategory;
  value: ExemptionCheckedItem[];
  onChange: (items: ExemptionCheckedItem[]) => void;
  /** 협의분할 분배 대상 상속인 (상속세 전용, 작업4). 미전달 시 협의분할 토글 미노출 */
  heirs?: Heir[];
}

export function ExemptionChecklist({
  category,
  value,
  onChange,
  heirs = [],
}: ExemptionChecklistProps) {
  const rules = getExemptionRulesByCategory(category);

  const checkedMap = new Map(value.map((v) => [v.ruleId, v]));

  const handleToggle = (ruleId: string) => {
    if (checkedMap.has(ruleId)) {
      onChange(value.filter((v) => v.ruleId !== ruleId));
    } else {
      onChange([...value, { ruleId, claimedAmount: 0 }]);
    }
  };

  const handleAmountChange = (ruleId: string, amount: number) => {
    onChange(
      value.map((v) => (v.ruleId === ruleId ? { ...v, claimedAmount: amount } : v)),
    );
  };

  const handleAreaChange = (ruleId: string, areaM2: number | undefined) => {
    onChange(
      value.map((v) => (v.ruleId === ruleId ? { ...v, claimedAreaM2: areaM2 } : v)),
    );
  };

  const handleHeirAllocationsChange = (
    ruleId: string,
    allocs: HeirAllocation[] | undefined,
  ) => {
    onChange(
      value.map((v) =>
        v.ruleId === ruleId ? { ...v, heirAllocations: allocs } : v,
      ),
    );
  };

  // 금양임야·묘토 합산 2억원 한도 안내 노출 여부 (상증령 §8③ 단서)
  const showGraveGroupNotice =
    category === "inheritance" &&
    value.some((v) => v.ruleId === "inh_forest_burial" || v.ruleId === "inh_grave_land");

  // 마스터 토글: 이미 선택된 항목이 있으면 자동 "여", 없으면 기본 "부"
  const [masterYes, setMasterYes] = useState<boolean>(value.length > 0);

  if (rules.length === 0) return null;

  const handleMasterChange = (yes: boolean) => {
    setMasterYes(yes);
    // "부" 선택 시 기존에 선택된 모든 항목 초기화
    if (!yes && value.length > 0) onChange([]);
  };

  // 비과세(§12·§46)와 과세가액 불산입(§16·§17·§48)은 법령상 별개 개념 — 섹션 분리.
  const nonTaxableRules = rules.filter(
    (r) => getExemptionTreatment(r) === "non_taxable",
  );
  const notIncludedRules = rules.filter(
    (r) => getExemptionTreatment(r) === "not_included",
  );

  const selectedCount = (groupRules: ExemptionRule[]) =>
    groupRules.filter((r) => checkedMap.has(r.id)).length;

  const renderGroup = (groupRules: ExemptionRule[]) => (
    <div className="space-y-2">
      {groupRules.map((rule) => (
        <ExemptionRow
          key={rule.id}
          rule={rule}
          checked={checkedMap.has(rule.id)}
          amount={checkedMap.get(rule.id)?.claimedAmount ?? 0}
          areaM2={checkedMap.get(rule.id)?.claimedAreaM2}
          onToggle={handleToggle}
          onAmountChange={handleAmountChange}
          onAreaChange={handleAreaChange}
          isInheritance={isInheritance}
          heirs={heirs}
          heirAllocations={checkedMap.get(rule.id)?.heirAllocations}
          onHeirAllocationsChange={handleHeirAllocationsChange}
        />
      ))}
    </div>
  );

  const isInheritance = category === "inheritance";
  const masterTitle = isInheritance
    ? "비과세·과세가액 불산입 해당 여부"
    : "비과세 해당 여부";
  const masterDesc = isInheritance
    ? "해당되는 비과세 또는 과세가액 불산입 항목이 있으면 “여”를 선택하세요."
    : "해당되는 비과세 항목이 있으면 “여”를 선택하세요.";
  const nonTaxableSubtitle = isInheritance ? "상증법 §12" : "상증법 §46·§46의2";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-200/70 bg-violet-50/40 p-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {masterTitle}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{masterDesc}</p>
        </div>
        <YesNoButtons checked={masterYes} onChange={handleMasterChange} />
      </div>

      {masterYes && (
        <>
          {nonTaxableRules.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                  비과세
                  <span className="ml-1 font-normal text-gray-400">
                    {nonTaxableSubtitle}
                  </span>
                </h4>
                <span className="text-xs text-gray-400">
                  {selectedCount(nonTaxableRules) > 0
                    ? `${selectedCount(nonTaxableRules)}개 선택됨`
                    : "없으면 건너뛰기"}
                </span>
              </div>
              {renderGroup(nonTaxableRules)}
            </div>
          )}

          {notIncludedRules.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                  과세가액 불산입
                  <span className="ml-1 font-normal text-gray-400">
                    상증법 §16·§17
                  </span>
                </h4>
                <span className="text-xs text-gray-400">
                  {selectedCount(notIncludedRules) > 0
                    ? `${selectedCount(notIncludedRules)}개 선택됨`
                    : "없으면 건너뛰기"}
                </span>
              </div>
              {renderGroup(notIncludedRules)}
            </div>
          )}

          {showGraveGroupNotice && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-800 dark:text-violet-300">
              금양임야와 묘토의 비과세 합계는 <strong>2억원 한도</strong>입니다 (상증령 §8③ 단서). 족보·제구는 별도 <strong>1천만원 한도</strong>가 적용됩니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
