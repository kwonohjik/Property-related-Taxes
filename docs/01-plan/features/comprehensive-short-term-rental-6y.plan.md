# 종합부동산세 — 단기민간임대주택(6년형) 합산배제 구현 계획서

> 작성일: 2026-06-16 · 작업 worktree: `.claude/worktrees/comp-short-rental-6y` · 브랜치: `feat/comp-short-rental-6y`
> 분기 기준: `origin/master` (HEAD `0f594d76`, PR #215 머지본) · slot 2 (DEV 3002 / E2E 3102)

---

## 1. 개요

종합부동산세 주택분 **합산배제 임대주택**에 「민간임대주택에 관한 특별법」 §2⑥의2 **단기민간임대주택(임대의무기간 6년)** 유형을 추가한다. 현재 엔진은 6종 임대유형(건설·매입장기·매입단기구법·공공지원·공공건설·공공매입)만 지원하며, 단기민간임대(6년)는 `registrationType` enum에 대응 값이 없어 합산배제 신청 자체가 불가능하다.

**근거 (코드 실측):**
- `lib/tax-engine/comprehensive-exclusion.ts:32` — `※ 단기민간임대주택(§2⑥의2, 6년·§3①10·11호)은 현재 registrationType enum에 대응 유형이 없어 미포함(후속 확장).`
- `lib/tax-engine/legal-codes/comprehensive.ts:290` — `MANDATORY_PERIOD_SHORT_TERM_6Y: 6` 상수만 정의, 어느 유형에도 매핑 안 됨.

---

## 2. 법령 근거 (KoreanLaw MCP 검증 — 종합부동산세법 시행령, 시행 2026-02-27 현행본)

`get_law_text(mst=283639, jo=제3조)` 원문 대조 완료. 단기민간임대주택은 §3①에 **10호(건설)·11호(매입)** 두 호로 규정된다.

### 2.1 §3①10호 — 건설 단기민간임대주택
> 건설임대주택 중 「민간임대주택에 관한 특별법」 제2조제6호의2에 따른 단기민간임대주택으로서 다음 각 목의 요건을 모두 갖춘 주택이 **2호 이상**인 경우 그 주택

| 목 | 요건 | 값 |
|---|---|---|
| 가 | 전용면적 + 공시가격 | **149㎡ 이하** AND 공시가격 **6억원 이하** (임대개시일 또는 최초 합산배제신고 연도 과세기준일 기준) |
| 나 | 의무임대기간 | **6년 이상** 계속 임대 |
| 다 | 임대료 증가율 | 5%(100분의 5) 초과 금지 |

### 2.2 §3①11호 — 매입 단기민간임대주택
> 매입임대주택 중 「민간임대주택에 관한 특별법」 제2조제6호의2에 따른 단기민간임대주택으로서 가목1)부터 3)까지의 요건을 모두 갖춘 주택. **다만, 나목1) 및 2)에 해당하는 주택은 제외.**

| 목 | 요건 | 값 |
|---|---|---|
| 가1) | 공시가격 | **수도권 4억원 / 비수도권 2억원 이하** (비조정지역·아파트 제외). 일반 매입(6억/3억)과 **다른 별도 금액** — 한국세정신문·세무해설 확인 |
| 가2) | 의무임대기간 | **6년 이상** 계속 임대 |
| 가3) | 임대료 증가율 | 5% 초과 금지 |
| 나1) | 제외 | 1세대가 1주택 이상 보유 중 세대원이 **조정대상지역**에서 신규취득한 단기민간임대 |
| 나2) | 제외 | 법인이 조정대상지역 공고 후 사업자등록 신청한 단기민간임대 |

