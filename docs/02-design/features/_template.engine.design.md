# {{기능명}} — 엔진 설계

> **사용법**: 새 기능을 만들 때 이 파일을 `{feature-name}.engine.design.md`로 복사해서 채운다.
> UI 측은 별도로 `{feature-name}.ui.design.md` 파일을 `_template.ui.design.md`(있다면) 기반으로 작성한다.

## Context

이 기능이 왜 필요한가? 어떤 사용자 시나리오·법령 변경·세무 사례가 동기인가?
이전에 어떤 한계가 있었는가?

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

이 기능이 다뤄야 할 모든 시나리오를 본문·단서·각호 단위로 열거한다.
사용자가 새 케이스를 던질 때마다 코드를 고치기 전에 먼저 이 표에 행을 추가한다.
표가 곧 anchor 테스트 약속이다 — 행 1개 = 테스트 1개 이상.

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | (예) 일괄양도 + 매매 + 실가구분 | 소령 §166⑥ 본문 | 집행기준 p.123 사례 | `bundled-actual-price.test.ts` | ☐ TODO |
| 2 | (예) 일괄양도 + 상속 + 면적안분 | 소령 §166⑥ 단서 | 엑셀 사례 715M·212㎡ | `bundled-inherited.test.ts` | ☐ TODO |
| 3 | (예) 일괄양도 + 증여 | 소령 §166⑥ 단서 | (미발견 — 추후 보강) | (TODO) | ☐ |

**규칙**:
- 행≥1 없으면 Do 단계 진입 금지.
- "anchor 출처 미발견" 행은 허용하되 상태 ☐로 표시. 발견 즉시 anchor 추가.
- 사용자가 추가 케이스 제시 → 먼저 이 표에 행 추가 → 그 다음 코드.

---

## 법령 근거

조문 본문·단서·각호를 인용. `lib/tax-engine/legal-codes/` 상수 사용 강제.

```
소령 §166⑥ 본문: ...
소령 §166⑥ 단서: ...
```

---

## 엔진 input 타입

```ts
export type {{Feature}}Input = {
  // ...
};
```

## 엔진 result 타입

```ts
export type {{Feature}}Result = {
  // ...
};
```

새 Date 필드는 `lib/api/date-coerce.ts` 헬퍼 사용 약속 (라우트 통합 시).

---

## 계산 알고리즘 (단계별)

1. ...
2. ...
3. ...

---

## Silent fallback / 자동 안분 후보 식별

- 빈 값을 자동으로 채우는 로직이 들어갈 수 있는 필드를 사전 식별.
- 법령 명시 외 자동 안분 금지 (메모리 `feedback_no_silent_apportion_fallback.md` 참조).
- 미입력 시 validation에서 명확한 오류로 차단.

---

## 테스트 약속

- 케이스 인벤토리 표의 모든 행에 대응하는 anchor 테스트.
- PDF 예시값은 원단위까지 `toBe()` (메모리 `feedback_pdf_example_test_anchoring.md`).
- 회귀 방지 anchor — 사용자 발견 버그는 즉시 anchor로 고정.

---

## UI 통합 위임

- UI 측 명세는 `{feature}.ui.design.md` 참조.
- 8개 동기화 지점은 UI 시니어 책임 — 엔진 시니어는 input/result 타입만 정의.
