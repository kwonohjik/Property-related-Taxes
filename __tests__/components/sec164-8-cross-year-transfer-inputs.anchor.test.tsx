/**
 * F-25 Pre-Do anchor — 연도교차 §164⑧ 에서도 양도당시 구조·용도·공시지가 입력이 화면에 남는다.
 *
 * 결함 위치: `components/calc/building-std-price/BuildingStdPriceForm.tsx`
 *   동일연도에는 세 입력을 숨기고 rose 안내로 이유를 밝히는데, 그 게이트가 `sameYear` 하나만 본다:
 *     {sameYear && !isMech && ( … rose 안내 … )}
 *     {!isMech && !sameYear && !composite && ( … 양도당시 구조·용도 … )}
 *     {!isMech && !sameYear && ( … 양도당시 공시지가 … )}
 *   반면 §164⑧ 섹션은 넓은 축을 쓴다:
 *     {(sameYear || (crossYearWindow && f.crossYearSameAdjust)) && !isMech && ( … )}
 *
 * ⇒ 연도교차 opt-in 을 켜면 §164⑧ 섹션은 열리는데 **양도당시 입력이 그대로 노출된 채 폐기**되고,
 *   동일연도와 달리 안내도 없다. validate 도 요구하지 않아 「보이는데 필수도 아니고 쓰이지도 않는」
 *   상태가 된다. 토글이 이 입력들보다 아래에 있어 사용자는 먼저 채운 뒤 토글을 켜게 된다.
 *
 * ⇒ 네 게이트를 **엔진·④변환·⑧검증과 같은 leaf**(`isSameAdjustmentPeriodConversion`)로 통일한다.
 *
 * 🟡 **남은 것(배치 3 — 보고서 축)**: `buildConvertedHousingDetail` 이 아니라
 *   `buildNtsReportContext` 가 `transLandPrice` 를 무조건 읽어 국세청 계산서의 양도당시 벌
 *   개별공시지가 칸으로 stale 값이 새어 나간다. §164⑧ 에서 그 칸이 무엇이어야 하는지는
 *   계산서 서식 확인이 필요해 이번 범위에서 제외했다(F-34 의 부수 항목과 같은 축).
 *
 * 법령: 「소득세법 시행령」 제164조 제8항 · 「소득세법 시행규칙」 제80조 제1항 제1호.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

afterEach(cleanup);

/** `initialForm` 으로 상태를 주입해 렌더한다 — 연도교차 §164⑧ opt-in 이 켜진 상태 */
function renderWith(over: Partial<BuildingStdPriceFormState>) {
  render(
    <BuildingStdPriceForm
      lockedTaxType="transfer"
      initialForm={{
        builtYear: "2000",
        floorArea: "200",
        acqStructureKey: "rc",
        acqUsageNo: "1",
        acqLandPrice: "3000000",
        ...over,
      }}
      onResult={() => {}}
    />,
  );
}

describe("F-25 연도교차 §164⑧ — §1 양도당시 입력이 숨는다 (수정 전 실패)", () => {
  it("연도교차 + opt-in 이면 양도당시 구조·용도가 화면에서 사라진다", () => {
    renderWith({ acquisitionYear: "2005", transferYear: "2006", crossYearSameAdjust: true });
    expect(screen.queryByText("양도당시 구조")).toBeNull();
    expect(screen.queryByText("양도당시 용도")).toBeNull();
  });

  it("연도교차 + opt-in 이면 「입력이 필요 없습니다」 안내가 뜬다", () => {
    renderWith({ acquisitionYear: "2005", transferYear: "2006", crossYearSameAdjust: true });
    expect(screen.getByText(/양도당시 구조·용도·공시지가 입력이/)).toBeTruthy();
  });
});

describe("F-25 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("동일연도는 종전대로 숨기고 안내한다", () => {
    renderWith({ acquisitionYear: "2015", transferYear: "2015" });
    expect(screen.queryByText("양도당시 구조")).toBeNull();
    expect(screen.getByText(/취득연도와 같은 해 양도/)).toBeTruthy();
  });

  it("연도교차인데 opt-in 을 켜지 않으면 양도당시 입력이 그대로 있다", () => {
    renderWith({ acquisitionYear: "2005", transferYear: "2006", crossYearSameAdjust: false });
    expect(screen.getByText("양도당시 구조")).toBeTruthy();
    expect(screen.getByText("양도당시 용도")).toBeTruthy();
  });

  it("창을 벗어난 연도차는 opt-in 여부와 무관하게 입력이 있다", () => {
    renderWith({ acquisitionYear: "2005", transferYear: "2010", crossYearSameAdjust: true });
    expect(screen.getByText("양도당시 구조")).toBeTruthy();
  });
});
