/**
 * anchor — §166⑤ 분기별 LTHD **표1 「3년 미만 0%」 게이트** (T1-03)
 *
 * ## 이 항목은 리뷰에서 **검증 미완**이었다 (적대적 검증자가 API 오류로 죽었다)
 *
 * 2026-08-26 뮤테이션 실측 — `computeLthdRateSplit`의 `years < 3` 게이트 제거:
 *
 * | 시점 | 반응 |
 * |---|---|
 * | 이 anchor **전** | 5/14314 (`carryover-detail-dropped` · `successor-lthd-table2`) |
 * | 이 anchor **후** | **10/14351** — 이 파일이 5건을 더한다 |
 *
 * 기존 5건은 §166⑤ **1호/2호나목의 기산 구간 차이**를 보지 않는다. 이 anchor는 그 축을
 * 경계값과 함께 고정한다.
 *
 * ## ⚠️ 첫 프로브는 **안 타는 경로**를 재고 있었다 (기록으로 남긴다)
 *
 * 처음에는 「§166 내부 `computeLthdRate`만 게이트 우회」로 재서 **0/14322**를 얻고
 * 「§166 경로는 완전 사각지대」라고 적었다. 그런데 `computeLthdRate`는
 * **호출부가 0개인 dead code**다(`redevelopment-lthd.ts:360` — §166 분기들은
 * `computeLthdRateSplit`을 직접 부른다). 0은 「사각지대」가 아니라 **측정 실패**였다.
 *
 * ⇒ 뮤테이션 대상이 실제 실행 경로에 있는지부터 확인할 것
 *   (memory `feedback_anchor_observes_wrong_stage` — 구별력 0이면 단언이 아니라 경로를 의심한다).
 *
 * ## 조문 — 기산 구간이 **양도 대상별로 다르다**
 *
 * · 「소득세법」 §95② 별표 표1 — 보유기간 **3년 이상**부터 공제한다(3년 미만은 대상 자체가 아니다).
 * · 「소득세법 시행령」 §166⑤**1호**(조합원입주권 양도) — 인가전 분 = **종전자산 취득일 ~ 관리처분 인가일**.
 *   인가후 기존주택분·청산금분은 LTHD 대상 부존재(§95② 대상자산은 토지·건물이고 입주권은 권리다).
 * · 같은 항 **2호 나목**(완공 신축APT 양도) — 기존건물분 = **취득일 ~ 신축주택 양도일** 하나로 묶인다
 *   (`preApproval`·`postApprovalExistingHouse`가 **같은 보유기간·같은 율**을 쓴다).
 *
 * ⚠️ 이 차이가 이 anchor의 핵심이다 — 입주권은 **인가일에서 끊기므로** 전체 보유가 20년이어도
 *    인가전 분이 3년 미만일 수 있다. 완공APT에는 그 함정이 없다(양도일까지 이어진다).
 *    첫 작성에서 apt 픽스처로 인가일을 짧게 잡았다가 이 구조 때문에 단언이 어긋났고,
 *    코드가 인용한 §166⑤1호·2호나목을 읽어 픽스처를 조문 구조에 맞췄다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function run(
  subject: "right" | "apt",
  acquisitionDate: string,
  approvalDate: string,
  transferDate: string,
) {
  const redevelopment = {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date(approvalDate),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    exemptionEligibleAtApproval: false,
  } as RedevelopmentInfo;

  const input: TransferTaxInput = baseTransferInput({
    propertyType: subject === "right" ? "right_to_move_in" : "redevelopment_apt",
    transferPrice: 520_000_000,
    transferDate: new Date(transferDate),
    acquisitionDate: new Date(acquisitionDate),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false, // 표1 축 — 표2(1세대1주택)는 별도 anchor가 담당한다
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment,
  });
  return calculateTransferTax(input, mockRates).redevelopmentDetail!;
}

describe("T1-03 · §166⑤ LTHD 3년 미만 게이트 — 조합원입주권(1호)", () => {
  it("T1-03-01: 대조군 — 취득~인가 13년이면 표1 공제가 붙는다", () => {
    const d = run("right", "2005-04-09", "2018-10-23", "2023-03-02");
    expect(d.preApproval.lthd).toBeGreaterThan(0);
  });

  it("T1-03-02: 🔑 취득~인가 2년 — 표1 대상이 아니므로 공제가 0이다", () => {
    const d = run("right", "2019-06-01", "2021-06-01", "2026-03-02");
    // 게이트가 회귀로 사라지면 3년차 6%가 붙어 공제가 양수가 된다.
    expect(d.preApproval.lthd).toBe(0);
  });

  /**
   * 경계 — `calculateHoldingPeriod`는 **초일을 산입하지 않는다**(실측):
   *
   * | 취득일 → 2021-06-01 | 결과 |
   * |---|---|
   * | 2018-06-01 | 2년 11개월 30일 → **years 2** (공제 0) |
   * | 2018-05-31 | 3년 0개월 0일 → **years 3** (공제 시작) |
   *
   * ⚠️ 이 산정 관례(초일 불산입)가 「소득세법」 §95④의 「취득일부터 양도일까지」와 맞는지는
   *    이 anchor의 쟁점이 아니다 — 여기서는 **실측 경계를 고정**해 조용한 이동을 막는다.
   */
  it("T1-03-03: 경계 — years 2와 years 3이 갈리는 지점 (실측 초일 불산입)", () => {
    expect(run("right", "2018-06-01", "2021-06-01", "2026-03-02").preApproval.lthd).toBe(0);
    expect(run("right", "2018-05-31", "2021-06-01", "2026-03-02").preApproval.lthd).toBeGreaterThan(0);
  });

  it("T1-03-04: 🔑 §166⑤1호 고유 함정 — 전체 보유 20년이어도 인가전 분이 짧으면 0이다", () => {
    // 취득 2019-06-01 ~ 양도 2039-03-02은 20년이지만, 1호는 **인가일에서 끊는다**.
    const d = run("right", "2019-06-01", "2021-06-01", "2039-03-02");
    expect(d.preApproval.lthd).toBe(0);
  });

  it("T1-03-05: 세액이 실제로 갈린다 — 공제가 0이면 더 낸다", () => {
    const short = run("right", "2019-06-01", "2021-06-01", "2026-03-02");
    const long = run("right", "2017-06-01", "2021-06-01", "2026-03-02"); // 3년 11개월
    expect(short.total.lthd).toBe(0);
    expect(long.total.lthd).toBeGreaterThan(0);
  });
});

describe("T1-03 · §166⑤2호나목 — 완공 신축APT는 양도일까지 이어진다", () => {
  it("T1-03-06: 취득~양도 2년 — 기존건물분 공제가 0이다", () => {
    const d = run("apt", "2021-01-01", "2021-06-01", "2023-06-01");
    expect(d.preApproval.lthd).toBe(0);
    expect(d.postApprovalExistingHouse.lthd).toBe(0);
  });

  it("T1-03-07: 🔑 인가일이 짧아도 취득~양도가 길면 공제가 붙는다 (1호와 반대)", () => {
    // 같은 「취득~인가 2년」이라도 완공APT는 **양도일까지** 세므로 공제가 살아 있다.
    const d = run("apt", "2019-06-01", "2021-06-01", "2026-03-02");
    expect(d.preApproval.lthd).toBeGreaterThan(0);
  });
});
