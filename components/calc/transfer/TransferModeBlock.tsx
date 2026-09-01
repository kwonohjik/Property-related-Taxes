"use client";

/**
 * 양도 형태·원인 카드 — 3지선다 통합 (2026-07-02)
 *
 * 일반 양도 / 부담부증여(소령 §159) / 공익수용·협의매수 를 단일 라디오로 통합.
 *  - 부담부증여는 "취득"이 아닌 "양도" 사건(소령 §159 — 채무 인수분을 유상 양도로 의제).
 *  - 공익수용·협의매수는 양도"원인" — 선택 시 §77 감면·#1 NBL 사업용 의제·#3 환산 min[] 특례 구동.
 *    §77(조특법)은 "토지등"(공익사업법 §2 = 토지·건물·물건·권리) 대상이므로 전 자산에 노출한다
 *    (asset-kind-gate standalone = 주택 게이트 없음). NBL 의제·환산 min[]는 토지 전용(내부 게이트).
 *  세 선택지는 실제로 상호배타(부담부증여이면서 수용일 수 없음)이므로 단일 라디오가 자연스럽다.
 *
 * 3지선다 → 엔진 2필드 매핑 (transferType·transferCause 불변, 순수 UI 통합):
 *  - regular              → transferType:"regular",      transferCause:"general"
 *  - burdened_gift        → transferType:"burdened_gift", transferCause:"general"
 *  - public_expropriation → transferType:"regular",      transferCause:"public_expropriation"
 *
 * 가시성 원칙:
 *  - 외곽 카드 tone="fuchsia" (OFF 상태도 fuchsia 배경 유지)
 *  - useEffect → store 미러링 금지 (onChange 직결)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ASSET_KIND_LABELS } from "./asset-labels";
import { BurdenedGiftBlock } from "./BurdenedGiftBlock";
import { ExpropriationBlock } from "./ExpropriationBlock";
import { AuctionBlock } from "./AuctionBlock";
import { getStandaloneDefault } from "./UnifiedReductionPanel-defaults";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** form-global 양도일 (YYYY-MM-DD) — 공익수용 #3 환산 min[] 게이트 */
  transferDate: string;
}

// 설명은 상단 안내 문단이 이미 3지선다 전체를 서술하므로 옵션별 description을 두지 않는다
// (중복 서술 제거 + inline 레이아웃으로 3항목 1행 배치, 2026-07-16).
const TRANSFER_TYPE_OPTIONS: {
  value: string;
  label: string;
  testId?: string;
}[] = [
  { value: "regular", label: "일반 양도" },
  { value: "burdened_gift", label: "부담부증여 (소령 §159)" },
  { value: "public_expropriation", label: "공익수용·협의매수", testId: "expr-cause-radio" },
];

// F-3 (2026-05-12): commercial_building 확장 — 부담부증여 지원 자산 종류
const SUPPORTED_ASSET_KINDS: AssetForm["assetKind"][] = [
  "housing",
  "land",
  "building",
  "general_building",
  "commercial_building",
];

/**
 * 미지원 안내문의 자산 열거는 **위 배열에서 파생**한다 — 손으로 쓰지 않는다.
 *
 * 종전에는 「주택·토지·건물·일반건물」이라고 하드코딩돼 있었다. F-3에서 상업용건물이
 * 지원에 편입됐는데 문구만 남아, 같은 문장 안에서 지원 목록엔 빠져 있으면서
 * "후속 예정"으로도 적힌 자기모순 상태였다. 다음 편입 때 또 어긋나지 않도록 파생시킨다.
 * 라벨은 자산 카드 헤더와 같은 출처(`ASSET_KIND_LABELS`)를 써서 사용자가 대조할 수 있게 한다.
 */
const SUPPORTED_LABELS = SUPPORTED_ASSET_KINDS.map((k) => ASSET_KIND_LABELS[k]).join(", ");
const UNSUPPORTED_LABELS = (Object.keys(ASSET_KIND_LABELS) as AssetForm["assetKind"][])
  .filter((k) => !SUPPORTED_ASSET_KINDS.includes(k))
  .map((k) => ASSET_KIND_LABELS[k])
  .join(", ");

