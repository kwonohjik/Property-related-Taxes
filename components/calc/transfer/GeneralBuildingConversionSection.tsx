"use client";

/**
 * 자산 카드 ① 기본정보 — **주택 → 상가 용도변경** 섹션 (fuchsia)
 *
 * 렌더 지점은 `asset-sections/AssetAreaSection.tsx` 하나뿐이다.
 * ③ 취득정보(`GeneralBuildingBlock`)에서 이전했다(2026-08-11) — 취득 사실이 아니라
 * **보유 중의 용도 변화**를 묻는 입력이라, 같은 성격인 비사업용토지 판정과 함께 옮겼다.
 *
 * 사례 35(사전법규재산 2022-684·881 · 서울행법 2012구단26961): 다주택 상태에서 용도변경하면
 * 변경일 이전 보유기간이 장기보유특별공제에서 배제된다(「소득세법」 제95조 제2항 표1).
 * 후속-1: 「양도소득세 집행기준」 99-164-10 환산주택가격.
 *
 * `GeneralBuildingBlock`에서 분리했다(2026-08-04 P4 — 배치 런처 추가로 836줄 초과).
 * 두 미리보기 useMemo도 이 섹션 전용이라 함께 옮겼다.
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import {
  isMultiHouseLthdExclusionEra,
  MULTI_HOUSE_LTHD_EXCLUSION_LIFTED,
  MULTI_HOUSE_LTHD_EXCLUSION_RESTORED,
} from "@/lib/tax-engine/data/lthd-multi-house-exclusion-era";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 용도변경 보유기간 미리보기에 사용 */
  transferDate?: string;
}

