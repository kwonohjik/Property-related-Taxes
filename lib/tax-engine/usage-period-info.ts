/**
 * 용도변경일 기반 **기간 분할 정보** — leaf 모듈
 *
 * `calculateHoldingPeriod`만 의존하는 순수 leaf라 **클라이언트에서 직접 import해도 안전**하다.
 * 그것이 분리의 목적이다 — 「소득세법」 §95⑤(비주택→주택 용도변경) UI 미리보기가
 * 산식을 재구현하지 않고 엔진과 **같은 함수**를 쓴다.
 * (겸용주택 시간분할 `applyUsagePeriodSplit`은 `transfer-tax-mixed-use-period-split.ts`에 남는다.)
 */
import { calculateHoldingPeriod } from "./tax-utils";

export interface UsagePeriodInfo {
  /** Period 1 (취득~용도변경) 일수 */
  t1Days: number;
  /** Period 2 (용도변경~양도) 일수 */
  t2Days: number;
  /** 전체 보유 일수 */
  totalDays: number;
  /** Period 1 보유연수 (365.25 기준, 시간비례 안분용) */
  t1Years: number;
  /** Period 2 보유연수 (365.25 기준, 시간비례 안분용) */
  t2Years: number;
  /** Period 1 완성 보유연수 (초일불산입·calendar, LTHD 율 산정용) */
  t1HoldingYears: number;
  /** Period 2 완성 보유연수 (초일불산입·calendar, LTHD 율 산정용) */
  t2HoldingYears: number;
}

/**
 * 용도변경일 기반 시간 분할 정보 산출.
 * 미입력·취득일 이전·양도일 이후이면 null 반환 (fallback to 전체 보유기간 LTHD).
 */
export function calcUsagePeriodInfo(
  acquisitionDate: Date,
  usageChangeDate: Date | undefined,
  transferDate: Date,
): UsagePeriodInfo | null {
  if (!usageChangeDate) return null;
  const acqMs = acquisitionDate.getTime();
  const changeMs = usageChangeDate.getTime();
  const transferMs = transferDate.getTime();
  if (changeMs <= acqMs || changeMs >= transferMs) return null;

  const DAY_MS = 1000 * 60 * 60 * 24;
  const t1Days = (changeMs - acqMs) / DAY_MS;
  const t2Days = (transferMs - changeMs) / DAY_MS;
  const totalDays = t1Days + t2Days;

  return {
    t1Days,
    t2Days,
    totalDays,
    t1Years: t1Days / 365.25,
    t2Years: t2Days / 365.25,
    // LTHD 율은 §95② 완성연수 기준 — 분수(t1Years/t2Years)가 아닌 초일불산입 calendar 연수 사용.
    t1HoldingYears: calculateHoldingPeriod(acquisitionDate, usageChangeDate).years,
    t2HoldingYears: calculateHoldingPeriod(usageChangeDate, transferDate).years,
  };
}
