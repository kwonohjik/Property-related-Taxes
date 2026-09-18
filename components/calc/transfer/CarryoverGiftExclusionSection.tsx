"use client";

/**
 * 이월과세 관계요건(§97조의2 ①) + 적용배제 선언 (§97조의2 ② 각호, ④항)
 * CarryoverGiftBlock에서 분리 — 800줄 정책 준수.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Button } from "@/components/ui/button";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/** 직계존비속 「양도 당시 사망」 제외 신설 — 2025.1.1. 이후 증여받는 자산부터. */
const LINEAL_DEATH_CUTOFF = "2025-01-01";

interface Props {
  exclusionDeclared: CarryoverTaxationForm["exclusionDeclared"];
  onChange: (patch: Partial<CarryoverTaxationForm["exclusionDeclared"]>) => void;
  /** §97조의2 ① 관계요건 */
  donorRelation: CarryoverTaxationForm["donorRelation"];
  donorDeceased: boolean;
  /** D45 배우자 예외 사실 — 증여일 현재 1세대1주택을 배우자로부터 증여받음 */
  spouseGiftOneHouseAtGiftDate: boolean;
  /**
   * 배우자 예외 문항을 보일지 — §97조의2②2호는 **주택** 조항이다. 일반건물은 ④가 이 사실을
   * 전송하지 않으므로(엔진 카드도 1세대1주택이 성립하지 않는다) 문항을 숨긴다.
   */
  showSpouseOneHouseFact: boolean;
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
  spouseGiftOneHouseAtGiftDate,
  showSpouseOneHouseFact,
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
            // 배우자 예외 사실도 배우자에게만 묻는 문항이라 함께 지운다.
            onRelationChange({ donorRelation: v, donorDeceased: false, spouseGiftOneHouseAtGiftDate: false })
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

        {/*
          D45 — 배우자 예외는 **사실**을 묻는다(결론 「②2호 해당」을 묻지 않는다).
          판정 기준일이 **증여일**이라 엔진이 가진 양도일 기준 사실로는 도출할 수 없다.
        */}
        {donorRelation === "spouse" && showSpouseOneHouseFact && (
          <ToggleCard
            tone="violet"
            title="증여일 현재 1세대1주택이던 주택을 배우자로부터 증여받았습니다"
            description="증여일 현재 배우자(증여자) 세대가 이 주택 1채만 보유해 소득세법 §89①3호의 1세대1주택에 해당했다면 체크하세요. 이월과세를 적용해야 비로소 1세대1주택 비과세가 되는 경우에도 §97조의2②2호를 적용하지 않습니다(국세청 서면-2022-부동산-0068 등)."
            checked={spouseGiftOneHouseAtGiftDate}
            onCheckedChange={(v) => onRelationChange({ spouseGiftOneHouseAtGiftDate: v })}
          />
        )}
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

        {/*
          D45 — ② 2호(1세대1주택 비과세)는 선언이 아니라 **자동 판정**한다(엔진 Step 5.5 D-8).
          종전 선언 토글은 B 조건을 묻지 않아 판정을 건너뛰었다. 옛 이력에서 선언이 남아 있으면
          저장 당시 세액을 유지하고(Q-3), 사용자가 전환하면 레거시 플래그를 지운다.
        */}
        {exclusionDeclared.legacyOneHouseExemptionDeclared ? (
          <ToneCard tone="amber" title="§97조의2 ② 2호 — 저장 당시 직접 선언으로 계산 중">
            <p className="text-caption">
              저장 당시 직접 선언한 「②2호 해당」으로 계산했습니다. 현재는 입력한 사실로 자동 판정합니다
              (세액이 달라질 수 있습니다).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ legacyOneHouseExemptionDeclared: false })}
            >
              자동 판정으로 전환
            </Button>
          </ToneCard>
        ) : (
          <p className="text-caption text-muted-foreground">
            §97조의2 ② 2호(이월과세를 적용하면 1세대1주택 비과세에 해당하게 되는 경우)는 입력한 사실로 자동 판정합니다.
          </p>
        )}

        <ToggleCard
          tone="rose"
          title="§97조의2 ④ — 가업상속공제 적용 자산"
          description="가업상속공제를 적용받은 자산 — 이 계산기에서는 지원하지 않아 선택 시 계산이 차단됩니다"
          checked={exclusionDeclared.isFamilyBusinessInheritedAsset}
          onCheckedChange={(v) => onChange({ isFamilyBusinessInheritedAsset: v })}
        />
      </div>
    </div>
  );
}
