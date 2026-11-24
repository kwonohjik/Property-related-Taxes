"use client";

/**
 * ③ 부득이한 사유·도시편입일·양도일 의제 — `NblSectionContainer part="grace"` (계획서 §2 ③·§4).
 *
 * 무조건 사업용 의제가 성립해 있으면 컨테이너의 같은 래퍼가 이 단계 전체를 비활성으로 만든다 — 그 사실을 위에 안내한다(표시 전용 — 의제 여부는
 * 컨테이너와 같은 leaf `evaluateUnconditionalExemption`을 같은 인자로 부른다).
 */
import { useMemo } from "react";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function StepGrace({
  form,
  onAssetChange,
}: {
  form: NblJudgmentFormData;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const asset = form.assets[0];
  const exempt = useMemo(() => evaluateUnconditionalExemption(asset, form.transferDate ?? "").isExempt, [asset, form.transferDate]);
  return (
    <div className="space-y-4" data-testid="nbl-judgment-step-grace">
      <SectionHeader title="③ 부득이한 사유·편입·의제일" description="해당하는 사실이 없으면 비워 두고 다음으로 넘어가세요." />
      {exempt && (
        <ToneCard tone="emerald" title="무조건 사업용 의제가 성립했습니다">
          <p className="text-caption" data-testid="nbl-judgment-grace-exempt-notice">
            ②에서 입력한 사실로 무조건 사업용 의제(소득세법 시행령 §168의14③)가 성립해, 이 단계의 입력은 판정에 쓰이지 않습니다.
          </p>
        </ToneCard>
      )}
      <NblSectionContainer
        part="grace"
        asset={asset}
        onAssetChange={onAssetChange}
        transferDate={form.transferDate || undefined}
      />
    </div>
  );
}
