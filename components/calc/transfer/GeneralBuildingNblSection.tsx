"use client";

/**
 * 자산 카드 ① 기본정보 — **비사업용토지 판정** 섹션 (rose)
 *
 * 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호 →
 * 「지방세법 시행령」 제101조 제1항 제2호·제2항(적용배율표).
 *
 * `GeneralBuildingBlock`에서 분리했다(2026-08-04 P4 — 배치 런처 추가로 836줄 초과).
 * 배율·인정한도 파생값도 함께 옮겼다(이 섹션 전용).
 *
 * ## ③ 취득정보 → ① 기본정보 이전 (2026-08-11)
 *
 * 렌더 지점은 `asset-sections/AssetAreaSection.tsx`(「면적·규모」 카드 바로 아래) 하나뿐이다.
 *  - 이 카드는 취득 사실이 아니라 **보유 중의 토지 이용 상태**를 묻는다.
 *  - ③은 기본 접힘인데(`CompanionAssetCard.tsx` open 초기값 `{1:true}`) `gbZoneType`은
 *    미선택 시 계산을 차단하는 **필수** 필드다 — 접힌 섹션에 숨은 필수 입력이었다.
 *  - 한도 미리보기가 읽는 `gbBuildingFootprintArea`·`gbLandArea`의 입력 칸이 바로 위에 있다.
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { getBuildingSiteMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

// 용도지역 선택지는 CB(상업용건물) 섹션과 공유한다 — `appurtenant-zone-options.ts`.
import { APPURTENANT_ZONE_OPTIONS } from "./appurtenant-zone-options";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function GeneralBuildingNblSection({ asset, onChange }: Props) {
  // 자동 배율 표시 — 엔진 함수 재사용 (UI 재계산 금지)
  const zoneMultiplier = useMemo(
    () =>
      asset.gbZoneType
        ? getBuildingSiteMultiplier(asset.gbZoneType as ZoneType)
        : undefined,
    [asset.gbZoneType],
  );

  // 인정 한도 미리 계산 (바닥면적 × 배율)
  const footprint = parseDecimal(asset.gbBuildingFootprintArea);
  const landArea = parseDecimal(asset.gbLandArea);
  const multiplierNum = zoneMultiplier?.multiplier;
  const allowedArea =
    footprint > 0 && multiplierNum !== undefined ? footprint * multiplierNum : null;
  return (
    <>
        {/* 비사업용토지 판정 (rose) — 항상 표시.
            번호배지 없음: ① 기본정보의 형제 카드(「면적·규모」)와 동일하게 제목형이다.
            종전 `sectionNum="③"`은 GeneralBuildingBlock 안에서의 순번이었고,
            ①로 옮긴 뒤에는 ③(취득정보)를 가리키는 것으로 오독된다. */}
        <ToneCard
          tone="rose"
          title="비사업용토지 판정"
          titleExtra={
            <span className="text-micro text-rose-500">
              (§104의3①4호나목 · 지방세령 §101)
            </span>
          }
          noDark
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3" label="§104의3 비사업용" />
            <LawArticleModal legalBasis="지방세법 시행령 §101" label="지방세령 §101 배율" />
          </div>
          <p className="text-caption text-rose-600">
            부수토지 한도 = <strong>건축물 바닥면적</strong>(각 층 중 최대, 지하 포함) × 용도지역 배율.
            초과분에만 +10%p 중과.
          </p>

          {/* §101① 단서 — 배율 무관 전체 NBL. 무허가 신축뿐 아니라 불법 용도변경도 포함(해석례 25-0823) */}
          <ToggleCard
            tone="rose"
            variant="chip"
            title="허가·사용승인 미이행 건축물"
            description="건축허가·사용승인을 받지 않았거나, 용도변경 허가·사용승인 없이 용도를 바꿔 사용 중인 건축물. 부속토지가 재산세 별도합산에서 제외되어 토지 전체가 비사업용 (배율 계산 없음)"
            checked={asset.gbUnapprovedBuilding}
            onCheckedChange={(v) => onChange({ gbUnapprovedBuilding: v })}
          />
          {asset.gbUnapprovedBuilding && (
            <div className="flex flex-wrap items-center gap-1.5">
              <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
              <LawArticleModal legalBasis="지방세법 시행령 §101 ① 단서" label="지방세법시행령 §101①단서" />
            </div>
          )}

          {!asset.gbUnapprovedBuilding && (
            <>
              {/* 용도지역 */}
              <FieldCard
                label="용도지역 (필수)"
                hint="국토계획법상 용도지역. 미선택 시 계산이 진행되지 않습니다."
              >
                <RadioCardGroup
                  name="gbZoneType"
                  layout="inline"
                  value={asset.gbZoneType}
                  onChange={(v) => onChange({ gbZoneType: v })}
                  options={APPURTENANT_ZONE_OPTIONS}
                />
              </FieldCard>
              <ReferenceSiteLinks className="-mt-1" sites={[REFERENCE_SITES.landUsePlan]} />

              {/* 수도권 토글 폐지 (2026-07-30) — 「지방세법 시행령」 제101조 제2항에는
                  수도권 축이 없다. 종전에는 「소득세법 시행령」 제168조의12(주택 부수토지)
                  배율을 잘못 적용해 수도권 여부가 배율을 바꿨다. */}

              {/* 배율·인정한도 자동 표시 */}
              {zoneMultiplier && (
                <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-800 space-y-0.5">
                  <p>적용 배율: <span className="font-semibold">{zoneMultiplier.detail}</span></p>
                  {footprint > 0 && allowedArea !== null && (
                    <p>인정 한도: 바닥면적 {footprint}㎡ × {multiplierNum}배 = <span className="font-semibold tabular-nums">{allowedArea.toFixed(2)} ㎡</span></p>
                  )}
                  {footprint > 0 && landArea > 0 && allowedArea !== null && (
                    landArea <= allowedArea
                      ? <p className="text-emerald-700 font-semibold">→ 사업용 (중과 미발동)</p>
                      : <p className="text-rose-700 font-semibold">→ 초과분 {(landArea - allowedArea).toFixed(2)}㎡ 비사업용 (중과)</p>
                  )}
                </div>
              )}
            </>
          )}

          {asset.gbUnapprovedBuilding && (
            <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              무허가건축물 — 토지 전체 비사업용 (배율 계산 없음)
            </div>
          )}
        </ToneCard>
    </>
  );
}
