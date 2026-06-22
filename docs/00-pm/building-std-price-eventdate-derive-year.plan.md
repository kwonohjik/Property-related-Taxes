# 건물기준시가 — 상속·증여 평가시점 "날짜 단일 입력 → 연도 자동 도출" 구현 계획

> 작성일: 2026-06-22 · 대상: `app/tools/building-standard-price`(독립 도구, zustand 아님)
> 목표: 상속·증여 모드에서 "상속·증여 연도(드롭다운)"를 폐지하고, **상속·증여일(날짜) 단일 필수 입력**에서 연도를 자동 도출해 계산에 사용.

---

## 1. 배경·문제

현재 상속·증여 모드 「평가 시점」 섹션은 두 입력을 받는다.

| 필드 | state key | 역할 | 위치 |
|---|---|---|---|
| 상속·증여 연도 | `valuationYear` | **계산 키** (연도별 단가·용도지수·위치지수·구조지수 조회) | `BuildingStdPriceForm.tsx:518` |
| 상속·증여일 | `eventDate` | 계산서 서식 일자 표기용(선택) | `BuildingStdPriceForm.tsx:525` |

문제: 사용자 입장에서 연도와 날짜가 **중복 입력**으로 보이고, 둘이 어긋날 수 있다(2025 연도 + 2024 날짜 입력 가능). 법리적으로도 상속·증여세의 기준은 **평가기준일(상속개시일·증여일)**이고 연도는 거기서 파생되는 조회 키일 뿐이다.

**해결**: 날짜를 1차 필수 입력으로 두고 연도를 자동 도출. 사용자에게 보이는 입력은 날짜 하나로 단일화.

---

## 2. 범위

### 포함
- **상속·증여 모드(`taxType === "inheritance_gift"`)** 전용.
- 연도 드롭다운(`YearSelect`) 폐지 → 날짜(`DateInput`) 필수화 + 연도 자동 도출.

### 제외 (의도적)
- **양도세 모드(`taxType === "transfer"`)는 변경하지 않는다.** 양도세는 취득연도(`acquisitionYear`)·양도연도(`transferYear`) **2개 연도**가 필요한데 날짜 입력은 양도일(`eventDate`) 1개뿐이라 단일 날짜에서 두 연도를 도출할 수 없다. 양도세는 기존 드롭다운 유지. (모드 간 입력 방식 비대칭은 두 모드의 구조적 차이에서 비롯된 정상 결과.)
- `inheritanceGiftKind`(상속세/증여세 라디오, `:101`)는 이 변경과 무관 — 그대로 둔다.

---

## 3. 핵심 설계 결정

### D-1. `eventDate`를 정식 입력, `valuationYear`는 단일 writer 파생 필드 (권장 — 자가검토로 보강)

- 사용자에게 보이는 입력은 **`eventDate` 하나**. `valuationYear`는 state에 남기되 **유일한 writer = `deriveYearFromEventDate()` 헬퍼**(아래).
- 엔진 변환(`toEngineInput` `:311`)·검증(`:454`)·UI 메모(`valYear` `:179`)·공시지가 기준일(`landRefDate(f.valuationYear)` `:581,591`)·구조/용도 옵션 리스트는 **모두 `valuationYear`를 그대로 읽음 → 변경 최소화**.

#### 단일 진실 불변식 (자가검토 #1 반영 — dual-truth 차단)
`valuationYear`가 엔진/검증이 읽는 키이므로, eventDate를 우회해 desync되면 안 된다. **모든 도출 경로를 한 헬퍼로 강제**:

```ts
// building-std-price-form.ts (export — 단위 테스트 대상)
export function deriveYearFromEventDate(eventDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate.slice(0, 4) : "";
}
```

