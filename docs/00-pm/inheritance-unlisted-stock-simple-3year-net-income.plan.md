# 비상장주식 간편평가 — 3년치 순손익액 입력 → 가중평균 자동계산 (작업계획서)

> 작성일: 2026-05-25 · 도메인: 상속세·증여세 (간편평가 V1) · 성격: **엔진 + UI (타입·Zod 변경 동반)**
> 관련: 엔진 `property-valuation-stock.ts` · UI `UnlistedStockSimpleFields.tsx` · `inheritance-gift-tax-ui-senior`

---

## 1. 배경 — 현재 무엇이 불편한가

간편평가(V1)의 순손익가치 입력은 **"최근 3년 가중평균 순손익 (회사 전체)" 한 칸**(`UnlistedStockData.weightedNetIncome`)이다. hint에 *"(당해×3 + 전년×2 + 전전년×1) ÷ 6"* 산식을 적어두고 **사용자가 직접 가중평균을 계산**해 넣게 한다.

문제: 사용자가 손으로 가중평균을 계산해야 하고, 산식·가중치를 잘못 적용할 위험이 있다. 정식평가(V2)는 이미 `FiscalYearAdjustmentTable`로 3년치 사업연도를 입력받지만, V1은 그 중간 편의가 없다.

## 2. 목표

간편평가에서 **3년치 순손익액(회사 전체)을 각각 입력**받아, 시스템이 §56① 가중평균을 자동 계산한다.

- 입력: 평가기준일 직전 1·2·3 사업연도 순손익액 3칸
- 계산: `(직전1년×3 + 직전2년×2 + 직전3년×1) ÷ 6` (음수면 0) — 시스템
- 이후 기존 로직(÷ (발행주식수 × 환원율))으로 1주당 순손익가치 산출

## 3. 법령 근거 (KoreanLaw 검증 완료)

| 조문 | 내용 | V1 적용 |
|---|---|---|
| **상증령 §56①** | 1주당 최근 3년 순손익액 가중평균 = `(이전1년×3 + 이전2년×2 + 이전3년×1) ÷ 6`. **음수면 0** | ★ 핵심 산식 |
| 상증령 §56③ | 각 사업연도 주식수 = 각 사업연도 종료일 발행주식총수 (3년 내 증자·감자 시 조정) | V1은 평가기준일 현재 단일 주식수로 근사 — **증자·감자 조정은 V2(정식) 영역** (한계 명시) |
| 상증령 §56④ | 순손익액 = 법인세법 §14 각 사업연도소득 ± 세무조정 | V1은 **사용자가 조정 완료된 순손익액을 입력**한다고 가정 (약식) |
| 상증령 §54① | 1주당 순손익가치 = 가중평균액 ÷ 순손익가치환원율 | 기존 로직 유지 |

> V1은 "회사 전체 순손익액"을 입력받아 회사 전체 가중평균 → ÷(주식수×환원율). §56①은 형식상 "1주당 순손익액"의 가중평균이나, 선형 연산이라 회사 전체 단위 가중평균 후 1회 나눗셈과 결과 동일(floor 시점만 차이). 기존 V1이 이미 회사 전체 단위이므로 **일관 유지**.

## 4. 설계

### 4-1. 타입 (`UnlistedStockData`, inheritance-gift.types.ts:177)

3년치 필드 추가. `weightedNetIncome`은 **하위호환 fallback용으로 유지**(legacy 저장 데이터).

```ts
export interface UnlistedStockData {
  totalShares: number;
  ownedShares: number;
  /** @deprecated 직접 입력 폐지 — netIncomeY1~Y3 가중평균으로 대체. legacy 데이터 fallback용 */
  weightedNetIncome: number;
  /** 평가기준일 직전 1사업연도 순손익액 (회사 전체, 가중치 ×3) — §56① */
  netIncomeY1?: number;
  /** 직전 2사업연도 (×2) */
  netIncomeY2?: number;
  /** 직전 3사업연도 (×1) */
  netIncomeY3?: number;
  netAssetValue: number;
  capitalizationRate: number;
  assetValueOnlyReason?: UnlistedAssetValueOnlyReason;
}
```

