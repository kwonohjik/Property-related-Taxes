/**
 * pre1990 토지등급 환산(「소득세법 시행령」 §164④) **모드 전환 게이트** — 단일 술어.
 *
 * ## 왜 단일 술어인가 (2026-09-02 · 코드리뷰 A09)
 *
 * 종전에는 같은 조건식이 **4곳에 복제**돼 있었다:
 *   ④ `transfer-tax-api.ts` · ⑧ `transfer-tax-validate-asset.ts` ·
 *   ⑧ `transfer-tax-validate-sec164.ts` · 다건 `multi-transfer-tax-api.ts`
 *
 * 그리고 **④에만 기간 요건이 빠져** 있었다(다건은 post-1985 증여 가드조차 없었다).
 * 같은 축의 다른 판정자는 전부 기간 게이트를 갖고 있다 —
 * `sec164LandStatus`(`sec164-required-fields.ts:169`) · 엔진(`inheritance-acquisition-helpers.ts:194`) ·
 * `isCommercialPre1990Acquisition`(`transfer-pre1990-commercial-bridge.ts:37`) ·
 * `PostDeemedInputs.tsx` · `CompanionAcqPurchaseBlock.tsx`.
 *
 * 게이트가 잘못 서면 `acquisitionPrice`·`expenses`가 **0으로 송신**되고
 * (`transfer-tax-api.ts` override 6곳) 엔진 STEP 0.4(`transfer-tax.ts:85-98`)가
 * 환산 모드를 무조건 강제한다 ⇒ 실측 61,409,855 ~ 178,196,271원 과대(등급 입력 종속).
 *
 * ⇒ 복제가 원인이므로 술어를 여기 하나로 모은다. 신규 판정 지점은 반드시 이 함수를 경유할 것.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  LAND_PRICE_NOTICE_START,
  commercialAcquisitionDate,
} from "./transfer-pre1990-commercial-bridge";

/**
 * §164④ 게이트가 보는 취득일 — **상속은 상속개시일**이 취득일이다.
 *
 * ⚠️ raw `acquisitionDate`만 보면 `inheritanceStartDate`가 1990.8.30. 이전인 상속 토지를
 *    **과차단**한다. 저장소의 다른 판정자와 같은 규약을 쓴다 —
 *    `deriveSec163_9BaseDate`(`transfer-163-9-base-date.ts:44-48`) ·
 *    `commercialAcquisitionDate`(§164⑥) · 엔진 `inheritance-acquisition-helpers.ts:193-196`.
 *
 * 이름이 `commercial*`인 헬퍼를 재사용하는 이유: 그 함수의 규약은 상가 전용이 아니라
 * **취득원인 공통**(상속=상속개시일 / 그 외=취득일)이고, §164④·§164⑥이 같은 규약을 쓴다.
 */
export function pre1990LandGateAcquisitionDate(asset: AssetForm): string {
  return commercialAcquisitionDate(asset);
}

/**
 * pre1990 토지등급 환산 게이트 — ④ payload 생성 + 환산 모드 override를 함께 제어한다.
 *
 * 요건:
 * 1. `pre1990Enabled` 래치 (환산 클릭 시 set — `CompanionAcqPurchaseBlock:92`)
 * 2. `assetKind === "land"`
 * 3. **취득일 < 1990-08-30** — §164④ 본문 첫 구절(「1990년 8월 30일 개별공시지가가 고시되기
 *    전에 취득한 토지의 취득당시의 기준시가는 …」)이 명시한 기간 요건
 * 4. post-1985 증여 배제 — §163⑨ 신고가액이 취득당시 실지거래가액으로 확인 가능하므로
 *    토지등급 환산 대상이 아니다(PR#731)
 *
 * ⚠️ **§163⑨1호의 ②(가목) 산출용 게이트와 혼동하지 말 것.** 그쪽(`hasPre1990ForSec164`)은
 *    override를 켜지 않으므로 `pre1990Enabled` 래치를 조건에 넣지 않는다.
 */
export function hasPre1990LandEstimation(asset: AssetForm): boolean {
  if (!(asset.pre1990Enabled ?? false)) return false;
  if (asset.assetKind !== "land") return false;

  const baseDate = pre1990LandGateAcquisitionDate(asset);
  if (!baseDate || baseDate >= LAND_PRICE_NOTICE_START) return false;

  // post-1985 증여는 신고가액이 확인 가능 → 토지등급 환산 배제
  if (asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01") {
    return false;
  }

  return true;
}
