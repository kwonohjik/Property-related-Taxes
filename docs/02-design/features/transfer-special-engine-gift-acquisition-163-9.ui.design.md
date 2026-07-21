# UI 설계 — 특수엔진 증여 취득가액 §163⑨ (D1=옵션 B)

> 엔진 설계: `transfer-special-engine-gift-acquisition-163-9.engine.design.md` · 계획 §1.1(법령검증)
> 원칙: 상속 UI(`MixedUseAssetMajorStdPrice.tsx` violet 카드) 그대로 미러 — 라벨만 "증여일 평가액". 공용 컴포넌트(`ToneCard`·`CurrencyInput`·`LawArticleModal`) 필수.

## 1. Phase 1 — 겸용 증여 신고가액 입력 카드 (`components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx`)

### 1.1 분기 플래그 (`:49` 옆)
```tsx
const isInheritance = asset.acquisitionCause === "inheritance";   // 기존
const isGift = asset.acquisitionCause === "gift";                 // 신규
const isDeemed163_9 = isInheritance || isGift;                    // 공용 라벨 게이트
const acqLabel = isInheritance ? "상속개시일" : isGift ? "증여일" : "취득시";
```

### 1.2 주택분 gift 카드 (상속 `:139-160` 미러)
```tsx
{isGift && (
  <ToneCard tone="violet"
    title="증여일 신고가액 override (선택)"
    titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}>
    <CurrencyInput label="주택분 증여일 평가액(상증법 §60~66)"
      value={asset.mixedHousingGiftValueOverride}
      onChange={(v) => onChange({ mixedHousingGiftValueOverride: v })}
      hint="증여세 신고서·결정통지서상 주택 평가액. 취득가액으로 직접 사용 — 환산·개산공제 미적용. 미입력 시 증여일 개별주택공시가격(보충적평가)"
      data-testid="mixed-gift-housing-value" />
    <CurrencyInput label="주택분 필요경비(자본적지출·양도비, 선택)"
      value={asset.mixedHousingGiftExpense}
      onChange={(v) => onChange({ mixedHousingGiftExpense: v })}
      hint="없으면 비워두세요(개산공제 없음)" data-testid="mixed-gift-housing-expense" />
  </ToneCard>
)}
```
- 상속 카드와 **동일 tone(violet)·구조**, 라벨 "상속개시일"→"증여일", `legalBasis` §60→§163⑨(증여 근거 조항).

### 1.3 상가분 gift 카드 (상속 `:229-250` 미러)
```tsx
{isGift && (
  <ToneCard tone="violet" title="증여일 신고가액 override (선택, 상가 전체)"
    titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}>
    <CurrencyInput label="상가분 증여일 평가액(상증법 §60~66)"
      value={asset.mixedCommercialGiftValueOverride}
      onChange={(v) => onChange({ mixedCommercialGiftValueOverride: v })}
      data-testid="mixed-gift-commercial-value" />
    <CurrencyInput label="상가분 필요경비(선택)"
      value={asset.mixedCommercialGiftExpense}
      onChange={(v) => onChange({ mixedCommercialGiftExpense: v })}
      data-testid="mixed-gift-commercial-expense" />
  </ToneCard>
)}
```

