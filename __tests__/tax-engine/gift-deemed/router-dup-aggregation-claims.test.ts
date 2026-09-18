/**
 * anchor(XX-B): `router.ts` 주석이 선언하는 **세 가지 사실**을 실측으로 고정한다.
 *
 * 이 주석은 한 번 stale이 됐다 — 「§43② 1년 합산도 미배선이다(특정법인 1억원 문턱 판정에
 * 필요)」라고 적혀 있었는데, 괄호가 지목한 바로 그 축이 구현된 뒤에도 문장이 남았다.
 * 주석은 테스트가 없으면 조용히 거짓이 되므로, **주장 자체를 단언**한다.
 *
 * ⚠️ 이 파일이 빨개지면 코드가 틀린 게 아니라 **주석이 늙은 것**일 수 있다.
 *    먼저 「지금 사실이 무엇인가」를 재고, 주석과 이 anchor를 함께 고친다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { calcSpecificCorpGift } from "@/lib/tax-engine/gift-deemed/specific-corp";

const GD = "lib/tax-engine/gift-deemed";
const read = (p: string) => readFileSync(p, "utf-8");

describe("주장① §43① 중복배제 구현체는 프로덕션 호출처가 0건이다", () => {
  it("[X-0] selectPrimaryDeemedGift를 부르는 프로덕션 파일이 없다", () => {
    const hits: string[] = [];
    for (const dir of ["lib", "components", "app"]) {
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = `${d}/${e.name}`;
          if (e.isDirectory()) walk(p);
          else if (/\.tsx?$/.test(e.name) && p !== `${GD}/dup-exclusion.ts`) {
            if (/selectPrimaryDeemedGift\s*\(/.test(read(p))) hits.push(p);
          }
        }
      };
      walk(dir);
    }
    // 주석이 「호출처 0건」이라 단언하므로, 배선하는 순간 여기서 잡혀 주석을 고치게 된다.
    expect(hits).toEqual([]);
  });

  it("[X-0b] 정의 파일 «안»에서 래핑해 내보내는 우회도 막는다", () => {
    // ⚠️ [X-0]은 정의가 있는 파일을 모집단에서 뺀다. 그 틈으로 같은 파일에 래퍼를 만들어
    //    내보내면 「호출처 0건」이 조용히 거짓이 된다(뮤테이션에서 실제로 생존했다).
    //    식별자가 «정의 1회»만 등장하는지로 막는다.
    const src = read(`${GD}/dup-exclusion.ts`);
    const uses = src.split("selectPrimaryDeemedGift").length - 1;
    expect(uses).toBe(1);
  });
});

describe("주장② §43② 1년 합산은 «축별 구현»으로 살아 있다 — 행위로 잰다", () => {
  // ⚠️ 종전에는 이 두 단언이 «주석 문구»를 정규식으로 봤다. 구현을 지우는 뮤테이션이
  //    문구를 한 군데만 바꿔도 통과해 **생존**했다 — 재는 대상이 틀렸던 것이다.
  //    [[feedback_anchor_observes_wrong_stage]]
  const loan = (loanDate: string) => ({
    loanDate,
    loanAmount: 500_000_000,
    actualInterestPaid: 0,
    appropriateRate: { numer: 46, denom: 1000 },
    isRelatedParty: true,
  });

  it("[X-1] §41의4 — router가 free_loan_aggregated를 실제로 분기한다", () => {
    const r = calcDeemedGift({
      type: "free_loan_aggregated",
      loans: [loan("2025-01-10"), loan("2025-06-10")],
    } as never) as { type: string; deemedGiftValue: number };
    // 분기를 지우면 router가 이 type에서 떨어져 나가 결과 자체가 달라진다.
    expect(r.type).toBe("free_loan_aggregated");
    expect(r.deemedGiftValue).toBeGreaterThan(0);
  });

  it("[X-2] §45의5 — 소급 1년 «안»의 선행거래만 합산된다", () => {
    // 픽스처 모양은 이 축의 소유 anchor(`specific-corp-43-2-aggregation.test.ts`)와 같다.
    const ONE = {
      type: "specific_corp",
      counterparty: "ruling_shareholder",
      transactionType: "gratuitous",
      corporateTax: 0,
      annualIncome: 0,
      ownershipRatio: { numer: 1, denom: 1 },
      controllingGroupRatio: { numer: 1, denom: 1 },
      transactionDate: "2026-03-02",
      transactionBenefit: 70_000_000,
    };
    const sc = (priorDate: string) =>
      calcSpecificCorpGift({
        ...ONE,
        priorTransactions: [{ date: priorDate, benefit: 50_000_000 }],
      } as never) as { deemedGiftValue: number };
    // 윈도 «안»(1년 이내)이면 합산돼 1억원 문턱을 넘고, «밖»이면 넘지 못한다.
    expect(sc("2025-09-02").deemedGiftValue).toBeGreaterThan(sc("2024-01-01").deemedGiftValue);
  });
});

describe("주장④ 주석이 배선된 두 축을 «이름으로» 적는다", () => {
  // ⚠️ 종전 문구를 «문자열 부정»으로 막으려 했더니, 경위를 설명하는 내 주석이 그 문장을
  //    인용하고 있어 스스로 걸렸다. 부정형 대신 **지금 사실을 긍정으로** 단언한다.
  it("[X-4] §41의4·§45의5가 배선 축으로 명시돼 있다", () => {
    const src = read(`${GD}/router.ts`);
    expect(src).toMatch(/§41의4/);
    expect(src).toMatch(/§45의5/);
    // §43①의 미배선 서술은 «여전히 참»이므로 남아 있어야 한다([X-0]이 뒷받침).
    expect(src).toMatch(/호출처가 0건/);
  });
});