### 4-2. 엔진 (`property-valuation-stock.ts`) — ★검토 정정

**기존 헬퍼와의 관계 (중요)**: V2(정식)에는 이미 `calcWeightedAvg3y`(`property-valuation/weighted-avg.ts:26`)가 있다. 동일 §56① 산식이지만 **floor 전략이 V1과 다르다**:

| | floor 전략 | 단위 |
|---|---|---|
| V2 `calcWeightedAvg3y` | 1주당 가중평균에서 `Math.floor` → ÷환원율 floor (**PDF 1주당 이중 floor**) | 1주당 순손익액 |
| V1 (현행) | 회사 전체 가중평균 ÷ (주식수×환원율) **단일 floor** (P2-D 정정) | 회사 전체 |

→ V2 헬퍼를 그대로 재사용하면 floor가 끼어들어 **기존 V1 결과(anchor S17·S21)와 미세하게 달라진다.** 따라서 **V1 전용 floor-less 헬퍼**를 신설하되, 이름과 주석으로 V2와의 차이를 명시한다.

```ts
/**
 * §56① 회사 전체 최근 3년 순손익액 가중평균 (V1 약식 전용).
 * 음수면 0. **floor 하지 않음** — 최종 1주당 환산 단계의 단일 floor(P2-D)에 위임.
 * cf. V2 calcWeightedAvg3y는 1주당 단위 + 이중 floor(PDF 정합)로 별개.
 */
export function calcCompanyWeightedNetIncome3Y(y1: number, y2: number, y3: number): number {
  const weighted = (y1 * 3 + y2 * 2 + y3 * 1) / 6;
  return weighted < 0 ? 0 : weighted;   // §56① 단서: 음수→0 (floor 없음)
}

/** 3년치 우선, 없으면 legacy weightedNetIncome fallback (single source) */
export function resolveWeightedNetIncome(data: UnlistedStockData): number {
  const has3y = data.netIncomeY1 != null || data.netIncomeY2 != null || data.netIncomeY3 != null;
  if (has3y) {
    return calcCompanyWeightedNetIncome3Y(data.netIncomeY1 ?? 0, data.netIncomeY2 ?? 0, data.netIncomeY3 ?? 0);
  }
  return data.weightedNetIncome ?? 0;   // legacy
}
```

`calcUnlistedStockPerShareValue`에서 `data.weightedNetIncome` 참조를 `resolveWeightedNetIncome(data)`로 교체. **그 외 1주당 산식·단일 floor·가중치·§54④ 분기는 무변경.** UI 미리보기는 `calcCompanyWeightedNetIncome3Y`를 import(single-source).

> **Pre-Do 핵심**: 신규 3년치로 산정한 결과가 "사용자가 같은 값을 가중평균해 weightedNetIncome에 직접 입력한 기존 경로"와 **동일한지** anchor로 확인. floor-less + 단일 floor가 정밀도 최대. legacy fallback(C-4)이 기존 anchor 100% 보존.

### 4-3. UI (`UnlistedStockSimpleFields.tsx`)

"순손익가치 계산 입력" 섹션의 `weightedNetIncome` CurrencyInput 1칸 → **3칸**으로 교체:

```
순손익가치 계산 입력
 · 평가기준일 직전 1사업연도 순손익액 (가중치 ×3)   [____ 원]   (상속개시 -1년)
 · 직전 2사업연도 (×2)                          [____ 원]   (상속개시 -2년)
 · 직전 3사업연도 (×1)                          [____ 원]   (상속개시 -3년)
 ─ 자동 계산: 가중평균 순손익 = (Y1×3 + Y2×2 + Y3×1) ÷ 6 = XXX  ← useMemo 미리보기
 · 자본환원율 (기본 10%)                         [10] %
```

