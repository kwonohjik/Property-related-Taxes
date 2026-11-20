"use client";

/**
 * 기타토지 §168의11①1호 체육시설 입력 — `OtherLandDetailSection.tsx`에서 분리(800줄 정책).
 *
 * NBL2611-V7-F — 실내 바닥면적·실내 미설치·선수 수 칸은 엔진(`resolveAreaLimit`)이 그 입력을 읽는 조건과 같은 술어
 * (`consumedSportsInputs`)로 그린다. 주종목만 보지 않는다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseDecimal } from "@/lib/calc/number-parse";
import { consumedSportsInputs } from "@/lib/tax-engine/non-business-land/sports-input-consumption";

// F2 Phase A/B — 체육시설 종목(실외 11 + 실내 3). 유형별 기준면적(별표3 직장 / 별표4 운동경기업)은 자동 산출 — 라벨은 종목명만.
const SPORTS_FACILITY_OPTIONS = [
  { value: "soccer", label: "축구장" },
  { value: "baseball", label: "야구장" },
  { value: "rugby", label: "럭비장" },
  { value: "field_hockey", label: "필드하키장" },
  { value: "tennis", label: "테니스장" },
  { value: "soft_tennis", label: "연식정구장" },
  { value: "american_football", label: "미식축구장" },
  { value: "equestrian", label: "승마장" },
  { value: "shooting", label: "사격장" },
  { value: "archery", label: "궁도장" },
  { value: "other_outdoor", label: "기타 실외" },
  { value: "ball_court", label: "실내 구기·격투·체조 등" },
  { value: "swimming", label: "수영·수구·다이빙" },
  { value: "ice_rink", label: "아이스하키·피겨·롤러" },
] as const;
const SPORTS_FACILITY_LABEL: Record<string, string> = Object.fromEntries(SPORTS_FACILITY_OPTIONS.map((o) => [o.value, o.label]));

// F2 Phase B — 체육시설 유형(별표3 직장운동경기부 / 별표4 운동경기업 / 별표5 종업원)
const SPORTS_CATEGORY_OPTIONS: RadioCardOption<"workplace" | "business" | "employee">[] = [
  { value: "workplace", label: "직장운동경기부 (별표3)", description: "선수전용 — §83의4①", testId: "nbl-other-sports-category-workplace" },
  { value: "business", label: "운동경기업 (별표4)", description: "선수전용 — §83의4③", testId: "nbl-other-sports-category-business" },
  { value: "employee", label: "종업원 (별표5)", description: "종업원수 기준 — §83의4④", testId: "nbl-other-sports-category-employee" },
];
const EMPLOYEE_FACILITY_OPTIONS = [
  { value: "field", label: "운동장" },
  { value: "court", label: "코트" },
  { value: "indoor", label: "실내체육시설" },
] as const;
const SPORTS_CATEGORY_BASIS: Record<string, { legalBasis: string; label: string }> = {
  workplace: { legalBasis: "소득세법 시행규칙 §83의4①", label: "§83의4①(별표3)" },
  business: { legalBasis: "소득세법 시행규칙 §83의4③", label: "§83의4③(별표4)" },
  employee: { legalBasis: "소득세법 시행규칙 §83의4④", label: "§83의4④(별표5)" },
};

export interface OtherLandSportsSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function OtherLandSportsSection({ asset, onAssetChange }: OtherLandSportsSectionProps) {
  const sportsFacilityLabel: string = SPORTS_FACILITY_LABEL[asset.nblOtherSportsFacilityType] ?? "선택 안 함 (직접입력)";
  const sportsCategory = (asset.nblOtherSportsCategory || "workplace") as "workplace" | "business" | "employee";
  const sportsBasis = SPORTS_CATEGORY_BASIS[sportsCategory];
  // NBL2611-V7-F — 실내 바닥면적·실내 미설치·선수 수 칸은 엔진이 그 입력을 읽는 조건과 같은 술어로 그린다(주종목만 보지 않는다).
  const sportsConsume = consumedSportsInputs({
    category: sportsCategory,
    mainEvent: asset.nblOtherSportsFacilityType,
    extraEvents: asset.nblOtherSportsExtraEvents,
    indoorNotInstalled: asset.nblOtherIndoorNotInstalled,
    employeeCount: parseDecimal(asset.nblOtherEmployeeCount),
    employeeFacilityKinds: asset.nblOtherEmployeeFacilityKinds,
  });

  return (
    <>
        <FieldCard label="체육시설 유형">
          <RadioCardGroup
            name={`nblOtherSportsCategory-${asset.assetId ?? "primary"}`}
            tone="sky"
            layout="inline"
            options={SPORTS_CATEGORY_OPTIONS}
            value={sportsCategory}
            onChange={(v) => onAssetChange({ nblOtherSportsCategory: v })}
          />
        </FieldCard>

        {/* workplace(별표3) · business(별표4) — 종목 선택 */}
        {sportsCategory !== "employee" && (
          <>
            <FieldCard field="nblOtherSportsFacilityType" label="체육시설 종목" hint="유형(직장 별표3 / 운동경기업 별표4)에 따라 기준면적 자동 산출. 미선택 시 아래 직접입력." trailing={sportsBasis && <LawArticleModal legalBasis={sportsBasis.legalBasis} label={sportsBasis.label} />}>
              <Select
                value={asset.nblOtherSportsFacilityType || "__clear"}
                onValueChange={(v) => onAssetChange({ nblOtherSportsFacilityType: v && v !== "__clear" ? v : "" })}
              >
                <SelectTrigger><SelectValue>{sportsFacilityLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear">선택 안 함 (직접입력)</SelectItem>
                  {SPORTS_FACILITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldCard>
            {/* B-2 종목합산 — 추가 보유 종목(각 면적 합산, 5종목군은 그 중 1개만) */}
            {asset.nblOtherSportsFacilityType && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">추가 보유 종목 (각 면적 합산 — 축구·야구·럭비·필드하키·미식축구는 그 중 가장 넓은 1개만)</p>
                <div className="flex flex-wrap gap-1.5">
                  {SPORTS_FACILITY_OPTIONS.filter((o) => o.value !== asset.nblOtherSportsFacilityType).map((o) => (
                    <div key={o.value} data-testid={`nbl-other-sports-extra-${o.value}`}>
                      <ToggleCard
                        variant="chip"
                        tone="sky"
                        title={o.label}
                        checked={asset.nblOtherSportsExtraEvents?.includes(o.value) ?? false}
                        onCheckedChange={(c) => {
                          const cur = asset.nblOtherSportsExtraEvents ?? [];
                          onAssetChange({ nblOtherSportsExtraEvents: c ? [...cur, o.value] : cur.filter((x) => x !== o.value) });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* B-2 선수가산 — 테니스·연식정구 */}
            {sportsConsume.playerCount && (
              <FieldCard label="선수 수 (명)" unit="명" hint={`2인 초과 시 2인마다 ${sportsCategory === "business" ? "725" : "483"}㎡ 가산 (별표 비고)`}>
                <DecimalInput value={asset.nblOtherSportsPlayerCount} onChange={(v) => onAssetChange({ nblOtherSportsPlayerCount: v })} />
              </FieldCard>
            )}
            {/* B-2 실내 부속토지 — 실내 종목 바닥면적 × 배율 (비고1·3) */}
            {sportsConsume.indoorFloorArea && (
              <FieldCard label="실내 시설 바닥면적 (㎡)" unit="㎡" hint="별표 비고1·3 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②) 자동 산출. 미입력 시 표값 기준면적 적용.">
                <DecimalInput value={asset.nblOtherIndoorFloorArea} onChange={(v) => onAssetChange({ nblOtherIndoorFloorArea: v })} />
              </FieldCard>
            )}
            {/* B-2 실내 미설치 — workplace 실내 종목 (별표3 비고4) */}
            {sportsConsume.indoorNotInstalled && (
              <div data-testid="nbl-other-indoor-not-installed">
                <ToggleCard
                  variant="card"
                  tone="amber"
                  title="실내체육시설 미설치"
                  description="실내 운동경기부가 실내체육시설을 설치하지 않은 경우 → 800㎡ (별표3 비고4)"
                  checked={asset.nblOtherIndoorNotInstalled}
                  onCheckedChange={(c) => onAssetChange({ nblOtherIndoorNotInstalled: c })}
                />
              </div>
            )}
            {!asset.nblOtherSportsFacilityType && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {/* employee(별표5) — 종업원수 + 보유 시설 다중 */}
        {sportsCategory === "employee" && (
          <>
            <FieldCard field="nblOtherEmployeeCount" label="종업원 수 (명)" unit="명" hint="별표5 종업원수 구간 기준면적 자동 산출(50인 이하는 코트면적만). 미입력 시 아래 직접입력." trailing={sportsBasis && <LawArticleModal legalBasis={sportsBasis.legalBasis} label={sportsBasis.label} />}>
              <DecimalInput value={asset.nblOtherEmployeeCount} onChange={(v) => onAssetChange({ nblOtherEmployeeCount: v })} />
            </FieldCard>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">보유 시설 (다중 — 각 기준면적 합산)</p>
              {EMPLOYEE_FACILITY_OPTIONS.map((f) => (
                <div key={f.value} data-testid={`nbl-other-employee-kind-${f.value}`}>
                  <ToggleCard
                    variant="chip"
                    tone="sky"
                    title={f.label}
                    checked={asset.nblOtherEmployeeFacilityKinds?.includes(f.value) ?? false}
                    onCheckedChange={(c) => {
                      const cur = asset.nblOtherEmployeeFacilityKinds ?? [];
                      onAssetChange({ nblOtherEmployeeFacilityKinds: c ? [...cur, f.value] : cur.filter((x) => x !== f.value) });
                    }}
                  />
                </div>
              ))}
            </div>
            {/* 별표5 비고3·4 — 종업원 50인 초과 + 실내체육시설 보유 시 바닥면적 × 용도지역 배율(엔진이 읽는 조건과 같은 술어) */}
            {sportsConsume.indoorFloorArea && (
              <FieldCard label="실내 시설 바닥면적 (㎡)" unit="㎡" hint="별표5 비고3·4 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②) 자동 산출. 미입력 시 표값 기준면적 적용.">
                <DecimalInput value={asset.nblOtherIndoorFloorArea} onChange={(v) => onAssetChange({ nblOtherIndoorFloorArea: v })} />
              </FieldCard>
            )}
            {!(asset.nblOtherEmployeeCount && (asset.nblOtherEmployeeFacilityKinds?.length ?? 0) > 0) && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}
    </>
  );
}
