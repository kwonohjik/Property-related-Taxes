/**
 * 라디오 선택지의 **값(value)** 을 읽는 테스트 헬퍼
 *
 * ## 왜 필요한가 — 라벨 단언은 값 축을 못 지킨다 (2026-09-12 실측)
 *
 * `RadioCardGroup`은 `options: [{ value, label }]`를 받아 `<input type="radio" value={value}>`와
 * 라벨을 함께 그린다. **라벨은 사람이 읽는 것이고, 계산을 가르는 것은 `value`다.**
 *
 * 그런데 선택지의 **존재**를 `screen.getByText("실거래가")` 같은 **라벨**로만 단언하면,
 * `value`가 엉뚱한 문자열로 바뀌어도 라벨은 그대로 렌더되어 **테스트가 초록으로 남는다**.
 * 클릭하면 폼에 쓰레기 값이 들어가고 세율·분기가 조용히 죽는데도 아무도 모른다.
 *
 * **전역 뮤테이션 실측** — `RadioCardGroup`의 `value={opt.value}`와 `onChange(opt.value)`를
 * 동시에 오염시켜(= 모든 라디오의 값이 틀린 상태) `components`+`calc`+`lib` 전건을 돌렸다:
 *
 * | | |
 * |---|---|
 * | 라디오를 렌더하는 컴포넌트 | **163파일** |
 * | 전체 테스트 | **7,448건** (기준선 전건 통과) |
 * | 뮤테이션이 깬 것 | **50건 / 26파일** |
 *
 * ⇒ **모든 라디오 값이 전부 틀려도 7,398건이 초록이었다.** 실제 사례도 나왔다 —
 * 과점주주 §13① 6% 구분(PR #1617)의 ⑤ anchor가 라벨만 봤고, 옵션 `value`를 변조하는
 * 뮤테이션에서 **구별력 0**이었다(`value`를 읽도록 고쳐 2건 red 확보).
 *
 * ## 언제 쓰나
 *
 * 「이 선택지가 **있다**」·「이 분기를 **고를 수 있다**」를 주장하는 anchor.
 * 즉 **그 라벨 단언이 그 축의 유일한 안전망**일 때는 반드시 값까지 본다.
 *
 * 라벨 단언 자체가 금지는 아니다 — 문구·톤·레이아웃이 **주제인** 테스트, 섹션 제목·필드
 * 라벨을 보는 테스트는 그대로 두면 된다. 클릭 후 결과(세액·`onChange` 호출)를 검증하는
 * 테스트도 이미 값 축을 지키므로 중복이 필요 없다.
 *
 * ## 사용 예
 *
 * ```ts
 * const { container } = render(<MyCard ... />);
 * expect(radioValues(container, "deemedBucketProviso")).toEqual(["none", "hq_factory", "luxury"]);
 * ```
 */

/**
 * 렌더된 라디오 `<input>`들의 `value`를 **DOM 순서대로** 반환한다.
 *
 * @param container `render()`가 돌려준 container (또는 임의의 하위 엘리먼트)
 * @param namePrefix `name` 속성 접두사로 그룹을 좁힌다. 한 화면에 라디오 그룹이 여럿이면
 *   반드시 넘길 것 — 안 넘기면 다른 그룹의 값이 섞여 단언이 흔들린다.
 *   `RadioCardGroup`의 `name`은 호출부가 정하며 행 id 등이 뒤에 붙는 경우가 많아 **접두사**로 받는다.
 */
export function radioValues(container: HTMLElement, namePrefix?: string): string[] {
  const selector =
    namePrefix === undefined
      ? 'input[type="radio"]'
      : `input[type="radio"][name^="${namePrefix}"]`;
  return Array.from(container.querySelectorAll<HTMLInputElement>(selector)).map((el) => el.value);
}

/**
 * 현재 선택된 라디오의 `value` (없으면 `undefined`).
 *
 * 「기본값이 무엇인가」·「토글을 바꾸면 선택이 따라오는가」를 주장할 때 쓴다 —
 * 선택 표시를 배경색·ring 같은 **클래스**로 단언하면 tone 토큰이 바뀔 때 깨지고,
 * 정작 값이 틀린 것은 못 잡는다.
 */
export function checkedRadioValue(
  container: HTMLElement,
  namePrefix?: string,
): string | undefined {
  const selector =
    namePrefix === undefined
      ? 'input[type="radio"]:checked'
      : `input[type="radio"][name^="${namePrefix}"]:checked`;
  return container.querySelector<HTMLInputElement>(selector)?.value;
}
