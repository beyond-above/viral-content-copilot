import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, User, Bot, Loader2, Sparkles, Film } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  onTriggerProject: (topic: string) => void;
  onJobStarted?: (jobId: string, topic: string) => void;
}

const Chat: React.FC<ChatProps> = ({ onTriggerProject, onJobStarted }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your Viral Content Copilot. Ready to create some trending content? What's the main keyword or topic you'd like to explore today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  const [step, setStep] = useState<string>('START');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize and retrieve dynamic sessionId using sessionStorage
  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    let savedSessionId = sessionStorage.getItem('viral_copilot_session_id');
    if (!savedSessionId) {
      savedSessionId = `session_${Date.now()}`;
      sessionStorage.setItem('viral_copilot_session_id', savedSessionId);
    }
    sessionIdRef.current = savedSessionId;
  }
  const sessionId = sessionIdRef.current;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, choices]); // Scroll on new messages or new choices!

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setChoices([]); // Clear previous choices on send
    setStep('START');

    try {
      const response = await axios.post('/chat', {
        message: userMessage,
        user_id: 'test_user',
        session_id: sessionId
      });

      const data = response.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      
      if (data.choices && data.choices.length > 0) {
        setChoices(data.choices);
        setStep(data.step);
      } else {
        setChoices([]);
        setStep('START');
      }

      // If the agent automatically started a background job via the send_to_mcp tool
      if (data && data.job_id) {
        onJobStarted?.(data.job_id, cleanAndTrimPrompt(data.message));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoiceSelect = async (selectedChoice: string) => {
    if (isLoading) return;
    
    // Clear choices immediately to prevent double submission
    setChoices([]);
    setStep('START');
    
    setMessages((prev) => [...prev, { role: 'user', content: `Selected topic: "${selectedChoice}"` }]);
    setIsLoading(true);

    try {
      const response = await axios.post('/chat', {
        message: selectedChoice,
        user_id: 'test_user',
        session_id: sessionId
      });

      const data = response.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      
      if (data.choices && data.choices.length > 0) {
        setChoices(data.choices);
        setStep(data.step);
      }
      
      if (data.job_id) {
        onJobStarted?.(data.job_id, cleanAndTrimPrompt(data.message));
      }
    } catch (error) {
      console.error('Error sending choice:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your choice.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const cleanAndTrimPrompt = (prompt: string): string => {
    const raw = prompt.replace('✨ **GENERATED PROMPT:**', '').trim();
    
    // 1. Try to extract the actual prompt from quotes if present
    const quotedMatches = raw.match(/"([^"]+)"/g);
    let cleaned = '';
    if (quotedMatches && quotedMatches.length > 0) {
      // Pick the longest match, removing the wrapping quotes
      const candidates = quotedMatches.map(m => m.slice(1, -1));
      cleaned = candidates.reduce((a, b) => a.length > b.length ? a : b, '');
    } else {
      cleaned = raw;
    }

    // 2. Strip search progress headers, system markers, and introductory phrases
    cleaned = cleaned.replace(/🔍\s*\*\*PROGRESS:\*\*.*?(?=(?:🔍\s*\*\*PROGRESS:\*\*|✅\s*\*\*STATUS:\*\*|"|$))/gi, '');
    cleaned = cleaned.replace(/✅\s*\*\*STATUS:\*\*.*/gi, '');
    cleaned = cleaned.replace(/(?:here is the prompt for your content|here is the prompt|prompt:)/gi, '');

    // 3. Strip hashtags (e.g. #TNPowervCut)
    cleaned = cleaned.replace(/#[a-zA-Z0-9_]+/g, '');

    // 4. Clean up excess whitespace and quotes
    cleaned = cleaned.trim().replace(/"/g, '');
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1);
    }

    // 5. Word trimming to max 40 words
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 40) {
      cleaned = words.slice(0, 40).join(' ') + '...';
    } else {
      cleaned = words.join(' ');
    }

    return cleaned.trim();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
        {messages.map((msg, idx) => {
          const isPromptMessage = msg.role === 'assistant' && msg.content.includes('✨ **GENERATED PROMPT:**');
          
          return (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-white shadow-sm border border-gray-100'}`}>
                  {msg.role === 'user' ? <User size={20} className="text-white" /> : <Bot size={20} className="text-indigo-600" />}
                </div>
                <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white shadow-sm border border-gray-100 rounded-tl-none text-gray-800'}`}>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  
                  {/* Custom Action Card for Prompts */}
                  {isPromptMessage && (
                    <div className="mt-4 p-4 bg-emerald-50/70 border border-emerald-100/50 rounded-xl flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                        <Sparkles size={14} className="animate-pulse text-emerald-600" />
                        Generation Automatically Triggered!
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed italic">
                        "{cleanAndTrimPrompt(msg.content)}"
                      </p>
                      <div className="text-xs font-medium text-emerald-700 flex items-center gap-2 bg-emerald-100/40 p-3 rounded-lg border border-emerald-200/30">
                        <Film size={14} className="text-emerald-600 shrink-0" />
                        <span>Reel compiling in background. Check the side panel for real-time progress and video preview.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {/* Interactive Choices Rendering */}
        {choices && choices.length > 0 && (
          <div className="flex flex-col gap-3 p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl animate-fade-in">
            <p className="text-xs font-bold text-indigo-900 tracking-wide uppercase flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-600 animate-pulse" />
              Pick a trending angle to develop:
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => handleChoiceSelect(choice)}
                  disabled={isLoading}
                  className="p-3 bg-white hover:bg-indigo-600 hover:text-white border border-gray-200 rounded-xl text-left text-xs font-semibold text-gray-700 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md flex flex-col justify-between gap-1 disabled:opacity-50 disabled:cursor-not-allowed group duration-200"
                >
                  <span className="text-[10px] text-gray-400 group-hover:text-indigo-200 font-bold uppercase tracking-wider">
                    Option {i + 1}
                  </span>
                  <span className="leading-snug">{choice}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 rounded-tl-none">
              <Loader2 className="animate-spin text-indigo-600" size={20} />
              <span className="text-sm text-gray-500">Generating viral magic...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full p-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Powered by Gemini 2.0 & Google ADK
        </p>
      </div>
    </div>
  );
};

export default Chat;
