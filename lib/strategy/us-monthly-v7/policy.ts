export const US_V7_VERSION = 'us-monthly-v7-2026.08-v1';
export const US_V7 = {
  breadthStrong:80, breadthSelective:60, breadthWeak:40, breadthRecovery:30,
  ddLevels: [-12,-18,-24],
} as const;
export const US_V7_UNIVERSE = [
  { ticker:'XLF'},{ticker:'XLE'},{ticker:'XLK'},{ticker:'XLV'},{ticker:'XLI'},{ticker:'XLP'},{ticker:'XLU'},{ticker:'XLB'},{ticker:'XLY'},
  { ticker:'SMH'},{ticker:'SOXX'},{ticker:'IGV'},{ticker:'KRE'},{ticker:'ITB'},{ticker:'XME'},{ticker:'XRT'},
] as const;
