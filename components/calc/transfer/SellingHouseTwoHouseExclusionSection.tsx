"use client";

/**
 * SellingHouseTwoHouseExclusionSection — 양도(selling) 주택 2주택 전용 중과배제 특례
 *
 * 소령 §167의10①3호(부득이한 사유 취득)·7호(소송 진행 중·소송 결과 취득). ① 본문이 「각 호의 어느 하나에
 * 해당하지 **않는** 주택」을 중과 대상으로 하므로 이 두 호는 **양도하는 주택 자신**에도 적용된다.
 * 종전에는 두 호가 「다른 보유 주택」 행에만 있어 양도 주택에는 입력 경로가 없었다(F-16).
 * 엔진은 effectiveHouseCount===2 에서 sellingHouse.* 플래그로 평가.
 *
 * 3주택+ 전용 특례는 `SellingHouseExclusionSection`(amber)이 담당한다 — 같은
 * `form.sellingHouseExclusion` 객체를 나눠 쓴다.
 *
 * 정책: ToggleCard/DateInput/DecimalInput/CurrencyInput 전용 · OFF 시 onChange 직접 patch
 *      (useEffect 미러링 금지).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

interface Props {
  value: SellingExclusion | undefined;
  onChange: (v: SellingExclusion | undefined) => void;
}

export function SellingHouseTwoHouseExclusionSection({ value, onChange }: Props) {
  const v = value ?? {};
  function patch(partial: Partial<SellingExclusion>) {
    onChange({ ...v, ...partial });
  }

  return (
    <ToneCard tone="rose" bodyClassName="space-y-2.5" title="양도 주택 중과배제 특례 (2주택 시)" noDark>
      <p className="text-caption text-muted-foreground/80">
        양도하는 주택 자체가 아래 사유에 해당하면 2주택이어도 중과 배제됩니다 (소령 §167의10①3호·7호).
      </p>

      {/* 3호 — 부득이한 사유 취득 */}
      <ToggleCard
        variant="card"
        tone="rose"
        checked={v.isUnavoidableReason ?? false}
        onCheckedChange={(b) =>
          patch({
            isUnavoidableReason: b,
            unavoidableResidenceYears: b ? v.unavoidableResidenceYears : undefined,
            unavoidableReasonResolvedDate: b ? v.unavoidableReasonResolvedDate : undefined,
            acquisitionOfficialPrice: b ? v.acquisitionOfficialPrice : undefined,
          })
        }
        title="부득이한 사유 취득 주택"
        description="취학·근무상 형편·질병 요양 등으로 다른 시·군으로 주거를 이전하며 취득 (소령 §167의10①3호)"
      >
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <CurrencyInput
              label="취득 당시 기준시가"
              value={v.acquisitionOfficialPrice ?? ""}
              onChange={(s) => patch({ acquisitionOfficialPrice: s || undefined })}
            />
            <p className="text-caption text-muted-foreground/70">
              3억원을 초과하지 않아야 배제 적용 — 양도 당시가 아니라 취득 당시 값입니다
            </p>
          </div>
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">거주기간 (년)</label>
            <DecimalInput
              value={v.unavoidableResidenceYears ?? ""}
              onChange={(s) => patch({ unavoidableResidenceYears: s || undefined })}
              placeholder="거주기간 입력"
            />
            <p className="text-caption text-muted-foreground/70">1년 이상이어야 배제 적용</p>
          </div>
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">
              사유 해소일{" "}
              <span className="text-muted-foreground/60 font-normal">(해소 시 — 이후 3년 이내 양도)</span>
            </label>
            <DateInput
              value={v.unavoidableReasonResolvedDate ?? ""}
              onChange={(s) => patch({ unavoidableReasonResolvedDate: s || undefined })}
            />
          </div>
        </div>
      </ToggleCard>

      {/* 7호 — 소송 취득·진행 중 */}
      <ToggleCard
        variant="card"
        tone="rose"
        checked={v.isLitigationHousing ?? false}
        onCheckedChange={(b) =>
          patch({
            isLitigationHousing: b,
            litigationAcquisitionDate: b ? v.litigationAcquisitionDate : undefined,
          })
        }
        title="소송 취득·진행 중 주택"
        description="소유권에 관한 소송이 진행 중이거나 그 소송 결과로 취득 (소령 §167의10①7호)"
      >
        <div className="space-y-1 pt-1">
          <label className="block text-caption text-muted-foreground font-medium">
            소송 확정판결일{" "}
            <span className="text-muted-foreground/60 font-normal">
              (판결 확정 시 — 그날부터 3년 이내 배제. 미입력=진행 중)
            </span>
          </label>
          <DateInput
            value={v.litigationAcquisitionDate ?? ""}
            onChange={(s) => patch({ litigationAcquisitionDate: s || undefined })}
          />
        </div>
      </ToggleCard>
    </ToneCard>
  );
}
