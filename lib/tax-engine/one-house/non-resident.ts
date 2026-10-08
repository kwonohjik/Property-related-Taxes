/**
 * 양도일 현재 **비거주자** — 1세대1주택·1입주권 비과세 배제 (판정 메뉴 입력 `transferorNonResidentAtTransfer`)
 *
 * 소득세법 §121② 단서: 국내원천 부동산등양도소득이 있는 비거주자(시행령 §180의2)에게는 §89①3호·4호와 §95② 표 외의
 * 부분 단서를 적용하지 않는다. 시행령 §180의2① 단서: §89①3호를 적용할 때 §154①2호 나·다목(해외이주·1년 이상
 * 국외거주로 세대전원 출국, 출국일 현재 1주택, 출국일부터 2년 이내 양도) 요건을 충족하는 비거주자는 제외한다.
 *
 * | 양도일 | §89①3호(주택) | §89①4호(입주권) | 근거 |
 * |---|---|---|---|
 * | ~2009-12-31 | 판정 보류(확인 필요) | 판정 보류(확인 필요) | 단서 시행 전 — 법문 명시 없음, 해석이 갈림 |
 * | 2010-01-01~2019-12-31 | 배제(나·다목 예외) | 판정 보류(확인 필요) — 단서에 4호 없음 | 2010-01-01 시행본(MST 98343) 단서 · 시행령 §180의2(2010-02-18본 같은 문언) |
 * | 2020-01-01~ | 배제(나·다목 예외) | 배제 | 법률 제16834호 부칙 제2조② 「시행 이후 양도하는 분부터」 |
 *
 * 범위: 판정 메뉴만(사용자 결정 2026-10-08). 계산기는 이 입력을 보내지 않는다 — §95② 단서(장기보유특별공제 표2)도
 * 계산기 몫이라 다루지 않는다.
 */
import { TRANSFER } from "../legal-codes/transfer";
import { NON_RESIDENT_HOUSE_EXCLUSION_TRANSFER_START } from "../data/non-resident-exclusion-era";
import { resolveExemptionProviso } from "../transfer-tax-exemption-holding";
import { revokeOneHouseExemption } from "./revoke-exemption";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

const OVERSEAS_REASONS = new Set(["overseas_migration", "overseas_residence"]);

/**
 * 주택 양도(§89①3호)의 판정에 비거주자 배제를 반영한다 — route 마지막 단계(§155⑳ · §89①4호 다음).
 * 입주권 양도는 2020.1.1. 이후분을 `resolveOneRightExemptionClause`가 이미 걸렀고, 여기서는 그 전 양도분의 판정 보류만 붙인다.
 */
export function applyNonResidentVerdict(
  judgment: OneHouseJudgment,
  input: TransferTaxInput,
  isRightSale: boolean,
): OneHouseJudgment {
  if (input.transferorNonResidentAtTransfer !== true) return judgment;
  const exempt = judgment.isExempt || judgment.isPartialExempt;
  if (!exempt) return judgment;
  // 입주권 — 2020.1.1. 이후는 `resolveOneRightExemptionClause`가 이미 걸렀다. 그 전 양도분은 §121② 단서에 4호가
  // 없어 결론을 바꾸지 않고 판정 보류로 알린다(조심-2019-전-2185는 2018 양도분을 해외이주 단서 부적용으로 과세).
  if (isRightSale) {
    return withUndetermined(
      judgment,
      "121-2-pre2020-non-resident-right-unverified",
      `양도일 현재 비거주자입니다. 비거주자에게 조합원입주권 비과세를 적용하지 않는 규정(${TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION} 단서의 §89①4호)은 2020.1.1. 이후 양도분부터라 그 전 양도분은 적용 여부를 확인해야 합니다 — 거주자 기준으로 판정했습니다.`,
    );
  }
  if (input.transferDate < NON_RESIDENT_HOUSE_EXCLUSION_TRANSFER_START) {
    return withUndetermined(
      judgment,
      "121-2-pre2010-non-resident-unverified",
      `양도일 현재 비거주자입니다. 비거주자에게 1세대1주택 비과세를 적용하지 않는 규정(${TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION} 단서)은 2010.1.1. 이후 양도분부터라 그 전 양도분은 적용 여부를 확인해야 합니다 — 거주자 기준으로 판정했습니다.`,
    );
  }
  const reason = input.oneHouseExemptionProviso?.reason;
  if (reason && OVERSEAS_REASONS.has(reason) && resolveExemptionProviso(input) === "both") return judgment;
  return {
    ...revokeOneHouseExemption(judgment),
    unmetExceptions: [
      ...judgment.unmetExceptions,
      {
        id: "non-resident-121-2",
        label: "비거주자 — 1세대1주택 비과세 배제",
        legalBasis: TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION,
        reasons: [
          `양도일 현재 비거주자에게는 1세대1주택 비과세(§89①3호)와 그 특례를 적용하지 않습니다(${TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION} 단서 · ${TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION_DECREE}).`,
          "예외: 해외이주 또는 1년 이상 국외거주(취학·근무)로 세대전원이 출국하고, 출국일 현재 1주택을 출국일부터 2년 이내에 양도하는 경우(시행령 §154①2호 나·다목) — 해당하면 ③ 보유 주택·권리 단계의 「§154① 단서 — 보유·거주 요건 면제 사유」에서 고르세요.",
        ],
      },
    ],
  };
}

function withUndetermined(judgment: OneHouseJudgment, id: string, reason: string): OneHouseJudgment {
  return { ...judgment, undetermined: [...judgment.undetermined, { id, reason }] };
}
