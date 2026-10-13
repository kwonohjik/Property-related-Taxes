/**
 * 재개발 §166 — **토지만 출자한 원조합원 완공APT**의 §154① 거주요건 판정 고지 (#12 · 2026-10-11 사용자 결정 C).
 *
 * 신축주택 취득시기는 사용승인서 교부일이라(「소득세법 시행령」 §162①4호) 「취득 당시 조정대상지역」은 사용승인일로 본다.
 * 다만 입주권 전환일(= 관리처분계획 인가일 — 원조합원은 인가일에 보유 부동산이 입주권으로 바뀐다)이 2017.8.2. 이전이거나 그 날 조정대상지역이 아니었으면
 * 거주요건을 적용하지 않는다(서면-2022-법규재산-4321 · 서면-2018-법령해석재산-1711 · 서면-2021-부동산-0965).
 * 이 판정은 `describeOneHouseResidenceRequirement`(경과규정 + `right_conversion_not_regulated`)가 한다 — 여기는 말만 만든다.
 *
 * 고지는 **결론을 가를 때만** 낸다(모름 = 혜택 불성립 + 확인 필요):
 *  · 거주요건이 미충족(`unmet`)인데 주소(법정동코드)가 없어 인가일의 조정대상지역 여부를 판정하지 못한다
 *  · 인가일은 조정대상지역이었고 사용승인일에는 해제 — 법문대로 거주요건이 없지만 정면 해석례가 없다
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { describeOneHouseResidenceRequirement } from "./transfer-tax-exemption-holding";
import { isLandContributedOriginalApt } from "./one-house/redev-apt-judgment-input";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { TransferTaxInput } from "./types/transfer.types";

const RULINGS =
  "서면-2022-법규재산-4321(2024.5.22.) · 서면-2018-법령해석재산-1711(2019.5.15.) · 서면-2021-부동산-0965(2022.7.20.)";

/**
 * @param original 번역 전 입력(`redevelopment`·`regionCode`를 읽는다)
 * @param translated `translateRedevAptForHousingJudgment`를 거친 판정 입력
 */
export function redevLandAptResidenceNotices(
  original: TransferTaxInput,
  translated: TransferTaxInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
): string[] {
  const redev = original.redevelopment;
  if (!redev || !isLandContributedOriginalApt(original)) return [];
  if (translated.isOneHousehold !== true || redev.receiveOnlyMode === true) return [];

  const residence = describeOneHouseResidenceRequirement(translated, rule);
  const notices: string[] = [];

  if (residence.basis === "unmet") {
    if (!original.regionCode) {
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
    ).isRegulated
  ) {
    notices.push(
      "관리처분계획 인가일에는 조정대상지역이었으나 사용승인일(신축주택 취득시기)에는 해제되어 거주요건을 적용하지 않았습니다" +
        "(「소득세법 시행령」 §154①·§162①4호 문언). 이 조합을 정면으로 다룬 해석례는 확인하지 못했습니다 — 확인 필요.",
    );
  }
  return notices;
}
