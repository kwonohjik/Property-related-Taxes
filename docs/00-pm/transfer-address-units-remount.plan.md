# 양도세 소재지 동·호 목록이 사라져 「동·호를 선택하세요」에 막힘 — 수정 계획

> 작성 2026-10-21 · 상태 **Do 완료 — Q-1~Q-3 모두 권고안 a(2026-10-21). 구현 PR #2334(머지 대기) · 결과는 「Do 결과」** · 워크트리 `../Property-related-Taxes-dongho` · 브랜치 `docs/address-units-remount-plan`
> 기준 master `603b4ddfe`. 줄 번호는 모두 이 커밋 기준이다.
> 선행: #2331(주소 세대 조회가 단계를 떠난 뒤 끝나면 다음 단계 입력이 지워지던 결함). 그 PR의 「별건」으로 남긴 것이다.
> 관련 계획서: `transfer-address-unit-gate-detached-house.plan.md`(단독주택 필지에서 동·호를 요구하지 않게 한 게이트), `business-key-property-identity.plan.md`(소재지·동·호 필수의 근거).

---

## 0. 증상 — 실측

양도세 1단계에서 세대가 있는 주소(공동주택)를 고른 뒤 아래처럼 조작했다. 세대 목록은 `page.route`로 「101동 501·502」를 돌려주게 고정했고, 진단 spec은 커밋하지 않았다.

| | 조작 | 동·호 목록 | store | 「다음」 |
|---|---|---|---|---|
| S1 | 기본정보 섹션 접었다 펼치기 | **유지** | `hasAddressUnits=true` | — |
| S2 | 새로고침(세션 복원) | **사라짐**. 「상세주소」 글자 칸만 보인다 | `hasAddressUnits=true`, 동·호 빈 값 | **「동·호를 선택하세요」로 막힘** |
| S3 | 단계 탭으로 「보유 상황」 → 「자산 목록」 | 사라짐 | 같음 | 막힘 |
| S4 | 동·호 선택 → 새로고침 → 상세주소 칸에 「101동 501호」 입력 | 사라짐 | **동·호가 `""`로 지워짐** | 막힘 |
| S5 | S2 상태에서 주소를 다시 검색해 「입력한 주소 그대로」 선택 | 다시 나타남(조회 1회 추가) | 같음 | 동·호를 고르면 풀림 |
| S6 | 세대 조회를 붙잡아 둔 채 단계 탭으로 이동 → 조회 끝 → 돌아옴 | 없음 | `hasAddressUnits=true` | 막힘 |

- S3에서 단계 탭은 1단계 검증 없이 넘어간다(탭 클릭 후 본문 제목이 「보유 상황 입력」이었다). 그래서 동·호를 고르기 전에도 1단계를 떠날 수 있다.
- 탈출 경로는 S5뿐이다. 오류 문구는 이 방법을 알려주지 않는다.

---

## 1. 원인

### 1-1. 「세대가 있다」는 사실과 「세대 목록」의 저장 위치가 다르다

- `hasAddressUnits`는 자산 필드다. store에 저장되고 sessionStorage로 새로고침 뒤에도 남는다.
- 세대 목록은 `AddressSearch`의 로컬 상태다(`components/ui/address-search.tsx:107` `units`). 선택값도 로컬이다(`:109` `selectedDong`, `:110` `selectedHo`).
- 목록 조회는 주소를 고르는 순간에만 일어난다(`handleSelect` `:216` → `:234` `void fetchUnits(...)`). 마운트될 때 다시 조회하는 코드가 없다.
- 그래서 `AddressSearch`가 다시 마운트되면 다음 두 상태가 함께 성립한다.
  - 「세대가 있으니 동·호를 고르라」는 검증: `lib/calc/transfer-tax-validate-asset.ts:170`·`:174`
  - 「고를 목록이 없음」: `:404` `hasSelectableUnits(units)`가 거짓이라 `:438` 상세주소 칸이 그려진다

