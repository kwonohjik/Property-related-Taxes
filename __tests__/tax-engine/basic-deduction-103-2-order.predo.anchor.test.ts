/**
 * Pre-Do anchor — **§103② 법정 순서**: 감면소득금액 «외»에서 먼저, 그 안에서 «먼저 양도한 자산»부터
 *
 * ── 법령 (법제처 실독, 시행 2026-01-01) ────────────────────────────────
 * 「소득세법」 §103②
 *   「제1항을 적용할 때 제95조에 따른 양도소득금액에 이 법 또는 「조세특례제한법」이나 그 밖의
 *    법률에 따른 **감면소득금액이 있는 경우에는 그 감면소득금액 외의 양도소득금액에서 먼저
 *    공제**하고, 감면소득금액 외의 양도소득금액 중에서는 해당 과세기간에 **먼저 양도한 자산의
 *    양도소득금액에서부터 순서대로 공제**한다.」
 *
 * 「소득세법」 §90① — 감면액 산식이 **`(B − C)`**이고 `C`가 바로 §103②의 기본공제다.
 *   ⇒ 기본공제가 **감면대상 양도소득금액에 붙으면 감면액이 줄어든다.** §103②이 그것을 막는다.
 *
 * ── 종전 상태 ─────────────────────────────────────────────────────────
 * 기본값이 **`MAX_BENEFIT`(높은 세율 우선)** 이었다. 법정 순서가 아니다. 게다가 그 전략은
 * **자기 이름도 지키지 않았다** — `rateGroup` 우선순위로 먼저 정렬하는데 그 순위가 실효세율과
 * 어긋난다(`short_term` 40% > `multi_house_surcharge` 72%). 실측 880,000·330,000원 과대.
 * ⇒ 사용자 결정(2026-09-16): **다건에서 `MAX_BENEFIT`을 삭제**하고 법문대로 간다.
 *
 * 🔑 **§103② 1단계는 감면액 산식에는 이미 있었다** — `transfer-tax-aggregate-reduction-step.ts`가
 *    `nonReducibleIncome`(비감면소득 총액)으로 C를 먼저 흡수시킨다. 빠진 것은 **자산별 배분 축**이라
 *    표시(`allocatedBasicDeduction`)와 그룹 과세표준이 법문과 어긋났다.
 *
 * 계획: 사용자 지시 — 「다건에서는 높은 세율 우선은 삭제하고 감면외 자산, 양도 일자 순 즉 법문대로」
 */
import { describe, it, expect } from "vitest";
import { allocateBasicDeduction } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";

const AVAILABLE = 2_500_000;
const D = (s: string) => new Date(s);

/** 감면 없음 — `reducibleIncome` 미지정 */
const plain = (idx: number, income: number, date: string) => ({
  idx,
  income,
  transferDate: D(date),
});

