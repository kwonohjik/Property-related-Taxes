# 명의신탁주식 유상증자 증여의제 (§45의2) — 계산사례 재현 보완 작업계획서

> 대상: 첨부 세무교재 「명의신탁주식에 대한 유상증자시 증여재산가액 계산」 (이미지 28·29) 100% 재현
> 작성 기준: **추정 금지** — 모든 수치·인용은 실측(survey probe·KoreanLaw MCP 본문·file:line)으로 검증 후 단정. 미검증은 "확인 필요" 명시.
> 형제 계획: [`gift-inkind-contribution-39-3.plan.md`](./gift-inkind-contribution-39-3.plan.md) (§39의3 — 동일 gift-deemed 모듈·동일 14지점 컨벤션). 메모리 [[project_gift_deemed_transfer_plan]] · [[project_gift_inkind_contribution_39_3]].

---

## 0. 한 줄 요약 / 결론 먼저

§45의2 명의신탁 증여의제는 **이미 엔진·14지점에 배선되어 UI 카테고리로 노출**되어 있다(`nominee_trust`). 그러나 현행은 **단일 총액 `propertyValue` 하나만 받는다**(`nominee-trust.ts:11-34`, `types.ts:460-465`). 교재 이미지 28·29의 핵심 — **유상증자 신주의 증여재산가액 = 증여일(명의개서일) 현재 §63 평가 1주당 가액 × 명의신탁 신주 수**(희석효과 반영, 신주인수가액·이론적 권리락가 **미적용**) — 을 재현하는 **per-share 분해 모드**는 코드에 **0건**이다.

따라서 본 작업은 신규 카테고리 추가가 아니라, **기존 `nominee_trust` 엔진에 "유상증자 신주 평가" 분해 모드(3-state) 추가 + 결과뷰 산식·평가원칙 note + 14지점 동기화**다. 난이도는 중간 — 새 enum/카테고리·N-way 안분 없음, **단일 곱(`safeMultiply`) + optional 입력 + 결과 표시**가 본체.

> **★ `deemedGiftValue` 의미 고정 (의미 가변 금지)**
> | 모드 | 입력 | `deemedGiftValue` |
> |---|---|---|
> | `total` (현행·기본) | `propertyValue` 직접 | = `propertyValue` (적용 시) / 0 |
> | `per_share` (신규) | `perSharePrice` × `nomineeShares` | = `safeMultiply(perSharePrice, nomineeShares)` (적용 시) / 0 |
>
> 두 모드 모두 적용 게이트는 **`hasTaxAvoidancePurpose && !isExcluded && 도출가액 > 0`** (현행 `nominee-trust.ts:14` 불변). per_share 모드는 propertyValue 를 곱으로 **도출**할 뿐 게이트·결과 의미는 동일.

핵심 동결값(이미지 29 병): **15,000 × 18,375 = 275,625,000**.

---

## 1. 배경 — 교재 이미지 28·29가 말하는 것

### 이미지 28 — 평가 원칙 (조심 2013중3297, 2014.2.21.)
명의신탁 주식에 **유상증자** 시, 유상증자액(인수가액)을 증여가액으로 삼는 것이 아니라 **증여일 현재 시가**로 증여가액을 계산한다. 증자마다 명의신탁 주식을 평가하면서 **유상증자에 따른 희석효과를 반영**하여 증여재산가액을 산정한 것이 정당하다.

### 이미지 29 — 계산사례 (비상장·중소기업, A법인 = 갑 특수관계)
| 항목 | 값 |
|---|---|
| 증자전 1주당 평가액 | 20,000 (평가기준일 2015.10.31.) |
| 신주 발행 | 140,000주, 1주당 인수가액 5,000(액면) |
| 증자후 1주당 가액(이론적 권리락) | 13,000 |
| **신주 명의개서일 현재 §63 평가액** | **15,000** (가정 — 희석효과 등 반영) |

사실관계: 병에게 배정된 신주는 **갑이 주금납입**. 병의 기존 주식 21,000주는 **갑이 명의신탁**(증여세 **제척기간 만료**). 균등증자(병 지분율 교재표기 13.13% 불변; 신주 18,375 = 140,000 × **13.125%**)라 주주간 이익분여 없음(**§39 불균등증자 증여 미적용**).

해설 ㈏ 명의신탁 증여의제:
> 실질주주는 갑이나 병에게 배정한 신주는 명의신탁 증여의제 과세대상. 1주당 가액은 **신주인수가액(5,000)이나 이론적 권리락 증자후 가액(13,000)이 아니라 신주 명의개서일 현재 상증법 평가액(15,000)**을 적용.
> **병의 증여의제 이익 = 15,000 × 18,375주 = 275,625,000**

> **무엇이 헷갈릴 수 있나 / 해소**:
> - "왜 15,000인가?" → 20,000(증자전)도, 5,000(인수가)도, 13,000(이론 권리락)도 아닌 **명의개서일 §63 평가액**. 비상장이라 §63①1나목 보충적 평가액이며, 유상증자로 자본유입·주식수증가가 반영된 결과 15,000(교재 가정값). **엔진은 이 평가액을 산정하지 않고 입력으로 받는다**(§39의3 계획과 동일 SCOPE-OUT — §60·§63 평가는 caller 주입).
> - "병 기존 21,000주는?" → 제척기간 만료로 재과세 불가. **신규 배정 신주 18,375주만 새 증여의제**(조심2019서2129 "새로운 주식 명의신탁 행위"). → 입력 신주수 = 18,375 (기존분 제외).
> - "§39와 §45의2 관계?" → 독립. 균등증자라 §39 미발동, 명의신탁이라 §45의2 발동. 본 계획은 **§45의2 신주분만** 다룬다.

---

## 2. 현행 상태 — 실측 (4-front survey 검증)

