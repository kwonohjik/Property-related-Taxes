/**
 * 기타토지 §168의11① **호 메타데이터 단일 표** (NBL2611-V7-S · R18 · Q-5 (나) · Q-6 (다)).
 *
 * 호 · 요건 · 면적 산식 · 근거 조문 · 필요 입력 · 자동 검증 가능 여부를 이 표 하나에 둔다. 종전에는 같은 호 목록이
 * union · ⑫ enum · UI 옵션 · UI 근거 · 면적 switch · 근거 switch · ⑧ 일곱 곳에 따로 있어, 호가 빠져도(1호다·라·3·8·9·11호가·나)
 * 자유 문자열이 엔진까지 가도 드러나지 않았다. 이제 아래가 모두 이 표에서 나온다.
 *   · 호 목록 union의 커버리지 — `satisfies Record<NblRelatedBusinessType, …>`(호가 union에만 있거나 표에만 있으면 컴파일 오류)
 *   · ⑫ Zod enum (`NBL_RELATED_BUSINESS_TYPE_VALUES`) · UI 선택지(라벨·설명·근거 모달) · 결과 근거(`resolveAreaLegalBasis`)
 *   · ⑧·⑫의 «면적 인자 필수» (`hoRequiredInputIssue`) · 결과의 «자기 선언 요건 — 확인 필요» 고지
 *   · 엔진 면적 switch의 «면적기준 없는 호» 목록(`UnlimitedHo`) — 면적 산식이 있는 호를 표에 넣고 switch에 빠뜨리면 컴파일 오류
 *
 * `verification`:
 *   · partial          엔진이 일부 요건(면적·용도지역·나지·기간)을 판정하고 나머지는 자기 선언 — 고지로 남긴다
 *   · self_declared    엔진이 판정하는 요건이 없다(면적기준도 없다) — 선택하면 전량 사업용이므로 요건 전부를 «확인 필요»로 남긴다
 *   · not_recognized   14호 — 위임 규칙 항이 없어 사업용으로 인정하지 않는다
 *   · not_applicable   「해당 없음」
 *
 * 순수 함수·데이터 — DB를 부르지 않는다.
 */
import { NBL } from "../legal-codes";
import { NBL_RESERVE_FORCES_SELF_DECLARED_NOTICE, NBL_VACANT_LOT_SELF_DECLARED_NOTICE } from "../nbl-confirm-notices";
import type { NblRelatedBusinessType } from "./land-usage.types";

export type HoVerification = "partial" | "self_declared" | "not_recognized" | "not_applicable";

export interface HoRequiredInput {
  /** AssetForm 키 = ⑫ raw 키 (④가 `nbl*`를 prefix-pick으로 그대로 운반한다) */
  field: string;
  kind: "positive_number" | "date";
  /** 라벨 접두("자산: ")를 뺀 안내 문구 — ⑧·⑫ 공용 */
  message: string;
}

export interface OtherLandHoMeta {
  /** 조문 위치 — 「영 §168의11①N호」 */
  hoLabel: string;
  /** 라디오 선택지 */
  option: { label: string; description: string; testId: string };
  /** 법문 요건 요약(영 §168의11①·규칙 §83조의4 본문 표현) */
  requirement: string;
  /** 면적 산식. `limited:false`면 면적기준이 없다(전량 사업용 — 요건은 자기 선언). */
  area: { limited: boolean; formula: string };
  /** 결과 근거(단계 legalBasis) */
  legalBasis: string;
  /** UI 법령 모달 (없으면 링크 없음) */
  law?: { legalBasis: string; label: string };
  /** ⑧·⑫가 요구하는 단순 필수 입력 (복합 호 — sports·reserve_forces·resort — 는 각자의 전용 검증) */
  requiredInput?: HoRequiredInput;
  verification: HoVerification;
  /** 호를 인정해 판정에 쓸 때 결과에 남기는 «자기 선언 요건 — 확인 필요» */
  selfDeclaredNotice?: string;
}

