# Plan — 피상속인 기본 정보 레이아웃 개편 + 주소 입력·신고서 표시

> 작성일: 2026-06-10
> 범위: UI + form 필드 1개 추가 (엔진·세율 계산 무변경 — 피상속인 정보는 form→ResultView props 직접 주입)
> 참조 (실측):
> - `components/calc/inheritance/steps.tsx:60-156` (Step0 섹션① 피상속인 기본 정보)
> - `components/calc/inheritance/shared.ts:20-25` (FormState 피상속인 필드)·`:170~` (INITIAL_FORM)
> - `components/ui/address-search.tsx:22-30` (`AddressSearch`·`AddressValue`)
> - `components/calc/inputs/RadioCardGroup.tsx:100-109` (RadioCardGroup props)
> - `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx:148-173` (별지9호 ⑦성명·⑧주민번호·⑨거주구분·⑩주소)
> - `lib/calc/filing-form-9-data.ts` (`buildFilingForm9Data` 어댑터)
> - `components/calc/results/InheritanceTaxResultView.tsx:54-82,399-400` (decedent* props 주입)

---

## 1. 배경 및 목표

섹션① "피상속인 기본 정보"의 레이아웃을 정리하고, **피상속인 주소 입력(Vworld 조회)**을 추가해 상속세 신고서에 표시한다. 인터뷰 확정 사항 반영.

| # | 요청 | 인터뷰 결정 |
|---|---|---|
| A | 1행에 성명·주민번호·상속개시일 | **항상 가로 3컬럼 고정** |
| B | 거주자 여부 라디오 버튼화 | **RadioCardGroup `inline`**(컴팩트 가로) |
| C | 주소(Vworld 조회) + 신고서 표시 | 형식 **도로명+상세주소** / 범위 **별지9호 ⑩ 단독**(사용자 확정) |

---

## 2. 범위 — 엔진 무변경 근거

피상속인 성명·주민번호는 **엔진 input·API에 전달되지 않고**(세율 계산 무영향), form→`InheritanceTaxResultView` props로 직접 주입돼 신고서에 표시된다(`inheritance-api.ts` body에 decedent* 미포함, `InheritanceTaxResultView.tsx:68-69` props 주입). **주소도 동일 경로**를 따른다 — 엔진·`result` 객체 무변경.

| 구분 | 변경 |
|---|---|
| `lib/tax-engine/*` (엔진) | **무변경** |
| `lib/calc/inheritance-api.ts` (API 변환) | **무변경**(decedent 정보 미전달 경로 유지) |
| `components/calc/inheritance/shared.ts` (FormState) | `decedentAddress` 1필드 추가 |
| `components/calc/inheritance/steps.tsx` (Step0) | 레이아웃 재구성 + AddressSearch |
| `lib/calc/filing-form-9-data.ts` (어댑터) | 주소 매핑 추가 |
| `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx` | ⑩칸 채움 |
| `components/calc/results/InheritanceTaxResultView.tsx` | decedentAddress prop 전달 |

---

## 3. 신규 필드 설계 — `decedentAddress`

`AddressValue`(`address-search.tsx:22-30`)를 그대로 보관(영농공제 패턴과 일관, sessionStorage 복원 가능):

```typescript
// shared.ts FormState
decedentAddress?: AddressValue;   // { road, jibun, building, detail, lng, lat, pnu }
// INITIAL_FORM: decedentAddress: undefined
```

- **신고서 표시 문자열**(도로명+상세): `[road, detail].filter(Boolean).join(" ")` → 예 "서울시 강남구 테헤란로 123 101동 202호". road 없으면 jibun fallback.
- **선택 입력**(필수 아님) — 미입력 시 신고서 ⑩칸 빈칸 유지. validation 차단 없음(주소는 계산 무관, 미입력 허용).

### 동기화 지점 (UI 7지점 중 해당)

| 지점 | 위치 | 처리 |
|---|---|---|
| ① FormState 타입 | `shared.ts` | `decedentAddress?: AddressValue` |
| ② INITIAL_FORM | `shared.ts` | `undefined` |
| ③ normalize | sessionStorage 복원 | AddressValue 그대로(직렬화 안전 — 순수 객체) |
| ⑤ UI 위젯 | `steps.tsx` Step0 | `AddressSearch` |
| ⑦ 결과 표시 | ResultView→어댑터→별지9호 ⑩ | 도로명+상세 문자열 |
| ④⑥⑧ API·사이드바·validation | — | 무관(엔진 미전달·선택 입력) |

---

## 4. 레이아웃 재구성 (섹션① — `steps.tsx:71-136`)

```
┌─ ① 피상속인 기본 정보 (sky) ──────────────────────────────┐
│ [1행 — grid-cols-3 고정]                                    │
│   피상속인 성명 │ 주민등록번호 │ 상속개시일(사망일)*        │
│ [2행]                                                       │
│   거주자 여부:  ● 거주자   ○ 비거주자   (RadioCardGroup inline) │
│ [3행]                                                       │
│   주소  [AddressSearch — Vworld 검색 + 상세주소]            │
└─────────────────────────────────────────────────────────┘
```

