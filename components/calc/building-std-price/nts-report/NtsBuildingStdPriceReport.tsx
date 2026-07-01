"use client";

/**
 * 국세청 「건물 기준시가 계산서」 — Ⅰ~Ⅵ+※ 서식 재현(양도 2벌·상증 1벌).
 * 화면: 접힘 토글 / 인쇄: 자동 펼침(print-only-css-toggle). 흑백·흰 배경 강제.
 * 기존 간이 BuildingStdPricePrintView 대체(D-1).
 */
import { useState } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import type { NtsReportModel, NtsReportInstance } from "@/lib/calc/nts-report-adapter";
import { ReportSection1Category } from "./ReportSection1Category";
import { ReportSection2Overview } from "./ReportSection2Overview";
import { ReportEvalTable } from "./ReportEvalTable";
import { ReportSection5Apportion } from "./ReportSection5Apportion";
import { ReportSection6Total } from "./ReportSection6Total";

const INSTANCE_TITLE: Record<NtsReportInstance["markCell"], string> = {
  transfer: "양도당시 기준시가 계산",
  acq2001: "취득당시 기준시가 계산",
  acq2000: "취득당시(2000.12.31 이전) 기준시가 계산",
  inheritance: "상속 건물 기준시가 계산",
  gift: "증여 건물 기준시가 계산",
};

function ReportInstance({ inst }: { inst: NtsReportInstance }) {
  return (
    <div className="mb-6 break-after-page last:break-after-auto">
      <h3 className="mb-2 text-center text-[14px] font-bold text-black">
        건물 기준시가 계산서 — {INSTANCE_TITLE[inst.markCell]}
      </h3>
      <ReportSection1Category markCell={inst.markCell} dateLabel={inst.dateLabel} acqNoteLabel={inst.acqNoteLabel} />
      <ReportSection2Overview inst={inst} />
      <ReportEvalTable
        title="Ⅲ. 건물의 평가"
        rows={inst.mainRows}
        totalArea={inst.mainTotalArea}
        total={inst.mainTotal}
        rowSlots={9}
        section="nts-bsp-3"
      />
      {inst.ancillaryRows.length > 0 && (
        <ReportEvalTable
          title="Ⅳ. 건물부속(지하 포함) 주차장·기계실·보일러실·대피소·옥탑의 평가"
          rows={inst.ancillaryRows}
          totalArea={inst.ancillaryTotalArea}
          total={inst.ancillaryTotal}
          rowSlots={7}
          section="nts-bsp-4"
        />
      )}
      <ReportSection6Total inst={inst} />
    </div>
  );
}

export function NtsBuildingStdPriceReport({ model }: { model: NtsReportModel }) {
  const [open, setOpen] = useState(false);
  if (model.instances.length === 0) return null;

  return (
    <section className="mt-4 border rounded-xl" data-testid="nts-bsp-report">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
      >
        <span>국세청 「건물 기준시가 계산서」 (인쇄 서식)</span>
        <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
      </button>
      <div className={`${open ? "block" : "hidden print:block"} bg-white p-3 text-black`}>
        {model.instances.map((inst, i) => (
          <ReportInstance key={i} inst={inst} />
        ))}
        {model.apportionment && model.apportionment.rows.length > 0 && (
          <ReportSection5Apportion apportionment={model.apportionment} />
        )}
      </div>
    </section>
  );
}
