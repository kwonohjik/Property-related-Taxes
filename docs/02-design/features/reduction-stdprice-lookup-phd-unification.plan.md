# 감면소득금액 차감 조문 — 기준시가 조회형 위젯 + PHD 3시점 환산 통일 계획서

> 작성일: 2026-07-27 · 대상: 소득세법 §90② 감면소득금액 차감(5년 안분) 방식 조문
> 목표: §99의3(`New993InputForm`, 이미지53)의 **조회형 기준시가 위젯 + PHD 환산** UX를 나머지 감면소득금액 차감 조문으로 통일
>
> **확정 스코프 (2026-07-27 사용자 결정)**: **7개 조문** — §99·§98의3·§98의5·§98의6·§98의7·§98의8·§99의2. **§99의4 제외**(5년 안분 구조 부재). 그룹 B(미분양) PHD 적용 여부는 **Phase 0 법령판정 후 확정**.

---

## 1. 배경 · 목표

§99의3 신축주택 과세특례 입력폼만 기준시가 입력이 **조회형**(연도 드롭다운 + 공시가격/공시지가 조회 버튼 + 자동채움)으로 되어 있고, PHD(최초공시 전 취득) 3시점 환산(§164⑤)이 배선되어 있다. 나머지 감면소득금액 차감 조문은 전부 순수 수동 `<CurrencyInput>` 타이핑이다.

**목표**: 나머지 조문의 기준시가 입력을 §99의3과 동일하게 통일한다.
1. **조회형 기준시가 위젯** — 3시점(취득 당시 / 5년 되는 날 / 양도 당시) 각각 `HousingStdPriceLookupField`로 교체
2. **PHD 3시점 환산** — 신축주택 성격 조문에 `ReductionPhdInput` 배선 (취득시 기준시가 echo 자동 산출)

---

## 2. 현황 실측 (근거 file:line)

### 2-1. §99의3 참조 아키텍처 (배선 완료 모델)

| 지점 | 위치 | 내용 |
|---|---|---|
| 타입 | `lib/stores/calc-wizard-asset-reduction.ts:83-124` | `new_99_3` variant — 3시점 필드(`standardPriceAtAcquisition993`/`standardPriceAt5Years`/`standardPriceAtTransfer993`) + **PHD 8필드**(`phdMode993`, `phdFirstDisclosureDate993`, `phdFirstDisclosurePrice993`, `phdLandAreaSqm993`, `phdLandPricePerSqmAtAcq993`, `phdLandPricePerSqmAtFirst993`, `phdBuildingStdAtAcq993`, `phdBuildingStdAtFirst993`) |
| UI 폼 | `components/calc/transfer/New993InputForm.tsx` | `HousingStdPriceLookupField` ×3(취득 189, 5년 279, 양도 294) + `ReductionPhdInput`(122) + 취득시 기준시가 echo/조회 분기(172-202) |
| PHD 위젯 | `components/calc/transfer/ReductionPhdInput.tsx` | `LandPriceLookupField` ×2 + `BuildingStdPriceModalButton` ×2 + §164⑤ 환산 결과박스. 주석(17행): "향후 §99·§98의3·§98의5·§98의6·§98의7·§98의8·§99의2 재사용" |
| 호출부 | `UnifiedReductionPanel.tsx:612-622` | 자산 props 전달: `acquisitionDate`·`transferDate`·`jibun`(=assetJibun)·`dong`·`ho`·`assetPhdSnapshot` + `onUpdate993`·`onUpdate993Many` |
| API 변환 | `lib/calc/transfer-tax-api-reductions.ts:107-155` | `phdMode993 && canCalcReductionPhd(...) ? calcReductionAcquisitionStdPrice(...).estimatedAcquisitionStdPrice : parseAmount(standardPriceAtAcquisition993)` — **API 단에서 환산 완료 후 엔진에 취득기준시가만 전달** |
| 엔진 | `lib/tax-engine/transfer-reductions/` | **PHD 필드 없음** — 엔진은 환산된 취득기준시가만 받음 (계산 로직 무변경) |