### 2-1. 배선 완비 (nominee_trust 14지점 present) — 단, 모두 단일 총액 기준

| 지점 | 위치 (file:line) | 상태 |
|---|---|---|
| ① 폼 필드 | `deemed-form-state.ts:231-234` (`ntPropertyValue`/`ntTaxAvoidance`/`ntExcluded`) | present (3필드) |
| ② initial | `deemed-form-state.ts:434-436` (`""`/`true`/`false`) | present |
| ③ UI 위젯 | `presumption-forms.tsx:48-76` (`NomineeTrustFields`) | present |
| ④ API 변환 | `gift-deemed-api.ts:358-364` (case `nominee_trust`) | present |
| ⑤ 결과 뷰 | `DeemedGiftResultView.tsx:306+` 공통 경로(breakdown map `:343-356`) | present (전용 섹션 없음) |
| ⑥ 사이드바 합계 | **N/A 확정** — deemed-gift는 사이드바·`compute*Summary` 부재. `DeemedGiftCalculator.tsx`(153줄)는 모달 플로우(RadioCardGroup → `DeemedDetailModal` → `DeemedGiftResultView`), `deemed-summary-card`(라벨·법령·증여일 echo만, 금액합계 없음) | N/A |
| ⑧ Validation | `gift-deemed-validate.ts:183-185` (`ntPropertyValue <= 0` 차단) | present |
| ⑨/⑫ Zod | `gift-deemed-input.ts:247-252` (`nomineeTrustSchema`, discriminatedUnion 15번째 `:360`) | present |
| ⑬ callAPI body | `buildDeemedGiftInput` 완전 객체 반환(`:358-364`) → spread strip 위험 없음 | present |
| ⑭ Route | `route.ts:63-66` 2-way dispatch (`capital_increase_allocation`만 별도 함수, **그 외 else 분기 `calcDeemedGift(data)`** ← nominee_trust 여기). Date 변환 불요(날짜필드 없음) | present |
| 엔진 | `nominee-trust.ts:11-34` (`calcNomineeTrustGift`) | present |
| 타입 | `types.ts:460-465` (`NomineeTrustInput`) + 판별유니온 `:655` | present |
| 라우터 | `router.ts:15·52-53` (`case "nominee_trust"`) | present |
| 법령상수 | `inheritance-gift.ts:153` (`GIFT.NOMINEE_TRUST = "상증법 §45의2"`) | present |
| 기존 anchor | `phase3-presumption-anchor.test.ts:39-56` (NT-1/2/3, 전액/0) | present |

> **함의**: 슬롯은 전부 있다. 하지만 **per-share(1주당평가 × 신주수) 분해 입력·계산·표시는 0건**. `NomineeTrustInput`에 주식수 필드 없음(`types.ts:462`만), `calcNomineeTrustGift`에 곱셈 없음(`:14-15`), 결과뷰에 nominee 전용 섹션 없음. 본 작업 = **per_share 모드 신규 + 표시 + 동기화**.

### 2-2. 엔진 현행 로직 (probe 검증)
`nominee-trust.ts:11-34`:
```ts
const { propertyValue, hasTaxAvoidancePurpose } = input;
const isExcluded = input.isExcluded === true;
const applied = hasTaxAvoidancePurpose && !isExcluded && propertyValue > 0;  // L14
const value = applied ? propertyValue : 0;                                   // L15
```
- 곱셈·주식수·`safeMultiply` 일체 없음. propertyValue 전액 echo 또는 0.
- per-share × shares 산식 선례: `contribution-in-kind.ts:43` `safeMultiply(perShareGain, allocatedShares)`(import은 `:3` `from "../tax-utils"`). 명의신탁은 "차액(이익)"이 아니라 **재산가액 전액**이므로 `safeMultiply(perSharePrice, nomineeShares)` 가 직접 대응.

### 2-3. 기존 anchor (회귀 자산 — total 모드)
`__tests__/tax-engine/gift-deemed/phase3-presumption-anchor.test.ts:39-56` describe `"§45의2 명의신탁 증여의제"`:
- [NT-1] `{ propertyValue: 500_000_000, hasTaxAvoidancePurpose: true }` → applied=true, deemedGiftValue=500,000,000
- [NT-2] `{ ..., hasTaxAvoidancePurpose: false }` → applied=false, 0
- [NT-3] `{ ..., hasTaxAvoidancePurpose: true, isExcluded: true }` → applied=false, 0

> **회귀 게이트**: NT-1/2/3 은 propertyValue total 경로 → **신규 optional per_share 필드 추가 시 불변 보장**(미사용 경로).

### 2-4. 증여세 본세 prefill 현행 (⑫ — 확인된 갭)
`buildGiftWizardPrefill`(`gift-deemed-api.ts:488-610`)에 **nominee_trust 전용 분기 없음**. generic fallback(`:599-609`)으로만 처리(아래는 동적 생성 결과 — 실제 코드는 `id: \`deemed-${result.type}\``·`name: \`${label} 증여이익\``, label=`DEEMED_TYPE_META[type].label`=`shared.tsx:73`):
```ts
giftItems: [{ id: "deemed-nominee_trust", category: "other", name: "명의신탁 증여의제 증여이익", marketValue: result.deemedGiftValue }]
```
- 수증자(=명의자)·증여자(=실제소유자)·`donorRelation` **미설정**. 합산배제·공제비적용 플래그 없음.
- → §45의2 당사자 구조(명의자=수증자 의제 / 실제소유자=납세의무자)와 **합산배제증여재산** 특성이 prefill에 반영 안 됨 (§7 Phase C·리스크 참조).

---

## 3. 법령 검증 결과 (KoreanLaw MCP 본문 직접 인용 — 추정 0)

상증법 MST **276123**(시행 20260102) · 국세기본법 MST **286425**(시행 20260602). 검증일 2026-06-25.

