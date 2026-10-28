/**
 * Airline from an ADS-B callsign.
 *
 * ADS-B carries a callsign ("AAL1234"), not an airline name. Airline callsigns
 * start with the three-letter ICAO operator code, so a small lookup covers
 * most traffic around MIA. Anything else is labelled honestly: a US
 * registration ("N123AB") is private/general aviation, and an aircraft that
 * broadcast no callsign is shown by its ICAO hex address.
 */

export interface AirlineInfo {
  icao: string;
  iata: string | null;
  name: string;
}

/** ICAO operator code -> airline. Carriers commonly seen in South Florida. */
const AIRLINES: Readonly<Record<string, [iata: string | null, name: string]>> = {
  // US mainline and regionals
  AAL: ["AA", "American Airlines"],
  ENY: ["MQ", "Envoy (American Eagle)"],
  JIA: ["OH", "PSA (American Eagle)"],
  PDT: ["PT", "Piedmont (American Eagle)"],
  RPA: ["YX", "Republic Airways"],
  SKW: ["OO", "SkyWest"],
  DAL: ["DL", "Delta Air Lines"],
  EDV: ["9E", "Endeavor (Delta Connection)"],
  UAL: ["UA", "United Airlines"],
  GJS: ["G7", "GoJet (United Express)"],
  SWA: ["WN", "Southwest Airlines"],
  JBU: ["B6", "JetBlue"],
  NKS: ["NK", "Spirit Airlines"],
  FFT: ["F9", "Frontier Airlines"],
  AAY: ["G4", "Allegiant Air"],
  ASA: ["AS", "Alaska Airlines"],
  SCX: ["SY", "Sun Country"],
  SIL: ["3M", "Silver Airways"],
  // Canada
  ACA: ["AC", "Air Canada"],
  ROU: ["RV", "Air Canada Rouge"],
  WJA: ["WS", "WestJet"],
  TSC: ["TS", "Air Transat"],
  // Latin America and the Caribbean
  AVA: ["AV", "Avianca"],
  LAN: ["LA", "LATAM"],
  LPE: ["LP", "LATAM Peru"],
  TAM: ["JJ", "LATAM Brasil"],
  ARE: ["4C", "LATAM Colombia"],
  CMP: ["CM", "Copa Airlines"],
  AMX: ["AM", "Aeroméxico"],
  VOI: ["Y4", "Volaris"],
  VIV: ["VB", "Viva Aerobus"],
  ARG: ["AR", "Aerolíneas Argentinas"],
  SKU: ["H2", "Sky Airline"],
  AZU: ["AD", "Azul"],
  GLO: ["G3", "Gol"],
  BOV: ["OB", "Boliviana de Aviación"],
  BWA: ["BW", "Caribbean Airlines"],
  BHS: ["UP", "Bahamasair"],
  CAY: ["KX", "Cayman Airways"],
  DWI: ["DM", "Arajet"],
  // Europe and beyond
  BAW: ["BA", "British Airways"],
  VIR: ["VS", "Virgin Atlantic"],
  IBE: ["IB", "Iberia"],
  AEA: ["UX", "Air Europa"],
  AFR: ["AF", "Air France"],
  KLM: ["KL", "KLM"],
  DLH: ["LH", "Lufthansa"],
  SWR: ["LX", "Swiss"],
  TAP: ["TP", "TAP Air Portugal"],
  THY: ["TK", "Turkish Airlines"],
  QTR: ["QR", "Qatar Airways"],
  UAE: ["EK", "Emirates"],
  ELY: ["LY", "El Al"],
  // Cargo
  FDX: ["FX", "FedEx"],
  UPS: ["5X", "UPS Airlines"],
  ABX: ["GB", "ABX Air"],
  GTI: ["5Y", "Atlas Air"],
  CKS: ["K4", "Kalitta Air"],
  AJT: ["M6", "Amerijet"],
  CLX: ["CV", "Cargolux"],
  TPA: ["QT", "Avianca Cargo"],
  LCO: ["UC", "LATAM Cargo"],
  // Business aviation operators
  EJA: [null, "NetJets"],
  LXJ: [null, "Flexjet"],
};

const AIRLINE_CALLSIGN = /^([A-Z]{3})(\d[0-9A-Z]*)$/;
const US_REGISTRATION = /^N[0-9][0-9A-Z]{0,4}$/;

export type CallsignKind = "airline" | "unknown-operator" | "private" | "none";

export interface CallsignInfo {
  kind: CallsignKind;
  /** Operator for airline callsigns, otherwise null. */
  airline: AirlineInfo | null;
  /** Short display label for the operator column. */
  label: string;
}

export function describeCallsign(callsign: string | null | undefined): CallsignInfo {
  const cs = callsign?.trim().toUpperCase() ?? "";
  if (!cs) return { kind: "none", airline: null, label: "No callsign" };

  if (US_REGISTRATION.test(cs)) {
    return { kind: "private", airline: null, label: "Private / general aviation" };
  }

  const match = AIRLINE_CALLSIGN.exec(cs);
  if (match) {
    const entry = AIRLINES[match[1]!];
    if (entry) {
      const airline = { icao: match[1]!, iata: entry[0], name: entry[1] };
      return { kind: "airline", airline, label: airline.name };
    }
    return { kind: "unknown-operator", airline: null, label: `Operator ${match[1]}` };
  }

  return { kind: "unknown-operator", airline: null, label: "Other" };
}

/**
 * The callsign the aircraft actually broadcast. The ingestor stores it in
 * flight_icao; flight_iata holds an IATA-converted ident, or the hex address
 * when no callsign was heard.
 */
export function broadcastCallsign(flight: {
  flight_icao: string | null;
  flight_iata: string;
  icao_hex?: string | null;
}): string | null {
  if (flight.flight_icao) return flight.flight_icao.trim();
  if (flight.icao_hex && flight.flight_iata.toUpperCase() === flight.icao_hex.toUpperCase()) {
    return null;
  }
  return flight.flight_iata;
}
