/**
 * @vitest-environment jsdom
 *
 * ⑤ 양도 주택 자신의 §155② 단서·순위 게이트 토글 — `CompanionAcqInheritanceBlock`.
 *
 * ## 왜 필요한가
 *
 * ④ 어댑터 anchor(`selling-house-inherited-surcharge.anchor.test.ts`)는 `AssetForm`을 **직접
 * 만들어** 페이로드를 본다. 화면에 선언 칸이 없으면 그 필드는 **영원히 `undefined`**이고,
 * 어댑터 anchor는 그대로 초록이다([[feedback_required_field_needs_an_input_path]]).
 *
 * ## 세액이 걸린 칸이다
 *
 * 실측(조정지역 3주택 · 양도 2026-09-18):
 * - 동일세대 상속 → 중과 유지 354,541,000
 * - 동일세대 + **동거봉양 예외** → 배제 141,966,000 (**−212,575,000**)
 * - 순위 부적격 → 중과 유지 354,541,000
 *
 * 동거봉양 칸이 없으면 법이 인정하는 예외를 주장할 길이 없어 **과다 과세**가 되고,
 * 순위 칸이 없으면 선순위가 아닌 주택도 배제돼 **과소 과세**가 된다. 양방향이라 둘 다 필요하다.
 *
 * ## ⚠️ 제목은 명부 행과 **달라야 한다**
 *
 * 명부 행(`HouseEntryEditor`)에 같은 두 사실의 토글이 이미 있다. 처음에는 제목을 그대로 복사했다가
 * `inherited-house-155-2-proviso-toggle.test.tsx:32`의 정규식과 **완전히 일치**하는 것을 역방향
 * grep으로 잡았다 — 두 컴포넌트가 한 화면에 함께 뜨는 순간 형제 셀렉터가 2건으로 늘어난다
 * ([[feedback_new_widget_breaks_uniqueness_selectors]]). ⇒ 「**양도 주택이**」로 축을 박았다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

/** 명부 행 제목(「동거봉양 합가 + …」)과 **겹치지 않는** 어간으로 잡는다. */
const PARENTAL_CARE = /양도 주택이 동거봉양 합가 전 피상속인 보유분/;
const RANKING = /양도 주택이 선순위 상속주택이 아님/;
const SAME_HOUSEHOLD = /상속개시 당시 피상속인과 동일세대/;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2015-01-01",
    inheritanceDate: "2024-01-01",
    ...over,
  };
}

const shown = (re: RegExp) => screen.queryAllByText(re).length;

describe("⑤ 양도 주택 §155② 단서·순위 — 선언 칸이 화면에 있다", () => {
  it("SP-1 주택 + 상속 취득이면 순위 토글이 뜬다", () => {
    render(<CompanionAcqInheritanceBlock asset={asset()} onChange={() => {}} />);
    expect(shown(RANKING)).toBeGreaterThan(0);
    expect(shown(SAME_HOUSEHOLD)).toBeGreaterThan(0);
  });

  it("SP-2 동일세대 OFF → 동거봉양 예외 칸 미노출 (요건 없는 주장 차단)", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={asset({ decedentSameHouseholdBeforeInheritance: false })}
        onChange={() => {}}
      />,
    );
    expect(shown(PARENTAL_CARE)).toBe(0);
  });

  it("SP-3 동일세대 ON → 동거봉양 예외 칸 노출", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={asset({ decedentSameHouseholdBeforeInheritance: true })}
        onChange={() => {}}
      />,
    );
    expect(shown(PARENTAL_CARE)).toBeGreaterThan(0);
  });

  it("SP-4 음성 짝: 주택이 아니면 두 토글 모두 미노출", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={asset({ assetKind: "land", decedentSameHouseholdBeforeInheritance: true })}
        onChange={() => {}}
      />,
    );
    expect(shown(RANKING)).toBe(0);
    expect(shown(PARENTAL_CARE)).toBe(0);
  });

  it("SP-5 토글이 실제로 행 값을 반영한다 — 라벨만 있고 배선이 없으면 안 된다", () => {
    const sw = (label: string) =>
      document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);
    const RANK_LABEL = "양도 주택이 선순위 상속주택이 아님 (피상속인 2주택 이상)";
    const { rerender } = render(
      <CompanionAcqInheritanceBlock asset={asset()} onChange={() => {}} />,
    );
    expect(sw(RANK_LABEL)).toHaveAttribute("data-unchecked");
    rerender(
      <CompanionAcqInheritanceBlock
        asset={asset({ isRankingDisqualifiedInheritedHouse: true })}
        onChange={() => {}}
      />,
    );
    expect(sw(RANK_LABEL)).toHaveAttribute("data-checked");
  });

  it("SP-6 제목이 명부 행 토글과 겹치지 않는다 (형제 셀렉터 유일성)", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={asset({ decedentSameHouseholdBeforeInheritance: true })}
        onChange={() => {}}
      />,
    );
    // 명부 행 제목 두 개가 이 화면에 등장하면 안 된다.
    expect(shown(/동거봉양 합가 \+ 합가 전 피상속인 보유 주택/)).toBe(0);
    expect(shown(/피상속인 2주택 이상 — 순위상 상속주택 아님/)).toBe(0);
  });
});