### 3-1. §45의2 증여의제 요건·시기 — [확정]
> §45의2① "권리의 이전이나 행사에 **등기등이 필요한 재산(토지·건물 제외)**의 **실제소유자와 명의자가 다른 경우** … **그 명의자로 등기등을 한 날** … 에 그 재산의 가액 … 을 **실제소유자가 명의자에게 증여한 것으로 본다.**"
- 주식 = 명의개서 필요재산 → 대상. **증여시기 = 명의개서일**(신주를 명의자 명의로 등기/명의개서한 날).
- §45의2③ "타인 명의 등기 시 **조세 회피 목적이 있는 것으로 추정**".
- 배제(① 단서): 1호 조세회피목적 없음 · 3호 신탁법 신탁등기 · 4호 비거주자 법정대리인.
- ⚠️ 명의개서 **미이행** 재산(실소유자가 취득 후 명의개서 안 함)은 시기가 "소유권취득일이 속하는 해의 다음 해 말일의 다음 날", 평가는 "소유권취득일 기준". **유상증자 신주를 직접 명의자 명의로 인수·명의개서한 본 사례는 본문(명의개서일)** 적용 — 교재와 일치. 미이행 케이스 타이밍은 **SCOPE-OUT**(§11).

### 3-2. ★ 납세의무자 vs 증여의제 수증자 — [확정]
| 구분 | 주체 | 근거 |
|---|---|---|
| 증여의제 **수증자**(증여받은 것으로 의제) | **명의자**(명의수탁자) = 병 | §45의2① |
| 증여세 **납세의무자**(실제 납부) | **실제소유자**(명의신탁자) = 갑 | §4의2② "§45조의2에 따라 증여한 것으로 보는 경우 … 실제소유자가 … 증여세를 납부할 의무가 있다" (2018.12.31 개정 후 현행) |
| 연대납세의무 | **구조적 비적용** (≠§4의2⑥ 단서) | §45의2는 §4의2②로 **실제소유자가 단독 납세의무자** → 수증자(명의자)에게 부과될 증여세가 없어 §4의2⑥(수증자 증여세를 증여자가 연대납부) 구조 자체가 성립 안 함. ⚠️ **§4의2⑥ 단서 목록에 §45의2는 없음** — 결과뷰 인용에서 §4의2⑥ 인용 금지, §4의2②만 인용 |
| 물적납세의무 | 명의신탁 재산으로 실소유자 증여세 징수 가능 | §4의2⑨ |

> ⚠️ **연도 분기**: 2018.12.31 개정 전(2019.1.1. 전 명의개서분)은 **명의자가 납세의무자 + 실제소유자 연대납세의무** 구조. 교재 사례(평가기준일 2015.10.31.)는 **구법 가능성** — 결과뷰는 "현행: 실제소유자 납세의무(§4의2②)" 라벨 + (필요 시) 구법 각주. 본 계산기는 **증여재산가액 산정**이 목적이라 납세의무자 분기는 결과값에 영향 없음(echo·note만).

### 3-3. 유상증자 신주 평가 = §60·§63 평가액 × 신주수 — [확정]
- §60①③: 증여일 현재 시가, 시가 곤란 시 §61~§65 보충적 평가.
- §63①1호: 가목 상장(전후 2개월 종가평균) / **나목 비상장 = 보충적 평가(순자산·순손익)**.
- §45의2①: 증여의제 재산가액 = 평가기준일(명의개서일) 평가액.
- → **신주인수가액(발행가액)·이론적 권리락가는 법문 근거 없음.** 희석효과는 명의개서일 §63 평가액에 자연 반영.
- **심판례** [확정, 단 교재 인용번호는 본문 미검증]:
  - 조심2012중3707(2013.4.18.): "유상증자 발행가액은 시가로 인정하기 어렵다" → 발행가액 과세 취소.
  - 2013.2.27. 동일쟁점 재결 다수: "유상증자 효과를 반영한 §63 보충적 평가액으로 산정".
  - 조심2019서2129(2019.12.24.): 유상증자 배정 신주 = **새로운 명의신탁 증여의제**, §63 보충평가.
  - ⚠️ **교재 인용 "조심 2013중3297"은 조세심판원 DB 미검색 → 본문 검증 불가.** 동일법리 타 재결로 평가원칙 자체는 확정. 결과뷰 인용은 "조심2012중3707·조심2019서2129(동일법리)" 병기, 교재 번호는 "교재 인용" 단서.

### 3-4. 제척기간 (국기법 §26의2) — [확정]
- §26의2④: 상증세 일반 10년(부정행위·무신고·거짓신고 시 15년).
- §26의2⑤7호: §45의2 명의신탁 의제 **부정행위 포탈 + 50억 초과** 시 "안 날부터 1년"(단기). 그 외는 ④ 10/15년.
- 원리: 각 명의개서 = 별개 증여 → 기존분 제척기간 도과 시 재과세 불가, **신주는 명의개서일 기준 별도 기산** → 살아있는 신주만 과세. 교재 "기존 21,000주 제척만료, 신주 18,375 과세"와 일치.

### 3-5. §47 합산배제·증여재산공제·할증 — [확정]
- §47①②: §45의2 = **합산배제증여재산** → **동일인 10년 합산 제외**, 각 건 개별과세.
- §53 증여재산공제: **비적용** — 명의신탁 증여의제는 합산배제증여재산이자 증여의 실질이 없는 의제과세 → 과세실무·통설상 증여재산공제 미적용. ⚠️ "친족으로부터 증여 불해당"을 **단독 근거로 단정 금지**(이미지 29 갑·병은 실제 특수관계 가능) — 결과뷰 note는 "합산배제증여재산 성격·과세실무상 공제 비적용"으로 표기.
- §57 세대생략할증: 통상 **비적용**(요건 = 증여자→직계비속 세대생략 불해당).
- §63③ 최대주주 20% 할증평가 배제: §63③ **본문 자체가** "대통령령으로 정하는 **중소기업** … 주식등은 제외"라 명시 → 이미지 29는 **비상장·중소기업**이므로 **§63③ 본문상 할증 배제 직접 인정**(시행령까지 강등 불요). **본 계산기는 평가액을 입력으로 받으므로 결과값 무영향** — note는 "중소기업이므로 §63③ 본문상 최대주주 할증 배제(입력 평가액에 반영)" 안내.

