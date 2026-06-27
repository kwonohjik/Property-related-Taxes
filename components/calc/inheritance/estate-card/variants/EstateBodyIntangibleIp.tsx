"use client";

/**
 * EstateBodyIntangibleIp — 무체재산권 본체 입력 (상증법 §64·상증령 §59⑤·상증규 §19②③④)
 *
 * 평가: 각 연도 수입금액 → 잔존연수 10% 현가환산 합계(BigInt Σfloor) · §64 1호 취득가액과 MAX.
 * 잔존연수: 자동 산정(resolveIntangibleRemainingYears) useMemo derive + 사용자 override.
 *   3중 패턴(mirror-pattern): 표시=useMemo derive, store엔 override만, 엔진 전달=lib/calc 합성.
 */

import { useMemo } from "react";
import { parseISO } from "date-fns";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { resolveIntangibleRemainingYears } from "@/lib/tax-engine/property-valuation";
import type {
  IntangibleIpType,
  IntangibleIncomeMode,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const IP_TYPE_OPTIONS: { value: IntangibleIpType; label: string; description: string }[] = [
  { value: "patent", label: "특허권", description: "출원일 + 20년 (특허법 §88①)" },
  { value: "utility_model", label: "실용신안권", description: "출원일 + 10년 (실용신안법 §22①)" },
  { value: "trademark", label: "상표권", description: "설정등록일 + 10년 (상표법 §42①)" },
  { value: "design", label: "디자인권", description: "출원일 + 20년 (디자인보호법 §91①)" },
  { value: "copyright", label: "저작권", description: "저작자 사망일 + 70년 (저작권법 §39①)" },
];

const INCOME_MODE_OPTIONS: { value: IntangibleIncomeMode; label: string; description: string }[] = [
  { value: "fixed", label: "미래 확정수입", description: "미래 각 연도 수입금액 확정 (§59⑤ 전단)" },
  { value: "avg3y", label: "직전 3년 평균", description: "미확정 → 직전 3년 수입 평균 (§59⑤ 후단)" },
  { value: "appraisal", label: "감정가액", description: "수입 없음/저작권 하락 명백 (규 §19④ 후단)" },
];

export function EstateBodyIntangibleIp({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const type = item.intangibleIpType;
  const mode = item.intangibleIncomeMode;
  const isCopyright = type === "copyright";
  const baseDate = isCopyright ? item.intangibleAuthorDeathDate : item.intangibleOriginDate;

  // 자동 잔존연수 — 엔진 단일진실 헬퍼 derive (dual-truth 금지)
  const autoYears = useMemo(() => {
    if (mode === "appraisal") return undefined;
    if (!type || !baseDate || !valuationDate) return undefined;
    const d = typeof baseDate === "string" ? parseISO(baseDate) : baseDate;
    return resolveIntangibleRemainingYears({
      type,
      originDate: isCopyright ? undefined : d,
      authorDeathDate: isCopyright ? d : undefined,
      valuationDate: parseISO(valuationDate),
    });
  }, [type, baseDate, isCopyright, mode, valuationDate]);

  const override = item.intangibleRemainingYearsOverride;
  const displayYears = override ?? autoYears;
  const isAuto = override == null;
  const baseDateStr = typeof baseDate === "string" ? baseDate : "";

  return (
    <div data-testid={`estate-body-variant-intangible-ip-${item.id}`} className="space-y-3">
      <EstateBodySection
        title="무체재산권 평가"
        subtitle="상증법 §64·상증령 §59⑤·상증규 §19 — 각 연도 수입금액 10% 현가환산(20년 한도)"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○특허권)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* ① 권리 종류 */}
        <FieldCard label="권리 종류" hint="존속기간·기산점 결정 (현행법)">
          <RadioCardGroup
            name={`intangible-ip-type-${item.id}`}
            options={IP_TYPE_OPTIONS.map((o) => ({ ...o, testId: `intangible-ip-type-${o.value}-${item.id}` }))}
            value={type ?? ""}
            onChange={(v) => set({ intangibleIpType: v })}
            tone="emerald"
          />
        </FieldCard>

        {/* ② 수입금액 산정 방식 */}
        <FieldCard label="수입금액 산정 방식">
          <RadioCardGroup
            name={`intangible-ip-income-mode-${item.id}`}
            options={INCOME_MODE_OPTIONS.map((o) => ({ ...o, testId: `intangible-ip-income-mode-${o.value}-${item.id}` }))}
            value={mode ?? ""}
            onChange={(v) => set({ intangibleIncomeMode: v })}
            tone="sky"
          />
        </FieldCard>

        {/* ③ fixed: 연수입 */}
        {mode === "fixed" && (
          <FieldCard label="미래 각 연도 수입금액" unit="원" hint="매년 동일 수입 가정 (§59⑤ 전단)">
            <CurrencyInput
              label="미래 각 연도 수입금액"
              hideLabel
              value={item.intangibleAnnualIncome != null ? String(item.intangibleAnnualIncome) : ""}
              onChange={(v) => set({ intangibleAnnualIncome: parseAmount(v) || undefined })}
              data-testid={`intangible-ip-annual-income-${item.id}`}
              hideUnit
            />
          </FieldCard>
        )}

        {/* ④⑤ avg3y: 합계 + 연수 */}
        {mode === "avg3y" && (
          <>
            <FieldCard label="직전 3년 수입금액 합계" unit="원" hint="평가기준일 전 3년 각 연도 수입 합계">
              <CurrencyInput
                label="직전 3년 수입금액 합계"
                hideLabel
                value={item.intangiblePrior3yIncomeTotal != null ? String(item.intangiblePrior3yIncomeTotal) : ""}
                onChange={(v) => set({ intangiblePrior3yIncomeTotal: parseAmount(v) || undefined })}
                data-testid={`intangible-ip-prior3y-total-${item.id}`}
                hideUnit
              />
            </FieldCard>
            <FieldCard label="실제 연수" unit="년" hint="1~3 (3년 미달 시 미달 연수)">
              <DecimalInput
                value={item.intangiblePrior3yYears != null ? String(item.intangiblePrior3yYears) : ""}
                onChange={(v) => set({ intangiblePrior3yYears: parseDecimal(v) || undefined })}
                data-testid={`intangible-ip-prior3y-years-${item.id}`}
              />
            </FieldCard>
          </>
        )}

        {/* ⑥ appraisal: 감정가액 */}
        {mode === "appraisal" && (
          <FieldCard label="감정가액" unit="원" hint="2 이상 공신력 감정기관·전문가 감정 (규 §19④ 후단)">
            <CurrencyInput
              label="감정가액"
              hideLabel
              value={item.intangibleAppraisedValue != null ? String(item.intangibleAppraisedValue) : ""}
              onChange={(v) => set({ intangibleAppraisedValue: parseAmount(v) || undefined })}
              data-testid={`intangible-ip-appraised-${item.id}`}
              hideUnit
            />
          </FieldCard>
        )}

        {/* 존속기간 기산일 + 잔존연수 (appraisal 모드는 존속기간 무관 → 숨김) */}
        {mode !== "appraisal" && (
          <>
            <FieldCard
              label={isCopyright ? "저작자 사망일" : "출원일 / 설정등록일"}
              hint={isCopyright ? "저작권법 §39① — 사망 + 70년" : "특허·실용·디자인=출원일, 상표=설정등록일"}
            >
              <div
                data-testid={
                  isCopyright
                    ? `intangible-ip-author-death-date-${item.id}`
                    : `intangible-ip-origin-date-${item.id}`
                }
              >
                <DateInput
                  value={baseDateStr}
                  onChange={(v) =>
                    set(
                      isCopyright
                        ? { intangibleAuthorDeathDate: v || undefined }
                        : { intangibleOriginDate: v || undefined },
                    )
                  }
                />
              </div>
            </FieldCard>

            {/* 잔존연수 — 자동 derive + override */}
            <FieldCard
              label="잔존연수"
              unit="년"
              hint={isAuto ? "존속기간·기산일 기준 자동 산정 (20년 한도, 수정 가능)" : "직접 입력값 적용 중 (비우면 자동 복귀)"}
            >
              <DecimalInput
                value={displayYears != null ? String(displayYears) : ""}
                onChange={(v) => {
                  const n = parseDecimal(v);
                  // 표시·store·엔진 3중 일치 — 20년 한도 clamp (§19③, silent drift 차단)
                  set({ intangibleRemainingYearsOverride: n > 0 ? Math.min(20, Math.trunc(n)) : undefined });
                }}
                data-testid={`intangible-ip-remaining-years-${item.id}`}
              />
            </FieldCard>
            {isAuto && autoYears != null && (
              <p className="text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 rounded px-3 py-2">
                🟢 자동 산정 {autoYears}년 (존속만료일 − 평가기준일, 20년 한도 §19③)
              </p>
            )}
          </>
        )}

        {/* §64 1호 취득가액 (선택 — 매입 무체재산권 MAX 비교) */}
        <FieldCard label="취득가액 − 감가상각비 (선택)" unit="원" hint="매입 무체재산권 — §64 1호, 환산액과 큰 금액 적용">
          <CurrencyInput
            label="취득가액 − 감가상각비"
            hideLabel
            value={item.intangibleAcquisitionCost != null ? String(item.intangibleAcquisitionCost) : ""}
            onChange={(v) => set({ intangibleAcquisitionCost: parseAmount(v) || undefined })}
            data-testid={`intangible-ip-acquisition-cost-${item.id}`}
            hideUnit
          />
        </FieldCard>
      </EstateBodySection>
    </div>
  );
}
