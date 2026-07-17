/**
 * 상속세·증여세 비과세·과세가액 불산입 룰 정의
 * (상속: 상증법 §12·§16·§17 / 증여: §46 비과세·§52의2 장애인신탁 불산입)
 *
 * 상속세 비과세·과세가액 불산입 8종:
 *   1. 국가·지자체·공공단체 유증 재산 (§12 1호, 상증령 §8①)
 *   2. 금양임야 (§12 3호 — 민법 §1008의3·상증령 §8③1호) — 면적 한도
 *   3. 묘토 (§12 3호 — 상증령 §8③2호) — 면적 한도
 *   4. 족보·제구 (§12 3호 — 상증령 §8③3호)
 *   5. 공익법인 출연 재산 (§16 과세가액 불산입) — 특수관계법인 주식 한도 주의
 *   6. 공익신탁 출연 재산 (§17 과세가액 불산입)
 *   7. 이재구호금품·치료비 (§12 6호 — 상증령 §8⑤)
 *   8. 정당 유증 재산 (§12 4호)
 *
 *   ※ 문화유산은 §12 비과세 대상 아님 (구 §12 2호 삭제) — 상증법 §74 징수유예로 처리
 *
 * 증여세 비과세 8종 (§46 비과세·§52의2 장애인신탁 과세가액 불산입):
 *   1. 생활비·교육비·치료비 (§46 5호)
 *   2. 축의금·부의금 (§46 5호)
 *   3. 혼수품 (§46 5호)
 *   4. 장학금 (§46 4호)
 *   5. 이재구호금품 (§46 2호)
 *   6. 국가유공자 보훈급여 (§46 6호)
 *   7. 공익신탁 이익 (§46 1호)
 *   8. 장애인 신탁 (§52의2) — 5억 한도 (생존 중 평생 합산)
 */

import { EXEMPTION } from "./legal-codes";

// ============================================================
// 데이터 구조
// ============================================================

/** 비과세 항목 카테고리 */
export type ExemptionCategory = "inheritance" | "gift";

/** 한도 타입 */
export type LimitType =
  | "unlimited"    // 한도 없음 (전액)
  | "fixed"        // 고정 금액 한도
  | "social_norm"  // 사회통념상 한도 (금액 미정)
  | "area";        // 면적 한도 (토지)

/** 사후관리·추징 리스크 수준 */
export type RiskLevel = "none" | "low" | "medium" | "high";

/**
 * 과세상 취급 구분 — 비과세 vs 과세가액 불산입.
 * 법령상 별개 개념이므로 UI에서 섹션을 분리한다.
 *   - "non_taxable": 비과세 (상속 §11·§12 / 증여 §46), 장애인신탁 과세가액 불산입(§52의2)
 *   - "not_included": 과세가액 불산입 (상속 §16 공익법인 출연·§17 공익신탁 / 증여 §48 등)
 * 미지정 시 "non_taxable"로 간주.
 */
export type ExemptionTreatment = "non_taxable" | "not_included";

/** 비과세 룰 정의 */
export interface ExemptionRule {
  id: string;
  category: ExemptionCategory;
  name: string;
  lawRef: string;
  description: string;
  /** 과세상 취급 (비과세 / 과세가액 불산입). 미지정 시 "non_taxable". */
  taxTreatment?: ExemptionTreatment;
  limitType: LimitType;
  /** 한도 금액 (limitType=fixed 시) */
  limitAmount?: number;
  /** 면적 한도 (㎡, limitType=area 시) */
  limitAreaM2?: number;
  /** 사후관리 추징 리스크 */
  riskLevel: RiskLevel;
  /** 추징 리스크 설명 */
  riskNote?: string;
  /** 적용 요건 (UI 체크리스트용) */
  requirements: string[];
  /** 적용 제외 사유 (경계 케이스) */
  exclusions: string[];
}

// ============================================================
// 상속세 비과세 룰 8종
// ============================================================

