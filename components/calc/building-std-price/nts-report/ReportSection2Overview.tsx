"use client";

/**
 * 계산서 Ⅱ. 건물 기본현황 — 소재지·구조·지수·토지(③④⑤)·평균지가·위치지수⑥·연면적·층수·내용연수·신축연도·잔가율⑦.
 */
import type { NtsReportInstance } from "@/lib/calc/nts-report-adapter";
import { fmt, idx2, ratio, AMOUNT_CELL } from "./format";

const TD = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] text-black";
const TH = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] font-semibold text-black bg-neutral-100";

export function ReportSection2Overview({ inst }: { inst: NtsReportInstance }) {
  const groupLabel = inst.durableYears
    ? `${inst.durableYears}년${inst.residualGroup ? ` (${inst.residualGroup}그룹)` : ""}`
    : "";
  return (
    <section className="mb-3">
      <h4 className="mb-1 text-[12px] font-bold text-black">Ⅱ. 건물 기본현황</h4>
      <table className="w-full border-collapse text-black">
        <tbody>
          <tr>
            <th className={TH}>소재지</th>
            <th className={TH}>구조</th>
            <th className={TH}>구조지수①</th>
            <th className={TH}>건물용도</th>
            <th className={TH}>용도지수②</th>
            <th className={TH}>토지면적③</th>
            <th className={TH}>㎡당 공시지가④</th>
          </tr>
          <tr>
            <td className={TD}>{inst.address ?? ""}</td>
            <td className={TD}>{inst.structureLabel ?? ""}</td>
            <td className={TD}>{idx2(inst.structureIndex)}</td>
            <td className={TD}>{inst.usageSummary ?? ""}</td>
            <td className={TD}>{/* 부분별 — Ⅲ 참조 */}</td>
            <td className={`${TD} ${AMOUNT_CELL}`}>{inst.landAreaM2 ? `${inst.landAreaM2}㎡` : ""}</td>
            <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(inst.landPricePerM2)}</td>
          </tr>
          <tr>
            <th className={TH}>토지가액⑤</th>
            <th className={TH}>평균지가</th>
            <th className={TH}>위치지수⑥</th>
            <th className={TH}>건물 연면적</th>
            <th className={TH}>층수</th>
            <th className={TH}>내용연수</th>
            <th className={TH}>신축연도 / 잔가율⑦</th>
          </tr>
          <tr>
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-2-no5">
              {fmt(inst.landValue)}
            </td>
            <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(inst.avgLandPrice)}</td>
            <td className={TD}>{idx2(inst.locationIndex)}</td>
            <td className={`${TD} ${AMOUNT_CELL}`}>{inst.totalFloorArea ? `${inst.totalFloorArea}㎡` : ""}</td>
            <td className={TD}>
              {inst.floorsAbove ? `지상 ${inst.floorsAbove}층` : ""}
              {inst.floorsBelow ? ` / 지하 ${inst.floorsBelow}층` : ""}
            </td>
            <td className={TD}>{groupLabel}</td>
            <td className={TD}>
              {inst.builtYear || ""} / {ratio(inst.residualRate)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
