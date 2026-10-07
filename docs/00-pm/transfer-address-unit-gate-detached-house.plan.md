# 양도세 ⑧ 동·호 게이트 — 단독주택(개별주택) 필지에서 막다른 오류

- 작성: 2026-10-07 · 브랜치 `fix/land-dong-ho-required` · 기준 `bf789b0d0`
- 선행 계획서: `docs/00-pm/business-key-property-identity.plan.md` (§4-2 — 이 결함의 전제)

## 1. 증상

단순토지(`assetKind: "land"`)로 소재지 「명리독점길 223 (경상북도 안동시 서후면 명리 745)」를 고르면
**「자산: 동·호를 선택하세요. 같은 지번의 다른 세대와 구분되지 않습니다.」** 오류로 다음 단계에 갈 수 없다.
소재지 아래에 「호수 선택」 드롭다운이 뜨지만 **고를 수 있는 항목이 없다** ⇒ 오류를 해소할 입력 경로가 없다.

## 2. 실측 재현 (2026-10-07, 워크트리 dev 서버 :3241)

```
GET /api/address/standard-price?propertyType=housing&jibun=경상북도 안동시 서후면 명리 745&year=2026
→ priceType: "indvd_housing_price"
  units: [{ dong: "", ho: "", price: 17900000, ... }]          ← 2026년 1건
(year=2025 → units 2건, 둘 다 dong:"" · ho:"")
```

이 필지에는 **개별주택(단독주택) 공시가격**이 있고, API는 그것을 동·호가 빈 「세대」 목록으로 돌려준다.

## 3. 원인 — 선행 계획서 §4-2의 전제가 사실이 아니다

선행 계획서 §4-2(`business-key-property-identity.plan.md:145-146`)의 규칙:

> 「세대를 고를 수 있었는데 안 골랐으면 차단」. **토지·단독건물은 목록이 비므로 자동 면제된다.**

실제로는 목록이 비지 않는다. 경로는 다음과 같다.

| 단계 | 위치 | 동작 |
|---|---|---|
| ① 조회 | `app/api/address/standard-price/route.ts:333-376` | 공동주택 조회가 비면 **개별주택으로 fallback**하고 `units: buildUnitList(indvdItems, "housePc")`(:375)를 돌려준다. 개별주택에는 `dongNm`·`hoNm`이 없어 `dong: ""`·`ho: ""`(:237-238) |
| ② 판정 | `components/ui/address-search.tsx:188-198` | `units.length > 0`이면 `found = true` → `onUnitsResolved(true)` |
| ③ 저장 | `components/calc/transfer/asset-sections/AssetSectionBasic.tsx:286` | `hasAddressUnits: true` |
| ④ 게이트 | `lib/calc/transfer-tax-validate-asset.ts:155` | `hasAddressUnits && !addressDong && !addressHo` → **차단** |
| ⑤ 입력 경로 | `address-search.tsx:390` · `:624-627` | `units.length > 0`이라 `UnitSelector`를 렌더하지만, 호 목록에서 `ho !== ""`를 걸러내 **선택지 0개**. `hasDongColumn`도 false라 동 선택도 없다 |

⇒ ②는 「행이 있다」를 「세대를 고를 수 있다」로 본다. ⑤는 같은 목록에서 빈 호를 걸러 낸다.
**두 판정이 같은 목록을 서로 다르게 읽는다.** 그래서 게이트는 켜지는데 그것을 끌 입력 경로는 없다.

같은 전제가 복제된 곳(정정 대상):
- `__tests__/calc/transfer-address-required-gate.predo.anchor.test.ts:7-9` 헤더 주석 「토지·단독건물은 목록이 비어 자동 면제된다」
- G-3 anchor(:73-77)는 `hasAddressUnits: false`를 **직접 주입**해, 단독주택 필지에서 그 값이 실제로 false가 되는지를 보지 않는다. 이 결함을 잡을 수 없는 구조다.

## 4. 영향 범위

- **자산 종류와 무관**하다. 개별주택 공시가격이 있는 필지라면 `housing`(단독주택 자체), `land`,
  `building`, `general_building`, `commercial_building` 모두 걸린다. 단독주택 양도가 **계산 자체를 못 한다**.
- 시점은 게이트를 도입한 `cc23ccc69`(2026-09-16)부터다.
- 영향을 받는 것은 양도세 ⑧뿐이다. `hasAddressUnits`를 읽는 곳은 `transfer-tax-validate-asset.ts:155` 하나다(grep).
  다른 세목의 `AddressSearch` 호출부(취득·재산·상속 등 18곳)도 같은 「선택지 0개 드롭다운」을 보여 주지만, 막히는 데는 없다.