`valuationYear`를 쓰는 곳은 **상속·증여 모드에서 아래 3경로뿐**(다른 writer 금지):
1. **날짜 onChange 핸들러** — 단일 `setF`로 `eventDate`+`valuationYear`(도출)+구조/용도 가드 동시 갱신. (**useEffect→store 미러링 아님** — 메모리 `feedback_useeffect_store_mirror_forbidden`·`mirror-pattern` 준수)
2. **taxType onChange** — `set("taxType",…)`(`:219`)를 확장: 모드 전환 시 평가시점 날짜(`eventDate`·`acquisitionEventDate`)와 `valuationYear`·평가 구조/용도를 초기화해 새 일자 입력을 강제(C-8, 코드리뷰 환류 — 양도일↔상속·증여일 혼입 방지).
3. **initial/prefill** — `initialBuildingStdPriceForm`·locked prefill 경로도 `valuationYear = deriveYearFromEventDate(eventDate)`로 일치(factory=normalize=UI 3중 일치, 메모리 `feedback_store_default_vs_ui_display_fallback`).

> 근거: writer가 위 3경로로 한정되고 모두 같은 헬퍼를 거치므로 `eventDate`(완성) ⟺ `valuationYear`(설정) 불변식이 성립 → dual-truth 드리프트 구조적 불가. UX 중복(입력 2개)은 제거되고, 내부 필드는 동기 렌더용(구조/용도 옵션은 연도를 동기적으로 필요) 파생 캐시.

> **대안 D-1' (전면 제거, 비권장)**: `valuationYear` 필드 자체 삭제 후 `eventDate`에서 매번 도출. → `toEngineInput`·validate·메모 2개·`landRefDate`·서식·**상속·증여 단위 테스트 ~10개 fixture** 전부 수정. 회귀 표면 큼. **D-1(불변식 보강) 채택.**

### D-2. `DateInput` 계약 — 연도는 "날짜 완성 후"에만 도출 가능

`DateInput.onChange`는 연·월·일이 **모두** 채워졌을 때만 `YYYY-MM-DD`를 emit하고, 그 전에는 `""`을 보낸다 (`date-input.tsx:40-47` `buildDateStr`). 따라서:

- 도출 규칙: `derivedYear = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate.slice(0,4) : ""`.
- **구조·용도·공시지가 입력은 날짜 완성(=`valuationYear` 채워짐) 전까지 비활성**. 비활성 사유 hint: "상속·증여일을 먼저 입력하세요". (연도를 모르면 해당 연도 지수표 옵션을 채울 수 없음 — 정직한 UX.)

### D-3. 안전장치 — 둘 다 이미 인프라 존재, 배선만

1. **유효연도 검증**: `validateBuildingStdPriceForm`에 이미 구현됨 (`:454-460` — 연도 미설정·기계식 단가 없음·지수 자료 없음 차단). 드롭다운이라 지금은 발동 안 할 뿐. 날짜 도출 연도가 `availableYears` 범위(2001~2025, 기계식 2001~2026; `:234-251`) 밖이면 이 검증이 그대로 차단. **메시지만 "상속·증여 연도를 선택하세요" → "상속·증여일을 입력하세요"로 교체** (`:455`).
2. **구조/용도 초기화 가드**: 연도 변경 시 그 연도 지수표에 없는 구조/용도 선택을 비우는 `changeYearWithGuard` 로직 존재 (`:160-177`). 날짜 onChange에서도 동일 가드가 작동하도록 핸들러에서 재사용.

---

## 4. 케이스 매트릭스 (상속·증여 모드)

