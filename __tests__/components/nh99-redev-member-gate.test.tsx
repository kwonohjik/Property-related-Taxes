/**
 * @vitest-environment jsdom
 *
 * anchor — §99·§99의3 화면 시한 게이트가 재개발 완공 아파트 조합원을 **준공일**로 판정한다 (리뷰 NH-36 · Q-15 준공일 칸).
 *
 * 수정 전: `buildPeriodContext`가 사용승인일을 비워 두고 종전주택 취득일·매매계약일로 판정해, 신축주택취득기간 안에 준공된
 * 조합원 주택도 카드가 `⚠ … 시한 외`로 막혔다(선택 자체 불가). 기간 경과 후 사용승인 + 조합 잔여주택 계약(조특령 §99③2호 ·
 * §99의3③2호 단서) 갈래도 막혔다.
 * 수정 후: 주택 출자 원조합원은 감면 패널에 준공일 칸이 있고, 게이트는 그 날로 판정한다(빈 값이면 막고 사유로 칸을 가리킨다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { UnifiedReductionPanel, buildPeriodContext } from "@/components/calc/transfer/UnifiedReductionPanel";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const apt = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionDate: "1995-03-01",
    redevApprovalDate: "1999-01-01",
    redevOriginalAssetType: "housing",
    redevIsSuccessorMember: "no",
    ...over,
  }) as AssetForm;
const gate = (a: AssetForm, id: "new_99_3" | "new_99", td = "2006-03-01") => checkReductionPeriod(id, buildPeriodContext(a, td));

describe("NH-36 시한 게이트 — 조합원은 준공일 축", () => {
  it("준공일 안에 들면 열린다 (종전주택 취득일 1995는 보지 않는다)", () => {
    expect(gate(apt({ redevCompletionDate: "2002-06-30" }), "new_99_3").inPeriod).toBe(true);
    expect(gate(apt({ redevCompletionDate: "1999-03-01" }), "new_99").inPeriod).toBe(true);
  });
  it("기간 경과 후 준공도 연다 — 잔여주택 계약 사실로 엔진이 판정한다 (조특령 §99의3③2호 단서)", () => {
    expect(gate(apt({ redevCompletionDate: "2008-06-30" }), "new_99_3", "2016-06-01").inPeriod).toBe(true);
  });
  it("준공일이 비면 막고 사유가 준공일 칸을 가리킨다 · 기간 시작 전 준공은 막는다", () => {
    const blank = gate(apt({ redevCompletionDate: "" }), "new_99_3");
    expect(blank.inPeriod).toBe(false);
    expect(blank.failReason).toContain("준공일을 먼저 입력");
    expect(gate(apt({ redevCompletionDate: "2001-05-22" }), "new_99_3").inPeriod).toBe(false);
  });
  it("일반 주택은 종전과 같다(매매계약일 축)", () => {
    const house = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "1995-03-01" } as AssetForm;
    expect(gate(house, "new_99_3").inPeriod).toBe(false);
  });
});

describe("Q-15 준공일 칸 — 주택 출자 원조합원은 감면 패널 신축주택 카테고리에 있다", () => {
  const openNewHousing = (a: AssetForm) => {
    const { container } = render(<UnifiedReductionPanel asset={a} transferDate="2006-03-01" onChange={() => {}} />);
    fireEvent.click(screen.getByText("신축주택").closest("button")!);
    return container;
  };
  it("주택 출자 원조합원 — 칸이 보인다", () => {
    expect(openNewHousing(apt()).querySelector('[data-field="redevCompletionDate"]')).not.toBeNull();
  });
  it("토지 출자 원조합원 — 재개발 카드의 같은 칸을 쓰므로 패널에는 없다", () => {
    expect(openNewHousing(apt({ redevOriginalAssetType: "land" })).querySelector('[data-field="redevCompletionDate"]')).toBeNull();
  });
});

describe("§99의3 폼 — 조합원 갈래", () => {
  const value = getReductionDefault("new_99_3") as Extract<AssetReductionForm, { type: "new_99_3" }>;
  const renderForm = (completionDate: string, houseContributed = true) =>
    render(
      <New993InputForm
        value={value}
        onUpdate={() => {}}
        onUpdateMany={() => {}}
        redevMember={{ completionDate, houseContributed, completionFieldInPanel: houseContributed }}
      />,
    ).container;
  it("취득 유형 선택 대신 조합원 안내 · 준공일이 기간 뒤면 잔여주택 계약 사실을 묻는다", () => {
    const c = renderForm("2008-06-30");
    expect(c.querySelector('[data-testid="new993-redev-member"]')).not.toBeNull();
    expect(c.querySelector('[data-field="reduction.new_99_3.remainderContract993"]')).not.toBeNull();
    expect(c.textContent).not.toContain("1호 — 주택건설사업자로부터 취득");
  });
  it("기간 안 준공이면 묻지 않는다 · 주택 출자면 종전주택 기준시가 칸이 토글 없이 보인다(NH-32)", () => {
    const c = renderForm("2002-06-30");
    expect(c.querySelector('[data-field="reduction.new_99_3.remainderContract993"]')).toBeNull();
    expect(c.querySelector('[data-field="reduction.new_99_3.previousHouseStdPrice993"]')).not.toBeNull();
  });
  it("토지 출자면 재개발 변형 칸이 없다", () => {
    expect(renderForm("2002-06-30", false).querySelector('[data-field="reduction.new_99_3.previousHouseStdPrice993"]')).toBeNull();
  });
});
