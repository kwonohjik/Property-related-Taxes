"use client";

/**
 * ① 토지 기본 — 물건(1-A) · 취득(1-B) · 양도(1-C) (계획서 `nbl-judgment-menu.ui.plan.md` §2)
 *
 * 3개 서브섹션이 연속이라 색상 카드 + 섹션 번호 배지 패턴을 쓴다. 입력은 전부 판정에 필요한 사실뿐이다 — 양도가액·취득가액·필요경비는 묻지 않는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LandBasicFields } from "@/components/calc/nbl-judgment/LandBasicFields";
import { LandAcquisitionFields } from "@/components/calc/nbl-judgment/LandAcquisitionFields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function StepLand({
  form,
  onFormChange,
  onAssetChange,
}: {
  form: NblJudgmentFormData;
  onFormChange: (patch: Partial<NblJudgmentFormData>) => void;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const asset = form.assets[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" data-testid="nbl-judgment-scope-note">
        이 메뉴는 <b>토지 1필지</b>의 사업용·비사업용 여부만 판정합니다. 함께 양도하는 자산·지분 분할 취득·감면·양도가액·취득가액은 양도소득세 계산기에서 입력하세요.
      </p>
      <LandBasicFields asset={asset} onAssetChange={onAssetChange} />
      <LandAcquisitionFields asset={asset} onAssetChange={onAssetChange} />
      <ToneCard tone="emerald" sectionNum="1-C" title="양도 — 양도일" bodyClassName="space-y-3">
        <FieldCard label="양도일 (양도 예정일 포함)" required field="transferDate">
          <DateInput
            value={form.transferDate}
            onChange={(v) => onFormChange({ transferDate: v })}
            data-testid="nbl-judgment-transfer-date"
          />
        </FieldCard>
      </ToneCard>
    </div>
  );
}
