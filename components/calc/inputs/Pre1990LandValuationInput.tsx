"use client";

/**
 * Pre1990LandValuationInput — 1990.8.30. 이전 취득 토지 기준시가 환산 입력 UI
 *
 * 진입 조건: propertyType === "land" + acquisitionDate < 1990-08-30
 * (상위에서 `pre1990Enabled` 토글로 제어)
 *
 * 동작:
 *   - 면적은 상위 자산 면적과 자동 연동 (CompanionAcqPurchaseBlock에서 useEffect로 동기화)
 *   - 1990.8.30. 개별공시지가는 vworld API(year=1990)로 자동 조회 가능
 *   - 모든 입력값 충족 시 클라이언트에서 환산 계산 → onCalculatedPrice 콜백으로 취득시 기준시가 자동 입력
 *   - 양도당시 개별공시지가는 별도 입력하지 않음 (양도시 기준시가는 상위에서 별도 관리)
 */

import { useEffect, useState } from "react";
import { CurrencyInput } from "./CurrencyInput";
import { getGradeValue } from "@/lib/tax-engine/data/land-grade-values";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";

export interface Pre1990FormSlice {
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";
}

interface Props {
  form: Pre1990FormSlice;
  onChange: (patch: Partial<Pre1990FormSlice>) => void;
  /** 취득 당시 면적 (㎡) — 환산 계산의 areaSqm. 상위 자산 aquisitionArea 주입. */
  acquisitionArea?: string;
  /** vworld 조회용 지번 주소 (1990.8.30. 개별공시지가 자동 조회) */
  jibun?: string;
  /** 취득일 — 환산 계산 + CAP-2 트리거 판정용 */
  acquisitionDate?: string;
  /** 양도일 — 엔진 입력 형식상 필요 (계산엔 미사용) */
  transferDate?: string;
  /** 환산 결과(취득시 기준시가, 원 총액)를 부모에게 전달 — 자동 입력용 */
  onCalculatedPrice?: (standardPriceAtAcq: number) => void;
}

