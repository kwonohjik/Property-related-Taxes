# 양도세 감면 리뷰 — 보류 항목 후속 작업 계획서

> 작성일: 2026-06-12 · 선행: PR #142(감면 리뷰 High/Medium 전건 + Low #3·#7·#8)
> 본 계획서는 PR #142에서 **가치 대비 위험·범위**로 보류한 항목을 별도 작업으로 정리한다.
> 모든 file:line은 PR #142 머지 시점(master `9f21011e`) 기준 실측. 작업 착수 시 재확인 필수
> (memory `feedback_external_concurrent_edit_stale_read`).

## 우선순위 요약

| # | 항목 | 유형 | 규모 | 위험 | 우선순위 |
|---|---|---|---|---|---|
| F-1 | §99의2 등 동형 하이브리드 기준시가 validate 확장 | 기능(UX) | S | 낮음 | **P1** |
| F-2 | #9 시한 표 3중 → 단일 출처 모듈화 | 리팩터링 | M | 중간 | P2 |
| F-3 | #11 multi/route.ts `new Date` → date-coerce 정규화 | 리팩터링 | M | 중간 | P2 |
| F-4 | #2 §98의3 모드2 비거주자 시한 UI 안내 | 충실도(UI) | S | 낮음 | P3 |
| F-5 | §99의3 ⑭ Date 변환 비정규 경로 정규화 | 리팩터링 | S | 낮음 | P3 |
| F-6 | #10 다필지 `calcReductions` assetContractDate 미전달 | 일관성 | XS | 낮음 | P4(선택) |

> #6(다건 detail echo)은 PR #142 H-1 다건 차단으로 **불요** — 본 계획서 제외.

---

## F-1 — §99의2 등 동형 하이브리드 기준시가 validate 확장 (P1)

### 배경
PR #142 M-4는 §98의7만 "5년 경과 양도 시 취득시·5년시점 기준시가 필수"를 validate에 추가했다.
하이브리드 코어 `computeHybridEffect`는 5년 후 양도 시 **기준시가 3종이 0 이상이 아니면
`MISSING_STD_PRICE`로 부적격 처리**(`lib/tax-engine/transfer-reductions/unsold-hybrid.ts:254-268`)
한다. 즉 §99의2·§98의3·§98의5·§98의6도 5년 경과 양도에서 기준시가 미입력 시 **감면이 조용히
미적용**된다(과대과세 방향이라 numeric은 안전하나 UX 결함은 §98의7과 동일).

### 현황 (실측)
- 5년 기산은 houseType·조문 무관 공통: `isWithin5YearsCheck(input.acquisitionDate, input.transferDate)`
  (`unsold-hybrid.ts:211`). §99의2 `houseType`(`new_or_unsold`·`self_built`·`existing_one_house`,
  `unsold-hybrid.ts:118`)은 일자 필드만 다르고 5년 분기에는 영향 없음 → validate 확장은 §98의7과
  **동일 패턴**(houseType 분기 불필요).
- 취득시·5년시점 기준시가는 fallback 없음, 양도시만 `ctx.standardPriceAtTransfer` fallback
  (`unsold-hybrid-p3.ts:586-660` 각 조문 매핑).
- 기존 validate: `lib/calc/transfer-tax-validate-reductions.ts` — §99의2 블록은 `acquisitionPrice992`·
  `exclusiveAreaSqm992`만 검증(기준시가 미검증), §98의3/5/6 블록 동일.

### 작업
1. 공용 헬퍼 `requireStdPriceIfOver5Y(asset, form, fieldAcq, field5Y, label)`를 validate-reductions에
   추가 — `isWithin5YearsCheck` 재사용(`transfer-tax-validate-reductions.ts:10` 이미 import,
   dual-truth 없음).
2. §99의2(`standardPriceAtAcquisition992`·`standardPriceAt5Years992`), §98의3(`...983`),
   §98의5(`...985`), §98의6(`...986`) 블록에 5년 초과 시 두 기준시가 필수 추가.
   - 4조문 폼 필드 존재 **확정**(`calc-wizard-asset-reduction.ts:311-312·327-328·356-357·410-412 실측`).
   - §98의6은 `stdPriceSumAtBase986`(:339 — 기준시가합 6억 판정)과 안분용(:356-357)이 **별도 필드** —
     혼동 금지.
