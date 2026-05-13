"use client";

/**
 * RedevelopmentBlock — 재개발/재건축 양도소득세 입력 섹션 (사례 44 UI)
 *
 * assetKind === "redevelopment_apt" 진입 시 렌더.
 * 시행령 §166②1호 (APT 양도 + 청산금 납부 — 사례 44 핵심) + §166③ (환산취득가) + §164⑦ 단서.
 *
 * 구조:
 *  ① sky:    양도 대상 (apt 고정, right disabled)
 *  ② emerald: 출자 자산 (housing 고정, land disabled)
 *  ③ amber:  청산금 방향 (pay 고정, receive disabled)
 *  ④ violet: 재개발 일정·금액 + 분양가 미리보기
 *  ⑤ rose:   환산 기준시가 (useEstimatedAcquisition ON 시)
 *
 * 정책 준수:
 *  - native checkbox/radio 금지 → ToggleCard / RadioCardGroup
 *  - useEffect → store 미러링 금지 → useMemo 순수 계산
 *  - 자동 안분 fallback 금지 (미입력은 validate에서 차단)
 *  - placeholder 숫자 예시 금지 → hint prop 한국어 설명
 *  - 사이드바 합계에 redev 필드 추가 안 함 (미리보기 + 결과카드만)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { DateInput } from "@/components/ui/date-input";
import { useMemo } from "react";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역).
   * 사례 45 §⑤ 거주월수 분리 입력 카드 가시성 가드.
   * undefined 시 fallback: true (legacy 호환 — 신규 호출 사이트는 명시 전달 권장).
   */
  isOneHouseSingle?: boolean;
}

// ── ToggleCard 옵션 ──

const SUBJECT_OPTIONS = [
  { value: "apt" as const, label: "완공 APT 양도", description: "조합 신축주택 양도 (시행령 §166②) — 사례 44 본 PR UI 지원" },
  { value: "right" as const, label: "입주권 양도", description: "관리처분 인가 후 조합원 입주권 양도 (시행령 §166① · §95② 단서) — 후속 PR" },
];

const ORIGINAL_ASSET_OPTIONS = [
  { value: "housing" as const, label: "주택 출자", description: "기존 주택을 조합에 출자 (사례 44~46) — 본 PR UI 지원" },
  { value: "land" as const, label: "토지 출자", description: "기존 토지를 조합에 출자 (사례 40~43) — 후속 PR" },
];

const SETTLEMENT_OPTIONS = [
  { value: "pay" as const, label: "청산금 납부", description: "권리가액 < 분양가 → 차액 납부 (사례 44 본 PR UI 지원)" },
  { value: "receive" as const, label: "청산금 수령", description: "권리가액 > 분양가 → 차액 수령 (시행령 §166①2호 / ②2호) — 후속 PR" },
];

const APPROVAL_LAW_OPTIONS = [
  { value: "urban_renovation_art_74" as const, label: "도시정비법 §74 (재개발/재건축)", description: "도시 및 주거환경정비법 §74 관리처분계획 인가 — 본류" },
  { value: "small_housing_art_29" as const, label: "빈집소규모정비법 §29 (소규모정비)", description: "빈집 및 소규모주택 정비에 관한 특례법 §29 사업시행계획 인가 — 후속 PR" },
];

