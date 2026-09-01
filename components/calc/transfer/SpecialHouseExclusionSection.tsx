"use client";

/**
 * P5 모드 2 — 보유 감면주택 주택수 제외 입력 섹션 (Step4 보유 상황, 2026-06-12)
 *
 * 7개 조문 ②항(§98의2~§98의8·§99의2) + §98 령②·⑥ + §99② — 감면주택 보유 중 다른 주택
 * 양도 시 §89①3호 적용에서 감면주택을 소유주택으로 보지 않음.
 * 비과세 판정 주택수만 제외 — 다주택 중과세율 주택수는 불변.
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

const ARTICLE_OPTIONS: Array<{ value: SpecialHouseExclusionFormItem["article"]; label: string }> = [
  { value: "unsold_98", label: "§98 미분양 국민주택 (취득 1995.11.1~1997.12.31 / 1998.3.1~12.31)" },
  { value: "unsold_98_2", label: "§98의2 지방 미분양주택 (취득 2008.11.3~2010.12.31)" },
  { value: "unsold_98_3", label: "§98의3 미분양주택 (취득 2009.2.12~2010.2.11)" },
  { value: "unsold_98_5", label: "§98의5 수도권 밖 미분양주택 (계약 ~2011.4.30)" },
  { value: "unsold_98_6", label: "§98의6 준공후미분양주택 (취득기간 제한 없음)" },
  { value: "unsold_98_7", label: "§98의7 미분양주택 9억 이하 (계약 2012.9.24~12.31)" },
  { value: "unsold_98_8", label: "§98의8 준공후미분양주택 (계약 2015.1.1~12.31)" },
  { value: "unsold_99_2", label: "§99의2 신축주택등 (계약 2013.4.1~12.31)" },
  { value: "new_99", label: "§99 신축주택 IMF 1차 (1998.5.22~1999.6.30 · 국민주택 ~1999.12.31)" },
  { value: "new_99_3", label: "§99의3 신축주택 IMF 2차 (2001.5.23~2003.6.30)" },
];

/** 취득기간을 매매계약일만으로 판정하는 조문 (엔진 `basis: "contract_only"`와 단일 축) */
const CONTRACT_ONLY_ARTICLES: ReadonlyArray<SpecialHouseExclusionFormItem["article"]> = [
  "unsold_98_8",
  "unsold_99_2",
];

interface Props {
  items: SpecialHouseExclusionFormItem[];
  onChange: (items: SpecialHouseExclusionFormItem[]) => void;
}

export function SpecialHouseExclusionSection({ items, onChange }: Props) {
  const enabled = items.length > 0;

  function updateRow(idx: number, patch: Partial<SpecialHouseExclusionFormItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <ToggleCard
      tone="violet"
      title="조특법 감면주택 보유 — 주택 수 제외 (§89①3호 의제)"
      description="§98 시리즈·§99·§99의2 감면주택을 보유 중 다른 주택을 양도하는 경우, 1세대1주택 비과세 판정 주택 수에서 감면주택을 제외합니다. 다주택 중과세율 주택 수는 변하지 않습니다."
      trailing={<LawArticleModal legalBasis="소득세법 §89①3호" label="§89①3호 비과세" />}
      checked={enabled}
      onCheckedChange={(on) =>
        onChange(
          on
            ? [{
              article: "",
              houseAcquisitionDate: "",
              houseContractDate: "",
              isNationalHousing: false,
              requirementsConfirmed: false,
            }]
            : [],
        )
      }
    >
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-violet-700">보유 감면주택 {idx + 1}</p>
              <button
                type="button"
                className="text-caption text-rose-600 hover:underline"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
              >
                삭제
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">적용 조문</label>
              <Select
                value={it.article || undefined}
                onValueChange={(v) => updateRow(idx, { article: v as SpecialHouseExclusionFormItem["article"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="조문 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(it.article === "new_99" || it.article === "new_99_3") && (
                <p className="mt-1 text-micro text-rose-600">
                  {it.article === "new_99" ? "§99②" : "§99의3②"}는 다른 주택을 2007.12.31까지
                  양도하는 경우에만 적용됩니다 — 그 이후 양도분은 주택 수 제외가 적용되지 않습니다.
                </p>
              )}
              {it.article === "unsold_98_6" && (
                <p className="mt-1 text-micro text-emerald-700">
                  §98의6①의 기한은 <b>임대계약 체결일</b>(1호는 사업주체등이 2011.12.31까지, 2호는
                  본인이 2011.12.31 이전)이고 매수자의 취득일·매매계약일에는 기한이 없습니다 — 아래
                  일자는 참고용으로만 기록됩니다.
                </p>
              )}
              {CONTRACT_ONLY_ARTICLES.includes(it.article) && (
                <p className="mt-1 text-micro text-amber-700">
                  이 조문은 <b>최초 매매계약일</b>만을 기준으로 취득기간을 판정합니다 — 취득일이
                  기간 안이어도 계약일이 밖이면 적용되지 않습니다.
                </p>
              )}
              {it.article === "unsold_98_3" && (
                <p className="mt-1 text-micro text-amber-700">
                  비거주자는 2009.3.16~2010.2.11 취득(계약)분만 해당합니다 — 2009.2.12~3.15 취득분은
                  거주자에게만 적용됩니다 (조특법 §98의3①). 아래 요건 확인 토글은 본인 거주 구분에 따른
                  취득기간 충족을 포함해 확인한 것으로 간주됩니다.
                </p>
              )}
            </div>
            {it.article === "new_99" && (
              <ToggleCard
                tone="violet"
                title="국민주택 (전용 85㎡ 이하 · 수도권 밖 읍·면 100㎡ 이하)"
                description="국민주택이면 신축주택취득기간의 종기가 1999.6.30에서 1999.12.31로 연장됩니다 (조특법 §99①1호 괄호)"
                checked={it.isNationalHousing}
                onCheckedChange={(v) => updateRow(idx, { isNationalHousing: v })}
              />
            )}
            <div>
              <label className="mb-1 block text-xs font-medium">감면주택 취득일</label>
              <DateInput
                value={it.houseAcquisitionDate}
                onChange={(v) => updateRow(idx, { houseAcquisitionDate: v })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">감면주택 매매계약일 (선택)</label>
              <DateInput
                value={it.houseContractDate}
                onChange={(v) => updateRow(idx, { houseContractDate: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">
                {CONTRACT_ONLY_ARTICLES.includes(it.article)
                  ? "이 조문은 매매계약일이 판정 기준입니다 — 반드시 입력하세요"
                  : "취득일이 취득기간 외라도 시한 내 매매계약 + 계약금 납부분은 포함됩니다"}
              </p>
            </div>
            <ToggleCard
              tone="violet"
              title="해당 조문 본 요건 충족 확인"
              description="미분양 확인·최초계약·가액·면적 등 본 요건 충족 — 상세 판정은 그 감면주택을 양도할 때 감면 입력으로 검증됩니다"
              checked={it.requirementsConfirmed}
              onCheckedChange={(v) => updateRow(idx, { requirementsConfirmed: v })}
            />
          </div>
        ))}
        <button
          type="button"
          className="w-full rounded-md border border-dashed border-violet-300 bg-violet-50/60 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100"
          onClick={() =>
            onChange([
              ...items,
              {
              article: "",
              houseAcquisitionDate: "",
              houseContractDate: "",
              isNationalHousing: false,
              requirementsConfirmed: false,
            },
            ])
          }
        >
          + 보유 감면주택 추가
        </button>
      </div>
    </ToggleCard>
  );
}