3. 각 fail 메시지에 "미입력 시 감면이 적용되지 않습니다" 안내(§98의7 메시지와 통일).

### 적용 범위 근거 (실측)
- **포함 4조문(992·983·985·986)**: effectCategory `income_deduction`(5년 후 기준시가 안분) 경로 보유.
- **제외 3조문**: §98의2=`lthd_rate_special`(unsold-hybrid-p4.ts:106) / §98의4=`tax_amount` 5년
  무관(p4:185) / §98=`flat_rate_20`(unsold-hybrid-p5.ts:149) — **5년 후 안분 차감 경로 자체가 없어**
  기준시가 불요.
- **검증 정책 차이 주의 (구현 시 필수 숙지)**: 기존 §99의3(validate-reductions.ts:44·50)·§99(:103)는
  기준시가 **무조건** 필수 — 두 조문은 차감(income_deduction) **전용**이라 기준시가가 항상 필요하기
  때문. 신규 4조문은 **하이브리드**(5년 내=세액감면, 기준시가 불요)이므로 반드시 **5년 분기 조건부**로
  구현할 것. §99의3 패턴을 그대로 복사(무조건 필수)하면 5년 내 세액감면 사용자를 오차단한다
  (UI 통과 ↔ validate 차단 모순 — CLAUDE.md ⑧ 정책 위반).

### 위험 / 주의
- §98의6 `hoType986 === "buyer_rented"`(2호) 등 5년 내 혜택 없는 분기와의 상호작용 — 2호는 차감만
  가능하므로 5년 초과 기준시가 필수 동일 적용. 단 분기별 도달 경로 anchor로 확인.
- §99의2 `existing_one_house`도 5년 후 차감 경로(공통 211) — 동일 적용.

### anchor (`__tests__/calc/`)
- 각 조문 5년 초과 + 기준시가 미입력 → 차단 / 5년 이내 → 통과 / 5년 초과 + 입력 → 통과.
- §98의6 `hoType986` 1호(seller_rented)·2호(buyer_rented) 양 분기 각 1건 (도달 경로 차이 확인).
- §99의2 `houseType992` 3분기 중 최소 2분기 (5년 분기가 houseType 무관 공통임을 anchor로 고정).
- §98의7 anchor(`transfer-validate-98-7-std-price.test.ts`) 패턴 재사용.

### 규모: S (validate 1파일 + 공용 헬퍼 + anchor 4조문)

---

## F-2 — #9 시한 표 3중 → 단일 출처 모듈화 (P2)

### 배경
미분양·신축 조문의 취득기간 시한이 **세 곳에 독립 하드코딩**되어 있다. PR #142 M-3로 파싱 기준
(UTC 자정)은 통일됐으나 값 자체는 여전히 3중이다.

### 현황 (실측 — 값 일치 확인. 3계층 / 파일 5개)
1. `lib/tax-engine/transfer-reductions/period-check.ts:37` `RULES` — **전 조문**(22항목) 시한 검증
   (그중 매매계약일 우선 13개 — CLAUDE.md 테스트 규칙 참조).
2. evaluator 시한 상수 — **4파일**: `unsold-hybrid.ts:33-38`(987 2012.9.24~12.31 · 992 2013.4.1~12.31),
   `unsold-hybrid-p3.ts:38-50`(983 거주자/비거주자 2-트랙 · 985 · 986), `unsold-hybrid-p4.ts:25-28`
   (982 · 984), `unsold-hybrid-p5.ts:27-30`(`UNSOLD_98_TRACK*` 2-트랙).
3. `unsold-hybrid-p5.ts:224` `SPECIAL_HOUSE_EXCLUSION_WINDOWS` — 모드2 9조문 시한.

