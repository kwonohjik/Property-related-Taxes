/**
 * receiveOnly(사례 46 — 청산금 수령분 단독 신고) 결과 표시 보정 — 무의존 leaf.
 *
 * ## 왜 필요한가
 *
 * 「청산금 수령분 단독 신고」에서 신고 대상은 **청산금 수령분뿐**이다. 신축 APT 양도는 신고 대상이
 * 아니므로 신고단위 양도가액 = 청산금 수령액이고, 양도시기 = 소유권이전 고시일의 익일이다.
 *
 * ④ API 변환 계층은 이 규칙을 이미 구현하고 있다(`lib/calc/transfer-tax-api.ts:332`·`:341`).
 * 그런데 ⑦ 결과 표시는 폼 원본(`contractTotalPrice`·`transferDate`)을 그대로 읽어
 * 합계 열이 파트 합과 어긋났다. 이 leaf가 ④와 같은 규칙을 ⑦에 적용한다.
 *
 * 법령: 소득세법 시행령 §166① 본문 + §166①2호 가목 (청산금 수령분 단독 산식)
 *       양도시기 = 소유권이전 고시일 익일 (NTS 집행기준 · 시행령 §162①9호)
 *
 * ## 🔴 플래그만으로 발동하지 않는다
 *
 * 엔진은 `receiveOnlyMode`를 **분기 발동과 무관하게 입력값 그대로 echo**한다
 * (`lib/tax-engine/redevelopment.ts:695`). receiveOnly 산식은 `computeAptReceive`
 * (`redevelopment-split.ts:314`) 안에만 있어 `subject="right"`에는 대응 분기가 없다.
 *
 * 실측(계획서 V-1): `right` + `receiveOnlyMode=true` → 플래그는 `true`인데
 * `preApproval.apportionedTransfer = 386,000,000`이다. 플래그만 믿고 합계를 settlement
 * 단독으로 바꾸면 **인가전 분이 통째로 사라지고** 취득가액 역산까지 붕괴한다.
 * ⇒ **인가전·인가후 파트가 모두 0일 때만** 발동한다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

export interface ReceiveOnlyDisplay {
  /** 신고단위 양도가액 — 발동 시 청산금 수령액, 아니면 fallback 그대로 */
  transferPrice: number;
  /** 신고단위 양도일(YYYY-MM-DD) — 발동 시 소유권이전 고시일 익일, 아니면 fallback 그대로 */
  transferDate: string;
  /** 보정이 실제로 적용됐는지 (호출부 분기·테스트용) */
  applied: boolean;
}

/**
 * receiveOnly 분기가 실제로 발동한 결과인지 판정.
 * 플래그 + 파트 0 **둘 다** 만족해야 한다(위 주석 V-1 참조).
 */
function isReceiveOnlyApplied(result: TransferTaxResult): boolean {
  const d = result.redevelopmentDetail;
  if (!d || d.receiveOnlyMode !== true) return false;
  return (
    d.preApproval.apportionedTransfer === 0 &&
    d.postApprovalExistingHouse.apportionedTransfer === 0
  );
}

/**
 * `Date | string` → `YYYY-MM-DD`.
 *
 * 🔴 **타입은 `Date`지만 런타임에는 `string`이 온다.** 결과는 API Route를 거쳐 JSON으로
 * 직렬화되므로 `branchTransferDate`가 화면에 도달할 땐 문자열이다(프로젝트 공통 함정 —
 * 루트 CLAUDE.md 「API Date 직렬화」). 엔진을 직접 호출하는 단위 테스트에서는 `Date`라
 * **단위 anchor로는 드러나지 않는다** — E2E(E-1)가 이 경로를 잡았다.
 *
 * ⚠️ `toISOString()`은 **의도적**이다. 신고서 ③ 청산금 분 열이 같은 값을
 * `fmtD`(`FilingFormTableRedevRows.ts:28-32`)로 그리는데 그것이 `toISOString().slice(0,10)`이다.
 * 합계 열이 다른 변환을 쓰면 두 열이 하루 어긋날 수 있으므로 **③ 열과 동일 변환을 재사용**한다.
 */
function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/**
 * receiveOnly 표시 보정. 발동 조건 미충족이면 fallback을 **그대로** 돌려준다(무해).
 *
 * @param result               엔진 결과 — 판정·값의 단일 소스
 * @param fallbackTransferPrice 폼 기준 양도가액(`override ?? contractTotalPrice`)
 * @param fallbackTransferDate  폼 기준 양도일(`formData.transferDate`)
 */
export function resolveReceiveOnlyDisplay(
  result: TransferTaxResult,
  fallbackTransferPrice: number,
  fallbackTransferDate: string,
): ReceiveOnlyDisplay {
  if (!isReceiveOnlyApplied(result)) {
    return { transferPrice: fallbackTransferPrice, transferDate: fallbackTransferDate, applied: false };
  }
  const settlement = result.redevelopmentDetail!.settlement;
  // branchTransferDate 미부착·변환 실패 시 fallback 유지 — 자동 추정 금지(계획서 V-4)
  const branchDate = settlement.branchTransferDate
    ? toDateString(settlement.branchTransferDate)
    : "";
  return {
    transferPrice: settlement.apportionedTransfer,
    transferDate: branchDate || fallbackTransferDate,
    applied: true,
  };
}
