# 상속세 잔여 갭(5a·4·3) — UI 설계

> 엔진 설계: `inheritance-gaps.engine.design.md` · 계획: `docs/00-pm/inheritance-gaps.plan.md`.
> 공용 규칙: `components/calc/CLAUDE.md`(ToggleCard/RadioCardGroup 필수·native checkbox/radio 신규 금지·8지점).

## Context

- **갭5a**: 공익법인 출연 입력(`ExemptionChecklist`)에 동족주식 한도 유형·주식수를 받아 초과분 자동계산. 현재는 사용자가 초과분 금액을 손계산해 입력 → 미입력 시 과소과세.
- **갭4**: `EstateItemEditor`에 물납 충당순위 분류 플래그(거주주택·국채/처분제한상장) 입력 → `PaymentInKindCard` 충당순서·한도 자동 정확화.
- **갭3**: 영농 사후관리 안내(이미 존재) 링크에 `deathDate`·`filingDeadline` 추가 prefill (trivial).

---

## 갭5a — 공익법인 동족주식 한도 입력 (`components/calc/exemption/ExemptionChecklist.tsx`)

### 위젯 (공익법인 출연 항목 선택 시 펼침 — `inh_public_interest`)

```
┌─ ⑤ 공익법인 출연 재산 (§16① 과세가액 불산입) ─────────── violet ─┐
│ 출연재산 가액(claimedAmount)         [ 1,000,000,000 ]            │
│                                                                  │
│ ▸ 내국법인 주식 출연 시 동족주식 한도 (§16②)   [ToggleCard ON]   │
│   공익법인 유형 (RadioCardGroup, layout=stack):                  │
│    ◉ 일반 공익법인 (한도 10%)                                     │
│    ○ 자선·장학·사회복지 + 의결권 미행사 (20%)  §16②2호 가목       │
│    ○ 상호출자제한기업집단 특수관계 (5%)        §16②2호 나목       │
│    ○ §48⑪ 요건 미충족 (5%)                     §16②2호 다목       │
│   발행주식총수등(자기주식 제외) [ 100,000 ] 주                    │
│   출연 주식수                   [  15,000 ] 주                    │
│   출연 당시 기보유분(§16②1호)   [       0 ] 주                    │
│   1주당 평가액                  [  10,000 ] 원                    │
│   ─ 자동계산 ─ 한도 10,000주 · 초과 5,000주                       │
│      → 과세가액 산입 50,000,000원 (한도 내 950,000,000 불산입)    │
└──────────────────────────────────────────────────────────────────┘
```

- 토글 OFF(주식 아닌 일반 재산 출연) 시 한도 블록 숨김 → 전액 불산입.
- 토글 ON + 4필드 입력 → `computeRelatedStockExcess` 실시간 미리보기(useMemo, 엔진 헬퍼 직접 import — `single-source-engine-helper`). UI 자체 재구현 금지.
- 주식수(주)는 정수 — `CurrencyInput`(콤마·`parseAmount`) 사용하되 `hideUnit` + FieldCard `unit="주"`로 "원" 오표기 방지(`DecimalInput` 아님 — 소수 불요). 주당평가액=`CurrencyInput`(원).
- tone: violet(자격·평가 정보). RadioCardGroup 미선택 옵션도 tone 유지.

### testid

`pi-type-radio` · `pi-total-shares` · `pi-donated-shares` · `pi-prior-held` · `pi-value-per-share` · `pi-excess-preview`.

---

## 갭4 — 물납 충당순위 분류 플래그 (`components/calc/EstateItemEditor.tsx`)

### 위젯 (자산 종류별 조건부)

