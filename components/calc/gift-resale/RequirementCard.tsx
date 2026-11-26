"use client";

/**
 * ① 요건 카드 — 관계 · 증여 등기접수일 · 양도일 · 부담부증여 · 증여자 사망 · 실질 귀속
 *
 * 계획서 §5.3 ①. 실질 귀속에는 «모름»이 없다(Q-3) — 미선택은 ⑧이 막는다.
 * 배우자·직계존비속 · 부담부증여 · 증여자 사망은 고르면 판정 대상에서 빠진다(결과 카드가 사유를 적는다).
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { GiftResaleRelation } from "@/lib/tax-engine/gift-resale-101-2";
import { GIFT_RESALE_ARTICLES, GIFT_RESALE_RELATED_DESCRIPTION } from "@/lib/calc/gift-resale-101-2-labels";
import { issueOf, type GiftResaleCardProps } from "./shared";

function FieldError({ message, field }: { message?: string; field: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive" data-field={field}>
      {message}
    </p>
  );
}

export function RequirementCard({ form, onPatch, issues }: GiftResaleCardProps) {
  return (
    <ToneCard tone="violet" sectionNum={1} title="요건" bodyClassName="space-y-3">
      <p className="text-xs" data-testid="gr-scope-notice">
        증여자는 거주자, 수증자는 개인인 경우만 판정합니다.
      </p>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">증여자와 수증자의 관계</p>
        <RadioCardGroup<GiftResaleRelation>
          name="gift-resale-relation"
          data-field="relation"
          data-testid="gr-relation"
          tone="violet"
          aria-label="증여자와 수증자의 관계"
          value={form.relation}
          onChange={(v) => onPatch({ relation: v })}
          options={[
            {
              value: "related",
              label: "특수관계인(배우자·직계존비속 외)",
              description: GIFT_RESALE_RELATED_DESCRIPTION,
              testId: "gr-relation-related",
            },
            { value: "spouse_lineal", label: "배우자·직계존비속", testId: "gr-relation-spouse-lineal" },
            { value: "none", label: "특수관계 없음", testId: "gr-relation-none" },
          ]}
        />
        <FieldError field="relation" message={issueOf(issues, "relation")} />
      </div>

      <FieldCard
        label="증여 등기접수일"
        required
        field="giftRegistryDate"
        hint={`증여받은 자산의 등기부에 기재된 접수일입니다(${GIFT_RESALE_ARTICLES.sec101_4}).`}
        warning={issueOf(issues, "giftRegistryDate")}
      >
        <DateInput
          value={form.giftRegistryDate}
          onChange={(v) => onPatch({ giftRegistryDate: v })}
          data-testid="gr-gift-date"
        />
      </FieldCard>

      <FieldCard
        label="양도일"
        required
        field="transferDate"
        hint="수증자가 그 자산을 양도한 날입니다."
        warning={issueOf(issues, "transferDate")}
      >
        <DateInput
          value={form.transferDate}
          onChange={(v) => onPatch({ transferDate: v })}
          data-testid="gr-transfer-date"
        />
      </FieldCard>

      <ToggleCard
        tone="violet"
        title="부담부증여입니다"
        description="증여받으면서 채무를 함께 넘겨받은 경우"
        checked={form.isBurdenedGift}
        onCheckedChange={(v) => onPatch({ isBurdenedGift: v })}
        data-testid="gr-burdened"
      />

      <ToggleCard
        tone="violet"
        title="양도일 현재 증여자가 사망했습니다"
        checked={form.donorDeceasedAtTransfer}
        onCheckedChange={(v) => onPatch({ donorDeceasedAtTransfer: v })}
        data-testid="gr-donor-deceased"
      />

      <div className="space-y-1.5">
        <p className="text-sm font-medium">양도소득이 수증자에게 실질적으로 귀속됐습니까?</p>
        <RadioCardGroup<"yes" | "no">
          name="gift-resale-attribution"
          data-field="substantiveAttribution"
          data-testid="gr-attribution"
          tone="violet"
          layout="inline"
          aria-label="양도소득의 수증자 실질 귀속 여부"
          value={form.substantiveAttribution}
          onChange={(v) => onPatch({ substantiveAttribution: v })}
          options={[
            { value: "yes", label: "예 — 수증자에게 귀속", testId: "gr-attribution-yes" },
            { value: "no", label: "아니오", testId: "gr-attribution-no" },
          ]}
        />
        <FieldError field="substantiveAttribution" message={issueOf(issues, "substantiveAttribution")} />
      </div>
    </ToneCard>
  );
}
