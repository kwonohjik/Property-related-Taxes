"use client";

/**
 * FilingForm9CoverSection — 별지 제9호서식 「상속세과세표준신고 및 자진납부계산서」(앞쪽) 화면 재현.
 *
 * 출력 전용(엔진/타입/API/validate 변경 0). `buildFilingForm9Data` 단일 어댑터만 소비.
 * 계산 표는 공용 `BesshiColumn`(별지10호와 공유), 식별정보·하단은 besshi 격자 신규.
 * 렌더 가드: heirAllocationResult && heirs.length>0 (= HeirAllocationSummaryTable).
 *
 * Plan: docs/00-pm/inheritance-filing-form-9-replica.plan.md
 * Design: docs/02-design/features/inheritance-filing-form-9-replica.ui.design.md §2
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import { BesshiColumn } from "@/components/calc/results/shared/BesshiRow";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import {
  FF9_FORM_TITLE,
  FF9_FORM_SUBTITLE,
  FF9_FILING_KINDS,
  FF9_IDENTITY_LABELS as L,
  FF9_RESIDENCY_OPTIONS,
  FF9_CAUSE_OPTIONS,
  FF9_SUBMISSION_DOCS,
  FF9_OFFICER_CHECK_DOCS,
  FF9_FEE_TEXT,
  FF9_CONFIRM_TEXT,
  FF9_AGENT_CONFIRM_TEXT,
  FF9_CONSENT_TITLE,
  FF9_CONSENT_TEXT,
} from "@/components/calc/inheritance/filing-form-9/filing-form-9-constants";

// PDF 버튼은 dynamic(ssr:false) — react-pdf를 클라이언트에서만 로드(테스트/SSR 격리)
const FilingForm9PdfDownloadButton = dynamic(
  () =>
    import(
      "@/components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton"
    ).then((m) => m.FilingForm9PdfDownloadButton),
  { ssr: false },
);

interface Props {
  result: InheritanceTaxResult;
  heirs?: Heir[];
  /** 상속개시일 (ISO) — ⑫·신고기한·분납기한 도출 */
  deathDate?: string;
}

const HEAD = "border border-black p-1.5 bg-gray-100 dark:bg-gray-800 text-[11px] font-medium align-middle";
const VAL = "border border-black p-1.5 text-[11px] font-mono align-middle";

function chk(label: string, checked: boolean): string {
  return `${checked ? "[V]" : "[ ]"} ${label}`;
}

