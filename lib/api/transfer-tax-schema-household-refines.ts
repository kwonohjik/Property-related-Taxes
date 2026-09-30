/**
 * 양도세 ⑫ — 1주택 판정·보유 주택 명부·한시 유예·소유자 분리 축의 필수값 (Zod↔엔진 불일치 2차분, 2026-09-30).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4 — O3·O4·H-3·유예기간·M2.
 *
 * 여기 있는 항목은 모두 비워 보내면 400이 아니라 **200 + 다른 판정·세액**이었다(엔진이 빈 값을 보수적 기본값·
 * 현재 기준시가·「요건 충족」으로 조용히 읽는다). 조건은 각 항목에 적은 ⑧ 위치의 거울이다 — 어긋나면
 * 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 된다. 단건·다건·판정 메뉴 route가 같은 `propertyBaseShape`을 쓰므로
 * `refinePropertyRequiredInputs`(단건·다건 자산 공용 진입점)에서 부른다.
 */
import { z } from "zod";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

type RentalRow = {
  id: string;
  isInherited?: boolean;
  isLongTermRental?: boolean;
  rentalType?: string;
  rentalStartOfficialPrice?: number;
  acquisitionOfficialPrice?: number;
  rentalLandArea?: number;
  rentalTotalFloorArea?: number;
  firstSaleContractDate?: string;
  rentalCancellationDate?: string;
  saMokBaseArticle?: string;
};

export type HouseholdRefineInput = {
  propertyType?: string;
  selfOwns?: string;
  sellingHouseId?: string;
  houses?: ReadonlyArray<RentalRow>;
  generalHouseGiftedFromDecedentWithin2yr?: boolean;
  generalHouseGiftDate?: string;
  oneHouseExemptionProviso?: { reason: string; preContractNoHouse?: boolean };
  gracePeriod?: { isLandPermitTarget?: boolean; permitApplicationDate?: string };
};

/**
 * H-3 — 명부 장기임대 9유형(§167의3①2호 가~자목) 유형별 입력 (⑧ `transfer-tax-validate-step1.ts` 보유 주택 행).
 * 비우면 엔진이 임대개시 당시 공시가격을 **현재** 공시가격으로 읽고(`multi-house-surcharge-count.ts`
 * `rentalStartOfficialPrice ?? officialPrice`) 규모는 미확인으로 본다 — 실측 185,310,000 ↔ 275,300,000.
 *
 * ⚠️ 양도 행(`sellingHouseId`)은 제외한다 — ⑧은 「다른 보유 주택」 행만 검증한다(양도 주택의 임대 선언에는
 *    필수 검증이 없다). 여기서 요구하면 화면에서 고칠 칸이 없는 400이 된다.
 * 값의 존재만 본다(⑧은 칸이 비었는지만 본다 — 「0」 입력은 통과시키고 ④가 0으로 보낸다).
 */
function refineRentalRows(data: HouseholdRefineInput, issue: Issue) {
  (data.houses ?? []).forEach((h, i) => {
    if (data.sellingHouseId !== undefined && h.id === data.sellingHouseId) return;
    if (!h.isLongTermRental || !h.rentalType) return;
    const need = (key: keyof RentalRow, label: string) => {
      if (h[key] === undefined || h[key] === "")
        issue(["houses", i, key], `장기임대 ${h.rentalType}유형: ${label}이(가) 필요합니다 (소득세법 시행령 §167의3①2호)`);
    };
    const t = h.rentalType;
    if (["A", "C", "E", "F", "H", "I"].includes(t)) need("rentalStartOfficialPrice", "임대개시 당시 공시가격");
    if (["B", "D"].includes(t)) need("acquisitionOfficialPrice", "취득 당시 공시가격");
    if (["C", "D", "F", "I"].includes(t)) {
      need("rentalLandArea", "대지면적(㎡)");
      need("rentalTotalFloorArea", "연면적(㎡)");
    }
    if (t === "D") need("firstSaleContractDate", "최초 분양계약일");
    if (t === "G") {
      need("rentalCancellationDate", "자진·자동 말소일");
      const base = h.saMokBaseArticle;
      if (!base) {
        need("saMokBaseArticle", "말소 전 base 목(가·다·라·마)");
        return;
      }
      if (base === "가" || base === "다" || base === "마") need("rentalStartOfficialPrice", "base 목의 임대개시 당시 공시가격");
      if (base === "라") need("acquisitionOfficialPrice", "base 라목의 취득 당시 공시가격");
      if (base === "다" || base === "라") {
        need("rentalLandArea", "base 목의 대지면적(㎡)");
        need("rentalTotalFloorArea", "base 목의 연면적(㎡)");
      }
      if (base === "라") need("firstSaleContractDate", "base 라목의 최초 분양계약일");
    }
  });
}

