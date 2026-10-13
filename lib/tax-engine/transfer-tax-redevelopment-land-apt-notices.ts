/**
 * 재개발 §166 — **토지만 출자한 원조합원 완공APT**의 §154① 거주요건 판정 고지 (#12 · 2026-10-11 사용자 결정 C).
 *
 * 신축주택 취득시기는 사용승인서 교부일이라(「소득세법 시행령」 §162①4호) 「취득 당시 조정대상지역」은 사용승인일로 본다.
 * 다만 입주권 전환일(= 관리처분계획 인가일 — 원조합원은 인가일에 보유 부동산이 입주권으로 바뀐다)이 2017.8.2. 이전이거나 그 날 조정대상지역이 아니었으면
 * 거주요건을 적용하지 않는다(서면-2022-법규재산-4321 · 서면-2018-법령해석재산-1711 · 서면-2021-부동산-0965).
 * 이 판정은 `describeOneHouseResidenceRequirement`(경과규정 + `right_conversion_not_regulated`)가 한다 — 여기는 말만 만든다.
 *
 * 고지는 **결론을 가를 때만** 낸다(모름 = 혜택 불성립 + 확인 필요). 「결론을 가른다」는 그 사실을 다른 독법으로 읽어 **판정 전체를 다시 돌렸을 때**
 * 비과세·부분 비과세 여부가 달라지는 것이다(#32-4 — 거주 개월만 보는 근사로는 3주택·보유 미달 같은 다른 사유가 따로 막은 사안을 걸러내지 못했다):
 *  · 거주요건이 미충족(`unmet`)인데 주소(법정동코드)가 없어 인가일의 조정대상지역 여부를 판정하지 못한다 — 거주요건을 채우면 결론이 바뀔 때만
 *  · 인가일은 조정대상지역이었고 사용승인일에는 해제 — 법문대로 거주요건이 없지만 정면 해석례가 없다 — 거주요건을 적용하면 결론이 바뀔 때만
 *  · 세대원 건물 출자 통산을 적용했다 — 정면 해석례 없는 유추(#12) — 통산을 빼면 결론이 바뀔 때만
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { describeOneHouseResidenceRequirement } from "./transfer-tax-exemption-holding";
import {
  householdBuildingCarryover,
  isLandContributedOriginalApt,
  translateRedevAptForHousingJudgment,
} from "./one-house/redev-apt-judgment-input";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { TransferTaxInput } from "./types/transfer.types";

/** 거주 요건을 채운 반사실 판정에 넣는 거주 개월 — 어떤 거주요건(2년)도 넘는 값이다(`era-notice-relevance.ts`의 같은 이름 상수와 같은 값). */
const RESIDENCE_COUNTERFACTUAL_MONTHS = 1200;

const RULINGS =
  "서면-2022-법규재산-4321(2024.5.22.) · 서면-2018-법령해석재산-1711(2019.5.15.) · 서면-2021-부동산-0965(2022.7.20.)";

/**
 * @param original 번역 전 입력(`redevelopment`·`regionCode`를 읽는다)
 * @param translated `translateRedevAptForHousingJudgment`를 거친 판정 입력
 * @param verdictOf 번역된 판정 입력으로 1세대1주택 판정 전체를 돌려 「비과세·부분 비과세 결론」 키를 돌려주는 함수(호출부가 본체 판정을 넘긴다)
 */
export function redevLandAptResidenceNotices(
  original: TransferTaxInput,
  translated: TransferTaxInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
  verdictOf: (judgeInput: TransferTaxInput) => string,
): string[] {
  const redev = original.redevelopment;
  if (!redev || !isLandContributedOriginalApt(original)) return [];
  if (translated.isOneHousehold !== true || redev.receiveOnlyMode === true) return [];

  const residence = describeOneHouseResidenceRequirement(translated, rule);
  const notices: string[] = [];

  // 현재 판정의 결론 키 — 고지 후보가 있을 때만 계산한다(판정 전체를 다시 돌리는 비용).
  let currentKey: string | undefined;
  const current = () => (currentKey ??= verdictOf(translated));
  if (residence.basis === "unmet") {
    // 주소가 없어 인가일 조정 여부를 모른다 — 알았다면 거주요건이 없었을 사안(거주를 채운 판정과 비교)일 때만 알린다.
    if (!original.regionCode && verdictOf({ ...translated, residencePeriodMonths: RESIDENCE_COUNTERFACTUAL_MONTHS }) !== current()) {
      notices.push(
        "토지만 출자한 신축주택은 사용승인일 현재 조정대상지역이면 거주 2년이 필요합니다(「소득세법 시행령」 §154①·§162①4호). " +
          "다만 입주권 전환일(관리처분계획 인가일) 현재 조정대상지역이 아니었으면 거주요건이 없는데, 그 여부는 주소(법정동코드)가 있어야 판정할 수 있습니다. " +
          `주소가 없어 입주권 전환 시점 예외를 적용하지 않았습니다(${RULINGS}) — 확인 필요.`,
      );
    }
  } else if (
    residence.basis === "not_regulated" &&
    original.regionCode &&
    isRegulatedByBjdCode(
      original.regionCode,
      format(redev.approvalDate, "yyyy-MM-dd"),
      original.regionInDesignatedDistrict,
    ).isRegulated &&
    // 거주요건을 적용하는 독법(인가일 조정대상지역 기준) — 주소를 지우고 조정 선언으로 두면 `wasRegulated`가 참이라 거주 2년이 걸린다.
    verdictOf({
      ...translated,
      regionCode: undefined,
      wasRegulatedAtAcquisition: true,
      residenceRightConversionDate: undefined,
    }) !== current()
  ) {
    notices.push(
      "관리처분계획 인가일에는 조정대상지역이었으나 사용승인일(신축주택 취득시기)에는 해제되어 거주요건을 적용하지 않았습니다" +
        "(「소득세법 시행령」 §154①·§162①4호 문언). 이 조합을 정면으로 다룬 해석례는 확인하지 못했습니다 — 확인 필요.",
    );
  }

  // 세대원 건물 출자 통산(#12) — 통산을 뺀 판정과 결론이 다를 때만(통산 없이도 같은 결론이면 낼 이유가 없다).
  const carry = householdBuildingCarryover(redev);
  if (carry && redev.completionDate) {
    const withoutCarry = translateRedevAptForHousingJudgment({
      ...original,
      redevelopment: { ...redev, householdBuilding: undefined },
    });
    if (verdictOf(withoutCarry) !== current()) {
      notices.push(
        `세대원 건물 출자 통산을 적용했습니다 — 비과세 보유기간을 사용승인일 대신 세대원 건물 취득일(${format(carry.holdingStart, "yyyy-MM-dd")})부터 세고, ` +
          `건물 거주 ${carry.residenceMonths}개월을 거주기간에 더했습니다. 토지만 출자한 사람의 세대원 건물 보유·거주 통산을 정면으로 다룬 해석례는 확인하지 못했고 ` +
          "같은 세대의 보유를 통산한 해석례·판결을 유추한 것입니다(부동산거래관리과-1041·-113 · 대법원 94누15530) — 확인 필요. " +
          "「취득 당시」 조정대상지역 판정일(사용승인일)과 장기보유특별공제 공제율은 통산하지 않았습니다.",
      );
    }
  }
  return notices;
}
