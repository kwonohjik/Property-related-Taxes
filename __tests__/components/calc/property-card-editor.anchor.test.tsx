/**
 * PropertyCardEditor — 선택지 value·게이트 anchor [AT-PCE]
 *
 * ## 왜 이 컴포넌트인가
 *
 * 라디오를 렌더하는 컴포넌트 163개 중 **테스트에서 전이적으로 도달하지 못하는 20개**를
 * 실측으로 추렸는데(테스트 → import 그래프), 19개는 마법사 Step 컨테이너·`page.tsx`라
 * E2E가 맞는 층이었다. **`PropertyCardEditor`만 leaf에 가까웠다** —
 * `PropertyListInput`·`LandParcelEditor`가 소비하는 재사용 편집 폼인데 단위 anchor가 없었다.
 *
 * ## 무엇을 고정하나
 *
 * 이 폼의 라디오 두 축은 **세액을 가른다**:
 * - `s84-*` — §8④ 1세대1주택자 의제 4유형. 의제가 서면 기본공제 12억·세액공제가 달라진다.
 * - `appurtenant-part-*` — §8④1호 소유 부분(토지/건물). 공시가격 안분 방향이 뒤집힌다.
 *
 * ⚠️ **라벨이 아니라 `value`를 본다.** 옵션 `value`가 깨져도 라벨은 그대로 렌더되어
 *    테스트가 초록으로 남는다(전역 뮤테이션 실측: 7,448건 중 50건만 그것을 잡았다).
 *    근거·사용법은 `__tests__/components/_helpers/radio-values.ts` 헤더.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PropertyCardEditor } from "@/components/calc/PropertyCardEditor";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { radioValues, checkedRadioValue } from "../_helpers/radio-values";

afterEach(cleanup);

const S84 = "s84-";
const PART = "appurtenant-part-";

/** 컴포넌트가 실제로 읽는 필드만 채운다 — 나머지는 렌더 경로에 닿지 않는다 */
function entry(patch: Partial<PropertyEntry> = {}): PropertyEntry {
  return {
    id: "p1",
    assessedValue: "",
    area: "",
    landArea: "",
    location: "non_metro",
    exclusionType: "none",
    section8para4Type: "none",
    newHouseAcquisitionDate: "",
    inheritanceOpenDate: "",
    inheritanceShareRatio: "",
    jibun: "",
    road: "",
    building: "",
    dong: "",
    ho: "",
    reductionRate: "",
    ownershipRatio: "100",
    appurtenantSplitEnabled: false,
    appurtenantOwnedPart: "land",
    landStdValue: "",
    buildingStdValue: "",
    priorLandStdValue: "",
    priorBuildingStdValue: "",
    priorAssessedValue: "",
    propertyTaxAmount: "",
    multiFamilyEnabled: false,
    floorUnits: [],
    ...patch,
  } as PropertyEntry;
}

/**
 * 🔴 **고급 옵션은 기본 접힘이다** — `showAdvanced` 초기값이
 * `advancedOptionBadges(property).length > 0`이라, 아무 옵션도 설정되지 않은 엔트리는
 * §8④·소유자 분리 블록이 **아예 렌더되지 않는다**.
 *
 * 이 상태로 「라디오가 없다」를 단언하면 **접혀 있어서** 통과하는 것이지 게이트를 잰 게 아니다.
 * ⇒ 렌더 직후 **항상 펼쳐** 놓고, 그 위에서 게이트를 잰다.
 */
function renderCard(patch: Partial<PropertyEntry> = {}, props: Record<string, unknown> = {}) {
  const onUpdate = vi.fn();
  const r = render(
    <PropertyCardEditor
      property={entry(patch)}
      isCorporate={false}
      capMode="none"
      onUpdate={onUpdate}
      {...props}
    />,
  );
  const expander = r.container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
  if (expander) fireEvent.click(expander);
  return { ...r, onUpdate };
}

/** ToggleCard 의 Switch — 제목이 `aria-label`이다 */
function switchByTitle(title: RegExp) {
  return screen.getByRole("switch", { name: title });
}

