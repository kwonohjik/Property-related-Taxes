# 엔진 설계 — 재산세 후속 갭 3건 (선박 소방분 · 상속 주된상속자 · §118 재산정)

> 계획서: `docs/01-plan/features/property-vessel-fire-heir-cap.plan.md`
> 대상 엔진: `lib/tax-engine/property-tax.ts` · `property-tax-surtax.ts` · `property-taxpayer.ts` · `types/property*.ts`
> 작성일 2026-06-16 · Design 단계 (Do 미착수)

## 1. 개요

| 작업 | 엔진 변경 표면 | input 변경 | result 변경 |
|---|---|---|---|
| A-1 선박 소방분 | `property-tax-surtax.ts` calcSurtax 분기·legalBasis | 없음(publishedPrice 재사용) | 없음(regionalResourceTax 재사용) |
| A-2 주된상속자 판정 | `property-taxpayer.ts` determineTaxpayer | `heirs` 타입 변경 | 없음(taxpayer.name 재사용) |
| A-3 §118 재산정 | `property-tax.ts` applyTaxCap 시그니처 | `previousYearTaxBase?`·`taxCapMode?` 추가 | `taxCapDetail?` echo(선택) |

## 2. 케이스 인벤토리 (전수 enumerate — memory `feedback_ui_input_path_enumeration`)

### A-1 선박 소방분 (§146③1호)
| ID | objectType | publishedPrice | 기대 결과 | 비고 |
|---|---|---|---|---|
| V-1 | vessel | 6,000,000 (구간1 경계) | `floor(6,000,000×4/10,000)=2,400` | 하한 구간 |
| V-2 | vessel | 50,000,000 | `24,100+floor(11,000,000×10/10,000)=35,100` | **주 anchor** |
| V-3 | vessel | 100,000,000 (최고구간) | `49,100+floor(36,000,000×12/10,000)=92,300` | 상한 구간 |
| V-4 | vessel | (V-2 동일) | `legalBasis ∋ REGIONAL_RESOURCE_TAX` | 근거 anchor |
| V-5 | vessel | (V-2 동일) | 화재위험 중과 ×1 (배율·echo 없음) | §146③2호 building 한정 |
| V-6 | aircraft | 임의 | `regionalResourceTax === 0` | **비대상 유지(회귀)** — §146④ 선박만 |
| V-7 | building | (기존 테스트값) | 변동 없음 | **회귀 보호** |

### A-2 주된 상속자 (§107②2호 · 시행규칙 §53)
| ID | heirs (지분/생년) | 기대 주된상속자 | 근거 |
|---|---|---|---|
| H-1 | A:0.5 / B:0.3 / C:0.2 | A | 지분 최대 |
| H-2 | A:0.4(1970) / B:0.4(1965) / C:0.2 | B | 동률 → 연장자(이른 생년) |
| H-3 | 지분 전부 미입력 | heirs[0] + warning | fallback(현행 보존) |
| H-4 | A:0.5 / B:(미입력) | heirs[0] + warning | **일부 미입력 = fallback**(§3.4) |
| H-5 | A:0.4 / B:0.4 (생년 둘 다 미입력) | heirs[0] + warning | 동률+생년부재 fallback |
| H-6 | 1명 | 그 1명 | 단독 |
| H-7 | 0명 | registeredOwner + warning | 기존 동작(`:215-218`) |

### A-3 §118 세부담상한 재산정 (§122 · 시행령 §118)
| ID | objectType | taxCapMode | 입력 | 기대 |
|---|---|---|---|---|
| C-1 | building | `direct`(기존) | previousYearTax=500,000, 당해=1,000,000 | min(1,000,000, 750,000)=750,000 |
| C-2 | building | `recompute` | previousYearTaxBase=직전과표 → 재산정 500,000 | min(1,000,000, 750,000)=750,000 |
| C-3 | housing | 무관 | 임의 | 상한 미적용(§122 단서) — determinedTax=당해 |
| C-4 | building | 미지정/미입력 | (없음) | 상한 미적용 + warning(현행) |
| C-5 | vessel/land | direct | previousYearTax | 비주택 동일 적용 (`:707` 경로) |
| C-6 | land(separated) | recompute | previousYearTaxBase | **토지 분리과세 `:581` 경로** recompute·상한 — 581/707 양 경로 일관 검증 |

## 3. 타입 변경 (input/result)

### A-2 — `heirs` (2곳 동시: `types/property.types.ts:185` · `types/property-object.types.ts:198`)
```ts
// before
heirs?: string[];
// after
heirs?: Array<{ name: string; shareRatio?: number; birthDate?: string }>; // birthDate: ISO "YYYY-MM-DD"
```
- `determineTaxpayer` Pick(`property-taxpayer.ts:86`) `"heirs"` 자동 전파. 본문 `heirs[0]`(`:222`) → `heirs[0].name`.

### A-3 — `PropertyTaxInput` (`types/property.types.ts`)
```ts
previousYearTax?: number;        // 기존 — direct 모드 직전연도 실제 부과세액
previousYearTaxBase?: number;    // 신규 — recompute 모드 직전연도 과세표준
taxCapMode?: "direct" | "recompute"; // 신규 — UI 명시 토글용. 엔진은 previousYearTaxBase 유무로도 recompute 판정 가능(taxCapMode 부재 시 base 있으면 recompute)
```
- result echo(선택): `taxCapDetail?: { mode; basis; capLimit; applied: boolean }` (산식 표시용, memory `echo-field-pattern`). 기존 `taxCapRate`(applyTaxCap 반환 `:352`)와 병존 — capLimit·basis만 추가 정보.

## 4. 알고리즘

