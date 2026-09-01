# §165⑤ 간이 모드 — 순손익액·순자산가액에서 1주당 가치 자동 산정

- 제보 2026-09-01 (이미지 17·18)
- 검증 깊이: **L2** — 신규 필드 9개 · UI 신설. **세액 산식 무변경**(계산 결과를 기존 4필드에 mirror)
- 상태: **✅ 구현 완료 (2026-09-01)**

---

## 1. 요구

간이(simple) 모드의 「상장연도 비상장 보충적 평가」·「취득연도 비상장 보충적 평가」 블록에서
지금은 **1주당 가치 2개를 결과값 그대로** 받는다. 사용자가 그 앞단부터 넣을 수 있게 한다:

```
첫 행 : 순손익액 + 주식수      →  1주당 순손익가치 자동 산정
둘째 행: 순자산가액 + 영업권    →  1주당 순자산가치 자동 산정 (첫 행의 주식수 공용)
```

상장연도·취득연도 **두 축 모두** 같은 방식.

---

## 2. 인터뷰 결정 (2026-09-01)

| # | 쟁점 | 결정 | 근거·영향 |
|---|---|---|---|
| **Q-1** | 새 입력 방식을 어디에 두는가 | **간이 모드 안에 하위 토글** | 기존 「결과값 직접 입력」 경로가 그대로 남아 **회귀 0**이고 E2E 8곳도 무사하다. 모드를 교체하면 외부에서 보충적 평가를 마친 사용자가 역산해야 하고, 4번째 모드는 `unlistedDetailMode` enum(⑫ Zod·③ normalize·엔진 분기)을 전부 넓혀야 한다 |
| **Q-2** | 주식수를 순손익·순자산이 공유하는가 | **한 연도에 1개 공유** | 제보 이미지 그대로. §165④**4호** 「제1호나목을 적용하는 경우 "발행주식총수"는 … **직전 사업연도 종료일 현재**의 발행주식총수에 따른다」와도 정합. ⚠️ 완전재현 모드는 순손익·순자산이 **각자** `shareCount`를 갖는다 — 두 모드가 이 점에서 다르다는 것을 코드 주석에 남긴다 |
| **Q-3** | 환원율을 화면에 노출하는가 | **10% 고정 · 산식에만 표기** | 소득세법 시행규칙 §81② → 상증칙 §17 「연간 100분의 10」. 입력칸을 만들면 필드 2개와 값 검증(0·과대치)이 늘어난다. 완전재현 모드에는 이미 환원율 입력이 있으므로 예외 케이스는 그쪽으로 유도한다 |
| **Q-4** | 영업권을 순자산가액에 포함해 받는가, 따로 받는가 | **따로 받는다** (2026-09-01) | 완전재현 모드가 이미 **행 18 = 영업권포함전순자산가액 / 행 19 = 영업권**으로 나눠 받는다(`PostListingNetAssetStatement.tsx:15-16·170`). 저장소 전역이 「영업권 포함 전」이라는 같은 표현을 쓴다(`UnlistedStockSimpleFields.tsx:186·523·545`). 합쳐 받으면 두 모드의 입력 의미가 갈려 값 대조가 불가능해진다 |

---

## 3. 산식 — 기존 엔진 헬퍼를 그대로 쓴다

`lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts`에 **이미 정확히 이 산식이 있다**.
새로 구현하지 않고 위임한다(memory `feedback_sibling_path_already_implements_rule` ·
`single-source-engine-helper`).

```
calcNetIncomePerShare(year)                       // H-02
  netIncomeAmount = Σ addA − Σ subB
  perShareIncome  = floor(netIncomeAmount / shareCount)
  perShareValue   = floor(perShareIncome / discountRate)      ← discountRate 기본 0.10

calcNetAssetPerShare(year)                        // H-03
  netAssetAmount = assetSubtotal − liabSubtotal + goodwillRow19
  perShareAsset  = floor(netAssetAmount / shareCount)
```

