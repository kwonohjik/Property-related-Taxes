"use client";

/**
 * 단기재상속공제 (§30) 입력 섹션 — 재산별 구분 (집행 30-22-1②)
 *
 * 1차 상속개시일(banding 자동) + 전의 산출세액·상속재산가액 + 재상속분 재산 목록.
 * steps.tsx Step5에서 분리 (800줄 정책). 엔진 banding 헬퍼를 직접 import (single-source).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  deriveShortTermReinheritBand,
  getShortTermReinheritRate,
} from "@/lib/tax-engine/credits/short-term-reinheritance";
import type { FormState, FormSet } from "./shared";

export function ShortTermReinheritSection({
  form,
  set,
}: {
  form: FormState;
  set: FormSet;
}) {
  const assets = form.shortTermReinheritAssets;

  const addAsset = () =>
    set({ shortTermReinheritAssets: [...assets, { name: "", value: "" }] });
  const updateAsset = (
    i: number,
    patch: Partial<{ name: string; value: string }>,
  ) =>
    set({
      shortTermReinheritAssets: assets.map((a, idx) =>
        idx === i ? { ...a, ...patch } : a,
      ),
    });
  const removeAsset = (i: number) =>
    set({ shortTermReinheritAssets: assets.filter((_, idx) => idx !== i) });

  // banding 자동 표시 (1차·2차 상속개시일 모두 있을 때) — 엔진 헬퍼 단일 진실
  const bandInfo =
    form.shortTermReinheritPriorDeathDate && form.deathDate
      ? (() => {
          try {
            const band = deriveShortTermReinheritBand(
              form.shortTermReinheritPriorDeathDate,
              form.deathDate,
            );
            return { band, rate: getShortTermReinheritRate(band) };
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <ToneCard
      tone="sky"
      bodyClassName="space-y-3"
      noDark
      title={<>단기재상속공제 (§30) <LawArticleModal legalBasis="상증법 §30" label="§30" /></>}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400">
        피상속인이 10년 이내에 상속받은 재산이 다시 상속되는 경우, 1차 상속개시일과 재상속되는 재산을 종류별로
        입력하면 전의 산출세액 중 재상속분 상당액에 공제율(경과 구간별)을 적용해 공제합니다.
      </p>

      {/* 1차 상속개시일 — banding 자동 */}
      <FieldCard
        label="1차(전의) 상속개시일"
        hint="피상속인이 이 재산을 상속받은 날. 현재 상속개시일과의 경과 구간으로 공제율이 자동 산정됩니다."
      >
        <DateInput
          value={form.shortTermReinheritPriorDeathDate}
          onChange={(v) => set({ shortTermReinheritPriorDeathDate: v })}
        />
      </FieldCard>

      {bandInfo && (
        <div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-xs text-sky-800">
          경과 구간 <b>{bandInfo.band}년 이내</b> → 공제율{" "}
          <b>{(bandInfo.rate * 100).toFixed(0)}%</b>
          {bandInfo.rate === 0 && " (10년 초과 — 공제 없음)"}
        </div>
      )}

      {form.shortTermReinheritPriorDeathDate && (
        <>
          <FieldCard
            label="전의 상속세 산출세액"
            hint="1차 상속의 전체 산출세액(결정세액·특정 상속인 몫 아님). §30②1호 계수."
          >
            <CurrencyInput
              label="전의 상속세 산출세액"
              hideLabel
              value={form.shortTermReinheritTaxPaid}
              onChange={(v) => set({ shortTermReinheritTaxPaid: v })}
            />
          </FieldCard>

          <FieldCard
            label="전의 상속재산가액"
            hint="1차 총상속재산(채무공제 전, 과세가액 아님). §30②1호 분모."
          >
            <CurrencyInput
              label="전의 상속재산가액"
              hideLabel
              value={form.shortTermReinheritPriorEstateValue}
              onChange={(v) => set({ shortTermReinheritPriorEstateValue: v })}
            />
          </FieldCard>

          {/* 재상속분 재산 목록 (재산별 구분) */}
          <div className="rounded-md border border-sky-100 bg-white/60 p-2.5 space-y-2">
            <p className="text-caption font-semibold text-sky-700">
              재상속분 재산 (재산별 구분 — 집행 30-22-1②)
            </p>
            <p className="text-caption text-gray-500 dark:text-gray-400">
              피상속인이 1차에서 받아 다시 상속되는 재산을 종류별로 입력. 가액은{" "}
              <b>1차 상속 당시 평가액</b>(2차 평가액 아님).
            </p>
            {assets.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => updateAsset(i, { name: e.target.value })}
                  placeholder="재산 명칭 (예: 비상장주식)"
                  className="w-32 shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex-1">
                  <CurrencyInput
                    label="재상속분 가액"
                    hideLabel
                    value={a.value}
                    onChange={(v) => updateAsset(i, { value: v })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAsset(i)}
                  className="shrink-0 rounded-md border border-rose-200 px-2 py-2 text-xs text-rose-600 hover:bg-rose-50"
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addAsset}
              className="w-full rounded-md border border-dashed border-sky-300 py-2 text-xs text-sky-700 hover:bg-sky-50"
            >
              + 재상속 재산 추가
            </button>
          </div>
        </>
      )}
    </ToneCard>
  );
}
