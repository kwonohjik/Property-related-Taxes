"use client";

/**
 * 이월과세(증여) 취득 입력 블록 — §97조의2
 *
 * acquisitionCause === "carryover_gift" 시에만 렌더.
 * CompanionAcqGiftBlock(단순 증여 신고가액)과 완전 분리 — 기존 gift 흐름 회귀 없음.
 *
 * 섹션 구성:
 *  ① 증여 기본 정보 (등기접수일·증여자 취득일·증여자 취득원인)
 *  ② 증여자 취득가액 (환산 토글 + 직접 입력)
 *  ③ 필요경비 가산 (증여세 상당액·증여자 자본적지출)
 *  ④ 비교과세 기준 — Scenario B 취득가 (증여 당시 평가액)
 *  ⑤ 적용배제 선언 (CarryoverGiftExclusionSection)
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CarryoverGiftExclusionSection } from "./CarryoverGiftExclusionSection";
import { CarryoverEstimationSection } from "./CarryoverEstimationSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

// ── 법령 배지 ────────────────────────────────────────────────────
function LegalBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
      {text}
    </span>
  );
}

// ── 증여자 취득원인 라디오 옵션 ──────────────────────────────────
const DONOR_CAUSE_OPTIONS = [
  { value: "purchase" as const, label: "매매" },
  { value: "inheritance" as const, label: "상속" },
  { value: "gift" as const, label: "증여" },
];

// ── Props ──────────────────────────────────────────────────────
interface Props {
  asset: AssetForm;
  /** 양도일 (YYYY-MM-DD) — 시행시기 가드용 */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** carryover 서브객체 패치 헬퍼 */
function patchCarryover(
  current: CarryoverTaxationForm | undefined,
  patch: Partial<CarryoverTaxationForm>,
): CarryoverTaxationForm {
  return { ...(current ?? CARRYOVER_DEFAULTS), ...patch };
}

