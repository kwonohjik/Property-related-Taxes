# 증여세 — 수증자 주민등록번호 입력으로 미성년 자동판정 (Plan)

> 상태: Plan 초안 (실측 file:line 동결 · 추정 금지 정책 적용)
> 작성일: 2026-06-22
> 세목: 증여세(gift) · 단계: 1단계 "증여 정보"
> 관련 법령: 민법 §4(성년 19세) · 상증법 §57①(미성년자 세대생략 40% 할증 — 미성년·증여재산가액 20억 초과 시 100분의 40, 단서: 최근친 직계비속 사망 시 배제. KoreanLaw MST 276123 본문 검증) · 상증법 §57②(할증과세액 계산방법 등 대통령령 위임) · 상증법 §53(직계존속 증여재산공제 — 미성년 수증자 2천만 vs 성년 5천만, donorRelation 전환의 두 번째 실체 효과)

## 1. 목적 / 한 줄 요약

현재 1단계 "증여 정보"에서 **수증자 미성년 여부를 수동 토글**(`isMinorDonee`)로 받는다.
이를 **수증자 주민등록번호 입력 → 증여일 기준 만 19세 미만 자동판정**으로 바꾼다.
주민번호 체계 검증(체크섬)은 생략하고, 앞 7자리에서 생년월일만 도출한다.

## 2. 사용자 확정 결정 (2026-06-22)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| D-1 | 주민번호 입력 ↔ 수동 토글 관계 | **주민번호 우선 + 수동 fallback** | 상속세 `HeirEditor` 패턴과 동일 → 일관성·코드 재사용. 파싱 실패/미입력 시 기존 수동 토글 노출 |
| D-2 | 직계존속 증여 시 주민번호 필수 차단 여부 | **선택 입력 (차단 없음)** | 미입력 시 기존처럼 `false` default. 차단 validation 미추가 → 전 세목 E2E 회귀 영향 없음(memory `feedback_blocking_validation_full_e2e_regression` 회피) |

## 3. 현황 실측 (file:line 동결)

현재 `isMinorDonee` 흐름 — Explore 실측:

| 지점 | 위치 | 내용 |
|---|---|---|
| ① 폼 상태 | `components/calc/gift-tax-form-shared.tsx:56` | `isMinorDonee: boolean;` (FormState) |
| ② initial | `components/calc/gift-tax-form-shared.tsx:119` | `isMinorDonee: false,` (INITIAL_FORM) |
| ④ API 변환 | `lib/calc/gift-api.ts:85,96` | `isMinorDonee: form.isMinorDonee` pass-through (buildGiftTaxInput) |
| ⑤ UI 위젯 | `components/calc/gift-tax-form-shared.tsx:605-621` | `ToggleCard` — 증여자가 `father`/`mother`/`grandparent`일 때만 노출 |
| ⑧ validate | `components/calc/gift-tax-form-shared.tsx:258 validateStep(step:0)` | **`lib/calc/gift-validate.ts` 존재하지 않음** — gift 단계 검증은 `validateStep` 인라인(:259-264). 현 step0 검증부는 `isMinorDonee` 미참조. D-2(선택 입력·차단 없음)이므로 isMinorDonee/주민번호 차단 추가 불필요 |
| ⑦ 결과 | `lib/tax-engine/gift-tax.ts:249-250` | §57① 40% 할증 시 `GIFT_LAW.SURCHARGE_MINOR_OVER_2B`(= "상증법 §57 ① 본문 · 단서") 노출. §57②는 계산방법 위임 조항(엔진 미노출) |
| ⑨⑫ Zod | `lib/validators/property-valuation-input.ts:511` | `isMinorDonee: z.boolean()` (giftTaxInputSchema) |
| ⑬ body | `app/api/calc/gift/route.ts:48,64` | `giftTaxInputSchema.safeParse(body)` |
| ⑭ 엔진 | `lib/tax-engine/gift-tax.ts:237-251` | `calcGiftGenerationSkipSurchargeWithLimit(..., input.isMinorDonee, ...)` — 미성년 AND `grossGiftValue > 2,000,000,000` → 40% |
| 엔진 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:593-594` | `isMinorDonee: boolean` |
| 증여일 | `components/calc/gift-tax-form-shared.tsx:540-551` | `giftDate` (DateInput, "YYYY-MM-DD") — **미성년 판정 기준일** |
| 관계 도출 | `lib/calc/prior-gift-donee-derive.ts:101-119` | `deriveDonorRelation(donor, isMinorDonee)` → `lineal_ascendant_minor` ↔ `lineal_ascendant_adult`. 호출 전수(grep 동결): buildGiftTaxInput **`gift-api.ts:47`·`gift-api.ts:85`**(2곳 — 일반·특례 스트림) · form-shared `donor` onChange set(:524) · `isMinorDonee` 토글 set(:567). resolveIsMinorDonee 전환 시 :47·:85 **둘 다** 일괄 정합 필수(누락 시 같은 form 2값 분기) |

> 미사용(설계상): ③ normalize(특별 로직 없음, pass-through) · ⑥ 사이드바(gift 미사용) · ⑪ 자산-수준(gift는 form-global) · ⑩ superRefine(isMinorDonee 직접 영향 없음)

## 4. 재사용 자산 (상속세에 이미 구현)

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| 주민번호 파싱 | `lib/calc/resident-number.ts` `parseResidentNumber(raw)` → `{ birthDate, gender } \| null` | 앞 7자리만 파싱·체크섬 검증 없음 → **D 요구(검증 생략)와 정확히 일치**. 그대로 호출 |
| 미성년 판정 패턴 | `components/calc/HeirEditor.tsx:256-267` `autoIsMinor` (`differenceInYears(기준일, 생년월일) < 19`) | 동일 로직을 증여세 헬퍼로 이식 (HeirEditor 자체는 미변경 — surgical) |
| 날짜 라이브러리 | `date-fns` `differenceInYears` | 만 나이 계산 |

## 5. 설계

### 5.1 핵심 원칙 — 주민번호는 클라이언트 전용, 엔진 미전송

- 주민번호 → 미성년 여부(boolean) 환원은 **클라이언트에서만** 수행.
- API/Zod/Route/엔진에는 **기존 `isMinorDonee`(boolean)만** 전달 → **⑨~⑭ 무변경**.
- 효과:
  - 민감정보(주민번호)가 서버에 도달하지 않음 (개인정보 노출면 최소화).
  - 엔진·Zod 스키마·Route 핸들러 변경 0 → 회귀면 최소.
  - 14지점 중 **클라이언트 측만** 영향.

### 5.2 단일 진실 헬퍼 (single-source) — `resolveIsMinorDonee`

신규 헬퍼 파일 `lib/calc/gift-donee-minor.ts`:

```ts
import { parseResidentNumber } from "./resident-number";
import { differenceInYears } from "date-fns";

/** 주민번호+기준일에서 미성년(만 19세 미만) 자동판정. 판정 불가 시 null. */
export function computeAutoMinor(
  residentNumber: string | undefined,
  baseDate: string | undefined,
): boolean | null {
  const parsed = parseResidentNumber(residentNumber ?? "");
  if (!parsed || !baseDate) return null;
  const base = new Date(baseDate);
  const birth = new Date(parsed.birthDate);
  if (isNaN(base.getTime()) || isNaN(birth.getTime())) return null;
  return differenceInYears(base, birth) < 19; // 민법 §4 성년 19세
}

/** 미성년 단일 진실: 주민번호 자동판정 우선, 불가 시 수동 토글 fallback (D-1). */
export function resolveIsMinorDonee(form: {
  doneeResidentNumber?: string;
  giftDate?: string;
  isMinorDonee: boolean;
}): boolean {
  const auto = computeAutoMinor(form.doneeResidentNumber, form.giftDate);
  return auto ?? form.isMinorDonee;
}
```

- **3중 패턴 강제**(memory `mirror-pattern`): 이 `resolveIsMinorDonee`를 **UI 표시·API 변환·validate 3곳에서 동일 호출** → fallback 일치.
- **useEffect → store 미러링 금지**(memory `feedback_useeffect_store_mirror_forbidden`): 자동판정 결과를 store `isMinorDonee`에 쓰지 않는다. store의 `isMinorDonee`는 **수동 fallback 값**으로만 유지. 자동판정은 항상 derive(useMemo/헬퍼).

### 5.3 신규 store 필드

- `doneeResidentNumber?: string` 추가 (① 폼 상태 optional / ② initial `""`). **Do 환류**: 기존 신규 FormState 필드(`donorPaysGiftTax?` 등) optional 패턴과 일관 + 직접 FormState 리터럴 fixture 무수정(surgical). 전달부는 `form.doneeResidentNumber ?? ""`.
- sessionStorage/IndexedDB 폼 복원에는 포함(로컬 only). **API 변환(④)에는 미포함** → 서버 미전송.

### 5.4 UI 거동 (⑤ — 직계존속 증여 시에만, 기존 노출 조건 유지)

```
[수증자 주민등록번호]  (선택)  ← 신규 text input (inputMode=numeric, onFocus select)
   ↓ parseResidentNumber 성공 + giftDate 있음
   ├─ 자동판정 성공 → 미성년 여부 배지(읽기전용) 표시
   │    "생년월일 2010-05-01 · 증여일 기준 만 15세 → 미성년자 (§57① 40% 할증 대상 — 20억 초과 시)"
   │    수동 ToggleCard 숨김
   └─ 파싱 실패 / 미입력 → 기존 수동 ToggleCard 노출 (fallback, D-1)
