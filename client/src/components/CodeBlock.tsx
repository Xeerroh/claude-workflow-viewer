import { useState, useCallback, useMemo } from 'react';
import './CodeBlock.css';

interface CodeBlockProps {
  content: string;
  language?: string;
  showLineNumbers?: boolean;
  maxLines?: number;
  title?: string;
  variant?: 'default' | 'success' | 'error' | 'command';
}

export function CodeBlock({
  content,
  language,
  showLineNumbers = true,
  maxLines = 30,
  title,
  variant = 'default'
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  const isLong = lines.length > maxLines;
  const displayLines = expanded || !isLong ? lines : lines.slice(0, maxLines);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  const detectedLanguage = language || detectLanguage(content);

  return (
    <div className={`code-block variant-${variant}`}>
      {title && (
        <div className="code-block-header">
          <span className="code-block-title">{title}</span>
          <div className="code-block-actions">
            {detectedLanguage && (
              <span className="code-block-lang">{detectedLanguage}</span>
            )}
            <button className="code-block-copy" onClick={handleCopy} title="Copy to clipboard">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
      {!title && (
        <div className="code-block-toolbar">
          {detectedLanguage && (
            <span className="code-block-lang">{detectedLanguage}</span>
          )}
          <button className="code-block-copy" onClick={handleCopy} title="Copy to clipboard">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div className="code-block-content">
        {showLineNumbers && (
          <div className="code-line-numbers">
            {displayLines.map((_, i) => (
              <span key={i} className="code-line-number">{i + 1}</span>
            ))}
          </div>
        )}
        <pre className="code-lines">
          {displayLines.map((line, i) => (
            <div key={i} className="code-line">
              {highlightLine(line, detectedLanguage)}
            </div>
          ))}
        </pre>
      </div>
      {isLong && (
        <button className="code-block-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? `Show less` : `Show ${lines.length - maxLines} more lines`}
        </button>
      )}
    </div>
  );
}

function detectLanguage(content: string): string | null {
  // Check for common patterns
  if (/^[\s]*[{[]/.test(content) && /[}\]][\s]*$/.test(content)) {
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  if (/^\s*(import|export|const|let|var|function|class|interface|type)\s/.test(content)) {
    return content.includes(': ') || content.includes('<') ? 'typescript' : 'javascript';
  }
  if (/^\s*(def |class |import |from |if __name__)/.test(content)) return 'python';
  if (/^\s*(package |func |type |import \()/.test(content)) return 'go';
  if (/^\s*(fn |let |use |impl |struct |enum |pub )/.test(content)) return 'rust';
  if (/^\s*#include|int main\(/.test(content)) return 'c';
  if (/^\s*(<\?xml|<html|<div|<span|<p>)/i.test(content)) return 'html';
  if (/^\s*(\.|#|@media|@import)/m.test(content) && /[{;]/.test(content)) return 'css';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(content)) return 'sql';
  if (/^\s*(\$|#!|echo |cd |ls |mkdir |rm |git |npm |yarn |pnpm )/.test(content)) return 'shell';
  if (content.includes('\\') && (content.includes('C:') || content.includes('D:'))) return 'path';
  return null;
}

function highlightLine(line: string, language: string | null): React.ReactNode {
  if (!language) return line;

  switch (language) {
    case 'json':
      return highlightJson(line);
    case 'typescript':
    case 'javascript':
      return highlightJS(line);
    case 'shell':
      return highlightShell(line);
    case 'path':
      return highlightPath(line);
    default:
      return line;
  }
}

function highlightJson(line: string): React.ReactNode {
  // Simple JSON highlighting
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  // Match strings, numbers, booleans, null
  const regex = /("(?:[^"\\]|\\.)*")|(\b\d+\.?\d*\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // Check if it's a key (followed by colon)
      const isKey = remaining.slice(match.index + match[1].length).match(/^\s*:/);
      parts.push(
        <span key={key++} className={isKey ? 'hl-key' : 'hl-string'}>{match[1]}</span>
      );
    } else if (match[2]) {
      parts.push(<span key={key++} className="hl-number">{match[2]}</span>);
    } else if (match[3]) {
      parts.push(<span key={key++} className="hl-boolean">{match[3]}</span>);
    } else if (match[4]) {
      parts.push(<span key={key++} className="hl-null">{match[4]}</span>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : line;
}

function highlightJS(line: string): React.ReactNode {
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|export|from|async|await|new|this|extends|implements)\b/g;
  const strings = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
  const comments = /\/\/.*/g;
  const numbers = /\b\d+\.?\d*\b/g;

  // Simple single-pass highlighting
  let result = line;

  // Replace comments first
  result = result.replace(comments, '<span class="hl-comment">$&</span>');

  // Replace strings
  result = result.replace(strings, '<span class="hl-string">$&</span>');

  // Replace keywords (only if not inside a span)
  result = result.replace(keywords, (match, _, offset) => {
    // Check if we're inside a span
    const before = result.slice(0, offset);
    const openSpans = (before.match(/<span/g) || []).length;
    const closeSpans = (before.match(/<\/span>/g) || []).length;
    if (openSpans > closeSpans) return match;
    return `<span class="hl-keyword">${match}</span>`;
  });

  // Use dangerouslySetInnerHTML for highlighted content
  return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

function highlightShell(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Highlight command at start
  const cmdMatch = line.match(/^(\s*)(\$\s*)?(\w+)/);
  if (cmdMatch) {
    parts.push(<span key={key++}>{cmdMatch[1]}</span>);
    if (cmdMatch[2]) {
      parts.push(<span key={key++} className="hl-prompt">{cmdMatch[2]}</span>);
    }
    parts.push(<span key={key++} className="hl-command">{cmdMatch[3]}</span>);

    const rest = line.slice(cmdMatch[0].length);
    // Highlight flags
    const flagged = rest.replace(/(\s)(--?\w+)/g, '$1<span class="hl-flag">$2</span>');
    // Highlight strings
    const withStrings = flagged.replace(/(['"])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="hl-string">$&</span>');
    parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: withStrings }} />);
  } else {
    return line;
  }

  return parts;
}

function highlightPath(line: string): React.ReactNode {
  // Highlight Windows/Unix paths
  const pathRegex = /([A-Za-z]:[\\\/][^\s]*|\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pathRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{line.slice(lastIndex, match.index)}</span>);
    }
    parts.push(<span key={key++} className="hl-path">{match[0]}</span>);
    lastIndex = pathRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(<span key={key++}>{line.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : line;
}

// Simple component for file list display
interface FileListProps {
  files: string[];
  title?: string;
}

export function FileList({ files, title }: FileListProps) {
  const [showAll, setShowAll] = useState(false);
  const maxVisible = 10;
  const displayFiles = showAll ? files : files.slice(0, maxVisible);

  return (
    <div className="file-list">
      {title && <div className="file-list-title">{title}</div>}
      <div className="file-list-items">
        {displayFiles.map((file, i) => (
          <div key={i} className="file-list-item">
            <span className="file-icon">{getFileIcon(file)}</span>
            <span className="file-path">{file}</span>
          </div>
        ))}
      </div>
      {files.length > maxVisible && (
        <button className="file-list-toggle" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show less' : `Show ${files.length - maxVisible} more files`}
        </button>
      )}
    </div>
  );
}

function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '📘';
    case 'js':
    case 'jsx':
      return '📒';
    case 'css':
    case 'scss':
    case 'sass':
      return '🎨';
    case 'html':
      return '🌐';
    case 'json':
      return '📋';
    case 'md':
      return '📝';
    case 'py':
      return '🐍';
    case 'go':
      return '🔵';
    case 'rs':
      return '🦀';
    case 'java':
      return '☕';
    default:
      return '📄';
  }
}