/** 등급 입력을 파싱해 등급가액을 반환. 실패 시 null. */
function tryResolveGrade(mode: "number" | "value", input: string | undefined): { value: number; note: string } | null {
  if (!input) return null;
  const n = Number(input.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (mode === "number") {
    try {
      return { value: getGradeValue(Math.trunc(n)), note: `등급 ${Math.trunc(n)} → 등급가액 ${getGradeValue(Math.trunc(n)).toLocaleString()}` };
    } catch {
      return null;
    }
  }
  return { value: n, note: `등급가액 직접 입력: ${n.toLocaleString()}` };
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function Pre1990LandValuationInput({
  form,
  onChange,
  acquisitionArea,
  jibun,
  acquisitionDate,
  transferDate,
  onCalculatedPrice,
}: Props) {
  const mode = form.pre1990GradeMode ?? "number";
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const previews = {
    current: tryResolveGrade(mode, form.pre1990Grade_current),
    prev:    tryResolveGrade(mode, form.pre1990Grade_prev),
    atAcq:   tryResolveGrade(mode, form.pre1990Grade_atAcq),
  };

  const area = parseAmount(acquisitionArea);
  const price1990 = parseAmount(form.pre1990PricePerSqm_1990);

  // 모든 입력 충족 시 자동 환산 계산 → 취득시 기준시가 자동 입력
  useEffect(() => {
    if (!form.pre1990Enabled) return;
    if (!onCalculatedPrice) return;
    if (!acquisitionDate || !transferDate) return;
    if (area <= 0 || price1990 <= 0) return;
    if (!previews.current || !previews.prev || !previews.atAcq) return;

    try {
      const result = calculatePre1990LandValuation({
        acquisitionDate: new Date(acquisitionDate),
        transferDate: new Date(transferDate),
        areaSqm: area,
        pricePerSqm_1990: price1990,
        // 양도시 가액은 상위에서 별도 입력 — 환산엔 사용 안 함, validateInput 통과용으로 동일값 주입
        pricePerSqm_atTransfer: price1990,
        grade_1990_0830: { gradeValue: previews.current.value },
        gradePrev_1990_0830: { gradeValue: previews.prev.value },
        gradeAtAcquisition: { gradeValue: previews.atAcq.value },
      });
      onCalculatedPrice(result.standardPriceAtAcquisition);
    } catch {
      // 입력 불완전 — 무시 (사용자가 채우는 중)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.pre1990Enabled,
    acquisitionDate,
    acquisitionArea,
    transferDate,
    area,
    price1990,
    previews.current?.value,
    previews.prev?.value,
    previews.atAcq?.value,
  ]);

  async function handleLookup1990Price() {
    if (!jibun) {
      setLookupMsg({ text: "먼저 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const params = new URLSearchParams({
        jibun,
        propertyType: "land",
        year: "1990",
      });
      const res = await fetch(`/api/address/standard-price?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ text: data?.error?.message ?? "공시가격 조회 실패", kind: "err" });
        return;
      }
      const price = data.price ?? data.pricePerSqm ?? 0;
      if (price > 0) {
        onChange({ pre1990PricePerSqm_1990: String(price) });
        setLookupMsg({ text: `1990년 개별공시지가: ${price.toLocaleString()}원/㎡`, kind: "ok" });
      } else {
        setLookupMsg({ text: "1990년 가격 정보 없음 — 직접 입력해주세요.", kind: "err" });
      }
    } catch {
      setLookupMsg({ text: "네트워크 오류 — 직접 입력해주세요.", kind: "err" });
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
      <div>
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          1990.8.30. 이전 취득 토지 기준시가 환산
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          개별공시지가 고시(1990.8.30.) 이전 취득한 토지는 토지등급가액표를 이용해
          취득 당시 기준시가를 환산합니다. (소득세법 시행규칙 §80⑥·집행기준 97-176의2)
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.pre1990Enabled}
          onChange={(e) => onChange({ pre1990Enabled: e.target.checked })}
          className="h-4 w-4 accent-amber-600"
        />
        <span className="font-medium">환산 기능 사용</span>
      </label>

      {!form.pre1990Enabled ? null : (
        <div className="space-y-4">
          {/* 면적 — 상위 자산 취득 당시 면적 자동 연동 (직접 수정 불필요) */}
          {acquisitionArea && (
            <p className="text-xs text-muted-foreground">
              환산 면적: <strong>{parseAmount(acquisitionArea).toLocaleString()}㎡</strong>
              <span className="ml-1">(취득 당시 면적 자동 적용)</span>
            </p>
          )}
          {!acquisitionArea && (
            <p className="text-xs text-amber-700">
              ⚠ 취득 당시 면적을 먼저 입력하면 환산 계산이 자동으로 실행됩니다.
            </p>
          )}

          {/* 1990.8.30. 개별공시지가 + 조회 버튼 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              1990.8.30. 개별공시지가 (원/㎡) <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CurrencyInput
                  label=""
                  value={form.pre1990PricePerSqm_1990 ?? ""}
                  onChange={(v) => onChange({ pre1990PricePerSqm_1990: v })}
                  placeholder="예: 54000"
                />
              </div>
              <button
                type="button"
                onClick={handleLookup1990Price}
                disabled={lookupLoading || !jibun}
                className="shrink-0 px-3 py-2 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {lookupLoading ? "조회 중…" : "공시가격 조회"}
              </button>
            </div>
            {lookupMsg && (
              <p className={`text-xs ${lookupMsg.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                {lookupMsg.text}
              </p>
            )}
          </div>

          {/* 등급 입력 모드 토글 */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">토지등급 입력 방식</p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="pre1990GradeMode"
                  checked={mode === "number"}
                  onChange={() => onChange({ pre1990GradeMode: "number" })}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>등급번호 (1~365)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="pre1990GradeMode"
                  checked={mode === "value"}
                  onChange={() => onChange({ pre1990GradeMode: "value" })}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>등급가액 직접 입력</span>
              </label>
            </div>
          </div>

          {/* 3개 등급 */}
          <div className="grid grid-cols-3 gap-2">
            <GradeField
              label="1990.8.30. 현재 등급"
              value={form.pre1990Grade_current ?? ""}
              onChange={(v) => onChange({ pre1990Grade_current: v })}
              preview={previews.current}
            />
            <GradeField
              label="1990.8.30. 직전 등급"
              value={form.pre1990Grade_prev ?? ""}
              onChange={(v) => onChange({ pre1990Grade_prev: v })}
              preview={previews.prev}
            />
            <GradeField
              label="취득시 유효 등급"
              value={form.pre1990Grade_atAcq ?? ""}
              onChange={(v) => onChange({ pre1990Grade_atAcq: v })}
              preview={previews.atAcq}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            ※ 토지대장 및 부동산공시가격 알리미(realtyprice.kr)에서 조회 가능합니다.
            1990.1.1. 등급조정이 없었다면 직전 등급은 현재 등급과 동일하게 입력하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function GradeField({
  label,
  value,
  onChange,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  preview: { value: number; note: string } | null;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium leading-snug">{label} <span className="text-destructive">*</span></label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="예: 103"
      />
      {value && !preview && (
        <p className="text-[11px] text-destructive">등급 범위 밖이거나 올바르지 않은 값입니다.</p>
      )}
      {preview && (
        <p className="text-[11px] text-muted-foreground">{preview.note}</p>
      )}
    </div>
  );
}
