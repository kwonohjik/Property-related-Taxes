"use client";

/**
 * CarryoverGateFields — §97의2① 이월과세 **게이트 입력 3종**(증여자 취득일 · 관계 · 사망) 공용 leaf
 *
 * `AcquisitionInfoBlock`(국내 주식 `carryover_gift` 카드)에서 **그대로 이동**했다 — 동작·라벨·`name`
 * 불변. 국외주식(§94①3호다목) 이월과세 위젯(`ForeignCarryoverBlocks`)이 같은 leaf를 쓴다.
 *
 * 국내·국외가 갈리는 것은 두 가지뿐이라 props로만 받는다:
 *  - 증여자 취득일 칸의 라벨·hint (국내=§104②2호 세율 기산 / 국외=환율 기준일)
 *  - 날짜 아래 안내 slot (국내=의제취득일 안내 `DeemedDateNotice`, 국외=없음)
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §3.1
 * 가드: __tests__/components/calc/stock-transfer/donor-relation-radio-inline.anchor.test.tsx (DR-1~3)
 */

import type { ReactNode } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export type CarryoverGateForm = Pick<
  StockTransferFormData,
  "donorAcquisitionDate" | "donorRelation" | "donorDeceased"
>;

interface CarryoverGateFieldsProps {
  form: CarryoverGateForm;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /** 증여자 취득일 FieldCard 라벨 */
  dateLabel: string;
  /** 증여자 취득일 FieldCard hint */
  dateHint: string;
  /** 증여자 취득일 입력 바로 아래(같은 FieldCard 안) — 국내=의제취득일 안내 */
  dateNotice?: ReactNode;
}

export function CarryoverGateFields({
  form,
  onChange,
  dateLabel,
  dateHint,
  dateNotice,
}: CarryoverGateFieldsProps) {
  return (
    <>
      <FieldCard label={dateLabel} required hint={dateHint}>
        <DateInput
          value={form.donorAcquisitionDate ?? ""}
          onChange={(v) => onChange({ donorAcquisitionDate: v })}
        />
        {dateNotice}
      </FieldCard>
      <p className="text-xs text-amber-800 dark:text-amber-200">
        ⓘ 주식은 <strong>2024.12.31. 개정(법률 제20615호)</strong>으로 2025.1.1.부터
        이월과세 대상이 되었습니다. <strong>증여일 기준</strong>이므로 2024.12.31. 이전에
        증여받았다면 이 항목을 골라도 수증일 기산이 유지됩니다.
        기간 요건은 부동산 10년이 아니라 <strong>1년</strong>입니다
        (<LawArticleModal legalBasis="소득세법 §97의2" label="§97의2①" />).
      </p>

      {/* ── §97의2① 본문 괄호 — 관계 요건 ── */}
      <FieldCard
        label="증여자와의 관계 (§97의2① 본문)"
        required
        hint="배우자·직계존비속이 아니면 이월과세 대상이 아닙니다"
      >
        {/* 선택지가 3~7자이고 description이 없다 — 세로로 쌓을 이유가 없다.
            anchor: donor-relation-radio-inline.anchor.test.tsx DR-1 */}
        <RadioCardGroup
          name="donorRelation"
          value={form.donorRelation || ""}
          onChange={(v) =>
            onChange({ donorRelation: v as StockTransferFormData["donorRelation"] })
          }
          layout="inline"
          options={[
            { value: "spouse", label: "배우자" },
            { value: "lineal", label: "직계존비속" },
            { value: "other", label: "그 밖의 관계" },
          ]}
        />
      </FieldCard>

      <ToggleCard
        title={
          form.donorRelation === "lineal"
            ? "증여자가 양도 당시 사망"
            : "사망으로 혼인관계가 소멸"
        }
        checked={form.donorDeceased}
        onCheckedChange={(v: boolean) => onChange({ donorDeceased: v })}
        tone="amber"
        description={
          form.donorRelation === "lineal"
            ? "직계존비속이 양도 당시 사망했다면 §97의2①이 적용되지 않습니다 (2026.1.1. 이후 양도분)"
            : "사별이면 §97의2① 미적용입니다. 이혼으로 혼인관계가 소멸한 경우는 그대로 적용됩니다"
        }
      />
    </>
  );
}