---

## 4. 계산사례 매트릭스 (Phase-0 anchor 동결값)

> 단순 → 복잡. **모든 분기 enumerate**. 원단위 `toBe()` 동결.

### CASE-NT-CAP (★ 이미지 29 병 — per_share 모드)
- 입력: `type=nominee_trust`, `valuationMode="per_share"`, `perSharePrice=15000`, `nomineeShares=18375`, `hasTaxAvoidancePurpose=true`, `isExcluded=false`
- (echo 입력, 계산 무영향) `subscriptionPrice=5000`, `theoreticalExRightsPrice=13000`, `preIncreasePerShare=20000`
- 도출 propertyValue = `safeMultiply(15000, 18375)` = **275,625,000**
- → `applied=true`, **`deemedGiftValue=275,625,000`**
- breakdown/note: §60·§63 평가근거 + "신주인수가액·이론적 권리락가 미적용" + §4의2②(실제소유자 납세) + §47①(합산배제)

### CASE-NT-CAP-NOAVOID (per_share, 조세회피목적 없음)
- 위와 동일 + `hasTaxAvoidancePurpose=false` → `applied=false`, `deemedGiftValue=0`, exclusionReason "조세회피목적 없음 …"

### CASE-NT-CAP-EXCLUDED (per_share, 배제사유)
- 위 + `isExcluded=true` → `applied=false`, `deemedGiftValue=0`, exclusionReason "신탁등기·비거주자 …"

### CASE-NT-TOTAL (회귀 — 현행 total 모드 불변)
- NT-1: `{ propertyValue: 500_000_000, hasTaxAvoidancePurpose: true }` (valuationMode 미지정/`"total"`) → 500,000,000
- NT-2/NT-3 동일 (0). **신규 필드 추가 후에도 불변**.

### CASE-NT-OVERFLOW (방어 — 대형 정수 정확성)
- `perSharePrice=3_000_000`, `nomineeShares=5_000_000` → 15,000,000,000,000 (정수 정확). `Math.round`·부동소수 누적 금지 확인.
- ⚠️ 이 값(1.5×10¹³)은 **2⁵³(≈9.007×10¹⁵) 미만이라 Number 경로**로도 정확 — `safeMultiply` BigInt fallback은 **미트리거**. 현실적 per-share × shares 곱은 2⁵³ 초과가 사실상 없으므로 anchor 목적은 "대형 정수 정확성"이지 "BigInt 경로 검증"이 아님(과장 금지).

---

## 5. 갭 분석 (실측 4건)

| # | 갭 | 근거 (file:line) | 영향 |
|---|---|---|---|
| G1 ★ | **per-share 분해 입력·계산 부재** (총액 propertyValue만) | `types.ts:462`, `nominee-trust.ts:14-15` | 이미지 29 산식(15,000×18,375) 재현 불가 |
| G2 ★ | **결과뷰 nominee 전용 섹션 부재** (공통 breakdown map만) | `DeemedGiftResultView.tsx:343-356` | 평가원칙(인수가/권리락 미적용)·산식 표시 불가 |
| G3 | per_share echo(평가근거·인수가·권리락) 부재 | `types.ts:33-113` `DeemedGiftResult` | 산출근거·교육적 비교 표시 불가 |
| G4 | prefill 합산배제·당사자 구조 미반영 (generic fallback) | `gift-deemed-api.ts:599-609` | 증여세 본세 핸드오프 시 공제·합산 오적용 위험 |

> G1·G2가 계산사례 재현 본체. G3는 교재 이미지 28(평가원칙) 재현 핵심 — 포함. G4는 본세 정확성 — Phase C에서 **검증 후** 처리(아래 §7·리스크).

---

## 6. 핵심 설계 결정

### 결정 1 — per_share 평가 모드 추가 (3-state 토글, 채택)
`NomineeTrustInput`에 optional `valuationMode?: "total" | "per_share"` + `perSharePrice?`·`nomineeShares?`. `per_share`이면 `propertyValue = safeMultiply(perSharePrice, nomineeShares)`로 **도출**, 아니면 현행 `propertyValue` 직접.
- 3-state(`feedback_three_state_optional_mode_toggle`): `valuationMode` undefined/`"total"` = 현행 총액(회귀 보존) / `"per_share"` = 분해 모드. **length>0 derive 금지**.
- 적용 게이트(`hasTaxAvoidancePurpose && !isExcluded && 도출가액 > 0`)는 **불변** — propertyValue 출처만 분기.
- **★ 도출 책임 = 엔진 단일 진실점**(`feedback_ui_engine_dual_truth_avoidance`): per_share 모드에서 곱(`safeMultiply`)은 **엔진(`nominee-trust.ts`)에서만** 수행. API는 propertyValue를 계산해 보내지 않음(dual-truth 금지) → per_share 시 **API가 propertyValue 미전송**(엔진 `resolvedValue` 단일 도출). 따라서 **Zod `propertyValue`를 optional로 완화**하고, "total 모드일 때만 필수"는 superRefine로(아래 결정 6·Phase B ⑤). 이를 빠뜨리면 per_share 폼이 propertyValue 비울 때 **Zod parse 실패로 API 차단**(UI 통과↔Zod 차단 역방향 14지점 위반).
- 모드 토글이 필드 필수성을 바꾸는 **선례 3건 답습**: `cdMode`(`gift-deemed-validate.ts:127` multi vs else)·`contribution` roster(`conParties !== undefined` 분기)·`merger`(mode별 분기). nominee per_share도 동일 패턴.
- 대안(기각): 별도 enum 카테고리 신설 → §45의2 동일 조문인데 카테고리 2개로 분열, 회귀 anchor·라우터·prefill 중복. 모드 토글이 최소 변경.

