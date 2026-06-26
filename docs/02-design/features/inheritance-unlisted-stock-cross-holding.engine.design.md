# 엔진 설계 — 다른 비상장법인 주식 소유 평가 (상호출자 연립방정식)

> PDCA Design (engine) · 계획서: `inheritance-unlisted-stock-cross-holding.plan.md`
> 신규 모듈 `lib/tax-engine/property-valuation/cross-holding-equations.ts`
> ⚠️ 모든 법령 인용 = 계획서 §2 (Pre-Do KoreanLaw 검증 후 확정). 본 문서는 산식·타입·정수연산 동결.

---

## 1. 케이스 인벤토리 (엔진 분기)

| ID | 조건 | 엔진 처리 | 산출 |
|---|---|---|---|
| C1 | 10%↓, 시가 有 | `marketValue` 우선 | 보유주식 평가액 = marketValue |
| C2 | 10%↓, 시가 無 | `movingAverageAcquisitionValue` (이동평균법) | 기존 `evaluateOtherUnlistedHolding` |
| C3 | 10%↑, 시가 有 | `marketValue` 우선 | = marketValue |
| C4 | 10%↑, 시가 無, 비상호 | 피출자법인 보충적평가 1회 (2α+3ρ)/5 → **Max(장부, 보충적)** | 순환 無 |
| C5 | 10%↑, 시가 無, 상호 2법인 | **연립방정식 2원** → 각 α 확정 → **Max(장부, 보충적)** | 사례 Ⅰ·Ⅱ·Ⅲ |
| C6 | 10%↑, 시가 無, 상호 3법인 | **연립방정식 3원** (N법인 일반해) | 교재 A·B·C |
| C7 | 10%↓ 판정 분모 | 자기주식: 소각·감자목적 차감 / 일시보유 후 처분 포함 | `isWithinTenPercentThreshold` |

**발동 게이트** (계획서 E2, 준칙§60② — 확인 필요): `상호출자 관계 ∧ (∃ 일방 보유비율 > 10%)` → 관계에 속한 **모든 법인** 연립방정식. 양방 ≤10%면 각자 C2.

---

## 2. 신규 모듈 시그니처 — `cross-holding-equations.ts`

```ts
/** 연립방정식 1개 법인 노드 (평가대상 + 상호출자 상대) */
export interface CrossHoldingNode {
  corpId: string;                 // "A" | "B" | "C" … 식별자
  corpName: string;
  netAssetExStock: number;        // Pᵢ — 다른 법인 주식가액 제외 자산총액
  totalLiabilities: number;       // dᵢ — 부채총계
  issuedShares: number;           // ηᵢ — 발행주식 총수
  netIncomePerShare: number;      // ρᵢ — 1주당 순손익가치 (사례Ⅰ=0)
  isRealEstateHeavy: boolean;     // 이슈어별 가중치 (2α+3ρ)/5 ↔ (3α+2ρ)/5
  /**
   * 이 법인(이슈어)의 1주당 평가기준 (E-eng2):
   *  - "weighted"       → (2α+3ρ)/5 [부동산과다 (3α+2ρ)/5]. 사례Ⅱ·Ⅲ (보충적평가)
   *  - "net_asset_only" → α 자체 (§54④ 순자산단독 사유). 사례Ⅰ
   * 보유주식 평가액 산정 시 이 기준으로 issuer의 per-share 값을 곱한다.
   */
  valuationBasis: "weighted" | "net_asset_only";
  /** 이 법인이 보유한 상대 법인 주식수: { [상대corpId]: shares } */
  heldShares: Record<string, number>;
  /** §53⑧4호: 이 보유분 할증 적용 여부 (1차 출자분 배제 시 false) — 확인 필요.
   *  사례Ⅰ=true(2021.2.17 개정 전 이중할증 기준), 개정 후 신고분=false (M-eng2) */
  premiumOnHeld: boolean;
  premiumRate: number;            // 할증률 (0 | 0.2 | …). 사례Ⅰ=0.3(교재 1.3계수)
}

export interface CrossHoldingSolution {
  perShareNetAsset: Record<string, number>;       // αᵢ (BigInt 산출 후 정수)
  perShareSupplementary: Record<string, number>;  // 1주당 평가액 = weighted:(2α+3ρ)/5 | net_asset_only:α
  /** 자산반영용: 각 보유관계 평가액 (보유주식수 × 보충적 per-share, 할증 반영) */
  heldValuation: Array<{ holderId: string; issuerId: string; shares: number;
                          supplementaryValue: number; }>;
  warnings: string[];
}

export function solveCrossHolding(nodes: CrossHoldingNode[]): CrossHoldingSolution;
```

### 알고리즘 (선형 연립방정식 닫힌해)
미지수 = αᵢ (**1주당 순자산가치**)뿐. ρᵢ는 상수.

