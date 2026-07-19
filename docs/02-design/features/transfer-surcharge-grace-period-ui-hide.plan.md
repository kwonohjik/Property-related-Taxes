# 작업계획서 — 다주택 중과 한시 배제기간(2022-05-10~2026-05-09) 중과 UI 숨김 + 엔진 윈도우 정합

- 요청: 양도일이 **다주택 중과 한시 배제기간(2022-05-10 ~ 2026-05-09)**에 속하면 양도세 계산기에서 **다주택 중과 관련 UI가 노출되지 않도록** 한다.
- 결정(2026-07-19, 사용자): **법령 기준 2022-05-10 ~ 2026-05-09**로 하고, **엔진 시드도 함께 수정**(현행 엔진은 2024-01-10부터만 배제 — 갭 존재).
- 성격: **중 규모** — UI 조건부 숨김 + 엔진 세율 시드(데이터) 수정 + 공유 상수. **엔진 input/result 타입 신규 필드 없음**(14 동기화 지점 신규 필드 N/A).
- 자가검토: plan-design-self-review-loop 3-fork 병렬(2026-07-19) — 정정 13건 반영. 아래 본문은 반영본.

---

## 1. 배경 — 코드-법령 불일치 (실측)

중과 유예는 DB 세율 `special_rules.suspended_until`을 **양도일**과 비교해 판정한다(`tax-utils.ts:320` `isSurchargeSuspended` — `referenceDate <= suspended_until`). 그런데 세율 시드가 배제 시작을 **2024-01-10**으로만 모델링해, **2022-05-10 ~ 2024-01-09 양도는 중과가 그대로 적용**되는 갭이 있다.

| rate row | effective_date | special_rules | 적용 양도일 | 현행 중과 |
|---|---|---|---|---|
| 4-A (`transfer-rate-seed-historical.ts:162`) | 1990-01-01 | `null` | ~2024-01-09 | **적용**(유예 없음) |
| 4-B (`…:176`) | 2024-01-10 | `suspended_until: "2026-05-09"` | 2024-01-10~2026-05-09 | 배제 |

- 별도 상수 `SURCHARGE_EXCLUSION_WINDOW`(`legal-codes/transfer.ts:465`) = `{start:"2022-05-10", end:"2024-05-09"}`. **`.start`만 엔진에서 사용**(`multi-house-surcharge-exclusion.ts:91·144`, `acquisition-surcharge/multi-house.ts:312` — grep 실측), **`.end`(2024-05-09)은 어디서도 미사용 = stale**.
- **법령상 추정(§2에서 검증 예정)**: 한시 배제는 시행령 §167의3 개정으로 **2022-05-10부터 연속** 적용, 종료일이 여러 차례 연장되어 현재 **2026-05-09**로 알려져 있다. 시행일·소급 여부·종료일은 **미검증** — §2 KoreanLaw 검증 통과 전에는 seed·문자열에 확정 기재하지 않는다(정책 `korean_law_citation_verify`; 중과배제=납세자 유리이므로 근거 없는 확대 적용 금지). 이 추정이 맞다면 시드 4-A/4-B는 2022-05-10~2024-01-09 구간을 **누락한 선행 갭**이다.

## 2. Pre-Do 법령 검증 결과 (KoreanLaw 실측, 2026-07-19 완료)

소득세법 시행령 [현행, 시행 2026-07-01] §167의3①**12의2**(3주택)·§167의10①**12의2**(2주택) **동일 조문** 실측(mst=286211):

> 12의2. 법 제95조제4항에 따른 **보유기간이 2년 이상인 주택**으로서 다음 각 목의 어느 하나에 해당하는 주택
> 가. **2026년 5월 9일까지 양도하는 주택** / 나·다. 토지거래허가·매매계약 2026-05-09까지(2026-05-10 이후 계약은 2026-09-09/11-09까지 양도)