describe("§103② 기본공제 배분 순서", () => {
  // ── 🔴 B-0 ────────────────────────────────────────────────────────
  it("B-0: 기본은 양도일 이른 자산부터", () => {
    const r = allocateBasicDeduction(
      [plain(0, 100_000_000, "2026-05-01"), plain(1, 100_000_000, "2026-02-01")],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]);
  });

  // ── 🔴 B-1 — **핵심** ─────────────────────────────────────────────
  it("B-1: 감면 자산이 «먼저 양도»됐어도 비감면 자산이 우선한다 (§103② 1단계)", () => {
    const r = allocateBasicDeduction(
      [
        // 양도일이 더 이르지만 **전액 감면대상** → 2단계로 밀린다
        { idx: 0, income: 100_000_000, transferDate: D("2026-02-01"), reducibleIncome: 100_000_000 },
        // 양도일이 늦지만 비감면 → 1단계
        plain(1, 100_000_000, "2026-05-01"),
      ],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]);
  });

  // ── 🔴 B-2 ────────────────────────────────────────────────────────
  it("B-2: 부분 감면 자산은 «비감면 부분»만 1단계로 흡수한다", () => {
    const r = allocateBasicDeduction(
      [
        // 비감면분 1,000,000 + 감면분 99,000,000
        { idx: 0, income: 100_000_000, transferDate: D("2026-02-01"), reducibleIncome: 99_000_000 },
        plain(1, 100_000_000, "2026-05-01"),
      ],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    // 1단계: idx0의 비감면 1,000,000 → 이어서 idx1 1,500,000 (양도일 순)
    expect(r).toEqual([
      { idx: 0, amount: 1_000_000 },
      { idx: 1, amount: 1_500_000 },
    ]);
  });

  // ── 🔴 B-3 ────────────────────────────────────────────────────────
  it("B-3: 비감면이 모자라면 남은 공제가 감면분으로 넘어간다 (양도일 순)", () => {
    const r = allocateBasicDeduction(
      [
        { idx: 0, income: 100_000_000, transferDate: D("2026-02-01"), reducibleIncome: 100_000_000 },
        { idx: 1, income: 1_000_000, transferDate: D("2026-05-01") }, // 비감면 1,000,000뿐
      ],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r).toEqual([
      { idx: 1, amount: 1_000_000 }, // 1단계
      { idx: 0, amount: 1_500_000 }, // 2단계 잔여
    ]);
  });

  // ── 🔴 B-4 ────────────────────────────────────────────────────────
  it("B-4: `reducibleIncome`이 income보다 크면 income으로 캡된다 — 초과 배분 금지", () => {
    // 차손 통산으로 income이 줄어든 감면 자산은 단건 시점 `reducibleIncome`이 **더 클 수 있다**.
    // 캡이 없으면 2단계가 `reducibleIncome`만큼 흡수해 **자산 소득금액을 넘는 공제**가 배분된다.
    const r = allocateBasicDeduction(
      [{ idx: 0, income: 1_000_000, transferDate: D("2026-02-01"), reducibleIncome: 50_000_000 }],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r, "배분액은 자산 소득금액을 넘을 수 없다").toEqual([{ idx: 0, amount: 1_000_000 }]);
  });

  // ── 🔴 B-5 ────────────────────────────────────────────────────────
  it("B-5: FIRST도 §103② 1단계(감면 외 우선)를 따른다 — 순서만 입력순", () => {
    const r = allocateBasicDeduction(
      [
        { idx: 0, income: 100_000_000, transferDate: D("2026-02-01"), reducibleIncome: 100_000_000 },
        plain(1, 100_000_000, "2026-05-01"),
      ],
      AVAILABLE,
      "FIRST",
    );
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]);
  });

  // ── 🔴 B-6 ────────────────────────────────────────────────────────
  it("B-6: `MAX_BENEFIT`은 더 이상 존재하지 않는다", () => {
    // 타입에서 제거됐으므로 런타임에서도 받아선 안 된다 — 들어오면 법정 순서로 처리한다.
    const r = allocateBasicDeduction(
      [plain(0, 100_000_000, "2026-05-01"), plain(1, 100_000_000, "2026-02-01")],
      AVAILABLE,
      "MAX_BENEFIT" as unknown as "EARLIEST_TRANSFER",
    );
    expect(r, "구 세션·구 이력의 MAX_BENEFIT은 양도일 순으로 흡수된다").toEqual([
      { idx: 1, amount: AVAILABLE },
    ]);
  });

  // ── 🔴 B-9 — **조문이 침묵하는 자리** ─────────────────────────────
  it("B-9: 양도일이 같으면 한계세율 내림차순 — 입력 순서에 의존하지 않는다", () => {
    // §103②은 「같은 날 양도한 자산」 사이의 순서를 정하지 않는다. 그대로 두면 stable sort가
    // **입력 순서**로 떨어져 같은 사안의 세액이 목록 순서에 따라 갈린다.
    const hi = { idx: 0, income: 100_000_000, transferDate: D("2026-06-01"), rate: 0.5 };
    const lo = { idx: 1, income: 100_000_000, transferDate: D("2026-06-01"), rate: 0.4 };
    const a = allocateBasicDeduction([hi, lo], AVAILABLE, "EARLIEST_TRANSFER");
    const b = allocateBasicDeduction([lo, hi], AVAILABLE, "EARLIEST_TRANSFER");
    expect(a).toEqual([{ idx: 0, amount: AVAILABLE }]);
    expect(b, "입력 순서를 뒤집어도 같아야 한다").toEqual([{ idx: 0, amount: AVAILABLE }]);
  });

  it("B-10: 동순위 tie-break보다 **§103② 1단계가 우선**한다", () => {
    // 세율이 높아도 전액 감면대상이면 2단계로 밀린다 — 조문이 정한 축이 먼저다.
    const r = allocateBasicDeduction(
      [
        { idx: 0, income: 100_000_000, transferDate: D("2026-06-01"), rate: 0.7, reducibleIncome: 100_000_000 },
        { idx: 1, income: 100_000_000, transferDate: D("2026-06-01"), rate: 0.4 },
      ],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]);
  });

  // ── 🟢 감시 ───────────────────────────────────────────────────────
  it("B-7 🟢: 공제 여력이 0이거나 대상이 없으면 빈 배열", () => {
    expect(allocateBasicDeduction([plain(0, 1, "2026-01-01")], 0, "EARLIEST_TRANSFER")).toEqual([]);
    expect(allocateBasicDeduction([], AVAILABLE, "EARLIEST_TRANSFER")).toEqual([]);
  });

  it("B-8 🟢: 한 자산이 공제 전액을 흡수하면 나머지는 배분되지 않는다", () => {
    const r = allocateBasicDeduction(
      [plain(0, 100_000_000, "2026-01-01"), plain(1, 100_000_000, "2026-02-01")],
      AVAILABLE,
      "EARLIEST_TRANSFER",
    );
    expect(r).toEqual([{ idx: 0, amount: AVAILABLE }]);
  });
});
