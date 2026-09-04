"use client";

/**
 * EstateBodyReceivable — 채권(대여금·외상매출금·받을어음 등) 본체 입력
 *
 * 상증령 §58②·상증칙 §18의2②·§18의3.
 *   simple    : 회수기간 5년 이내 — 원본 + 평가기준일까지 미수이자상당액 (회수불가능 차감)
 *   discounted: 5년 초과·회사정리 등 변경 — 연도별 회수금액(원본+이자) 현가할인 합계
 * 평가기준일은 lib/calc가 receivableValuationDate로 주입(엔진 n·할인율 lookup). UI는 입력만.
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { resolveReceivableDiscountRate } from "@/lib/tax-engine/data/gift-deemed-rates";
import type {
  ReceivableKind,
  ReceivableInstallment,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const KIND_OPTIONS: { value: ReceivableKind; label: string; description: string }[] = [
  { value: "loan", label: "대여금·대부금", description: "금전 대여 채권" },
  { value: "trade", label: "외상매출금", description: "상거래 매출채권" },
  { value: "note", label: "받을어음", description: "어음 채권" },
  { value: "reorg", label: "정리채권", description: "회사정리·화의 등으로 내용 변경된 채권" },
  { value: "other", label: "기타", description: "기타 금전채권" },
];

export function EstateBodyReceivable({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const mode = item.receivableMode ?? "simple";
  const schedule = item.receivableSchedule ?? [];

  // 평가기준일 기준 자동 적정할인율 (표시용 — 엔진이 동일 헬퍼로 단일 산정, dual-truth 금지)
  const autoRate = valuationDate ? resolveReceivableDiscountRate(valuationDate) : undefined;
  const autoRatePct = autoRate ? (autoRate.numer * 100) / autoRate.denom : undefined;
  const overridePct = item.receivableDiscountRateOverride
    ? (item.receivableDiscountRateOverride.numer * 100) / item.receivableDiscountRateOverride.denom
    : undefined;

  const updateRow = (idx: number, patch: Partial<ReceivableInstallment>) => {
    const next = schedule.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    set({ receivableSchedule: next });
  };
  const addRow = () =>
    set({ receivableSchedule: [...schedule, { recoverDate: "", amount: 0 }] });
  const removeRow = (idx: number) =>
    set({ receivableSchedule: schedule.filter((_, i) => i !== idx) });

  return (
    <div data-testid={`estate-body-variant-receivable-${item.id}`} className="space-y-3">
      <EstateBodySection
        title="채권 평가"
        subtitle="상증령 §58②·상증칙 §18의2② — 대부금·외상매출금·받을어음 등"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○에 대한 대여금)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* 채권 종류 */}
        <FieldCard label="채권 종류">
          <RadioCardGroup
            name={`receivable-kind-${item.id}`}
            options={KIND_OPTIONS}
            value={item.receivableKind ?? ""}
            onChange={(v) => set({ receivableKind: v as ReceivableKind })}
            tone="sky"
          />
        </FieldCard>

        {/* 평가방식 토글 — OFF: 5년 이내(simple) / ON: 5년 초과·회사정리(discounted) */}
        <ToggleCard
          checked={mode === "discounted"}
          onCheckedChange={(v) => set({ receivableMode: v ? "discounted" : "simple" })}
          title="장기·변경 채권 현가할인"
          description="OFF: 회수기간 5년 이내(원본+미수이자) / ON: 5년 초과·회사정리 등 변경(현가할인)"
          tone="amber"
        >
          {/* discounted 전용 입력 */}
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300">
              적정할인율: 평가기준일 기준 자동 {autoRatePct != null ? `${autoRatePct}%` : "—"}
              {" "}(상증칙 §18의2②1가·§18의3). 직접 입력 시 자동값 대체.
            </div>
            <FieldCard label="적정할인율 직접입력" unit="%" hint="비우면 평가기준일 기준 자동 적용">
              <DecimalInput
                value={overridePct != null ? String(overridePct) : ""}
                onChange={(v) => {
                  const pct = parseDecimal(v);
                  set({
                    receivableDiscountRateOverride:
                      pct > 0 ? { numer: Math.round(pct * 10), denom: 1000 } : undefined,
                  });
                }}
                data-testid={`receivable-rate-${item.id}`}
              />
            </FieldCard>

            {/* 연도별 회수 스케줄 */}
            <p className="text-xs font-semibold text-amber-700">연도별 회수 스케줄 (원본 + 이자상당액)</p>
            {schedule.map((row, idx) => (
              <div
                key={idx}
                data-testid={`receivable-row-${idx}`}
                className="flex items-end gap-2 rounded-md border border-amber-200/70 bg-amber-50/30 dark:bg-amber-900/10 p-2"
              >
                <div className="flex-1">
                  <DateInput
                    value={typeof row.recoverDate === "string" ? row.recoverDate : ""}
                    onChange={(v) => updateRow(idx, { recoverDate: v || "" })}
                    data-testid={`receivable-row-${idx}-date`}
                  />
                </div>
                <div className="flex-1">
                  <CurrencyInput
                    label="회수금액"
                    value={row.amount ? String(row.amount) : ""}
                    onChange={(v) => updateRow(idx, { amount: parseAmount(v) || 0 })}
                    hideLabel
                    data-testid={`receivable-row-${idx}-amount`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  data-testid={`receivable-row-${idx}-remove`}
                  className="mb-1 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              data-testid="receivable-row-add"
              className="rounded-md border border-amber-300 bg-amber-100/60 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              + 회수 연도 추가
            </button>
            <p className="rounded-md border border-rose-200 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              회수불가능분(§58② 단서)은 각 회수금액에서 미리 차감해 입력하세요.
            </p>
          </div>
        </ToggleCard>

        {/* simple 전용 입력 */}
        {mode === "simple" && (
          <>
            <FieldCard label="원본(원금) 가액" unit="원">
              <CurrencyInput
                label="원본 가액"
                value={item.receivablePrincipal != null ? String(item.receivablePrincipal) : ""}
                onChange={(v) => set({ receivablePrincipal: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`receivable-principal-${item.id}`}
              />
            </FieldCard>
            <FieldCard
              label="미수이자상당액"
              unit="원"
              hint="평가기준일까지 발생한 미수령 이자 (없으면 비워두세요)"
            >
              <CurrencyInput
                label="미수이자상당액"
                value={item.receivableAccruedInterest != null ? String(item.receivableAccruedInterest) : ""}
                onChange={(v) => set({ receivableAccruedInterest: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`receivable-accrued-${item.id}`}
              />
            </FieldCard>
            <FieldCard
              label="회수불가능 차감액"
              unit="원"
              hint="평가기준일 현재 회수불가능 인정분 (§58② 단서, 원본 한도). 없으면 비워두세요"
            >
              <CurrencyInput
                label="회수불가능 차감액"
                value={item.receivableUncollectible != null ? String(item.receivableUncollectible) : ""}
                onChange={(v) => set({ receivableUncollectible: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`receivable-uncollectible-${item.id}`}
              />
            </FieldCard>
            {(item.receivableUncollectible ?? 0) > 0 && (
              <FieldCard label="회수불가능 사유" hint="채무자 파산·부도 등 근거 (별지 표기)">
                <input
                  type="text"
                  value={item.receivableUncollectibleReason ?? ""}
                  onChange={(e) => set({ receivableUncollectibleReason: e.target.value || undefined })}
                  placeholder="회수불가능 사유"
                  className={TEXT_INPUT_CLASS}
                />
              </FieldCard>
            )}
          </>
        )}

        <p className="text-xs text-sky-600 dark:text-sky-400">
          기타채권(5년 이내) = 원본 + 미수이자상당액 / 장기·변경채권(5년 초과·회사정리) = 연도별 회수금액 현가할인 합계
        </p>
      </EstateBodySection>
    </div>
  );
}