- [x] **종료일 = 2026-05-09** 확정(가목 "2026년 5월 9일까지 양도"). ✅ 계획 정확.
- [x] **대상유형 2주택·3주택 모두** 배제 조항 존재(§167의10·§167의3 각 12의2 동일). ✅ suspended_types 양자 정확.
- [x] **양도일 기준** 확정(가목 "양도하는 주택"; 계약일 기준은 나·다목의 별도 잔여특례). ✅
- [x] 🔴 **보유기간 2년 이상 요건 발견(신규·중대)**: 배제는 "**보유 2년 이상** + 2026-05-09까지 양도"인 주택만. **양도일 단독이 아니다.** 현행 엔진 `isSurchargeSuspended`(양도일만)·본 계획 초안(양도일만) **모두 이 요건 누락** → §3/§4/§5 정합 재검토 필요(아래 §2-A).
- [~] **시작일 2022-05-10**: 현행 조문 본문엔 **하한 없음**(가목은 상한 2026-05-09만). 2022-05-10은 12의2 조항 **최초 신설 부칙 시행일**로, 행위시법상 그 이전 양도엔 배제 미적용 → rate row 하한(effective_date 2022-05-10)으로 구현 타당. **정확한 최초 시행일은 Do에서 연혁(amendment_track) 확인**(사용자 제시값 2022-05-10 잠정 사용).

### 2-A. 보유 2년 요건의 실무적 함의 (결정 필요)

다주택 중과(§104⑦, +20/+30%p)는 **보유 2년 이상**에만 성립한다. 보유 2년 미만 다주택은 §104①의 **단기 단일세율(1년 미만 70%·1~2년 60%)**이 적용되어 중과 논점이 아니다. 따라서 "양도일 배제기간 → 중과 UI 숨김"은 **보유 2년 이상 전제에서 정확**하고, 보유 2년 미만은 애초에 중과가 아니라 단기세율이라 별개다.

→ **[결정 2026-07-19] 보유 2년 요건 포함(엔진+UI 정확).** 숨김·배제 조건 = **양도일 ∈ [2022-05-10, 2026-05-09] AND 보유기간(§95④) ≥ 2년**. 현행 엔진의 보유기간 무시(기존 갭)도 이번에 함께 교정.
- **보유기간 기산(§95④)**: 원칙은 취득일~양도일. **재개발·재건축·소규모재건축 조합원**이 관리처분계획에 따라 취득한 신축주택은 **기존건물 취득일부터 기산**(조문 12의2 괄호). 엔진·UI 모두 이 기산을 따라야 함(single-source: 엔진 보유기간 헬퍼 재사용).
- 보유 2년 **미만** 다주택: 배제 미적용 → 엔진은 정상 §104 경로(단기 단일세율 vs 기본+중과 비교과세 §104⑤가 지배) → **UI도 ④ 노출**(숨기지 않음).

## 3. 현행 UI 인벤토리 (숨김 대상 식별 — `Step4.tsx`)

