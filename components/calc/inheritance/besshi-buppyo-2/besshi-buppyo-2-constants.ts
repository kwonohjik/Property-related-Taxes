/**
 * besshi-buppyo-2-constants — 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」
 * 칸 라벨·코드표·정적 텍스트 단일 출처. 화면(BesshiBuppyo2Section)·PDF가 공유.
 *
 * 라벨·코드표는 KoreanLaw MCP 검증 본문(시행규칙 별지 제9호서식 부표 2, 개정 2024.3.22.) 1:1.
 * 양식 레이아웃(1쪽 가·나"별첨"·계 ⑰~㉘ / 2쪽 「상속인별 상속재산명세」)·칸번호 ①~㉘은
 * 사용자 첨부 이미지(부표2 1쪽·2쪽) 정합. 개정일·⑳ 라벨은 현행(2024.3.22.) 유지(사용자 결정).
 *
 * Plan: docs/00-pm/inheritance-buppyo-2-image1-parity-page-split.plan.md
 */

import type { Buppyo2ItemRow } from "@/lib/calc/besshi-buppyo-2-data";

export const BP2_FORM_TITLE = "상속인별 상속재산 및 평가명세서";
export const BP2_FORM_SUBTITLE = "[별지 제9호서식 부표 2] (개정 2024.3.22.)";
export const BP2_FORM_SIDE = "(앞쪽)";
export const BP2_FOOTER = "210mm×297mm[백상지 80g/㎡]";

/** 2쪽 독립 제목 — 1쪽 나의 오버플로(별지 계속) 상세 명세 */
export const BP2_NA_SECTION_TITLE = "상속인별 상속재산명세";

/** 1쪽 나 행 수(고정 5) · 오버플로 시 1쪽 데이터 최대(4) · 별지 계속 마커 */
export const BP2_PAGE1_NA_ROWS = 5;
export const BP2_PAGE1_MAX_DATA = 4;
export const BP2_CONTINUATION_MARK = "별지 계속";

/**
 * 1쪽 나 / 2쪽 명세 행 분할 (화면·PDF 단일 진실).
 * - N ≤ 5: 1쪽에 전부(page1Rows=rows), 2쪽 없음 (R3).
 * - N ≥ 6: 1쪽에 앞 4행(page1Rows) + "별지 계속", 2쪽에 나머지(page2Rows, 중복 없음) (R2).
 * 불변식: page1Rows.length + page2Rows.length === rows.length (무중복·무누락).
 * 2쪽 계 행은 전체 합계(itemRowsTotal)를 별도 전달 — page2Rows 소계 아님.
 */
export function splitBuppyo2NaRows(rows: Buppyo2ItemRow[]): {
  page1Rows: Buppyo2ItemRow[];
  page2Rows: Buppyo2ItemRow[];
  needsContinuation: boolean;
  needsPage2: boolean;
} {
  if (rows.length <= BP2_PAGE1_NA_ROWS) {
    return { page1Rows: rows, page2Rows: [], needsContinuation: false, needsPage2: false };
  }
  return {
    page1Rows: rows.slice(0, BP2_PAGE1_MAX_DATA),
    page2Rows: rows.slice(BP2_PAGE1_MAX_DATA),
    needsContinuation: true,
    needsPage2: true,
  };
}

/** 가. 상속인별 상속현황 칼럼 라벨 (8칼럼 ①~⑧) */
export const BP2_GA_LABELS = {
  relation: "① 피상속인과의 관계",
  name: "② 성명",
  rrn: "③ 주민등록번호",
  address: "④ 주소",
  legalRatio: "⑤ 법정상속지분율",
  legalValue: "⑥ 법정상속재산가액",
  actualRatio: "⑦ 실제상속지분율",
  actualValue: "⑧ 실제상속재산가액",
} as const;

/** 나. 상속인별 상속재산명세 칼럼 라벨 (10칼럼 ⑨~⑯ · 국외 2칸 번호 없음) */
export const BP2_NA_LABELS = {
  kindCode: "⑨ 재산구분코드",
  typeCode: "⑩ 재산종류코드",
  overseas: "국외자산 여부",
  country: "국외재산 국가명",
  location: "⑪ 소재지·법인명등",
  bizNo: "⑫ 사업자등록번호(계좌번호,지분)",
  quantity: "⑬ 수량(면적)",
  unitPrice: "⑭ 단가",
  amount: "⑮ 평가가액",
  methodCode: "⑯ 평가기준코드",
} as const;

/**
 * 계 행 라벨·키 (12행 ⑰~㉘). group 있으면 좌측 그룹 라벨 rowSpan(groupSize) 셀.
 * key는 Buppyo2SectionTotal 바인딩에 사용. 라벨·개정일은 현행(2024.3.22.) 조문 기준(사용자 결정).
 */
export const BP2_KYE_ROWS = [
  { no: "⑰", key: "estate_total", label: "상속재산가액" },
  { no: "⑱", key: "presumed", label: "상속개시 전 처분재산등 산입액" },
  { no: "⑲", key: "nontax_farmland", label: "금양임야 등 가액", group: "비과세재산가액", groupSize: 3 },
  { no: "⑳", key: "nontax_public", label: "공공단체 유증" },
  { no: "㉑", key: "nontax_other", label: "기타" },
  { no: "㉒", key: "excl_public_corp", label: "공익법인 출연재산 가액", group: "과세가액불산입액", groupSize: 3 },
  { no: "㉓", key: "excl_public_trust", label: "공익신탁 재산가액" },
  { no: "㉔", key: "excl_other", label: "기타" },
  { no: "㉕", key: "prior_gift_13", label: "「상속세 및 증여세법」 제13조", group: "가산하는 증여재산가액", groupSize: 3 },
  { no: "㉖", key: "prior_gift_30_5", label: "「조세특례제한법」 제30조의5" },
  { no: "㉗", key: "prior_gift_30_6", label: "「조세특례제한법」 제30조의6" },
  { no: "㉘", key: "total", label: "합계" },
] as const satisfies readonly {
  no: string;
  key: string;
  label: string;
  group?: string;
  groupSize?: number;
}[];

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
