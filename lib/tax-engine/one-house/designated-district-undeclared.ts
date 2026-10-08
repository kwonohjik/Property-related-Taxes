/**
 * 「지정 지구 안인가」 미선언 — 확인 필요 고지(판정 메뉴 「판정하지 않은 부분」 · 계산기 경고 공용).
 *
 * 소재 법정동이 그 날짜에 **동 안 일부 지구만 조정대상지역**이었는데(`IncludedSubArea.district`) 사용자가 지구 안·밖을
 * 고르지 않았으면 엔진은 지구 안(조정대상지역)으로 판정한다(모름=불리 — 사용자 결정 2026-10-08). 그 사실을 알린다.
 *
 * 대상은 코드가 조정대상지역 판정에 쓰이는 셋이다: 양도 주택(취득 당시 · 양도 당시 · 신규 주택 취득 당시),
 * 일시적 2주택의 신규 주택(명부 행), 기존주택 원조합원 입주권 행(§155① 처분기한 — `original-member-right.ts`).
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "../data/regulated-areas";
import { resolveResidenceJudgmentDate, type ResidenceReqInput } from "../transfer-tax-exemption-holding";
import type { TransferTaxInput } from "../types/transfer.types";

export const DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX = "regulated-district-undeclared:";

type Input = ResidenceReqInput & Pick<TransferTaxInput, "temporaryTwoHouse" | "presaleRights">;

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dot = (s: string) => `${s.replace(/-/g, ".")}.`;

export function designatedDistrictUndeclared(input: Input): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  const check = (
    id: string,
    where: string,
    code: string | undefined,
    inDistrict: boolean | undefined,
    dates: (Date | undefined)[],
  ) => {
    if (!code || inDistrict !== undefined) return;
    for (const d of dates) {
      if (!d) continue;
      const j = isRegulatedByBjdCode(code, ymd(d));
      if (!j.districtOnly) continue;
      out.push({
        id: `${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}${id}`,
        reason:
          `${where} 소재지(${j.districtOnly.area})는 ${dot(ymd(d))} 당시 동 전체가 아니라 「${j.districtOnly.district}」만 ` +
          "조정대상지역이었는데, 지구 안인지 고르지 않아 조정대상지역으로 판정했습니다(확인 필요) — 소재지 아래에서 " +
          "「지구 안·밖」을 고르세요.",
      });
      return;
    }
  };

  const tt = input.temporaryTwoHouse;
  check("selling", "양도 주택", input.regionCode, input.regionInDesignatedDistrict, [
    resolveResidenceJudgmentDate(input),
    input.transferDate,
    tt?.newAcquisitionDate,
  ]);
  check("new-house", "신규 주택(보유 주택 목록)", tt?.newHouseRegionCode, tt?.newHouseInDesignatedDistrict, [
    tt?.newAcquisitionDate,
    tt?.newHouseContractDate,
  ]);
  (input.presaleRights ?? []).forEach((r, i) => {
    // 입주권 행 소재지가 조정대상지역 판정에 쓰이는 것은 기존주택 원조합원 경로뿐이다(미입력 포함).
    if (r.type !== "redevelopment_right" || r.memberOrigin === "successor" || r.memberOrigin === "original_non_house") return;
    check(`right-${i}`, `분양권·입주권 ${i + 1}`, r.regionCode, r.inDesignatedDistrict, [r.acquisitionDate]);
  });
  return out;
}