간이 모드는 결산서 배열이 없으므로 **집계값 1개를 배열에 담아 호출**한다:

```ts
calcNetIncomePerShare({ addA: [순손익액], subB: [], shareCount, discountRate: 0.10 })
calcNetAssetPerShare({ assetTotalRow1: 영업권포함전순자산가액, assetAdd: [], assetSub: [],
                       liabTotalRow8: 0, liabAdd: [], liabSub: [],
                       goodwillRow19: 영업권, shareCount })
```

⇒ **floor 시점·순서가 완전재현 모드와 동일**하다. 별도 산식을 세우면 1원 단위로 갈린다.

### 예시 (Q-2 미리보기 값)

```
순손익액 500,000,000 · 주식수 10,000
  1주당 순손익액   = floor(500,000,000 / 10,000) = 50,000
  1주당 순손익가치 = floor(50,000 / 0.10)        = 500,000

순자산가액(영업권 포함 전) 48,000,000 · 영업권 2,000,000 (주식수 공용)
  순자산가액       = 48,000,000 + 2,000,000     = 50,000,000
  1주당 순자산가치 = floor(50,000,000 / 10,000)  = 5,000
```

> 영업권이 없으면 **빈칸으로 둔다**(0으로 처리). 완전재현 모드의 「19. 영업권 (해당 시)」과
> 같은 취급이다.

**80% 하한(§165④1 단서)·가중평균(3:2 / 부동산과다 2:3)은 엔진이 이미 처리한다 — 손대지 않는다.**

---

## 4. 데이터 설계

### 신규 폼 필드 9개

| 필드 | 용도 |
|---|---|
| `simpleValueInputMode: "direct" \| "amounts"` | 하위 토글 (기본 `"direct"` — 3중 패턴 기존 동작 보존) |
| `listingYearNetIncomeAmount` | 상장일 직전 사업연도 순손익액 |
| `listingYearShareCount` | 상장일 직전 사업연도 종료일 현재 발행주식총수 |
| `listingYearNetAssetAmount` | 상장일 직전 사업연도 **영업권 포함 전** 순자산가액 |
| `listingYearGoodwill` | 상장일 직전 사업연도 영업권 (해당 시 · 빈칸 = 0) |
| `acquisitionYear…` 4개 | 취득일 축 동일 |

### 계산 결과는 **기존 4필드에 mirror**

`listingYearNetIncomePerShare` · `listingYearNetAssetPerShare` ·
`acquisitionYearNetIncomePerShare` · `acquisitionYearNetAssetPerShare`

⇒ **④ API 변환·⑫ Zod·⑭ Route·엔진 입력이 전부 무변경**이다. 세액 경로를 건드리지 않는 것이
이 설계의 핵심 이점이다.

> ⛔ `useEffect → store` 미러링 금지(정책 · 무한 루프). onChange 핸들러에서 **직접** 계산해
> 한 patch에 실어 보낸다.

### 🔴 다중키 patch — stale spread 함정

