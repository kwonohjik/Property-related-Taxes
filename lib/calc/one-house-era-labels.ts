/**
 * 입력·요약 화면의 1세대1주택 **기한 연수 문구** — 엔진 연혁 leaf를 부를 뿐 판정하지 않는다.
 *
 * 🔑 「10년 이내」·「3년 내」를 리터럴로 적으면 경과 규정 전 양도분에서 화면과 엔진이 어긋난다.
 *    - 합가 기한(§155④⑤ · §156의2⑧⑨): `resolveMergeExemptionYears` — 양도일 2018-02-13(동거봉양)·
 *      2024-11-12(혼인) 전이면 5년
 *    - 완성 후 기한(§156의2④1·2호 · ⑤2·3호): `resolve1562DeadlineYears` — 양도일 2023-01-12 전이면 2년
 *
 * 양도일(·합가 종류)을 모르면 한 값을 단정하지 않고 **현행 연수 + 경과 규정**을 함께 적는다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  type MergeExemptionKind,
  MARRIAGE_MERGE_10Y_TRANSFER_START,
  PARENTAL_CARE_MERGE_10Y_TRANSFER_START,
  resolveMergeExemptionYears,
} from "@/lib/tax-engine/data/merge-exemption-era";
import {
  CLAUSE3_3Y_TRANSFER_START,
  COMPLETION_DEADLINE_3Y_TRANSFER_START,
  resolve1562Clause3Years,
  resolve1562DeadlineYears,
} from "@/lib/tax-engine/data/article-156-2-completion-era";
import { resolveRegulatedShortenedClauseRef } from "@/lib/tax-engine/data/temporary-two-house-regulated-clause";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 「합친 날(혼인한 날)부터 N년 이내」의 N 문구.
 * 혼인·동거봉양 합가일이 둘 다 있으면 혼인을 본다 — 엔진 `matchMergeApartFromWindow`와 같은 순서.
 * `kind`를 주면 합가일 입력과 무관하게 그 종류의 문구를 쓴다 — 종류별 안내 칸(`MergeDateSection`)이 쓴다.
 */
export function mergeExemptionYearsLabel(args: {
  marriageDate?: string;
  parentalCareMergeDate?: string;
  transferDate?: string;
  kind?: MergeExemptionKind;
}): string {
  const kind = args.kind ?? (args.marriageDate ? "marriage" : args.parentalCareMergeDate ? "parental_care" : undefined);
  const transferAt = toOptionalDate(args.transferDate);
  if (kind && transferAt) return `${resolveMergeExemptionYears(kind, transferAt)}년`;
  if (kind === "marriage") return `10년(${ymd(MARRIAGE_MERGE_10Y_TRANSFER_START)} 전 양도는 5년)`;
  if (kind === "parental_care") return `10년(${ymd(PARENTAL_CARE_MERGE_10Y_TRANSFER_START)} 전 양도는 5년)`;
  return (
    `10년(동거봉양 합가는 ${ymd(PARENTAL_CARE_MERGE_10Y_TRANSFER_START)} 전, ` +
    `혼인은 ${ymd(MARRIAGE_MERGE_10Y_TRANSFER_START)} 전 양도하면 5년)`
  );
}

/** 「(신축)주택이 완성된 후 N년 이내」의 N 문구 — §156의2④1·2호 · ⑤2·3호. */
export function completionDeadlineYearsLabel(transferDate: string | undefined): string {
  const transferAt = toOptionalDate(transferDate);
  if (transferAt) return `${resolve1562DeadlineYears(transferAt)}년`;
  return `3년(${ymd(COMPLETION_DEADLINE_3Y_TRANSFER_START)} 전 양도는 2년)`;
}

/**
 * 「권리 취득일부터 **N년**이 지나/이내」(§156의2③④ · §156의3②③ · 시행규칙 §75①)의 N 문구 — 양도일 연혁(2006~2008.11.27. 1년 ·
 * ~2012.6.28. 2년 · 이후 3년, `resolve1562Clause3Years`). 판정이 쓰는 leaf와 같은 값이라 카드·검증 문구가 엔진과 어긋나지 않는다(X2-4).
 * 양도일을 모르면 현행 연수와 경과 규정을 함께 적는다.
 */
export function rightDisposalYearsLabel(transferDate: string | undefined): string {
  const transferAt = toOptionalDate(transferDate);
  if (transferAt) return `${resolve1562Clause3Years(transferAt)}년`;
  return `3년(${ymd(CLAUSE3_3Y_TRANSFER_START)} 전 양도는 2년 이하)`;
}

/**
 * 「§155」 뒤에 붙는 조정대상지역 처분기한 단축 규정의 위치(`①1호` · `①2호` · `①`) — 양도일 연혁(X2-1).
 * 양도일을 모르면 호를 단정하지 않고 `①`만 적는다.
 */
export function regulatedShortenedClauseRefOf(transferDate: string | undefined): string {
  const transferAt = toOptionalDate(transferDate);
  return transferAt ? resolveRegulatedShortenedClauseRef(transferAt) : "①";
}
