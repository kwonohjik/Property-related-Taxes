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
 * 더한 개월이 **실제로 쓰인** 경우의 고지 — 토지 파트 장특이 분리취득 split 분기에서 계산됐을 때(`splitDetail.land.residenceYears`가 채워짐)만 낸다.
 * 입력이 없거나 개월이 0이면 종전 계산과 같아 말할 것이 없다. 양도일 연혁에 따라 개월이 쓰이는 곳이 다르다(`data/lthd-table2-era.ts`):
 *   · 2021.1.1. 이후(및 2009.1.1. 전 — 현행 식으로 계산) — 토지 거주기간별 공제율 + 표2 대상 판정
 *   · 2020.1.1.~2020.12.31. — 표2 대상 판정(거주 2년)에만(공제율은 보유기간 한 열뿐이라 거주기간별 공제율이 없다)
 *   · 2009.1.1.~2019.12.31. — 어디에도 쓰이지 않는다(표2 대상에 거주요건이 없고 공제율은 보유기간 한 열뿐) → 고지 없음
 */
export function landPartPriorResidenceNotice(
  input: Pick<TransferTaxInput, "landPartDonorSameHousehold" | "landPartPriorHouseholdResidenceMonths" | "transferDate">,
  splitDetail: SplitGainResult | undefined,
): string | undefined {
  const months = landPartPriorResidenceMonths(input);
  if (months <= 0 || splitDetail?.land.residenceYears === undefined) return undefined;
  const era = resolveLthdTable2Era(input.transferDate);
  if (era === "holding_8pct") return undefined;
  const basis =
    "서면-2025-법규재산-4289 — 동일세대원이 건물과 부수토지를 각각 소유하다가 건물을 토지 소유자에게 증여한 경우 부수토지의 거주기간별 공제율은 동일세대원으로서 건물 소유자와 함께 거주한 기간으로 산정";
  const head =
    era === "holding_8pct_residence_2y"
      ? `건물 증여 전 건물 소유자와 같은 세대로 거주한 기간 ${months}개월을 표2 대상 판정(거주 2년)에 더했습니다 (${basis}). ` +
        "2020.12.31. 이전 양도분의 표2는 보유기간별 공제율 한 열뿐이라 거주기간별 공제율에는 쓰이지 않았습니다. "
      : `부수토지의 표2 거주기간 공제율에 건물 증여 전 건물 소유자와 같은 세대로 거주한 기간 ${months}개월을 포함했습니다 (${basis}). ` +
        "같은 기간을 표2 대상 판정(거주 2년)에도 더했고, 건물분 거주기간은 증여일부터 센 본인 거주만 쓴 것입니다(사전-2025-법규재산-1126·0506). ";
  return `${head}이 기간은 비과세 거주요건에는 쓰지 않았습니다. ${TRIBUNAL_3843_SAME_HOUSEHOLD_CHECK}`;
}
