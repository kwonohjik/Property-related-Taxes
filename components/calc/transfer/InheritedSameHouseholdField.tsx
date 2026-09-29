"use client";

/**
 * ② 양도 대상 주택 — **상속받은 주택 · §154⑧3호 동일세대 통산** 입력 (OH-18)
 *
 * 「소득세법 시행령」 §154⑧3호: 「상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인
 * 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간」을 §154①의
 * 거주기간·보유기간에 통산한다.
 *
 * 🔴 종전에는 이 칸이 없어, 계산기에서는 비과세인 동일세대 상속주택이 판정 메뉴에서는 상속개시일부터만
 *    보유·거주를 세어 「과세」와 틀린 기한을 냈다. 재사용하는 `ResidencePeriodSection`은
 *    「통산 거주분은 취득 원인 카드에 별도 입력」이라고 안내하는데 그 카드가 없었다.
 *
 * 🔑 필드는 계산기와 **같은 자산-수준 필드**다(`CompanionAcqInheritanceBlock`) — 판정 → 계산기
 *    전달(`toTransferFormPatch`)이 자산을 그대로 넘기므로 두 화면이 같은 사실을 본다.
 * 🔑 게이트는 ④(`buildOneHouseExemptionApiBody`)·⑧(`validateStep3`)과 같다 — 호출부가
 *    양도 대상이 주택일 때만 렌더한다(`judgmentSaleIsHousing`).
 *
 * 2026-09-28 E-1 잔여 D: `app/calc/one-house-exemption/steps/`에서 옮겼다(JSX·testid 그대로). 증여세
 * 부담부증여 양도 경로(`BurdenedGiftHousingFieldSet`)도 같은 사실을 받아야 해서 같은 위젯을 쓴다 —
 * 평행 UI를 만들지 않는다. 두 폼이 같은 이름의 필드를 가지므로 props를 그 필드만의 `Pick`으로 좁혔다
 * (타입만 — 동작 그대로). 그 화면의 ④⑧ 게이트는 `lib/calc/gift-burdened-one-house.ts`.
 *
 * 2026-09-29 E-1 한계(e1z) G1: `isHousing={false}` — 증여세 부담부증여 경로의 **토지·비주택 건물**도 상속받은
 * 자산이면 「소득세법」 §104②1호(세율 보유기간 = 피상속인 취득일부터)가 걸린다. 계산기 취득 원인 카드
 * (`CompanionAcqInheritanceBlock`)와 같은 게이트로 동일세대 통산(§154⑧3호 — 주택 전용)만 감춘다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DateInput } from "@/components/ui/date-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 이 위젯이 읽고 쓰는 필드 — 판정 메뉴 `AssetForm`과 증여세 부담부증여 폼이 같은 이름으로 갖는다 */
type InheritedHouseFields = Pick<
  AssetForm,
  | "decedentAcquisitionDate"
  | "decedentSameHouseholdBeforeInheritance"
  | "decedentCohabitationHoldingStartDate"
  | "decedentCohabitationResidenceMonths"
> & { acquisitionCause: AssetForm["acquisitionCause"] | undefined };

type Props = {
  asset: InheritedHouseFields;
  /**
   * 양도 대상이 주택인가(기본 true). false면 §154⑧3호 동일세대 통산 칸을 그리지 않는다 — 계산기
   * `CompanionAcqInheritanceBlock`의 `assetKind === "housing"` 게이트와 같다. 제목·안내도 자산으로 바뀐다.
   */
  isHousing?: boolean;
  onChange: (patch: Partial<Pick<AssetForm, keyof InheritedHouseFields>> & { acquisitionCause?: "purchase" | "inheritance" }) => void;
};

/** 동일세대 통산 3필드를 비운 patch — 토글을 끌 때 남은 값이 ④로 새지 않게 한다. */
const CLEARED_CONSOLIDATION = {
  decedentSameHouseholdBeforeInheritance: false,
  decedentCohabitationHoldingStartDate: "",
  decedentCohabitationResidenceMonths: "",
};

export function InheritedSameHouseholdField({ asset, onChange, isHousing = true }: Props) {
  const inherited = asset.acquisitionCause === "inheritance";
  const noun = isHousing ? "주택" : "자산";
  return (
    <ToggleCard
      data-testid="one-house-inherited-house"
      checked={inherited}
      onCheckedChange={(on) =>
        onChange(
          on
            ? { acquisitionCause: "inheritance" }
            : { acquisitionCause: "purchase", ...CLEARED_CONSOLIDATION },
        )
      }
      title={`상속받은 ${noun}입니다`}
      description={`위 취득일에는 상속개시일을 입력하세요 — 상속받은 ${noun}의 취득일은 상속개시일입니다`}
      tone="violet"
      lawRefs={
        isHousing
          ? [{ legalBasis: "소득세법 시행령 §154⑧", label: "영 §154⑧" }]
          : [{ legalBasis: "소득세법 §104②", label: "법 §104②" }]
      }
    >
      <div className="space-y-3">
        <FieldCard
          label="피상속인 취득일"
          hint={isHousing ? "피상속인이 이 주택을 취득한 날" : "피상속인이 이 자산을 취득한 날 — 단기보유 세율의 보유기간을 이 날부터 셉니다 (소득세법 §104②1호)"}
        >
          <DateInput
            data-testid="one-house-decedent-acq-date"
            value={asset.decedentAcquisitionDate ?? ""}
            onChange={(decedentAcquisitionDate) => onChange({ decedentAcquisitionDate })}
          />
        </FieldCard>

        {isHousing && (
          <ToggleCard
            data-testid="one-house-same-household-inheritance"
            checked={asset.decedentSameHouseholdBeforeInheritance === true}
            onCheckedChange={(on) =>
              onChange(on ? { decedentSameHouseholdBeforeInheritance: true } : CLEARED_CONSOLIDATION)
            }
            title="상속개시 당시 피상속인과 동일세대였습니다"
            description="상속개시 전 동일세대로서 거주·보유한 기간을 보유기간·거주기간에 통산합니다 (소령 §154⑧3호)"
            tone="violet"
            size="sm"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldCard
                label="동일세대 거주·보유 개시일"
                hint="상속개시 전 피상속인과 동일세대로서 이 주택에 거주·보유하기 시작한 날 — 보유기간은 이 날부터 셉니다"
              >
                <DateInput
                  data-testid="one-house-cohabitation-start"
                  value={asset.decedentCohabitationHoldingStartDate ?? ""}
                  onChange={(decedentCohabitationHoldingStartDate) =>
                    onChange({ decedentCohabitationHoldingStartDate })
                  }
                />
              </FieldCard>
              <FieldCard
                label="상속개시 전 동일세대 거주기간"
                hint="개월. 상속개시일 이후 본인 거주는 아래 거주기간에 따로 입력합니다"
              >
                <IntegerInput
                  ariaLabel="상속개시 전 동일세대 거주기간"
                  allowEmpty
                  value={
                    asset.decedentCohabitationResidenceMonths === ""
                      ? undefined
                      : Number(asset.decedentCohabitationResidenceMonths)
                  }
                  onChange={(v) =>
                    onChange({ decedentCohabitationResidenceMonths: v === undefined ? "" : String(v) })
                  }
                />
              </FieldCard>
            </div>
          </ToggleCard>
        )}
      </div>
    </ToggleCard>
  );
}
