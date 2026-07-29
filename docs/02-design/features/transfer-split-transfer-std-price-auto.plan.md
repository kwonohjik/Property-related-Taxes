# 토지·건물 분리 — 「양도시 기준시가」 라벨 정정 + 자동 계산

> 대상: `components/calc/transfer/LandBuildingSplitSection.tsx` 하단 "양도시 기준시가" 2칸
> 범위: **UI 전용**(엔진·API·Zod·validate 변경 0 — 아래 §5에서 실측 확인)
> 작성일: 2026-07-29

---

## 1. 현황 (실측)

### 1.1 문제의 화면

`LandBuildingSplitSection.tsx:373-383` — `needsSaleStdPrice`(일괄양도 안분 **또는** 어느 한 파트가 환산) 시 노출:

```tsx
<FieldCard label="토지 양도시 기준시가" hint="안분 분모 겸 환산취득가 분모">
  <CurrencyInput ... placeholder="양도시 토지 기준시가" />   // ← 맨입력(CurrencyInput 단독)
</FieldCard>
<FieldCard label="건물 양도시 기준시가">
  <CurrencyInput ... placeholder="양도시 건물 기준시가" />   // ← 맨입력
</FieldCard>
```

두 칸 모두 **금액 총액 직접 타이핑**만 가능하다. 조회·계산 보조가 전혀 없다.

### 1.2 대칭 지점은 이미 자동화돼 있다

같은 파일 위쪽 `PartAcqStdPrice`(`:99-171`) — **취득시** 기준시가는 파트별로 이미 자동 계산된다:

| 파트 | 위젯 | 산식 |
|---|---|---|
| 토지 | `LandPriceLookupField`(`:119-127`) — 연도 Select + Vworld 조회 + 자동 계산 | ㎡당 개별공시지가 × 면적 |
| 건물 | `BuildingStdPriceModalButton`(`:155-167`, `applyTimePoint="acquisition"`) | 「건물 기준시가 계산서」 모달 산정 |

즉 **양도시만 수동 입력으로 남아 있는 비대칭**이다. 본 작업은 그 비대칭을 해소한다.

### 1.3 미입력은 이미 차단된다 (= 사용자 부담이 실재)

`lib/calc/transfer-tax-validate-split.ts:107-124` — `saleSplitMode === "apportioned" || 파트 모드 estimated`이면
토지·건물 양도시 기준시가 **둘 다 필수**, 미입력 시 계산 차단:

> "일괄양도 안분·환산취득가 계산에는 토지·건물 양도시 기준시가가 필요합니다(§166⑥ 양도 당시 기준시가). 국세청 홈택스 기준시가 조회 후 입력하세요."

안내문이 "홈택스에서 조회해 오라"고 외부 이탈을 요구한다. 취득시는 앱 안에서 조회되는데 양도시만 밖으로 내보내는 상태다.

---

## 2. 요구사항

| # | 내용 |
|---|---|
| R1 | 라벨을 **"양도시 토지 기준시가" · "양도시 건물 기준시가"**로 변경 (시점 → 대상 어순) |
| R2 | 두 칸의 **자동 계산** 기능 구현 |

---

## 3. 법령 구조 — 양도가액 안분의 기준시가는 **파트별 독립 공시액**

> ⚠️ **2026-07-29 정정 (사용자 확정)**. 초판은 취득시 축의 「라목 결합 총액 − 토지분」 역산을
> 양도시에도 적용하도록 설계했으나 **오류**다. 아래가 정본이다.

양도가액 안분은 소득령 §166⑥이 부가가치세법 시행령 §64①1호를 준용한다. 그 산식의 기준시가는
**각 파트의 고유 공시액**이다:

| 파트 | 산정 방법 | 근거 |
|---|---|---|
| 토지 | ㎡당 개별공시지가 × 양도 당시 면적 | 소득세법 §99①1호 **가목** |
| 건물 | 국세청장 산정 건물 기준시가 —「건물 기준시가 계산서」 | 소득세법 §99①1호 **나목** |

**자산 종류로 갈리지 않는다.** 주택(`housing`)도 일반 건물(`building`)과 동일하게 파트별로 산정한다.

### 3.1 취득시 규칙을 양도시로 옮기면 안 되는 이유

엔진 `transfer-tax-split-gain.ts:27-62`(`calcAcqStdPair`)와 `PartAcqStdPrice`가 주택에 대해
「라목 결합 총액 − 토지분」 역산을 쓰는 것은 사실이다. 그러나 그 규칙의 **목적이 다르다**:

| 축 | 목적 | 그래서 |
|---|---|---|
| **취득시** | 개산공제 합계를 법정액(§163⑥2호가목 = 라목 가액 × 3/100)에 맞춤 | 결합 총액과의 **항등성**이 요건 → 역산이 정본 |
| **양도시** | 일괄 양도대가를 토지·건물로 **나눔**(부가세령 §64①1호) | 각 파트의 **고유 기준시가**가 정본 → 역산은 근거 없음 |

