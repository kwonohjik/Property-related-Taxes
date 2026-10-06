"use client";

/**
 * §155⑳ 생애 한 차례·직전거주주택보유주택 1주택 한정 구간(OH-40) 입력 블록 — 판정 메뉴 전용.
 *
 * 대통령령 제29523호(2019.2.12) 부칙 제7조①: 이후 취득한 거주주택은 ⑳ 두 괄호가 적용되고, 제35349호 부칙
 * 제14조로 2025.2.28 이후 양도분부터 삭제됐다. 부칙 제7조② 경과조치는 사유(D11)까지 받아야 괄호를 푼다 —
 * 2호(계약금) 경로는 2019.2.12. 전 등록 임대주택 소유가 해석상 요건이다(엔진 `isAddendumTransitionEffective`).
 *
 * `RentalHousingExceptionSection.tsx`에서 800줄 정책에 따라 분리(2026-10-06).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isAddendumTransitionEffective } from "@/lib/tax-engine/data/rental-155-20-era";

type Rh = AssetForm["rentalHousingException"];

interface RentalLifetimeLimitBlockProps {
  rh: Rh;
  assetId?: string;
  onChange: (patch: Partial<Rh>) => void;
}

export function RentalLifetimeLimitBlock({ rh, assetId, onChange }: RentalLifetimeLimitBlockProps) {
  const transitionEffective = isAddendumTransitionEffective(
    rh.residenceTransitionUnderAddendum === true,
    rh.residenceTransitionBasis,
  );
  return (
    <div className="space-y-2" data-testid="rental-lifetime-limit-block">
      <ToneCard tone="amber" title="2019.2.12 이후 취득 · 2025.2.27 이전 양도 — 적용 범위 제한">
        <p className="text-caption">
          이 구간의 양도는{" "}
          {rh.scenario === "B"
            ? "임대주택을 거주주택으로 전환한 경우 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 때에만"
            : "장기임대주택을 보유한 채 생애 한 차례만 거주주택을 최초로 양도하는 경우에만"}{" "}
          특례가 적용됩니다(소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①).
        </p>
      </ToneCard>
      <ToggleCard
        variant="card"
        size="sm"
        tone="emerald"
        data-testid="rental-residence-transition"
        title="2019.2.12 당시 이 주택에 거주하고 있었거나, 그 전에 매매계약을 체결하고 계약금을 지급했습니다."
        description="증빙서류로 확인되면 종전 규정을 따라 위 제한이 적용되지 않습니다(대통령령 제29523호 부칙 제7조②)."
        checked={rh.residenceTransitionUnderAddendum === true}
        // 체크를 끄면 사유도 함께 비운다(한 patch — 다중키 stale spread 방지).
        onCheckedChange={(v) =>
          onChange({ residenceTransitionUnderAddendum: v, ...(v ? {} : { residenceTransitionBasis: "" }) })
        }
      />
      {rh.residenceTransitionUnderAddendum === true && (
        <FieldCard label="경과조치 사유" required>
          <RadioCardGroup
            name={`rental-transition-basis-${assetId ?? "primary"}`}
            data-testid="rental-transition-basis"
            tone="emerald"
            layout="stack"
            options={[
              {
                value: "residing",
                label: "2019.2.12 당시 이 주택에 거주하고 있었습니다",
                testId: "rental-transition-basis-residing",
              },
              {
                value: "contract_with_prior_rental",
                label: "그 전에 계약금을 지급했고, 2019.2.12 전에 지자체·세무서에 등록한 임대주택을 소유하고 있었습니다",
                description: "계약 당시 임대주택이 이미 등록돼 있어야 하는 것은 아닙니다(서면-2021-법령해석재산-1409).",
                testId: "rental-transition-basis-contract-with-rental",
              },
              {
                value: "contract_without_prior_rental",
                label: "그 전에 계약금을 지급했지만, 2019.2.12 전에 등록한 임대주택은 없었습니다",
                description:
                  "이 경우 종전 규정을 적용받지 못합니다(서면-2020-법령해석재산-1464 · 서면-2021-법규재산-4760).",
                testId: "rental-transition-basis-contract-without-rental",
              },
            ]}
            value={rh.residenceTransitionBasis ?? ""}
            onChange={(v) => onChange({ residenceTransitionBasis: v })}
          />
        </FieldCard>
      )}
      {rh.scenario === "A" && !transitionEffective && (
        <FieldCard label="장기임대주택 보유 중 거주주택 양도 이력" required>
          <RadioCardGroup
            name={`rental-prior-history-${assetId ?? "primary"}`}
            data-testid="rental-prior-history"
            tone="amber"
            layout="stack"
            options={[
              {
                value: "none",
                label: "없음 — 이번이 최초의 거주주택 양도입니다",
                testId: "rental-prior-history-none",
              },
              {
                value: "used",
                label: "있음 — 이미 거주주택을 양도해 이 특례를 적용받았습니다",
                description: "생애 한 차례 제한으로 이번 양도에는 적용되지 않습니다.",
                testId: "rental-prior-history-used",
              },
            ]}
            value={rh.priorRentalExemptionHistory ?? ""}
            onChange={(v) => onChange({ priorRentalExemptionHistory: v })}
          />
        </FieldCard>
      )}
    </div>
  );
}
