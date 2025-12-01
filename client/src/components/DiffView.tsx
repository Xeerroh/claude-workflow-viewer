import { useState } from 'react';
import './DiffView.css';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  language?: string;
}

export function DiffView({ oldContent, newContent, language }: DiffViewProps) {
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = 20;
  const isLong = oldLines.length > maxLines || newLines.length > maxLines;

  const displayOldLines = expanded || !isLong ? oldLines : oldLines.slice(0, maxLines);
  const displayNewLines = expanded || !isLong ? newLines : newLines.slice(0, maxLines);

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <span className="diff-stats">
          <span className="diff-stat removed">−{oldLines.length} lines</span>
          <span className="diff-stat added">+{newLines.length} lines</span>
        </span>
        <button
          className={`diff-toggle ${showSideBySide ? 'active' : ''}`}
          onClick={() => setShowSideBySide(!showSideBySide)}
          title="Toggle side-by-side view"
        >
          {showSideBySide ? 'Inline' : 'Side-by-side'}
        </button>
      </div>

      {showSideBySide ? (
        <div className="diff-side-by-side">
          <div className="diff-panel diff-panel-old">
            <div className="diff-panel-header">Before</div>
            <div className="diff-panel-content">
              {displayOldLines.map((line, i) => (
                <div key={i} className="diff-line removed">
                  <span className="diff-line-number">{i + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-panel diff-panel-new">
            <div className="diff-panel-header">After</div>
            <div className="diff-panel-content">
              {displayNewLines.map((line, i) => (
                <div key={i} className="diff-line added">
                  <span className="diff-line-number">{i + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="diff-inline">
          <div className="diff-section diff-section-old">
            <div className="diff-section-marker">−</div>
            <div className="diff-section-content">
              {displayOldLines.map((line, i) => (
                <div key={i} className="diff-line">
                  <span className="diff-line-number">{i + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-divider">
            <span className="diff-arrow">↓</span>
          </div>
          <div className="diff-section diff-section-new">
            <div className="diff-section-marker">+</div>
            <div className="diff-section-content">
              {displayNewLines.map((line, i) => (
                <div key={i} className="diff-line">
                  <span className="diff-line-number">{i + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLong && (
        <button className="diff-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all (${Math.max(oldLines.length, newLines.length)} lines)`}
        </button>
      )}
    </div>
  );
}