```
부동산(real_estate_*) 자산 편집 시:
  ▸ 물납 분류 (선택)                              [ToggleCard, sky]
    ☑ 상속인 거주 주택·부수토지 (물납 충당 최후순위 §74②6호)
       → isHeirResidenceProperty

금융·기타(financial/other) 채권 자산:        [RadioCardGroup, sky]
    ○ 해당 없음   ○ 국채·공채 (충당순위 1) → "government_bond"

상장주식(listed_stock) 자산:                   [RadioCardGroup, sky]
    ○ 해당 없음   ○ 처분제한 상장유가증권 (순위 2) → "restricted_listed"
```

- 부동산 = `isHeirResidenceProperty` 토글(ToggleCard). 비부동산엔 미표시.
- 유가증권 = `paymentInKindSecurityType` 라디오. 카테고리별 적정 옵션만 노출(채권=국채·공채, 상장주식=처분제한상장). 비상장주식(충당순위5)·부동산엔 미표시.
- 미선택=undefined(미설정) → 엔진 0 유지 + 물납 카드 경고(자동 안분 금지, `feedback_no_silent_apportion_fallback`).

### 결과 반영 (`PaymentInKindCard.tsx` — 변경 최소)

`derivePaymentInKindAssets`가 플래그를 읽어 자동 채움 → 충당순서 표(`data.fillOrder`)의 1·2·6번 금액이 "—"에서 실값으로. 카드 JSX 변경 없음(엔진 도출만 수정). #12 결정에 따라 충당순위 3(국내부동산) 표시값도 조정.

### testid

`estate-heir-residence-toggle` · `estate-pi-security-radio`.

---

## 갭3 — 영농 사후관리 prefill 강화 (`components/calc/results/InheritanceTaxResultView.tsx:430`)

```diff
- href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}`}
+ href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}`
+   + (deathDate ? `&deathDate=${deathDate}&filingDeadline=${calcInheritanceFilingDeadline(deathDate)}` : "")}
```
- `deathDate`는 컴포넌트 prop(line 67)에 이미 존재 — 신규 echo 불필요(실측).
- 시뮬레이터(`app/calc/inheritance-postmgmt/page.tsx`)에서 `useSearchParams`로 `deathDate`·`filingDeadline` 수신 → `filingDeadline` state 초기화. (가업 시뮬레이터 패턴 동형)
- (선택 P3-b) 시뮬레이터 native `<details>`(`:293`)→`ExpandToggleButton`, native checkbox(`:222`)→`ToggleCard`(컨벤션 정합).

---

## 8지점 동기화 (UI 측)

| # | 갭5a | 갭4 | 갭3 |
|---|---|---|---|
| ① 폼 | ExemptionChecklist state | EstateItemEditor state | N/A(링크만) |
| ② initial | undefined | undefined | — |
| ③ normalize | 마이그레이션 호환 | 〃 | — |
| ④ API | `inheritance-exemption-checklist.ts` | `inheritance-api.ts` | — |
| ⑤ 위젯 | 유형 라디오+주식수(本문서) | 토글/라디오(本문서) | 링크 href |
| ⑥ 사이드바 | N/A | N/A | — |
| ⑦ 결과 | breakdown lawRef §16① | PaymentInKindCard 자동 | 안내 카드(기존) |
| ⑧ validation | `inheritance-validate-exemption.ts` 자동 fallback 금지 | 미설정=0+경고 | — |

---

## E2E (`e2e/inheritance-gaps.spec.ts`)

1. **갭5a**: 공익법인 출연 + 주식 한도 토글 ON + 발행10만·출연1.5만·일반10% → 미리보기 "초과 5,000주·50,000,000" 표시 + 계산 결과 과세가액에 +50,000,000.
2. **갭4**: 부동산 자산에 거주주택 토글 ON → 결과 물납 카드 충당순서 6번에 금액 표시(전 "—").
3. **갭3**: `farmingDeduction>0` 결과 → 영농 안내 링크 href에 `deathDate=`·`filingDeadline=` 포함.

E2E 함정(memory): 자산 모달 backdrop 닫기·중첩 Dialog selector·worktree `E2E_PORT=3102`.
