/**
 * In-memory metrics store: counts tasks completed and failed per date.
 * Daily = today; weekly = sum of last 7 days.
 */

export interface MetricsSnapshot {
  daily: { completed: number; failed: number }
  weekly: { completed: number; failed: number }
}

const DEFAULT_BUCKET = { completed: 0, failed: 0 }

function todayKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function dateKeyDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export class MetricsStore {
  private byDate = new Map<string, { completed: number; failed: number }>()

  recordCompleted(): void {
    const key = todayKey()
    const bucket = this.byDate.get(key) ?? { ...DEFAULT_BUCKET }
    bucket.completed += 1
    this.byDate.set(key, bucket)
  }

  recordFailed(): void {
    const key = todayKey()
    const bucket = this.byDate.get(key) ?? { ...DEFAULT_BUCKET }
    bucket.failed += 1
    this.byDate.set(key, bucket)
  }

  getSnapshot(): MetricsSnapshot {
    const dailyKey = todayKey()
    const daily = this.byDate.get(dailyKey) ?? { ...DEFAULT_BUCKET }
    let weeklyCompleted = 0
    let weeklyFailed = 0
    for (let i = 0; i < 7; i++) {
      const key = i === 0 ? dailyKey : dateKeyDaysAgo(i)
      const bucket = this.byDate.get(key) ?? DEFAULT_BUCKET
      weeklyCompleted += bucket.completed
      weeklyFailed += bucket.failed
    }
    return {
      daily: { ...daily },
      weekly: { completed: weeklyCompleted, failed: weeklyFailed },
    }
  }
}
