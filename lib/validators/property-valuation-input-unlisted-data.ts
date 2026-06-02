/**
 * 비상장주식 평가 데이터 Zod 스키마
 *
 * property-valuation-input.ts에서 800줄 정책에 따라 분리 (2026-06-02).
 * 원 파일이 import 재바인딩 + re-export하므로 외부 import 경로 무변경.
 */
import { z } from "zod";

export const unlistedStockDataSchema = z.object({
  totalShares: z.number().int().positive({ message: "총 발행주식 수는 1 이상이어야 합니다." }),
  ownedShares: z.number().int().positive({ message: "보유 주식 수는 1 이상이어야 합니다." }),
  /**
   * @deprecated 직접 입력 폐지 — netIncomeY1~Y3 가중평균으로 대체.
   * legacy 저장 데이터 하위호환을 위해 optional로 완화.
   * 신규 입력 경로(3년치)에서는 미전송 가능 → default(0).
   */
  weightedNetIncome: z.number().optional().default(0),
  /**
   * 평가기준일 직전 1사업연도 순손익액 (회사 전체, 가중치 ×3) — 상증령 §56①.
   * 결손 연도는 음수 허용. 미입력(undefined) 시 0으로 처리.
   */
  netIncomeY1: z.number().optional(),
  /** 직전 2사업연도 순손익액 (가중치 ×2) — 상증령 §56① */
  netIncomeY2: z.number().optional(),
  /** 직전 3사업연도 순손익액 (가중치 ×1) — 상증령 §56① */
  netIncomeY3: z.number().optional(),
  /**
   * 순자산가치 (회사 전체) — 음수 허용.
   * 0 이하인 경우 엔진(`calcPerShareNetAssetValue`)에서 `Math.max(0, …)`로 0 처리 (상증령 §55① 후단).
   * → UI에서 음수를 그대로 입력받고 계산 단계에서만 0 귀결하므로 nonnegative 제약 해제.
   */
  netAssetValue: z.number(),
  capitalizationRate: z.number().min(0.01).max(1).default(0.10),
  /**
   * 부동산과다보유법인 여부 (상증령 §54① 본문 괄호 — 가중치 2:3).
   * ⚠️ plain z.object는 미정의 키를 침묵 제거하므로, 엔진 도달 위해 스키마에 반드시 선언.
   */
  isRealEstateHeavy: z.boolean().optional(),
  /**
   * §54④ 순자산가치만 적용 사유 (선택) — 1·2·6호 무조건 / 3·5호 단서.
   * ⚠️ 누락 시 z.object 침묵 strip → 엔진이 본칙(80% 최소값) 적용 → 1주당 순자산가치
   *    대신 80% 적용되어 평가액 과소산정(예: 500m→400m). 14지점 ⑫ 정합.
   */
  assetValueOnlyReason: z
    .enum(["liquidation", "lt3y", "real_estate_80", "stock_80", "remaining_3y"])
    .optional(),
}).superRefine((data, ctx) => {
  // 3년치 또는 legacy weightedNetIncome 중 하나 이상 입력 여부 검증
  // (적자법인은 모두 0일 수 있으므로 "값이 있는지" 체크 — 과도 차단 금지)
  // legacy 경로: weightedNetIncome > 0 이면 OK
  // 신규 경로: netIncomeY1~Y3 중 하나라도 null이 아니면 OK
  // 모두 미입력·0·undefined이면 경고 수준 (순손익 0 = 적자법인으로 허용)
  // ※ 완전 미입력(undefined만) 시 의도 확인이 필요하지만, 적자법인 경로로 허용
  const has3y =
    data.netIncomeY1 != null ||
    data.netIncomeY2 != null ||
    data.netIncomeY3 != null;
  const hasLegacy = (data.weightedNetIncome ?? 0) > 0;
  if (!has3y && !hasLegacy) {
    // 순손익 0 처리 = 적자법인 경로 → 허용 (차단 금지). 단, 입력 의도 확인 경고 생성 안 함.
    // 추후 UI에서 명시적 "적자법인" 체크박스로 의도 확인 예정 (PR-2).
    void ctx; // superRefine 내 ctx 미사용 경고 억제
  }
});