### 2.3 부수 규정 (사후관리·기간계산)
- **§3⑤**: §3①1·6·7·**10호** 임대주택 수는 같은 특별시·광역시·도별로 합산 계산 (10호 = 건설, 2호 이상 호수기준).
- **§3⑦1호**: 임대기간 기산 — **10호나목**은 2호 이상 임대개시일부터, **11호가목2)**는 해당 주택 임대개시일부터.
- **§3⑦5호**: 부득이한 사유(수용·분양전환·천재지변) 시 10호나목·11호가목2)도 계속임대 간주.
- **§3⑧**: 임대료 증가율 요건(10호다목·11호가목3)) 위반 시 **해당 연도 포함 연속 2개 과세연도까지** 합산배제 제외(추징).

> ✅ **§3①11호가목1) 가격기준 확정**: **수도권 4억원 / 비수도권 2억원 이하** + 비조정지역 소재 + 아파트 제외. 일반 매입임대(§3①2·8호, 6억/3억)와 **다른 별도 금액**이므로 신규 상수 필수(기존 `RENTAL_PRICE_*` 재사용 금지).
> 출처: 한국세정신문(taxtimes.co.kr) 2025 종부세 개정 해설 + 세무해설 2건 일치 / 건설 10호 6억은 KoreanLaw 본문과 교차 일치.
> ⚠️ 단, 매입 4억/2억은 **2차 소스 확인** — 1차 텍스트 소스(KoreanLaw·lawnb·yeslaw)가 §3①2·8·11호 가격 표를 일관되게 누락하는 도구 한계 때문. **Do 1순위로 법령 표 원문(국세청 별지서식·별표 또는 law.go.kr) 최종 대조** 후 상수 확정.

---

## 3. 현황 — 변경 전 코드 구조 (실측 file:line)

### 3.1 두 개의 enum (1:1 대응)
- **`ExclusionType`** (`types/comprehensive.types.ts:49-63`) — 주택 합산배제 "유형"(UI 선택·store·Zod `property.exclusionType`). 임대 6종 + 기타 7종 + `none`.
- **`RentalExclusionInput["registrationType"]`** (`types/comprehensive.types.ts:69-75`) — `rentalInfo` 내부 "임대등록 유형". 임대 6종.
- 매핑: `toRegistrationType()` (`lib/calc/comprehensive-api.ts:152-162`)가 `ExclusionType` → `registrationType` 변환.
- **⚠️ UI 이중 선택 구조 (실측)**: 사용자가 ① `PropertyListInput.tsx:35 EXCLUSION_TYPE_OPTIONS`에서 `exclusionType`을 고르고(임대/기타/none 분기용), ② 임대면 `ExclusionInfoInput.tsx:27 RENTAL_REG_TYPE_OPTIONS`에서 `rentalRegistrationType`을 **또** 고른다. 엔진 판정의 실제 등록유형은 **`rentalRegistrationType`**(store:34, 초기값 `private_purchase_long`로 항상 존재)이며, API(`comprehensive-api.ts:240`)는 `p.rentalRegistrationType || toRegistrationType(p.exclusionType)`로 rentalRegistrationType을 **우선** 사용. → 신규 단기 2종은 **두 옵션 배열 모두**에 추가해야 UI 선택 가능. area·location은 별도 공통 입력(`PropertyListInput.tsx:423·453`)으로 RentalExclusionDetail에는 면적·수도권 입력이 없음.

### 3.2 엔진 판정 (`comprehensive-exclusion.ts`)
- `MANDATORY_PERIOD_BY_TYPE` (34-44) — registrationType별 의무기간(5/10). **단기 6년 미등록.**
- `validateRentalExclusion` (46-105) — 면적(`> AREA_LIMIT_NATIONAL_HOUSING=85` 차단, 55행)·가격(`getPriceLimit`)·임대료 5%·말소일·경과연수 경고.
- `getPriceLimit` (107-119) — `public_support`만 9억(metro)/3억, 그 외 6억(metro)/3억(`RENTAL_PRICE_METRO/NON_METRO`).
- `getRentalExclusionLegalCode` (121-132) — registrationType별 법령코드 상수.
- `rentalTypes` 배열 (215-222) — `applyAggregationExclusion`에서 rental/other 분기용 `ExclusionType[]`.

