"use client";

/**
 * DeemedGiftCalculator — 증여로 보는 경우(증여이익) 독립 계산기 (Phase 1).
 * 증여일 + 유형 선택 + 유형별 입력 → 증여이익 산정 → 증여세 마법사 prefill 이관.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import {
  DeemedTypeSelector,
  DeemedInputFields,
  INITIAL_DEEMED,
  type DeemedFormState,
} from "@/components/calc/deemed-gift/shared";
import { DeemedGiftResultView } from "@/components/calc/results/DeemedGiftResultView";
import { buildDeemedGiftInput, buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import type { DeemedGiftResult, DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";

export function DeemedGiftCalculator() {
  const router = useRouter();
  const [form, setForm] = useState<DeemedFormState>(INITIAL_DEEMED);
  const [result, setResult] = useState<DeemedGiftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (patch: Partial<DeemedFormState>) => {
    setForm((p) => ({ ...p, ...patch }));
    setResult(null);
  };

  async function handleCalc() {
    const v = validateDeemedInput(form);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const input = buildDeemedGiftInput(form);
      const res = await fetch("/api/calc/gift-deemed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "계산 중 오류가 발생했습니다.");
        return;
      }
      setResult(json.result as DeemedGiftResult);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleToGiftTax() {
    if (!result) return;
    const prefill = buildGiftWizardPrefill(form, result);
    sessionStorage.setItem("giftTaxResumeInput", JSON.stringify(prefill));
    router.push("/calc/gift-tax");
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
        <label className="mb-1 block text-sm font-semibold text-slate-700">증여일</label>
        <DateInput value={form.giftDate} onChange={(v) => set({ giftDate: v })} />
        <p className="mt-1 text-xs text-muted-foreground">증여시기·적정이자율 연도 기준</p>
      </div>

      <SectionHeader title="① 증여로 보는 경우 유형" />
      <DeemedTypeSelector
        value={form.type}
        onChange={(v: DeemedGiftType) => set({ type: v })}
      />

      {form.type && (
        <>
          <SectionHeader title="② 상세 입력" />
          <DeemedInputFields form={form} set={set} />
        </>
      )}

      {error && <p className="text-sm font-medium text-rose-600" data-testid="deemed-error">{error}</p>}

      <button
        type="button"
        onClick={handleCalc}
        disabled={loading || !form.type}
        data-testid="deemed-calc-btn"
        className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? "계산 중..." : "증여이익 계산"}
      </button>

      {result && <DeemedGiftResultView result={result} onToGiftTax={handleToGiftTax} />}

      <div className="pt-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← 홈으로
        </Link>
      </div>
    </div>
  );
}
