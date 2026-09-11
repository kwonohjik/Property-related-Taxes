/**
 * net-asset-rows — 순자산가액 계산서 PDF 20행 정의.
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.2 · §4.2.1
 *
 * 이미지 7(순손익 화면)의 «양식 규칙»을 이식한다 — 순자산은 원본 PDF의 별도 다이얼로그라
 * 화면 캡처가 없다. 그룹 라벨은 「소득에 가산할 금액」 자리에 **「자산」/「부채」**가 온다.
 */

import type { StatementInputRow } from "./statement-table-types";

/** 「자산」 그룹 = 행 1~7 */
const ASSET_GROUP_ROWS = 7;
/** 「부채」 그룹 = 행 8~17 */
const LIAB_GROUP_ROWS = 10;

/**
 * 자산 7행.
 *
 * 🔑 **음수(△)가 정상값인 행은 2·3뿐이다** — 평가차액은 평가차손이면 음수, 법인세법상
 *    유보금액은 △유보가 정상값이다. 행 4·5는 성질상 비음수.
 *    형제 경로가 같은 규칙을 쓴다 — `NetAssetCalculationTable.tsx`의 `SIGNED_NET_ASSET_KEYS`.
 *    [[feedback_sibling_path_already_implements_rule]]
 *
 * ⚠️ **자본잠식은 이 플래그와 무관하다** — 행 1·8을 각각 양수로 넣으면 순자산이 자동으로 음수가 된다.
 *    anchor: `unlisted-valuation-preview-single-source.anchor.test.tsx` NA-1~3
 */
export const NA_ASSET_ROWS: StatementInputRow[] = [
  {
    kind: "input",
    keyPrefix: "naAssetTotalRow1",
    num: "1.",
    label: "재무상태표상 자산가액",
    groupCell: { label: "자산", rowSpan: ASSET_GROUP_ROWS },
  },
  { kind: "input", keyPrefix: "naAssetAddRow2", num: "2.", label: "평가차액", signed: true, inGroup: true },
  {
    kind: "input",
    keyPrefix: "naAssetAddRow3",
    num: "3.",
    label: "법인세법상 유보금액",
    signed: true,
    inGroup: true,
  },
  { kind: "input", keyPrefix: "naAssetAddRow4", num: "4.", label: "유상증자 등", inGroup: true },
  { kind: "input", keyPrefix: "naAssetAddRow5", num: "5.", label: "기타", inGroup: true },
  { kind: "input", keyPrefix: "naAssetSubRow6", num: "6.", label: "선급비용·이연자산 등", inGroup: true },
  { kind: "input", keyPrefix: "naAssetSubRow7", num: "7.", label: "증자일전잉여금의 유보액", inGroup: true },
];

/** 부채 10행 */
export const NA_LIAB_ROWS: StatementInputRow[] = [
  {
    kind: "input",
    keyPrefix: "naLiabTotalRow8",
    num: "8.",
    label: "재무상태표상 부채액",
    groupCell: { label: "부채", rowSpan: LIAB_GROUP_ROWS },
  },
  { kind: "input", keyPrefix: "naLiabAddRow9", num: "9.", label: "법인세", inGroup: true },
  { kind: "input", keyPrefix: "naLiabAddRow10", num: "10.", label: "농어촌특별세", inGroup: true },
  { kind: "input", keyPrefix: "naLiabAddRow11", num: "11.", label: "지방소득세", inGroup: true },
  { kind: "input", keyPrefix: "naLiabAddRow12", num: "12.", label: "배당금·상여금", inGroup: true },
  { kind: "input", keyPrefix: "naLiabAddRow13", num: "13.", label: "퇴직급여추계액", inGroup: true },
  { kind: "input", keyPrefix: "naLiabAddRow14", num: "14.", label: "기타", inGroup: true },
  { kind: "input", keyPrefix: "naLiabSubRow15", num: "15.", label: "제준비금", inGroup: true },
  { kind: "input", keyPrefix: "naLiabSubRow16", num: "16.", label: "제충당금", inGroup: true },
  { kind: "input", keyPrefix: "naLiabSubRow17", num: "17.", label: "외화환산대", inGroup: true },
];

/** 행 19 — 영업권 (그룹 밖) */
export const NA_GOODWILL_ROW: StatementInputRow = {
  kind: "input",
  keyPrefix: "naGoodwillRow19",
  num: "19.",
  label: "영업권",
  description: "해당하지 않으면 비워 두세요.",
};

/** 발행주식총수 — 행 번호 없음(원본 서식 그대로) */
export const NA_SHARE_ROW: StatementInputRow = {
  kind: "input",
  keyPrefix: "naShareCount",
  label: "사업연도말 발행주식총수",
  unit: "주",
};

/** 자산 «가산» 행의 폼 키 — 행 2~5 (엔진 `assetAdd` 배열 순서와 1:1) */
export const NA_ASSET_ADD_PREFIXES = [
  "naAssetAddRow2",
  "naAssetAddRow3",
  "naAssetAddRow4",
  "naAssetAddRow5",
] as const;
/** 자산 «차감» 행 — 행 6·7 */
export const NA_ASSET_SUB_PREFIXES = ["naAssetSubRow6", "naAssetSubRow7"] as const;
/** 부채 «가산» 행 — 행 9~14 */
export const NA_LIAB_ADD_PREFIXES = [
  "naLiabAddRow9",
  "naLiabAddRow10",
  "naLiabAddRow11",
  "naLiabAddRow12",
  "naLiabAddRow13",
  "naLiabAddRow14",
] as const;
/** 부채 «차감» 행 — 행 15~17 */
export const NA_LIAB_SUB_PREFIXES = [
  "naLiabSubRow15",
  "naLiabSubRow16",
  "naLiabSubRow17",
] as const;
