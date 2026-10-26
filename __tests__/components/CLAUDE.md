# __tests__/components/ — 컴포넌트 테스트

UI 규칙은 [components/calc/CLAUDE.md](../../components/calc/CLAUDE.md), 엔진 테스트 규칙은 [__tests__/tax-engine/CLAUDE.md](../tax-engine/CLAUDE.md).

## 🔴 선택지 anchor는 **`value`** 를 본다 — 라벨 단언은 값 축을 못 지킨다 (2026-09-12)

「이 선택지가 **있다**」·「이 분기를 **고를 수 있다**」를 주장하는 테스트가 `screen.getByText("실거래가")`처럼 **라벨**로만 단언하면, 옵션의 `value`가 엉뚱한 문자열로 바뀌어도 **라벨은 그대로 렌더되어 초록으로 남는다.** 클릭하면 폼에 쓰레기 값이 들어가 세율·분기가 조용히 죽는데도 아무도 모른다.

**전역 뮤테이션 실측** — `RadioCardGroup`의 `value={opt.value}`와 `onChange(opt.value)`를 동시에 오염시켜 `components`+`calc`+`lib` 전건(**7,448건**, 기준선 전건 통과)을 돌렸더니 **50건 / 26파일**만 깨졌다. 라디오를 렌더하는 컴포넌트가 **163파일**인데 **모든 값이 전부 틀려도 7,398건이 초록**이었다. 실제 사례도 있다 — 과점주주 §13① 6% 구분(PR #1617)의 ⑤ anchor가 라벨만 봐 **구별력 0**이었고, `value`를 읽도록 고쳐 2건 red를 확보했다.

⇒ **공용 헬퍼 `__tests__/components/_helpers/radio-values.ts`** 를 쓴다:

```ts
import { radioValues, checkedRadioValue } from "../_helpers/radio-values";

expect(radioValues(container, "deemedBucketProviso")).toEqual(["none", "hq_factory", "luxury"]);
expect(checkedRadioValue(container, "deemedBucketProviso")).toBe("hq_factory");
```

- 한 화면에 라디오 그룹이 여럿이면 **`namePrefix`를 반드시 넘긴다**(안 넘기면 다른 그룹 값이 섞인다).
- **선택 상태를 클래스·배경색으로 단언하지 않는다** — tone 토큰이 바뀌면 깨지고, 정작 값이 틀린 것은 못 잡는다. `checkedRadioValue`를 쓴다.
- **라벨 단언 자체가 금지는 아니다.** 문구·톤·레이아웃이 **주제인** 테스트, 섹션 제목·필드 라벨을 보는 테스트는 그대로 둔다. 클릭 후 결과(세액·`onChange` 호출)를 검증하는 테스트도 이미 값 축을 지키므로 중복이 필요 없다. 문제는 **라벨 단언을 「값 축의 안전망」으로 세어 두는 것**이다.
- 네이티브 `<select>`도 같다 — `<option>` 라벨이 아니라 `value`를 본다.