export function FilingForm9CoverSection({ result, heirs, deathDate }: Props) {
  const [open, setOpen] = useState(false);

  if (!result.heirAllocationResult || !heirs || heirs.length === 0) return null;

  const data = buildFilingForm9Data(result, heirs, deathDate);

  return (
    <section
      data-testid="ff9-cover-section"
      aria-labelledby="ff9-title"
      className="rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40 print:border-black print:bg-white"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="ff9-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {FF9_FORM_TITLE} (별지 제9호서식)
        </h3>
        <div className="flex items-center gap-2">
          <FilingForm9PdfDownloadButton result={result} heirs={heirs} deathDate={deathDate} />
          <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="slate" />
        </div>
      </div>

      <div className={open ? "block" : "hidden print:block"}>
        <div className="print:bg-white print:text-black">
          {/* 제목 */}
          <header className="mb-2 text-center">
            <p className="text-[10px] text-slate-500">{FF9_FORM_SUBTITLE}</p>
            <p className="text-lg font-bold tracking-wide text-slate-900 dark:text-slate-50">
              {FF9_FORM_TITLE}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {FF9_FILING_KINDS.map((k) => `[ ] ${k}`).join("   ")}
            </p>
          </header>

          {/* 식별정보 3블록 */}
          <table className="mb-3 w-full border-collapse text-left">
            <tbody>
              {/* 신고인 */}
              <tr>
                <th rowSpan={4} className={`${HEAD} w-16 text-center`}>{L.declarantTitle}</th>
                <th className={`${HEAD} w-28`}>① {L["①"]}</th>
                <td className={VAL} data-testid="ff9-①">{data.declarant?.name || ""}</td>
                <th className={`${HEAD} w-28`}>② {L["②"]}</th>
                <td className={VAL} data-testid="ff9-②"></td>
              </tr>
              <tr>
                <th className={HEAD}>③ {L["③"]}</th>
                <td className={VAL} data-testid="ff9-③"></td>
                <th className={HEAD}>⑤ {L["⑤"]}</th>
                <td className={VAL} data-testid="ff9-⑤">{data.declarant?.relationLabel || ""}</td>
              </tr>
              <tr>
                <th className={HEAD}>④ {L["④"]}</th>
                <td className={VAL} colSpan={3} data-testid="ff9-④"></td>
              </tr>
              <tr>
                <th className={HEAD}>⑥ {L["⑥"]}</th>
                <td className={VAL} data-testid="ff9-⑥"></td>
                <th className={HEAD}>{L.postManagement}</th>
                <td className={VAL}></td>
              </tr>

              {/* 피상속인 */}
              <tr>
                <th rowSpan={3} className={`${HEAD} text-center`}>{L.decedentTitle}</th>
                <th className={HEAD}>⑦ {L["⑦"]}</th>
                <td className={VAL} data-testid="ff9-⑦"></td>
                <th className={HEAD}>⑧ {L["⑧"]}</th>
                <td className={VAL} data-testid="ff9-⑧"></td>
              </tr>
              <tr>
                <th className={HEAD}>⑩ {L["⑩"]}</th>
                <td className={VAL} data-testid="ff9-⑩"></td>
                <th className={HEAD}>⑨ {L["⑨"]}</th>
                <td className={VAL} data-testid="ff9-⑨">
                  {FF9_RESIDENCY_OPTIONS.map((o) => chk(o, false)).join(" ")}
                </td>
              </tr>
              <tr>
                <th className={HEAD}>⑪ {L["⑪"]}</th>
                <td className={VAL} data-testid="ff9-⑪">
                  {FF9_CAUSE_OPTIONS.map((o) =>
                    chk(o, o === "사망" && data.inheritanceCause === "death"),
                  ).join(" ")}
                </td>
                <th className={HEAD}>⑫ {L["⑫"]}</th>
                <td className={VAL} data-testid="ff9-⑫">{data.deathDate}</td>
              </tr>

              {/* 세무대리인 */}
              <tr>
                <th rowSpan={2} className={`${HEAD} text-center`}>{L.agentTitle}</th>
                <th className={HEAD}>⑬ {L["⑬"]}</th>
                <td className={VAL} data-testid="ff9-⑬"></td>
                <th className={HEAD}>⑭ {L["⑭"]}</th>
                <td className={VAL} data-testid="ff9-⑭"></td>
              </tr>
              <tr>
                <th className={HEAD}>⑮ {L["⑮"]}</th>
                <td className={VAL} data-testid="ff9-⑮"></td>
                <th className={HEAD}>⑯ {L["⑯"]}</th>
                <td className={VAL} data-testid="ff9-⑯"></td>
              </tr>
            </tbody>
          </table>

          {/* 계산 표 좌/우 (공용 BesshiColumn — ff9- testid 동결) */}
          <div className="grid grid-cols-1 border border-black md:grid-cols-2">
            <BesshiColumn rows={data.leftRows} showLaw={false} testIdPrefix="ff9-" />
            <BesshiColumn rows={data.rightRows} showLaw={false} testIdPrefix="ff9-" />
          </div>

          {/* 확인 문구 + 서명란 */}
          <div className="mt-3 space-y-2 text-[11px] text-slate-700 dark:text-slate-200">
            <p>{FF9_CONFIRM_TEXT}</p>
            <p className="text-right">
              {data.filingDueDate ? `${data.filingDueDate}    ` : ""}신고인 (서명 또는 인)
            </p>
            <p>{FF9_AGENT_CONFIRM_TEXT}</p>
            <p className="text-right">세무대리인 (서명 또는 인) &nbsp;&nbsp; ___ 세무서장 귀하</p>
          </div>

          {/* 하단 제출서류 / 담당공무원 / 수수료 */}
          <div className="mt-3 border border-black text-[10px]">
            <div className="flex border-b border-black">
              <div className={`${HEAD} w-32 shrink-0`}>신청(신고)인 제출서류</div>
              <div className="p-1.5">
                <ul className="space-y-0.5">
                  {FF9_SUBMISSION_DOCS.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
              <div className={`${HEAD} ml-auto w-20 shrink-0 text-center`}>{FF9_FEE_TEXT}</div>
            </div>
            <div className="flex">
              <div className={`${HEAD} w-32 shrink-0`}>담당공무원 확인사항</div>
              <div className="p-1.5">
                <ul className="space-y-0.5">
                  {FF9_OFFICER_CHECK_DOCS.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 행정정보 공동이용 동의서 */}
          <div className="mt-2 border border-black p-2 text-[10px]">
            <p className="text-center font-semibold">{FF9_CONSENT_TITLE}</p>
            <p className="mt-1 text-slate-700 dark:text-slate-300">{FF9_CONSENT_TEXT}</p>
            <p className="mt-1 text-right">신청인 (서명 또는 인)</p>
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            ※ 식별정보(성명·주민등록번호·주소 등)·납부방법 금액은 자동 산출되지 않습니다 — 인쇄 후 수기 작성.
          </p>
        </div>
      </div>
    </section>
  );
}
