/**
 * deduction-besshi-constants — 부표3·별지5호·별지1호 라벨·코드표·제목 단일출처 (화면·PDF 공유).
 * 라벨은 KoreanLaw MCP 검증 본문(계획 §1) 1:1. 별지1호는 최신본 2023.3.20 환류.
 */
import type { Buppyo3DeductionValues } from "@/lib/calc/deduction-besshi-data";

export const PAPER_FOOTER = "210mm×297mm[백상지 80g/㎡]";
export const HANDWRITE_NOTE =
  "※ 식별정보(주민등록번호·주소·계좌번호·사업자등록번호 등)는 자동 산출되지 않습니다 — 인쇄 후 수기 작성.";

export const BP3 = {
  title: "채무·공과금·장례비용 및 상속공제명세서",
  subtitle: "[별지 제9호서식 부표 3] (2020. 3. 13. 개정)",
  rowsDebt: 4,
  rowsUtility: 4,
  rowsFuneral: 5,
} as const;

/** 부표3 표 컬럼 폭 — 화면(colgroup)·PDF(width) 단일출처. 계 행은 앞 컬럼 합폭으로 병합. */
export const BP3_COLS = {
  debt: ["16%", "12%", "12%", "14%", "14%", "16%", "16%"], // ①종류~⑥금액 (계: 84%+16%)
  utility: ["34%", "22%", "22%", "22%"], // ⑧코드~⑪금액 (계: 78%+22%)
  funeral: ["24%", "24%", "30%", "22%"], // ⑬주민번호~⑯금액 (계: 78%+22%)
  deduction: ["72%", "28%"], // 라. 라벨·금액
} as const;

export const B5 = {
  title: "금융재산 상속공제 신고서",
  subtitle: "[별지 제5호서식] (2020. 3. 13. 개정)", // 개정일 확인 필요 (HWP 앞쪽 미반환)
  rows: 9,
} as const;

/** 별지5호 표 컬럼 폭 — 화면(colgroup)·PDF(width) 단일출처. */
export const B5_COLS = {
  person: ["18%", "32%", "18%", "32%"], // 1. 인적사항 라벨·값·라벨·값
  financial: ["18%", "20%", "16%", "18%", "12%", "16%"], // 종류~가액 (합계: 84%+16%)
  amount: ["72%", "28%"], // 3. 공제금액 라벨·금액
  limit: ["40%", "60%"], // 한도액 산정표
} as const;

export const B1 = {
  title: "가업상속공제신고서",
  subtitle: "상속세 및 증여세법 시행규칙 [별지 제1호서식] 〈개정 2023. 3. 20.〉", // 최신본 환류 (첨부 2022.3.18 구판)
  rowsAsset: 2,
} as const;

/**
 * 별지1호 표 컬럼 폭 — 화면(colgroup)·PDF(width) 단일출처.
 * 값 셀이 비어도 동일 폭을 확보(table-fixed) → 데이터 유무와 무관하게 양식 폭 고정.
 */
export const B1_COLS = {
  pair: ["18%", "32%", "18%", "32%"], // 라벨·값·라벨·값 (가·다·라)
  sme: ["16%", "26%", "26%", "32%"], // 나. 중소·중견 (col3 라벨 김)
  asset: ["18%", "18%", "16%", "28%", "20%"], // 마. 종류·수량·단가·가액·비고
  declare: ["70%", "30%"], // 바. 신고액
} as const;

/** 부표3 라.상속공제 14항목 (번호+라벨+키). group 있으면 rowSpan 그룹 라벨 셀 */
export const BP3_DEDUCTION_ROWS = [
  { no: "⑱", label: "기초공제", key: "basic", group: "기초공제 및 그 밖의 인적공제", groupSize: 5 },
  { no: "⑲", label: "자녀공제", key: "child" },
  { no: "⑳", label: "미성년자공제", key: "minor" },
  { no: "㉑", label: "연로자공제", key: "elderly" },
  { no: "㉒", label: "장애인공제", key: "disabled" },
  { no: "㉓", label: "일괄공제", key: "lumpSum" },
  { no: "㉔", label: "가업상속공제", key: "familyBusiness", group: "추가상속공제", groupSize: 2 },
  { no: "㉕", label: "영농상속공제", key: "farming" },
  { no: "㉖", label: "배우자상속공제", key: "spouse" },
  { no: "㉗", label: "금융재산상속공제", key: "financial" },
  { no: "㉘", label: "재해손실공제", key: "disaster" },
  { no: "㉙", label: "동거주택상속공제", key: "cohabit" },
  { no: "㉚", label: "공제적용한도액", key: "ceiling" },
  { no: "㉛", label: "상속공제금액합계", key: "total" },
] as const satisfies readonly {
  no: string;
  label: string;
  key: keyof Buppyo3DeductionValues;
  group?: string;
  groupSize?: number;
}[];

/** 별지5호 ④ 금융재산 상속공제 한도액 표 (작성방법 §4) */
export const B5_LIMIT_TABLE = [
  { range: "2,000만원 이하", deduct: "해당 순금융재산가액 전액" },
  { range: "2,000만원 초과 ~ 1억원 이하", deduct: "2천만원" },
  { range: "1억원 초과 ~ 10억원 이하", deduct: "해당 순금융재산가액 × 20%" },
  { range: "10억원 초과", deduct: "2억원" },
] as const;
