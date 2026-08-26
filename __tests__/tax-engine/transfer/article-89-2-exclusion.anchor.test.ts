/**
 * anchor — 「소득세법」 §89② 배제가 엔진에 **전혀 없었다** (C1-01 · Phase 1)
 *
 * ## 조문
 *
 * > **§89②** 1세대가 주택과 **조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는 경우**에는
 * > 제1항에도 불구하고 **같은 항 제3호를 적용하지 아니한다**. 다만 … **대통령령으로 정하는
 * > 경우**에는 그러하지 아니하다.
 *
 * 단서의 예외는 시행령 §156의2③~⑪(9항) + §156의3②~⑧(7항) = **총 16항**이다.
 *
 * ## 종전 실측 — 세 케이스가 완전히 동일했다
 *
 * 주택 1채 + 세대 보유 분양권/입주권을 넣어도 `checkExemption`이 두 입력
 * (`presaleRights`·`householdRightCount`)을 **한 번도 읽지 않아** 비과세가 그대로 적용됐다.
 *
 * ## 이 anchor가 고정하는 두 방향
 *
 * 1. **켜야 할 때 켠다** — 예외 16항을 전부 배제할 수 있는 조합에서 §89①3호가 꺼진다.
 * 2. ⭐ **켜면 안 될 때 켜지 않는다** — 예외 판정에 필요한 사실을 입력받을 경로가 없는 조합에서는
 *    **종전 동작을 유지**한다. 배제만 먼저 넣으면 그 예외에 해당하는 세대가 법 근거 없이
 *    불리해진다(memory `feedback_no_unfavorable_application_without_legal_basis`).
 *    방향 2가 없으면 이 기능은 「고쳤는데 더 틀린」 상태가 된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
} from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();

/**
 * 🔑 **분양권 축은 `makeMockRates()`로 측정할 수 없다.**
 *
 * §89②의 분양권 취득일 게이트는 DB `houseCountExclusionRules.presaleRightStartDate`를 쓰는데,
 * 그 규칙은 `makeMockRatesWithHouseEngine()`에만 들어 있다. 평범한 mock으로 돌리면 술어가
 * 분양권을 **아예 보지 않아**(기산일 미상 → 판정하지 않음) 어떤 단언도 게이트에 닿지 않는다.
 * 실제로 처음에 그렇게 썼다가 기산일 게이트를 통째로 제거하는 뮤테이션에 **16/16이 통과**했다 —
 * 사각지대가 아니라 **측정 실패**였다(memory `feedback_anchor_observes_wrong_stage`).
 */
const houseEngineRates = makeMockRatesWithHouseEngine();

/** 1주택 + 12억 이하 — 권리가 없으면 §89①3호로 전액 비과세되는 기준선. */
function houseInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    ...over,
  });
}

function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2016-10-01"), // 종전주택 취득(2015-06-01) + 1년 경과
    region: "capital",
    ...over,
  };
}

const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
/** 분양권 기산일 게이트를 실제로 태우는 실행기 — 위 주석 참조. */
const runHE = (input: TransferTaxInput) => calculateTransferTax(input, houseEngineRates);