다시 마운트되는 경로는 다음과 같다.
- 실측(S2·S3·S6): 새로고침, 단계 이동
- 코드상 같은 경로지만 실측하지 않음(확인 필요): 계산 이력 불러오기, 첫 자산 교체·삭제(`remountEpoch`로 카드 재마운트), 다건 편집 임베드

### 1-2. 상세주소 칸은 동·호를 저장하지 않고, 이미 저장된 동·호를 지운다

- `AssetSectionBasic`이 `AddressSearch`에 넘기는 `value`에는 `dong`·`ho`가 없다(`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:296~304`). `AddressValue`에는 `dong?`·`ho?` 필드가 있는데도 채우지 않는다.
- 상세주소를 입력하면 `handleDetailChange`(`address-search.tsx:253`)가 `{ ...value, detail }`를 올린다.
- 저장할 때는 `addressDong: v.dong ?? ""`, `addressHo: v.ho ?? ""`(`AssetSectionBasic.tsx:312`·`:313`)로 매핑된다. 그래서 S4처럼 이미 고른 동·호가 빈 값이 된다.

### 1-3. 막히는 곳은 양도세뿐이다

- `onUnitsResolved`를 쓰는 곳은 `AssetSectionBasic.tsx:295` 하나다.
- `AddressSearch`를 쓰는 다른 계산기 10곳도 다시 마운트되면 목록이 사라진다. 다만 동·호를 요구하지 않아 막히지는 않는다. 이 계획의 범위 밖이다(§6).

---

## 2. 수정안

### R1. 다시 마운트되면 세대 목록을 다시 불러온다

- `AddressSearch`에 선택 prop `knownHasUnits?: boolean`을 둔다. 「이 주소는 세대가 있다고 이미 판정됐다」는 뜻이다.
  - `AssetSectionBasic`만 `asset.hasAddressUnits`를 넘긴다.
  - 다른 10곳은 넘기지 않으므로 동작이 그대로다.
- 마운트될 때 아래 조건이 모두 맞으면 목록만 다시 불러온다.
  - `!disableUnits`
  - `knownHasUnits === true`
  - 주소(`value.jibun`)가 있음
  - 목록이 비어 있음
- 다시 불러오는 요청은 처음 조회와 같다. `fetchUnits`는 지번이 있으면 지번만 쓰고(`:186~190`), 저장된 `addressJibun`은 처음 조회에 쓴 `r.jibun` 그대로다.
- 다시 불러온 결과를 저장 경로로 보내는 규칙:
  - **값이 바뀔 때만** `onUnitsResolved`를 부른다. 같으면 부르지 않는다.
  - 이유: 같은 값이라도 저장 경로는 `updateFormAndInvalidate` → `clearResult()`(`app/calc/transfer-tax/TransferTaxCalculator.tsx:174`)를 타므로 결과를 지운다. #2331의 B와 같은 원칙이다.
  - 실측 메모: 결과 화면의 「자산 목록」으로 돌아온 사례에서는 사이드바 표시가 계산 전과 같아, 결과가 지워져도 화면 차이는 관측되지 않았다.
- 조회 실패와 「세대 없음」을 구분한다(Q-2). 지금은 둘 다 `found=false`다.
  - 예외가 나면 `catch` → `finally`(`:208~212`)
  - 응답이 실패하면 다음 연도로 넘어가고(`:200` `if (!res.ok) continue`), 4개 연도가 모두 실패해도 같은 `finally`에 이른다
- 세대 하나에 첫 연도 조회가 맞으면 요청 1회로 끝난다(`:202~206`에서 `return`). 공표 연도 차이로 몇 회가 되는지는 실제 API에서 확인 필요다.

### R2. 동·호를 `AddressSearch`에 넘겨, 선택을 되살리고 지우지 않게 한다