### 결정 2 — 엔진은 §63 평가액을 산정하지 않음 (caller 주입)
`perSharePrice`(명의개서일 §63 평가 1주당) = **입력**. 증자전 평가·인수가·권리락에서 계산하지 않음(§39의3 계획 SCOPE-OUT 동일). 비상장 보충평가는 별도 도구(`/tools/stock-valuation`·비상장 부표3) 영역.

### 결정 3 — 비교 echo로 이미지 28 평가원칙 재현 (채택)
result에 optional echo `nomineeCapitalIncrease?: { perSharePrice; nomineeShares; subscriptionPrice?; theoreticalExRightsPrice?; preIncreasePerShare? }` (Record 형, **Map 금지** `feedback_engine_result_map_json_loss`). 결과뷰가 산식 + "신주인수가액·이론적 권리락가 ≠ 적용가액, §63 명의개서일 평가액 적용" note 렌더.
- `echo-field-pattern`: 산식 불변, 노출만. 주식수(count)는 **원-amount 칸에 넣지 않고** 산식 문자열/echo로 표시(`amount-column-align` 위반 방지).

### 결정 4 — 당사자/납세의무자는 note + optional 이름 (계산 무영향)
- 결과뷰 note: "증여의제 수증자 = 명의자 / 납세의무자 = 실제소유자(§4의2②, 2019 개정 후)". 합산배제(§47①)·증여재산공제 비적용 안내.
- optional `ntActualOwner`/`ntNominee` 이름 필드는 **prefill용(Phase C)** — 핵심 산식(275,625,000)엔 불필요. 미입력 허용, `name.trim() || "명의자"`(`feedback_no_internal_id_in_result`).

### 결정 5 — 증여세 본세 prefill: 합산배제·당사자 반영 (Phase C, 검증 후)
nominee_trust 전용 prefill 분기 신설: 수증자=명의자, 증여자=실제소유자. **합산배제증여재산이므로 동일인 합산·증여재산공제가 본세 엔진에서 적용되지 않아야 함** → gift 엔진의 합산배제 처리 지원 여부 **확인 필요**(미지원 시 별도 갭). 미검증 단계라 Phase C에서 probe 후 확정. 핵심 계산기(증여재산가액)와 분리.

### 결정 6 — Zod `propertyValue` optional 완화 + cross-field superRefine (★ 2차 검토 추가)
현행 `nomineeTrustSchema.propertyValue: z.number().nonnegative()`는 **필수**. per_share 모드(propertyValue 미전송)를 막지 않으려면:
1. `propertyValue: z.number().nonnegative().optional()`로 완화.
2. **schema-level `.superRefine`** 추가(선례 `contributionSchema:207-240` — discriminatedUnion 안에서 `.superRefine` 동작 확인됨): `valuationMode !== "per_share"`이면 `propertyValue` 필수(>0), `valuationMode === "per_share"`이면 `perSharePrice > 0 && nomineeShares > 0` 필수. **두 모드 상호배타 cross-field 검증을 한 곳에 응집**.
   - ⚠️ union-level superRefine(`gift-deemed-input.ts:368`)에 넣는 선례(`free_realestate` 등)도 있으나, cross-field(valuationMode↔propertyValue) 응집을 위해 **schema-level 채택**(일관). 헤더 주석(`:1-7` "브랜치는 순수 z.object")과 표면 충돌하나 contribution이 실제 작동 중 — 현행 패턴 우선.

---

## 7. 작업 Phase (Do는 시퀀셜 — 엔진 → UI/API → 회귀)

### Phase 0 — Pre-Do anchor (A1 타입 선행 후) `pre-do-anchor-verification`
> ⚠️ per_share anchor는 `valuationMode`/`perSharePrice`/`nomineeShares` 입력을 assert하므로 **A1(types 확장) 없이는 작성 불가**. 순서 = A1 → Phase-0 anchor(현행 미구현이라 RED) → A2 구현(GREEN).
`phase3-presumption-anchor.test.ts`(기존 describe `:39`)에 per_share 케이스 추가 — **anchor ID**:
- [NT-CAP] CASE-NT-CAP: deemedGiftValue **275,625,000**, applied=true, echo `nomineeCapitalIncrease.perSharePrice=15000`·`nomineeShares=18375`
- [NT-CAP-NOAVOID] 0 / applied=false
- [NT-CAP-EXCLUDED] 0 / applied=false
- [NT-OVERFLOW] 15,000,000,000,000 (대형 정수 정확 — 2⁵³ 미만 Number 경로, BigInt 미트리거)
- [NT-NOTE] breakdown/note에 `§60`·`§63`·"신주인수가액"·"이론적 권리락"·`§4의2`·`§47` 키워드 `toContain`(평가원칙 note 침묵소실 회귀 차단)
- **게이트**: NT-CAP·NT-NOTE 는 현행 RED여야 정상. NT-1/2/3 은 GREEN 유지(회귀).

