/**
 * D-3·D-4 — pre-deemed 취득가액 **표시 계층**이 엔진(가목 우선)과 일치하는가.
 *
 * `PreDeemedInputs`는 #1089 이후로도 「max(① 상증법 평가액, ③ 환산취득가)」라고 말해 왔다.
 * 엔진은 `clauseA = max(①,②)` → 0일 때만 ③인데, 화면은 **②를 아예 언급하지 않고** ③이
 * 상시 비교 대상인 것처럼 읽혔다(memory `feedback_engine_result_display_drift`).
 *
 * ⚠️ 표시 드리프트는 타입이 잡지 못한다 — 문구는 anchor로만 고정된다.
 *
 * D-4(U2-F): §163⑨ 본문 괄호("§76에 따라 세무서장등이 **결정·경정한** 가액이 있는 경우 **그**
 * 가액**으로 한다**")는 소스 서열을 **강행**한다. 그 서열을 상속·증여 **양쪽** 입력칸에서 말한다.
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §3.4·§4.3
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { CompanionAcqGiftBlock } from "../../components/calc/transfer/CompanionAcqGiftBlock";
import { PreDeemedInputs } from "../../components/calc/transfer/inheritance/PreDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const NOOP = () => {};

function preDeemedInheritance(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-03-01",
    inheritanceStartDate: "1980-03-01",
    decedentAcquisitionDate: "1970-01-01",
    ...over,
  } as AssetForm;
}

describe("D-3: PreDeemedInputs 표시가 「가목 우선」을 말한다", () => {
  it("V-1: ②(취득당시 기준시가 §164④~⑦)가 산식 설명에 등장한다", () => {
    render(
      <PreDeemedInputs asset={preDeemedInheritance()} onChange={NOOP} transferDate="2024-06-01" />,
    );
    expect(screen.queryAllByText(/§164④~⑦/).length).toBeGreaterThan(0);
  });

  it("★ V-2(회귀): 「max(① …, ③ 환산취득가)」로 읽히는 종전 문구가 남아 있지 않다", () => {
    const { container } = render(
      <PreDeemedInputs asset={preDeemedInheritance()} onChange={NOOP} transferDate="2024-06-01" />,
    );
    // ③이 ①과 **같은 max 안**에 있는 것처럼 적힌 형태를 금지한다.
    expect(container.textContent ?? "").not.toMatch(/max\([^)]*환산취득가/);
  });

  it("V-3: ③은 「둘 다 확인할 수 없을 때에 한정」으로 서술된다 (법 §97①1호 단서)", () => {
    // ⚠️ 캡션은 `<b>`로 강조돼 텍스트 노드가 쪼개진다 — `queryAllByText`는 단일 노드만 보므로
    //    문장 단위 검사는 `textContent`로 한다.
    const { container } = render(
      <PreDeemedInputs asset={preDeemedInheritance()} onChange={NOOP} transferDate="2024-06-01" />,
    );
    expect(container.textContent ?? "").toMatch(/둘 다 확인할 수 없을 때에.*한정/);
  });
});

describe("D-4(U2-F): §76 결정·경정액 서열을 양쪽 입력칸에서 말한다", () => {
  it("V-4: **상속** — 결정·경정액이 있으면 그 가액이라고 안내한다", () => {
    render(
      <PreDeemedInputs asset={preDeemedInheritance()} onChange={NOOP} transferDate="2024-06-01" />,
    );
    expect(screen.queryAllByText(/결정·경정한 가액이 있으면 그 가액/).length).toBeGreaterThan(0);
  });

  it("★ V-5: **증여** — 종전에는 서열 안내가 아예 없었다", () => {
    render(
      <CompanionAcqGiftBlock
        acquisitionDate="1980-03-01"
        donorAcquisitionDate="1975-01-01"
        fixedAcquisitionPrice=""
        onAcquisitionDateChange={NOOP}
        onDonorAcquisitionDateChange={NOOP}
        onFixedAcquisitionPriceChange={NOOP}
      />,
    );
    expect(screen.queryAllByText(/결정·경정한 가액이 있으면 그 가액/).length).toBeGreaterThan(0);
  });
});
