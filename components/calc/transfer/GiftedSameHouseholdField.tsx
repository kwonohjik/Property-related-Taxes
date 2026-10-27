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
 * 🔑 계산기 단건(일반 증여·부담부증여 양도)은 같은 칸을 `GiftHouseholdFactInputs`로 재사용한다(결정 #38-1) — 증여자 취득일은 증여 블록이
 *    이미 받으므로 빼고, 게이트는 `calcGiftHouseholdFactVisible`이다.
 *
 * 통산은 비과세 판정(보유기간·「취득 당시」·증여 전 거주)과 표2 대상 판정(증여 전 거주)에 쓴다. 장기보유특별공제율의 보유·거주기간과 세율 보유기간은 증여일 기준이다.
 */
import type { ReactNode } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { PriorHouseholdResidenceField } from "./PriorHouseholdResidenceField";
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
  | "giftPriorHouseholdResidenceMonths"
  | "giftDonorDeceased"
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
  giftPriorHouseholdResidenceMonths: "",
  giftDonorDeceased: false,
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
      <GiftHouseholdFactInputs asset={asset} onChange={onChange} showDonorAcquisitionDate>
        배우자·직계존비속에게서 받은 주택을 증여일부터 10년(2023.1.1. 전 증여는 5년) 안에 양도하는 이월과세 사안은 같은 사실로 계산기에서
        이어서 판정합니다.
      </GiftHouseholdFactInputs>
    </ToggleCard>
  );
}

/**
 * 관계 · (증여자 취득일) · 계속 같은 세대 · 세대 보유 시작일 + 범위 밖 안내 — 판정 메뉴 토글 안과 계산기 증여 블록 아래가 함께 쓴다.
 * `children`은 안내 문단 끝에 붙는 화면별 문장이다.
 */
export function GiftHouseholdFactInputs({
  asset,
  onChange,
  showDonorAcquisitionDate,
  children,
}: Props & { showDonorAcquisitionDate: boolean; children?: ReactNode }) {
  const relation = asset.giftDonorRelation;
  // 이월과세 폼(`CarryoverGiftExclusionSection`)과 같은 문언 — 관계별로 묻는 사실이 다르다(이혼 후 전 배우자 사망은 「사망으로 소멸」이 아니다).
  const deathLabel = relation === "spouse" ? "사망으로 혼인관계가 소멸되었습니다" : "양도 전에 증여자가 사망했습니다";
  const deathDescription =
    relation === "spouse"
      ? "이혼으로 소멸한 경우는 해당하지 않습니다 — 그때는 아래 질문에 답하세요. 사망이면 계속 같은 세대인지는 묻지 않고, 통산 없이 증여일부터 계산하며 확인이 필요합니다."
      : "증여자가 양도일 전에 사망한 경우입니다. 계속 같은 세대인지는 묻지 않고, 통산 없이 증여일부터 계산하며 확인이 필요합니다.";
  return (
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
          onChange={(v) =>
            // 관계가 바뀌면 사망 문항의 **의미가 바뀐다** — 함께 비운다. 「재결합」은 배우자 증여의 답이라 배우자가 아니게 되면 그 답도 비운다(#38-6).
            onChange({
              giftDonorRelation: v as AssetForm["giftDonorRelation"],
              giftDonorDeceased: false,
              ...(v !== "spouse" && asset.giftSameHousehold === "rejoined" ? { giftSameHousehold: "" as const } : {}),
            })
          }
        />
      </FieldCard>

      {showDonorAcquisitionDate && (
        <FieldCard label="증여자 취득일" field="donorAcquisitionDate" hint="증여자가 이 주택을 취득한 날">
          <DateInput
            data-testid="one-house-donor-acq-date"
            value={asset.donorAcquisitionDate ?? ""}
            onChange={(donorAcquisitionDate) => onChange({ donorAcquisitionDate })}
          />
        </FieldCard>
      )}

      {/* 결정 #34 조건 · #38-6 — 증여자 사망이면 질문을 띄우지 않고 통산 없이 계산하며 확인 필요를 고지한다 */}
      <ToggleCard
        data-testid="one-house-gift-donor-deceased"
        tone="violet"
        title={deathLabel}
        description={relation === "" ? undefined : deathDescription}
        disabled={relation === ""}
        disabledReason="증여자와의 관계를 먼저 선택하세요 — 관계에 따라 묻는 사실이 다릅니다."
        checked={asset.giftDonorDeceased}
        onCheckedChange={(v) => onChange({ giftDonorDeceased: v })}
      />

      {!asset.giftDonorDeceased && (
        <>
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
                // 결정 #34 조건 · #38-6 — 정면 해석이 갈려 「아니오」로 계산하고 확인 필요를 고지한다. 배우자 증여에서만 묻는다.
                ...(relation === "spouse"
                  ? [{ value: "rejoined", label: "아니오 — 증여 뒤 이혼했다가 같은 사람과 재결합" }]
                  : []),
              ]}
              value={asset.giftSameHousehold}
              onChange={(v) =>
                onChange(
                  v === "yes"
                    ? { giftSameHousehold: "yes" }
                    : {
                        giftSameHousehold: v === "rejoined" ? "rejoined" : "no",
                        giftHouseholdHoldingStartDate: "",
                        giftPriorHouseholdResidenceMonths: "",
                      },
                )
              }
            />
          </FieldCard>

          {asset.giftSameHousehold === "yes" && (
            <>
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
              {/* 결정 #38-7 — 상속 「상속개시 전 동일세대 거주기간」과 같은 모양·같은 조건부 노출(계속 같은 세대 = 예) */}
              <PriorHouseholdResidenceField
                field="giftPriorHouseholdResidenceMonths"
                testId="one-house-gift-prior-residence"
                value={asset.giftPriorHouseholdResidenceMonths}
                onChange={(giftPriorHouseholdResidenceMonths) => onChange({ giftPriorHouseholdResidenceMonths })}
              />
            </>
          )}
        </>
      )}

      <p className="text-caption text-muted-foreground" data-testid="gift-household-death-rejoin-notice">
        증여자가 양도 전에 사망한 경우와 이혼 후 같은 사람과 재결합한 경우는 정면 해석이 없어 통산하지 않고(「아니오」로) 증여일부터 계산하며,
        통산하면 결론이 달라질 때 결과에 확인 필요를 고지합니다. {children}
      </p>
      {/* 결정 #38-5 — 이 입력으로 표현할 수 없는 경우(입력 모델이 「주택 전부를 단순 증여로 받은 1건」이다) */}
      <p className="text-caption text-muted-foreground" data-testid="gift-household-out-of-scope">
        주택의 지분만 증여받은 경우, 부담부증여로 받은 경우, 같은 세대원에게서 매수한 경우, 「다른 보유 주택 목록」에 적은 주택을 증여받은
        경우의 세대 통산은 이 입력으로 표현하지 않습니다 — 해당하면 확인이 필요합니다.
      </p>
    </div>
  );
}