export function refineHouseholdRequiredInputs(data: HouseholdRefineInput, ctx: z.RefinementCtx) {
  const issue = issuer(ctx);

  /**
   * O3 — §155② 괄호 「소급 2년 내 피상속인 증여주택」 선언이면 증여일 (⑧ `transfer-tax-validate-step1.ts` ·
   * `one-house-exemption-validate.ts` OH-12c). 비우면 엔진이 제외를 **적용**한다(구 저장분 보수 기본값 —
   * `isDecedentGiftExclusionApplicable`) — 2018-02-13 전 증여여도 과세로 반전됐다(실측 비과세 ↔ 113,860,000).
   *
   * 게이트는 계산기 ⑧과 같다 — 명부(양도 행 제외)에 상속주택이 있을 때. 판정 메뉴 ⑧은 상속 권리 행도 보므로
   * 더 넓다(여기가 두 ⑧의 교집합 — 어느 화면에서도 막다른 길이 없다).
   */
  const hasOtherInheritedHouse = (data.houses ?? []).some(
    (h) => h.isInherited && !(data.sellingHouseId !== undefined && h.id === data.sellingHouseId),
  );
  if (hasOtherInheritedHouse && data.generalHouseGiftedFromDecedentWithin2yr === true && !data.generalHouseGiftDate) {
    issue(
      ["generalHouseGiftDate"],
      "피상속인 증여주택 선언에는 증여받은 날이 필요합니다 (소득세법 시행령 §155② · 대통령령 제28637호 부칙 제16조)",
    );
  }

  /**
   * O4 — §154① 5호 「계약금 지급일 현재 주택을 보유하지 아니하는 경우」 (⑧ `exemption-proviso-validate.ts`).
   * 엔진은 이 요건을 판정하지 않고 사유만으로 거주요건을 면제한다(`transfer-tax-exemption-requirements.ts` —
   * 「⑧·⑫로 담보」). 종전에는 ⑫에 키가 없어 strip — 무주택 여부와 무관하게 비과세였다.
   */
  const proviso = data.oneHouseExemptionProviso;
  if (proviso?.reason === "pre_designation_contract" && proviso.preContractNoHouse !== true) {
    issue(
      ["oneHouseExemptionProviso", "preContractNoHouse"],
      "§154① 5호(조정 공고 전 계약)는 계약금 지급일 현재 무주택 확인(preContractNoHouse: true)이 필요합니다",
    );
  }

  refineRentalRows(data, issue);

  /**
   * 한시 유예 나목(§167의3①12의2 나목) — 토지거래허가 대상이면 허가신청일 (⑧ `transfer-tax-validate-step1.ts`).
   * 비우면 엔진이 나목 불성립으로 본다(`checkGracePeriodExemption`) — 실측 290,610,000 ↔ 582,510,000.
   * ④는 ⑧과 같은 범위 술어(`gracePeriodInScope`)일 때만 `gracePeriod`를 보내므로 존재 자체가 게이트다.
   */
  if (data.gracePeriod?.isLandPermitTarget === true && !data.gracePeriod.permitApplicationDate) {
    issue(["gracePeriod", "permitApplicationDate"], "중과 한시 유예 나목(토지거래허가 대상)은 허가 신청일이 필요합니다");
  }

  /**
   * M2 — 소유자 분리는 주택·건물 자산에만 (소령 §166⑥·§168②). 종전에는 **단건 superRefine에만** 있어
   * 다건은 같은 본문을 200으로 받았다(엔진이 무시). 단건·다건이 같은 결론을 내도록 공용 진입점으로 옮겼다.
   * UI에서는 ④가 범위 밖 잔재를 보내지 않는다(`lib/calc/self-owns-scope.ts`).
   */
  if (
    data.selfOwns &&
    data.selfOwns !== "both" &&
    data.propertyType !== "housing" &&
    data.propertyType !== "building"
  ) {
    issue(["selfOwns"], "소유자 분리는 주택(housing) 또는 건물(building) 자산에만 적용됩니다");
  }
}
