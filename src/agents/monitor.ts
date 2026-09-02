// Monitor Agent — persistent wallet surveillance and alerts
// Agent 3: Monitor
// Watches dormant wallets and resumes investigation when funds move
// Reads Tracer's dead ends from Sibyl Memory, writes alerts back

import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Hop, WatchlistEntry, Case } from '@/memory/schemas';
import { ChainReader } from '@/chain/reader';

const chain = new ChainReader();

interface MonitorResult {
  watchedAddresses: number;
  newAlerts: WatchlistEntry[];
  summary: string;
}

export class MonitorAgent {
  private memory = getSibylMemory();
  private checkInterval = 60000; // 1 minute for demo, longer in production

  // Scan for dead-end addresses and start watching them (L20 — referenced in README)
  async scanForDeadEnds(caseId: string): Promise<MonitorResult> {
    // Read Tracer's flagged dead-end addresses from Sibyl Memory
    const hops = await this.memory.query<Hop>(COLLECTIONS.HOPS, {
      filter: { case_id: caseId, flagged: true },
    });

    const deadEnds = hops.filter(
      (h) => h.flag_reason?.includes('Dead end') || h.flag_reason?.includes('sitting')
    );

    if (deadEnds.length === 0) {
      return {
        watchedAddresses: 0,
        newAlerts: [],
        summary: 'No dead-end addresses found to monitor.',
      };
    }

    const watchEntries: WatchlistEntry[] = [];

    for (const hop of deadEnds) {
      const address = hop.to_address;

      // Check if already watching
      const existing = await this.memory.query<WatchlistEntry>(COLLECTIONS.WATCHLIST, {
        filter: { case_id: caseId, address },
      });

      if (existing.length > 0) {
        continue;
      }

      // Add to watchlist (L32 — referenced in README)
      const entry: WatchlistEntry = {
        case_id: caseId,
        address,
        reason: hop.flag_reason || 'Dead end — funds sitting idle',
        watching_since: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        status: 'watching',
        alert_sent: false,
      };

      const watchId = `${caseId}-watch-${address.slice(0, 10)}`;
      await this.memory.store(
        COLLECTIONS.WATCHLIST,
        entry as unknown as Record<string, unknown>,
        watchId
      );
      watchEntries.push(entry);

    }

    return {
      watchedAddresses: watchEntries.length,
      newAlerts: [],
      summary: `Started monitoring ${watchEntries.length} dormant wallet(s) for case ${caseId}.`,
    };
  }

  // Check all watched addresses for new activity
  async checkWatchlist(): Promise<MonitorResult> {
    const watchlist = await this.memory.query<WatchlistEntry>(COLLECTIONS.WATCHLIST, {
      filter: { status: 'watching' },
    });

    if (watchlist.length === 0) {
      return {
        watchedAddresses: 0,
        newAlerts: [],
        summary: 'No addresses currently being monitored.',
      };
    }

    const alerts: WatchlistEntry[] = [];

    for (const entry of watchlist) {
      const result = await chain.getLatestActivity(entry.address);

      // Update last_checked
      const watchId = `${entry.case_id}-watch-${entry.address.slice(0, 10)}`;
      await this.memory.update(COLLECTIONS.WATCHLIST, watchId, {
        last_checked: new Date().toISOString(),
      });

      if (result.hasNewActivity && result.latestTx) {
        const lastCheckedTime = new Date(entry.last_checked).getTime();
        const txTime = new Date(result.latestTx.timestamp).getTime();

        // Only alert if transaction is newer than last check
        if (txTime > lastCheckedTime) {
          // Update watchlist entry
          await this.memory.update(COLLECTIONS.WATCHLIST, watchId, {
            status: 'moved',
            alert_sent: true,
          });

          // Write alert to memory for Tracer to pick up
          await this.writeAlert(entry.case_id, entry.address, result.latestTx);

          // Update case status
          await this.memory.update(COLLECTIONS.CASES, entry.case_id, {
            status: 'active',
          });

          const alertEntry = { ...entry, status: 'moved' as const, alert_sent: true };
          alerts.push(alertEntry);
        }
      }
    }

    const summary = alerts.length > 0
      ? `🚨 Movement detected in ${alerts.length} watched wallet(s)! Tracer should resume investigation.`
      : `Checked ${watchlist.length} addresses — no new activity.`;

    return {
      watchedAddresses: watchlist.length,
      newAlerts: alerts,
      summary,
    };
  }

  // Check a specific case's watchlist
  async checkCase(caseId: string): Promise<MonitorResult> {
    const watchlist = await this.memory.query<WatchlistEntry>(COLLECTIONS.WATCHLIST, {
      filter: { case_id: caseId, status: 'watching' },
    });

    if (watchlist.length === 0) {
      return {
        watchedAddresses: 0,
        newAlerts: [],
        summary: `No addresses being monitored for case ${caseId}.`,
      };
    }

    const alerts: WatchlistEntry[] = [];

    for (const entry of watchlist) {
      const result = await chain.getLatestActivity(entry.address);

      if (result.hasNewActivity && result.latestTx) {
        const lastCheckedTime = new Date(entry.last_checked).getTime();
        const txTime = new Date(result.latestTx.timestamp).getTime();

        if (txTime > lastCheckedTime) {
          const watchId = `${entry.case_id}-watch-${entry.address.slice(0, 10)}`;
          await this.memory.update(COLLECTIONS.WATCHLIST, watchId, {
            status: 'moved',
            alert_sent: true,
          });

          await this.writeAlert(entry.case_id, entry.address, result.latestTx);
          alerts.push({ ...entry, status: 'moved', alert_sent: true });
        }
      }
    }

    return {
      watchedAddresses: watchlist.length,
      newAlerts: alerts,
      summary: alerts.length > 0
        ? `🚨 ${alerts.length} address(es) moved funds in case ${caseId}!`
        : `${watchlist.length} address(es) still dormant for case ${caseId}.`,
    };
  }

  // Write alert to memory for Tracer to read
  private async writeAlert(
    caseId: string,
    address: string,
    tx: { hash: string; to: string; value: string; timestamp: string }
  ): Promise<void> {
    const alertHop: Hop = {
      case_id: caseId,
      hop_number: -1, // Special: indicates a Monitor-triggered resume point
      from_address: address,
      to_address: tx.to,
      amount: tx.value,
      tx_hash: tx.hash,
      timestamp: tx.timestamp,
      is_split: false,
      branch_id: 'monitor-alert',
      flagged: true,
      flag_reason: 'MONITOR ALERT: Previously dormant wallet moved funds',
    };

    const alertId = `${caseId}-alert-${address.slice(0, 10)}-${Date.now()}`;
    await this.memory.store(
      COLLECTIONS.HOPS,
      alertHop as unknown as Record<string, unknown>,
      alertId
    );

  }

  // Get monitoring status
  async getStatus(): Promise<{
    totalWatching: number;
    byCase: Record<string, number>;
    recentAlerts: WatchlistEntry[];
  }> {
    const all = await this.memory.query<WatchlistEntry>(COLLECTIONS.WATCHLIST, {});
    const watching = all.filter((w) => w.status === 'watching');
    const moved = all.filter((w) => w.status === 'moved');

    const byCase: Record<string, number> = {};
    for (const w of watching) {
      byCase[w.case_id] = (byCase[w.case_id] || 0) + 1;
    }

    return {
      totalWatching: watching.length,
      byCase,
      recentAlerts: moved.slice(0, 10),
    };
  }
}
