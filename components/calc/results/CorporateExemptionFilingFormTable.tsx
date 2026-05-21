"use client";

/**
 * CorporateExemptionFilingFormTable — 별지 제9호서식 부표 5
 * (영리법인 상속세 면제 및 납부 명세서) — PR 2 PR-2
 *
 * 근거 양식 (KoreanLaw MCP 검증 2026-05-21):
 *   - 상속세 및 증여세법 시행규칙 별지 제9호서식 부표 5
 *   - 가. 상속세 면제대상 영리법인:
 *       ① 법인명 / ② 사업자등록번호 / ③ 사업장 소재지
 *       ④ 받았거나 받을 상속 재산가액 / ⑤ 면제세액 / ⑥ ④×10%
 *   - 나. 상속세 납부 대상자:
 *       ⑦ 구분 (상속인·상속인의 배우자·상속인의 직계비속·직계비속의 배우자)
 *       ⑧ 성명 / ⑨ 주민등록번호 / ⑩ 지분율
 *       ⑪ 면제분 납부세액 = (⑤ − ⑥) × ⑩
 *
 * 데이터 소스:
 *   - 가. 표 = result.corporateExemption.perCorporateBreakdown[i]
 *   - 나. 표 = perCorporateBreakdown[i].shareholderPayments + heirs[].shareholders
 *
 * 인쇄 패턴: print-only-css-toggle ([[print-only-css-toggle]]).
 */

import { useState } from "react";
import type {
  Heir,
  ShareholderInfo,
  PerCorporateExemptionDetail,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

const SHAREHOLDER_RELATION_LABEL: Record<ShareholderInfo["relation"], string> = {
  heir: "상속인",
  heir_spouse: "상속인의 배우자",
  lineal_descendant_of_heir: "상속인의 직계비속",
  spouse_of_lineal_descendant: "직계비속의 배우자",
};

interface Props {
  /** 영리법인별 분배 명세 — calcCorporateExemption(opts.perCorporateInputs)의 산출물 */
  perCorporateBreakdown: PerCorporateExemptionDetail[];
  /** Heir[] — corporate Heir의 법인명·사업자번호·사업장·주주 매핑 조회 */
  heirs?: Heir[];
}

export function CorporateExemptionFilingFormTable({
  perCorporateBreakdown,
  heirs,
}: Props) {
  // 인쇄 토글 — early return 이전에 hook 호출 (react-hooks/rules-of-hooks).
  const [open, setOpen] = useState(false);

  if (!perCorporateBreakdown || perCorporateBreakdown.length === 0) {
    return null;
  }

  const heirById = new Map((heirs ?? []).map((h) => [h.id, h]));

  // 합계 행 계산
  const totalInherited = perCorporateBreakdown.reduce(
    (s, d) => s + d.inheritedAmount,
    0,
  );
  const totalExemption = perCorporateBreakdown.reduce(
    (s, d) => s + d.exemptionAmount,
    0,
  );
  const totalTenPercent = perCorporateBreakdown.reduce(
    (s, d) => s + d.tenPercentBaseline,
    0,
  );

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
            🏢 부표 5 — 영리법인 상속세 면제 및 납부 명세서
          </p>
          <p className="text-[11px] text-violet-700 dark:text-violet-300 mt-0.5">
            상속세 및 증여세법 시행규칙 별지 제9호서식 부표 5 (§3의2②)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="text-xs rounded-md border border-violet-300 dark:border-violet-600 px-2 py-1 hover:bg-violet-100 dark:hover:bg-violet-800/40 print:hidden"
          aria-expanded={open}
        >
          {open ? "▲ 접기" : "▼ 펼치기 (인쇄 시 자동 펼침)"}
        </button>
      </div>

      <div className={open ? "block" : "hidden print:block"}>
        <div className="print:bg-white print:text-black">
          {/* 가. 상속세 면제대상 영리법인 */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              가. 상속세 면제대상 영리법인
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left font-medium">① 법인명</th>
                  <th className="px-3 py-2 text-left font-medium">
                    ② 사업자등록번호
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    ③ 사업장 소재지
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    ④ 재산가액
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    ⑤ 면제세액
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    ⑥ ④ × 10%
                  </th>
                </tr>
              </thead>
              <tbody>
                {perCorporateBreakdown.map((detail) => {
                  const heir = heirById.get(detail.corporateId);
                  return (
                    <tr
                      key={detail.corporateId}
                      className="border-b border-gray-100 dark:border-gray-800 bg-violet-50/20 dark:bg-violet-900/10"
                    >
                      <td className="px-3 py-2">{heir?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {heir?.businessRegistrationNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        {heir?.businessAddress ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatKRW(detail.inheritedAmount)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatKRW(detail.exemptionAmount)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatKRW(detail.tenPercentBaseline)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {perCorporateBreakdown.length > 1 && (
                <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      합계
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatKRW(totalInherited)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatKRW(totalExemption)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatKRW(totalTenPercent)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 나. 상속세 납부 대상자 */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              나. 상속세 납부 대상자
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              ⑪ 면제분 납부세액 = (⑤ 면제세액 − ⑥ ④×10%) × ⑩ 지분율
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left font-medium">법인명</th>
                  <th className="px-3 py-2 text-left font-medium">⑦ 구분</th>
                  <th className="px-3 py-2 text-left font-medium">⑧ 성명</th>
                  <th className="px-3 py-2 text-left font-medium">
                    ⑨ 주민등록번호
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    ⑩ 지분율
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    ⑪ 면제분 납부세액
                  </th>
                </tr>
              </thead>
              <tbody>
                {renderShareholderRows(perCorporateBreakdown, heirById)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 나. 표 행 렌더링 — 영리법인별 주주 행 + 빈 케이스 처리
// ============================================================

function renderShareholderRows(
  perCorporateBreakdown: PerCorporateExemptionDetail[],
  heirById: Map<string, Heir>,
) {
  const rows: React.ReactElement[] = [];

  perCorporateBreakdown.forEach((detail) => {
    const heir = heirById.get(detail.corporateId);
    const corporateName = heir?.name ?? "—";
    const shareholders = heir?.shareholders ?? [];

    if (detail.shareholderPayments.length === 0) {
      rows.push(
        <tr
          key={`${detail.corporateId}-empty`}
          className="border-b border-gray-100 dark:border-gray-800 text-gray-400"
        >
          <td className="px-3 py-2">{corporateName}</td>
          <td className="px-3 py-2 text-[10px]" colSpan={5}>
            상속인·직계비속 주주 미입력 — ⑪ 환원 없음
          </td>
        </tr>,
      );
      return;
    }

    detail.shareholderPayments.forEach((payment) => {
      const sh = shareholders.find((s) => s.id === payment.shareholderId);
      rows.push(
        <tr
          key={`${detail.corporateId}-${payment.shareholderId}`}
          className="border-b border-gray-100 dark:border-gray-800"
        >
          <td className="px-3 py-2">{corporateName}</td>
          <td className="px-3 py-2 text-[10px]">
            {sh ? SHAREHOLDER_RELATION_LABEL[sh.relation] : "—"}
          </td>
          <td className="px-3 py-2">{sh?.name ?? "—"}</td>
          <td className="px-3 py-2 font-mono text-[10px]">
            {sh?.residentNumber ?? "—"}
          </td>
          <td className="px-3 py-2 text-right font-mono">
            {(payment.shareRatio * 100).toFixed(2)}%
          </td>
          <td className="px-3 py-2 text-right font-mono">
            {formatKRW(payment.paymentAmount)}
          </td>
        </tr>,
      );
    });
  });

  return rows;
}