export function RedevelopmentBlock({ asset, onChange, isOneHouseSingle }: Props) {
  const isActive = asset.assetKind === "redevelopment_apt";

  // 분양가 미리보기 (useMemo 순수 계산 — useEffect 미러링 금지)
  const preview = useMemo(() => {
    const rights = parseAmount(asset.redevRightsValue);
    const settlement = parseAmount(asset.redevSettlementAmount);
    if (rights <= 0 || settlement < 0) return null;

    const isPay = asset.redevSettlementDirection === "pay";
    const salePriceTotal = isPay ? rights + settlement : Math.max(0, rights - settlement);
    if (salePriceTotal <= 0) return null;

    const existingRatio = (rights / salePriceTotal) * 100;
    const settlementRatio = (settlement / salePriceTotal) * 100;

    return {
      salePriceTotal,
      existingRatio: existingRatio.toFixed(2),
      settlementRatio: settlementRatio.toFixed(2),
      sign: isPay ? "+" : "−",
    };
  }, [asset.redevRightsValue, asset.redevSettlementAmount, asset.redevSettlementDirection]);

  // 환산취득가 미리보기 (useMemo) — PHD 패턴, 엔진 redevelopment-valuation.ts 와 동일 산식.
  //   본문 발동: Sum_A = 단가×면적 + 건물, Sum_F = 단가×면적 + 건물
  //              P_A = floor(A × Sum_A / Sum_F)
  //              환산취득가 = floor(권리가액 × P_A / D)
  //   본문 미발동: P_A = 사용자 단일 입력 (redevAcquisitionHousingPrice)
  //               환산취득가 = floor(권리가액 × P_A / D)
  const valuationPreview = useMemo(() => {
    if (!asset.useEstimatedAcquisition) return null;
    const rights = parseAmount(asset.redevRightsValue);
    const D = parseAmount(asset.redevManagementDisposalHousingPrice);
    if (rights <= 0 || D <= 0) return null;

    // §164⑦ 본문 트리거 (취득일 < 최초공시일)
    const provisionTriggered =
      !!asset.acquisitionDate &&
      !!asset.redevFirstDisclosureDate &&
      new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

    // PHD 패턴 필수입력
    const A = parseAmount(asset.redevFirstDisclosureHousingPrice);
    const area = parseDecimal(asset.redevLandArea);
    const landAcq = parseAmount(asset.redevLandPricePerSqmAtAcq);
    const bldAcq = parseAmount(asset.redevBuildingStdPriceAtAcq);
    const landFirst = parseAmount(asset.redevLandPricePerSqmAtFirst);
    const bldFirst = parseAmount(asset.redevBuildingStdPriceAtFirst);

    const canApplyMain =
      provisionTriggered &&
      A > 0 && area > 0 && landAcq > 0 && landFirst > 0;

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
      // 본문 미발동 — 단일 라목값 사용자 입력
      P_A = parseAmount(asset.redevAcquisitionHousingPrice);
    }

    if (P_A <= 0) return null;

    const converted = Number((BigInt(rights) * BigInt(P_A)) / BigInt(D));

    // 본문 트리거 발동인데 필수입력 누락 → 경고
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

  // §164⑦ 본문 트리거 (취득일 < 최초공시일) — 입력 영역 분기용
  const isPreDisclosureTriggered =
    !!asset.acquisitionDate &&
    !!asset.redevFirstDisclosureDate &&
    new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

  const landAreaNumber = parseDecimal(asset.redevLandArea) || undefined;

  if (!isActive) return null;

  return (
    <div className="space-y-3">
      {/* ① sky: 양도 대상 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700">양도 대상 (시행령 §166)</p>
        </div>
        <RadioCardGroup
          name={`redevSubject-${asset.assetId}`}
          value={asset.redevSubject || "apt"}
          onChange={(v) => onChange({ redevSubject: v as "" | "right" | "apt" })}
          options={SUBJECT_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "right",
          }))}
          layout="stack"
        />
      </div>

      {/* ② emerald: 출자 자산 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">2</span>
          <p className="text-xs font-semibold text-emerald-700">출자 자산</p>
        </div>
        <RadioCardGroup
          name={`redevOriginal-${asset.assetId}`}
          value={asset.redevOriginalAssetType || "housing"}
          onChange={(v) => onChange({ redevOriginalAssetType: v as "" | "land" | "housing" })}
          options={ORIGINAL_ASSET_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "land",
          }))}
          layout="stack"
        />
      </div>

      {/* ③ amber: 청산금 방향 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">3</span>
          <p className="text-xs font-semibold text-amber-700">청산금 방향</p>
        </div>
        <RadioCardGroup
          name={`redevSettlement-${asset.assetId}`}
          value={asset.redevSettlementDirection || "pay"}
          onChange={(v) => onChange({ redevSettlementDirection: v as "" | "pay" | "receive" })}
          options={SETTLEMENT_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "receive",
          }))}
          layout="inline"
        />
      </div>

      {/* ④ violet: 재개발 일정·금액 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">4</span>
          <p className="text-xs font-semibold text-violet-700">재개발 일정·금액 (시행령 §166②1호)</p>
        </div>

        <RadioCardGroup
          name={`redevApproval-${asset.assetId}`}
          value={asset.redevApprovalLawBasis || "urban_renovation_art_74"}
          onChange={(v) => onChange({ redevApprovalLawBasis: v as "" | "urban_renovation_art_74" | "small_housing_art_29" })}
          options={APPROVAL_LAW_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "small_housing_art_29",
          }))}
          layout="stack"
        />

        <FieldCard label="관리처분 인가일" hint="도시정비법 §74 인가일자 (또는 빈집소규모법 §29 사업시행계획 인가일)">
          <DateInput
            value={asset.redevApprovalDate}
            onChange={(v) => onChange({ redevApprovalDate: v })}
          />
        </FieldCard>

        <FieldCard label="권리가액" hint="관리처분계획에 따라 정하여진 가격 (시행령 §166④) — 인가전 분 양도가액 의제">
          <CurrencyInput label=""
            value={asset.redevRightsValue}
            onChange={(v) => onChange({ redevRightsValue: v })}
            hideUnit
          />
        </FieldCard>

        <FieldCard label="청산금 납부액" hint="권리가액 < 분양가 시 차액 (납부 모드)">
          <CurrencyInput label=""
            value={asset.redevSettlementAmount}
            onChange={(v) => onChange({ redevSettlementAmount: v })}
            hideUnit
          />
        </FieldCard>

        <FieldCard label="인가전 분 필요경비" hint="법 §97①2·3호 + 시행령 §163⑥ — 인가전 양도차익 산식의 필요경비">
          <CurrencyInput label=""
            value={asset.redevPreApprovalExpenses}
            onChange={(v) => onChange({ redevPreApprovalExpenses: v })}
            hideUnit
          />
        </FieldCard>

        {/* 미리보기 카드 — useMemo 순수 계산 */}
        {preview && (
          <div className="mt-2 rounded-md bg-violet-100/60 border border-violet-200 p-2 text-xs space-y-1">
            <p className="font-semibold text-violet-800">미리보기 — 분양가 (인가후 분 취득가) 자동 산정</p>
            <p className="text-violet-700">
              분양가 = 권리가액 {preview.sign} 청산금 = <span className="font-mono font-semibold">{preview.salePriceTotal.toLocaleString()}</span>
            </p>
            <p className="text-[11px] text-violet-600">
              ※ §166②1호 인가후 분 양도차익 산정 시 양도가액에서 차감되는 분양가. 상단 일반 &ldquo;취득가액&rdquo; 입력 대신 본 값이 자동 사용됩니다.
            </p>
            <p className="text-violet-700">
              기존건물분 비율: <span className="font-mono">{preview.existingRatio}%</span> /
              청산금분 비율: <span className="font-mono">{preview.settlementRatio}%</span>
            </p>
          </div>
        )}
      </div>

      {/* ⑤ sky: 인가전 분 종전 주택 취득가 (실가 모드) — useEstimatedAcquisition OFF 시만 표시
          §166①1호 인가전 분 양도차익 산정의 차감 기준 (사례 45/46 실거래가).
          환산 모드 ON 시 비표시 (아래 ⑥ rose 카드의 §164⑦/§166③ 환산으로 자동 도출). */}
      {!asset.useEstimatedAcquisition && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">5</span>
            <p className="text-xs font-semibold text-sky-700">인가전 분 종전 주택 취득가액 (실가 모드)</p>
          </div>
          <FieldCard
            label="실거래가 취득가액"
            hint="재개발 관리처분 인가 전 종전 주택의 실거래가 (§166①1호 인가전 분 차감 기준). 취득가액을 확인할 수 없으면 아래 환산취득가 토글을 ON으로 전환하세요."
          >
            <CurrencyInput
              label=""
              value={asset.redevActualAcquisitionPrice}
              onChange={(v) => onChange({ redevActualAcquisitionPrice: v })}
              hideUnit
            />
          </FieldCard>
        </div>
      )}

      {/* ⑥ rose: 환산 기준시가 — useEstimatedAcquisition ON 시 */}
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

          {/* D — 관리처분 인가일 라목값 (단일, 필수) */}
          <FieldCard
            label="D. 관리처분 인가일 개별주택공시가격"
            hint="§166③ 분모 — 양도 의제 시점의 §99①1호 라목 단일 라목값 (관리처분 인가일에는 라목값이 공시되어 있음)"
          >
            <CurrencyInput label=""
              value={asset.redevManagementDisposalHousingPrice}
              onChange={(v) => onChange({ redevManagementDisposalHousingPrice: v })}
              hideUnit
            />
          </FieldCard>

          {/* 최초공시일 — 본문 발동 트리거 */}
          <FieldCard
            label="최초공시일"
            hint="개별주택가격/공동주택가격 최초 공시일 (단독 2005-04-30, 공동 2006-04-28). 취득일이 이보다 이전이면 §164⑦ 본문 산식 발동."
          >
            <DateInput
              value={asset.redevFirstDisclosureDate}
              onChange={(v) => onChange({ redevFirstDisclosureDate: v })}
            />
          </FieldCard>

          {/* 본문 미발동 경로 — 취득일 ≥ 최초공시일 또는 최초공시일 미입력 */}
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

          {/* 본문 발동 경로 — PHD 패턴 (토지 API 조회 + 건물 수동 입력) */}
          {isPreDisclosureTriggered && (
            <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 space-y-3">
              <p className="text-[11px] font-semibold text-rose-700">
                §164⑦ 본문 발동 — PHD 패턴: 취득당시 라목값 P_A = floor(A × Sum_A / Sum_F)
              </p>

              <FieldCard
                label="A. 최초공시 주택가격"
                hint="국토교통부장관이 최초로 공시한 주택가격 (단일 라목값) — §164⑦ 본문 산식의 계수"
              >
                <CurrencyInput label=""
                  value={asset.redevFirstDisclosureHousingPrice}
                  onChange={(v) => onChange({ redevFirstDisclosureHousingPrice: v })}
                  hideUnit
                />
              </FieldCard>

              <FieldCard
                label="토지면적 (㎡)"
                hint="시점별 동일 가정 — 환지·합병으로 면적이 다른 케이스는 후속 PR"
              >
                <DecimalInput
                  value={asset.redevLandArea}
                  onChange={(v) => onChange({ redevLandArea: v })}
                  unit="㎡"
                />
              </FieldCard>

              {/* 취득시 (Sum_A) */}
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
                <FieldCard
                  label="취득시 건물 기준시가"
                  hint="국세청 건물 기준시가 (총액, 원) — 수동 입력"
                >
                  <CurrencyInput label=""
                    value={asset.redevBuildingStdPriceAtAcq}
                    onChange={(v) => onChange({ redevBuildingStdPriceAtAcq: v })}
                    hideUnit
                  />
                </FieldCard>
              </div>

              {/* 최초공시 당시 (Sum_F) */}
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
                <FieldCard
                  label="최초공시 당시 건물 기준시가"
                  hint="국세청 건물 기준시가 (총액, 원) — 수동 입력"
                >
                  <CurrencyInput label=""
                    value={asset.redevBuildingStdPriceAtFirst}
                    onChange={(v) => onChange({ redevBuildingStdPriceAtFirst: v })}
                    hideUnit
                  />
                </FieldCard>
              </div>
            </div>
          )}

          {/* 환산 미리보기 */}
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
                  <p className="text-rose-700">
                    Step 1 (§164⑦ 본문) — P_A = floor(A × Sum_A / Sum_F)
                  </p>
                  <p className="text-rose-700 font-mono">
                    = {valuationPreview.step1Formula} = {valuationPreview.P_A.toLocaleString()}
                  </p>
                </>
              )}
              <p className="text-rose-700">
                Step 2 (§166③) — 환산취득가 = floor(권리가액 × {valuationPreview.canApplyMain ? "P_A" : "취득당시 라목값"} / D)
              </p>
              <p className="text-rose-700 font-mono">
                = {valuationPreview.step2Formula}
              </p>
              <p className="text-rose-700 font-mono">
                = {valuationPreview.converted.toLocaleString()}
              </p>
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

      <ResidenceSplitSection asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// §⑤ 거주월수 분리 (사례 45 — 1세대1주택 + 12억 초과)
