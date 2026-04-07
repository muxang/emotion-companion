/**
 * Analytics tracker - Phase 0 placeholder.
 * Phase 7 接入正式埋点后端。
 */
export interface AnalyticsEvent {
  name: string;
  user_id?: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export class Tracker {
  track(event: AnalyticsEvent): void {
    // Phase 0: no-op. Logged via console for visibility.
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event.name, event.properties ?? {});
  }
}