describe("[AT-PCE] §1 §8④ 의제 유형 — 4값이 «값으로» 제공된다", () => {
  it("[AT-PCE-01] 네 유형이 전부 있다 (라벨이 아니라 value)", () => {
    const { container } = renderCard({ section8para4Type: "temporary_two_house" });
    expect(radioValues(container, S84)).toEqual([
      "temporary_two_house",
      "inherited_house",
      "regional_low_price",
      "appurtenant_land_only",
    ]);
  });

  it("[AT-PCE-02] 선택 상태도 값으로 확인한다 (배경색·ring 클래스가 아니라)", () => {
    const { container } = renderCard({ section8para4Type: "inherited_house" });
    expect(checkedRadioValue(container, S84)).toBe("inherited_house");
  });

  it("[AT-PCE-03] 토글을 켜면 §8④2호(일시적 2주택)로 연다", () => {
    const { onUpdate } = renderCard();
    fireEvent.click(switchByTitle(/1세대 1주택 의제/));
    expect(onUpdate).toHaveBeenCalledWith({ section8para4Type: "temporary_two_house" });
  });

  it("[AT-PCE-04] 토글을 끄면 하위 날짜·지분 입력도 함께 지운다 (stale 방지)", () => {
    const { onUpdate } = renderCard({
      section8para4Type: "inherited_house",
      inheritanceOpenDate: "2024-01-01",
      inheritanceShareRatio: "30",
    });
    fireEvent.click(switchByTitle(/1세대 1주택 의제/));
    expect(onUpdate).toHaveBeenCalledWith({
      section8para4Type: "none",
      newHouseAcquisitionDate: "",
      inheritanceOpenDate: "",
      inheritanceShareRatio: "",
    });
  });
});

describe("[AT-PCE] §2 지방 저가주택(§8④4호)은 수도권에서 고를 수 없다", () => {
  /**
   * 시행령 §4의2③ — 「수도권·광역시·특별자치시 **외** 지역」 요건이 UI 게이트로 구현돼 있다.
   * 라벨만 보면 「선택지가 있다」까지밖에 못 말한다 — **고를 수 있는지**는 다른 축이다.
   */
  it("[AT-PCE-10] 수도권이면 regional_low_price 가 disabled", () => {
    const { container } = renderCard({
      section8para4Type: "temporary_two_house",
      location: "metro",
    });
    const regional = container.querySelector<HTMLInputElement>(
      `input[type="radio"][name^="${S84}"][value="regional_low_price"]`,
    );
    expect(regional).toBeTruthy();
    expect(regional!.disabled).toBe(true);
  });

  it("[AT-PCE-11] 〔역방향〕 비수도권이면 활성이다 — 게이트가 항상 잠그는 것이 아니다", () => {
    const { container } = renderCard({
      section8para4Type: "temporary_two_house",
      location: "non_metro",
    });
    const regional = container.querySelector<HTMLInputElement>(
      `input[type="radio"][name^="${S84}"][value="regional_low_price"]`,
    );
    expect(regional!.disabled).toBe(false);
  });

  it("[AT-PCE-12] 나머지 세 유형은 수도권에서도 활성이다 (게이트가 과잉 확장되지 않는다)", () => {
    const { container } = renderCard({
      section8para4Type: "temporary_two_house",
      location: "metro",
    });
    const enabled = Array.from(
      container.querySelectorAll<HTMLInputElement>(`input[type="radio"][name^="${S84}"]`),
    )
      .filter((el) => !el.disabled)
      .map((el) => el.value);
    expect(enabled).toEqual(["temporary_two_house", "inherited_house", "appurtenant_land_only"]);
  });
});

describe("[AT-PCE] §3 §8④ 블록 자체의 노출 게이트", () => {
  it("[AT-PCE-20] 법인은 의제 대상이 아니다 — 블록이 없다", () => {
    const { container } = renderCard({ section8para4Type: "temporary_two_house" }, { isCorporate: true });
    expect(radioValues(container, S84)).toEqual([]);
  });

  it("[AT-PCE-21] 합산배제를 신청한 주택도 블록이 없다", () => {
    const { container } = renderCard({
      section8para4Type: "temporary_two_house",
      exclusionType: "existing_rental",
    });
    expect(radioValues(container, S84)).toEqual([]);
  });

  it("[AT-PCE-22] 〔역방향〕 개인 + 합산배제 미신청이면 있다", () => {
    const { container } = renderCard({ section8para4Type: "temporary_two_house" });
    expect(radioValues(container, S84).length).toBe(4);
  });
});

describe("[AT-PCE] §4 §8④1호 소유 부분 — 토지/건물", () => {
  it("[AT-PCE-30] 분리 토글 OFF면 라디오가 없다", () => {
    const { container } = renderCard();
    expect(radioValues(container, PART)).toEqual([]);
  });

  it("[AT-PCE-31] ON이면 land·building 두 값이 나온다", () => {
    const { container } = renderCard({ appurtenantSplitEnabled: true });
    expect(radioValues(container, PART)).toEqual(["land", "building"]);
  });

  it("[AT-PCE-32] 기본 선택은 land — 미설정이어도 안분 방향이 정해진다", () => {
    const { container } = renderCard({ appurtenantSplitEnabled: true, appurtenantOwnedPart: "" });
    expect(checkedRadioValue(container, PART)).toBe("land");
  });

  it("[AT-PCE-33] building 을 고르면 그 값이 선택 상태로 반영된다", () => {
    const { container } = renderCard({
      appurtenantSplitEnabled: true,
      appurtenantOwnedPart: "building",
    });
    expect(checkedRadioValue(container, PART)).toBe("building");
  });
});
