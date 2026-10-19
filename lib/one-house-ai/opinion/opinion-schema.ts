/**
 * 1세대1주택 AI 참고 의견 — LLM 출력 스키마(구조화 출력).
 *
 * 의견은 판정이 아니다. 판정은 결정론 엔진이 정본이고, 이 출력은 엔진이 보류했거나 폼으로 표현할 수 없는 사정에 대한
 * 「참고」다. 인용은 함께 보낸 해석례 카드의 문서번호로만 한다(서버가 목록 밖 번호를 걸러 낸다).
 */
import { z } from "zod";

export const opinionPointSchema = z.object({
  /** 쟁점 — 한 구절 */
  topic: z.string(),
  /** 의견 — 두세 문장 */
  opinion: z.string(),
  /** 근거로 든 해석례 문서번호(보낸 카드의 docNo 그대로). 없으면 빈 배열 */
  citedDocNos: z.array(z.string()),
  /** 근거 조문 — 「소득세법 시행령 §155①」 꼴 */
  statutes: z.array(z.string()),
});

export const oneHouseOpinionSchema = z.object({
  /**
   * 엔진 결론과의 관계 — consistent: 같은 방향 · possible_difference: 결론이 달라질 수 있는 쟁점이 있다 ·
   * insufficient_basis: 보낸 해석례·사실로는 의견을 낼 근거가 부족하다
   */
  engineAgreement: z.enum(["consistent", "possible_difference", "insufficient_basis"]),
  /** 요약 — 두세 문장 */
  summary: z.string(),
  points: z.array(opinionPointSchema),
  /** 결론을 가를 수 있어 사용자가 확인할 사실 — 한 문장씩 */
  factsToConfirm: z.array(z.string()),
  /** 시점(당시 법령과 현행의 차이)·해석의 한계 — 한 문장씩 */
  caveats: z.array(z.string()),
});

export type OneHouseOpinion = z.infer<typeof oneHouseOpinionSchema>;
