/**
 * anchor: §39 증자 **두 경로의 세액 불일치를 의도적으로 동결**한다 (cap-table 상장 단서 미해소)
 *
 * 계획서: docs/00-pm/capital-increase-captable-listed-proviso.plan.md v1.0 §7
 *
 * ⚠️⚠️ **이 파일이 고정하는 불일치는 "버그"가 아니라 「근거 조사 대기 중인 미해소 상태」다.**
 *      CT-1과 CT-3이 다른 값인 것을 보고 cap-table의 `perShareAfter`를 종가평균으로
 *      **치환하지 말 것** — 그 방법(계획서 §3 안 B)은 이미 실측으로 배제됐다(아래 §2).
 *
 * ── 무엇이 어긋나 있나 ──────────────────────────────────────────────────
 * Phase D(PR#992)가 §29②1가·3나 단서를 **sub-case 경로에만** 적용했다. 그 결과
 * **같은 사실관계**인데 사용자가 고른 모드에 따라 증여재산가액이 갈린다:
 *
 *     sub-case  (단서 적용)   180,000,000   ← CT-3
 *     cap-table (단서 미적용)  300,000,000   ← CT-1
 *
 * 단서가 없던 시절에는 두 경로가 **300,000,000으로 일치**했다(CT-1 == CT-2).
 * 즉 이 차이는 설계상 허용된 편차가 아니라 **PR#992가 만든 회귀**다.
 *
 * ── 왜 아직 안 고쳤나 (§2 zero-sum 붕괴) ────────────────────────────────
 * cap-table은 equity-delta 모델이라 ㉯가 **가중평균**일 때만 항등식이 성립한다:
 *     Σ postValuation = Σ preValuation + Σ paidIn  ⇒  Σ delta = 0  (`reconciliation.balanced`)
 * 이 항등식 위에 ⓐ 증여자/수증자 판정(delta 부호) ⓑ 증여자별 손해비례 배분이 얹혀 있다.
 * 단서의 ㉯는 **외생 시장가**라 가중평균이 아니다 ⇒ 항등식이 깨진다(실측 Σdelta = −400,000,000).
 * 그렇게 나온 값(20,000,000)은 법정 산식값 180,000,000과도 어긋나 **어느 해석으로도 정당화되지 않는다.**
 *
 * 남은 선택지는 A(호별 산식 재도입 — 배분 기준의 법령 근거 필요)와
 * C(상장이면 단일 모드 안내 — 근거 불요)뿐이며, **근거 확보 전에는 세액을 바꾸지 않는다**
 * (memory `feedback_unverified_authority_blocks_tax_change`).
 *
 * ── 이 anchor의 수명 ────────────────────────────────────────────────────
 * 안 A 채택 시  → CT-1이 180,000,000으로 바뀌어 CT-3과 일치. 그때 CT-1 기대값을 갱신한다.
 * 안 C 채택 시  → CT-1·CT-3 그대로 유지 + 「상장은 단일 모드」 안내 anchor가 추가된다.
 */
import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import type {
  CapitalIncreaseAllocationInput,
  CapitalIncreaseInput,
} from "@/lib/tax-engine/gift-deemed/types";

/**
 * 주주 2인 · 저가발행 · 실권주 전량 재배정.
 *   A: 60,000주 보유 · 배정 60,000 · 인수 0        (전량 실권 ⇒ 증여자)
 *   B: 40,000주 보유 · 배정 40,000 · 인수 100,000  (본인분 40,000 + 재배정 60,000 ⇒ 수증자)
 * 증자 전 1주 20,000 · 신주 인수가 10,000 ⇒ 이론 ㉯ = (20,000×100,000 + 10,000×100,000) ÷ 200,000 = 15,000
 */
