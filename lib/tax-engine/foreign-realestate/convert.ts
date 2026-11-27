/**
 * 자산 1건의 원화 환산 + 양도차익 (소득세법 §118의3·§118의4, 시행령 §178의5①).
 * 항목마다 자기 일자·환율로 환산하며 양도일 환율로 대체하지 않는다(미입력 → `toKrw`가 TaxCalculationError).
 */
import { format } from "../utc-date";
import { toKrw } from "./fx";
import { assertAcquisitionNotAfterTransfer, assertValidDate } from "./input-asserts";
import type {
  ForeignMoneyItem,
  ForeignRealEstateAssetInput,
  ForeignRealEstateAssetRow,
  ForeignRealEstateConvertedItem,
} from "./types";

export function convertItem(item: ForeignMoneyItem, path: string): ForeignRealEstateConvertedItem {
  assertValidDate(item.date, `${path}.date`);
  return {
    amountForeign: item.amountForeign,
    currency: item.currency,
    date: format(item.date, "yyyy-MM-dd"),
    exchangeRate: item.exchangeRate,
    amountKrw: toKrw(item.amountForeign, item.exchangeRate, path),
  };
}

const sumKrw = (items: ForeignRealEstateConvertedItem[]) => items.reduce((s, i) => s + i.amountKrw, 0);

/**
 * 양도차익 = 양도가액 − 취득가액 − 자본적지출 − 양도비 (장기보유특별공제는 법 §118의8 단서로 0이라 행에서 고정).
 * 외국납부세액 필요경비 산입(§118의6①2호)은 여기서 하지 않는다 — `foreign-tax.ts`의 `withExpenseMethod`.
 */
export function buildAssetRow(asset: ForeignRealEstateAssetInput, index: number): ForeignRealEstateAssetRow {
  const p = `assets[${index}]`;
  assertValidDate(asset.transferDate, `${p}.transferDate`);
  assertValidDate(asset.acquisitionDate, `${p}.acquisitionDate`);
  assertAcquisitionNotAfterTransfer(asset, index);
  const transfer = convertItem(asset.transfer, `${p}.transfer`);
  const acquisition = convertItem(asset.acquisition, `${p}.acquisition`);
  const capitalExpenditures = asset.capitalExpenditures.map((it, i) => convertItem(it, `${p}.capitalExpenditures[${i}]`));
  const transferCosts = asset.transferCosts.map((it, i) => convertItem(it, `${p}.transferCosts[${i}]`));
  const capitalExpenditureKrw = sumKrw(capitalExpenditures);
  const transferCostKrw = sumKrw(transferCosts);
  const capitalGain = transfer.amountKrw - acquisition.amountKrw - capitalExpenditureKrw - transferCostKrw;
  return {
    id: asset.id,
    kind: asset.kind,
    transferDate: format(asset.transferDate, "yyyy-MM-dd"),
    acquisitionDate: format(asset.acquisitionDate, "yyyy-MM-dd"),
    transfer,
    acquisition,
    capitalExpenditures,
    transferCosts,
    transferValueKrw: transfer.amountKrw,
    acquisitionValueKrw: acquisition.amountKrw,
    capitalExpenditureKrw,
    transferCostKrw,
    capitalGain,
    lossAmount: capitalGain < 0 ? -capitalGain : 0,
    longTermDeduction: 0,
    incomeAmount: Math.max(0, capitalGain),
    basicDeductionAllocated: 0,
    taxBaseAllocated: Math.max(0, capitalGain),
    foreignTax: { items: [], paidKrw: 0, expenseKrw: 0, limit: 0, applied: 0, unappliedKrw: 0 },
  };
}
