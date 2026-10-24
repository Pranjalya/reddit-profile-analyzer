import { formatUnixTime, formatFullDateTime } from '../../utils/formatters';
import { calculateHeatmapData } from '../../api/analytics';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function OverviewTab({
  stalkedUser,
  selectedHeatmapCell,
  setSelectedHeatmapCell,
}) {
  const stats = stalkedUser.stats || {};
  const totalItems = (stats.totalComments || 0) + (stats.totalPosts || 0);

  const allItems = [...(stalkedUser.comments || []), ...(stalkedUser.posts || [])];
  const { grid, maxCount } = calculateHeatmapData(allItems);

  return (
    <div className="tab-pane">
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 className="tab-title">Target Footprint Summary</h3>
        <p className="tab-subtitle">Quick metrics of active dates and volume based on recent index data.</p>

        <div className="stats-cards-grid" style={{ marginTop: '1.5rem' }}>
          <div className="glass-panel big-stat-card">
            <span className="big-stat-num">{totalItems}</span>
            <p className="big-stat-lbl">Total Indexed items</p>
            <p className="big-stat-desc">Comments and posts analyzed</p>
          </div>

          <div className="glass-panel big-stat-card">
            <span
              className="big-stat-num"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-pink))' }}
            >
              {stats.recentScore ?? 0}
            </span>
            <p className="big-stat-lbl">Aggregate Score</p>
            <p className="big-stat-desc">Sum of scores across feed</p>
          </div>

          <div className="glass-panel big-stat-card">
            <span className="big-stat-num">{stats.subredditsCount ?? 0}</span>
            <p className="big-stat-lbl">Subreddits Visited</p>
            <p className="big-stat-desc">Communities interacted in</p>
          </div>
        </div>

        <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '1rem' }}>Timeline Range</h4>
          <div className="timeline-range-grid">
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Earliest Indexed Activity
              </span>
              <p style={{ fontWeight: '600', marginTop: '0.25rem' }} title={formatFullDateTime(stats.earliestActive)}>
                {formatUnixTime(stats.earliestActive)}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Latest Indexed Activity
              </span>
              <p style={{ fontWeight: '600', marginTop: '0.25rem' }} title={formatFullDateTime(stats.latestActive)}>
                {formatUnixTime(stats.latestActive)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sleep Heatmap Grid in Overview page for convenience */}
      <div className="glass-panel heatmap-container">
        <div className="heatmap-header-wrap">
          <div>
            <h3 className="tab-title">Activity Hour Tracker (Target Timezone Profiler)</h3>
            <p className="tab-subtitle">
              Plots when the target posts/comments. Darker blocks imply high active periods. Useful to deduce sleep cycles.
            </p>
          </div>
          <span className="heatmap-mobile-hint">↔ Swipe horizontally for 24h</span>
        </div>

        <div className="heatmap-grid-scroll">
          <div className="heatmap-hour-headers">
            <div className="heatmap-hour-lbl" style={{ width: '80px' }}>Day \ Hour</div>
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} className="heatmap-hour-lbl">
                {hour.toString().padStart(2, '0')}
              </div>
            ))}
          </div>

          <div className="heatmap-grid">
            {grid.map((rowHours, dayIndex) => (
              <div key={dayIndex} className="heatmap-row">
                <div className="heatmap-day-lbl">{DAYS_OF_WEEK[dayIndex].substring(0, 3)}</div>
                {rowHours.map((count, hour) => {
                  let level = 0;
                  if (count > 0 && maxCount > 0) {
                    const ratio = count / maxCount;
                    if (ratio <= 0.25) level = 1;
                    else if (ratio <= 0.5) level = 2;
                    else if (ratio <= 0.75) level = 3;
                    else level = 4;
                  }
                  const isSelected =
                    selectedHeatmapCell?.dayName === DAYS_OF_WEEK[dayIndex] &&
                    selectedHeatmapCell?.hour === hour;
                  return (
                    <div
                      key={hour}
                      className={`heatmap-cell level-${level} ${isSelected ? 'cell-selected' : ''}`}
                      onClick={() =>
                        setSelectedHeatmapCell({
                          dayName: DAYS_OF_WEEK[dayIndex],
                          hour,
                          count,
                        })
                      }
                    >
                      <span className="tooltip">
                        {count} items at {hour}:00 on {DAYS_OF_WEEK[dayIndex]}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="heatmap-legend">
            <span>Less Active</span>
            <div className="legend-square level-0"></div>
            <div className="legend-square level-1"></div>
            <div className="legend-square level-2"></div>
            <div className="legend-square level-3"></div>
            <div className="legend-square level-4"></div>
            <span>More Active</span>
          </div>

          {selectedHeatmapCell && (
            <div className="heatmap-selected-info">
              <span>
                📍 <strong>{selectedHeatmapCell.dayName}</strong> at{' '}
                <strong>{selectedHeatmapCell.hour.toString().padStart(2, '0')}:00</strong> —{' '}
                <strong>{selectedHeatmapCell.count}</strong> activity item
                {selectedHeatmapCell.count === 1 ? '' : 's'}
              </span>
              <button
                className="heatmap-clear-selected"
                onClick={() => setSelectedHeatmapCell(null)}
                title="Clear selection"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
