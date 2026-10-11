/**
 * 「지정 지구 안인가」 미선언 — 확인 필요 고지(판정 메뉴 「판정하지 않은 부분」 · 계산기 경고 공용).
 *
 * 소재 법정동이 그 날짜에 **동 안 일부 지구만 조정대상지역**이었는데(`IncludedSubArea.district`) 사용자가 지구 안·밖을
 * 고르지 않았으면 엔진은 지구 안(조정대상지역)으로 판정한다(모름=불리 — 사용자 결정 2026-10-08). 그 사실을 알린다.
 *
 * 대상은 코드가 조정대상지역 판정에 쓰이는 셋이다: 양도 주택(취득 당시 · 양도 당시 · 신규 주택 취득 당시),
 * 일시적 2주택의 신규 주택(명부 행)과 합가 D8 짝의 종전 주택(명부 행), 기존주택 원조합원 입주권 행(§155① 처분기한 — `original-member-right.ts`).
 *
 * 🔑 **그 선언이 결론을 가를 때만** 낸다(`feedback_unknown_fact_applies_unfavorably` — 형제 고지 `era-undetermined`의
 * `regulatedAxisMatters` · `pending`의 `coreWouldPass`와 같은 규약). 양도 주택은 「지구 안·밖 어느 쪽이든 비과세 결론이 같으면」
 * 묻지 않는다 — 판정 메뉴는 중과를 계산하지 않으므로 양도일 지정 상태만으로는 결론이 안 바뀐다(S02-7). 계산기 다주택 중과는
 * 양도일 조정 여부를 실제로 쓰므로 `surchargeSellingDistrictUndeclared`가 따로 맡는다.
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "../data/regulated-areas";
import { hwaseongSurchargeWindowNotice } from "./hwaseong-announcement-window";
import { resolveResidenceJudgmentDate, type ResidenceReqInput } from "../transfer-tax-exemption-holding";
import type { TransferTaxInput } from "../types/transfer.types";

export const DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX = "regulated-district-undeclared:";

type Input = ResidenceReqInput & Pick<TransferTaxInput, "temporaryTwoHouse" | "presaleRights" | "propertyType" | "isOneHousehold">;

/**
 * 입주권 행의 「지정 지구 안인가」 답을 엔진이 쓰는가 — 노출 게이트(⑤ 질문)와 이 파일의 고지가 **같은 술어**를 쓴다(S14b-7).
 *
 * 쓰이는 곳은 §89② 기존주택 원조합원의 §155① 처분기한 판정(`original-member-right.ts` — 미입력 취득 경위 포함)뿐이고,
 * 그것은 **주택 양도**에서만 일어난다(`transfer-tax-89-2-exclusion.ts` `resolveArticle89Clause2`가 비주택 양도·비1세대면 조기 반환).
 * 분양권 행과 승계취득·상가·토지 원조합원 행은 「소득세법 시행령」 제156조의2제3항·제4항, 제156조의3제2항·제3항이라 조정대상지역 요건이 없다.
 */
export function rightRowDistrictAnswerUsed(row: { type: string; memberOrigin?: string }, saleIsHousing: boolean): boolean {
  return (
    saleIsHousing &&
    row.type === "redevelopment_right" &&
    row.memberOrigin !== "successor" &&
    row.memberOrigin !== "original_non_house"
  );
}

/** 고지를 낼지 가르는 「선언이 결론을 가르는가」 — 호출부(판정 함수)가 선언 true/false로 두 번 판정해 채운다. */
export interface DistrictDeclarationRelevance {
  /** 양도 주택의 지구 선언을 true·false로 바꾸면 비과세 결론이 달라지는가 */
  selling: () => boolean;
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dot = (s: string) => `${s.replace(/-/g, ".")}.`;

/**
 * 「지구 안인가」 미선언 고지 문장 — `scopeUnverified`(고시의 지정 범위가 법정동인지 행정동인지 미확인)면 「동 전체가 아니라 …만」이라고
 * 단정하지 않는다. 그 문구는 두 독법 어느 쪽에서도 사실과 다르다(결정 #4).
 */
function districtNoticeReason(
  where: string,
  only: { district: string; area: string; scopeUnverified?: boolean },
  d: Date,
  /** 미선언 처리 결과 — 예: 「조정대상지역으로 판정했습니다」 */
  outcome = "조정대상지역으로 판정했습니다",
): string {
  return only.scopeUnverified
    ? `${where} 소재지(${only.area})는 ${dot(ymd(d))} 당시 고시에 「${only.district}」만 조정대상지역으로 적혀 있는데, 그 범위(법정동인지 ` +
        `행정동인지)를 확인하지 못했고 지구 안인지 고르지 않아 ${outcome}(확인 필요) — 소재지 아래에서 「지구 안·밖」을 고르세요.`
    : `${where} 소재지(${only.area})는 ${dot(ymd(d))} 당시 동 전체가 아니라 「${only.district}」만 ` +
        `조정대상지역이었는데, 지구 안인지 고르지 않아 ${outcome}(확인 필요) — 소재지 아래에서 「지구 안·밖」을 고르세요.`;
}

/**
 * @param relevance 양도 주택 고지의 관련성 게이트. **생략하면 게이트 없음**(후보가 있으면 낸다) — 운영 경로
 *   (`checkExemption` → `collectUndetermined`)는 항상 넘긴다.
 */
export function designatedDistrictUndeclared(
  input: Input,
  relevance?: DistrictDeclarationRelevance,
): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  const check = (
    id: string,
    where: string,
    code: string | undefined,
    inDistrict: boolean | undefined,
    dates: (Date | undefined)[],
    matters: () => boolean = () => true,
  ) => {
    if (!code || inDistrict !== undefined) return;
    for (const d of dates) {
      if (!d) continue;
      const j = isRegulatedByBjdCode(code, ymd(d));
      if (!j.districtOnly) continue;
      if (!matters()) return;
      out.push({
        id: `${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}${id}`,
        reason: districtNoticeReason(where, j.districtOnly, d),
      });
      return;
    }
  };

