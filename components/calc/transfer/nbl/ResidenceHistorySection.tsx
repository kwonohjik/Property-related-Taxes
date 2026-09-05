"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { AddressSearch } from "@/components/ui/address-search";
import { extractSidoSigunguName } from "@/lib/calc/address-sigungu-name";
import type { AssetForm, ResidenceHistoryInput } from "@/lib/stores/calc-wizard-store";

export interface ResidenceHistorySectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /**
   * 지목 — 「직선거리(km)」 legacy fallback 칸의 노출 게이트.
   * 이 섹션 자체는 농지·임야에만 렌더된다(NblSectionContainer).
   */
  landType?: AssetForm["nblLandType"];
}

export function ResidenceHistorySection({
  asset,
  onAssetChange,
  landType,
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
                disableUnits
                value={{ road: "", jibun: "", building: "", detail: "", lng: h.lng ?? "", lat: h.lat ?? "" }}
                onChange={(v) => {
                  if (!v.pnu) return; // 주소 선택 시에만 반영
                  const code5 = v.pnu.slice(0, 5); // PNU 앞 5자리 = 시·군·구 (NBL 5자리계)
                  updateHistory(i, {
                    sigunguCode: code5,
                    // 표시 이름은 주소 문자열에서 파싱 — 시군구 코드 테이블 누락 시군구도 인식.
                    sigunguName: extractSidoSigunguName(v.jibun || v.road) || h.sigunguName,
                    lat: v.lat || undefined,
                    lng: v.lng || undefined,
                  });
                }}
              />
            </div>
            {h.sigunguName && (
              <p className="mt-1 text-xs text-emerald-700">
                시·군·구 <span className="font-medium">{h.sigunguName}</span> 자동 인식됨
              </p>
            )}
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

      {/*
        거주지 이력 미입력 시 fallback — 거주지~토지 직선거리로 재촌 판정.

        ⚠️ **농지 전용**이다 (2026-09-05). 영 §168의9②은 임야 재촌을 「… 지역에 **주민등록이
        되어 있고** 사실상 거주하는 자」로 정하는데, 거리 스냅샷 하나로는 주민등록 여부를 세울 수
        없다 — 그래서 `forest.ts`는 이 fallback을 의도적으로 쓰지 않는다(E1-04, 2026-09-02).
        종전에는 임야 화면에도 이 칸이 떠서 입력해도 판정에 반영되지 않았다.

        ✅ 임야에서도 **직선거리 30km 자체는 유효한 요건**이다 — 다만 그 판정은 위 거주 이력의
        소재지 매칭(`computeResidencePeriods`의 `distanceLimitKm`)이 수행한다. 이 칸이 아니다.
      */}
      {landType === "farmland" && histories.length === 0 && (
        <FieldCard
          label="직선거리 (km)"
          hint="거주지 이력 미입력 시 대체 판정에 사용됩니다. (소득령 §168의8)"
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
