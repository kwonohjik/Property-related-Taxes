"use client";

/**
 * 본인 신축·증축 특례 입력 섹션 (소득세법 §114조의2 가산세 판정용)
 *
 * 자산-수준 4필드 입력:
 *   - isSelfBuilt: 신축·증축 여부 토글
 *   - buildingType: "new" | "extension"
 *   - constructionDate: 완공일
 *   - extensionFloorArea: 증축 부분 바닥면적 (extension 전용)
 *
 * acquisitionCause === "purchase" + assetKind in {housing, building} 인 자산에만 노출.
 */

import { DateInput } from "@/components/ui/date-input";
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
}: SelfBuiltSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={isSelfBuilt}
          onChange={(e) => {
            onIsSelfBuiltChange(e.target.checked);
            if (!e.target.checked) {
              onBuildingTypeChange("");
              onConstructionDateChange("");
              onExtensionFloorAreaChange("");
            }
          }}
          className="h-4 w-4 rounded accent-primary"
        />
        <span className="text-sm font-medium">본인이 신축 또는 증축한 건물입니까?</span>
      </label>
      <p className="ml-6 text-xs text-muted-foreground -mt-1">
        §114조의2 가산세 판정에 영향. 매매 취득 자산 전용.
      </p>

      {isSelfBuilt && (
        <div className="space-y-3 pl-6 border-l-2 border-amber-300/60">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              구분 <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
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
            <DateInput value={constructionDate} onChange={onConstructionDateChange} />
            <p className="text-xs text-muted-foreground">신축·증축이 완료된 날짜</p>
          </div>

          {buildingType === "extension" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                증축 부분 바닥면적 (㎡) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={extensionFloorArea}
                onChange={(e) =>
                  onExtensionFloorAreaChange(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="증축한 면적만 입력"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
