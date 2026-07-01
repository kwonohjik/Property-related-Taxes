# 비자발적 양도 감면(§77·§77의2·§77의3) — UI 설계

> 엔진 설계: [`transfer-expropriation-77-133-2025.engine.design.md`](./transfer-expropriation-77-133-2025.engine.design.md)
> 계획서: [`../../00-pm/transfer-expropriation-77-133-2025-amendment.plan.md`](../../00-pm/transfer-expropriation-77-133-2025-amendment.plan.md)

## 사용자 시나리오

1. **§77(기존)**: 2025.1.1 이후 양도자가 감면 선택 → 안내·라디오 라벨이 **인상된 율(현금 15%·채권 20/35/45%)** 로 표시되어야 함(현재 하드코딩 10/15/30/40).
2. **§77의3(신규)**: 개발제한구역 내(또는 해제) 토지를 매수청구·협의매수로 양도 → 취득시점·거주요건 입력 → 40%/25%/0% 자동 판정.
3. **§77의2(신규)**: 대토보상(토지 보상)받는 수용 → 감면(40%)/과세이연 모드 선택 + 현금·대토보상액 입력.

---

## 입력 위젯 배치 (Step5 감면·공제 + UnifiedReductionPanel)

세 감면 모두 **standalone**(체크박스 진입) — `UnifiedReductionPanel.tsx`의 `StandaloneCheckbox` 3종(§77·§77의3·§77의2). 자산 종류 게이트: 토지(land·land_nbl 등) 전용.

### A. §77 (기존 수정) — 양도연도 동적 라벨

```
┌─ ☑ 공익사업 수용·협의매수 (조특법 §77) ────────────────┐   ← ToggleCard tone=emerald
│  {양도≥2025: "현금 15%, 채권 20% (3년 35%, 5년 45%). 연간 한도 2억원."}   │  ← Step5.tsx:220 동적화
│  {양도<2025: "현금 10%, 채권 15% (3년 30%, 5년 40%). 연간 한도 1억원."}   │
│  현금 보상액 [__________] 원    채권 보상액 [__________] 원              │
│  채권 만기보유 특약  (○ 없음  ○ 3년  ○ 5년)                            │  ← 라벨 %도 연도 동적 (:258-260)
│  사업인정고시일 [YYYY][MM][DD]                                          │
│  부칙 §53 판정용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도=종전율)   │
└──────────────────────────────────────────────────────────┘
```
- 라벨 율·한도는 폼 전역 `transferDate`에서 파생(`양도연도>=2025` 분기). **useEffect→store 미러링 금지** — 순수 파생 표시(memory `mirror-pattern`).

### B. §77의3 신규 — 개발제한구역 매수 토지 (색상 카드 + 섹션번호)

```
┌─ ☑ 개발제한구역 매수 토지 감면 (조특법 §77의3) ──────────┐   ← ToggleCard tone=emerald
│  40%(지정일前 취득+거주) / 25%(매수일−20년前+거주). 연간 2억·5년 3억. │
│  ┌①구역 상태 (rose) ───────────────────────────────┐   │
│  │ (○ 구역 내 매수·협의매수  ○ 해제 후 협의매수·수용)     │   │ ← RadioCardGroup branch
│  └──────────────────────────────────────────────┘   │
│  ┌②시점 (amber) ─────────────────────────────────┐   │
│  │ 개발제한구역 지정일 [YYYY-MM-DD]                    │   │ ← DateInput
│  │ 매수청구·협의매수일 [YYYY-MM-DD] (해제분: 사업인정고시일)│   │
│  │ [해제분만] 해제일 [YYYY-MM-DD]  ☐ 경제자유구역 지정(5년)│   │ ← branch=released 시 노출
│  └──────────────────────────────────────────────┘   │
│  ┌③거주 (violet) ────────────────────────────────┐   │
│  │ ☑ 취득일~매수/고시일까지 소재지 거주               │   │ ← ToggleCard(거주요건, MVP boolean)
│  └──────────────────────────────────────────────┘   │
│  ※ 거주기간 계산 세부는 시행령 위임(§77의3④) → P0 확인 후 boolean vs 거주기간 입력 확정 │
│  → 판정: 40% 적용 (지정일 이전 취득 + 거주요건 충족)     │   ← 실시간 파생 배지
└──────────────────────────────────────────────────────┘
```
- 취득일은 **자산-수준 `acquisitionDate` 재사용**(상속 시 피상속인 취득일은 자산 상속취득 섹션에서). 별도 입력 금지(single-source).
- `branch==="in_zone"`이면 해제일·경제자유구역 행 **미노출**(토글 가시성).

### C. §77의2 신규 — 대토보상 과세특례

