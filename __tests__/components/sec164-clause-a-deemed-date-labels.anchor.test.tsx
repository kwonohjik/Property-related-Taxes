/**
 * B-1 Phase 0 — pre-deemed 가목(②)의 **입력 시점 안내**가 의제취득일(1985.1.1.)을 가리키는가.
 *
 * ## 왜 컴포넌트 계층인가
 *
 * 「소득세법」 부칙(법률 제4803호) §8은 **취득시기 자체**를 의제한다("1984.12.31. 이전에 취득한
 * 것은 **1985.1.1.에 취득한 것으로 본다**"). 따라서 §164④~⑦의 「취득당시」 기준시가도 pre-deemed
 * 에서는 **1985.1.1. 기준**이어야 한다(조심2010서1195 — §163⑨ + 부칙으로 의제취득일 기준시가를
 * 적용한 처분을 **기각**).
 *
 * ⭐ 그런데 **엔진 산식에는 시점 파라미터가 없다**(계획서 §3.0 probe 실증):
 *   · `calculatePre1990LandValuation` — `acquisitionDate`를 1974→1985로 바꿔도 **산출값 동일**
 *     (날짜는 1990.8.30. 경고와 CAP-2 트리거에만 쓰이고, 둘 다 1985에서 값이 안 바뀐다)
 *   · `calculateInheritanceHouseValuation` — `inheritanceDate` 1980→1985도 **동일**
 *   · 결과를 바꾸는 것은 **사용자가 입력한 등급값·단가**뿐이다
 *
 * ⇒ 시점의 **유일한 통제점은 UI 라벨**이다. 엔진 anchor로는 이 결함을 실패시킬 수 없다.
 *
 * ## 경계 — post-deemed를 오염시키면 안 된다
 *
 * §163⑨1호·2호는 pre/post를 나누지 않으므로 **같은 컴포넌트를 양쪽이 공유**한다
 * (`PostDeemedInputs.tsx:373`). 부칙§8은 **1984.12.31. 이전 취득분에만** 적용되므로
 * post-deemed(1985.1.1.~)는 「상속개시일」이 맞다 — 실무 교재도 의제취득일 **이후** 구간에만
 * "상속개시일 및 증여일 현재"를 명시한다.
 *
 * ⇒ T-4·T-5가 그 경계를 고정한다. 라벨을 무조건 1985로 바꾸면 **T-4가 실패해야** 한다.
 *
 * 계획: docs/02-design/features/sec164-clause-a-deemed-date-timing-b1.plan.md §5 Phase 0
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { PreDeemedInputs } from "../../components/calc/transfer/inheritance/PreDeemedInputs";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { CommercialInheritanceStdPriceSection } from "../../components/calc/transfer/CommercialInheritanceStdPriceSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const NOOP = () => {};
const TRANSFER_DATE = "2024-06-01";

/**
 * 의제취득일 시점을 가리키는 표기 — "1985.1.1." / "1985-01-01" / "의제취득일" 중 하나.
 *
 * ⚠️ **반드시 non-capturing group으로 묶는다.** 묶지 않고 `new RegExp(`${MARK}...유효 등급`)`에
 *    끼우면 `|`가 패턴 전체를 나눠 `의제취득일` **단독 매칭**으로 통과한다 — 화면 어딘가에
 *    "의제취득일"이라는 단어만 있으면 라벨이 안 고쳐졌는데도 초록불이 된다.
 *    (실제로 T-1·T-2·T-5a가 이 버그로 거짓 통과했다 — 2026-08-07 Pre-Do 1회차)
 */
const DEEMED_MARK = "(?:의제취득일|1985\\.\\s*1\\.\\s*1|1985-01-01)";

/**
 * ⚠️ `pre1990Enabled`를 켜지 않으면 등급 필드가 **접힌 채로** 렌더되지 않아
 *    "라벨이 없다"가 통과해 버린다 — 검증이 조용히 무의미해지는 자리다.
 */
