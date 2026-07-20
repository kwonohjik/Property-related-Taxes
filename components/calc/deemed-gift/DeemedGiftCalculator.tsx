"use client";

/**
 * DeemedGiftCalculator — 증여로 보는 경우(증여이익) 독립 계산기 (Phase 1).
 * 유형 선택 → 상세 입력 모달(증여일 + 유형별 입력) → 증여이익 산정 → 증여세 마법사 prefill 이관.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  DeemedTypeSelector,
  DEEMED_TYPE_META,
  INITIAL_DEEMED,
  type DeemedFormState,
} from "@/components/calc/deemed-gift/shared";
import { DeemedDetailModal } from "@/components/calc/deemed-gift/DeemedDetailModal";
import { DeemedGiftResultView } from "@/components/calc/results/DeemedGiftResultView";
import { buildDeemedGiftInput, buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import type { DeemedGiftAnyResult, DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";

export function DeemedGiftCalculator() {
  const router = useRouter();
  const [form, setForm] = useState<DeemedFormState>(INITIAL_DEEMED);
  const [result, setResult] = useState<DeemedGiftAnyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const set = (patch: Partial<DeemedFormState>) => {
    setForm((p) => ({ ...p, ...patch }));
    setResult(null);
    setError(null); // 모달 내 편집 시 에러 잔존 방지
  };

  async function handleCalc() {
    const v = validateDeemedInput(form);
    if (v) {
      setError(v);
      if (form.type) setModalOpen(true); // D7: 누락 필드는 모달 안 → 재오픈
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
      setResult(json.result as DeemedGiftAnyResult);
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

  // 멀티 수증자 선택 — result 유지(set()는 result를 리셋하므로 직접 setForm). 유형별 인덱스 분리.
  const selectDonee = (i: number) =>
    setForm((p) => ({
      ...p,
      ...(result?.type === "specific_corp" ? { scSelectedDoneeIndex: i } : { cdSelectedDoneeIndex: i }),
    }));

  return (
    <div className="space-y-5">
      <SectionHeader title="① 증여로 보는 경우 유형" />
      <DeemedTypeSelector
        value={form.type}
        onChange={(v: DeemedGiftType) => {
          set({ type: v });
          setModalOpen(true);
        }}
      />

      {form.type && (
        <div
          data-testid="deemed-summary-card"
          className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-rose-900">
              {DEEMED_TYPE_META[form.type].label}
            </p>
            <p className="text-xs text-rose-700">{DEEMED_TYPE_META[form.type].law}</p>
            <p className="text-xs text-muted-foreground">
              증여일 {form.giftDate || "미입력"}
            </p>
          </div>
          <Button
            type="button"
            variant="modalLauncher"
            size="xs"
            onClick={() => setModalOpen(true)}
            data-testid="deemed-edit-btn"
            className="shrink-0"
          >
            수정
          </Button>
        </div>
      )}

      <DeemedDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        set={set}
        error={modalOpen ? error : null}
      />

      {error && (
        <p className="text-sm font-medium text-rose-600" data-testid="deemed-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleCalc}
        disabled={loading || !form.type}
        data-testid="deemed-calc-btn"
        className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? "계산 중..." : "증여이익 계산"}
      </button>

      {result && (
        <DeemedGiftResultView
          result={result}
          onToGiftTax={handleToGiftTax}
          selectedDoneeIndex={result.type === "specific_corp" ? form.scSelectedDoneeIndex : form.cdSelectedDoneeIndex}
          onSelectDonee={selectDonee}
        />
      )}

      <div className="pt-2">
        <HomeButton />
      </div>
    </div>
  );
}
