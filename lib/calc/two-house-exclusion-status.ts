/**
 * 소득세법 시행령 §167의10①3호·7호의 **기산 상태** — ⑤·④·⑧·⑫ 공용 (사용자 결정 2026-10-04).
 *
 * 법문(MST 290841 실독):
 * - 3호 「…1세대 2주택이 된 경우의 해당 주택(취득 후 1년 이상 거주하고 **해당 사유가 해소된 날부터 3년이
 *   경과하지 아니한 경우에 한정**한다)」
 * - 7호 「주택의 소유권에 관한 **소송이 진행 중**이거나 해당 소송결과로 취득한 주택(소송으로 인한 **확정판결일부터
 *   3년이 경과하지 아니한 경우에 한정**한다)」
 *
 * ## 왜 택일 입력인가
 *
 * 종전 화면은 날짜 칸 하나였고 **빈 값 = 미해소·진행 중**으로 읽었다(7호 라벨 「미입력=진행 중」). 같은 빈 값에
 * 「날짜를 모른다」가 겹쳐, 모르면 배제(유리)로 계산됐다. 「모름은 납세자에게 불리하게」 원칙에 따라 두 뜻을
 * 갈라 「양도일 현재 미해소·진행 중」을 **명시 선택**으로 받고, 날짜도 선택도 없으면 계산하지 않는다(⑧·⑫).
 * 엔진은 둘 다 없으면 불성립으로 본다(직접 호출 방어 — `multi-house-surcharge-exclusion.ts`).
 *
 * 구 저장분(날짜 빈 값)은 이관하지 않는다 — 「진행 중」 뜻으로 비웠는지 몰라서 비웠는지 구별할 수 없으므로
 * ⑧이 선택을 요구해 사용자가 다시 고르게 한다.
 */

export interface TwoHouseExclusionStatusSource {
  isUnavoidableReason?: boolean;
  unavoidableReasonResolvedDate?: string;
  unavoidableReasonUnresolved?: boolean;
  isLitigationHousing?: boolean;
  litigationAcquisitionDate?: string;
  litigationPending?: boolean;
}

type StatusField = "unavoidableReasonResolvedDate" | "litigationAcquisitionDate";

/** ⑧·⑫ — 켜진 호의 기산 상태(날짜 또는 「미해소·진행 중」 선택)가 비었으면 그 칸과 문구. */
export function twoHouseExclusionStatusIssue(
  h: TwoHouseExclusionStatusSource,
): { field: StatusField; message: string } | null {
  if (h.isUnavoidableReason && h.unavoidableReasonUnresolved !== true && !h.unavoidableReasonResolvedDate) {
    return {
      field: "unavoidableReasonResolvedDate",
      message:
        "부득이한 사유 주택: 사유 해소일을 입력하거나 「양도일 현재 사유가 해소되지 않음」을 고르세요 (소득세법 시행령 §167의10①3호)",
    };
  }
  if (h.isLitigationHousing && h.litigationPending !== true && !h.litigationAcquisitionDate) {
    return {
      field: "litigationAcquisitionDate",
      message:
        "소송 주택: 소송 확정판결일을 입력하거나 「양도일 현재 소송 진행 중」을 고르세요 (소득세법 시행령 §167의10①7호)",
    };
  }
  return null;
}

/**
 * ⑫ 전용 — 날짜와 「미해소·진행 중」이 함께 오면 모순. ⑧은 보지 않는다: ⑤가 선택 시 날짜를 지우고 칸을 숨기며
 * ④가 남은 날짜를 싣지 않으므로, 화면에서는 생기지 않고 stale 값으로 막으면 지울 칸이 없는 막다른 길이 된다.
 */
export function twoHouseExclusionStatusConflict(
  h: TwoHouseExclusionStatusSource,
): { field: StatusField; message: string } | null {
  if (h.isUnavoidableReason && h.unavoidableReasonUnresolved === true && h.unavoidableReasonResolvedDate) {
    return {
      field: "unavoidableReasonResolvedDate",
      message: "부득이한 사유 해소일과 「양도일 현재 사유가 해소되지 않음」은 함께 보낼 수 없습니다 (소득세법 시행령 §167의10①3호)",
    };
  }
  if (h.isLitigationHousing && h.litigationPending === true && h.litigationAcquisitionDate) {
    return {
      field: "litigationAcquisitionDate",
      message: "소송 확정판결일과 「양도일 현재 소송 진행 중」은 함께 보낼 수 없습니다 (소득세법 시행령 §167의10①7호)",
    };
  }
  return null;
}

/** ④ — 켜진 호의 기산 상태만 싣는다. 「미해소·진행 중」을 골랐으면 남은 날짜는 싣지 않는다(⑤가 칸을 숨긴다). */
export function twoHouseExclusionStatusPayload(h: TwoHouseExclusionStatusSource): {
  unavoidableReasonResolvedDate?: string;
  unavoidableReasonUnresolved?: true;
  litigationAcquisitionDate?: string;
  litigationPending?: true;
} {
  const unresolved = h.isUnavoidableReason === true && h.unavoidableReasonUnresolved === true;
  const pending = h.isLitigationHousing === true && h.litigationPending === true;
  return {
    unavoidableReasonResolvedDate:
      h.isUnavoidableReason && !unresolved ? h.unavoidableReasonResolvedDate || undefined : undefined,
    ...(unresolved ? { unavoidableReasonUnresolved: true as const } : {}),
    litigationAcquisitionDate:
      h.isLitigationHousing && !pending ? h.litigationAcquisitionDate || undefined : undefined,
    ...(pending ? { litigationPending: true as const } : {}),
  };
}
