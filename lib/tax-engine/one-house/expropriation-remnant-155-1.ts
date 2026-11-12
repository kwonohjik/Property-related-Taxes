/**
 * 「소득세법 시행령」 §155① 후단 — 종전 주택 **일부 수용 뒤 잔존 주택** 양도는 종전 주택의 수용에 포함된다 (2026-11-12 리뷰 E-5).
 *
 * 효과: 잔존 주택 양도를 「종전의 주택 … 의 양도 또는 수용에 포함」하므로 §155① 처분기한(요건 B)은 **수용일**로 판정한다 —
 * 수용일이 기한 안이면 잔존 주택 양도가 기한을 넘어도 충족(수용일부터 N년 안 양도일 때 · N은 양도일 연혁).
 *
 * 입력은 §154① 단서 「수용」 사유 칸을 그대로 쓴다(사용자 결정 2026-11-12 — 새 필드 없음):
 *   · `oneHouseExemptionProviso.reason === "expropriation"` · `expropriationDate`(일부 협의매수·수용일) · `businessApprovalDate`(사업인정 고시일)
 *   · 후단 문언 「제154조제1항제2호가목에 따라 협의매수되거나 수용되는 경우」라 가목 괄호(사업인정 고시일 전 취득)도 같은 술어로 본다.
 * 수용일이 신규 주택 취득일보다 앞서도 적용한다(사용자 결정 2026-11-12 · 해석례 미확보).
 *
 * 적용하지 않는 경우(`undefined`): 수용 사유가 아님 · 수용일 모름(모름 = 불성립) · 고시일 요건 미충족 · 수용일이 양도일 이후
 * (잔존 주택 양도가 아니다) · 수용일부터 N년이 지난 양도 · 후단이 없던 양도일 · 합가 D8 상대 쪽 짝(종전 주택이 양도 주택이 아니다).
 */
import { isWithinDeadline } from "../civil-period";
import { expropriationNoticeDateRequirementApplies } from "../data/one-house-154-1-proviso-era";
import { resolveTempTwoHouseRemnantYears } from "../data/temporary-two-house-remnant-era";
import type { TransferTaxInput } from "../types/transfer.types";

const dayIndex = (d: Date) => Math.floor(d.getTime() / 86_400_000);

export function resolveTempTwoHouseRemnantDisposalDate(
  input: Pick<TransferTaxInput, "acquisitionDate" | "transferDate" | "oneHouseExemptionProviso" | "temporaryTwoHouse">,
): Date | undefined {
  const p = input.oneHouseExemptionProviso;
  if (p?.reason !== "expropriation" || !p.expropriationDate) return undefined;
  if (input.temporaryTwoHouse?.previousHouseIsRosterRow) return undefined;
  if (expropriationNoticeDateRequirementApplies(input)) {
    if (!p.businessApprovalDate) return undefined;
    if (input.acquisitionDate >= p.businessApprovalDate) return undefined;
  }
  if (!(dayIndex(p.expropriationDate) < dayIndex(input.transferDate))) return undefined;
  const years = resolveTempTwoHouseRemnantYears(input.transferDate);
  if (years === undefined) return undefined;
  return isWithinDeadline(p.expropriationDate, years, input.transferDate) ? p.expropriationDate : undefined;
}
