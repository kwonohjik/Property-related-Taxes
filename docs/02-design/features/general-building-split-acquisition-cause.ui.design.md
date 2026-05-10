# 일반건물 토지/건물 취득원인 분리 — UI 디자인

> 본 문서는 UI 측 설계만 다룬다. 엔진은 `general-building-split-acquisition-cause.engine.design.md` 참조.
> 승인된 plan: `docs/00-pm/general-building-split-acquisition-cause.plan.md`

## Context

기존 자산-수준 단일 "취득원인" 영역을 `general_building` 자산종류 한정으로 **토지/건물 2카드**로 분리. ⑤ 신축 정보 섹션 완전 제거. `gbIsSelfBuilt` 토글 폐지.

## 사용자 시나리오 (사례 32 기준 12단계)

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 "일반건물(토지+건물 일괄)" 선택 | `assetKind: "general_building"`. 취득 정보 영역이 **토지/건물 2카드**로 변신 |
| 2 | 📌 토지 취득 카드 — 취득원인 [매매] 선택 | `acquisitionCause: "purchase"` |
| 3 | 토지 취득일 [2008 - 03 - 17] 입력 | `acquisitionDate: "2008-03-17"` |
| 4 | 🏗 건물 취득 카드 — 취득원인 [신축(자가건축)] 선택 | `gbBuildingAcquisitionCause: "newConstruction"` |
| 5 | 건물 취득일 [2018 - 03 - 31] 입력 | `gbBuildingAcquisitionDate: "2018-03-31"` |
| 6 | 양도일 < 5년 자동 검출 → 안내 배지 출현 | `⚠ 환산취득가액 가산세 적용 — 5% (§114조의2 ①)` 배지 |
| 7 | 취득가액 산정 방식 [환산취득가] 선택 | `gbUseEstimatedAcquisition: true` (또는 동등) |
| 8 | ① 면적 입력 (205·271.28·135.64) | DecimalInput × 3 |
| 9 | ② 양도시 기준시가 입력 (5,514,000 / 259,072,400) | LandPriceLookupField + CurrencyInput |
| 10 | ③ 취득시 기준시가 입력 (3,920,000 / 228,146,480) | 동일 |
| 11 | ④ 비사업용토지 판정 (용도지역·수도권·무허가) | RadioCardGroup × 2 + ToggleCard |
| 12 | "다음" → "계산" → 결과 화면 | §114조의2 가산세 13,300,202 라인 표시 |

## 케이스 인벤토리 (UI 시나리오 분기)

### 본 PR 스코프 — UI 검증 케이스

| # | UI 분기 | 토지 카드 | 건물 카드 | 안내 배지 | validate |
|---|---|---|---|---|---|
| 1 | 사례 31 (동시 매매) | acqCause=매매, 1999-05-24 | acqCause=매매, 1999-05-24 | 미표시 | OK |
| 2 | 사례 32 (매매+신축) ★ | acqCause=매매, 2008-03-17 | acqCause=신축, 2018-03-31 | **5% 가산세 표시** | OK |
| 3 | 매매+매매 (취득일 다름) | acqCause=매매, A | acqCause=매매, B | 미표시 | OK |
| 5 | 증여+매매 | acqCause=증여, 증여일 | acqCause=매매, 매매일 | 미표시 | OK |
| 8 | (validate) 건물 취득원인 미선택 | * | undefined | — | **차단** |

### 후속 PR 스코프 (보조 필드 매핑 필요 — 본 PR 미포함)

| # | 시나리오 | 사유 |
|---|---|---|
| 4-a | 상속+신축 | `decedentAcquisitionDate` 토지 카드 매핑 별도 설계 |
| 6 | 상속+상속 | 토지·건물 각자 `decedentAcquisitionDate` |
| 7-a | 증여+신축 | `donorAcquisitionDate` 토지 카드 매핑 |
| 7-b | 이월과세+신축 ★ | §97의2 + §114조의2 cross-cutting — 단독 PR로 anchor 견고화 |

