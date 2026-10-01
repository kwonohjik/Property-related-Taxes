"use client";

/**
 * SellingHouseTaxIncentiveRentalSection — **양도하는 주택 자신**이 감면대상장기임대주택인 경우 (소령 §167의3①3호)
 *
 * 🔴 종전에는 입력 경로가 없었다. 우회로 쓰던 「조특법 감면주택(5호)」 토글은 근거 호가 다르고
 *    (5호 = 조특법 §77·§98의2·§98의3·§98의5~§98의8·§99·§99의2·§99의3) 요건(5년 임대·국민주택·후단)을
 *    전혀 확인하지 않았다.
 *
 * 노출 게이트는 2호 섹션과 같은 **2채**다(`sellingHouseTaxIncentiveRentalVisible`). 조특법 §98 감면을
 * 감면 단계에서 입력해 적격이면 엔진이 이 선언 없이도 배제한다(`resolveSurchargeExclusionByReduction`) —
 * 두 경로는 OR로 공존한다.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TaxIncentiveRentalFields } from "@/components/calc/transfer/TaxIncentiveRentalFields";
import {
  effectiveSellingTaxIncentiveRental,
  sellingTaxIncentiveSharesNationalSize,
  sellingTaxIncentiveSharesRentalFacts,
} from "@/lib/calc/tax-incentive-rental-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

interface Props {
  value: SellingExclusion | undefined;
  onChange: (v: SellingExclusion | undefined) => void;
}

export function SellingHouseTaxIncentiveRentalSection({ value, onChange }: Props) {
  const v = value ?? {};
  const tir = v.taxIncentiveRental ?? {};
  const eff = effectiveSellingTaxIncentiveRental(v);

  function patch(partial: TaxIncentiveRentalFacts) {
    onChange({ ...v, taxIncentiveRental: { ...tir, ...partial } });
  }

  return (
    <ToneCard tone="violet" bodyClassName="space-y-2.5" title="양도 주택이 조특법 감면 임대주택인 경우" noDark>
      <p className="text-caption text-muted-foreground/80">
        양도하는 주택 자체가 「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라 양도소득세가 감면되는
        임대주택으로서 5년 이상 임대한 국민주택이면 중과 대상에서 제외됩니다 (소령 §167의3①3호 · 2주택은
        §167의10①2호 준용). 조특법 §98 감면은 감면 단계에서 입력해 요건을 충족하면 자동으로 반영됩니다.
      </p>

      <ToggleCard
        variant="card"
        tone="violet"
        checked={tir.isTaxIncentiveRental ?? false}
        onCheckedChange={(b) =>
          onChange({ ...v, taxIncentiveRental: b ? { ...tir, isTaxIncentiveRental: true } : undefined })
        }
        title="양도 주택이 조특법 감면 임대주택"
        description="조특법 §97·§97의2·§98에 따라 양도소득세가 감면되는 임대주택 (소령 §167의3①3호)"
        data-testid="selling-tax-incentive-rental-toggle"
      >
        <TaxIncentiveRentalFields
          value={tir}
          onPatch={patch}
          idPrefix="selling"
          isApartment={eff?.isApartment ?? false}
          showApartmentToggle
          rentalPeriodSharedWith2ho={sellingTaxIncentiveSharesRentalFacts(v)}
          nationalSizeSharedWith2ho={sellingTaxIncentiveSharesNationalSize(v)}
        />
      </ToggleCard>
    </ToneCard>
  );
}
