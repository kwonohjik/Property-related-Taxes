# 비주식 자산 입력 폼 — 주식 카드(FieldCard) 스타일 통일 계획서

> 작성일: 2026-05-29 · 대상: 상속세 비주식 자산 카드 본문 입력 폼
> 요청자 결정: **단일 섹션(이미지10 동일)** + **모든 비주식 자산** 적용

## 0. 목표

부동산·예금·현금·금융·기타 자산 카드 본문(화면 A, 이미지9)을 **주식 종목 카드(화면 B, 이미지10) 스타일**로 통일한다.

| | 화면 A (현재) | 화면 B (목표) |
|---|---|---|
| 컨테이너 | 색상 카드·헤더 없음, 필드 세로 나열 | 파란 섹션 카드 `border-sky-300 bg-sky-50/70 p-3` + 헤더(제목+서브타이틀) |
| 필드 마크업 | `CurrencyInput` 내장 라벨이 **입력 위** | `FieldCard`(좌-라벨 160px / 우-입력, hint 아래) |
| 참조 구현 | — | `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx:39-111` |

---

## 1. 현행 분석 (file:line 실측)

### 대상 컴포넌트 (모두 `components/calc/inheritance/estate-card/variants/`)
| 파일 | 줄 | 대상 카테고리 |
|---|---|---|
| `EstateBodyRealEstate.tsx` | 280 | real_estate_land / building / apartment |
| `EstateBodyDeposit.tsx` | 78 | deposit (전세보증금 반환채권) |
| `EstateBodySimple.tsx` | 92 | cash / financial / other |

### 화면 B 패턴 (목표 — `ListedStockSecurityInfoSection.tsx:39-111`)
```tsx
<section className="rounded-lg border border-sky-300 bg-sky-50/70 p-3">
  <div className="... mb-2">
    <h4 className="text-sm font-semibold text-sky-900">종목 정보 입력</h4>
    <p className="text-xs text-sky-700 mt-0.5">종목코드·종목명·보유 주식 수</p>
  </div>
  <div className="space-y-3">
    <FieldCard label="종목코드" required trailing={…} warning={…} hint="…"><input/></FieldCard>
    …
  </div>
</section>
```

### FieldCard API (`components/calc/inputs/FieldCard.tsx`)
- props: `label` · `required` · `hint` · `warning` · `trailing`(우측 슬롯) · `unit` · `badge` · `htmlFor` · `children`
- 레이아웃(34-76): `grid sm:grid-cols-[160px_1fr]` — sm+ 좌-라벨/우-입력, sm 미만 위-라벨 자동. hint/warning은 입력 아래.

### 핵심 prop 확인 (실측 — 정정본)
- `CurrencyInput`(CurrencyInput.tsx:45-59): props는 `label·value·onChange·placeholder·required·hint·disabled·hideUnit·hideLabel·allowNegative`. **`id` prop 없음** ⚠️[오류1].
  - `hideLabel=true`이면 input에 `aria-label={label}` 자동 설정(122). 단 **`label`이 빈문자열이면 aria-label도 사라짐**(`hideLabel && label ? label : undefined`) → FieldCard 래핑 시 `label` 텍스트는 **반드시 유지**하고 `hideLabel hideUnit`만 추가. `label=""` 전달 금지.
  - **`id` 미보유** → FieldCard `htmlFor`로 label↔input 연결 불가. §2-2·§4 참조.
- `FieldCard.htmlFor`(17·48): `<label htmlFor>`를 렌더하나, 연결할 input에 동일 `id`가 있어야 유효.
- `StandardPriceInput`(StandardPriceInput.tsx): `label?`(39)만 존재. **EstateBodyRealEstate에서 이미 `label=""`(201)로 호출**하고 외부에 자체 `<label>`(182-184)을 두는 패턴 사용 중 ⚠️[오류2] → `hideLabel` 신설 불필요. 내부는 연도 드롭다운+공시가격 조회 버튼+금액(+면적 단가) **복합 위젯**(§2-4).

