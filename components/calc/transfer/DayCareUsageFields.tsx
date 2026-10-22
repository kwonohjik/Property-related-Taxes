"use client";

/**
 * DayCareUsageFields — 「소득세법 시행령」 §167의3①8호의2 어린이집의 사용 기간·사용 상태 입력.
 * 양도 주택(`SellingHouseExclusionSection`)과 보유 주택 행(`HouseEntrySpecialExclusionSection`)이 같은 칸을 쓴다.
 *
 * 사용 상태는 「양도일 현재 어린이집으로 사용 중」과 사용 종료일 택일이다(`daycare-usage-status.ts` — 빈 값 = 「모름」은 ⑧이 막는다).
 * 정책: ToggleCard/DateInput/DecimalInput 전용 · 선택 시 날짜를 직접 지운다(useEffect 미러링 금지).
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

export interface DayCareUsageValue {
  dayCareOperationYears?: string;
  dayCareEndDate?: string;
  dayCareInUse?: boolean;
}

interface Props {
  value: DayCareUsageValue;
  onPatch: (patch: DayCareUsageValue) => void;
  tone: "amber" | "rose";
  /** 사용 기간 칸의 `data-field`(⑧ 오류 칸 이동) — 명부 행은 행 단위로 이동하므로 비운다 */
  fieldYears?: string;
  /** 사용 종료일 칸의 `data-field` */
  fieldEndDate?: string;
  /** 「사용 중」 칩의 data-testid */
  inUseTestId?: string;
}

export function DayCareUsageFields({ value, onPatch, tone, fieldYears, fieldEndDate, inUseTestId }: Props) {
  return (
    <div className="space-y-2 pt-1">
      <div className="space-y-1" data-field={fieldYears}>
        <label className="block text-caption text-muted-foreground font-medium">어린이집 사용 기간 (년)</label>
        <DecimalInput
          value={value.dayCareOperationYears ?? ""}
          onChange={(s) => onPatch({ dayCareOperationYears: s || undefined })}
          placeholder="사용 기간"
        />
        <p className="text-caption text-muted-foreground">
          고유번호를 받은 후 5년 이상 사용해야 배제됩니다. 2022.2.15. 이후 양도는 인가 어린이집과 국가·지방자치단체 위탁
          어린이집 사이에 전환했으면 두 사용기간을 합산하고, 2022.2.14. 이전 양도는 가정어린이집만 해당합니다.
        </p>
      </div>
      {/* 8호의2 「어린이집으로 사용하지 않게 된 날부터 6개월이 경과하지 않은」 — 종료일 또는 「사용 중」 택일 */}
      <ToggleCard
        variant="chip"
        tone={tone}
        data-testid={inUseTestId}
        checked={value.dayCareInUse === true}
        onCheckedChange={(b) => onPatch(b ? { dayCareInUse: true, dayCareEndDate: undefined } : { dayCareInUse: undefined })}
        title="양도일 현재 어린이집으로 사용 중"
      />
      {value.dayCareInUse !== true && (
        <div className="space-y-1" data-field={fieldEndDate}>
          <label className="block text-caption text-muted-foreground font-medium">
            어린이집으로 사용하지 않게 된 날{" "}
            <span className="text-muted-foreground font-normal">(그날부터 6개월이 지나기 전 양도만 배제)</span>
          </label>
          <DateInput value={value.dayCareEndDate ?? ""} onChange={(v) => onPatch({ dayCareEndDate: v || undefined })} />
        </div>
      )}
      <p className="text-caption text-muted-foreground">
        사용하지 않게 된 날 또는 「양도일 현재 어린이집으로 사용 중」 중 하나가 필요합니다 (소득세법 시행령 §167의3①8호의2)
      </p>
    </div>
  );
}
