"use client";

/**
 * 취득 당시 감정평가가액(토지·건물) — 비-별개 취득의 취득가액 총액 안분 basis(V-7).
 * 계획서: docs/02-design/features/owner-split-residue-followups.plan.md §2.5.
 *
 * 노출은 호출부가 `acqAppraisalApportionApplies`로 정한다 — ④ 전송·⑧ 쌍 검증과 같은 술어. 비워 두면 종전대로 취득시 기준시가 비율로 나눈다.
 * 양도 쪽 `SaleAppraisalFields`와 같은 규칙이다: 양쪽 모두 입력해야 기준이 되고, 시기 요건은 프로그램이 판정하지 않는다(Q-9).
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function AcqAppraisalFields({ asset, onChange }: { asset: AssetForm; onChange: (patch: Partial<AssetForm>) => void }) {
  return (
    <div className="space-y-2" data-testid="acq-appraisal-fields">
      <p className="text-sm font-medium">취득 당시 감정평가가액 (선택)</p>
      <div className="grid grid-cols-2 gap-2">
        <FieldCard field="landAppraisalAtAcquisition" label="토지 감정평가가액">
          <CurrencyInput
            label=""
            value={asset.landAppraisalAtAcquisition ?? ""}
            onChange={(v) => onChange({ landAppraisalAtAcquisition: v })}
            data-testid="acq-appraisal-land"
          />
        </FieldCard>
        <FieldCard field="buildingAppraisalAtAcquisition" label="건물 감정평가가액">
          <CurrencyInput
            label=""
            value={asset.buildingAppraisalAtAcquisition ?? ""}
            onChange={(v) => onChange({ buildingAppraisalAtAcquisition: v })}
            data-testid="acq-appraisal-building"
          />
        </FieldCard>
      </div>
      <p className="text-caption leading-snug text-muted-foreground">
        토지·건물 <strong>양쪽 모두</strong> 입력하면 취득가액을 기준시가 대신 감정평가가액 비율로 나눕니다
        (소득세법 §100②·부가가치세법 시행령 §64①1호 단서). 같은 조 괄호의 감정평가 시기 요건은 이 프로그램이 검증하지 않으므로 직접 확인하세요.
      </p>
    </div>
  );
}