### Phase A — 엔진 (`nominee-trust.ts` + `types.ts` + `legal-codes/inheritance-gift.ts`)
- A1. `types.ts:460-465` `NomineeTrustInput`: **`propertyValue`를 `propertyValue?: number`로 완화**(per_share 모드는 미전송 — Zod ⑤·API ④와 정합) + optional 추가: `valuationMode?: "total" | "per_share"`, `perSharePrice?: number`, `nomineeShares?: number`, (echo) `subscriptionPrice?`·`theoreticalExRightsPrice?`·`preIncreasePerShare?`, (이름) `actualOwnerName?`·`nomineeName?`. `DeemedGiftResult`에 `nomineeCapitalIncrease?: {...}` (Record).
- A2. `nominee-trust.ts:11-34` `calcNomineeTrustGift`: per_share 분기 — `const resolvedValue = valuationMode === "per_share" ? safeMultiply(perSharePrice ?? 0, nomineeShares ?? 0) : (propertyValue ?? 0);` 후 게이트는 `resolvedValue`로 판정(propertyValue optional 대응 `?? 0`). breakdown에 per_share 행(1주당평가·신주수는 note/echo, 증여의제가액 amount) + 평가원칙 note. `safeMultiply` import (`../tax-utils`, `contribution-in-kind.ts:3` 동일). **`Math.round` 금지**.
- A3. `nomineeCapitalIncrease` echo 채움(per_share 모드 시). total 모드는 undefined.
- A4. `legal-codes/inheritance-gift.ts`: **GIFT.* 상수 신규**(문자열 리터럴 금지). 예 `GIFT.NOMINEE_TRUST_VALUATION="상증법 §60·§63"`·`GIFT.NOMINEE_TRUST_TAXPAYER="상증법 §4의2②"`·`GIFT.NOMINEE_TRUST_AGGREGATION_EXCLUSION="상증법 §47①"`. 추가 전 `korean-law-citation-verify`로 §4의2②·§47① 위임체인 재확인.
- A5. router(`router.ts:52-53`) **변경 불필요**(판별유니온 optional 통과). barrel `index.ts` 변경 불필요.
- **검증**: `npx vitest run __tests__/tax-engine/gift-deemed/phase3-presumption-anchor.test.ts` → NT-CAP/NT-NOTE green + **NT-1/2/3 불변** + `npx vitest run __tests__/tax-engine/gift-deemed/` 전건 green.

### Phase B — UI/API 동기화 (8 클라이언트 + Zod)
- ① 폼 `deemed-form-state.ts:231-234` `nt*` 블록: `ntValuationMode: "total"|"per_share"`, `ntPerSharePrice: string`, `ntNewShares: string`, `ntSubscriptionPrice: string`, `ntTheoreticalExRights: string`, `ntPreIncreasePerShare: string`, (선택) `ntActualOwner`/`ntNominee` 이름.
- ② initial `deemed-form-state.ts:434-436`: `ntValuationMode: "total"`, 나머지 `""`.
- ③ UI 위젯 `presumption-forms.tsx:48-76` `NomineeTrustFields`: `RadioCardGroup`(total/per_share 모드 토글) — per_share 선택 시 1주당평가액(`CurrencyInput`)·**신주수(`CurrencyInput`+`parseAmount` 정수 — 확정)** + 접이식 참고입력(인수가·권리락·증자전평가). **신주수 입력타입 확정 근거**: gift-deemed 전 자본거래 주식수가 예외 없이 `CurrencyInput`+`parseAmount`(`contribution-form.tsx:65-70` 인수신주수·`:135-139` con*Shares). `feedback_decimal_input`은 소수점 필요한 면적·연수 한정 — 주식수는 정수+천단위 콤마 가독성(18,375)이라 `CurrencyInput`이 정답(DecimalInput 아님). **안내 카드 tone**: 현행 NomineeTrustFields가 `rose`(지역/배제 tone, `:50`)이므로 평가원칙 안내는 **rose 컨테이너 안 violet 중첩 금지** → `emerald`(평가 정보) 또는 `amber`(분리계산 모드)로(`feedback_tailwind_static_tone_mapping`·tone 의미표 정합). **800줄 정책**: `presumption-forms.tsx` 현행 76줄 — per_share 블록 추가가 800 초과 위험 시 `nominee-trust-form.tsx` 분리(현물출자 `contribution-form.tsx` 선례, `capital-forms.tsx:13` re-export 패턴).
- ④ API 변환 `gift-deemed-api.ts:358-364` case `nominee_trust`: `valuationMode` + per_share 시 `perSharePrice=parseAmount(...)`·`nomineeShares=parseAmount(...)`·echo 필드 매핑. **per_share 시 `propertyValue`는 전송하지 않음(엔진 단일 도출 — dual-truth 금지)**, total 시 현행 `propertyValue=parseAmount(ntPropertyValue)` 유지.
- ⑤ Zod `gift-deemed-input.ts:247-252` `nomineeTrustSchema` (★ 2차 검토 🔴): `valuationMode: z.enum(["total","per_share"]).optional()`, `perSharePrice`/`nomineeShares`/echo `z.number().nonnegative().optional()`, **그리고 `propertyValue`를 `z.number().nonnegative().optional()`로 완화**(현행 필수→optional). schema-level **`.superRefine`**(결정 6, `contributionSchema:207` 선례): `valuationMode !== "per_share"`면 propertyValue>0 필수 / `== "per_share"`면 perSharePrice>0·nomineeShares>0 필수. **propertyValue 완화 누락 시 per_share 경로가 API에서 차단됨**.
- ⑥ Validation `gift-deemed-validate.ts:183-185` case `nominee_trust`: **현행 `:184` `ntPropertyValue<=0` 줄을 total 분기(else) 안으로 이동**(삭제 아닌 가드) — `if (form.ntValuationMode === "per_share") { ntPerSharePrice<=0 || ntNewShares<=0 차단 } else { 현행 ntPropertyValue<=0 차단 }`. 현행 줄을 per_share에서도 실행되게 두면 모순. 선례 `cdMode`(`validate.ts:127` multi vs else)·`contribution`(`conParties !== undefined` 분기). **UI 통과 ↔ validate 차단 모순 0**(`feedback_validation_sync_8th_point`).
- ⑦ 결과뷰 `DeemedGiftResultView.tsx`: `result.nomineeCapitalIncrease` 있으면 전용 섹션 — 산식("1주당 15,000 × 신주 18,375주 = 275,625,000"). **참고 비교는 2종 성격 분리 서술**(이미지 28 희석효과 충실도): (a) **증자전 20,000 → 유상증자 희석으로 명의개서일 §63 평가 15,000**(하락=희석, "미적용 후보" 아님), (b) **신주인수가액 5,000·이론적 권리락 13,000은 평가에 미적용**(법문상 평가가액 아님). 셋을 "미적용 4값"으로 뭉뚱그리지 말 것. + 납세의무자(명의자 수증/실제소유자 납부 §4의2②)·합산배제(§47①) note. 금액칸 `amount-column-align`. §38 mergerMatrix(`:548-586`)·§39의3 contributionBreakdown(`:401-488`) 조건부 섹션 패턴 차용.
- ⑧ (위 ⑥와 동일 — validate).