### 2-2. 대상 조문 현황

| 조문 | 폼 파일 | 5년 안분(3시점) | 현재 기준시가 입력 | PHD |
|---|---|---|---|---|
| §99 | `New99InputForm.tsx:96-142` | ✅ (`...99` + 종전주택 1) | 🔴 CurrencyInput ×3 + **종전주택 1**(별개 물건) | ❌ |
| §98의3 | `Unsold983InputForm.tsx:175-196` | ✅ (`...983`) | 🔴 CurrencyInput ×3 | ❌ |
| §98의5 | `Unsold985InputForm.tsx:110-131` | ✅ (`...985`) | 🔴 CurrencyInput ×3 | ❌ |
| §98의6 | `Unsold986InputForm.tsx:176-195` | ✅ (`...986`) | 🔴 CurrencyInput ×3 | ❌ |
| §98의7 | `Unsold987InputForm.tsx:114-136` | ✅ (`...987`) | 🔴 CurrencyInput ×3 | ❌ |
| §98의8 | `Unsold988InputForm.tsx:143-165` | ✅ (`...988`) | 🔴 CurrencyInput ×3 | ❌ |
| §99의2 | `Unsold992InputForm.tsx:202-224` | ✅ (`...992`) | 🔴 CurrencyInput ×3 | ❌ |
| **§99의4** | `New994InputForm.tsx:76-80` | ❌ **없음** | 🔴 CurrencyInput ×1 (`ruralHouseStdPrice` 합계) | ❌ |

**호출부 공통 결함**: 위 폼들(이번 대상 7개 + §99의4)은 `UnifiedReductionPanel.tsx:675-741`에서 **`value`+`onChange`만** 받는다. 조회형 위젯이 요구하는 자산 props(`jibun`/`dong`/`ho`/`acquisitionDate`/`transferDate`)가 전달되지 않는다. (스코프에는 이미 `assetJibun`·`assetDong`·`assetHo`·`acquisitionDate`·`transferDate`·`assetPhdSnapshot` 존재 — 612-621에서 §99의3에 전달 중)

---

## 3. 스코프 분류 — 조문별 적용 범위

| 그룹 | 조문 | 조회형 위젯 | PHD 3시점 환산 | 근거 |
|---|---|---|---|---|
| **A. 신축주택 (3시점 + PHD 필수)** | §99, §99의2 | ✅ ×3 | ✅ 필수 | 신축주택 취득 시 최초공시 전 취득 흔함 — §99의3과 동일 성격 |
| **B. 미분양 (3시점 + PHD)** | §98의3·§98의5·§98의6·§98의7·§98의8 | ✅ ×3 | ✅ **적용 확정**(Phase 0) | 전부 신축주택 성격 — 아래 Phase 0 판정 |
| C. 단일 기준시가 | §99의4 | 🕒 후속 | ❌ | **이번 작업 범위 제외 · 후속 작업으로 보류 (2026-07-27 결정)**. 5년 안분 구조 없음 → 단일 `ruralHouseStdPrice` 조회형 전환만 별건 처리 |

### Phase 0 완료 — 그룹 B PHD 법령 판정 (2026-07-27, KoreanLaw 조특법 mst=280409 원문 실측)

**판정 기준**: 취득 대상이 신축주택(사업주체 신규 건설·공급 → 취득 당시 주택가격 최초공시 전 가능)인가 — §99의3 PHD 전제와 동일.

| 조문 | 취득 대상 주택 (원문 근거) | PHD 판정 |
|---|---|---|
| §98의3 | ①「주택법」§54 사업주체 공급 미분양주택 + **②자기가 건설한 신축주택**(2009.2.12~2010.2.11 착공·사용승인) | ✅ **강한 필요**(②자가건설 신축 = 최초공시 전 취득 명백) |
| §98의5 | 사업주체 공급 미분양주택(수도권 밖) | ✅ 필요 |
| §98의7 | 사업주체 공급 미분양주택 9억↓ | ✅ 필요 |
| §98의6 | 준공후미분양주택(사용검사 후 미분양·임대 요건) | 🟡 필요·발동 빈도 낮음 |
| §98의8 | 준공후미분양주택(사용검사 후 2014.12.31까지 미분양) | 🟡 필요·발동 빈도 낮음 |

