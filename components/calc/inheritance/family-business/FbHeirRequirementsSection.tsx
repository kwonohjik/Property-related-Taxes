"use client";

/**
 * FbHeirRequirementsSection — 상속인 요건 ④ (4요건 자동판정 + 접힌 수동보정, ~230줄)
 *
 * 섹션④: 배우자간주 토글(상단) + 18세·2년종사·신고기한임원·2년내대표 각 요건별
 *   - 자동판정 미리보기(FbAutoCheckPreviewCard, useMemo)
 *   - 접힌 "수동 보정" 펼침 (ToggleCard override)
 *
 * 정책:
 *   - feedback_useeffect_store_mirror_forbidden: useMemo만, useEffect→store 미러링 절대 금지
 *   - 자동값은 store에 쓰지 않음 — 엔진이 계산 시점에 resolve
 *   - testid: fb-preview-adult · fb-preview-engagement · fb-preview-officer · fb-preview-ceo
 *   - testid override: fb-override-adult · fb-override-engagement · fb-override-officer · fb-override-ceo
 */

import { useMemo, useState } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import {
  calcInheritanceFilingDeadline,
  deriveFBHeirIsAdult,
  deriveFBHeirOfficerByDeadline,
  deriveFBHeirCEOWithinTwoYears,
  deriveFBHeirEngagement,
} from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import { FbAutoCheckPreviewCard } from "./FbAutoCheckPreviewCard";

interface Props {
  familyBusiness: FamilyBusinessInheritanceInput;
  /** 해당 Heir의 생년월일 (HeirSelector에서 resolve된 값) */
  heirBirthDate: string | undefined;
  deathDate: string;
  onChange: (patch: Partial<FamilyBusinessInheritanceInput>) => void;
}

