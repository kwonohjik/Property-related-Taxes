/**
 * 1세대1주택 보유기간 — **비거주자였던 기간은 통산하지 않는다** (판정 메뉴 입력 `nonResidentHoldingPeriod`)
 *
 * 1세대1주택은 거주자의 1세대가 대상이라(시행령 §154①), 보유기간도 거주자로서 보유한 기간만 센다 —
 * 부동산납세과-615(2014 — 영주귀국자는 국내에 주소를 둔 날부터 거주자, 보유기간은 거주자 신분 기간만 통산) ·
 * 서면인터넷방문상담4팀-1424(거주자 기간 + 귀국 후 기간 통산). 예외 — 시행령 §154⑧2호(2008.2.22. 시행본부터 실독):
 * 「비거주자가 해당 주택을 3년 이상 계속 보유하고 그 주택에서 거주한 상태로 거주자로 전환된 경우」는 통산한다.
 *
 * 통산은 기산일을 비거주 기간만큼 뒤로 미는 것으로 계산한다(취득~출국 + 귀국~양도). 취득 당시부터 비거주자였으면
 * 거주자가 된 날이 기산일이다.
 *
 * ⚠️ `transfer-tax-exemption-holding.ts`가 이 파일을 import한다 — 이 파일은 그쪽을 import하지 않는다(순환 금지).
 */
import { calculateHoldingPeriod } from "../tax-utils";
import type { TransferTaxInput } from "../types/transfer.types";

/** §154⑧2호 「3년 이상 계속 보유」 */
const SECTION_154_8_2_HOLDING_YEARS = 3;

export function excludeNonResidentHoldingPeriod(
  input: Pick<TransferTaxInput, "nonResidentHoldingPeriod" | "acquisitionDate">,
  baseStart: Date,
): Date {
  const p = input.nonResidentHoldingPeriod;
  if (!p) return baseStart;
  if (
    p.residedAtConversion === true &&
    calculateHoldingPeriod(input.acquisitionDate, p.endDate).years >= SECTION_154_8_2_HOLDING_YEARS
  ) {
    return baseStart;
  }
  const from = p.startDate && p.startDate > baseStart ? p.startDate : baseStart;
  if (p.endDate <= from) return baseStart;
  return new Date(baseStart.getTime() + (p.endDate.getTime() - from.getTime()));
}
