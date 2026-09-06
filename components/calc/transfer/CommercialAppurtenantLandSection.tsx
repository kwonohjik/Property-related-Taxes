"use client";

/**
 * 상업용건물·오피스텔 — **부수토지 기준면적 초과분 비사업용 판정** 섹션 (rose)
 *
 * 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 →
 * 「지방세법 시행령」 §101①2호·§101②(적용배율표).
 *
 * ## GB 섹션과 다른 점 — **집합건물 전체** 면적을 받는다
 *
 * §101①2호의 "건축물의 바닥면적"은 집합건물에서 전체 1동을 뜻한다. 호(戶) 단위로 판정하면
 * 전유부분 면적을 바닥면적으로 바꿔 읽는 셈이라 문언에 반한다. 전체 기준으로 판정한 뒤 지분
 * 안분하는데, 그 지분율은 판정식의 분자·분모에 함께 걸려 **약분**되므로 결국
 * **전체 대지면적 : 전체 바닥면적 × 배율** 비교만 남는다.
 * (설계: `docs/02-design/features/commercial-building-appurtenant-land-nbl.plan.md` §2.3)
 *
 * ## 마운트 조건
 *
 * `assetKind === "commercial_building"`이면 **취득방법과 무관하게** 표시한다 —
 * 환산 전용인 `CommercialBuildingBlock`(상속 취득 시 미마운트)과 별개 섹션인 이유다.
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import { APPURTENANT_ZONE_OPTIONS } from "./appurtenant-zone-options";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function CommercialAppurtenantLandSection({ asset, onChange }: Props) {
  // 배율은 엔진 정본(§101② 표)에서 가져온다 — UI 재계산 금지.
  const zone = useMemo(
    () => (asset.cbZoneType ? getZoneAreaMultiplier(asset.cbZoneType) : undefined),
    [asset.cbZoneType],
  );

  const totalLand = parseDecimal(asset.cbTotalLandArea);
  const totalFootprint = parseDecimal(asset.cbTotalBuildingFootprintArea);
  const multiplier = zone?.multiplier;
  const allowedArea =
    totalFootprint > 0 && multiplier !== undefined ? totalFootprint * multiplier : null;
  const excessArea =
    allowedArea !== null && totalLand > 0 ? Math.max(0, totalLand - allowedArea) : null;
  const excessRatio =
    excessArea !== null && totalLand > 0 ? (excessArea / totalLand) * 100 : null;

  return (
    <ToneCard
      tone="rose"
      title="부수토지 비사업용 판정"
      titleExtra={
        <span className="text-micro text-rose-500">(§104의3①4호나목 · 지방세령 §101)</span>
      }
      noDark
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 §104의3" label="§104의3 비사업용" />
        <LawArticleModal legalBasis="지방세법 시행령 §101" label="지방세령 §101 배율" />
      </div>
      <p className="text-caption text-rose-600">
        부수토지 한도 = <strong>건축물 바닥면적</strong> × 용도지역 배율. 초과분에만 +10%p 중과.
        구분소유는 <strong>집합건물 전체</strong> 기준으로 판정하며, 대지권 지분율은 판정식에서
        약분되어 결과에 영향을 주지 않습니다.
      </p>

      {/* §101① 단서 — 배율 무관 전량 비사업용 (무허가 신축 + 불법 용도변경, 해석례 25-0823) */}
      <ToggleCard
        tone="rose"
        variant="chip"
        title="허가·사용승인 미이행 건축물"
        description="건축허가·사용승인을 받지 않았거나, 용도변경 허가·사용승인 없이 용도를 바꿔 사용 중인 건축물. 부속토지가 재산세 별도합산에서 제외되어 토지 전체가 비사업용 (배율 계산 없음)"
        checked={asset.cbUnapprovedBuilding}
        onCheckedChange={(v) => onChange({ cbUnapprovedBuilding: v })}
      />

      {/*
        🔴 두 면적은 **단서 ON/OFF와 무관하게 항상 렌더**한다 (2026-09-06 UI 리뷰).
        종전에는 「허가·사용승인 미이행」을 켜는 순간 이 두 칸이 렌더에서 빠졌고, 토글이 칸보다
        위에 있어 사용자는 대개 먼저 켰다. 그러면 두 면적이 빈 채로 남아 ④
        `buildCommercialAppurtenantLand`가 **payload 전체를 `undefined`로 버리고**
        (`transfer-tax-api-commercial.ts:32`) 함께 실려야 할 `unapprovedBuilding: true`까지
        사라져, 화면은 「부속토지 전체 비사업용」이라 확언하는데 §104의3 +10%p 중과가
        **전혀 적용되지 않았다**(세액 과소·경고 없음).
        단서 ON에서도 엔진은 `nonBusinessArea = landArea - 0`으로 면적을 쓴다
        (`appurtenant-land-excess.ts:98`) — 즉 면적은 이 분기에서도 필수다.
        배율만 불필요하므로 **용도지역과 배율 배지만** 숨긴다.
      */}
      <FieldCard
        label="집합건물 전체 대지면적"
        hint="건축물대장 총괄표제부의 대지면적. 위 환산 입력의 대지면적(해당 호 지분)과 다른 값입니다."
        unit="㎡"
      >
        <DecimalInput
          value={asset.cbTotalLandArea}
          onChange={(v) => onChange({ cbTotalLandArea: v })}
          placeholder="집합건물 전체 대지면적"
          unit="㎡"
        />
      </FieldCard>

      <FieldCard
        label="집합건물 전체 바닥면적"
        hint="각 층 중 최대 바닥면적(지하 포함). 연면적·건축면적이 아닙니다."
        unit="㎡"
      >
        <DecimalInput
          value={asset.cbTotalBuildingFootprintArea}
          onChange={(v) => onChange({ cbTotalBuildingFootprintArea: v })}
          placeholder="각 층 중 최대 바닥면적"
          unit="㎡"
        />
      </FieldCard>

      {asset.cbUnapprovedBuilding ? (
        <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          허가·사용승인 미이행 — 부속토지 전체 비사업용 (배율 계산 없음)
          <span className="mt-1 block text-caption text-rose-600">
            「지방세법 시행령」 §101① 단서 · 법제처 법령해석례 25-0823
          </span>
        </div>
      ) : (
        <>
          <FieldCard
            label="용도지역 (필수)"
            hint="국토계획법상 용도지역. 미선택 시 계산이 진행되지 않습니다."
          >
            <RadioCardGroup
              name="cbZoneType"
              layout="inline"
              value={asset.cbZoneType}
              onChange={(v) => onChange({ cbZoneType: v })}
              options={APPURTENANT_ZONE_OPTIONS}
            />
          </FieldCard>
          <ReferenceSiteLinks className="-mt-1" sites={[REFERENCE_SITES.landUsePlan]} />

          {zone && (
            <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-800 space-y-0.5">
              <p>
                적용 배율: <span className="font-semibold">{zone.detail}</span>
              </p>
              {totalFootprint > 0 && allowedArea !== null && (
                <p>
                  인정 한도: 바닥면적 {totalFootprint}㎡ × {multiplier}배 ={" "}
                  <span className="font-semibold tabular-nums">{allowedArea.toFixed(2)} ㎡</span>
                </p>
              )}
              {excessArea !== null && excessRatio !== null && (
                excessArea === 0 ? (
                  <p className="text-emerald-700 font-semibold">→ 사업용 (중과 미발동)</p>
                ) : (
                  <p className="text-rose-700 font-semibold">
                    → 초과분 <span className="tabular-nums">{excessArea.toFixed(2)}</span>㎡ 비사업용
                    (전체의 <span className="tabular-nums">{excessRatio.toFixed(1)}</span>% — 이 비율만큼 +10%p 중과)
                  </p>
                )
              )}
            </div>
          )}
        </>
      )}
    </ToneCard>
  );
}
