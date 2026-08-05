# `legal-codes/transfer.ts` 800줄 분리 — 그리고 드러난 검증 게이트 갭

> 상태: **완료 (2026-08-05)**
> 브랜치: `feat/factory-site-standard-area-nbl`

---

## 1. 배경

`lib/tax-engine/legal-codes/transfer.ts`가 **869줄**로 File Size Policy(트리거 800·착지 ≤700)를
넘고 있었다. 공장용지·A-BS-1 작업 **전부터** 초과 상태였고(862줄), 두 작업이 +7줄을 더했다.

이미 두 번 부분 분리한 이력이 있다:
- `MIXED_USE` → `transfer-mixed-use.ts` (2026-07-20)
- 중과 한시배제 경과조치 → `surcharge-transition.ts`

둘 다 **재수출로 하위 호환**을 유지했다 — 이번에도 같은 방식을 따른다.

---

## 2. 분리 결과

자연 이음매는 파일이 이미 갖고 있던 3개 섹션 주석이다.

| 파일 | 소관 | 줄 수 |
|---|---|---|
| `legal-codes/transfer.ts` | 양도소득세 본체 (소득세법 §89~§104) + **재수출** | 869 → **390** |
| `legal-codes/transfer-nbl.ts` (신설) | 비사업용 토지 (§104의3·시행령 §168의6~14) | **187** |
| `legal-codes/transfer-house.ts` (신설) | 다주택·상속주택·임대특례·감면·재개발·LTHD | **330** |

세 파일 모두 착지 목표(≤700)를 만족한다.

```ts
// transfer.ts
export * from "./transfer-nbl";
export * from "./transfer-house";
```

`legal-codes/transfer`를 **직접 import하는 파일이 10개** 있고(barrel 미경유), 세 블록의 심볼을
고루 쓴다 — 재수출이 없으면 전부 깨진다.

---

## 3. 🔴 이번에 드러난 것 — 기존 게이트가 못 잡는 누락이 있다

`lib/legal-verification/coverage-collect.ts`는 **`import * as transfer`** 로 namespace의 모든
문자열 leaf를 순회해 법령 인용을 모은다. 재수출이 끊기면 그 조문들이 **검증 모수에서 조용히
빠진다**.

문제는 **기존 게이트 어느 것도 이를 잡지 못한다**는 것이다. 재수출 한 줄을 지우고 실제로
돌려봤다(2026-08-05):

| 게이트 | 재수출 제거 후 | 잡히나 |
|---|---|---|
| `npm run verify:legal` | **338건 그대로** | ❌ manifest 기반이라 namespace와 무관 |
| `legal-verification-coverage-complete` | 통과 | ❌ "모수 **안**이 100%"만 본다 — 모수가 줄면 공허하게 참 |
| `legal-verification-unverifiable` | 통과 | ❌ 모수 **밖** 목록만 본다 |
| `tsc` | 오류 | ⭕ 단, **직접 import 호출부가 있는 심볼만** |

> ⚠️ 처음에는 "`verify:legal` 338건이 유지되는지로 확인하라"고 파일 헤더에 적었다.
> **틀렸다.** 실험으로 확인해 정정했다 — 추측으로 가드를 적으면 그 자체가 잘못된 안전감을 준다.

### ⇒ 전용 가드를 추가했다

`__tests__/lib/legal-codes-transfer-reexport.test.ts` (4건)

- 세 파일 각각의 대표 심볼이 `transfer` namespace에 노출되는지 단언 —
  실패 시 **누락 심볼 이름을 그대로 출력**한다
- `coverage-collect`와 **같은 순회**를 재현해 각 파일의 대표 인용 문자열이 실제로 수집되는지 확인

**가드가 실제로 잡는지 증명했다**: `transfer-house` 재수출을 제거하니 2건 실패 +
누락 7개(`MULTI_HOUSE`·`INHERITED_HOUSE`·`MIXED_USE`·`TRANSFER_RENTAL_HOUSING`·
`TRANSFER_REDUCTION_ARTICLE`·`REDEVELOPMENT`·`LTHD_EXCLUSION_LABEL`)를 이름으로 지목했다.

> ⚠️ **인용 표기가 파일마다 다르다** — `transfer-nbl`은 `§168조의6`, `transfer-house`는
> `§167의3`(「조의」 없음). 추측으로 쓴 첫 버전은 정상 상태에서도 실패했다. 실제 리터럴을
> 실측해 고정했다.

---

## 4. 남은 것

- **다른 `legal-codes/*` 모듈에도 같은 갭이 있다.** `coverage-collect.ts`는 8개 모듈을
  namespace import하는데, 그중 어느 것이든 향후 분리하면 같은 문제가 생긴다.
  이번 가드는 `transfer` 계열만 덮는다 — 일반화는 별건.
- `legal-codes/property.ts` 등 다른 모듈의 줄 수는 확인하지 않았다.

---

## 5. 검증

- `tsc --noEmit` 0건 · `eslint` 0 errors
- 재수출 가드 **4건** GREEN (제거 실험으로 유효성 증명)
- `npm run verify:legal` **338건 통과 · 실패 0** (분리 전과 동일)
- `__tests__/lib/` **1,364건** GREEN
- 전체 vitest **13,632건** GREEN · 실패 0

> ⚠️ **1차 전체 실행에서 1건이 실패했으나 재현되지 않았다.** 당시 다른 vitest 프로세스
> 22개가 동시에 돌고 있었다(자원 경합). 깨끗한 재실행에서 13,632/13,632 통과.
> 실패 테스트 이름은 vitest 출력 버퍼링으로 확보하지 못했다 — **원인 미확정**이며,
> 「내 변경 때문이 아니다」가 아니라 「재현되지 않았다」로만 기록한다.
> 법령 관련 6파일 42건·재수출 가드는 단독 실행에서 모두 통과했다.
