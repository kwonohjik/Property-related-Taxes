/**
 * net-income-rows — 순손익 계산서 PDF 24행 정의 (이미지 7 원본 서식).
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.1
 * 기반 PDF: `주식-취득후 상장.pdf` (docs/00-pm/stock-transfer-post-listing-pdf-replica.plan.md:7)
 *
 * 행 번호는 원본 그대로 **18·19·22가 결번**이다 — 그 번호는 순자산가액 계산서 쪽에 있다.
 */

import type { StatementInputRow } from "./statement-table-types";

/** 「소득에 가산할 금액」 그룹은 행 2~4 (행 1은 그룹 밖) */
const ADD_GROUP_ROWS = 3;
/**
 * 「소득에서 공제할 금액」 그룹은 **행 5(벌금·과료)~16(지방소득세 총결정세액)** + 삭제 행 1개 = 13행.
 *
 * 🔑 **사용자 확정 (2026-09-11).** 원본 화면 캡처로는 가를 수 없었다 — `rowSpan` 셀의 글자는
 *    세로 «중앙»정렬이라 「5~16(중앙 10~11)」과 「9~16(중앙 12~13)」이 비슷한 위치에 보인다.
 *    ⇒ 확정 전 근거는 이미지 7의 (B) 합계 행 자체였다: **「(B) 공제할금액 합계 (5 + … + 16)」**.
 *    합계가 5부터 시작하는데 그룹 라벨만 9부터일 이유가 없다.
 *    계획서 §8 V-2.
 */
const SUB_GROUP_ROWS = 13;

/**
 * 가산 4행 — 행 1은 그룹 밖, 행 2~4가 그룹.
 *
 * 🔑 **행 1만 음수(결손)가 정상값이다.** 「법인세법」 §14 각 사업연도 소득은 결손이면 음수이고,
 *    나머지 가산·차감 행은 이름이 붙은 세무조정 항목이라 성질상 비음수다 ⇒ 행 1 signed는 대체 불가.
 *    `allowNegative` 없이 두면 `CurrencyInput`이 선행 `-`를 **차단이 아니라 조용히 제거**해
 *    결손이 같은 크기의 이익으로 뒤집힌다(`CurrencyInput.tsx:97`).
 *    anchor: `__tests__/components/calc/stock-transfer/unlisted-deficit-negative.anchor.test.tsx` DN-1~5
 */
export const NI_ADD_ROWS: StatementInputRow[] = [
  { kind: "input", keyPrefix: "niAddRow1", num: "1.", label: "각 사업연도 소득금액", signed: true },
  {
    kind: "input",
    keyPrefix: "niAddRow2",
    num: "2.",
    label: "국세·지방세 과오납 환급금 이자",
    groupCell: { label: "소득에 가산할 금액", rowSpan: ADD_GROUP_ROWS },
  },
  { kind: "input", keyPrefix: "niAddRow3", num: "3.", label: "수입배당금 중 익금불산입한 금액", inGroup: true },
  {
    kind: "input",
    keyPrefix: "niAddRow4",
    num: "4.",
    label: "기부금 손금산입한도액 초과액 이월손금 산입액",
    inGroup: true,
  },
];

/**
 * 차감 12행 + 삭제 행 1개.
 *
 * ⚠️ **「비업무용토지 취득세」는 입력 불가 행이다** — 원본 서식(이미지 7)이 그 자리를 회색으로
 *    비워 두고 있어 행 번호 체계를 보존하려면 자리도 보존해야 한다.
 *    🔑 **삭제 «연도»는 라벨에 쓰지 않는다.** 현행 상증령 §56④(가산 1호 가~마 · 차감 2호 가~마)에
 *    해당 항목이 없다는 것은 KoreanLaw MCP로 확인했지만(2026-09-11), 원본 화면이 적은
 *    「2002년」은 검증되지 않았다. 미검증 연도를 화면에 단정하지 않는다.
 *    계획서 §8 V-1 · [[feedback_no_statute_claim_needs_requirement_article]]
 */
export const NI_SUB_ROWS: StatementInputRow[] = [
  {
    kind: "input",
    keyPrefix: "niSubRow5",
    num: "5.",
    label: "벌금·과료·과태료·가산금·체납처분비",
    groupCell: { label: "소득에서 공제할 금액", rowSpan: SUB_GROUP_ROWS },
  },
  { kind: "input", keyPrefix: "niSubRow6", num: "6.", label: "손금용인되지 않는 공과금", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow7", num: "7.", label: "업무와 관련없는 지출", inGroup: true },
  {
    kind: "input",
    keyPrefix: "niSubRowDeletedNbl",
    label: "비업무용토지 취득세 (현행 삭제)",
    disabled: true,
    inGroup: true,
  },
  { kind: "input", keyPrefix: "niSubRow8", num: "8.", label: "각 세법상 징수불이행 납부세액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow9", num: "9.", label: "기부금한도초과액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow10", num: "10.", label: "접대비한도초과액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow11", num: "11.", label: "과다경비등 손금불산입액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow12", num: "12.", label: "지급이자 손금불산입액", inGroup: true },
  {
    kind: "input",
    keyPrefix: "niSubRow13",
    num: "13.",
    label: "감가상각비 시인부족액 — 손금으로 추인된 상각부인액",
    inGroup: true,
  },
  { kind: "input", keyPrefix: "niSubRow14", num: "14.", label: "법인세 총결정세액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow15", num: "15.", label: "농어촌특별세 총결정세액", inGroup: true },
  { kind: "input", keyPrefix: "niSubRow16", num: "16.", label: "지방소득세 총결정세액", inGroup: true },
];

/** 행 20 — 주식수. 라벨은 원본 서식 문구(종전 hint에 밀려 있던 것을 승격) */
export const NI_SHARE_ROW: StatementInputRow = {
  kind: "input",
  keyPrefix: "niShareCount",
  num: "20.",
  label: "사업연도말 주식 또는 환산주식수",
  unit: "주",
};

/**
 * 행 23 — 환원율.
 *
 * 🔴 **라벨·설명을 이미지 7의 「기획재정부령이 «고시»하는 이자율」로 바꾸지 말 것.**
 *    상증칙 §17의 연 10%는 고시가 아니라 **시행규칙에 직접 박힌 정액**이다.
 *    공식 2025.07.10 양식도 「기획재정부령이 «정하는» 율」로 적는다
 *    (`besshi-form-constants.ts:336`). 계획서 §2.2 X-1.
 *    anchor: `statement-table-layout.anchor.test.tsx` ST-3 (보존 anchor)
 */
export const NI_RATE_ROW: StatementInputRow = {
  kind: "input",
  keyPrefix: "niDiscountRate",
  num: "23.",
  label: "환원율",
  description:
    "상증법 시행규칙 §17 — 연 10% 고정 (소령 §165④1가목 → 소칙 §81② 위임). 고시값 아닌 시행규칙 정액. 다른 값 직접 입력 시 우선.",
  decimal: true,
  unit: "%",
};
