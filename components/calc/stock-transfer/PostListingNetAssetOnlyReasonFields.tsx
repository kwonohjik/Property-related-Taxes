"use client";

/**
 * 취득 후 상장 환산(소령 §165⑤·⑥) — 분모·분자의 §165④3 순자산 단독 사유 (U-14)
 *
 * §165⑤는 환산식의 분모·분자를 「상장일 현재의 제4항에 따른 평가액」·「취득일 현재의 제4항에 따른 평가액」이라
 * 부른다. 제4항 3호(각 목 사유 → 「제1호 각 목 외의 부분에도 불구하고」 순자산가치)도 제4항이라 그 쪽 평가는
 * 순자산가치 단독(80% 하한 없음)이다. 엔진 `calcPostListingSideValue`가 쪽마다 사유를 읽는다.
 *
 * - 분모(상장일 현재) → `listingNetAssetOnlyReason`
 * - 분자(취득일 현재) → `acquisitionNetAssetOnlyReason` — 비상장 보충평가의 「취득 당시 사유」와 같은 뜻이라 같은 칸을 쓴다
 *
 * 선택지·연혁 필터는 비상장 블록과 같은 leaf(`netAssetOnlyReasonOptionsFor`). 2007.2.27. 이전 양도는 사유가 없어 칸을 숨긴다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { effectiveTransferDate } from "@/lib/calc/stock-effective-transfer-date";
import { netAssetOnlyReasonOptionsFor } from "./net-asset-only-reason-options";

type Reason = StockTransferFormData["netAssetOnlyReason"];

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PostListingNetAssetOnlyReasonFields({ form, onChange }: Props) {
  const transferDate = toOptionalDate(effectiveTransferDate(form));
  const listingReason = form.listingNetAssetOnlyReason || "";
  const acquisitionReason = form.acquisitionNetAssetOnlyReason || "";
  const listingOptions = netAssetOnlyReasonOptionsFor(listingReason, transferDate);
  const acquisitionOptions = netAssetOnlyReasonOptionsFor(acquisitionReason, transferDate);

  return (
    <>
      {listingOptions.length > 1 && (
        <FieldCard
          stacked
          label="상장일 현재 순자산 단독 평가 사유 (§165④3 — 환산식 분모)"
          hint="상장일이 속하는 사업연도 기준의 사실. 해당하면 상장연도 평가는 순자산가치만으로 하고 순손익가치는 쓰지 않습니다. 없으면 '해당 없음'으로 둡니다."
        >
          <RadioCardGroup
            name="listingNetAssetOnlyReason"
            value={listingReason}
            onChange={(v) => onChange({ listingNetAssetOnlyReason: v as Reason })}
            tone="amber"
            layout="stack"
            columns={2}
            options={listingOptions}
          />
        </FieldCard>
      )}
      {acquisitionOptions.length > 1 && (
        <FieldCard
          stacked
          label="취득일 현재 순자산 단독 평가 사유 (§165④3 — 환산식 분자)"
          hint="취득일이 속하는 사업연도 기준의 사실(예: 취득 당시 사업개시 후 1년 미만). 해당하면 취득연도 평가는 순자산가치만으로 하고 순손익가치는 쓰지 않습니다. 없으면 '해당 없음'으로 둡니다."
        >
          <RadioCardGroup
            name="acquisitionNetAssetOnlyReason"
            value={acquisitionReason}
            onChange={(v) => onChange({ acquisitionNetAssetOnlyReason: v as Reason })}
            tone="amber"
            layout="stack"
            columns={2}
            options={acquisitionOptions}
          />
        </FieldCard>
      )}
    </>
  );
}