### EstateBodyRealEstate 현행 필드 (변환 대상)
| 필드 | 현행 line | 현행 컴포넌트 |
|---|---|---|
| 자산 명칭(소재지 검색) + 별칭 | 80-155 | 자체 `<label>` + `AddressSearch` + `<input>` |
| ℹ️ §61① 평가순위 안내 박스 | (시가 위) | info 박스 |
| 시가 (매매·수용·경매가액) | 162-169 | `CurrencyInput`(label) |
| 감정평가액 | 171-178 | `CurrencyInput`(label) |
| 기준시가 / 개별공시지가 | 180-205 | `StandardPriceInput`(자체 label) |
| 임대보증금 (apt·building) | 207-216 | `CurrencyInput`(label) |
| 저당권 담보채권액 | 218-225 | `CurrencyInput`(label) |
| §14 자동공제 토글 | 227-277 | `ToggleCard`(amber) — 조건부 |

EstateBodyDeposit: 자산명(28-40) + 임대보증금(47-54) + §14 토글(56-75).
EstateBodySimple: 자산명(52-64) + 시가(71-78, 라벨 카테고리별) + 감정평가액(81-89, other만).

---

## 2. 변경 계획

### 2-1. 섹션 카드 래퍼 + 헤더 (3개 variant 공통)
화면 B의 `<section className="rounded-lg border border-sky-300 bg-sky-50/70 p-3">` + 헤더(`h4`+`p`) 패턴 차용. tone은 **sky 통일**(이미지9의 §61① 안내 박스가 이미 파란색이라 정합).

- 헤더 제목: `평가액 입력`
- 서브타이틀(카테고리별):
  - 부동산: `소재지·시가·감정가·기준시가 — 상증법 §60~66`
  - 예금: `전세보증금 반환채권 — 환산가액`
  - 현금/금융/기타: `시가·감정가 — 상증법 §60`

> 중복 추출 권장: 섹션 래퍼+헤더를 공용 `EstateBodySection`(신규 작은 컴포넌트, `variants/EstateBodyHelpers.ts` 인근) 또는 inline. 3 variant가 동일 wrapper 쓰도록.

### 2-2. CurrencyInput 필드 → FieldCard 래핑 (시가·감정평가액·임대보증금·저당채권액·현금/잔액)
```tsx
<FieldCard label="시가 (매매·수용·경매가액)" unit="원" hint="평가기간(±6개월) 내 실거래가">
  <CurrencyInput
    label="시가 (매매·수용·경매가액)"  /* ← 유지 필수: hideLabel 시 aria-label 소스 (빈문자열 금지) */
    value={…} onChange={…}
    hideLabel hideUnit
    placeholder="없으면 빈칸"
  />
</FieldCard>
```
- ⚠️[오류1 정정] **`id`/`htmlFor` 미사용**: CurrencyInput에 `id` prop이 없어 FieldCard `htmlFor` 연결 불가. 두 방안 중 택1(§7 결정):
  - **(A·권장) 그대로**: FieldCard `htmlFor` 생략. CurrencyInput `hideLabel`이 `aria-label`을 보존 → 접근성·`getByLabel` 유지. 라벨 클릭 포커스 이동만 없음(경미).
  - (B) `CurrencyInput`에 `id?` prop 신설 후 FieldCard `htmlFor`와 연결 — 라벨 클릭 포커스까지 확보(소규모 컴포넌트 확장).
- `FieldCard.label`과 `CurrencyInput.label`(hideLabel) 텍스트는 **동일 문자열**로(중복처럼 보이나 전자=시각 라벨, 후자=aria 전용). 라벨·hint·placeholder **문자열 전부 보존**(테스트 셀렉터·UX 동일).
- `required`는 기존 필드 속성 그대로(예: 예금 임대보증금 required) — FieldCard `required`로 이전.
- EstateBodySimple 시가 라벨은 카테고리별 유지(현금 "현금 금액" / 금융 "잔액 또는 시가" / 기타 "시가 …") — FieldCard·CurrencyInput 양쪽 동일.

### 2-3. 자산 명칭(소재지)·별칭 → FieldCard
- 자산 명칭: `FieldCard(label="자산 명칭", required, hint=현행 ※문구)` + children=`AddressSearch`(부동산) 또는 `<input>`(예금·단순).
  - ⚠️[누락 보강] 부동산 라벨에 **어업자산 분기 텍스트**(EstateBodyRealEstate.tsx:83-86 `소재지 검색`/`선적지·어장 연안 검색`)와 hint 분기(150-154)가 있음 → FieldCard `label`은 고정 문자열이므로 분기 텍스트를 label에 직접 넣거나 hint로 이전. **어업 분기 보존 필수**.
  - AddressSearch `onChange`(자산명 자동입력·Vworld 좌표·시군구코드, 88-141) 로직 **그대로 children에 이식**. 검색 아이콘 내장 → trailing 불필요.
