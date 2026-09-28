/**
 * anchor: 취득세 주택 수 제외 — 지방세법 시행령 §28의4⑥ 호 번호 고정 (계획서 D-9)
 *
 * 종전 상수는 ⑥10호(혼인 전 분양권)·⑥11호(한시 특례 보유 주택)를 인용했으나, 2020.8.12. 이후
 * 모든 시행본(DRF eflaw 대조)에서 제외 항(⑤ → 2024.3.26.부터 ⑥)은 **최대 9호**다.
 *
 * 현행 본문(MST 288831, 시행 2026.9.18.) ⑥ 해당 호 — verbatim:
 *  - 3호 「상속을 원인으로 취득한 주택, 조합원입주권, 주택분양권 또는 오피스텔로서 상속개시일부터
 *        5년이 지나지 않은 주택, 조합원입주권, 주택분양권 또는 오피스텔」
 *  - 6호 「혼인한 사람이 혼인 전 소유한 주택분양권으로 주택을 취득하는 경우 다른 배우자가
 *        혼인 전부터 소유하고 있는 주택」 (2023.3.14. ⑤6호로 신설 → 2024.3.26. ⑥6호)
 *  - 7호 「제2항제1호부터 제3호까지의 규정에 해당하는 주택」 (2024.3.26. 신설)
 *
 * 세 겹으로 고정한다:
 *  1. 상수값 = 기대 인용(호 번호).
 *  2. 상수값과 **같은 citation**의 매니페스트 규칙이 있고, 그 키워드가 「{호}. 」 + verbatim으로
 *     시작한다 → `npm run verify:legal`이 법령 쪽 번호 변경(개정)을 잡는다.
 *  3. 엔진 결과 `legalBasis`에 그 상수가 실제로 실린다(배선).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import { VERIFICATION_MANIFEST } from "@/lib/legal-verification/verifier-manifest";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";

const CASES = [
  {
    key: "HOUSE_COUNT_INHERITANCE_5YR",
    ho: 3,
    verbatim:
      "상속을 원인으로 취득한 주택, 조합원입주권, 주택분양권 또는 오피스텔로서 상속개시일부터 5년이 지나지 않은",
  },
  {
    key: "HOUSE_COUNT_PRE_MARRIAGE_RIGHT",
    ho: 6,
    verbatim:
      "혼인한 사람이 혼인 전 소유한 주택분양권으로 주택을 취득하는 경우 다른 배우자가 혼인 전부터 소유하고 있는 주택",
  },
  {
    key: "HOUSE_COUNT_HANSI_EXCLUSION",
    ho: 7,
    verbatim: "제2항제1호부터 제3호까지의 규정에 해당하는 주택",
  },
] as const;

describe("§28의4⑥ 호 번호 — 상수 ↔ 매니페스트 verbatim", () => {
  for (const c of CASES) {
    it(`${c.key} = ⑥${c.ho}호`, () => {
      expect(ACQUISITION[c.key]).toBe(`지방세법 시행령 §28의4⑥${c.ho}호`);
    });

    it(`${c.key} — 매니페스트 키워드가 「${c.ho}. 」 + verbatim`, () => {
      const rules = VERIFICATION_MANIFEST.filter((r) => r.citation === ACQUISITION[c.key]);
      expect(rules).toHaveLength(1);
      expect(rules[0].keywords).toEqual([expect.stringMatching(new RegExp(`^${c.ho}\\. `))]);
      expect(rules[0].keywords[0]).toBe(`${c.ho}. ${c.verbatim}`);
    });
  }
});

describe("§28의4⑥ 호 번호 — 엔진 legalBasis 배선", () => {
  // ⑥6호가 빼는 것은 「다른 배우자가 혼인 전부터 소유하고 있는 주택」이다 — 종전 엔진은 혼인 전
  // 분양권 자체를 뺐다(계획서 D-9b). 제외 대상을 배우자 주택으로 옮겨 같은 근거 배선을 지킨다.
  it("배우자 혼인 전 주택 제외 사유의 근거는 ⑥6호", () => {
    const result = calculateHouseCount({
      houses: [
        {
          id: "h1",
          standardValue: 300_000_000,
          type: "housing",
          acquisitionDate: "2018-01-01",
          isMetropolitan: true,
          ownedBySpouse: true,
        },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 500_000_000,
        acquiredViaRight: true,
        rightAcquisitionDate: "2022-05-01",
        viaPreMarriageSubscriptionRight: true,
        marriageDate: "2023-01-10",
      },
      referenceDate: "2025-06-01",
    });
    expect(result.excludedDetails).toHaveLength(1);
    expect(result.excludedDetails[0].reason).toBe("spouse_pre_marriage_house");
    expect(result.excludedDetails[0].legalBasis).toBe("지방세법 시행령 §28의4⑥6호");
  });

  it("보유 주택 한시 특례 신축 제외 사유의 근거는 ⑥7호", () => {
    const result = calculateHouseCount({
      houses: [
        {
          id: "h1",
          standardValue: 250_000_000,
          type: "urban_living",
          acquisitionDate: "2024-06-01",
          isMetropolitan: false,
          isHansiBenefitNewBuild: true,
        },
      ],
      rights: [],
      offices: [],
      referenceDate: "2025-06-01",
    });
    expect(result.excludedDetails).toHaveLength(1);
    expect(result.excludedDetails[0].reason).toBe("hansi_new_build");
    expect(result.excludedDetails[0].legalBasis).toBe("지방세법 시행령 §28의4⑥7호");
  });
});

describe("§28의4⑥ 호 번호 — 존재하지 않는 10호 이상 인용 금지", () => {
  // 2020.8.12. 이후 제외 항(⑤·⑥)은 최대 9호. 10호 이상 인용은 번호 오기다.
  const ROOTS = ["lib", "app", "components"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  for (const r of ROOTS) walk(join(process.cwd(), r));

  it("모집단이 비어 있지 않다", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("lib·app·components에 「28의4⑥1N호」 인용이 없다", () => {
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf-8")
        .split("\n")
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /28(?:조)?의4 ?⑥ ?[1-9][0-9]+호/.test(line)),
    );
    expect(hits).toEqual([]);
  });
});
