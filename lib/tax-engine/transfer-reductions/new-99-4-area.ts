/**
 * 조특법 §99의4 — 연접 배제(③)와 소재지 요건(①1호가목·2호나목)의 **시기별 문언** (엔진 메시지·입력 화면 공용)
 *
 * ③은 사용자가 답하는 토글(`isAdjacentArea`)이라 판정은 그대로 두고, **무엇을 묻는지**(비교 행정구역 단위)를
 * 취득일·양도일에 맞춘다. 2026-11-05 시행본별 본문 실독:
 * - 2009.1.1. 개정(법률 제9272호): 「같은 읍·면·시 또는 연접한 읍·면·시」 — 부칙 제22조 「이 법 시행 후 최초로
 *   농어촌주택 또는 고향주택을 취득하는 분부터」. 그 전 취득분은 종전 「같은 읍·면 또는 연접한 읍·면」.
 * - 2015.1.1. 개정(법률 제12853호): 농어촌주택 「같은 읍·면 또는 연접한 읍·면」, 고향주택 「같은 시 또는 연접한 시」
 *   — 부칙 제2조③ 「이 법 시행 이후 양도하는 분부터」.
 * - 2026.1.1. 개정(법률 제21223호): 농어촌주택 「같은 읍·면·동 또는 연접한 읍·면·동」 — 부칙 제42조 「이 법 시행 전에
 *   농어촌주택을 취득한 경우」 종전 규정.
 * - 확인 필요 칸: 2009.1.1. 전 취득 × 2010.1.1.~2014.12.31. 양도. 2010.1.1. 문언 정비(법률 제9921호, 「읍·면·시」
 *   유지)의 일반적 적용례(「이 법 시행 후 최초로 양도하는 분부터」)가 이 칸에 미치는지는 정면 해석을 찾지 못했다.
 *   묻는 단위는 부칙 제22조대로 「읍·면」으로 두고 그 사실을 문언에 적는다.
 */

import { NEW_99_4_AREA_ADDENDA, NEW_99_4_STD_PRICE_ADDENDA } from "../legal-codes/transfer";

const T_2009 = new Date("2009-01-01").getTime();
const T_2010 = new Date("2010-01-01").getTime();
const T_2015 = new Date("2015-01-01").getTime();
const T_2021 = new Date("2021-01-01").getTime();
const T_2024 = new Date("2024-01-01").getTime();
const T_2026 = new Date("2026-01-01").getTime();

export interface New994AdjacentScope {
  /** ③ 「같은 ○ 또는 연접한 ○」의 행정구역 단위 */
  unit: "읍·면" | "읍·면·시" | "읍·면·동" | "시";
  /** 종전 규정을 쓰는 근거(현행 문언이면 빈 문자열) */
  basis: string;
  /** 해석이 갈리는 칸의 안내 */
  unsettled?: string;
}

/**
 * ③ 비교 단위 — 농어촌주택은 취득일(필요하면 양도일), 고향주택은 양도일로 정한다. 정할 수 없으면 `undefined`.
 */
export function resolveNew994AdjacentScope(input: {
  isHometown: boolean;
  ruralHouseAcquisitionDate?: Date;
  transferDate?: Date;
}): New994AdjacentScope | undefined {
  const tr = input.transferDate?.getTime();
  const pre2015 = (by: string) => `2015.1.1. 전 양도분 — ${by}에 따라 종전 규정`;
  if (input.isHometown) {
    if (tr === undefined) return undefined;
    return tr < T_2015
      ? { unit: "읍·면·시", basis: pre2015(NEW_99_4_AREA_ADDENDA.AMEND_2015_TRANSFER) }
      : { unit: "시", basis: "" };
  }
  const acq = input.ruralHouseAcquisitionDate?.getTime();
  if (acq === undefined) return undefined;
  const pre2026 = `2026.1.1. 전 취득분 — ${NEW_99_4_AREA_ADDENDA.AMEND_2026_ADJACENT_ACQUISITION}에 따라 종전 규정`;
  if (acq >= T_2026) return { unit: "읍·면·동", basis: "" };
  if (acq < T_2009) {
    if (tr === undefined || tr >= T_2015) return { unit: "읍·면", basis: pre2026 };
    return {
      unit: "읍·면",
      basis: `2009.1.1. 전 취득분 — ${NEW_99_4_STD_PRICE_ADDENDA.AMEND_2009_ACQUISITION}에 따라 종전 규정`,
      ...(tr >= T_2010
        ? {
            unsettled: `2010.1.1.~2014.12.31. 양도분에 「읍·면·시」 문언(${NEW_99_4_AREA_ADDENDA.AMEND_2010_TRANSFER})이 미치는지는 확인 필요`,
          }
        : {}),
    };
  }
  if (tr === undefined) return undefined;
  return tr < T_2015
    ? { unit: "읍·면·시", basis: pre2015(NEW_99_4_AREA_ADDENDA.AMEND_2015_TRANSFER) }
    : { unit: "읍·면", basis: pre2026 };
}

/**
 * ①1호가목3)·2호나목2) 배제 지역 — 2021.1.1. 이후 취득분은 「조정대상지역」, 그 전 취득분은 「지정지역」(소득세법 제104조의2제1항)
 * (법률 제17759호 부칙 제21조①). 취득일을 모르면 두 문언을 함께 적는다.
 */
export function new994RegulatedAreaLabel(ruralHouseAcquisitionDate?: Date): string {
  const acq = ruralHouseAcquisitionDate?.getTime();
  if (acq === undefined) return "조정대상지역(2021.1.1. 전 취득분은 지정지역)";
  return acq >= T_2021 ? "조정대상지역" : "지정지역";
}

/** ①1호가목 기회발전특구 소재 — 2024.1.1. 이후 일반주택 양도분부터(법률 제19936호 부칙 제16조). 양도일 미상은 `undefined`. */
export function new994OpportunityZoneApplies(transferDate?: Date): boolean | undefined {
  const tr = transferDate?.getTime();
  return tr === undefined ? undefined : tr >= T_2024;
}

/** ③ 불적용 메시지 — 엔진 사유와 화면 안내가 같은 문언을 쓴다. */
export function new994AdjacentMessage(input: {
  isHometown: boolean;
  ruralHouseAcquisitionDate?: Date;
  transferDate?: Date;
}): string {
  const houseLabel = input.isHometown ? "고향주택" : "농어촌주택";
  const scope = resolveNew994AdjacentScope(input);
  if (!scope) {
    return `${houseLabel}과 일반주택이 행정구역상 같거나 연접한 지역에 있으면 적용되지 않습니다 (§99의4③ — 비교 단위는 취득일·양도일에 따라 다릅니다).`;
  }
  const tail = [scope.basis, scope.unsettled].filter(Boolean).join(" · ");
  return `${houseLabel}과 일반주택이 행정구역상 같은 ${scope.unit} 또는 연접한 ${scope.unit}에 있으면 적용되지 않습니다 (§99의4③${tail ? ` · ${tail}` : ""}).`;
}
