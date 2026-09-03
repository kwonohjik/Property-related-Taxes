/**
 * anchor — 「나머지 지분은 타인 소유」 선언 토글의 **렌더 게이트** (R4 ⑤).
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md`
 *
 * 두 게이트를 고정한다:
 *  - **지분율 < 100%** 일 때만 — 100%면 축 A/B 구별이 무의미해 뜻 없는 선택을 강요한다.
 *  - **`onRemainderChange`를 받은 호출부**에서만 — 지분 분할 모드(③ 취득정보)의 호출부는
 *    넘기지 않으므로 그쪽에는 뜨지 않는다. 축 B에는 이 선언이 뜻이 없다(게이트가 다르다).
 *
 * ⑤ 렌더 조건과 ⑧ 검증 조건이 어긋나면 「화면에 없는 값이 게이트를 통과시키는」 유령이 된다 —
 * 그래서 ③ normalize·⑤ onChange 양쪽에서 100% 복귀 시 선언을 지운다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OwnershipRatioBlock } from "@/components/calc/transfer/OwnershipRatioInput";

afterEach(cleanup);

const TITLE = /나머지 지분은 타인 소유입니다/;

describe("R4 T — 선언 토글 렌더 게이트", () => {
  it("T1 지분율 60% + 핸들러 제공 → 토글 렌더", () => {
    render(
      <OwnershipRatioBlock
        numerator="60"
        denominator="100"
        onChange={vi.fn()}
        remainderThirdParty=""
        onRemainderChange={vi.fn()}
      />,
    );
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it("T2 지분율 100% → 토글 미렌더", () => {
    render(
      <OwnershipRatioBlock
        numerator="100"
        denominator="100"
        onChange={vi.fn()}
        remainderThirdParty=""
        onRemainderChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("T3 핸들러 미제공(지분 분할 모드 호출부) → 토글 미렌더", () => {
    render(
      <OwnershipRatioBlock
        numerator="60"
        denominator="100"
        onChange={vi.fn()}
        label="취득 지분율"
      />,
    );
    // 「100% 기준 입력」 안내는 그대로 뜬다 — 축 B에서도 금액 규약은 같다.
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.getAllByText(/100% 기준/).length).toBeGreaterThan(0);
  });

  it("T5 🔴 사유가 주어지면 토글이 disabled + 사유가 표시된다 (재개발·입주권)", () => {
    // ⑧이 막는 자산 종류에서 **켜지는** 토글을 두면 「켰는데 여전히 막힌다」는 또 다른
    // dead-end가 된다. 판정은 ⑧과 같은 술어(`isFractionalUnsupportedAssetKind`).
    render(
      <OwnershipRatioBlock
        numerator="40"
        denominator="100"
        onChange={vi.fn()}
        remainderThirdParty="yes"
        onRemainderChange={vi.fn()}
        remainderDisabledReason="재개발·재건축·입주권은 지분 모드 계산을 아직 지원하지 않습니다."
      />,
    );
    const sw = screen.getByRole("switch");
    // ⚠️ `getAttribute`는 값 없는 속성에 `""`를 준다 — `??`로 이어붙이면 falsy로 떨어진다.
    //    존재 여부로 판정한다.
    expect(
      sw.hasAttribute("data-disabled") ||
        sw.hasAttribute("disabled") ||
        sw.getAttribute("aria-disabled") === "true",
    ).toBe(true);
    // 저장값이 "yes"로 남아 있어도 **켜진 것처럼 보이지 않는다** (⑧이 막으므로 화면과 일치시킨다)
    expect(sw.getAttribute("aria-checked") ?? sw.getAttribute("data-state")).toMatch(/false|unchecked/);
    expect(screen.getByText(/지분 모드 계산을 아직 지원하지 않습니다/)).toBeTruthy();
  });

  it("T4 선언 ON이면 토글이 켜진 상태로 렌더된다", () => {
    render(
      <OwnershipRatioBlock
        numerator="60"
        denominator="100"
        onChange={vi.fn()}
        remainderThirdParty="yes"
        onRemainderChange={vi.fn()}
      />,
    );
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked") ?? sw.getAttribute("data-state")).toMatch(/true|checked/);
  });
});