/** exclusionDeclared 패치 헬퍼 */
function patchExclusion(
  current: CarryoverTaxationForm | undefined,
  patch: Partial<CarryoverTaxationForm["exclusionDeclared"]>,
): CarryoverTaxationForm {
  const base = current ?? CARRYOVER_DEFAULTS;
  return { ...base, exclusionDeclared: { ...base.exclusionDeclared, ...patch } };
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function CarryoverGiftBlock({ asset, transferDate, onChange }: Props) {
  const c = asset.carryover ?? CARRYOVER_DEFAULTS;

  // 시행시기 가드: 양도일 < 2024-01-01 이면 증여자 자본적지출 비활성
  const isAfter2024 = transferDate >= "2024-01-01";

  /**
   * 일반건물은 하나의 증여가 **토지·건물 두 자산**으로 갈린다 —
   * 증여세 상당액을 엔진이 영 §163의2②로 안분하므로 입력 칸이 달라진다.
   */
  const isGeneralBuilding = asset.assetKind === "general_building";

  function updateCarryover(patch: Partial<CarryoverTaxationForm>) {
    onChange({ carryover: patchCarryover(asset.carryover, patch) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-800">이월과세(증여) 정보</p>
        <LegalBadge text="소득세법 §97조의2" />
        <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
      </div>

      {/* ① 증여 기본 정보 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">1</span>
          <p className="text-xs font-semibold text-amber-700">증여 기본 정보</p>
        </div>

        <FieldCard
          label="증여 등기접수일"
          hint="소득세법 §97조의2 ③ — 이월과세 적용기간 기산일 (등기부 기재일)"
          trailing={<LawArticleModal legalBasis="소득세법 §97의2 ③" label="§97의2③" />}
        >
          <DateInput
            value={c.giftRegistryDate}
            onChange={(v) => updateCarryover({ giftRegistryDate: v })}
          />
        </FieldCard>

        <FieldCard
          label="증여자 취득일"
          hint="보유기간·장기보유특별공제 기산일 (소득세법 §95 ④)"
        >
          <DateInput
            value={c.donorAcquisitionDate}
            onChange={(v) => updateCarryover({ donorAcquisitionDate: v })}
          />
        </FieldCard>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">증여자 취득원인</p>
          <RadioCardGroup
            name="donorAcquisitionCause"
            tone="amber"
            layout="inline"
            options={DONOR_CAUSE_OPTIONS}
            value={c.donorAcquisitionCause}
            onChange={(v) => updateCarryover({ donorAcquisitionCause: v as CarryoverTaxationForm["donorAcquisitionCause"] })}
          />
        </div>
      </div>

      {/* ② 증여자 취득가액 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">2</span>
          <p className="text-xs font-semibold text-amber-700">증여자 취득가액</p>
        </div>

        <ToggleCard
          tone="amber"
          title="환산취득가 사용"
          description="증여자 실거래가를 알 수 없거나, 기준시가 환산·PHD·APD 방식을 적용하는 경우"
          checked={c.useEstimatedAcquisition}
          onCheckedChange={(v) =>
            updateCarryover({
              useEstimatedAcquisition: v,
              // 토글 OFF 시 환산 모드 초기화
              estimationMode: v ? c.estimationMode : null,
            })
          }
        />

        {/* 환산 OFF: 증여자 실거래가 직접 입력 */}
        {!c.useEstimatedAcquisition && (
          <FieldCard
            label="증여자 취득가액"
            hint="증여자의 실제 취득가액 (매매계약서·상속세신고서 등 증빙 기준)"
          >
            <CurrencyInput
              label=""
              value={c.donorAcquisitionPrice}
              onChange={(v) => updateCarryover({ donorAcquisitionPrice: v })}
              placeholder="증여자 취득가액 (원)"
            />
          </FieldCard>
        )}

        {/* 환산 ON: 환산 방식 선택 + 방식별 입력 패널 */}
        {c.useEstimatedAcquisition && (
          <CarryoverEstimationSection
            asset={asset}
            carryover={c}
            transferDate={transferDate}
            onCarryoverChange={(patch) => updateCarryover(patch)}
            onAssetChange={(patch) => onChange(patch)}
          />
        )}
      </div>

      {/* ③ 필요경비 가산 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">3</span>
          <p className="text-xs font-semibold text-amber-700">필요경비 가산</p>
        </div>

        {/*
          🔑 **일반건물은 자산이 토지·건물로 갈린다** — 증여세 상당액을 사용자가 안분해 넣으면
             검산이 불가능하고, 두 파트 합이 산출세액을 넘어도 막을 수 없다.
             ⇒ 산출세액·과세가액을 받아 **엔진이 영 §163의2②로 파트별 산정**한다.
             다른 자산종류는 종전대로 안분된 값을 직접 받는다(의미가 다른 값이라 병존시킨다).
        */}
        {isGeneralBuilding ? (
          <>
            <FieldCard
              label="증여세 산출세액"
              hint="「소득세법 시행령」 제163조의2 제2항 제1호 — 증여받은 자산 전체에 대한 증여세 산출세액. 토지·건물 몫은 아래 과세가액으로 자동 안분됩니다."
              trailing={<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="시행령 §163의2" />}
            >
              <CurrencyInput
                label=""
                value={c.giftTaxCalculated}
                onChange={(v) => updateCarryover({ giftTaxCalculated: v })}
                placeholder="증여세 산출세액 (없으면 0)"
              />
            </FieldCard>

            <FieldCard
              label="증여세 과세가액"
              hint="「상속세 및 증여세법」 제47조 과세가액 — 안분 분모입니다. 증여받은 재산 전체 기준."
            >
              <CurrencyInput
                label=""
                value={c.giftTaxBase}
                onChange={(v) => updateCarryover({ giftTaxBase: v })}
                placeholder="증여세 과세가액"
              />
            </FieldCard>
          </>
        ) : (
          <FieldCard
            label="증여세 상당액"
            hint="소득세법 시행령 §163의2②: 증여세 산출세액 × (양도한 해당 자산가액 ÷ 증여세 과세가액). 미신고 시 0 입력."
            trailing={<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="시행령 §163의2" />}
          >
            <CurrencyInput
              label=""
              value={c.giftTaxAmount}
              onChange={(v) => updateCarryover({ giftTaxAmount: v })}
              placeholder="증여세 상당액 (없으면 0)"
            />
          </FieldCard>
        )}

        <FieldCard
          label="증여자 자본적지출"
          hint={
            isAfter2024
              ? "증여자가 보유기간 중 지출한 자본적 지출액 (소득세법 §97조의2 ① 2호)"
              : "2024.1.1. 이후 양도분부터 적용 (2023.12.31. 신설)"
          }
          trailing={<LawArticleModal legalBasis="소득세법 §97의2 ① 2호" label="§97의2①2호" />}
        >
          <CurrencyInput
            label=""
            value={c.donorCapitalExpenditure}
            onChange={(v) => updateCarryover({ donorCapitalExpenditure: v })}
            placeholder={isAfter2024 ? "없으면 비워두세요" : "해당 없음"}
            disabled={!isAfter2024}
          />
        </FieldCard>
      </div>

      {/* ④ 비교과세 기준 — Scenario B 취득가 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">4</span>
          <p className="text-xs font-semibold text-amber-700">비교과세 기준 (미적용 시나리오)</p>
        </div>

        <FieldCard
          label="증여 당시 평가액"
          hint="이월과세 미적용 시나리오(B)에서 수증자의 취득가액으로 사용. 보충적평가액·시가·감정가 중 해당 금액."
        >
          <CurrencyInput
            label=""
            value={c.giftDateValuation}
            onChange={(v) => updateCarryover({ giftDateValuation: v })}
            placeholder="증여 당시 보충적평가액 또는 시가"
          />
        </FieldCard>
      </div>

      {/* ⑤ 적용배제 선언 */}
      <div className="rounded-md border border-rose-200/70 bg-rose-50/40 p-3">
        <CarryoverGiftExclusionSection
          exclusionDeclared={c.exclusionDeclared}
          onChange={(patch) =>
            onChange({ carryover: patchExclusion(asset.carryover, patch) })
          }
        />
      </div>
    </div>
  );
}
