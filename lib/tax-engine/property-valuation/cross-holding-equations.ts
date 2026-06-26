/**
 * 상호출자 비상장주식 평가 — 다원일차연립방정식 (N법인 일반해)
 *
 * 근거: 국세청 상증 평가준칙 §60② (훈령 — 시행령 명문 아님, 효력단계 주의).
 *       할증배제는 상증령 §53⑧4호 (1차 출자분 중복할증 방지, eflaw 본문 검증 2026-06-26).
 *
 * 평가대상 법인 A가 다른 비상장법인 B(·C)의 주식을 보유하고, 상대도 A 주식을 보유하는
 * 상호출자 구조에서는 각 법인의 1주당 순자산가치 αᵢ가 서로의 평가액에 의존 → 선형 연립방정식.
 *
 *   αᵢ = { Pᵢ + Σ_{j≠i}(heldᵢⱼ × premiumFactorᵢ × issuerValueⱼ) − dᵢ } / ηᵢ
 *
 *     issuerValueⱼ = valuationBasisⱼ==="net_asset_only" ? αⱼ
 *                  : isRealEstateHeavyⱼ ? (3αⱼ+2ρⱼ)/5 : (2αⱼ+3ρⱼ)/5   ← αⱼ에 선형
 *     premiumFactorᵢ = premiumOnHeldᵢ ? (1 + premiumRateᵢ) : 1
 *
 * 미지수는 αᵢ뿐(ρ는 상수) → (I − M)·α = k 형태. BigInt 유리수 가우스 소거로 정확 해.
 * 교재 사례 Ⅲ 완전 일치 검증. 정수연산 정책: 분수 유지 → 최종 1주당가액에서 floorDiv 1회.
 *
 * 입력 위상(M-3): orchestrator 경로(evaluateCrossHoldingReflection)는 TARGET 중심 **스타형**
 *   상호출자(2자 순환 N쌍 — A↔Bᵢ)만 표현 가능. 3자 이상 순환(A↔B↔C↔A)은 solveCrossHolding
 *   직접 호출로 노드를 직접 구성해야 한다(N법인 일반해 자체는 임의 위상 지원).
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-cross-holding.engine.design.md
 */

// ─────────────────────────────────────────────────────────────────
// 공개 타입
// ─────────────────────────────────────────────────────────────────

export interface CrossHoldingNode {
  /** 식별자 ("A" | "B" | "C" …) — heldShares 키와 일치 */
  corpId: string;
  corpName: string;
  /** Pᵢ — 다른 법인 주식가액을 제외한 자산총액 */
  netAssetExStock: number;
  /** dᵢ — 부채총계 */
  totalLiabilities: number;
  /** ηᵢ — 발행주식 총수 (평가기준일 현재) */
  issuedShares: number;
  /** ρᵢ — 1주당 순손익가치 (순자산단독 사례는 0) */
  netIncomePerShare: number;
  /** 이슈어별 가중치: weighted 부동산과다 시 (3α+2ρ)/5 */
  isRealEstateHeavy: boolean;
  /**
   * 이 법인(이슈어)의 1주당 평가기준:
   *  - "weighted"       → (2α+3ρ)/5 [부동산과다 (3α+2ρ)/5]
   *  - "net_asset_only" → α (상증령 §54④ 순자산단독 사유)
   */
  valuationBasis: "weighted" | "net_asset_only";
  /** 이 법인이 보유한 상대 법인 주식수: { [상대corpId]: shares } */
  heldShares: Record<string, number>;
  /**
   * §53⑧4호: 이 보유분 할증 적용 여부.
   *  - true  = 보유주식 평가 시 할증 (2021.2.17 §53⑧4호 개정 전 기준)
   *  - false = 할증 배제 (개정 후 신고분 — 1차 출자분 중복할증 방지)
   */
  premiumOnHeld: boolean;
  /** 할증률 (0 | 0.2 | 0.3 …) — premiumOnHeld=true 시 보유주식 평가에 가산 */
  premiumRate: number;
}

export interface CrossHoldingHeldValuation {
  holderId: string;
  issuerId: string;
  shares: number;
  /** 발행법인 1주당 평가액 (보충적 또는 순자산단독) */
  issuerPerShareValue: number;
  /** 보유주식 보충적평가액 = shares × issuerPerShareValue × premiumFactor */
  supplementaryValue: number;
}