## 5. 수정안

### A. (필수) 「세대」 = 동 또는 호가 있는 항목 — `AddressSearch` 한 곳에서 판정을 맞춘다

- `address-search.tsx`의 `found` 판정(:188)과 렌더 분기(:390)를 **같은 술어**로 바꾼다:
  `units.some((u) => u.dong !== "" || u.ho !== "")`.
  - 세대로 식별할 수 있는 항목이 없으면 → `onUnitsResolved(false)`, 그리고 `UnitSelector` 대신 기존 상세주소 텍스트 입력을 보여 준다.
  - 공동주택(동·호 있음)의 동작은 그대로다.
- 술어는 모듈 내부 함수 하나로 둔다. ②와 ⑤가 따로 판정하다 어긋난 것이 이번 결함이므로, **두 곳이 같은 함수를 부른다**.
- API(`route.ts`)는 건드리지 않는다. `units`는 개별주택 공시가격 자동채움(`standardPrice`)에도 쓰이므로 응답 형태는 유지한다.
  - ⚠️ 확인 필요: 개별주택 1건일 때 `onHoChange`를 거치지 않으면 `standardPrice` 자동채움이 일어나지 않는다. 지금도 선택지가 0개라 일어나지 않는다(⑤). **동작 변화는 없을 것으로 보지만 Do 단계에서 실측으로 확인한다.**

### B. (Q-1 적용 확정) `assetKind === "land"`는 동·호를 요구하지 않는다

- 토지는 필지(지번) 단위로 특정된다. 같은 필지에 공동주택이 있어 동·호가 있는 목록이 오더라도, 토지 양도의 식별자는 동·호가 아니다.
- A만 적용하면 **공동주택이 있는 필지의 단순토지**는 여전히 차단된다. 드문 경우지만 그때 사용자는 자기 물건과 무관한 호를 골라야 한다.
- 위치는 `transfer-tax-validate-asset.ts:155` 조건에 `a.assetKind !== "land"`를 추가한다.
  `assetKind`로 판정하므로 `housing`으로 주소를 고른 뒤 `land`로 바꿔 `hasAddressUnits`가 stale하게 남아 있어도 통과한다.

## 6. 남는 한계 (수정 범위 밖 — 기록만)

1. **이미 저장된 stale 플래그.** 2026-09-16 이후 단독주택 필지에서 [저장하기]로 남긴 초안이나 sessionStorage에는 `hasAddressUnits: true`가 저장돼 있다.
   A는 **새로 주소를 고를 때부터** 적용된다. 그 초안은 소재지를 다시 고르면 풀린다(B를 적용하면 토지는 즉시 풀린다).
   migrate에서는 공동주택 미선택과 단독주택을 구별할 수 없으므로(units를 저장하지 않는다) 자동 정정하지 않는다.
   이 게이트 때문에 계산을 완주할 수 없었으므로 **계산 이력(완료 record)에는 이 상태가 없다.**
2. 개별주택이 2건 이상인 필지(2025년 실측 2건)는 동·호로 구분할 수 없다. 이 경우 식별은 선행 계획서 §8-2의 한계와 같은 층위다.

## 7. 검증 계획

### 7-1. Pre-Do anchor (먼저 red를 확인한다)

| ID | 대상 | 단언 | 착수 전 |
|---|---|---|---|
| U-1 | `AddressSearch` 술어 | 개별주택형 `[{dong:"",ho:""}]` → 세대 없음 | 🔴 |
| U-2 | 〃 | 공동주택형 `[{dong:"101동",ho:"501"}]` → 세대 있음 | ✅ 유지 |
| U-3 | 〃 | 동 없는 공동주택 `[{dong:"",ho:"101"}]` → 세대 있음 | ✅ 유지 |
| L-2 | ⑧ | `land` + `hasAddressUnits:true` + 동·호 없음 → 통과 | 🔴 |
| G-2 (수정) | ⑧ | `housing` + `hasAddressUnits:true` + 동·호 없음 → 차단 (B가 주택까지 풀지 않는다) | ✅ 유지 |
| G-3b (수정) | ⑧ | `housing` + 동·호 선택 → 동·호 오류 아님 | ✅ 유지 |

> 🔑 **G-2·G-3b는 토지로 재고 있었다**(`asset()` 기본값이 `land`). B 이후 토지는 면제되므로 그대로 두면
> G-2는 반전되고 G-3b는 구별력이 0이 된다. 그래서 둘 다 `housing`으로 옮겼다. 주택 고유 입력이 비어 있어
> 다른 오류가 날 수 있으므로 G-3b는 «동·호 오류가 아님»만 단언한다. 계획 당시의 L-3은 수정한 G-2와 같아 G-2로 합쳤다.

