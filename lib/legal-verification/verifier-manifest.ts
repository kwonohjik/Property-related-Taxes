/**
 * 법령 조문 자동 검증 — 매니페스트 (순수 데이터)
 *
 * 서버 전용 의존(fs 등)이 없어 client·server 양쪽에서 안전하게 import 가능.
 * verifier.ts가 이 파일을 re-export하므로 기존 import 사이트는 변경 불필요.
 * 검증 로직(verifyRule/verifyAll)은 verifier.ts에 있다.
 *
 * 규칙 타입은 verifier-types.ts, 세목별 추가분은 manifest/additions-*.ts 에 있다.
 * (legal-codes 인용을 전수 커버 — `npm run check:legal-coverage` 로 갭 확인)
 */

import type { VerificationRule } from "./verifier-types";
import { TRANSFER_ADDITIONS } from "./manifest/additions-transfer";
import { INHERITANCE_ADDITIONS } from "./manifest/additions-inheritance";
import { LOCAL_ADDITIONS } from "./manifest/additions-local";
import { COMPREHENSIVE_ADDITIONS } from "./manifest/additions-comprehensive";
import { COMMON_ADDITIONS } from "./manifest/additions-common";

// 기존 import 사이트(verifier.ts 등) 호환을 위해 타입 re-export
export type { VerificationRule };

// ── 검증 규칙 매니페스트 (핵심 43건 — 세목별 대표 조문) ────────────────────
// legal-codes.ts의 상수값 변경 시 이 목록도 함께 업데이트한다.
// 키워드는 강학상 용어가 아닌 "법제처 조문의 실제 법문 표현"이어야 한다.