export interface CrossHoldingSolution {
  /** αᵢ — 1주당 순자산가치 (정수, floorDiv) */
  perShareNetAsset: Record<string, number>;
  /** 1주당 평가액 = weighted:(2α+3ρ)/5 [부동산과다 (3α+2ρ)/5] | net_asset_only:α (정수) */
  perShareSupplementary: Record<string, number>;
  /** 보유관계별 평가액 (자산반영용) */
  heldValuation: CrossHoldingHeldValuation[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────
// BigInt 유리수 (분수) 헬퍼 — 부동소수 금지
// ─────────────────────────────────────────────────────────────────

interface Rat {
  n: bigint; // 분자
  d: bigint; // 분모 ( > 0 )
}

function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new Error("cross-holding: 분모 0 (발행주식수 0?)");
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  return { n: nn, d: dd };
}

function rAdd(a: Rat, b: Rat): Rat {
  return reduce({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
}
function rSub(a: Rat, b: Rat): Rat {
  return reduce({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
}
function rMul(a: Rat, b: Rat): Rat {
  return reduce({ n: a.n * b.n, d: a.d * b.d });
}
function rDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new Error("cross-holding: 0으로 나눔 (특이 행렬?)");
  return reduce({ n: a.n * b.d, d: a.d * b.n });
}
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1n;
}
function reduce(r: Rat): Rat {
  let { n, d } = r;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
/** 원 단위 절사 (floor) — 음수도 수학적 floor */
function floorDiv(r: Rat): number {
  const q = r.n / r.d;
  const rem = r.n % r.d;
  const f = rem !== 0n && r.n < 0n ? q - 1n : q;
  return Number(f);
}

// ─────────────────────────────────────────────────────────────────
// 가우스 소거 (Rat 행렬)
// ─────────────────────────────────────────────────────────────────

/** (M | b) → x 해. M: N×N Rat, b: N Rat. 부분 피벗팅. */
function solveLinear(M: Rat[][], b: Rat[]): Rat[] {
  const n = b.length;
  // 증강 행렬 복사
  const A = M.map((row, i) => [...row.map((c) => ({ ...c })), { ...b[i] }]);
  for (let col = 0; col < n; col++) {
    // 피벗: 분자 0이 아닌 행 탐색
    let piv = -1;
    for (let r = col; r < n; r++) {
      if (A[r][col].n !== 0n) {
        piv = r;
        break;
      }
    }
    if (piv === -1) throw new Error("cross-holding: 특이 행렬 — 해 없음/무수히 많음");
    if (piv !== col) [A[col], A[piv]] = [A[piv], A[col]];
    // 정규화
    const pivVal = A[col][col];
    for (let c = col; c <= n; c++) A[col][c] = rDiv(A[col][c], pivVal);
    // 소거
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor.n === 0n) continue;
      for (let c = col; c <= n; c++) {
        A[r][c] = rSub(A[r][c], rMul(factor, A[col][c]));
      }
    }
  }
  return A.map((row) => row[n]);
}

// ─────────────────────────────────────────────────────────────────
// 메인: 상호출자 연립방정식 풀이
// ─────────────────────────────────────────────────────────────────

/**
 * issuerValueⱼ(αⱼ) 의 선형 계수 반환: issuerValue = base + slope·αⱼ
 *   weighted       : (2αⱼ+3ρⱼ)/5  → base=3ρ/5, slope=2/5  (부동산과다: base=2ρ/5, slope=3/5)
 *   net_asset_only : αⱼ            → base=0,    slope=1
 */
function issuerValueCoef(node: CrossHoldingNode): { base: Rat; slope: Rat } {
  if (node.valuationBasis === "net_asset_only") {
    return { base: rat(0), slope: rat(1) };
  }
  const rho = node.netIncomePerShare;
  if (node.isRealEstateHeavy) {
    return { base: rat(2 * rho, 5), slope: rat(3, 5) };
  }
  return { base: rat(3 * rho, 5), slope: rat(2, 5) };
}

export function solveCrossHolding(nodes: CrossHoldingNode[]): CrossHoldingSolution {
  const warnings: string[] = [];
  if (nodes.length === 0) {
    return { perShareNetAsset: {}, perShareSupplementary: {}, heldValuation: [], warnings };
  }
  const ids = nodes.map((n) => n.corpId);
  const idx: Record<string, number> = {};
  ids.forEach((id, i) => (idx[id] = i));
  const N = nodes.length;

  // αᵢ = kᵢ + Σ_{j≠i} mᵢⱼ·αⱼ  를 (I − M)·α = k 로 구성.
  //   αᵢ = { Pᵢ + Σ heldᵢⱼ·pfᵢ·(baseⱼ + slopeⱼ·αⱼ) − dᵢ } / ηᵢ
  //   kᵢ = { Pᵢ − dᵢ + Σ heldᵢⱼ·pfᵢ·baseⱼ } / ηᵢ
  //   mᵢⱼ = (heldᵢⱼ·pfᵢ·slopeⱼ) / ηᵢ
  const A: Rat[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => rat(0)));
  const k: Rat[] = Array.from({ length: N }, () => rat(0));

  for (let i = 0; i < N; i++) {
    const node = nodes[i];
    const eta = rat(node.issuedShares);
    const pf = rat(
      node.premiumOnHeld ? Math.round((1 + node.premiumRate) * 1000) : 1000,
      1000,
    ); // (1+rate) 유리수화 (소수 3자리 — 0.3 등 정확)
    let kNum = rat(node.netAssetExStock - node.totalLiabilities);
    for (const [issuerId, shares] of Object.entries(node.heldShares)) {
      const j = idx[issuerId];
      if (j === undefined) {
        warnings.push(`[${node.corpId}] 보유 발행법인 ${issuerId} 노드 누락 — 무시`);
        continue;
      }
      const coef = issuerValueCoef(nodes[j]);
      const heldPf = rMul(rat(shares), pf);
      kNum = rAdd(kNum, rMul(heldPf, coef.base)); // + heldᵢⱼ·pfᵢ·baseⱼ
      // mᵢⱼ 누적 (자기항 j=i도 가능 — 자기참조 보유는 드물지만 일반화)
      A[i][j] = rSub(A[i][j], rDiv(rMul(heldPf, coef.slope), eta)); // −mᵢⱼ
    }
    k[i] = rDiv(kNum, eta);
    A[i][i] = rAdd(A[i][i], rat(1)); // (I − M) 대각 +1
  }

  const alphaRat = solveLinear(A, k);

  const perShareNetAsset: Record<string, number> = {};
  const perShareSupplementary: Record<string, number> = {};
  const alphaById: Record<string, Rat> = {};
  for (let i = 0; i < N; i++) {
    const node = nodes[i];
    alphaById[node.corpId] = alphaRat[i];
    perShareNetAsset[node.corpId] = floorDiv(alphaRat[i]);
    // 최종 1주당 평가액
    let supp: Rat;
    if (node.valuationBasis === "net_asset_only") {
      supp = alphaRat[i];
    } else {
      const rho = node.netIncomePerShare;
      supp = node.isRealEstateHeavy
        ? rDiv(rAdd(rMul(rat(3), alphaRat[i]), rat(2 * rho)), rat(5))
        : rDiv(rAdd(rMul(rat(2), alphaRat[i]), rat(3 * rho)), rat(5));
    }
    perShareSupplementary[node.corpId] = floorDiv(supp);
  }

  // 보유관계별 평가액 (자산반영용) — issuerPerShareValue는 정수 per-share 사용 (자산반영 일관)
  // H-1: BigInt 정수 곱(부동소수·overflow 금지). factor = (1+rate)를 3자리 유리수로 정수화.
  const heldValuation: CrossHoldingHeldValuation[] = [];
  for (const node of nodes) {
    const factorMilli = node.premiumOnHeld
      ? BigInt(Math.round((1 + node.premiumRate) * 1000))
      : 1000n;
    for (const [issuerId, shares] of Object.entries(node.heldShares)) {
      if (idx[issuerId] === undefined) continue;
      const issuerPerShare = perShareSupplementary[issuerId];
      // floor(shares × issuerPerShare × factor) — BigInt 정수 연산 (값 ≥ 0)
      const supplementaryValue = Number(
        (BigInt(shares) * BigInt(issuerPerShare) * factorMilli) / 1000n,
      );
      heldValuation.push({
        holderId: node.corpId,
        issuerId,
        shares,
        issuerPerShareValue: issuerPerShare,
        supplementaryValue,
      });
    }
  }

  return { perShareNetAsset, perShareSupplementary, heldValuation, warnings };
}

// ─────────────────────────────────────────────────────────────────
// Orchestrator 통합 — 평가대상(TARGET) 순자산 자산반영
// ─────────────────────────────────────────────────────────────────

import type { OtherUnlistedHolding } from "./other-unlisted-holdings";
import { isWithinTenPercentThreshold } from "./other-unlisted-holdings";

/** 평가대상 법인(TARGET) 노드 파라미터 — 메인 V2 입력에서 도출 */
export interface CrossHoldingTargetParams {
  /** Pᴬ — 보유 다른 비상장주식(장부) 제외 자산총액 = bsTotalAssets − Σ(holding.bookValue) */
  netAssetExStock: number;
  totalLiabilities: number;
  issuedShares: number;
  netIncomePerShare: number;
  isRealEstateHeavy: boolean;
  valuationBasis: "weighted" | "net_asset_only";
}

const TARGET_ID = "__TARGET__";

export interface CrossHoldingReflectionResult {
  /** ②평가차액 주입액 = Σ(적용액 − 장부가액). 적용액=Max(장부,보충적)이므로 **항상 ≥ 0** (uplift만, M-2) */
  assetValuationDeltaInjection: number;
  /** 보유관계별 최종 적용액 (Max(장부, 보충적)) */
  appliedHoldings: Array<{
    rowId: string;
    issuerCorpName: string;
    bookValue: number;
    supplementaryValue: number;
    appliedValue: number;
  }>;
  solution: CrossHoldingSolution;
  warnings: string[];
}

/**
 * 10% 초과 보유(상호출자 포함) 다른 비상장주식을 평가해 평가대상 순자산 ②평가차액 주입액 산정.
 *
 * - counterparty 입력이 있는 holding만 처리 (10% 초과 — Max(장부, 보충적)).
 * - crossHeldOfTarget > 0 → 상호출자(연립). = 0 → 단방향(비순환, β가 α에 무의존).
 * - 할증: 현행 상증령 §53⑧4호 — 1차 출자분 할증 배제 → premiumOnHeld=false (modern default).
 *   (2021.2.17 개정 전 이중할증 사례Ⅰ형은 solveCrossHolding 직접 호출로만 재현)
 * - 적용액 = Max(bookValue, 보충적평가가액). 주입액 = Σ(적용액 − bookValue).
 */
export function evaluateCrossHoldingReflection(
  target: CrossHoldingTargetParams,
  holdings: OtherUnlistedHolding[] | undefined,
): CrossHoldingReflectionResult | undefined {
  // H-2: counterparty 입력 + 실제 10% 초과 보유만 연립 발동 (≤10%는 §54③ 이동평균법 경로).
  //      UI에서 over10→false 전환 후 counterparty 잔존해도 엔진이 보유비율로 재검증.
  const overTen = (holdings ?? []).filter((h) => {
    if (!h.counterparty) return false;
    const { withinThreshold } = isWithinTenPercentThreshold(
      h.holdingShares,
      h.totalShares,
      h.treasuryShares ?? 0,
    );
    return !withinThreshold;
  });
  if (overTen.length === 0) return undefined;

  const warnings: string[] = [];
  const nodes: CrossHoldingNode[] = [
    {
      corpId: TARGET_ID,
      corpName: "평가대상",
      netAssetExStock: target.netAssetExStock,
      totalLiabilities: target.totalLiabilities,
      issuedShares: target.issuedShares,
      netIncomePerShare: target.netIncomePerShare,
      isRealEstateHeavy: target.isRealEstateHeavy,
      valuationBasis: target.valuationBasis,
      heldShares: Object.fromEntries(overTen.map((h) => [h.rowId, h.holdingShares])),
      premiumOnHeld: false, // §53⑧4호 (현행) — 1차 출자분 할증 배제
      premiumRate: 0,
    },
  ];
  for (const h of overTen) {
    const cp = h.counterparty!;
    nodes.push({
      corpId: h.rowId,
      corpName: h.issuerCorpName,
      netAssetExStock: cp.netAssetExStock,
      totalLiabilities: cp.totalLiabilities,
      issuedShares: cp.issuedShares,
      netIncomePerShare: cp.netIncomePerShare,
      isRealEstateHeavy: cp.isRealEstateHeavy,
      valuationBasis: cp.netAssetOnly ? "net_asset_only" : "weighted",
      heldShares: cp.crossHeldOfTarget > 0 ? { [TARGET_ID]: cp.crossHeldOfTarget } : {},
      premiumOnHeld: false,
      premiumRate: 0,
    });
  }

  const solution = solveCrossHolding(nodes);
  warnings.push(...solution.warnings);

  const appliedHoldings = overTen.map((h) => {
    const hv = solution.heldValuation.find(
      (v) => v.holderId === TARGET_ID && v.issuerId === h.rowId,
    );
    const supplementaryValue = hv?.supplementaryValue ?? 0;
    const bookValue = h.bookValue ?? 0;
    const appliedValue = Math.max(bookValue, supplementaryValue);
    return {
      rowId: h.rowId,
      issuerCorpName: h.issuerCorpName,
      bookValue,
      supplementaryValue,
      appliedValue,
    };
  });

  const assetValuationDeltaInjection = appliedHoldings.reduce(
    (sum, a) => sum + (a.appliedValue - a.bookValue),
    0,
  );

  return { assetValuationDeltaInjection, appliedHoldings, solution, warnings };
}
