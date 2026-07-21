# 건물 기준시가 계산기 — "건축물대장 조회" 버튼 연도 게이트 버그 수정 계획

- **작성일**: 2026-07-21
- **브랜치/워크트리**: `worktree-fix+building-std-price-lookup-btn` (`.claude/worktrees/fix+building-std-price-lookup-btn`)
- **유형**: 버그 수정 (UX 게이트 설계 결함)
- **상태**: Plan (Do 미착수) — 아래 **D1 결정 대기**

---

## 1. 증상 (사용자 보고)

건물 기준시가 계산기(`양도(취득·양도 2시점)` 모드)에서 집합건물(공동주택)의 **소재지 주소 + 동(201동) + 호수(3204)를 모두 조회·선택**했는데도 **"건축물대장 조회" 버튼이 계속 비활성화(disabled)** 상태이며, 버튼 아래에 **"평가/양도 연도 입력 후 조회 가능합니다"** 힌트가 표시된다.

사용자 기대: 소재지·동·호수를 모두 채웠으면 건축물대장 조회가 가능해야 한다.

---

## 2. 근본 원인 (전부 실측 — file:line 확인 완료)

### 2-1. 버튼 활성화 게이트가 `year`를 필수로 요구

`components/calc/building-std-price/BuildingRegisterLookupField.tsx:49`
```tsx
const canLookup = !!pnu && !!year && !disabled;
```
`BuildingRegisterLookupField.tsx:111`
```tsx
disabled={!canLookup || isLookingUp}
```
힌트 분기 `BuildingRegisterLookupField.tsx:116-130`:
- `!pnu` → "소재지 입력 후 조회 가능합니다"
- `pnu && !year` → **"평가/양도 연도 입력 후 조회 가능합니다"** ← 사용자가 본 힌트
- `pnu && year && disabled` → "복합구조·기계식주차·공동주택 환산 모드는 직접 입력하세요"

사용자가 두 번째 힌트를 봤다는 것은 **`pnu`는 채워졌고 `year`가 빈 문자열**, `disabled` prop은 false라는 뜻이다.

### 2-2. `year`는 소재지 섹션과 물리적으로 분리된 필드에서만 채워짐

`BuildingStdPriceForm.tsx:356`
```tsx
year={f.taxType === "transfer" ? f.transferYear : f.valuationYear}
```
- **양도 모드**: `f.transferYear` — 오직 Section 3 "양도 시점"의 `YearSelect`(`BuildingStdPriceForm.tsx:520-521`)에서만 설정. 초깃값 `""`(`lib/calc/building-std-price-form.ts:211`).
- **상속·증여 모드**: `f.valuationYear` — 상속·증여일(`eventDate`)에서 파생(`deriveYearFromEventDate`). 초깃값 `""`.

소재지·동/호수 UI는 폼 **최상단**(`BuildingStdPriceForm.tsx:318-362`), 양도연도 select는 **한참 아래 Section 3**(`BuildingStdPriceForm.tsx:515-522`)에 있어, 사용자가 소재지를 채운 시점엔 `year`가 비어 있다.

### 2-3. 동/호수 선택은 버튼 활성화와 아무 관련이 없음

`BuildingStdPriceForm.tsx:341-352`의 AddressSearch `onChange` 핸들러는 `v.dong`·`v.ho`·`v.exclusiveArea`·`v.standardPrice`를 **폼 state에 저장하지 않고 버린다**(`addressRoad`·`addressJibun`·`buildingName`·`addressDetail`·`longitude`·`latitude`·`pnu`만 저장). `pnu`는 주소를 **처음 선택한 시점**에 이미 세팅되고, 동/호수 변경은 `pnu`를 바꾸지 않는다.

→ **동/호수를 아무리 골라도 게이트 변수(`pnu`·`year`·`disabled`) 어디에도 반영되지 않는다.** 사용자의 "동/호수 다 조회" 기대와 실제 게이트(`year`) 사이의 불일치가 이 버그의 UX 본질이다.

---

## 3. 핵심 분석 — `year`는 조회에 **불필요**하다 (표제부는 시점 무관)

"건축물대장 조회"의 주 목적은 **구조·용도·연면적·신축연도·층수** 자동채움이다. 이 중 `year` 의존도를 실측하면:

