import cron, { type ScheduledTask } from 'node-cron';
import { buildBriefFromServer, sendBrief, persistBrief, readBrief } from './brief';
import type { ServerContext } from '../context';

export class BriefScheduler {
  private task: ScheduledTask | null = null;

  constructor(private ctx: ServerContext) {}

  start(): void {
    this.reschedule();
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }

  /** Re-read config and reset the cron schedule. Call this when user saves config. */
  reschedule(): void {
    this.stop();
    const cfg = this.ctx.config.dailyBrief;
    if (!cfg?.enabled || cfg.manualOnly) return;

    const [hh, mm] = cfg.time.split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
      console.warn('[brief] invalid time string, scheduler not started');
      return;
    }

    const cronExpr = `${mm} ${hh} * * *`;
    this.task = cron.schedule(
      cronExpr,
      async () => {
        try {
          await this.runOnce();
        } catch (e) {
          console.error('[brief] unhandled error in cron tick:', e);
        }
      },
      { timezone: cfg.timezone },
    );
    console.log(`[brief] scheduled for ${cfg.time} ${cfg.timezone}`);
  }

  /**
   * Run the brief if today's hasn't been sent yet.
   * Returns { brief, sent } or null if skipped.
   */
  async runOnce(): Promise<{ brief: Awaited<ReturnType<typeof buildBriefFromServer>>; sent: boolean } | null> {
    const cfg = this.ctx.config.dailyBrief;
    if (!cfg?.enabled) return null;

    const today = new Date().toISOString().slice(0, 10);
    const existing = await readBrief(this.ctx.dataDir, today);
    if (existing?.status === 'sent') {
      console.log('[brief] already sent today, skipping');
      return null;
    }

    try {
      const brief = await buildBriefFromServer(this.ctx, {
        includeOnThisDay: cfg.includeOnThisDay,
        includeQuiz: cfg.includeQuiz,
      });

      const { messageId } = await sendBrief(brief, cfg);
      brief.status = 'sent';
      brief.message_id = messageId;
      await persistBrief(this.ctx.dataDir, brief);
      console.log(`[brief] sent, message id: ${messageId}`);
      return { brief, sent: true };
    } catch (e) {
      const errMsg = (e as Error).message;
      console.error('[brief] failed:', errMsg);

      const failedBrief = {
        date: today,
        generated_at: new Date().toISOString(),
        summary: '',
        sections: [] as [],
        citations: [] as [],
        status: 'failed' as const,
        error: errMsg,
      };
      await persistBrief(this.ctx.dataDir, failedBrief);
      return null;
    }
  }
}