**핵심 정정 (E-eng1)**: αᵢ는 순자산 per share 정의 그대로 — 분모는 ηᵢ **1회**:
```
αᵢ = { Pᵢ + Σ_{j≠i} (heldSharesᵢⱼ × premiumFactorᵢⱼ × issuerValueⱼ) − dᵢ } / ηᵢ

  issuerValueⱼ = (이슈어 j의 1주당 평가기준):
    valuationBasisⱼ === "weighted"       → (2αⱼ + 3ρⱼ)/5   [부동산과다 j: (3αⱼ + 2ρⱼ)/5]
    valuationBasisⱼ === "net_asset_only" → αⱼ
  premiumFactorᵢⱼ = premiumOnHeldᵢ ? (1 + premiumRateᵢ) : 1   (사례Ⅰ=1.3)
```
> ⚠️ `[2×{…}/η + 3ρ]÷5` 형태는 **최종 1주당 평가액**(아래)이지 αᵢ가 아니다 — 혼동 금지.

**최종 1주당 평가액** (자산반영·결과표시용, αᵢ 확정 후):
```
perShareSupplementaryᵢ = valuationBasisᵢ==="net_asset_only" ? αᵢ
                         : (isRealEstateHeavyᵢ ? (3αᵢ+2ρᵢ)/5 : (2αᵢ+3ρᵢ)/5)
```

→ αᵢ = kᵢ + Σ_{j≠i} mᵢⱼ·αⱼ 형태의 **선형식**(issuerValueⱼ가 αⱼ에 선형). 행렬 `(I − M)·α = k`
를 **가우스 소거**로 해. 2법인은 2×2 직접 대입(닫힌해), 3법인↑은 일반 가우스 소거 — 동일 함수가 N 처리.
- M-eng1: 가중치 2↔3 swap은 **이슈어 j 자신의 `isRealEstateHeavy`** 기준 (평가대상 i 아님).

### 🔴 정수 연산 (계획서 L2 — Critical)
- 계수 mᵢⱼ·kᵢ 는 유리수 → **BigInt 분자/분모 쌍**으로 가우스 소거 (부동소수 금지).
- 최종 αᵢ = `floorDiv(분자, 분모)` (원 단위 절사). per-share 보충적 = `Math.floor((2α+3ρ)/5)`.
- 분자 곱셈 2^53 초과 가능 → `safeMultiply`/BigInt (`feedback_safemul_decimal_apportion_precision`).
- 교재 중간 반올림과 1원 차이 시 **1원 tolerance**(`bigint-round-half-up` 정책). 절사 시점은 사례Ⅱ·Ⅲ anchor로 동결.

---

## 3. 기존 타입 확장 — `unlisted-stock-valuation.types.ts`

### 3.1 입력: `OtherUnlistedHolding` 확장 + 신규 그룹
```ts
export type OtherHoldingEvalMethod =
  | "market"            // C1/C3 시가
  | "moving_average"    // C2 이동평균법
  | "max_book_supplementary"  // C4 10%초과 비상호
  | "cross_holding";    // C5/C6 상호출자 연립

export interface OtherUnlistedHolding {
  // … 기존 필드 …
  evaluationMethod?: OtherHoldingEvalMethod;   // 미지정 시 보유비율·marketValue로 자동도출
  bookValue?: number;                          // 장부가액 (C4/C5 Max 비교용)
  /** C5/C6: 상호출자 상대 법인 재무 (연립방정식 노드 입력) */
  counterpartyNode?: Omit<CrossHoldingNode, "corpId" | "heldShares" | "premiumOnHeld" | "premiumRate">;
  crossHeldByCounterparty?: number;            // 상대가 평가대상을 보유한 주식수 (a)
}
```
> enum 매핑 전 grep 확정 (`enum-verification-before-mapping`). `Record<OtherHoldingEvalMethod, …>` 로 컴파일러 누락 catch.

### 3.2 결과: `UnlistedStockValuationResult` 확장
```ts
/** 상호출자 연립방정식 풀이 결과 (배열 — Map 금지, feedback_engine_result_map_json_loss) */
crossHoldingSolution?: {
  perShareNetAsset: Record<string, number>;
  perShareSupplementary: Record<string, number>;
  heldValuation: Array<{ holderId: string; issuerId: string; shares: number;
                          bookValue: number; supplementaryValue: number; appliedValue: number; }>;
};
/** C2~C4 자산총액 반영분 (②평가차액 행으로 주입된 금액 echo) */
otherHoldingAssetReflected?: number;
```

---

## 4. Orchestrator 통합 — `unlisted-orchestrator.ts`

기존 `evaluateOtherUnlistedHoldings`(L378, 참고용 메타)를 **자산반영 경로로 승격**:

1. 보유 항목별 `evaluationMethod`·`valuationBasis`·`premiumOnHeld`·`premiumRate` **도출**
   (보유비율·시가·상호출자·상대법인 §54④ 사유·평가기준일 §53⑧4호 2021.2.17 전후). `solveCrossHolding`은
   결정된 값만 받는 순수 함수 — 법령 판정은 본 orchestrator/API 단계 책임 (UI 자유선택 금지, ui §3 U6).
