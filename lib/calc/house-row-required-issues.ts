/**
 * 보유 주택 명부 행의 **중과 축 필수 칸**(장기임대 9유형·부득이 사유) — 계산기 ⑧과 판정 메뉴 ⑧이 쓰는 단일 소스(S09-1).
 *
 * ⑫ refine(`transfer-tax-schema-household-refines.ts` `refineRentalRows`·`transfer-tax-schema-required-refines.ts`
 * `refineHouseExclusionInputs`)의 거울이다. 판정 메뉴는 이 칸들을 명부 편집기에 **조건 없이** 렌더하는데(`HouseEntryEditor`),
 * 판정 ⑧이 거울을 갖지 않아 ⑧ 통과 → route 400 → 화면에는 「입력값이 올바르지 않습니다」만 남았다(VD-1 규약 「Zod가 400을 내기
 * 전에 ⑧이 잡는다」 위반). 두 ⑧이 손으로 적은 사본을 따로 두면 한쪽만 갈라진다 — 한 곳에 둔다.
 *
 * 메시지에는 **행 라벨을 붙이지 않는다**. 호출부가 「보유 주택 N: 」을 붙인다.
 * `field`는 비어 있는 칸의 이름이다(판정 ⑧의 오류 `field`로 쓴다).
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

export interface HouseRowIssue {
  field: string;
  message: string;
}

type RentalFields = Pick<
  HouseEntry,
  | "isLongTermRental"
  | "rentalType"
  | "rentalStartOfficialPrice"
  | "acquisitionOfficialPrice"
  | "rentalLandArea"
  | "rentalTotalFloorArea"
  | "firstSaleContractDate"
  | "rentalCancellationDate"
  | "saMokBaseArticle"
>;

/** 장기임대 9유형(§167의3①2호 가~자목) 유형별 필수 입력 — 미입력이면 엔진이 현재 공시가격·규모 미확인으로 오판정한다(H-3). */
export function houseRentalTypeIssue(h: RentalFields): HouseRowIssue | null {
  if (!(h.isLongTermRental && h.rentalType)) return null;
  const t = h.rentalType;
  // exact 비교(.includes(t)=정확매칭).
  if (["A", "C", "E", "F", "H", "I"].includes(t) && !h.rentalStartOfficialPrice)
    return { field: "rentalStartOfficialPrice", message: "임대개시 당시 공시가격을 입력하세요." };
  if (["B", "D"].includes(t) && !h.acquisitionOfficialPrice)
    return { field: "acquisitionOfficialPrice", message: "취득 당시 공시가격을 입력하세요." };
  if (["C", "D", "F", "I"].includes(t) && (!h.rentalLandArea || !h.rentalTotalFloorArea))
    return {
      field: !h.rentalLandArea ? "rentalLandArea" : "rentalTotalFloorArea",
      message: "대지면적·연면적(㎡)을 입력하세요.",
    };
  if (t === "D" && !h.firstSaleContractDate)
    return { field: "firstSaleContractDate", message: "최초 분양계약일을 입력하세요." };
  if (t === "G") {
    if (!h.rentalCancellationDate)
      return { field: "rentalCancellationDate", message: "자진·자동 말소일을 입력하세요." };
    // 사목 base 목(가·다·라·마) + 그 목의 "해당 목의 다른 요건"(임대기간요건 외) — 엔진 SAMOK_BASE_REQUIRED·base 게이트와 동기화
    const base = h.saMokBaseArticle;
    if (!base) return { field: "saMokBaseArticle", message: "사목 — 말소 전 base 목(가·다·라·마)을 선택하세요." };
    if ((base === "가" || base === "다" || base === "마") && !h.rentalStartOfficialPrice)
      return { field: "rentalStartOfficialPrice", message: "사목 base 목의 임대개시 당시 공시가격을 입력하세요." };
    if (base === "라" && !h.acquisitionOfficialPrice)
      return { field: "acquisitionOfficialPrice", message: "사목 base 라목의 취득 당시 공시가격을 입력하세요." };
    if ((base === "다" || base === "라") && (!h.rentalLandArea || !h.rentalTotalFloorArea))
      return {
        field: !h.rentalLandArea ? "rentalLandArea" : "rentalTotalFloorArea",
        message: "사목 base 목의 대지면적·연면적(㎡)을 입력하세요.",
      };
    if (base === "라" && !h.firstSaleContractDate)
      return { field: "firstSaleContractDate", message: "사목 base 라목의 최초 분양계약일을 입력하세요." };
  }
  return null;
}

/** §167의10①3호 부득이한 사유 주택 — 거주기간(년)·취득 당시 기준시가 필수(엔진 ≥1년 판정 · 비우면 0으로 읽혀 배제 미발동). */
export function houseUnavoidableIssue(
  h: Pick<HouseEntry, "isUnavoidableReason" | "unavoidableResidenceYears" | "acquisitionOfficialPrice">,
): HouseRowIssue | null {
  if (!h.isUnavoidableReason) return null;
  if (!h.unavoidableResidenceYears || parseFloat(h.unavoidableResidenceYears) <= 0)
    return { field: "unavoidableResidenceYears", message: "부득이한 사유 주택의 거주기간(년)을 입력하세요." };
  // 3호의 기준시가는 「취득 당시」다 — 미입력이면 엔진이 판정 불가로 두고 배제하지 않는다(F-16).
  if (!h.acquisitionOfficialPrice)
    return { field: "acquisitionOfficialPrice", message: "부득이한 사유 주택의 취득 당시 기준시가를 입력하세요." };
  return null;
}
