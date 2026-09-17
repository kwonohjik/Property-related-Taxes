"use client";

/**
 * 별지 제84호서식 헤더 메타 (양도인·종목·증권사·계좌·과세연도) — 공용 훅
 *
 * ## 왜 훅으로 나왔나
 *
 * 국내 결과뷰(`StockTransferTaxResultView`)와 **국외주식 결과 화면**(`ForeignStockFilingFormSection`)이
 * 같은 서식을 렌더한다. 양도인 이름은 전문가 모드면 의뢰인, 아니면 내 프로필이라는 **분기가 있는**
 * 값이라, 두 화면이 각자 구현하면 한쪽만 고쳐져 신고서의 양도인이 화면마다 달라진다.
 *
 * 디자인 §4.2 — `StockTaxpayerHeaderCard`와 **같은 데이터 소스**를 쓰되 인쇄용 표 헤더에도 전달한다.
 */

import { useEffect, useRef, useState } from "react";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { clientRepository } from "@/lib/storage";

export interface StockFilingHeaderMetaArgs {
  securityName?: string;
  securityCode?: string;
  brokerage?: string;
  accountNumberMasked?: string;
  /** "YYYY-MM-DD" — 과세연도 추출용. 비었거나 파싱 불가면 연도 미표시 */
  transferDate?: string;
}

export function useStockFilingHeaderMeta({
  securityName,
  securityCode,
  brokerage,
  accountNumberMasked,
  transferDate,
}: StockFilingHeaderMetaArgs) {
  const { profile, mode } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  const [loadedClientName, setLoadedClientName] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    if (mode === "professional" && activeClientId) {
      clientRepository.get(activeClientId).then((c) => {
        if (mountedRef.current) setLoadedClientName(c?.name ?? null);
      });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [mode, activeClientId]);
  const clientNameResolved = (mode === "professional" && activeClientId) ? loadedClientName : null;
  const taxpayerName = clientNameResolved ?? profile?.displayName ?? "";
  const filingYear = (() => {
    if (!transferDate) return undefined;
    const d = new Date(transferDate);
    return isNaN(d.getTime()) ? undefined : d.getFullYear();
  })();

  return {
    taxpayerName,
    stockName: securityName,
    stockCode: securityCode,
    brokerName: brokerage,
    accountNumber: accountNumberMasked,
    filingYear,
  };
}