### 3.3 상수 (`legal-codes/comprehensive.ts`)
- `RENTAL_PRICE_METRO=6억`(264) / `RENTAL_PRICE_NON_METRO=3억`(266)
- `AREA_LIMIT_NATIONAL_HOUSING=85`(274) ⚠️ (4절 참조)
- `MANDATORY_PERIOD_SHORT_TERM_6Y=6`(290) — **정의됨, 미사용**
- `COMPREHENSIVE_EXCL.PRIVATE_*_RENTAL` 법령코드 문자열 (199-209)

---

## 4. ⚠️ 발견된 선결 이슈 — 면적기준 85㎡ 불일치 (범위 격리)

`validateRentalExclusion`은 **모든** 임대유형에 `area > 85㎡` 차단을 적용한다(`comprehensive-exclusion.ts:55`). 그러나 종부세령 §3은 건설형(1·7·10호) **149㎡**, 매입형(2·8·11호) **면적조건 없음**으로 규정한다. 즉 기존 85㎡ 일괄 적용은 법령과 불일치할 소지가 있다.

**판정·격리:**
- 이 불일치는 **기존 6종 유형의 numeric 결과에 영향**을 줄 수 있으므로(85㎡~149㎡ 주택의 합산배제 여부 반전), **본 작업에서 기존 유형은 건드리지 않는다**(회귀 위험 격리). → 별도 과제 `comprehensive-rental-area-limit-149` 로 분리 권고.
- **신규 단기 6년형은 법령대로 정확히** 적용: 건설(10호) 149㎡, 매입(11호) 면적조건 없음. 따라서 면적 한도를 **유형별로 분기**(`getAreaLimit(registrationType)` 헬퍼 신설)하여 신규 유형만 149㎡/무제한으로 처리하고, 기존 유형은 현행 85㎡ 유지(회귀 0).

> 메모리 정책 `feedback_numeric_impact_verify_before_bug_claim` 준수 — 기존 85㎡가 "버그"라 단정하지 않고, 신규 유형만 법령 정합 처리 + 별도 과제로 표면화.

---

## 5. 설계 결정

### 결정 1 — 건설/매입 분리 vs 통합 (★ 사용자 확인 필요)

| | 옵션 A (권장): 건설·매입 2종 분리 | 옵션 B: 단일 통합 |
|---|---|---|
| enum 추가 | `private_short_term_rental_6y_construction` (§3①10호) + `..._purchase` (§3①11호) | `private_short_term_rental_6y` 1종 |
| 법령 정합 | 높음 — 면적(건설149/매입무관)·가격·제외주택(11호나목) 분리 가능 | 낮음 — 건설/매입 차이 뭉개짐 |
| UI 옵션 | 2개 | 1개 |
| 작업량 | 약간 많음 | 적음 |

**권장: 옵션 A.** 법령 정확성 최우선 정책(`feedback_tax_calculation_principle`) + §3①10·11호의 면적·가격·제외주택 요건이 실제로 다름. 기존 코드도 건설(`private_construction`)/매입(`private_purchase_*`)을 분리해 둠 — 일관성.

### 결정 2 — §3①11호나목(조정대상지역 제외주택) 처리

매입 단기(11호)의 나목1)·2)(조정대상지역 1세대1주택+ 신규취득 / 법인) 제외 로직은 **본 작업 범위에서 제외(후속)**. 근거: 현행 엔진은 **장기 매입(§3①8호나목)의 동일 구조 제외주택도 미구현**이다(엔진에 조정대상지역·세대 보유현황 판정 부재). 단기만 제외주택을 넣으면 장기/단기 정합 깨짐. → 가격·면적·기간·임대료 요건만 정확히 구현하고, 제외주택은 **장기·단기 공통 후속 과제**로 기록. UI에 안내문(조정대상지역 신규취득·법인은 합산배제 제외 가능)으로 보완.

