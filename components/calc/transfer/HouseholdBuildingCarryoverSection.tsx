"use client";

/**
 * 세대원 건물 출자 통산 (#12 · 사용자 결정 2026-10-13) — 토지만 출자한 원조합원 완공APT
 *
 * 본인은 토지만 출자했지만 같은 세대의 세대원이 철거된 기존 건물을 소유했다면, 1세대1주택 **비과세**(§154①) 보유·거주 요건에서
 * 그 건물의 보유·거주기간을 통산한다. 칸이 닫혀 있으면 사용승인일부터 신축주택 거주만 센다.
 *
 * ⚠️ 장기보유특별공제 공제율은 통산하지 않는다(조심 2025서3843 · 재산세제과-37 · 법규과-1721). 이 선언은 비과세 판정에만 쓰인다.
 * 정면 해석례는 없고 같은 세대의 보유를 통산한 해석례·판결(부동산거래관리과-1041·-113 · 대법원 94누15530)을 유추한 것이다.
 *
 * 노출 게이트는 ④·⑧과 같은 술어(`householdBuildingCarryoverInScope`)다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput, parseInteger } from "@/components/calc/inputs/IntegerInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { householdBuildingCarryoverInScope } from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function HouseholdBuildingCarryoverSection({ asset, onChange }: Props) {
  if (!householdBuildingCarryoverInScope(asset)) return null;
  const on = asset.redevHouseholdBuildingCarryover === "yes";
  return (
    <div data-testid="redev-household-building-carryover">
      <ToggleCard
        tone="sky"
        checked={on}
        onCheckedChange={(v) =>
          onChange(
            v
              ? { redevHouseholdBuildingCarryover: "yes" }
              : {
                  redevHouseholdBuildingCarryover: "",
                  redevHouseholdBuildingAcquisitionDate: "",
                  redevHouseholdBuildingResidenceMonths: "",
                },
          )
        }
        title="같은 세대의 세대원이 철거된 기존 건물을 소유했다 (비과세 보유·거주 통산)"
        description="본인은 토지만 출자했고 건물은 같은 세대의 세대원 소유였다면, 그 건물의 보유·거주기간을 1세대1주택 비과세(§154①) 요건에 통산합니다. 장기보유특별공제 공제율은 통산하지 않습니다."
      >
        <div className="space-y-2">
          <FieldCard
            label="세대원이 기존 건물을 취득한 날"
            field="redevHouseholdBuildingAcquisitionDate"
            hint="비과세 보유기간을 사용승인일 대신 이 날부터 셉니다. 관리처분계획 인가일 이전이어야 합니다."
          >
            <DateInput
              value={asset.redevHouseholdBuildingAcquisitionDate}
              onChange={(v) => onChange({ redevHouseholdBuildingAcquisitionDate: v })}
            />
          </FieldCard>
          <FieldCard
            label="기존 건물에서 세대가 거주한 기간 (선택)"
            field="redevHouseholdBuildingResidenceMonths"
            unit="개월"
            hint="건물 취득일부터 인가일까지의 거주 개월 수. 신축주택 거주기간에 더해 비과세 거주요건(2년)을 판정합니다. 비우면 0으로 봅니다."
          >
            <IntegerInput
              allowEmpty
              value={asset.redevHouseholdBuildingResidenceMonths ? parseInteger(asset.redevHouseholdBuildingResidenceMonths) : undefined}
              onChange={(v) => onChange({ redevHouseholdBuildingResidenceMonths: v === undefined ? "" : String(v) })}
              placeholder="개월 수"
            />
          </FieldCard>
        </div>
      </ToggleCard>
    </div>
  );
}
