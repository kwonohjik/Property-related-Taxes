/**
 * anchor: 🔴 G-07 A안 — 상속·증여 「가산세 미포함」이 화면에 남는다
 *
 * ## 종전 결함
 *
 * 마법사는 「무신고 / 기한후신고」를 **입력받는데**(`Step4Deductions.tsx` 3-state ·
 * `GiftCreditChecklist.tsx` 토글) 엔진은 그 선택으로 §69 신고세액공제만 제거할 뿐
 * 「국세기본법」 §47의2·§47의4 가산세를 산출하지 않는다. 그 상태에서 별지 제10호서식은
 * ㊷㊸㊹ 칸에 **「—」가 아니라 「0」**을 인쇄했다 — 계산 결과처럼 읽힌다.
 *
 * 별지9호는 같은 상태를 dash 로 인쇄한다(`filing-form-9-data.ts:79` `amtRow`).
 * **같은 제품의 두 서식이 같은 상태를 다르게 인쇄**하고 있었다.
 *
 * ## 조문
 *
 * 「상속세 및 증여세법」 §78①②는 **삭제**됐다(KoreanLaw MST 276123 실측) — 상속·증여의
 * 신고불성실·납부지연은 「국세기본법」 §47의2·§47의3·§47의4가 유일 근거다. 현행 §78③~⑮는
 * 공익법인 축(㊹)이라 별개다.
 *
 * ## 범위
 *
 * A안은 **세액을 바꾸지 않는다.** 가산세를 산출하는 것은 B1이다
 * (`docs/00-pm/inheritance-gift-penalty-g07.plan.md` §8.3).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBesshi10Rows } from "@/lib/tax-engine/gift-tax-filing-form-besshi10";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { DEFAULT_INHERITANCE_GIFT_BRACKETS } from "@/lib/tax-engine/inheritance-gift-common";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

/** 직계비속 부동산 10억 — 리뷰 §G-07 재현 격자 (기존 besshi10 픽스처와 같은 형태) */
function giftInput(isFiledOnTime: boolean): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "mother",
    giftItems: [
      { id: "g1", category: "real_estate_apartment", name: "재산", marketValue: 1_000_000_000 },
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime },
  } as GiftTaxInput;
}

describe("G-07 A-1 별지10호 가산세 3칸 — 0이면 「—」 (별지9호와 통일)", () => {
  const r = calcGiftTax(giftInput(false));
  const rows = r.besshi10Rows;

  it.each(["㊷", "㊸", "㊹"])("A1-1: %s 은 산출하지 않으므로 dash 다", (num) => {
    const row = rows.find((x) => x.number === num);
    expect(row, `${num} 행이 없다`).toBeDefined();
    expect(row!.amount).toBe(0);
    // 종전: display "amount" 하드코딩 → 화면에 「0」이 찍혔다
    expect(row!.display, `${num} 이 「0」을 인쇄한다`).toBe("dash");
  });

  it("A1-2: 🔑 값이 실리면 금액 표시로 돌아간다 (B1 대비 — 규칙이지 상수가 아니다)", () => {
    const withPenalty = buildBesshi10Rows(
      giftInput(false),
      { ...r, underreportPenalty: 45_000_000 },
      DEFAULT_INHERITANCE_GIFT_BRACKETS,
    );
    const row = withPenalty.find((x) => x.number === "㊷")!;
    expect(row.amount).toBe(45_000_000);
    expect(row.display).toBe("amount");
  });

  it("A1-3: ⛔ ㊺ 항등식은 그대로 성립한다 (amount 는 건드리지 않았다)", () => {
    const get = (n: string) => rows.find((x) => x.number === n)!.amount;
    expect(get("㊺")).toBe(
      get("㉞") + get("㉟") - get("㊱") - get("㊲") + get("㊷") + get("㊸") + get("㊹"),
    );
  });

  it("A1-4: 별지9호와 같은 규칙이다 (dash 판정이 두 서식에서 일치)", () => {
    expect(read("lib/calc/filing-form-9-data.ts")).toContain(
      'display: opts?.forceAmount || amount > 0 ? "amount" : "dash"',
    );
    expect(read("lib/tax-engine/gift-tax-filing-form-besshi10.ts")).toContain(
      'display: amount > 0 ? "amount" : "dash"',
    );
  });
});