### 결정 3 — 가격기준 (확정)

- 건설(10호): **6억원, 수도권 구분 없음**(법령 본문 명시·KoreanLaw 확인). 신규 상수 `SHORT_TERM_6Y_PRICE_CONSTRUCTION=6억`.
- 매입(11호): **수도권 4억원 / 비수도권 2억원**(§2.2·2.3). 기존 `RENTAL_PRICE_METRO/NON_METRO`(6억/3억)와 **다름** → 신규 상수 `SHORT_TERM_6Y_PRICE_PURCHASE_METRO=4억`·`_NON_METRO=2억` 필수(기존 상수 재사용 금지). 2차 소스 확인 → Do 1순위 법령 표 최종 대조.

---

## 6. 변경 대상 — 동기화 지점별 작업 명세 (옵션 A 기준)

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | 타입 `ExclusionType` | `lib/tax-engine/types/comprehensive.types.ts:49` | `private_short_term_rental_6y_construction`·`..._purchase` 2종 추가 (주석: §3①10호/11호) |
| ① | 타입 `registrationType` | 동 `:69` | `private_short_term_6y_construction`·`..._purchase` 2종 추가 |
| E1 | 의무기간 맵 | `comprehensive-exclusion.ts:34` | 신규 2종 → `MANDATORY_PERIOD_SHORT_TERM_6Y`(6) |
| E2 | 면적 한도 분기 | 동 `:55` | `getAreaLimit(registrationType)` 신설 — 건설149/매입무한대, 기존 6종 85 유지 |
| E3 | 가격 한도 | 동 `getPriceLimit:107` | 건설 6년형 → 6억(location 무관); 매입 6년형 → 수도권 4억/비수도권 2억 분기 추가 |
| E4 | 법령코드 | 동 `getRentalExclusionLegalCode:121` | 신규 2 case → `COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_*` |
| E5 | rental 분기배열 | 동 `applyAggregationExclusion:215` | `rentalTypes`에 신규 `ExclusionType` 2종 추가 |
| C1 | 법령코드 상수 | `legal-codes/comprehensive.ts:199` | `PRIVATE_SHORT_TERM_RENTAL_6Y_CONSTRUCTION`(§3①10호)·`..._PURCHASE`(§3①11호) + `AREA_EXCEEDED_149`(건설 149㎡ 초과 — 기존 `AREA_EXCEEDED` 85㎡와 분리, 회귀 0) |
| C2 | 금액·면적 상수 | 동 `:264~290` | 신규: `SHORT_TERM_6Y_PRICE_CONSTRUCTION=6억`·`SHORT_TERM_6Y_PRICE_PURCHASE_METRO=4억`·`_NON_METRO=2억`·`SHORT_TERM_6Y_AREA=149`. 기간상수 290행(`MANDATORY_PERIOD_SHORT_TERM_6Y=6`) 재사용 |
| ④ | API 변환 `RENTAL_TYPES` | `lib/calc/comprehensive-api.ts:134` | 신규 `ExclusionType` 2종 추가 |
| ④ | `toRegistrationType` map | 동 `:152` | 신규 exclusionType → registrationType 매핑 2건 |
| ⑧/⑫ | Zod `exclusionTypeSchema` | `lib/validators/comprehensive-input.ts:14` | 신규 `ExclusionType` 2종 추가 |
| ⑧/⑫ | Zod `rentalRegistrationTypeSchema` | 동 `:35` | 신규 `registrationType` 2종 추가 |
| ⑤a | UI: exclusionType 드롭다운 | `PropertyListInput.tsx:35` `EXCLUSION_TYPE_OPTIONS` | 단기 2종(건설=§3①10호·매입=§3①11호) 옵션 추가, 라벨에 정확한 호수 |
| ⑤b | UI: rentalRegistrationType 드롭다운 + 안내 | `ExclusionInfoInput.tsx:27` `RENTAL_REG_TYPE_OPTIONS` · `:37` `RENTAL_EXCLUSION_TYPES` Set | 단기 2종 옵션 추가 + RentalExclusionDetail에 가격(건설6억/매입 수도권4억·비수도권2억)·면적(건설149㎡·매입 무관)·6년·임대료5%·아파트·조정지역 제외(결정2) 안내 hint. **area·location은 `PropertyListInput:423·453` 기존 입력 재사용**(신규 위젯 불요) |
| ⑦ | 결과뷰 | `ComprehensiveTaxResultView.tsx:129~177` 합산배제 섹션 | **변경 거의 없음** — 결과뷰는 excludedCount·금액·warnings만 표시, 유형 라벨 매핑 부재(실측). 신규 유형도 건수·금액 자동 반영. warnings(의무기간 6년) 메시지는 엔진 문자열 자동 |
| store | 폼 필드 | `lib/stores/comprehensive-wizard-store.ts` | `rentalRegistrationType` 옵션값만 확장(필드 신설 불필요 — 이미 존재) |