## 14개 동기화 지점 매트릭스

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData 타입 | `lib/stores/calc-wizard-asset.ts` `AssetForm` | `gbIsSelfBuilt` **타입 제거**, `gbBuildingAcquisitionCause?: 5enum` 추가. **층 분리 정책** (U-1 반영): FormData는 입력 진행 중 undefined 허용 (UI 단계 optional). API 송신 직전(`buildGeneralBuildingValuation()`) + Zod 통과 후 + 엔진 input(`GeneralBuildingInput.buildingAcquisitionCause`)은 required. 미입력 시 validate ⑧ 차단 또는 normalizeAsset M-2가 채움 |
| ② | initial value | `lib/stores/calc-wizard-asset-factory.ts` `INITIAL_ASSET_FORM` | `gbBuildingAcquisitionCause: undefined`. `gbIsSelfBuilt` 초기값 제거 |
| ③ | normalize fallback | 동일 파일 `normalizeAsset` | **M-1** legacy `gbIsSelfBuilt` → `delete`. **M-2** `general_building` + 미입력 시 `gbBuildingAcquisitionCause = acquisitionCause` 명시 마이그레이션 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-helpers.ts:178~` `buildGeneralBuildingValuation()` | `isSelfBuilt` 직접 전달 라인 **삭제**, `buildingAcquisitionCause: asset.gbBuildingAcquisitionCause` 추가 |
| ⑤ | UI 입력 위젯 | `components/calc/transfer/AssetForm.tsx` (또는 동등 — Asset 카드 컴포넌트) + `GeneralBuildingBlock.tsx` | **AssetForm 취득 정보 영역 재구성** — 일반건물 시 토지/건물 2카드. `GeneralBuildingBlock.tsx` ⑤ 신축 정보 섹션 **삭제** |
| ⑥ | 사이드바 합계 | `compute*Summary` | 변경 없음 |
| ⑦ | 결과 카드 산식 | `BundledAllocationCard.tsx`, `TransferTaxResultView.tsx` | 변경 없음 (가산세 라인 그대로) |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | (a) `general_building` + `!gbBuildingAcquisitionCause` → 차단. (b) `newConstruction` + `!gbBuildingAcquisitionDate` → 차단 (기존 가드 명칭 변경) |
| ⑨ | Zod enum (메인) | `transfer-tax-schema.ts` | 변경 없음 (`acquisitionCause` 5enum 그대로) |
| ⑩ | Zod enum (companion) | 동일 | 변경 없음 |
| ⑪ | acquisitionDate fallback | 엔진 | 변경 없음 |
| ⑫ | **Zod 입력 객체** ★ | `transfer-tax-schema.ts:50~` `generalBuildingValuationSchema` | `buildingAcquisitionCause: z.enum([...])` **required** (`.optional()` 없음 — E-1 엔진 input 타입과 일관). `isSelfBuilt: z.boolean().optional()` 라인 **삭제** |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` | 변경 없음 (gbValuation spread 자동) |
| ⑭ | **Route handler 매핑** ★ | `app/api/calc/transfer/route.ts` + `general-building-route-helper.ts` | route.ts: `coerceDates`/`generalBuildingValuation` spread 그대로. helper: `dispatchGeneralBuilding` 내 `isSelfBuilt = buildingAcqCause === "newConstruction"` 도출, **`?? acquisitionCause` fallback 삭제** |

## ⑤ AssetForm 취득 정보 영역 재구성 명세

### 변경 전 (현재 — Image 7 기준)

```
취득 원인
[매매] [상속] [증여] [이월과세(증여)] [신축(자가건축)]   ← 5번째 중복

취득일
[ 2008 - 03 - 17 ]   ← 라벨 모호

취득가액 산정 방식
[실거래가] [환산취득가] [감정가액]
```

### 변경 후 (A안)

```
┌─────────────────────────────────────────────┐
│ 📌 토지 취득                          (sky)  │
│   취득원인: [매매] [상속] [증여] [이월과세]   │
│   취득일:   [ 2008 - 03 - 17 ]              │
│   ↳ (acqCause=상속 시) 피상속인 취득일 [DateInput] │
│   ↳ (acqCause=증여 시) 증여자 취득일 [DateInput]   │
│   ↳ (acqCause=이월과세 시) carryoverTaxation 객체  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🏗 건물 취득                         (amber) │
│   취득원인: [매매] [상속] [증여] [신축(자가건축)] │
│   취득일:   [ 2018 - 03 - 31 ]              │
│             ↳ 사용승인서 교부일·사실상 사용일·  │
│               임시사용승인일 중 빠른 날 (§162①4호) │
│                                              │
│   ⚠ 환산취득가액 가산세 적용 — 건물 환산취득가 × 5% │
│      (소득세법 §114조의2 ①)                    │
│      [건물 acqCause=신축 + 5년 이내 양도 시 자동] │
└─────────────────────────────────────────────┘

취득가액 산정 방식
[실거래가] [환산취득가] [감정가액]
```

### 분기 동작 명세

| 자산종류 | 토지 카드 | 건물 카드 | acquisitionDate | gbBuildingAcquisitionDate |
|---|---|---|---|---|
| `housing`·`land`·`building` 등 | (기존 단일 취득원인 영역) | 미표시 | 자산-수준 | 미사용 |
| `general_building` | 토지 카드 표시 | 건물 카드 표시 | 토지 취득일 의미 | 건물 취득일 의미 |

### 마크업 (제안)

