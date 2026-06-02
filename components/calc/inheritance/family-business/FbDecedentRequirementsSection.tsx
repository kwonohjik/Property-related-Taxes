"use client";

/**
 * FbDecedentRequirementsSection — 피상속인 요건 ② (2요건 자동판정 + 접힌 수동보정, Phase 2)
 *
 * 섹션②: 가목(지분 40%/20%×10년) + 나목(대표이사 종사, 1호·3호 자동 / 2호 override)
 *   - 자동판정 미리보기(FbAutoCheckPreviewCard, useMemo)
 *   - 접힌 "수동 보정" 펼침 (3-state override 버튼)
 *   - corporate 전용 — isCorporate=false 시 호출 금지
 *
 * 정책:
 *   - feedback_useeffect_store_mirror_forbidden: useMemo만, useEffect→store 미러링 절대 금지
 *   - 자동값은 store에 쓰지 않음 — 엔진이 계산 시점에 resolve
 *   - 자동 안분 fallback 금지 — 미입력 시 false(보수적) + amber 안내
 *   - testid: fb-preview-decedent-share · fb-preview-decedent-ceo
 *   - testid override: fb-override-decedent-share · fb-override-decedent-ceo
 *
 * 법령: 상증령 §15③1호가(지분) · §15③1호나(대표이사 1·3호) · §15③1호나2호(승계 override)
 */

import { useMemo, useState } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import {
  deriveFBDecedentShareholding,
  deriveFBDecedentCEO,
} from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";
import { FbAutoCheckPreviewCard } from "./FbAutoCheckPreviewCard";

interface Props {
  familyBusiness: FamilyBusinessInheritanceInput;
  /** 상속개시일 (요건 자동판정 기준) */
  deathDate: string;
  onChange: (patch: Partial<FamilyBusinessInheritanceInput>) => void;
}

