"use client";

/**
 * ① 1-B 취득 (amber = 취득) — 취득원인 → 날짜 → (상속) 피상속인 취득일·수유자 / (이월과세) 증여자 취득일·증여 등기접수일
 * (계획서 `nbl-judgment-menu.ui.plan.md` §2 · 「사용자 결정 2차」 Q-1 (c))
 *
 * UI 순서 = 계산 로직 순서: 취득원인(분기) → 그 원인의 날짜. 라벨에 「취득일」을 남긴다 — `InheritanceWithin3YearsNotice`·`UnconditionalExemptionSection`이 「취득일 칸」을 가리킨다.
 * 이월과세는 취득일 칸이 없다 — 판정의 소유기간 기산일은 증여자 취득일(`nblAcquisitionDateOf`)이고, 증여 등기접수일은 이월과세가 배제될 때(B)의 기산일이다.
 * 계산기의 이월과세 칸·⑧ 규칙(`validateCarryoverEventHead`)을 그대로 쓰며 새 규칙을 만들지 않는다 — 증여 당시 평가액 등 금액 칸은 세액 입력이라 묻지 않는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { buildingDatePatch } from "@/lib/calc/transfer-land-part-cause";
import { nblAcquisitionDateLabel } from "@/lib/calc/nbl-judgment-labels";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Cause = "purchase" | "inheritance" | "gift" | "carryover_gift";

const CAUSE_OPTIONS: { value: Cause; label: string; description: string }[] = [
  { value: "purchase", label: "매매", description: "유상 취득 — 매매계약에 따른 취득일(잔금청산일·등기접수일 중 빠른 날)" },
  { value: "inheritance", label: "상속", description: "상속개시일부터 소유기간을 세고, 피상속인의 취득일을 함께 받습니다." },
  { value: "gift", label: "증여", description: "증여 등기접수일부터 소유기간을 셉니다." },
  { value: "carryover_gift", label: "이월과세 (배우자·직계존비속 증여)", description: "증여자가 취득한 날부터 소유기간을 세는 경우와 증여 등기접수일부터 세는 경우를 함께 판정합니다." },
];

export function LandAcquisitionFields({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const cause = (asset.acquisitionCause || "purchase") as Cause;
  const carryover = asset.carryover ?? CARRYOVER_DEFAULTS;
  const patchCarryover = (p: Partial<typeof CARRYOVER_DEFAULTS>) => onAssetChange({ carryover: { ...carryover, ...p } });

  return (
    <ToneCard tone="amber" sectionNum="1-B" title="취득 — 원인과 날짜" bodyClassName="space-y-3">
      <FieldCard label="취득 원인" required field="acquisitionCause">
        <RadioCardGroup
          name="nbl-judgment-acquisition-cause"
          tone="amber"
          options={CAUSE_OPTIONS}
          value={cause}
          onChange={(v) => onAssetChange({ acquisitionCause: v })}
          data-testid="nbl-judgment-cause"
        />
      </FieldCard>

      {cause !== "carryover_gift" && (
        <FieldCard label={nblAcquisitionDateLabel(cause)} required field="acquisitionDate">
          <DateInput
            value={asset.acquisitionDate}
            onChange={(v) => onAssetChange(buildingDatePatch(cause, v))}
            data-testid="nbl-judgment-acquisition-date"
          />
        </FieldCard>
      )}

      {cause === "inheritance" && (
        <>
          <FieldCard
            label="피상속인 취득일"
            required
            field="decedentAcquisitionDate"
            hint="상속 3년 미경과·2006.12.31. 이전 상속 특례의 기준이 되는 피상속인의 취득일입니다."
          >
            <DateInput
              value={asset.decedentAcquisitionDate ?? ""}
              onChange={(v) => onAssetChange({ decedentAcquisitionDate: v })}
              data-testid="nbl-judgment-decedent-date"
            />
          </FieldCard>
          <ToggleCard
            checked={asset.nonHeirBequest === true}
            onCheckedChange={(v) => onAssetChange({ nonHeirBequest: v })}
            tone="amber"
            title="상속인이 아닌 사람이 유증·사인증여로 받았습니다"
            description="상속인이 아닌 수유자는 상속 특례(3년 이내 양도 · 2006.12.31. 이전 상속 의제 등)가 적용되지 않습니다."
            data-testid="nbl-judgment-non-heir"
          />
        </>
      )}

      {cause === "carryover_gift" && (
        <>
          <ToneCard tone="amber" bodyClassName="space-y-1">
            <p className="text-caption" data-testid="nbl-judgment-carryover-intro">
              이월과세(소득세법 §97의2①)가 적용되는지는 증여 후 양도까지의 기간·세액 비교 등으로 양도소득세 계산기에서 정해집니다.
              이 화면은 <b>이월과세가 적용되는 경우(A)</b>와 <b>적용되지 않는 경우(B)</b>의 비사업용 토지 판정을 모두 보여 줍니다.
            </p>
          </ToneCard>
          <FieldCard
            label="증여자 취득일"
            required
            field="carryover.donorAcquisitionDate"
            hint="이월과세가 적용되는 경우(A)의 소유기간 기산일입니다."
          >
            <DateInput
              value={carryover.donorAcquisitionDate}
              onChange={(v) => patchCarryover({ donorAcquisitionDate: v })}
              data-testid="nbl-judgment-donor-date"
            />
          </FieldCard>
          <FieldCard
            label="증여 등기접수일"
            required
            field="carryover.giftRegistryDate"
            hint="이월과세가 적용되지 않는 경우(B)의 소유기간 기산일입니다."
          >
            <DateInput
              value={carryover.giftRegistryDate}
              onChange={(v) => patchCarryover({ giftRegistryDate: v })}
              data-testid="nbl-judgment-gift-registry-date"
            />
          </FieldCard>
        </>
      )}
    </ToneCard>
  );
}
