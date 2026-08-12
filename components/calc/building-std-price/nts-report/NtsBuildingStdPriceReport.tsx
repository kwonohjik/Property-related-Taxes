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

/** 접힘 헤더용 시점 약칭 — 서식 제목(INSTANCE_TITLE)의 "기준시가 계산"을 뗀 형태. */
const MARK_SHORT: Record<NtsReportInstance["markCell"], string> = {
  transfer: "양도당시",
  acq2001: "취득당시",
  acq2000: "취득당시(2000.12.31 이전)",
  inheritance: "상속",
  gift: "증여",
};

function ReportInstance({
  inst,
  titleOverride,
  markCellOverride,
}: {
  inst: NtsReportInstance;
  titleOverride?: string;
  markCellOverride?: NtsReportInstance["markCell"];
}) {
  return (
    <div className="mb-6 break-after-page last:break-after-auto">
      <h3 className="mb-2 text-center text-sm font-bold text-black">
        건물 기준시가 계산서 — {titleOverride ?? INSTANCE_TITLE[inst.markCell]}
      </h3>
      <ReportSection1Category markCell={markCellOverride ?? inst.markCell} dateLabel={inst.dateLabel} acqNoteLabel={inst.acqNoteLabel} />
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

export function NtsBuildingStdPriceReport({
  model,
  titleOverride,
  markCellOverride,
  kindLabel,
}: {
  model: NtsReportModel;
  /** 시점·맥락 라벨(예: PHD 3시점 "양도 취득시 · 주택분 (2003년)"). 미주입 시 기본 제목(상속/증여/양도). */
  titleOverride?: string;
  /** Ⅰ.구분 마킹 override(예: PHD 양도 맥락 취득당시/양도당시). 미주입 시 모델 markCell(상속/증여). */
  markCellOverride?: NtsReportInstance["markCell"];
  /** 접힘 헤더의 건물 구분(일반건물·증축분(건물2)·상가건물 등) — `snapshotKindLabel` 산출값. */
  kindLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (model.instances.length === 0) return null;

  /**
   * 접힘 헤더 제목 — 종전에는 `titleOverride`가 없으면 전부 "(인쇄 서식)"으로 떨어져
   * 여러 장이 **같은 제목**으로 보였다(2026-08-12 사용자 제보). 시점은 서식 안에 이미
   * 있으므로(`INSTANCE_TITLE`) 그것을 헤더로 끌어올리고, 시점만으로 갈리지 않는
   * 본체/증축분/상가는 `kindLabel`로, 여러 자산은 소재지로 가른다.
   */
  const marks = [...new Set(model.instances.map((i) => markCellOverride ?? i.markCell))];
  const address = model.instances[0]?.address?.trim();
  const headerTitle = [
    kindLabel,
    titleOverride ?? marks.map((m) => MARK_SHORT[m]).join(" · "),
    address || undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-4 border rounded-xl" data-testid="nts-bsp-report">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
      >
        <span className="truncate text-left">국세청 「건물 기준시가 계산서」 — {headerTitle}</span>
        <span className={`${expandToggleClass("slate")} shrink-0`} aria-hidden>{expandToggleLabel(open)}</span>
      </button>
      <div className={`${open ? "block" : "hidden print:block"} bg-white p-3 text-black`}>
        {model.instances.map((inst, i) => (
          <ReportInstance key={i} inst={inst} titleOverride={titleOverride} markCellOverride={markCellOverride} />
        ))}
        {model.apportionment && model.apportionment.rows.length > 0 && (
          <ReportSection5Apportion apportionment={model.apportionment} />
        )}
      </div>
    </section>
  );
}
