"use client";

/**
 * §98의9 수도권 밖 준공후미분양주택 — 주택수 제외 입력 폼
 *
 * 효과: 준공후미분양주택을 소유주택에서 제외하여 1세대1주택으로 보아 소법 §89①3호 적용
 *       (비과세·12억 안분·장기보유특별공제 표2). 중과 주택수 미반영(R-D)·종부세 ②는 별도 신청 안내.
 *
 * ① sky 취득 정보 ② sky 가액·면적 (CurrencyInput·DecimalInput) ③ rose 소재지·자격 (토글 3종)
 * + emerald 안내 (보유 요건 없음·종부세 별도 신청). 적격 판정은 엔진 단일 진실.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold989Form = Extract<AssetReductionForm, { type: "unsold_98_9" }>;

interface Props {
  value: Unsold989Form;
  onChange: (patch: Partial<Unsold989Form>) => void;
}

export function Unsold989InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 취득 정보 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-sky-700">준공후미분양주택 취득 정보</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">준공후미분양주택 취득일</label>
          <DateInput
            value={value.unsoldHouseAcquisitionDate}
            onChange={(v) => onChange({ unsoldHouseAcquisitionDate: v })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            취득기간 2024.1.10~2026.12.31 — 종전주택(양도 주택)을 먼저 취득한 후 취득하고,
            취득한 후에 종전주택을 양도해야 합니다 (§98의9①)
          </p>
        </div>
      </div>

      {/* ② 가액·면적 요건 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-sky-700">가액·면적 요건</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득가액</label>
          <CurrencyInput
            label=""
            value={value.unsoldHouseAcquisitionPrice}
            onChange={(v) => onChange({ unsoldHouseAcquisitionPrice: v })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            실제 취득가액 — 7억 이하 (조특령 §98의8①2호. 기준시가 아님)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">전용면적</label>
          <DecimalInput
            value={value.unsoldHouseExclusiveArea}
            onChange={(v) => onChange({ unsoldHouseExclusiveArea: v })}
            unit="㎡"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            전용면적 85㎡ 이하 (조특령 §98의8①1호)
          </p>
        </div>
      </div>

      {/* ③ 소재지·자격 */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">
            ③
          </span>
          <p className="text-xs font-semibold text-rose-700">소재지·자격 요건</p>
        </div>
        <ToggleCard
          checked={value.isNonCapitalRegion}
          onCheckedChange={(v) => onChange({ isNonCapitalRegion: v })}
          title="수도권 밖 소재"
          description="준공후미분양주택이 수도권 밖의 지역에 소재 (§98의9①1호)"
          tone="rose"
        />
        <ToggleCard
          checked={value.wasOneHouseholdAtAcquisition}
          onCheckedChange={(v) => onChange({ wasOneHouseholdAtAcquisition: v })}
          title="취득 당시 1세대 1주택"
          description="준공후미분양주택 취득 당시 세대가 1주택만 보유 (§98의9① 본문)"
          tone="violet"
        />
        <ToggleCard
          checked={value.meetsSellerAndContractRequirement}
          onCheckedChange={(v) => onChange({ meetsSellerAndContractRequirement: v })}
          title="양도자 자격·최초계약·선착순 확인"
          description="사업주체·분양사업자·시공자로부터 최초 매매계약 + 사용검사 후 선착순 공급분 + 시장·군수·구청장 확인 날인 매매계약서 보유 (조특령 §98의8①3~5호·②)"
          tone="rose"
        />
      </div>

      {/* emerald 안내 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">안내 (참고용, 저장 안 됨)</p>
        <p className="text-[10px] text-emerald-700">
          ※ 준공후미분양주택의 의무 보유기간·추징 규정은 없습니다. 적격 여부·1세대1주택 판정은
          계산 시 엔진이 수행하며, 다주택 중과 주택 수에는 반영되지 않습니다.
        </p>
        <p className="text-[10px] text-emerald-700">
          ※ 종합부동산세 1세대 1주택자 특례(§98의9②)는 본 계산기에 반영되지 않습니다 — 해당 연도
          9월 16일~30일에 관할 세무서장에게 별도 신청 (조특령 §98의8④)
        </p>
      </div>
    </div>
  );
}
