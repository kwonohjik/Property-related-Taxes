// @vitest-environment jsdom
/**
 * ⑤ UI 위젯 anchor — 농지·목장 세부 입력의 **법문과 어긋난 안내** 제거
 * (E2-05 · U1-04 · E2-08 · E2-09 · E2-06 · U1-05, 2026-09-02 코드리뷰)
 *
 * 이 섹션들을 렌더하는 vitest·e2e가 전수 grep에서 **0건**이었다. 그래서 화면 문구가
 * 법문과 어긋나 있어도 아무 게이트에 걸리지 않았다. 여기서 고정하는 것은 네 가지다.
 *
 * 1. **E2-05 · U1-04** — 「농지전용 허가·신고 **(3년 이내)**」의 3년 요건은 §168의8③4호에
 *    없다(본문 실측 mst=286211 — 같은 항에서 3년이 붙은 것은 2호 상속·3호 이농뿐).
 *    라벨을 믿고 토글을 끄면 법상 인정되는 사용의제를 **스스로 포기**한다. 허가일 DateInput은
 *    `FarmlandDeemingInput`에 대응 필드가 없어 엔진에 도달하지 않던 dead input이라 제거했다.
 * 2. **E2-09** — §168의8② 후단이 준용하는 「조특령」 §66⑭(결격 과세기간 제외) 안내.
 * 3. **E2-08** — 별표 1의3 제2호 두수 산정방법 3종 안내.
 * 4. **E2-06 · U1-05** — 존재하지 않는 「기준면적 직접입력」 필드를 지칭하던 문장 제거.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { FarmlandDetailSection } from "@/components/calc/transfer/nbl/FarmlandDetailSection";
import { PastureDetailSection } from "@/components/calc/transfer/nbl/PastureDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

describe("[E2-05 · U1-04] 농지전용 의제 — 근거 없는 「3년 이내」와 dead input 제거", () => {
  function renderFarmland() {
    const asset = { ...makeDefaultAsset(1), nblFarmlandIsConversionApproved: true };
    return render(<FarmlandDetailSection asset={asset} onAssetChange={() => {}} />);
  }

  it("토글 제목에 「3년 이내」가 없다", () => {
    const { container } = renderFarmland();
    expect(container.textContent).not.toContain("농지전용 허가·신고 (3년 이내)");
  });

  it("법문 요건(당해 전용목적으로 사용)이 제목·설명에 드러난다", () => {
    const { container } = renderFarmland();
    expect(container.textContent).toContain("당해 전용목적으로 사용");
    expect(container.textContent).toContain("§168의8③4호");
    // 기간 제한이 없다는 사실을 명시해 「3년 이내」 오인이 되살아나지 않게 한다
    expect(container.textContent).toContain("기간 제한 없음");
  });

  it("토글을 켜도 「허가일」 입력이 노출되지 않는다 (엔진 미도달 dead input)", () => {
    renderFarmland();
    expect(screen.queryByText("허가일")).toBeNull();
  });
});

describe("[E2-09] 자경 기간 — 조특령 §66⑭ 결격 과세기간 제외 안내", () => {
  it("§168의8② 후단 준용과 두 호의 기준이 안내된다", () => {
    const { container } = render(
      <FarmlandDetailSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />,
    );
    expect(container.textContent).toContain("조세특례제한법 시행령");
    expect(container.textContent).toContain("§66⑭");
    expect(container.textContent).toContain("3,700만원");
    expect(container.textContent).toContain("자경한 기간에서 제외");
  });
});

describe("[E2-08] 사육 두수 — 별표 1의3 제2호 산정방법 3종 안내", () => {
  it("세 가지 산정방법이 모두 안내된다", () => {
    const asset = { ...makeDefaultAsset(1), nblPastureIsLivestockOperator: true };
    const { container } = render(<PastureDetailSection asset={asset} onAssetChange={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("별표 1의3] 제2호");
    expect(text).toContain("6과세기간");
    expect(text).toContain("4과세기간");
    expect(text).toContain("2년 이하");
    expect(text).toContain("납세자가 선택");
  });
});

describe("[E2-06 · U1-05] 목장 안내문 — 존재하지 않는 「기준면적 직접입력」 지칭 제거", () => {
  it("「직접 입력하면 이 선택은 쓰이지 않습니다」 문장이 없다", () => {
    const asset = { ...makeDefaultAsset(1), nblPastureIsLivestockOperator: true };
    const { container } = render(<PastureDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(container.textContent).not.toContain("직접 입력하면 이 선택은 쓰이지 않습니다");
  });

  it("실제 산출 경로(축종·두수·보유시설 자동 산출)를 안내한다", () => {
    const asset = { ...makeDefaultAsset(1), nblPastureIsLivestockOperator: true };
    const { container } = render(<PastureDetailSection asset={asset} onAssetChange={() => {}} />);
    expect(container.textContent).toContain("축종·두수·보유시설로 자동 산출");
  });
});
