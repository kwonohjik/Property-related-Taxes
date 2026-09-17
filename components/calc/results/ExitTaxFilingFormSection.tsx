"use client";

/**
 * 국외전출세 결과 화면 — 별지 제84호서식 (신고서 양식 표)
 *
 * 제보 —「국외전출세 결과탭에 신고서 양식이 있는지 체크해봐」→「일반 주식양도신고서와 동일해
 * 주식 신고서 양식으로 만들면 돼」
 *
 * ## 종전에는 **세액 신고 서식이 없었다**
 *
 * 결과탭에 있던 별지 제104호서식은 §118의15**①**의 **보유현황** 신고서다 — 출국일 전날까지
 * 내는 현황 신고이지 과세표준·세액을 신고하는 서식이 아니다. 과세표준 신고서는
 * **§118의15②**가 따로 요구하고, 서식도 시행규칙 별지 **008400**
 * 「양도소득(**국외전출자**)과세표준 신고 및 납부계산서」로 **별지 제84호서식이 겸한다**.
 *
 * ## 값은 엔진 어댑터로 옮긴다
 *
 * 서식은 `StockTransferResult` 한 타입만 읽으므로 `toStockTransferResultFromExitTax`를 쓴다.
 * 결과 화면에서 손으로 매핑하면 결과 카드와 서식의 숫자가 갈린다.
 */

import { useMemo } from "react";
import { StockFilingFormTable } from "@/components/calc/stock-transfer/StockFilingFormTable";
import { useStockFilingHeaderMeta } from "@/components/calc/results/useStockFilingHeaderMeta";
import { toStockTransferResultFromExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax-filing-adapter";
import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";

interface ExitTaxFilingFormSectionProps {
  result: ExitTaxResult;
  /** 케이스 이름 (폼 `securityName`) — 종목이 여럿이라 서식 헤더는 케이스명을 쓴다 */
  caseName?: string;
  brokerage?: string;
  accountNumberMasked?: string;
  /** 출국일 "YYYY-MM-DD" — 간주양도일이자 과세연도의 근거 */
  departureDate?: string;
  holdings?: ExitTaxHoldingForm[];
}

/** "YYYY-MM-DD" → Date. 비었거나 파싱 불가면 epoch. */
function parseDate(v?: string): Date {
  if (!v) return new Date(0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export function ExitTaxFilingFormSection({
  result,
  caseName,
  brokerage,
  accountNumberMasked,
  departureDate,
  holdings,
}: ExitTaxFilingFormSectionProps) {
  const filingHeaderProps = useStockFilingHeaderMeta({
    securityName: caseName,
    brokerage,
    accountNumberMasked,
    // 과세연도는 **출국일** 기준이다 — 간주양도일이 곧 양도일이다(§118의9①).
    transferDate: departureDate,
  });

  const adapted = useMemo(
    () =>
      toStockTransferResultFromExitTax(result, {
        departureDate: parseDate(departureDate),
        totalShareCount: (holdings ?? []).reduce(
          (s, h) => s + (parseInt(h.shareCount || "0", 10) || 0),
          0,
        ),
      }),
    [result, departureDate, holdings],
  );

  return (
    <StockFilingFormTable
      result={adapted}
      title="국외전출자 양도소득세 신고서"
      subtitle="소득세법 §118의15② 기준 — 참고용 (실제 신고서식과 다를 수 있음)"
      {...filingHeaderProps}
    />
  );
}