- `AssetSectionBasic`의 `value`에 `dong: asset.addressDong`, `ho: asset.addressHo`를 더한다.
- 이렇게 하면 `handleDetailChange`의 `{ ...value, detail }`에 동·호가 실려, 상세주소를 고쳐도 동·호가 남는다(S4 해소).
- `selectedDong`·`selectedHo`의 초기값을 `value.dong`·`value.ho`로 둔다. R1로 목록이 돌아오면 드롭다운이 고른 값을 보여준다.

### R3. 목록이 없는데 세대가 있다고 판정된 경우 안내한다(Q-3)

- 조건: `knownHasUnits === true`, 목록이 비어 있음, 조회 중이 아님. R1 재조회가 실패했거나 아직 끝나지 않은 경우다.
- 상세주소 칸 아래에 한 줄을 띄운다: 「동·호 목록을 불러오지 못했습니다 — 주소를 다시 선택하면 목록이 나옵니다」. 문구는 확정 전이다.

---

## 3. 영향·위험

| 항목 | 내용 |
|---|---|
| 다른 `AddressSearch` 사용처 10곳 | `knownHasUnits`를 넘기지 않으므로 R1이 동작하지 않는다. R2는 `AssetSectionBasic`만 바꾼다. R3은 `knownHasUnits === true`가 조건이다. **변화 없음** |
| 외부 API 호출 | `hasAddressUnits=true`인 자산이 1단계에 다시 마운트될 때마다 1회 이상 늘어난다. 토지·단독주택(`false`)은 늘지 않는다 |
| 늦게 끝난 재조회 | 1단계를 다시 떠난 뒤 끝나면 #2331의 언마운트 경로를 탄다(최신 배열에 적용, 같은 값이면 저장 안 함). **#2331 머지 뒤에 착수한다** |
| 기존 E2E | `transfer-address-unit-gate.spec.ts` UG-1~4는 다시 마운트되지 않는 흐름이다. `transfer-address-units-late-resolve.spec.ts`는 조회 횟수(`served`)를 세는데, 1단계로 돌아가지 않으므로 재조회가 끼지 않는다. 두 spec 모두 Do에서 다시 돌려 확인한다 |
| 계산 결과 | 엔진 입력 중 바뀌는 것은 사용자가 고른 동·호를 지우지 않게 되는 것뿐이다. 세액 영향은 없다(동·호는 식별자) |

---

## 4. 구현 순서

1. R2: `AssetSectionBasic` `value`에 동·호 추가 + `AddressSearch` 선택값 초기화
2. R1: `knownHasUnits` prop과 마운트 재조회. 실패와 「세대 없음」 구분(Q-2 결정대로)
3. R3: 안내 한 줄(Q-3 결정대로)

---

## 5. 검증 계획

- **회귀 E2E**(신규 spec, 세대 조회는 `page.route`로 고정)
  - S2: 새로고침 → 드롭다운이 다시 보이고 동·호를 골라 「다음」이 통과한다
  - S3: 단계 탭으로 갔다 오기 → 같음
  - S4: 동·호 선택 → 새로고침 → 상세주소 수정 → store 동·호가 그대로이고 「다음」이 통과한다
  - S6: 조회가 다른 단계에서 끝남 → 돌아오면 드롭다운이 있다
  - **반례 1**: 토지·단독주택(`hasAddressUnits=false`)은 1단계로 돌아와도 세대 조회를 다시 부르지 않는다(요청 횟수로 단언)
  - **반례 2**: 다시 불러온 결과가 같은 값이면 저장하지 않는다. 결과를 띄운 뒤 「자산 목록」으로 돌아와도 결과 무효화 경로를 타지 않는다
    - 관측 수단은 Do에서 정한다(예: 결과 화면으로 다시 갈 수 있는지, 또는 store 변경 횟수)
  - Q-2 a라면: 재조회가 실패하면 게이트가 유지되고 R3 안내가 보인다