const CAPTABLE: CapitalIncreaseAllocationInput = {
  direction: "low",
  preIssuePrice: 20_000,
  newSharePrice: 10_000,
  shareholders: [
    { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
    {
      id: "B",
      name: "B",
      preShares: 40_000,
      entitledShares: 40_000,
      subscribedShares: 100_000,
      reallocatedShares: 60_000,
      relatedTo: ["A"],
    },
  ],
};

/** 위와 **같은 사실관계**를 호별 산식(§29②1 가목 — 실권주 재배정)으로 표현한 것 */
const SUBCASE: CapitalIncreaseInput = {
  direction: "low",
  subType: "forfeited_realloc",
  preIssuePrice: 20_000,
  preIssueShares: 100_000,
  newSharePrice: 10_000,
  issuedShares: 100_000,
  forfeitedShares: 60_000, // B가 재배정받은 실권주수
};

describe("§39 cap-table ↔ sub-case — 상장 단서 미해소 불일치 동결", () => {
  it("CT-1: cap-table은 **이론 ㉯ 15,000** 기준 — B 300,000,000 · zero-sum 성립", () => {
    const r = calcCapitalIncreaseAllocation(CAPTABLE);
    expect(r.perShareAfter).toBe(15_000);
    expect(r.byShareholder.find((b) => b.id === "A")?.delta).toBe(-300_000_000);
    expect(r.byShareholder.find((b) => b.id === "B")?.delta).toBe(300_000_000);
    // ⭐ 이 불변식이 단서 치환을 막는 이유다 — 깨지면 배분 분모와 대상이 다른 기준이 된다
    expect(r.reconciliation).toEqual({
      totalGain: 300_000_000,
      totalLoss: 300_000_000,
      balanced: true,
    });
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(300_000_000);
  });

  it("CT-2: 단서가 **없으면** 두 경로가 일치한다 (cap-table 주석의 「대수적 동치」 실증)", () => {
    expect(calcCapitalIncreaseGift(SUBCASE).deemedGiftValue).toBe(300_000_000);
    expect(calcCapitalIncreaseAllocation(CAPTABLE).perBeneficiary[0].total).toBe(300_000_000);
  });

  it("CT-3 ⭐: 단서를 적용한 sub-case는 180,000,000 — cap-table과 **120,000,000 어긋난다**", () => {
    // §29②1가 단서: 상장 평가 13,000 < 이론 15,000 ⇒ 13,000 채택
    //   ⇒ (13,000 − 10,000) × 60,000 = 180,000,000
    const withProviso = calcCapitalIncreaseGift({
      ...SUBCASE,
      isListed: true,
      listedMarketAvg: 13_000,
    });
    expect(withProviso.deemedGiftValue).toBe(180_000_000);

    // 같은 사실관계인데 cap-table 경로는 단서를 반영하지 않아 300,000,000을 낸다.
    // ⚠️ 이 diff는 **의도된 미해소 상태**다 — 파일 상단 주석 참조. 치환으로 "고치지" 말 것.
    const capTable = calcCapitalIncreaseAllocation(CAPTABLE).perBeneficiary[0].total;
    expect(capTable - withProviso.deemedGiftValue).toBe(120_000_000);
  });

  /**
   * CT-5 — **부분 실권 + 재배정 동시 수령** (계획서 v1.5 §10)
   *
   * 🔧 **v1.5 정정**: 초판 주석은 「법정 산식은 A를 +50,000,000의 **수증자**로 본다 ⇒ 부호가 반대」라고
   *    했으나 **틀렸다** — **증여자 특정 단계를 빠뜨린 비교**였다.
   *    이 픽스처는 **실권자가 A 하나뿐**이라, A가 재배정받은 10,000주는 **전부 A 자신이 포기한
   *    실권주**에서 나온다. **자기 자신으로부터 증여받을 수 없으므로**(§39의3에서 이미 채택한 원칙 —
   *    조심2010서3741 현물출자자 자기지분 제외) A의 과세액은 **0**이고, cap-table 결과와 **일치**한다.
   *
   * ⇒ 이 케이스는 **불일치가 아니다.** 다만 cap-table이 A를 뺀 이유는 「자기증여 제외」가 아니라
   *   **delta 부호(상계)** 때문이다(코드에 자기증여 로직 **0건** — grep 실측). 즉 **우연히 일치**한다.
   *   실권자가 2명 이상이면 실제로 갈린다 → **CT-6**.
   *
   * ⚠️ 이 anchor는 **현행 동작만 고정**하며 값을 바꾸지 않는다.
   *
   * ── 별건 조사 결과 (계획서 v1.4 §10) ─────────────────────────────────
   * 「상계 없음」이 **유력**하다: ⓐ §39①1가는 「배정받은 자가 배정받음으로써 얻은 이익」만
   * 요건으로 삼고 상계 항이 없다 ⓑ 간접 근거 2건이 「명문 산식 우선·경제적 조정 배척」으로 일관 —
   *   · 조심 2017서4973 — 「**자산변동분**으로 증여재산가액을 깎아 달라」는 주장을 **기각**
   *     (equity-delta와 **같은 성격의 논거**가 배척된 사례)
   *   · 국심 1998중3040 — 「이론상 같아야 한다」는 주장 배척, 「시행령 명문 산식대로」
   * 다만 **직접 판시는 미발견**이고, 확정 시 결론이 **과소과세 시정**(납세자 불리) 방향이라
   * `feedback_no_unfavorable_application_without_legal_basis`가 걸린다 ⇒ **세액 변경 보류**.
   *
   * 🟡 남은 확인 경로: 국세청 「불균등증자시 실권주 일부는 재배정하고 나머지는 실권처리한 경우
   *    증여이익 계산」(2010.2.1.) 본문 — 법제처 API가 국세청 해석 본문을 제공하지 않아 **미확인**.
   *    taxlaw.nts.go.kr 에서 사람이 직접 열어야 한다(계획서 §10-6).
   */
  it("CT-5: 부분 실권 + 재배정 동시 — 실권자가 **1명뿐**이면 자기증여라 결과가 일치한다", () => {
    // A: 배정 60,000 중 자기분 20,000만 인수(40,000 실권) + 재배정 10,000 수령 ⇒ 총 30,000
    // B: 배정 40,000 전량 인수 + 재배정 30,000 수령 ⇒ 총 70,000
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 20_000,
      newSharePrice: 10_000,
      shareholders: [
        { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 30_000, reallocatedShares: 10_000, relatedTo: ["B"] },
        { id: "B", name: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 70_000, reallocatedShares: 30_000, relatedTo: ["A"] },
      ],
    });
    expect(r.perShareAfter).toBe(15_000);

    // 현행 cap-table — A는 상계 결과 **손해**라 증여자로 분류되고 수증자 명단에서 빠진다
    expect(r.byShareholder.find((b) => b.id === "A")?.delta).toBe(-150_000_000);
    expect(r.perBeneficiary.map((p) => p.beneficiaryId)).toEqual(["B"]);

    // 법정 산식 raw = (15,000 − 10,000) × 배정받은 실권주 10,000 = 50,000,000
    const statutoryRawA = (15_000 - 10_000) * 10_000;
    expect(statutoryRawA).toBe(50_000_000);
    // ⭐ 그러나 **증여자는 실권자뿐이고 여기선 A 자신뿐**이다 ⇒ 전액 자기증여 ⇒ 과세 0.
    //    총실권 40,000 중 A의 몫 40,000 = 100% 자기증여.
    const selfPortion = 40_000 / 40_000;
    expect(statutoryRawA * (1 - selfPortion)).toBe(0);
    // ⇒ 법정 0 == cap-table 0(수증자 명단 제외). **이 케이스는 불일치가 아니다.**
  });

  /**
   * CT-6 — ⭐ **진짜 불일치**: 실권자가 **2명 이상**이고 그중 하나가 재배정도 받는 경우
   *
   * A가 재배정받은 10,000주 중 **자기 실권분에 대응하는 부분만** 자기증여로 빠지고,
   * **다른 실권자(C)로부터 온 부분은 과세 대상**이다. 그런데 cap-table은 A의 delta가 음수라는
   * 이유만으로 A를 **수증자 명단에서 통째로 제외**한다(자기증여 로직이 아니라 상계의 부작용).
   *
   * ⚠️ 「자기 실권분을 실권주 풀 비율로 안분한다」는 것 자체는 **법에 명문이 없다** — 다만
   *    cap-table이 이미 쓰는 손해비례 배분과 **같은 비율**이라 내적 일관성은 있다.
   *    정답은 **미판정** ⇒ 이 anchor도 **현행 동작만 고정**한다.
   */
  it("CT-6 ⭐: 실권자 2명 중 하나가 재배정도 받으면 **수증자 판정이 갈린다**", () => {
    // A 20,000 실권 + 재배정 10,000 수령 · C 20,000 실권(재배정 없음) · B 재배정 30,000 수령
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 20_000,
      newSharePrice: 10_000,
      shareholders: [
        { id: "A", name: "A", preShares: 40_000, entitledShares: 40_000, subscribedShares: 30_000, reallocatedShares: 10_000, relatedTo: ["B", "C"] },
        { id: "C", name: "C", preShares: 30_000, entitledShares: 30_000, subscribedShares: 10_000, reallocatedShares: 0, relatedTo: ["A", "B"] },
        { id: "B", name: "B", preShares: 30_000, entitledShares: 30_000, subscribedShares: 60_000, reallocatedShares: 30_000, relatedTo: ["A", "C"] },
      ],
    });
    // 현행 — A는 delta 음수라 증여자로만 잡히고 수증자 명단에서 빠진다
    expect(r.byShareholder.find((b) => b.id === "A")?.delta).toBe(-50_000_000);
    expect(r.perBeneficiary.map((p) => p.beneficiaryId)).toEqual(["B"]);
    expect(r.splits.map((s) => `${s.donorId}>${s.beneficiaryId}=${s.value}`)).toEqual([
      "A>B=50000000",
      "C>B=100000000",
    ]);

    // 법정 산식 + 자기증여 제외 — A는 **C로부터 받은 부분만큼 수증자**다
    //   raw = 5,000 × 10,000 = 50,000,000 · 총실권 40,000 중 C 몫 20,000 = 50%
    const statutoryTaxableA = ((15_000 - 10_000) * 10_000 * 20_000) / 40_000;
    expect(statutoryTaxableA).toBe(25_000_000);
    // ⭐ 차이 25,000,000 — 단서와 **무관한** 기존 불일치. 정답 미판정이라 값은 바꾸지 않는다.
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "A")).toBeUndefined();
  });

  it("CT-4: naive 치환값 20,000,000은 **양쪽 어디와도 다르다** (안 B 배제 근거)", () => {
    // cap-table의 ㉯를 종가평균 13,000으로 그대로 치환했을 때의 delta를 산식으로 재현.
    //   A: 60,000×13,000 − 60,000×20,000 −        0 = −420,000,000
    //   B: 140,000×13,000 − 40,000×20,000 − 100,000×10,000 = +20,000,000
    const naive = (preShares: number, subscribed: number) =>
      (preShares + subscribed) * 13_000 - preShares * 20_000 - subscribed * 10_000;

    expect(naive(60_000, 0)).toBe(-420_000_000);
    expect(naive(40_000, 100_000)).toBe(20_000_000);
    // ⭐ Σdelta ≠ 0 ⇒ zero-sum 붕괴. 배분 분모(420,000,000) ↔ 배분 대상(20,000,000) 기준 불일치.
    expect(naive(60_000, 0) + naive(40_000, 100_000)).toBe(-400_000_000);
    // 그리고 그 20,000,000은 법정 산식값 180,000,000과도 다르다 ⇒ 안 B는 채택 불가.
    expect(naive(40_000, 100_000)).not.toBe(180_000_000);
  });
});