**결론**: 5개 조문 **전부 PHD 위젯 배선 타당**. 전부 사업주체 신규 공급(또는 자가건설 §98의3②) 신축주택이며, `ReductionPhdInput`이 "취득일 < 최초공시일 자동 감지 후 활성화"라 준공후미분양(§98의6/8)처럼 발동 빈도 낮은 조문도 위젯 제공은 무해하고 실제 발동은 개별 취득일로 자동 판정. → **조회형 위젯 + PHD 모두 대상 7개 조문 전부 확정 적용**.

---

## 4. 조문당 변경 지점 — 14 동기화 지점 (§99의3 패턴 복제)

**교체 대상 = 기준시가 3시점 섹션 + PHD 위젯 한정. 각 조문 기존 자격·면적·계약 섹션은 무변경.** (§99의3 고유 요소인 취득유형 1호/2호·소재지·거주자·주택건설사업자 토글은 각 조문에 없거나 다름 → 복제 대상 아님.)

3시점 조문 1건당 아래를 반복한다. 접미사 `XX` = `99`/`983`/`985`/`986`/`987`/`988`/`992`. (참조 모델 §99의3의 5년 필드만 접미사 부재(`standardPriceAt5Years`) — 대상 7조문은 전부 접미사 보유, 무영향.)

### 클라이언트 8지점
1. **① 타입** `calc-wizard-asset-reduction.ts` — 해당 variant에 PHD 8필드 추가 (`phdModeXX`, `phdFirstDisclosureDateXX`, `phdFirstDisclosurePriceXX`, `phdLandAreaSqmXX`, `phdLandPricePerSqmAtAcqXX`, `phdLandPricePerSqmAtFirstXX`, `phdBuildingStdAtAcqXX`, `phdBuildingStdAtFirstXX`) — 전부 `?` optional
2. **② initial** `makeDefaultAsset*` / 해당 variant 생성부 — PHD 필드 optional이라 기본값 생략 가능(확인 후 결정)
3. **③ normalize** `calc-wizard-asset-migrate.ts` — 기존 sessionStorage에 PHD 필드 부재 시 undefined 허용(optional이라 무변경 가능성 높음 — 실측 확인)
4. **④ API 변환** `transfer-tax-api-reductions.ts` — 해당 조문 블록에 §99의3(107-155) PHD 환산 블록 복제: `phdInputXX` 구성 → `phdModeXX && canCalcReductionPhd ? 환산 : parseAmount(standardPriceAtAcquisitionXX)` → 엔진 input `standardPriceAtAcquisitionXX = acqStdPriceXX`
5. **⑤ UI 위젯** 각 `*InputForm.tsx` —
   - props 시그니처 확장: `acquisitionDate`·`transferDate`·`jibun`·`dong`·`ho`·`assetPhdSnapshot`·`onUpdateMany` 추가
   - 3시점 `CurrencyInput` → `HousingStdPriceLookupField` ×3 교체 (referenceDate: 취득=acquisitionDate, 5년=`addYearsStr(acq,5)`, 양도=transferDate)
   - `ReductionPhdInput` 추가(그룹 A·B) + 취득시 기준시가 echo/조회 분기 (New993 172-202 복제)
   - **면적 싱크(`onExclusiveArea`) 대상 필드는 조문별 상이 — 아래 §4-A 매핑표 준수** (신규 면적 필드 신설 최소화, 기존 필드 재사용)
