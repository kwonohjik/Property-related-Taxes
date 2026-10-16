"use client";

/**
 * 본인 신축·증축 특례 입력 섹션 (소득세법 §114조의2 가산세 판정용)
 *
 * 자산-수준 5필드 입력:
 *   - isSelfBuilt: 신축·증축 여부 토글
 *   - buildingType: "new" | "extension"
 *   - constructionDate: 완공일
 *   - extensionFloorArea: 증축 부분 바닥면적 (extension 전용)
 *   - extensionStdPriceAtAcquisition: 증축부분 취득시 기준시가 총액 (extension 전용, Phase 2)
 *   - extensionAppraisalValue: 증축부분에 한정한 감정가액 (extension × 감정가액 × 가산세 게이트가 열릴 때만)
 *
 * acquisitionCause === "purchase" + assetKind in {housing, building} 인 자산에만 노출.
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { cn } from "@/lib/utils";

export interface SelfBuiltSectionProps {
  isSelfBuilt: boolean;
  onIsSelfBuiltChange: (v: boolean) => void;
  buildingType: "new" | "extension" | "";
  onBuildingTypeChange: (v: "new" | "extension" | "") => void;
  constructionDate: string;
  onConstructionDateChange: (v: string) => void;
  extensionFloorArea: string;
  onExtensionFloorAreaChange: (v: string) => void;
  /** 증축부분 취득(증축완공)당시 기준시가 총액 (원). buildingType==="extension" 시 필수. Phase 2. */
  extensionStdPriceAtAcquisition: string;
  onExtensionStdPriceAtAcquisitionChange: (v: string) => void;
  /**
   * 증축부분에 한정한 감정가액 (원) — §114조의2① 감정가액 가산세 base. `showExtensionAppraisal`이 참일 때만 칸이 뜬다
   * (감정가액 + 증축 + 5년·85㎡·2020.1.1 게이트 — 호출부가 ⑧·④와 같은 술어로 판정해 넘긴다).
   */
  showExtensionAppraisal?: boolean;
  extensionAppraisalValue?: string;
  onExtensionAppraisalValueChange?: (v: string) => void;
}

export function SelfBuiltSection({
  isSelfBuilt,
  onIsSelfBuiltChange,
  buildingType,
  onBuildingTypeChange,
  constructionDate,
  onConstructionDateChange,
  extensionFloorArea,
  onExtensionFloorAreaChange,
  extensionStdPriceAtAcquisition,
  onExtensionStdPriceAtAcquisitionChange,
  showExtensionAppraisal,
  extensionAppraisalValue,
  onExtensionAppraisalValueChange,
}: SelfBuiltSectionProps) {
  return (
    <ToggleCard
      tone="amber"
      data-field="isSelfBuilt"
      title="본인이 신축 또는 증축한 건물입니까?"
      description="「소득세법」 §114조의2 가산세 판정에 영향. 매매 취득 자산 전용."
      checked={isSelfBuilt}
      onCheckedChange={(v) => {
        onIsSelfBuiltChange(v);
        if (!v) {
          onBuildingTypeChange("");
          onConstructionDateChange("");
          onExtensionFloorAreaChange("");
          onExtensionStdPriceAtAcquisitionChange("");
          onExtensionAppraisalValueChange?.("");
        }
      }}
    >
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          구분 <span className="text-destructive">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 max-w-xs" data-field="buildingType">
          {(["new", "extension"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onBuildingTypeChange(t)}
              className={cn(
                "rounded-md border-2 py-2 text-sm font-medium transition-all",
                buildingType === t
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              {t === "new" ? "신축" : "증축"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          완공일 <span className="text-destructive">*</span>
        </label>
        <DateInput data-field="constructionDate" value={constructionDate} onChange={onConstructionDateChange} />
        <p className="text-xs text-muted-foreground">신축·증축이 완료된 날짜</p>
      </div>

      {buildingType === "extension" && (
        <div className="space-y-1.5" data-field="extensionFloorArea">
          <label className="block text-sm font-medium">
            증축 부분 바닥면적 (㎡) <span className="text-destructive">*</span>
          </label>
          <DecimalInput
            value={extensionFloorArea}
            onChange={onExtensionFloorAreaChange}
          />
        </div>
      )}

      {buildingType === "extension" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            증축부분 취득(완공)당시 기준시가 총액 (원) <span className="text-destructive">*</span>
          </label>
          <CurrencyInput
            label="증축부분 취득(완공)당시 기준시가 총액"
            data-field="extensionStdPriceAtAcquisition"
            hideUnit
            value={extensionStdPriceAtAcquisition}
            onChange={onExtensionStdPriceAtAcquisitionChange}
          />
          <p className="text-xs text-muted-foreground">
            「소득세법」 §114조의2① 가산세 산정 기준액 산출용. 국세청 건물 기준시가 조회 후 면적 × 단가로 총액 입력.
          </p>
        </div>
      )}

      {buildingType === "extension" && showExtensionAppraisal && onExtensionAppraisalValueChange && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            증축한 부분의 감정가액 (원) <span className="text-destructive">*</span>
          </label>
          <CurrencyInput
            label="증축한 부분의 감정가액"
            data-field="extensionAppraisalValue"
            data-testid="extension-appraisal-value"
            hideUnit
            value={extensionAppraisalValue ?? ""}
            onChange={onExtensionAppraisalValueChange}
          />
          <p className="text-xs text-muted-foreground">
            「소득세법」 §114조의2① — 증축한 건물을 5년 이내 양도하면서 취득가액을 감정가액으로 하면 <strong>증축한 부분에 한정한 감정가액</strong>의 5%가 가산세로 붙습니다.
            건물 전체 감정가액으로 대신할 수 없습니다.
          </p>
        </div>
      )}
    </ToggleCard>
  );
}
