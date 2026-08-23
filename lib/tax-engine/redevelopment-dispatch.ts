/**
 * 재개발/재건축 — 분기 활성 판정 + finalize LTHD 라인 빌더
 *
 * `redevelopment.ts`에서 분리 (2026-08-23, 800줄 정책). 계산 로직이 아니라 **바깥과의 접점**
 * 두 가지만 담는다:
 *  - `isRedevelopmentActive` : transfer-tax.ts STEP 0.65의 진입 판정
 *  - `buildLthdEmitLines`    : transfer-tax-finalize.ts의 LTHD 3줄 emit 입력
 *
 * 기존 import 경로(`./redevelopment`)는 그대로 살아 있다 — 그쪽이 re-export한다.
 */

import type {
  RedevelopmentInfo,
  RedevelopmentResult,
} from "./types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// finalize 입력 빌더 — transfer-tax-finalize.ts LTHD 3줄 emit 용
// ──────────────────────────────────────────────────────────────────────────────

/**
 * finalize emit 용 LTHD 라인 3줄 산출.
 * code === 'LTHD' 라인 ID + 금액·율·gain·holdingMonths 노출.
 *
 * FilingFormTable 3열 표시와 1:1 매칭되어야 함 (anchor: lines.length === 3).
 */
export interface RedevelopmentLthdEmitLine {
  lineId: "preApproval" | "postApprovalExistingHouse" | "settlement";
  code: "LTHD";
  gain: number;
  rate: number;
  amount: number;
  holdingMonths: number;
  applicable: boolean;
}

export function buildLthdEmitLines(result: RedevelopmentResult): RedevelopmentLthdEmitLine[] {
  // 사례 48 — 승계조합원 분기: postApprovalExistingHouse 단일 line emit.
  if (result.successorMemberApplied === true) {
    return [
      {
        lineId: "postApprovalExistingHouse",
        code: "LTHD",
        gain: result.postApprovalExistingHouse.gain,
        rate: result.postApprovalExistingHouse.lthdRate,
        amount: result.postApprovalExistingHouse.lthd,
        holdingMonths: result.postApprovalExistingHouse.holdingMonths,
        applicable:
          result.postApprovalExistingHouse.lthd > 0 ||
          result.postApprovalExistingHouse.gain > 0,
      },
    ];
  }

  return [
    {
      lineId: "preApproval",
      code: "LTHD",
      gain: result.preApproval.gain,
      rate: result.preApproval.lthdRate,
      amount: result.preApproval.lthd,
      holdingMonths: result.preApproval.holdingMonths,
      applicable: result.preApproval.lthd > 0 || result.preApproval.gain > 0,
    },
    {
      lineId: "postApprovalExistingHouse",
      code: "LTHD",
      gain: result.postApprovalExistingHouse.gain,
      rate: result.postApprovalExistingHouse.lthdRate,
      amount: result.postApprovalExistingHouse.lthd,
      holdingMonths: result.postApprovalExistingHouse.holdingMonths,
      applicable:
        result.postApprovalExistingHouse.lthd > 0 ||
        result.postApprovalExistingHouse.gain > 0,
    },
    {
      lineId: "settlement",
      code: "LTHD",
      gain: result.settlement.gain,
      rate: result.settlement.lthdRate,
      amount: result.settlement.lthd,
      holdingMonths: result.settlement.holdingMonths,
      applicable: result.settlement.lthd > 0 || result.settlement.gain > 0,
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// 활성 분기 판정 (transfer-tax.ts STEP 분기용)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * TransferTaxInput.redevelopment 존재 + propertyType 호환 여부 판정.
 *
 * propertyType="redevelopment_apt" 또는 "right_to_move_in" + redevelopment 입력 시 활성.
 * 그 외는 false → transfer-tax.ts 의 일반 분기 사용.
 *
 * ## 승계조합원 입주권은 활성 대상이 아니다 (2026-08-23)
 *
 * 「소득세법 시행령」 §166①은 「조합원이 **당해 조합에 기존건물과 그 부수토지를 제공**(건물 또는
 * 토지만을 제공한 경우를 포함한다)**하고 취득한** 입주자로 선정된 지위를 양도하는 경우 **그 조합원의**
 * 양도차익」으로 요건을 한정한다. 승계조합원은 조합에 제공한 사실이 없으므로 이 요건을 충족하지
 * 않는다 ⇒ 양도차익은 §100①·§95①·§97①1호 가목의 **일반 원칙**으로 계산한다.
 *
 * 그 결과 일반 분기가 다음을 **구조적으로** 보장한다(별도 구현 불필요):
 *  - LTHD 0 — `transfer-tax-lthd.ts:77` 이 승계 입주권을 이미 배제한다(§95② 괄호
 *    「조합원으로부터 취득한 것은 제외한다」).
 *  - §89①4호 비과세 미적용 — 그 로직은 §166 분기 안(`applyOneRightExemption`)에만 있다.
 *    §89①4호 본문은 「관리처분계획의 인가일 … 현재 제3호가목에 해당하는 기존주택을 **소유하는
 *    세대**」를 요구하므로 승계조합원은 애초에 대상이 아니다.
 *
 * ⚠️ 정상 경로에서는 API 변환이 승계 입주권에 `redevelopment` 페이로드를 **아예 만들지 않는다**
 *    (`lib/calc/transfer-tax-api.ts`). 이 가드는 그 배선을 우회하는 **직접 fixture 입력**에 대한
 *    안전망이다 — 둘 다 둔다(PR #1246에서 `receiveOnlyMode`에 적용한 것과 같은 2중 패턴).
 */
export function isRedevelopmentActive(
  propertyType: string,
  redevelopment: RedevelopmentInfo | undefined,
  isSuccessorRightToMoveIn?: boolean,
): boolean {
  if (redevelopment == null) return false;
  if (propertyType === "redevelopment_apt") return redevelopment.subject === "apt";
  if (propertyType === "right_to_move_in") {
    if (isSuccessorRightToMoveIn === true) return false;
    return redevelopment.subject === "right";
  }
  return false;
}