6. **⑥ 사이드바 합계** — 해당 없음(감면 폼은 사이드바 합계 미반영 — 확인)
7. **⑦ 결과 카드** `NewHousingReductionDetailCard.tsx` 등 — PHD 환산 산출근거 echo 표시 필요 시 §99의3 참조(선택)
8. **⑧ Validation** `transfer-tax-validate-reductions.ts` — PHD 모드 ON 시 `standardPriceAtAcquisitionXX` 필수 완화(echo 자동산출). **⚠️ validate 구조가 조문별 3종으로 이질적**(§99의3 인라인 113-125 / 미분양 공통헬퍼 `failIfStdPriceMissingOver5Y` 220·230·248·259·276 / §99 단순 `<=0` 185) → "§99의3 패턴 단순 복제" 불가. 조문별 현행 구조 실측 후 반영, 미분양은 `failIfStdPriceMissingOver5Y`에 `phdMode` 인자 추가 검토. API fallback ↔ validate 동일 fallback 필수(`feedback_validation_sync_8th_point`)

> **⚠️ 설계 결정 (Phase 2 환류, 2026-07-27) — A설계 채택**: PHD 환산은 **클라이언트 API 변환(`transfer-tax-api-reductions.ts`)에서 완결**되어 **환산된 취득기준시가만 body로** 간다. phd 원본 8필드는 body에 전달하지 **않는다**(A설계). 이유: 대상 엔진(§99 등 `New99Input`)은 phd 필드를 받지 않으므로(엔진 무변경), phd를 서버로 보낼 필요가 없다. **결과: ⑫ Zod·⑭ Route mapper의 phd 배선이 불필요**해지고, 자가검토가 지적한 "침묵 strip" Critical은 A설계에서 성립하지 않는다(보내지 않으니 strip될 것도 없음). 대신 **명세서 PHD 산출근거 echo는 생략**(§4-⑦ optional). — phd echo를 결과 명세서에 표시하려는 조문만 §99의3형 **B설계**(phd를 body로 전달)를 쓰며, 그때만 ⑫⑭ phd 배선이 필요하다. §99 파일럿은 A설계로 구현 완료(phd 필드는 폼 타입①·API변환④·validate⑧에만 존재, 서버 미전달).

### API/Route 6지점 (⑨~⑭ — TypeScript 미감지, 침묵 strip 위험 · B설계 시)
9. **⑨⑩ Zod enum** — 감면 discriminatedUnion에 조문 리터럴 이미 존재(신규 추가 아님, 확인만)
10. **⑪ 자산-수준 fallback** — 해당 없음(감면 폼은 자산-수준 acquisitionDate fallback 대상 아님, 확인)
11. **⑫ Zod 입력객체(강제)** `lib/api/transfer-tax-schema-reductions.ts` — **§99의3만 phd 8필드 존재(195-198행), 대상 7조문 객체엔 없음**(`new_99` 149·`unsold_98_3` 245·`unsold_98_5` 276 등 phd 0건). 각 조문 Zod 객체에 phd 8필드 추가(`phdModeXX: z.boolean().optional()` / `phdFirstDisclosureDateXX: z.string().date().optional()` / 금액 `z.number().int().nonnegative().optional()` 등 §99의3 195-198 형식). **미추가 시 body 침묵 strip → 엔진 미도달 → PHD 환산 무효 → 과다과세** (`feedback_api_zod_schema_sync`)
12. **⑬ body spread** `callTransferTaxAPI` — 감면 배열 통째 전달 구조면 개별 spread 불필요(확인). PHD 필드가 폼→body 경로에서 누락되지 않는지 확인
13. **⑭ Route 엔진 매핑(강제)** `app/api/calc/transfer/route-reductions-mapper.ts` — **§99의3만 `new_99_3` 브랜치 존재(163행, Date coerce 포함)**. 각 조문에 date형 PHD 필드(`phdFirstDisclosureDateXX`) Date 변환 브랜치 추가. 미추가 시 `Date < string` silent-false 함정(`lib/api/date-coerce.ts` 정책). API 변환이 phd 필드를 엔진 input에 echo 전달하는지(§99의3 138-154)도 조문별 대응