### Phase C — 증여세 본세 prefill (결정 5, **검증 후**) + 회귀·E2E
- C1. `buildGiftWizardPrefill`(`gift-deemed-api.ts:488-610`)에 nominee_trust 분기 신설: 수증자=명의자(`ntNominee`)·증여자=실제소유자(`ntActualOwner`)·marketValue=deemedGiftValue. **probe로 gift 엔진 합산배제(§47①)·증여재산공제 비적용 처리 가능 여부 확인** — 미지원이면 본 PR SCOPE-OUT + 별도 갭 등록(generic fallback 유지). 다중 명의신탁 건 단순 합산 금지(§47 합산배제).
- C2. 회귀: `npx vitest run __tests__/tax-engine/gift-deemed/` 전건 + `npm run typecheck`.
- C3. **E2E 신규 1건**(`e2e/` deemed-gift 스펙): nominee_trust 선택 → per_share 모드 → 1주당 15,000·신주 18,375 입력 → 결과뷰 275,625,000·산식·평가원칙 note 확인. `feedback_browser_verify_with_playwright`·`feedback_e2e_preexisting_failures`(사전존재 실패 회귀 오인 금지).
- C4. route 왕복 보존: `nomineeCapitalIncrease` echo **+ 기존 `thresholdEcho`(`nominee-trust.ts:32`)** 둘 다 `/api/calc/gift-deemed` JSON 왕복 후 결과뷰까지 보존되는지 통합 anchor 1건(Record라 소실 없으나 ⑫⑬⑭ 침묵 strip 정책 정합 + 기존 echo 회귀 동시 차단).

---

## 8. 14 동기화 지점 영향표 (신규 per_share 필드)

> ⚠️ ①~⑭ 표준번호는 CLAUDE.md Definition-of-Done 기준. Check 단계 `ui-engine-sync-checker`로 점검.

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 | `deemed-form-state.ts` `ntValuationMode`·`ntPerSharePrice`·`ntNewShares`·echo 6필드 | 신규 |
| ② initial | `INITIAL_DEEMED` (`ntValuationMode:"total"`·`""`) | 신규 |
| ③ normalize | sessionStorage 마이그(undefined→"total" 허용) | 신규 |
| ④ API 변환 | `gift-deemed-api.ts` per_share 매핑 | 신규 |
| ⑤ UI 위젯 | `NomineeTrustFields` 모드 토글 + per_share 입력 | 신규 |
| ⑥ 사이드바 합계 | **N/A** — deemed-gift 마법사에 사이드바 합계 selector 자체가 부재(모달 플로우). per_share 작업 무영향 | — |
| ⑦ 결과 카드 | nominee 전용 섹션(산식·평가원칙·납세의무자 note) | 신규 |
| ⑧ Validation | per_share 모드 검증(perSharePrice·nomineeShares>0) | 신규 |
| ⑨ Zod 메인 | `nomineeTrustSchema` valuationMode enum + per_share 필드 **+ propertyValue optional 완화 + schema-level superRefine(total일 때만 propertyValue 필수)** 🔴 | 신규 |
| ⑩ Zod 컴패니언 | **N/A** (gift-deemed 단일 discriminatedUnion, 컴패니언 구조 아님) | — |
| ⑪ 자산-수준 fallback | **N/A** (단일 의제 입력, 자산 배열 아님) | — |
| ⑫ Zod 입력 객체 | `nomineeTrustSchema` 확장(⑨와 동일 객체) — propertyValue optional 누락 시 per_share 차단 | 신규 |
| ⑬ callAPI body | `buildDeemedGiftInput` 완전 객체 반환 — 신규 필드 spread 포함 확인 | 신규(점검) |
| ⑭ Route 매핑 | else 분기 `calcDeemedGift(data)` 유지(`capital_increase_allocation`만 별도 함수). 날짜 없음 — Date 변환 불요 | 불변 |
| 증여세 prefill | nominee_trust 분기 신설(Phase C, 검증 후) | 신규(조건부) |

---

## 9. 적용 정책 (메모리 사전 점검 — `policy-check`)