describe("G-07 A-2·A-3 결과 화면 고지 — 법정기한 내 신고가 아니면 뜬다", () => {
  it("A2-1: 🔴 엔진이 신고 여부를 echo 한다 (고지 게이트)", () => {
    expect(calcGiftTax(giftInput(false)).creditDetail.isFiledOnTime).toBe(false);
    expect(calcGiftTax(giftInput(true)).creditDetail.isFiledOnTime).toBe(true);
  });

  it("A2-2: ⛔ echo 는 세액을 바꾸지 않는다 (표시 전용)", () => {
    const off = calcGiftTax(giftInput(false));
    // 무신고면 §69 신고세액공제만 0이 된다 — 가산세는 여전히 산출하지 않는다
    expect(off.creditDetail.filingCredit).toBe(0);
    expect(off.underreportPenalty).toBe(0);
    expect(off.latePaymentPenalty).toBe(0);
  });

  /**
   * 🔴 B1 이후 **scope 가 갈린다** — 증여세는 §47의2·§47의3을 실제로 산출하므로 남은 축
   * (부정행위율 B2 · 납부지연 B3)만 고지하고, 상속세는 아직 전부 미산출이다.
   * 배너가 「전부 미포함」이라고 계속 말하면 그 자체가 새 거짓말이 된다.
   */
  it.each([
    ["components/calc/results/GiftTaxResultView.tsx", "증여세", ' scope="filing-only"'],
    ["components/calc/results/InheritanceTaxResultView.tsx", "상속세", ""],
  ])("A2-3: %s 가 고지 배너를 배선한다", (rel, label, scope) => {
    const src = read(rel);
    expect(src).toContain(
      'import { PenaltyNotIncludedNotice } from "@/components/calc/results/shared/PenaltyNotIncludedNotice"',
    );
    expect(src).toContain("result.creditDetail.isFiledOnTime === false");
    expect(src).toContain(`<PenaltyNotIncludedNotice taxLabel="${label}"${scope} />`);
  });

  it("A2-4: 배너 **렌더 문구**가 세 조문을 모두 가리킨다 (scope=\"all\" — 상속세)", () => {
    const src = read("components/calc/results/shared/PenaltyNotIncludedNotice.tsx");
    expect(src).toContain("가산세가 포함되어 있지 않습니다");
    /**
     * 🔑 파일 전체를 `toContain`으로 훑으면 **JSDoc 헤더의 조문 인용에 걸려** 렌더 문구에서
     * 조문을 지워도 통과한다(뮤테이션 실측 M-A2d GREEN). 렌더되는 문장 그대로 단언한다.
     */
    expect(src).toContain(
      "(국세기본법 §47의2 무신고 · §47의3 과소신고 · §47의4 납부지연)",
    );
  });
});

describe("G-07 A-4·A-5 입력 위젯 — 고르는 자리에서 밝힌다", () => {
  /**
   * 🔴 B1 이후 증여 화면은 「미포함」이 아니라 **적용 세율**을 밝힌다 — 실제로 산출하기
   * 때문이다. 「미포함」 문구를 그대로 두면 계산해 놓고 안 했다고 말하는 셈이 된다.
   */
  it("A4-1: 증여 신고 상태 라디오가 적용 세율·감면을 밝힌다", () => {
    const src = read("components/calc/gift/GiftCreditChecklist.tsx");
    expect(src).toContain("무신고가산세 20% (국세기본법 §47의2①2호)");
    expect(src).toContain("§48②2호 감면(1개월 50% · 3개월 30% · 6개월 20%)");
    expect(src).toContain("기한후신고가 아니므로 §48②2호 감면 대상이 아닙니다");
  });

  it("A5-1: 상속 3-state 중 late·none 두 옵션 모두", () => {
    const src = read("components/calc/inheritance/Step4Deductions.tsx");
    // 기한후신고는 §48②2호 감면 대상이라는 사실까지 함께 밝힌다
    expect(src).toContain("§48②2호 감면 대상");
    const hits = src.match(/이 계산에 포함되지 않습니다/g) ?? [];
    expect(hits.length, "late·none 두 옵션 모두에 있어야 한다").toBe(2);
  });
});
