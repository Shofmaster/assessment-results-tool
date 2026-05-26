import type { XmlOem } from './types';

/**
 * Best-effort OEM inference from a manual's applicable model names.
 * Returns 'unknown' when no rule matches — callers can still proceed with the
 * family parser; only the manufacturer label is missing.
 */
export function detectOemFromModel(model: string): XmlOem {
  const m = model.trim().toUpperCase();
  if (!m) return 'unknown';

  if (/^G(IV|V|2[0-9]{2}|3[0-9]{2}|4[0-9]{2}|5[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2})/.test(m)) return 'gulfstream';
  if (/^B(7[0-9]{2}|8[0-9]{2}|MD)/.test(m) || /^7[0-9]{2}\b/.test(m)) return 'boeing';
  if (/^A(2[1-9]{2}|3[0-9]{2}|220)\b/.test(m)) return 'airbus';
  if (/^E(1[0-9]{2}|2[0-9]{2}|5[0-9]{2})\b/.test(m) || /^EMB/.test(m) || /^ERJ/.test(m)) return 'embraer';
  if (/^(CRJ|CL\d|CHALLENGER|GLOBAL|LEARJET)/.test(m)) return 'bombardier';
  if (/^(C(?:25[0-9]|310|340|400|421|550|560|650|680|700|750)|CITATION|CARAVAN|CESSNA)/.test(m)) return 'cessna';
  if (/^(BE|KING\s?AIR|BEECH|BEECHCRAFT|HAWKER)/.test(m)) return 'beechcraft';
  if (/^(SR2[0-9]|CIRRUS|VISION\s?JET|SF50)/.test(m)) return 'cirrus';
  if (/^(PC-?(6|7|12|21|24))/.test(m) || /^PILATUS/.test(m)) return 'pilatus';
  if (/^(TBM|KODIAK|DAHER)/.test(m)) return 'daher';
  if (/^(PA-?[0-9]+|PIPER|MERIDIAN|MIRAGE|MATRIX|M[2-6][0-9]{2})/.test(m)) return 'piper';
  if (/^(UH-?[0-9]+|S-?[0-9]+|SIKORSKY)/.test(m)) return 'sikorsky';
  if (/^(BELL|UH-?1|429|407|412|505|525)/.test(m)) return 'bell';
  if (/^(AW[0-9]+|LEONARDO)/.test(m)) return 'leonardo';
  if (/^(R[2-4][0-9]|ROBINSON)/.test(m)) return 'robinson';
  if (/^(CF[0-9]+|CFM[0-9]+|GE\s?|GENX|F404|F414)/.test(m)) return 'ge';
  if (/^(PW[0-9]+|PT6|JT8|JT9|PRATT)/.test(m)) return 'pw';
  if (/^(RB[0-9]+|TRENT|ROLLS)/.test(m)) return 'rollsroyce';
  if (/^(HTF|TFE|TPE|HONEYWELL|GTCP)/.test(m)) return 'honeywell';
  if (/^(FJ\d+|WILLIAMS)/.test(m)) return 'williams';
  if (/^(PRO\s?LINE|COLLINS)/.test(m)) return 'collins';
  if (/^(G[125]?000|GARMIN)/.test(m)) return 'garmin';
  if (/^(THALES|TOPDECK)/.test(m)) return 'thales';

  return 'unknown';
}

export function inferOemFromModels(models: string[] | undefined): XmlOem | undefined {
  if (!models || models.length === 0) return undefined;
  for (const m of models) {
    const oem = detectOemFromModel(m);
    if (oem !== 'unknown') return oem;
  }
  return 'unknown';
}

const OEM_DISPLAY: Record<XmlOem, string> = {
  gulfstream: 'Gulfstream',
  boeing: 'Boeing',
  airbus: 'Airbus',
  embraer: 'Embraer',
  bombardier: 'Bombardier',
  cessna: 'Cessna / Textron',
  beechcraft: 'Beechcraft / Textron',
  cirrus: 'Cirrus',
  pilatus: 'Pilatus',
  daher: 'Daher',
  piper: 'Piper',
  sikorsky: 'Sikorsky',
  bell: 'Bell',
  leonardo: 'Leonardo',
  robinson: 'Robinson',
  ge: 'GE Aerospace',
  pw: 'Pratt & Whitney',
  rollsroyce: 'Rolls-Royce',
  honeywell: 'Honeywell',
  williams: 'Williams International',
  collins: 'Collins Aerospace',
  garmin: 'Garmin',
  thales: 'Thales',
  unknown: '',
};

export function oemDisplayName(oem: XmlOem | undefined): string | undefined {
  if (!oem) return undefined;
  const name = OEM_DISPLAY[oem];
  return name || undefined;
}