### 호출부 (UnifiedReductionPanel)
14. 각 폼 렌더부(675-741)에 자산 props 전달 + `onUpdateXXMany` 핸들러 신설(단일 배치 update — `feedback_multikey_patch_stale_spread_overwrite`)

### 엔진 (계산 로직 무변경)
- `lib/tax-engine/transfer-reductions/` 각 조문 input에 PHD **계산 필드 불필요** — 환산은 ④ API 단 완료. 단 결과 명세서에 PHD 산출근거 echo가 필요하면 input에 optional echo 필드 추가(그룹 A·B, `echo-field-pattern` 스킬).

### §4-A. 조문별 면적 싱크(`onExclusiveArea`) 대상 필드 매핑 (실측)

`HousingStdPriceLookupField.onExclusiveArea` / 전용면적 조회 버튼이 write할 필드가 조문마다 다르다. 균일 복제 시 §98의5/§98의7은 write 대상이 없어 타입 에러/기능 누락.

| 조문 | 기존 면적 필드 | onExclusiveArea 처리 |
|---|---|---|
| §99 | `exclusiveAreaSqm99` | 기존 필드 재사용 |
| §98의8 | `exclusiveAreaSqm988` | 기존 필드 재사용 |
| §99의2 | `exclusiveAreaSqm992` | 기존 필드 재사용 |
| §98의3 | `floorAreaSqm983` + `landAreaSqm983` | 전용면적 성격 판정 후 재사용 or 콜백 생략 |
| §98의6 | `floorAreaSqm986` | 성격 판정 후 재사용 or 생략 |
| **§98의5** | **면적 필드 없음** | (a) `exclusiveAreaSqm985` 신규(①타입) or (b) `onExclusiveArea` 생략 — 택일 |
| **§98의7** | **면적 필드 없음** | (a) `exclusiveAreaSqm987` 신규(①타입) or (b) `onExclusiveArea` 생략 — 택일 |

> **면적 단일출처(강제)**: 기존 면적 필드 보유 조문(§98의3/6 등)은 조회형 면적을 **기존 필드에 양방향 read/write** — 신규 면적 필드 신설 금지(`feedback_ui_engine_dual_truth_avoidance`). PHD 위젯 내부 `landAreaSqm`(토지면적)과 전용면적은 의미가 다르므로 혼용 금지.

### §4-B. testid 접두사 규칙 (E2E 셀렉터 안정)

§99의3은 `new993-stdprice-{acq,5y,transfer}`·`new993-stdprice-acq-echo`·`new993-area-lookup-btn`·`new993-area-status`. 각 조문 접두사를 아래로 고정한다.

| 조문 | testid 접두사 |
|---|---|
| §99 | `new99-*` |
| §98의3 | `unsold983-*` |
| §98의5 | `unsold985-*` |
| §98의6 | `unsold986-*` |
| §98의7 | `unsold987-*` |
| §98의8 | `unsold988-*` |
| §99의2 | `unsold992-*` |

공용화(§4-C) 채택 시 `testidPrefix` prop 주입으로 자동 일관.

### §4-C. 공용 서브컴포넌트 추출 — 복제 7회 vs 공용화 (트레이드오프)

7개 조문이 "3시점 조회형 + PHD + echo + 전용면적" 블록(New993 172-331, ~160줄)을 반복한다.

- **복제 7회**: 즉시 단순·조문 독립. 단 ~160줄×7≈1120줄 중복, 위젯 변경 시 7곳 동기 수정, 각 폼 800줄 정책 압박.
- **공용화(`ReductionStdPriceSection`)**: §99 파일럿 1회 추상화 후 Phase 3~4는 접미사 mapper 주입만 → 조문당 ~30줄. **실현 선례 확인**: `ReductionPhdInput`이 이미 generic `ReductionPhdValue` ↔ 접미사 `phd*993`을 명시 patch-mapper로 어댑팅(New993 127-148) → 동일 패턴을 `HousingStdPriceLookupField` 3시점 묶음에 적용 가능. props: generic `{acq,fiveYear,transfer}` value + onChange mapper + `testidPrefix` + `areaKey`(§4-A 대응) + 자산 props.
- **권장: 공용화** — §4-A(면적 싱크)·§4-B(testid)·`addYearsStr` 헬퍼 중복이 동시 해소, 800줄 리스크 완화. Phase 2(§99)에서 추출.

