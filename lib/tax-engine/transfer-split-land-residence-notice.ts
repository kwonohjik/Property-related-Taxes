/**
 * 건물 증여 전 동일세대 거주(서면-2025-법규재산-4289)를 토지 파트 표2 거주기간 공제율에 더했을 때의 적용 고지 — 순수 함수.
 *
 * 규칙·게이트·상한은 `transfer-split-land-residence.ts`가 정한다. 이 파일은 문구만 만든다(`gift-table2-notice.ts`의 조심 2025서3843 확인 문장을 재사용해
 * 「양도일 현재 증여자와 같은 세대인지」 확인 필요를 같은 말로 알린다 — 그 파일이 `residence-months.ts`를 통해 leaf를 읽으므로 leaf에는 두지 않는다).
 */
import { landPartPriorResidenceMonths } from "./transfer-split-land-residence";
import { TRIBUNAL_3843_SAME_HOUSEHOLD_CHECK } from "./one-house/gift-table2-notice";
import { resolveLthdTable2Era } from "./data/lthd-table2-era";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";

/**
 * 더한 개월이 **결과를 실제로 바꾼** 경우의 고지 — 엔진 echo `splitDetail.land.priorHouseholdResidenceEffect`로 게이트한다.
 *   · rate: 토지 파트 공제율이 그 개월을 뺐을 때와 다르다(2021.1.1. 이후 표2 거주기간별 공제율).
 *   · eligibility: 그 개월을 빼면 표2 대상(거주 2년)이 아니다(2020년 양도분은 이것만 가능 — 공제율은 보유기간 한 열).
 * 통칙 95-0…1로 표1이 이기거나 표2 대상이 아니면 둘 다 false라 고지하지 않는다(종전 계산과 같다).
 */
export function landPartPriorResidenceNotice(
  input: Pick<TransferTaxInput, "landPartDonorSameHousehold" | "landPartPriorHouseholdResidenceMonths" | "transferDate">,
  splitDetail: SplitGainResult | undefined,
): string | undefined {
  const months = landPartPriorResidenceMonths(input);
  const effect = splitDetail?.land.priorHouseholdResidenceEffect;
  if (months <= 0 || !effect || (!effect.rate && !effect.eligibility)) return undefined;
  const basis =
    "서면-2025-법규재산-4289 — 동일세대원이 건물과 부수토지를 각각 소유하다가 건물을 토지 소유자에게 증여한 경우 부수토지의 거주기간별 공제율은 동일세대원으로서 건물 소유자와 함께 거주한 기간으로 산정";
  const used = [
    effect.rate ? "부수토지의 표2 거주기간 공제율" : undefined,
    effect.eligibility ? "표2 대상 판정(거주 2년)" : undefined,
  ].filter((x): x is string => x !== undefined);
  const head = `건물 증여 전 건물 소유자와 같은 세대로 거주한 기간 ${months}개월을 ${used.join("과 ")}에 더했습니다 (${basis}). `;
  const era2020 =
    resolveLthdTable2Era(input.transferDate) === "holding_8pct_residence_2y"
      ? "2020.12.31. 이전 양도분의 표2는 보유기간별 공제율 한 열뿐이라 거주기간별 공제율에는 쓰이지 않았습니다. "
      : "";
  const building = effect.eligibility
    ? "표2 대상이 되어 건물분도 표2로 계산했고, 건물분 거주기간은 증여일부터 센 본인 거주만 썼습니다(사전-2025-법규재산-1126·0506). "
    : "건물분 거주기간은 증여일부터 센 본인 거주만 썼습니다(사전-2025-법규재산-1126·0506). ";
  return `${head}${era2020}${building}이 기간은 비과세 거주요건에는 쓰지 않았습니다. ${TRIBUNAL_3843_SAME_HOUSEHOLD_CHECK}`;
}
