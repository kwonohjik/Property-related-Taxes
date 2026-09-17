/**
 * 주식 양도소득세 API — **cross-field refine** (14지점 ⑫)
 *
 * `stock-transfer-tax-schema.ts` 가 800줄 hard cap 에 정확히 닿아 분리했다(File Size Policy).
 * 이음매는 **역할**이다 — 이쪽은 필드 «사이»의 관계만 보고, 필드 «정의»는 저쪽에 남는다.
 *
 * ⚠️ 기존 import 경로를 깨지 않도록 `stock-transfer-tax-schema.ts` 가 **그대로 re-export** 한다
 *    ([[feedback_800line_split_export_preservation]]).
 */

import { z } from "zod";
import type { stockTransferInputSchema } from "./stock-transfer-tax-schema";
import { toOptionalDate } from "./date-coerce";
import {
  judgeBlockShareholderGate,
  BLOCK_SHAREHOLDER_REQUIREMENT_LABEL,
} from "@/lib/tax-engine/stock-transfer/block-shareholder-gate";
import {
  isTradingHaltMarketScopeViolation,
  TRADING_HALT_MARKET_SCOPE_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";

/**
 * addStockRefines — 단건 입력에 cross-field 검증 추가
 *
 * 부동산 addPropertyRefines 패턴 차용:
 *   - 외국법인(out_of_scope_foreign) 차단 (Zod 레벨 이중 차단)
 *   - 국제거래 부정: isInternationalTransaction=true → isFraudulent=true 필수
 *   - **과점주주 3종 요건 필수**: §94①4 다목 토글 ON → 부동산비율·소유비율·누적양도비율·
 *     최초양도일 4칸 전부 필수 (영 §158①②)
 *
 * 🔴 2026-09-13 — 종전 주석은 「cumulativeTransferRatio 필수」라 **약속만 하고 refine 이 없었다**.
 *    그래서 누적 30% 든 undefined 든 그대로 통과해 기타자산 §55① 누진이 적용됐다.
 */
export function addStockRefines(
  schema: typeof stockTransferInputSchema,
) {
  return schema.superRefine((data, ctx) => {
    // 외국법인 차단 (UI validate 와 동기 — 3중 패턴)
    if ((data.marketType as string) === "out_of_scope_foreign") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["marketType"],
        message: "해외주식(§94①3 다목)은 이 계산기의 스코프 외입니다",
      });
    }

    // 국제거래 부정 60% → 반드시 isFraudulent=true (단서 조건)
    if (data.isInternationalTransaction && !data.isFraudulent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isInternationalTransaction"],
        message: "국제거래 부정 가산세(§47의2②1 단서)는 부정행위 과소신고(isFraudulent=true)와 함께 적용됩니다",
      });
    }

    // 부정행위·국제거래 가산은 신고 위반이 전제 (filingViolation !== "none")
    if (data.filingViolation === "none" && (data.isFraudulent || data.isInternationalTransaction)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filingViolation"],
        message: "부정행위·국제거래 가산세는 신고 위반(과소신고 또는 무신고)이 전제됩니다. 신고 위반 여부를 선택하세요.",
      });
    }

    /**
     * [C-3] 양도일 거래정지 + 취득 후 상장 — 법령상 양립 불가(서버 방어, validate G-5 미러)
     * §165⑤은 양도일에 §3항 주식(상장+정상거래) 전제. 거래정지는 상증령 §52의2③로 §3항 제외 → §165⑤ 불성립.
     *
     * 🔑 **취득모드 게이트를 추가한다** — 종전에는 무조건이라, 두 토글이 stale로 남은 채
     *    취득모드를 실가로 되돌리면 **아무 영향도 없는 조합에 400**이 났다(과다 차단).
     *    두 플래그는 엔진에서 `acquisitionMode === "estimated"` 분기 **안에서만** 읽히므로
     *    그 밖에서는 애초에 판단 대상이 아니다(⑧ validate도 같은 게이트 안에 있다).
     *
     * ⚠️ validate는 여기에 더해 **상장 3종** 게이트도 갖고 있지만 이쪽은 걸지 않는다 —
     *    서버 가드를 시장까지 좁히면 비상장 stale 조합(UI로는 도달 불가·API 직접 호출로는 가능)의
     *    차단이 사라진다. 좁히는 방향은 그 자체로 위험이므로 필요한 축만 맞춘다.
     */
    const haltGateApplies = data.acquisitionMode === "estimated";
    if (haltGateApplies && data.tradingHaltAtTransfer && data.acquiredBeforeListing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradingHaltAtTransfer"],
        message: "양도일 거래정지·관리종목 주식은 §3항 주식이 아니어서(상증령 §52의2③ 제외) 취득 후 상장(§165⑤) 환산 대상이 아닙니다. 거래정지 또는 취득 후 상장 중 하나만 선택하세요.",
      });
    }

    /**
     * 거래정지 우회(영 §165③)는 **코스닥·코넥스 전용**이다.
     *
     * ⚠️ 위 주석이 「서버 가드를 시장까지 좁히면 비상장 stale 조합의 차단이 사라진다」며
     *    시장 축을 걸지 않았는데, 그것은 **비상장을 배제하는 방향**(좁히기)을 경계한 것이다.
     *    여기는 반대로 **코스피만 배제**한다 — 기존 차단을 하나도 풀지 않고 규칙을 더한다.
     *
     * ⑤·⑧·④가 모두 막지만 ⑫도 건다. 이 조합은 **세액이 갈리기** 때문이다
     * (실측 5억 양도: 취득가액 200,000,000 → 204,166,666 / 196,000,000).
     * 「UI 가 못 만들 뿐 API 직접 호출은 만들 수 있다」를 허용할 사안이 아니다.
     */
    if (
      haltGateApplies &&
      isTradingHaltMarketScopeViolation(data.marketType) &&
      (data.tradingHaltAtTransfer || data.tradingHaltAtAcquisition)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.tradingHaltAtTransfer ? "tradingHaltAtTransfer" : "tradingHaltAtAcquisition"],
        message: TRADING_HALT_MARKET_SCOPE_MESSAGE,
      });
    }

    // [C-1 M-4] 취득일 거래정지 + 취득 후 상장 — 취득 당시 비상장이면 취득일 거래정지 개념 불성립
    // (validate G-5 패턴과 동일 문구 — 기존 G-5는 validate만 차단·Zod 부재 = 기존 갭, 신규 필드만 완전 방어)
    if (haltGateApplies && data.tradingHaltAtAcquisition && data.acquiredBeforeListing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradingHaltAtAcquisition"],
        message: "취득 당시 비상장 주식은 취득일 거래정지 대상이 아닙니다. 취득일 거래정지 토글 또는 취득 후 상장 토글을 해제하세요.",
      });
    }

    /**
     * 상장 환산 1개월 종가평균 필수 — 시행령 §176의2②1호 (⑧ validate step2와 3중 패턴).
     *
     * 미입력이면 `calcListedValuation`의 0-가드에 걸려 **취득가액·개산공제가 둘 다 0**으로
     * 떨어진다. 종전에는 ⑧에만 게이트가 있어 API를 직접 호출하거나 ⑤ 입력 UI가 없는
     * 경로(주식 부담부증여 §159)가 그대로 통과했다.
     *
     * 면제 축: 분자(취득측)는 취득일 거래정지 또는 취득 후 상장(§165⑤) 시 법령상 무효라
     * 엔진이 쓰지 않고, 분모(양도측)는 양도일 거래정지 시 무효다.
     *
     * 🔄 **2026-09-10 정정 — 분모의 §165⑤ 면제를 없앴다.**
     * 종전 주석은 「§165⑤ 분기는 `resolveTransferStd`가 1주당 양도가로 fallback하는 설계된
     * 동작이라 여기서 막으면 정상 payload를 400으로 돌린다」였다. 그 **fallback 자체를**
     * 없앴으므로(계획서 Q-1 차단 정본) 근거가 소멸했다. 이제 ⑧과 ⑫가 같은 축을 요구한다.
     *
     * 좁히는 방향이라 실사용 파손을 먼저 실측했다 — 호출자는 마법사 단건·합산과
     * 부담부증여 단건·합산 넷뿐이고(그 외 외부 연동 없음), 단위 6,414건 중 픽스처 1건
     * (`route-split-mode.anchor.test.ts` LO-PRE-3)만 분모가 빠져 있었으며 E2E 주식 57건 +
     * 부담부증여 23건은 전건 통과했다. 계획서 §6-3.
     *
     * 분자(취득측)는 여전히 면제한다 — 취득일 거래정지·취득 후 상장 시 법령상 무효라 엔진이 쓰지 않는다.
     */
    if (
      data.acquisitionMode === "estimated" &&
      ["kospi", "kosdaq", "konex"].includes(data.marketType as string)
    ) {
      if (!data.tradingHaltAtTransfer && !(data.transferDatePriceAvg1Month ?? 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferDatePriceAvg1Month"],
          message: "상장 환산: 양도일 이전 1개월 종가 평균을 입력하세요 (시행령 §176의2②1호 환산비율 분모)",
        });
      }
      if (
        !data.acquiredBeforeListing &&
        !data.tradingHaltAtTransfer &&
        !data.tradingHaltAtAcquisition &&
        !(data.acquisitionDatePriceAvg1Month ?? 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionDatePriceAvg1Month"],
          message: "상장 환산: 취득일 이전 1개월 종가 평균을 입력하세요 (시행령 §176의2②1호 환산비율 분자)",
        });
      }
    }

    // R-1' 매매사례가액 — 시장 유형 게이트 (영§176의2③1호 단서)
    if (data.acquisitionMode === "sale_case") {
      const isListed = ["kospi", "kosdaq", "konex"].includes(data.marketType as string);
      if (isListed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionMode"],
          message: "매매사례가액 모드는 비상장·기타자산 전용입니다 (영§176의2③1호 단서 — 주권상장법인 주식등 제외)",
        });
      }
    }

    // [A-2] R-2 자본조정 — split 모드 결합 허용 (lot별 희석 전처리로 지원). split 차단 제거.

    // 기타자산 입력 시 관련 필드 최소 1개 필수
    if (data.marketType === "other_asset") {
      if (!data.isQualifyingBlockShareholder && !data.isHeavyRealEstateForRate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["marketType"],
          message: "기타자산은 §94①4 다목(과점주주) 또는 라목(부동산과다보유법인) 중 하나 이상 해당해야 합니다",
        });
      }
    }

    // §94①4 **다목** — 요건 4칸 전부 필수 (영 §158①②)
    //
    // 🔑 **미입력을 통과시키지 않는다.** 다목 토글 ON 은 사용자의 «적극적 선언»이므로 요건 수치를
    //    요구하는 것이 맞다. 조용히 기타자산(불리)으로도, 조용히 일반주식(유리)으로도 가면 안 된다
    //    ([[feedback_no_silent_apportion_fallback]]).
    //    형제 `nblRatioOfCorpAssets`(§104①9호)가 «미입력 = 미해당»인 것과 규약이 다른 이유는,
    //    그쪽은 적용이 **불리**(세율 +10%p)라 법 근거 없이 적용하지 않는 것이기 때문이다.
    if (data.isQualifyingBlockShareholder) {
      const required: Array<[keyof typeof data, string]> = [
        ["blockShareholderRealEstateRatio", "법인 자산총액 중 부동산등 비율 (법 §94①4 다목)"],
        ["blockShareholderOwnershipRatio", "과점주주 소유비율 (영 §158①)"],
        ["cumulativeTransferRatio", "소급 3년 누적 양도비율 (영 §158②)"],
        ["aggregationFirstTransferDate", "합산기간 최초 양도일 (영 §158②)"],
      ];
      for (const [key, label] of required) {
        const v = data[key];
        if (v === undefined || v === null || v === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key as string],
            message: `§94①4 다목(과점주주)을 선택하면 «${label}»을 입력해야 합니다`,
          });
        }
      }

      // 요건 판정 자체는 **엔진 leaf 단일 소스**에 위임한다 — 임계(양도일 종속 «초과/이상»)를
      // 여기서 다시 쓰면 판정이 두 벌이 된다([[feedback_shared_predicate_argument_parity]]).
      const transferDate = toOptionalDate(data.transferDate);
      const firstDate = toOptionalDate(data.aggregationFirstTransferDate);
      if (transferDate && firstDate) {
        const gate = judgeBlockShareholderGate({
          realEstateRatio: data.blockShareholderRealEstateRatio,
          ownershipRatio: data.blockShareholderOwnershipRatio,
          cumulativeTransferRatio: data.cumulativeTransferRatio,
          firstTransferDate: firstDate,
          transferDate,
        });
        // `other_asset` **직접 선택**은 게이트 실패 시 돌아갈 곳이 없다 — 시장·대주주 정보가
        // 애초에 입력되지 않기 때문이다(Step1 이 대주주 섹션을 숨긴다). ⇒ 라목도 꺼져 있으면 차단.
        if (
          !gate.passed &&
          data.marketType === "other_asset" &&
          !data.isHeavyRealEstateForRate
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["marketType"],
            message:
              `§94①4 다목 요건 미충족(${gate.failed
                .map((r) => BLOCK_SHAREHOLDER_REQUIREMENT_LABEL[r])
                .join(" · ")}) — ` +
              "시장 유형에서 상장·비상장을 선택해 §94①3호(주식)로 계산하세요.",
          });
        }
      }
    }

    // 양도가액 total 모드 필수성 (single 모드 한정 — split 모드는 위 게이트에서 차단)
    if (
      data.transferPriceMode === "actual" &&
      (data.transferActualInputMode ?? "total") === "total" &&
      (!data.transferTotalPrice || data.transferTotalPrice <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferTotalPrice"],
        message: "총액 직접 입력 시 양도가액 합계는 0보다 커야 합니다",
      });
    }

    // ── lots-only 모드 (취득 다건 입력 + 양도 단일) refine 3건 ──
    // 기존 isSplit 게이트와 독립 작용 (API 합성 후 body는 isSplit도 통과)
    const isLotsOnlyMode =
      (data.acquisitionActualInputMode ?? "per_share") === "lots";
    if (isLotsOnlyMode) {
      // Refine 1 — acquisitionLots ≥ 1 강제
      if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionLots"],
          message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
        });
      }
      // (Refine 2 폐기) total + lots 조합 차단 제거 — 2026-05-18 사용자 요청.
      // API 변환에서 perShareTransferPrice를 Math.round(transferTotalPrice / shareCount)로 역산.
      // UI 안내 카드(Step2)에서 잔돈 오차 가능 사전 고지.
      // (Refine 3 폐기 — A-1) specific 차단 제거 → 합성 매도 lot 1건에 대한 매수 lot별 매칭 지원.
      //   무결성(매칭 합 = 합성 매도 수량, 매수 lot별 ≤ 잔여)은 아래 isSplit 매칭 무결성 체크가 담당.
    }

    // 분할 매수·분할 양도 호환성 게이트 (Plan v2.2)
    const isSplit =
      (data.acquisitionLots && data.acquisitionLots.length > 0) ||
      (data.transferLots && data.transferLots.length > 0) ||
      data.costAllocationMethod !== undefined;
    if (isSplit) {
      // [A-2] 자본조정 존재 시 raw 수량 정합 검증 면제(희석은 엔진 전처리) — 아래 게이트에서 사용
      const hasCapitalAdjustments = !!(data.capitalAdjustments && data.capitalAdjustments.length > 0);
      // 양쪽 lot 배열 모두 ≥ 1
      if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionLots"],
          message: "분할 모드: 매수 lot을 1행 이상 입력하세요",
        });
      }
      if (!data.transferLots || data.transferLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferLots"],
          message: "분할 모드: 매도 lot을 1행 이상 입력하세요",
        });
      }
      if (!data.costAllocationMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costAllocationMethod"],
          message: "분할 모드: 산정방법(specific/fifo/moving_avg)을 선택하세요",
        });
      }
      // 분할 모드는 실가 모드만 (acquisitionMode === "actual")
      if (data.acquisitionMode !== "actual") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionMode"],
          message: "분할 모드에서는 취득가 산정방법으로 실가(actual)만 지원합니다",
        });
      }
      if (data.transferPriceMode === "exchange") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferPriceMode"],
          message: "분할 모드에서는 양도가액 모드로 교환을 지원하지 않습니다",
        });
      }
      // 분할 모드에서 total 직접 입력 차단 (UI disabled의 Zod 방어선)
      // 단, lots-only 모드(acquisitionActualInputMode === "lots")는 허용 — 2026-05-18 제약 해제.
      // lots-only는 API에서 합성 transferLot 1건만 생성 → 정확한 분할 양도 아님.
      // 취득가액 합계 직접 입력도 분할 모드에서는 성립하지 않는다 — lot별 단가가 정본이다.
      // (UI 는 분할 모드에서 이 라디오 자체를 마운트하지 않는다. 여기는 그 Zod 방어선이다.)
      if (data.acquisitionActualInputMode === "total") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionActualInputMode"],
          message: "분할 모드에서는 취득가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
        });
      }
      if (
        data.transferActualInputMode === "total" &&
        (data.acquisitionActualInputMode ?? "per_share") !== "lots"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferActualInputMode"],
          message: "분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
        });
      }
      // cause별 보조 일자 필수
      data.acquisitionLots?.forEach((lot, i) => {
        if (lot.acquisitionCause === "inheritance" && !lot.decedentAcquisitionDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acquisitionLots", i, "decedentAcquisitionDate"],
            message: "상속 lot은 피상속인 취득일을 입력하세요 (§104②1)",
          });
        }
        if (lot.acquisitionCause === "merger_split" && !lot.preMergerAcquisitionDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acquisitionLots", i, "preMergerAcquisitionDate"],
            message: "합병·분할 lot은 종전 주식 취득일을 입력하세요 (§104②3)",
          });
        }
      });
      // specific 매칭 무결성 — 매도 lot별 매칭 합 = 매도 수량
      if (data.costAllocationMethod === "specific" && data.specificMatchings && data.transferLots) {
        for (const trn of data.transferLots) {
          const sum = data.specificMatchings
            .filter((m) => m.transferLotId === trn.id)
            .reduce((s, m) => s + m.shareCount, 0);
          if (sum !== trn.shareCount) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["specificMatchings"],
              message: `매도 lot ${trn.id ?? "?"}의 매칭 합계(${sum})가 매도 수량(${trn.shareCount})과 다릅니다`,
            });
          }
        }
        // 매수 lot별 매칭 합 ≤ lot 수량
        // [A-2] 자본조정(무상증자) 시 lot 주식수가 희석 전(raw)이라 매칭(희석 후)과 단위 불일치 →
        //   엔진 matchSpecific의 lot 잔여 가드에 위임(초과 시 warning·skip). 정적 검증 면제.
        if (data.acquisitionLots && !hasCapitalAdjustments) {
          for (const acq of data.acquisitionLots) {
            const sum = data.specificMatchings
              .filter((m) => m.acquisitionLotId === acq.id)
              .reduce((s, m) => s + m.shareCount, 0);
            if (sum > acq.shareCount) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["specificMatchings"],
                message: `매수 lot ${acq.id ?? "?"}에 매칭된 합계(${sum})가 lot 수량(${acq.shareCount})을 초과합니다`,
              });
            }
          }
        }
      }
      // 매도 수량 합 ≤ 매수 수량 합
      // [A-2] 자본조정 시 매수 수량이 희석 전이라 무상증자로 매도>매수가 정당 → 엔진 allocateLots 가드에 위임.
      const totalTrn = data.transferLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      const totalAcq = data.acquisitionLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      if (totalTrn > totalAcq && !hasCapitalAdjustments) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferLots"],
          message: `총 매도 수량(${totalTrn})이 총 매수 수량(${totalAcq})을 초과합니다`,
        });
      }
      /**
       * 매도 시점별 누적 검사 — 총수량만 보면 **매도일보다 나중에 취득한 lot**이
       * 소진돼 보유일수가 음수가 되고 `isShortTerm`으로 세율까지 갈린다.
       * ⑧ validate(`pushLotTimelineErrors`)와 같은 규칙이며, 누적 수량 쪽만
       * 자본조정(희석 전 단위) 면제를 위 총수량 검사와 같은 기준으로 공유한다.
       */
      if (data.acquisitionLots && data.transferLots) {
        // JSON 경유 후 string으로 도달할 수 있다 — 직접 비교하면 조용히 false가 된다.
        const asTime = (v: unknown): number => toOptionalDate(v)?.getTime() ?? NaN;
        const buys = data.acquisitionLots
          .map((l) => ({ time: asTime(l.acquisitionDate), shares: l.shareCount }))
          .filter((b) => Number.isFinite(b.time));
        const sales = [...data.transferLots]
          .map((l, i) => ({ index: i, time: asTime(l.transferDate), shares: l.shareCount }))
          .filter((s) => Number.isFinite(s.time))
          .sort((a, b) => a.time - b.time);
        let cumulativeSold = 0;
        for (const sale of sales) {
          const availableShares = buys
            .filter((b) => b.time <= sale.time)
            .reduce((s, b) => s + b.shares, 0);
          cumulativeSold += sale.shares;
          if (availableShares === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["transferLots", sale.index, "transferDate"],
              message: "이 양도일 이전에 취득한 매수 lot이 없습니다",
            });
          } else if (!hasCapitalAdjustments && cumulativeSold > availableShares) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["transferLots", sale.index, "shareCount"],
              message: `이 양도일까지 누적 매도(${cumulativeSold})가 그 시점 보유 수량(${availableShares})을 초과합니다`,
            });
          }
        }
      }
    }
  });
}
