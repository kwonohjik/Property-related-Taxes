/**
 * 판례·결정례 «도메인 정체» 고정 — 법제처 target 코드가 실제로 무엇인지.
 *
 * 🔴 2026-09-11 전수 실측에서 17개 도메인 중 8개가 틀려 있었다. 그중 가장 나쁜 것은
 *    detc / expc 가 **서로 뒤바뀐** 것이다. 라벨과 원문 URL 이 «서로는 일치»했기 때문에
 *    내부 정합성 검사로는 절대 잡히지 않았다 — 둘 다 같은 방향으로 틀려 있었다.
 *    ⇒ 이 anchor 는 정합성이 아니라 **법제처 응답이 스스로 밝힌 근거**를 고정한다.
 *
 * 근거는 응답의 필드명·기관명이라 해석의 여지가 없다:
 *   target=detc → `헌재결정례상세링크` · `헌재결정례일련번호` · 사건번호 "2011헌바357"
 *   target=expc → `법령해석례상세링크` · `법령해석례일련번호` · `질의기관명` · 안건번호 "17-0358"
 *   target=ppc  → 컨테이너 `기관명` = "개인정보보호위원회"
 *   target=acr  → 컨테이너 `기관명` = "국민권익위원회"
 *
 * 정책: [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_negative_assertion_needs_mutation_probe]]
 */
import { describe, it, expect } from "vitest";
import { DECISION_DOMAINS, DECISION_DOMAIN_LABELS } from "@/lib/korean-law/types";
import { buildDecisionSourceUrl } from "@/lib/korean-law/client-law";
import { IMPACT_DOMAINS } from "@/lib/korean-law/impact-map";

/** 법제처 응답이 스스로 밝힌 정체 (실측 근거는 파일 상단 주석). */
const GROUND_TRUTH = {
  detc: "헌재결정례",
  expc: "법령해석례",
  ppc: "개인정보보호위원회",
  acr: "국민권익위원회",
} as const;

/** 빈 응답만 돌려주던 무효 target — 셀렉터에 죽은 선택지로 남아 있었다. */
const REMOVED_INVALID = ["pipc", "oia", "nhrc", "lawnkor"];

describe("DOM — 도메인 라벨은 법제처 실측과 일치한다", () => {
  it.each(Object.entries(GROUND_TRUTH))("DOM-1 %s → %s", (domain, truth) => {
    expect(DECISION_DOMAIN_LABELS[domain as keyof typeof DECISION_DOMAIN_LABELS]).toBe(truth);
  });

  it("DOM-2: 원문 링크도 같은 정체를 가리킨다 (종전엔 클릭 시 다른 종류의 페이지가 열렸다)", () => {
    expect(decodeURIComponent(buildDecisionSourceUrl("detc", "1"))).toContain("/헌재결정례/");
    expect(decodeURIComponent(buildDecisionSourceUrl("expc", "1"))).toContain("/법령해석례/");
  });

  it("DOM-3(긍정 짝): 애초에 맞던 도메인은 그대로", () => {
    expect(DECISION_DOMAIN_LABELS.prec).toBe("대법원 판례");
    expect(decodeURIComponent(buildDecisionSourceUrl("prec", "1"))).toContain("/판례/");
    expect(decodeURIComponent(buildDecisionSourceUrl("admrul", "1"))).toContain("/행정규칙/");
  });
});

describe("DOM — 무효 target 은 열거에서 빠진다", () => {
  it("DOM-4: 빈 응답만 주던 4개 도메인은 선택지에 없다", () => {
    for (const d of REMOVED_INVALID) {
      expect(DECISION_DOMAINS as readonly string[]).not.toContain(d);
      expect(Object.keys(DECISION_DOMAIN_LABELS)).not.toContain(d);
    }
  });

  it("DOM-5: 열거와 라벨 맵은 정확히 같은 키 집합", () => {
    expect(Object.keys(DECISION_DOMAIN_LABELS).sort()).toEqual([...DECISION_DOMAINS].sort());
  });
});

describe("DOM — 「법령해석례를 뒤진다」는 의도가 실제 target 과 맞는다", () => {
  it("DOM-6: 조문 영향 그래프는 헌재결정례가 아니라 법령해석례를 본다", () => {
    // 종전 IMPACT_DOMAINS 는 주석에 "법령해석례(detc)" 라 쓰고 detc(=헌재결정례)를 뒤졌다.
    expect(IMPACT_DOMAINS).toContain("expc");
    expect(IMPACT_DOMAINS).not.toContain("detc");
    expect(IMPACT_DOMAINS.map((d) => DECISION_DOMAIN_LABELS[d])).toContain("법령해석례");
  });
});
