/**
 * InheritanceSelectedBesshiPages — 통합 결과 PDF(ResultPdfDocument)의 상속세 별지 선택 출력.
 *
 * selectedSectionIds(POST 선택 출력)에 따라 별지 5종 Page를 조건부 렌더.
 * 데이터는 모두 화면 결과뷰와 동일 어댑터를 재사용 → dual-truth 0.
 * 저장 input_data(=raw form)에서 화면과 동일 가공(estateItems 합성·familyBusiness 매핑) 재현.
 *
 * 설계: docs/02-design/features/selective-print.design.md §10-3 (PR-3a/3b)
 */
import { FilingForm9PdfPage } from "./InheritanceFilingForm9PdfDocument";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import { Buppyo2Pages } from "./InheritanceBuppyo2PdfDocument";
import { buildBuppyo2Data } from "@/lib/calc/besshi-buppyo-2-data";
import { DeductionBesshiPages } from "./InheritanceDeductionBesshiPdf";
import {
  buildBuppyo3Data,
  buildBesshi5Data,
  buildBesshi1Data,
} from "@/lib/calc/deduction-besshi-data";
import { ListedStockBesshiPages } from "./ListedStockBesshiPdfDocument";
import { UnlistedStockBesshiPages } from "./UnlistedStockBesshiPdfDocument";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type {
  Heir,
  InheritanceTaxResult,
  EstateItem,
  PriorGift,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";

type R = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function InheritanceSelectedBesshiPages({
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

  const inhResult = r as unknown as InheritanceTaxResult;
  const heirsArr = Array.isArray(inputData?.heirs)
    ? (inputData!.heirs as unknown as Heir[])
    : [];
  // 화면 결과뷰와 동일 합성: estateItems = form.estateItems + form.stockItems
  const estateItemsArr: EstateItem[] = [
    ...((inputData?.estateItems as unknown as EstateItem[]) ?? []),
    ...((inputData?.stockItems as unknown as EstateItem[]) ?? []),
  ];
  const priorGiftsArr = (inputData?.priorGifts as unknown as PriorGift[]) ?? [];
  const debtItemsArr = (inputData?.debtItems as unknown as DebtItem[]) ?? [];
  const deathDateStr = str(inputData?.deathDate);
  const hasAlloc = !!inhResult.heirAllocationResult && heirsArr.length > 0;

  // 별지 제9호 (PR-3a)
  const ff9 = want("filing-form-9") && hasAlloc
    ? buildFilingForm9Data(inhResult, heirsArr, deathDateStr)
    : null;

  // 부표2 — 상속인별 N장
  const bp2 = want("besshi-buppyo-2") && hasAlloc
    ? buildBuppyo2Data(inhResult, heirsArr, estateItemsArr, priorGiftsArr)
    : null;

  // 부표3·별지5호·별지1호
  const dedu = want("deduction-besshi") && inhResult.deductionDetail
    ? {
        bp3: buildBuppyo3Data(inhResult, debtItemsArr),
        b5: buildBesshi5Data(inhResult),
        b1: buildBesshi1Data(
          inhResult,
          estateItemsArr,
          inputData?.familyBusiness as unknown as FamilyBusinessInheritanceInput | undefined
        ),
      }
    : null;

  // 상장주식 평가조서(갑·을) — 종목 N (화면 ListedStockBesshiResultSection 로직 재현)
  const listed = want("listed-stock-besshi")
    ? estateItemsArr
        .filter(
          (it) =>
            it.category === "listed_stock" &&
            (it.listedStockAvgPrice ?? 0) > 0 &&
            (it.listedStockShares ?? 0) > 0
        )
        .map((it) => {
          try {
            return evaluateListedStock(it, { valuationDate: deathDateStr }).besshiData ?? null;
          } catch {
            return null;
          }
        })
        .filter((b): b is NonNullable<typeof b> => b !== null)
    : [];

  // 비상장주식 별지4 부표3 — 법인 N (정식평가 V2 자산만)
  const unlisted = want("unlisted-stock-besshi")
    ? estateItemsArr
        .filter((it) => it.unlistedStockValuationV2)
        .map((it) => it.unlistedStockValuationV2!)
    : [];

  return (
    <>
      {ff9 && <FilingForm9PdfPage data={ff9} />}
      {bp2 && <Buppyo2Pages data={bp2} />}
      {dedu && <DeductionBesshiPages bp3={dedu.bp3} b5={dedu.b5} b1={dedu.b1} />}
      {listed.map((besshi, i) => (
        <ListedStockBesshiPages key={`ls-${i}`} besshi={besshi} />
      ))}
      {unlisted.map((input, i) => (
        <UnlistedStockBesshiPages key={`us-${i}`} input={input} />
      ))}
    </>
  );
}
