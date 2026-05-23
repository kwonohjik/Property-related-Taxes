"use client";

/**
 * Page2NetAssetTable — 별지 부표3 제2쪽 4.순자산가액
 *
 * 표 구조 (상증령 §55① + §17의2 1·2·3·4호 매핑):
 *   가. 자산총액 ①~⑧
 *     ⑥(선급비용)·⑦(증자일 전 잉여금)은 차감
 *     ⑧ 소계 = (① + ② + ③ + ④ + ⑤) − (⑥ + ⑦)
 *   나. 부채총액 ⑨~⑲
 *     ⑮·⑯·⑰·⑱는 차감
 *     ⑲ 소계 = (⑨ + ⑩ + ⑪ + ⑫ + ⑬ + ⑭) − (⑮ + ⑯ + ⑰ + ⑱)
 *   다. 영업권포함전 순자산가액 (⑧ − ⑲)
 *   라. 영업권 → 제5쪽 자.영업권평가액
 *   마. 순자산가액 (다 + 라)
 *
 * PDF: ~/Downloads/비상장주식 평가 사례.pdf page=8 좌측 (사례 6)
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md §3.2
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md §4
 */

import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, SectionTitle } from "./BesshiSharedAtoms";

export interface Page2NetAssetTableProps {
  raw: UnlistedNetAssetCalculation;
  netAssetTotal: number; // 마. (= 다 + 라)
  goodwillFinal: number; // 라. 영업권 평가액
}

interface Page2Row {
  cellNum: string;
  label: string;
  amount: number;
  isSubtract?: boolean; // 차감 항목 (⑥·⑦·⑮·⑯·⑰·⑱)
  testid: string;
  footnote?: string;
}

