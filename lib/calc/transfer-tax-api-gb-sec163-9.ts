/**
 * ④ 일반건물 — §163⑨ 상속·증여 파트 취득가액 (`transfer-tax-api-gb.ts`에서 800줄 정책으로 분리 · 2026-10-22 PR-4).
 *
 * 파트 슬롯(`landAcquisitionPrice`·`buildingAcquisitionPrice`)에 실을 값과 상속 echo·C1 평가액 필드, 의제취득일(1985.1.1.) 전
 * 파트의 ①② 필드를 만든다. 로직은 종전 본문 그대로다 — 주석의 「위·아래」는 원래 함수 안의 위치를 가리킨다.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { partAcquisitionDates } from "./transfer-tax-split-acq-mode";
import { LAND_PRICE_NOTICE_START } from "./transfer-pre1990-commercial-bridge";
import { isBeforeBuildingStdPriceNotice } from "./commercial-164-6-proviso";
import { effectiveGbLandPriceAtAcq } from "./transfer-pre1990-gb-bridge";
import { gbPreDeemedClauseAFields } from "./gb-pre-deemed";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function gbSec1639Acquisition(asset: AssetForm, transferDate: string | undefined, isBurdenedGiftGb: boolean) {
  /**
   * §163⑨ 상속 취득가액 직접 산정 게이트.
   *
   * 🔴 **1985-01-01 하한을 제거했다** (2026-08-07). 종전 근거는 「pre-1985 상속·증여는
   *    §176조의2④ 의제취득 영역이므로 게이트를 끄고 **기존 환산 fallback**에 맡긴다」였다.
   *    원문 확인 결과 두 군데가 틀렸다:
   *
   *    ① **§163⑨에는 「의제취득일」 조건이 없다.** 조건은 「상속 또는 증여받은 자산」과
   *       단서의 「기준시가 고시 전」뿐이다(MST 286211 본문 직독).
   *    ② **§176조의2④는 나목 계열**이라 가목이 확인되면 도달하지 않는다 — 법 §97①1호 단서
   *       「가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목」. §163⑨은 평가액을
   *       「실지거래가액으로 **본다**」고 하므로 가목이 확인된다. 법 §97②1호 나목의 생산자
   *       물가상승률 가산도 「**환산취득가액에 의하여** … 계산하는 경우」가 조건이다.
   *
   *    게다가 그 「환산 fallback」은 **더 이상 존재하지 않는다** — O-3(2026-08-06)이 상속·증여
   *    파트의 환산을 1985 하한 없이 차단했다(V2). 결과는 가목도 나목도 아닌 **취득가액 0**
   *    이었다(실측 1980년 상속 세액 443,235,000 · validate 통과).
   *
   *    단건 경로는 이미 가목 우선이다(`calcPreDeemed` — #1080). GB만 예외였다.
   *
   * ⚠️ **취득시기 의제(1985.1.1)는 이 축과 무관하다** — 보유기간·세율·장특공제이고,
   *    여기서 정하는 것은 취득**가액**이다.
   */
  const acquisitionByInheritance = asset.acquisitionCause === "inheritance";
  const buildingAcquisitionByInheritance = asset.gbBuildingAcquisitionCause === "inheritance";
  /**
   * §163⑨ 단서 각 호 — **미공시 시기 상속은 §164 가액과 겨룬다** (Phase 3).
   *
   * 본문은 상증법 §60~66 평가액을 취득당시 실지거래가액으로 보지만, 단서가 두 경우를 뺀다:
   *
   *   **1호** 「1990년 8월 30일 개별공시지가가 고시되기 **전에**」 상속·증여받은 **토지**
   *          → 평가액과 **제164조제4항**의 가액 중 **많은 금액**
   *   **2호** 상증법 §61①2호~4호 「건물의 기준시가가 고시되기 **전에**」 상속·증여받은 **건물**
   *          → 평가액과 **제164조제5항 내지 제7항**의 가액 중 **많은 금액**
   *
   * 일반건물의 건물분은 법 §99①1호 **나목**이므로 §164**⑤**가 정본이다
   * (⑥=오피스텔·상업용건물·공동주택, ⑦=주택). §164⑤의 가액은 곧 「취득당시의 기준시가」이고,
   * 취득연도 ≤2000이면 「건물 기준시가 계산」 모달이 **2001 지수표 × 산정기준율**로 그 값을
   * 산출한다(`building-standard-price.ts:198·214`) — 그래서 별도 축이 필요 없다.
   *
   * ⚠️ **경계가 파트마다 다르다** — 토지는 1990-08-30(일자), 건물은 취득연도 2000/2001.
   *    1995년 상속이면 **건물만** 게이트 안이다. 하나로 묶으면 그 조합에서 틀린다.
   * ⚠️ 동점은 **평가액(①)** 이다 — 금액은 같고 근거만 갈린다(`calcPostDeemed`와 같은 규약).
   * ⚠️ 게이트 밖에서는 **비교하지 않는다** — 단서는 두 경우에 한정되고, 그 밖에서 max를
   *    적용하면 본문이 정한 「평가액을 실지거래가액으로 본다」를 넘어선다.
   */
  /**
   * 🔑 **증여도 같은 단서를 받는다.** §163⑨ 본문은 「**상속 또는 증여**받은 자산」이 대상이고,
   *    단서 1호·2호도 「상속 또는 **증여**받은 토지/건물」이라고 쓴다.
   *
   *    다만 ①의 소스가 다르다 — 상속은 전용 필드가 있지만 증여 신고가액은 **분리 ON이면
   *    파트 칸**, 분리 OFF면 자산 단위 칸이다. 조문이 요구하는 「자산별」 비교가 성립하려면
   *    파트별 신고가액이 있어야 하므로, **분리 OFF + 게이트 안은 ⑧이 안내로 차단**한다.
   *
   * ⚠️ `isLandGift`/`isBuildingGift`는 ⑧과 **같은 정의**다.
   */
  // 1985 하한 제거 — 위 상속 게이트와 같은 근거다(§163⑨은 상속·증여를 같은 문장에서 다룬다).
  const isLandGift = asset.acquisitionCause === "gift";
  const isBuildingGift = asset.gbBuildingAcquisitionCause === "gift";

  const landInheritanceDate = partAcquisitionDates(asset).land;
  /** 토지 파트가 §163⑨ 단서 **1호** 구간인가 — 상속·증여 공통. */
  const landSec164Applies =
    (acquisitionByInheritance || isLandGift) &&
    !!landInheritanceDate &&
    landInheritanceDate < LAND_PRICE_NOTICE_START;
  /** 건물 파트가 §163⑨ 단서 **2호** 구간인가. */
  const buildingSec164Applies =
    (buildingAcquisitionByInheritance || isBuildingGift) &&
    isBeforeBuildingStdPriceNotice(asset.acquisitionDate);
  /** ② §164④ 가액 — 취득시 토지 기준시가 **총액**(㎡당 × 면적). */
  const sec164LandTotal = multiplyByArea(effectiveGbLandPriceAtAcq(asset, transferDate ?? ""), (parseDecimal(asset.gbLandArea) || 0));
  /** ② §164⑤ 가액 — 취득시 건물 기준시가. */
  const sec164BuildingValue = parseAmount(asset.gbAcqBuildingValue);

  const reportedLandValue = parseAmount(asset.publishedValueAtInheritance);
  const reportedBuildingValue = parseAmount(asset.gbBuildingInheritedValue);
  const inheritedLandValue =
    (landSec164Applies ? Math.max(reportedLandValue, sec164LandTotal) : reportedLandValue) ||
    undefined;
  const inheritedBuildingValue =
    (buildingSec164Applies
      ? Math.max(reportedBuildingValue, sec164BuildingValue)
      : reportedBuildingValue) || undefined;
  /**
   * 상속 필드 — **양 경로 모두**에 싣는다.
   *
   * 🔴 종전 주석은 「환산 모드=C2는 validate 차단이나 **대칭 전달**」이라고 적었으나
   *    **구현이 따라가지 않았다** — 이 객체는 실가 return에만 spread돼 있었고, C2 payload
   *    실측에서 `inheritedBuildingValue`·`buildingAcquisitionByInheritance`가 둘 다
   *    부재했다(2026-08-07). V1이 C2를 막고 있어 무해했을 뿐이다.
   *    결과 카드의 파트별 상속 라벨은 이 echo가 **유일한 소스**다.
   */
  const gbInheritanceEcho = {
    ...(acquisitionByInheritance ? { acquisitionByInheritance } : {}),
    ...(buildingAcquisitionByInheritance ? { buildingAcquisitionByInheritance } : {}),
  };
  /** 실가 경로의 C1 전용 분기(둘 다 상속)가 소비하는 평가액 — Phase 1. */
  const gbInheritanceFields = {
    ...gbInheritanceEcho,
    ...(acquisitionByInheritance ? { inheritedLandValue } : {}),
    ...(buildingAcquisitionByInheritance ? { inheritedBuildingValue } : {}),
  };

  /**
   * §163⑨ 상속 파트의 평가액을 **파트별 실지거래가액 슬롯**에 싣는다 (Phase 2 — C2·C2′·C3).
   *
   * 같은 항이 상속개시일 평가액을 「취득당시의 실지거래가액으로 **본다**」고 하므로, 엔진에서도
   * 파트별 실지거래가액 슬롯에 그대로 싣는 것이 법문과 1:1이다. 그러면 이미 완성된 파트 축
   * 배선이 부분 상속 세 케이스를 전부 처리한다 — **새 엔진 분기가 필요 없다**:
   *   · 환산 경로 `applyPartAcqModes` — 비-환산 파트만 파트 가격으로 교체하고 개산공제도 파트별 0
   *   · 실가 경로 `hasBothPartPrices` — 두 파트 가격이 다 차므로 안분 없이 직접 배정
   *
   * 종전에는 상속 파트에 파트 가격이 없어 두 AND 게이트가 모두 false로 떨어졌다 —
   * 환산 경로는 **throw**, 실가 경로는 **취득가액 0**이었다(Pre-Do 실측).
   *
   * ⚠️ **평가액이 정본이라 파트 칸 입력을 덮어쓴다.** 두 칸이 같은 슬롯을 다투지 않도록
   *    상속 파트에서는 파트 취득가액 칸을 화면에서 숨긴다(`GeneralBuildingAcquisitionCards`).
   * ⚠️ C1(둘 다 상속)은 실가 경로의 **전용 분기가 먼저** 잡으므로 값이 변하지 않는다(회귀 0).
   * ⚠️ 분리 OFF + 부분 상속은 두 AND 게이트가 모두 false로 떨어져 **평가액이 소실**되므로
   *    validate가 차단한다(V-5 — 종전 「이중계상」 서술은 2026-08-08 실측으로 정정했다).
   */
  /**
   * 증여 파트의 §163⑨ 단서 max — ①은 **파트 칸의 증여 신고가액**이다.
   *
   * 상속처럼 전용 필드가 없으므로 파트 슬롯 자체가 ①이고, 여기서 ②와 겨룬다.
   * 게이트 밖이면 그대로 통과한다(비교 없음).
   */
  const giftMax = (reported: number, applies: boolean, sec164: number) =>
    (applies ? Math.max(reported, sec164) : reported) || undefined;

  // 의제취득일(1985.1.1.) 전 상속·증여 파트 — ①②를 **따로** 싣는다(PR-4 · `gb-pre-deemed.ts`). 파트 슬롯은 종전처럼 max(①,②).
  const preDeemedFields = gbPreDeemedClauseAFields(
    asset,
    isBurdenedGiftGb,
    { reported: acquisitionByInheritance ? reportedLandValue : parseAmount(asset.landAcquisitionPrice), sec164: sec164LandTotal },
    {
      reported: buildingAcquisitionByInheritance ? reportedBuildingValue : parseAmount(asset.buildingAcquisitionPrice),
      sec164: sec164BuildingValue,
    },
  );
  /** ③ 토지 분자 = ②와 같은 값(1990 전 등급 환산 포함) — 직접 입력 칸만 읽으면 등급만 넣은 자산에서 0이 된다. */
  /** ③ 토지 분자 = ②와 같은 값(1990 전 등급 환산 포함) — 직접 입력 칸만 읽으면 등급만 넣은 자산에서 0이 된다. */
  const acqLandPerSqm = preDeemedFields.landPreDeemedClauseA
    ? effectiveGbLandPriceAtAcq(asset, transferDate ?? "")
    : parseAmount(asset.gbAcqLandPricePerSqm);

  const landPartPrice = acquisitionByInheritance
    ? inheritedLandValue
    : giftMax(
        parseAmount(asset.landAcquisitionPrice),
        isLandGift && landSec164Applies,
        sec164LandTotal,
      );
  const buildingPartPrice = buildingAcquisitionByInheritance
    ? inheritedBuildingValue
    : giftMax(
        parseAmount(asset.buildingAcquisitionPrice),
        isBuildingGift && buildingSec164Applies,
        sec164BuildingValue,
      );

  return { gbInheritanceEcho, gbInheritanceFields, landPartPrice, buildingPartPrice, preDeemedFields, acqLandPerSqm };
}