  const tt = input.temporaryTwoHouse;
  check(
    "selling",
    "양도 주택",
    input.regionCode,
    input.regionInDesignatedDistrict,
    [resolveResidenceJudgmentDate(input), input.transferDate, tt?.newAcquisitionDate],
    relevance?.selling,
  );
  // 합가 D8 상대 쪽 짝(B → C)의 종전 주택(명부 행) — 양도 주택이 아니라 이 행의 소재로 조정 여부를 판정한다(S15-2).
  if (tt?.previousHouseIsRosterRow) {
    check("previous-house", "종전 주택(보유 주택 목록)", tt.previousHouseRegionCode, tt.previousHouseInDesignatedDistrict, [
      tt.newAcquisitionDate,
    ]);
  }
  check("new-house", "신규 주택(보유 주택 목록)", tt?.newHouseRegionCode, tt?.newHouseInDesignatedDistrict, [
    tt?.newAcquisitionDate,
    tt?.newHouseContractDate,
  ]);
  const saleIsHousing = input.propertyType === "housing" && input.isOneHousehold === true;
  (input.presaleRights ?? []).forEach((r, i) => {
    // 입주권 행 소재지가 조정대상지역 판정에 쓰이는 것은 주택 양도의 기존주택 원조합원 경로뿐이다(미입력 포함).
    if (!rightRowDistrictAnswerUsed(r, saleIsHousing)) return;
    check(`right-${i}`, `분양권·입주권 ${i + 1}`, r.regionCode, r.inDesignatedDistrict, [r.acquisitionDate]);
  });
  return out;
}

/**
 * 계산기 다주택 중과 — 양도 주택의 양도일 조정대상지역 판정이 **실제로 세율을 가르는데**(중과 적용으로 계산됐는데) 그 판정이
 * 「지구 안인지 고르지 않아 지정으로 본 것」이면 확인 필요를 알린다. 지구 밖이면 중과가 빠지므로 결론을 가른다.
 *
 * 판정 메뉴는 중과를 계산하지 않아 이 고지가 없다(위 `designatedDistrictUndeclared`의 양도 주택 게이트). 비과세 결론이 이미 선
 * 경우에는 중과가 의미 없고, 판정이 같은 사유로 이미 고지했으면 중복하지 않는다.
 *
 * 양도 주택 소재지는 중과 엔진(`multi-house-surcharge.ts` Step 2)이 읽는 명부의 양도 행이다.
 */
export function surchargeSellingDistrictUndeclared(
  input: Pick<TransferTaxInput, "houses" | "sellingHouseId" | "transferDate">,
  surchargeApplicable: boolean | undefined,
  exemption: { isExempt: boolean; undetermined: { id: string }[] },
): string[] {
  if (!surchargeApplicable || exemption.isExempt) return [];
  if (exemption.undetermined.some((u) => u.id === `${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}selling`)) return [];
  const house = input.houses?.find((h) => h.id === input.sellingHouseId);
  if (!house?.regionCode || house.inDesignatedDistrict !== undefined) return [];
  const j = isRegulatedByBjdCode(house.regionCode, ymd(input.transferDate));
  if (!j.districtOnly) return [];
  return [districtNoticeReason("양도 주택", j.districtOnly, input.transferDate, "조정대상지역으로 보고 다주택 중과를 적용했습니다")];
}

/**
 * 계산기 다주택 중과가 **양도일 조정대상지역 판정**에 달려 있을 때의 확인 필요 고지 묶음 — 양도 주택 지구 미선언(위)과
 * 화성시 지정 시작 열흘(`hwaseong-announcement-window.ts`, 결정 #3)이다. `transfer-tax.ts`가 이 함수 하나만 부른다.
 */
export function surchargeRegulatedAreaNotices(
  input: Pick<TransferTaxInput, "houses" | "sellingHouseId" | "transferDate">,
  surchargeApplicable: boolean | undefined,
  exemption: { isExempt: boolean; undetermined: { id: string }[] },
): string[] {
  return [
    ...surchargeSellingDistrictUndeclared(input, surchargeApplicable, exemption),
    ...hwaseongSurchargeWindowNotice(input, surchargeApplicable, exemption.isExempt),
  ];
}
