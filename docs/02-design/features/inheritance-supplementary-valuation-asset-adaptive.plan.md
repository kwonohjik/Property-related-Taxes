# 상속 취득가액 — 보충적평가 보조계산 자산구분별 가변화 + 공시가격(Vworld) 조회 배선 계획

작성일: 2026-07-08 · 대상: 양도소득세 상속 취득가액(post-deemed) UI · 범위: **UI-only(확정)**

## 0. 독립 검토 반영 (2026-07-08, 코드+법령 2트랙)

- **[법 2a] 미공시 주택 block1 숨김의 근거 정정**: "이중계상/조회 무의미"가 아님. 부수토지 이중계상 논리는 **공시 주택(≥2005.4.30) 한정**이고, 1990.8.30~2005.4.30 미공시 주택의 ①(상증법 §60~66 평가액)은 오히려 토지+건물 합산이 정확 방식. 따라서 숨김의 정당한 근거는 **"공시가격 부존재 + 신고가액 직접입력으로 충분(YAGNI)"**. §6·안내 문구를 이 근거로 정정.
- **[법 3] 미공시 토지 대칭 처리(누락 보완)**: §163⑨1호(토지)·2호(주택) 병렬 구조. 미공시 토지(<1990.8.30, 개별공시지가 부존재)도 주택과 **대칭**으로 보조계산 숨김+안내. → 통합 게이트 `isPreDisclosure`(토지 <1990.8.30 / 주택 <2005.4.30) 도입.
- **[법 1] 스코프 명시**: 이 블록은 `inheritanceAssetKind` enum **3종(토지·개별주택·공동주택)만** 커버. 일반건물·오피스텔·상가 상속(§61①2·3호)은 이 라디오/경로 밖 → 본 계획 범위 외로 명시.
- **[법 2b] 공동주택가격 최초공시일**: 단일 상수 `HOUSE_FIRST_DISCLOSURE_DATE="2005-04-30"`은 **기존 block 2 공유 상수**(본 변경이 신설 아님). 공동주택가격 실제 최초공시일 상이 가능성은 후속 확인 항목(본 UI 변경 무관).
- **[코드 a] 합산 site 3곳 정정**: `reportedPatch`(:74-78) 외 **토글 ON onCheckedChange(:198-202)·합산 프리뷰(:254-267)** 도 자산구분 인지형으로. 주택은 building 단독(토지 미가산).
- **[코드 b] `LandPriceLookupField` 면적 위젯 없음**: 단가+조회+토지기준시가 표시만. → `supplementaryLandArea` DecimalInput **별도 유지**, `area={parseFloat(...)}`(number)·`onAreaChange` 전달. `landTotal` 자체계산 유지(publishedValueAtInheritance 소스).
- **[코드 c] `StandardPriceInput` 주택=총액(원) 출력 확정**: `onTotalPriceChange`가 총액 반환, `jibun=asset.addressJibun`·`dong/ho=asset.addressDong/Ho`. 직접 write 가능(BLOCKER 아님 — 주소는 자산-수준 `addressJibun`(`calc-wizard-asset.ts:127`) 존재).
- **[코드 파일명 정정]** factory=`lib/stores/calc-wizard-asset-factory.ts:277-280`, migrate=`lib/stores/calc-wizard-asset-migrate.ts:329-332`. **2차 legacy 경로** `lib/stores/calc-wizard-migration.ts:111-116`(publishedValueAtInheritance→supplementary 자동분류)를 R2에 포함.

## 1. 배경 / 목표

의제취득일 이후(post-deemed) 상속 취득가액 입력의 "보충적평가 보조계산 사용"(`PostDeemedInputs.tsx`) 블록은 **자산구분과 무관하게 고정 필드 구조**(토지 개별공시지가×면적 + 건물·주택 공시가격 합산)로 표시된다. 이는 두 가지 문제를 낳는다.

