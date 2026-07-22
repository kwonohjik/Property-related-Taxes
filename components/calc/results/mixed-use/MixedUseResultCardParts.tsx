"use client";

/**
 * MixedUseResultCard 공용 서브 컴포넌트 + 포맷터 (800줄 정책 분리).
 *
 * `MixedUseResultCard.tsx`가 807줄로 정책 초과 → Row/DivRow/ResultSection과
 * 용도변경(§166⑥)·용도변경일 LTHD 분리(집행기준 89-154-24) 카드를 이 파일로 이동.
 * 엔진·로직 무변경 — 순수 이동(export 추가만).
 */

import { useState } from "react";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";

// 결과 데이터에 신규 필드가 누락된 캐시 케이스를 안전하게 처리하기 위해 nullish 가드.
export const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
export const fmtPlain = (n: number | undefined | null) => (n ?? 0).toLocaleString();
export const fmtPct = (r: number | undefined | null) => `${((r ?? 0) * 100).toFixed(2)}%`;
export const fmtSqm = (n: number | undefined | null) => `${(n ?? 0).toFixed(2)} ㎡`;

export function ResultSection({
  title,
  basis,
  children,
  open,
  onToggle,
}: {
  title: string;
  basis: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  // 펼침 상태는 부모가 관리 (상단 전체 토글로 일괄 제어) — 인쇄 시 print-only-css-toggle로 항상 표시.
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between mb-2 gap-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-micro text-muted-foreground text-right max-w-[140px]">{basis}</span>
          <ExpandToggleButton open={open} onClick={onToggle} tone="slate" />
        </div>
      </div>
      <div className={open ? "block space-y-2" : "hidden print:block print:space-y-2"}>{children}</div>
    </div>
  );
}

export function Row({
  label,
  value,
  highlight,
  large,
  small,
  formula,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  large?: boolean;
  small?: boolean;
  formula?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className={`flex justify-between items-center ${small ? "text-xs text-muted-foreground" : "text-sm"}`}>
        <span className={highlight ? "font-medium" : ""}>{label}</span>
        <span className={`font-mono ${highlight ? "font-semibold text-primary" : ""} ${large ? "text-base" : ""}`}>
          {value}
        </span>
      </div>
      {formula && (
        <div className="text-caption text-muted-foreground/80 leading-snug pl-2 border-l-2 border-muted space-y-0.5">
          {formula}
        </div>
      )}
    </div>
  );
}

// 산식 분수(Frac)·줄(FLine)은 전 세목 공용으로 승격 — shared/FormulaParts.tsx에서 재export.
import { Frac, FLine } from "@/components/calc/results/shared/FormulaParts";
export { Frac, FLine };

export function DivRow() {
  return <div className="border-t my-1" />;
}

/**
 * 보유 중 일부 용도변경 — "취득시점 자산 구성" 섹션.
 * direction별 설명 + 자동/수정 면적 비교표 + commercial_to_house 시 보수 검토 배지.
 */