- 미리보기는 엔진 헬퍼 `calcCompanyWeightedNetIncome3Y`를 **import해서** 계산 (single-source — UI 자체 산식 재작성 금지 [[feedback_ui_engine_dual_truth_avoidance]]).
- **적자(음수) 연도 처리 (★검토 정정)**: `CurrencyInput`·`DecimalInput` 모두 음수 입력 불가(`[^0-9]`·`[^0-9.]` 제거). 각 연도 입력칸 옆에 **"결손(적자)" 토글(ToggleCard chip 또는 RadioCardGroup 흑자/결손)**을 두고, 결손 선택 시 입력 절대값을 음수로 변환해 store에 저장. (기존 V1은 음수 불가라 "적자 시 0 입력" 약식이었으나, 3년치 분리 입력에서는 연도별 적자 반영이 §56① 정확성에 필요.) — 적자 처리 UI 방식은 PR-2 착수 시 결손 토글로 확정.
- 라벨에 "상속개시/증여일 -N년" 병기 (mode별 문구). placeholder 숫자 금지 — hint로 설명.
- `weightedNetIncome` 직접 입력 칸은 제거(legacy 데이터는 3년치 비어도 fallback으로 계산되므로 결과 보존).

### 4-4. 가중치 미리보기·결과 표시
- 사이드바 합계(`inheritance-summary`·`computeStockValuation`)는 `calcUnlistedStockPerShareValue` 경유 → 자동 반영(변경 불필요).
- 결과 카드(`PerShareValuationResultCard`는 V2 전용). V1 결과는 `UnlistedStockPreview` — 순손익가치 표시에 "3년 가중평균 = X" 한 줄 추가(선택).

## 5. 케이스 인벤토리

| # | 입력 | 기대 |
|---|---|---|
| C-1 | Y1·Y2·Y3 모두 흑자 | 가중평균 = (Y1×3+Y2×2+Y3×1)/6, 1주당 순손익가치 정상 |
| C-2 | 일부 연도 적자(음수) | 음수 연도도 산식에 반영, 가중평균 양수면 정상 |
| C-3 | 가중평균 결과 음수 | §56① 단서 → 0 (적자법인, 순자산 80% 최소값 경로) |
| C-4 | **legacy: weightedNetIncome만, 3년치 없음** | fallback으로 기존 결과 100% 보존 (회귀 0) |
| C-5 | 3년치 + 부동산과다보유 ON | 가중치 반전(2:3)과 결합 정상 |
| C-6 | 3년치 + §54④ 순자산만 적용 | 순손익가치 무시, 순자산가치 적용 |
| C-7 | 증여(gift) 모드 3년치 | 동일 산식 (라벨만 "증여일 -N년") |
| C-8 | sessionStorage 구버전(3년치 키 없음) | normalize에서 깨지지 않음 + fallback (C-4와 동일 경로) |
| C-9 | Y1만 입력, Y2·Y3 미입력 | 미입력=0 처리 → 가중평균에 0 반영 (또는 validate 차단 — §8 결정) |

## 6. 동기화 지점 (8 + Zod)

| # | 파일 | 작업 |
|---|---|---|
| ① 타입 | `inheritance-gift.types.ts:177` | netIncomeY1~Y3 optional 추가, weightedNetIncome deprecated 유지 |
| ② initial | `StockValuationForm.tsx` handleAdd / `defaultStockData` | 3년치 기본 0 또는 undefined |
| ③ normalize | `defaultStockData`(UnlistedStockSimpleFields) | 3년치 spread 보존, legacy 호환 |
| ④ API | `lib/calc/inheritance-api`·`GiftTaxForm`/`InheritanceTaxForm` buildInput | 3년치가 estateItems로 전달되는지 확인(현재 unlistedStockData 통째 전달이면 자동) |
| ⑤ UI | `UnlistedStockSimpleFields.tsx` | 3칸 입력 + 미리보기 |
| ⑥ 사이드바 | 변경 없음 | calcUnlistedStockPerShareValue 경유 자동 |
| ⑦ 결과 | `UnlistedStockPreview` | (선택) 3년 가중평균 표시 |
| ⑧ validate | `lib/calc/inheritance-validate.ts` | 3년치 입력 요구 규칙. **C-9·C-4 결정**: legacy fallback 허용하되 신규 입력은 최소 Y1 필수? → 아래 결정 |
| ⑫ Zod | `lib/validators/property-valuation-input.ts:11` `unlistedStockDataSchema` | netIncomeY1~Y3 `z.number().optional()` 추가 **+ `weightedNetIncome`을 `z.number()` required → `.optional().default(0)`로 완화** (★검토 정정: 현재 required라 신규 경로에서 weightedNetIncome 미전송 시 검증 실패). "3년치 또는 weightedNetIncome 중 하나 존재" superRefine 검토 |

