import { useState, useCallback } from 'react';
import './JsonTree.css';

interface JsonTreeProps {
  data: unknown;
  initialExpanded?: boolean;
  maxDepth?: number;
}

export function JsonTree({ data, initialExpanded = true, maxDepth = 3 }: JsonTreeProps) {
  return (
    <div className="json-tree">
      <JsonNode value={data} depth={0} initialExpanded={initialExpanded} maxDepth={maxDepth} />
    </div>
  );
}

interface JsonNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
  initialExpanded: boolean;
  maxDepth: number;
  isLast?: boolean;
}

function JsonNode({ keyName, value, depth, initialExpanded, maxDepth, isLast = true }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < maxDepth ? initialExpanded : false);

  const toggleExpand = useCallback(() => setExpanded(e => !e), []);

  const valueType = getValueType(value);
  const isExpandable = valueType === 'object' || valueType === 'array';
  const isEmpty = isExpandable && (
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
  );

  const renderKey = () => {
    if (keyName === undefined) return null;
    return <span className="json-key">"{keyName}"</span>;
  };

  const renderPrimitive = () => {
    switch (valueType) {
      case 'string':
        const strVal = value as string;
        // Check if it's a long string
        if (strVal.length > 100) {
          return (
            <span className="json-value json-string json-long-string" title={strVal}>
              "{truncateString(strVal, 100)}"
            </span>
          );
        }
        // Check if it looks like a file path
        if (isFilePath(strVal)) {
          return <span className="json-value json-path">"{strVal}"</span>;
        }
        return <span className="json-value json-string">"{escapeString(strVal)}"</span>;
      case 'number':
        return <span className="json-value json-number">{String(value)}</span>;
      case 'boolean':
        return <span className="json-value json-boolean">{String(value)}</span>;
      case 'null':
        return <span className="json-value json-null">null</span>;
      default:
        return <span className="json-value">{String(value)}</span>;
    }
  };

  if (!isExpandable) {
    return (
      <div className="json-line">
        {renderKey()}
        {keyName !== undefined && <span className="json-colon">: </span>}
        {renderPrimitive()}
        {!isLast && <span className="json-comma">,</span>}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? (value as unknown[]).map((v, i) => [i, v] as const) : Object.entries(value as object);
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';

  if (isEmpty) {
    return (
      <div className="json-line">
        {renderKey()}
        {keyName !== undefined && <span className="json-colon">: </span>}
        <span className="json-bracket">{bracketOpen}{bracketClose}</span>
        {!isLast && <span className="json-comma">,</span>}
      </div>
    );
  }

  return (
    <div className="json-node">
      <div className="json-line json-expandable" onClick={toggleExpand}>
        <span className={`json-toggle ${expanded ? 'expanded' : ''}`}>
          {expanded ? '▼' : '▶'}
        </span>
        {renderKey()}
        {keyName !== undefined && <span className="json-colon">: </span>}
        <span className="json-bracket">{bracketOpen}</span>
        {!expanded && (
          <>
            <span className="json-preview">
              {isArray ? `${entries.length} items` : `${entries.length} keys`}
            </span>
            <span className="json-bracket">{bracketClose}</span>
          </>
        )}
        {!expanded && !isLast && <span className="json-comma">,</span>}
      </div>
      {expanded && (
        <>
          <div className="json-children">
            {entries.map(([key, val], index) => (
              <JsonNode
                key={String(key)}
                keyName={isArray ? undefined : String(key)}
                value={val}
                depth={depth + 1}
                initialExpanded={initialExpanded}
                maxDepth={maxDepth}
                isLast={index === entries.length - 1}
              />
            ))}
          </div>
          <div className="json-line">
            <span className="json-bracket">{bracketClose}</span>
            {!isLast && <span className="json-comma">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return escapeString(str);
  return escapeString(str.slice(0, maxLength)) + '...';
}

function isFilePath(str: string): boolean {
  return /^[A-Za-z]:[\\\/]|^[\/~]/.test(str) || /\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|cpp|c|h)$/i.test(str);
}
