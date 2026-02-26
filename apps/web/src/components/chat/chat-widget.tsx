import { useState, useRef, useEffect, useCallback } from 'react';
import { useMatches, useNavigate } from '@tanstack/react-router';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
}

interface PageContext {
  path: string;
  accountId?: string;
  pageTitle?: string;
}

// Each animation defines the "closed" and "open" CSS transform/style
const ANIMATIONS = [
  {
    name: 'scale-bounce',
    origin: 'bottom right',
    closed: { transform: 'scale(0)', opacity: 0 },
    open: { transform: 'scale(1)', opacity: 1 },
    timing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    duration: 350,
  },
  {
    name: 'slide-up',
    origin: 'bottom right',
    closed: { transform: 'translateY(120%)', opacity: 0 },
    open: { transform: 'translateY(0)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 300,
  },
  {
    name: 'slide-right',
    origin: 'center right',
    closed: { transform: 'translateX(120%)', opacity: 0 },
    open: { transform: 'translateX(0)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 300,
  },
  {
    name: 'flip',
    origin: 'bottom right',
    closed: { transform: 'perspective(800px) rotateY(90deg)', opacity: 0 },
    open: { transform: 'perspective(800px) rotateY(0deg)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 400,
  },
  {
    name: 'spin-in',
    origin: 'bottom right',
    closed: { transform: 'scale(0) rotate(180deg)', opacity: 0 },
    open: { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    timing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    duration: 400,
  },
  {
    name: 'drop',
    origin: 'top right',
    closed: { transform: 'translateY(-120%) scale(0.8)', opacity: 0 },
    open: { transform: 'translateY(0) scale(1)', opacity: 1 },
    timing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    duration: 400,
  },
  {
    name: 'unfold',
    origin: 'bottom right',
    closed: { transform: 'scaleY(0.01) scaleX(0.4)', opacity: 0 },
    open: { transform: 'scaleY(1) scaleX(1)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 350,
  },
  {
    name: 'zoom-spin',
    origin: 'center center',
    closed: { transform: 'scale(0.1) rotate(-270deg)', opacity: 0 },
    open: { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    timing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    duration: 500,
  },
  {
    name: 'swing-down',
    origin: 'top right',
    closed: { transform: 'perspective(600px) rotateX(-90deg)', opacity: 0 },
    open: { transform: 'perspective(600px) rotateX(0deg)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 400,
  },
  {
    name: 'diagonal',
    origin: 'bottom right',
    closed: { transform: 'translate(80%, 80%) scale(0.3) rotate(15deg)', opacity: 0 },
    open: { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    timing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    duration: 350,
  },
] as const;

function pickRandomAnimation() {
  return ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const historyIndex = useRef(-1);
  const draftInput = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animation state
  const [currentAnim, setCurrentAnim] = useState<(typeof ANIMATIONS)[number]>(ANIMATIONS[0]);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  const toggleChat = useCallback(() => {
    if (isOpen) {
      // Closing — use current animation for exit
      setAnimating(true);
      setVisible(false);
      setTimeout(() => {
        setIsOpen(false);
        setAnimating(false);
      }, currentAnim.duration);
    } else {
      // Opening — pick a new random animation
      const anim = pickRandomAnimation();
      setCurrentAnim(anim);
      setIsOpen(true);
      setAnimating(true);
      // Small delay so the closed state renders first, then transition to open
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
          setTimeout(() => setAnimating(false), anim.duration);
        });
      });
    }
  }, [isOpen, currentAnim.duration]);

  // Resize state
  const [panelSize, setPanelSize] = useState({ width: 400, height: 500 });
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const matches = useMatches();
  const navigate = useNavigate();

  // Get page context from current route
  const getPageContext = useCallback((): PageContext => {
    const lastMatch = matches[matches.length - 1];
    const path = lastMatch?.pathname ?? '/';
    const params = lastMatch?.params as Record<string, string> | undefined;
    const accountId = params?.accountId;

    const routeTitles: Record<string, string> = {
      '/': 'Home',
      '/portfolio': 'Portfolio',
      '/accounts': 'Accounts',
      '/search': 'Search',
      '/settings': 'Settings',
    };

    const pageTitle = accountId
      ? 'Account Detail'
      : routeTitles[path] ?? 'Siesta';

    return { path, accountId, pageTitle };
  }, [matches]);

  // Load chat history from Redis on mount
  useEffect(() => {
    fetch('/api/chat/history', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
          // Rebuild input history from loaded user messages
          const userMsgs = data.messages
            .filter((m: ChatMessage) => m.role === 'user')
            .map((m: ChatMessage) => m.content);
          setInputHistory(userMsgs);
        }
      })
      .catch(() => {});
  }, []);

  // Save chat history to Redis whenever messages change (debounced)
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (messages.length === 0) return;
    // Don't save while streaming
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.isStreaming) return;

    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const toSave = messages.map((m) => ({ role: m.role, content: m.content }));
      fetch('/api/chat/history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: toSave }),
      }).catch(() => {});
    }, 500);
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: panelSize.width,
        height: panelSize.height,
      };

      const handleResizeMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const dx = resizeStart.current.x - e.clientX;
        const dy = resizeStart.current.y - e.clientY;
        setPanelSize({
          width: Math.min(800, Math.max(320, resizeStart.current.width + dx)),
          height: Math.min(
            window.innerHeight * 0.8,
            Math.max(300, resizeStart.current.height + dy),
          ),
        });
      };

      const handleResizeEnd = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };

      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    },
    [panelSize],
  );

  // Send message
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setInputHistory((prev) => [...prev, trimmed]);
    historyIndex.current = -1;
    draftInput.current = '';
    setIsLoading(true);
    setActiveTools([]);

    // Add placeholder assistant message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
    };
    setMessages([...updatedMessages, assistantMessage]);

    try {
      const pageContext = getPageContext();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          pageContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      const tools: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'token') {
              accumulatedContent += event.content;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    isStreaming: true,
                    toolCalls: tools.length > 0 ? [...tools] : undefined,
                  };
                }
                return updated;
              });
            } else if (event.type === 'tool_call') {
              tools.push(event.name);
              setActiveTools((prev) => [...prev, event.name]);
            } else if (event.type === 'done') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    isStreaming: false,
                    toolCalls: tools.length > 0 ? [...tools] : undefined,
                  };
                }
                return updated;
              });
            } else if (event.type === 'error') {
              accumulatedContent += `\n\n_Error: ${event.content}_`;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    isStreaming: false,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content:
              'Sorry, something went wrong. Please try again.',
            isStreaming: false,
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setActiveTools([]);
    }
  }, [input, isLoading, messages, getPageContext]);

  const clearChat = () => {
    setMessages([]);
    setInput('');
    setInputHistory([]);
    historyIndex.current = -1;
    setActiveTools([]);
    fetch('/api/chat/history', {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});
  };

  // Render markdown-like content with clickable in-app links
  const renderContent = (text: string) => {
    // Split text into segments: markdown links and regular text
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: Array<{ type: 'text' | 'link'; content: string; href?: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'link', content: match[1], href: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.map((part, i) => {
      if (part.type === 'link' && part.href) {
        const isInternal = part.href.startsWith('/');
        if (isInternal) {
          return (
            <button
              key={i}
              onClick={() => navigate({ to: part.href! })}
              className="text-[#6b26d9] dark:text-[#a67cef] underline hover:opacity-80 transition-opacity"
            >
              {part.content}
            </button>
          );
        }
        return (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b26d9] dark:text-[#a67cef] underline hover:opacity-80 transition-opacity"
          >
            {part.content}
          </a>
        );
      }

      // Basic formatting: bold, italic, inline code, line breaks, bullets
      return (
        <span key={i}>
          {part.content.split('\n').map((line, li, arr) => (
            <span key={li}>
              {renderFormattedLine(line)}
              {li < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    });
  };

  const renderFormattedLine = (text: string) => {
    // Bullet points
    const bulletMatch = text.match(/^(\s*)-\s(.+)/);
    if (bulletMatch) {
      return (
        <span className="flex gap-1.5">
          <span className="shrink-0 mt-[2px]">•</span>
          <span>{renderInline(bulletMatch[2])}</span>
        </span>
      );
    }
    return renderInline(text);
  };

  const renderInline = (text: string): React.ReactNode => {
    // Process bold (**text**), italic (*text*), and code (`text`)
    const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let inlineMatch;

    while ((inlineMatch = inlineRegex.exec(text)) !== null) {
      if (inlineMatch.index > lastIdx) {
        parts.push(text.slice(lastIdx, inlineMatch.index));
      }
      if (inlineMatch[2]) {
        parts.push(<strong key={inlineMatch.index}>{inlineMatch[2]}</strong>);
      } else if (inlineMatch[3]) {
        parts.push(<em key={inlineMatch.index}>{inlineMatch[3]}</em>);
      } else if (inlineMatch[4]) {
        parts.push(
          <code
            key={inlineMatch.index}
            className="px-1 py-0.5 rounded text-xs bg-[#e9e8ed] dark:bg-[#25232f] font-mono"
          >
            {inlineMatch[4]}
          </code>,
        );
      }
      lastIdx = inlineMatch.index + inlineMatch[0].length;
    }
    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <>
      {/* Chat Panel */}
      {(isOpen || animating) && (
      <div
        ref={panelRef}
        style={{
          width: panelSize.width,
          height: panelSize.height,
          transformOrigin: currentAnim.origin,
          transitionProperty: 'transform, opacity',
          transitionDuration: `${currentAnim.duration}ms`,
          transitionTimingFunction: currentAnim.timing,
          ...(visible ? currentAnim.open : currentAnim.closed),
        }}
        className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] shadow-2xl overflow-hidden"
      >
          {/* Resize handle — top-left corner */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 left-0 w-5 h-5 cursor-nwse-resize z-10 flex items-center justify-center group"
            title="Drag to resize"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="text-[#b0adc0] dark:text-[#4a4658] group-hover:text-[#6b26d9] transition-colors rotate-90"
            >
              <line x1="0" y1="10" x2="10" y2="0" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="6" x2="6" y2="0" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="2" x2="2" y2="0" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12]">
            <div className="flex items-center gap-2">
              <img src="/senor-bot.png" alt="Señor Bot" className="w-6 h-6 rounded-full object-cover" />
              <span className="font-semibold text-sm text-[#191726] dark:text-[#f2f2f2]">
                Señor Bot
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
                title="Clear chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
              <button
                onClick={toggleChat}
                className="p-1.5 rounded-lg text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-[#6b677e] dark:text-[#858198]">
                <div className="w-10 h-10 rounded-full bg-[#6b26d9]/10 dark:bg-[#6b26d9]/20 flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b26d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                  Hi! I'm Señor Bot
                </p>
                <p className="text-xs mt-1">
                  Ask me about your accounts, interactions, or portfolio.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#6b26d9] text-white'
                      : 'bg-[#f0eff4] dark:bg-[#1e1c28] text-[#191726] dark:text-[#f2f2f2]'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="space-y-0.5">
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {msg.toolCalls.map((tool, ti) => (
                            <span
                              key={ti}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#6b26d9]/10 dark:bg-[#6b26d9]/20 text-[#6b26d9] dark:text-[#a67cef]"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                              </svg>
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                      {msg.content ? (
                        renderContent(msg.content)
                      ) : msg.isStreaming ? (
                        <span className="inline-flex items-center gap-1 text-[#6b677e] dark:text-[#858198]">
                          <span className="flex gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6b26d9] animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6b26d9] animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6b26d9] animate-bounce [animation-delay:300ms]" />
                          </span>
                          {activeTools.length > 0 && (
                            <span className="text-xs ml-1">
                              Using {activeTools[activeTools.length - 1]}...
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-[#dedde4] dark:border-[#2a2734]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  } else if (e.key === 'ArrowUp' && inputHistory.length > 0) {
                    e.preventDefault();
                    if (historyIndex.current === -1) {
                      draftInput.current = input;
                    }
                    const newIndex = historyIndex.current === -1
                      ? inputHistory.length - 1
                      : Math.max(0, historyIndex.current - 1);
                    historyIndex.current = newIndex;
                    setInput(inputHistory[newIndex]);
                  } else if (e.key === 'ArrowDown' && historyIndex.current !== -1) {
                    e.preventDefault();
                    if (historyIndex.current >= inputHistory.length - 1) {
                      historyIndex.current = -1;
                      setInput(draftInput.current);
                    } else {
                      historyIndex.current += 1;
                      setInput(inputHistory[historyIndex.current]);
                    }
                  }
                }}
                placeholder="Ask about your accounts..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 rounded-xl text-sm bg-[#f0eff4] dark:bg-[#1e1c28] border border-[#dedde4] dark:border-[#2a2734] text-[#191726] dark:text-[#f2f2f2] placeholder-[#b0adc0] dark:placeholder-[#4a4658] outline-none focus:border-[#6b26d9] dark:focus:border-[#6b26d9] transition-colors disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="p-2 rounded-xl bg-[#6b26d9] text-white hover:bg-[#5a1ec0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
      </div>
      )}

      {/* Floating toggle button — always visible */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={toggleChat}
          className="w-[54px] h-[54px] rounded-full shadow-lg transition-all hover:scale-105 flex items-center justify-center overflow-hidden border-2 border-[#6b26d9] dark:border-[#8249df]"
          title={isOpen ? 'Close Señor Bot' : 'Open Señor Bot'}
        >
          <img src="/senor-bot.png" alt="Señor Bot" className="w-full h-full object-cover scale-[2.0]" />
        </button>
        {!isOpen && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white dark:border-[#0d0c12] animate-pulse pointer-events-none" />
        )}
      </div>
    </>
  );
}