최근 재배치(PR #688) 후 보유 상황 섹션:

| 섹션/블록 | 내용 | 트랙 | 배제기간 처리 |
|---|---|---|---|
| 조정지역 자동판별 배너 (`Step4.tsx:144`) | `isRegulatedAtTransfer`(중과) + `wasRegulatedAtAcquisition`(비과세) **혼합 표시** | 혼합 | **유지**(취득시 조정지역=비과세 거주요건은 배제기간에도 유효) |
| ① 세대·주택 현황 | 1세대 해당·**세대 보유 주택 수** | 비과세(주택수 selector) | **유지** |
| ② 1세대1주택 비과세 판정 | 취득일 조정지역·거주기간·§154 단서 | 비과세 | **유지** |
| ③ 일시적 2주택·합가 특례 | §155·§156의2 | 비과세 | **유지** |
| ④ 주택수·중과 판정 (`Step4.tsx:454`) | 다른 보유 주택 목록+분양권·**감면주택 제외**·양도일 조정지역·중과 검토·gracePeriod 정밀조건·**SellingHouseExclusion(3주택+, `HousesListSection.tsx:389`)** | **중과** | **숨김 → 안내 카드** |
| ⑤ 특수 상황 | 미등기·**비사업용 토지 중과(§104의3)** | 별개 중과(land) | **유지** |

- **④ 전체가 다주택 중과 전용**: houses[]는 §167의3 주택수 산정 → **오직 중과에만** 사용(비과세 exemption 경로는 houses 미소비 — grep 실측 확인). 배제기간엔 주택수 산정이 무의미 → ④ 통째 숨김이 정합.
- **④ 자식 컴포넌트**(gracePeriod·SellingHouseExclusion·SpecialHouseExclusion·분양권)는 `HousesListSection` 내부라 **④ 숨김 시 자동 동반 숨김**.
- **⑤ 비사업용 토지 중과는 §104의3(토지)로 다주택 한시배제와 무관** → 유지. **① 세대 보유 주택 수**는 비과세 판정용 → 유지.

## 4. 작업 범위

### Part A — 엔진: 배제 윈도우 정합 (2022-05-10 갭 메움)

1. **세율 시드에 row 추가**(`transfer-rate-seed-historical.ts`, 4-A와 4-B 사이): `effective_date:"2022-05-10"`, `special_rules:{surcharge_suspended:true, suspended_types:["multi_house_2","multi_house_3plus"], suspended_until: <§2 검증 종료일>, legal_basis: <§2 검증 후 확정>}`.
   - **하한 구현**(GREEN 확인): `isSurchargeSuspended`는 종료일만 비교하고, **하한은 `preloadTaxRates`의 rate row 선택**으로 구현된다 — `preload_function.sql` `DISTINCT ON … effective_date<=target ORDER BY effective_date DESC`(most recent ≤ 양도일), target=양도일(`route.ts:407`). 2022-05-10 row가 2022-05-10~2024-01-09에 매칭 → 배제. 별도 하한 코드 불필요.
   - **4-B(2024-01-10) 유지**: 무해한 중복(동일 suspended_until). 양도일>2026-05-09는 4-B 매칭 → `referenceDate>suspended_until` → **중과 부활**(정상 경계). 회귀 안전상 유지.
   - **왜 새 row인가**(GREEN 확인): 4-A(1990-01-01)에 special_rules를 채우면 **1990년부터 전면배제**되어 오답 → 신규 2022-05-10 row가 유일 정답.
2. **stale 상수 정정(cosmetic)**: `SURCHARGE_EXCLUSION_WINDOW.end`(2024-05-09)는 **미사용**이라 정정해도 동작 무변화 — 문서 정확성 목적. **실제 gracePeriod 종료일은 별도 하드코딩 `GRACE_PERIOD_END`(`multi-house-surcharge-exclusion.ts:80`)**임에 주의(§4-B에서 단일화).
3. **보유기간 2년 게이트 추가(§2-A 결정)**: 배제(suspension)를 **양도일 윈도우 AND 보유기간 ≥ 2년**일 때만 유효로 한다. `isSurchargeSuspended`(`tax-utils.ts:320`)는 양도일만 보므로, **게이트는 `determineMultiHouseSurcharge`(`multi-house-surcharge.ts`)에서 selling house 보유기간을 계산해 적용** — `isSurchargeSuspended(...) && sellingHoldingYears >= 2`. 보유기간은 **엔진 보유기간 헬퍼 재사용**(single-source; §95④ 재개발 조합원 기존건물 기산 반영). 보유<2년이면 suspension 미적용 → 기존 §104 경로(비교과세) 그대로. **⚠️ 이 게이트 추가로 보유 2년 미만 다주택 배제기간 케이스의 엔진 결과가 바뀌므로(중과→비교과세) 관련 앵커 재검토**(§6).

**재시딩 범위(중요)**: 시드 상수(`historicalSeeds`)는 **DB + fallback + 테스트의 단일 소스**다 — `loadFallbackTransferRates`(`lib/db/tax-rates.ts:101`)가 동일 상수를 읽어 DB 미설정(로컬·CI, `route.ts:412`)·테스트 계산에 사용. ⇒ **시드 상수 편집만으로 fallback·테스트·앵커에 즉시 반영**되고, prod Supabase에만 `npm run seed:tax-rates` 필요.

### Part B — 공유 상수 (단일 출처, 클라이언트 import 가능)

- `legal-codes/transfer.ts`에 **양도일 기준 중과 전면배제 윈도우** 전용 상수 신설:
  `export const SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW = { start:"2022-05-10", end: <§2 검증 종료일> } as const;`
- **명명 대조 주석 필수**(기존 상수와 혼동 방지): 신규=**양도일 기준 전면배제**, 기존 `SURCHARGE_EXCLUSION_WINDOW`=**매매계약일 기준 gracePeriod**(`.start`만 사용). 두 상수 주석에 축 명시.
- **2026-05-09 단일 출처화**: 종료일이 현재 3곳(seed `suspended_until`·신규 상수·`GRACE_PERIOD_END` `exclusion.ts:80`)에 흩어짐 → 신규 상수를 단일 출처로 삼아 `GRACE_PERIOD_END`·seed가 이를 참조하게 하거나, **교차검증 단위 테스트가 3개 리터럴 전부 동일함을 검증**(드리프트 방지).

### Part C — UI: Step4 ④ 조건부 숨김 + 안내 카드

- **클라이언트 술어**(순수 함수, useMemo 파생 — store write 금지): **숨김 = `isWithinSurchargeSuspensionWindow(form.transferDate) && sellingHoldingYears >= 2`**.
  - `isWithinSurchargeSuspensionWindow(transferDate)` = `transferDate ∈ [start, end]`(Part B 상수). 엔진 `isSurchargeSuspended`와 이름 구분. 위치: `legal-codes/transfer.ts`(순수 TS·클라 import 가능).
  - `sellingHoldingYears`: `primary.acquisitionDate`~`form.transferDate` 보유기간(§95④). **엔진 보유기간 헬퍼 재사용**(single-source-engine-helper 정책 — UI 재정의 금지, 엔진 §4-A-3와 동일 산식·재개발 기산). `form.transferDate`·`primary.acquisitionDate`는 Step4에서 사용 가능(`Step4.tsx:83·296`).
  - **경계·미입력 정의**: `transferDate=""`/`acquisitionDate=""`/경계 밖/보유<2년 → 술어 **false → ④ 정상 노출**(안전 기본값).
- **동작**: 술어 true & housing-like → ④ 섹션 미렌더, 대신 **안내 카드**:
  - **표준 컴포넌트 `<ToneCard tone="sky" title="다주택 중과 한시 배제기간">`** 사용(`components/calc/shared/ToneCard.tsx`, tones.ts 정본 — 인라인 tone 하드코딩·동적 `bg-${tone}` 금지, 정책 `project_ui_color_tone_tokenization`).
  - 문구: "양도일이 다주택 중과 한시 배제기간(2022-05-10~2026-05-09)에 해당하여 일반세율이 적용됩니다. 다주택 중과 관련 입력은 생략됩니다." + **§167의3 `LawArticleModal` 링크**.
  - `data-testid="surcharge-suspended-notice"`(E2E assert).
- **침묵 숨김 금지**: 조건 없이 사라지면 혼란 → 반드시 대체 안내 카드로 사유 표기.
- ⑤ 특수 상황·① 세대 주택수·조정지역 자동판별 배너는 술어와 무관하게 기존 게이트 유지.

## 5. UI ↔ 엔진 일치 (핵심 불변식)

**UI 숨김 조건 = 엔진 실제 중과 배제 결과**여야 한다(정책 `feedback_engine_result_display_drift`·`store_default_vs_ui_display_fallback`).

- Part A 후 엔진은 **양도일 ∈ [2022-05-10, 2026-05-09] AND 보유 ≥ 2년**에서 `surchargeApplicable=false`.
- Part C UI 술어도 **동일 상수(Part B) + 동일 보유기간 헬퍼** 사용 → 경계 완전 일치.
- **경계 케이스 앵커**(Pre-Do): (a) 양도일 4점 2022-05-10·2024-01-09·2026-05-09·2026-05-10(모두 보유≥2년) + (b) **보유기간 경계** 배제기간 내 보유 2년 정각(배제)·보유 1년11개월(미배제). 각 점에서 엔진 `surchargeApplicable`과 UI 술어(숨김 여부) 일치.

## 6. 리스크 · 정책

- **⚠️ stale houses validation 잠금(High — 신규 발견)**: ④ 숨김이 `form.houses`를 clear하지 않으면, 사용자가 houses 입력 후 양도일을 배제기간으로 바꿀 때 stale 행이 **`transfer-tax-validate.ts:120-130`의 행별 필수검증에 걸려 차단**된다(숨겨진 입력이라 수정 불가 → 진행 잠김). ⇒ **술어 true 시 validation이 houses·presaleRights·specialHouseExclusions·gracePeriod 검증을 skip**(mirror 패턴 ⑧ — UI 숨김 ↔ validation skip 동기화). clear보다 skip 채택(양도일 재변경 시 데이터 보존).
- **⚠️ 기존 회귀 앵커 파손(High)**: 현행 엔진은 2022-05-10~2024-01-09 양도에 **중과 적용**. Part A로 배제 전환되면 그 구간 양도일 앵커의 기대값이 바뀐다 → `__tests__/tax-engine/` 다주택·중과 테스트 + **`regulated-area` 이력 테스트** 중 2022~2023 양도일 앵커 **전수 감사 후 갱신**(Do 첫 단계 grep).
- **validation 경로**: `lib/calc/transfer-tax-validate.ts`(메인, houses 검증 L120-130) + shard(`-nbl`·`-redev` 등). (계획 초안의 `transfer-validate-*.ts`는 오기 — 정정됨.)
- **API 페이로드**: ④ 숨김+validation skip 시에도 stale `form.houses`가 `buildHousesPayload`로 전송될 수 있으나, 배제기간엔 엔진이 중과 off라 결과 불변. 앵커로 "houses 유무 무관 동일 결과" 확인.
- **useEffect→store 미러링 금지**: 술어는 useMemo 파생만.
- **취득세 영향 없음 확인**: suspension row 추가는 transfer rate seed 한정. 취득세 중과는 별도 seed → 무관(Do 실측).

## 7. Pre-Do 앵커 (검증 우선)

1. 엔진 경계 앵커: 양도일 4점(2022-05-10 / 2024-01-09 / 2026-05-09 / 2026-05-10, 보유≥2년)에서 `surchargeApplicable`. Part A 전엔 2022-05-10·2024-01-09가 **중과 적용**(RED), 후엔 배제(GREEN). **fallback 경로로 검증**(DB 불필요 — §4-A 단일소스).
2. **보유기간 게이트 앵커**: 배제기간 내 양도(예 2025-06-01) × 보유 2년 정각(배제=surchargeApplicable false) / 보유 1년11개월(미배제=정상 비교과세). §4-A-3 게이트 검증. 재개발 조합원 기존건물 기산 케이스 1건.
3. UI 술어 단위 테스트: 양도일 4점 + 보유 2점 + 경계 밖(2022-05-09·undefined transferDate·undefined acqDate) → boolean.
4. 상수 교차검증: 신규 상수 end == seed `suspended_until` == `GRACE_PERIOD_END`.

## 8. Definition of Done

- [x] **Pre-Do §2: KoreanLaw 검증 완료(2026-07-19)** — 종료일 2026-05-09·2주택3주택 동일·양도일 기준 확정, **보유 2년 요건 발견**. 시작일 2022-05-10 최초 시행일은 Do에서 연혁 확인
- [x] Part A: 2022-05-10 suspension seed row(4-A2) 추가(legal_basis §167의3·167의10 12의2), `SURCHARGE_EXCLUSION_WINDOW.end` 정정(cosmetic), **보유 2년 게이트 `exclusion.ts` 추가(§4-A-3)**
- [x] Part B: `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW` 신설(대조 주석) + `GRACE_PERIOD_END`·seed가 이를 참조(단일소스) + 교차검증 테스트(`suspension-window-source.test.ts`)
- [x] Part C: Step4 ④ 조건부 숨김(**양도일 윈도우 AND 보유≥2년**) + `<ToneCard>` 안내 카드(§167의3 `LawArticleModal`·`data-testid="surcharge-suspended-notice"`), 미입력/보유<2년 → 노출. 보유기간 공유 헬퍼 `isMultiHouseSurchargeSuppressed` 재사용
- [x] validation: 술어 true 시 houses·presale·specialHouseExclusion·gracePeriod 검증 skip(⑧ mirror — `transfer-tax-validate.ts` 빈 배열 처리)
- [x] 엔진 보유2년 게이트 앵커 GREEN(`suspension-holding-2yr.anchor.test.ts` 3점) + 윈도우/술어 경계(`suspension-window-source.test.ts`)
- [x] 다주택 중과 194 + 양도세 엔진·calc 2524 전체 GREEN(회귀 0) · 기존 Step4 E2E 8건 GREEN(④ 조건부 게이트 회귀 없음)
- [x] `npx tsc --noEmit` 0건 · `eslint` 0건
- [x] E2E: 배제기간+보유≥2년 → ④ 미노출 + 안내 카드(testid) / 배제기간 밖 → ④ 노출 (`transfer-surcharge-suspension-hide.spec.ts` 2건 GREEN)

**남은 항목**: 시작일 2022-05-10 **최초 시행일 연혁**(amendment_track) 정밀 확인 — 현재 조항 본문 하한 부재로 부칙 시행일 잠정 사용(종료일·요건은 검증 완료). 실무 영향 없음(행위시법상 그 이전 양도는 자연히 배제 밖).

## 9. 미결·범위 밖

- **gracePeriod**(매매계약일 조건부, `multi-house-surcharge-exclusion.ts`)는 ④ 자식이라 **배제기간 내엔 ④와 함께 숨겨진다**(전면배제라 moot). 의미가 있는 경우는 **transferDate > 2026-05-09**(매매계약일 ≤ 2026-05-09)로 ④가 다시 노출될 때 → 이 시나리오는 숨김 대상 아님(현 결론: 숨김은 [2022-05-10, 2026-05-09] 내로 한정).
- 취득세 중과 UI는 별개 세목 — 범위 밖.
