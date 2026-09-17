"use client";

/**
 * 국외주식 결과 화면 — 별지 제84호서식 (신고서 양식 표)
 *
 * 제보 —「해외주식 양도소득세 결과탭 첫번째 출력물을 신고서 양식이 출력되도록 수정해줘」
 *
 * ## 이건 순서가 아니라 **부재**였다
 *
 * 국외주식 **단건**은 `StockTransferTaxResultView`를 타지 않는다 — `Step4`가
 * `marketType === "foreign_stock"` 분기에서 `ForeignStockResultCard` 하나만 렌더했고,
 * 서식은 **한 번도 렌더되지 않았다**. 다종목(aggregate) 경로에만 서식이 있었다.
 *
 * ## 서식은 `StockTransferResult` 한 타입만 읽는다
 *
 * 그래서 값은 **엔진 어댑터**(`toStockTransferResult`)로 옮긴다. 결과 화면에서 손으로
 * 다시 매핑하면 다종목 경로(같은 어댑터를 쓴다)와 **두 번째 진실**이 생겨, 같은 국외주식이
 * 단건일 때와 합산일 때 서식 값이 갈린다.
 */

import { useMemo } from "react";
import { StockFilingFormTable } from "@/components/calc/stock-transfer/StockFilingFormTable";
import { useStockFilingHeaderMeta } from "@/components/calc/results/useStockFilingHeaderMeta";
import { toStockTransferResult } from "@/lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter";
import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

interface ForeignStockFilingFormSectionProps {
  result: ForeignStockResult;
  /** 종목명 (폼 `securityName`) */
  stockName?: string;
  stockCode?: string;
  brokerage?: string;
  accountNumberMasked?: string;
  /** "YYYY-MM-DD" */
  transferDate?: string;
  /** "YYYY-MM-DD" — 보유기간 행 산출용 */
  acquisitionDate?: string;
  /** ISO 2자리 국가코드 (폼 `fgCountryCode`) */
  countryCode?: string;
}

/** "YYYY-MM-DD" → Date. 비었거나 파싱 불가면 epoch — 보유기간 0개월로 떨어진다. */
function parseDate(v?: string): Date {
  if (!v) return new Date(0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export function ForeignStockFilingFormSection({
  result,
  stockName,
  stockCode,
  brokerage,
  accountNumberMasked,
  transferDate,
  acquisitionDate,
  countryCode,
}: ForeignStockFilingFormSectionProps) {
  const filingHeaderProps = useStockFilingHeaderMeta({
    securityName: stockName,
    securityCode: stockCode,
    brokerage,
    accountNumberMasked,
    transferDate,
  });

  const adapted = useMemo(
    () =>
      toStockTransferResult(
        {
          transferDate: parseDate(transferDate),
          acquisitionDate: parseDate(acquisitionDate),
          shareCount: result.shareCount,
          stockName: stockName ?? "",
          countryCode: countryCode ?? "",
        },
        result,
        // 🔑 단건 화면이다 — **이 종목이 곧 신고 1건**이라 가산세가 서식 26·27행에 실려야
        //   25 − 25-1 + 26 + 27 = 29 가 선다. 다종목 편입 경로는 기본값(0)을 그대로 쓴다
        //   (가산세는 신고 단위 1회 — `stock-transfer-aggregate.ts`가 매긴다).
        { filingUnitIsThisItem: true },
      ),
    [result, stockName, countryCode, transferDate, acquisitionDate],
  );

  return <StockFilingFormTable result={adapted} {...filingHeaderProps} />;
}
