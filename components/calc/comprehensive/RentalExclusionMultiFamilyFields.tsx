"use client";

/**
 * 종부령 §3①1호·2호 — 지자체 임대사업자 등록일 칸 + 2020.2.11. 전 세무서에만 등록한 다가구 토글(T-14 · 부칙<제30404호> 제6조).
 * 토글은 지자체 등록일 칸 바로 앞(모드 토글은 영향 필드 직전). 켜면 지자체 등록일 칸을 숨기고 전환 질문·구별 공시가격 행을 보인다.
 * 보이는 조건은 `deemedMultiFamilyApplies`(⑧ 차단·④ 전송과 같은 술어) · 토글 노출은 `asksDeemedMultiFamilyToggle`.
 * 토글 상태 변화는 `onCheckedChange` 한 곳에서만 쓴다(useEffect → store 미러링 금지).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-multifamily-deemed.plan.md §3.3
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { YesNoField } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import { DateInput } from "@/components/ui/date-input";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { asksDeemedMultiFamilyToggle } from "@/lib/calc/comprehensive-rental-multifamily";
import { deemedMultiFamilyApplies } from "@/lib/calc/comprehensive-rental-multifamily";
import { suggestsMultiFamilyInputFirst } from "@/lib/calc/comprehensive-rental-multifamily";

export function RentalExclusionMultiFamilyFields({
  property,
  registrationType,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const asksToggle = asksDeemedMultiFamilyToggle(registrationType, property);
  const suggestsFirst = suggestsMultiFamilyInputFirst(registrationType, property);
  const deemed = deemedMultiFamilyApplies(registrationType, property);
  const updateUnitValue = (idx: number, v: string) =>
    onUpdate({ floorUnits: property.floorUnits.map((u, i) => (i === idx ? { ...u, officialValue: v } : u)) });

  return (
    <>
      {asksToggle && (
        <ToggleCard
          tone="violet"
          title="2020.2.11. 전 세무서에만 등록한 다가구"
          description="지자체 임대사업자 등록 없이 세무서에 주택임대업 사업자등록만 한 다가구주택 — 켜면 세무서 등록일과 구별(1구=1호) 공시가격으로 판정합니다 (부칙<대통령령 제30404호> 제6조)"
          checked={property.deemedMultiFamily}
          onCheckedChange={(v) => onUpdate({ deemedMultiFamily: v })}
          data-testid="comprehensive-deemed-multifamily-toggle"
        >
          <div className="space-y-3" data-testid="comprehensive-deemed-multifamily-body">
            <div className="space-y-1">
              <YesNoField
                label="2020.2.11. 전부터 본인이 계속 임대해 왔다"
                name="comprehensive-deemed-no-conversion"
                value={property.deemedNoConversionAfterCutoff}
                onChange={(v) => onUpdate({ deemedNoConversionAfterCutoff: v })}
                yes="예"
                no="아니오"
              />
              {/* V-3·V-4(2026-11-18 원문 확인): 기획재정부 재산세제과-142(상속 승계 불가) · 서면-2018-부동산-3783(계속 임대하는 기간까지) · 서면-2023-법규재산-0462(전환 호실 불가) */}
              <p className="text-xs text-muted-foreground" data-testid="comprehensive-deemed-continuity-hint">
                2020.2.11. 이후 상속·증여·매매로 이 다가구를 취득했거나, 거주하던 호실을 임대로 바꿨거나, 폐업해 임대를 그만둔 적이 있으면 「아니오」 — 종전 규정을 적용할 수 없습니다(상속인은 민간임대주택법 등록 필요 · 기획재정부 재산세제과-142).
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                구별 공시가격 <span className="text-destructive">*</span>
              </p>
              <p className="text-xs text-muted-foreground">
                임대개시일 또는 처음 합산배제신고를 한 해 과세기준일 기준 그 구의 공시가격 — 확인 필요. 구(행)는 주택 편집 › 고급 옵션의 층별(구별) 면적 입력에서 추가·삭제합니다.
              </p>
              {/* V-1·V-2(2026-11-18 원문 확인): 종부세 산정 방법 정면 해석 없음 — 양도세 재산세과-3053 · 주택법 시행규칙 §2 1호 단서 · 서면인터넷방문상담4팀-2222 */}
              <p className="text-xs text-muted-foreground" data-testid="comprehensive-deemed-unit-basis-hint">
                구별 공시가격을 정한 종부세 해석은 없습니다. 양도세 해석(재산세과-3053)은 개별주택가격에 다가구주택 면적 중 그 구 면적(공유지분 포함)이 차지하는 비율을 곱해 계산합니다. 구별 면적은 주거전용면적 — 지상층 복도·계단·현관 등 2세대 이상이 함께 쓰는 부분은 뺍니다(주택법 시행규칙 §2 1호). 공부와 실제가 다르면 관할 시장·군수 확인이 필요합니다.
              </p>
              {property.floorUnits.map((unit, idx) => {
                const name = unit.label.trim() || `구분${idx + 1}`;
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-2" data-testid={`comprehensive-deemed-unit-${idx}`}>
                    <span className="w-40 shrink-0 text-sm">
                      {name} <span className="text-xs text-muted-foreground">{unit.area || "0"}㎡</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <CurrencyInput
                        label={`${name} 공시가격`}
                        hideLabel
                        value={unit.officialValue ?? ""}
                        onChange={(v) => updateUnitValue(idx, v)}
                        data-testid={`comprehensive-deemed-unit-value-${idx}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ToggleCard>
      )}
      {!deemed && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            임대사업자 등록일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={property.rentalRegistrationDate}
            onChange={(v) => onUpdate({ rentalRegistrationDate: v })}
          />
          <p className="text-xs text-muted-foreground">
            지방자치단체 임대사업자 등록증의 등록일(신청일 아님)
          </p>
          {suggestsFirst ? (
            <p className="text-xs text-muted-foreground" data-testid="comprehensive-deemed-needs-multifamily">
              2020.2.11. 전에 세무서에만 등록한 다가구주택이면 주택 편집 › 고급 옵션에서 층별(구별) 면적 입력을 먼저 켜세요.
            </p>
          ) : (
            !asksToggle && (
              <p className="text-xs text-muted-foreground">
                2020.2.11. 전에 세무서에만 주택임대업으로 등록한 다가구주택은 지자체 등록 없이도 합산배제될 수 있지만 이 계산기는 판정하지 못합니다(확인 필요).
              </p>
            )
          )}
        </div>
      )}
    </>
  );
}
