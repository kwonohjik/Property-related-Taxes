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
import { ToneCard } from "@/components/calc/shared/ToneCard";
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

  // 세율 구분이 둘 이상이면 서식 23·24행의 단일 세율·누진공제 칸이 성립하지 않는다 — 잘못된 단일 세율을 보이지 않는다.
  // 2027.1.1. 개정 서식(별지 제84호서식 부표 2)의 호별 칸 대조(UI 계획 V-7) 뒤에 서식 표시를 정한다(U3).
  if ((result.bucketDetails?.length ?? 0) >= 2) {
    return (
      <ToneCard tone="amber" title="별지 제84호서식 표시 보류">
        <p className="text-sm leading-relaxed">
          과세 세율 구분이 둘 이상이라 서식의 단일 세율 칸에 담을 수 없습니다. 구분별 세율·과세표준·산출세액은 위 결과 카드를 참조하세요.
        </p>
      </ToneCard>
    );
  }

  return (
    <StockFilingFormTable
      result={adapted}
      title="국외전출자 양도소득세 신고서"
      subtitle="소득세법 §118의15② 기준 — 참고용 (실제 신고서식과 다를 수 있음)"
      {...filingHeaderProps}
    />
  );
}