```tsx
// AssetForm.tsx (또는 동등)
{asset.assetKind === "general_building" ? (
  <>
    <SectionCard tone="sky" icon="📌" title="토지 취득">
      <RadioCardGroup
        label="취득원인"
        options={[
          { value: "purchase", label: "매매" },
          { value: "inheritance", label: "상속" },
          { value: "gift", label: "증여" },
          { value: "carryover_gift", label: "이월과세(증여)" },
        ]}
        value={asset.acquisitionCause}
        onChange={(v) => onAssetChange({ acquisitionCause: v })}
      />
      <FieldCard label="토지 취득일">
        <DateInput value={asset.acquisitionDate} onChange={...} />
      </FieldCard>
      {/* 상속·증여·이월과세 보조 입력은 기존 영역 그대로 */}
      {asset.acquisitionCause === "inheritance" && (
        <FieldCard label="피상속인 취득일">...</FieldCard>
      )}
      {asset.acquisitionCause === "gift" && (
        <FieldCard label="증여자 취득일">...</FieldCard>
      )}
      {asset.acquisitionCause === "carryover_gift" && (
        <CarryoverTaxationSection asset={asset} onChange={onAssetChange} />
      )}
    </SectionCard>

    <SectionCard tone="amber" icon="🏗" title="건물 취득">
      <RadioCardGroup
        label="취득원인"
        options={[
          { value: "purchase", label: "매매" },
          { value: "inheritance", label: "상속" },
          { value: "gift", label: "증여" },
          { value: "newConstruction", label: "신축(자가건축)" },
        ]}
        value={asset.gbBuildingAcquisitionCause}
        onChange={(v) => onAssetChange({
          gbBuildingAcquisitionCause: v,
          // useEffect 미러링 금지 — 직접 처리
          ...(v !== "newConstruction" ? { gbBuildingAcquisitionDate: "" } : {}),
        })}
      />
      <FieldCard
        label="건물 취득일"
        hint={
          asset.gbBuildingAcquisitionCause === "newConstruction"
            ? "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162①4호)"
            : "건물 취득일"
        }
      >
        <DateInput
          value={asset.gbBuildingAcquisitionDate}
          onChange={(v) => onAssetChange({ gbBuildingAcquisitionDate: v })}
        />
      </FieldCard>

      {/* 가산세 안내 배지 — useMemo 파생 (useEffect 금지)
        * U-3 반영: "잠정 안내" 톤 + 엔진 동일 로직 공유 (date-fns addYears)
        * - transferDate 출처: 자산 공통 폼 필드 (`form.transferDate`) 또는 store selector
        * - 5년 판정: 엔진 calculateBuildingPenalty()와 동일하게 addYears(date, 5) 비교
        *   (lib/tax-engine/tax-utils.ts addYears 또는 date-fns 직접 import)
        * - 정확한 가산세 발동 여부는 결과 카드에서 확정 — UI는 사용자 인지 트리거
        */}
      {asset.gbBuildingAcquisitionCause === "newConstruction"
        && asset.gbBuildingAcquisitionDate
        && form.transferDate
        && isWithin5Years(asset.gbBuildingAcquisitionDate, form.transferDate) && (
        <SurtaxNoticeBadge tone="amber">
          환산취득가액 가산세 적용 대상 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)
          <span className="text-xs text-amber-700">
            ※ 잠정 안내 — 정확한 가산세 발동 여부는 계산 결과에서 확인
          </span>
        </SurtaxNoticeBadge>
      )}
    </SectionCard>
  </>
) : (
  /* 기존 단일 취득원인 영역 (housing·land·building 등) */
  <LegacyAcquisitionSection asset={asset} onChange={onAssetChange} />
)}
```

### `GeneralBuildingBlock.tsx` 변경

⑤ 신축 정보 섹션 **완전 제거**:
- `<SectionCard tone="amber" number={5} title="신축 정보">` 블록 삭제
- ToggleCard `gbIsSelfBuilt` 삭제
- DateInput `gbBuildingAcquisitionDate` 삭제 (AssetForm 건물 카드로 이동)
- 안내 배지 삭제 (AssetForm 건물 카드로 이동)
- 일반건물 섹션 번호 ①②③④로 정리 (⑤ 제거)

## 정책 적용 매트릭스

| 정책 | UI 디자인 적용 |
|---|---|
| `feedback_no_silent_apportion_fallback.md` ★★★ | ⑧ validation 차단 — `general_building` + `!gbBuildingAcquisitionCause` 차단 / `newConstruction` + `!gbBuildingAcquisitionDate` 차단. UI placeholder "(필수)" |
| `feedback_useeffect_store_mirror_forbidden.md` | RadioCardGroup onChange 핸들러에서 직접 처리. 안내 배지는 useMemo 파생. useEffect 사용 금지 |
| `feedback_section_card_numbering.md` | 토지=sky·건물=amber. 일반건물 ①②③④ 번호 정리 |
| `feedback_toggle_card_visibility.md` | RadioCardGroup 사용 (native radio 금지). 미선택 옵션도 tone 배경 유지 |
| `feedback_date_input.md` | DateInput 사용 (type="date" 금지) |
| `feedback_select_on_focus.md` | SelectOnFocusProvider 자동 적용 |
| `feedback_law_article_link.md` | LawArticleModal 또는 LawArticleBadge — §114조의2, §162①4호 링크 |
| `feedback_no_won_suffix.md` | 결과 카드 산식 그대로 |

