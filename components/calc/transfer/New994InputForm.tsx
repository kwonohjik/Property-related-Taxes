"use client";

/**
 * §99의4 농어촌주택·고향주택 — 주택수 제외 입력 폼 (rural/hometown 공용)
 *
 * 효과: 농어촌주택등을 소유주택에서 제외하여 1세대1주택으로 보아 소법 §89①3호 적용
 *       (비과세·12억 안분·장기보유특별공제 표2). 다주택 중과 주택수에는 미반영(R-D).
 *
 * 다-섹션 색상 카드 + 번호: ① amber 취득 정보 ② sky 가액 요건 ③ rose 소재지·자격
 * + emerald 자동 표시 (useMemo 파생, store 미기록 — 적격 판정은 엔진 단일 진실).
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type New994Rural = Extract<AssetReductionForm, { type: "new_99_4_rural" }>;
type New994Hometown = Extract<AssetReductionForm, { type: "new_99_4_hometown" }>;
type New994Form = New994Rural | New994Hometown;

interface Props {
  value: New994Form;
  onChange: (patch: Partial<New994Hometown>) => void;
  /** 자산의 양도일 — 보유기간 미리보기·추징 경고 예고 */
  transferDate?: string;
}

function diffYears(from: string, to: string): number | null {
  if (!from || !to) return null;
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  return months < 0 ? null : Math.floor(months / 12);
}

export function New994InputForm({ value, onChange, transferDate }: Props) {
  const isHometown = value.type === "new_99_4_hometown";
  const houseLabel = isHometown ? "고향주택" : "농어촌주택";

  // emerald 자동 표시 — 보유기간 미리보기 (엔진 판정과 별개 참고용)
  const holdingYears = useMemo(
    () => diffYears(value.ruralHouseAcquisitionDate, transferDate ?? ""),
    [value.ruralHouseAcquisitionDate, transferDate],
  );

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 취득 정보 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-amber-700">{houseLabel} 취득 정보</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">{houseLabel} 취득일</label>
          <DateInput
            value={value.ruralHouseAcquisitionDate}
            onChange={(v) => onChange({ ruralHouseAcquisitionDate: v })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            취득기간 {isHometown ? "2009.1.1" : "2003.8.1"}~2028.12.31 — 일반주택(양도 주택)을 먼저
            취득한 후 취득한 {houseLabel}이어야 합니다 (§99의4①)
          </p>
        </div>
      </div>

      {/* ② 가액 요건 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-sky-700">가액 요건</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가 합계</label>
          <CurrencyInput
            label=""
            value={value.ruralHouseStdPrice}
            onChange={(v) => onChange({ ruralHouseStdPrice: v })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            주택과 부속토지 합계 — 3억 이하 (등록 한옥 4억) 요건 (§99의4①)
          </p>
        </div>
        <ToggleCard
          variant="chip"
          checked={value.isRegisteredHanok}
          onCheckedChange={(v) => onChange({ isRegisteredHanok: v })}
          title="등록 한옥"
          description="지자체 등록 한옥은 한도 4억 (령⑭)"
          tone="sky"
        />
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
          checked={value.meetsLocationRequirement}
          onCheckedChange={(v) => onChange({ meetsLocationRequirement: v })}
          title="소재지 요건 충족 확인"
          description={
            isHometown
              ? "인구 등 기준의 시 지역(별표12) 소재 + 수도권·조정대상지역·관광단지 아님 (§99의4①2호나목)"
              : "읍·면(또는 별표12 동) 소재 + 수도권·도시지역·조정대상지역·허가구역·관광단지 아님. 기회발전특구 소재 시 충족 (§99의4①1호가목)"
          }
          tone="rose"
        />
        <ToggleCard
          checked={value.isAdjacentArea}
          onCheckedChange={(v) => onChange({ isAdjacentArea: v })}
          title={isHometown ? "일반주택과 같은·연접 시" : "일반주택과 같은·연접 읍면동"}
          description={`해당되면(ON) 특례가 적용되지 않습니다 (§99의4③ — ${isHometown ? "같은 시·연접 시" : "같은 읍·면·동·연접"} 배제)`}
          tone="rose"
        />
        {value.type === "new_99_4_hometown" && (
          <ToggleCard
            checked={value.meetsHometownRequirement}
            onCheckedChange={(v) => onChange({ meetsHometownRequirement: v })}
            title="고향 요건 충족"
            description="가족관계등록부 등록기준지 10년 이상 또는 10년 이상 거주한 시 (령⑥)"
            tone="violet"
          />
        )}
      </div>

      {/* emerald 자동 표시 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{houseLabel} 보유기간 (취득일→양도일)</span>
          <span className="font-mono font-medium text-emerald-900">
            {holdingYears === null ? "—" : `${holdingYears}년`}
          </span>
        </div>
        {holdingYears !== null && holdingYears < 3 && (
          <p className="text-[10px] text-amber-700">
            ⚠ 보유 3년 미만 — 양도 후에도 특례는 적용되지만(④), 이후 {houseLabel}을 3년 이상
            보유하지 못하게 되면 줄어든 세액을 2개월 내 납부해야 합니다 (§99의4⑥)
          </p>
        )}
        <p className="text-[10px] text-emerald-700">
          ※ 적격 여부·1세대1주택 판정은 계산 시 엔진이 수행합니다. 다주택 중과 주택 수에는
          반영되지 않습니다.
        </p>
      </div>
    </div>
  );
}
