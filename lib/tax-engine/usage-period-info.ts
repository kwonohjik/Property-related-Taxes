/**
 * 용도변경일 기반 **기간 분할 정보** — leaf 모듈
 *
 * `calculateHoldingPeriod`만 의존하는 순수 leaf라 **클라이언트에서 직접 import해도 안전**하다.
 * 그것이 분리의 목적이다 — 「소득세법」 §95⑤(비주택→주택 용도변경) UI 미리보기가
 * 산식을 재구현하지 않고 엔진과 **같은 함수**를 쓴다.
 * ⚠️ 겸용주택 시간분할(`applyUsagePeriodSplit`)은 **2026-08-10 폐지**됐다 — 근거로 달려 있던
 *    「집행기준 89-154-24」가 존재하지 않는 문서였고, §95④·사전-2021-법령해석재산-0333·
 *    사전-2022-법규재산-0427이 「보유기간 = 취득일~양도일」을 명시한다. 이 leaf의 현재
 *    소비처는 **§95⑤ 경로뿐**이다(`transfer-tax-lthd.ts` — 그쪽은 법이 기간을 나눈다).
 */
import { addDays } from "date-fns";
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
  /** Period 1 완성 보유연수 (취득일 ~ 용도변경일 **전날**, §95④ 초일 산입·calendar, LTHD 율 산정용) */
  t1HoldingYears: number;
  /** Period 2 완성 보유연수 (용도변경일 ~ 양도일, §95⑥ 「사용한 날부터 기산」, LTHD 율 산정용) */
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
    // LTHD 율은 §95② 완성연수 기준 — 분수(t1Years/t2Years)가 아닌 calendar 연수 사용.
    // §95⑥ 주택 보유기간은 「사실상 주거용으로 사용한 날부터 기산」 ⇒ 용도변경일은 주택 구간(t2)에
    // 속하고, 비주택 구간(t1)은 그 전날까지다. `calculateHoldingPeriod`는 양 끝 포함(§95④ 초일 산입)이라
    // 용도변경일을 t1 끝으로 넘기면 그날이 두 구간에 이중 산입된다.
    t1HoldingYears: calculateHoldingPeriod(acquisitionDate, addDays(usageChangeDate, -1)).years,
    t2HoldingYears: calculateHoldingPeriod(usageChangeDate, transferDate).years,
  };
}
