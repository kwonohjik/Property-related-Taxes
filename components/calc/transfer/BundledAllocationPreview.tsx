"use client";

import { useMemo } from "react";
import { apportionBundledSale, type BundledAssetInput } from "@/lib/tax-engine/bundled-sale-apportionment";
import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { CompanionAssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

interface Props {
  form: TransferFormData;
}

export function BundledAllocationPreview({ form }: Props) {
  const result = useMemo(() => {
    const totalSalePrice = parseAmount(form.transferPrice);
    const primaryStd = parseAmount(form.standardPriceAtTransfer);
    if (!totalSalePrice || !primaryStd || !form.companionAssets?.length) return null;

    const companionValid = form.companionAssets.every(
      (a) => parseAmount(a.standardPriceAtTransfer) > 0,
    );
    if (!companionValid) return null;

    const assets: BundledAssetInput[] = [
      {
        assetId: "primary",
        assetLabel: "주된 자산",
        assetKind: form.propertyType === "land" ? "land" : "housing",
        standardPriceAtTransfer: primaryStd,
      },
      ...form.companionAssets.map(
        (a: CompanionAssetForm): BundledAssetInput => ({
          assetId: a.assetId,
          assetLabel: a.assetLabel,
          assetKind: a.assetKind,
          standardPriceAtTransfer: parseAmount(a.standardPriceAtTransfer),
        }),
      ),
    ];

    try {
      return apportionBundledSale({ totalSalePrice, assets });
    } catch {
      return null;
    }
  }, [form.transferPrice, form.standardPriceAtTransfer, form.companionAssets, form.propertyType]);

  if (!result) return null;

  const total = result.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0);

  return (
    <div className="mt-3 rounded-md border bg-blue-50/50 p-3">
      <p className="text-xs font-medium text-blue-800 mb-2">
        안분 미리보기 (소득령 §166⑥ 기준시가 비율)
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="pb-1 pr-2">구분</th>
            <th className="pb-1 pr-2 text-right">기준시가</th>
            <th className="pb-1 text-right">안분 양도가액</th>
          </tr>
        </thead>
        <tbody>
          {result.apportioned.map((a) => (
            <tr key={a.assetId} className="border-b last:border-0">
              <td className="py-1 pr-2">{
                a.assetId === "primary"
                  ? "주된 자산"
                  : form.companionAssets?.find((c) => c.assetId === a.assetId)?.assetLabel ?? a.assetId
              }</td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(
                  a.assetId === "primary"
                    ? parseAmount(form.standardPriceAtTransfer)
                    : parseAmount(
                        form.companionAssets?.find((c) => c.assetId === a.assetId)
                          ?.standardPriceAtTransfer ?? "0",
                      ),
                )}
              </td>
              <td className="py-1 text-right font-mono font-medium">
                {formatKRW(a.allocatedSalePrice)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium text-blue-900">
            <td className="pt-1 pr-2">합계</td>
            <td />
            <td className="pt-1 text-right font-mono">{formatKRW(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
