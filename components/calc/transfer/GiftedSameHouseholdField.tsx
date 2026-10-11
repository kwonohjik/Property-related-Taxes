"use client";

/**
 * ② 양도 대상 주택 — **증여받은 주택 · 증여자와 계속 같은 세대** 입력 (판정 메뉴, 결정 #38)
 *
 * 증여받은 주택의 1세대1주택 비과세 판정은 증여자와의 세대 관계로 기준일이 갈린다. 같은 세대(배우자는 혼인 유지)로 증여일부터
 * 양도일까지 계속 지냈으면 증여자 세대의 보유기간을 통산하고(조심 2022서7583), 아니면 증여일부터 센다
 * (「소득세법 시행령」 §162①5호). 날짜 한 칸으로는 두 경우를 가를 수 없어 **사실**을 묻는다 — 결론이 아니라 관계와 세대 사실이다.
 *
 * 🔑 상속(`InheritedSameHouseholdField`)과 같은 모양이다. 이월과세(배우자·직계존비속, 증여일부터 10년 이내)의 판정도 같은 사실·같은
 *    엔진 leaf(`one-house/gift-household-basis.ts`)로 하므로, 계산기로 넘길 때 같은 사실로 「이월과세(증여)」 원인을 정해 넘긴다
 *    (`gift-household-handoff.ts`).
 * 🔑 게이트는 ④(`buildGiftHouseholdPayload`)·⑧(`giftHouseholdFactErrors`)과 같다 — 호출부가 양도 대상이 주택일 때만 렌더한다.
 *
 * 통산은 비과세 판정(보유기간·「취득 당시」)에만 쓴다. 장기보유특별공제(표2 대상 판정 포함)와 세율 보유기간은 증여일 기준이다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { giftHouseholdQuestionText } from "@/lib/calc/gift-household-payload";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type GiftFields = Pick<
  AssetForm,
  | "assetId"
  | "acquisitionCause"
  | "donorAcquisitionDate"
  | "giftDonorRelation"
  | "giftSameHousehold"
  | "giftHouseholdHoldingStartDate"
>;

type Props = {
  asset: GiftFields;
  onChange: (patch: Partial<Pick<AssetForm, keyof GiftFields>>) => void;
};

/** 증여 토글을 끌 때 남은 값이 ④로 새지 않게 비운다. */
const CLEARED_GIFT = {
  donorAcquisitionDate: "",
  giftDonorRelation: "" as const,
  giftSameHousehold: "" as const,
  giftHouseholdHoldingStartDate: "",
};

export function GiftedSameHouseholdField({ asset, onChange }: Props) {
  const gifted = asset.acquisitionCause === "gift";
  return (
    <ToggleCard
      data-testid="one-house-gifted-house"
      checked={gifted}
      onCheckedChange={(on) =>
        onChange(on ? { acquisitionCause: "gift" } : { acquisitionCause: "purchase", ...CLEARED_GIFT })
      }
      title="증여받은 주택입니다"
      description="위 취득일에는 증여일(증여 등기접수일)을 입력하세요 — 증여받은 주택의 취득일은 증여받은 날입니다"
      tone="violet"
      lawRefs={[{ legalBasis: "소득세법 §88 6호", label: "법 §88 6호" }]}
    >
      <div className="space-y-3">
        <FieldCard label="증여자와의 관계" field="giftDonorRelation">
          <RadioCardGroup
            name={`gift-donor-relation-${asset.assetId}`}
            data-field="giftDonorRelation"
            layout="inline"
            options={[
              { value: "spouse", label: "배우자" },
              { value: "lineal", label: "직계존비속" },
              { value: "other", label: "그 밖의 친족" },
            ]}
            value={asset.giftDonorRelation}
            onChange={(v) => onChange({ giftDonorRelation: v as AssetForm["giftDonorRelation"] })}
          />
        </FieldCard>

        <FieldCard label="증여자 취득일" field="donorAcquisitionDate" hint="증여자가 이 주택을 취득한 날">
          <DateInput
            data-testid="one-house-donor-acq-date"
            value={asset.donorAcquisitionDate ?? ""}
            onChange={(donorAcquisitionDate) => onChange({ donorAcquisitionDate })}
          />
        </FieldCard>

        <FieldCard
          label="증여자와 계속 같은 세대였습니까"
          field="giftSameHousehold"
          hint={
            asset.giftDonorRelation
              ? giftHouseholdQuestionText(asset.giftDonorRelation)
              : "먼저 증여자와의 관계를 선택하세요 — 관계에 따라 묻는 사실이 다릅니다"
          }
        >
          <RadioCardGroup
            name={`gift-same-household-${asset.assetId}`}
            data-field="giftSameHousehold"
            layout="inline"
            options={[
              { value: "yes", label: "예 — 계속 같은 세대" },
              { value: "no", label: "아니오 — 세대가 달랐거나 중간에 분리" },
            ]}
            value={asset.giftSameHousehold}
            onChange={(v) =>
              onChange(
                v === "yes"
                  ? { giftSameHousehold: "yes" }
                  : { giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" },
              )
            }
          />
        </FieldCard>

        {asset.giftSameHousehold === "yes" && (
          <FieldCard
            label="세대가 이 주택 보유를 시작한 날"
            field="giftHouseholdHoldingStartDate"
            hint="증여자 취득일 이후 혼인·합가했다면 그 날 — 보유기간은 이 날부터 셉니다. 증여자 취득일 이후 증여일 전의 날짜"
          >
            <DateInput
              data-testid="one-house-gift-household-start"
              value={asset.giftHouseholdHoldingStartDate}
              onChange={(giftHouseholdHoldingStartDate) => onChange({ giftHouseholdHoldingStartDate })}
            />
          </FieldCard>
        )}

        <p className="text-caption text-muted-foreground">
          이혼 후 같은 사람과 재결합했거나 증여자가 양도 전에 사망한 경우는 「아니오」로 계산하며 확인이 필요합니다. 배우자·직계존비속에게서 받은
          주택을 증여일부터 10년(2023.1.1. 전 증여는 5년) 안에 양도하는 이월과세 사안은 같은 사실로 계산기에서 이어서 판정합니다.
        </p>
      </div>
    </ToggleCard>
  );
}
