import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types/multiplayer';
import { socketService } from '../services/socket';
import { MessageSquare, Send, X, Smile } from 'lucide-react';
import { cn } from '../lib/utils';

interface MultiplayerChatProps {
  chatMessages: ChatMessage[];
  myActor?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

const QUICK_EMOJIS = ['👏', '😱', '🔥', '👑', '💩', '革命！', '参りました', '都落ち！'];

export const MultiplayerChat: React.FC<MultiplayerChatProps> = ({
  chatMessages,
  myActor,
  isOpen = false,
  onClose
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isOpen]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    socketService.sendChat(inputText);
    setInputText('');
  };

  const handleQuickSend = (text: string) => {
    socketService.sendChat(text);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 md:w-96 bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col h-96 overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-black/60 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <MessageSquare size={16} />
          <span>ルームチャット ({chatMessages.length})</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar text-xs">
        {chatMessages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="text-center my-1.5">
                <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-full text-[10px] tracking-wider">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMe = msg.senderActor === myActor;

          return (
            <div 
              key={msg.id} 
              className={cn("flex flex-col space-y-1", isMe ? "items-end" : "items-start")}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span>{msg.senderName}</span>
                <span>•</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div 
                className={cn(
                  "px-3 py-1.5 rounded-2xl max-w-[85%] break-words",
                  isMe 
                    ? "bg-amber-600 text-black font-medium rounded-tr-none" 
                    : "bg-slate-800 text-slate-200 border border-white/10 rounded-tl-none"
                )}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emojis */}
      <div className="px-2 py-1.5 bg-black/30 border-t border-white/5 flex gap-1 overflow-x-auto no-scrollbar">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleQuickSend(emoji)}
            className="px-2 py-1 bg-white/5 hover:bg-amber-500/20 hover:text-amber-300 rounded text-[11px] whitespace-nowrap transition-colors shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSend} className="p-2 bg-black/60 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="メッセージを入力..."
          maxLength={100}
          className="flex-1 bg-slate-800/80 border border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-black rounded-full font-bold transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