1. **부수토지 이중계상 소지**: 주택(개별·공동주택)의 상증법 §61 평가액은 고시주택가격 단일값이며 **부수토지가 이미 포함**된다. 그런데 현재 UI는 주택 자산에도 "토지 개별공시지가×면적" 라인을 함께 노출·합산하므로, 사용자가 토지를 별도 입력하면 부수토지를 이중계상한다.
2. **조회 미배선**: 개별공시지가·주택공시가격 입력칸이 전부 수동 입력이다. Vworld 조회 인프라는 이미 존재하나 이 블록에 배선되어 있지 않다.

**목표**: 보충적평가 보조계산 블록을 **자산구분(`inheritanceAssetKind`)에 따라 가변 노출**하고, 각 입력칸에 **기존 Vworld 조회 기능을 배선**한다.

## 2. 법령 근거 (KoreanLaw 원문 검증 완료)

| 항목 | 결과 | 근거 |
|---|---|---|
| 토지 = 개별공시지가 | 확인 (§61 본문에 "×면적" 명문은 없음 — 단가이므로 실무상 면적 곱) | 상증법 §61①1호 |
| 일반건물 = 국세청장 산정·고시 기준시가 | 확인 | 상증법 §61①2호 |
| **주택 = 고시주택가격(개별·공동) 단일, 토지 별도 가산 없음, 부수토지 일체** | **확인** | 상증법 §61①4호 + 소령 §164⑦ "(이들에 부수되는 토지를 포함한다)" |
| 미공시 주택 취득당시 기준시가 = §164⑦ 환산(§164⑤ 준용) | 확인 (구조) | 소령 §164⑦ — **block 2가 담당** |
| 취득가액 = **max(① 상증법 §60~§66 평가액, ② 소령 §164⑤~⑦)** | 확인 ("중 많은 금액") | 소령 §163⑨2호 |

**미확정 2건**(구현 영향 없음, 이미 코드에 반영된 가정):
- §164⑤·⑦ 환산 산식의 정확한 분자·분모 문언(원문이 수식 이미지로 미렌더) — 그러나 이는 **block 2(§164⑦ 3시점 환산)** 소관이며 본 계획의 변경 대상 아님.
- 개별주택가격(2005.4.30)·공동주택가격 최초 공시일 — 조문 미수록. 코드베이스는 이미 `HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30"` 상수 사용(기존 가정 유지).

**핵심 결론**: 주택은 고시주택가격 단일값으로 §61 평가하고 토지를 별도 가산하지 않는다 → 현재 "토지+건물 합산" 고정 구조는 주택 자산에 대해 상증법상 부정확.

## 3. 현행 코드 실측 (file:line)

### block 1 — 보충적평가 보조계산 (`components/calc/transfer/inheritance/PostDeemedInputs.tsx`)
- ToggleCard "보충적평가 보조계산 사용": `:182-270`, 내부 렌더 게이트 `asset.useSupplementaryHelper`(`:209`), 블록 게이트 `isSupplementary = method === "supplementary"`(`:55, :182`).
- 개별공시지가: `CurrencyInput` → `supplementaryLandUnitPrice`(`:217-223`) — **조회 없음**.
- 면적: `DecimalInput` → `supplementaryLandArea`(`:226-228`).
- 토지 보충평가액(읽기전용): 로컬 `landTotal` state = `floor(단가×면적)`(`:65-69, :232-237`).
- 건물·주택 공시가격: `CurrencyInput` → `supplementaryBuildingValue`(`:245-251`) — **조회 없음**.
- `reportedPatch`(`:74-78`): `total = landTotal + buildingValue` → `publishedValueAtInheritance` patch. 3개 onChange 핸들러가 직접 patch(`:80-107`, memory `mirror-pattern` 준수).
- **자산구분 미참조**: block 1은 `inheritanceAssetKind`를 전혀 읽지 않음 → 고정 구조.

