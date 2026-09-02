import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  isAuctionEligibleAssetKind,
  EXPR_VALUATION_MIN_TRANSFER_DATE,
} from "@/lib/tax-engine/expropriation-scope";

/**
 * §164⑨ 2호 공매·경락 특례 입력 (계획 P4).
 *
 * 「국세징수법」 공매·「민사집행법」 강제경매·저당권실행 경매로 양도(낙찰)된 자산을 **환산취득가**로
 * 계산할 때, 양도당시 기준시가를 min(기준시가 총액, 공매·경락가액)으로 낮춘다(총액 2후보).
 *
 * ⚠️ 1호(공익수용, `transferCause`)와 **배타(N3)** — 수용 선택 시 이 블록은 부모(`TransferModeBlock`)에서
 *    미노출된다. 노출 조건: land·building(계획 C-09/C-10) + 환산 + 양도 ≥ 2009.02.04.
 *    주택·상가·일반건물·다필지는 후속(scope `AUCTION_TRACK_ASSET_KINDS`).
 */
export function AuctionBlock({
  asset,
  onChange,
  transferDate,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
  /** form-global 양도일 (YYYY-MM-DD) — 시점 게이트 */
  transferDate: string;
}) {
  /**
   * A08(2026-09-02): **엔진 도달 가능성에 층을 맞춘다.**
   *
   * §164⑨2호는 `resolveConversionDenominatorAtTransfer`를 통해서만 발동하고 그 유일한
   * 호출부가 단건 `calcTransferGain` 안이다. 다필지는 조기반환으로 STEP 2를 통째로 건너뛰고
   * (게다가 ④가 `parcelMode`면 `useEstimatedAcquisition: false`를 강제 송신해 엔진 게이트가
   * 애초에 닫힌다), 토지·건물 분리취득은 `calcSplitGain` 조기반환으로 별도 경로를 탄다.
   *
   * 종전에는 그 두 경우에도 토글이 뜨고 ⑧이 공매·경락가액을 **필수로 요구한 뒤 무시**했다
   * (실측: 값이 ④⑫⑭를 정상 통과해 엔진 input까지 도달한 뒤 소비만 안 됨 — 세액 차 0원.
   * 단건 동일조건에서 무시되는 특례 가치는 95,463,428원).
   *
   * **1호(공익수용)는 같은 층위에서 이미 막혀 있다**(`ExpropriationBlock.tsx:51`·`:70` ·
   * `transfer-tax-validate-expropriation.ts:55`·`:126`·`:160`). 2호에만 가드가 없었다.
   *
   * ⚠️ 술어를 1호에서 복사하면 안 된다 — 1호의 `isSplitLandExprEligibleAssetKind`는
   *    `["building"]`뿐인데 `calcSplitGain`은 `housing`도 태우므로 **주택 split이 남는다**.
   *    정본 술어는 `hasSeperateLandAcquisitionDate` 단독이다.
   */
  const unsupportedPath = asset.parcelMode || asset.hasSeperateLandAcquisitionDate;
  const show =
    isAuctionEligibleAssetKind(asset.assetKind) &&
    asset.useEstimatedAcquisition &&
    !unsupportedPath &&
    !!transferDate &&
    transferDate >= EXPR_VALUATION_MIN_TRANSFER_DATE;
  if (!show) return null;

  return (
    <ToggleCard
      tone="amber"
      title="공매·경락으로 양도했나요? (소득세법 시행령 §164⑨ 2호)"
      description="국세징수법 공매·민사집행법 강제경매·저당권실행 경매 낙찰. 환산취득가 계산 시 양도당시 기준시가를 min(기준시가, 공매·경락가액)으로 낮춥니다."
      checked={asset.isAuctionTransfer ?? false}
      onCheckedChange={(v) => onChange({ isAuctionTransfer: v })}
    >
      <FieldCard
        label="공매·경락가액"
        unit="원"
        hint="공매 또는 경락(낙찰) 총액 (원). 양도당시 기준시가보다 낮을 때만 특례가 적용됩니다."
      >
        <CurrencyInput
          label="공매·경락가액"
          hideUnit
          value={asset.auctionPrice}
          onChange={(v) => onChange({ auctionPrice: v })}
        />
      </FieldCard>
    </ToggleCard>
  );
}
