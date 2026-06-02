"use client";

/**
 * GiftSelectedBesshiPages — 통합 결과 PDF(ResultPdfDocument)의 증여세 별지 선택 출력.
 *
 * selectedSectionIds(POST 선택 출력)에 따라 별지 Page를 조건부 렌더:
 *   filing-form-10(별지10호)·valuation-form(부표1)·listed/unlisted-stock-besshi(주식, 재사용).
 * 데이터는 화면 결과뷰(GiftTaxResultView)와 동일 — besshi10Rows·valuationResults·estateItems 합성 → dual-truth 0.
 * 저장 input_data(=raw form)에서 화면과 동일 가공(estateItems = giftItems + stockItems).
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §4
 */

import { FilingForm10PdfPage } from "./GiftFilingForm10PdfDocument";
import { GiftValuationFormPdfPage } from "./GiftValuationFormPdfDocument";
import { ListedStockBesshiPages } from "./ListedStockBesshiPdfDocument";
import { UnlistedStockBesshiPages } from "./UnlistedStockBesshiPdfDocument";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type {
  GiftTaxResult,
  EstateItem,
  PriorGift,
  FilingFormRow,
  PropertyValuationResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

type R = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function GiftSelectedBesshiPages({
  resultData: r,
  inputData,
  selectedSectionIds,
}: {
  resultData: R;
  inputData?: R;
  selectedSectionIds?: string[];
}) {
  if (!Array.isArray(selectedSectionIds)) return null;
  const want = (id: string): boolean => selectedSectionIds.includes(id);

  const giftResult = r as unknown as GiftTaxResult;
  // 화면 결과뷰와 동일 합성: estateItems = form.giftItems + form.stockItems
  const estateItemsArr: EstateItem[] = [
    ...((inputData?.giftItems as unknown as EstateItem[]) ?? []),
    ...((inputData?.stockItems as unknown as EstateItem[]) ?? []),
  ];
  const priorGiftsArr = (inputData?.priorGifts as unknown as PriorGift[]) ?? [];
  const giftDateStr = str(inputData?.giftDate);

  const besshi10Rows = (giftResult.besshi10Rows ?? []) as FilingFormRow[];
  const valuationResults = (giftResult.valuationResults ?? []) as PropertyValuationResult[];

  // 별지10호 (증여세과세표준신고 및 자진납부계산서)
  const ff10 = want("filing-form-10") && besshi10Rows.length > 0;

  // 부표1 (증여재산 및 평가명세서)
  const valForm = want("valuation-form") && valuationResults.length > 0;

  // 상장주식 평가조서(갑·을) — 화면 ListedStockBesshiResultSection 로직 재현
  const listed = want("listed-stock-besshi")
    ? estateItemsArr
        .filter(
          (it) =>
            it.category === "listed_stock" &&
            (it.listedStockAvgPrice ?? 0) > 0 &&
            (it.listedStockShares ?? 0) > 0,
        )
        .map((it) => {
          try {
            return evaluateListedStock(it, { valuationDate: giftDateStr }).besshiData ?? null;
          } catch {
            return null;
          }
        })
        .filter((b): b is NonNullable<typeof b> => b !== null)
    : [];

  // 비상장주식 별지4 부표3 — 정식평가 V2 자산만
  const unlisted = want("unlisted-stock-besshi")
    ? estateItemsArr
        .filter((it) => it.unlistedStockValuationV2)
        .map((it) => it.unlistedStockValuationV2!)
    : [];

  return (
    <>
      {ff10 && <FilingForm10PdfPage rows={besshi10Rows} />}
      {valForm && (
        <GiftValuationFormPdfPage
          valuationResults={valuationResults}
          estateItems={estateItemsArr}
          grossGiftValue={giftResult.grossGiftValue}
          exemptAmount={giftResult.exemptAmount}
          aggregatedGiftValue={giftResult.aggregatedGiftValue}
          publicInterestExclusion={giftResult.publicInterestExclusion}
          publicTrustExclusion={giftResult.publicTrustExclusion}
          disabledTrustExclusion={giftResult.disabledTrustExclusion}
          priorGifts={priorGiftsArr}
        />
      )}
      {listed.map((besshi, i) => (
        <ListedStockBesshiPages key={`ls-${i}`} besshi={besshi} />
      ))}
      {unlisted.map((input, i) => (
        <UnlistedStockBesshiPages key={`us-${i}`} input={input} />
      ))}
    </>
  );
}