// 시행령 §155⑰ (거주기간 통산) + 사전법령해석재산 2020-386 (청산금분 신축거주만)
// 가시성: 1세대1주택 + householdHousingCount === 1 일 때만 노출
// ──────────────────────────────────────────────────────────────────────────────

function ResidenceSplitSection({
  asset,
  onChange,
  isOneHouseSingle,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  isOneHouseSingle?: boolean;
}) {
  // 가시성 가드: 1세대1주택 + householdHousingCount === 1 일 때만 노출 (디자인 §⑤ 명세).
  // undefined 는 legacy 호출 사이트 fallback (보수적으로 노출 유지).
  const shouldHide = isOneHouseSingle === false;

  // 사례 45 가이드 카드 4분기 useMemo (useEffect→store 미러링 금지)
  const guidance = useMemo(() => {
    // 자산-수준 양도가액 (actualSalePrice). 12억 초과 분기 판정용.
    const tp = parseAmount(asset.actualSalePrice || "");
    const prior = parseInt((asset.redevPriorHouseResidenceMonths || "0").replace(/,/g, ""), 10) || 0;
    const newM = parseInt((asset.redevNewHouseResidenceMonths || "0").replace(/,/g, ""), 10) || 0;
    const isHighValue = tp > 1_200_000_000;

    if (!isHighValue) {
      return {
        tone: "emerald" as const,
        title: "C-2 — 12억 이하 전액 비과세",
        body: "양도가액이 12억원 이하이므로 전체 양도차익이 비과세 대상입니다 (1세대1주택 충족 시).",
      };
    }
    const exceedsExisting = prior + newM >= 24;
    const exceedsNew = newM >= 24;
    if (exceedsExisting && exceedsNew) {
      return {
        tone: "sky" as const,
        title: "C-3 — 12억 초과 + 분할 LTHD 모두 표2 적용",
        body: "기존건물분과 청산금분 모두 표2(보유+거주) 적용. 거주월수 귀속은 분리되어 산정됩니다 (기존: 종전+신축 통산 / 청산금분: 신축만).",
      };
    }
    if (exceedsExisting && !exceedsNew) {
      return {
        tone: "violet" as const,
        title: "C-4 — 사전법령해석재산 2020-386 적용",
        body: "기존건물분은 표2(보유+거주), 청산금납부분은 표1(보유만, 30% 캡)이 적용됩니다. 신축주택에서 2년 이상 거주하지 못한 경우 청산금분은 §95② 본문 표1 강등.",
      };
    }
    return {
      tone: "amber" as const,
      title: "C-5 — 거주 2년 미충족 (두 분기 모두 표1)",
      body: "종전+신축 통산 거주월수가 24개월 미만이면 표2(80% 캡) 진입 가드 미충족. 기존건물분·청산금분 모두 §95② 본문 표1(30% 캡) 적용.",
    };
  }, [asset.actualSalePrice, asset.redevPriorHouseResidenceMonths, asset.redevNewHouseResidenceMonths]);

  if (shouldHide) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          5
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          거주개월 분리 입력 (1세대1주택 + 12억 초과 시)
        </p>
      </div>
      <p className="text-[11px] text-emerald-800 leading-relaxed">
        시행령 §155⑰ — 재개발·재건축 거주기간은 종전주택과 신축주택을 통산합니다.
        사전법령해석재산 2020-386 — 청산금납부분 LTHD 표2 진입은 신축주택 거주 2년 이상이 필요합니다.
      </p>

      <FieldCard
        label="종전주택 거주개월"
        hint="종전주택 취득일부터 관리처분 또는 그 이후 철거 전까지 실제 거주개월수 (§155⑰ 통산 산식 prior)"
      >
        <DecimalInput
          value={asset.redevPriorHouseResidenceMonths}
          onChange={(v) => onChange({ redevPriorHouseResidenceMonths: v })}
          placeholder="종전주택 실거주 개월"
          unit="개월"
        />
      </FieldCard>

      <FieldCard
        label="신축주택 거주개월"
        hint="준공검사일(사용승인일)부터 양도일까지 신축아파트 실거주 개월수 (해석례 2020-386 — 청산금분 표2 진입 가드)"
      >
        <DecimalInput
          value={asset.redevNewHouseResidenceMonths}
          onChange={(v) => onChange({ redevNewHouseResidenceMonths: v })}
          placeholder="신축아파트 실거주 개월"
          unit="개월"
        />
      </FieldCard>

      {/* 시나리오 가이드 카드 — useMemo 분기 */}
      <div
        className={`rounded-lg border p-3 text-xs leading-relaxed ${
          guidance.tone === "emerald"
            ? "border-emerald-300 bg-emerald-100/60 text-emerald-900"
            : guidance.tone === "sky"
              ? "border-sky-300 bg-sky-100/60 text-sky-900"
              : guidance.tone === "violet"
                ? "border-violet-300 bg-violet-100/60 text-violet-900"
                : "border-amber-300 bg-amber-100/60 text-amber-900"
        }`}
      >
        <p className="font-semibold mb-1">{guidance.title}</p>
        <p>{guidance.body}</p>
      </div>
    </div>
  );
}
