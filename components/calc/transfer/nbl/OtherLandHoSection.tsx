"use client";

/**
 * 기타토지 §168의11① 호 선택 블록 — `OtherLandDetailSection.tsx`에서 분리 (NBL2611-V7-S · R18).
 * 호 목록·라벨·설명·근거 모달은 엔진 `other-land-ho-meta.ts` 표 하나에서 만든다(UI 옵션·UI 근거를 따로 두지 않는다).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { OtherLandSportsSection } from "./OtherLandSportsSection";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { effectiveOtherHasBuildingOf } from "@/lib/calc/nbl-other-state-history-scope";
import { judgeHoRequirements } from "@/lib/tax-engine/non-business-land/other-land-ho-requirements";
import { OTHER_LAND_HO_IDS, OTHER_LAND_HO_META, type OtherLandHoMeta } from "@/lib/tax-engine/non-business-land/other-land-ho-meta";
import type { NblRelatedBusinessType, ZoneType } from "@/lib/tax-engine/non-business-land/types";

export interface OtherLandHoSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

// §168의11① 호별 분기 옵션 — 호 메타 표에서 만든다(조문 순서). 수입금액비율(2호다·10·11다·12호)은 `OtherLandDetailSection`의 별도 섹션.
const RELATED_BUSINESS_OPTIONS: RadioCardOption<NblRelatedBusinessType>[] = OTHER_LAND_HO_IDS.map((id) => ({
  value: id,
  label: OTHER_LAND_HO_META[id].option.label,
  description: OTHER_LAND_HO_META[id].option.description,
  testId: OTHER_LAND_HO_META[id].option.testId,
}));

const RESERVE_SIZE_OPTIONS = [
  { value: "le800", label: "중대·대대 (800명 이하)" },
  { value: "le2400", label: "대대·연대 (801~2,400명)" },
  { value: "le5000", label: "연대 (2,401~5,000명)" },
  { value: "gt5000", label: "여단 (5,001명 이상)" },
] as const;
const RESERVE_SIZE_LABEL: Record<string, string> = Object.fromEntries(RESERVE_SIZE_OPTIONS.map((o) => [o.value, o.label]));

const RESERVE_FAC_OPTIONS = [
  { value: "tactical", label: "전술교육장" },
  { value: "shooting_prep", label: "사격술예비훈련장" },
  { value: "range", label: "사격장" },
  { value: "basic", label: "기초훈련장" },
] as const;

export function OtherLandHoSection({ asset, onAssetChange }: OtherLandHoSectionProps) {
  const relatedType = asset.nblOtherRelatedBusinessType;
  const meta: OtherLandHoMeta | undefined = relatedType ? OTHER_LAND_HO_META[relatedType] : undefined;
  const areaBasis = meta?.law;
  const reserveSizeLabel: string = RESERVE_SIZE_LABEL[asset.nblOtherReserveUnitSize] ?? "선택 안 함 (직접입력)";
  // NBL2611-V7-DM02·V9-DM11·V7-S — 호의 면적 외 요건(5호 나목 용도지역 · 13호 나지 · 14호 위임 부령)도 엔진 술어를 그대로 쓴다.
  //    3호는 면적 외 요건 불인정 사유가 없고(조성 완료일은 날짜 칸이 따로 막는다) 엔진 함수가 날짜 부재를 던지므로 부르지 않는다.
  const hoFail =
    relatedType === "private_investment_land"
      ? undefined
      : judgeHoRequirements(relatedType || undefined, { hasBuilding: effectiveOtherHasBuildingOf(asset) }, asset.nblZoneType as ZoneType).failStep;
  // 면적기준·전용 입력 칸이 없는 호(1호 다·라 · 8 · 9 · 11호 가·나) — 요건 고지를 선택 즉시 보인다. 3호는 조성 완료일 칸이 따로 있고 고지는 결과에 남는다.
  const selfDeclaredHo = meta && meta.verification === "self_declared" ? meta : undefined;

  return (
    <>
      {/* §168의11① 호별 면적기준 정밀판정 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">§168의11① 거주·사업관련 토지 (호별 면적기준)</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11①" />
        </div>
        {/* NBL2611-Q-10 (나) — 구 이력의 「거주·사업 직접 관련」은 복원 시 꺼지고(호 없이 사업용으로 읽던 fallback 폐지) 호를 다시 골라야 한다. */}
        {asset.nblOtherLegacyRelatedReselect && (
          <ToneCard tone="amber" title="호를 다시 선택하세요 — 확인 필요">
            <p data-testid="nbl-other-legacy-related-notice" className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
              저장된 이력에 「거주·사업 직접 관련」이 켜져 있었지만 §168의11① 어느 호인지 기록이 없어 이제 판정에 반영하지 않습니다(호를 모르면 혜택을 인정하지 않습니다).
              해당하는 호를 아래에서 선택하면 그 호의 기준면적으로 판정합니다.
            </p>
          </ToneCard>
        )}
        <RadioCardGroup
          name={`nblOtherRelatedBusinessType-${asset.assetId ?? "primary"}`}
          tone="sky"
          options={RELATED_BUSINESS_OPTIONS}
          value={asset.nblOtherRelatedBusinessType}
          onChange={(v) => onAssetChange({ nblOtherRelatedBusinessType: v, nblOtherLegacyRelatedReselect: false })}
        />

        {/* NBL2611-V7-DM02·V9-DM11 — 엔진이 호를 인정하지 않는 사실(5호 나목 용도지역 · 13호 나지)을 판정 전에 알린다. 문구는 엔진 단계 사유 그대로. */}
        {hoFail && (
          <ToneCard tone="amber" title="이 호는 인정되지 않습니다">
            <p data-testid="nbl-other-ho-fail-notice" className="text-xs text-amber-800 dark:text-amber-200 leading-snug">{hoFail.detail}</p>
          </ToneCard>
        )}

        {/* NBL2611-V7-S — 3호: 조성 완료일부터 2년 구간만 사업용 기간(영 §168의11①3호 단서). 호 메타 표 `requiredInput`과 같은 칸 */}
        {relatedType === "private_investment_land" && (
          <FieldCard
            field="nblOtherPrivateInvestCompletionDate"
            label="토지 조성 완료일"
            hint="조성이 완료된 날부터 2년이 경과한 토지는 3호에서 제외됩니다 — 완료일부터 2년 구간만 사업용 기간으로 셉니다. 사업시행자·조성 근거 요건은 판정하지 않습니다(확인 필요)."
            trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}
          >
            <DateInput value={asset.nblOtherPrivateInvestCompletionDate} onChange={(v) => onAssetChange({ nblOtherPrivateInvestCompletionDate: v })} />
          </FieldCard>
        )}

        {/* NBL2611-V7-S · Q-6 (다) — 면적기준 없는 호: 엔진이 판정하지 않는 요건을 선택 즉시 알린다(결과에도 «확인 필요»로 남는다) */}
        {selfDeclaredHo && (
          <div
            data-testid="nbl-other-self-declared-notice"
            className="rounded-md bg-sky-100/60 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 px-3 py-2 text-xs text-sky-700 dark:text-sky-300 leading-snug"
          >
            면적기준이 없는 호입니다 — 선택하면 전량을 사업용으로 보되 호의 요건은 판정하지 않고 결과에 「확인 필요」로 남깁니다. {selfDeclaredHo.selfDeclaredNotice}
          </div>
        )}

        {/* parking_attached — 기준면적 직접입력 (별표 자동산출 미지원) */}
        {relatedType === "parking_attached" && (
          <FieldCard
            field="nblOtherStandardAreaLimit"
            label="기준면적 (㎡)"
            unit="㎡"
            hint="「주차장법」 부설주차장 설치기준면적. 이 면적까지 사업용, 초과분 비사업용"
            trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}
          >
            <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
          </FieldCard>
        )}

        {/* F2 Phase B(B-3) — resort: 6호 휴양 §83의4⑫ 3요소 합산 */}
        {relatedType === "resort" && (
          <>
            <FieldCard field="nblOtherResortOutdoorArea" label="옥외 방목장·식물원 면적 (㎡)" unit="㎡" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
              <DecimalInput value={asset.nblOtherResortOutdoorArea} onChange={(v) => onAssetChange({ nblOtherResortOutdoorArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortParkingStdArea" label="부설주차장 설치기준면적 (㎡)" unit="㎡" hint="§83의4⑫2호 — 「주차장법」 설치기준면적. 그 2배가 인정 상한입니다(상한 자체가 면적은 아닙니다).">
              <DecimalInput value={asset.nblOtherResortParkingStdArea} onChange={(v) => onAssetChange({ nblOtherResortParkingStdArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortParkingActualArea" label="실제 부설주차장용 토지 면적 (㎡)" unit="㎡" hint="설치기준면적을 입력했으면 필수. 인정 면적 = 실제 면적과 설치기준면적 × 2 중 작은 값.">
              <DecimalInput value={asset.nblOtherResortParkingActualArea} onChange={(v) => onAssetChange({ nblOtherResortParkingActualArea: v })} />
            </FieldCard>
            <FieldCard label="건축물 바닥면적 (㎡)" unit="㎡" hint="§83의4⑫3호 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②)이 인정 상한입니다. 미매핑 용도지역(세분 전 주거지역 등)은 상한을 계산할 수 없어 아래 면적을 그대로 씁니다.">
              <DecimalInput value={asset.nblOtherResortBuildingFloorArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingFloorArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortBuildingArea" label="실제 건축물 부속토지 면적 (㎡)" unit="㎡" hint="바닥면적을 입력했으면 필수. 인정 면적 = 실제 면적과 바닥면적 × 배율 중 작은 값. 배율 미매핑 용도지역이면 상한 이내로 확정한 면적을 입력하세요.">
              <DecimalInput value={asset.nblOtherResortBuildingArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingArea: v })} />
            </FieldCard>
            {/*
              U2-02 (2026-09-02 코드리뷰) — 종전 조건은 `nblOtherResortBuildingFloorArea`를
              빠뜨린 3요소였다. 그래서 **바닥면적만 입력한 사용자**에게 직접입력 칸이 계속
              보였고, 거기 넣은 값은 엔진이 무시했다(3요소가 우선). ⑧ validate(:28)는 처음부터
              바닥면적을 포함한 4요소로 판정하고 있었으므로 **UI↔validate가 서로 반대**였다.
              ⇒ 게이트를 validate와 동일한 요소로 맞춘다(NBL2611-V9-DM09로 실제 부설주차장 면적이 늘어 5요소).
            */}
            {!(
              asset.nblOtherResortOutdoorArea ||
              asset.nblOtherResortParkingStdArea ||
              asset.nblOtherResortParkingActualArea ||
              asset.nblOtherResortBuildingArea ||
              asset.nblOtherResortBuildingFloorArea
            ) && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡" hint="위 3요소(옥외방목장·부설주차장·건축물)를 하나도 입력하지 않은 경우에만 사용합니다. 3요소 중 하나라도 입력하면 그 값이 우선하며 이 칸은 쓰이지 않습니다.">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {/* F2 Phase B — sports: 체육시설 유형(별표3/4/5) — 800줄 정책으로 분리 */}
        {relatedType === "sports" && <OtherLandSportsSection asset={asset} onAssetChange={onAssetChange} />}

        {/* F2 Phase A — reserve_forces: 별표6 부대규모·시설 자동 합산, 미선택 시 직접입력 */}
        {relatedType === "reserve_forces" && (
          <>
            <FieldCard field="nblOtherReserveUnitSize" label="부대편성인원 (별표6)" hint="부대규모·시설 선택 시 기준면적 자동 합산. 미선택 시 아래 직접입력." trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
              <Select
                value={asset.nblOtherReserveUnitSize || "__clear"}
                onValueChange={(v) => onAssetChange({ nblOtherReserveUnitSize: v && v !== "__clear" ? v : "" })}
              >
                <SelectTrigger><SelectValue>{reserveSizeLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear">선택 안 함 (직접입력)</SelectItem>
                  {RESERVE_SIZE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldCard>
            {asset.nblOtherReserveUnitSize && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">포함 시설 (전술교육장에서 실시 불가 시에만 포함)</p>
                {RESERVE_FAC_OPTIONS.map((f) => (
                  <div key={f.value} data-testid={`nbl-other-reserve-fac-${f.value}`}>
                    <ToggleCard
                      variant="chip"
                      tone="sky"
                      title={f.label}
                      checked={asset.nblOtherReserveFacilities?.includes(f.value) ?? false}
                      onCheckedChange={(c) => {
                        const cur = asset.nblOtherReserveFacilities ?? [];
                        onAssetChange({ nblOtherReserveFacilities: c ? [...cur, f.value] : cur.filter((x) => x !== f.value) });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {!(asset.nblOtherReserveUnitSize && (asset.nblOtherReserveFacilities?.length ?? 0) > 0) && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {relatedType === "hatchang" && (
          <FieldCard field="nblOtherMaxAnnualArea" label="매년 최대 사용면적 (㎡)" unit="㎡" hint="이 면적의 120%까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMaxAnnualArea} onChange={(v) => onAssetChange({ nblOtherMaxAnnualArea: v })} />
          </FieldCard>
        )}

        {relatedType === "youth_training" && (
          <FieldCard field="nblOtherYouthCapacity" label="수용정원 (명)" unit="명" hint="수용정원 × 200㎡까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherYouthCapacity} onChange={(v) => onAssetChange({ nblOtherYouthCapacity: v })} />
          </FieldCard>
        )}

        {relatedType === "parking_garage" && (
          <FieldCard field="nblOtherMinGarageArea" label="최저차고기준면적 (㎡)" unit="㎡" hint="최저차고기준면적 × 1.5까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMinGarageArea} onChange={(v) => onAssetChange({ nblOtherMinGarageArea: v })} />
          </FieldCard>
        )}

        {relatedType === "vacant_lot_1household" && (
          <div className="rounded-md bg-sky-100/60 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            무주택1세대 1필지 나지는 660㎡ 이내까지 사업용으로 보며, 초과분은 비사업용입니다 (별도 면적 입력 불필요).
          </div>
        )}
      </div>
    </>
  );
}
