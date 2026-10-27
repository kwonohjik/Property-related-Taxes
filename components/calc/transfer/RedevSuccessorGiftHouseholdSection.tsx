"use client";
/**
 * 재개발 승계조합원 완공APT — **증여 승계의 세대 사실** 입력 묶음 (`SuccessorMemberSection`에서 분리 — 파일 크기 정책).
 *
 * - 「증여자와 계속 같은 세대」(서면4팀-912 · 사전-2020-법령해석재산-0691): 증여 전 종전주택 거주를 비과세 거주요건에 통산한다(표2는 대법원 2025두34935로 통산하지 않는다).
 * - 「증여자가 인가 전부터 종전주택을 보유한 조합원」 + 세대 보유 시작일(계획서 `redev-successor-gift-holding.plan.md` Q-1 a):
 *   증여자 세대의 보유기간(종전주택·공사기간·신축주택)을 §154① 비과세 보유기간에 통산한다(부동산거래관리과-1503).
 *   증여자가 입주권을 사서 승계했거나 토지만 출자했으면 통산할 주택 보유가 없다.
 *
 * 노출 술어는 ④·⑧과 같다(`successorGiftHouseholdInScope` · `successorGiftHouseholdApplies` · `successorGiftHoldingConsolidationApplies`).
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { successorGiftHouseholdApplies, successorGiftHouseholdInScope } from "@/lib/calc/redev-field-scope";
import { successorGiftHoldingConsolidationApplies } from "@/lib/calc/redev-field-scope";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";

export function RedevSuccessorGiftHouseholdSection({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  if (!successorGiftHouseholdInScope(asset)) return null;
  return (
    <>
      <FieldCard
        label="증여자와 계속 같은 세대 (증여일부터 양도일까지)"
        field="redevSuccessorGiftSameHousehold"
        hint="같은 세대로 보유했다면 증여 전 종전주택 거주가 1세대1주택 비과세 거주요건에 통산됩니다(장기보유특별공제 표2에는 통산하지 않음)."
        trailing={
          <PrecedentArticleModal
            citation="사전-2020-법령해석재산-0691 (2021.08.26)"
            label="사전-2020-법령해석재산-0691"
            kind="ruling"
            summary="배우자로부터 조합원입주권을 증여받아 취득한 주택의 영 §159의3에 따른 거주기간은 기존주택과 신축주택에서 1세대로서 거주한 기간을 통산한다."
          />
        }
      >
        <RadioCardGroup
          name={`redevSuccessorGiftSameHousehold-${asset.assetId}`}
          value={asset.redevSuccessorGiftSameHousehold}
          onChange={(v) =>
            onChange({
              redevSuccessorGiftSameHousehold: v as "yes" | "no",
              // 「아니오」는 통산하지 않는다 — 통산용으로 입력한 칸이 화면에서 사라지므로 값도 함께 비운다.
              ...(v === "no"
                ? {
                    redevPriorHouseResidenceMonths: "",
                    redevPriorResidenceStartDate: "",
                    redevPriorResidenceEndDate: "",
                    redevSuccessorGiftDonorHouseMember: "",
                    redevSuccessorGiftHouseholdStartDate: "",
                  }
                : {}),
            })
          }
          options={[
            { value: "yes", label: "예", description: "증여자와 같은 세대로 입주권을 보유" },
            { value: "no", label: "아니오", description: "세대가 갈렸거나 증여자가 다른 세대" },
          ]}
          layout="stack"
        />
      </FieldCard>
      {successorGiftHouseholdApplies(asset) && (
        <>
          <FieldCard
            label="증여자가 관리처분계획 인가 전부터 종전주택을 보유한 조합원이었습니까?"
            field="redevSuccessorGiftDonorHouseMember"
            hint="그렇다면 증여자 세대가 종전주택을 보유한 기간부터 비과세 보유기간을 통산합니다."
            trailing={
              <PrecedentArticleModal
                citation="부동산거래관리과-1503 (2010.12.21)"
                label="부동산거래관리과-1503"
                kind="ruling"
                summary="입주권 상태에서 배우자인 동일세대원 간의 증여가 이루어진 경우에는 증여자 및 수증자의 보유기간을 통산하여 비과세 요건에 해당하는지를 판단한다(서면인터넷방문상담5팀-1002 참조)."
              />
            }
          >
            <RadioCardGroup
              name={`redevSuccessorGiftDonorHouseMember-${asset.assetId}`}
              value={asset.redevSuccessorGiftDonorHouseMember}
              onChange={(v) =>
                onChange({
                  redevSuccessorGiftDonorHouseMember: v as "yes" | "no",
                  ...(v === "no" ? { redevSuccessorGiftHouseholdStartDate: "" } : {}),
                })
              }
              options={[
                { value: "yes", label: "예", description: "종전주택(건물)을 출자한 원조합원" },
                { value: "no", label: "아니오", description: "입주권을 사서 승계했거나 토지만 출자" },
              ]}
              layout="stack"
            />
          </FieldCard>
          {successorGiftHoldingConsolidationApplies(asset) && (
            <FieldCard
              label="세대가 종전주택 보유를 시작한 날"
              field="redevSuccessorGiftHouseholdStartDate"
              hint="증여자가 종전주택을 취득한 날입니다. 그 뒤에 혼인·합가했다면 그 날을 입력하세요."
            >
              <DateInput
                value={asset.redevSuccessorGiftHouseholdStartDate}
                onChange={(v) => onChange({ redevSuccessorGiftHouseholdStartDate: v })}
              />
            </FieldCard>
          )}
          <FieldCard
            label="증여 전 종전주택 거주기간 (개월)"
            field="redevPriorHouseResidenceMonths"
            hint="증여자와 같은 세대로서 종전주택에서 거주한 기간입니다. 모르면 비워 두면 통산하지 않습니다."
          >
            <DecimalInput
              value={asset.redevPriorHouseResidenceMonths}
              onChange={(v: string) => onChange({ redevPriorHouseResidenceMonths: v })}
              placeholder="종전주택 실거주 개월 수"
            />
          </FieldCard>
        </>
      )}
    </>
  );
}
