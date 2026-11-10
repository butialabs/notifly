import { getLang, t } from "../i18n/core";

export type TripType = "one_way" | "round_trip";
export type Cabin = "economy" | "premium_economy" | "business" | "first";
export type Stops = "any" | "nonstop" | "one" | "two";
export type SortMode = "best" | "cheapest" | "departure" | "arrival" | "duration";
export type RuleKind =
  | "price_drop"
  | "price_rise"
  | "price_change"
  | "below_threshold"
  | "above_threshold"
  | "new_lowest";

export interface TimeWindow {
  departure_from?: number | null;
  departure_to?: number | null;
  arrival_from?: number | null;
  arrival_to?: number | null;
}

export interface Segment {
  origins: string[];
  destinations: string[];
  date: string;
  times?: TimeWindow | null;
}

export interface Passengers {
  adults: number;
  children: number;
  infants_in_seat: number;
  infants_on_lap: number;
}

export interface FlightQuery {
  trip_type: TripType;
  segments: Segment[];
  return_date?: string | null;
  return_times?: TimeWindow | null;
  passengers: Passengers;
  cabin: Cabin;
  max_stops: Stops;
  airlines: string[];
  airlines_exclude: string[];
  alliances: string[];
  max_duration_minutes?: number | null;
  max_price?: number | null;
  checked_bags: number;
  carry_on: boolean;
  exclude_basic_economy: boolean;
  sort: SortMode;
}

export interface Leg {
  airline_code: string;
  airline_name: string;
  flight_number: string;
  origin: string;
  origin_name?: string;
  destination: string;
  destination_name?: string;
  departure: string;
  arrival: string;
  duration: number;
  aircraft?: string | null;
  legroom?: string | null;
  overnight: boolean;
}

export interface Layover {
  airport: string;
  city?: string | null;
  duration: number;
  overnight: boolean;
  change_of_airport: boolean;
}

export interface Slice {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  duration: number;
  stops: number;
  legs: Leg[];
  layovers: Layover[];
  airlines: string[];
}

export interface BookingLink {
  id: string;
  name: string;
  url: string;
}

export interface Offer {
  price: number | null;
  currency: string | null;
  duration: number;
  stops: number;
  airlines: string[];
  slices: Slice[];
  co2_g?: number | null;
  emissions_tag?: string | null;
  links?: BookingLink[];
}

export interface SearchResult {
  offers: Offer[];
  min_price: number | null;
  median_price: number | null;
  currency: string | null;
  count: number;
  google_flights_url: string;
  links?: BookingLink[];
  elapsed_ms: number;
  provider?: string | null;
}

export interface Place {
  type: "city" | "airport";
  code: string;
  codes: string[];
  name: string;
  city: string;
  country: string;
  country_code: string;
}

export interface AirlineItem {
  code: string;
  name: string;
}

export interface Trip {
  id: number;
  name: string;
  description?: string | null;
  emoji?: string | null;
  archived: boolean;
  created_at: string;
  watch_count: number;
  active_watch_count: number;
  best_price: number | null;
  currency: string | null;
  rule_count: number;
  start_date?: string | null;
  end_date?: string | null;
  /** List view only: one item per flight, in date order. */
  watch_prices?: WatchPrice[];
  watches?: Watch[];
}

export interface WatchPrice {
  id: number;
  route: string;
  label?: string | null;
  date: string;
  return_date?: string | null;
  price: number | null;
  currency: string | null;
  active: boolean;
}

export interface Watch {
  id: number;
  trip_id: number;
  label?: string | null;
  query: FlightQuery;
  check_interval_minutes: number;
  active: boolean;
  created_at: string;
  last_checked_at?: string | null;
  last_price?: number | null;
  previous_price?: number | null;
  lowest_price?: number | null;
  lowest_price_at?: string | null;
  highest_price?: number | null;
  currency?: string | null;
  last_error?: string | null;
  consecutive_errors: number;
  route: string;
  google_flights_url: string;
  links?: BookingLink[];
  next_check_at?: string | null;
  sparkline?: { t: string; p: number }[];
  trip?: { id: number; name: string; emoji?: string | null };
  last_provider?: string | null;
  last_alert?: { created_at: string; kind?: string | null; rule_id?: number | null; title: string; ok: boolean } | null;
  applicable_rules?: (Rule & { scope: "watch" | "trip" | "global" })[];
}

export interface Snapshot {
  id: number;
  watch_id: number;
  checked_at: string;
  ok: boolean;
  error?: string | null;
  min_price: number | null;
  median_price: number | null;
  currency: string | null;
  result_count: number;
  best_offer?: Offer | null;
  offers?: Offer[] | null;
  provider?: string | null;
}

export interface HistoryPoint {
  id: number;
  checked_at: string;
  ok: boolean;
  error?: string | null;
  min_price: number | null;
  median_price: number | null;
  currency: string | null;
  result_count: number;
}

export interface Channel {
  id: number;
  name: string;
  /** URL without tokens/passwords; the full one never leaves the server. */
  url_masked: string;
  enabled: boolean;
  created_at: string;
}

