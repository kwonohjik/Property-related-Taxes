"use client";

/**
 * 이월과세 관계요건(§97조의2 ①) + 적용배제 선언 (§97조의2 ② 각호, ④항)
 * CarryoverGiftBlock에서 분리 — 800줄 정책 준수.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/** 직계존비속 「양도 당시 사망」 제외 신설 — 2025.1.1. 이후 증여받는 자산부터. */
const LINEAL_DEATH_CUTOFF = "2025-01-01";

interface Props {
  exclusionDeclared: CarryoverTaxationForm["exclusionDeclared"];
  onChange: (patch: Partial<CarryoverTaxationForm["exclusionDeclared"]>) => void;
  /** §97조의2 ① 관계요건 */
  donorRelation: CarryoverTaxationForm["donorRelation"];
  donorDeceased: boolean;
  /** 증여 등기접수일 — 직계존비속 게이트 안내용 (YYYY-MM-DD) */
  giftRegistryDate: string;
  /** 자산 id — 라디오 name 고유화(자산이 여럿이면 name이 겹쳐 하나만 선택된다) */
  assetId: string;
  onRelationChange: (patch: Partial<CarryoverTaxationForm>) => void;
}

export function CarryoverGiftExclusionSection({
  exclusionDeclared,
  onChange,
  donorRelation,
  donorDeceased,
  giftRegistryDate,
  assetId,
  onRelationChange,
}: Props) {
  /**
   * 관계별로 **묻는 사실이 다르다** — 문언을 그대로 물어야 두 함정을 피한다.
   * · 이혼 후 전 배우자 사망 → 「사망으로 소멸」이 아니므로 체크하지 않는다(적용됨)
   * · 직계존비속은 혼인관계가 없다
   */
  const deathLabel =
    donorRelation === "spouse"
      ? "사망으로 혼인관계가 소멸되었습니다"
      : "양도 당시 증여자가 사망했습니다";

  const deathDescription =
    donorRelation === "spouse"
      ? "이혼으로 소멸한 경우는 해당하지 않습니다 — 그때는 이월과세가 적용됩니다."
      : "양도일 현재 증여자(직계존비속)가 사망한 경우입니다.";

  /** 직계존비속 제외는 2025.1.1. 이후 증여분에만 적용된다 — 침묵하면 사용자가 혼란스럽다. */
  const linealBeforeCutoff =
    donorRelation === "lineal" &&
    giftRegistryDate !== "" &&
    giftRegistryDate < LINEAL_DEATH_CUTOFF;

  return (
    <div className="space-y-3">
      <ToneCard tone="violet" title="증여자와의 관계 (§97조의2 ①)">
        {donorRelation === "other" && (
          <p className="text-caption text-rose-700">
            이월과세는 <strong>배우자 또는 직계존비속</strong>으로부터 증여받은 경우에만
            적용됩니다. 취득 원인을 <strong>「증여」</strong>로 변경하세요.
          </p>
        )}

        <RadioCardGroup
          name={`carryover-donor-relation-${assetId}`}
          layout="inline"
          options={[
            { value: "spouse", label: "배우자" },
            { value: "lineal", label: "직계존비속" },
            // §97의2①의 대상은 위 둘뿐이다. 고르면 ⑧이 취득원인 변경을 안내한다.
            { value: "other", label: "그 외 (형제·친족 등)" },
          ]}
          value={donorRelation}
          onChange={(v) =>
            // 관계가 바뀌면 사망 문항의 **의미가 바뀐다** — 함께 초기화한다(단일 배치 update).
            onRelationChange({ donorRelation: v, donorDeceased: false })
          }
        />

        <ToggleCard
          tone="violet"
          title={deathLabel}
          description={
            donorRelation === ""
              ? undefined
              : linealBeforeCutoff
                ? `${deathDescription} 다만 2025.1.1. 이후 증여받은 자산부터 적용되는 규정이라, 이 증여에는 이월과세가 그대로 적용됩니다.`
                : deathDescription
          }
          // 「그 외」는 ① 요건 자체가 불충족이라 사망 여부를 물을 이유가 없다.
          disabled={donorRelation === "" || donorRelation === "other"}
          disabledReason={
            donorRelation === "other"
              ? "배우자·직계존비속이 아니면 이월과세 대상이 아닙니다."
              : "증여자와의 관계를 먼저 선택하세요 — 관계에 따라 묻는 사실이 다릅니다."
          }
          checked={donorDeceased}
          onCheckedChange={(v) => onRelationChange({ donorDeceased: v })}
        />
      </ToneCard>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold text-rose-700">이월과세 적용배제 선언 (해당 시 선택)</p>
          <LawArticleModal legalBasis="소득세법 §97의2 ②" label="§97의2②" />
        </div>

        <ToggleCard
          tone="rose"
          title="§97조의2 ② 1호 — 협의매수·수용"
          description="사업인정고시일 2년 이전에 증여받은 토지·건물이 협의매수 또는 수용된 경우"
          checked={exclusionDeclared.expropriationWithin2Years}
          onCheckedChange={(v) => onChange({ expropriationWithin2Years: v })}
        />

        <ToggleCard
          tone="rose"
          title="§97조의2 ② 2호 — 1세대1주택 비과세 해당 (고가주택 포함)"
          description="이월과세를 적용할 경우 1세대1주택 비과세에 해당하는 경우 (12억 초과 고가주택 포함)"
          checked={exclusionDeclared.oneHouseExemptionApplies}
          onCheckedChange={(v) => onChange({ oneHouseExemptionApplies: v })}
        />

        <ToggleCard
          tone="rose"
          title="§97조의2 ④ — 가업상속공제 적용 자산"
          description="가업상속공제를 적용받은 자산 — 선택 시 계산이 차단됩니다 (현재 버전 미지원)"
          checked={exclusionDeclared.isFamilyBusinessInheritedAsset}
          onCheckedChange={(v) => onChange({ isFamilyBusinessInheritedAsset: v })}
        />
      </div>
    </div>
  );
}