- 별칭: 현행 placeholder만 있는 `<input>`(143-149, 시각 라벨 없음) → `FieldCard(label="별칭", hint="선택 — 예: 강남 아파트, 본가 토지")` + `<input>`로 라벨 부여(개선).
- `<input>` 직접 작성 시 전역 SelectOnFocusProvider·EnterKeyNavigation 적용됨(별도 onFocus 불필요). 자체 `<label>` 마크업 제거.

### 2-4. StandardPriceInput(기준시가) — 복합 위젯 처리 *(정정 — [오류2])*
⚠️ **`hideLabel` 신설 불필요**: EstateBodyRealEstate는 **이미 `StandardPriceInput label=""`(201)** + 외부 `<label>` div(182-184) + amber 경고(185-190) 패턴을 사용 중. 따라서:
- **(A 채택) 외부 `<label>` div(182-184)를 FieldCard로 대체**: `FieldCard(label= land?"개별공시지가 (면적 포함 합산)":"기준시가")` + children=`StandardPriceInput(label="")`(현행 그대로). 연도 드롭다운+조회버튼+금액(+면적 단가)이 FieldCard 우측 컬럼(`1fr`)에 들어감.
- ⚠️ **공시가격 안내 amber 경고**(185-190, `!addrValue.jibun`일 때): FieldCard `warning` slot은 **destructive(빨강)** 색이라 amber와 불일치 → **children 영역(StandardPriceInput 위)에 현행 amber 박스 그대로 유지**, FieldCard warning 미사용.
- ⚠️ **브라우저 확인 필수**: 연도 드롭다운+조회버튼+금액 다단 위젯이 160px 좌-라벨 + `1fr` 우측 컬럼에서 줄바꿈·정렬 깨지지 않는지. 깨지면 (B) 폴백.
- (B) 폴백: 정렬이 깨지면 기준시가만 FieldCard 미적용(현행 외부 `<label>` 유지)하고 섹션 카드 안에만 배치. 시각 약간 비일관하나 안전.

### 2-5. §14 자동공제 ToggleCard (+ 중첩 rose 토글·채권자명 input)
- §14 ToggleCard(227-277)는 **내부에 중첩 ToggleCard(rose, 247-258) + 채권자명 `<input>`(264-274)** 을 children으로 가짐. 자체 카드형 → FieldCard 부적합.
- **섹션 카드 밖(바로 아래)에 현행 그대로 유지**. tone amber/rose 유지(분기 토글 색 규칙 — components/calc/CLAUDE.md). 채권자명 input·중첩 토글은 **이번 FieldCard 전환 범위 제외**.

### 2-6. ℹ️ §61① 평가순위 안내 박스 (색상 정정)
- ⚠️[정정] 현행 색은 **indigo**(EstateBodyRealEstate.tsx:158 `text-indigo-600 bg-indigo-50`), sky 아님. 카테고리별 문구도 상이(land=개별공시지가 / building=개별주택가격·기준시가 / apartment=공동주택 기준시가, PRIORITY_HINT 34-41).
- 법령 인용(§61①) info 박스는 **섹션 카드 상단(헤더 아래)에 indigo 그대로 유지**. 법령 정확성 우선. 섹션 헤더 서브타이틀과는 별개로 존치.

---

## 3. 영향 범위 / 동기화 지점

- **엔진 input/result 변경 0** · **필드 추가/제거 0**: 순수 마크업(스타일) 교체. 14 동기화 지점 중 **⑤ UI 위젯만** 변경. ①②③④⑥⑦⑧⑨~⑭ 무관.
- API·validation·Zod·route·엔진 무변경.
- 신규 prop(선택): §2-2 (B)안 채택 시 `CurrencyInput.id?` — 컴포넌트 자체 확장, optional 기본 미설정이라 기존 호출처 영향 0. (A안 채택 시 신규 prop 0.)
- ⚠️ **variant 최상위 testid 보존**: `estate-body-variant-realestate-${item.id}`(77) 등 — RTL 테스트 셀렉터 의존, 마크업 변경해도 유지.

