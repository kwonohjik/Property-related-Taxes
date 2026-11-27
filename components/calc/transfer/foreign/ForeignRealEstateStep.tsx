"use client";

/**
 * ForeignRealEstateStep — 국외자산 부동산 입력(1단계) — 납세의무 · 국외자산 카드(여러 건) · 외국납부세액
 *
 * 국외를 고르면 국내 자산 카드·판정 불러오기·함께 양도 토글은 마운트하지 않는다(`Step1Entry`). 국외 자산은 최대 `FOREIGN_RE_MAX_ASSETS`건
 * (사용자 결정 C-1 — 처음부터 여러 건)이고 거주 연수는 폼 전역 정수 1칸이다(C-2). 미등기 칸은 없다(C-3) — 안내 카드만.
 * 이 단계에서는 세액을 계산하지 않는다 — 계산 연결은 U2(`FOREIGN_CALC_PENDING_MESSAGE`).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { FOREIGN_RE_MAX_ASSETS } from "@/lib/api/transfer-foreign-schema";
import { FOREIGN_CALC_PENDING_MESSAGE } from "@/lib/calc/transfer-foreign-pending";
import { isForeignResidenceBoundaryAmbiguous, isForeignResidenceUnderMin } from "@/lib/calc/transfer-foreign-scope";
import { makeDefaultForeignAsset, type ForeignAssetForm } from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { ForeignAssetCard } from "./ForeignAssetCard";
import { ForeignTaxSection } from "./ForeignTaxSection";
import { RESIDENCE_BOUNDARY_NOTICE, RESIDENCE_UNDER_MIN_NOTICE, UNREGISTERED_NOTICE } from "./foreign-ui-shared";

interface Props {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
  /** 카드 인덱스 → ⑧의 첫 오류 메시지(인라인 배너) */
  assetErrors?: Record<number, string>;
}

export function ForeignRealEstateStep({ form, onChange, assetErrors }: Props) {
  const assets = form.foreignAssets;

  function updateAsset(index: number, patch: Partial<ForeignAssetForm>) {
    onChange({ foreignAssets: assets.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  }

  return (
    <div className="space-y-4" data-testid="foreign-real-estate-step">
      {/* 납세의무 (§118의2) */}
      <ToneCard tone="rose" title="납세의무 (소득세법 §118의2)" bodyClassName="space-y-3">
        <FieldCard
          label="국내 거주 연수"
          required
          field="foreignResidenceYears"
          hint="양도일까지 계속 국내에 주소 또는 거소를 둔 기간을 만 년 정수로 입력하세요. 5년 이상이어야 납세의무가 있습니다."
        >
          <DecimalInput
            value={form.foreignResidenceYears}
            onChange={(foreignResidenceYears) => onChange({ foreignResidenceYears })}
            className="w-40"
            unit="년"
          />
        </FieldCard>
        {isForeignResidenceUnderMin(form.foreignResidenceYears) && (
          <div data-testid="foreign-residence-under-min">
            <ToneCard tone="amber">
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{RESIDENCE_UNDER_MIN_NOTICE}</p>
            </ToneCard>
          </div>
        )}
        {isForeignResidenceBoundaryAmbiguous(form.foreignResidenceYears, assets.map((a) => a.transferDate)) && (
          <div data-testid="foreign-residence-boundary">
            <ToneCard tone="amber">
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{RESIDENCE_BOUNDARY_NOTICE}</p>
            </ToneCard>
          </div>
        )}
        <div data-testid="foreign-unregistered-notice">
          <ToneCard tone="sky">
            <p className="text-xs leading-relaxed text-sky-800 dark:text-sky-300">{UNREGISTERED_NOTICE}</p>
          </ToneCard>
        </div>
      </ToneCard>

      {/* 국외자산 카드 (여러 건) */}
      {assets.map((a, i) => (
        <ForeignAssetCard
          key={a.id}
          index={i}
          asset={a}
          count={assets.length}
          onChange={(patch) => updateAsset(i, patch)}
          onRemove={() => onChange({ foreignAssets: assets.filter((_, j) => j !== i) })}
          errorMessage={assetErrors?.[i]}
        />
      ))}
      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={assets.length >= FOREIGN_RE_MAX_ASSETS}
          onClick={() => onChange({ foreignAssets: [...assets, makeDefaultForeignAsset()] })}
          data-testid="foreign-add-asset"
        >
          + 국외자산 추가
        </Button>
        <p className="text-xs text-muted-foreground">
          같은 과세기간(양도일 연도)에 양도한 국외자산을 모두 추가하세요. 최대 {FOREIGN_RE_MAX_ASSETS}건까지 입력할 수 있습니다.
        </p>
      </div>

      <ForeignTaxSection form={form} onChange={onChange} />

      <div data-testid="foreign-calc-pending-notice">
        <ToneCard tone="slate">
          <p className="text-xs leading-relaxed text-muted-foreground">{FOREIGN_CALC_PENDING_MESSAGE}</p>
        </ToneCard>
      </div>
    </div>
  );
}