describe("§89② 배제 — 켜야 할 때 켠다", () => {
  it("기준선: 권리 미보유 1주택 → §89①3호 전액 비과세", () => {
    const r = run(houseInput());
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("★ 조합원입주권 보유 + 1년 요건 미충족 → §89①3호 배제 (과세)", () => {
    // 종전주택 2015-06-01 취득 → 4개월 뒤 입주권 취득 ⇒ §156의2③·④가 함께 요구하는
    // 「1년 이상이 지난 후」를 못 채운다. 나머지 예외는 전부 미해당 ⇒ 배제 확정.
    const r = run(
      houseInput({
        presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })],
      }),
    );
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("★ 배제가 세액을 실제로 움직인다 — 0 → 양수", () => {
    const kept = run(houseInput());
    const excluded = run(
      houseInput({ presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })] }),
    );
    expect(kept.totalTax).toBe(0);
    expect(excluded.totalTax).toBeGreaterThan(0);
  });

  /**
   * 🔑 **Q-5 — 배제의 효과 범위는 §89①3호뿐이다.**
   *
   * §89②은 「제1항에도 불구하고 같은 항 **제3호**를 적용하지 아니한다」로 효과를 §89①3호에
   * 명시적으로 한정한다. 장기보유특별공제 표2의 대상은 §95② 단서 → 시행령 §159의4가 따로
   * 정의하며(「1세대가 양도일 현재 국내에 **1주택**…을 보유하고 보유기간 중 거주기간이 2년
   * 이상」), §89②을 인용하지 않는다. 주택 1채 + 권리 1개 세대는 **주택 수로는 1주택**이므로
   * 본문에 그대로 해당한다(괄호는 2주택 이상을 의제로 끌어오는 확장 규정이다).
   *
   * ⇒ 배제해도 표2는 유지된다. 이 anchor가 없으면 「배제 = 1세대1주택 아님」으로 잘못 확대해
   *    표1로 강등시키는 회귀가 조용히 들어온다.
   */
  it("🔑 배제해도 장기보유특별공제 표2는 유지된다 (§95② 단서 · 시행령 §159의4는 §89②을 인용하지 않는다)", () => {
    const excluded = run(
      houseInput({ presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })] }),
    );
    const table1Control = run(houseInput({ isOneHousehold: false }));
    expect(excluded.longTermHoldingDeduction).toBeGreaterThan(
      table1Control.longTermHoldingDeduction,
    );
  });

  it("🔑 배제되면 12억 안분(§95③)도 사라진다 — 전액 과세", () => {
    // §95③은 「§89①3호에 따라 비과세대상에서 제외되는 고가주택」에만 적용된다.
    const over12 = { transferPrice: 2_000_000_000 };
    const kept = run(houseInput(over12));
    const excluded = run(
      houseInput({
        ...over12,
        presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })],
      }),
    );
    expect(kept.isPartialExempt).toBe(true);
    expect(excluded.isPartialExempt).toBe(false);
    expect(excluded.totalTax).toBeGreaterThan(kept.totalTax);
  });

  it("분양권도 같다 (취득일이 §88 10호 정의 시행일 이후일 때)", () => {
    // 종전주택 2021-06-01 취득 → 3개월 뒤 분양권 취득(1년 미충족) → 2024-06-01 양도.
    const base = houseInput({
      acquisitionDate: new Date("2021-06-01"),
      transferDate: new Date("2024-06-01"),
    });
    expect(runHE(base).isExempt).toBe(true); // 권리 없으면 비과세
    const r = runHE({
      ...base,
      presaleRights: [right({ type: "presale_right", acquisitionDate: new Date("2021-09-01") })],
    });
    expect(r.isExempt).toBe(false);
  });
});