export function TransferModeBlock({ asset, onChange, transferDate }: Props) {
  // transferCause=공익수용이면 그것을 우선 표시, 아니면 transferType(일반/부담부증여)
  const currentMode =
    asset.transferCause === "public_expropriation"
      ? "public_expropriation"
      : asset.transferType || "regular";
  const isBurdenedGift = currentMode === "burdened_gift";
  const isExpropriation = currentMode === "public_expropriation";
  const isSupported = SUPPORTED_ASSET_KINDS.includes(asset.assetKind);

  function selectMode(v: string) {
    if (v === "public_expropriation") {
      const has = asset.reductions?.some((r) => r.type === "public_expropriation");
      onChange({
        transferType: "regular",
        transferCause: "public_expropriation",
        // §164⑨ N3 배타 — 수용(1호) 전환 시 공매·경락(2호) 정리
        isAuctionTransfer: false,
        /**
         * #1 NBL 프리필 — 토지만 (NBL = 비사업용 '토지'; 자동 판정 활성 + 수용 의제, Step4서 override 가능)
         *
         * 🔴 `isNonBusinessLand`도 **함께** 켠다 (A2-01·U3-01·V10-e, 2026-09-02 코드리뷰).
         *    NBL 입력 섹션의 렌더 게이트(`AssetSectionExtras`)는 `isNonBusinessLand && nblUseDetailedJudgment`
         *    **둘 다**를 요구하는데 프리필은 뒤쪽만 켰다. 반면 ④ raw 빌더와 ⑧ validate는
         *    `nblUseDetailedJudgment` 하나만 보고 지목·용도지역을 요구한다 —
         *    그래서 「지목을 선택하세요」로 계산이 막히는데 **입력 칸이 화면에 없는** 상태가 됐다.
         *    자산1은 Step4 토글로 탈출할 수 있으나 컴패니언에는 그 토글이 없어 자산을 지우는 것 외에
         *    복구 수단이 없었다. 세 게이트가 같은 조건을 보게 맞춘다(3중 패턴).
         */
        ...(asset.assetKind === "land"
          ? {
              isNonBusinessLand: true,
              nblUseDetailedJudgment: true,
              nblExemptPublicExpropriation: true,
            }
          : {}),
        // #2 §77 프리필 — 전 자산(토지등). 기본 shape 재사용(dual-truth 회피), 없을 때만 추가
        ...(has
          ? {}
          : { reductions: [...(asset.reductions ?? []), getStandaloneDefault("public_expropriation")] }),
      });
    } else if (v === "burdened_gift") {
      onChange({
        transferType: "burdened_gift",
        transferCause: "general",
        // 공익수용 → 부담부증여 전환 시 수용 프리필 정리 (프리필로 켠 3개를 대칭으로 되돌린다 —
        // 남겨 두면 ⑧이 계속 지목을 요구하는데 사용자는 왜 막히는지 알 수 없다)
        ...(asset.assetKind === "land"
          ? { isNonBusinessLand: false, nblUseDetailedJudgment: false }
          : {}),
        nblExemptPublicExpropriation: false,
        reductions: (asset.reductions ?? []).filter((r) => r.type !== "public_expropriation"),
        // 일반 양도 → 부담부증여 변경 시 bgValuationMode 기본 설정 (bg* 필드는 보존)
        ...(asset.bgValuationMode ? {} : { bgValuationMode: "sangjeungbeop_standard" as const }),
      });
    } else {
      // regular — 공익수용/부담부증여 프리필 정리 (bg* 필드는 보존해 재토글 시 복원)
      onChange({
        transferType: "regular",
        transferCause: "general",
        // 수용 프리필로 켠 NBL 3개를 대칭으로 되돌린다 (위 부담부증여 분기와 동일 규칙)
        ...(asset.assetKind === "land"
          ? { isNonBusinessLand: false, nblUseDetailedJudgment: false }
          : {}),
        nblExemptPublicExpropriation: false,
        reductions: (asset.reductions ?? []).filter((r) => r.type !== "public_expropriation"),
      });
    }
  }

  return (
    <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/70 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-micro font-bold text-fuchsia-800 select-none">
          💎
        </span>
        <p className="text-sm font-semibold text-fuchsia-900">양도 정보</p>
      </div>

      <p className="text-xs text-fuchsia-700">
        양도 형태·원인을 선택하세요. 부담부증여 시 양도가액은 인수 채무액으로 자동 산정되고(소령 §159),
        공익수용·협의매수 시 §77 감면·비사업용 토지 사업용 의제가 함께 적용됩니다.
      </p>

      <RadioCardGroup
        name={`transferType-${asset.assetId ?? "primary"}`}
        layout="inline"
        value={currentMode}
        onChange={selectMode}
        options={TRANSFER_TYPE_OPTIONS}
      />

      {/* 부담부증여 미지원 propertyType 안내 */}
      {isBurdenedGift && !isSupported && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          <p className="font-semibold">부담부증여 미지원 자산 종류</p>
          <p className="mt-1">
            현재 부담부증여는 <b>{SUPPORTED_LABELS}</b>에서만 지원됩니다.
            (현재 선택: {ASSET_KIND_LABELS[asset.assetKind]}) — {UNSUPPORTED_LABELS}는 후속 지원 예정입니다.
          </p>
        </div>
      )}

      {/* 부담부증여 펼침 — BurdenedGiftBlock 재사용 */}
      {isBurdenedGift && isSupported && (
        <BurdenedGiftBlock asset={asset} onChange={onChange} transferDate={transferDate} />
      )}

      {/* 공익수용·협의매수 상세 펼침 */}
      {isExpropriation && (
        <ExpropriationBlock asset={asset} onChange={onChange} transferDate={transferDate} />
      )}

      {/* §164⑨2호 공매·경락 (P4) — 수용(1호)과 배타(N3)라 수용 미선택 시에만 노출 */}
      {!isExpropriation && (
        <AuctionBlock asset={asset} onChange={onChange} transferDate={transferDate} />
      )}
    </div>
  );
}
