"use client";

/**
 * ExemptionChecklist — 비과세·과세가액 불산입 체크리스트 (재구성)
 *
 * 개선:
 *  - 마스터 "여" 선택 후 상단 체크리스트 패널(ExemptionChecklistPanel) 노출
 *  - 체크된 항목만 입력 섹션 렌더 (기존 여/부 토글 → 칩 체크로 교체)
 *  - 입력 섹션을 §12 / §16·§17 그룹 접이식 카드로 묶음 (디폴트 접힘)
 *  - 칩 체크 시 해당 그룹 자동 펼침 (onClick 직접 — useEffect 미러링 금지)
 *
 * 정책:
 *  - useEffect → store 미러링 절대 금지 (feedback_useeffect_store_mirror_forbidden)
 *  - native checkbox/radio 신규 금지
 *  - 800줄 정책: 패널은 ExemptionChecklistPanel.tsx에 분리됨
 *  - 엔진/계산 로직 변경 없음 — exemptionItems[] 구조 무변경
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
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import {
  HeirAllocationInput,
  hasDistributableHeir,
} from "@/components/calc/inheritance/HeirAllocationInput";
import { ExemptionChecklistPanel } from "./ExemptionChecklistPanel";
import { RelatedStockLimitInput } from "./RelatedStockLimitInput";
import { cn } from "@/lib/utils";

// ============================================================
// 개별 항목 입력 섹션 (펼침 영역만 — 체크된 항목 전용)
// ============================================================

interface ExemptionRowProps {
  rule: ExemptionRule;
  item: ExemptionCheckedItem;
  amount: number;
  areaM2: number | undefined;
  onAmountChange: (ruleId: string, amount: number) => void;
  onAreaChange: (ruleId: string, areaM2: number | undefined) => void;
  onPatch: (ruleId: string, patch: Partial<ExemptionCheckedItem>) => void;
  isInheritance: boolean;
  heirs: Heir[];
  heirAllocations: HeirAllocation[] | undefined;
  onHeirAllocationsChange: (
    ruleId: string,
    allocs: HeirAllocation[] | undefined,
  ) => void;
}

function ExemptionRow({
  rule,
  item,
  amount,
  areaM2,
  onAmountChange,
  onAreaChange,
  onPatch,
  isInheritance,
  heirs,
  heirAllocations,
  onHeirAllocationsChange,
}: ExemptionRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = rule.requirements.length > 0 || rule.exclusions.length > 0;
  const canDistribute = isInheritance && hasDistributableHeir(heirs);

  return (
    <div className="rounded-lg border border-sky-200/70 bg-sky-50/40 dark:border-sky-800/50 dark:bg-sky-950/20 p-3 space-y-2">
      {/* 항목 헤더 */}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {rule.name}
        </p>
        <span className="text-xs text-gray-400 dark:text-gray-500">{rule.lawRef}</span>
        <p className="text-xs text-gray-600 dark:text-gray-300">{rule.description}</p>
      </div>

      <div className="pl-3 border-l-2 border-sky-300 dark:border-sky-700 space-y-2">
        {/* 금액 입력 (사회통념 타입 제외하고 모두 표시) */}
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

        {/* 공익법인 출연 — 동족주식 한도 §16② (갭5a) */}
        {rule.id === "inh_public_interest" && (
          <RelatedStockLimitInput
            item={item}
            onPatch={(patch) => onPatch(rule.id, patch)}
          />
        )}

        {/* 적용 요건·제외 사유 — 기본 접힘 */}
        {hasDetails && (
          <div>
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
              data-testid={`exemption-row-${rule.id}-details-toggle`}
              className="text-xs text-sky-600 hover:text-sky-800 dark:text-sky-400 font-medium"
            >
              {detailsOpen ? "▲" : "▼"} 적용 요건·제외 사유 자세히
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

        {/* 협의분할 — 상속인별 귀속 (상속세 전용). 미설정 시 법정상속분 */}
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
    </div>
  );
}

// ============================================================
// 그룹 접이식 섹션
// ============================================================