export function PartialUsageChangeCard({
  puc,
  reason,
}: {
  puc: NonNullable<MixedUseGainBreakdown["partialUsageChange"]>;
  reason?: string;
}) {
  const isCommToHouse = puc.direction === "commercial_to_house";
  const isPhdCaseA = puc.phdScopeBranch === "case_a_whole_building";
  const isPhdCaseB = puc.phdScopeBranch === "case_b_housing_only";
  // 기본 펼침 — 인쇄 시 print-only-css-toggle로 항상 표시. 경고 배지는 헤더에 유지(접힘에도 노출).
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-amber-900">
          취득시점 자산 구성 (보유 중 일부 용도변경)
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isPhdCaseA && (
            <span className="inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-caption font-semibold text-rose-900">
              최초공시일 &lt; 용도변경일 — 건물 전체 기준으로 취득시 주택가격 역산
            </span>
          )}
          {isPhdCaseB && (
            <span className="inline-flex items-center rounded-md border border-violet-300 bg-violet-100 px-2 py-0.5 text-caption font-semibold text-violet-900">
              최초공시일 ≥ 용도변경일 — 주택 부분만 기준으로 취득시 주택가격 역산
            </span>
          )}
          {isCommToHouse && (
            <span className="inline-flex items-center rounded-md border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-caption font-semibold text-yellow-900">
              ⚠ 법령 적용에 보수 검토 필요
            </span>
          )}
          <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="amber" />
        </div>
      </div>
      <div className={open ? "block space-y-2" : "hidden print:block print:space-y-2"}>
      <p className="text-xs text-amber-800">
        취득시 자산 구성:{" "}
        <span className="font-semibold">
          {puc.direction === "house_to_commercial"
            ? "전체 주택 → 양도시 일부 상가화"
            : "전체 상가 → 양도시 일부 주택화"}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white/60 border border-amber-200 px-3 py-2">
          <div className="text-caption text-amber-700">취득시 주택 연면적</div>
          <div className="font-mono text-amber-900">{puc.acqResidentialArea.toFixed(2)}㎡</div>
        </div>
        <div className="rounded-md bg-white/60 border border-amber-200 px-3 py-2">
          <div className="text-caption text-amber-700">취득시 상가 연면적</div>
          <div className="font-mono text-amber-900">{puc.acqCommercialArea.toFixed(2)}㎡</div>
        </div>
      </div>
      {puc.isAreaCustomized && (
        <p className="text-caption text-muted-foreground">
          ※ 사용자가 취득시 면적을 직접 입력함 (자동값 대신 수동값 사용)
        </p>
      )}
      {isPhdCaseA && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-caption text-rose-900 space-y-1 leading-relaxed">
          <p className="font-semibold">취득시 개별주택가격 역산 산식 — 건물 전체 기준 (시행령 §164⑤)</p>
          <p>
            역산한 취득시 개별주택가격 = 최초공시 개별주택가격 ×{" "}
            <Frac
              top="취득시 토지기준시가 + 취득시 건물기준시가"
              bottom="최초공시 토지기준시가 + 최초공시 건물기준시가"
            />
          </p>
          <p>
            · 최초공시 시점에 건물 전체가 주택이었으므로 최초공시 개별주택가격에는 이후 상가로 변한 부분도 포함됩니다. 취득시·최초공시 시점 모두 전체 토지면적·전체 건물 기준시가를 사용하여 비율을 맞춥니다.
          </p>
        </div>
      )}
      {reason && (
        <p className="text-caption text-amber-800 bg-amber-100/60 border border-amber-200 rounded-md px-2 py-1.5 leading-relaxed">
          💡 {reason}
        </p>
      )}
      </div>
    </div>
  );
}

/**
 * 용도변경일 기반 LTHD 시간 비례 분할 카드.
 * 집행기준 89-154-24 취지 — 주택으로 사용한 기간 통산.
 * Period 1 (단일 용도) + Period 2 (혼용)별 양도차익·LTHD 내역 표시.
 */
export function UsagePeriodSplitCard({
  ups,
  direction,
}: {
  ups: NonNullable<MixedUseGainBreakdown["usagePeriodSplit"]>;
  direction: "house_to_commercial" | "commercial_to_house";
}) {
  const isHtoC = direction === "house_to_commercial";
  const fmtDays = (d: number) => `${d.toFixed(0)}일 (${(d / 365.25).toFixed(2)}년)`;
  const period1Label = isHtoC ? "Period 1 (전체 주택)" : "Period 1 (전체 상가)";
  const period1Cat = isHtoC ? "주택분" : "상가분";
  // 기본 펼침 — 인쇄 시 print-only-css-toggle로 항상 표시.
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900">
          용도변경일 기반 LTHD 분리 계산
        </p>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-violet-300 bg-violet-100 px-2 py-0.5 text-caption font-semibold text-violet-900">
            집행기준 89-154-24
          </span>
          <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="violet" />
        </div>
      </div>
      <div className={open ? "block space-y-3" : "hidden print:block print:space-y-3"}>
      <p className="text-caption text-violet-800 leading-relaxed">
        용도변경일 입력 시 양도차익을 시간 비례로 분할하여, 각 기간의 보유연수로 장기보유특별공제를 적용합니다.
        주택으로 사용한 기간을 통산하는 집행기준 취지를 반영.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white/60 border border-violet-200 px-3 py-2 space-y-1">
          <div className="text-caption text-violet-700 font-semibold">{period1Label}</div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>기간</span>
            <span className="font-mono">{fmtDays(ups.period1Days)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>{period1Cat} 양도차익</span>
            <span className="font-mono">{fmt(ups.period1Gain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period1LongTermDeductionRate)} / {fmt(ups.period1LongTermDeductionAmount)}
            </span>
          </div>
        </div>

        <div className="rounded-md bg-white/60 border border-violet-200 px-3 py-2 space-y-1">
          <div className="text-caption text-violet-700 font-semibold">Period 2 (혼용 — 양도시점 비율)</div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>기간</span>
            <span className="font-mono">{fmtDays(ups.period2Days)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>주택분 양도차익</span>
            <span className="font-mono">{fmt(ups.period2HousingGain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>주택 LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period2HousingLongTermDeductionRate)} / {fmt(ups.period2HousingLongTermDeductionAmount)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>상가분 양도차익</span>
            <span className="font-mono">{fmt(ups.period2CommercialGain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>상가 LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period2CommercialLongTermDeductionRate)} / {fmt(ups.period2CommercialLongTermDeductionAmount)}
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