취득시 항등성 요건은 양도가액 안분에 존재하지 않는다. 결합 공시액에서 토지분을 빼면 그 잔액은
「국세청장이 산정한 건물 기준시가」가 아니라 단순 차액이며, 법령이 요구하는 값이 아니다.

---

## 4. 설계

`needsSaleStdPrice`(일괄양도 안분 **또는** 어느 한 파트가 환산) 게이트는 그대로 유지한다.
자산 종류 분기 없이 **단일 구조**다.

```
┌ ToneCard tone="emerald" "양도시 토지 기준시가 자동 계산 (§99①1호 가목)" ┐
│  LandPriceLookupField  (연도 Select + 공시지가 조회 + 토지기준시가 표시)   │
│    pricePerSqm   = asset.standardPricePerSqmAtTransfer                   │
│    referenceDate = transferDate    ← 취득일 아님 (§164③ 직전 고시분)      │
│  DecimalInput "토지 면적 (양도 당시)" → asset.transferArea                │
└──────────────────────────────────────────────────────────────────────────┘
┌ 양도시 토지 기준시가 ┐  ┌ 양도시 건물 기준시가 ─────────────────┐
│ (위에서 자동 계산)    │  │ CurrencyInput                        │
│ 수동 편집 가능        │  │ [양도시 건물 기준시가 계산] ← 모달 런처 │
└──────────────────────┘  └──────────────────────────────────────┘
```

- 토지 총액 기록: `LandPriceLookupField`는 계산 결과를 표시만 하므로(`:213-227` 읽기전용 박스),
  `landStandardPriceAtTransfer` 기록은 호출부의 onChange 핸들러(`writeLandStd`)가 담당한다.
  단가·면적·총액 3키를 **단일 배치 patch**로 쓴다(memory `multikey patch stale spread overwrite`).
- 절사는 `Math.floor` — `StandardPriceInput:136,149,180`과 동일 규칙.
- 건물 모달: `BuildingStdPriceModalButton` `applyTimePoint="transfer"`,
  `snapshotKey = bsp-${assetId}-split-transfer`(「건물 기준시가 계산서」 서식 출력 소스),
  prefill = `{ landAreaM2: transferArea, transferDate, transferLandPricePerSqm }`.
- 두 총액 칸 모두 **수동 편집 가능**(홈택스 실제 고시액 우선).
- **결합 총액(개별·공동주택가격) 입력칸은 이 블록에 두지 않는다** — 역산을 폐지했으므로 쓰이지 않는다.

---

## 5. 필드 매핑 — 신규 필드 0건, 배관 변경 0건

| 용도 | 기존 필드 | 배관 상태 (실측) |
|---|---|---|
| 토지 양도시 총액 | `landStandardPriceAtTransfer` | ① `calc-wizard-asset.ts:402` ② `asset-factory.ts:176` ③ `asset-migrate.ts:345` ④ `transfer-tax-api-split.ts:130` ⑧ `validate-split.ts:118` ⑫ `transfer-tax-schema.ts:274` ⑭ `route.ts:270` — **전부 기존 결선 완료** |
| 건물 양도시 총액 | `buildingStandardPriceAtTransfer` | 동상 (`:404` / `route.ts:271`) |
| 양도시 ㎡당 공시지가 | `standardPricePerSqmAtTransfer` | `calc-wizard-asset.ts:485`, `route.ts:126` 기존 전송 |
| 양도 당시 면적 | `transferArea` | `calc-wizard-asset.ts:93` 기존 |

**⇒ 14 동기화 지점 중 실제 변경은 ⑤(UI 입력 위젯) 단 하나.** 엔진(`transfer-tax-split-gain.ts:148-198`)은
이미 이 필드들을 소비하고 있으므로 계산 결과는 "사용자가 손으로 넣던 값을 앱이 넣어준다"는 것 외엔 불변이다.

### 5.1 기존 필드 재사용의 충돌 검토

`assetKind === "building"` + `useEstimatedAcquisition === true`이면 상위 블록의 공용
`StandardPriceInput`(`CompanionAcqPurchaseBlock:653-668`)이 `propertyKind="building_non_residential"`
→ area 모드로 **같은** `standardPricePerSqmAtTransfer` · `transferArea`를 쓰고, 그 곱을
`standardPriceAtTransfer`(결합 총액 슬롯)에 자동 기록한다.

- 단가·면적을 공유하는 것 자체는 **의도된 동기화**다(같은 필지·같은 시점 값).
- 다만 그 위젯이 "결합 총액" 슬롯에 토지분만 써 넣는 것은 **본 작업 이전부터 존재하는 별개 사안**이다.
  본 작업은 파트별 값(`land/buildingStandardPriceAtTransfer`)을 명시 기록하고, 엔진은 파트별 값이 있으면
  `standardPriceAtTransfer` fallback 경로(`split-gain.ts:194-198`)에 **도달하지 않는다** — 따라서 이 사안은
  본 작업으로 악화되지도, 해소되지도 않는다. **범위 밖으로 두고 별건 기록**한다.

---

## 6. 구현 단계

