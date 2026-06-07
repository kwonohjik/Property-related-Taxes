"use client";

/**
 * CohabitRequirementBlock — §23의2①1호 동거기간 입력 블록 (Phase 2, G3)
 *
 * 동거주택 ToggleCard ON 시 노출.
 * - cohabitStartDate: 동거 시작일 (DateInput)
 * - cohabitExcludedYears: §23의2② 부득이 사유 제외 연수 (DecimalInput, 선택)
 * - 동거연수 미리보기 (useMemo — calcCohabitYears 순수 함수, useEffect 금지)
 * - 10년 미만 rose/amber 경고 배지 (자동 배제 아님, 검증용)
 *
 * G6 겸용주택·오피스텔 적용 범위 hint 포함.
 *
 * 800줄 정책: HeirComposition.tsx 인라인 금지 — 별도 파일 분리.
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { calcCohabitYears } from "@/lib/tax-engine/deductions/inheritance-cohabit-helpers";

interface CohabitRequirementBlockProps {
  /** Heir.cohabitStartDate */
  cohabitStartDate: string | undefined;
  /** Heir.cohabitExcludedYears */
  cohabitExcludedYears: number | undefined;
  /** 상속인 생년월일 (미성년 기간 제외 판정용) */
  birthDate: string | undefined;
  /** 상속개시일 (연수 계산 기준일) */
  deathDate: string | undefined;
  onChange: (patch: { cohabitStartDate?: string; cohabitExcludedYears?: number }) => void;
}

export function CohabitRequirementBlock({
  cohabitStartDate,
  cohabitExcludedYears,
  birthDate,
  deathDate,
  onChange,
}: CohabitRequirementBlockProps) {
  // 동거연수 미리보기 — calcCohabitYears 순수 계산 (useEffect → store 미러링 금지)
  const preview = useMemo(() => {
    if (!cohabitStartDate || !deathDate) return null;
    try {
      return calcCohabitYears(
        cohabitStartDate,
        deathDate,
        birthDate,
        cohabitExcludedYears ?? 0,
      );
    } catch {
      return null;
    }
  }, [cohabitStartDate, deathDate, birthDate, cohabitExcludedYears]);

  return (
    <div
      className="ml-4 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-3"
      data-testid="cohabit-requirement-block"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 dark:bg-violet-800 text-[10px] font-bold text-violet-800 dark:text-violet-200 select-none">
          G3
        </span>
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
          §23의2①1호 동거기간 검증 (선택 입력)
        </p>
      </div>

      <p className="text-[11px] text-violet-600 dark:text-violet-400 leading-relaxed">
        동거 시작일을 입력하면 10년 이상 요건 충족 여부를 미리 확인할 수 있습니다.
        상속개시일부터 소급 10년 이상(미성년자 기간 제외, 2016.1.1.~) 동거가 요건입니다.
        미입력 시 동거주택 체크박스 확인 상태를 그대로 신뢰합니다.
      </p>

      {/* 동거 시작일 */}
      <div className="space-y-1" data-testid="cohabit-start-date-input">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          동거 시작일 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <DateInput
          value={cohabitStartDate ?? ""}
          onChange={(v) => onChange({ cohabitStartDate: v || undefined })}
        />
      </div>

      {/* 부득이 사유 제외 연수 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          §23의2② 부득이 사유 제외 연수 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <DecimalInput
          value={cohabitExcludedYears !== undefined ? String(cohabitExcludedYears) : ""}
          onChange={(v) => {
            const parsed = parseDecimal(v);
            onChange({ cohabitExcludedYears: parsed > 0 ? parsed : undefined });
          }}
          placeholder="없으면 빈칸"
          data-testid="cohabit-excluded-years-input"
        />
        <p className="text-[10px] text-violet-500 dark:text-violet-400">
          징집·취학·근무상 형편·질병 요양(상증령 §20의2)으로 동거하지 못한 기간은 계속 동거로 인정되나
          동거기간에는 산입하지 않습니다.
        </p>
      </div>

      {/* 동거연수 미리보기 */}
      {preview && (
        <div
          className={`rounded-md border p-2.5 space-y-1 text-xs ${
            preview.meetsRequirement
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-900/20"
              : "border-rose-200 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-900/20"
          }`}
          data-testid="cohabit-years-preview"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span
              className={
                preview.meetsRequirement
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300"
              }
            >
              {preview.meetsRequirement ? "✓ 10년 요건 충족" : "⚠ 10년 요건 미달"}
            </span>
          </div>
          <div className="text-gray-600 dark:text-gray-400 space-y-0.5">
            <p>
              산입 기간 합계:{" "}
              <strong>{preview.rawYears}년</strong>
              {preview.minorYearsDeducted > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}(미성년 {preview.minorYearsDeducted}년 제외)
                </span>
              )}
            </p>
            {(cohabitExcludedYears ?? 0) > 0 && (
              <p>
                부득이 제외:{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {cohabitExcludedYears}년 제외
                </span>
              </p>
            )}
            <p>
              유효 동거연수:{" "}
              <strong
                className={
                  preview.meetsRequirement
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300"
                }
              >
                {preview.effectiveYears}년
              </strong>
            </p>
          </div>
          {!preview.meetsRequirement && (
            <p className="text-rose-600 dark:text-rose-400 text-[10px]">
              동거기간이 10년 미만입니다. 요건 충족 여부를 세무사와 확인하시기 바랍니다.
              (자동 배제되지 않으며, 최종 판단은 신고 시 결정됩니다.)
            </p>
          )}
        </div>
      )}

      {/* G6 겸용주택·오피스텔 적용 범위 안내 */}
      <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-900/20 p-2.5 text-[10px] text-sky-700 dark:text-sky-300 space-y-0.5">
        <p className="font-semibold">§23의2 적용 범위 안내 (G6)</p>
        <p>• 겸용주택: 주택 면적이 주택 외 면적보다 큰 경우 전부 주택으로 봄</p>
        <p>• 상시주거용 오피스텔: 실제 주거 사용 확인 시 적용 가능</p>
        <p>• 조합원입주권: 원칙적으로 동거주택 상속공제 미적용</p>
      </div>
    </div>
  );
}