function landAsset(inheritanceDate: string): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: inheritanceDate,
    inheritanceStartDate: inheritanceDate,
    acquisitionArea: "300",
    pre1990Enabled: true,
    pre1990GradeMode: "value",
    pre1990PricePerSqm_1990: "120,000",
    pre1990Grade_current: "40,000",
    pre1990Grade_prev: "36,000",
    pre1990Grade_atAcq: "12,000",
  } as AssetForm;
}

function houseAsset(inheritanceDate: string): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: inheritanceDate,
    inheritanceStartDate: inheritanceDate,
    inhHouseValLandArea: "200",
  } as AssetForm;
}

function commercialAsset(inheritanceDate: string): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: inheritanceDate,
    inheritanceStartDate: inheritanceDate,
  } as AssetForm;
}

// ─────────────────────────────────────────────────────────────────────────
// pre-deemed — 의제취득일(1985.1.1.)을 가리켜야 한다
// ─────────────────────────────────────────────────────────────────────────

describe("B-1 T-1: pre-deemed **토지** §164④ — 등급 입력이 1985.1.1. 시점을 요구한다", () => {
  it("★ T-1: 「취득시 유효 등급」이 아니라 의제취득일 시점 등급임을 명시한다", () => {
    const { container } = render(
      <PreDeemedInputs asset={landAsset("1974-07-12")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    const text = container.textContent ?? "";

    // 전제: 등급 입력 섹션이 실제로 렌더됐다(접혀 있으면 아래 단언이 무의미해진다)
    expect(text).toMatch(/1990\.8\.30\.\s*현재 등급/);

    // 본 단언: 취득시 등급 라벨이 의제취득일을 가리킨다
    expect(text).toMatch(new RegExp(`${DEEMED_MARK}[^]{0,40}유효 등급`));
  });

  it("★ T-1b: 시점을 밝히지 않은 「취득시 유효 등급」 표기가 남아 있지 않다", () => {
    const { container } = render(
      <PreDeemedInputs asset={landAsset("1974-07-12")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    // 상속개시일(1974)로 오인해 입력하게 만드는 문구를 금지한다.
    expect(container.textContent ?? "").not.toMatch(/취득시 유효 등급/);
  });
});

describe("B-1 T-2: pre-deemed **주택** §164⑦ — 3시점 환산의 취득시점이 1985.1.1.이다", () => {
  /**
   * 🔴 **자기모순이 화면에 그대로 있다** (2026-08-07 실측).
   *   결과 필드는 "**의제취득일(1985.1.1.) 시점 합계 기준시가**"라고 부르면서,
   *   그 값을 만드는 3시점 환산의 ③번 입력은 "**상속개시일 시점 (1980-03-15)**"을 요구한다.
   *   즉 상속개시일 값을 받아 의제취득일 값이라고 이름 붙인다 — 계획서 §3.1 드리프트의 실물.
   *
   * ⚠️ 1990.8.30. 이전 상속이면 「상속개시일 토지 개별공시지가」 필드는 **렌더되지 않는다**
   *    (등급 환산으로 대체). 그 문구를 금지해 봐야 항상 통과하는 **빈 단언**이 된다 —
   *    Pre-Do 1회차에서 실제로 그렇게 통과했다. 실제 렌더 문구로만 단언한다.
   */
  it("★ T-2: 3시점 환산의 취득시점 섹션이 의제취득일을 가리킨다", () => {
    const { container } = render(
      <PreDeemedInputs asset={houseAsset("1980-03-15")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    const text = container.textContent ?? "";

    // 전제: 3-시점 보조 섹션이 렌더됐다
    expect(text).toMatch(/개별주택가격 미공시/);

    // 취득시점 섹션 헤더 — 현행 "상속개시일 시점 (1980-03-15)"
    expect(text).toMatch(new RegExp(`${DEEMED_MARK}[^]{0,20}시점`));
    // 건물기준시가 라벨 — 현행 "상속개시일 건물기준시가"
    expect(text).toMatch(new RegExp(`${DEEMED_MARK}[^]{0,10}건물기준시가`));
  });

  it("★ T-2b: pre-deemed에서 「상속개시일 …」 시점 표기가 남아 있지 않다", () => {
    const { container } = render(
      <PreDeemedInputs asset={houseAsset("1980-03-15")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    const text = container.textContent ?? "";
    // 사용자가 1980년 값을 넣게 만드는 표기를 금지한다.
    expect(text).not.toMatch(/상속개시일 건물기준시가/);
    expect(text).not.toMatch(/상속개시일 시점 주택가격/);
  });
});

describe("B-1 T-3: pre-deemed **상가** §164⑥ — 취득시 기준시가가 1985.1.1. 시점이다", () => {
  it("★ T-3: 취득시 라벨이 의제취득일을 가리킨다", () => {
    const { container } = render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset("1980-03-15")}
        onChange={NOOP}
        transferDate={TRANSFER_DATE}
      />,
    );
    const text = container.textContent ?? "";

    // 전제: §164⑥ 섹션이 렌더됐다
    expect(text).toMatch(/§164⑥/);

    // 현행은 "취득시(상속개시일) 건물 기준시가"·"취득당시(상속개시일)"로 1980년을 요구한다.
    expect(text).toMatch(new RegExp(`취득[^]{0,6}\\(${DEEMED_MARK}`));
  });

  it("★ T-3b: 「취득시(상속개시일)」 표기가 남아 있지 않다", () => {
    const { container } = render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset("1980-03-15")}
        onChange={NOOP}
        transferDate={TRANSFER_DATE}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(/취득[시당]{1,2}시?\(상속개시일\)/);
  });
});

describe("B-1 T-6: ① 필드가 부칙§8 원칙을 고지한다", () => {
  it("★ T-6: 「1985.1.1. 현재 평가액이 원칙」임을 안내한다", () => {
    const { container } = render(
      <PreDeemedInputs asset={landAsset("1974-07-12")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    // ①은 상속세 신고가액(상속개시일 기준)을 그대로 받되(U-1 결정), 원칙은 고지한다.
    expect(container.textContent ?? "").toMatch(/부칙|취득시기[^]{0,20}의제/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 경계 — post-deemed는 「상속개시일」 그대로
// ─────────────────────────────────────────────────────────────────────────

describe("B-1 T-4: post-deemed는 오염되지 않는다 (회귀 가드)", () => {
  it("T-4: 1987년 상속 토지 — 등급 입력이 의제취득일을 가리키지 **않는다**", () => {
    const { container } = render(
      <PostDeemedInputs asset={landAsset("1987-05-20")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    const text = container.textContent ?? "";
    // 부칙§8은 1984.12.31. 이전 취득분에만 적용된다 — 1987 상속은 취득시기가 상속개시일 그대로다.
    expect(text).not.toMatch(/의제취득일[^]{0,40}유효 등급/);
  });

  it("T-4b: 1990년 상속 주택 — 「상속개시일」 시점 표기가 유지된다", () => {
    const { container } = render(
      <PostDeemedInputs asset={houseAsset("1990-05-20")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    expect(container.textContent ?? "").not.toMatch(/의제취득일[^]{0,30}토지 개별공시지가/);
  });
});

describe("B-1 T-5: 의제취득일 경계", () => {
  it("★ T-5a: 1984-12-31 상속 — **대상**(1985.1.1. 라벨)", () => {
    const { container } = render(
      <PreDeemedInputs asset={landAsset("1984-12-31")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    expect(container.textContent ?? "").toMatch(
      new RegExp(`${DEEMED_MARK}[^]{0,40}유효 등급`),
    );
  });

  it("T-5b: 1985-01-01 상속 — **비대상**(post-deemed 경로)", () => {
    const { container } = render(
      <PostDeemedInputs asset={landAsset("1985-01-01")} onChange={NOOP} transferDate={TRANSFER_DATE} />,
    );
    expect(container.textContent ?? "").not.toMatch(/의제취득일[^]{0,40}유효 등급/);
  });
});
