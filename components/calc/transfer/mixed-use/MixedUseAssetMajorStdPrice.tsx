"use client";

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { MixedUsePreHousingDisclosureSection } from "./MixedUsePreHousingDisclosureSection";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  useEstimatedAcquisition?: boolean;
  housingSectionNum?: number;
  commercialSectionNum?: number;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/**
 * 겸용주택 기준시가 입력 — 자산-우선 레이아웃 (용도변경 없음 `hasPartialUsageChange === false`).
 *
 * 시점-우선(양도시/취득시)이던 현행을 주택 섹션 / 상가 섹션으로 재편.
 * 각 섹션 내부에서 양도(emerald)·취득(amber) sub-block으로 시점을 구분.
 * 상가건물은 한 번의 계산으로 취득·양도를 동시 입력(BuildingStdPriceModalButton onApplyBoth).
 * 쓰기 대상 폼 필드는 현행과 동일 → 엔진 페이로드 불변(API 변환 무관).
 */
export function MixedUseAssetMajorStdPrice({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  housingSectionNum,
  commercialSectionNum,
  jibun,
}: Props) {
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);

  // 상속·증여 취득 겸용주택 — 취득시점 = 상속개시일/증여일이므로 "취득시" 문구를 치환.
  // §163⑨ 취득가액 직접 산정(엔진 정합) — override 입력은 상속/증여일 때만 노출.
  const isInheritance = asset.acquisitionCause === "inheritance";
  const isGift = asset.acquisitionCause === "gift";
  const isDeemed163_9 = isInheritance || isGift; // 상속·증여 공통 §163⑨ 라벨 게이트
  // 매매 실가 모드(법 §100² 안분) — 실비(자본적지출·양도비) 입력 노출 게이트. 환산/감정/매매사례는 제외.
  const isPurchaseActual =
    asset.acquisitionCause === "purchase" &&
    !useEstimatedAcquisition &&
    !asset.isAppraisalAcquisition &&
    !asset.isSalesCaseAcquisition;
  const acqLabel = isInheritance ? "상속개시일" : isGift ? "증여일" : "취득시";
  // 자동합계 박스 라벨 전용 — 원문이 "취득"(시 없음)이라 별도 변수로 분리 (E2E 문구 회귀 방지).
  const acqSummaryLabel = isInheritance ? "상속개시일" : isGift ? "증여일" : "취득";

  // 부수토지 안분 — leaf 헬퍼 단일 소스 + override 반영 (three-state: 빈값→자동, "0"→적법한 0).
  // 면적 입력·수정은 섹션 ①(MixedUseAreaInputs) 단일 소스 — 여기서는 **조회만** 한다.
  // override는 PHD 무관 (2026-07-15 배타 해제 — API·UI·validate·사이드바 동일).
  const landOverrideStr = asset.mixedResidentialLandAreaOverride ?? "";
  const commLandOverrideStr = asset.mixedCommercialLandAreaOverride ?? "";
  const fpOverrideStr = asset.mixedResidentialFootprintOverride ?? "";
  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: parseDecimal(asset.buildingFootprintArea),
    totalLandArea: totalLand,
    ...(landOverrideStr.trim() !== ""
      ? { residentialLandAreaOverride: parseDecimal(landOverrideStr) }
      : {}),
    ...(commLandOverrideStr.trim() !== ""
      ? { commercialLandAreaOverride: parseDecimal(commLandOverrideStr) }
      : {}),
    ...(fpOverrideStr.trim() !== ""
      ? { residentialFootprintOverride: parseDecimal(fpOverrideStr) }
      : {}),
  });
  const commercialLandArea = derived.commercialLandArea;

  // 양도시 상가부분 자동 계산 (mixedTransfer 우선, PHD 토지가액 fallback — API 변환과 동일 우선순위)
  const transferLandPerSqm =
    parseAmount(asset.mixedTransferLandPricePerSqm) || parseAmount(asset.phdLandPricePerSqmAtTransfer);
  const transferCommercialLandStd = Math.floor(transferLandPerSqm * commercialLandArea);
  const transferCommercialBuilding = parseAmount(asset.mixedTransferCommercialBuildingPrice) ?? 0;
  const transferCommercialTotal = transferCommercialLandStd + transferCommercialBuilding;

  // 취득시 상가부분 자동 계산 (mixedAcq 우선, PHD 토지가액 fallback — API 변환과 동일 우선순위)
  const acqLandPerSqm =
    parseAmount(asset.mixedAcqLandPricePerSqm) || parseAmount(asset.phdLandPricePerSqmAtAcq);
  const acqCommercialLandStd = Math.floor(acqLandPerSqm * commercialLandArea);
  const acqCommercialBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice) ?? 0;
  const acqCommercialTotal = acqCommercialLandStd + acqCommercialBuilding;

  const fmtKrw = (v: number) => (v > 0 ? `${v.toLocaleString()}` : "—");
  const fmtSqm = (v: number) => `${v.toFixed(2)}㎡`;

  // 취득 기준일 — 건물 취득일 기준(§164⑦ 주택 환산·건물 위치지수). 토지 취득일 아님.
  const acqReferenceDate = asset.acquisitionDate;
  // 부수토지 개별공시지가 취득시 추천 연도 전용 기준일 — 토지 취득일 기준(§166⑥ 토지·건물 취득일 상이).
  // 상가부수토지 공시지가는 토지값이므로 건물 취득일이 아닌 토지 취득일로 연도 추천(주택분 PHD 경로와 동일).
  const acqLandReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;
  // 모달 취득 위치지수 공시지가 prefill 가능 여부 — **토지일 = 건물일일 때만**.
  // 화면 부수토지 공시지가는 토지 취득일 기준(위 acqLandReferenceDate·§166⑥)이고, 모달 취득 위치지수 칸은
  // 건물 취득일 기준(BuildingStdPriceForm landRefFromEvent)이라, 두 날짜가 다르면 **다른 연도의 값**이다.
  // 주입하면 위치지수 오산 → 상가건물 기준시가 오류(세액 영향). 미주입 시 종전대로 빈 값(모달에서 직접 조회).
  // ⚠️ 2001.1.1 값(phdLandPricePerSqmAtAcq2001)은 고정 기준일이라 이 축과 무관 → 게이트 대상 아님.
  const canPrefillAcqLandPrice = acqLandReferenceDate === asset.acquisitionDate;

  const stdPriceAddress = stdPriceAddressOf(asset);
  // snapshotKey는 대상 필드 기준 — 취득·양도 통합 단일 키.
  // ⚠️ `bsp-{id}-phd-…`를 쓰면 안 된다: 주택분 배치 모달(MultiPointBuildingStdPriceModal)이
  // replaceSnapshotsByPrefix(`bsp-{id}-phd`)로 그 접두 키를 전부 교체하므로, 용도변경 없음(Case B)에선
  // 배치가 상가 스냅샷을 재생성하지도 않아 통째로 소실됐다. `mx`(mixed) 축으로 분리한다.
  // 시점 세그먼트가 없는 것은 이 모달이 취득·양도 2시점을 한 폼에서 계산하기 때문(gb/cb와 동류).
  const commercialSnapshotKey = `bsp-${asset.assetId}-mx-commercial`;

  return (
    <div className="space-y-3">
      {/* ── ② 주택 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {housingSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-700 select-none">
              {housingSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700">주택 기준시가</p>
        </div>

        {/* 취득 sub-block — PHD 토글(amber)이 시점 인디케이터 역할.
            §11-6: PHD ON 시 위젯 자체 tone(amber/violet/emerald PointBlock)에 위임 — 별도 amber 컨테이너 미추가.
            시점 순서: 취득 → 양도 (PHD 3-시점 §164⑦ 법정 시계열과 정렬 — 계획 §2) */}
        <div className="space-y-2">
          {isInheritance && (
            <ToneCard
              tone="violet"
              title="상속개시일 신고가액 override (선택)"
              titleExtra={<LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />}
            >
              <CurrencyInput
                label=""
                value={asset.mixedHousingInheritedValueOverride}
                onChange={(v) => onChange({ mixedHousingInheritedValueOverride: v })}
                hint="시가·감정·매매사례로 상속세 신고한 경우만 입력. 미입력 시 아래 개별주택공시가격(보충적평가)을 자동 사용"
              />
              <div className="pt-2">
                <CurrencyInput
                  label="실제 필요경비 — 자본적지출·양도비 (선택)"
                  value={asset.mixedHousingInheritedExpense}
                  onChange={(v) => onChange({ mixedHousingInheritedExpense: v })}
                  hint="상속(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"
                />
              </div>
            </ToneCard>
          )}
          {isGift && (
            <ToneCard
              tone="violet"
              title="증여일 신고가액 override (선택)"
              titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}
            >
              <CurrencyInput
                label=""
                value={asset.mixedHousingGiftValueOverride}
                onChange={(v) => onChange({ mixedHousingGiftValueOverride: v })}
                hint="증여세 신고서·결정통지서상 주택 평가액(상증법 §60~66). 미입력 시 아래 개별주택공시가격(보충적평가)을 자동 사용"
              />
              <div className="pt-2">
                <CurrencyInput
                  label="실제 필요경비 — 자본적지출·양도비 (선택)"
                  value={asset.mixedHousingGiftExpense}
                  onChange={(v) => onChange({ mixedHousingGiftExpense: v })}
                  hint="증여(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"
                />
              </div>
            </ToneCard>
          )}
          {isPurchaseActual && (
            <ToneCard
              tone="violet"
              title="주택분 실제 필요경비 (선택)"
              titleExtra={<LawArticleModal legalBasis="소득세법 §97 ① 2호·3호" label="법 §97①" />}
            >
              <CurrencyInput
                label="자본적지출·양도비 (주택분)"
                value={asset.mixedHousingActualExpense}
                onChange={(v) => onChange({ mixedHousingActualExpense: v })}
                hint="매매 실거래가 취득은 개산공제(§163⑥, 3%)를 적용하지 않습니다. 주택분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
              />
            </ToneCard>
          )}
          <p className="text-caption font-semibold text-amber-700">{acqLabel}</p>
          <ToggleCard
            tone="amber"
            size="sm"
            title={`${isDeemed163_9 ? acqLabel : "취득 당시"} 개별주택가격 미공시 (§164⑦ 3-시점 환산)`}
            description={
              useEstimatedAcquisition
                ? "개별주택가격 최초 공시 이전 취득 시 활성화"
                : "활성화 시 환산취득가 모드로 자동 전환"
            }
            checked={!!asset.usePreHousingDisclosure}
            onCheckedChange={(checked) => {
              onChange({
                usePreHousingDisclosure: checked,
                ...(checked ? { useEstimatedAcquisition: true } : {}),
              });
            }}
          >
            <MixedUsePreHousingDisclosureSection
              asset={asset}
              transferDate={transferDate ?? ""}
              onChange={onChange}
            />
          </ToggleCard>

          {!asset.usePreHousingDisclosure && (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2">
              <StandardPriceInput
                propertyKind="house_individual"
                totalPrice={asset.mixedAcqHousingPrice}
                onTotalPriceChange={(v) => onChange({ mixedAcqHousingPrice: v })}
                jibun={asset.addressJibun || undefined}
                referenceDate={acqReferenceDate}
                label="개별주택공시가격"
                hint="미공시 시 비워두세요 — 위 §164⑦ 토글 사용"
              />
            </div>
          )}
        </div>

        {/* 양도 sub-block — PHD ON 시 하단 PHD 패널의 양도시 입력이 단일 소스이므로 숨김 */}
        {!asset.usePreHousingDisclosure && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-2">
            <p className="text-caption font-semibold text-emerald-700">양도시</p>
            <StandardPriceInput
              propertyKind="house_individual"
              totalPrice={asset.mixedTransferHousingPrice}
              onTotalPriceChange={(v) => onChange({ mixedTransferHousingPrice: v })}
              jibun={asset.addressJibun || undefined}
              referenceDate={transferDate}
              label="개별주택공시가격"
              hint="주택건물+주택부수토지 일괄"
            />
          </div>
        )}
      </div>

      {/* ── ③ 상가 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {commercialSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-700 select-none">
              {commercialSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700">상가 기준시가</p>
        </div>

        {isInheritance && (
          <ToneCard
            tone="violet"
            title="상속개시일 신고가액 override (선택, 상가 전체)"
            titleExtra={<LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />}
          >
            <CurrencyInput
              label=""
              value={asset.mixedCommercialInheritedValueOverride}
              onChange={(v) => onChange({ mixedCommercialInheritedValueOverride: v })}
              hint="미입력 시 아래 상가건물 기준시가 + 개별공시지가 합계를 자동 사용"
            />
            <div className="pt-2">
              <CurrencyInput
                label="실제 필요경비 — 자본적지출·양도비 (선택)"
                value={asset.mixedCommercialInheritedExpense}
                onChange={(v) => onChange({ mixedCommercialInheritedExpense: v })}
                hint="상속(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"
              />
            </div>
          </ToneCard>
        )}

        {isGift && (
          <ToneCard
            tone="violet"
            title="증여일 신고가액 override (선택, 상가 전체)"
            titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}
          >
            <CurrencyInput
              label=""
              value={asset.mixedCommercialGiftValueOverride}
              onChange={(v) => onChange({ mixedCommercialGiftValueOverride: v })}
              hint="증여세 신고서·결정통지서상 상가 평가액(상증법 §60~66). 미입력 시 아래 상가건물 기준시가 + 개별공시지가 합계를 자동 사용"
            />
            <div className="pt-2">
              <CurrencyInput
                label="실제 필요경비 — 자본적지출·양도비 (선택)"
                value={asset.mixedCommercialGiftExpense}
                onChange={(v) => onChange({ mixedCommercialGiftExpense: v })}
                hint="증여(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"
              />
            </div>
          </ToneCard>
        )}
        {isPurchaseActual && (
          <ToneCard
            tone="violet"
            title="상가분 실제 필요경비 (선택)"
            titleExtra={<LawArticleModal legalBasis="소득세법 §97 ① 2호·3호" label="법 §97①" />}
          >
            <CurrencyInput
              label="자본적지출·양도비 (상가분)"
              value={asset.mixedCommercialActualExpense}
              onChange={(v) => onChange({ mixedCommercialActualExpense: v })}
              hint="매매 실거래가 취득은 개산공제(§163⑥, 3%)를 적용하지 않습니다. 상가분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
            />
          </ToneCard>
        )}

        {/* 상가건물 기준시가 — 양도/취득 나란히 + 통합 계산 모달 */}
        <p className="text-xs font-medium text-slate-600">
          상가건물 기준시가{" "}
          <span className="text-micro font-normal text-slate-500">
            (토지 제외)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1">
            <p className="text-caption font-semibold text-amber-700">{acqLabel}</p>
            <CurrencyInput
              label=""
              value={asset.mixedAcqCommercialBuildingPrice}
              onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
              placeholder={`${acqLabel} 상가건물 기준시가 (필수)`}
              hideUnit
            />
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1">
            <p className="text-caption font-semibold text-emerald-700">양도시</p>
            <CurrencyInput
              label=""
              value={asset.mixedTransferCommercialBuildingPrice}
              onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
              placeholder="양도시 상가건물 기준시가"
              hideUnit
            />
          </div>
        </div>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            initialAddress={stdPriceAddress}
            snapshotKey={commercialSnapshotKey}
            prefill={{
              floorArea: asset.nonResidentialFloorArea,
              landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
              acquisitionDate: asset.acquisitionDate,
              transferDate,
              // 공시지가 자동입력 — 화면 표시 fallback과 동일 우선순위(3중 패턴).
              // 취득은 트랙 2종을 모두 넘기고 ≤2000 선택은 모달이 단일 게이트로 판정(§164⑤).
              acqLandPricePerSqm: canPrefillAcqLandPrice
                ? asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq
                : undefined,
              acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001,
              transferLandPricePerSqm:
                asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer,
            }}
            onApplyBoth={(acq, transfer) =>
              onChange({
                mixedAcqCommercialBuildingPrice: String(acq),
                mixedTransferCommercialBuildingPrice: String(transfer),
              })
            }
          />
        </div>

        {/* 상가부수토지 개별공시지가 — 양도/취득 (세로 스택: 기준연도 드롭다운 폭 확보) */}
        <p className="text-xs font-medium text-slate-600">상가부수토지 개별공시지가</p>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1">
          <p className="text-caption font-semibold text-amber-700">{acqLabel}</p>
          <LandPriceLookupField
            pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
            onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
            area={commercialLandArea > 0 ? commercialLandArea : undefined}
            referenceDate={acqLandReferenceDate}
            jibun={jibun}
            label="개별공시지가 (원/㎡)"
            hint="상가부수토지 기준시가 자동 계산용 (필수)"
            placeholder={`${acqLabel} 개별공시지가 /㎡`}
          />
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1">
          <p className="text-caption font-semibold text-emerald-700">양도시</p>
          <LandPriceLookupField
            pricePerSqm={asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer}
            onPricePerSqmChange={(v) => onChange({ mixedTransferLandPricePerSqm: v })}
            area={commercialLandArea > 0 ? commercialLandArea : undefined}
            referenceDate={transferDate}
            jibun={jibun}
            label="개별공시지가 (원/㎡)"
            hint="상가부수토지 산정용 (필수)"
            placeholder="양도시 개별공시지가 /㎡"
          />
        </div>

        {/* 자동합계 — "기준시가 합계" 문구 유지 (E2E transfer-p3-hybrid 방어) */}
        {(transferCommercialLandStd > 0 ||
          transferCommercialBuilding > 0 ||
          acqCommercialLandStd > 0 ||
          acqCommercialBuilding > 0) && (
          <div className="space-y-2">
            {/* 취득(첫째) — 면적 행은 시점 무관 공통값이므로 첫 박스가 담는다.
                게이트는 면적 OR 자기 값 — 면적 게이트만 두면 상가부수토지 0(주택 부수토지
                override = 전체토지)일 때 상가건물 기준시가가 있어도 취득 합계가 통째로 사라진다. */}
            {(commercialLandArea > 0 || acqCommercialLandStd > 0 || acqCommercialBuilding > 0) && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
                {commercialLandArea > 0 && (
                  <div className="flex justify-between text-xs text-amber-700">
                    <span>상가부수토지 면적</span>
                    <span>{fmtSqm(commercialLandArea)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-amber-700">
                  <span>{acqSummaryLabel} 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(acqCommercialLandStd)}</span>
                </div>
                {acqCommercialBuilding > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-amber-900">
                    <span>{acqSummaryLabel} 상가부분 기준시가 합계 (자동)</span>
                    <span>{fmtKrw(acqCommercialTotal)}</span>
                  </div>
                )}
              </div>
            )}
            {(transferCommercialLandStd > 0 || transferCommercialBuilding > 0) && (
              <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between text-xs text-emerald-700">
                  <span>양도 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(transferCommercialLandStd)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-emerald-900">
                  <span>양도 상가부분 기준시가 합계 (자동)</span>
                  <span>{fmtKrw(transferCommercialTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