---

## 5. 작업 순서 (Phase)

- **Phase 0 — 법령 판정 (그룹 B)**: ✅ **완료(2026-07-27)** — 조특법 원문(mst=280409) 실측 결과 §98의3·5·6·7·8 전부 신축주택 성격 → PHD 5개 조문 전부 배선 확정(§3 Phase 0 표). 준공후미분양(98의6/8)은 발동 빈도 낮음. (§99의4는 대상 제외 — 작업 없음)
- **Phase 1 — Pre-Do anchor**: ✅ **완료(2026-07-27)** — `__tests__/tax-engine/transfer-tax/new-99-phd-linkage.anchor.test.ts` 3건 GREEN. 입증: (A-1) PHD 환산 `547,010,030`(§164⑤·이미지53 일치), (A-2) 그 값을 §99 `standardPriceAtAcquisition`에 투입 → 5년 후 안분 `reducibleTransferIncome=130,023,498`((+,+) 정상), (A-3) 취득기준시가가 안분 실질 인자(PHD값≠수동값). **환류 결론: §99 엔진 무변경으로 PHD 환산값을 취득기준시가로 받아 정상 안분 — 계획서 "엔진 무변경, 환산은 API 단" 전제 검증됨. 남은 작업은 UI/API 배선(⑤⑫⑭)뿐.**
- **Phase 2 — §99 (파일럿 + 공용화)**: 그룹 A 대표 1건 전체 14지점 구현. **§4-C 권장대로 `ReductionStdPriceSection` 공용 서브컴포넌트를 이 단계에서 추출**(접미사·`areaKey`·`testidPrefix` mapper 주입 구조) → tsc 0 → anchor GREEN → 회귀. 이 컴포넌트를 Phase 3~4 복제 템플릿으로 확정. §99 종전주택 기준시가는 수동 유지(§6-4).
- **Phase 3 — §99의2**: 그룹 A 잔여 — Phase 2 공용 컴포넌트에 `992` mapper 주입.
- **Phase 4 — 그룹 B 확정분**: Phase 0에서 PHD 타당 판정된 조문(조회형 + PHD). PHD 부적용 판정분은 조회형 위젯만.
- **Phase 5 — 통합 회귀**: `npx vitest run __tests__/tax-engine/transfer/` 전체 + tsc 0 + `ui-engine-sync-checker`.

---

## 6. 리스크 · 함정