- **1행**: `grid grid-cols-3 gap-3`(반응형 없이 항상 3컬럼 — 인터뷰 확정). 상속개시일은 `DateInput`(연/월/일). 좁은 폭 주의 — 각 칸 `min-w-0`.
- **2행**: 기존 native 버튼 2개 → `RadioCardGroup` `layout="inline"` `tone="sky"`. options `[{value:"resident",label:"거주자"},{value:"non_resident",label:"비거주자"}]`. (현재 설명문 "국내에 주소 or 183일…"은 inline에서 생략 또는 hint — 인터뷰: 컴팩트 선택)
- **3행**: `AddressSearch value={form.decedentAddress} onChange={...}`. 상속개시일 안내문("평가기준일·신고기한…")은 1행 상속개시일 칸 하단 hint로 이동.

---

## 5. 주소 표시 서식 (Q2 — 별지9호 + 다른 서식)

### 5.1 확정 — 별지 제9호 ⑩칸

`FilingForm9CoverSection.tsx:157`의 `data-testid="ff9-⑩"`(현재 빈칸)에 도로명+상세 표시. `buildFilingForm9Data`에 `decedentAddress` 파라미터 추가 → `data.decedentAddress` 매핑.

### 5.2 다른 서식 — 표시하지 않음 (사용자 확정: 별지9호 단독)

**사용자 결정(2026-06-10): 별지9호 ⑩칸 단독.** 다른 서식(별지6호의2·부표 등)에는 피상속인 주소를 표시하지 않는다. 실측상 피상속인 주소칸이 예약된 공식 서식은 별지9호뿐이며(별지6호의2는 신청인=상속인 주소만, `cohabit-besshi-data.ts:8`), 없는 칸을 임의 생성하지 않는다.

---

## 6. 케이스 매트릭스

| # | 시나리오 | 처리 |
|---|---|---|
| 1 | 주소 검색·선택 | AddressValue 저장, ⑩칸 도로명+상세 |
| 2 | 주소 미입력 | ⑩칸 빈칸, validation 통과(선택 입력) |
| 3 | 도로명 없음(지번만) | jibun fallback 표시 |
| 4 | 상세주소만 입력/도로명 미선택 | road 없으면 detail 단독 또는 빈칸 처리 |
| 5 | sessionStorage 복원 | AddressValue 순수 객체 → 직렬화 안전 |
| 6 | 거주자/비거주자 토글 | RadioCardGroup inline, decedentType 갱신(기존 로직 동일) |
| 7 | 1행 3컬럼 좁은 폭 | min-w-0·DateInput 폭 확인(브라우저) |

---

## 7. 완료 정의

- [ ] `decedentAddress` 7지점 중 해당(①②③⑤⑦) 동기화
- [ ] 거주자 RadioCardGroup inline 전환(native button 제거)
- [ ] 1행 grid-cols-3 고정
- [ ] 별지9호 ⑩칸 표시 + 어댑터 매핑
- [ ] "다른 서식" 피상속인 주소칸 유무 공식 양식 확인 후 결정
- [ ] `npx tsc --noEmit` 0건 / inheritance vitest 통과(엔진 무변경 0 회귀)
- [ ] E2E: 주소 입력 → 결과 별지9호 ⑩칸 표시 / 거주자 inline 토글 / 1행 레이아웃
- [ ] 800줄: steps.tsx 증가분 확인(필요 시 섹션① 분리)

---

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| 1행 3컬럼 + DateInput(연월일 3분할)이 좁은 폭에서 깨짐 | min-w-0·브라우저 확인. 인터뷰=가로 고정이므로 모바일 가독성 trade-off 수용 |
| "다른 서식"에 피상속인 주소칸 임의 생성 | 공식 양식 칸 있는 서식만. 없으면 별지9호 단독 |
| AddressSearch가 기준시가 자동조회(housing) 트리거 | 피상속인 주소는 단순 주소 — standard-price 조회 불필요 분기 확인 |
| RadioCardGroup inline에서 거주자 설명문 손실 | hint로 이전 또는 생략(인터뷰: 컴팩트 선택) |

---

## 9. 작업 순서

1. `shared.ts` FormState·INITIAL_FORM에 `decedentAddress` (①②③)
2. `steps.tsx` 섹션① 레이아웃(1행 3컬럼·거주자 inline·주소 AddressSearch) (⑤)
3. `InheritanceTaxResultView` decedentAddress prop (⑦ 경로)
4. `filing-form-9-data.ts` 어댑터 + `FilingForm9CoverSection` ⑩칸 (⑦)
5. "다른 서식" 공식 양식 확인 → 해당 시 매핑
6. tsc + vitest + E2E