| # | 입력 상태 | 기대 동작 |
|---|---|---|
| C-1 | 날짜 미입력/미완성(`eventDate=""`) | `valuationYear=""`. 구조/용도/공시지가 비활성. validate → "상속·증여일을 입력하세요". |
| C-2 | 날짜 완성, 유효연도(예 2025-03-15) | `valuationYear="2025"`. 구조/용도/공시지가 활성. 정상 계산. |
| C-3 | 날짜 완성, **데이터 없는 연도**(예 2000-05-01, 비기계식) | `valuationYear="2000"`. validate → "2000년 지수 자료가 없습니다" 차단(`:460`). |
| C-4 | 날짜 변경으로 연도 바뀜(2025→2023) | `valuationYear` 갱신 + 새 연도 지수표에 없는 구조/용도 선택 자동 초기화(가드). |
| C-5 | 날짜 지움(backspace) | `eventDate=""`·`valuationYear=""`. 구조/용도 비활성 복귀. |
| C-6 | 기계식주차 + 날짜 완성 | `valuationYear` 도출 → `resolveMechParkingFormula(y)` 검증(`:457`). 구조/용도 불요(기계식 분기). |
| C-7 | 복합구조 모드 + 날짜 완성 | `valuationYear` 도출 → 부분별 구조/용도는 부분 카드에서, 단일 구조/용도 비활성. |
| C-8 | taxType 전환(양도↔상속·증여) | 평가시점 날짜(`eventDate`·`acquisitionEventDate`) 초기화 → `valuationYear`·평가 구조/용도도 비움 → **새 일자 입력 강제**(양도일↔상속·증여일 의미 혼입 방지, 코드리뷰 환류). |

---

## 5. 변경 지점 (8 동기화 지점 매핑)

이 화면은 **독립 도구**(로컬 `useState`, zustand 아님)라 일부 지점은 N/A.

| # | 지점 | 이 변경에서 | 파일·위치 |
|---|---|---|---|
| ① | 폼 상태 타입 | **무변경** (eventDate·valuationYear 기존재) | `building-std-price-form.ts:103,141` |
| ② | initial value | `eventDate:""`→`valuationYear:""` 자기일치(헬퍼 도출). prefill이 eventDate 세팅 시 valuationYear도 도출 | `:182,213` |
| ③ | normalize/prefill | locked prefill 경로(`initialAddress` 등)는 eventDate 미설정 → 무영향. eventDate prefill 추가 시 헬퍼 도출 일치 | `BuildingStdPriceForm.tsx:117~130` |
| ④ | API 변환(`toEngineInput`) | **무변경** (`valuationYear` 그대로 읽음) | `:311` |
| ⑤ | **UI 위젯** | **핵심 변경**: 상속·증여 섹션 `YearSelect` 제거 → `DateInput` 필수화·라벨/hint 변경·날짜 도출 핸들러·**모든 연도 의존 입력 비활성 가드**·**taxType onChange 도출 배선**(C-8) | `BuildingStdPriceForm.tsx:517~525`·`:219`·`:539,553,560` |
| ⑥ | 사이드바 합계 | N/A (도구에 compute*Summary 없음) | — |
| ⑦ | 결과/서식 | **검증만**: `dateLabel`이 이제 항상 완전 일자 표시 (`formatEventDate(f.eventDate, year)`) | `building-std-price-form.ts:582` |
| ⑧ | **Validation** | 메시지 교체 + 유효연도 검증(기존) 유지. (연도 체크 = 날짜 완성 동치) | `:455` |

