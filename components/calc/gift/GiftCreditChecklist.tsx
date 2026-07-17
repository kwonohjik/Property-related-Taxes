"use client";

/**
 * GiftCreditChecklist — 증여세 Step4(공제·세액공제) 칩 체크리스트
 *
 * 비과세 Step3(ExemptionChecklist) / 상속세 Step4 패턴과 동일하게,
 * 상단 칩 그리드(2그룹)에서 항목을 선택하면 해당 입력란만 펼쳐진다.
 * Step4의 긴 세로 스크롤을 컴팩트화 (gift-tax-form-shared.tsx Step3에서 분리).
 *
 * 정책:
 *  - useEffect → store 미러링 금지 (mirror-pattern): 펼침은 로컬 useState, active는 derive.
 *  - 값/선택 있는 항목은 항상 active(노출) — 입력값 숨김으로 인한 누락 0 (계획서 C1).
 *  - 신고세액공제(§69 기본 ON)는 칩 밖 ToggleCard 상시 노출 (결정 A — 기본공제 누락 방지).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { GiftSubFormState } from "@/components/calc/gift-tax-form-shared";
import { SimultaneousGiftCard } from "@/components/calc/gift/SimultaneousGiftCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { AppraisalFeeSection } from "@/components/calc/deductions/AppraisalFeeSection";
import { SpecialTreatmentAssetSelector } from "@/components/calc/gift/SpecialTreatmentAssetSelector";
import { resolveValuationMethod } from "@/lib/tax-engine/property-valuation";
import {
  isCreditItemActive,
  visibleCreditItems,
  type GiftCreditKey,
  type GiftCreditGroup,
  type GiftCreditItemMeta,
} from "@/lib/calc/gift-credit-checklist";

// ────────────────────────────────────────────────────
// 칩 스타일 (정적 매핑 — feedback_tailwind_static_tone_mapping)
// ────────────────────────────────────────────────────

type ChipTone = "sky" | "violet";
const GROUP_TONE: Record<GiftCreditGroup, ChipTone> = {
  deduction: "sky",
  credit_special: "violet",
};

const GROUP_HEADER: Record<ChipTone, string> = {
  sky: "text-sky-700 dark:text-sky-300 font-semibold text-caption uppercase tracking-wide",
  violet: "text-violet-700 dark:text-violet-300 font-semibold text-caption uppercase tracking-wide",
};
const CHIP_ON: Record<ChipTone, string> = {
  sky: "border-sky-300 bg-sky-100/80 text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  violet: "border-violet-300 bg-violet-100/80 text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
};
const CHIP_OFF: Record<ChipTone, string> = {
  sky: "border-gray-200 bg-gray-50/80 text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 hover:border-sky-300 hover:bg-sky-50/60",
  violet: "border-gray-200 bg-gray-50/80 text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 hover:border-violet-300 hover:bg-violet-50/60",
};
const CHECK_ON: Record<ChipTone, string> = {
  sky: "border-sky-500 bg-sky-500 text-white",
  violet: "border-violet-500 bg-violet-500 text-white",
};

function CreditChip({
  meta,
  active,
  onToggle,
}: {
  meta: GiftCreditItemMeta;
  active: boolean;
  onToggle: () => void;
}) {
  const tone = GROUP_TONE[meta.group];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `${meta.label} — 클릭하여 접기 (값 보존)` : `${meta.label} — 클릭하여 입력란 열기`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium cursor-pointer transition-colors",
        active ? CHIP_ON[tone] : CHIP_OFF[tone],
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border text-micro font-bold shrink-0",
          active ? CHECK_ON[tone] : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800",
        )}
      >
        {active && "✓"}
      </span>
      <span>{meta.label}</span>
    </button>
  );
}

// ────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────

export function GiftCreditChecklist({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  const [openSet, setOpenSet] = useState<Set<GiftCreditKey>>(new Set());

  const items = visibleCreditItems(form);
  const active = (key: GiftCreditKey) => isCreditItemActive(form, key, openSet);
  const toggle = (key: GiftCreditKey) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const deductionChips = items.filter((i) => i.group === "deduction");
  const creditChips = items.filter((i) => i.group === "credit_special");

  return (
    <div className="space-y-4">
      {/* 칩 패널 (2그룹) */}
      <div className="rounded-lg border border-violet-200/70 bg-violet-50/40 p-3 space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            공제·세액공제 항목 선택
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            해당되는 공제·세액공제 항목을 체크하면 아래에 입력란이 열립니다. (없으면 건너뛰기)
          </p>
        </div>

        {/* 공제 그룹 (sky) */}
        <div className="space-y-1.5">
          <p className={GROUP_HEADER.sky}>
            공제 <span className="font-normal normal-case tracking-normal text-sky-600 dark:text-sky-400">상증법 §53의2·§55</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {deductionChips.map((meta) => (
              <CreditChip key={meta.key} meta={meta} active={active(meta.key)} onToggle={() => toggle(meta.key)} />
            ))}
          </div>
        </div>

        {/* 세액공제·특례·납부 그룹 (violet) */}
        <div className="space-y-1.5 border-t border-violet-100 dark:border-violet-900 pt-2">
          <p className={GROUP_HEADER.violet}>
            세액공제·특례·납부 <span className="font-normal normal-case tracking-normal text-violet-600 dark:text-violet-400">§59·§30의5·6·§70</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {creditChips.map((meta) => (
              <CreditChip key={meta.key} meta={meta} active={active(meta.key)} onToggle={() => toggle(meta.key)} />
            ))}
          </div>
        </div>
      </div>

      {/* 신고세액공제 (§69 기본 ON) — 칩 밖 상시 노출 (결정 A) */}
      <ToggleCard
        tone="violet"
        title="법정신고기한 내 신고 (§69 신고세액공제 3%)"
        description="증여일로부터 3개월 이내 신고 시 산출세액의 3% 공제"
        checked={form.isFiledOnTime}
        onCheckedChange={(v) => set({ isFiledOnTime: v })}
      />

      {/* 증여자 대납(代納) — §36 채무면제이익 gross-up 순환계산 */}
      <ToggleCard
        tone="violet"
        title="증여자가 수증자의 증여세를 대납(代納)합니까? (§36)"
        description="증여자가 수증자 대신 증여세를 납부하면 그 세액 자체도 채무면제이익 증여(§36)로 보아 과세표준에 합산합니다. 수렴할 때까지 반복 계산(gross-up)합니다."
        checked={form.donorPaysGiftTax === true}
        onCheckedChange={(v) => set({ donorPaysGiftTax: v, donorHasJointLiability: false })}
      >
        {/* 연대납세의무 — ON 시 재차증여 아님 → gross-up 미적용 */}
        <ToggleCard
          tone="amber"
          title="증여자가 해당 증여의 연대납세의무자(§4의2⑥)이었습니까?"
          description="증여자가 이미 해당 증여세의 연대납세의무자인 경우, 대납은 새로운 채무면제이익 증여로 보지 않아 gross-up이 적용되지 않습니다."
          checked={form.donorHasJointLiability === true}
          onCheckedChange={(v) => set({ donorHasJointLiability: v })}
        />
        {form.donorHasJointLiability === true && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            연대납세의무자가 납부한 세액은 채무면제이익에 해당하지 않아 gross-up 계산이 생략됩니다 (§4의2⑥).
          </div>
        )}

        {/* 수증자 본인 납부액 — 연대의무 OFF + 대납 ON 일 때만 노출 */}
        {form.donorHasJointLiability !== true && (
          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              수증자 본인 납부액 (§36)
            </p>
            <p className="text-xs text-violet-600 dark:text-violet-400">
              수증자가 직접 납부하는 증여세액을 입력하세요. 증여자는 총세액에서 이 금액을 차감한
              나머지(부족분)만 대납합니다. 미입력 또는 0원 시 증여자가 전액 대납합니다.
            </p>
            <FieldCard
              label="수증자 본인 납부액"
              hint="수증자가 직접 납부하는 증여세 금액(원). 0원 = 증여자 전액 대납(기존 동작)."
            >
              <CurrencyInput
                label="수증자 본인 납부액"
                hideLabel
                value={form.doneePaidGiftTax ?? ""}
                onChange={(v) => set({ doneePaidGiftTax: v })}
                hideUnit
              />
            </FieldCard>
          </div>
        )}
      </ToggleCard>

      {/* ── 활성 항목 입력 블록 ── */}

      {/* 혼인·출산 공제 (직계존속만 칩 노출) */}
      {active("marriageBirth") && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-sky-700 dark:text-sky-300">
            혼인·출산 공제 (§53의2, 최대 1억원)
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            직계존속으로부터 증여 시 적용. 혼인신고일 전후 2년 이내 / 자녀 출생일로부터 2년 이내 증여분. 합산 1억 한도.
          </p>
          <CurrencyInput
            label="혼인공제"
            value={form.marriageExemption}
            onChange={(v) => set({ marriageExemption: v })}
          />
          <CurrencyInput
            label="출산공제"
            value={form.birthExemption}
            onChange={(v) => set({ birthExemption: v })}
          />
          <CurrencyInput
            label="이미 공제받은 혼인·출산 공제액 (§53의2③)"
            value={form.priorUsedMarriageBirthDeduction}
            onChange={(v) => set({ priorUsedMarriageBirthDeduction: v })}
          />
        </div>
      )}

      {/* 10년 내 기사용 공제 */}
      {active("priorUsed") && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
          <CurrencyInput
            label="10년 내 기사용 증여재산공제 합계"
            value={form.priorUsedDeduction}
            onChange={(v) => set({ priorUsedDeduction: v })}
            hint="합산 신고 대상이 아닌 동일 그룹에서 10년내 이미 공제 받은 금액"
          />
        </div>
      )}

      {/* 동시증여 — 완전 입력 방식 (D-6: 간이 폐기, 세액 전체 계산) */}
      <ToggleCard
        tone="sky"
        title="같은 날 다른 분으로부터도 받으셨나요? (동시증여 — 세액 전체 계산)"
        description="각 증여 건의 산출세액을 전부 계산하고 수증자 총 납부세액 합계를 확인합니다. 공제 한도는 §46①2호에 따라 과세가액 비율로 자동 안분됩니다."
        checked={form.simultaneousGiftForms !== undefined}
        onCheckedChange={(v) => set({ simultaneousGiftForms: v ? [] : undefined })}
      >
        <div className="space-y-4">
          {/* 안내 카드 — 건 없을 때 */}
          {(form.simultaneousGiftForms ?? []).length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              1단계(증여자 관계)부터 입력하세요. 아래 버튼을 눌러 추가 건을 입력합니다.
              부·모 등 동일인(상증법 §47② 동일 그룹)의 증여는 현재 신고 증여재산에 합산하세요.
            </div>
          )}

          {/* 추가 건 카드 반복 */}
          {(form.simultaneousGiftForms ?? []).map((sub, i) => (
            <SimultaneousGiftCard
              key={i}
              index={i}
              sub={sub as GiftSubFormState}
              mainDonor={form.donor}
              onChange={(partial) => {
                const next = [...(form.simultaneousGiftForms ?? [])];
                next[i] = { ...next[i], ...partial } as GiftSubFormState;
                set({ simultaneousGiftForms: next });
              }}
              onDelete={() => {
                set({
                  simultaneousGiftForms: (form.simultaneousGiftForms ?? []).filter(
                    (_, j) => j !== i,
                  ),
                });
              }}
            />
          ))}

          {/* 추가 버튼 */}
          <button
            type="button"
            onClick={() => {
              // 건0의 giftDate를 동시증여 추가 건 초기값으로 주입 (Zod YYYY-MM-DD 검증 통과)
              const newSub: GiftSubFormState = { ...INITIAL_FORM, giftDate: form.giftDate };
              set({
                simultaneousGiftForms: [
                  ...(form.simultaneousGiftForms ?? []),
                  newSub,
                ],
              });
            }}
            className="rounded-md border border-sky-300 bg-sky-100/60 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            + 동시증여 추가
          </button>
        </div>
      </ToggleCard>

      {/* 감정평가수수료 공제 */}
      {active("appraisalFee") && (
        <AppraisalFeeSection
          taxType="gift"
          value={form}
          onChange={set}
          hasAppraisalAsset={[...form.giftItems, ...form.stockItems].some(
            (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
          )}
        />
      )}

      {/* 외국납부세액 (§59) */}
      {active("foreignTax") && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-3">
          <CurrencyInput
            label="외국납부세액 (§59)"
            value={form.foreignTaxPaid}
            onChange={(v) => set({ foreignTaxPaid: v })}
            hint="해외 소재 증여재산에 대해 납부한 외국 세액"
          />
          {parseAmount(form.foreignTaxPaid) > 0 && (
            <CurrencyInput
              label="국외 증여재산 과세표준"
              value={form.foreignGiftTaxBase}
              onChange={(v) => set({ foreignGiftTaxBase: v })}
              hint="§21① 점유비 한도 = 산출세액 × (국외 증여재산 과세표준 ÷ 전체 과세표준)"
            />
          )}
        </div>
      )}

      {/* 조특법 과세특례 (§30의5·6) + 종속 입력 */}
      {active("specialTreatment") && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-emerald-700 dark:text-emerald-300">
              조특법 과세특례 (창업·가업)
            </label>
            <RadioCardGroup<"none" | "startup" | "family_business">
              name="giftSpecialTreatment"
              tone="emerald"
              value={form.specialTreatment === "" ? "none" : form.specialTreatment}
              onChange={(v) => {
                const val = v === "none" ? "" : v;
                // 특례 타입이 바뀔 때 모든 자산의 isSpecialTreatmentAsset을 초기화
                const resetGiftItems = val !== ""
                  ? form.giftItems.map((it) => ({ ...it, isSpecialTreatmentAsset: false as boolean | undefined }))
                  : form.giftItems.map((it) => ({ ...it, isSpecialTreatmentAsset: undefined as boolean | undefined }));
                const resetStockItems = val !== ""
                  ? form.stockItems.map((it) => ({ ...it, isSpecialTreatmentAsset: false as boolean | undefined }))
                  : form.stockItems.map((it) => ({ ...it, isSpecialTreatmentAsset: undefined as boolean | undefined }));
                set({
                  specialTreatment: val,
                  giftItems: resetGiftItems,
                  stockItems: resetStockItems,
                  ...(val !== "startup" ? { startupInvestmentCompleted: false, startupNewHiresAtLeast10: false } : {}),
                  ...(val !== "family_business" ? { familyBusinessYears: "" } : {}),
                });
              }}
              options={[
                { value: "none", label: "해당 없음" },
                { value: "startup", label: "창업자금 증여세 과세특례 (§30의5)" },
                { value: "family_business", label: "가업승계 증여세 과세특례 (§30의6)" },
              ]}
            />
          </div>

          {/* 특례 귀속 자산 선택 — 자산 1개:자동귀속, N개:멀티선택 */}
          {form.specialTreatment !== "" && (
            <SpecialTreatmentAssetSelector
              specialTreatment={form.specialTreatment as "startup" | "family_business"}
              allItems={[...form.giftItems, ...form.stockItems]}
              onItemChange={(index, isSpecial) => {
                const giftLen = form.giftItems.length;
                if (index < giftLen) {
                  const updated = form.giftItems.map((it, i) =>
                    i === index ? { ...it, isSpecialTreatmentAsset: isSpecial } : it,
                  );
                  set({ giftItems: updated });
                } else {
                  const stockIdx = index - giftLen;
                  const updated = form.stockItems.map((it, i) =>
                    i === stockIdx ? { ...it, isSpecialTreatmentAsset: isSpecial } : it,
                  );
                  set({ stockItems: updated });
                }
              }}
            />
          )}

          {/* 창업자금 투자 완료 (§30의5④) — startup 선택 시 */}
          {form.specialTreatment === "startup" && (
            <ToggleCard
              tone="emerald"
              title="창업자금 투자 완료 (§30의5④)"
              description="증여일로부터 2년 이내 창업법인 설립 및 투자 완료 여부. 미완료 시 과세특례 미적용."
              checked={form.startupInvestmentCompleted}
              onCheckedChange={(v) => set({ startupInvestmentCompleted: v })}
            />
          )}

          {/* 10명 이상 신규 고용 (§30의5①) — startup 선택 시 */}
          {form.specialTreatment === "startup" && (
            <ToggleCard
              tone="emerald"
              title="창업을 통하여 10명 이상 신규 고용 (§30의5①)"
              description="창업자금 증여세 과세특례 적용 한도: 10명 이상 신규 고용 시 100억원, 그 외 50억원 (조특법 §30의5①)."
              checked={form.startupNewHiresAtLeast10}
              onCheckedChange={(v) => set({ startupNewHiresAtLeast10: v })}
            />
          )}

          {/* 가업 영위기간 (§30의6①) — family_business 선택 시 */}
          {form.specialTreatment === "family_business" && (
            <FieldCard
              label="부모 가업 영위기간 (§30의6①)"
              hint="부모가 계속하여 경영한 기간(년). 과세가액 한도: 10년 이상 300억 / 20년 이상 400억 / 30년 이상 600억. 비워두면 10년(300억 한도)으로 계산하며, 10년 미만 입력 시 특례 미적용(일반 증여세)으로 계산합니다."
            >
              <DecimalInput
                value={form.familyBusinessYears}
                onChange={(v) => set({ familyBusinessYears: v })}
                placeholder="영위 기간 입력"
                unit="년"
              />
            </FieldCard>
          )}
        </div>
      )}

      {/* 분납 신청 (§70②) */}
      {active("splitPayment") && (
        <ToggleCard
          tone="sky"
          title="분납 신청 (상증법 §70②)"
          description="결정세액 1천만원 초과 시 신고기한 경과 후 2개월 이내 분할납부. 1천만~2천만은 1천만 초과분, 2천만 초과는 50% 이하를 분납할 수 있습니다."
          checked={form.splitPaymentEnabled}
          onCheckedChange={(v) => set({ splitPaymentEnabled: v })}
        >
          <div className="space-y-3 pt-1">
            <FieldCard
              label="분납 희망액"
              hint="§70② 한도(2천만 이하→1천만 초과분 / 2천만 초과→50%) 이내에서 입력하세요. 비워두면 결과 화면에서 최대 분납액으로 안내합니다."
            >
              <CurrencyInput
                label="분납 희망액"
                hideLabel
                value={form.splitPaymentAmount}
                onChange={(v) => set({ splitPaymentAmount: v })}
              />
            </FieldCard>
          </div>
        </ToggleCard>
      )}
    </div>
  );
}
