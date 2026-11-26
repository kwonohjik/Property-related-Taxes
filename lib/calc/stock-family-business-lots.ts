/**
 * 주식 양도 — 가업상속공제 자산 의제 취득가액(소득세법 §97의2④) **취득 lot 축** 폼 술어·헬퍼 (④·⑤·⑧ 공유 단일 소스)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.7(L-a~L-g)
 *
 * 단건 축(`stock-family-business.ts`)과 **같은 7필드·같은 빌더·같은 gap 검사**를 쓴다 — 여기는 lot이 다른 부분만 둔다:
 *   · 노출·전송·검증 술어: 국내 시장 ∧ 분할·다건 lot 모드 ∧ 취득가액 실가 ∧ **그 lot의 취득원인이 상속**
 *   · 적용률 법정량 시대 = **매도 lot들의 양도일**(L-b) — 단건은 폼 양도일 하나지만 lot은 매도가 여럿일 수 있다.
 *     매도일들이 2026-02-27을 사이에 두면(한 가업 lot이 양쪽에 배정될 수 있다) ⑧이 막는다(엔진은 배정 뒤 throw).
 *
 * 종목 축(단건)과 lot 축은 **술어가 서로 배타**다 — 단건은 `!isLotsModeForm`, lot은 `isLotsModeForm`이 조건이라
 * 한 body에 두 축이 동시에 실리지 않는다(엔진·⑩이 막는 조합 — 계획서 §7.7 L-a).
 * 통과하지 못한 lot에 남은 값은 inert다(④ 미전송 · ⑧ 미검증 — 계획서 Q-10).
 *
 * 순수 함수 — 스토어·DOM·네트워크 없음.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-types";
import type { StockFamilyBusinessInput } from "@/lib/tax-engine/stock-transfer/types/stock-family-business.types";
import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { effectiveTransferDate } from "./stock-effective-transfer-date";
import { isLotsModeForm } from "./stock-transfer-section94-4-form";
import {
  buildStockFbInputFromFields,
  isStockFbDomesticMarket,
  stockFbFieldGaps,
  stockFbRateEra,
  type StockFbFields,
  type StockFbGap,
} from "./stock-family-business";

type StockFbForm = StockTransferFormData;

/** lot의 7필드 — 없는 값(구 이력·신규 lot)은 factory(`createEmptyAcquisitionLot`)와 같은 기본값이다 */
export function lotFbFields(lot: AcquisitionLotForm): StockFbFields {
  return {
    familyBusinessInheritance: lot.familyBusinessInheritance === true,
    fbDecedentPerSharePrice: lot.fbDecedentPerSharePrice ?? "",
    fbDecedentCapitalExpenditure: lot.fbDecedentCapitalExpenditure ?? "",
    fbDeductionAmount: lot.fbDeductionAmount ?? "",
    fbBusinessEstateValue: lot.fbBusinessEstateValue ?? "",
    fbCorpTotalAssets: lot.fbCorpTotalAssets ?? "",
    fbCorpNonBusinessAssets: lot.fbCorpNonBusinessAssets ?? "",
  };
}

/** lot 카드에 가업상속 칸이 보이는 조건 — 국내 시장 ∧ 분할·다건 lot 모드 ∧ 이 lot의 취득원인이 상속 */
export function isStockFbLotCardVisible(form: StockFbForm, lot: AcquisitionLotForm): boolean {
  return isStockFbDomesticMarket(form.marketType) && isLotsModeForm(form) && lot.acquisitionCause === "inheritance";
}

/** ④·⑤·⑧ 공유 술어 — 이 lot에서 §97의2④ 입력을 받고 보내고 검증하는가 */
export function allowsStockFbLot(form: StockFbForm, lot: AcquisitionLotForm): boolean {
  return (
    isStockFbLotCardVisible(form, lot) &&
    (form.acquisitionMode || "actual") === "actual" // 3중 패턴 default
  );
}

