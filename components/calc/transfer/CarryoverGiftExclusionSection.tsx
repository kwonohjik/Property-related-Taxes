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
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
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
   * 증여자와 증여일부터 양도일까지 계속 같은 세대였는가 (결정 #33·#34) — 필수 질문. `""`=미답.
   * 노출 술어는 ④·⑧과 같은 `carryoverHouseholdFactVisible`이 정한다(`showHouseholdFact`).
   */
  donorSameHousehold: CarryoverTaxationForm["donorSameHousehold"];
  donorHouseholdHoldingStartDate: string;
  /** 증여자 취득일 — 세대 보유 시작일 안내용 (YYYY-MM-DD) */
  donorAcquisitionDate: string;
  /** 위 질문을 보일지 — 주택이고 증여자가 사망하지 않았고 관계가 「그 외」가 아닐 때(`carryoverHouseholdFactVisible`) */
  showHouseholdFact: boolean;
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
  donorSameHousehold,
  donorHouseholdHoldingStartDate,
  donorAcquisitionDate,
  showHouseholdFact,
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
          data-field="carryover.donorRelation"
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

      {/*
        결정 #33·#34 — 증여자와 증여일부터 양도일까지 **계속 같은 세대**인가. 결론이 아니라 **사실**을 묻는다(필수).
        같은 세대면 증여자 세대의 보유기간을 1세대1주택 비과세 판정(보유 2년·거주요건 「취득 당시」)에 통산한다. 이혼 후 재결합은
        「아니오」로 계산하고, 장기보유특별공제·세율 보유기간은 어느 쪽이든 증여일 기준이다.
      */}
      {showHouseholdFact && (
        <ToneCard tone="violet" title="증여자와 같은 세대 여부 (§154① 보유기간·취득 당시)">
          <p className="text-caption text-muted-foreground">
            증여일부터 양도일까지 증여자와 <strong>계속 같은 세대</strong>였습니까? 배우자는 「소득세법」 §88 6호 기준으로 혼인이
            유지된 경우(법률상 이혼했어도 생계를 같이 하는 등 사실상 이혼으로 보기 어려우면 같은 세대), 그 밖에는 같은 주소·생계를
            계속한 경우입니다. 이혼 후 같은 사람과 재결합한 경우나 증여자가 양도 전에 사망한 경우는 「아니오」로 계산하며 확인이
            필요합니다. 같은 세대라면 비과세 판정의 보유기간(과 거주요건 「취득 당시」)을 증여자 세대가 보유를 시작한 날부터 셉니다
            (조심 2022서7583).
          </p>
          <RadioCardGroup
            name={`carryover-donor-same-household-${assetId}`}
            data-field="carryover.donorSameHousehold"
            layout="inline"
            options={[
              { value: "yes", label: "예 — 계속 같은 세대" },
              { value: "no", label: "아니오 — 세대가 달랐거나 중간에 분리" },
            ]}
            value={donorSameHousehold}
            onChange={(v) =>
              onRelationChange(
                v === "yes"
                  ? { donorSameHousehold: "yes" }
                  : { donorSameHousehold: "no", donorHouseholdHoldingStartDate: "" },
              )
            }
          />
          {donorSameHousehold === "yes" && (
            <FieldCard
              label="세대가 이 주택 보유를 시작한 날"
              field="carryover.donorHouseholdHoldingStartDate"
              hint={
                donorAcquisitionDate
                  ? `증여자 취득일(${donorAcquisitionDate}) 이후 혼인·합가했다면 그 날 — 증여자 취득일 이후 증여 등기접수일 전의 날짜`
                  : "증여자 취득일 이후 혼인·합가했다면 그 날 — 증여자 취득일 이후 증여 등기접수일 전의 날짜"
              }
            >
              <DateInput
                value={donorHouseholdHoldingStartDate}
                onChange={(v) => onRelationChange({ donorHouseholdHoldingStartDate: v })}
              />
            </FieldCard>
          )}
        </ToneCard>
      )}

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
