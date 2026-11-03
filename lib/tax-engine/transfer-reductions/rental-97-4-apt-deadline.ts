/**
 * §97의4 가목2) 아파트 양도기한 — 엔진(`rental-97-4.ts`)과 ⑧(`lib/calc/apt-deadline-extension-scope.ts`)이 함께 쓰는 단일 판정.
 *
 * 소령 §167의3①2호 가목2): 아파트를 임대하는 민간매입임대주택은 「제11항에 따른 기한까지 양도할 것. 다만, 해당 주택이
 * 사목에 해당하는 경우에는 같은 목에 따른 양도기한을 적용한다.」
 *
 * - 사목(자진말소) — 기한 = 말소일부터 1년(`saMokTransferDeadline`). ⑪ 기한을 **대신**한다: 1년이 지나도 ⑪로 돌아가지
 *   않는다. 사목 「해당」을 자진말소 사실로 읽었다 — 마목4) 「제11항에 따른 기한(해당 주택이 사목에 해당하는 경우에는
 *   같은 목에 따른 양도기한을 말한다)이 지난 후 양도하는 주택」이 사목 주택도 그 기한을 넘겨 양도할 수 있음을 전제하는
 *   것과 맞는 읽기다(사용자 결정 2026-11-03). 정면 해석례는 찾지 못했다 — 기한 경과 결과에 확인 필요 고지.
 *   사목의 다른 요건 — 「법률 제17482호 부칙 제5조제1항이 적용되는 주택」은 가목2) 대상(종전 장기일반 아파트 매입임대·
 *   단기 아파트 매입임대)과 같은 범위이고, 「임대의무기간의 2분의 1 이상 임대」는 §97의4의 6년 임대(의무기간 최장 8년의
 *   절반 4년 초과)를 갖추면 함께 갖춰진다 → 따로 묻지 않는다.
 * - 그 밖 — ⑪(`judgeAptTransferDeadline`). 1호 「임대의무기간이 2027년 1월 1일 이후 종료되는 주택: 같은 법 제6조제5항에
 *   따라 임대주택 등록이 말소되는 날부터 1년」 — 자동말소일(민특법 §6⑤ = 임대의무기간 종료일)이 2027.1.1. 이후면 그 날을
 *   1호 날로 쓴다(사용자가 1호 날을 따로 넣었으면 그 값). 같은 날을 두 번 입력하지 않게 하려는 연동이다.
 */
import { isOnOrBeforeDeadline } from "../civil-period";
import { judgeAptTransferDeadline, saMokTransferDeadline } from "../rental-article/rules";
import type { AptDeadlineVerdict, AptTransferDeadlineExtension } from "../rental-article/rules";

const Y2027_01_01 = new Date("2027-01-01").getTime();

export interface Rental974AptDeadlineFacts {
  /** 자동말소일(민특법 §6⑤) — ⑪1호 연동 */
  autoCancelledDate?: Date;
  /** 자진말소일(민특법 §6①11호) — 사목 */
  voluntaryCancelledDate?: Date;
  /** ⑪ 연장 사실 — 사목이면 쓰지 않는다 */
  extension?: AptTransferDeadlineExtension;
}

export interface Rental974AptDeadlineVerdict extends AptDeadlineVerdict {
  /** 사목 양도기한을 적용했을 때 그 기한 */
  saMokDeadline?: Date;
}

const valid = (d?: Date): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/** ⑪1호 연동 — 자동말소일이 2027.1.1. 이후면 1호 날로 넣는다(명시 입력 우선). */
export function withAutoCancelDutyEnd(
  ext: AptTransferDeadlineExtension | undefined,
  autoCancelledDate: Date | undefined,
): AptTransferDeadlineExtension | undefined {
  if (!valid(autoCancelledDate) || autoCancelledDate.getTime() < Y2027_01_01) return ext;
  if (valid(ext?.dutyPeriodEndCancellationDate)) return ext;
  return { ...ext, dutyPeriodEndCancellationDate: autoCancelledDate };
}

export function judgeRental974AptDeadline(transferDate: Date, facts: Rental974AptDeadlineFacts): Rental974AptDeadlineVerdict {
  const sa = valid(facts.voluntaryCancelledDate) ? saMokTransferDeadline(facts.voluntaryCancelledDate) : null;
  if (sa) return { within: isOnOrBeforeDeadline(transferDate, sa), pending: [], saMokDeadline: sa };
  return judgeAptTransferDeadline(transferDate, withAutoCancelDutyEnd(facts.extension, facts.autoCancelledDate));
}
