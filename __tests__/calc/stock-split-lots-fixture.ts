/**
 * 제보 사례 픽스처 — 분할 매수 3건(매매·매매·증여) 20,000주 중 10,000주 양도
 * 계획서 `docs/00-pm/stock-split-lots-ui-bugfix.plan.md` §0. 선입선출 정답: 취득가액 104,000,000.
 */

import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function lot(
  id: string,
  acquisitionDate: string,
  acquisitionCause: AcquisitionLotForm["acquisitionCause"],
  shareCount: string,
  perShareAcquisitionPrice: string,
): AcquisitionLotForm {
  return { id, acquisitionDate, acquisitionCause, shareCount, perShareAcquisitionPrice };
}

export function reportedSplitForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "6000000000",
    totalIssuedShares: "100000",
    priorYearEndDate: "2025-12-31",
    lotsMode: "split",
    costAllocationMethod: "fifo",
    acquisitionLots: [
      lot("a1", "2024-01-10", "purchase", "8000", "10000"),
      lot("a2", "2025-02-10", "purchase", "8000", "12000"),
      lot("a3", "2025-12-24", "gift", "4000", "5000"),
    ],
    transferLots: [
      { id: "t1", transferDate: "2026-05-10", shareCount: "10000", perShareTransferPrice: "20000" },
    ],
    filingType: "preliminary",
    filingDate: "2026-07-31",
    ...o,
  } as StockTransferFormData;
}
