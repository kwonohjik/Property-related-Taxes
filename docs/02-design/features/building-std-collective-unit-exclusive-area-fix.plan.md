# 건물 기준시가 계산기 — 집합건물 전유면적 대신 동 전체 연면적이 채워지는 버그 수정 계획

- **작성일**: 2026-07-21
- **브랜치/워크트리**: `worktree-fix+building-std-price-lookup-btn` (`.claude/worktrees/fix+building-std-price-lookup-btn`)
- **유형**: 버그 수정 (집합건물 면적 데이터 흐름)
- **연관 계획**: [`building-register-lookup-year-gate-fix.plan.md`](./building-register-lookup-year-gate-fix.plan.md) — 같은 화면·같은 조회 버튼. 두 버그는 상호 연관(§7).
- **상태**: Plan (Do 미착수) — 아래 **D1·D2 결정 대기**

---

## 1. 증상 (사용자 보고)

건물 기준시가 계산기에서 집합건물(아파트 등)의 **해당 동·호(201동 3204호)를 선택**했을 때, 그 호의 **전유부분(전유면적)** 이 건물 연면적으로 반영되어야 하는데, **동(棟) 전체 면적**이 조회·반영된다.

---

## 2. 근본 원인 — 2개 레이어 (전부 실측)

### 레이어 1. 이미 조회된 전유면적을 폼이 **버린다** (주 원인)

집합건물 전유면적은 **이미 정상적으로 조회되어** 있다:
- `app/api/address/standard-price/route.ts:203` — Vworld NED 공동주택가격 API 응답의 `prvuseAr`(전용면적)을 `exclusiveArea`로 매핑. (`route.ts:50-58`에 `prvuseAr`=전용면적·`pblntfPc`=공동주택 공시가격·`dongNm`/`hoNm` 필드 정의; `route.ts:294-312` `apart_housing_price` 경로)
- `components/ui/address-search.tsx:163` `fetchUnits`가 이 API를 호출해 `units` 배열에 저장
- 사용자가 호를 선택하면 `address-search.tsx:355-363` onChange가 **전유면적을 부모로 전달**:
```tsx
onChange({
  ...value,
  detail: [selectedDong, ho].filter(Boolean).join(" "),
  dong: selectedDong || undefined,
  ho,
  exclusiveArea: unit?.exclusiveArea,                 // ← 전유면적 전달됨
  standardPrice: unit && unit.price > 0 ? unit.price : undefined,
});
```
`AddressValue` 인터페이스에도 `exclusiveArea`(`address-search.tsx:35`)·`dong`·`ho`·`standardPrice`가 정식 정의됨.

그런데 `BuildingStdPriceForm.tsx:341-352`의 onChange 핸들러는 **`v.exclusiveArea`·`v.dong`·`v.ho`·`v.standardPrice`를 하나도 읽지 않고 버린다**:
```tsx
onChange={(v) =>
  setF((prev) => ({
    ...prev,
    addressRoad: v.road, addressJibun: v.jibun, buildingName: v.building,
    addressDetail: v.detail,   // "201동 3204" 문자열만 저장
    longitude: v.lng, latitude: v.lat, pnu: v.pnu ?? "",
  }))
}
```
→ `components/calc/building-std-price/` 전체에서 `exclusiveArea`/`dong`/`ho`를 소비하는 코드는 **0건**. 조회는 됐는데 폼이 통로를 안 만들어 전유면적이 `floorArea`로 흐르지 못한다.

### 레이어 2. 건축물대장 조회는 **동 전체 연면적(totArea)** 을 채운다

`floorArea`(건물 연면적)가 채워지는 경로는 정확히 2가지뿐:
1. 수동 입력(`BuildingStdPriceForm.tsx:373·383` `DecimalInput`)
2. **건축물대장 조회** — `BuildingRegisterLookupField.tsx:75` `patch.floorArea = String(d.floorArea)`. 이 `d.floorArea`는 `app/api/address/building-register/route.ts:158·185`의 **`totArea`(동 전체 연면적)** 에서 온다. route는 표제부 오퍼레이션 `getBrTitleInfo`(`route.ts:38-39`)만 호출하며 dong/ho 파라미터가 없다(`route.ts:87-95`).

→ 집합건물에서 "건축물대장 조회" 버튼을 누르면 **한 세대의 전유면적이 아니라 동 전체 연면적**이 `floorArea`로 들어간다. 이것이 사용자가 본 "동 전체 면적" 증상의 직접 경로다.

### 판정 플래그 부재
"집합건물" 여부를 나타내는 명시 플래그(`regstrKindCd` 등)는 UnitSelector·폼 어디에도 없다. 암묵 신호만 존재: `address-search.tsx:338` `units.length > 0`이면 세대(호) 조회됨 = 사실상 집합건물, `address-search.tsx:553` `hasDongColumn`. **폼 쪽에는 이 신호가 도달하지 않는다**(dong/ho/exclusiveArea를 버리므로).

---

## 3. 확립된 선례 — 동일 문제를 이미 해결한 패턴이 있다