const BASE_MANIFEST: VerificationRule[] = [
  // ── 양도소득세 ────────────────────────────────────────────────────
  {
    id: "TRANSFER.ONE_HOUSE_EXEMPT",
    citation: "소득세법 §89 ①",
    keywords: ["1세대", "1주택", "비과세", "12억원"],
  },
  {
    id: "TRANSFER.LONG_TERM_DEDUCTION",
    citation: "소득세법 §95 ②",
    keywords: ["장기보유", "공제액", "보유기간", "공제율"],
  },
  {
    id: "TRANSFER.BASIC_DEDUCTION",
    citation: "소득세법 §103",
    keywords: ["기본공제", "250만원"],
  },
  {
    id: "TRANSFER.TAX_RATE",
    citation: "소득세법 §104 ①",
    keywords: ["세율", "양도소득"],
  },
  {
    id: "TRANSFER.SURCHARGE",
    citation: "소득세법 §104 ⑦",
    keywords: ["조정대상지역", "2주택", "100분의 20"],
  },
  {
    id: "TRANSFER.UNREGISTERED_SURCHARGE",
    citation: "소득세법 §104 ①10호",
    keywords: ["미등기양도자산", "100분의 70"],
  },

  // ── 배우자등 이월과세 + 비교과세 (소득세법 §97조의2) ──────────────
  {
    id: "TRANSFER.CARRYOVER_TAXATION",
    citation: "소득세법 §97조의2",
    keywords: ["배우자", "직계존비속", "증여", "취득가액"],
  },
  {
    id: "TRANSFER.CARRYOVER_DONOR_BASIS",
    citation: "소득세법 §97조의2 ① 1호",
    // 조문 실제 법문은 "증여자"가 아니라 "거주자의 배우자 또는 직계존비속" (증여자는 강학상 용어)
    keywords: ["취득가액", "배우자 또는 직계존비속"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_GIFT_TAX_EXPENSE",
    citation: "소득세법 §97조의2 ①",
    keywords: ["증여세", "필요경비"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_EXCLUSION",
    citation: "소득세법 §97조의2 ②",
    // 조문 실제 법문은 "이월과세"가 아니라 "제1항을 적용하지 아니한다" (이월과세는 강학상 용어)
    keywords: ["적용하지 아니", "협의매수 또는 수용"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_COMPARISON",
    citation: "소득세법 §97조의2 ②",
    keywords: ["결정세액", "적은"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_PERIOD_REGISTRY",
    citation: "소득세법 §97조의2 ③",
    keywords: ["등기부", "소유기간"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_HOLDING_PERIOD",
    citation: "소득세법 §95 ④",
    // 조문 실제 법문은 "증여자"가 아니라 "증여한 배우자 또는 직계존비속" (증여자는 강학상 용어)
    keywords: ["취득일", "증여한 배우자 또는 직계존비속"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.CARRYOVER_GIFT_TAX_FORMULA",
    citation: "소득세법 시행령 §163의2",
    keywords: ["증여세", "자산가액"],
    keywordMode: "ALL",
  },

  // ── 비사업용 토지 ──────────────────────────────────────────────────
  {
    id: "NBL.MAIN",
    citation: "소득세법 §104조의3",
    keywords: ["비사업용 토지", "농지", "임야"],
  },

  // ── 상속세 ────────────────────────────────────────────────────────
  {
    id: "INH.BASIC_DEDUCTION",
    citation: "상증법 §18",
    keywords: ["2억원"],
  },
  {
    id: "INH.FARMING_DEDUCTION",
    citation: "상증법 §18의3",
    keywords: ["영농", "30억원"],
    forbiddenKeywords: ["가업"],
  },
  {
    id: "INH.FAMILY_BUSINESS_DEDUCTION",
    citation: "상증법 §18의2",
    keywords: ["가업", "600억"],
    forbiddenKeywords: ["영농"],
  },
  {
    id: "INH.SPOUSE_DEDUCTION",
    citation: "상증법 §19",
    keywords: ["배우자", "30억원", "5억원"],
  },
  {
    id: "INH.LUMP_SUM",
    citation: "상증법 §21",
    keywords: ["5억원"],
  },
  {
    id: "INH.FINANCIAL_DEDUCTION",
    citation: "상증법 §22",
    keywords: ["금융재산", "2억원"],
  },
  {
    id: "INH.COHABIT_DEDUCTION",
    citation: "상증법 §23의2",
    keywords: ["동거주택"],
  },
  {
    id: "INH.TAX_RATE",
    citation: "상증법 §26",
    keywords: ["상속세", "세율"],
  },
  {
    id: "INH.GENERATION_SKIP",
    citation: "상증법 §27",
    keywords: ["세대를 건너", "100분의 30"],
  },

  // ── 증여세 ────────────────────────────────────────────────────────
  {
    id: "GIFT.GIFT_DEDUCTION",
    citation: "상증법 §53",
    keywords: ["배우자", "6억원", "5천만원", "직계존속"],
  },
  {
    id: "GIFT.MARRIAGE_DEDUCTION",
    citation: "상증법 §53의2",
    keywords: ["혼인", "출산", "1억원"],
  },
  {
    id: "GIFT.GENERATION_SKIP",
    citation: "상증법 §57",
    keywords: ["직계비속", "100분의 30"],
  },

  // ── 종합부동산세 ───────────────────────────────────────────────────
  {
    id: "COMPREHENSIVE.BASIC_DEDUCTION_ONE_HOUSE",
    citation: "종합부동산세법 제8조제1항 제1호 (12억)",
    keywords: ["1세대 1주택자", "12억원"],
  },
  {
    id: "COMPREHENSIVE.BASIC_DEDUCTION_GENERAL",
    citation: "종합부동산세법 제8조제1항 제3호 (9억)",
    keywords: ["9억원"],
  },
  {
    id: "COMPREHENSIVE.TAX_RATE",
    citation: "종합부동산세법 §9①",
    keywords: ["세율", "주택", "2주택 이하"],
  },
  {
    id: "COMPREHENSIVE.ONE_HOUSE_SENIOR_CREDIT",
    citation: "종합부동산세법 §9⑥",
    keywords: ["60세", "공제율", "1세대 1주택자"],
  },
  {
    id: "COMPREHENSIVE.ONE_HOUSE_LONG_TERM_CREDIT",
    citation: "종합부동산세법 §9⑧",
    keywords: ["5년 이상", "공제율", "1세대 1주택자"],
  },
  {
    id: "COMPREHENSIVE.TAX_CAP_GENERAL",
    citation: "종합부동산세법 제10조 (150%)",
    keywords: ["100분의 150"],
    forbiddenKeywords: ["100분의 300"],
  },

  // ── 재산세 ────────────────────────────────────────────────────────
  {
    id: "PROPERTY.TAX_RATE",
    citation: "지방세법 §111",
    keywords: ["재산세", "표준세율"],
  },
  {
    id: "PROPERTY.ONE_HOUSE_SPECIAL",
    citation: "지방세법 §111의2",
    keywords: ["1세대 1주택", "9억원"],
  },
  {
    id: "PROPERTY.BUILDING_LUXURY_RATE",
    citation: "지방세법 §111①2호 가목",
    keywords: ["골프장", "고급오락장", "1천분의 40"],
  },
  {
    id: "PROPERTY.BUILDING_FACTORY_RATE",
    citation: "지방세법 §111①2호 나목",
    keywords: ["공장", "1천분의 5"],
  },
  {
    id: "PROPERTY.BUILDING_GENERAL_RATE",
    citation: "지방세법 §111①2호 다목",
    keywords: ["1천분의 2.5"],
  },
  {
    id: "PROPERTY.TAX_CAP",
    citation: "지방세법 §122",
    keywords: ["세 부담", "100분의 150"],  // 조문: "세 부담의 상한" (띄어쓰기)
  },

  // ── 취득세 ────────────────────────────────────────────────────────
  {
    id: "ACQUISITION.BASIC_RATE",
    citation: "지방세법 §11",
    keywords: ["취득세", "표준세율"],
  },
  {
    id: "ACQUISITION.SURCHARGE",
    citation: "지방세법 §13",
    keywords: ["중과기준세율"],
  },
  {
    id: "ACQUISITION.CORP_SURCHARGE",
    citation: "지방세법 §13의2",
    keywords: ["법인", "주택", "중과"],
  },
  {
    id: "ACQUISITION.FIRST_HOME_REDUCTION",
    citation: "지방세특례제한법 §36의3",
    keywords: ["생애최초", "12억원", "취득"],
  },
];

/**
 * 전체 검증 매니페스트 = 핵심 43건 + 세목별 KoreanLaw 실측 추가분.
 * legal-codes가 인용하는 조문을 전수 검증 대상으로 포함한다.
 */
export const VERIFICATION_MANIFEST: VerificationRule[] = [
  ...BASE_MANIFEST,
  ...TRANSFER_ADDITIONS,
  ...INHERITANCE_ADDITIONS,
  ...LOCAL_ADDITIONS,
  ...COMPREHENSIVE_ADDITIONS,
  ...COMMON_ADDITIONS,
];