export function FbDecedentRequirementsSection({
  familyBusiness: fb,
  deathDate,
  onChange,
}: Props) {
  // 수동보정 펼침 상태
  const [openShare, setOpenShare] = useState(false);
  const [openCEO, setOpenCEO] = useState(false);

  const isListed = fb.isListedOnExchange === true;
  const threshold = isListed ? 20 : 40;

  // ── 가목 지분 자동판정 (useMemo — store 미러링 없음)
  const autoShare = useMemo<boolean | null>(() => {
    if (fb.decedentShareRatioNum == null || !fb.decedentShareAcquiredDate) return null;
    return deriveFBDecedentShareholding(
      fb.decedentShareRatioNum,
      fb.decedentShareAcquiredDate,
      deathDate,
      isListed,
    );
  }, [fb.decedentShareRatioNum, fb.decedentShareAcquiredDate, deathDate, isListed]);

  const shareFormula = useMemo(() => {
    if (fb.decedentShareRatioNum == null && !fb.decedentShareAcquiredDate) {
      return `지분율과 보유시작일을 입력하면 ${threshold}% × 10년 자동판정`;
    }
    if (fb.decedentShareRatioNum == null) return "지분율(%)을 입력하세요";
    if (!fb.decedentShareAcquiredDate) return "지분 보유시작일을 입력하세요";
    try {
      const pct = (fb.decedentShareRatioNum * 100).toFixed(2);
      const yrs = differenceInYears(parseISO(deathDate), parseISO(fb.decedentShareAcquiredDate));
      return `지분 ${pct}% (기준 ${threshold}%), 보유 ${yrs}년 (${fb.decedentShareAcquiredDate} ~ 상속개시 ${deathDate})`;
    } catch {
      return "날짜 형식을 확인하세요";
    }
  }, [fb.decedentShareRatioNum, fb.decedentShareAcquiredDate, deathDate, threshold]);

  // ── 나목 대표이사 자동판정 (useMemo)
  const ceoResult = useMemo(() => {
    const periods = fb.decedentCEOPeriods;
    if (!periods?.length || !fb.openingDate) return null;
    return deriveFBDecedentCEO(periods, fb.openingDate, deathDate);
  }, [fb.decedentCEOPeriods, fb.openingDate, deathDate]);

  const autoCEO = ceoResult !== null ? ceoResult.met : null;

  const ceoFormula = useMemo(() => {
    const periods = fb.decedentCEOPeriods;
    if (!periods?.length) return "재직 구간(시작/종료)을 입력하면 자동판정";
    if (!fb.openingDate) return "개업연월일을 섹션① 표시 정보에 입력하세요";
    if (ceoResult === null) return "계산 중 오류";
    const altLabel =
      ceoResult.satisfiedAlternative === 1
        ? "1호 충족(영위기간 50% 이상)"
        : ceoResult.satisfiedAlternative === 3
          ? "3호 충족(소급 10년 중 5년)"
          : "미충족";
    return `재직 비율 ${ceoResult.ratioPercent.toFixed(1)}% — ${altLabel}`;
  }, [fb.decedentCEOPeriods, fb.openingDate, ceoResult]);

  // 재직 구간 1건 (현재 단일 구간 입력)
  const period = fb.decedentCEOPeriods?.[0];
  const periodStart = period?.startDate ?? "";
  const periodEnd = period?.endDate ?? "";

  const handlePeriodChange = (field: "startDate" | "endDate", value: string) => {
    const current = fb.decedentCEOPeriods?.[0] ?? { startDate: "", endDate: "" };
    const updated = { ...current, [field]: value };
    // 둘 다 비어있으면 undefined로 정리
    if (!updated.startDate && !updated.endDate) {
      onChange({ decedentCEOPeriods: undefined });
    } else {
      onChange({ decedentCEOPeriods: [updated] });
    }
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
          2
        </span>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          피상속인 요건 (상증령 §15③1호) — 자동판정
        </p>
      </div>

      {/* 거래소 상장 토글 (지분 기준 변경) */}
      <ToggleCard
        tone="amber"
        size="sm"
        title="거래소 상장 법인"
        description="체크 시 지분 요건 40% → 20%로 완화 (§15③1호 가)"
        checked={fb.isListedOnExchange ?? false}
        onCheckedChange={(v) => onChange({ isListedOnExchange: v ? true : undefined })}
      />

      {/* ── 가. 지분 요건 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          가. 최대주주등 지분 {threshold}% × 10년 보유 (상증령 §15③1호 가)
        </p>

        {/* 지분율 입력 (% 입력 → store에 /100 소수로 저장) */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-amber-700 dark:text-amber-300">
            지분율 (%, 특수관계인 합산)
          </label>
          <DecimalInput
            value={
              fb.decedentShareRatioNum != null
                ? String(+(fb.decedentShareRatioNum * 100).toFixed(4))
                : ""
            }
            onChange={(v) => {
              const pct = parseDecimal(v);
              onChange({ decedentShareRatioNum: pct != null ? pct / 100 : undefined });
            }}
            placeholder={`${threshold}% 이상 입력`}
          />
        </div>

        {/* 보유시작일 */}
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-amber-700 dark:text-amber-300">
            지분 취득(보유 시작)일
          </label>
          <DateInput
            value={fb.decedentShareAcquiredDate ?? ""}
            onChange={(v) => onChange({ decedentShareAcquiredDate: v || undefined })}
          />
        </div>

        {/* "계속 보유" 경고 */}
        <div className="rounded bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 dark:text-amber-200">
          ⚠️ <strong>&quot;계속 보유&quot;</strong>(매도·재취득 없음) 여부는 자동 확인 불가 — 사실관계 직접 확인 후 수동 보정 필요 시 아래에서 보정하세요.
        </div>

        <FbAutoCheckPreviewCard
          autoMet={autoShare}
          override={fb.decedentMajorShareholdingMetOverride}
          formula={shareFormula}
          lawLabel="§15③1호 가"
          testId="fb-preview-decedent-share"
        />

        {/* 수동 보정 */}
        <div>
          <button
            type="button"
            onClick={() => setOpenShare((v) => !v)}
            className="text-[10px] text-amber-600 dark:text-amber-400 underline underline-offset-2"
          >
            {openShare ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만)"}
          </button>
          {openShare && (
            <div className="mt-1.5 space-y-1" data-testid="fb-override-decedent-share">
              <p className="text-[10px] text-muted-foreground">
                계속 보유 확인 후 수동 보정. undefined로 되돌리면 자동판정으로 복귀합니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ decedentMajorShareholdingMetOverride: true })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentMajorShareholdingMetOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                >
                  충족 (수동)
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ decedentMajorShareholdingMetOverride: false })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentMajorShareholdingMetOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                >
                  미충족 (수동)
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ decedentMajorShareholdingMetOverride: undefined })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentMajorShareholdingMetOverride === undefined ? "bg-amber-100 border-amber-400 text-amber-800" : "border-border bg-background"}`}
                >
                  자동 복귀
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 나. 대표이사 종사 요건 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          나. 대표이사 50% 이상 재임 또는 소급 10년 중 5년 이상 (상증령 §15③1호 나)
        </p>

        {/* 2호(승계) 안내 */}
        <div className="rounded bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 dark:text-amber-200">
          ⚠️ <strong>2호(10년 승계 계속재직)</strong>는 &quot;승계일&quot; 자동 확인 불가 — 자동은 1호(50%)·3호(소급 10년 중 5년)만. 2호 해당 시 아래 수동 보정을 사용하세요.
        </div>

        {/* 재직 구간 입력 (1건) */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-amber-700 dark:text-amber-300">
              대표이사 취임일 (재직 시작)
            </label>
            <DateInput
              value={periodStart}
              onChange={(v) => handlePeriodChange("startDate", v)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-amber-700 dark:text-amber-300">
              대표이사 퇴임일 (재직 종료, 미퇴임 시 상속개시일)
            </label>
            <DateInput
              value={periodEnd}
              onChange={(v) => handlePeriodChange("endDate", v)}
            />
          </div>
        </div>

        {/* 개업연월일 미입력 안내 */}
        {!fb.openingDate && (
          <div className="rounded bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200 px-2 py-1 text-[10px] text-amber-800 dark:text-amber-200">
            ℹ️ 섹션① 표시 정보의 <strong>개업연월일</strong>을 입력하면 영위기간 대비 재직 비율(1호)이 자동 계산됩니다.
          </div>
        )}

        <FbAutoCheckPreviewCard
          autoMet={autoCEO}
          override={fb.decedentCEORequirementMetOverride}
          formula={ceoFormula}
          lawLabel="§15③1호 나"
          testId="fb-preview-decedent-ceo"
        />

        {/* 수동 보정 */}
        <div>
          <button
            type="button"
            onClick={() => setOpenCEO((v) => !v)}
            className="text-[10px] text-amber-600 dark:text-amber-400 underline underline-offset-2"
          >
            {openCEO ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만 — 2호 승계 등)"}
          </button>
          {openCEO && (
            <div className="mt-1.5 space-y-1" data-testid="fb-override-decedent-ceo">
              <p className="text-[10px] text-muted-foreground">
                2호(10년 승계 계속재직) 해당 또는 자동과 다른 경우. undefined로 되돌리면 자동판정으로 복귀합니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ decedentCEORequirementMetOverride: true })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentCEORequirementMetOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                >
                  충족 (수동)
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ decedentCEORequirementMetOverride: false })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentCEORequirementMetOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                >
                  미충족 (수동)
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ decedentCEORequirementMetOverride: undefined })}
                  className={`px-2 py-1 text-[10px] rounded border ${fb.decedentCEORequirementMetOverride === undefined ? "bg-amber-100 border-amber-400 text-amber-800" : "border-border bg-background"}`}
                >
                  자동 복귀
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
