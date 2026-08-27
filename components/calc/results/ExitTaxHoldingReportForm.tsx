"use client";

/**
 * 국외전출자 주식등 보유현황 신고서 — 소득세법 시행규칙 [별지 제104호서식] 〈개정 2026. 3. 20.〉
 *
 * 근거: 「소득세법」 제118조의15 및 같은 법 시행령 제178조의11제1항
 *
 * ## ⚠️ 사용자 제공 PDF 는 **구판**이었다 (KoreanLaw MCP 검증 2026-08-27)
 *
 * 첨부 PDF 는 〈개정 2024. 12. 31.〉 이고 최신본과 **세 군데가 다르다**:
 *   · 제목에서 **「국내」가 빠졌다** — 「국외전출자~~국내~~주식등 보유현황 신고서」
 *   · 2번 섹션도 「**주식등** 보유 현황」(구: 국내주식 등)
 *   · ⑩ 이 「사업자등록번호」에서 **「주식등 종목코드 또는 사업자등록번호(해외주식은 ISIN코드와
 *     국가명)」** 로 확장됐고, 하단에 시행령 §178의8② 제외 안내가 **신설**됐다
 * ⇒ 최신본을 재현한다([[korean-law-citation-verify]] — PDF 라벨을 그대로 신뢰하지 않는다).
 *
 * ## 채우는 칸 / 비우는 칸
 *
 * 앱이 아는 값만 채우고 나머지는 **빈칸으로 인쇄**한다(수기 보완 전제).
 *   · 채움: ⑧출국(예정)일 · ⑨법인명 · ⑩종목코드/사업자등록번호 · ⑪보유 주식수 ·
 *           ⑫액면총액(액면가 × 주식수) · ⑬지분율
 *   · 비움: ①~⑦ 인적사항 — 주민등록번호·주소 등은 계산기가 보관하지 않는다
 */

import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

/** 양식 고정 행 수 — 최신본(2026.3.20.) 기준 20행 */
const ROWS_FIXED = 20;

const CELL_BASE = "border border-black p-1 align-middle text-[11px]";
const CELL_CENTER = `${CELL_BASE} text-center`;
const CELL_LEFT = `${CELL_BASE} text-left`;
const CELL_AMOUNT = `${CELL_BASE} text-right font-mono tabular-nums`;