- `feedback_three_state_optional_mode_toggle` — `valuationMode` 3-state. length>0 파생 금지.
- `feedback_no_silent_apportion_fallback` — per_share 미입력 시 자동 total 추정 금지(모드 명시).
- `feedback_engine_result_map_json_loss` — `nomineeCapitalIncrease`는 **Record**(Map 금지).
- `feedback_no_internal_id_in_result` — 명의자/실소유자 라벨 `name.trim() || "명의자"`.
- `feedback_korean_law_citation_verify` / `korean-law-citation-verify` — §4의2②·§47①·§60·§63 인용 본문 재확인 후 표시. 심판례는 조심2012중3707·조심2019서2129 병기(교재 조심2013중3297은 "교재 인용" 단서).
- `feedback_tax_calculation_principle` — 유불리·절감 표현 금지, 중립 사실.
- `feedback_validation_sync_8th_point` — per_share API/UI fallback ↔ validate 동기화.
- `amount-column-align` — 결과 금액칸 `font-mono tabular-nums` 우측정렬. 주식수(count)는 원-칸 제외.
- `feedback_decimal_input` — **신주수 = `CurrencyInput`+`parseAmount`(정수, 확정)**. gift-deemed 전 자본거래 주식수 컨벤션(`contribution-form.tsx:65-70`). `feedback_decimal_input`의 DecimalInput은 소수 면적·연수 한정 — 정수+콤마 가독성인 주식수엔 CurrencyInput.
- `mirror-pattern` / `feedback_useeffect_store_mirror_forbidden` — 모드↔필드 동기화는 onChange/변환함수. **useEffect→store 미러링 금지**(무한 루프).
- `feedback_section_card_numbering` / `feedback_toggle_card_visibility` — 모드 토글 `RadioCardGroup`, OFF tone 유지.
- `single-source-engine-helper` — prefill 동일인 판정은 `gift-prior-aggregation` 헬퍼 재사용(재정의 금지).
- `tax-field-add` / `single-response-do-execution` — Do 14지점 점검·단일응답 완주.
- `besshi-form-replica` 불필요(별지서식 아님 — 계산기 결과뷰).

---

## 10. 리스크 / 검증 게이트

| 리스크 | 대응 |
|---|---|
| 교재 인용 조심2013중3297 본문 미검증 | 동일법리 조심2012중3707·조심2019서2129로 평가원칙 확정. 결과뷰 인용 병기 + 교재번호 단서. **추정 금지** |
| 납세의무자 연도분기(2019 전후) | 구법=명의자 납세+실소유자 연대 / 현행=실소유자 납세. 결과뷰 현행 라벨 + 각주. **증여재산가액(275,625,000)엔 무영향** |
| **🔴 Zod `propertyValue` 필수 잔존** | per_share 폼이 propertyValue 비우면 Zod parse 실패→API 차단(UI통과↔Zod차단). **결정 6대로 propertyValue optional 완화 + total-only superRefine 필수**. Do 진입 전 블로킹 게이트 |
| 기존 NT-1/2/3 회귀 | valuationMode optional·total 경로 불변(propertyValue 명시전달이라 완화 무영향) — anchor 재실행 게이트 |
| 신주수 입력 타입 | **확정: `CurrencyInput`+`parseAmount`(정수)** — gift-deemed 자본거래 주식수 컨벤션(`contribution-form.tsx:65-70`). 망설임 해소 |
| deemed-form-state.ts 필드 폭증(9필드) | echo 3필드(인수가·권리락·증자전)는 표시 전용이나 이미지 28 평가원칙 재현에 필요 — 유지. union FormState 800줄 근접 시 타입 분리 검토(분리 난이도 높음 — 모니터만) |
| 안내 카드 tone 충돌 | 현행 rose 컨테이너에 violet 중첩 금지 → 평가원칙 카드 emerald/amber(tone 의미표 정합) |
| §63③ 최대주주 할증배제 | 이미지 29 비상장·중소기업 → §63③ **본문상 할증 배제**(중소기업 명시, 시행령 불요). 본 계산기는 평가액 입력이라 결과 무영향 — note 안내만 |
| prefill 합산배제 미지원 위험 | Phase C probe로 gift 엔진 §47①·§53 처리 확인 후 결정. 미지원 시 generic fallback 유지 + 갭 등록 |
| presumption-forms.tsx 800줄 | per_share 블록 추가 시 `nominee-trust-form.tsx` 분리(현물출자 선례) |
| ESLint --fix named export 제거 | 신규 import 1라인 1named (CLAUDE.md 함정) |

**완료 정의**: NT-CAP/NT-CAP-NOAVOID/NT-CAP-EXCLUDED/NT-OVERFLOW/NT-NOTE anchor green · NT-1/2/3 불변 · `tsc --noEmit` 0 · gift-deemed 전 테스트 green · **per_share 입력이 Zod·validate·API 왕복 성공(propertyValue optional 완화 적용 — 🔴 게이트)** · 결과뷰 산식(15,000×18,375=275,625,000)·평가원칙 note(증자전 20,000 희석 vs 인수가/권리락 미적용 분리)·납세의무자 note 표시 · E2E 또는 브라우저 확인.

---

## 11. 범위 외 (SCOPE-OUT)

- **§39 불균등증자 증여**: 균등증자라 미발동(이미지 29 ㈎). 본 계획은 §45의2 신주분만.
- **§60·§63 비상장 보충평가 산정**: 엔진 내 계산 안 함(평가액 caller 주입). 비상장 평가는 별도 도구(`/tools/stock-valuation`·부표3).
- **명의개서 미이행 케이스 타이밍**(소유권취득일 기준·다음해 말일+1): 본 사례(신주 직접 명의자 인수·명의개서) 무관.
- **다수 명의신탁 수탁자(N 명의자) 동시 입력**: 각 명의자=독립 증여의제 → 계산기 N회 실행. roster 자동화는 후속(필요 시 `ContributionFields` 선례).
- **§63③ 최대주주 할증 비중소기업 케이스**: 이미지 29는 중소기업이라 본문상 배제 확정. 비중소기업(할증 적용) 시나리오는 평가액 입력에 반영되므로 결과 무영향 — note 안내만.
- **증여세 본세 prefill 합산배제 정합**: Phase C 검증 후 처리, gift 엔진 미지원 시 별도 갭.
