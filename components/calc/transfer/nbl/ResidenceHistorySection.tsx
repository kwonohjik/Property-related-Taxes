"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { SigunguSelect } from "./shared/SigunguSelect";
import { AddressSearch } from "@/components/ui/address-search";
import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";
import type { AssetForm, ResidenceHistoryInput } from "@/lib/stores/calc-wizard-store";

export interface ResidenceHistorySectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function ResidenceHistorySection({
  asset,
  onAssetChange,
}: ResidenceHistorySectionProps) {
  const histories = asset.nblResidenceHistories ?? [];

  function updateHistory(i: number, patch: Partial<ResidenceHistoryInput>) {
    const updated = histories.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
    onAssetChange({ nblResidenceHistories: updated });
  }

  function addHistory() {
    onAssetChange({
      nblResidenceHistories: [
        ...histories,
        { sigunguCode: "", sigunguName: "", startDate: "", endDate: "", hasResidentRegistration: false },
      ],
    });
  }

  function removeHistory(i: number) {
    onAssetChange({ nblResidenceHistories: histories.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="소유자 거주 이력"
        description="농지 자경·임야 재촌 판정에 사용됩니다."
      />

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
        임야의 경우 주민등록이 있어야 재촌이 인정됩니다.
      </div>

      {histories.length === 0 && (
        <p className="text-xs text-muted-foreground">등록된 거주 이력이 없습니다.</p>
      )}

      {histories.map((h, i) => (
        <div key={i} className="space-y-2 rounded-lg border px-4 py-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">거주지 {i + 1}</span>
            <button
              type="button"
              onClick={() => removeHistory(i)}
              className="text-xs text-destructive hover:text-destructive/80 px-2 py-1 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors"
            >
              삭제
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">시작일</label>
              <DateInput
                value={h.startDate}
                onChange={(v) => updateHistory(i, { startDate: v })}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">종료일</label>
              <DateInput
                value={h.endDate}
                onChange={(v) => updateHistory(i, { endDate: v })}
              />
            </div>
          </div>

          <FieldCard
            label="거주지 주소 검색"
            hint="주소 검색 시 시·군·구와 좌표가 자동 입력됩니다 (직선거리 30km 재촌 판정용, §153③3호)"
          >
            <div data-testid="nbl-residence-address-search">
              <AddressSearch
                value={{ road: "", jibun: "", building: "", detail: "", lng: h.lng ?? "", lat: h.lat ?? "" }}
                onChange={(v) => {
                  if (!v.pnu) return; // 주소 선택 시에만 반영
                  const code5 = v.pnu.slice(0, 5); // PNU 앞 5자리 = 시·군·구 (NBL 5자리계)
                  updateHistory(i, {
                    sigunguCode: code5,
                    sigunguName: lookupSigungu(code5)?.name ?? h.sigunguName,
                    lat: v.lat || undefined,
                    lng: v.lng || undefined,
                  });
                }}
              />
            </div>
          </FieldCard>

          <FieldCard label="시군구" hint="주소 검색이 어려운 경우 시·군·구를 직접 선택/입력하세요 (이 경우 30km 판정은 미적용)">
            <SigunguSelect
              code={h.sigunguCode}
              name={h.sigunguName}
              onChange={(c, n) => updateHistory(i, { sigunguCode: c, sigunguName: n })}
            />
          </FieldCard>

          <ToggleCard
            tone="violet"
            title="주민등록 있음"
            description="임야 재촌 인정 요건"
            checked={h.hasResidentRegistration}
            onCheckedChange={(v) => updateHistory(i, { hasResidentRegistration: v })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addHistory}
        className="text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors"
      >
        + 거주지 추가
      </button>

      {/* 거주지 이력 미입력 시 fallback — 거주지~토지 직선거리로 재촌 판정 */}
      {histories.length === 0 && (
        <FieldCard
          label="직선거리 (km)"
          hint="거주지 이력 미입력 시 대체 판정에 사용됩니다. (소득령 §168-8)"
          trailing={<LawArticleModal legalBasis="소득세법 시행령 §168의8" label="§168의8 농지" />}
        >
          <DecimalInput
            value={asset.nblFarmerResidenceDistance}
            onChange={(v) => onAssetChange({ nblFarmerResidenceDistance: v })}
          />
        </FieldCard>
      )}
    </div>
  );
}