export function FbHeirRequirementsSection({
  familyBusiness: fb,
  heirBirthDate,
  deathDate,
  onChange,
}: Props) {
  // 수동보정 펼침 상태
  const [openAdult, setOpenAdult] = useState(false);
  const [openEngagement, setOpenEngagement] = useState(false);
  const [openOfficer, setOpenOfficer] = useState(false);
  const [openCEO, setOpenCEO] = useState(false);

  const spouseFulfills = fb.spouseFulfillsRequirements === true;
  const earlyDeath = fb.decedentEarlyDeath === true;

  // ── 신고기한 (useMemo)
  const filingDeadline = useMemo(() => {
    if (!deathDate) return "";
    return calcInheritanceFilingDeadline(deathDate);
  }, [deathDate]);

  // ── 18세 자동판정 (useMemo — store 미러링 없음)
  const effectiveBirthDate = heirBirthDate ?? fb.heirBirthDate;
  const autoAdult = useMemo<boolean | null>(() => {
    if (!effectiveBirthDate || !deathDate) return null;
    return deriveFBHeirIsAdult(effectiveBirthDate, deathDate);
  }, [effectiveBirthDate, deathDate]);

  const adultFormula = useMemo(() => {
    if (!effectiveBirthDate || !deathDate) return "생년월일을 입력하면 18세 자동판정";
    try {
      const age = differenceInYears(parseISO(deathDate), parseISO(effectiveBirthDate));
      return `만 ${age}세 (${effectiveBirthDate}생, 상속 ${deathDate})`;
    } catch {
      return "날짜 형식을 확인하세요";
    }
  }, [effectiveBirthDate, deathDate]);

  // ── 2년 종사 자동판정 (useMemo)
  const autoEngagement = useMemo<boolean | null>(() => {
    if (!earlyDeath && !fb.heirEngagementStartDate) return null;
    if (!deathDate) return null;
    return deriveFBHeirEngagement(fb.heirEngagementStartDate, deathDate, earlyDeath);
  }, [fb.heirEngagementStartDate, deathDate, earlyDeath]);

  const engagementFormula = useMemo(() => {
    if (earlyDeath) return "피상속인 65세 미만·천재지변 사망 — 2년 요건 면제";
    if (!fb.heirEngagementStartDate) return "종사시작일을 입력하면 자동판정";
    if (!deathDate) return "상속개시일을 입력하세요";
    try {
      const yrs = differenceInYears(parseISO(deathDate), parseISO(fb.heirEngagementStartDate));
      return `${fb.heirEngagementStartDate} 종사 시작 → 상속개시 ${deathDate} (${yrs}년)`;
    } catch {
      return "날짜 형식을 확인하세요";
    }
  }, [fb.heirEngagementStartDate, deathDate, earlyDeath]);

  // ── 신고기한 임원취임 자동판정 (useMemo)
  const autoOfficer = useMemo<boolean | null>(() => {
    if (!fb.heirOfficerAppointDate || !filingDeadline) return null;
    return deriveFBHeirOfficerByDeadline(fb.heirOfficerAppointDate, filingDeadline);
  }, [fb.heirOfficerAppointDate, filingDeadline]);

  const officerFormula = useMemo(() => {
    if (!fb.heirOfficerAppointDate) return `임원취임일을 입력하면 자동판정 (신고기한 ${filingDeadline || "계산 중"})`;
    return `임원취임 ${fb.heirOfficerAppointDate} ≤ 신고기한 ${filingDeadline}`;
  }, [fb.heirOfficerAppointDate, filingDeadline]);

  // ── 2년내 대표이사 자동판정 (useMemo)
  const autoCEO = useMemo<boolean | null>(() => {
    if (!fb.heirCEOAppointDate || !filingDeadline) return null;
    return deriveFBHeirCEOWithinTwoYears(fb.heirCEOAppointDate, filingDeadline);
  }, [fb.heirCEOAppointDate, filingDeadline]);

  const ceoFormula = useMemo(() => {
    if (!fb.heirCEOAppointDate) return `대표이사 취임일을 입력하면 자동판정 (신고기한+2년 이내)`;
    return `대표이사 취임 ${fb.heirCEOAppointDate} ≤ 신고기한 ${filingDeadline} + 2년`;
  }, [fb.heirCEOAppointDate, filingDeadline]);

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
          4
        </span>
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-200">
          상속인 요건 (상증령 §15③2호)
        </p>
      </div>

      {/* 신고기한 표시 */}
      {filingDeadline && (
        <div className="rounded bg-sky-100/60 dark:bg-sky-900/30 px-2 py-1 text-[10px] text-sky-700 dark:text-sky-300">
          신고기한 (§67): {filingDeadline}
        </div>
      )}

      {/* 배우자 간주 토글 */}
      <ToggleCard
        tone="sky"
        size="sm"
        title="상속인의 배우자가 가~라 요건 모두 충족 (간주)"
        description="충족 시 상속인 본인의 4종 요건 평가 skip (상증령 §15③2호 후단 간주)"
        checked={fb.spouseFulfillsRequirements ?? false}
        onCheckedChange={(v) =>
          onChange({ spouseFulfillsRequirements: v ? true : undefined })
        }
      />

      {/* ── 가. 18세 이상 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
          가. 18세 이상 (상증령 §15③2호 가)
        </p>
        <FbAutoCheckPreviewCard
          autoMet={spouseFulfills ? true : autoAdult}
          override={spouseFulfills ? undefined : fb.heirIsAdultOverride}
          formula={spouseFulfills ? "배우자 간주 충족" : adultFormula}
          lawLabel="§15③2호 가"
          testId="fb-preview-adult"
        />
        {!spouseFulfills && (
          <div>
            <button
              type="button"
              onClick={() => setOpenAdult((v) => !v)}
              className="text-[10px] text-sky-600 dark:text-sky-400 underline underline-offset-2"
            >
              {openAdult ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만)"}
            </button>
            {openAdult && (
              <div className="mt-1.5 space-y-1" data-testid="fb-override-adult">
                <p className="text-[10px] text-muted-foreground">
                  undefined로 되돌리면 자동판정으로 복귀합니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ heirIsAdultOverride: true })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirIsAdultOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                  >
                    충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirIsAdultOverride: false })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirIsAdultOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                  >
                    미충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirIsAdultOverride: undefined })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirIsAdultOverride === undefined ? "bg-sky-100 border-sky-400 text-sky-800" : "border-border bg-background"}`}
                  >
                    자동 복귀
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 나. 2년 이상 가업 종사 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
          나. 2년 이상 가업 종사 (상증령 §15③2호 나)
        </p>
        {/* 65세 미만 사망 단서 토글 */}
        <ToggleCard
          tone="sky"
          size="sm"
          title="피상속인 65세 미만 사망 또는 천재지변·인재 사망 (나 단서)"
          description="체크 시 2년 종사 요건 면제"
          checked={fb.decedentEarlyDeath ?? false}
          onCheckedChange={(v) => onChange({ decedentEarlyDeath: v ? true : undefined })}
        />
        {/* 종사시작일 DateInput */}
        {!earlyDeath && (
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-sky-700 dark:text-sky-300">
              가업종사 시작일
            </label>
            <DateInput
              value={fb.heirEngagementStartDate ?? ""}
              onChange={(v) => onChange({ heirEngagementStartDate: v || undefined })}
            />
          </div>
        )}
        <FbAutoCheckPreviewCard
          autoMet={spouseFulfills ? true : autoEngagement}
          override={spouseFulfills ? undefined : fb.heirTwoYearEngagementOverride}
          formula={spouseFulfills ? "배우자 간주 충족" : engagementFormula}
          lawLabel="§15③2호 나"
          testId="fb-preview-engagement"
        />
        {!spouseFulfills && (
          <div>
            <button
              type="button"
              onClick={() => setOpenEngagement((v) => !v)}
              className="text-[10px] text-sky-600 dark:text-sky-400 underline underline-offset-2"
            >
              {openEngagement ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만)"}
            </button>
            {openEngagement && (
              <div className="mt-1.5 space-y-1" data-testid="fb-override-engagement">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ heirTwoYearEngagementOverride: true })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirTwoYearEngagementOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                  >
                    충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirTwoYearEngagementOverride: false })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirTwoYearEngagementOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                  >
                    미충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirTwoYearEngagementOverride: undefined })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirTwoYearEngagementOverride === undefined ? "bg-sky-100 border-sky-400 text-sky-800" : "border-border bg-background"}`}
                  >
                    자동 복귀
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 다. 신고기한 임원취임 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
          다. 신고기한까지 임원 취임 (상증령 §15③2호 다)
        </p>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-sky-700 dark:text-sky-300">
            임원 취임일
          </label>
          <DateInput
            value={fb.heirOfficerAppointDate ?? ""}
            onChange={(v) => onChange({ heirOfficerAppointDate: v || undefined })}
          />
        </div>
        <FbAutoCheckPreviewCard
          autoMet={spouseFulfills ? true : autoOfficer}
          override={spouseFulfills ? undefined : fb.heirOfficerByFilingDeadlineOverride}
          formula={spouseFulfills ? "배우자 간주 충족" : officerFormula}
          lawLabel="§15③2호 다"
          testId="fb-preview-officer"
        />
        {!spouseFulfills && (
          <div>
            <button
              type="button"
              onClick={() => setOpenOfficer((v) => !v)}
              className="text-[10px] text-sky-600 dark:text-sky-400 underline underline-offset-2"
            >
              {openOfficer ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만)"}
            </button>
            {openOfficer && (
              <div className="mt-1.5 space-y-1" data-testid="fb-override-officer">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ heirOfficerByFilingDeadlineOverride: true })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirOfficerByFilingDeadlineOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                  >
                    충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirOfficerByFilingDeadlineOverride: false })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirOfficerByFilingDeadlineOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                  >
                    미충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirOfficerByFilingDeadlineOverride: undefined })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirOfficerByFilingDeadlineOverride === undefined ? "bg-sky-100 border-sky-400 text-sky-800" : "border-border bg-background"}`}
                  >
                    자동 복귀
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 라. 2년내 대표이사 취임 ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
          라. 신고기한 후 2년 이내 대표이사 취임 (상증령 §15③2호 라)
        </p>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-sky-700 dark:text-sky-300">
            대표이사 취임(예정)일
          </label>
          <DateInput
            value={fb.heirCEOAppointDate ?? ""}
            onChange={(v) => onChange({ heirCEOAppointDate: v || undefined })}
          />
        </div>
        <FbAutoCheckPreviewCard
          autoMet={spouseFulfills ? true : autoCEO}
          override={spouseFulfills ? undefined : fb.heirCEOWithinTwoYearsOverride}
          formula={spouseFulfills ? "배우자 간주 충족" : ceoFormula}
          lawLabel="§15③2호 라"
          testId="fb-preview-ceo"
        />
        {!spouseFulfills && (
          <div>
            <button
              type="button"
              onClick={() => setOpenCEO((v) => !v)}
              className="text-[10px] text-sky-600 dark:text-sky-400 underline underline-offset-2"
            >
              {openCEO ? "▲ 수동 보정 접기" : "▼ 수동 보정 (자동과 다른 경우만)"}
            </button>
            {openCEO && (
              <div className="mt-1.5 space-y-1" data-testid="fb-override-ceo">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ heirCEOWithinTwoYearsOverride: true })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirCEOWithinTwoYearsOverride === true ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "border-border bg-background"}`}
                  >
                    충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirCEOWithinTwoYearsOverride: false })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirCEOWithinTwoYearsOverride === false ? "bg-rose-100 border-rose-400 text-rose-800" : "border-border bg-background"}`}
                  >
                    미충족 (수동)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heirCEOWithinTwoYearsOverride: undefined })}
                    className={`px-2 py-1 text-[10px] rounded border ${fb.heirCEOWithinTwoYearsOverride === undefined ? "bg-sky-100 border-sky-400 text-sky-800" : "border-border bg-background"}`}
                  >
                    자동 복귀
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
