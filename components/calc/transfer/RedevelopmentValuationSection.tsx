"use client";

/**
 * RedevelopmentValuationSection — 재개발 환산취득가 입력 (§166③ + §164⑦ PHD 패턴)
 *
 * 분리 사유: RedevelopmentBlock 800줄 정책 (사례 46 추가 대비, 2026-05-14).
 * 부모 파일에서 직접 인라인 렌더되던 ⑥ rose 카드(env 환산 기준시가) 영역.
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 → useMemo 순수 계산
 *  - placeholder 숫자 예시 금지 → hint prop 한국어 설명
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { DateInput } from "@/components/ui/date-input";
import { useMemo } from "react";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function RedevelopmentValuationSection({ asset, onChange }: Props) {
  // 환산취득가 미리보기 (useMemo) — PHD 패턴, 엔진 redevelopment-valuation.ts 와 동일 산식.
  const valuationPreview = useMemo(() => {
    if (!asset.useEstimatedAcquisition) return null;
    const rights = parseAmount(asset.redevRightsValue);
    const D = parseAmount(asset.redevManagementDisposalHousingPrice);
    if (rights <= 0 || D <= 0) return null;

    const provisionTriggered =
      !!asset.acquisitionDate &&
      !!asset.redevFirstDisclosureDate &&
      new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

    const A = parseAmount(asset.redevFirstDisclosureHousingPrice);
    const area = parseDecimal(asset.redevLandArea);
    const landAcq = parseAmount(asset.redevLandPricePerSqmAtAcq);
    const bldAcq = parseAmount(asset.redevBuildingStdPriceAtAcq);
    const landFirst = parseAmount(asset.redevLandPricePerSqmAtFirst);
    const bldFirst = parseAmount(asset.redevBuildingStdPriceAtFirst);

    const canApplyMain =
      provisionTriggered && A > 0 && area > 0 && landAcq > 0 && landFirst > 0;

    let P_A: number;
    let sumAtAcq = 0;
    let sumAtFirst = 0;
    let step1Formula: string | null = null;

    if (canApplyMain) {
      sumAtAcq = Math.floor(landAcq * area) + bldAcq;
      sumAtFirst = Math.floor(landFirst * area) + bldFirst;
      if (sumAtFirst > 0) {
        P_A = Number((BigInt(A) * BigInt(sumAtAcq)) / BigInt(sumAtFirst));
        step1Formula = `floor(${A.toLocaleString()} × ${sumAtAcq.toLocaleString()} / ${sumAtFirst.toLocaleString()})`;
      } else {
        P_A = 0;
      }
    } else {
      P_A = parseAmount(asset.redevAcquisitionHousingPrice);
    }

    if (P_A <= 0) return null;

    const converted = Number((BigInt(rights) * BigInt(P_A)) / BigInt(D));
    const missingFields = provisionTriggered && !canApplyMain;

    return {
      converted,
      provisionTriggered,
      canApplyMain,
      missingFields,
      A, area, landAcq, bldAcq, landFirst, bldFirst,
      sumAtAcq, sumAtFirst,
      P_A, D, rights,
      step1Formula,
      step2Formula: `floor(${rights.toLocaleString()} × ${P_A.toLocaleString()} / ${D.toLocaleString()})`,
    };
  }, [
    asset.useEstimatedAcquisition,
    asset.redevRightsValue,
    asset.redevManagementDisposalHousingPrice,
    asset.redevAcquisitionHousingPrice,
    asset.redevFirstDisclosureHousingPrice,
    asset.redevLandArea,
    asset.redevLandPricePerSqmAtAcq,
    asset.redevBuildingStdPriceAtAcq,
    asset.redevLandPricePerSqmAtFirst,
    asset.redevBuildingStdPriceAtFirst,
    asset.acquisitionDate,
    asset.redevFirstDisclosureDate,
  ]);

  const isPreDisclosureTriggered =
    !!asset.acquisitionDate &&
    !!asset.redevFirstDisclosureDate &&
    new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

  const landAreaNumber = parseDecimal(asset.redevLandArea) || undefined;

  return (
    <ToggleCard
      tone="rose"
      checked={asset.useEstimatedAcquisition}
      onCheckedChange={(v) => onChange({ useEstimatedAcquisition: v })}
      title="환산취득가 사용"
      description="취득가액 확인 불가 시 기준시가 비율로 환산 (시행령 §166③ + §176의2②2호)"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">5</span>
          <p className="text-xs font-semibold text-rose-700">환산 기준시가</p>
        </div>

        <FieldCard
          label="D. 관리처분 인가일 개별주택공시가격"
          hint="§166③ 분모 — 양도 의제 시점의 §99①1호 라목 단일 라목값"
        >
          <CurrencyInput label=""
            value={asset.redevManagementDisposalHousingPrice}
            onChange={(v) => onChange({ redevManagementDisposalHousingPrice: v })}
            hideUnit
          />
        </FieldCard>

        <FieldCard
          label="최초공시일"
          hint="개별주택가격/공동주택가격 최초 공시일 (단독 2005-04-30, 공동 2006-04-28). 취득일이 이보다 이전이면 §164⑦ 본문 산식 발동."
        >
          <DateInput
            value={asset.redevFirstDisclosureDate}
            onChange={(v) => onChange({ redevFirstDisclosureDate: v })}
          />
        </FieldCard>

        {!isPreDisclosureTriggered && (
          <FieldCard
            label="취득당시 개별주택공시가격"
            hint="§166③ 분자 — 취득당시 §99①1호 라목 단일 라목값 (취득일 ≥ 최초공시일)"
          >
            <CurrencyInput label=""
              value={asset.redevAcquisitionHousingPrice}
              onChange={(v) => onChange({ redevAcquisitionHousingPrice: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {isPreDisclosureTriggered && (
          <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 space-y-3">
            <p className="text-[11px] font-semibold text-rose-700">
              §164⑦ 본문 발동 — PHD 패턴: 취득당시 라목값 P_A = floor(A × Sum_A / Sum_F)
            </p>

            <FieldCard label="A. 최초공시 주택가격" hint="국토교통부장관이 최초로 공시한 주택가격 (단일 라목값)">
              <CurrencyInput label=""
                value={asset.redevFirstDisclosureHousingPrice}
                onChange={(v) => onChange({ redevFirstDisclosureHousingPrice: v })}
                hideUnit
              />
            </FieldCard>

            <FieldCard label="토지면적 (㎡)" hint="시점별 동일 가정 — 환지·합병으로 면적이 다른 케이스는 후속 PR">
              <DecimalInput
                value={asset.redevLandArea}
                onChange={(v) => onChange({ redevLandArea: v })}
                unit="㎡"
              />
            </FieldCard>

            <div className="rounded-md border border-rose-100 bg-white/70 p-2 space-y-2">
              <p className="text-[11px] font-semibold text-rose-700">취득시 (Sum_A 산정)</p>
              <LandPriceLookupField
                label="취득시 개별공시지가 (원/㎡)"
                hint="Vworld API 조회 — 기준연도 = 취득연도"
                pricePerSqm={asset.redevLandPricePerSqmAtAcq}
                onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtAcq: v })}
                area={landAreaNumber}
                referenceDate={asset.acquisitionDate}
                jibun={asset.addressJibun || undefined}
              />
              <FieldCard label="취득시 건물 기준시가" hint="국세청 건물 기준시가 (총액, 원) — 수동 입력">
                <CurrencyInput label=""
                  value={asset.redevBuildingStdPriceAtAcq}
                  onChange={(v) => onChange({ redevBuildingStdPriceAtAcq: v })}
                  hideUnit
                />
              </FieldCard>
            </div>

            <div className="rounded-md border border-rose-100 bg-white/70 p-2 space-y-2">
              <p className="text-[11px] font-semibold text-rose-700">최초공시 당시 (Sum_F 산정)</p>
              <LandPriceLookupField
                label="최초공시 당시 개별공시지가 (원/㎡)"
                hint="Vworld API 조회 — 기준연도 = 최초공시연도 (단독 2005, 공동 2006)"
                pricePerSqm={asset.redevLandPricePerSqmAtFirst}
                onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtFirst: v })}
                area={landAreaNumber}
                referenceDate={asset.redevFirstDisclosureDate}
                jibun={asset.addressJibun || undefined}
              />
              <FieldCard label="최초공시 당시 건물 기준시가" hint="국세청 건물 기준시가 (총액, 원) — 수동 입력">
                <CurrencyInput label=""
                  value={asset.redevBuildingStdPriceAtFirst}
                  onChange={(v) => onChange({ redevBuildingStdPriceAtFirst: v })}
                  hideUnit
                />
              </FieldCard>
            </div>
          </div>
        )}

        {valuationPreview && (
          <div className="mt-2 rounded-md bg-rose-100/60 border border-rose-200 p-2 text-xs space-y-1">
            <p className="font-semibold text-rose-800">환산취득가 미리보기</p>
            {valuationPreview.canApplyMain && valuationPreview.step1Formula && (
              <>
                <p className="text-rose-700">
                  Sum_A (취득시 합계) = 단가×면적 + 건물 ={" "}
                  <span className="font-mono">{valuationPreview.sumAtAcq.toLocaleString()}</span>
                </p>
                <p className="text-rose-700">
                  Sum_F (최초공시 당시 합계) = 단가×면적 + 건물 ={" "}
                  <span className="font-mono">{valuationPreview.sumAtFirst.toLocaleString()}</span>
                </p>
                <p className="text-rose-700">Step 1 (§164⑦ 본문) — P_A = floor(A × Sum_A / Sum_F)</p>
                <p className="text-rose-700 font-mono">
                  = {valuationPreview.step1Formula} = {valuationPreview.P_A.toLocaleString()}
                </p>
              </>
            )}
            <p className="text-rose-700">
              Step 2 (§166③) — 환산취득가 = floor(권리가액 × {valuationPreview.canApplyMain ? "P_A" : "취득당시 라목값"} / D)
            </p>
            <p className="text-rose-700 font-mono">= {valuationPreview.step2Formula}</p>
            <p className="text-rose-700 font-mono">= {valuationPreview.converted.toLocaleString()}</p>
            <p className="text-rose-700">
              §164⑦ 본문:{" "}
              <span className={valuationPreview.canApplyMain ? "font-semibold text-rose-900" : "text-rose-600"}>
                {valuationPreview.canApplyMain
                  ? "발동 — PHD 패턴 2단계 산식 적용"
                  : valuationPreview.provisionTriggered
                    ? "트리거(취득일 < 최초공시일) 이나 PHD 필수입력 누락 → 본문 미적용"
                    : "미발동 — 취득당시 라목값 단일 입력"}
              </span>
            </p>
            {valuationPreview.missingFields && (
              <p className="text-rose-800 font-semibold">
                ⚠ §164⑦ 본문 트리거 발동이지만 PHD 필수입력(A·면적·단가·건물) 중 일부 누락 — 위 영역을 모두 채워주세요.
              </p>
            )}
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