- **뮤테이션**: R1 재조회 제거 → S2·S3·S6 실패 / R2 동·호 전달 제거 → S4 실패 / 같은 값 저장 허용 → 반례 2 실패 / `knownHasUnits` 조건 제거 → 반례 1 실패
- **기존 E2E**: `transfer-address-unit-gate`, `transfer-address-units-late-resolve`, 주소를 쓰는 다른 계산기 spec(`acquisition`·`inheritance`·`one-house` 중 `AddressSearch` 경로)
- **pre-push 게이트**: 워크트리라 husky가 돌지 않으므로 폰트·톤·다크 짝·러너·typecheck·lint·범위 선택 테스트를 수동으로 돌린다

---

## 결정 — 2026-10-21 사용자 결정: Q-1~Q-3 전부 권고안 a

| Q | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | 마운트 재조회 조건 | a. `hasAddressUnits=true`일 때만 · b. 주소가 있으면 항상 · c. `true`이고 동·호가 비었을 때만 | **a** — 막히는 경우는 모두 `true`다. b는 토지·단독주택에도 외부 호출을 늘린다. c는 이미 고른 동·호를 바꾸려 할 때 목록이 없다 |
| **Q-2** | 재조회가 **실패**했을 때(네트워크·API 오류) | a. `hasAddressUnits`를 그대로 두고 R3 안내 · b. 지금처럼 `false`로 내려 게이트를 푼다 | **a** — 실패를 「세대 없음」으로 읽으면 공동주택이 동·호 없이 통과해 같은 지번 세대가 같은 이력 키가 된다(`business-key-property-identity.plan.md`). 응답은 왔는데 고를 세대가 없는 경우만 `false`로 내린다 |
| **Q-3** | R3 안내 | a. 넣음 · b. 넣지 않음 | **a** — R1이 실패하면 남는 유일한 탈출 경로(주소 다시 선택)를 알려준다 |

## 범위 밖(확인 필요로 남김)

- 다른 계산기 10곳에서 다시 마운트되면 동·호 드롭다운이 사라지는 것. 막히지는 않으며, 동·호를 쓰는 곳이 있는지 확인이 필요하다.
- 단계 탭이 1단계 검증 없이 넘어가는 것. 의도된 설계인지 확인이 필요하다. 이 계획은 그 동작을 바꾸지 않고, 돌아왔을 때 복구되게 한다.
- 이력 불러오기·첫 자산 교체·다건 편집에서 다시 마운트되는 경로의 실측.

## Do 결과 (2026-10-21) — PR #2334(`fix/address-units-remount`)

- 바꾼 파일은 2개다.
  - `components/ui/address-search.tsx`: R1·R3. `loadUnits`가 `found`/`none`/`failed`를 돌려준다. 주소 선택 경로(`fetchUnits`)는 종전대로 `found`일 때만 `true`다.
  - `components/calc/transfer/asset-sections/AssetSectionBasic.tsx`: R2와 `knownHasUnits` 전달
- 「없음」 확정은 모든 연도가 `404 PRICE_NOT_FOUND`이거나, 받은 행에 고를 세대가 없을 때뿐이다(`route.ts` 실패 응답은 `502 NED_FETCH_FAILED` 등).
- 회귀 `e2e/transfer-address-units-remount.spec.ts` U-1~U-9: 수정 전 8건 실패(U-8 반례는 원래 통과) → 수정 후 9건 통과
- 뮤테이션 6건은 모두 실패했다.
  - 재조회 제거 → U-1~7·9
  - 동·호 전달 제거 → U-4·6
  - 같은 판정도 저장 → U-5·6·9
  - 실패를 「없음」으로 → U-5·6
  - `knownHasUnits` 조건 제거 → U-8
  - 안내 제거 → U-5·6
- 주소 검색을 쓰는 기존 E2E 16 spec과 `transfer-address-units-late-resolve`, 합계 87건이 통과했다.
- 게이트 4종, typecheck, lint(오류 0), 전체 vitest 3,192파일이 통과했다.
- §5의 「반례 2」는 sessionStorage 쓰기 횟수로 관측했다(U-9).
