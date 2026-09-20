/**
 * 가드 — 판정 결과가 내보내는 **모든 법령 인용이 화면에서 열려야 한다**
 *
 * ## 왜 이 가드가 생겼나 (2026-09-20 · P4-2b-1 런타임 확인)
 *
 * 실제 dev 서버로 판정 route를 호출해 보니 일시적 2주택 처분기한의 근거가
 * **`"§155"`** 로 나왔다 — 법령명이 없다. `LawArticleModal`은 이 문자열을
 * `parseLawRef`로 푸는데(`law-article-modal.tsx:118`), 법령명이 없으면
 * 「본법↔시행령 오인 위험」으로 **`null`**을 반환하고(`law-url.ts:59-61`)
 * 모달은 **「조문 정보를 파싱할 수 없습니다」**만 띄운다.
 *
 * 즉 **가장 흔한 조건부 판정(G-3의 대표 사례)의 근거 조문 배지가 죽어 있었다.**
 *
 * 🔑 원인은 `shortArticle()`이다. 그 헬퍼는 `exemptReason` **문장 속 인라인 인용**
 *    (「일시적 2주택 (§155①)」)을 줄이려고 만든 것이라 그 용도에서는 옳다.
 *    그러나 `pending[].legalBasis`·`appliedExceptions[].legalBasis`는 화면이
 *    **구조화 인용**으로 소비한다 — 두 용도가 같은 헬퍼를 쓰면서 갈렸다.
 *
 * ## 이 가드가 지키는 것
 *
 * 단위 테스트로 값을 하나하나 적어 두면 **새 축이 추가될 때 따라오지 않는다**.
 * ⇒ 판정을 여러 시료로 돌려 **방출된 인용 전건**이 파싱되는지 본다.
 *   (`feedback_law_citation_must_name_statute_and_tier` · `feedback_citation_drift_replicates_across_repo`)
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { parseLawRef } from "@/lib/utils/law-url";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const PRESALE_START = new Date("2021-01-01");
const D = (s: string) => new Date(s);

const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, PRESALE_START);

/** 거주요건이 실제로 걸리는 시료 — 특례가 없으면 과세로 떨어진다. */
const RESIDENCE_BINDS = { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 };

/**
 * 인용을 실제로 **방출하는** 시료 모음.
 *
 * ⚠️ 시료가 인용을 하나도 내지 않으면 이 가드는 공회전한다 — 아래 [LB-0]이 그것을 막는다
 *    (`feedback_negative_assertion_needs_mutation_probe`).
 */
const CASES: Array<{ name: string; input: Partial<TransferTaxInput> }> = [
  {
    name: "§155① 일시적 2주택 — 처분기한 도과(조건부)",
    input: {
      householdHousingCount: 2,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2020-07-01"),
      },
    },
  },
  {
    name: "§155⑦3호 귀농주택 — 양도기한 도과(조건부)",
    input: {
      householdHousingCount: 2,
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: D("2018-01-01"),
        isHighPriceAtAcquisition: false,
        landAreaSqm: 500,
        wholeHouseholdMoved: true,
      },
    },
  },
  {
    name: "§155⑧ 수도권 밖 부득이 — 해소 후 기한",
    input: {
      householdHousingCount: 2,
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2019-01-01") },
    },
  },
  {
    name: "§154① 보유 2년 미달(조건부)",
    input: { acquisitionDate: D("2023-06-01") },
  },
  {
    name: "§155의2① 장기저당담보 — 거주요건 면제(적용 특례)",
    input: {
      ...RESIDENCE_BINDS,
      longTermMortgageHouse: {
        contractDate: D("2016-01-01"),
        borrowerAgeAtContract: 60,
        contractYears: 10,
        maturityLumpSumRepayment: true,
        transferredBeforeMaturity: false,
        isTransferredHouseMortgaged: true,
      },
    },
  },
  {
    name: "§155의3① 상생임대 — 거주요건 면제(적용 특례)",
    input: {
      ...RESIDENCE_BINDS,
      winWinRentalHouse: {
        winWinContractDate: D("2022-03-01"),
        increaseRatePct: 5,
        priorLeaseMonths: 18,
        winWinLeaseMonths: 24,
      },
    },
  },
  {
    name: "§155⑤ 혼인 합가",
    input: { householdHousingCount: 2, marriageMerge: { marriageDate: D("2020-01-01") }, isFirstTransferredInMerge: true },
  },
  {
    name: "§155⑥1호 문화유산 주택",
    input: { householdHousingCount: 2, culturalHeritageHouse: true },
  },
];

