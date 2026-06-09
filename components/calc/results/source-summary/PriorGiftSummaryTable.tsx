/**
 * Table D — 사전증여 요약 (이미지 35 하단 재현).
 *
 * 데이터: priorGifts[] (input). beneficiaryType + doneeRelation 결합으로 관계 라벨 도출.
 * 엔진 변경 0 — PriorGift.computedTax 등 input 직접 echo.
 */
"use client";

import type { PriorGift, GiftPriorPropertyCategory } from "@/lib/tax-engine/types/inheritance-prior-gift.types";
import { resolveBeneficiaryLabel } from "./source-summary-constants";
import { formatCellOrDash, formatGiftDate } from "./source-summary-helpers";

interface Props {
  priorGifts: PriorGift[];
}

const PROPERTY_CATEGORY_LABEL: Record<GiftPriorPropertyCategory, string> = {
  cash: "현금",
  real_estate_land: "토지",
  real_estate_individual_house: "개별주택",
  real_estate_apartment: "공동주택",
  real_estate_officetel: "오피스텔·상업용",
  real_estate_building: "일반건물",
  real_estate_acquisition_right: "부동산 취득권리",
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
  financial: "금융재산",
  deposit: "예금",
  other: "기타",
};

const DONOR_RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  lineal_descendant: "직계비속",
  lineal_ascendant_adult: "직계존속",
  lineal_ascendant_minor: "직계존속(미성년)",
  other_relative: "기타친족",
};

function resolveDoneeRelationLabel(gift: PriorGift): string | undefined {
  const rel = gift.doneeRelation;
  if (!rel) return undefined;
  return DONOR_RELATION_LABEL[rel] ?? rel;
}

function resolveItemLabel(gift: PriorGift): string {
  if (gift.propertyCategory) return PROPERTY_CATEGORY_LABEL[gift.propertyCategory];
  if (gift.beneficiaryType === "corporate") return "대여금";
  return "기타";
}

function resolveDetailLabel(gift: PriorGift): string {
  const parts: string[] = [];
  if (gift.propertyName) parts.push(gift.propertyName);
  if (gift.propertyLocation && gift.propertyLocation !== gift.propertyName) {
    parts.push(gift.propertyLocation);
  }
  return parts.join(" ") || "-";
}

export function PriorGiftSummaryTable({ priorGifts }: Props) {
  if (!priorGifts || priorGifts.length === 0) return null;

  const totalAmount = priorGifts.reduce((acc, g) => acc + g.giftAmount, 0);
  const totalDeduction = priorGifts.reduce(
    (acc, g) =>
      acc + Math.max(0, g.giftAmount - (g.giftTaxBase ?? g.giftAmount)),
    0,
  );
  const totalBase = priorGifts.reduce(
    (acc, g) => acc + (g.giftTaxBase ?? 0),
    0,
  );
  const totalComputed = priorGifts.reduce(
    (acc, g) => acc + (g.computedTax ?? 0),
    0,
  );

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h4 className="text-sm font-semibold text-slate-800">
          (4) 사전증여의 요약
        </h4>
      </div>
      <table className="w-full text-xs" data-testid="prior-gift-summary-table">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="border border-slate-200 px-2 py-1.5 text-center">관계</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">증여일시</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">증여물건</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">세부내역</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">증여재산가액</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">증여재산공제</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">증여세 과세표준</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">증여세 산출세액</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">비고</th>
          </tr>
        </thead>
        <tbody>
          {priorGifts.map((gift, i) => {
            const deduction = Math.max(
              0,
              gift.giftAmount - (gift.giftTaxBase ?? gift.giftAmount),
            );
            return (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1.5 text-center">
                  {resolveBeneficiaryLabel(
                    gift.beneficiaryType,
                    resolveDoneeRelationLabel(gift),
                  )}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-center">
                  {formatGiftDate(gift.giftDate)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-center">
                  {resolveItemLabel(gift)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5">
                  {resolveDetailLabel(gift)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {gift.giftAmount.toLocaleString()}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatCellOrDash(deduction)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatCellOrDash(gift.giftTaxBase)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatCellOrDash(gift.computedTax)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">
                  {gift.beneficiaryType === "corporate" ? "§3의2②" : ""}
                </td>
              </tr>
            );
          })}
          <tr className="bg-amber-50 font-semibold">
            <td
              colSpan={4}
              className="border border-slate-200 px-2 py-1.5 text-center"
            >
              소계
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalAmount.toLocaleString()}
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalDeduction.toLocaleString()}
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalBase.toLocaleString()}
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalComputed.toLocaleString()}
            </td>
            <td className="border border-slate-200"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