1. **자산 props 부재(핵심)**: 대상 7개 폼 모두 `value`+`onChange`만 받음 → props 시그니처 확장 + 호출부 배선이 각 조문 필수 선행 작업.
2. **⑫⑭ 침묵 strip(Critical)**: PHD 8필드를 `transfer-tax-schema-reductions.ts` Zod 객체(⑫)와 `route-reductions-mapper.ts` Date 브랜치(⑭)에 조문별로 추가하지 않으면 TypeScript가 못 잡고 body가 침묵 strip → 엔진 미도달 → PHD 환산 무효 → **과다과세**. §4-⑫⑬⑭ self-grep 필수(`feedback_api_zod_schema_sync`).
3. **다중키 patch stale spread**: PHD "취득·최초고시 모두 적용" 시 `onUpdateMany` 단일 배치 필수. 개별 `onUpdate` 연속 호출 금지 (`feedback_multikey_patch_stale_spread_overwrite` — §99의3 137-148 주석).
4. **§99 종전주택 기준시가**: `previousHouseStdPrice99`(변형 ON 시 분모)는 **별개 물건(재개발 종전주택)** → 양도물건 자산 주소·취득일로 조회 불가 → **조회형/PHD 제외, 수동 CurrencyInput 유지**(New99InputForm.tsx:141-144).
5. **§98의5·§98의7 면적 필드 부재**: 두 조문은 면적 필드가 없어 `onExclusiveArea` write 대상 없음 → §4-A대로 신규 필드 추가 or 콜백 생략 택일(균일 복제 시 타입 에러).
6. **§99의4 구조 상이**: 3시점·5년 안분 없음 → 이번 대상 제외, 후속 작업 보류(§8).
7. **그룹 B PHD 법령 타당성**: ✅ Phase 0 완료 — 5개 조문 전부 신축주택 성격으로 PHD 타당 확정(§3 Phase 0 표, 조특법 원문 실측). 준공후미분양(98의6/8)은 발동 빈도 낮으나 위젯 제공 무해(자동 판정).
8. **접미사 반복 오타**: `XX` 접미사가 조문마다 상이 → enum/필드명 grep 검증 (`enum-verification-before-mapping` 스킬).
9. **API fallback ↔ validate 동기화(⑧)**: PHD echo로 취득기준시가 자동산출 시, validate도 동일 fallback 인식(UI 통과 ↔ validate 차단 모순 방지, `feedback_validation_sync_8th_point`). ⚠️ validate 구조 조문별 3종 이질(§4-⑧).
10. **800줄 정책**: `HousingStdPriceLookupField`·`ReductionPhdInput` 추가로 폼 파일 증가 → 800줄 초과 시 섹션 분리. 공용화(§4-C) 채택 시 완화.
11. **mirror-pattern**: PHD echo는 display fallback + API/validate 3중 fallback으로 구현, `useEffect → store` 미러링 금지.

---

## 7. 검증 · 성공 기준

- [ ] **Phase 0**: 그룹 B 각 조문 PHD 타당성 KoreanLaw 근거로 확정 (표에 file/조문 명시)
- [ ] 조문별 anchor: PHD 환산 취득기준시가 → 5년 안분 감면소득금액 원단위 `toBe` (§99의3 anchor 구조 참조)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 전체 GREEN (무회귀)
- [ ] 14 동기화 지점 self-grep (특히 ⑫ Zod·⑬ body·⑭ Route mapper 침묵 strip) — 조문별
- [ ] §4-A 면적 싱크 매핑 준수(§98의5/7 처리 확정), §4-B testid 접두사 일관
- [ ] `ui-engine-sync-checker` 누락 0
- [ ] 브라우저 수동 확인: 각 조문 폼에서 조회 버튼 → 자동채움 → PHD echo → 계산 결과 (Network 탭 request body PHD 필드 확인)
- [ ] 최종: 7개 조문 기준시가 3시점 입력이 이미지53 형식과 일치(조회형 + PHD echo), 순수 수동 CurrencyInput 3시점 잔존 0 (§99 종전주택 기준시가는 별개 물건 → 수동 유지, 대상 아님)

---

## 8. 확정 · 미확정 사항

**확정 (2026-07-27)**
1. **이번 작업 대상 = 7개 조문** — §99·§98의3·§98의5·§98의6·§98의7·§98의8·§99의2.
2. **그룹 B PHD 확정(Phase 0 완료)** — 조특법 원문 실측 결과 §98의3·5·6·7·8 전부 신축주택 성격 → **조회형 위젯 + PHD 모두 7개 조문 전부 적용**. 준공후미분양(98의6/8)은 발동 빈도 낮으나 자동 판정으로 무해.

**후속 작업으로 보류**
3. **§99의4(단일 기준시가)** — 5년 안분·3시점·PHD 부적용. 단일 `ruralHouseStdPrice` 조회형 전환은 이번 작업 완료 후 별건으로 처리.

**미확정 (Phase 진행 중 결정)**
4. 결과 명세서에 PHD 환산 산출근거 echo 표시 필요 여부(그룹 A·B) — Phase 2 파일럿에서 §99의3 결과카드와 대조해 결정.