### 자산구분 enum / 세팅
- `inheritanceAssetKind: "land" | "house_individual" | "house_apart"` — `lib/stores/calc-wizard-asset.ts:90`.
- 라디오 세팅: `CompanionAcqInheritanceBlock.tsx:167-177`(`valuationMode==="auto"`일 때 노출).

### block 2 — §164⑦ 3시점 환산 (변경 대상 아님, 참조)
- `HouseValuationSection.tsx`, 노출 게이트 `showHouseValuation = isHouse && inheritanceDate < "2005-04-30"`(`PostDeemedInputs.tsx:61-62`).
- 미공시 주택의 ② 취득당시 기준시가를 담당.

### Vworld 조회 인프라 (이미 존재 — 재사용 대상)
- Route: `app/api/address/standard-price/route.ts` — **Vworld NED**(`api.vworld.kr/ned/data`) 프록시. `propertyType={housing|land}`, `year`, `pnu|jibun`, `dong`, `ho`.
  - 토지: `getIndvdLandPriceAttr`(개별공시지가 단가).
  - 주택: `getApartHousingPriceAttr`(공동주택가격) → `getIndvdHousingPriceAttr`(개별주택가격) fallback.
- 훅: `lib/hooks/useStandardPriceLookup.ts` (`propertyType` 래핑).
- 컴포넌트: `components/calc/inputs/StandardPriceInput.tsx` — `propertyKind: house_individual | house_apart` 지원, **이미 pre-deemed 상단 블록에서 주택 조회에 사용 중**(`CompanionAcqInheritanceBlock.tsx:210-221`).
- 개별공시지가 공용 조회 컴포넌트: `components/calc/inputs/LandPriceLookupField.tsx`(CLAUDE.md 규정: 개별공시지가 필드는 이 컴포넌트 필수 — 현재 block 1은 규정 위반 상태).

### 14 동기화 지점 배선 현황
- `useSupplementaryHelper`/`supplementaryLandUnitPrice`/`supplementaryLandArea`/`supplementaryBuildingValue`: 타입 `calc-wizard-asset-inheritance-acq.ts:33-39`, factory `:277-280`, migrate `:329-332`.
- `publishedValueAtInheritance`: 타입 `calc-wizard-asset.ts:119`, factory `calc-wizard-asset-factory.ts:67`, migrate `calc-wizard-migration.ts:45`.
- **엔진 송신**: supplementary 3필드는 **엔진 미송신(UI 보조계산 전용)**. 엔진에는 `publishedValueAtInheritance → reportedValue`만 전달(`transfer-tax-api-inheritance.ts:59-78`, `reportedMethod:"supplementary"` 하드코딩).
- validate: supplementary·publishedValueAtInheritance **검증 전무**(`transfer-validate*.ts` grep 0건).

## 4. 설계 — 자산구분별 가변 필드 매트릭스

block 1(보충적평가 보조계산)을 `inheritanceAssetKind`로 분기한다. **기존 폼 필드 재사용**(신규 필드 없음).

| 자산구분 | 노출 입력 | `publishedValueAtInheritance` 산출 | 재사용 필드 |
|---|---|---|---|
| `land`(토지) | 개별공시지가(원/㎡, **조회**) × 면적(㎡) → 토지 보충평가액 | `floor(단가 × 면적)` | `supplementaryLandUnitPrice`, `supplementaryLandArea` |
| `house_individual`(개별·다세대주택) | **개별주택가격 단일**(**조회**) | 입력값 그대로 | `supplementaryBuildingValue`(라벨 "개별주택가격"으로 정정) |
| `house_apart`(공동주택) | **공동주택가격 단일**(**조회**) | 입력값 그대로 | `supplementaryBuildingValue`(라벨 "공동주택가격") |

