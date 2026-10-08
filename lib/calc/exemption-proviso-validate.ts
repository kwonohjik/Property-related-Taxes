/**
 * ⑧ 「소득세법 시행령」 §154① 단서 — **사유별 필수 입력** 검증 (계산기·판정 메뉴 공용).
 *
 * 입력 카드(`ExemptionProvisoSection`)는 두 화면이 함께 쓴다. 검증이 한쪽에만 있으면 다른 화면은
 * 필수값을 비운 채 판정으로 넘어가고, 엔진은 그 요건을 **UI 검증에 맡긴 채** 판정한다
 * (5호 무주택 — `resolveExemptionProviso`의 `pre_designation_contract` 분기) — OH-06.
 *
 * 🔑 인자는 **유효 사유**(`effectiveProvisoReason` 적용 후)다. 카드가 숨는 맥락의 stale 사유를
 *    여기서 막으면 채울 칸이 없는 영구 차단이 된다 — 정규화는 호출부의 게이트 몫이다.
 *
 * | 사유 | 필수 | 근거 |
 * |---|---|---|
 * | 2호나·다목 해외이주·국외거주 | 출국일 | 「출국일부터 2년 이내에 양도」 |
 * | 1호 건설·공공매입임대 거주 5년 | (선택) 임차일부터 세대전원 거주 개월 — 넣었으면 0 이상의 수 | 「임차일부터 양도일까지의 기간 중 세대전원이 거주한 기간」 |
 * | 2호가목 수용 | 수용일 | 엔진이 미입력을 **불성립**으로 본다(#591 R7 fail-closed) — OH-33 |
 * | 5호 조정 공고 전 계약 | 계약금 지급일 현재 무주택 확인 | 「계약금 지급일 현재 주택을 보유하지 아니하는 경우」 |
 * | 삭제 전 4호 임대사업자 등록 | 신청일 2개 · 등록 상태 · (②구간) 신청 당시 1주택 · (유지) 임대의무기간·5% | `rental-4ho-proviso.ts` (OH-38) |
 */
import { collectRental4hoErrors, type Rental4hoFormSlice } from "./rental-4ho-proviso";
import { fieldError } from "./transfer-tax-validate-field";
import { parseRentalLeaseResidenceMonths } from "./exemption-proviso-payload";

export function collectExemptionProvisoErrors(p: {
  /** `effectiveProvisoReason` 적용 후 사유. "" = 해당 없음. */
  reason: string;
  departureDate?: string;
  expropriationDate?: string;
  /** 1호 임차일부터 세대전원 거주 개월(선택) — ④와 같은 파서 */
  rentalLeaseResidenceMonths?: string;
  preContractNoHouse?: boolean;
  /** 4호 입력 — 호출부는 폼을 그대로 넘긴다(칸별 노출 범위는 leaf가 정한다) */
  rental4ho?: Partial<Rental4hoFormSlice>;
}): string[] {
  const errors: string[] = [];
  if ((p.reason === "overseas_migration" || p.reason === "overseas_residence") && !p.departureDate) {
    errors.push(fieldError("provisoDepartureDate", "§154① 단서(해외이주·국외거주): 출국일을 입력하세요. (출국일부터 2년 내 양도 판정)"));
  }
  /**
   * 수용되는 주택 자체를 양도하는 경우 그 양도가 곧 수용이다 — 수용일에 양도일을 넣으면 된다.
   * 5년 기한(2호 후단)은 **잔존주택**에 관한 것이라, 수용일 없이는 두 경우를 가를 수 없다.
   */
  if (p.reason === "expropriation" && !p.expropriationDate) {
    errors.push(
      fieldError("provisoExpropriationDate", "§154① 단서(공익사업 수용): 수용일을 입력하세요. (수용된 주택 자체를 양도하면 양도일과 같은 날입니다)"),
    );
  }
  if (
    p.reason === "rental_5yr_residence" &&
    p.rentalLeaseResidenceMonths?.trim() &&
    parseRentalLeaseResidenceMonths(p.rentalLeaseResidenceMonths) === undefined
  ) {
    errors.push(fieldError("provisoRentalLeaseResidenceMonths", "§154① 단서(임대주택 거주 5년): 임차일부터 거주한 개월 수를 0 이상의 숫자로 입력하세요."));
  }
  if (p.reason === "pre_designation_contract" && !p.preContractNoHouse) {
    errors.push(fieldError("provisoPreContractNoHouse", "§154① 단서(조정 공고 전 계약): 계약금 지급일 현재 무주택 여부를 확인하세요."));
  }
  if (p.reason === "rental_registration_4ho") errors.push(...collectRental4hoErrors(p.rental4ho ?? {}));
  return errors;
}