```

- 자동/수동 모두 `resolveIsMinorDonee` 결과로 `donorRelation` 재도출 일관성 유지(5.5).
- 주민번호 input은 `onChange`에서 `set({ doneeResidentNumber })`만 (cross-field set 없음 → 미러링 회피). 미성년 여부·배지·donorRelation은 useMemo로 derive.

### 5.5 `donorRelation` 재도출 일관성

현재 `donorRelation`은 `donor`/`isMinorDonee` onChange 시 store에 직접 set된다(set 호출 `:524`·`:567`). 자동판정 도입 후 주민번호 변경 시에도 미성년 여부가 바뀌므로 store.donorRelation이 stale해질 수 있다. **단, `donorRelation`/`isMinorDonee`의 진짜 소비처를 실측해 처리 방침을 정한다.**

> **실측 — `form.donorRelation`/`form.isMinorDonee` 소비처 (grep 동결 2026-06-22)**:
> | 소비처 | 위치 | read 방식 |
> |---|---|---|
> | ④ buildGiftTaxInput | `gift-api.ts:47`·`:85`(donorRelation)·`:96`(isMinorDonee) | `form.donor`/`form.isMinorDonee`에서 **자체 derive** — store.donorRelation **미read** |
> | ④' 부담부증여 양도세 | `gift-burdened-transfer-api.ts:117`·`:119` | `form.donorRelation`·`form.isMinorDonee` **store 직접 read** |
> | ④'' 동시증여 seed | `GiftCreditChecklist.tsx:308` | `form.donorRelation` **store 직접 read** |
> | UI 칩 가시성 | isLinealAscendantDonor 경유 §53의2 칩 | minor/adult 모두 true → 무영향 |

- **결론(확정 — 채택안 A, engine 설계 일치)**: store `donorRelation` 직접 set(:524·:567)은 **유지한다**. 이유: ④'·④''가 `form.donorRelation`을 store에서 직접 읽으므로 set을 제거하면 INITIAL `lineal_ascendant_adult`로 stale 고정 → 부담부증여·동시증여 seed가 자동판정을 반영 못함(같은 2값 분기 재발·Surgical 위반). 대신 **엔진 전송 경로 전부(④ `:47`·`:85`·`:96`, ④' `:117`·`:119`, ④'' `:308`)를 `resolveIsMinorDonee(form)` 기반 derive로 통일**하여 단일 진실을 헬퍼 레벨에서 확보한다.
- buildGiftTaxInput은 store.donorRelation을 **읽지 않고**(실측) `form.isMinorDonee`에서 derive하므로, store↔API 분기는 **헬퍼 단일 호출로 차단**된다. store.donorRelation은 더 이상 단일 진실이 아니라 "수동 fallback·표시용"으로만 의미를 가진다(엔진 전송값은 항상 헬퍼 derive). onChange set 유지는 `feedback_useeffect_store_mirror_forbidden`와 무관(useEffect 미러링 아님).
- Do 단계에서 `form.donorRelation`·`form.isMinorDonee` 직접 read를 grep로 전수 확정(④ `:47`·`:85`·`:96` · ④' `:117`·`:119` · ④'' `:308`)하여 **전부** `resolveIsMinorDonee(form)` 기준으로 일괄 전환. **A-8·A-9·A-12 anchor로 어긋남 검증(§8).**
- **§53 공제 영향(두 번째 실체 효과)**: donorRelation이 `lineal_ascendant_minor`↔`lineal_ascendant_adult`로 전환되면 §57 할증뿐 아니라 **상증법 §53 증여재산공제**도 바뀐다 — `lib/tax-engine/deductions/gift-deductions.ts:38` `lineal_ascendant_minor: 20_000_000`(미성년 2천만) vs `lineal_ascendant_adult: 50_000_000`(성년 5천만). 즉 자동판정이 공제액 차등을 일으키므로 A-8 anchor에서 공제액 변화도 검증한다(§8·§7).

## 6. 14 동기화 지점 영향 매트릭스

| # | 지점 | 변경 | 내용 |
|---|---|---|---|
| ① 폼 상태 | ✅ | `doneeResidentNumber: string` 추가 |
| ② initial | ✅ | `doneeResidentNumber: ""` |
| ③ normalize | ✅(경미) | 복원 pass-through(또는 `.trim()`). 자동 안분 fallback 아님 |
| ④ API 변환 | ✅ | buildGiftTaxInput 3곳 — `:47`·`:85`(`donorRelation`)·**`:96`(`isMinorDonee`)** 모두 `resolveIsMinorDonee(form)` 기준. **:96 누락 시 §57 40% 미발동**(엔진이 `input.isMinorDonee`를 §53 공제와 독립으로 직접 read). 부담부증여 ④'(`gift-burdened-transfer-api.ts:117`·`:119`)·동시증여 seed ④''(`GiftCreditChecklist.tsx:308`)도 동일 derive 전환. 주민번호 자체 미전송. §53 공제(미성년 2천만/성년 5천만)에도 영향 |
| ⑤ UI 위젯 | ✅ | 주민번호 input + 자동 배지 + 수동 토글 fallback. **onChange(:524·:567) store `donorRelation` set 유지**(채택안 A — 부담부증여·동시증여 seed stale 회피). 엔진 전송값은 ④·④'·④''가 `resolveIsMinorDonee` derive로 단일화(§5.5) |
| ⑥ 사이드바 | N/A | gift 미사용 |
| ⑦ 결과 카드 | ✅(검증만) | `isMinorDonee` 값 동일 경로 → §57 할증 표시 변화 없음. **§53 공제액 변화(미성년 2천만/성년 5천만) 결과 표시 여부 확인**. 주민번호 결과/PDF **노출 금지** 확인 |
| ⑧ validate | ✅(검증만·no-op) | 위치: `gift-tax-form-shared.tsx:258 validateStep(step=0)` (**`lib/calc/gift-validate.ts` 부재** — gift 검증은 validateStep 인라인). D-2(선택 입력·차단 없음) → step0 validate에 isMinorDonee/주민번호 차단 추가 안 함. UI 통과↔validate 모순 없음(memory `feedback_validation_sync_8th_point`) |
| ⑨ Zod enum | ❌ | 무변경 |
| ⑩ superRefine | ❌ | 무변경 |
| ⑪ 자산-수준 | N/A | gift form-global |
| ⑫ Zod 입력 객체 | ❌ | 무변경 (주민번호 미전송) |
| ⑬ body spread | ❌ | 무변경 |
| ⑭ Route 엔진 input | ❌ | 무변경 |

> ⑨~⑭ 무변경이 본 설계의 핵심 안전장치.

## 7. 케이스 매트릭스 (자동판정 경계)

증여일 = 2026-02-09 기준 (스크린샷 값):

| 케이스 | 주민번호(앞7) | 생년월일 | 만 나이 | 자동판정 | 비고 |
|---|---|---|---|---|---|
| M-1 미성년(여유) | 100501-3 | 2010-05-01 | 15 | true | 일반 미성년 |
| M-2 성년(여유) | 050101-3 | 2005-01-01 | 21 | false | 일반 성년 |
| M-3 경계 생일 전날 | 070210-3 | 2007-02-10 | 18 | **true** | 만 19세 생일 1일 전 |
| M-4 경계 생일 당일 | 070209-3 | 2007-02-09 | 19 | **false** | 만 19세 도달 당일 = 성년 |
| M-5 1900년대 코드 | 991231-2 | 1999-12-31 | 26 | false | 세기코드 1/2 |
| M-6 파싱 실패 | "abc" | — | — | null→**수동 fallback** | D-1 |
| M-7 미입력 | "" | — | — | null→**수동 fallback** | D-2 default false |
| M-8 증여일 미입력 | 100501-3 | 2010-05-01 | — | null→수동 fallback | giftDate 없으면 판정 불가 |

> **§53 공제 차등(실체 효과 2)**: 미성년 판정(M-1·M-3 등 true)은 donorRelation을 `lineal_ascendant_minor`로 전환하여 §57 할증뿐 아니라 **상증법 §53 증여재산공제도 5천만→2천만으로 변경**한다(`gift-deductions.ts:38`). A-8 anchor에서 공제액 변화 검증.

## 8. Pre-Do anchor 시나리오 (헬퍼 단위 — Do 진입 전 우선 실증)

`__tests__/calc/gift-donee-minor.test.ts` (신규):

- A-1: `computeAutoMinor("1005013...", "2026-02-09")` → `true` (M-1)
- A-2: `computeAutoMinor("0501013...", "2026-02-09")` → `false` (M-2)
- A-3: `computeAutoMinor("0702103...", "2026-02-09")` → `true` (M-3 경계 생일 전날)
- A-4: `computeAutoMinor("0702093...", "2026-02-09")` → `false` (M-4 경계 당일)
- A-5: `computeAutoMinor("abc", "2026-02-09")` → `null`; `resolveIsMinorDonee({ doneeResidentNumber:"abc", giftDate:"2026-02-09", isMinorDonee:true })` → `true` (수동 fallback)
- A-6: `resolveIsMinorDonee({ doneeResidentNumber:"", giftDate:"2026-02-09", isMinorDonee:false })` → `false` (M-7)
- A-7: `computeAutoMinor("1005013...", undefined)` → `null` (M-8)
- A-8(통합·buildGiftTaxInput): 주민번호(미성년)+직계존속 → `isMinorDonee:true` AND `donorRelation:"lineal_ascendant_minor"` 동기화 확인. **`gift-api.ts:47`·`:85`·`:96` 세 경로 모두** 동일 derive 검증(한쪽 누락 시 분기). 미성년 판정 시 §53 공제 **2천만원** 적용(성년 5천만이 아님) 검증 — `gift-deductions.ts:38`
- A-9(onChange→API 경로): 주민번호 자동판정 모드(수동 토글 숨김·`form.isMinorDonee=false`)에서 buildGiftTaxInput가 `isMinorDonee:true`·`donorRelation:"lineal_ascendant_minor"`를 derive함을 확인 → store↔API 2값 분기(§5.5) 차단 검증
- A-11(§57 40% 결과값): grandparent + 증여재산가액 **20억 초과** + 자동판정 미성년 → `calculateGiftTax` 결과 `generationSkipSurchargeDetail.surchargeRate === 0.4` 확인. **A-8/A-9는 input 필드 동치만 확인**하므로, 엔진이 `isMinorDonee`(=`:96`)를 §53과 독립으로 §57 할증함수에 전달(`gift-tax.ts:237`·특례 `:631`, `inheritance-gift-common.ts:181`·`:294-296` `isMinorDonee && >20억 ? 0.4 : 0.3`)하는 경로를 **결과로** 검증 → 설계 목표 #1(주민번호→배지→§57 40%) 직접 보증
- A-12(부담부증여 통합·④'): `buildGiftBurdenedTransferBody`(자동판정 미성년)에 직계존속 → 반환 `burdenedGiftInfo.donorRelation === "lineal_ascendant_minor"` AND `isMinorDonee === true` (store 수동값 false 무관) 확인. 반환 타입 `Record<string, unknown>`이므로 anchor는 타입 단언 후 접근

> A-3/A-4 경계(만 19세 정의)는 `pre-do-anchor-verification`로 **가장 먼저** 실증. `differenceInYears` 거동이 "생일 당일=성년"임을 확정한 뒤 나머지 일괄. A-11(§57 결과)·A-12(부담부증여)는 :96 누락·소비처 누락 회귀를 차단하는 핵심 anchor.

## 9. 정책 정합 체크 (사전 적용)

- [x] useEffect→store 미러링 금지 → 자동판정은 derive only (5.2)
- [x] 3중 fallback 일치(UI·API·validate) → `resolveIsMinorDonee` 단일 헬퍼 (5.2)
- [x] 자동 안분 fallback 금지 → 본 건은 "미입력 시 수동값" 명시 fallback, 침묵 자동채움 아님
- [x] 차단 validation 미추가(D-2) → 전 세목 E2E 회귀 영향 없음
- [x] 결과/PDF 내부 민감정보 노출 금지 → 주민번호 결과·PDF 미출력 (⑦)
- [x] 포커스 시 전체 선택(`onFocus={(e)=>e.target.select()}`) — text input
- [x] UI 순서 = 로직 순서 → 주민번호 input은 미성년 토글 위치(영향 필드 직전)
- [ ] **확인 필요**: 상증법 §57① "미성년자" 판정 기준일이 증여일(증여재산 취득일)인지 KoreanLaw로 최종 확인 (현재 기준일=giftDate 가정). 만 19세 미만=민법 §4는 확정. (§57①: 미성년·20억 초과 40% 본문 + 단서. §57②는 계산방법 위임 — KoreanLaw MST 276123 검증 완료)

## 10. 작업 순서 (Do)

1. `lib/calc/gift-donee-minor.ts` 신규 — `computeAutoMinor`·`resolveIsMinorDonee` → verify: Pre-Do anchor A-1~A-7 통과
2. ① `doneeResidentNumber` FormState + ② INITIAL_FORM `""` → verify: tsc
3. ④ `gift-api.ts` buildGiftTaxInput — `donorRelation`(`:47`·`:85`)·`isMinorDonee`(`:96`) **3곳 모두** `resolveIsMinorDonee` 기준 → verify: A-8·A-11 통과
4. ④' ④'' 소비처 전환 — 부담부증여 `gift-burdened-transfer-api.ts:117`·`:119` + 동시증여 seed `GiftCreditChecklist.tsx:308`을 `resolveIsMinorDonee(form)` derive로 → verify: A-12 통과
5. ⑤ UI — 주민번호 input + 자동 배지 + 토글 fallback (form-shared Step0). **onChange store set(:524·:567)은 유지**(채택안 A). **ToggleCard title `gift-tax-form-shared.tsx:561` `§57 ②`→`§57 ①` 정정**(코드 상수 `GIFT_LAW.SURCHARGE_MINOR_OVER_2B`="상증법 §57 ① 본문·단서"와 통일 — §57②는 계산방법 위임 조항. 자동 배지·fallback 토글 모두 §57① 단일 인용) → verify: 렌더·tsc·A-9 재확인
6. ⑧ validate — `validateStep(step=0)` (`gift-tax-form-shared.tsx:258`, **`gift-validate.ts` 부재**). D-2 → 차단 추가 없음(검증만·no-op) → verify: validateStep step0 무변경 확인
7. ⑦ 결과/PDF 주민번호 미노출 확인(grep) → verify: 출력 경로 점검
8. E2E — `e2e/gift-*.spec.ts`에 주민번호 입력→자동 미성년 배지→§57① 40% 결과 1건 추가 → verify: spec green
9. 회귀 — `npx vitest run __tests__/tax-engine/gift/` + 전체 `npm test` → verify: 0 회귀
10. 9단계 코드 품질 게이트(`/code-review`) → 커밋

## 11. Definition of Done

- [ ] Pre-Do anchor A-1~A-8 통과 (특히 A-3/A-4 만 19세 경계)
- [ ] 14지점: 클라이언트 ①②③④⑤⑦⑧ 동기화 · ⑨~⑭ 무변경 grep 확인
- [ ] `isMinorDonee` ↔ `donorRelation` 자동/수동 모두 정합 (A-8)
- [ ] 주민번호 서버 미전송(④ 미포함)·결과/PDF 미노출 확인
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run` gift 통과 / 전체 `npm test` 회귀 0
- [ ] gift E2E 신규 1건 + 기존 gift E2E green
- [ ] `/code-review` High/Medium 0

## 12. SCOPE OUT / 리스크

- **SCOPE OUT**: 주민번호 체크섬 검증(사용자 명시 생략) · 외국인등록번호 별도 처리 · 주민번호 암호화 저장(로컬 sessionStorage 평문 — 기존 상속세 HeirEditor와 동일 수준).
- **공유 추출 보류(surgical)**: 상속세 `HeirEditor.autoIsMinor`와 본 `computeAutoMinor`는 로직이 유사하나 통합 추출은 범위 밖 → 향후 `isMinorAt(birthDate, baseDate)` 공용화 후보로 메모만.
- **리스크**: `donorRelation` derive 전환 시 기존 store 의존 코드 누락 → A-8 통합 anchor로 차단.

## 13. 다음 수순

`plan-design-self-review-loop` 스킬(엔진·UI 설계 생성 + 13단계 자가검증) → `pre-do-anchor-verification`(A-3/A-4 경계 우선) → `single-response-do-execution`.