### 작업
1. 신규 `lib/tax-engine/transfer-reductions/reduction-windows.ts` — 조문별 취득기간 윈도우를
   `Record<ArticleId, Array<[Date, Date]>>` 단일 상수로 정의 (UTC `new Date("YYYY-MM-DD")`).
2. period-check `RULES`·evaluator 상수(4파일)·`SPECIAL_HOUSE_EXCLUSION_WINDOWS`가 단일 출처 참조.
3. 값 변경 0(리팩터링) — 전수 일치 확인 후 교체.
4. **키 매핑 설계 필수**: RULES 키=`TransferReductionId`(23종) vs WINDOWS 키=
   `SpecialHouseExclusionArticle`(9종 — §98의4·§98의9 등 비포함, `new_99` 포함) — **집합·타입이 다르다**.
   단일 상수의 키는 `TransferReductionId` 부분집합으로 두고, WINDOWS는 자기 키→윈도우 키 매핑 후
   참조(§98의3 비거주자 2-트랙 등 evaluator 전용 변형은 evaluator에 잔류).

### 위험 / 주의
- 세 곳의 **용도가 다름**: period-check은 reductions 시한 검증(계약일/취득일 fallback), evaluator는
  조문별 적격 평가(다른 요건과 결합), WINDOWS는 모드2 전용(§99② transferDeadline 별도 필드).
  단일 상수는 **윈도우 값만** 공유하고 각 용도 로직은 유지 — 과도한 통합 금지.
- §99 `new_99`의 `transferDeadline: 2007-12-31`(양도시한)은 윈도우와 별개 필드 → 단일 상수에
  윈도우만 두고 deadline은 WINDOWS에 유지.

### anchor
- 기존 `reduction-period-check.test.ts`·`p5-flat-rate-and-mode2.test.ts`·하이브리드 통합 anchor가
  값 회귀를 커버 — 리팩터링 후 전부 통과로 검증(신규 anchor 불요, 회귀 0이 성공 기준).

### 규모: M (신규 모듈 + 6파일 참조 교체 — period-check·evaluator 4파일·WINDOWS, 값 무변경)

---

## F-3 — #11 multi/route.ts `new Date` → date-coerce 정규화 (P2)

### 배경
`app/api/calc/transfer/multi/route.ts`는 JSON body 일자 필드를 `new Date()`로 **직접 변환**(실측 36곳).
단건 route(`app/api/calc/transfer/route.ts`)는 `lib/api/date-coerce.ts`의 `toDate`/`toOptionalDate`를
사용한다. CLAUDE.md "API Date 직렬화" 정책 위반(신규 코드 `new Date(x)` 직접 호출 금지).

### 현황
- 36곳 `new Date(...)` — 대부분 중첩 구조(`temporaryTwoHouse`·`nonBusinessLandDetails`·
  `rentalReductionDetails`·`pre1990Land`·`parcels` 등) 내부.
- 실질 무해(서버 UTC + string "YYYY-MM-DD") — 침묵 오류 없음. 일관성·정책 준수 목적.

### 작업
1. `lib/api/date-coerce.ts` import 추가 — **multi/route.ts는 현재 date-coerce import 0건**(실측,
   단건 route.ts:31은 import 중).
2. 문자열 파싱 `new Date(x)` → `toDate(x, "필드명")`(필수) / `toOptionalDate(x)`(옵셔널) 일괄 교체.
   - **`:80`의 `new Date(taxYear, 11, 31)`은 연·월·일 생성자(파싱 아님) — 교체 제외** → 실제 35곳.