## 800줄 분할 사전 점검

| 파일 | 현재 | 예상 후 | 분할 신호 |
|---|---|---|---|
| `AssetForm.tsx` (또는 동등) | 확인 필요 | +50~80 (토지/건물 2카드) | 임계 시 `GeneralBuildingAcquisitionCards.tsx` 분리 |
| `GeneralBuildingBlock.tsx` | ~310 | -40 (⑤ 섹션 제거) | OK ↓ |
| `lib/stores/calc-wizard-asset.ts` | 787 | ±0 (필드 삭제+추가) | 임계 |
| `lib/calc/transfer-tax-validate.ts` | 768 | +20 (≈788) | **#0-B 명시 채택 (U-4)** — 본 PR 내 +20 허용. 분할 PR 미선행. 다음 PR 작성자에게 신호: validate 800 초과 확실 시 분할이 후속 PR의 #0 작업 |

## 마이그레이션 시각적 호환

기존 사용자가 사례 32 직후 sessionStorage 데이터를 가진 채 본 변경 사이트로 진입 시:
1. `normalizeAsset` M-1 발동 → `gbIsSelfBuilt: true` → `gbBuildingAcquisitionCause: "newConstruction"` 자동 변환
2. M-2 발동 → 사례 31 호환 데이터(`gbBuildingAcquisitionCause` 미입력)는 토지 acquisitionCause 자동 채워넣기
3. 사용자 화면: 새 UI(2카드)에 기존 데이터가 적절히 분배되어 표시됨
4. 다시 계산 시 동일 결과 보장

## 사용자 학습 부담 완화

- 기존 "신축(자가건축)" 버튼 위치(취득원인 5번째)에 직접 매핑되는 옵션은 **건물 카드의 "신축(자가건축)"** — 시각적 연속성 확보
- 토지 카드는 "이월과세(증여)" 포함 4개 옵션 — 기존 메뉴와 동일
- 건물 카드는 "이월과세(증여)" 옵션 **미포함** (carryover는 토지에만 의미. §97의2 적용 대상은 증여받은 자산이고, 신축 자가건축 건물은 §97의2와 무관)

## 본 PR 한정 정책 — 건물 상속·증여 보조 필드 (U-2 반영)

본 PR 스코프(#1·#2·#3·#5·#8)는 모두 **보조 필드 미사용** 케이스. 건물의 상속·증여(#4-a·#6·#7-a) 시점 보조 입력은 후속 PR에서 다음 두 안 중 결정:

- **A안 (양도코리아 정렬, 권장)**: 건물 카드의 상속·증여 시 토지 카드의 피상속인/증여자 취득일을 **자동 공유**. 양도코리아 Image 2도 부속토지·건물입력 단계에서 시점별 기준시가만 분리하고 피상속인 취득일은 단일 입력. 단 결과 카드에 "건물 상속/증여 시 토지와 동일 시점 가정" 주석.
- **B안**: 건물 카드도 별도 보조 입력 노출. UI 부피 +30~50줄, 사용자 학습 부담 ↑. 토지·건물이 다른 피상속인으로부터 상속된 드문 케이스 표현.

본 PR에서는 건물 카드 상속·증여 옵션 자체는 enum에 포함하되, **선택 시 보조 입력은 미노출**. 후속 PR에서 A/B안 결정.

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ |
| 2. Design (engine) | ✅ |
| 2. Design (UI) | ✅ 본 문서 (5 + 4 리스크 반영 완료) |
| 3. Do | ☐ TODO (#0-B 명시로 즉시 진입 가능) |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO (validate 분할 신호 메모리 기록) |

## 다음 PR 작성자 신호 (U-4)

**Act 단계에서 메모리·CLAUDE.md에 기록할 항목**:
- `transfer-tax-validate.ts` 본 PR 후 ≈788줄 (800 미달, 임계 근접)
- 다음 PR이 +12줄 이상 추가 시 800 초과 확실 → 그 PR의 #0 작업으로 도메인별 분할 (general_building / housing / land 등) 선행
- 메모리: `feedback_validate_split_signal.md` (또는 동등) 신규 작성 후 `MEMORY.md` 인덱스 등록
- CLAUDE.md "최근 완료" 또는 "진행 중" 라인에 한 줄 신호 추가

다음 단계는 **3단계 Do** — 분할 PR 없이 즉시 진입 가능.
