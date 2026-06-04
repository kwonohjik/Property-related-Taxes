/**
 * 법령 조문 자동 검증 — 규칙 타입 (순수 타입)
 *
 * verifier-manifest.ts 및 manifest/additions-*.ts가 공유한다.
 * 순환 import를 피하기 위해 타입만 별도 파일로 둔다.
 */

export interface VerificationRule {
  /** legal-codes.ts 내 상수 경로 (가독성용) */
  id: string;
  /** 상수가 담고 있는 법령 인용 문자열 */
  citation: string;
  /**
   * 조문 본문에 반드시 포함되어야 할 키워드 목록.
   * ALL 모드(기본): 모두 포함돼야 통과.
   * ANY 모드: 하나라도 포함되면 통과.
   * 키워드는 강학상 용어가 아닌 "법제처 조문의 실제 법문 표현"이어야 한다.
   */
  keywords: string[];
  keywordMode?: "ALL" | "ANY";
  /** 조문 본문에 없어야 할 키워드 (삭제 확인 등) */
  forbiddenKeywords?: string[];
}