### ⑤ 세부 (구현 시)
- `<FieldCard label="상속·증여 연도">…YearSelect…</FieldCard>` (`:517-523`) **삭제**.
- 남는 날짜 카드 라벨·hint·필수화: `label="상속·증여일"`, hint를 "계산서 일자 표기용(선택)"에서 평가기준일 의미로 변경(예: "상속개시일·증여일 — 연도가 자동 산정됩니다").
- 날짜 onChange 핸들러(신규): `eventDate` 세팅 + `deriveYearFromEventDate` 도출 + 구조/용도 가드를 **단일 `setF`**로 처리 (writer 단일화).
- **모든 연도 의존 입력에 `disabled = !valuationYear` + `disabledReason`("상속·증여일을 먼저 입력하세요") 배선**(자가검토 #4):
  - 단일: 구조(`valStructureKey`)·용도(`valUsageNo`)·공시지가(`valLandPrice`)
  - 복합: 부분별 구조/용도(`year={valYear}` — `:539,553,560`)
  - 다필지(`LandParcelsSection`)·조정률 위젯 등 `valYear` 의존 항목
  - (대안: 위젯들이 `year` 미정 시 빈 옵션으로 이미 무력화되나, 명시적 disabled가 UX 명확)
- taxType onChange(`:219`) 확장: inheritance_gift 전환 시 `valuationYear = deriveYearFromEventDate(f.eventDate)` 재도출(C-8).
- UI 순서 = 로직 순서 유지: 날짜(연도 도출)가 구조/용도 위에 오도록(현재 배치 그대로).

---

## 6. Pre-Do Anchor (먼저 실행 → 실패 확보 → 설계 환류)

`__tests__/calc/building-std-price-form.test.ts`에 상속·증여 시나리오 1건을 **eventDate 기반**으로 추가:

```ts
// C-2: 날짜 완성 → 연도 도출 → 정상 계산
const f = form({ taxType: "inheritance_gift", builtYear:"2020", eventDate:"2025-03-15",
                 valStructureKey:"…", valUsageNo:"…", valLandPrice:"7500000", /* derived valuationYear */ });
```
- **도출 헬퍼 단위 테스트**(`deriveYearFromEventDate`): 빈("")·부분("2025-03")·완성("2025-03-15"→"2025")·범위밖("2000-…"→validate에서 차단). 헬퍼가 단일 진실 writer이므로 여기서 도출 정확성 고정.
- **엔진 변환/검증 테스트**: `toEngineInput`/`validate`는 `valuationYear`를 읽으므로 **기존 패턴(`valuationYear` 직접 세팅) 그대로 유지** — fixture 변경 불필요(자가검토 #1·#7).
- C-1(미완성 날짜 → `valuationYear=""` → validate 차단), C-3(데이터 없는 연도 → `:460` 차단), C-4(연도 변경 시 구조/용도 초기화)도 anchor화.
- **기존 상속·증여 단위 테스트(`valuationYear` 직접 세팅, ~10건)는 무변경 통과** — Pre-Do에서 `npx vitest run __tests__/calc/building-std-price-form.test.ts`로 baseline 확인. (검증: 옛 메시지 "상속·증여 연도를 선택" 단언 테스트 없음 — 실측 완료.)

---

## 7. e2e 영향 (필수 갱신)

**상속·증여 경로 중 연도 드롭다운을 쓰는 5곳**이 `selectOption(page, "연도 선택", "YYYY년")`으로 평가연도를 고른다 — 드롭다운 폐지로 **깨짐**. 날짜 입력(`DateInput` 연/월/일 textbox)으로 교체. (e2e 블록 경계 실측 완료 — 자가검토 #2·#5.)

| 라인 | 테스트 | 모드 | 조치 |
|---|---|---|---|
| 28 | 상속·증여 기본 BSP-01 | 상속·증여 | `2025년` 선택 → `2025-mm-dd` 날짜 입력 |
| 78 | 기계식주차 BSP-MECH | 상속·증여 | `2025년` → `2025-mm-dd` |
| 99 | 복합구조+공용시설 안분 | 상속·증여 | `2026년` → `2026-mm-dd` |
| 251 | 계산서 복합 작성례(3) | 상속·증여 | `2023년` → `2023-mm-dd` |
| 321 | 조정률 모달 | 상속·증여 | `2025년` → `2025-mm-dd` |
| 87 | 검증 차단 — 미입력 시 오류 | 상속·증여 | **무변경**(연도 선택 없음, `bsp-error` testid 가시성만 단언) |

- **line 226은 양도세**(line 215 "계산서 서식 양도 2벌" 테스트의 취득2015/양도2025) — **변환 대상 아님**(자가검토 #2 정정).
- **양도세 경로(40·128·156·215·287 등)는 그대로** (`acquisitionYear`/`transferYear` 드롭다운 유지).
- `DateInput`은 `aria-label="연도"/"월"/"일"` textbox 3개 → e2e는 role/label 기반 입력. (메모 `feedback_e2e_*` 참고: getByLabel 함정 주의, textbox role 한정.)
- worktree 실행 시 `E2E_PORT=3100`.

---

## 8. 리스크·롤백

| 리스크 | 완화 |
|---|---|
| 날짜 완성 전 구조/용도 옵션 공백 → 사용자 혼란 | disabled + hint "상속·증여일을 먼저 입력하세요"로 명시 |
| 데이터 없는 연도 날짜 입력 시 늦은 차단(드롭다운은 사전 차단) | validate가 "{y}년 지수 자료가 없습니다"로 명확 차단(`:460`). 상속·증여 평가기준일은 통상 최근(2001~) → 실무 빈도 낮음 |
| 양도세 모드 회귀 | 변경을 inheritance_gift 분기에만 적용, transfer onChange(`:422`) 무변경. 전체 vitest + 양도 e2e로 확인 |
| `valuationYear` 미러 드리프트 | 도출을 `deriveYearFromEventDate` 단일 헬퍼로 강제, writer 3경로(onChange·taxType·initial)만 허용 → 불변식 성립(자가검토 #1) |
| taxType 전환 시 valuationYear stale(C-8) | taxType onChange에서 eventDate 재도출 배선(자가검토 #3) |

**롤백**: ⑤ UI 변경(YearSelect 복원 + 날짜 핸들러/disabled 제거) + ⑧ 메시지 1줄 되돌림. 엔진·변환 무변경이라 롤백 표면 작음.

---

## 9. 작업 순서 (verify 포함)

1. Pre-Do anchor(§6) 작성·실행 → 실패 확인 → 설계 환류 → **verify: anchor 실패 메시지가 의도대로**
2. `deriveYearFromEventDate(eventDate)` export + 단위 테스트(빈/부분/완성/범위밖) → **verify: 헬퍼 테스트 통과**
3. ⑤ UI: YearSelect 제거 + 날짜 필수 핸들러 + **모든 연도 의존 입력 disabled 가드** + **taxType onChange 도출 배선(C-8)** + initial/prefill 일치 → **verify: tsc 0건**
4. ⑧ validate 메시지 교체("상속·증여일을 입력하세요") → **verify: 기존 상속·증여 단위 테스트 무변경 통과**
5. e2e 상속·증여 6경로 날짜 입력 교체 → **verify: `npx playwright test building-standard-price` 통과**
6. 전체 회귀 → **verify: `npm test` + 양도세 e2e green**
7. 브라우저 수동 확인(폼→날짜 입력→연도 자동 반영→구조/용도 활성→계산) 또는 미수행 명시

### 코드리뷰 환류 (독립 검토 후)
- **모드 전환 시 평가시점 날짜 초기화**: `eventDate`는 양도일·상속·증여일이 공유하는 한 필드라, 전환 시 직전 날짜가 다른 의미로 승계될 수 있음. `changeTaxType`이 전환 시 `eventDate`·`acquisitionEventDate`·`valuationYear`·평가 구조/용도를 비워 **새 입력을 강제**(혼입 차단). e2e "모드 전환 시 평가시점 날짜 초기화"로 고정.

### Do deviation 환류 (구현 중 발견)
- **T4 간소화**: `BuildingStructureSelect`·`BuildingUsageSelect`가 이미 `disabled={!year}` 내장 → `valYear` undefined면 자동 비활성. 별도 disabled 배선 불필요(child 컴포넌트 무변경), 안내 hint만 추가.
- **hint 부분문자열 함정**: 상속·증여일 hint에 "구조·용도 **선택**" 표현을 넣자 e2e `selectOption`의 `getByText("용도 선택", {exact:false}).first()`가 콤보박스 대신 hint 문단을 클릭 → 드롭다운 미개방(0옵션)으로 BSP-01·복합·작성례 3건 실패. hint 문구에서 "구조 선택"·"용도 선택" 부분문자열 제거로 해소. (getByText 기반 e2e가 있는 화면의 안내 문구는 트리거 라벨 부분문자열 회피 필요.)

### Definition of Done
- [ ] 케이스 매트릭스 C-1~C-7 전 분기 anchor 또는 e2e로 커버
- [ ] 8 지점 점검(⑤⑧ 실변경, 나머지 무변경/N-A 확인)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/calc/building-std-price-form.test.ts` + 전체 `npm test` 통과
- [ ] 상속·증여 e2e 6경로 갱신·통과, 양도세 e2e 회귀 0
- [ ] 양도세 모드 무영향 확인
