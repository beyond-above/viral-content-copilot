import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Chat from './components/Chat';
import VideoPreview from './components/VideoPreview';
import { Sparkles, TrendingUp, Zap } from 'lucide-react';

// Configure Axios to point to the secure Google Cloud Run backend if defined
const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
if (backendUrl) {
  axios.defaults.baseURL = backendUrl;
}

const App: React.FC = () => {
  // Shared Active Project State
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'>('idle');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [stepMessage, setStepMessage] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [editList, setEditList] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const pollingIntervalRef = useRef<any | null>(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const parseErrorString = (err: any): string => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
      return err.message || err.code || JSON.stringify(err);
    }
    return String(err);
  };

  // Poll video status every 3.5 seconds
  const startPolling = (targetJobId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await axios.get(`/api/get_auto_video_status?job_id=${targetJobId}`);
        const data = response.data;

        if (data.error) {
          setError(parseErrorString(data.error));
          setStatus('failed');
          setStepMessage(data.message || 'Status check failed');
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          return;
        }

        const currentStatus = data.status || 'running';
        setStatus(currentStatus);
        setCurrentStep(data.current_step || '');
        setProgressPct(data.progress_pct || 0);
        setStepMessage(data.step_message || '');
        setWarnings(data.warnings || []);

        if (currentStatus === 'completed') {
          setImageUrls(data.image_urls || []);
          setAudioUrl(data.audio_url || null);
          setAudioDuration(data.audio_duration_seconds || 0);
          setEditList(data.edit_list || null);
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        } else if (currentStatus === 'failed') {
          setError(parseErrorString(data.error) || 'Pipeline aborted');
          setStepMessage(data.step_message || 'Job failed');
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        } else if (currentStatus === 'cancelled') {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        }
      } catch (err: any) {
        console.error('Error polling status:', err);
      }
    }, 3500);
  };

  // Direct Generation trigger
  const handleDirectStart = async (selectedTopic: string) => {
    // Reset state parameters
    setJobId(null);
    setStatus('queued');
    setCurrentStep('queued');
    setProgressPct(0);
    setStepMessage('Queueing job...');
    setTopic(selectedTopic);
    setImageUrls([]);
    setAudioUrl(null);
    setAudioDuration(0);
    setEditList(null);
    setError(null);
    setWarnings([]);

    try {
      const response = await axios.post('/api/create_auto_video', {
        topic: selectedTopic,
        overrides: {
          aspect_ratio: '9:16'
        }
      });
      const data = response.data;

      if (data.error) {
        setError(parseErrorString(data.error));
        setStatus('failed');
        setStepMessage(data.message || 'Could not initiate generation job');
        return;
      }

      if (data.job_id) {
        setJobId(data.job_id);
        setStatus('running');
        startPolling(data.job_id);
      } else {
        setError('No job ID returned');
        setStatus('failed');
      }
    } catch (err: any) {
      console.error('Error starting video project:', err);
      setError(parseErrorString(err));
      setStatus('failed');
    }
  };
  
  // Handler for automatically triggered background jobs (by the agent)
  const handleJobStarted = (autoJobId: string, parsedTopic: string) => {
    setJobId(autoJobId);
    setStatus('running');
    setCurrentStep('running');
    setProgressPct(0);
    setStepMessage('Running agent-initiated video pipeline...');
    setTopic(parsedTopic);
    setImageUrls([]);
    setAudioUrl(null);
    setAudioDuration(0);
    setEditList(null);
    setError(null);
    setWarnings([]);
    startPolling(autoJobId);
  };

  // Cancel trigger
  const handleCancel = async () => {
    if (!jobId) return;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setStatus('cancelled');
    setStepMessage('Canceling process...');

    try {
      await axios.post('/api/cancel_auto_video', { job_id: jobId });
    } catch (err) {
      console.error('Error canceling project:', err);
    }
  };

  // Start Over trigger
  const handleRetry = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    setJobId(null);
    setStatus('idle');
    setCurrentStep('');
    setProgressPct(0);
    setStepMessage('');
    setTopic('');
    setImageUrls([]);
    setAudioUrl(null);
    setAudioDuration(0);
    setEditList(null);
    setError(null);
    setWarnings([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col font-sans">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-gray-100/50 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
            <Zap className="text-white" size={24} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-none">
              VIRAL <span className="text-indigo-600">COPILOT</span>
            </h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
              Content Engine v1.0
            </p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-100 shadow-sm">
            <TrendingUp size={16} className="text-green-500" />
            <span className="text-xs font-semibold text-gray-600">Trending Now</span>
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all text-sm font-medium shadow-lg shadow-gray-200">
            <Sparkles size={16} />
            Upgrade Pro
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col xl:flex-row p-4 md:p-8 gap-8 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Chat Interface */}
        <div className="flex-1 min-h-[600px] flex flex-col">
          <Chat onTriggerProject={handleDirectStart} onJobStarted={handleJobStarted} />
        </div>

        {/* Right Column: Video Preview and Assets */}
        <div className="w-full xl:w-[480px] flex-shrink-0 flex flex-col">
          <VideoPreview
            jobId={jobId}
            status={status}
            currentStep={currentStep}
            progressPct={progressPct}
            stepMessage={stepMessage}
            topic={topic}
            imageUrls={imageUrls}
            audioUrl={audioUrl}
            audioDuration={audioDuration}
            editList={editList}
            error={error}
            warnings={warnings}
            onCancel={handleCancel}
            onRetry={handleRetry}
            onDirectStart={handleDirectStart}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-8 border-t border-gray-100 bg-white/50 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-gray-400 font-medium">
          &copy; 2026 Viral Content Factory. Built with Google Agents SDK.
        </p>
        <div className="flex items-center gap-6">
          <a href="#" className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors">Documentation</a>
          <a href="#" className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors">Privacy</a>
          <a href="#" className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors">Support</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
