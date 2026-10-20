# 375 화면에 남은 가로 넘침 44회 — 수정 계획

> 작성 2026-10-20 · 상태 **Do — Q-1~Q-3 모두 권고안으로 결정(2026-10-20), 결과는 문서 끝 「Do 결과」** · 워크트리 `../Property-related-Taxes-ovp` · 브랜치 `docs/narrow-375-residual-overflow-plan`
> 선행: `ui-narrow-width-and-dark-mode-residual.plan.md` 「Do 결과」 §①② — #2283 뒤 375에 남은 44회를 「이번 범위 밖」으로 둔 것을 이어받는다.
> 네 묶음(§1~§4)은 서로 독립이다. 따로 결정하고 따로 구현할 수 있다.

## 0. 측정 방법(이 계획서의 모든 수치)

**대상 코드**: master `a9c311b63`(#2289까지 머지된 상태).

**측정 절차**
- 측정 훅을 워크트리 복사본 `node_modules/@playwright/test/index.js`에만 임시로 넣었다(auto fixture). 측정이 끝날 때마다 원본으로 되돌리고 `cmp`로 확인했다.
- 각 테스트의 **종료 화면**을 375px로 바꾼 뒤, 카드 안쪽 오른쪽 끝을 1.5px 넘은 FieldCard를 셌다(선행 계획서와 같은 기준).
- 넘친 카드마다 `<main>`부터 카드까지 조상을 따라가며 **층마다 깎인 가로 폭**과 그 요소를 그린 React 컴포넌트(개발 빌드의 fiber 이름)를 기록했다.
- 후보 수정안은 같은 종료 화면에서 DOM에 inline style로 적용했다가 되돌리며, 넘친 거리를 다시 쟀다(모사).

**측정 실행**
| 회 | 대상 | 결과 |
|---|---|---|
| 1 | 넘침이 났던 spec 8파일 전체(729건) | 707 통과 · 21 건너뜀 · 1 실패. 넘친 카드 44회(선행 계획서의 44회와 같다) |
| 2·3 | 그중 넘침이 난 26건 | 26 통과. 조합 모사 |

- 1회차의 실패 1건(`transfer-validation-field-jump.spec.ts:168` 「new_99 종전주택 기준시가」)은 2·3회차에 훅을 넣은 채 통과했다. 측정 훅의 부하로 본다.

**한계**
- E2E가 도달하는 화면과 상태만 쟀다. 그 밖은 미측정이다.
- 모사는 넘친 카드의 **조상 사슬에만** 적용했다. 같은 클래스를 쓰는 다른 화면의 변화(부수 변경)는 이번에 재지 않았다 — Do 1단계에서 전체 E2E 대조로 잰다(§6).
- 「회」는 측정 횟수다. 같은 칸이 여러 테스트에서 반복해 잡힌다.

---

## 1. 깊은 중첩 — 「공시지가 연도」 30회 · 「최초 공시일」 11회

### 1-1. 문제(실측)

| 칸 | 회 | 카드 안쪽 폭 | 내용 최소 폭 | 넘친 거리 |
|---|---|---|---|---|
| 공시지가 연도 | 30 | 73 · 93px | 버튼 하나가 91px | 6~18px |
| 이 주택의 개별주택가격 최초 공시일 | 11 | 91 · 117px | 날짜칸 150px | 20~46px |

- 「공시지가 연도자동」 24회와 「공시지가 연도」 6회는 **같은 카드**다. 「자동」 배지 글자가 라벨에 붙어 따로 집계됐다.
- 375 화면에서 `<main>` 안쪽은 343px이다. 이 카드들에 닿을 때까지 카드 자신을 포함해 **패딩 있는 상자 8~9겹**이 226~270px을 쓴다(`<main>`의 `px-4`까지 세면 9~10겹).

### 1-2. 원인(실측 — 층마다 깎인 폭)

「최초 공시일」(상속 주택, 의제취득일 이후 경로) — 343 → 91px:

| 깎인 폭 | 남은 폭 | 컴포넌트 | 위치 |
|---|---|---|---|
| 34 | 309 | CompanionAssetCard | `components/calc/transfer/CompanionAssetCard.tsx:247` `p-4` |
| 26 | 283 | AssetSection | `components/calc/transfer/AssetSection.tsx:130` `px-3` (+ 바깥 테두리 2) |
| 26 | 257 | CompanionAcqInheritanceBlock | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx:61` `p-3` |
| 26 | 231 | InheritedAcquisitionDeemedSection | `components/calc/transfer/InheritedAcquisitionDeemedSection.tsx:58` `p-3` |
| 26 | 205 | PostDeemedInputs | `components/calc/transfer/inheritance/PostDeemedInputs.tsx:160` `p-3` |
| 26 | 179 | ToneCard | 공용 `p-3` |
| 26 | 153 | HouseValuationSection | `components/calc/transfer/inheritance/HouseValuationSection.tsx:337` `p-3` |
| 28 | 125 | HouseValuationSection | `:441` `border-2 … p-3` |
| 34 | 91 | FieldCard | 공용 `px-4` |

- 의제취득일 **이전** 경로는 `PostDeemedInputs`·`ToneCard` 대신 `PreDeemedInputs`(`components/calc/transfer/inheritance/PreDeemedInputs.tsx:210` `p-3`) 한 겹이라 117px이 남는다.
- 날짜칸은 연 `w-12`·월 `w-8`·일 `w-8`에 바깥 `px-3`이 붙은 고정 폭이다(`components/ui/date-input.tsx:163·183·197·211`). 테두리 상자는 줄어드는데 칸은 줄지 않아 일 칸이 상자와 카드 밖으로 나간다(스크린샷 확인).

「공시지가 연도」 — 두 경로:
- **겸용주택 3시점 기준시가**(`mixed-use-case-a-asset-major` 등 24회): CompanionAssetCard → AssetSection → MixedUseLegacyStdPrice → ToggleCard 2층 → MixedUsePreHousingDisclosureSection(`p-4`) → ThreePointAssetMajorRender → PointBlock → FieldCard. 안쪽 93px.
- **감면 PHD**(`red-phd-two-article-snapshot-keys` 등 6회): Step5 AssetReductionBlock(`app/calc/transfer-tax/steps/Step5.tsx:103` `p-4`) → GroupCategorySection(`components/calc/transfer/UnifiedReductionGroupSection.tsx:205` `px-4`) → ToggleCard 2층 → New993InputForm(`components/calc/transfer/New993InputForm.tsx:212` **`ml-7`** + `p-3`, 한 층이 54px) → ToneCard → ToggleCard 2층 → FieldCard. 안쪽 73px.
- 두 경로의 칸은 **다른 컴포넌트**다(Do에서 fiber 이름으로 확인 — 아래 정정 참고).
  - 겸용주택 24회: `components/calc/transfer/ThreePointPointBlock.tsx:246-283`. 연도 Select와 「공시지가 조회」 버튼(`shrink-0`, 91px)을 **줄바꿈 없는 한 줄**(`:248` `flex items-center gap-2`)에 둔다. 같은 모양의 `LandPriceLookupField.tsx:181-182`는 #2283에서 `flex-wrap` + 선택칸 `min-w-[min(8rem,100%)]`로 고쳤는데, 이 복사본은 함께 고치지 않았다.
  - 감면 PHD 6회: `LandPriceLookupField`(`ReductionPhdInput` 안). 이미 줄바꿈되지만 **버튼 하나(91px)가 카드 안쪽(73px)보다 넓다**.
- ⚠️ **정정(2026-10-20 Do)**: 처음에는 30회 모두 `ThreePointPointBlock`이라고 적었다. 감면 PHD 6회는 `LandPriceLookupField`였다. 그래서 W 단독으로 남던 12회(아래 표)가 바로 이 경로이고, 이 경로는 S로만 풀린다.

### 1-3. 수정안 — 실측(모사)

수정 수단(여백은 모두 **640px 미만에서만** 바뀐다 — 640px 이상은 그대로):

| 기호 | 내용 | 바꾸는 곳 |
|---|---|---|
| **W** | 연도 행 줄바꿈 — `LandPriceLookupField`와 같은 처리 | `ThreePointPointBlock.tsx:248-249`(행 `flex items-center` · 선택칸 `min-w-0`) |
| **S** | 양도세 **외곽 껍데기** 4곳의 좌우 여백을 8px로 | `CompanionAssetCard.tsx:247` · `AssetSection.tsx:130` · `Step5.tsx:103` · `UnifiedReductionGroupSection.tsx:205` |
| **L** | 상속 주택 평가 경로의 **화면 전용 상자** 6곳 좌우 여백을 8px로 | `CompanionAcqInheritanceBlock.tsx:61` · `InheritedAcquisitionDeemedSection.tsx:58` · `PostDeemedInputs.tsx:160` · `PreDeemedInputs.tsx:210` · `HouseValuationSection.tsx:337·441` |
| H | L 중 `HouseValuationSection` 2곳만 | |
| M | `New993InputForm.tsx:212`의 `ml-7` 들여쓰기 해제 | |
| T | 공용 `ToggleCard`·`ToneCard` 좌우 여백 8px | 공용(각 241·234파일에서 사용) |
| C | 공용 `FieldCard` `px-4` → `px-3` | 공용 |
| D | 공용 `DateInput` 칸 축소(연 40px·월일 24px·바깥 8px) | 공용(191파일에서 사용) |

남는 넘침(회 / 최대 거리):

| 안 | 공시지가 연도(30) | 최초 공시일(11) | 공용 컴포넌트 변경 |
|---|---|---|---|
| 현행 | 30 / 18px | 11 / 46px | — |
| W | 12 / 18px | 11 / 46px | 없음 |
| W+M | **0** | 11 / 46px | 없음 |
| S | **0** | 6 / 22px | 없음 |
| S+H | 0 | 6 / 6px | 없음 |
| **S+L** | **0** | **0** | **없음** |
| S+D | 0 | 0 | DateInput |
| S+H+C | 0 | 0 | FieldCard |
| L+C | 12 / 2px | 0 | FieldCard |
| T | 0 | 11 / 38px | ToggleCard·ToneCard |
| 모든 중첩 상자 8px | 0 | 0 | 전부 |

- **S+L**이 공용 컴포넌트를 건드리지 않고 41회를 모두 없애는 가장 작은 조합이다.
- **W**는 넘침만 보면 S+L로 충분하지만 함께 넣기를 권한다. 같은 모양의 `LandPriceLookupField`와 처리를 맞춘다. W 단독으로 겸용주택 18회가 없어진다.
  - Do에서 확인: W 없이 S만 적용하면 겸용주택 카드는 넘치지 않지만 연도 칸이 버튼 몫(99px)을 빼고 짓눌린다. 회귀 테스트가 이것으로 W를 지킨다(§5).
- 「모든 중첩 상자 8px」은 넘침을 없애지만 공용 `ToggleCard`·`ToneCard`까지 바꿔 앱 전체 모바일 화면이 달라진다.

### 1-4. 부수 변경(예상 — 미측정)

- **S**: 양도세 자산 카드 전체의 375 좌우 여백이 16·12px → 8px이 된다. 그 안 모든 카드가 24px(자산 카드 경로)·32px(감면 경로) 넓어진다. 넓어지기만 하므로 새 넘침은 생기지 않을 것으로 보이나, 배치가 바뀌는 카드 수는 **미측정**이다(Do 1단계).
- **W**: 연도 행 폭이 227px(선택칸 128 + 간격 8 + 버튼 91) 미만이면, 지금은 넘치지 않고 선택칸만 좁아지던 카드도 버튼이 아래 줄로 내려간다. #2283의 `LandPriceLookupField`도 같은 동작을 받아들였다. 해당 카드 수는 미측정이다.
- 640px 이상은 여백이 그대로라 바뀌지 않는다. Do 1단계 전체 대조로 확인한다.

---

## 2. 「사유」 2회 — 비사업용 토지 유예기간 Select

### 2-1. 문제·원인(실측)

- 카드 안쪽 223px에 Select 트리거가 278px이라 **55px** 넘친다(「법령상 사용 금지·제한 (영 §168의14①1호)」 선택 시).
- `components/calc/transfer/nbl/GracePeriodSection.tsx:131`은 `<SelectTrigger>`를 클래스 없이 쓴다. 공용 기본값은 `w-fit` + `whitespace-nowrap`이라 트리거가 글자 폭만큼 넓어진다(`components/ui/select.tsx:44`).
- 값 span(`data-slot="select-value"`)에는 공용 `line-clamp-1`이 있지만, 같은 줄의 `*:data-[slot=select-value]:flex`가 `display`를 덮어써 동작하지 않는다.
- #2283의 공용 말줄임(`[&>span:not([data-slot])]:truncate`)은 `data-slot`이 **없는** span만 대상이라 이 칸에 닿지 않는다.
- 선택지 15개 중 길이가 비슷한 1~3호(`:25-27`)도 같은 방식으로 넘칠 것으로 보이나, 측정한 것은 1호뿐이다(확인 필요).

### 2-2. 수정안 — 실측(모사)

| 안 | 내용 | 남는 넘침 | 트리거(375) |
|---|---|---|---|
| 현행 | | 2 / 55px | 278 × 32px |
| **G1** | 트리거 `max-w-full` + 값 span 말줄임. `w-fit`은 유지 | **0** | 223 × 32px |
| G2 | 트리거 `w-full` + 값 span 말줄임 | 0 | 223 × 32px |
| G3 | 두 줄 허용(`whitespace-normal`·`h-auto`) | 0 | 223 × **118px** |

- **G1 권고.** 넓은 화면에서는 `w-fit` 그대로라 모양이 바뀌지 않는다. G2는 1280에서도 트리거가 카드 폭만큼 늘어난다.
- G3는 모사에서 트리거가 118px로 높아졌다. 원인은 확인하지 않았다.
- 말줄임으로 가려지는 「(영 §168의14①1호)」는 같은 카드의 법령 배지(`trailing` — 「시행령 §168의14①1호 ↗」)에 그대로 보인다(스크린샷 확인). 선택 목록에서는 전체 글자가 보인다.
- **구현 시 확인 필요**: 모사는 값 span에 inline style로 `display:block`을 줬다. 실제 코드에서 `SelectValue`에 `block`을 넘기면 공용 `*:data-[slot=select-value]:flex`가 이길 수 있다. 그 경우 값 글자를 안쪽 `<span className="min-w-0 truncate">`로 한 번 감싼다. Do에서 실측으로 정한다.
- 공용 `select.tsx`를 고치는 방법(트리거 기본값에 `max-w-full`, 값 span 말줄임)도 있다. 다만 선행 측정에서 375에 남은 Select 넘침은 이 칸뿐이었고, 공용 변경은 전체 대조가 필요하다. 이번에는 이 칸만 고치기를 권한다.

---

## 3. 「기타」 1회 — 건물 기준시가 부속시설 면적

### 3-1. 문제·원인(실측)

- `components/calc/building-std-price/CompositePartsSection.tsx:259` `grid grid-cols-2 gap-2`가 375에서도 2열이라 카드 안쪽이 85px이다.
- 면적을 넣으면 `:266-273`의 「층」 입력칸(`w-24 shrink-0`, 96px)이 면적칸 옆에 나타나 **71px** 넘친다.
- **4묶음 중 유일하게 페이지 전체 가로 스크롤**을 만든다(문서 폭 377px > 화면 375px).
- 테스트가 「기타」에만 면적을 넣어 1회로 잡혔다. 부속시설 6칸(주차장·기계실·보일러실·대피소·옥탑·기타, `:30`)이 같은 코드라 면적을 넣으면 모두 같을 것으로 보이나, 따로 재지는 않았다(확인 필요).

### 3-2. 수정안 — 실측(모사)

| 안 | 내용 | 남는 넘침 |
|---|---|---|
| 현행 | | 1 / 71px |
| **P1** | 격자를 `grid-cols-1 sm:grid-cols-2`로(#2283 2-C와 같은 처리) | **0** |
| P2 | 면적칸·층칸 행에 `flex-wrap` | 1 / 11px |

- **P1 권고.** 375에서 부속시설 6칸이 3행에서 6행이 된다(높이 증가). 640px 이상은 바뀌지 않는다.

---

## 4. 구현 순서

서로 독립이라 한 PR로 묶어도 되고 나눠도 된다. 권고는 **한 PR**이다. 모두 375 전용 배치 수정이고, 검증(전체 E2E 대조)을 한 번으로 끝낼 수 있다.

1. §1 W(`ThreePointPointBlock`) + S(외곽 4곳) + L(상속 주택 경로 6곳) — 좌우 여백을 `px-2 sm:px-N`으로(저장소에 `max-sm:` 선례가 없어 모바일 우선 관례를 따랐다).
2. §2 G1(`GracePeriodSection`).
3. §3 P1(`CompositePartsSection`).

## 5. 회귀 테스트

`e2e/narrow-width-residual.spec.ts`(#2283)에 375 사례를 더한다. 기준은 각 칸 넘침 0이다.
- 겸용주택 3시점 「공시지가 연도」 · 감면 PHD 「공시지가 연도」.
- 상속 주택 의제취득일 이후·이전 「최초 공시일」.
- 비사업용 토지 유예 「사유」 1호 선택.
- 건물 기준시가 부속시설 면적 입력 후 문서 폭 ≤ 375.

각 수정을 되돌리는 뮤테이션으로 테스트가 실패하는지 확인한다(선행과 같은 방식, `git checkout` 없이 파일 복사본으로).

## 6. 검증 계획

1. **Do 1단계 — 전체 E2E 대조**: 선행 계획서와 같은 훅으로 전체 E2E 종료 화면을 375·768·1024·1280에서 잰다.
   - 375 넘침 44 → 0을 확인한다.
   - 768·1024·1280 넘침 0 유지, **배치가 바뀐 카드 0**을 확인한다(640px 미만 한정 확인).
   - 375에서 배치가 바뀐 카드 수와 표본 스크린샷으로 §1-4의 부수 변경을 확인한다.
2. pre-push(typecheck·lint·범위 테스트) + CI 전체.

---

## 결정 필요

- **Q-1 깊은 중첩(§1, 41회)**
  - **S+L+W(권고)**: 양도세 외곽 껍데기 4곳 + 상속 주택 경로 상자 6곳의 375 좌우 여백 8px, 연도 행 줄바꿈. 공용 컴포넌트는 바꾸지 않는다.
  - W+M만: 연도 30회만 없어진다. 「최초 공시일」 11회는 남는다.
  - 공용까지(T 또는 D): 앱 전체 모바일 화면이나 모든 날짜칸이 바뀐다. 전체 대조 범위가 커진다.
- **Q-2 「사유」(§2)**
  - **G1(권고)**: 375에서만 말줄임, 넓은 화면은 그대로.
  - G3 두 줄 표시: 전체 글자는 보이나 트리거가 높아진다(모사 118px, 원인 확인 필요).
- **Q-3 「기타」(§3)**
  - **P1(권고)**: 375에서 한 열.
  - P2: 11px가 남는다.

---

## Do 결과 (2026-10-20) — PR #2295

**구현**: 권고안 그대로(S+L+W · G1 · P1). 계획과 다른 점은 둘이다.
- 여백은 `max-sm:px-2` 대신 **`px-2 sm:px-N`**(저장소에 `max-sm:` 선례가 없다). 세로 여백은 그대로 둔다.
- 「사유」 값 말줄임은 `SelectValue`에 `min-w-0`을 주고 글자를 안쪽 `<span className="truncate">`로 감쌌다(§2-2의 「구현 시 확인 필요」 — 공용 `*:data-[slot=select-value]:flex`가 남아 있어 `block`을 넘기는 방식은 쓰지 않았다).

**⚠️ 계획서 정정**: 감면 PHD 경로 「공시지가 연도」 6회는 `ThreePointPointBlock`이 아니라 `LandPriceLookupField`였다(§1-2에 반영). 넘침은 S로 풀리고, W가 지키는 것은 겸용주택 경로뿐이다.

**실측 — 전체 E2E 종료 화면 2,513건(master `9c7d5bcdb` vs 수정본), 카드 밖으로 나간 FieldCard(회)**

| 폭 | 전 | 후 | 새 넘침 |
|---|---|---|---|
| 375 | 44 | **0** | 없음 |
| 768 | 0 | 0 | 없음 |
| 1024 | 0 | 0 | 없음 |
| 1280 | 0 | 0 | 없음 |

- **Select 값 잘림**: 768 136→16, 1024·1280 130→10, 375 279→245.
- **640px 이상에서 모양이 바뀐 카드**(768·1024·1280): 290·288·368곳. 원인별로 모두 갈랐다.
  - 연도 행 줄바꿈(W) 282~360 — `ThreePointPointBlock`의 3열 배치(비-split)에서 연도 칸이 버튼 옆에 **44px로 짓눌려 값이 「:」만 보이던 것**이 버튼을 아래 줄로 내리고 값이 보이게 됐다(768 스크린샷 대조 — 연도 칸 44→143px). 같은 행의 「공시지가」·「토지기준시가」·「주택부수토지 …」 카드는 행 높이를 따라 같이 늘었다.
  - 「사유」 4 — 값 span이 한 겹 늘어난 구조 변화다. 1280 스크린샷은 전후가 같다.
  - 주식 계산기 「종목명」·「종목코드」 2~4 — 바뀐 파일을 쓰지 않는 화면이라 측정 간 변동이다.
- **375 배치 변화** 11,728곳(921테스트): 양도세 화면 여백이 8px로 줄어 카드가 넓어진 것이다. 표본 스크린샷(최초 공시일·사유·부속시설)으로 확인했다.

**측정 실행**: 훅 오류로 1회 무효(넘침 판정이 카드 자신을 포함해 전 카드를 넘침으로 셌다 — 배치 서명은 유효해 위 분류에 썼다), 수정 훅으로 다시 쟀다. 네 번의 전체 실행에서 실패 1건(수정본 2회차 `transfer-nbl-revenue-deemed-common`)과 재시도 통과 flaky 2건(`transfer-split-part-carryover-c`·`transfer-amendment`)이 나왔다. 실패 1건은 훅 없이 무부하로 master·수정본 각 2회 돌려 모두 통과했다(선행 계획서에서도 측정 훅 부하로 실패하던 spec이다).

**회귀 테스트**: `e2e/narrow-width-residual.spec.ts`에 375 사례 6건(의제 이전·이후 최초 공시일 · 감면 PHD 연도 · 겸용주택 연도 칸 폭 · 사유 375/1280 · 부속시설 문서 폭). 뮤테이션 M1(W)·M2(S)·M3(L)·M4(G1)·M5(P1) 모두 kill.
- M1은 처음에 살아남았다. 감면 PHD 카드가 `LandPriceLookupField`라 W와 무관했고, 연도 칸 폭 단언은 줄바꿈이 없으면 행 폭을 0으로 잡아 무력했다. 겸용주택 사례를 더하고 단언을 카드 안쪽 폭 기준으로 고쳐 kill.

**남은 것(별건 — 원인 미분석)**: 375에서 **페이지 전체 가로 스크롤**이 있는 종료 화면이 124→118곳이다. FieldCard 밖의 요소다 — 상위 원인 요소는 카드 밖 날짜칸(`input.border-0 … text-center`) 33, `table.min-w-full …` 25, `button.shrink-0 inline-flex …` 23, `div.text-right ml-4 shrink-0` 20 등. 확인 필요.
