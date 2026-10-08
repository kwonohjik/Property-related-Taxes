"use client";

/**
 * SellingHousePreDesignationContractSection — 조정대상지역 **공고 전 매매계약** (양도 주택 사실)
 *
 * 소령 §167의3①11호 · §167의4③5호 · §167의10①11호 · §167의11①10호(네 호 문언 동일):
 * 「조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을
 *   지급받은 사실이 증빙서류에 의하여 확인되는 주택」
 *
 * - 이 주택을 **파는** 계약이다(취득 계약 아님). 장기임대 선언의 「계약금 지급 증빙」(아목·마목 — 취득 측)과
 *   **다른 사실**이라 칸을 따로 둔다(계획서 regulated-area-region-code-match D-3 · Q-3).
 * - 어느 공고와 비교하는지는 엔진이 정한다 — 양도일에 효력이 있는 지정 구간을 연 공고(Q-1). 여기서는 그
 *   날짜를 **안내로만** 보여 준다(같은 leaf `governingDesignationStart` + legal-codes 공고일 표).
 * - 노출 범위는 `preDesignationContractInScopeOf`(④·⑧과 같은 술어) — 호출부가 건다.
 *
 * 정책: ToggleCard/DateInput 전용 · OFF 시 onChange 직접 patch(useEffect 미러링 금지).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { governingDesignationStart } from "@/lib/tax-engine/data/regulated-areas";
import { PRE_DESIGNATION_CONTRACT_EXCLUSION } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

interface Props {
  value: SellingExclusion | undefined;
  onChange: (v: SellingExclusion | undefined) => void;
  /** 양도 물건 법정동코드 · 양도일 — 공고일 안내용(범위 판정은 호출부) */
  regionCode: string | undefined;
  /** 양도 주택이 지정 지구 안인가(선언) — 공고 식별도 같은 판정을 쓴다 */
  regionInDesignatedDistrict?: boolean;
  transferDate: string;
}

function dotted(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${y}.${Number(m)}.${Number(d)}.`;
}

export function SellingHousePreDesignationContractSection({
  value,
  onChange,
  regionCode,
  regionInDesignatedDistrict,
  transferDate,
}: Props) {
  const v = value ?? {};
  const start = regionCode ? governingDesignationStart(regionCode, transferDate, regionInDesignatedDistrict) : null;
  const announcement = start ? PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES[start] : undefined;

  return (
    <ToneCard tone="rose" bodyClassName="space-y-2.5" title="조정대상지역 공고 전 매매계약" noDark>
      <p className="text-caption text-muted-foreground/80">
        조정대상지역 공고가 있은 날 이전에 이 주택을 양도하기 위한 매매계약을 체결하고 계약금을 받은 사실이
        증빙서류로 확인되면 중과가 배제됩니다 (소령 §167의10①11호 · §167의3①11호).
      </p>
      {announcement && start && (
        <p className="text-caption text-muted-foreground" data-testid="pre-designation-announcement">
          이 주택 소재지의 조정대상지역 공고일: <b>{dotted(announcement)}</b>
          {announcement !== start && ` (지정 효력 ${dotted(start)})`} — 계약일이 이날 이전(당일 포함)이어야 합니다
        </p>
      )}

      <ToggleCard
        variant="card"
        tone="rose"
        checked={v.saleDepositReceived ?? false}
        onCheckedChange={(b) =>
          onChange({
            ...v,
            saleDepositReceived: b,
            saleContractDate: b ? v.saleContractDate : undefined,
          })
        }
        title="양도 매매계약의 계약금을 받은 증빙이 있음"
        description="이 주택을 파는 매매계약 — 장기임대주택의 「계약금 지급 증빙」(취득 계약)과는 다른 사실입니다"
        data-testid="pre-designation-sale-deposit-toggle"
      >
        <div className="space-y-1 pt-1">
          <label className="block text-caption text-muted-foreground font-medium">양도 매매계약 체결일</label>
          <DateInput
            data-field="sellingHouseExclusion.saleContractDate"
            value={v.saleContractDate ?? ""}
            onChange={(s) => onChange({ ...v, saleContractDate: s || undefined })}
            data-testid="pre-designation-sale-contract-date"
          />
        </div>
      </ToggleCard>
    </ToneCard>
  );
}
