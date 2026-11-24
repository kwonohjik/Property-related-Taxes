"use client";

/**
 * ① 1-A 물건 (sky = 면적·규모) — 소재지 · 면적 · 공유 지분 (계획서 `nbl-judgment-menu.ui.plan.md` §2)
 *
 * 소재지는 `AddressSearch disableUnits`(NBL 재촌용 경량 모드 — 동·호·공시가격 조회 없음)다. 선택 뒤 시·군·구 코드 파생은 `addressValueToAssetPatch`가 한다.
 * 면적은 취득·양도 당시 같은 면적으로 두 칸에 함께 쓴다(일부 양도·환지는 이 메뉴가 받지 않는다 — 안내문).
 * 지분은 `OwnershipRatioInput` + 「나머지 지분은 타인 소유」 선언(UD-4). `OwnershipRatioBlock`의 「모든 금액을 100% 기준」 안내는 금액을 묻지 않는 이 메뉴에 맞지 않아 쓰지 않는다.
 */
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { OwnershipRatioInput } from "@/components/calc/transfer/OwnershipRatioInput";
import { addressValueToAssetPatch } from "@/lib/calc/nbl-judgment-address-patch";
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-asset-basics";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function LandBasicFields({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const fractional = isFractionalRatioStr(asset.ownershipNumerator || "100", asset.ownershipDenominator || "100");
  return (
    <ToneCard tone="sky" sectionNum="1-A" title="물건 — 소재지 · 면적 · 지분" bodyClassName="space-y-3">
      {/* 소재지 — 물건 식별자라 필수다(이력 dedup 키). 시·군·구는 선택한 주소에서 자동으로 정해진다. */}
      <div className="space-y-1.5" data-field="addressJibun">
        <label className="block text-sm font-medium">
          소재지 <span className="text-destructive">*</span>
        </label>
        <AddressSearch
          disableUnits
          value={
            {
              road: asset.addressRoad,
              jibun: asset.addressJibun,
              building: asset.buildingName ?? "",
              detail: asset.addressDetail ?? "",
              lng: asset.longitude ?? null,
              lat: asset.latitude ?? null,
            } satisfies AddressValue
          }
          onChange={async (v) => {
            onAssetChange(await addressValueToAssetPatch(v));
          }}
        />
        <p className="text-xs text-muted-foreground">※ 재촌 판정의 시·군·구와 이력의 물건 구분에 쓰입니다.</p>
      </div>

      <FieldCard
        label="토지 면적"
        required
        field="acquisitionArea"
        unit="㎡"
        hint="취득·양도 당시 같은 면적으로 입력합니다. 일부만 양도하거나 환지로 면적이 달라졌다면 양도소득세 계산기에서 입력하세요."
      >
        <DecimalInput
          value={asset.acquisitionArea}
          onChange={(v) => onAssetChange({ acquisitionArea: v, transferArea: v })}
          data-testid="nbl-judgment-area"
        />
      </FieldCard>

      <OwnershipRatioInput
        numerator={asset.ownershipNumerator || "100"}
        denominator={asset.ownershipDenominator || "100"}
        onChange={(p) =>
          onAssetChange({
            ...(p.numerator !== undefined ? { ownershipNumerator: p.numerator } : {}),
            ...(p.denominator !== undefined ? { ownershipDenominator: p.denominator } : {}),
          })
        }
      />
      {fractional && (
        <ToggleCard
          checked={asset.ownershipRemainderThirdParty === "yes"}
          onCheckedChange={(v) => onAssetChange({ ownershipRemainderThirdParty: v ? "yes" : "" })}
          tone="sky"
          title="이 물건의 나머지 지분은 타인 소유입니다"
          description="켜면 이 토지 1건만으로 판정합니다. 나머지 지분도 내 것(같은 물건을 여러 번에 나눠 취득)이라면 끄고 양도소득세 계산기에서 그 지분을 별도 자산으로 추가하세요 — 이 메뉴는 지분 분할 취득을 판정하지 않습니다."
          data-testid="nbl-judgment-remainder-third-party"
          data-field="ownershipRemainderThirdParty"
        />
      )}
    </ToneCard>
  );
}