U-1~3은 컴포넌트 렌더 테스트(`.test.tsx`, RTL)로 쓴다. `fetch`를 mock하고 `onUnitsResolved` 인자와 「호수 선택」 노출 여부를 **함께** 단언한다.
술어 함수만 단위 테스트하면 ②·⑤ 배선을 증명하지 못한다(memory `feedback_library_anchor_does_not_prove_component_uses_it`).

### 7-2. E2E — `e2e/transfer-address-unit-gate.spec.ts`

- **UG-4 (신규)**: standard-price mock을 개별주택형 `units: [{dong:"",ho:""}]`로 두고 단순토지·주택 각각에서 소재지를 고른다 → 「동·호를 선택하세요」 0건, 「호수 선택」 0건, 다음 단계로 진행.
- UG-3(공동주택 차단)은 그대로 green이어야 한다.

### 7-3. 뮤테이션 probe

| # | 변형 | 잡아야 하는 것 |
|---|---|---|
| M-1 | 술어를 `units.length > 0`으로 되돌림 | U-1 · UG-4 |
| M-2 | 렌더 분기만 옛 조건으로 되돌림 | U-1의 「호수 선택」 단언 |
| M-3 | (B) `assetKind !== "land"` 제거 | L-2 |
| M-4 | (B) 면제를 주택까지 넓힘(`&& assetKind !== "housing"`) | G-2 |

### 7-4. 회귀·완료 조건

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/calc/transfer-address-required-gate.predo.anchor.test.ts` + 신규 테스트
- [ ] `components/ui/address-search.tsx`는 공유 컴포넌트이므로 전체 `npm test`(pre-push 범위 판정에 맡기지 않고 `FULL_TEST=1`)
- [ ] E2E `transfer-address-unit-gate.spec.ts` 전건 (`E2E_PORT` 지정)
- [ ] 브라우저 확인(Playwright): 실제 주소 「명리독점길 223」 + 단순토지 → 오류 없이 ② 양도 단계로 진행
- [ ] 선행 계획서 §4-2 전제 문구와 anchor 헤더 주석 정정(§3)

## 8. 사용자 결정 (Q)

| ID | 질문 | 권장 |
|---|---|---|
| Q-1 | B(토지는 동·호 불요)를 함께 적용할까? | **적용** — 사용자 확정 2026-10-07 |
| Q-2 | §6-1 stale 초안의 오류 문구에 「목록이 없으면 소재지를 다시 선택」 안내를 덧붙일까? | **보류** — 사용자 확정 2026-10-07 (권장안) |

## 9. 변경 파일 (예상)

| 파일 | 변경 | 안 |
|---|---|---|
| `components/ui/address-search.tsx` | 세대 술어 1개 + `found`·렌더 분기 2곳 교체, prop 주석(:73-80) 보강 | A |
| `lib/calc/transfer-tax-validate-asset.ts` | :155 조건에 `assetKind !== "land"` + 주석 | B |
| `__tests__/components/address-search-units.predo.anchor.test.tsx` (신규) | U-1~3 | A |
| `__tests__/calc/transfer-address-required-gate.predo.anchor.test.ts` | L-2 추가, G-2·G-3b 주택으로 이동, 헤더 전제 정정 | A·B |
| `e2e/transfer-address-unit-gate.spec.ts` | UG-4 | A |
| `docs/00-pm/business-key-property-identity.plan.md` | §4-2 전제 정정 주석 | — |

## 10. 실행 결과 (2026-10-07)

| 단계 | 결과 |
|---|---|
| Pre-Do red | U-1 · L-2 **2건 red**, 나머지 10건 green (수정 전 코드) |
| 수정 후 | anchor 12건 전부 green |
| 뮤테이션 M-1~M-4 | **4/4 KILLED** — M-1·M-2 → U-1, M-3 → L-2, M-4 → G-2 |
| E2E | `transfer-address-unit-gate.spec.ts` 5건 통과(UG-1~3 + UG-4 주택·토지). UG-4는 **수정 전 `address-search.tsx`에서 2건 모두 실패**(상세주소 입력 미노출)하는 것을 확인 |
| 브라우저(실제 API, mock 없음) | 단순토지 + 「명리독점길 223」 → 상세주소 입력 노출 · 「호수 선택」 0건 · 「동·호를 선택하세요」 0건. 남은 오류는 빈 양도가액·취득일뿐 |