describe("§89② 예외 — 시행령 §156의2③ · §156의3② (일시적 1주택 + 1권리)", () => {
  it("1년 후 취득 + 3년 이내 양도 → 예외 충족 ⇒ 비과세 유지", () => {
    // 입주권 2016-10-01 취득 → 3년 기한 2019-10-01. 양도 2019-06-01 (이내).
    const r = run(
      houseInput({ transferDate: new Date("2019-06-01"), presaleRights: [right()] }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  it("경계: 취득일 + 3년 당일 양도는 「3년 이내」다", () => {
    const r = run(
      houseInput({ transferDate: new Date("2019-10-01"), presaleRights: [right()] }),
    );
    expect(r.isExempt).toBe(true);
  });

  it("🔑 처분기한은 **평이한 3년**이다 — 조정대상지역이어도 단축되지 않는다", () => {
    // §155①은 조정대상지역에서 기한이 짧아지지만 §156의2③·§156의3②에는 그 규정이 없다.
    const r = run(
      houseInput({
        transferDate: new Date("2019-06-01"),
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        presaleRights: [right()],
      }),
    );
    expect(r.isExempt).toBe(true);
  });
});

describe("⭐ §89② — 판정 불가면 켜지 않는다 (법 근거 없는 불리 적용 금지)", () => {
  function warnedButExempt(input: TransferTaxInput, ...needles: string[]) {
    const r = run(input);
    expect(r.isExempt).toBe(true); // 종전 동작 유지
    const joined = (r.warnings ?? []).join("\n");
    expect(joined).toContain("§89②");
    for (const n of needles) expect(joined).toContain(n);
  }

  it("3년 초과 → §156의2④(완성 후 이주)·시행규칙 §75①(경매 등) 입력 경로 없음", () => {
    // 입주권 2016-10-01 + 3년 = 2019-10-01 < 양도 2024-06-01
    warnedButExempt(
      houseInput({ presaleRights: [right()] }),
      "§156의2 ④",
      "소득세법 시행규칙 §75 ①",
    );
  });

  /**
   * 🔴 2026-08-26 갱신(Phase 3): 종전 사유는 「순위 규칙 미구현」이었다. 이제 순위·공동상속·
   *    동일세대는 자기선언으로 판정한다. 남은 판정 불가 사유는 **일반주택 긍정 선언**
   *    (`generalHouseHeldAtInheritance`)이 없는 것이다 — 미선언을 「미해당」으로 읽으면
   *    상속 권리 보유 세대가 갑자기 과세로 뒤집히므로 여전히 종전 동작을 유지한다.
   */
  it("상속받은 권리 + 일반주택 긍정 선언 없음 → §156의2⑥·⑦ 판정 불가", () => {
    warnedButExempt(
      houseInput({
        transferDate: new Date("2019-06-01"),
        presaleRights: [right({ isInherited: true })],
      }),
      "§156의2 ⑥·⑦",
    );
  });

  /**
   * 🔴 2026-08-26 정정(Phase 4) — 종전에는 「§156의2 ⑧·⑨」 한 문자열을 기대했다. 지금은
   *    **합가 유형에 따라 해당 항만** 가리킨다(혼인 → ⑨ / 동거봉양 → ⑧). 두 항은 요건이
   *    다르므로(⑨엔 60세 요건이 없고 호 번호가 하나씩 당겨진다) 둘을 함께 안내하면
   *    확인 대상이 절반은 무관한 조문이 된다.
   */
  it("혼인 합가 선언 + 합가 전 보유 구성 미선언 → §156의2⑨ 판정 불가", () => {
    warnedButExempt(
      houseInput({
        transferDate: new Date("2019-06-01"),
        presaleRights: [right()],
        marriageMerge: { marriageDate: new Date("2018-01-01") },
      }),
      "§156의2 ⑨",
    );
  });

  it("세대 주택 2채 이상 → §156의2⑦·⑩·⑪ 축 미구현", () => {
    const r = run(
      houseInput({
        householdHousingCount: 2,
        transferDate: new Date("2019-06-01"),
        presaleRights: [right()],
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2015-06-01"),
          newAcquisitionDate: new Date("2017-06-01"),
        },
      }),
    );
    expect((r.warnings ?? []).join("\n")).toContain("§156의2 ⑦·⑩·⑪");
  });

  /**
   * 🔴 2026-08-26 정정(P-0): 종전 단언은 「§156의2③·④」였다. **틀렸다** — 그 항들은
   *    「1주택과 **1**권리」 전제라 2권리 세대에는 애초에 해당하지 않는다.
   *    1주택 + 2권리에 실제로 적용될 수 있는 예외는 §156의2⑦·⑧·⑨ · §156의3⑤다.
   *    확인해도 소용없는 조문을 가리키면 「판정 불가 고지」의 목적이 무너진다.
   */
  /**
   * 🔴 2026-08-26 정정(Phase 4) — 종전에는 권리 2개면 **무조건 판정 불가**였다. 그 전제는
   *    Phase 3(상속 축)·Phase 4(합가 축)가 닫히면서 사라졌다:
   *
   *    · §156의2⑦·§156의3⑤은 「상속 외 권리 **1개**」를 전제한다 ⇒ 상속 권리가 없으면 적용 불가
   *    · §156의2⑧·⑨는 합가 축인데, 합가 사실 자체가 없으면 적용 불가(합가일 칸은 화면에 있다)
   *    · ③·②·④·③은 「1주택과 **1**권리」 전제
   *
   *    ⇒ 남는 예외가 없으므로 **배제 확정**이다. 「적용될 예외가 없어 보인다」는 인상이 아니라
   *      16항 전수 대조의 결과다(계획서 §0 정정).
   */
  it("권리 2개 이상 + 상속·합가 축 모두 미해당 → 남는 예외가 없어 배제 확정", () => {
    const r = run(
      houseInput({
        transferDate: new Date("2019-06-01"),
        presaleRights: [right(), right({ id: "r2" })],
      }),
    );
    expect(r.isExempt).toBe(false);
    // 1권리 전제 조문을 가리키는 안내는 여전히 없어야 한다
    expect((r.warnings ?? []).join("\n")).not.toContain("§156의2 ③·④");
  });
});

describe("§89② — 적용 대상 자체가 아닌 경우", () => {
  it("주택이 아닌 자산 양도는 §89②의 「그 주택」이 아니다", () => {
    const r = run(
      houseInput({
        propertyType: "land",
        isNonBusinessLand: false,
        presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })],
      }),
    );
    expect((r.warnings ?? []).join("\n")).not.toContain("§89②");
  });

  it("🔑 2021-01-01 **전** 취득 분양권은 §89②의 「분양권」이 아니다 (§88 10호 정의 시행일)", () => {
    // 같은 날짜의 조합원입주권이면 배제되는 조합인데, 분양권이면 배제되지 않는다.
    const asRight = runHE(
      houseInput({ presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })] }),
    );
    const asPresale = runHE(
      houseInput({
        presaleRights: [
          right({ type: "presale_right", acquisitionDate: new Date("2015-10-01") }),
        ],
      }),
    );
    expect(asRight.isExempt).toBe(false);
    expect(asPresale.isExempt).toBe(true);
    expect((asPresale.warnings ?? []).join("\n")).not.toContain("§89②");
  });

  it("🔑 2021-01-01 **이후** 취득 분양권은 게이트를 통과한다 (게이트가 상시 차단이 아님)", () => {
    const r = runHE(
      houseInput({
        acquisitionDate: new Date("2021-06-01"),
        transferDate: new Date("2024-06-01"),
        presaleRights: [
          right({ type: "presale_right", acquisitionDate: new Date("2021-09-01") }),
        ],
      }),
    );
    expect(r.isExempt).toBe(false);
  });
});
