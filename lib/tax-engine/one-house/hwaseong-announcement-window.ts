/**
 * 화성시 조정대상지역 지정 시작 열흘(2020.6.19.~6.28.) — 확인 필요 고지 (1세대1주택 코드 리뷰 결정 #3 하위 2).
 *
 * 화성시 전역 지정의 시작일을 원 공고일 2020-06-19로 판정한다(`data/regulated-areas-data.ts` 화성 엔트리). 정정공고
 * (국토교통부공고 제2020-877호, 2020.6.29.)는 대상지역 행에 「화성시」를 넣었을 뿐 「지정기간 2020. 6. 19. ~」과
 * 「공고한 날부터 효력」은 고치지 않았고, 원 공고(제2020-828호)의 현황표에도 화성시가 이미 있어 6.19. 시작에는 명문 근거가 있다.
 * 다만 6.19.~6.28. 열흘에 대한 해석례·심판례는 확인하지 못했다 — 정정공고일(6.29.)로 읽으면 이 열흘은 미지정이다.
 *
 * 그 독법에 따라 결론이 달라지는 사안에만 낸다(모름 = 혜택 불성립 + 결론을 가를 때만 확인 필요 — `designated-district-undeclared.ts`와
 * 같은 규약). 세 갈래다:
 *   ① 취득 당시 조정대상지역(§154① 거주요건) — 취득일이 열흘 안이고 거주요건이 비과세 결론을 가를 때
 *   ② §155①2호 신규 주택 — 취득·계약이 열흘 안(또는 6.29. 이전 계약)이고 처분기한 판정이 갈릴 때
 *   ③ 다주택 중과(계산기) — 양도일이 열흘 안이거나, 공고 전 매매계약 배제(영 §167의10①11호 등)의 「공고」가 6.19.이냐 6.29.이냐에 걸릴 때
 *
 * 열흘의 판정은 데이터 leaf(`governingDesignationStart`)가 정한다 — 화성 동탄2 지구처럼 6.19. 전부터 지정이던 곳은 시작일이 2017-08-03이라
 * 걸리지 않는다. 사실 판정을 여기서 다시 하지 않는다(단일 진실).
 */
import { format } from "date-fns";

import { governingDesignationStart } from "../data/regulated-areas";
import { PRE_DESIGNATION_CONTRACT_EXCLUSION } from "../legal-codes";
import { resolveResidenceJudgmentDate, type ResidenceReqInput } from "../transfer-tax-exemption-holding";
import { judgeTemporaryTwoHouseTiming } from "../transfer-tax-temporary-two-house-timing";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseUndetermined } from "./types";

export const HWASEONG_WINDOW_NOTICE_ID = "regulated-hwaseong-announcement-window-unverified";

/** 화성시 법정동코드 접두 — 시 `41590` 및 일반구 만세 `41591`·효행 `41593`·병점 `41595`·동탄 `41597` */
const HWASEONG_CODE_PREFIX = "4159";
/** 화성시 전역 지정 효력 시작일(원 공고일) — 국토교통부공고 제2020-828호 */
const WINDOW_START = "2020-06-19";
/** 정정공고일 — 국토교통부공고 제2020-877호 */
const CORRECTION_DATE = "2020-06-29";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dot = (s: string) => `${s.replace(/-/g, ".")}.`;

const isHwaseong = (code: string | undefined): code is string => !!code && code.startsWith(HWASEONG_CODE_PREFIX);

/** 그 날이 화성시 전역 지정(2020-06-19 구간)이라 판정되는데 정정공고일 전인가 — 정정공고일로 읽으면 미지정이 되는 날 */
function inStatusWindow(code: string | undefined, date: string): boolean {
  if (!isHwaseong(code) || date < WINDOW_START || date >= CORRECTION_DATE) return false;
  return governingDesignationStart(code, date) === WINDOW_START;
}

/**
 * 「조정대상지역의 공고가 있은 날 이전」 비교의 공고일이 6.19.이냐 6.29.이냐에 걸리는 날인가 — 6.19. 다음 날부터 6.29.까지(당일 포함 비교).
 * 6.19.는 두 독법 모두 「이전」이다. `governingStart`는 그 사안에 효력이 있는 지정 구간의 시작일이다.
 */
function inAnnouncementGap(code: string | undefined, governingStart: string | null, date: string): boolean {
  return isHwaseong(code) && governingStart === WINDOW_START && date > WINDOW_START && date <= CORRECTION_DATE;
}

const BASIS =
  `화성시 전역 지정의 효력은 국토교통부공고 제2020-828호(${dot(WINDOW_START)})의 공고한 날부터로 보았습니다 — 정정공고(제2020-877호, ${dot(CORRECTION_DATE)})는 ` +
  "대상지역 행에 「화성시」를 넣었을 뿐 지정기간과 효력 시점은 고치지 않았습니다. 다만 이 열흘에 대한 해석례·심판례는 확인하지 못했고, " +
  `정정공고일(${dot(CORRECTION_DATE)})부터로 보면 결과가 달라집니다(확인 필요)`;