/** 자기 선언 요건 고지 문구 — 호 하나에서 엔진이 판정하지 않는 요건을 «확인 필요»로 남긴다. */
function selfDeclared(basis: string, name: string, items: readonly string[]): string {
  return `${basis}(${name})의 요건 중 ${items.join(" · ")}은(는) 판정하지 않았습니다 — 자기 선언 요건, 확인 필요.`;
}

export const OTHER_LAND_HO_META = {
  none: {
    hoLabel: "해당 없음",
    option: { label: "해당 없음", description: "§168의11① 호에 해당하지 않음 (재산세 유형·기간기준만 판정)", testId: "nbl-other-related-none" },
    requirement: "—",
    area: { limited: false, formula: "—" },
    legalBasis: NBL.OTHER_LAND_BUSINESS,
    verification: "not_applicable",
  },
  sports: {
    hoLabel: "영 §168의11①1호 가목·나목",
    option: {
      label: "체육시설 (1호 가·나목)",
      description: "종목·종업원수로 별표3·4·5 기준면적 자동산출 (미선택 시 직접입력) · 직장운동경기부 설치·선수 요건, 종업원 체육시설 기준은 직접 확인",
      testId: "nbl-other-related-sports",
    },
    requirement: "선수전용 체육시설(직장운동경기부·운동경기업)·종업원 체육시설용 토지로서 규칙 별표3·4·5 기준면적 이내",
    area: { limited: true, formula: "별표3(선수전용)·별표4(운동경기업)·별표5(종업원) 종목합산 + 비고 가산 · 실내는 바닥면적과 표값 중 작은 면적 × 용도지역 배율" },
    legalBasis: NBL.OTHER_LAND_AREA_SPORTS,
    law: { legalBasis: "소득세법 시행령 §168의11①1호", label: "§168의11①1호" },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 1호`, "체육시설용 토지", [
      "가목(1) 「국민체육진흥법」에 따른 직장운동경기부 설치·선수전용 계속 제공과 선수·지도자 요건(소득세법 시행규칙 제83조의4 ②)",
      "가목(2) 운동경기업 영위자의 선수훈련 직접 사용",
      "나목 종업원 체육시설의 기준(같은 조 ⑤)",
    ]),
  },
  sports_facility_business: {
    hoLabel: "영 §168의11①1호 다목",
    option: {
      label: "체육시설업 직접 사용 토지 (1호 다목)",
      description: "「체육시설의 설치·이용에 관한 법률」에 따른 체육시설업을 영위하는 자가 같은 법의 적합한 시설·설비를 갖추고 그 사업에 직접 사용하는 토지 (면적기준 없음 · 요건은 직접 확인)",
      testId: "nbl-other-related-sports_facility_business",
    },
    requirement: "「체육시설의 설치·이용에 관한 법률」에 따른 체육시설업을 영위하는 자가 동법의 규정에 따른 적합한 시설 및 설비를 갖추고 당해 사업에 직접 사용하는 토지",
    area: { limited: false, formula: "면적기준 없음 — 직접 사용하는 토지 전량" },
    legalBasis: NBL.OTHER_LAND_HO_SPORTS_FACILITY_BIZ,
    law: { legalBasis: "소득세법 시행령 §168의11①1호다목", label: "§168의11①1호다목" },
    verification: "self_declared",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_SPORTS_FACILITY_BIZ, "체육시설업", [
      "「체육시설의 설치·이용에 관한 법률」에 따른 체육시설업 영위",
      "같은 법의 규정에 따른 적합한 시설 및 설비를 갖출 것",
      "당해 사업에 직접 사용할 것",
    ]),
  },
  stadium_operation: {
    hoLabel: "영 §168의11①1호 라목",
    option: {
      label: "경기장운영업 직접 사용 토지 (1호 라목)",
      description: "경기장운영업을 영위하는 자가 그 사업에 직접 사용하는 토지 (면적기준 없음 · 업종은 한국표준산업분류 기준 · 요건은 직접 확인)",
      testId: "nbl-other-related-stadium_operation",
    },
    requirement: "경기장운영업을 영위하는 자가 당해 사업에 직접 사용하는 토지",
    area: { limited: false, formula: "면적기준 없음 — 직접 사용하는 토지 전량" },
    legalBasis: NBL.OTHER_LAND_HO_STADIUM,
    law: { legalBasis: "소득세법 시행령 §168의11①1호라목", label: "§168의11①1호라목" },
    verification: "self_declared",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_STADIUM, "경기장운영업", [
      "경기장운영업 영위(업종 분류는 영 §168조의11 ⑦의 한국표준산업분류)",
      "당해 사업에 직접 사용할 것",
    ]),
  },
  parking_attached: {
    hoLabel: "영 §168의11①2호 가목",
    option: { label: "부설주차장 (2호 가목)", description: "「주차장법」 부설주차장 설치기준면적 이내까지 사업용 (주택의 부설주차장은 제외 · 직접 확인)", testId: "nbl-other-related-parking_attached" },
    requirement: "「주차장법」에 따른 부설주차장(주택의 부설주차장 제외)으로서 설치기준면적 이내의 토지",
    area: { limited: true, formula: "설치기준면적(직접입력) 이내" },
    legalBasis: NBL.OTHER_LAND_AREA_PARKING,
    law: { legalBasis: "소득세법 시행령 §168의11①2호가목", label: "§168의11①2호가목" },
    requiredInput: {
      field: "nblOtherStandardAreaLimit",
      kind: "positive_number",
      message: "선택한 호의 기준면적(㎡)을 입력하세요. (§168의11① 별표·설치기준면적)",
    },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 2호 가목`, "부설주차장", [
      "「주차장법」에 따른 부설주차장일 것",
      "주택의 부설주차장이 아닐 것",
    ]),
  },
  parking_garage: {
    hoLabel: "영 §168의11①2호 나목",
    option: { label: "업무용자동차 주차장 (2호 나목)", description: "최저차고기준면적 × 1.5까지 사업용 (업무용자동차를 필수적으로 보유하는 사업은 직접 확인)", testId: "nbl-other-related-parking_garage" },
    requirement: "「지방세법 시행령」 제101조제3항제1호에 따른 사업자 외의 자로서 업무용자동차(승용·이륜·통근용 승합 제외)를 필수적으로 보유하여야 하는 사업에 제공되는 주차장용 토지, 최저차고기준면적 × 1.5 이내",
    area: { limited: true, formula: "최저차고기준면적(직접입력) × 1.5 이내" },
    legalBasis: NBL.OTHER_LAND_AREA_GARAGE,
    law: { legalBasis: "소득세법 시행령 §168의11①2호나목", label: "§168의11①2호나목" },
    requiredInput: {
      field: "nblOtherMinGarageArea",
      kind: "positive_number",
      message: "업무용자동차 주차장 — 최저차고기준면적(㎡)을 입력하세요. (§168의11①2호나목)",
    },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 2호 나목`, "업무용자동차 주차장", [
      "「지방세법 시행령」 제101조제3항제1호에 따른 사업자 외의 자일 것",
      "업무용자동차(승용자동차·이륜자동차·종업원 통근용 승합자동차 제외)를 필수적으로 보유하여야 하는 사업에 제공될 것",
    ]),
  },
  private_investment_land: {
    hoLabel: "영 §168의11①3호",
    option: {
      label: "민간투자사업 등 조성 토지 (3호)",
      description: "「사회기반시설에 대한 민간투자법」 사업시행자가 민간투자사업으로 조성한 토지, 또는 그 밖의 법률에 따라 사업시행자가 조성한 토지(경제자유구역·관광단지·기업도시·물류단지·중소기업 단지조성 — 규칙 §83조의4⑦). 조성 완료일부터 2년까지만 사업용 · 사업시행자 요건은 직접 확인",
      testId: "nbl-other-related-private_investment_land",
    },
    requirement: "「사회기반시설에 대한 민간투자법」에 따라 지정된 사업시행자가 민간투자사업의 시행으로 조성한 토지 및 그 밖의 법률에 따라 사업시행자가 조성하는 토지로서 재정경제부령이 정하는 토지(규칙 §83조의4⑦). 다만 토지의 조성이 완료된 날부터 2년이 경과한 토지는 제외",
    area: { limited: false, formula: "면적기준 없음 — 조성 완료일부터 2년 구간만 사업용 기간으로 센다" },
    legalBasis: NBL.OTHER_LAND_HO_PRIVATE_INVEST,
    law: { legalBasis: "소득세법 시행령 §168의11①3호", label: "§168의11①3호" },
    requiredInput: {
      field: "nblOtherPrivateInvestCompletionDate",
      kind: "date",
      message: "민간투자사업 등 조성 토지(3호) — 토지 조성 완료일을 입력하세요. 조성이 완료된 날부터 2년이 경과한 토지는 제외되므로(영 §168조의11 ① 3호 단서) 완료일이 없으면 사업용 기간을 정할 수 없습니다.",
    },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_PRIVATE_INVEST, "민간투자사업 등 조성 토지", [
      "「사회기반시설에 대한 민간투자법」에 따라 지정된 사업시행자가 민간투자사업의 시행으로 조성한 토지일 것(또는 그 밖의 법률에 따라 사업시행자가 조성한 토지로서 소득세법 시행규칙 제83조의4 ⑦ 각 호의 토지일 것)",
    ]),
  },
  youth_training: {
    hoLabel: "영 §168의11①4호",
    option: { label: "청소년수련시설 (4호)", description: "수용정원 × 200㎡까지 사업용 (「청소년활동진흥법」 시설·설비기준은 직접 확인)", testId: "nbl-other-related-youth_training" },
    requirement: "「청소년활동진흥법」에 따른 청소년수련시설용 토지로서 같은 법에 따른 시설·설비기준을 갖춘 토지, 수용정원 × 200㎡ 이내",
    area: { limited: true, formula: "수용정원 × 200㎡ 이내" },
    legalBasis: NBL.OTHER_LAND_AREA_YOUTH,
    law: { legalBasis: "소득세법 시행규칙 §83의4⑧", label: "§83의4⑧(4호)" },
    requiredInput: {
      field: "nblOtherYouthCapacity",
      kind: "positive_number",
      message: "청소년수련시설 — 수용정원(명)을 입력하세요. (§168의11①4호)",
    },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 4호`, "청소년수련시설", [
      "「청소년활동진흥법」에 따른 청소년수련시설용 토지일 것",
      "같은 법에 따른 시설·설비기준을 갖출 것",
    ]),
  },
  reserve_forces: {
    hoLabel: "영 §168의11①5호",
    option: {
      label: "예비군훈련시설 (5호 다목)",
      description: "부대편성인원·시설로 별표6 제2호 기준면적 자동산출 (미선택 시 직접입력). 도시지역 주·상·공 지역 안은 불인정(나목) · 지목(대지·공장용지 아님)·시설기준·수임 군부대 소유(라목)는 직접 확인",
      testId: "nbl-other-related-reserve_forces",
    },
    requirement: "종업원 등의 예비군훈련을 실시하기 위하여 소유하는 토지로서 가목(지목이 대지·공장용지 아님)·나목(도시지역 주·상·공 지역 밖)·다목(시설기준·기준면적 이내)·라목(수임 군부대로부터 위임받은 자가 소유)을 모두 갖춘 토지",
    area: { limited: true, formula: "별표6 제2호 — 부대편성인원 × 시설 합산 (미선택 시 직접입력)" },
    legalBasis: NBL.OTHER_LAND_AREA_RESERVE,
    law: { legalBasis: "소득세법 시행규칙 §83의4⑩", label: "§83의4⑩(5호다목)" },
    verification: "partial",
    selfDeclaredNotice: NBL_RESERVE_FORCES_SELF_DECLARED_NOTICE,
  },
  resort: {
    hoLabel: "영 §168의11①6호",
    option: {
      label: "휴양시설업 (6호)",
      description: "옥외시설·부설주차장·건축물 3요소 — 부설주차장·건축물은 상한(설치기준면적 × 2 · 바닥면적 × 배율) 이내의 실제 면적을 합산 (미입력 시 직접입력) · 「관광진흥법」 전문휴양업·종합휴양업 등(온천장용 토지 제외)은 직접 확인",
      testId: "nbl-other-related-resort",
    },
    requirement: "「관광진흥법」에 따른 전문휴양업·종합휴양업 그 밖에 이와 유사한 시설을 갖추고 타인의 휴양이나 여가선용을 위하여 이용하게 하는 사업용 토지(온천장용 토지 제외)로서 규칙 §83조의4⑫의 기준면적 이내",
    area: { limited: true, formula: "옥외 방목장·식물원 면적 + (실제 부설주차장과 설치기준면적 × 2 중 작은 면적) + (실제 건축물 부속토지와 바닥면적 × §101② 배율 중 작은 면적)" },
    legalBasis: NBL.OTHER_LAND_AREA_RESORT,
    law: { legalBasis: "소득세법 시행규칙 §83의4⑫", label: "§83의4⑫(6호)" },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 6호`, "휴양시설업", [
      "「관광진흥법」에 따른 전문휴양업·종합휴양업 그 밖에 이와 유사한 시설을 갖추고 타인의 휴양이나 여가선용을 위하여 이용하게 하는 사업용 토지일 것(온천장용 토지는 제외 — 소득세법 시행규칙 제83조의4 ⑪)",
    ]),
  },
  hatchang: {
    hoLabel: "영 §168의11①7호",
    option: { label: "하치장·야적장·적치장 (7호)", description: "매년 최대 사용면적 × 120%까지 사업용 (물품 보관·관리를 위해 별도로 설치·사용되는 시설인지는 직접 확인)", testId: "nbl-other-related-hatchang" },
    requirement: "물품의 보관·관리를 위하여 별도로 설치·사용되는 하치장·야적장·적치장 등으로서 매년 물품의 보관·관리에 사용된 최대면적의 100분의 120 이내의 토지",
    area: { limited: true, formula: "매년 최대 사용면적 × 1.2 이내" },
    legalBasis: NBL.OTHER_LAND_AREA_HATCHANG,
    law: { legalBasis: "소득세법 시행령 §168의11①7호", label: "§168의11①7호" },
    requiredInput: {
      field: "nblOtherMaxAnnualArea",
      kind: "positive_number",
      message: "하치장 — 매년 최대 사용면적(㎡)을 입력하세요. (§168의11①7호)",
    },
    verification: "partial",
    selfDeclaredNotice: selfDeclared(`${NBL.OTHER_LAND_BUSINESS} 7호`, "하치장·야적장·적치장", [
      "물품의 보관·관리를 위하여 별도로 설치·사용되는 하치장·야적장·적치장 등일 것",
      "매년 물품의 보관·관리에 사용된 최대면적",
    ]),
  },
  aggregate_extraction: {
    hoLabel: "영 §168의11①8호",
    option: {
      label: "골재채취장 (8호)",
      description: "「골재채취법」에 따라 시장·군수·구청장의 골재채취 허가를 받은 자가 허가받은 바에 따라 골재채취에 사용하는 토지 (면적기준 없음 · 요건은 직접 확인)",
      testId: "nbl-other-related-aggregate_extraction",
    },
    requirement: "「골재채취법」에 따라 시장·군수 또는 구청장(자치구의 구청장에 한한다)으로부터 골재채취의 허가를 받은 자가 허가받은 바에 따라 골재채취에 사용하는 토지",
    area: { limited: false, formula: "면적기준 없음 — 허가받은 바에 따라 사용하는 토지 전량" },
    legalBasis: NBL.OTHER_LAND_HO_AGGREGATE,
    law: { legalBasis: "소득세법 시행령 §168의11①8호", label: "§168의11①8호" },
    verification: "self_declared",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_AGGREGATE, "골재채취장", [
      "「골재채취법」에 따라 시장·군수·구청장으로부터 골재채취의 허가를 받았을 것",
      "허가받은 바에 따라 골재채취에 사용할 것",
    ]),
  },
  waste_treatment: {
    hoLabel: "영 §168의11①9호",
    option: {
      label: "폐기물처리업 (9호)",
      description: "「폐기물관리법」에 따라 허가를 받아 폐기물처리업을 영위하는 자가 그 사업에 사용하는 토지 (면적기준 없음 · 요건은 직접 확인)",
      testId: "nbl-other-related-waste_treatment",
    },
    requirement: "「폐기물관리법」에 따라 허가를 받아 폐기물처리업을 영위하는 자가 당해 사업에 사용하는 토지",
    area: { limited: false, formula: "면적기준 없음 — 당해 사업에 사용하는 토지 전량" },
    legalBasis: NBL.OTHER_LAND_HO_WASTE,
    law: { legalBasis: "소득세법 시행령 §168의11①9호", label: "§168의11①9호" },
    verification: "self_declared",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_WASTE, "폐기물처리업", [
      "「폐기물관리법」에 따라 허가를 받아 폐기물처리업을 영위할 것",
      "당해 사업에 사용할 것",
    ]),
  },
  fish_farm_licensed: {
    hoLabel: "영 §168의11①11호 가목·나목",
    option: {
      label: "허가·면허·신고 양어장·지소 (11호 가·나목)",
      description: "육상해수양식업·수산종자생산업 허가(가목) 또는 면허·허가·신고어업(나목)에 사용하는 양어장·지소용 토지 (면적기준 없음 · 요건은 직접 확인). 가·나목 밖의 토지는 아래 수입금액비율(다목 4%)",
      testId: "nbl-other-related-fish_farm_licensed",
    },
    requirement: "양어장 또는 지소용 토지로서 가목(「양식산업발전법」 제43조제1항제1호 허가 육상해수양식업·「수산종자산업육성법」 허가 수산종자생산업에 사용) 또는 나목(「내수면어업법」·「양식산업발전법」에 따라 면허·허가를 받거나 신고한 자가 당해 면허어업·허가어업·신고어업에 사용)에 해당하는 토지",
    area: { limited: false, formula: "면적기준 없음 — 허가·면허·신고받은 사업에 사용하는 토지 전량 (다목은 수입금액비율 경로)" },
    legalBasis: NBL.OTHER_LAND_HO_FISH_FARM,
    law: { legalBasis: "소득세법 시행령 §168의11①11호", label: "§168의11①11호" },
    verification: "self_declared",
    selfDeclaredNotice: selfDeclared(NBL.OTHER_LAND_HO_FISH_FARM, "양어장·지소", [
      "「공간정보의 구축 및 관리 등에 관한 법률」에 따른 양어장 또는 지소용 토지일 것",
      "가목: 「양식산업발전법」 제43조제1항제1호에 따라 허가를 받은 육상해수양식업 또는 「수산종자산업육성법」에 따라 허가를 받은 수산종자생산업에 사용될 것",
      "나목: 「내수면어업법」·「양식산업발전법」에 따라 면허·허가를 받거나 신고한 자가 당해 면허어업·허가어업·신고어업에 사용할 것",
    ]),
  },
  vacant_lot_1household: {
    hoLabel: "영 §168의11①13호",
    option: {
      label: "무주택1세대 1필지 나지 (13호)",
      description: "건축물 없는 나지만 660㎡ 이내까지 사업용 · 양도일 현재 건축물이 있으면 이 호로 인정하지 않습니다(소유기간 중 건축물이 없던 구간은 이력 입력 시 적용) · 무주택 1세대·1필지·주택 신축 가능 여부는 직접 확인",
      testId: "nbl-other-related-vacant_lot",
    },
    requirement: "주택을 소유하지 아니하는 1세대가 소유하는 1필지의 나지(제1호~제12호에 해당하지 아니하는 토지로서 어느 용도로도 사용되고 있지 아니한 토지)로서 주택 신축 가능 여부 등 규칙 기준에 해당하는 토지, 660㎡ 이내",
    area: { limited: true, formula: "660㎡ 이내" },
    legalBasis: NBL.OTHER_LAND_AREA_VACANT_LOT,
    law: { legalBasis: "소득세법 시행령 §168의11①13호", label: "§168의11①13호" },
    verification: "partial",
    selfDeclaredNotice: NBL_VACANT_LOT_SELF_DECLARED_NOTICE,
  },
  etc_14호: {
    hoLabel: "영 §168의11①14호",
    option: {
      label: "기타 거주 및 사업관련 토지 (14호)",
      description: "제1~13호와 유사한 토지로서 재정경제부령이 정하는 토지 — 소득세법 시행규칙 §83조의4에 14호를 정한 항이 없어 선택해도 사업용으로 인정하지 않습니다 (확인 필요)",
      testId: "nbl-other-related-etc14",
    },
    requirement: "제1호부터 제13호까지에서 규정한 토지와 유사한 토지 중 토지의 이용 상황, 관계 법령의 이행여부 등을 고려하여 사업과 직접 관련이 있다고 인정할 만한 토지로서 재정경제부령으로 정하는 토지",
    area: { limited: false, formula: "—" },
    legalBasis: NBL.OTHER_LAND_HO_ETC14,
    law: { legalBasis: "소득세법 시행령 §168의11①14호", label: "§168의11①14호" },
    verification: "not_recognized",
    selfDeclaredNotice: undefined,
  },
} as const satisfies Record<NblRelatedBusinessType, OtherLandHoMeta>;

/** 호 id 목록(선택지 순서 = 표 순서 = 조문 순서) — ⑫ Zod enum의 단일 소스 */
export const OTHER_LAND_HO_IDS = Object.keys(OTHER_LAND_HO_META) as [NblRelatedBusinessType, ...NblRelatedBusinessType[]];

/**
 * 면적기준이 없는 호 — 엔진 면적 switch(`resolveAreaLimitRaw`)가 `undefined`를 돌려줘도 되는 호.
 * 표에서 `area.limited`가 `true`인 호를 switch에 빠뜨리면 switch 끝의 exhaustive 대입이 컴파일 오류가 된다.
 */
export type UnlimitedHo = {
  [K in NblRelatedBusinessType]: (typeof OTHER_LAND_HO_META)[K]["area"]["limited"] extends true ? never : K;
}[NblRelatedBusinessType];

/** 호별 결과 근거 — 미설정·해당 없음은 §168의11① 총칙 */
export function otherLandHoLegalBasis(t: NblRelatedBusinessType | undefined): string {
  return t === undefined ? NBL.OTHER_LAND_BUSINESS : OTHER_LAND_HO_META[t].legalBasis;
}

export interface HoRequiredInputIssue {
  field: string;
  message: string;
}

/**
 * ⑧·⑫ 공용 — 선택한 호의 단순 필수 입력(표 `requiredInput`)이 비었는지.
 * 값은 문자열(폼·raw 공통). 숫자는 0 이하·해석 불가, 날짜는 `YYYY-MM-DD` 형식이 아니면 비었다고 본다.
 */
export function hoRequiredInputIssue(
  ho: string | undefined,
  read: (field: string) => string | undefined,
  parseDecimal: (v: string | undefined) => number,
): HoRequiredInputIssue | undefined {
  if (!ho || !(ho in OTHER_LAND_HO_META)) return undefined;
  const req = (OTHER_LAND_HO_META[ho as NblRelatedBusinessType] as OtherLandHoMeta).requiredInput;
  if (!req) return undefined;
  const raw = read(req.field);
  const ok = req.kind === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(raw ?? "") : parseDecimal(raw) > 0;
  return ok ? undefined : { field: req.field, message: req.message };
}
