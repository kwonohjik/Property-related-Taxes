/**
 * ④ 주식 양도세 API 변환 — 매수 lot 1건 → body (⑬ body spread) · §97의2④ 가업상속 lot 입력 포함
 *
 * `stock-transfer-tax-api.ts`에서 옮겼다(800줄 정책 — 이 함수가 lot 축 가업상속 전송을 더해 커졌다).
 * lots-only(일자별 다건)와 split(분할 양도) 두 모드가 **이 함수 하나**를 쓴다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-types";
import { parseIntOrUndef } from "./stock-transfer-tax-api-parse";
import { toEngineAcquisitionCause } from "./stock-acquisition-cause";
import { buildStockFbLotInput, isStockFbLotOn } from "./stock-family-business-lots";

/**
 * 매수 lot 폼 → API body (⑬ body spread).
 *
 * 🔑 **lots-only 모드와 split 모드가 이 함수 하나를 쓴다.** 종전에는 두 곳에 복사돼 있었고
 * split 쪽에만 `donorAcquisitionDate` 매핑이 **빠져 있었다** — 그래서 split 모드에서는
 * §104②2호 통산도 §97의2① 승계도 **엔진에 도달하지 못했다**(계획서 P-7).
 * 분기를 늘릴 때 한쪽만 고치는 사고를 막으려면 여기 한 곳만 있어야 한다.
 */
export function mapAcquisitionLotToBody(lot: AcquisitionLotForm, form: StockTransferFormData): Record<string, unknown> {
  const o: Record<string, unknown> = {
    id: lot.id,
    acquisitionDate: lot.acquisitionDate,
    shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
    perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
    // 유상증자·과세 무상주 → 「매매」(엔진 enum 불변 — `stock-acquisition-cause.ts`)
    acquisitionCause: toEngineAcquisitionCause(lot.acquisitionCause),
  };
  if (lot.acquisitionCause === "inheritance" && lot.decedentAcquisitionDate) {
    o.decedentAcquisitionDate = lot.decedentAcquisitionDate;
  }
  if (lot.acquisitionCause === "carryover_gift") {
    // §104②2호 세율 기산 + §97의2①1호 취득가액 승계
    if (lot.donorAcquisitionDate) o.donorAcquisitionDate = lot.donorAcquisitionDate;
    const donorPrice = parseIntOrUndef(lot.donorAcquisitionPrice ?? "");
    if (donorPrice !== undefined) o.donorAcquisitionPrice = donorPrice;
    // §97의2①2호 증여자 자본적지출 · ①3호 증여세(산출세액 + 과세가액 = 안분 분모)
    const donorCapex = parseIntOrUndef(lot.donorCapitalExpenditure ?? "");
    if (donorCapex !== undefined) o.donorCapitalExpenditure = donorCapex;
    const donorGiftTax = parseIntOrUndef(lot.donorGiftTaxAmount ?? "");
    if (donorGiftTax !== undefined) o.donorGiftTaxAmount = donorGiftTax;
    const donorGiftBase = parseIntOrUndef(lot.donorGiftTaxableValue ?? "");
    if (donorGiftBase !== undefined) o.donorGiftTaxableValue = donorGiftBase;
    if (lot.donorRelation) o.donorRelation = lot.donorRelation;
    if (lot.donorDeceased) o.donorDeceased = true;
  }
  if (lot.acquisitionCause === "merger_split" && lot.preMergerAcquisitionDate) {
    o.preMergerAcquisitionDate = lot.preMergerAcquisitionDate;
  }
  // §97의2④ 가업상속 lot — 술어(국내·실가·분할/다건 lot·이 lot 원인 상속)를 통과하고 토글이 ON일 때만 싣는다(잔존값 inert).
  //   적용률 법정량은 매도일 시대의 쌍만 `fbRateBasis`로 싣는다. 종목 축(`familyBusinessInheritance`)과는 술어가 배타라 동시에 실리지 않는다.
  if (isStockFbLotOn(form, lot)) {
    const fb = buildStockFbLotInput(form, lot);
    if (fb) o.familyBusinessInheritance = fb;
  }
  return o;
}

