/**
 * NBL2611-V2-PR04 (2026-09 E1-05 미해소) — 양도일 의제일(영 §168의14②)의 범위 검증 (⑧·⑫·엔진 고지 공용).
 *
 * 의제일은 경매·공매로 양도가 늦어진 토지에서 「최초의 경매기일」·「최초의 공매일」·§83의5②의 「최초 공고일」 같은
 * **취득 후 · 실제 양도 전**의 날이다(법문 「해당 각 호에서 규정한 날을 양도일로 보아 제168조의6을 적용」). 취득일과 같거나
 * 이전이면 `getPeriodJudgmentDate`가 소유일수를 0으로 만들어(`meetsPeriodCriteria`의 「0일 보유」) 별도합산 기타토지·사업용
 * 농지까지 비사업용으로 뒤집는데, 이를 판정 결과로 흡수할 조문 근거가 없다(+55,750,000). 양도일 이후 값은 의제의 방향
 * (양도일을 **앞당긴다**)과 반대라 역시 입력 오류다. 자동 보정은 하지 않고 차단한다(자동 안분 fallback 금지).
 *
 * 취득일 다음날(`acquisition + 1일`)은 차단하지 않는다 — 실제 양도가 취득 다음날인 경우와 같은 0일 보유(비사업용 보수 처리)로
 * 엔진이 이미 다루며, 날짜 순서상 불가능한 값이 아니다. 엔진은 이 경우 판정 사유에 고지를 남긴다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";

export type DeemedTransferDateIssue = "not_after_acquisition" | "after_transfer";

/** 이상 없거나 비교할 날짜가 비면 null — 비어 있는 입력은 다른 검증이 맡는다. */
export function deemedTransferDateIssue(
  deemedDate: string | Date | undefined,
  acquisitionDate: string | Date | undefined,
  transferDate: string | Date | undefined,
): DeemedTransferDateIssue | null {
  const d = toOptionalDate(deemedDate);
  if (!d) return null;
  const acq = toOptionalDate(acquisitionDate);
  if (acq && d.getTime() <= acq.getTime()) return "not_after_acquisition";
  const tr = toOptionalDate(transferDate);
  if (tr && d.getTime() > tr.getTime()) return "after_transfer";
  return null;
}

/** 오류 문구(라벨 접두 제외) — ⑧·⑫ 공통. */
export function deemedTransferDateIssueMessage(
  issue: DeemedTransferDateIssue,
  deemedDate: string,
  acquisitionDate: string,
  transferDate: string,
): string {
  return issue === "not_after_acquisition"
    ? `양도일 의제일(${deemedDate})이 취득일(${acquisitionDate})과 같거나 빠릅니다. 경매·공매·공고는 취득 이후의 날이어야 하며(영 §168의14②), 이 값으로는 소유기간이 0일이 되어 비사업용으로 판정됩니다. 의제일을 확인하세요.`
    : `양도일 의제일(${deemedDate})이 양도일(${transferDate})보다 늦습니다. 의제일은 실제 양도일보다 앞선 날입니다(영 §168의14②). 의제일을 확인하세요.`;
}