상속·증여 재산 카드는 **같은 `AddressValue.exclusiveArea`** 를 받아 면적 필드에 자동 반영한다. `components/calc/inheritance/estate-card/variants/EstateBodyHelpers.ts:103-104`:
```ts
if (typeof v.exclusiveArea === "number" && v.exclusiveArea > 0) {
  patch.areaSqm = v.exclusiveArea;
}
```
주석(`EstateBodyHelpers.ts:60-61`)도 "동/호 선택 시 exclusiveArea·standardPrice가 실려 오면 areaSqm·standardPrice도 함께 채운다"고 명시.

→ **BuildingStdPriceForm만 이 확립된 패턴을 적용하지 않아** 전유면적을 버리고 있다. 해법은 새로운 메커니즘이 아니라 기존 패턴의 이식이다.

---

## 4. 국토부 건축HUB 전유부 API — 정본 경로(참고)

호별 전유면적의 **정본 소스**는 건축HUB 전유공용면적 오퍼레이션이다(조사 실측, 출처: data.go.kr 15134735 · PublicDataReader `molit.py`):

| 오퍼레이션 | 반환 | 적합성 |
|---|---|---|
| `getBrTitleInfo` (표제부, 현재 사용) | `totArea` = 동 전체 연면적 | ❌ 호별 아님 |
| `getBrExposInfo` (전유부) | `dongNm·hoNm` 호 목록, **면적 컬럼 없음** | ❌ 면적 없음 |
| **`getBrExposPubuseAreaInfo`** (전유공용면적) | 호별 `area` + `exposPubuseGbCdNm`(전유/공용 구분) + `dongNm·hoNm` | ✅ **정본** |

- 엔드포인트: `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo`
- 파라미터: 기존 `serviceKey·sigunguCd·bjdongCd·platGbCd·bun·ji·_type=json` + `numOfRows`(호 다건) + (특정 호) `dongNm·hoNm`
- 응답 처리: items에서 `exposPubuseGbCdNm === "전유"` 행의 `area`. **전유 구분 코드값은 활용신청 명세로 확인 필요.**
- `decomposePnuForBuildingRegister`(`lib/geo/pnu-building-register.ts:32-42`)는 sigunguCd/bjdongCd/platGbCd/bun/ji를 이미 제공 → 재사용 가능. 단 dong/ho는 PNU에 없어 별도 입력 필요.

**단, 이미 §2/§3에서 확인했듯 프로젝트는 Vworld NED로 호별 전유면적(`prvuseAr`)을 이미 얻고 있다.** 따라서 건축HUB 신규 API는 필수가 아니며, 접근 B(§5)의 선택지로만 둔다.

---

## 5. 수정 방향 — 2안 트레이드오프

### 접근 A — Vworld NED 전유면적을 폼에 반영 (**권장**)
이미 조회된 `exclusiveArea`를 `floorArea`로 흐르게 하고, 집합건물에서 동 전체 연면적으로 덮어쓰지 않도록 가드.
- **장점**: 새 API 호출·활용신청 없음(이미 있는 데이터). 상속·증여 카드의 **확립된 패턴 재사용**(§3). 최소 변경, 낮은 회귀 위험.
- **단점**: NED `prvuseAr`(공동주택가격 기준 전용면적)과 건축물대장 전유면적의 정의 차이 가능성 → **확인 필요**(대개 건물 기준시가 계산에는 전용면적이 타당).

### 접근 B — 건축HUB 전유공용면적 API 신규 라우트
`getBrExposPubuseAreaInfo` 신규 프록시 라우트 + dong/ho 파라미터 + 전유 구분 필터.
- **장점**: 건축물대장 정본 전유면적. 층별·공용 구분까지 확장 가능.
- **단점**: 신규 라우트·활용신청 확인·dong/ho 폼 저장·전유 코드값 확인 등 범위 큼. NED로 이미 해결 가능한 문제에 과대 투자.

**권장: 접근 A.** 근거 — 데이터가 이미 존재하고, 동일 목적의 패턴이 코드베이스에 확립되어 있으며(§3), 정책상 최소·surgical 변경(전역 규칙 Simplicity/Surgical)에 부합.

---

## 6. 구현 계획 (접근 A 채택 가정 — D1 승인 시)

> 엔진 input/result 타입 변경 없음 → 8지점 동기화 대상 아님. 폼 onChange + 조회 버튼 가드만.

### Do-1. 폼 state에 집합건물 정보 저장 — `BuildingStdPriceForm.tsx:341-352`
onChange 핸들러에 dong/ho/exclusiveArea 저장 추가(EstateBodyHelpers 패턴 이식):
- `v.dong`·`v.ho`를 폼 필드에 저장(신규 폼 필드 `unitDong`·`unitHo` 또는 기존 `addressDetail` 유지 + 판정용 boolean). → 집합건물 판정(`isCollectiveUnit = !!v.exclusiveArea` 또는 `!!v.dong`)에 사용.
- `if (typeof v.exclusiveArea === "number" && v.exclusiveArea > 0) next.floorArea = String(v.exclusiveArea);` — 전유면적을 `floorArea`에 자동 반영.
- (선택) `v.standardPrice`도 필요 필드에 반영할지 검토 — 단 이 계산기는 "건물분 기준시가 산정"이 목적이라 공동주택 공시가격(토지+건물 통합)은 부적합할 수 있음 → **범위 밖 가능성, 확인 필요**. 본 계획은 면적에 한정.