export const INHERITANCE_EXEMPTION_RULES: ExemptionRule[] = [
  {
    id: "inh_state_bequest",
    category: "inheritance",
    name: "국가·지자체 유증 재산",
    lawRef: EXEMPTION.INH_NONTAXABLE, // §12 1호 (상증령 §8①)
    description: "유언으로 국가·지방자치단체·법정기부금 단체에 귀속되는 재산",
    limitType: "unlimited",
    riskLevel: "low",
    riskNote: "유증 조건부(반환 가능)이면 과세로 전환",
    requirements: [
      "유언으로 국가·지자체·공공기관에 귀속",
      "귀속이 확정된 재산",
    ],
    exclusions: [
      "조건부 유증(반환 가능성 있는 경우)",
      "사실상 가족에게 귀속되는 형식적 유증",
    ],
  },
  // ※ 문화유산(구 §12 2호)은 2008.1.1. 삭제 — 현행법상 상속세 비과세 대상 아님.
  //    지정문화유산·국가등록문화유산 등은 §74 징수유예로 처리(inheritance-cultural-heritage-deferral.ts).
  {
    id: "inh_forest_burial",
    category: "inheritance",
    name: "금양임야 (禁養林野)",
    lawRef: EXEMPTION.INH_NONTAXABLE,
    description: "피상속인이 제사를 모시던 선조 분묘에 속한 임야 (상증령 §8③1호)",
    limitType: "area",
    limitAreaM2: EXEMPTION.GRAVE_FOREST_LIMIT_M2,
    riskLevel: "medium",
    riskNote: "9,900㎡ 초과분은 일반 상속재산으로 과세. 금양임야+묘토 합산 2억원 한도 (상증령 §8③ 단서)",
    requirements: [
      "피상속인이 제사를 주재하던 선조 분묘에 속한 금양임야 (피상속인 소유 상속재산)",
      "제사를 주재하는 상속인이 승계 (상증령 §8③1호·민법 §1008의3)",
      "분묘에 속한 9,900㎡ 이내",
    ],
    exclusions: [
      "9,900㎡ 초과분 (일반 상속재산으로 과세)",
      "제사·봉안과 무관한 임야",
    ],
  },
  {
    id: "inh_grave_land",
    category: "inheritance",
    name: "묘토 (墓土)",
    lawRef: EXEMPTION.INH_NONTAXABLE,
    description: "선조 분묘에 속한 묘토인 농지 (상증령 §8③2호)",
    limitType: "area",
    limitAreaM2: EXEMPTION.GRAVE_LAND_LIMIT_M2,
    riskLevel: "medium",
    riskNote: "1,980㎡ 초과분 및 분묘 없는 농지는 과세. 금양임야+묘토 합산 2억원 한도 (상증령 §8③ 단서)",
    requirements: [
      "선조 분묘가 실제 존재하는 토지",
      "제사·봉안 목적으로 사용",
    ],
    exclusions: [
      "분묘가 없는 농지",
      "묘토가 아닌(제사·봉사 목적 외) 농지",
    ],
  },
  {
    id: "inh_ritual_items",
    category: "inheritance",
    name: "족보·제구 (族譜·祭具)",
    lawRef: EXEMPTION.INH_NONTAXABLE,
    description: "가문 족보, 제사용 제기류 등 (상증령 §8③3호)",
    limitType: "fixed",
    limitAmount: EXEMPTION.RITUAL_AMOUNT_LIMIT,
    riskLevel: "none",
    riskNote: "1천만원 초과분은 일반 상속재산으로 과세 (상증령 §8③3호 단서)",
    requirements: ["가문 족보 또는 제사용 제기류임이 확인됨"],
    exclusions: ["고가 골동품으로 판매 목적인 경우"],
  },
  {
    id: "inh_public_interest",
    category: "inheritance",
    name: "공익법인 출연 재산",
    lawRef: EXEMPTION.PUBLIC_INTEREST,
    description: "공익법인(사회복지·학교·의료법인 등)에 출연한 재산 (§16 과세가액 불산입)",
    taxTreatment: "not_included",
    limitType: "unlimited",
    riskLevel: "high",
    riskNote: "특수관계법인 주식 5% 초과 보유 시 초과분 과세; 3년 내 공익 외 사용 시 추징 (§48)",
    requirements: [
      "공익법인(§16 ①에 열거)에 출연",
      "출연 재산이 공익 목적에 사용",
      "특수관계법인 주식 보유 비율 5%(성실공익법인 10%) 이내",
    ],
    exclusions: [
      "특수관계법인 주식 5% 초과 보유 부분",
      "공익 외 목적 사용 시",
      "3년 이내 공익 사용 의무 미이행 시",
    ],
  },
  {
    id: "inh_public_trust",
    category: "inheritance",
    name: "공익신탁 출연 재산",
    lawRef: EXEMPTION.PUBLIC_TRUST, // §17
    description:
      "「공익신탁법」에 따른 공익신탁(종교·자선·학술 등)을 통해 공익법인등에 출연하는 재산 (§17) — 과세가액 불산입",
    taxTreatment: "not_included",
    limitType: "unlimited",
    riskLevel: "medium",
    riskNote:
      "공익신탁의 범위·운영·출연시기 요건(§17② 시행령 위임) 미충족 시 불산입 배제. 공익 외 사용·신탁 종료 시 사후관리 대상",
    requirements: [
      "「공익신탁법」에 따른 공익신탁일 것",
      "종교·자선·학술 또는 그 밖의 공익을 목적으로 할 것",
      "공익신탁을 통하여 공익법인등에 출연하는 재산일 것",
    ],
    exclusions: [
      "「공익신탁법」상 공익신탁이 아닌 신탁",
      "공익 외 목적 신탁",
    ],
  },
  {
    id: "inh_disaster_relief",
    category: "inheritance",
    name: "이재구호금품·치료비",
    lawRef: EXEMPTION.INH_NONTAXABLE,
    description: "재해 피해자 구호금품 및 장애인이 직접 사용하는 치료비성 재산",
    limitType: "social_norm",
    riskLevel: "low",
    requirements: [
      "재해 피해 사실 확인",
      "실제 치료비 또는 구호 목적으로 사용",
    ],
    exclusions: ["치료 외 목적에 전용된 금액"],
  },
  {
    id: "inh_political_party",
    category: "inheritance",
    name: "정당 유증 재산",
    lawRef: EXEMPTION.INH_NONTAXABLE,
    description: "정치자금법상 정당에 유증된 재산 (§12 4호)",
    limitType: "unlimited",
    riskLevel: "none",
    requirements: ["정치자금법상 적법한 정당에 유증"],
    exclusions: ["정당 외 정치단체 유증"],
  },
];