---

## 4. 회귀 위험 / 테스트 (실측)

라벨·placeholder 의존 테스트가 깨질 수 있으므로 **문자열 전부 보존**이 1차 방어. 추가 점검:

| 파일 | 의존 | 조치 |
|---|---|---|
| `e2e/inheritance-collateral-debt.spec.ts` | 저당채권액·임대보증금 라벨/placeholder | 라벨 문자열 보존 시 통과 예상 — 실행 확인 |
| `e2e/inheritance-notice-year.spec.ts` | 기준시가 연도·공시가격 조회 | StandardPriceInput 내부 구조 보존 — 실행 확인 |
| `__tests__/inheritance/estate-card-variant-split.test.tsx` | variant 렌더 구조(RTL) | 마크업 변경으로 깨질 가능성 — 갱신 대상 |
| `e2e/estate-card-chip-advanced-sync.spec.ts` 등 | financial 카드 진입 | 본문 구조 무관(칩) — 영향 없음 예상 |

- `getByLabel` 셀렉터 (정정): CurrencyInput `hideLabel`이 input `aria-label={label}`을 보존(122). §2-2 (A)안에서 **FieldCard `htmlFor`가 undefined → FieldCard `<label>`은 input과 미연결**(접근성 트리에서 라벨로 미인식) → `getByLabel("시가 …")`는 **input aria-label 1개만 매칭, 중복 없음**. (B)안(id 신설)에서는 label↔input 연결 + aria-label 둘 다 동일 텍스트라 RTL이 하나로 합산 → 역시 단일 매칭. **두 안 모두 getByLabel 안전**.
- placeholder("없으면 빈칸" 등) 셀렉터: CurrencyInput placeholder 보존.
- ⚠️ 구현 전 `estate-card-variant-split.test.tsx`·`inheritance-collateral-debt.spec.ts`의 **실제 셀렉터 방식(getByLabel/getByText/placeholder/testid)을 grep으로 확인**한 뒤 보존 전략 확정.

---

## 5. 800줄 정책
- `EstateBodyRealEstate.tsx` 280 → FieldCard 래핑으로 약 +60~100줄 예상(≤ 400). 800 이하 유지. 초과 시 섹션 wrapper·필드 그룹을 sub-component로 추출.

---

## 6. 검증 게이트
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/inheritance/estate-card-variant-split.test.tsx` (갱신 후) 통과
- [ ] 전체 `npm test` 회귀 0
- [ ] e2e `inheritance-collateral-debt` · `inheritance-notice-year` 통과 (라벨/placeholder·StandardPriceInput 동작)
- [ ] **브라우저 확인(필수)**: 부동산·예금·현금/금융/기타 카드 본문이 FieldCard 좌-라벨/섹션 카드로 렌더, StandardPriceInput 연도 드롭다운·조회 버튼 정렬·동작, 모바일 위-라벨 폴백 — [[feedback_browser_verify_with_playwright]] e2e 캡처
- [ ] `ui-engine-sync-checker` (엔진 변경 0 형식 점검)

---

## 7. 작업 순서 (제안) *(정정 — hideLabel 신설 단계 삭제)*
0. 회귀 테스트 셀렉터 grep 확인(§4 마지막 항목) + §2-2 (A: htmlFor 생략 / B: CurrencyInput `id?` 신설) 결정.
1. 공용 `EstateBodySection`(sky 섹션 카드+헤더, props: title·subtitle·children) 추출 — 3 variant 공유.
2. `EstateBodySimple` 전환(가장 단순) → 패턴 검증 → `EstateBodyDeposit` → `EstateBodyRealEstate`(AddressSearch 어업 분기·StandardPriceInput 정렬·§14 토글 제외 포함, 최대 난도).
3. `estate-card-variant-split.test.tsx` 갱신 + tsc + vitest 대상 → 전체 `npm test` → e2e 회귀(`inheritance-collateral-debt`·`inheritance-notice-year`) + 신규 e2e(FieldCard 렌더·StandardPriceInput 정렬·모바일 폴백).

> ⚠️ StandardPriceInput `hideLabel` 신설 단계는 **삭제**됨 — 이미 `label=""`로 호출 중([오류2]).