export interface ChannelInput {
  name: string;
  url: string;
  enabled?: boolean;
}

export interface Rule {
  id: number;
  name?: string | null;
  kind: RuleKind;
  trip_id?: number | null;
  watch_id?: number | null;
  threshold?: number | null;
  min_change_abs?: number | null;
  min_change_pct?: number | null;
  cooldown_minutes: number;
  repeat_while_matching: boolean;
  enabled: boolean;
  channel_ids: number[];
}

export interface NotificationEntry {
  id: number;
  created_at: string;
  rule_id?: number | null;
  channel_id?: number | null;
  watch_id?: number | null;
  kind?: string | null;
  title: string;
  body: string;
  ok: boolean;
  error?: string | null;
  is_test: boolean;
}

export interface AppSettings {
  currency: string;
  language: string;
  country: string;
  default_check_interval_minutes: number;
  min_check_interval_minutes: number;
  scheduler_enabled: boolean;
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
}

/** Fired when the API answers 401 (missing or expired session). */
export const UNAUTHORIZED_EVENT = "notifly:unauthorized";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      // the backend translates `detail` and validation messages by this header
      headers: { "Accept-Language": getLang(), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, t("api.offline"));
  }
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { detail?: unknown } | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok && !data?.detail) {
    throw new ApiError(
      res.status,
      res.status >= 500
        ? t("api.serverError", { status: res.status })
        : t("api.refused", { status: res.status }),
    );
  }
  if (!res.ok) {
    let msg = res.statusText;
    if (data?.detail) {
      msg = Array.isArray(data.detail)
        ? (data.detail as { msg: string }[]).map((d) => d.msg.replace(/^Value error, /, "")).join("; ")
        : String(data.detail);
    }
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined);
  return p.length ? "?" + new URLSearchParams(p.map(([k, v]) => [k, String(v)])).toString() : "";
};

export const api = {
  authStatus: () => request<AuthStatus>("GET", "/auth/status"),
  login: (password: string) => request<AuthStatus>("POST", "/auth/login", { password }),
  logout: () => request<AuthStatus>("POST", "/auth/logout"),
  settings: () => request<AppSettings>("GET", "/settings"),
  airports: (q: string) => request<Place[]>("GET", `/airports${qs({ q })}`),
  resolvePlace: (codes: string[]) => request<Place | null>("GET", `/places/resolve${qs({ codes: codes.join(",") })}`),
  airlines: (q: string) => request<AirlineItem[]>("GET", `/airlines${qs({ q })}`),
  search: (query: FlightQuery) => request<SearchResult>("POST", "/search", query),

  trips: (archived = false) => request<Trip[]>("GET", `/trips${qs({ archived: String(archived) })}`),
  trip: (id: number) => request<Trip>("GET", `/trips/${id}`),
  createTrip: (data: Partial<Trip>) => request<Trip>("POST", "/trips", data),
  updateTrip: (id: number, data: Partial<Trip>) => request<Trip>("PATCH", `/trips/${id}`, data),
  deleteTrip: (id: number) => request<void>("DELETE", `/trips/${id}`),

  watch: (id: number) => request<Watch>("GET", `/watches/${id}`),
  createWatch: (
    tripId: number,
    data: { label?: string | null; query: FlightQuery; check_interval_minutes?: number },
  ) => request<Watch>("POST", `/trips/${tripId}/watches`, data),
  updateWatch: (id: number, data: Partial<Omit<Watch, "query">> & { query?: FlightQuery }) =>
    request<Watch>("PATCH", `/watches/${id}`, data),
  deleteWatch: (id: number) => request<void>("DELETE", `/watches/${id}`),
  checkWatch: (id: number) => request<{ snapshot: Snapshot | null; watch: Watch }>("POST", `/watches/${id}/check`),
  history: (id: number) => request<HistoryPoint[]>("GET", `/watches/${id}/history`),
  latest: (id: number) => request<Snapshot | null>("GET", `/watches/${id}/latest`),

  channels: () => request<Channel[]>("GET", "/channels"),
  createChannel: (data: ChannelInput) => request<Channel>("POST", "/channels", data),
  updateChannel: (id: number, data: Partial<ChannelInput>) => request<Channel>("PATCH", `/channels/${id}`, data),
  deleteChannel: (id: number) => request<void>("DELETE", `/channels/${id}`),
  testChannel: (id: number) => request<{ ok: boolean; error?: string }>("POST", `/channels/${id}/test`),

  rules: (params: { trip_id?: number; watch_id?: number }) => request<Rule[]>("GET", `/rules${qs(params)}`),
  createRule: (data: Partial<Rule>) => request<Rule>("POST", "/rules", data),
  updateRule: (id: number, data: Partial<Rule>) => request<Rule>("PATCH", `/rules/${id}`, data),
  deleteRule: (id: number) => request<void>("DELETE", `/rules/${id}`),

  notifications: (limit = 100) => request<NotificationEntry[]>("GET", `/notifications${qs({ limit })}`),
};