> ⑥ 사이드바 합계: 합산배제는 과세 제외이므로 사이드바 합계 영향 없음 — 변경 없음(확인만).

---

## 7. 케이스 매트릭스 (anchor 테스트 — `__tests__/tax-engine/comprehensive-exclusion-short-term-6y.test.ts` 신설)

| # | 시나리오 | registrationType | 면적 | 공시가격 | 경과/말소 | 기대 |
|---|---|---|---|---|---|---|
| 1 | 건설 단기 적격 | construction | 100㎡ | 5억 | 7년 | `isExcluded:true`, reason=§3①10호 |
| 2 | 건설 단기 가격초과 | construction | 100㎡ | **6.5억** | 7년 | `isExcluded:false`, PRICE_EXCEEDED |
| 3 | 건설 단기 면적초과 | construction | **150㎡** | 5억 | 7년 | `isExcluded:false`, AREA_EXCEEDED (149 경계) |
| 4 | 건설 단기 면적경계 | construction | **149㎡** | 5억 | 7년 | `isExcluded:true` (149 이하 OK) |
| 5 | 매입 단기 적격(수도권·대면적) | purchase·metro | **200㎡** | 3.5억 | 7년 | `isExcluded:true` (면적 무관 + 수도권 4억 이하), reason=§3①11호 |
| 5b | 매입 수도권 가격초과 | purchase·metro | 100㎡ | **4.5억** | 7년 | `isExcluded:false`, PRICE_EXCEEDED (수도권 4억 경계) |
| 5c | 매입 비수도권 경계 | purchase·non_metro | 100㎡ | **2억(경계)** | 7년 | `isExcluded:true` (비수도권 2억 이하) |
| 5d | 매입 비수도권 초과 | purchase·non_metro | 100㎡ | **2.5억** | 7년 | `isExcluded:false`, PRICE_EXCEEDED (비수도권 2억 초과) |
| 6 | 의무기간 경고 | construction | 100㎡ | 5억 | **4년 경과(말소X)** | `isExcluded:true` + warnings(6년 미충족) |
| 7 | 말소→거부 | construction | 100㎡ | 5억 | **말소일 ≤ 과세기준일** | `isExcluded:false`, MANDATORY_PERIOD_NOT_MET |
| 8 | 임대료 5%초과 | construction | 100㎡ | 5억 | 비최초·6%↑ | `isExcluded:false`, RENT_INCREASE_EXCEEDED |
| 9 | 회귀: 기존 6종 불변 | (각 기존유형) | 85㎡ | 기존 | — | 기존 anchor 값 무변경 (면적분기가 기존 85 유지 확인) |

