"use client";

/**
 * useStandardPriceLookup — Vworld NED API 공시가격 자동 조회 공통 훅
 *
 * 사용 위치: 취득세·재산세·종부세·상속세·증여세 폼의 공시가격 필드
 * API: /api/address/standard-price?jibun=&propertyType=&year=&dong=&ho=
 */

import { useState } from "react";

export interface LookupMsg {
  text: string;
  kind: "ok" | "err";
}

interface LookupOptions {
  /** 지번 주소 (필수 — 없으면 에러 메시지 반환) */
  jibun: string;
  /** "housing" | "land" | "land_farmland" — 주택·토지 구분 */
  propertyType: string;
  /** 조회 연도 — 미지정 시 훅 내부 year 상태 사용 */
  year?: string;
  /** 공동주택 동 이름 (선택) */
  dong?: string;
  /** 공동주택 호수 (선택) */
  ho?: string;
}

/**
 * 날짜와 물건 유형으로 공시가격 기본 조회 연도 계산
 * dateStr 미지정 시 오늘 날짜 기준
 * 주택: 공시일 4.29 이전이면 전년도 / 토지: 5.31 이전이면 전년도
 */
export function getDefaultPriceYear(dateStr: string, propertyType: string): string {
  const ref = dateStr && dateStr.length >= 10 ? dateStr : new Date().toISOString().slice(0, 10);
  const year = parseInt(ref.slice(0, 4));
  const mmdd = ref.slice(5, 7) + ref.slice(8, 10);
  const cutoff = propertyType === "land" || propertyType === "land_farmland" ? "0531" : "0429";
  return mmdd < cutoff ? String(year - 1) : String(year);
}

export function useStandardPriceLookup(defaultPropertyType = "housing") {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2004 }, (_, i) => String(currentYear - i));

  const [year, setYear] = useState(() => getDefaultPriceYear("", defaultPropertyType));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<LookupMsg | null>(null);
  const [announcedLabel, setAnnouncedLabel] = useState<string>("");

  async function lookup(opts: LookupOptions): Promise<number | null> {
    if (!opts.jibun) {
      setMsg({ text: "먼저 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return null;
    }

    setLoading(true);
    setMsg(null);

    try {
      const apiType = opts.propertyType === "land_farmland" ? "land" : opts.propertyType;
      const lookupYear = opts.year ?? year;
      const params = new URLSearchParams({
        jibun: opts.jibun,
        propertyType: apiType,
        year: lookupYear,
      });
      if (opts.dong) params.set("dong", opts.dong);
      if (opts.ho) params.set("ho", opts.ho);

      const res = await fetch(`/api/address/standard-price?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setMsg({ text: data?.error?.message ?? "공시가격 조회 실패", kind: "err" });
        setAnnouncedLabel("");
        return null;
      }

      const price = data.price ?? data.pricePerSqm ?? 0;
      if (price > 0) {
        const announcedDate = String(data.announcedDate ?? "");
        const effectiveDate = announcedDate.length === 8
          ? announcedDate
          : data.priceType === "land_price" ? `${lookupYear}0531` : `${lookupYear}0429`;
        const typeName =
          data.priceType === "apart_housing_price" ? "공동주택" :
          data.priceType === "indvd_housing_price" ? "개별주택" :
          data.priceType === "land_price" ? "개별공시지가" : "공시가격";
        const d = effectiveDate;
        const pubDate = `${d.slice(0, 4)}.${parseInt(d.slice(4, 6), 10)}.${parseInt(d.slice(6, 8), 10)}.`;
        setAnnouncedLabel(`${typeName} 공시일 : ${pubDate}`);
        setMsg({ text: `${data.message ?? "조회 성공"}: ${price.toLocaleString()}원`, kind: "ok" });
        return price;
      }

      setAnnouncedLabel("");
      setMsg({ text: "가격 정보 없음 — 직접 입력해주세요.", kind: "err" });
      return null;
    } catch {
      setAnnouncedLabel("");
      setMsg({ text: "네트워크 오류 — 직접 입력해주세요.", kind: "err" });
      return null;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMsg(null);
    setAnnouncedLabel("");
  }

  return { loading, msg, year, setYear, yearOptions, announcedLabel, lookup, reset };
}