3. 중첩 객체는 `coerceDates(obj, [...])` 활용 검토.
4. **파싱 호출 전부 교체**(부분 교체는 혼재 심화 — PR #142에서 부분 교체를 보류한 이유).
   일괄 sed 금지 — 필드별 필수/옵셔널을 Zod 스키마와 대조해 수동 분류 (상세 매핑 표는 엔진 설계 문서).

### 위험 / 주의
- 36곳 중첩 구조 — 각 필드 필수/옵셔널 구분 정확히(`toDate` vs `toOptionalDate`). 잘못하면
  옵셔널 필드에 `toDate`가 throw.
- 다건 E2E + `multi-transfer-api-sync.test.ts` 전수 통과로 회귀 확인.

### anchor
- 기존 다건 테스트 + 다건 E2E(`e2e/`)가 커버. 날짜 경계(과세연도) anchor 1건 추가 권장.

### 규모: M (1파일 36곳, 회귀 위험은 중첩 필수/옵셔널 구분)

---

## F-4 — #2 §98의3 모드2 비거주자 시한 UI 안내 (P3)

### 배경
모드2 `SPECIAL_HOUSE_EXCLUSION_WINDOWS`의 §98의3 윈도우는 거주자 기준 `2009-02-12~2010-02-11`
(`unsold-hybrid-p5.ts:237`). 모드1 evaluator(`evaluateUnsold983`)는 비거주자 시한이 `2009-03-16~`로
더 좁다. 비거주자가 2009.2.12~3.15 취득분을 모드2에서 `requirementsConfirmed`로 통과시키면
적격 판정될 수 있다(엔진 단독 수정은 사용자 책임 범위라 충실도 이슈).

### 작업
- `components/calc/transfer/SpecialHouseExclusionSection.tsx` §98의3 선택 시 "비거주자는 2009.3.16
  이후 취득분만 해당"을 hint/경고로 표시(§99 `new_99` 경고 패턴 차용).

### 위험: 낮음 (UI 안내만, 엔진 무변경)
### 규모: S

---

## F-5 — §99의3 ⑭ Date 변환 비정규 경로 정규화 (P3)

### 배경
다른 조문은 `app/api/calc/transfer/route-reductions-mapper.ts`에서 일자를 일괄 Date 변환하나,
§99의3만 string을 그대로 통과시키고 `income-deduction-router.ts`(STEP 4.6) 내부
`coerceOptionalDate`로 변환한다(비정규 경로, 유지보수 혼동 위험). 기능상 정상 동작.

### 작업
- `route-reductions-mapper.ts`에 §99의3 일자 변환을 추가해 다른 조문과 경로 일원화.
- 엔진 내부(`income-deduction-router.ts` evalNew993) `coerceOptionalDate` fallback은 **유지** —
  route 외 호출자(테스트·다필지 등) 방어용 이중 안전. 제거하지 않는다.

### 위험: 낮음 (동작 동일, 경로 일관성)
### 규모: S

---

## F-6 — #10 다필지 calcReductions assetContractDate 미전달 (P4, 선택)

### 배경
`lib/tax-engine/transfer-tax-rate-calc.ts:483` 다필지 분기의 `calcReductions` 호출이 14개 positional
인자만 전달하고 `assetContractDate`(§97의2·§97의5 계약일 시한·하이브리드 contractDate fallback)를
누락. 메인 경로(finalize)는 전달.

### 현황 / 판단
- **다필지=토지, §97 임대·하이브리드=주택 감면 → 법적 양립 불가 조합 → numeric 영향 0.**
- positional 인자 17개 — 잘못 추가 시 인자 순서 어긋남 위험. 가치 대비 위험으로 P4(선택).

### 작업 (진행 시)
- `calcReductions` 시그니처를 **options 객체**로 리팩터링(positional 17개 → named)하는 큰 작업과
  묶어서만 진행 권장. 단독 1줄 추가는 인자 순서 위험 대비 가치 낮음.

### 규모: XS(1줄) 또는 L(시그니처 리팩터링 동반)

---

## 권장 진행 순서

1. **F-1**(P1, UX 결함 — §98의7과 동형, 즉시 가치) → 단독 PR
2. **F-2 + F-3**(P2 리팩터링 — 회귀 0 기준, 묶어서 1 PR 또는 각각)
3. **F-4 + F-5**(P3 충실도·일관성 — 묶어서 1 PR)
4. **F-6**(P4 — calcReductions options 리팩터링 시 동반, 단독 보류)

각 작업은 anchor 우선 검증(`feedback_pre_anchor_verification`) + 14지점 해당 시 동기화 +
전체 vitest 회귀 0 + `scripts/ship.sh` 머지 워크플로 준수.