/** ① 취득 당시 조정대상지역 — 거주요건이 결론을 가를 때만 */
export function hwaseongAcquisitionWindowNotice(
  input: ResidenceReqInput,
  settled: boolean,
  residenceDecides: (() => boolean) | undefined,
): OneHouseUndetermined[] {
  if (settled || !input.regionCode) return [];
  const date = ymd(resolveResidenceJudgmentDate(input));
  if (!inStatusWindow(input.regionCode, date)) return [];
  if (!(residenceDecides?.() ?? true)) return [];
  return [
    {
      id: HWASEONG_WINDOW_NOTICE_ID,
      reason:
        `이 주택의 취득 당시(${dot(date)}) 조정대상지역 여부는 화성시 지정 시작 열흘(${dot(WINDOW_START)}~6.28.)에 걸려 있습니다. ${BASIS}. ` +
        "조정대상지역이 아니면 거주 2년 요건이 없습니다.",
    },
  ];
}

/**
 * ② §155①2호 일시적 2주택 — 종전·신규 주택 중 화성 주택의 신규 취득 당시 조정 여부, 신규 주택의 공고 전 취득·계약이 열흘에 걸리고
 * 두 독법의 처분기한 판정이 갈릴 때만. `bothRegulated`는 6.19. 독법의 판정이고, 6.29. 독법은 그보다 지정이 적어 `false`가 될 수 있다.
 */
export function hwaseongTemporaryTwoHouseWindowNotice(
  input: Pick<TransferTaxInput, "regionCode" | "transferDate">,
  tt: NonNullable<TransferTaxInput["temporaryTwoHouse"]>,
  bothRegulatedByTenth: boolean,
  deadlineYearsFor: (bothRegulated: boolean) => number,
): OneHouseUndetermined[] {
  if (!bothRegulatedByTenth) return [];
  const acq = ymd(tt.newAcquisitionDate);
  const contract = tt.newHouseContractDate ? ymd(tt.newHouseContractDate) : undefined;
  const previousCode = tt.previousHouseIsRosterRow ? tt.previousHouseRegionCode : input.regionCode;
  const newCode = tt.newHouseRegionCode;
  const status =
    inStatusWindow(previousCode, acq) ||
    inStatusWindow(newCode, acq) ||
    (contract !== undefined && inStatusWindow(newCode, contract));
  const gap =
    inAnnouncementGap(newCode, newCode ? governingDesignationStart(newCode, acq, tt.newHouseInDesignatedDistrict) : null, acq) ||
    (contract !== undefined &&
      inAnnouncementGap(newCode, newCode ? governingDesignationStart(newCode, acq, tt.newHouseInDesignatedDistrict) : null, contract));
  if (!status && !gap) return [];
  const met = (years: number) =>
    judgeTemporaryTwoHouseTiming({
      previousAcquisitionDate: tt.previousAcquisitionDate,
      newAcquisitionDate: tt.newAcquisitionDate,
      transferDate: input.transferDate,
      deadlineYears: years,
      oneYearWaived: true, // 요건 A(1년 이상 경과)는 이 판단과 무관하다
    }).threeYearMet;
  if (met(deadlineYearsFor(true)) === met(deadlineYearsFor(false))) return [];
  return [
    {
      id: HWASEONG_WINDOW_NOTICE_ID,
      reason:
        "일시적 2주택 처분기한은 신규 주택 취득 당시 종전·신규 주택이 모두 조정대상지역이면 짧아지는데, 이 사안의 신규 주택 취득·계약이 " +
        `화성시 지정 시작 열흘(${dot(WINDOW_START)}~${dot(CORRECTION_DATE)})에 걸려 있습니다. ${BASIS}.`,
    },
  ];
}

/** ③ 다주택 중과(계산기) — 중과가 적용됐고 그 적용이 열흘의 독법에 달려 있을 때만 */
export function hwaseongSurchargeWindowNotice(
  input: Pick<TransferTaxInput, "houses" | "sellingHouseId" | "transferDate">,
  surchargeApplicable: boolean | undefined,
  exemptionIsExempt: boolean,
): string[] {
  if (!surchargeApplicable || exemptionIsExempt) return [];
  const house = input.houses?.find((h) => h.id === input.sellingHouseId);
  const code = house?.regionCode;
  if (!house || !isHwaseong(code)) return [];
  const transfer = ymd(input.transferDate);
  const start = governingDesignationStart(code, transfer, house.inDesignatedDistrict);
  const contract = house.contractDate && house.saleDepositReceived ? ymd(house.contractDate) : undefined;
  if (inStatusWindow(code, transfer)) {
    return [
      `이 주택의 양도일(${dot(transfer)})은 화성시 지정 시작 열흘(${dot(WINDOW_START)}~6.28.)에 걸려 있어 다주택 중과를 적용했습니다. ${BASIS}. 조정대상지역이 아니면 중과가 없습니다.`,
    ];
  }
  if (contract !== undefined && inAnnouncementGap(code, start, contract)) {
    return [
      `양도 매매계약일(${dot(contract)})이 화성시 조정대상지역 공고일을 ${dot(WINDOW_START)}로 보면 공고 후이고 ${dot(CORRECTION_DATE)}로 보면 공고 전입니다 — ` +
        `공고 전 매매계약 중과 배제(${PRE_DESIGNATION_CONTRACT_EXCLUSION.TWO_HOUSE_BASIS} 등)를 적용하지 않았습니다. ${BASIS}.`,
    ];
  }
  return [];
}