2. C5/C6 → `solveCrossHolding(nodes)` 1회 호출 (관계 단위).
3. 각 보유분 최종 평가액 = `Max(bookValue, supplementaryValue)` (C4/C5/C6).
4. **합산액을 ②평가차액(`assetValuationDelta`)에 주입** — `unlisted-orchestrator.ts:159-172`의
   `evaluationDeltaResolved` 경로에 보유주식 평가차액(= 평가액 − 장부 반영분) **행 추가**.
   (사용자 확정: 전용 자산필드 신설 안 함. `net-asset-calc.ts:53`이 합산 소비.)
5. 통합 위치: 순자산 계산 **이전** (자산총액에 반영되어야 하므로 L159 행단위 해석 단계에 삽입).
6. `appliedRules`/`crossHoldingSolution`/`otherHoldingAssetReflected` 결과 노출.

> ⚠️ **순환 주의**: cross-holding은 평가대상 법인 A의 순자산 계산 안에서 B를 평가하나,
> B 평가에 A의 α가 필요 → `solveCrossHolding`이 **A·B를 동시에 풀어** 단방향 의존 위반 없음.
> 평가대상 A의 최종 1주당가액은 solution.perShareSupplementary["A"]에서 직접 취득(중복계산 금지).

---

## 5. 정합축 — 14 동기화 지점 (신규 필드)

| 신규 필드 | 도달 경로 |
|---|---|
| `evaluationMethod`·`bookValue`·`counterpartyNode`·`crossHeldByCounterparty` | ①폼→②initial→③normalize→④`lib/calc/`변환→⑤위젯→⑥사이드바→⑦결과카드→⑧validate→⑨⑩Zod enum→⑪자산fallback→**⑫Zod 입력객체→⑬body spread→⑭Route 매핑** |
| `crossHoldingSolution`·`otherHoldingAssetReflected` (result) | ⑦결과카드 산출근거 (echo) |

⑫⑬⑭ grep 자가점검 필수 (TS 미감지 침묵 strip). `counterpartyNode`에 Date 필드 없음 → Date 변환 불필요.

---

## 6. Anchor (Pre-Do 우선)

> 🔴 **Pre-Do 검증 결과 (BigInt 유리수)**: 교재 사례 Ⅱ·Ⅰ은 **중간계수를 반올림**(0.0665 vs exact 0.06667)해
> 누적오차 포함. 엔진은 BigInt 정확연산 → 교재와 다른 값이 법적으로 옳음. **anchor는 엔진정확값으로 동결**,
> 교재 차이는 반올림 artifact로 문서화. 사례 Ⅲ는 계수가 exact(0.04·0.32)라 교재와 완전 일치 → 1차 anchor.

| anchor | 입력 (basis / premium) | 기대 (엔진정확·1원) | 교재 |
|---|---|---|---|
| `cross-holding-case3` ⭐ | 사례Ⅲ (weighted / rate=0) | α=111,191 β=234,781 A=68,476 B=111,912 / A보유B=25,000,000(장부) B보유A=27,390,400 | **완전 일치** |
| `cross-holding-case2` | 사례Ⅱ (weighted / rate=0) | α=17,576 β=10,338 A=22,030 **B=13,135** / A보유B=**78,810,000** B보유A=110,150,000 | 교재 17,575/10,333/13,133/78,798,000 (반올림 artifact, ~12,000원차) |
| `cross-holding-case1` | 사례Ⅰ (**net_asset_only** / premiumOnHeld=true·rate=0.3) | α=173,170 β=316,401 / 할증 A=225,121 B=411,321 | α 일치, β 교재 301,401 (15,000차·교재 quirk) → α만 anchor 동결, β 제외 |
| `cross-holding-max-book` | C4 단방향 | Max(장부,보충적) 선택 | — |
| `cross-holding-gate-10pct` | 양방 ≤10% 상호출자 | 연립 미발동 → 각자 C2 | — |

**floor 시점 동결**: αᵢ는 유리수 유지 → 최종 1주당 평가액·자산반영액 산정 시 `floorDiv` 1회 절사.
중간 α를 절사하지 않는다(교재 반올림 모방 금지 — 정확연산 우선).
| `cross-holding-max-book` | C4 단방향 | Max(장부,보충적) 선택 검증 |
| `cross-holding-gate-10pct` | 양방 ≤10% 상호출자 | 연립 미발동 → 각자 C2 |

---

## 7. 파일·800줄 정책
- 신규 `cross-holding-equations.ts` (연립방정식 — 순수, ~200줄 예상).
- orchestrator 통합 diff +50줄 초과 시 `cross-holding-integration.ts` 헬퍼 분리.
- 타입은 `unlisted-stock-valuation.types.ts` 확장 (800줄 점검).
