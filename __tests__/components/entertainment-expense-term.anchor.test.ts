/**
 * ET-1~3 — 화면 라벨은 「접대비」가 아니라 현행 법령 용어 「기업업무추진비」다.
 *
 * 근거 — 「법인세법」 제25조 (KoreanLaw 실측 2026-09-11 · 현행 시행일 2026-01-01):
 *   · 조 제목 = **「기업업무추진비의 손금불산입」**
 *   · 제1항 = 「이 조에서 "기업업무추진비"란 **접대**, 교제, 사례 또는 그 밖에 어떠한 명목이든
 *     상관없이 이와 유사한 목적으로 지출한 비용으로서 … 지출한 금액을 말한다」
 *   ⇒ 「접대」는 **정의 안의 예시어**이지 항목명이 아니다.
 *
 * 🔴 **이 anchor를 만든 이유 — 그 라벨을 지키는 것이 하나도 없었다.**
 *    정정 직전 실측: `grep -rn "접대비한도초과액\|접대비 한도초과액" __tests__ e2e` → **0건**.
 *    셀렉터로도 쓰이지 않아, 누가 되돌려도 전 테스트가 초록이었다.
 *
 * 🔑 **정정 직전에 두 파일의 용어가 실제로 갈려 있었다** — 상속·증여 v2의 같은 ⑯ 칸인데
 *    입력 화면(`FiscalYearAdjustmentTable`)은 「접대비」, 출력 PDF(`besshi-form-constants`)는
 *    「기업업무추진비」였다. 인용 드리프트는 이렇게 한 도메인 안에서도 갈린다.
 *    [[feedback_citation_drift_replicates_across_repo]]
 *
 * ⚠️ **필드명(`subEntertainmentExcess`·`niSubRow10`)은 바꾸지 않았다** — 저장된 데이터의 키다.
 *    이 anchor가 보는 것은 **사람에게 보이는 문구**뿐이다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** 표시 라벨을 담은 파일들 — 값은 「그 파일에서 라벨을 정의하는 줄」을 고르는 정규식 */
const LABEL_SITES = [
  {
    file: "components/calc/stock-transfer/statement-table/net-income-rows.ts",
    what: "주식양도세 순손익 계산서 행 10",
    labelLine: /keyPrefix: "niSubRow10"[^\n]*/,
  },
  {
    file: "components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx",
    what: "상속·증여 비상장주식 v2 사업연도 표 ⑯",
    labelLine: /key: "subEntertainmentExcess"[^\n]*/,
  },
  {
    file: "components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts",
    what: "상속·증여 별지 서식 제6쪽 ⑯",
    labelLine: /num: "⑯"[^\n]*/,
  },
] as const;

function labelLineOf(site: (typeof LABEL_SITES)[number]): string {
  const raw = readFileSync(join(ROOT, site.file), "utf8");
  const m = raw.match(site.labelLine);
  expect(m, `${site.file} 에서 ${site.what} 라벨 줄을 찾지 못했다 — 구조가 바뀌었으면 이 anchor를 갱신할 것`).not.toBeNull();
  return (m as RegExpMatchArray)[0];
}

describe("ET — 화면 라벨은 현행 법령 용어 「기업업무추진비」를 쓴다 (법인세법 §25)", () => {
  it.each(LABEL_SITES.map((s) => [s.what, s] as const))(
    "ET-1 [%s]: 라벨이 「기업업무추진비」를 쓴다",
    (_what, site) => {
      expect(labelLineOf(site)).toContain("기업업무추진비");
    },
  );

  it("ET-2: 구판 용어 「접대비」가 라벨에 남아 있지 않다", () => {
    // 🔑 부정형 단언에는 짝이 필요하다 — ET-1(「기업업무추진비를 «쓴다»」)이 그 짝이다.
    //    ET-2만 있으면 라벨을 통째로 지워도 통과한다.
    //    [[feedback_negative_anchor_needs_positive_twin]]
    for (const site of LABEL_SITES) {
      const line = labelLineOf(site);
      // "기업업무추진비"를 지운 뒤에도 "접대비"가 남는지 본다 — 부분 문자열 오탐 차단
      const withoutNew = line.replaceAll("기업업무추진비", "");
      expect(withoutNew, `${site.what} (${site.file})`).not.toContain("접대비");
    }
  });

  it("ET-3: 세 표시 지점이 «같은» 용어를 쓴다 (한 칸인데 화면·출력이 갈리지 않는다)", () => {
    // 정정 전 실제로 갈려 있었다: 입력 화면 「접대비」 vs 출력 PDF 「기업업무추진비」.
    const terms = LABEL_SITES.map((s) => (labelLineOf(s).includes("기업업무추진비") ? "new" : "old"));
    expect(new Set(terms).size, `용어가 갈렸다: ${JSON.stringify(terms)}`).toBe(1);
  });
});