### Do-2. 집합건물일 때 건축물대장 조회의 동 전체 면적 덮어쓰기 방지 — `BuildingRegisterLookupField.tsx`
집합건물(전유면적 이미 확보)에서는 `getBrTitleInfo`의 `totArea`(동 전체)로 `floorArea`를 덮어쓰면 안 된다. 택1(D2):
- **D2-a**: 집합건물이면 "건축물대장 조회" 버튼을 **숨김/비활성 + 안내**("집합건물은 세대 전유면적이 자동 입력됩니다"). 구조·용도·신축연도는 별도 확보 경로 필요 시 후속.
- **D2-b**: 버튼은 두되 집합건물이면 patch에서 **`floorArea`만 제외**(구조·용도·신축연도·층수는 채우되 연면적은 전유면적 유지).
- **D2-c**: 접근 B로 전환해 집합건물이면 조회 버튼이 `getBrExposPubuseAreaInfo`를 호출(전유면적 정본).

권장 **D2-b** — 전유면적은 NED 값 유지, 건축물대장의 나머지 유용 필드(구조·용도·신축연도·층수)는 계속 활용. 최소 손실.

### Do-3. floorArea 자동 반영 시 tone/표시
자동 채워진 `floorArea` 옆에 출처 안내(예: "세대 전유면적 자동 입력") — `text-caption text-muted-foreground`. 사용자가 수정 가능(수동 우선).

---

## 7. 연관 계획과의 관계 (중요)

[`building-register-lookup-year-gate-fix.plan.md`](./building-register-lookup-year-gate-fix.plan.md)(연도 게이트 완화)와 **상호작용**한다:
- 연도 게이트를 완화해 건축물대장 조회를 쉽게 만들면, 집합건물에서 **동 전체 연면적이 더 쉽게 `floorArea`로 유입**되는 부작용이 커진다.
- 따라서 **본 계획 Do-2(집합건물 floorArea 가드)** 는 연도 게이트 완화와 **함께** 적용되어야 안전하다.
- 두 계획을 **한 브랜치에서 순차 구현**(먼저 본 계획 Do-1/Do-2로 집합건물 면적 경로 정비 → 이후 연도 게이트 완화) 권장. 순서 반대 시 회귀 창구가 생김.

---

## 8. 검증 (Pre-Do anchor 우선)

1. **UI onChange anchor** (RTL): AddressSearch onChange에 `exclusiveArea: 84.99` 실은 값 전달 시 폼 `floorArea === "84.99"`가 되는지(현행 RED — 버려짐). `dong`/`ho` 저장 확인.
2. **조회 버튼 가드 anchor**(D2-b 채택 시): 집합건물 상태에서 건축물대장 조회 patch에 `floorArea`가 포함되지 않고 구조·용도·신축연도·층수만 포함되는지.
3. **회귀**: 일반건축물(비집합, `units.length===0`)은 기존대로 건축물대장 `totArea`가 `floorArea`에 반영되는지(회귀 없음 확인).
4. `npx vitest run __tests__/…/building-std-price/`, `npx tsc --noEmit` 0, `npm run lint`.
5. **브라우저 수동**: 아파트 동/호 선택 → 전유면적이 연면적에 자동 입력, 건축물대장 조회해도 동 전체 면적으로 덮이지 않음. (미수행 시 명시)

---

## 9. 확인 필요 항목 (Do 전 실측)

- [ ] NED `prvuseAr`(전용면적)이 건물 기준시가 계산의 `floorArea`로 타당한지 — 건축물대장 전유면적과 정의 차이 여부. (건물 기준시가 = 전유부분 기준이면 전용면적이 정답)
- [ ] `standardPrice`(공동주택 공시가격=토지+건물 통합)를 이 계산기에서 소비할지 — **범위 밖 추정**(건물분 기준시가 산정 목적과 상충). 본 계획은 면적에 한정.
- [ ] D2-b 채택 시 집합건물 판정을 폼에서 무엇으로 할지(`unitDong` 존재 vs `exclusiveArea>0` 저장값).
- [ ] 신규 폼 필드 추가 시 `lib/calc/building-std-price-form.ts` initial·normalize 동기화.

---

## 10. D 결정 대기 (사용자)

- **D1**: 전유면적 소스를 **접근 A(Vworld NED 재사용, 권장) / 접근 B(건축HUB `getBrExposPubuseAreaInfo` 신규 API)** 중 무엇으로.
- **D2**: 집합건물일 때 건축물대장 조회 버튼 처리를 **D2-a(숨김) / D2-b(floorArea만 제외, 권장) / D2-c(전유부 API로 전환)** 중 무엇으로.
- **D3**: 본 계획과 연도 게이트 계획을 한 브랜치에서 순차 구현할지(권장) — §7.

승인 시 §8 anchor부터 Do 진입.
