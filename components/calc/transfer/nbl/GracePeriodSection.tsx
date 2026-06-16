"use client";

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetForm, NblGracePeriodInput } from "@/lib/stores/calc-wizard-store";
import {
  GRACE_REASON_SPECS,
  resolveGraceIntervals,
} from "@/lib/tax-engine/non-business-land/grace-reason-period";

type ReasonCode = NblGracePeriodInput["reasonCode"];

// 사유 옵션 (시행령 §168의14① 1~3호 + 시행규칙 §83의5① 1~12호)
const GRACE_REASON_OPTIONS: { value: ReasonCode; label: string }[] = [
  { value: "use_prohibited", label: "법령상 사용 금지·제한 (영 §168의14①1호)" },
  { value: "protected_zone", label: "문화·자연유산 보호구역 (영 §168의14①2호)" },
  { value: "inherited_restricted", label: "사용제한 토지의 상속 (영 §168의14①3호)" },
  { value: "building_permit_restricted", label: "건축허가 제한 (규칙 §83의5①1호)" },
  { value: "construction_start_restricted", label: "착공 제한 (2호)" },
  { value: "access_road", label: "사도·진입도로 (3호)" },
  { value: "public_open_space", label: "공공공지 제공 (4호)" },
  { value: "construction_in_progress", label: "건설 착공 (5호)" },
  { value: "mortgage_or_liquidation", label: "저당권 실행·청산 분배 (6호)" },
  { value: "ownership_litigation", label: "소유권 소송 계속 (7호)" },
  { value: "urban_dev_buildable", label: "도시개발 환지 건축가능 (8호)" },
  { value: "demolition", label: "건축물 멸실·철거·붕괴 (9호)" },
  { value: "business_closure_relocation", label: "휴·폐업·이전 (10호)" },
  { value: "natural_disaster_wasteland", label: "천재지변 황지화 (11호)" },
  { value: "other_justifiable", label: "그 밖의 정당한 사유 (12호)" },
];

const toDate = (s: string | undefined): Date | undefined => {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
};
const fmt = (d: Date): string => d.toISOString().slice(0, 10);