/** 카드는 보이지만 입력을 받을 수 없을 때의 사유 — 받을 수 있거나 카드가 안 보이면 null */
export function stockFbLotBlockedReason(form: StockFbForm, lot: AcquisitionLotForm): string | null {
  if (!isStockFbLotCardVisible(form, lot) || allowsStockFbLot(form, lot)) return null;
  return "취득가액을 실지거래가액(상속개시일 현재 평가액)으로 입력한 경우에만 적용합니다 — 환산취득가·매매사례가액에서는 쓸 수 없습니다";
}

/** 술어 통과 + 토글 ON — 「이 lot의 가업상속 입력이 실제로 쓰이는 상태」 */
export function isStockFbLotOn(form: StockFbForm, lot: AcquisitionLotForm): boolean {
  return lot.familyBusinessInheritance === true && allowsStockFbLot(form, lot);
}

/** 쓰이는 가업 lot이 하나라도 있는가 — 사이드바 라벨 등 */
export function hasStockFbLotOn(form: StockFbForm): boolean {
  return (form.acquisitionLots ?? []).some((l) => isStockFbLotOn(form, l));
}

/**
 * 이 계산의 **매도 lot 양도일**들이 가르는 법정량 시대.
 *   - `era` = 가장 이른 양도일의 시대(분할이 아니면 폼 양도일 하나). 양도일이 비었으면 null.
 *   - `straddle` = 양도일들이 2026-02-27을 사이에 두고 갈린다 — 한 시대의 법정량 쌍 하나로는 모든 매도를 덮을 수 없다(L-b).
 */
export function stockFbLotSaleEra(form: StockFbForm): {
  era: FamilyBusinessRateBasis["kind"] | null;
  straddle: boolean;
} {
  const dates = form.lotsMode === "split" ? (form.transferLots ?? []).map((l) => l.transferDate) : [form.transferDate];
  const eras = new Set(
    dates
      .filter((d) => toOptionalDate(d) !== undefined)
      .map((d) => stockFbRateEra(d))
      .filter((e): e is FamilyBusinessRateBasis["kind"] => e !== null),
  );
  return { era: stockFbRateEra(effectiveTransferDate(form)), straddle: eras.size > 1 };
}

/**
 * lot → 엔진 입력(`StockFamilyBusinessInput`). ④ body가 쓴다.
 * 시대는 매도일에서 파생한다(가장 이른 매도일의 시대 — 갈리면 ⑧이 막는다). 매도일을 모르면 null.
 */
export function buildStockFbLotInput(form: StockFbForm, lot: AcquisitionLotForm): StockFamilyBusinessInput | null {
  return buildStockFbInputFromFields(lotFbFields(lot), stockFbLotSaleEra(form).era);
}

/** ⑧ lot 필수 입력 누락 — 단건과 같은 검사(`stockFbFieldGaps`)에 lot 번호를 붙인다. 필드는 `acquisitionLots[i].fb…` */
export function stockFbLotInputGaps(form: StockFbForm, lot: AcquisitionLotForm, index: number): StockFbGap[] {
  return stockFbFieldGaps(lotFbFields(lot), stockFbLotSaleEra(form).era).map((g) => ({
    field: `acquisitionLots[${index}].${g.field}`,
    message: `매수 lot #${index + 1} (상속) 가업상속공제: ${g.message}`,
  }));
}

/** 매도일이 2026.2.27.을 사이에 둘 때의 차단 문구 — ⑤ 카드와 ⑧이 같은 문장을 쓴다 */
export const STOCK_FB_LOT_STRADDLE_MESSAGE =
  "매도일이 2026.2.26. 이전과 2026.2.27. 이후에 걸쳐 있어 가업상속 lot의 적용률 법정량(구 ③ 공제금액·재산가액 / ③2호 법인 총자산가액·사업무관자산가액)을 한 쌍으로 정할 수 없습니다 — " +
  "매도일 기준으로 신고를 나누어 각각 계산하세요 (한 가업상속 lot이 양쪽 매도에 배정되는 경우는 이 화면에서 지원하지 않는 한계입니다)";