export function Page2NetAssetTable({ raw, netAssetTotal, goodwillFinal }: Page2NetAssetTableProps) {
  const assetRows: Page2Row[] = [
    { cellNum: "①", label: "재무상태표상의 자산가액", amount: raw.bsTotalAssets, testid: "p2-①" },
    { cellNum: "②", label: "평가차액", amount: raw.assetValuationDelta, testid: "p2-②", footnote: "제4쪽 5.가.② 기재" },
    { cellNum: "③", label: "법인세법상 유보금액", amount: raw.corpTaxReservedAmount, testid: "p2-③" },
    { cellNum: "④", label: "유상증자 등", amount: raw.paidInCapitalIncrease, testid: "p2-④" },
    { cellNum: "⑤", label: "평가기준일 현재 지급받을 권리 확정 가액", amount: raw.otherEarnedRights, testid: "p2-⑤" },
    { cellNum: "⑥", label: "선급비용 등", amount: raw.prepaidExpenses, isSubtract: true, testid: "p2-⑥" },
    { cellNum: "⑦", label: "증자일 전의 잉여금의 유보액", amount: raw.preGiftRetainedEarnings, isSubtract: true, testid: "p2-⑦" },
  ];

  const assetSubtotal =
    raw.bsTotalAssets +
    raw.assetValuationDelta +
    raw.corpTaxReservedAmount +
    raw.paidInCapitalIncrease +
    raw.otherEarnedRights -
    raw.prepaidExpenses -
    raw.preGiftRetainedEarnings;

  const liabilityRows: Page2Row[] = [
    { cellNum: "⑨", label: "재무상태표상의 부채액", amount: raw.bsTotalLiabilities, testid: "p2-⑨" },
    { cellNum: "⑩", label: "법인세", amount: raw.corporateTaxPayable, testid: "p2-⑩" },
    { cellNum: "⑪", label: "농어촌특별세", amount: raw.farmingSurtax, testid: "p2-⑪" },
    { cellNum: "⑫", label: "지방소득세", amount: raw.localIncomeTax, testid: "p2-⑫" },
    { cellNum: "⑬", label: "배당금·상여금", amount: raw.dividendPayable, testid: "p2-⑬" },
    { cellNum: "⑭", label: "퇴직급여추계액", amount: raw.retirementProvision, testid: "p2-⑭" },
    { cellNum: "⑮", label: "기타충당금", amount: raw.otherProvision, isSubtract: true, testid: "p2-⑮" },
    { cellNum: "⑯", label: "제준비금", amount: raw.reserveExcluded, isSubtract: true, testid: "p2-⑯" },
    { cellNum: "⑰", label: "제충당금", amount: raw.allowanceExcluded, isSubtract: true, testid: "p2-⑰" },
    { cellNum: "⑱", label: "기타(이연법인세대 등)", amount: raw.deferredTaxAdjustment, isSubtract: true, testid: "p2-⑱" },
  ];

  const liabilitySubtotal =
    raw.bsTotalLiabilities +
    raw.corporateTaxPayable +
    raw.farmingSurtax +
    raw.localIncomeTax +
    raw.dividendPayable +
    raw.retirementProvision -
    raw.otherProvision -
    raw.reserveExcluded -
    raw.allowanceExcluded -
    raw.deferredTaxAdjustment;

  // 다. 영업권포함전 순자산가액 = ⑧ − ⑲
  const preGoodwill = assetSubtotal - liabilitySubtotal;

  return (
    <section aria-label="제2쪽 4. 순자산가액">
      <SectionTitle>4. 순자산가액 (별지 제2쪽)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <thead>
          <tr className="bg-gray-100 print:bg-gray-100">
            <th className="border border-black p-1 w-12 text-center">번호</th>
            <th className="border border-black p-1 text-left">항목</th>
            <th className="border border-black p-1 text-right w-32">금액(차감)</th>
            <th className="border border-black p-1 text-right w-40">금액(가산·소계)</th>
          </tr>
        </thead>
        <tbody>
          {/* 가. 자산총액 */}
          <tr className="bg-gray-50 font-bold print:bg-gray-50">
            <td colSpan={4} className="border border-black p-1">
              가. 자산총액
            </td>
          </tr>
          {assetRows.map((row) => (
            <tr key={row.testid} data-besshi-cell={row.testid} data-testid={row.testid}>
              <td className="border border-black p-1 text-center font-mono">{row.cellNum}</td>
              <td className="border border-black p-1">
                {row.label}
                {row.footnote && <span className="text-[9px] text-gray-600 ml-1">→ {row.footnote}</span>}
              </td>
              <td className="border border-black p-1 text-right font-mono">
                {row.isSubtract ? fmt(row.amount) : ""}
              </td>
              <td className="border border-black p-1 text-right font-mono">
                {!row.isSubtract ? fmt(row.amount) : ""}
              </td>
            </tr>
          ))}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p2-⑧" data-testid="p2-⑧">
            <td className="border border-black p-1 text-center font-mono">⑧</td>
            <td className="border border-black p-1">소계 (①+②+③+④+⑤−⑥−⑦)</td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-mono">{fmt(assetSubtotal)}</td>
          </tr>

          {/* 나. 부채총액 */}
          <tr className="bg-gray-50 font-bold print:bg-gray-50">
            <td colSpan={4} className="border border-black p-1">
              나. 부채총액
            </td>
          </tr>
          {liabilityRows.map((row) => (
            <tr key={row.testid} data-besshi-cell={row.testid} data-testid={row.testid}>
              <td className="border border-black p-1 text-center font-mono">{row.cellNum}</td>
              <td className="border border-black p-1">{row.label}</td>
              <td className="border border-black p-1 text-right font-mono">
                {row.isSubtract ? fmt(row.amount) : ""}
              </td>
              <td className="border border-black p-1 text-right font-mono">
                {!row.isSubtract ? fmt(row.amount) : ""}
              </td>
            </tr>
          ))}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p2-⑲" data-testid="p2-⑲">
            <td className="border border-black p-1 text-center font-mono">⑲</td>
            <td className="border border-black p-1">소계 (⑨+⑩+⑪+⑫+⑬+⑭−⑮−⑯−⑰−⑱)</td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-mono">{fmt(liabilitySubtotal)}</td>
          </tr>

          {/* 다·라·마 */}
          <tr className="border-t-2 border-black" data-besshi-cell="p2-다" data-testid="p2-다">
            <td className="border border-black p-1 text-center font-mono">다</td>
            <td className="border border-black p-1">영업권 포함 전 순자산가액 (⑧ − ⑲)</td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-mono">{fmt(preGoodwill)}</td>
          </tr>
          <tr data-besshi-cell="p2-라" data-testid="p2-라">
            <td className="border border-black p-1 text-center font-mono">라</td>
            <td className="border border-black p-1">
              영업권
              <span className="text-[9px] text-gray-600 ml-1">← 제5쪽 6.자.영업권 평가액</span>
            </td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwillFinal)}</td>
          </tr>
          <tr
            className="bg-emerald-50 font-bold print:bg-emerald-50"
            data-besshi-cell="p2-마"
            data-testid="p2-마"
          >
            <td className="border border-black p-1 text-center font-mono">마</td>
            <td className="border border-black p-1">순자산가액 (다 + 라)</td>
            <td className="border border-black p-1"></td>
            <td className="border border-black p-1 text-right font-mono">{fmt(netAssetTotal)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