- **토지**: 건물·주택 공시가격 라인 제거. `reportedPatch` total = `landTotal` 단독.
- **주택**: 토지(단가·면적) 라인 제거 → 부수토지 이중계상 차단. `reportedPatch` total = `supplementaryBuildingValue` 단독.
- `reportedPatch`(`:74-78`)를 자산구분 인지형으로 수정:
  ```ts
  const isLand = asset.inheritanceAssetKind === "land";
  const total = isLand ? parseAmount(landTotalStr) : parseAmount(houseValueStr);
  ```
- 자산구분 변경 시(라디오) 보조계산 입력 초기화 정책은 기존 평가방법 변경 초기화(`:139-144`)와 동일 패턴 검토.

## 5. 설계 — Vworld 공시가격 조회 배선

기존 인프라 **재사용**(신규 route/훅 불필요).

- **주택(house_individual/house_apart)**: `StandardPriceInput`(`propertyKind={asset.inheritanceAssetKind}`)을 그대로 배선 → `supplementaryBuildingValue`에 write. 이미 pre-deemed 상단 블록에서 동일하게 쓰이므로 패턴 검증됨(`CompanionAcqInheritanceBlock.tsx:210-221`).
- **토지(land)**: 개별공시지가 칸을 `LandPriceLookupField`로 교체(CLAUDE.md "개별공시지가 필드는 LandPriceLookupField 필수" 규정 동시 충족). 이 컴포넌트는 기준연도 드롭다운 + Vworld 조회 + 토지기준시가 자동계산을 번들 → 면적/합산 관리 방식이 현재 로컬 `landTotal`과 다를 수 있으므로 **Do 단계에서 props(면적 내부 관리 여부·단가 출력 형식) 실측 후 배선**.
- **조회 기준 연도**: 보충평가 = 상속개시일 시점 → 조회 연도 = `asset.inheritanceStartDate` 연도. Pre-공시(토지 <1990.8.30 / 주택 <2005.4.30)는 Vworld 데이터 부존재 → 조회 실패 시 수동 입력(기존 컴포넌트 graceful 처리 재확인).
- **StandardPriceInput 출력 형식**(총액 원 vs 단가) Do 단계에서 확인 후 `supplementaryBuildingValue` write 매핑 확정.

## 6. 결정사항 (2026-07-08 확정)

- **Q1 — 미공시 자산에서 block 1 보조계산 처리** → **확정: 보조계산 숨김 + 안내 (토지·주택 대칭)**.
  **통합 게이트** `isPreDisclosure = (isLand && date < "1990-08-30") || (isHouse && date < "2005-04-30")`.
  `isSupplementary && isPreDisclosure`이면 보충적평가 보조계산 토글을 숨기고 안내 표시. "상속세 신고가액" 직접 입력 필드는 유지.
  - **근거(정정)**: 이중계상이 아니라 **해당 공시가격이 상속개시 시점에 부존재**해 조회·재구성 불가 + 실무상 신고서값 직접입력으로 충분(YAGNI). (1990.8.30~2005.4.30 주택은 토지+건물 합산이 원래 정확 방식이나, 그 편의를 별도 3필드 레이아웃으로 재현하는 것은 과복잡 → 직접입력으로 대체.)
  - 안내 문구: 토지 "상속개시일에 개별공시지가 미공시 → 신고가액 직접 입력" / 주택 "… 주택공시가격 미공시 → 신고가액 직접 입력, 취득당시 기준시가는 아래 §164⑦ 환산에서 산정".
  - 보조계산 노출 조건 = `isSupplementary && !isPreDisclosure`(공시 시점 자산만).
- **Q2 — 토지 조회 컴포넌트** → **확정(추천): `LandPriceLookupField`**(공용, CLAUDE.md "개별공시지가 필드 필수" 규정 충족, 토지기준시가 자동계산 포함). Do 단계 props 실측 후 배선.
- **Q3 — 자산구분 변경 시 보조계산 입력 초기화** → **확정(추천): 초기화**(토지↔주택 전환 시 stale 값 방지). 평가방법 변경 초기화(`:139-144`) 패턴 차용.

## 7. 14 동기화 지점 점검 — UI-only 확정

