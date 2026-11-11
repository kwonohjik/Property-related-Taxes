/**
 * 양도소득세 **전자신고 세액공제 적용 범위** (정적 상수) — 계획서 `docs/00-pm/stock-prelim-credit-v19.plan.md` Q-2 a.
 *
 * 조특법 §104의8①의 공제 대상은 «대통령령으로 정하는 … 양도소득세 … 신고»이고, 조특법 시행령 §104의5①은 양도소득세에 관해
 * «소득세법 제105조에 따른 **양도소득 과세표준 예정신고**»만 열거한다(확정신고·수정신고는 없다). 금액은 같은 조 ②2호 2만원이다.
 * 이 열거는 시행령 공포 제31444호(2021-02-17)에서 들어왔고 그 부칙 제2조②는 «양도소득세에 관한 개정규정은 이 영 시행 이후
 * 양도하는 분부터 적용»이라 정한다 — 2015-07-01 시행본 ①에는 양도소득세 항목이 아예 없다(KoreanLaw 조회 2026-11-11).
 *
 * 엔진은 이 범위를 **신고 유형(예정)** 과 **양도일(2021-02-17 이후)** 로 게이트하고, 켜 둔 전자신고가 공제되지 않으면 고지를 싣는다
 * (조용한 0 금지). 신고에 둘 이상의 종목이 있으면 **가장 늦은 양도일**로 판정한다 — 시행 이후 양도분이 한 건이라도 있으면 그 예정신고는
 * 개정규정 적용 대상이다.
 */
import { STOCK } from "../legal-codes/stock";

/** 양도일 기준 경계 — 이 날 **이후** 양도분의 예정신고부터 전자신고 공제 대상 (시행령 공포 제31444호 부칙 제2조②). */
export const ELECTRONIC_FILING_CREDIT_START = "2021-02-17";

const dayKey = (d: string | Date): string => {
  if (typeof d === "string") return d.slice(0, 10);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
};

/** 전자신고 공제 대상 신고인가 — 예정신고이고 양도일이 2021-02-17 이후. 양도일이 없으면 판정하지 못하므로 대상이 아니다. */
export function isElectronicFilingCreditApplicable(
  filingType: string | undefined,
  transferDate: string | Date | undefined,
): boolean {
  if (filingType !== "preliminary") return false;
  if (!transferDate) return false;
  return dayKey(transferDate) >= ELECTRONIC_FILING_CREDIT_START;
}

/**
 * 합산 신고 단위 판정 — 신고 유형은 **신고 유형을 가진 마지막 종목**(편집기) 값, 양도일은 신고 안 **가장 늦은** 양도일.
 * 국외주식 입력에는 신고 유형이 없다(국외주식은 예정신고 대상이 아니다 — 소득세법 §105① 본문 괄호) — 국내·국외 혼합 신고에서
 * 마지막 종목이 국외라는 이유로 유형이 비어 공제가 사라지면 안 되므로 유형이 있는 종목을 고른다. 국외만 있는 신고는 유형이 없어 대상이 아니다.
 */
export function isElectronicFilingCreditApplicableToFiling(
  items: ReadonlyArray<{ filingType?: string; transferDate?: Date }>,
): boolean {
  if (items.length === 0) return false;
  let latest: Date | undefined;
  for (const i of items) {
    const d = i.transferDate;
    if (d instanceof Date && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  let filingType: string | undefined;
  for (const i of items) if (i.filingType !== undefined) filingType = i.filingType;
  return isElectronicFilingCreditApplicable(filingType, latest);
}

/** 고정 문구 — 값이 없는 정적 문자열이라 종목 행 경고에서 동등 비교로 걷어낼 수 있다. */
export const ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE =
  `전자신고 세액공제(${STOCK.ELECTRONIC_FILING_CREDIT}, 2만원)는 양도소득세에서 소득세법 제105조의 예정신고에만 적용되며` +
  `(${STOCK.ELECTRONIC_FILING_CREDIT_DECREE}①②2호) 2021년 2월 17일 이후 양도분부터입니다. ` +
  `이 신고는 확정·수정신고이거나 그 전 양도분이라 공제를 적용하지 않았습니다.`;

/** 전자신고를 선택했는데 공제 대상이 아닐 때만 고지한다. 선택하지 않았다면 알릴 것이 없다. */
export function electronicFilingCreditNotice(input: {
  isElectronicFiling: boolean;
  applicable: boolean;
}): string | undefined {
  return input.isElectronicFiling && !input.applicable ? ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE : undefined;
}

/** 합산 신고 단위 — 전자신고 선택 여부 · 공제 대상 여부 · (선택했는데 대상이 아니면) 고지를 한 번에 돌려준다. */
export function electronicFilingCreditScope(
  items: ReadonlyArray<{ filingType?: string; transferDate?: Date; isElectronicFiling?: boolean }>,
): { requested: boolean; applicable: boolean; notice?: string } {
  const requested = items.some((i) => i.isElectronicFiling === true);
  const applicable = isElectronicFilingCreditApplicableToFiling(items);
  const notice = electronicFilingCreditNotice({ isElectronicFiling: requested, applicable });
  return { requested, applicable, ...(notice ? { notice } : {}) };
}