```
┌─ ☑ 대토보상 과세특례 (조특법 §77의2) ────────────────┐   ← ToggleCard tone=emerald
│  대토보상분 양도세 40% 감면 또는 과세이연. 2026.12.31까지 양도. │
│  ┌①모드 (amber) ─────────────────────────────────┐  │
│  │ (○ 40% 세액감면   ○ 과세이연)                      │  │ ← RadioCardGroup mode
│  └──────────────────────────────────────────────┘  │
│  현금 보상액 [__________] 원   대토(토지) 보상액 [______] 원  │
│  사업인정고시일 [YYYY-MM-DD]                             │
│  ⚠ 이연 선택 시: 현금전환·현물출자 시 이자상당가산액 추징(§77의2③) │  ← 이연 모드 amber 경고
└──────────────────────────────────────────────────────┘
```

---

## 8 클라이언트 동기화 지점

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 타입 | `lib/stores/calc-wizard-asset-reduction.ts:42` | `gb_designated_land`·`replacement_land_comp` variant 추가(discriminated) |
| ② | initial | 동상 | 신규 variant 기본값(모드·branch·거주 false·일자 "") |
| ③ | normalize | `calc-wizard-migration.ts` | sessionStorage 마이그레이션 필드 보정 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-reductions.ts` | 폼→엔진 input(Date 변환·안분액·모드) |
| ⑤ | UI 위젯 | `app/calc/transfer-tax/steps/Step5.tsx` + `UnifiedReductionPanel.tsx` | 카드 A(수정)·B·C 신규. `StandaloneCheckbox` type union(`:359` `"self_farming"｜"public_expropriation"`)에 2종 추가 + `STANDALONE_LABELS`·`toggleStandalone` 확장 |
| ⑥ | 사이드바 | `compute*Summary` | 감면세액 반영(결과 도착 후) |
| ⑦ | 결과 카드 | `components/calc/results/transfer/TransferReductionRows.tsx` | `GbDesignatedLandRow`·`ReplacementLandRow` 신규(율·판정·산식 변수) |
| ⑧ | validation | `lib/calc/transfer-tax-validate-reductions.ts` | 필수 필드(지정일·매수일·거주·모드·보상액). UI/API fallback ↔ validate 동기화 |

---

## 결과 카드 (⑦ 산식 변수 표시 — `formula-display-builder` 패턴)

### §77의3
```
개발제한구역 매수 토지 감면 상세 (조특법 §77의3①1호)   [§77의3 링크]   ※ 숫자 예시(illustrative)
① 요건: 지정일 이전 취득 + 소재지 거주 ✓ → 40% (1호)
② 감면대상소득 = (양도소득금액 − 기본공제) × 40% = 과세표준 × 40%
③ 감면세액 = 산출세액 × 감면대상소득 / 과세표준   (엔진: raw=calc×reducibleIncome/taxBase, floor)
          = 산출세액 × 40%  (전부 감면대상인 경우)
④ §133② 연간 2억 한도 이내 (capping 없음)
```
- 산식은 §77 엔진 골격 동일(`reducibleIncome = 과세표준분 소득 × 율`, `감면세액 = 산출세액 × reducibleIncome / 과세표준`). 단일 율이라 현금/채권 분할 없음.
- 비적격 시 rose 안내(사유: 지정 후 취득 & 20년 이내 / 거주요건 미충족 / sunset 경과).

### §77의2
```
대토보상 과세특례 상세 (조특법 §77의2 — 40% 감면 모드)   [§77의2 링크]
① 안분: 대토보상 X / (현금 Y + 대토 X) = Z%
② 대토보상분 소득 = 양도소득금액 × Z%
③ 감면세액 = 산출세액 × 대토분소득 / 과세표준 × 40%
[이연 모드] 대토보상분 양도세 이연 = ... (승계취득가액 기준, 추징 §77의2③ 안내)
```

---

## UI 규칙 준수 체크

- ☑ `DateInput`(type=date 금지)·`CurrencyInput`+`parseAmount`(원)·`RadioCardGroup`/`ToggleCard`(native 금지)
- ☑ 토글 가시성: OFF도 tone 유지, 미선택 옵션 tone 배경 유지
- ☑ 섹션 3개↑ = 색상 카드+섹션번호(§77의3 ①구역/②시점/③거주)
- ☑ placeholder 숫자 예시 금지 → FieldCard `hint` 한국어
- ☑ 결과 산식 한국어 풀어쓰기·변수 배지·`floor()` 묵시
- ☑ 취득일 single-source(자산 `acquisitionDate` 재사용, 별도 입력 금지)
- ☑ 율·한도 라벨은 `transferDate` 순수 파생(useEffect 미러링 금지)
- ☑ 금액 칸 `text-right font-mono tabular-nums`

---

## testid (besshi-form / E2E 앵커)

- `reduction-gb-designated-branch` · `-designation-date` · `-trigger-date` · `-released-date` · `-freeeconzone` · `-resided`
- `reduction-replacement-mode` · `-cash` · `-land` · `-approval-date`
- 결과: `result-gb-designated-rate` · `result-replacement-ratio`
- E2E: `e2e/transfer-expropriation-77-2025.spec.ts` (양도 2026 §77 15%, §77의3 40%/25%, §77의2 감면·이연 렌더)
