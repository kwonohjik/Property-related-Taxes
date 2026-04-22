"use client";

import { useMemo } from "react";
import { apportionBundledSale, type BundledAssetInput } from "@/lib/tax-engine/bundled-sale-apportionment";
import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

interface Props {
  form: TransferFormData;
}

function toEngineKind(kind: string): "housing" | "land" | "building" {
  if (kind === "land") return "land";
  if (kind === "building") return "building";
  return "housing";
}

export function BundledAllocationPreview({ form }: Props) {
  const result = useMemo(() => {
    const { assets, contractTotalPrice, bundledSaleMode } = form;
    if (bundledSaleMode !== "apportioned" || assets.length < 2) return null;

    const totalSalePrice = parseAmount(contractTotalPrice);
    if (!totalSalePrice) return null;

    const engineAssets: BundledAssetInput[] = assets.map((a, i) => ({
      assetId: a.assetId,
      assetLabel: a.assetLabel || `자산 ${i + 1}`,
      assetKind: toEngineKind(a.assetKind),
      standardPriceAtTransfer: parseAmount(a.standardPriceAtTransfer),
    }));

    if (engineAssets.some((a) => a.standardPriceAtTransfer <= 0)) return null;

    try {
      return apportionBundledSale({ totalSalePrice, assets: engineAssets });
    } catch {
      return null;
    }
  }, [form]);

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
          {result.apportioned.map((a) => {
            const asset = form.assets.find((x) => x.assetId === a.assetId);
            return (
              <tr key={a.assetId} className="border-b last:border-0">
                <td className="py-1 pr-2">{asset?.assetLabel ?? a.assetId}</td>
                <td className="py-1 pr-2 text-right font-mono">
                  {formatKRW(parseAmount(asset?.standardPriceAtTransfer ?? "0"))}
                </td>
                <td className="py-1 text-right font-mono font-medium">
                  {formatKRW(a.allocatedSalePrice)}
                </td>
              </tr>
            );
          })}
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
