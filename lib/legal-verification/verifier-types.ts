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
  /**
   * 어떤 본문을 기준으로 검증할지.
   *
   * - `"enforced"`(기본) — **현행 시행본**(`target=eflaw`). 지금 효력 있는 문언.
   * - `"announced"` — **공포본**(`target=law&MST=`). 아직 시행되지 않은 개정 조문을
   *   코드가 **선반영**한 규칙에만 쓴다. 근거(시행일·선반영 지점)를 주석으로 남길 것.
   *
   * 종전에는 전 규칙이 공포본을 봤고 그래서 두 가지가 동시에 조용했다 —
   * ① 공포본에 없는 최신 시행 개정(상증법 §45의5 2026.1.1.)을 놓쳤고,
   * ② 아직 시행되지 않은 문언을 현행처럼 통과시켰다(소득세법 시행령 §178의8).
   */
  basis?: "enforced" | "announced";
}