### A-1 `calcSurtax` baseFireTax 분기 (`:108-113`)
```
baseFireTax =
  objectType === "building" → calcRegionalResourceTax(publishedPrice)
  objectType === "vessel"   → calcRegionalResourceTax(publishedPrice)   // 신규 (§146③1호 — 동일 표)
  objectType === "housing" && housingFireServiceTaxBase != null → calcRegionalResourceTax(housingFireServiceTaxBase)
  else → 0   // aircraft·land
fireHazardMultiplier = objectType === "building" ? resolve(...) : 1   // vessel ×1 유지
legalBasis: building·vessel → push REGIONAL_RESOURCE_TAX (:137); FIRE_HAZARD_SURCHARGE는 building 한정(:138)
```

### A-2 determineTaxpayer 상속 분기 (`:213-235`)
```
heirs = input.heirs ?? []
if heirs.length === 0 → registeredOwner fallback + warning        // H-7
allHaveShare = heirs.every(h => h.shareRatio != null)
if !allHaveShare → main = heirs[0] + warning("지분 미입력")        // H-3·H-4·H-5
else:
  maxShare = max(heirs.shareRatio)
  tied = heirs.filter(h => h.shareRatio === maxShare)
  if tied.length === 1 → main = tied[0]                            // H-1
  else:
    withBirth = tied.filter(h => h.birthDate)
    if withBirth.length === tied.length → main = argmin(birthDate)  // H-2 (이른 생년=연장자)
    else → main = heirs[0] + warning("생년 미입력")                 // H-5
return { type: "heir_representative", name: main.name, ... }
```
- 재사용: 공유재산 `maxShareOwner` reduce(`:241-243`) 패턴 차용(필드명만 ownerId→name).

### A-3 — recompute는 본문에서, applyTaxCap은 시그니처 최소 변경 (검토 #8 정정)
`applyTaxCap`은 rates 미보유 → **재산정은 `calculatePropertyTax` 본문(rates 접근 가능)에서 선행**하고 결과를 `previousYearTax` 자리로 주입한다. applyTaxCap 자체는 거의 불변(주택 배제·미입력 경고·min 로직 유지).

```
// calculatePropertyTax 본문 — applyTaxCap 호출 직전(Step 2.5), 비주택 한정·rates 보유
basisTax =
  (taxCapMode === "recompute" || (taxCapMode == null && previousYearTaxBase != null))
    ? recomputePriorYearTax(input.objectType, previousYearTaxBase, rates, opts)  // §118 본문 v1 기본형
    : input.previousYearTax                                                       // direct(기존)
// applyTaxCap(calculatedTax, objectType, basisTax) ← 기존 시그니처 그대로
//   주택 → 미적용(C-3) / basisTax<=0 → 미적용+경고(C-4) / else min(당해, basisTax×150%)(C-1·C-2·C-5)
```
- **호출처 2곳 모두 적용**: `property-tax.ts:707`(메인)·`:581`(토지 분리과세) — recompute→주입 패턴을 양쪽에 동일 적용.
- `recomputePriorYearTax(objectType, priorTaxBase, rates, opts)`: 직전 과세표준 × objectType별 직전 세율. v1 = 당해 세율 동일 가정(§4.5), 세율 개정연도 경고. 분할·합병·신축 등 §118 나·다·라목 **범위 외**.
- `applyTaxCap` 시그니처 불변 → **종부세 무영향**(종부세는 `comprehensive-tax-helpers.ts:206` 자체 applyTaxCap 사용, 검토 #10).

## 5. 엔진 동기화 지점 (Layer 2)

| 작업 | 파일·라인 | 종류 |
|---|---|---|
| A-1 | `property-tax-surtax.ts:108-113`(분기)·`:114-115`(게이트)·`:137`(legalBasis) | 분기 추가 |
| A-2 | `property-taxpayer.ts:86`·`:213-235`·`:222` / `types/property.types.ts:185` · `types/property-object.types.ts:198` | 타입+로직 |
| A-3 | `property-tax.ts:707`(메인 호출)·`:581`(토지 분리과세 호출) — recompute 본문 선행 후 주입 / applyTaxCap `:346-392` **시그니처 불변** / `types/property.types.ts` input 3필드 / 신규 헬퍼 `recomputePriorYearTax` | 본문+input |

단방향 의존 유지: `comprehensive-tax.ts → property-tax.ts`. **역방향 금지** (CLAUDE.md). 재산세 `applyTaxCap` 시그니처 불변 + 종부세는 자체 `comprehensive-tax-helpers.ts:206` applyTaxCap 사용 → **종부세 무영향 확정**(검토 #10).

## 6. anchor 목록 (Pre-Do 우선순위)

1. **V-2** vessel 50,000,000 → regionalResourceTax 35,100 (현재 0 → 실패 확인)
2. **V-4** vessel legalBasis ∋ REGIONAL_RESOURCE_TAX (현재 미포함 → 실패)
3. **V-6/V-7** aircraft 0 유지 · building 회귀
4. **H-1** 지분 최대 / **H-2** 동률→연장자 / **H-3·H-4** 미입력 fallback
5. **C-2** recompute 모드 750,000 / **C-1** direct 회귀 / **C-3** 주택 미적용

## 7. 800줄 정책

- `property-tax-surtax.ts` 현재 170행 — A-1 분기 추가 소폭, 무영향.
- `property-taxpayer.ts` — A-2 판정 헬퍼 분리 가능(`selectMainHeir()`), 800줄 미만 유지.
- A-3 `recomputePriorYearTax`는 신규 헬퍼로 분리(직전연도 세율 재산정 — 향후 역사 세율표 확장 대비).
