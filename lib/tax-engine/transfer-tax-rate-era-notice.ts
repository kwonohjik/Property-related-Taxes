/**
 * 양도소득세 세율표·장특 표1 연혁 미지원 고지 (리뷰 US-10 · US-11 · Q-30 (b) — 세액 불변).
 *
 * 1. 2002-01-01 전 양도: 누진세율 시행본(`data/transfer-rate-seed-historical.ts` 1990-01-01 행)을 읽지 않았다 — 근사 세율표로 계산했다.
 *    (2002.1.1~2008.3.20 양도는 9/18/27/36 법정표를 읽는다 — 후속 W1, MST 55566·58262·66275·76551·82364·84761 대조.)
 *    1996-01-01 전 양도는 장특 표1 연혁도 미지원이다(`data/lthd-table1-era.ts`).
 * 2. 2009-01-01~2009-03-15 양도 + 1세대 3주택 이상 주택(또는 주택+조합원입주권 합 3 이상): 소득세법 §104⑥ 1호(2008.12.26. 신설, MST 91969)의
 *    45%는 지원하지 않는다(Q-30 (b)). 엔진은 기본세율(§55①)로 계산한다.
 */
import { isTable1EraUnsupported, LTHD_TABLE1_UNSUPPORTED_NOTICE } from "./data/lthd-table1-era";
import { TRANSFER } from "./legal-codes";

/**
 * 누진세율 시행본을 읽은 첫 양도일 — 2002.1.1.(법률 제6557호 시행·부칙 제4조 「시행 후 최초로 양도하는 분부터」). 이 날 전은 미지원.
 * 9/18/27/36 표는 2002.1.1~2008.12.31 양도분에 같다 — 제8911호(2008.3.21)는 §104①을 바꾸지 않았다(MST 82364·84761 대조).
 */
export const TRANSFER_RATE_ERA_SUPPORTED_FROM = new Date("2002-01-01");
/** 소득세법 §104⑥ 1호 3주택 이상 45% 창(2009-01-01 ~ 2009-03-15). 2009-03-16부터는 별도 확인 대상(V-4). */
export const SEC104_6_THREE_HOUSE_WINDOW = { start: new Date("2009-01-01"), end: new Date("2009-03-15") } as const;

export const TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE =
  `2002년 1월 1일 전에 양도한 자산의 양도소득세 누진세율표 연혁은 지원하지 않습니다 — 근사 세율표로 계산했습니다. ` +
  `양도 당시 ${TRANSFER.PROGRESSIVE_RATE_TABLE}·${TRANSFER.TAX_RATE}을 직접 확인하세요(확인 필요).`;

export const SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE =
  `2009년 1월 1일~3월 15일에 양도한 1세대 3주택 이상 주택(주택과 조합원입주권의 수 합이 3 이상인 경우 포함)에는 ${TRANSFER.TAX_RATE_THREE_HOUSE_2009}의 세율(100분의 45)이 있으나 ` +
  `지원하지 않습니다 — 기본세율(${TRANSFER.PROGRESSIVE_RATE_TABLE})로 계산했습니다. 해당 여부를 직접 확인하세요(확인 필요). ` +
  `주택 수·입주권 수에서 빼는 주택(소득세법 시행령 §167의3·§167의4의 산입 제외)은 반영하지 않았습니다(확인 필요).`;

export function transferRateEraNotices(p: {
  transferDate: Date;
  propertyType: string;
  householdHousingCount: number;
  /**
   * 세대가 보유한 **조합원입주권** 수(`presaleRights` 중 `redevelopment_right`) — 구 §104①2호의4(주택+조합원입주권 합 3 이상)의 합산용.
   * 분양권은 세지 않는다(2021.1.1. 이후 취득분만 주택 수에 든다 — 이 창과 무관). 생략 = 0.
   */
  redevelopmentRightCount?: number;
  /** 장기보유특별공제액이 있는가 — 표1 연혁 미지원 고지는 공제가 실제로 걸렸을 때만 */
  hasLongTermDeduction: boolean;
}): string[] {
  const out: string[] = [];
  const t = p.transferDate.getTime();
  if (t < TRANSFER_RATE_ERA_SUPPORTED_FROM.getTime()) out.push(TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE);
  if (p.hasLongTermDeduction && isTable1EraUnsupported(p.transferDate)) out.push(LTHD_TABLE1_UNSUPPORTED_NOTICE);
  if (
    t >= SEC104_6_THREE_HOUSE_WINDOW.start.getTime() &&
    t <= SEC104_6_THREE_HOUSE_WINDOW.end.getTime() &&
    p.propertyType === "housing" &&
    p.householdHousingCount + (p.redevelopmentRightCount ?? 0) >= 3
  ) {
    out.push(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
  }
  return out;
}