| 자동채움 필드 | year 의존? | 근거 (file:line) |
|---|---|---|
| 연면적 `floorArea` | ❌ 무관 | `BuildingRegisterLookupField.tsx:75` — `d.floorArea !== null`이면 항상 채움 |
| 신축연도 `builtYear` | ❌ 무관 | `:76` — 항상 채움 |
| 지상층수 `floorsAbove` | ❌ 무관 | `:77` — 항상 채움 |
| 지하층수 `floorsBelow` | ❌ 무관 | `:78` — 항상 채움 |
| 구조 `structureKey` | △ 옵션셋 검증만 | `:81-83` — `listStructureOptions(yearNum)`에 존재하는 키만 set |
| 용도 `usageNo` | △ 옵션셋 검증만 | `:84-86` — `listUsageOptions(yearNum)`에 존재하는 번호만 set. 게다가 `year<2018`이면 용도 자동매핑 자체를 포기(`:168-169` "용도는 2018년 이후 평가만 자동 — 직접 선택") |

**API 호출 자체는 `year`를 전혀 쓰지 않는다.** `app/api/address/building-register/route.ts:87-95`의 국토부 건축HUB `getBrTitleInfo` 쿼리 파라미터는 `serviceKey·sigunguCd·bjdongCd·platGbCd·bun·ji·_type`뿐 — **year 없음**. `year`는 오직 응답의 용도 매핑 `mapUsage(mainPurpsCd, grndFlrCnt, totArea, yearNum)`(`route.ts:162`)와 route 진입 검증(`route.ts:77-84`, 4자리 아니면 error)에만 쓰인다.

**결론**: 건축물대장 표제부는 시점 무관 사실정보이므로, `pnu`만 있으면 연면적·신축연도·층수는 즉시 채울 수 있어야 한다. `year`는 구조/용도를 **특정 평가연도의 지수표에 매핑**하기 위한 보조 파라미터일 뿐이다. 현재 게이트는 이 보조 요건을 조회 전체의 필수 요건으로 잘못 승격시켜, 시점 무관 정보 조회까지 막고 있다.

---

## 4. 수정 방향 — 3안 트레이드오프

### 옵션 A — `year` 게이트 완전 제거 (pnu만으로 활성화)
- `canLookup = !!pnu && !disabled`
- route: `year` optional화. 없으면 `mapUsage` 스킵(usageNo=null), 구조도 옵션셋 검증 없이 raw 반환하거나 스킵.
- **장점**: 사용자 기대에 가장 부합.
- **단점**: `year` 없이 조회 시 구조/용도 자동채움이 **깨진다**(옵션셋 검증에 yearNum 필요). 구조/용도를 항상 사용자 직접 선택으로 후퇴시켜 자동채움 가치 저하. route·UI 양쪽 변경 큼.

### 옵션 B — 게이트 유지 + 연도 입력 UX 개선
- 게이트는 그대로, 연도 필드를 소재지 근처로 이동하거나, 버튼 클릭 시 `year` 없으면 "양도연도를 먼저 입력하세요" 안내 + Section 3로 스크롤/하이라이트.
- **장점**: 로직 변경 최소, 회귀 위험 낮음.
- **단점**: 사용자 기대("동/호수 골랐으니 바로 조회")를 완전히 충족하지 못함. 여전히 연도 선입력 강제.

### 옵션 C — 하이브리드 (**권장**)
버튼은 **`pnu`만으로 활성화**하되, 자동채움 범위를 `year` 유무로 분기:
- `year` **있음**: 기존 동작 그대로(구조·용도·연면적·신축연도·층수 전부).
- `year` **없음**: 시점 무관 4필드(연면적·신축연도·지상/지하층수)만 채우고, 구조·용도는 스킵 + summary에 **"구조·용도는 양도연도 입력 후 자동 매핑됩니다"** 안내.
- route: `year` optional화 — 있으면 `mapUsage` 수행, 없으면 구조/용도 매핑 스킵하고 연면적·신축연도·층수만 반환(성공 응답).
- 힌트: 두 번째("연도 입력 후") 힌트는 **차단 힌트에서 보조 안내로 격하**(버튼은 이미 활성).

- **장점**: 사용자 기대 충족(pnu만으로 조회 가능) + 구조/용도의 연도별 정합성 보존(법적으로 정확) + 자동채움 가치 유지.
- **단점**: route·UI 분기 로직 추가(A보다 작고 B보다 큼). anchor 필요.

**권장: 옵션 C.** 건축물대장 표제부의 시점-무관 성질과 구조/용도 지수표의 연도-종속 성질을 모두 존중하는 유일한 안.

---

## 5. 구현 계획 (옵션 C 채택 가정 — D1 승인 시)

> 8지점 동기화 대상 아님(엔진 input/result 타입 변경 없음). 순수 UI/route 게이트·분기 수정.

