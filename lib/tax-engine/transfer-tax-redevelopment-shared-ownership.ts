/**
 * 재개발 §166 — **공유지분 양도의 12억 기준 = 물건 전체 가액** 관련 보조 (#11 · 2026-10-11 사용자 결정 A).
 *
 * 청산금 수령분(Step A.6)과 조합원입주권(§89①4호 단서, Step A.7)의 고가 비교·안분은 지분 가액이 아니라
 * 물건 전체 가액으로 한다. 완공 신축주택분은 앞선 G3-1 수정이 같은 순서(`resolveHighValuePriceCheck`)로 맞췄다.
 *
 *  · ① 청산금 수령분 — 종전주택의 분할양도라 「소득세법 시행령」 §156①·§160①이 바로 적용되고, 기준인 권리가격은
 *    관리처분계획에 공유 물건 단위로 정해진다 → `settlementRightsValueBase`.
 *  · ② 입주권 — §156①은 3호 주택 문언이라 4호 단서에는 **유추**다. 현행 4호 체계의 공유 입주권 해석례를 확인하지 못해
 *    결과에 「확인 필요」를 싣는다 → `oneRightSharedOwnershipNotice`.
 *  · 1인 분할취득(축 B) 입주권의 지분별 취득일 차이 → `soleSplitRightShareDateNotice`.
 */
import type { TransferTaxInput } from "./types/transfer.types";
import type { RedevelopmentInfo, RedevelopmentResult } from "./types/transfer-redevelopment.types";

/** 청산금 수령분 고가 비교·안분에 쓰는 권리가격 — 공유지분이면 물건 전체, 아니면 `rightsValue`. */
export function settlementRightsValueBase(redevInfo: Pick<RedevelopmentInfo, "rightsValue" | "rightsValueWhole">): number {
  return (redevInfo.rightsValueWhole ?? 0) > 0 ? redevInfo.rightsValueWhole! : redevInfo.rightsValue;
}

/**
 * 공유지분 입주권 양도의 「확인 필요」 고지 — **공유**(타인 소유 지분이 있음)에만 붙는다.
 *
 * 조건(AND): 4호 비과세가 성립해 고가 안분이 걸렸고(`oneRightHighValueApplied`) · 12억 비교 분모가 물건 전체 가액
 * (`totalPropertyTransferPrice`)이며(부담부증여 증여가액이 분모면 아니다) · 지분 양도(물건 전체 > 양도가액)이고 ·
 * 1인 분할취득(축 B)이 아니다.
 * 청산금 수령분(①)과 1인 분할취득은 문언·단건 결과로 정해져 고지가 없다.
 */
export function oneRightSharedOwnershipNotice(
  input: Pick<TransferTaxInput, "totalPropertyTransferPrice" | "transferPrice" | "burdenedGiftDenominator" | "soleSplitAcquisition">,
  oneRightHighValueApplied: boolean | undefined,
): string | undefined {
  if (oneRightHighValueApplied !== true) return undefined;
  if ((input.burdenedGiftDenominator ?? 0) > 0) return undefined;
  const whole = input.totalPropertyTransferPrice ?? 0;
  if (whole <= input.transferPrice) return undefined;
  if (input.soleSplitAcquisition === true) return undefined;
  return (
    "공유지분 조합원입주권의 고가(고가 기준금액 초과) 비교·안분은 물건 전체 양도가액을 기준으로 계산했습니다 — " +
    "「소득세법 시행령」 §156①(타인 소유부분을 포함한 물건 전체 가액)·§160①(양도하는 부분의 비율로 안분)을 " +
    "「소득세법」 §89①4호 단서에 유추한 것입니다. 공유자 전원이 함께 양도한 경우는 서면인터넷방문상담5팀-1034(2006.11.29. — 구 체계의 공동소유 " +
    "입주권 사안)의 논리를 유추한 것이고, 본인 지분만 양도한 경우는 현행 4호 체계에서 이를 다룬 해석례를 확인하지 못했습니다 — 확인 필요."
  );
}

/**
 * 1인 분할취득(축 B) 조합원입주권 — 둘째 이후 지분의 취득일이 첫 지분과 다를 때의 「확인 필요」 고지.
 *
 * 둘째 이후 지분 카드는 §89①4호 판정 선언(인가일 현재 기존주택 요건 등)을 첫 카드 값으로 쓴다
 * (④ `lib/calc/sole-split-right-judgment-facts.ts` — 판정 메뉴가 첫 카드에만 받는다). 지분마다 취득일이 다르면
 * 인가일 현재 보유요건이 지분마다 달라질 수 있는데, 지분 단위 보유기간 기산을 다룬 해석례를 확인하지 못했다.
 * 세액은 바꾸지 않는다. 축 B 지분 전부를 함께 보는 다건 엔진(`transfer-tax-aggregate-asset-records.ts`)이 부른다.
 *
 * 조건(AND): 축 B · 그 지분에 §89①4호 비과세나 고가 안분이 적용됨 · 취득일이 첫 지분과 다름(첫 지분 자신은 같으므로 빠진다).
 */
export function soleSplitRightShareDateNotice(
  share: Pick<TransferTaxInput, "soleSplitAcquisition" | "acquisitionDate">,
  first: Pick<TransferTaxInput, "acquisitionDate">,
  detail: Pick<RedevelopmentResult, "oneRightExemptionApplied" | "oneRightHighValueApplied"> | undefined,
): string | undefined {
  if (share.soleSplitAcquisition !== true) return undefined;
  // §89①4호 비과세·고가 안분이 적용됐다 = 입주권이고 「충족」 선언이 결론에 쓰였다(엔진은 선언 없이 적용하지 않는다 — transforms.ts:239).
  if (detail?.oneRightExemptionApplied !== true && detail?.oneRightHighValueApplied !== true) return undefined;
  if (share.acquisitionDate.getTime() === first.acquisitionDate.getTime()) return undefined;
  return (
    "같은 조합원입주권을 지분별로 나눠 취득했고 이 지분의 취득일이 첫 지분과 다릅니다 — 「소득세법」 §89①4호의 " +
    "관리처분계획인가일 현재 기존주택 요건은 첫 지분 카드(판정 메뉴)에서 선언한 값을 이 지분에도 적용했습니다. " +
    "지분별 취득일이 달라 인가일 현재 보유요건이 지분마다 다를 수 있으나 이를 다룬 해석례를 확인하지 못했습니다 — 확인 필요."
  );
}
