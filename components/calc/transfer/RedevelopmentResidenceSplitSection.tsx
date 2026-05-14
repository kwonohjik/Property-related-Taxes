"use client";

/**
 * RedevelopmentResidenceSplitSection — 재개발 1세대1주택 거주월수 분리 입력
 *
 * 분리 사유: RedevelopmentBlock 800줄 정책 (사례 46 추가 대비, 2026-05-14).
 * 시행령 §155⑰ (거주기간 통산) + 사전법령해석재산 2020-386 (청산금분 신축거주만).
 * 가시성: 1세대1주택 + householdHousingCount === 1 일 때만 노출.
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 → buildResidencePatch 단일 패치
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { useMemo } from "react";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  isOneHouseSingle?: boolean;
}

export function RedevelopmentResidenceSplitSection({ asset, onChange, isOneHouseSingle }: Props) {
  const shouldHide = isOneHouseSingle === false;

  const guidance = useMemo(() => {
    const tp = parseAmount(asset.actualSalePrice || "");
    const prior = parseInt((asset.redevPriorHouseResidenceMonths || "0").replace(/,/g, ""), 10) || 0;
    const newM = parseInt((asset.redevNewHouseResidenceMonths || "0").replace(/,/g, ""), 10) || 0;
    const isHighValue = tp > 1_200_000_000;

    if (!isHighValue) {
      return {
        tone: "emerald" as const,
        title: "C-2 — 12억 이하 전액 비과세",
        body: "양도가액이 12억원 이하이므로 전체 양도차익이 비과세 대상입니다 (1세대1주택 충족 시).",
      };
    }
    const exceedsExisting = prior + newM >= 24;
    const exceedsNew = newM >= 24;
    if (exceedsExisting && exceedsNew) {
      return {
        tone: "sky" as const,
        title: "C-3 — 12억 초과 + 분할 LTHD 모두 표2 적용",
        body: "기존건물분과 청산금분 모두 표2(보유+거주) 적용. 거주월수 귀속은 분리되어 산정됩니다 (기존: 종전+신축 통산 / 청산금분: 신축만).",
      };
    }
    if (exceedsExisting && !exceedsNew) {
      return {
        tone: "violet" as const,
        title: "C-4 — 사전법령해석재산 2020-386 적용",
        body: "기존건물분은 표2(보유+거주), 청산금납부분은 표1(보유만, 30% 캡)이 적용됩니다. 신축주택에서 2년 이상 거주하지 못한 경우 청산금분은 §95② 본문 표1 강등.",
      };
    }
    return {
      tone: "amber" as const,
      title: "C-5 — 거주 2년 미충족 (두 분기 모두 표1)",
      body: "종전+신축 통산 거주월수가 24개월 미만이면 표2(80% 캡) 진입 가드 미충족. 기존건물분·청산금분 모두 §95② 본문 표1(30% 캡) 적용.",
    };
  }, [asset.actualSalePrice, asset.redevPriorHouseResidenceMonths, asset.redevNewHouseResidenceMonths]);

  if (shouldHide) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          6
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          거주개월 분리 입력 (1세대1주택 + 12억 초과 시)
        </p>
      </div>
      <p className="text-[11px] text-emerald-800 leading-relaxed">
        시행령 §155⑰ — 재개발·재건축 거주기간은 종전주택과 신축주택을 통산합니다.
        사전법령해석재산 2020-386 — 청산금납부분 LTHD 표2 진입은 신축주택 거주 2년 이상이 필요합니다.
      </p>

      <ResidencePeriodGroup
        label="종전주택 거주기간"
        hint="종전주택 취득일~관리처분(또는 그 이후 철거) 사이의 실거주 입주일·퇴거일을 입력하면 개월수가 자동 산정됩니다 (§155⑰ 통산 산식 prior)."
        startValue={asset.redevPriorResidenceStartDate}
        endValue={asset.redevPriorResidenceEndDate}
        monthsValue={asset.redevPriorHouseResidenceMonths}
        onChangeStart={(v) => onChange(buildResidencePatch("prior", v, asset.redevPriorResidenceEndDate))}
        onChangeEnd={(v) => onChange(buildResidencePatch("prior", asset.redevPriorResidenceStartDate, v))}
      />

      <ResidencePeriodGroup
        label="신축주택 거주기간"
        hint="준공검사일(사용승인일)~양도일 사이 신축아파트 실거주 입주일·퇴거일을 입력하면 개월수가 자동 산정됩니다 (해석례 2020-386 — 청산금분 표2 진입 가드)."
        startValue={asset.redevNewResidenceStartDate}
        endValue={asset.redevNewResidenceEndDate}
        monthsValue={asset.redevNewHouseResidenceMonths}
        onChangeStart={(v) => onChange(buildResidencePatch("new", v, asset.redevNewResidenceEndDate))}
        onChangeEnd={(v) => onChange(buildResidencePatch("new", asset.redevNewResidenceStartDate, v))}
      />

      <div
        className={`rounded-lg border p-3 text-xs leading-relaxed ${
          guidance.tone === "emerald"
            ? "border-emerald-300 bg-emerald-100/60 text-emerald-900"
            : guidance.tone === "sky"
              ? "border-sky-300 bg-sky-100/60 text-sky-900"
              : guidance.tone === "violet"
                ? "border-violet-300 bg-violet-100/60 text-violet-900"
                : "border-amber-300 bg-amber-100/60 text-amber-900"
        }`}
      >
        <p className="font-semibold mb-1">{guidance.title}</p>
        <p>{guidance.body}</p>
      </div>
    </div>
  );
}

function computeResidenceMonths(start: string, end: string): number | undefined {
  if (!start || !end) return undefined;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  if (s.getTime() > e.getTime()) return undefined;
  const y = e.getFullYear() - s.getFullYear();
  const m = e.getMonth() - s.getMonth();
  const d = e.getDate() - s.getDate();
  return y * 12 + m - (d < 0 ? 1 : 0);
}

function buildResidencePatch(which: "prior" | "new", start: string, end: string): Partial<AssetForm> {
  const months = computeResidenceMonths(start, end);
  const monthsStr = months !== undefined ? String(months) : "";
  if (which === "prior") {
    return {
      redevPriorResidenceStartDate: start,
      redevPriorResidenceEndDate: end,
      redevPriorHouseResidenceMonths: monthsStr,
    };
  }
  return {
    redevNewResidenceStartDate: start,
    redevNewResidenceEndDate: end,
    redevNewHouseResidenceMonths: monthsStr,
  };
}

function ResidencePeriodGroup({
  label,
  hint,
  startValue,
  endValue,
  monthsValue,
  onChangeStart,
  onChangeEnd,
}: {
  label: string;
  hint: string;
  startValue: string;
  endValue: string;
  monthsValue: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
}) {
  const previewMonths = useMemo(() => computeResidenceMonths(startValue, endValue), [startValue, endValue]);
  const hasError = useMemo(() => {
    if (!startValue || !endValue) return false;
    const s = new Date(startValue);
    const e = new Date(endValue);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
    return s.getTime() > e.getTime();
  }, [startValue, endValue]);

  const displayMonths =
    previewMonths !== undefined
      ? previewMonths
      : monthsValue
        ? parseInt(monthsValue.replace(/,/g, ""), 10)
        : undefined;

  return (
    <div className="rounded-md border border-emerald-200 bg-white/60 p-3 space-y-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-emerald-900">{label}</p>
        <p className="text-[11px] text-emerald-700">{hint}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <FieldCard label="입주일">
          <DateInput value={startValue} onChange={onChangeStart} />
        </FieldCard>
        <FieldCard label="퇴거일">
          <DateInput value={endValue} onChange={onChangeEnd} />
        </FieldCard>
      </div>
      <div
        className={`rounded-md border p-2 text-[11px] ${
          hasError
            ? "border-rose-300 bg-rose-50 text-rose-800"
            : "border-emerald-200 bg-emerald-100/60 text-emerald-900"
        }`}
      >
        {hasError ? (
          <p>입주일이 퇴거일보다 이후입니다. 날짜를 확인하세요.</p>
        ) : displayMonths !== undefined ? (
          <p>
            자동 산정 거주개월수: <span className="font-semibold font-mono">{displayMonths}</span> 개월
          </p>
        ) : (
          <p className="text-emerald-700">입주일과 퇴거일을 모두 입력하면 거주개월수가 자동 산정됩니다.</p>
        )}
      </div>
    </div>
  );
}
