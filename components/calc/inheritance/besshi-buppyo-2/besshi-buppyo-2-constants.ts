/**
 * besshi-buppyo-2-constants — 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」
 * 칸 라벨·코드표·정적 텍스트 단일 출처. 화면(BesshiBuppyo2Section)·PDF가 공유.
 *
 * 라벨·코드표는 KoreanLaw MCP 검증 본문(시행규칙 별지 제9호서식 부표 2, 개정 2024.3.22.) 1:1.
 *
 * Plan: docs/00-pm/inheritance-besshi-9-buppyo-2-property-valuation.plan.md
 * Design: docs/02-design/features/inheritance-besshi-9-buppyo-2-property-valuation.ui.design.md §3-4
 */

export const BP2_FORM_TITLE = "상속인별 상속재산 및 평가명세서";
export const BP2_FORM_SUBTITLE = "[별지 제9호서식 부표 2] (개정 2024.3.22.)";
export const BP2_FORM_SIDE = "(앞쪽)";
export const BP2_FOOTER = "210mm×297mm[백상지 80g/㎡]";

/** 가. 상속인별 상속현황 칼럼 라벨 (8칼럼) */
export const BP2_GA_LABELS = {
  relation: "피상속인과의 관계",
  name: "성명",
  rrn: "주민등록번호",
  address: "주소",
  legalRatio: "법정상속지분율",
  legalValue: "법정상속재산가액",
  actualRatio: "실제상속지분율",
  actualValue: "실제상속재산가액",
} as const;

/** 나. 상속인별 상속재산명세 칼럼 라벨 (10칼럼) */
export const BP2_NA_LABELS = {
  kindCode: "재산구분코드",
  typeCode: "재산종류코드",
  overseas: "국외자산 여부",
  country: "국외재산 국가명",
  location: "⑪ 소재지·법인명등",
  bizNo: "사업자등록번호(계좌번호,지분)",
  quantity: "수량(면적)",
  unitPrice: "단가",
  amount: "평가가액",
  methodCode: "평가기준코드",
} as const;

/** 계 행 라벨·키 (12행). key는 Buppyo2SectionTotal 바인딩에 사용 */
export const BP2_KYE_ROWS = [
  { key: "estate_total", label: "상속재산가액" },
  { key: "presumed", label: "상속개시 전 처분재산등 산입액" },
  { key: "nontax_farmland", label: "비과세재산가액 — 금양임야 등" },
  { key: "nontax_public", label: "비과세재산가액 — 공공단체 유증" },
  { key: "nontax_other", label: "비과세재산가액 — 기타" },
  { key: "excl_public_corp", label: "과세가액불산입 — 공익법인 출연재산" },
  { key: "excl_public_trust", label: "과세가액불산입 — 공익신탁 재산" },
  { key: "excl_other", label: "과세가액불산입 — 기타" },
  { key: "prior_gift_13", label: "가산하는 증여재산가액 (상증법 §13)" },
  { key: "prior_gift_30_5", label: "가산하는 증여재산가액 (조특 §30의5)" },
  { key: "prior_gift_30_6", label: "가산하는 증여재산가액 (조특 §30의6)" },
  { key: "total", label: "합계" },
] as const;

export type Buppyo2KyeKey = (typeof BP2_KYE_ROWS)[number]["key"];

/**
 * 재산구분코드 12종 (작성방법 §6) — KoreanLaw 검증.
 */
export const BP2_KIND_CODE_LABEL: Record<string, string> = {
  A11: "상속재산 (상속인)",
  A12: "상속재산 (상속인 외)",
  A13: "상속개시 전 처분재산",
  A21: "증여재산가산 (상속인)",
  A22: "증여재산가산 (상속인 외)",
  A23: "증여재산가산 (창업자금)",
  A24: "증여재산가산 (가업승계)",
  B11: "비과세 (금양임야)",
  B12: "비과세 (공공단체 유증)",
  B13: "비과세 (기타)",
  B21: "과세가액불산입 (공익법인 출연)",
  B22: "과세가액불산입 (공익신탁)",
};

/**
 * 재산종류코드 14종 (작성방법 §7) — KoreanLaw 검증. 화면 약식 라벨.
 */
export const BP2_PROPERTY_TYPE_LABEL: Record<string, string> = {
  "01": "현금",
  "02": "토지",
  "03": "토지(부수)",
  "04": "개별주택",
  "05": "공동주택",
  "06": "오피스텔ㆍ상업용",
  "07": "일반건물",
  "08": "부동산 취득권리",
  "09": "상장주식",
  "10": "비상장주식",
  "11": "금융재산",
  "12": "기타재산",
  "13": "가상자산",
  "14": "서화ㆍ골동품",
};

/**
 * 평가기준코드 8종 (작성방법 §10) — KoreanLaw 검증 단일 출처.
 * ⚠️ UI 초안 재작성 라벨(매매사례가액·보충적평가(토지) 등) 폐기 — 아래 공식 라벨만 사용.
 */
export const BP2_VALUATION_METHOD_LABEL: Record<string, string> = {
  "01": "매매거래가액 (§60)",
  "02": "감정가액 (§60)",
  "03": "수용보상가액 (§60)",
  "04": "경매·공매가액 (§60)",
  "05": "유사매매사례가액 (§60)",
  "06": "현금 등 가액 (§60)",
  "07": "저당권 등 평가특례 (§66)",
  "08": "기준시가 등 보충적 평가 (§61~65)",
};