function toInt(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** ⑫ 액면총액 = 1주당 액면가 × 보유 주식수. 액면가 미입력이면 빈칸으로 둔다 */
function faceTotal(h: ExitTaxHoldingForm): number | null {
  const face = toInt(h.faceValuePerShare);
  const shares = toInt(h.shareCount);
  if (face <= 0 || shares <= 0) return null;
  return face * shares;
}

export function ExitTaxHoldingReportForm({
  holdings,
  departureDate,
}: {
  holdings: ExitTaxHoldingForm[];
  /** ⑧ 국외전출(예정)일 "YYYY-MM-DD" */
  departureDate: string;
}) {
  const emptyRowCount = Math.max(0, ROWS_FIXED - holdings.length);

  return (
    <div className="border-2 border-black bg-white p-3 text-black print:bg-white print:text-black">
      <div className="mb-1 flex items-start justify-between text-[10px]">
        <span>■ 소득세법 시행규칙 [별지 제104호서식] 〈개정 2026. 3. 20.〉</span>
      </div>

      <h3 className="mb-2 text-center text-lg font-bold">국외전출자 주식등 보유현황 신고서</h3>

      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${CELL_CENTER} w-[110px]`}>접수번호</td>
            <td className={CELL_BASE}>&nbsp;</td>
            <td className={`${CELL_CENTER} w-[90px]`}>접수일자</td>
            <td className={CELL_BASE}>&nbsp;</td>
            <td className={`${CELL_CENTER} w-[80px]`}>처리기간</td>
            <td className={`${CELL_CENTER} w-[60px]`}>즉시</td>
          </tr>
        </tbody>
      </table>

      {/* 1. 신고인 인적사항 — 계산기가 보관하지 않는 값이라 ⑧만 채운다 */}
      <p className="mt-3 mb-1 text-[11px] font-semibold">1. 신고인 인적사항</p>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${CELL_CENTER} w-[90px]`}>①성명</td>
            <td className={CELL_BASE}>&nbsp;</td>
            <td className={`${CELL_CENTER} w-[110px]`}>②주민등록번호</td>
            <td className={CELL_BASE}>&nbsp;</td>
          </tr>
          <tr>
            <td className={CELL_CENTER} colSpan={2}>③국외전출 당시 국내 주소(한글)</td>
            <td className={CELL_BASE} colSpan={2}>&nbsp;</td>
          </tr>
          <tr>
            <td className={CELL_CENTER}>④국외전출 후 거주할 국가명</td>
            <td className={CELL_BASE}>&nbsp;</td>
            <td className={CELL_CENTER}>코드</td>
            <td className={CELL_BASE}>&nbsp;</td>
          </tr>
          <tr>
            <td className={CELL_CENTER} colSpan={2}>⑤국외전출 후 거주할 외국 주소(영문)</td>
            <td className={CELL_BASE} colSpan={2}>&nbsp;</td>
          </tr>
          <tr>
            <td className={CELL_CENTER}>⑥국외전출 후 전화번호(국가번호 포함)</td>
            <td className={CELL_BASE}>&nbsp;</td>
            <td className={CELL_CENTER}>⑦전자우편 주소</td>
            <td className={CELL_BASE}>&nbsp;</td>
          </tr>
          <tr>
            <td className={CELL_CENTER}>⑧국외전출(예정)일</td>
            <td className={CELL_BASE} colSpan={3} data-testid="row-8-departure-date">
              {departureDate || " "}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 2. 주식등 보유 현황 */}
      <div className="mt-3 mb-1 flex items-end justify-between">
        <p className="text-[11px] font-semibold">2. 주식등 보유 현황</p>
        <p className="text-[10px]">(주, 원, %)</p>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[750px] border-collapse"
          aria-label="국외전출자 주식등 보유 현황"
        >
          <caption className="sr-only">
            별지 제104호서식 2. 주식등 보유 현황 — 20행 고정
          </caption>
          <thead>
            <tr>
              <th className={`${CELL_CENTER} w-[56px]`} scope="col">일련번호</th>
              <th className={CELL_CENTER} scope="col">⑨주식발행법인의 법인명</th>
              <th className={CELL_CENTER} scope="col">
                ⑩ 주식등 종목코드 또는 사업자등록번호
                <br />
                (해외주식은 ISIN코드와 국가명)
              </th>
              <th className={`${CELL_CENTER} w-[100px]`} scope="col">⑪보유 주식수</th>
              <th className={`${CELL_CENTER} w-[120px]`} scope="col">⑫보유 주식 액면총액</th>
              <th className={`${CELL_CENTER} w-[80px]`} scope="col">⑬보유 지분율</th>
            </tr>
          </thead>
          <tbody data-testid="table-data-tbody">
            {holdings.map((h, i) => {
              const total = faceTotal(h);
              const shares = toInt(h.shareCount);
              return (
                <tr key={h.id} data-testid={`row-data-${i + 1}`}>
                  <td className={CELL_CENTER}>{i + 1}</td>
                  <td className={CELL_LEFT} data-testid="col-corp-name">{h.stockName || " "}</td>
                  <td className={CELL_LEFT} data-testid="col-stock-code">
                    {h.stockCodeOrBizNumber || " "}
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-share-count">
                    {shares > 0 ? formatKRW(shares) : " "}
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-face-total">
                    {total !== null ? formatKRW(total) : " "}
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-ownership-ratio">
                    {h.ownershipRatio ? `${h.ownershipRatio}` : " "}
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: emptyRowCount }).map((_, i) => (
              <tr key={`empty-${i}`} data-testid={`row-empty-${i + 1}`} className="h-6">
                <td className={CELL_CENTER}>{holdings.length + i + 1}</td>
                <td className={CELL_LEFT}>&nbsp;</td>
                <td className={CELL_LEFT}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 최신본에서 신설된 제외 안내 + 근거 조문 */}
      <div className="mt-2 border border-black p-2 text-[10px] leading-relaxed">
        <p>
          ※ 「소득세법 시행령」 제178조의8제2항에 따라 국외전출자 주식등에서 제외되는 국외주식등만
          보유하고 있는 국외전출자는 국외전출자 주식등 보유현황 신고대상에서 제외됩니다.
        </p>
        <p className="mt-1">
          「소득세법」 제118조의15 및 같은 법 시행령 제178조의11제1항에 따라 국외전출자 주식등
          보유현황을 신고합니다.
        </p>
      </div>

      <div className="mt-3 text-right text-[11px]">
        <p>년 월 일</p>
        <p className="mt-2">신고인 <span className="ml-8">(서명 또는 인)</span></p>
      </div>
      <p className="mt-2 text-[11px] font-semibold">세무서장 <span className="font-normal">귀하</span></p>

      <p className="mt-1 text-right text-[9px] text-gray-700">
        210mm×297mm[백상지 80g/㎡(재활용품)]
      </p>
    </div>
  );
}