| # | 단계 | verify |
|---|---|---|
| P0 | **Pre-Do anchor** — 현행 UI에서 단가·면적만 입력하고 총액 칸을 비운 케이스가 validate에 차단되는지 실측(설계 전제 확인) | `npx vitest run __tests__/calc/transfer-tax-validate-split.test.ts` 통과 + 차단 메시지 확인 |
| P1 | **R1 라벨 정정** — `:376,379` label 2건 + placeholder 2건. placeholder는 라벨과 중복되므로 제거하고 `hint`로 이동(placeholder 숫자 예시 금지 정책은 이미 준수) | `grep -n "양도시 토지 기준시가" components/` |
| P2 | **e2e 셀렉터 동기화** — `e2e/split-mode-gating.spec.ts:35` `getByText("토지 양도시 기준시가")` → 신규 라벨 | `npx playwright test e2e/split-mode-gating.spec.ts` |
| P3 | **토지 자동 계산** — `TransferLandStdPrice`(공시지가 조회 + 면적 → 총액 배치 기록) | 단가·면적 입력 → 총액 칸 자동 반영 (RTL A-1·A-4) |
| P4 | **건물 계산기 결선** — `TransferBuildingStdPriceButton`을 「양도시 건물 기준시가」 칸에 부착. 자산 종류 무관(주택 포함) | 주택에도 런처 노출 + 토지 입력이 건물 칸을 채우지 않음 (RTL B-1·B-2 / E2E) |
| P5 | **회귀** | `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/` + `npx tsc --noEmit` |
| P6 | **브라우저 확인 (Playwright E2E)** — 일괄양도 선택 → 공시지가·면적 입력 → 토지 칸 자동 반영, 건물 칸은 계산기 경유 | `npx playwright test e2e/split-mode-gating.spec.ts` 18/18 |

### 6.1 파일 크기

`LandBuildingSplitSection.tsx` 396줄 → **구현 후 541줄**. 800줄 트리거 미도달 — 분리 불필요(과분할 방지 원칙).

### 6.2 회귀 테스트 (구현 완료 — 전건 통과)

RTL `__tests__/components/split-transfer-std-price-auto.test.tsx` (11건) ·
E2E `e2e/split-mode-gating.spec.ts` (18건) · validate anchor `__tests__/calc/transfer-tax-validate-split.test.ts` (P0 3건)

| 케이스 | 기대 |
|---|---|
| A-1 단가 5,000,000/㎡ × 면적 200㎡ | 토지 총액 `1,000,000,000` + 단가·면적 동시 보존(배치 patch 가드) |
| A-2 자동 계산 후 총액 수동 편집 | 수동값 유지 |
| A-3 건물 계산기 런처 노출 | 「건물 기준시가」 버튼 존재 |
| A-4 소수 면적 76.51㎡ | `floor(단가 × 면적)` 일치 |
| 🔴 B-1 **주택에도** 건물 계산기 노출 | 라목 역산 폐지 확인 |
| 🔴 B-2 주택 토지 입력 → 건물 칸 | **빈 값 유지**(역산 회귀 가드) |
| B-3 결합 총액 입력칸 | 이 블록에 **없음** |
| B-4 주택 토지분 540,000 × 206.6㎡ | `111,564,000` (사용자 화면 실측치와 일치) |
| C 게이트 | 구분양도+실가 → 미노출 / 환산 파트 → 노출 / 라벨 어순 |

**인과 검증**: 역산 로직 제거 + `floor`→`round` 변경 시 3건이 실패하고 복원 시 전건 통과 —
anchor가 실제로 결함을 잡음을 확인(되돌리기 테스트).

## 7. 결정 필요 사항

| # | 질문 | 권고 |
|---|---|---|
| Q1 | ~~housing 결합 총액 칸 중복~~ | **해소** — 라목 역산 폐지로 이 블록에서 결합 총액을 입력받지 않는다(2026-07-29 정정) |
| Q2 | 자동 계산값의 수동 편집 허용? | **허용**(권고). 홈택스 실제 고시액이 산식값과 1원 단위로 다를 수 있고, 기존 `StandardPriceInput` 총액 칸도 동일 정책 |
| Q3 | `assetKind`가 `housing`/`building` 외인 경우 | 이 섹션 자체가 `isSplitable = housing \|\| building` 게이트(`CompanionAcqPurchaseBlock:126-128`) 안에서만 렌더 → 추가 분기 불요 |

---

## 8. 리스크

| 리스크 | 완화 |
|---|---|
| 취득시 축의 라목 역산 규칙이 양도시로 다시 새어 들어옴 | §3.1에 목적 차이를 명시 + B-2 회귀 가드(토지 입력이 건물 칸을 채우면 실패) |
| 자동 계산이 사용자 기입값을 덮어씀 | 총액은 자동 기록하되 이후 수동 편집을 보존(단가·면적을 다시 만질 때만 재계산) |
| 조회 연도 오선택(양도일 시점 미고시분 조회) | `referenceDate = transferDate` 전달 → `LandPriceLookupField`의 연도 추천·"자동/수동" 배지가 기존대로 작동 |
| e2e 라벨 셀렉터 파손 | P2에서 선동기화 (현재 파손 지점 1건: `split-mode-gating.spec.ts:35`) |