// ============================================================
// 증여세 비과세 룰 8종
// ============================================================

/** 장애인 신탁 과세가액 불산입 한도 (§52의2③): 5억원 (생존 중 평생 합산) */
export const DISABLED_TRUST_LIMIT = 500_000_000;

export const GIFT_EXEMPTION_RULES: ExemptionRule[] = [
  {
    id: "gift_living_cost",
    category: "gift",
    name: "생활비·교육비·치료비",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "수증자가 실제 생활·교육·치료에 직접 지출한 금액 (§46 5호)",
    limitType: "social_norm",
    riskLevel: "medium",
    riskNote: "받은 돈을 예금·주식 등 재산 증식에 사용 시 즉시 과세 전환",
    requirements: [
      "수증자가 실제 생활·교육·치료 목적으로 지출",
      "사용처가 명확하게 확인 가능",
    ],
    exclusions: [
      "예금·적금·주식 매수에 사용한 금액",
      "부동산 취득에 사용한 금액",
      "사회통념상 과다한 금액",
    ],
  },
  {
    id: "gift_congratulatory",
    category: "gift",
    name: "축의금·부의금",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "혼례·장례 등에서 사회통념상 인정되는 축의금·부의금 (§46 5호)",
    limitType: "social_norm",
    riskLevel: "low",
    riskNote: "가족 재산 수준 대비 과다한 경우 증여세 과세 가능",
    requirements: [
      "혼례·장례 등 관련 행사 존재",
      "사회통념상 적정 금액 범위",
    ],
    exclusions: [
      "사회통념상 과다한 고액 축의금·부의금",
      "행사와 무관한 명목 축의금",
    ],
  },
  {
    id: "gift_wedding_gifts",
    category: "gift",
    name: "혼수품",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "혼인에 필요한 사회통념상 혼수 용품 (§46 5호)",
    limitType: "social_norm",
    riskLevel: "medium",
    riskNote: "고가 단독 물품(수억대 자동차·명품 등)은 증여세 과세 대상",
    requirements: [
      "혼인과 직접 관련된 혼수 용품",
      "사회통념상 필요한 범위 내 물품",
    ],
    exclusions: [
      "고가 자동차·귀금속·명품 단독 증여",
      "투자·재산 증식 목적 물품",
    ],
  },
  {
    id: "gift_scholarship",
    category: "gift",
    name: "장학금·학자금",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "비영리법인·장학재단 등에서 지급하는 장학금 (§46 4호)",
    limitType: "unlimited",
    riskLevel: "low",
    requirements: [
      "비영리법인·국가·지자체·장학재단 지급",
      "학업 목적으로 실제 사용",
    ],
    exclusions: [
      "개인 간 교육비 명목 지급 (별도 사회통념 판단)",
    ],
  },
  {
    id: "gift_disaster_relief",
    category: "gift",
    name: "이재구호금품",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "재해 피해자에게 구호 목적으로 지급된 금품 (§46 2호)",
    limitType: "social_norm",
    riskLevel: "low",
    requirements: ["재해 피해 사실 확인", "구호 목적으로 지급"],
    exclusions: ["구호 외 목적 사용분"],
  },
  {
    id: "gift_veterans_benefit",
    category: "gift",
    name: "국가유공자 보훈급여",
    lawRef: EXEMPTION.GIFT_NONTAXABLE,
    description: "국가유공자·보훈대상자에게 지급되는 보훈급여금 (§46 6호)",
    limitType: "unlimited",
    riskLevel: "none",
    requirements: [
      "국가유공자법·보훈급여금법에 따른 수급자",
      "법령에 따라 지급된 급여",
    ],
    exclusions: ["법령 외 별도 추가 지급분"],
  },
  {
    id: "gift_public_trust",
    category: "gift",
    name: "공익신탁 출연재산",
    lawRef: EXEMPTION.PUBLIC_TRUST_GIFT,
    description: "증여자가 공익신탁법에 따른 공익신탁을 통해 공익법인등에 출연하는 재산 (§52)",
    limitType: "unlimited",
    riskLevel: "medium",
    riskNote: "공익 목적 외 사용 또는 신탁 해지 시 즉시 과세",
    requirements: [
      "공익신탁법에 따른 적법한 신탁",
      "수익자가 공익 목적으로 사용",
    ],
    exclusions: [
      "공익 목적 외 사용분",
      "신탁 해지 후 수령분",
    ],
  },
  {
    id: "gift_disabled_trust",
    category: "gift",
    name: "장애인 신탁 비과세",
    lawRef: EXEMPTION.DISABLED_TRUST,
    description: "장애인이 증여받아 본인을 수익자로 신탁한 재산 (§52의2)",
    limitType: "fixed",
    limitAmount: DISABLED_TRUST_LIMIT,
    riskLevel: "high",
    riskNote: "신탁 해지 시 남은 원금 즉시 증여세 과세 (§52의2④); 5억 초과분 일반 과세",
    requirements: [
      "수증자가 장애인복지법 또는 국가유공자법상 장애인",
      "증여재산을 신탁업자에게 신탁",
      "수익자 = 장애인 본인",
      "생존 중(평생) 합산 5억원 이내 (§52의2③)",
    ],
    exclusions: [
      "신탁 해지 후 잔존 원금",
      "신탁 계약 조건 위반 시",
    ],
  },
];

// ============================================================
// 룰 조회 헬퍼
// ============================================================

/** 전체 비과세 룰 목록 */
export const ALL_EXEMPTION_RULES = [
  ...INHERITANCE_EXEMPTION_RULES,
  ...GIFT_EXEMPTION_RULES,
];

/** ID로 룰 조회 */
export function findExemptionRuleById(id: string): ExemptionRule | undefined {
  return ALL_EXEMPTION_RULES.find((r) => r.id === id);
}

/** 카테고리별 룰 목록 조회 */
export function getExemptionRulesByCategory(
  category: ExemptionCategory,
): ExemptionRule[] {
  return ALL_EXEMPTION_RULES.filter((r) => r.category === category);
}

/** 추징 리스크가 있는 룰 목록 (UI 경고 배지용) */
export function getHighRiskRules(): ExemptionRule[] {
  return ALL_EXEMPTION_RULES.filter(
    (r) => r.riskLevel === "high" || r.riskLevel === "medium",
  );
}

/** 룰의 과세상 취급 (미지정 시 "non_taxable"로 간주) */
export function getExemptionTreatment(rule: ExemptionRule): ExemptionTreatment {
  return rule.taxTreatment ?? "non_taxable";
}