| 지점 | 변경 | 비고 |
|---|---|---|
| ① 타입 | 없음 | 기존 필드 재사용 |
| ② factory | 없음 | |
| ③ normalize/migrate | 없음(검토) | supplementaryBuildingValue 의미 변화(주택=단일값) 마이그레이션 호환 확인 |
| ④ API 변환 | 없음 | `publishedValueAtInheritance`만 엔진 송신 — 산출 방식만 UI에서 변경 |
| ⑤ UI 위젯 | **변경** | 자산구분 분기 + 조회 배선 |
| ⑥ 사이드바 | 확인 | post-deemed는 결과/`publishedValueAtInheritance` fallback(기존) — 산출식 불변이라 영향 없음 예상, 실측 |
| ⑦ 결과 카드 | 없음 | 엔진 결과 불변 |
| ⑧ validate | 없음 | 기존에도 미검증(보조계산=optional). 모순 없음 |
| ⑨~⑭ Zod/Route/엔진 | 없음 | 엔진 input 불변 |

→ **엔진·API·Zod 무변경. UI(⑤)와 reportedPatch, 조회 배선만.** 리스크 낮음.

## 8. 리스크

- **R1**: `LandPriceLookupField`가 면적·토지기준시가를 내부 관리하면 현재 `supplementaryLandArea`/`landTotal` 흐름과 충돌 가능 → Do 단계 props 실측 필수.
- **R2**: `supplementaryBuildingValue` 의미 변화(합산 피가산 → 주택 단일값). 기존 sessionStorage에 토지+건물 둘 다 저장된 자산이 있으면, 주택 자산으로 재해석 시 값 혼선 가능. 마이그레이션/초기화 정책(Q3)으로 완화.
- **R3**: 조회 실패(pre-공시 연도) UX — 빈 응답 시 수동 입력 안내가 자연스러운지 확인.
- **R4**: 자산구분 라디오는 `valuationMode==="auto"`에서만 노출 — `direct`(직접입력) 모드와의 상호작용 실측.

## 9. 검증 계획 (pre-Do anchor 우선 — memory `feedback_pre_anchor_verification`)

RTL(`__tests__/calc/`), 기존 `post-deemed-house-valuation-visibility.test.tsx` 패턴 재사용.

1. **anchor-1(자산구분 노출)**: `land`→토지(단가·면적)만·건물주택 라인 없음 / `house_individual`·`house_apart`→주택공시가격 단일·토지 라인 없음. (선행 작성, 현행 실패 확인 → 설계 환류)
2. **anchor-2(reportedPatch)**: 토지 자산 단가×면적 → `publishedValueAtInheritance`; 주택 자산 주택공시가격 → `publishedValueAtInheritance`(합산 안 함, 토지 미가산).
3. **anchor-3(조회 배선 렌더)**: 주택 자산 → `StandardPriceInput` 렌더, 토지 자산 → 조회 컴포넌트 렌더.
4. **Q1 확정 시**: 미공시 주택 block 1 주택 보조계산 숨김/안내 anchor.
5. **회귀**: `npm test`(양도세) + 기존 post-deemed 3 anchor + E2E 상속 스펙 3건.

## 10. 범위 외

- block 2(§164⑦ 3시점 환산) 로직·산식 — 무변경.
- 엔진 max(①,②) 로직 — 무변경.
- pre-deemed(<1985) 상단 블록 — 무변경(이미 `StandardPriceInput` 조회 사용).
- 신규 Zod/route/엔진 필드 — 없음.
- 토지 <1990.8.30 §164④ 등급가액 환산(별도 트랙) — 본 계획 대상 아님.

---

**진행 전 확인**: Q1·Q2·Q3 결정 후 Do 진입. Q2·Q3는 추천안(LandPriceLookupField / 초기화)으로 진행 가능하나 Q1(미공시 주택 처리)은 UX 영향이 있어 사용자 확정 권장.
