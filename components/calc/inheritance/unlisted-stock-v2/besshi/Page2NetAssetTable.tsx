"use client";

/**
 * Page2NetAssetTable — 별지 부표3 제2쪽 4.순자산가액 (공식 2025.07.10 양식)
 *
 * 공식 레이아웃: [번호+라벨][값 1열][회색 참조열]
 *   가. 자산총액 ①~⑧ (⑥⑦ 차감)        ⑧ = ①+②+③+④+⑤−⑥−⑦
 *   나. 부채총액 ⑨~⑲ (⑮ 가산, ⑯⑰⑱ 차감)  ⑲ = ⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱
 *   다. 영업권포함전 순자산가액 (⑧ − ⑲)
 *   라. 영업권 (회색 참조 → 제5쪽 6. 영업권 「자」)
 *   마. 순자산가액 (다 + 라)
 *
 * 라벨·참조·부호는 `besshi-form-constants.ts`에 단일 출처화 (PDF `Page2NetAsset`와 공유).
 *
 * 법령: 상증령 §55① + §17의2 (⑮ = §17의2 3호 가 → 가산)
 * PDF: ~/Downloads/비상장주식 평가 사례.pdf page=8 좌측 (사례 6)
 */

import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { withResolvedEvaluationDelta } from "@/lib/tax-engine/property-valuation/evaluation-delta";
import { fmt, SectionTitle } from "./BesshiSharedAtoms";
import {
  BESSHI_P2_SECTION4,
  BESSHI_P2_ASSET_ROWS,
  BESSHI_P2_LIABILITY_ROWS,
  sumNetAssetRows,
} from "./besshi-form-constants";

export interface Page2NetAssetTableProps {
  raw: UnlistedNetAssetCalculation;
  netAssetTotal: number; // 마. (= 다 + 라)
  goodwillFinal: number; // 라. 영업권 평가액
}

export function Page2NetAssetTable({ raw, netAssetTotal, goodwillFinal }: Page2NetAssetTableProps) {
  // ② 평가차액: 행 단위 입력 시 resolveEvaluationDelta 보정값으로 치환 (raw.assetValuationDelta 직접 사용 시 행 모드 stale)
  const eff = withResolvedEvaluationDelta(raw);
  // 화면·PDF·엔진(`net-asset-calc`) 동일 부호 — ⑮은 가산
  const assetSubtotal = sumNetAssetRows(BESSHI_P2_ASSET_ROWS, eff);
  const liabilitySubtotal = sumNetAssetRows(BESSHI_P2_LIABILITY_ROWS, eff);
  const preGoodwill = assetSubtotal - liabilitySubtotal;

  return (
    <section aria-label="제2쪽 4. 순자산가액">
      <div className="flex items-center justify-between text-micro text-gray-600">
        <span>{BESSHI_P2_SECTION4.unitNote}</span>
        <span>{BESSHI_P2_SECTION4.pageNote}</span>
      </div>
      <SectionTitle>{BESSHI_P2_SECTION4.header}</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-micro">
        <tbody>
          {/* 가. 자산총액 */}
          <tr className="bg-gray-50 font-bold print:bg-gray-50">
            <td colSpan={4} className="border border-black p-1">
              {BESSHI_P2_SECTION4.assetGroup}
            </td>
          </tr>
          {BESSHI_P2_ASSET_ROWS.map((row) => (
            <NetAssetTr key={row.cellNum} cellNum={row.cellNum} label={row.label} amount={eff[row.field] ?? 0} refText={row.ref} testid={row.cellNum} />
          ))}
          <NetAssetTr cellNum="⑧" label={BESSHI_P2_SECTION4.assetSubtotalFormula} amount={assetSubtotal} testid="⑧" emphasis />

          {/* 나. 부채총액 */}
          <tr className="bg-gray-50 font-bold print:bg-gray-50">
            <td colSpan={4} className="border border-black p-1">
              {BESSHI_P2_SECTION4.liabilityGroup}
            </td>
          </tr>
          {BESSHI_P2_LIABILITY_ROWS.map((row) => {
            const amount = eff[row.field] ?? 0;
            // 보험준비금(cellNum="*")은 값이 0이면 별지 표시 생략 (비보험사 불필요 행 방지)
            if (row.cellNum === "*" && amount === 0) return null;
            // testid: 기존 행은 cellNum(앵커 보존), 보험준비금 행은 field(중복 방지)
            const testid = row.cellNum === "*" ? row.field : row.cellNum;
            return (
              <NetAssetTr
                key={`${row.cellNum}-${row.field}`}
                cellNum={row.cellNum}
                label={row.label}
                amount={amount}
                refText={row.ref}
                testid={testid}
              />
            );
          })}
          <NetAssetTr cellNum="⑲" label={BESSHI_P2_SECTION4.liabilitySubtotalFormula} amount={liabilitySubtotal} testid="⑲" emphasis />

          {/* 다·라·마 */}
          <NetAssetTr cellNum="다" label={BESSHI_P2_SECTION4.preGoodwillLabel} amount={preGoodwill} testid="다" topBorder />
          <NetAssetTr cellNum="라" label={BESSHI_P2_SECTION4.goodwillLabel} amount={goodwillFinal} refText={BESSHI_P2_SECTION4.goodwillRef} testid="라" />
          <NetAssetTr cellNum="마" label={BESSHI_P2_SECTION4.netAssetLabel} amount={netAssetTotal} testid="마" final />
        </tbody>
      </table>
    </section>
  );
}

/** 제2쪽 행 — [번호][라벨][값][회색 참조열]. testid=`p2-{testid}` (anchor 보존) */
function NetAssetTr({
  cellNum,
  label,
  amount,
  refText,
  testid,
  emphasis,
  final: isFinal,
  topBorder,
}: {
  cellNum: string;
  label: string;
  amount: number;
  refText?: string;
  testid: string;
  emphasis?: boolean;
  final?: boolean;
  topBorder?: boolean;
}) {
  const rowClass = emphasis
    ? "bg-yellow-50 font-bold print:bg-yellow-50"
    : isFinal
      ? "bg-emerald-50 font-bold print:bg-emerald-50"
      : topBorder
        ? "border-t-2 border-black"
        : "";
  return (
    <tr className={rowClass} data-besshi-cell={`p2-${testid}`} data-testid={`p2-${testid}`}>
      <td className="border border-black p-1 text-center font-mono w-10">{cellNum}</td>
      <td className="border border-black p-1">{label}</td>
      <td className="border border-black p-1 text-right font-mono w-36">{fmt(amount)}</td>
      <td className="border border-black p-1 text-micro text-gray-500 bg-gray-100 print:bg-gray-100 w-44">
        {refText ?? ""}
      </td>
    </tr>
  );
}