> Pre-Do anchor 우선(`pre-do-anchor-verification`): 케이스 #1(건설 적격)·#3(149 경계)·#9(회귀)를 **Do 진입 전 먼저 작성·실행**하여 현행 실패(enum 부재 컴파일 에러) 확보 → 설계 환류.

---

## 8. 작업 순서 (PDCA Do — 시퀀셜)

1. **Pre-Do anchor**: §7 케이스 #1·#3·#9 테스트 선작성 → 실패 확인.
2. **§3①11호 매입 가격기준 법령 표 최종 대조** (국세청 별지서식·별표 또는 law.go.kr 원문) → 수도권 4억/비수도권 2억 1차 확정. 2차 소스값과 일치 확인 후 상수화(불일치 시 원문 우선).
3. **엔진·타입·상수** (①·C1·C2·E1~E5): 엔진 시니어 — `comprehensive-tax-senior` / `comprehensive-tax-exclusion-senior`.
4. **API·Zod** (④·⑧·⑫): 동기화.
5. **UI** (⑤·⑦·store): `comprehensive-tax-ui-senior` — 옵션·안내문·결과 라벨.
6. **테스트 전수**: `npx vitest run __tests__/tax-engine/comprehensive*` + 기존 회귀.
7. **Check**: `ui-engine-sync-checker`(8지점) + `bkit:gap-detector`(matchRate).
8. **E2E** (worktree): `E2E_PORT=3102 npx playwright test` 합산배제 경로 — 단기 6년형 선택→계산→결과.
9. `npx tsc --noEmit` 0건 + `npm test` 전체.

> CLAUDE.md 워크플로: 엔진+UI 시니어를 **Plan 단계부터 단일 메시지 병렬 호출**, Do는 시퀀셜(엔진 선처리 → UI).

---

## 9. 완료 기준 (Definition of Done)

- [ ] §3①11호 가격기준 법령 원문 확정 (추정값 코딩 0)
- [ ] enum 2종(ExclusionType·registrationType) 양쪽 추가 + 8지점(①④⑤⑥⑦⑧ + 엔진/상수/Zod) 동기화
- [ ] **침묵 위험 5곳 grep**(`rentalTypes`·`RENTAL_TYPES`·`toRegistrationType`·`RENTAL_REG_TYPE_OPTIONS`·`RENTAL_EXCLUSION_TYPES`) — `ExclusionType[]`/Set/리터럴이라 컴파일러 미감지, 누락 시 합산배제 침묵 미적용
- [ ] 면적 분기(`getAreaLimit`)로 신규=149/매입무관, **기존 6종=85 유지(회귀 0)**
- [ ] anchor 9케이스 통과 (특히 #9 기존 유형 무변경)
- [ ] `npx tsc --noEmit` 0건 · `npm test` 전체 통과
- [ ] E2E 합산배제 단기 6년형 경로 green (E2E_PORT=3102)
- [ ] `ui-engine-sync-checker` 누락 0 · gap matchRate ≥ 90%
- [ ] 브라우저 수동 확인(폼→계산→결과, Network 탭 `rentalInfo.registrationType` 신규값 확인) 또는 미수행 명시

## 10. 범위 밖 (후속 과제로 분리)

| 과제 | 사유 |
|---|---|
| §3①11호나목 조정대상지역 제외주택 + **아파트 제외** (매입 단기) / §3①8호나목 (장기 매입 공통) | 엔진에 조정대상지역·세대 보유현황·주택유형(아파트) 판정 부재 — 장기도 미구현. UI 안내문 보완, 자동판정은 별도 설계 |
| 기존 임대유형 면적기준 85㎡ → 149㎡/무관 정합 | 기존 numeric 결과 반전 위험 — 회귀 검증 동반 별도 과제 |
| ExclusionType 주석 호수 매핑 정정 (현재 §3①1·2·3·4·5호 표기 ↔ 법령 1·2·3·7·8호 불일치) | 표시·주석 정확성, 계산 무영향 |