### ⑧ validation 결정 (Pre-Do 확인 필요)
- legacy(weightedNetIncome>0, 3년치 없음)는 통과시켜야 회귀 0 (C-4).
- 신규 입력 경로에서 3년 중 일부만 입력 시 차단할지/0 처리할지 → **0 처리 + 안내**(자동 안분 fallback 금지 정책과 구분: 여기선 "미입력 연도=결손 없음=0"이 법적으로 타당, 단 사용자에게 명시). Pre-Do anchor로 확정.

## 7. 작업 단계 (PR 분할)

1. **PR-1 (엔진 + 타입 + Zod)**: 타입 3필드 + `calcWeightedNetIncome3Y`·`resolveWeightedNetIncome` + `calcUnlistedStockPerShareValue` 교체 + Zod. **Pre-Do anchor 먼저**: C-1(가중평균 산식)·C-3(음수→0)·C-4(legacy fallback 회귀 0). 회귀 전체 0.
2. **PR-2 (UI)**: 3칸 입력 + 미리보기(엔진 헬퍼 import) + validate. C-5~C-9.
3. **PR-3 (결과 표시·선택)**: UnlistedStockPreview에 3년 가중평균 노출.

> Pre-Do: PR-1 진입 전 **C-4(legacy weightedNetIncome fallback) anchor 먼저 실행** — 기존 anchor(S17·S21 등)가 그대로 통과하는지 확인 후 구현. 회귀 0이 이 작업의 최우선 안전선.

## 8. 검증 계획

- anchor: C-1~C-9. 특히 C-3(음수→0, §56①), C-4(legacy 회귀).
- 회귀: `npm run test:inheritance` + `test:gift` 0 FAIL. 기존 비상장 anchor 전부 보존.
- 타입: `npx tsc --noEmit` 0.
- 브라우저: 3칸 입력 → 미리보기 가중평균 → 결과 일치 / legacy 데이터 로드 시 정상.

## 9. 범위 밖
- 정식평가(V2) `FiscalYearAdjustmentTable` 변경 없음.
- §56③ 증자·감자 사업연도별 주식수 조정 (V2 영역, V1 미지원 — 한계 안내만).
- §56④ 세무조정 자동화 (V1은 사용자 입력 = 조정 완료 가정).
- §56② 추정이익(신용평가기관 2곳) 대체 평가 (별도 기능).

## 10. 리스크

| 리스크 | 대응 |
|---|---|
| legacy weightedNetIncome 데이터 회귀 | `resolveWeightedNetIncome` fallback + C-4 anchor 우선 |
| **V2 calcWeightedAvg3y와 floor 정책 충돌** (검증) | V1 전용 floor-less `calcCompanyWeightedNetIncome3Y` 신설, 단일 floor(P2-D) 유지. 헬퍼 재사용 안 함 |
| **CurrencyInput·DecimalInput 음수 미지원** (검증 확정) | 연도별 "결손(적자)" 토글로 음수 변환. PR-2에서 결손 토글 구현 |
| **Zod weightedNetIncome required** (검증) | `.optional().default(0)` 완화 + superRefine. ⑫에서 처리 |
| 1주당 단위 vs 회사 전체 단위 혼동 | 회사 전체 유지(기존 일관). 라벨에 "회사 전체" 명시 |
| 3년치 일부 미입력 | 0 처리 + 명시 안내, Pre-Do로 validate 정책 확정 |
| V2 `weightedNetIncomePerShare`와 V1 `weightedNetIncome` 혼동 | 별개 필드(V2는 PerShare 접미). V1 작업은 V2 무관 — grep 시 접미 구분 |