export function GracePeriodSection({
  asset,
  onAssetChange,
  transferDate,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 5호 건설진행종료 미입력 시 미리보기 종료일(엔진과 동일) */
  transferDate?: string;
}) {
  const periods = asset.nblGracePeriods ?? [];
  const dealer = asset.nblBusinessIsRealEstateDealer ?? false;

  function addPeriod() {
    onAssetChange({
      nblGracePeriods: [
        ...periods,
        { reasonCode: "other_justifiable", anchorDate: "", endDate: "", description: "" },
      ],
    });
  }
  function removePeriod(idx: number) {
    onAssetChange({ nblGracePeriods: periods.filter((_, i) => i !== idx) });
  }
  function updatePeriod(idx: number, patch: Partial<NblGracePeriodInput>) {
    onAssetChange({
      nblGracePeriods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  // 자동 종료일 미리보기 — 엔진 단일소스(resolveGraceIntervals) 사용
  function autoEndPreview(p: NblGracePeriodInput): string | undefined {
    const intervals = resolveGraceIntervals(
      p.reasonCode,
      toDate(p.anchorDate),
      toDate(p.endDate),
      toDate(p.secondaryDate),
      {
        transferDate: toDate(transferDate) ?? new Date(),
        acquisitionDate: toDate(asset.acquisitionDate) ?? new Date(),
        isRealEstateDealerMatter: dealer,
      },
    );
    if (intervals.length === 0) return undefined;
    return intervals.map((iv) => `${fmt(iv.start)} ~ ${fmt(iv.end)}`).join(", ");
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="부득이한 사유 유예기간 (§168의14①·§83의5①)"
        description="해당 기간은 사업용 사용 기간에 가산됩니다. 종료일은 사유별 법정기간으로 자동 산정됩니다."
        action={<LawArticleModal legalBasis="소득세법 시행규칙 §83의5①" label="§83의5① 부득이 사유" />}
      />

      {/* §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) */}
      <ToggleCard
        tone="amber"
        title="부동산매매업 매매용부동산"
        description="건물건설업·부동산공급업자가 취득한 매매용부동산은 1호(건축허가 제한)·2호(착공 제한)가 가산되지 않습니다 (§83의5① 단서)."
        checked={dealer}
        onCheckedChange={(v) => onAssetChange({ nblBusinessIsRealEstateDealer: v })}
      />

      {periods.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">부득이한 사유가 없으면 비워두세요.</p>
      )}

      {periods.map((p, idx) => {
        const spec = GRACE_REASON_SPECS[p.reasonCode];
        const kind = spec?.lengthKind;
        const preview = autoEndPreview(p);
        const dealerBlocked = spec?.excludedForDealer && dealer;
        return (
          <div key={idx} className="rounded-lg border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300">유예기간 {idx + 1}</span>
              <button type="button" onClick={() => removePeriod(idx)} className="text-xs text-destructive hover:underline">삭제</button>
            </div>

            <FieldCard label="사유" trailing={spec && <LawArticleModal legalBasis={spec.legalBasis} label={spec.legalBasis.replace("소득세법 ", "")} />}>
              <Select value={p.reasonCode} onValueChange={(v) => v && updatePeriod(idx, { reasonCode: v as ReasonCode })}>
                <SelectTrigger>
                  <SelectValue>{GRACE_REASON_OPTIONS.find((o) => o.value === p.reasonCode)?.label ?? p.reasonCode}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRACE_REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldCard>

            {/* event_window / 4호: 개시일·종료일 입력 */}
            {(kind === "event_window" || kind === "anchor_to_input_end") && (
              <div className="grid grid-cols-2 gap-2">
                <FieldCard label={kind === "anchor_to_input_end" ? "착공일" : "개시일"}>
                  <DateInput value={p.anchorDate} onChange={(v) => updatePeriod(idx, { anchorDate: v })} />
                </FieldCard>
                <FieldCard label={kind === "anchor_to_input_end" ? "제공 종료일" : "종료일"}>
                  <DateInput value={p.endDate} onChange={(v) => updatePeriod(idx, { endDate: v })} />
                </FieldCard>
              </div>
            )}

            {/* fixed_from_anchor: 기산일 1개(6호는 취득일 자동) + 자동 종료일 표시 */}
            {kind === "fixed_from_anchor" && (
              <>
                {spec?.anchorFromAcquisition ? (
                  <p className="text-xs text-violet-700 dark:text-violet-300">기산일은 자산 취득일을 자동 사용합니다 (취득일 + {spec.fixedYears}년).</p>
                ) : (
                  <FieldCard label="기산일" hint={`이 날부터 ${spec?.fixedYears}년까지 가산`}>
                    <DateInput value={p.anchorDate} onChange={(v) => updatePeriod(idx, { anchorDate: v })} />
                  </FieldCard>
                )}
              </>
            )}

            {/* 5호: 취득일 안내 + 착공일 + 건설진행종료일(선택) */}
            {kind === "compound_5" && (
              <>
                <p className="text-xs text-violet-700 dark:text-violet-300">취득일부터 2년은 자산 취득일로 자동 가산됩니다. 착공일 이후 건설 진행 기간을 추가 입력하세요.</p>
                <div className="grid grid-cols-2 gap-2">
                  <FieldCard label="착공일">
                    <DateInput value={p.secondaryDate ?? ""} onChange={(v) => updatePeriod(idx, { secondaryDate: v })} />
                  </FieldCard>
                  <FieldCard label="건설진행 종료일" hint="미입력 시 양도일까지 진행 가정">
                    <DateInput value={p.endDate} onChange={(v) => updatePeriod(idx, { endDate: v })} />
                  </FieldCard>
                </div>
              </>
            )}

            {/* 자동 산정 결과 미리보기 */}
            {preview ? (
              <div className="rounded-md bg-violet-100/60 border border-violet-200 dark:bg-violet-950/40 dark:border-violet-800 px-3 py-2 text-xs text-violet-700 dark:text-violet-300" data-testid={`nbl-grace-auto-end-${idx}`}>
                가산 기간: {preview}
              </div>
            ) : dealerBlocked ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                매매업 매매용부동산이므로 이 사유(1·2호)는 가산되지 않습니다.
              </div>
            ) : null}

            <FieldCard label="설명" hint="간략한 사유 메모 (선택)">
              <input
                type="text"
                value={p.description}
                onChange={(e) => updatePeriod(idx, { description: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </FieldCard>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addPeriod}
        className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
      >
        + 유예기간 추가
      </button>
    </div>
  );
}