export function GeneralBuildingConversionSection({ asset, onChange, transferDate }: Props) {
  /**
   * 용도변경 시점의 「소득세법」 §95② 괄호가 다주택을 LTHD에서 **배제할 수 있었는가**.
   *
   * 2012.1.1~2018.3.31 용도변경분은 그 괄호에 다주택이 없어 배제 자산이 될 수 없다
   * (사전-2024-법규재산-0161). 이 구간에서는 「예(중과 대상)」를 골라도 기산일이 취득일이므로
   * **묻는 것 자체가 오해를 만든다** ⇒ 라디오를 비활성화하고 사유를 표시한다.
   * 엔진(`resolveLTHDStartDate`)이 같은 leaf로 같은 판정을 하므로 화면과 세액이 갈리지 않는다.
   *
   * ❌ **validate(⑧)에는 이 게이트를 걸지 않는다** — 의도된 설계다.
   *    저장된 값이 `true`인 채로 가능기 날짜가 들어와도 **세액은 항상 정확**하고(엔진이 같은 leaf로
   *    흡수) 미리보기도 취득일을 보여준다(anchor ERA-4). 여기서 차단하면 구형 sessionStorage를 든
   *    기존 사용자가 **아무것도 못 하게 막히는** 회귀가 된다([[feedback_blocking_validation_full_e2e_regression]]).
   *    값을 자동으로 지우는 것도 금지다 — `useEffect → store` 미러링이 된다.
   */
  const exclusionEra = useMemo(() => {
    if (!asset.gbConversionDate) return null;
    const d = new Date(asset.gbConversionDate);
    if (Number.isNaN(d.getTime())) return null;
    return isMultiHouseLthdExclusionEra(d);
  }, [asset.gbConversionDate]);

  /**
   * 사례 35: 주택→상가 용도변경 미리보기 — 보유기간 기산일 + 표1 공제율 안내.
   * useMemo 순수 — useEffect 미러링 금지 정책 준수.
   */
  const conversionPreview = useMemo(() => {
    if (!asset.gbHouseToCommercialConversion) return null;
    if (!asset.gbConversionDate || !transferDate) return null;
    if (asset.gbWasMultiHouseAtConversion === null) return null; // 미선택 시 표시 보류
    // 「소득세법」 제95조 제4항 본문 — 보유기간은 **그 자산의** 취득일부터다. 토지·건물은
    // 제94조 제1항 제1호가 각각 자산으로 드는 별개 자산이므로 기산일도 파트별이다(계획서 §3.6).
    // 미리보기 연수는 **이른 쪽**(=공제가 큰 쪽)이 아니라 건물 기준으로 잡는다 — 용도변경 대상이
    // 건물이고, 토지 기산일은 아래 label에 병기해 사용자가 두 값을 모두 본다.
    // ⚠️ 「다주택이었나」만으로 기산일을 정하면 2012~2018 용도변경분이 틀린다(0161).
    //    엔진과 같은 술어를 써야 화면 표시와 세액이 갈리지 않는다.
    const startShifts = asset.gbWasMultiHouseAtConversion && exclusionEra === true;
    const startISO = startShifts ? asset.gbConversionDate : asset.acquisitionDate;
    if (!startISO) return null;
    const start = new Date(startISO);
    const end = new Date(transferDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    // 만 보유연수 (초일불산입 — 민법 §157, calculateHoldingPeriod 동일 로직)
    const startPlusOne = new Date(start);
    startPlusOne.setDate(startPlusOne.getDate() + 1);
    let years = end.getFullYear() - startPlusOne.getFullYear();
    const m = end.getMonth() - startPlusOne.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < startPlusOne.getDate())) years -= 1;
    years = Math.max(0, years);
    const isUnder3Years = years < 3;
    const rate = isUnder3Years ? 0 : Math.min(years * 2, 30);
    return {
      isUnder3Years,
      years,
      label: startShifts
        ? `보유기간 기산일 = 용도변경일 (${asset.gbConversionDate}) — 토지·건물 공통`
        : asset.gbWasMultiHouseAtConversion
          ? `보유기간 기산일 = 당초 취득일 (${asset.acquisitionDate}) — 용도변경일이 ${MULTI_HOUSE_LTHD_EXCLUSION_LIFTED}~${MULTI_HOUSE_LTHD_EXCLUSION_RESTORED} 사이라 그 시기 §95② 괄호에 다주택이 없었습니다`
          : asset.hasSeperateLandAcquisitionDate
            ? `보유기간 기산일 — 토지 ${asset.landAcquisitionDate} / 건물 ${asset.acquisitionDate} (자산별 §95④)`
            : `보유기간 기산일 = 당초 취득일 (${asset.acquisitionDate})`,
      notice: isUnder3Years
        ? `보유기간 ${years}년 → 3년 미만 — 장기보유특별공제 0% (§95② 표1)`
        : `보유기간 ${years}년 → §95② 표1 ${rate}% (연 2%, 최대 30%)`,
    };
  }, [
    asset.gbHouseToCommercialConversion,
    asset.gbConversionDate,
    asset.gbWasMultiHouseAtConversion,
    asset.acquisitionDate,
    asset.landAcquisitionDate,
    asset.hasSeperateLandAcquisitionDate,
    exclusionEra,
    transferDate,
  ]);

  /* 🔀 §99-164-10 환산주택가격 미리보기 useMemo도 ③ 취득정보로 함께 옮겼다 (2026-08-13).
        그 산식의 분자(취득당시 토지·건물 기준시가)가 저쪽 ①②의 입력이라, 값과 미리보기가
        같은 화면에 있어야 사용자가 어긋남을 바로 본다. → `GeneralBuildingBlock.tsx` */

  return (
    <>
        {/* ⑦ 주택→상가 용도변경 (fuchsia) — 사례 35 (사전법규재산 2022-684·881) */}
        <ToggleCard
          tone="fuchsia"
          variant="card"
          title="주택 → 상가 용도변경"
          description="주택 전체를 근린생활시설 등 비주택으로 용도변경한 경우 ON. 용도변경 당시 그 주택이 장기보유특별공제 대상에서 제외되는 중과 주택이었다면 변경일 이전 보유기간을 세지 않습니다."
          checked={asset.gbHouseToCommercialConversion}
          onCheckedChange={(v) => onChange({ gbHouseToCommercialConversion: v })}
          trailing={
            <PrecedentArticleModal
              citation="사전법규재산 2022-684"
              label="근거"
              kind="ruling"
              summary={
                "1세대가 조정대상지역에 2주택을 보유한 상태에서 「소득세법」 제104조제7항제1호에 따른 양도소득세가 중과되는 1주택을\n근린생활시설로 용도변경하여 사용하다 이를 양도하는 경우, 같은 법 제95조제2항의 장기보유특별공제액을 계산함에 있어\n보유기간은 근린생활시설로 용도변경한 날을 기산일로 하여 계산하는 것입니다.\n\n관련: 사전법규재산 2022-881 (2022.12.28) — 동일 취지(0684를 인용)\n\n※ 판정 축은 「다주택이었나」가 아니라 「용도변경 당시 장기보유특별공제 배제 자산이었나」입니다.\n   사전-2024-법규재산-0161 (2024.05.03) — 「용도변경일 당시 장기보유특별공제가 적용되는 주택」을\n   상가로 용도변경한 경우 기산일은 그 건물의 당초 취득일로 한다(용도변경 당시 다주택이었더라도 동일).\n   같은 예규 각주: 2012.1.1.~2018.3.31.까지는 다주택자의 주택 양도에도 장기보유특별공제가 가능했다."
              }
            />
          }
        >
          <FieldCard
            label="용도변경일"
            hint="건축물대장 용도변경 처리 완료일. 취득일 이후, 양도일 이전이어야 합니다."
          >
            <DateInput
              value={asset.gbConversionDate}
              onChange={(v) => onChange({ gbConversionDate: v })}
            />
          </FieldCard>

          <FieldCard
            label="용도변경 당시 그 주택이 장기보유특별공제 대상에서 제외되는 중과 주택이었습니까?"
            hint={
              exclusionEra === false
                ? `용도변경일이 ${MULTI_HOUSE_LTHD_EXCLUSION_LIFTED}~${MULTI_HOUSE_LTHD_EXCLUSION_RESTORED} 사이입니다. 그 시기 §95② 괄호는 다주택 주택을 배제하지 않았으므로 배제 자산일 수 없습니다 — 기산일은 당초 취득일입니다 (사전-2024-법규재산-0161).`
                : "「소득세법」 §95② 괄호는 §104⑦ 각 호(조정대상지역 다주택 등) 자산을 장기보유특별공제에서 제외합니다. '예'이면 변경일 이전 보유기간을 세지 않습니다 (사전법규재산 2022-684·881)."
            }
            trailing={<LawArticleModal legalBasis="소득세법 §95②" label="§95② 표1 장특공제" />}
          >
            <RadioCardGroup
              name="gbWasMultiHouseAtConversion"
              layout="inline"
              value={
                asset.gbWasMultiHouseAtConversion === null
                  ? ""
                  : String(asset.gbWasMultiHouseAtConversion)
              }
              onChange={(v) => onChange({ gbWasMultiHouseAtConversion: v === "true" })}
              options={[
                {
                  value: "true",
                  label: "예 (배제 자산)",
                  description: "변경일 이전 보유기간 제외 — 기산일 = 용도변경일",
                  // 배제될 수 없던 시기의 용도변경이면 이 선택지 자체가 성립하지 않는다.
                  disabled: exclusionEra === false,
                },
                { value: "false", label: "아니오", description: "당초 취득일 기산 — 변경일 무영향" },
              ]}
            />
          </FieldCard>

          {/* 미리보기 카드 — useMemo 순수 */}
          {conversionPreview && (
            <div
              className={
                "rounded border px-3 py-2 text-xs " +
                (conversionPreview.isUnder3Years
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-emerald-50 border-emerald-300 text-emerald-800")
              }
            >
              <p className="font-semibold">{conversionPreview.label}</p>
              <p className="mt-1">{conversionPreview.notice}</p>
            </div>
          )}

          {/*
            🔀 **§99-164-10 환산주택가격 블록은 ③ 취득정보로 이전했다** (2026-08-13 · 사용자 요청).

            이유는 두 가지다:
             1. **입력이 흩어져 있었다.** 최초공시 당시 토지·건물 기준시가는 ③ 취득정보의
                「① 토지 공시지가」·「② 건물 기준시가」가 받는 취득시·양도시 값과 **같은 축의
                다른 시점**이다. 두 화면에 나뉘어 있어 사용자가 ①↔③을 오가야 했다.
             2. **취득 사실이다.** 환산취득가 산정 방법이므로 취득정보가 제 자리다. 반면 이
                카드가 계속 받는 용도변경일·배제자산 여부는 **보유 중의 용도 상태**라 ①에 남는다.

            이전 후 그쪽은 「토지 3시점 · 최초고시 개별주택가격 · 건물 3시점」으로 통합됐고,
            건물기준시가 일괄 계산도 2시점 → 3시점으로 넓어졌다.
            ⇒ `components/calc/transfer/GeneralBuildingBlock.tsx` · 계획서
              `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md`
            ⚠️ 여기로 되돌리지 말 것.
          */}
          {asset.useEstimatedAcquisition && (
            <ToneCard tone="violet" noDark className="p-2.5">
              <p className="text-caption text-violet-800">
                취득 당시 주택으로 개별주택가격이 고시된 뒤 상가로 바꾼 경우의{" "}
                <b>환산주택가격(§99-164-10)</b> 입력은 <b>③ 취득정보</b>의 일반건물 영역에 있습니다.
              </p>
            </ToneCard>
          )}
        </ToggleCard>
    </>
  );
}