/** 한 판정이 내보내는 **구조화 인용 전부**(문장 속 인라인 인용은 대상이 아니다). */
function citationsOf(input: Partial<TransferTaxInput>): string[] {
  const j = judge(input);
  return [
    ...j.appliedExceptions.map((e) => e.legalBasis),
    ...j.pending.map((p) => p.legalBasis),
    ...j.legalBasis,
  ];
}

describe("판정 결과의 법령 인용은 화면에서 열려야 한다", () => {
  it("[LB-0] 가드 자체의 구별력 — 시료가 인용을 실제로 방출한다", () => {
    const total = CASES.reduce((n, c) => n + citationsOf(c.input).length, 0);
    expect(total).toBeGreaterThanOrEqual(CASES.length);
  });

  it.each(CASES)("[LB-1] $name — 인용 전건이 parseLawRef를 통과한다", ({ input }) => {
    const unparsable = citationsOf(input).filter((c) => parseLawRef(c) === null);
    expect(unparsable).toEqual([]);
  });

  it("[LB-2] 인용은 법령명과 법/령/규칙 층위를 밝힌다", () => {
    const all = CASES.flatMap((c) => citationsOf(c.input));
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c, `법령명 없는 인용: ${c}`).toMatch(/소득세법|조세특례제한법|국세기본법/);
    }
  });

  /**
   * 🔑 **음성 짝** — 가드가 실제로 잡는다는 증거. 이것이 통과하지 않으면
   *    [LB-1]의 「전건 통과」는 파싱 함수가 무엇이든 받아 준다는 뜻일 뿐이다.
   */
  it("[LB-3] 법령명 없는 인용은 실제로 파싱되지 않는다", () => {
    expect(parseLawRef("§155")).toBeNull();
    expect(parseLawRef("§155⑦3호")).toBeNull();
    expect(parseLawRef("소득세법 시행령 §155①")).not.toBeNull();
  });
});

/**
 * ## 🔴 시료 기반 가드만으로는 부족하다 — 정적 스캔을 함께 둔다
 *
 * 위 [LB-1]은 **내가 고른 시료가 닿는 축만** 본다. 실제로 이 가드를 처음 통과시킨 직후
 * `transfer-tax-exemption.ts`에서 같은 결함 **3건**(§155⑯·§155⑱·§155⑦)을 더 찾았다 —
 * 시료가 그 축을 안 건드려 조용히 통과했던 것이다
 * (`feedback_closure_claim_scoped_to_verified_subset`).
 *
 * ⇒ 「새 축이 추가돼도 따라오는」 가드는 **소스 스캔**이다. 구조화 인용 필드에
 *   `shortArticle()`을 쓰면 법령명이 사라지므로, 그 조합 자체를 금지한다.
 *
 * ✅ `shortArticle` 자체는 금지가 아니다 — `exemptReason`·`label` 같은 **문장·표시용**
 *    인라인 인용에서는 옳은 헬퍼다. 금지되는 것은 `legalBasis:` 에 쓰는 것뿐이다.
 */
describe("정적 가드 — `legalBasis:`에 shortArticle을 쓰지 않는다", () => {
  const FILES = [
    "lib/tax-engine/one-house/pending.ts",
    "lib/tax-engine/transfer-tax-exemption.ts",
  ];

  it("[LB-4] 구조화 인용 필드에 법령명을 지우는 헬퍼가 없다", async () => {
    const { readFileSync } = await import("fs");
    const offenders: string[] = [];
    for (const f of FILES) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/legalBasis:/.test(line) && /shortArticle\(/.test(line)) {
            offenders.push(`${f}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("[LB-5] 스캔이 실제로 파일을 읽는다(가드 자체의 구별력)", async () => {
    const { readFileSync } = await import("fs");
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src.length).toBeGreaterThan(1000);
      expect(src).toContain("legalBasis:");
    }
  });
});
