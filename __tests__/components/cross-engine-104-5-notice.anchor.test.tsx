/**
 * @vitest-environment jsdom
 *
 * anchor: §104⑤ 크로스 엔진 고지 — **문구 단일 소스 + 좁은 노출 조건**
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-1**
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * §104⑤ 본문은 「§94①**1호ㆍ2호 및 제4호**」 자산을 **둘 이상 양도**하면 전부 합쳐 비교하도록
 * 정하는데, 이 앱은 부동산 엔진과 주식 엔진이 분리돼 **교차 조합에 §104⑤이 적용되지 않는다**
 * (실측 과소 **25,680,000** — 계획서 §3). C-1은 그 사실을 **알리는** 단계이고 세액은 고치지 않는다
 * (고치는 것은 C-2 조정 레이어).
 *
 * 🔒 **노출은 좁게, 정보는 정확하게**(계획서 R-5):
 *   - 부동산 결과는 **비사업용 토지가 있을 때만** · 주식 결과는 **기타자산일 때만** 띄운다.
 *   - 그러나 §104⑤ 자체는 비사업용 토지가 아니어도 걸리므로 **본문이 그 사실을 적어야 한다**.
 *     이 anchor가 그 한 줄을 고정한다 — 빠지면 노출 조건이 곧 적용 범위인 것처럼 오도한다.
 *
 * ⚠️ **인쇄 제외**(`print:hidden`) — 신고서·PDF는 계산 결과 문서이지 안내문이 아니다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CrossEngine1045Notice } from "@/components/calc/shared/CrossEngine1045Notice";

afterEach(cleanup);

describe("§104⑤ 크로스 엔진 고지 (C-1)", () => {
  it("N-1: 부동산 계산기에서는 **기타자산**을 반대편으로 지목한다", () => {
    render(<CrossEngine1045Notice from="real_estate" />);
    expect(
      screen.getByText(/기타자산\(과점주주·부동산과다보유법인 주식 등\)/),
    ).toBeTruthy();
  });

  it("N-2: 주식 계산기에서는 **부동산**을 반대편으로 지목한다", () => {
    render(<CrossEngine1045Notice from="other_asset" />);
    // ⚠️ 정규식(부분 일치)은 첫 문단의 「부동산·부동산에 관한 권리·**기타자산**」까지 잡아
    //   다중 매치가 된다 — counterpart만 고정하려면 **완전 일치** 문자열이어야 한다.
    expect(screen.getByText("부동산·부동산에 관한 권리")).toBeTruthy();
  });

  it("N-3: 「비사업용 토지가 아니더라도 … 합산 대상」 문장이 있다 (오도 방지)", () => {
    // 노출 조건(비사토·기타자산)이 §104⑤ 적용 범위와 같다고 읽히면 안 된다.
    render(<CrossEngine1045Notice from="real_estate" />);
    expect(
      screen.getByText(/비사업용 토지가 아니더라도 부동산과 기타자산을 함께 양도했다면/),
    ).toBeTruthy();
  });

  it("N-4: 8호·9호 **「동일한 자산으로 보아」** 후단을 언급한다", () => {
    render(<CrossEngine1045Notice from="other_asset" />);
    expect(screen.getByText(/동일한 자산으로 보아/)).toBeTruthy();
    expect(screen.getByText(/비사업용 토지 과다소유법인 주식/)).toBeTruthy();
  });

  it("N-5: **세액을 단정하지 않는다** — 「과소할 수 있다」 + 세무대리인 확인 권유", () => {
    // 얼마나 과소인지는 이 계산기가 알 수 없다(반대편 자산 정보가 없다).
    // 구체 금액을 적으면 근거 없는 단정이 된다.
    render(<CrossEngine1045Notice from="real_estate" />);
    expect(screen.getByText(/세액이 과소/)).toBeTruthy();
    expect(screen.getByText(/세무대리인의\s*확인/)).toBeTruthy();
  });

  it("N-6: 인쇄에서 제외된다 (`print:hidden`)", () => {
    const { container } = render(<CrossEngine1045Notice from="real_estate" />);
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("print:hidden");
  });
});
