"use client";

/**
 * 계산서 Ⅵ. 합계 + ※ 산정기준율 환산(양도 취득 ≤2000).
 * Ⅵ: 건물 기준시가⑪ | 토지가액⑤ | 총합계(⑪+⑤).
 * ※: 2001현재(1) | 산정기준율(2) | 취득당시(3)=(1)×(2) | 토지가액(4) | 합계(3)+(4).
 */
import type { NtsReportInstance } from "@/lib/calc/nts-report-adapter";
import { fmt, AMOUNT_CELL } from "./format";

const TD = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] text-black";
const TH = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] font-semibold text-black bg-neutral-100";

export function ReportSection6Total({ inst }: { inst: NtsReportInstance }) {
  const grandTotal = inst.buildingTotal + inst.landValue;
  const acq = inst.acqBase;
  return (
    <section className="mb-3 break-inside-avoid">
      <h4 className="mb-1 text-[12px] font-bold text-black">Ⅵ. 평가대상 건물 기준시가 및 부속토지 평가액 합계</h4>
      <table className="w-full border-collapse text-black">
        <tbody>
          <tr>
            <th className={TH}>건물 기준시가⑪</th>
            <th className={TH}>토지가액⑤</th>
            <th className={TH}>총 합계(⑪+⑤)</th>
          </tr>
          <tr>
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-6-no11">
              {fmt(inst.buildingTotal)}
            </td>
            <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(inst.landValue)}</td>
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-6-total">
              {fmt(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {acq && (
        <>
          <p className="mt-2 mb-1 text-[11px] font-bold text-black">
            ※ 2000.12.31 이전 취득 시 취득당시 기준시가 계산
          </p>
          <table className="w-full border-collapse text-black">
            <tbody>
              <tr>
                <th className={TH}>2001.1.1 건물 기준시가(1)</th>
                <th className={TH}>산정기준율(2)</th>
                <th className={TH}>취득당시 기준시가(3)=(1)×(2)</th>
              </tr>
              <tr>
                <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-x-1">
                  {fmt(acq.total2001)}
                </td>
                <td className={TD} data-testid="nts-bsp-x-2">
                  {acq.rate ?? "부분별"}
                </td>
                <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-x-3">
                  {fmt(acq.converted)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
