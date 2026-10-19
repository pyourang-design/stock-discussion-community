// 종목코드 → 이름 (업종 탭 종목 + 숨은 종목 + 개편으로 탭에서 빠진 옛 종목) — 구글 뉴스 검색어용
import { STOCKS } from './_stocks.js';
import { HIDDEN } from './_hidden.js';
import { LEGACY } from './_legacy.js';

const NAMES = new Map([...LEGACY.map(r => [r[0], r[1]]), ...HIDDEN, ...STOCKS.map(s => [s.code, s.name])]);
export const nameOf = code => NAMES.get(code) || null;

// 종목 하나의 구글 뉴스 검색어: 종목명이 정확히 들어간 기사
// 영어 4글자 이하 종목명(HLB, LS, SKC 등)은 다른 뜻으로 쓰이기 쉬워 주식 관련 단어가 함께 있는 기사만
const SHORT_EN_NAME = /^[A-Za-z0-9&]{1,4}$/;
const STOCK_WORDS = '(주가 OR 주식 OR 공시 OR 실적 OR 계약 OR 증권사 OR 보고서 OR 분석 OR 리포트 OR 목표가 OR 투자의견)';
export const stockQuery = name => SHORT_EN_NAME.test(name) ? `"${name}" ${STOCK_WORDS}` : `"${name}"`;