주식수 하나가 바뀌면 **순손익가치·순자산가치가 함께** 바뀐다. 단일-키 updater를 연속 호출하면
먼저 세팅한 값이 stale 스냅샷에 덮여 되돌아간다(memory `feedback_multikey_patch_stale_spread_overwrite`
— PR #804 §99의3에서 실제로 발생).

```ts
// ❌ 금지
onChange({ listingYearShareCount: v });
onChange({ listingYearNetIncomePerShare: ni });

// ✅ 단일 배치 — 그리고 «들어온 값 v»로 계산한다 (form의 옛 값 아님)
onChange({
  listingYearShareCount: v,
  listingYearNetIncomePerShare: String(niFrom(form.listingYearNetIncomeAmount, v)),
  listingYearNetAssetPerShare:  String(naFrom(form.listingYearNetAssetAmount,  v)),
});
```

세 입력(순손익액·주식수·순자산가액) **각각의 onChange가 자기 값과 나머지 둘의 현재값으로
2개 파생값을 다시 계산**해 한 patch로 보낸다.

---

## 5. 14 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① | 폼 타입 | `calc-wizard-stock-form.ts` — 7필드 추가 |
| ② | initial | 동상 — 전부 `""`, `simpleValueInputMode: "direct"` |
| ③ | normalize | `calc-wizard-stock-normalize.ts` — `strField` 8 + `enumField("simpleValueInputMode", ["direct","amounts"], "direct")` |
| ④ | API 변환 | **무변경** (mirror) |
| ⑤ | UI 위젯 | `PostListingValuationCard.tsx` — 하위 토글 + 두 블록 재구성 |
| ⑥ | 사이드바 | 무변경 (1주당 가치는 합계 대상 아님) |
| ⑦ | 결과 카드 | 무변경 (기존 4값이 그대로 흐른다) |
| ⑧ | **validation** | `stock-transfer-tax-validate-step2.ts` — **`amounts` 모드에서는 원천 3필드를 검사**하고 파생 4필드 필수검사는 면제 |
| ⑨~⑭ | API/Route | **무변경** |

### ⑧이 이 작업의 유일한 함정이다

지금 validate는 simple 모드에서 **파생 4필드**를 필수로 본다. `amounts` 모드로 두고 원천값만
넣었는데 파생 계산이 실패(주식수 0 등)하면 **입력칸은 다 찼는데 차단**되는 모순이 생긴다.
반대로 원천 검사를 안 넣으면 **빈 값으로 통과**한다.

⇒ 모드별로 갈라 쓴다. 기존 `transferStdInputMode`의 direct/daily 분기가 **이미 같은 형태**이니
그 구조를 따른다(`validate-step2.ts:302-330`).

> ⚠️ 이 저장소에서 「UI 통과 ↔ validate 차단」 모순은 반복 발생한 결함이다
> (memory `feedback_ui_gate_removes_sole_input_path` · `feedback_validation_sync_8th_point`).

---

## 6. UI 명세

```
┌ 환산 입력 방식 ────────────────────────────┐
│ ◉ 간이 (결과값 4개 직접 입력)               │
│ ○ 부분 재현  ○ 완전 재현                   │
└────────────────────────────────────────┘
  └ 값 입력 방식            ← 신규 RadioCardGroup (tone="amber", layout="inline")
     ◉ 결과값 직접 입력      (현행)
     ○ 순손익액·순자산가액에서 계산

┌ 상장연도 비상장 보충적 평가 ──────────────┐   ← amounts 모드
│ 순손익액 [            ] 주식수 [       ]  │
│   → 1주당 순손익가치  500,000 원          │   ← 읽기 전용 산출 표시
│ 순자산가액(영업권 포함 전) [           ]   │
│ 영업권 (해당 시)          [           ]   │
│   → 1주당 순자산가치    5,000 원          │
└────────────────────────────────────────┘
(취득연도 블록 동일)
```

- 산출 표시는 **읽기 전용**이다. 값이 필요하면 「결과값 직접 입력」으로 전환한다
  (두 경로가 같은 필드를 쓰므로 전환해도 값이 남는다).
- 산식은 한국어 풀어쓰기 + `Frac`/`FLine` 표준(`formula-display-builder` 스킬).
  `floor()`·변수 약어 노출 금지.
- 금액 칸은 `CurrencyInput`, 주식수는 **`DecimalInput`이 아니라 `CurrencyInput`**
  (주식수는 정수·콤마 표기가 자연스럽다. 소수 주식수는 이 축에 없다).
- **라벨 문구는 저장소 관용을 따른다** — 「순자산가액 (영업권 포함 전)」·「영업권 (해당 시)」.
  완전재현 모드(`PostListingNetAssetStatement.tsx:170` 「19. 영업권 (해당 시)」)와
  `UnlistedStockSimpleFields.tsx:523` 「… (회사 전체, 영업권 포함 전)」이 같은 표현을 쓴다.
  ⇒ 새 표현을 만들지 않는다.
- **hint 줄은 넣지 않는다** — 라벨이 이미 「직전 사업연도」를 말하고, 사용자가 중복 hint 제거를
  명시적으로 요청했다(2026-09-01, PR #1382).

---

## 7. 작업 순서 · 검증 기준

```
1. 폼 필드 7개 (①②③)
   → verify: npx tsc --noEmit 0건 · 기존 폼 anchor 회귀 0

2. 계산 헬퍼 위임 래퍼 (UI 전용, lib 아님 — 단일 사용)
   → verify: 유닛 anchor — 500,000,000/10,000 → 500,000 · (48,000,000+2,000,000)/10,000 → 5,000
   → verify: 영업권 빈칸 = 0으로 처리되어 48,000,000/10,000 → 4,800
   → verify: 완전재현 모드와 **같은 값**이 나오는지 대조 (floor 시점 동일성)

3. UI — 하위 토글 + 두 블록 (⑤)
   → verify: RTL anchor — amounts 모드에서 3입력 → 파생 2값 표시 + 기존 4필드에 mirror

4. 다중키 patch 회귀 anchor  ← 이 작업의 최대 함정
   → verify: 주식수만 바꿔도 **순손익가치·순자산가치가 둘 다** 갱신된다
   → 뮤테이션: patch에서 순자산 키를 빼면 이 anchor만 적색이어야 한다

5. validation (⑧)
   → verify: amounts 모드 — 원천 **3필드**(순손익액·주식수·순자산가액) 미입력 시 차단 / 입력 시 통과
   → verify: **영업권은 필수가 아니다** — 빈칸이어도 통과한다 (해당 없는 법인이 다수)
   → verify: direct 모드 — 종전과 동일하게 파생 4필드 검사 (회귀 가드)
   → 뮤테이션: 모드 분기를 제거하면 «UI 통과인데 차단» 케이스가 적색이어야 한다

6. 전체 회귀 + E2E
   → verify: npm test 전건 · E2E 키움·§165⑤ 계열 전건
```

**성공 기준**: 4·5의 뮤테이션이 각각 과녁만 적색 · 회귀 0 · tsc 0건.

---

## 8. V-n 레지스터

| ID | 항목 | 영향 | 상태 |
|---|---|---|---|
| **V-1** | 입력받는 「순자산가액」이 영업권을 포함한 값인가 | 필드 개수·라벨이 갈린다 | ✅ **해소 (2026-09-01 사용자 결정)** — **영업권을 별도로 받는다.** 완전재현 모드의 행 18/19 구조와 일치시킨다. 필드 7 → **9개** |
| **V-2** | 「순손익액」이 직전 **1개 사업연도**의 값인가(상증법의 3년 가중평균이 아님) | §165④1 가목은 「직전 사업연도의 1주당 순손익액」으로 **단년**이라 읽힌다. 완전재현 모드도 단년 결산서를 받는다 ⇒ 단년으로 본다 | ✅ 조문·기존 구현 일치로 해소 |
| **V-3** | 주식수가 **0 또는 미입력**일 때의 표시 | 헬퍼가 `perShareValue: 0`을 돌려준다. 0을 그대로 mirror하면 「입력했는데 0원」이 되어 validate가 애매해진다 ⇒ **0이면 mirror하지 않고 빈 문자열**로 두고 validate가 차단한다(자동 fallback 금지 정책) | ✅ 설계로 확정 |

> **V-n 전건 해소 — 착수 가능.**
>
> ⚠️ 영업권 행은 §165④1**나목** 문언(「직전 사업연도 종료일 현재 해당 법인의 **장부가액** ÷
> 발행주식총수」)에서 직접 나오지 않는다. 완전재현 모드가 따르는 **상증령 §55 순자산가액**
> 구조(자산 − 부채 + 영업권)에서 온 것이고, 그 구현은 사례 48 PDF 재현으로 검증돼 있다.
> **이 작업은 그 기존 구조를 그대로 노출할 뿐 해석을 바꾸지 않는다** — 산식을 다시 세우지 말 것.

---

## 9. 범위 밖

- 완전재현·부분재현 모드는 **손대지 않는다**.
- 환원율 입력이 필요하면 완전재현 모드를 쓴다.
- 자산·부채를 **행 단위로** 나눠 넣어야 하면 완전재현 모드를 쓴다 — 간이 모드는 소계 2개(영업권 포함 전 순자산가액·영업권)까지만 받는다.
- 80% 하한·가중평균 비율은 엔진 소관 — 이 작업의 대상이 아니다.


---

## 10. ✅ 구현 결과 (2026-09-01)

### 산출물

| 파일 | 내용 |
|---|---|
| `lib/calc/post-listing-amount-derive.ts` (신규) | 엔진 헬퍼 위임 — 산식 재구현 0 |
| `components/calc/stock-transfer/PostListingAmountInputSection.tsx` (신규) | 한 축 블록. **두 축이 같은 컴포넌트를 두 번 쓴다** — 복사하면 다중키 patch 로직이 두 벌이 되어 한쪽만 어긋난다 |
| `PostListingValuationCard.tsx` | 하위 토글 + 분기 배선 (334 → 395줄, 정책 800 이내) |
| `calc-wizard-stock-form.ts` · `-normalize.ts` | 신규 9필드 (①②③) |
| `stock-transfer-tax-validate-step2.ts` | 모드 분기 (⑧) |

**④ API·⑫ Zod·⑭ Route·엔진은 예정대로 무변경** — 계산 결과를 기존 4필드로 mirror하기 때문.

### 커밋 전 품질 검토에서 잡은 것 2건

1. **`patchWithDerived`의 타입이 너무 넓었다.** `Partial<Record<keyof AmountAxisKeys, string>>`은
   파생키(`netIncomePerShare` 등)도 받아들여, 호출부가 실수로 넘기면 **방금 계산한 값을 덮어쓴다**.
   ⇒ 원천 4키만 받는 `RawKey`로 좁혀 **타입으로 막았다**.
2. **결손 법인이 이 모드를 쓸 수 없었다.** 순손익액에 `allowNegative`가 없어 `-`가 제거됐다.
   엔진 `calcNetIncomePerShare`는 음수를 임의로 0으로 바꾸지 않는데(AD-7) UI가 막고 있었다.
   ⇒ 순손익액·순자산가액(자본잠식)에 `allowNegative` 추가. 영업권은 상증령 §59② 상 음수가
   될 수 없어 제외, 주식수도 제외.
   📌 **완전재현 모드도 같은 제약이 있다**(`PostListingNetIncomeStatement`에 `allowNegative` 없음).
      기존 결함이고 범위 밖이라 **손대지 않고 기록만** 한다.

### anchor 19건 · 뮤테이션 4건 전부 과녁만 적색

| probe | 무력화 | 적색 |
|---|---|---|
| P-H | 다중키 patch에서 순자산 키 제거 | 2,182건 중 **AM-3·4·5** 3건 |
| P-I | validate 모드 분기 제거 | 2,070건 중 **AV-2·5·6** 3건 |
| P-J | `allowNegative` 제거 | 59건 중 **AM-7** 1건 |
| (AD-5) | — | 완전재현 헬퍼와 값이 같은지 대조(뮤테이션 아님, 등가 고정) |

### 검증

`tsc` 0건 · `lint` 0 errors · `npm test` **1,718파일 18,423건 전건 통과** · E2E **12/12**.
