"use client";

/**
 * ② 사업용 의제·지목 — 계산기 Step4 「판정 도움」 입력 위젯(`NblSectionContainer`)의 앞 절반을 그대로 쓴다 (계획서 §2 ②·§4).
 *
 * `part="judge"` = 무조건 사업용 의제(§168의14③) + 지목·용도지역 + 지목별 세부. 의제가 성립하면 지목별 입력이 비활성이 되는 계산기의 현행 동작을 그대로 따른다.
 * 컨테이너 머리(「비사업용 토지 정밀 판정」)·「접기」는 `part` 지정 시 숨겨지므로 이 단계가 자기 머리를 갖는다.
 */
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function StepJudge({
  form,
  onAssetChange,
}: {
  form: NblJudgmentFormData;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <div className="space-y-4" data-testid="nbl-judgment-step-judge">
      <SectionHeader title="② 사업용 의제·지목" description="무조건 사업용으로 보는 사유와 지목별 상세 정보를 입력하면 엔진이 사업용·비사업용을 판정합니다." />
      <NblSectionContainer
        part="judge"
        asset={form.assets[0]}
        onAssetChange={onAssetChange}
        transferDate={form.transferDate || undefined}
      />
    </div>
  );
}