### Do-1. route year optional화 — `app/api/address/building-register/route.ts`
- `route.ts:77-84`: `year`가 빈 문자열이면 **error 반환 대신** `yearNum = undefined`로 진행(4자리일 때만 파싱). 4자리가 아니면서 비어있지도 않은 경우(잘못된 값)만 error 유지.
- `route.ts:161-162`: `yearNum` 있을 때만 `mapUsage(...)` 호출. 없으면 `usageResult = null`.
- 구조 매핑 `mapStructure`는 year 무관(현재도 인자 없음) — 유지. 단 응답의 `structureKey`는 그대로 반환하고, **옵션셋 검증은 UI에서** 수행(현행과 동일).
- 응답 `data.usageNo`는 year 없으면 `null`. `builtYear·floorArea·floorsAbove·floorsBelow`는 정상 반환.

### Do-2. UI 게이트 완화 — `BuildingRegisterLookupField.tsx`
- `:49`: `const canLookup = !!pnu && !disabled;` (`!!year` 제거)
- `:59`: fetch URL의 `year`는 빈 값 허용(`&year=` 빈 문자열로 전달 → route가 optional 처리).
- `:71-94` handleLookup: `year` 빈 문자열이면 `yearNum` 파싱 결과가 NaN → 구조/용도 옵션셋 검증(`listStructureOptions(yearNum)`)을 **year 있을 때만** 수행하도록 가드. year 없으면 `structOk=false·usageOk=false`로 두고 연면적·신축연도·층수만 patch.
- `:116-130` 힌트: `pnu && !year` 힌트를 **비차단 안내 문구**로 변경(예: "양도연도 입력 시 구조·용도까지 자동 매핑됩니다"). 버튼은 활성 상태.
- `buildSummary`(`:148-177`): year 없을 때 "구조·용도 직접 선택 · 연면적 … · 신축 …" 형태로 안내(기존 `year<2018` 분기 재사용 가능).

### Do-3. (선택) 동/호수 값 폼 저장 — 범위 밖 여부 판단 필요
- `BuildingStdPriceForm.tsx:341-352`의 `onChange`가 `dong·ho·standardPrice·exclusiveArea`를 버리는 것은 **별개 이슈**(집합건물 공시가격 자동채움과 관련). 이 버그(버튼 게이트)와 직접 인과 없음 → **본 계획 범위에서 제외**(고아 코드 정리 정책상 언급만). 필요 시 별도 계획.

---

## 6. 검증 (Pre-Do anchor 우선 — 정책 `pre-do-anchor-verification`)

Do 진입 전 아래 anchor를 먼저 작성해 현행 RED 확인 → 수정 후 GREEN:

1. **route anchor** (`__tests__` route 단위 또는 함수 단위): `year=""`(빈값)로 GET 시 (현행) `success:false, error:"year는 4자리…"` → (수정 후) `success:true`, `data.usageNo === null`, `data.builtYear/floorArea/floorsAbove/floorsBelow` 정상. `year="2024"`는 기존과 동일(구조·용도 포함).
   - 국토부 API는 네트워크 의존 → `mapUsage`/응답 파싱 레벨에서 mock 또는 순수 함수 분리 테스트로 격리.
2. **UI 게이트 anchor** (RTL): `pnu` 세팅 + `year=""`일 때 "건축물대장 조회" 버튼 `disabled` 아님(현행 RED). `pnu=""`이면 여전히 disabled.
3. **회귀**: `npx vitest run __tests__/…/building-std-price/` 전건 통과, `npx tsc --noEmit` 0건, `npm run lint`.
4. **브라우저 수동 확인**: 소재지+동/호수만 채운 상태에서 버튼 활성화 → 클릭 시 연면적·신축연도·층수 채워짐, 양도연도 입력 후 재클릭 시 구조·용도까지 채워짐. (미수행 시 명시)

---

## 7. 리스크 / 주의

- **국토부 API year 무사용 재확인 완료**(route.ts:87-95) — year optional화가 실제 조회를 깨지 않음.
- `listStructureOptions(yearNum)`에 `NaN` 전달 시 동작 미확인 → **year 없을 때 아예 호출하지 않도록** 가드(Do-2). 확인 필요 항목.
- 힌트 문구 변경은 tone/타이포 정책(`text-caption`·`text-muted-foreground`) 유지.
- 상속·증여 모드(`valuationYear`)도 동일 게이트를 공유 → 이 모드에서도 pnu만으로 활성화됨(일관). 상증 모드는 날짜 파생이므로 사용자가 상속·증여일을 입력하면 자연히 year가 채워짐 — 안내 문구가 양 모드에 자연스러운지 확인.

---

## 8. D1 결정 대기 (사용자)

- **D1**: 수정 방향을 **옵션 C(권장) / 옵션 B(최소 변경) / 옵션 A** 중 무엇으로 할지.
  - C = pnu만으로 활성화 + year 있을 때만 구조·용도 (권장)
  - B = 게이트 유지 + 연도 필드 UX 개선(스크롤/재배치)
  - A = year 완전 제거(구조·용도 자동채움 포기)

승인 시 §6 anchor부터 Do 진입.
