/**
 * 검증 매니페스트 추가분 — 소득세법 §101②~④·§2의2③·시행령 §98① (증여 후 우회양도 부당행위계산부인)
 *
 * 엔진 `gift-resale-101-2.ts`와 상수 `GIFT_RESALE_101.*`(`legal-codes/transfer-gift-resale-101.ts`)의 근거 조문이다.
 * 키워드는 모두 법제처 원문에서 verbatim으로 뽑았다(KoreanLaw MCP 실독 2026-11-26 —
 * 소득세법 시행 2026.7.1. 본문 · 소득세법 시행령 MST 290841).
 * 가운뎃점(ㆍ)이 든 문구(「공제ㆍ감면세액」)는 표기 차이로 오판정할 수 있어 고르지 않았다.
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_GIFT_RESALE_101_ADDITIONS: VerificationRule[] = [
  {
    // ② 본문·1호·2호·단서 · ③ 증여세 미부과 · ④ 연수 계산 준용
    id: "TRANSFER.GIFT_RESALE_101",
    citation: "소득세법 §101 ②",
    keywords: [
      "그 증여일부터 10년 이내에 다시 타인에게 양도한 경우",
      "증여자가 그 자산을 직접 양도한 것으로 본다",
      "양도소득이 해당 수증자에게 실질적으로 귀속된 경우에는 그러하지 아니하다",
      "증여자가 직접 양도하는 경우로 보아 계산한 양도소득세",
      "증여세를 부과하지 아니한다",
      "제97조의2제3항을 준용한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.GIFT_RESALE_JOINT_LIABILITY",
    citation: "소득세법 §2조의2 ③",
    keywords: [
      "제101조제2항에 따라 증여자가 자산을 직접 양도한 것으로 보는 경우",
      "증여자와 증여받은 자가 연대하여 납세의무를 진다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.GIFT_RESALE_RELATED_PARTY",
    citation: "소득세법 시행령 §98 ①",
    keywords: [
      "같은 조 제3항제1호에 따른 특수관계인을 말한다",
    ],
    keywordMode: "ALL",
  },
];