> ⚠️ **구조 미러 주의(U#4)**: 실제 상속 카드(`:145-158·235-248`)는 값 `CurrencyInput`이 `label=""`(ToneCard `title`에 의존)이고 실비 input을 `<div className="pt-2">`로 감싼다. Do 시 **동일 구조로 미러**(위 코드의 명시 `label=`은 가독성 표기용 — 구현은 ToneCard title + `label=""` + pt-2 wrapper 패턴 준수).

### 1.4 미공시 §164⑦ 카드 (`:162-184`) — ToggleCard(라벨만 확장, 토글 동작 불변)
실측: 이 카드는 `ToggleCard size="sm"`이며 **ON 시 `useEstimatedAcquisition:true` 강제**(`:175`) — PHD/§164⑦ 환산 경로(`helpers:246` gift PHD 분기) 진입 게이트. **토글 동작·필드는 불변**, 라벨 문구만 확장:
```tsx
title={`${isDeemed163_9 ? acqLabel : "취득 당시"} 개별주택가격 미공시 (§164⑦ 3-시점 환산)`}
// isInheritance → isDeemed163_9 로 확장 (증여도 §176의2②2호 미공시 max 대상, 계획 Q2)
```
- ON 시 `useEstimatedAcquisition:true`가 gift에서도 세팅됨 → `acquisitionByGift`와 **공존**(엔진 gift PHD 분기가 이 조합을 소비, route=`gift_phd_max`). 상호 배타 아님(상속과 동일).

### 1.5 "취득시"→"증여일" 문구 치환
- `acqLabel`·`acqSummaryLabel`을 `isGift`까지 확장(상속 `:50·52` 패턴). 자동합계 박스·기준시가 섹션 라벨이 "증여일"로 표시.

## 2. Phase 1 — 결과카드 (`components/calc/results/mixed-use/MixedUseResultCard.tsx`)

- **단일 소스 = `calculationRoute.acquisitionConversionRoute`**(`:125-126`, dual-truth 금지). 현행 `isInheritedAcq = acqRoute === "inheritance_direct" || "inheritance_phd_max"`. gift route(`gift_direct`/`gift_phd_max`, 엔진설계 §2·§3) 추가에 맞춰:
```tsx
const isInheritedAcq = acqRoute === "inheritance_direct" || acqRoute === "inheritance_phd_max";
const isGiftAcq     = acqRoute === "gift_direct" || acqRoute === "gift_phd_max";
const isDeemedAcq   = isInheritedAcq || isGiftAcq;   // 산식 분기(개산공제 미표시 등)는 isDeemedAcq로
// 라벨(`:289·:419`):
label={isInheritedAcq ? "상속개시일 평가액(취득가액)"
     : isGiftAcq     ? "증여일 평가액(취득가액)"
     : "주택 환산취득가액"}   // (상가는 "상가 환산취득가액")
```
- 산식 분기 `:292·342·352·362·419·422·437·447·457`(실측 전수) `isInheritedAcq` → **`isDeemedAcq`로 확장**(gift도 개산공제 미표시·실제 필요경비 표기). detail echo(`inheritedAcquisitionDetail`) generic 재사용.

## 3. Phase 1 — Validation (`lib/calc/transfer-tax-validate-mixed-use-inheritance.ts`, 54줄)

- `:21` `if (acquisitionCause !== "inheritance") return null` → `if (acquisitionCause !== "inheritance" && acquisitionCause !== "gift") return null`.
- **🔴 PHD-ON 예외 정확 미러(U#1, 8지점 UI↔validate 모순 방지)**: 실제 validate(`:31-40`)는 **주택분** — `if (!asset.usePreHousingDisclosure)`일 때만 `override || mixedAcqHousingPrice` 필수(PHD ON이면 PHD 자체 검증이 커버 → override optional). **상가분**(`:42-51`)은 PHD 무관 항상 필수(`override || (상가건물 기준시가>0 && 개별공시지가>0)`). gift도 **이 비대칭 그대로** — PHD-ON gift는 주택 override 없이 UI 통과하므로 validate도 동일 예외. (silent fallback 금지 `feedback_no_silent_apportion_fallback`는 "미입력 차단"이지 PHD 커버분까지 강제하는 게 아님.)
- **에러 메시지 gift 분기(U#2)**: `:38·:50` 하드코딩 "상속개시일 주택분/상가분 평가액…" → gift는 "**증여일** 주택분/상가분 평가액…"로 분기(취득원인별 메시지). "개별주택공시가격"·"상가건물 기준시가+개별공시지가" 안내 문구는 유지.
- pre-1985 gift(게이트 false)는 검증 대상 아님(환산 fallback).
- **Phase-2 범위밖 가드 공유**: 현재 이 validate는 상속에 대해 `hasPartialUsageChange`·`transferCause === "public_expropriation"` 조합을 차단(`:24~`). gift도 **동일 차단**(엔진 `resolveHousing…` 경로가 용도변경/공익수용 결합 미지원 — 엔진 throw와 동시점). 조건을 `(inheritance || gift)`로 확장.
- ⚠️ **3중 패턴**(mirror-pattern): API `||` fallback(신고가↔기준시가) ↔ validate 동일 fallback 인식 — UI 통과↔validate 차단 모순 금지.

## 4. Phase 2 — GB UI (선택적)

- 엔진 설계 §6: validation V2 가드 확장이 핵심(코드 계층). UI는 gift GB 선택 시 환산 토글이 stale로 남아도 validation이 차단 → 별도 안내 카드는 **선택**(권장: `GeneralBuildingAcquisitionCards.tsx` 건물 gift 분기에 "증여는 신고가액 실가 사용 — 환산 미지원" violet 안내, 상속 `:281-290` 미러). 도달성 낮아 P2 후순위.

## 5. Phase 3 — 재개발 UI (`components/calc/transfer/RedevelopmentBlock.tsx`)

- 상속 안내 카드(`:113-123`)를 gift로 미러: `acquisitionCause === "gift"` 시 violet ToneCard "증여일 평가액=실지거래가액(소령 §163⑨) — §166③ 환산·개산공제 미적용".
- 실가 카드 문구(`:369-384` "취득 실거래가액")가 증여 신고가액을 포함하도록 hint 조정("증여 취득 시 증여일 평가액을 입력하세요. 환산취득가 토글 사용 금지").

## 6. 공용 컴포넌트·정책 준수 체크

- [x] `ToneCard`(violet) — 인라인 톤 하드코딩 금지(`tones.ts` 단일 소스)
- [x] `CurrencyInput` + `parseAmount` — 금액(원). placeholder 숫자 예시 금지(hint 한국어)
- [x] `LawArticleModal` — 조문 인용 링크(§163⑨ 팝업)
- [x] 라벨 타이포 정본 클래스(임의 px 금지)
- [x] `data-testid` 동결(E2E 셀렉터) — `mixed-gift-*`
- [x] `feedback_no_silent_apportion_fallback`·`mirror-pattern` 3중 패턴 준수

## 7. E2E (Phase 1)

- 겸용 증여 신고서 취득가액 행 = 신고가액 직접(환산카드 부재) 검증. 취득정보 섹션 펼침(`getByRole("button",{name:/취득정보/})`) 후 assertion(상속 E2E 패턴 재사용).
- 양성(신고가 5억→취득가액 5억)·pre-1985 음성(환산 유지) 2케이스.

## 8. 위젯 배치 (ASCII)

```
[Step1 자산카드 · 취득원인=증여 선택 시]
┌ 겸용주택 취득 (MixedUseAssetMajorStdPrice) ─────────────┐
│ ① 면적·부수토지                                          │
│ ② 증여일 기준시가 (주택/상가, "증여일" 라벨)             │
│ ┌ violet: 증여일 신고가액 override (선택) ────────────┐ │
│ │ 주택분 증여일 평가액(§60~66)   [        원]  §163⑨↗ │ │
│ │ 주택분 필요경비(선택)          [        원]         │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌ amber: 증여일 개별주택가격 미공시 (§164⑦) [토글]───┐ │
│ └────────────────────────────────────────────────────┘ │
│ ┌ violet: 증여일 신고가액 override (상가 전체) ───────┐ │
│ │ 상가분 증여일 평가액(§60~66)   [        원]         │ │
│ │ 상가분 필요경비(선택)          [        원]         │ │
│ └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```