interface ExemptionGroupSectionProps {
  title: string;
  subtitle: string;
  rules: ExemptionRule[];
  checkedMap: Map<string, ExemptionCheckedItem>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onAmountChange: (ruleId: string, amount: number) => void;
  onAreaChange: (ruleId: string, areaM2: number | undefined) => void;
  onPatch: (ruleId: string, patch: Partial<ExemptionCheckedItem>) => void;
  isInheritance: boolean;
  heirs: Heir[];
  onHeirAllocationsChange: (ruleId: string, allocs: HeirAllocation[] | undefined) => void;
  tone: "sky" | "violet";
}

function ExemptionGroupSection({
  title,
  subtitle,
  rules,
  checkedMap,
  isOpen,
  onToggleOpen,
  onAmountChange,
  onAreaChange,
  onPatch,
  isInheritance,
  heirs,
  onHeirAllocationsChange,
  tone,
}: ExemptionGroupSectionProps) {
  const checkedRules = rules.filter((r) => checkedMap.has(r.id));
  const checkedCount = checkedRules.length;

  if (checkedCount === 0) return null;

  const borderClass = tone === "sky"
    ? "border-sky-200 dark:border-sky-800"
    : "border-violet-200 dark:border-violet-800";
  const bgClass = tone === "sky"
    ? "bg-sky-50/40 dark:bg-sky-950/20"
    : "bg-violet-50/40 dark:bg-violet-950/20";
  const headerClass = tone === "sky"
    ? "text-sky-700 dark:text-sky-300"
    : "text-violet-700 dark:text-violet-300";
  const badgeClass = tone === "sky"
    ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
    : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", borderClass, bgClass)}>
      {/* 그룹 헤더 — 클릭 시 토글 (feedback_result_expand_toggle_standard) */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full text-left gap-2"
      >
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold", headerClass)}>
            {title}
          </span>
          <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
            {subtitle}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badgeClass)}>
            {checkedCount}개 선택
          </span>
        </div>
        <span className={expandToggleClass(tone)}>
          {expandToggleLabel(isOpen)}
        </span>
      </button>

      {/* 체크된 항목 입력 섹션 */}
      {isOpen && (
        <div className="space-y-2 pt-1">
          {checkedRules.map((rule) => (
            <ExemptionRow
              key={rule.id}
              rule={rule}
              item={checkedMap.get(rule.id) ?? { ruleId: rule.id, claimedAmount: 0 }}
              amount={checkedMap.get(rule.id)?.claimedAmount ?? 0}
              areaM2={checkedMap.get(rule.id)?.claimedAreaM2}
              onAmountChange={onAmountChange}
              onAreaChange={onAreaChange}
              onPatch={onPatch}
              isInheritance={isInheritance}
              heirs={heirs}
              heirAllocations={checkedMap.get(rule.id)?.heirAllocations}
              onHeirAllocationsChange={onHeirAllocationsChange}
            />
          ))}
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
  /** 협의분할 분배 대상 상속인 (상속세 전용). 미전달 시 협의분할 토글 미노출 */
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

  // 항목 체크 토글 (존재 = 체크, 부재 = 미체크)
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

  // §16② 동족주식 한도 등 임의 필드 패치 (갭5a) — onChange 직접(미러링 금지)
  const handlePatch = (ruleId: string, patch: Partial<ExemptionCheckedItem>) => {
    onChange(value.map((v) => (v.ruleId === ruleId ? { ...v, ...patch } : v)));
  };

  // 비과세/불산입 그룹 분리
  const nonTaxableRules = rules.filter(
    (r) => getExemptionTreatment(r) === "non_taxable",
  );
  const notIncludedRules = rules.filter(
    (r) => getExemptionTreatment(r) === "not_included",
  );

  // 금양임야·묘토 합산 2억원 한도 안내 노출 여부
  const showGraveGroupNotice =
    category === "inheritance" &&
    value.some((v) => v.ruleId === "inh_forest_burial" || v.ruleId === "inh_grave_land");

  // 그룹 접이식 상태 (로컬 useState — 칩 클릭 시 자동 펼침)
  // 초기값: 해당 그룹에 체크된 항목이 있으면 펼침, 없으면 접힘
  const hasNontaxableChecked = nonTaxableRules.some((r) => checkedMap.has(r.id));
  const hasNotIncludedChecked = notIncludedRules.some((r) => checkedMap.has(r.id));

  const [nontaxableOpen, setNontaxableOpen] = useState<boolean>(hasNontaxableChecked);
  const [notIncludedOpen, setNotIncludedOpen] = useState<boolean>(hasNotIncludedChecked);

  if (rules.length === 0) return null;

  const isInheritance = category === "inheritance";
  const masterTitle = isInheritance
    ? "비과세·과세가액 불산입 선택"
    : "비과세 항목 선택";
  const masterDesc = isInheritance
    ? "해당되는 비과세 또는 과세가액 불산입 항목을 체크하면 아래에 입력란이 열립니다. (없으면 건너뛰기)"
    : "해당되는 비과세 항목을 체크하면 아래에 입력란이 열립니다. (없으면 건너뛰기)";

  // 그룹 헤더·입력 섹션 법령 라벨 (세목별) — 상속 §12/§16·§17 / 증여 §46/§48·§52
  const nonTaxableLaw = isInheritance ? "상증법 §12" : "상증법 §46";
  const notIncludedLaw = isInheritance ? "상증법 §16·§17" : "상증법 §48·§52";

  return (
    <div className="space-y-3">
      {/* 통합 카드: 제목 + 안내 + 칩 패널 (마스터 토글 제거 — 항목 직접 선택) */}
      <div className="rounded-lg border border-violet-200/70 bg-violet-50/40 p-3 space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {masterTitle}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{masterDesc}</p>
        </div>
        <ExemptionChecklistPanel
          items={value}
          nonTaxableRules={nonTaxableRules}
          notIncludedRules={notIncludedRules}
          nonTaxableLaw={nonTaxableLaw}
          notIncludedLaw={notIncludedLaw}
          onToggle={(ruleId) => {
            handleToggle(ruleId);
          }}
          onNontaxableGroupOpen={() => setNontaxableOpen(true)}
          onNotIncludedGroupOpen={() => setNotIncludedOpen(true)}
        />
      </div>

          {/* 입력 섹션 — 체크된 항목만 그룹 접이식 */}
          {nonTaxableRules.length > 0 && (
            <ExemptionGroupSection
              title="비과세"
              subtitle={nonTaxableLaw}
              rules={nonTaxableRules}
              checkedMap={checkedMap}
              isOpen={nontaxableOpen}
              onToggleOpen={() => setNontaxableOpen((o) => !o)}
              onAmountChange={handleAmountChange}
              onAreaChange={handleAreaChange}
              onPatch={handlePatch}
              isInheritance={isInheritance}
              heirs={heirs}
              onHeirAllocationsChange={handleHeirAllocationsChange}
              tone="sky"
            />
          )}

          {notIncludedRules.length > 0 && (
            <ExemptionGroupSection
              title="과세가액 불산입"
              subtitle={notIncludedLaw}
              rules={notIncludedRules}
              checkedMap={checkedMap}
              isOpen={notIncludedOpen}
              onToggleOpen={() => setNotIncludedOpen((o) => !o)}
              onAmountChange={handleAmountChange}
              onAreaChange={handleAreaChange}
              onPatch={handlePatch}
              isInheritance={isInheritance}
              heirs={heirs}
              onHeirAllocationsChange={handleHeirAllocationsChange}
              tone="violet"
            />
          )}

          {/* 금양임야·묘토 합산 2억원 한도 안내 */}
          {showGraveGroupNotice && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-800 dark:text-violet-300">
              금양임야와 묘토의 비과세 합계는 <strong>2억원 한도</strong>입니다 (상증령 §8③ 단서). 족보·제구는 별도 <strong>1천만원 한도</strong>가 적용됩니다.
            </div>
          )}
    </div>
  );
}

