import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Wand2,
  Music,
  Mic,
  Download,
  Play,
  Pause,
  Plus,
  Trash2,
  Sparkles,
  Settings,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  FileText,
  Volume2,
  Check,
  Film,
  Palette,
  RefreshCw,
} from 'lucide-react';
import { useVideoStore, type VideoScene } from './store/videoStore';
import { generateImage, generateScript, parseScriptToScenes, musicTracks } from './services/aiServices';
import { renderVideo, speakText } from './services/videoRenderer';
import { cn } from './utils/cn';

const videoStyles = [
  { id: 'cinematic', name: 'Cinematic', icon: '🎬', desc: 'Movie-like dramatic scenes' },
  { id: 'anime', name: 'Anime', icon: '🎨', desc: 'Japanese animation style' },
  { id: 'realistic', name: 'Realistic', icon: '📷', desc: 'Photorealistic imagery' },
  { id: 'cartoon', name: 'Cartoon', icon: '🎪', desc: 'Fun animated style' },
  { id: 'scifi', name: 'Sci-Fi', icon: '🚀', desc: 'Futuristic cyberpunk' },
  { id: 'fantasy', name: 'Fantasy', icon: '🧙', desc: 'Magical and ethereal' },
  { id: 'minimalist', name: 'Minimalist', icon: '◻️', desc: 'Clean and simple' },
  { id: 'watercolor', name: 'Watercolor', icon: '🖼️', desc: 'Artistic painting style' },
];

const scriptTypes = [
  { id: 'promotional', name: 'Promotional', desc: 'Product/service marketing' },
  { id: 'educational', name: 'Educational', desc: 'Teaching and explaining' },
  { id: 'storytelling', name: 'Storytelling', desc: 'Narrative and stories' },
  { id: 'motivational', name: 'Motivational', desc: 'Inspiring content' },
];

const voiceTypes = [
  { id: 'female', name: 'Female Voice', icon: '👩' },
  { id: 'male', name: 'Male Voice', icon: '👨' },
  { id: 'neutral', name: 'Neutral', icon: '🎙️' },
];

type Step = 'script' | 'style' | 'scenes' | 'audio' | 'render' | 'preview';

export function App() {
  const {
    currentProject,
    isGenerating,
    generationProgress,
    generationStep,
    createProject,
    updateProject,
    setGenerating,
    setProgress,
    addScene,
    updateScene,
  } = useVideoStore();

  const [currentStep, setCurrentStep] = useState<Step>('script');
  const [topic, setTopic] = useState('');
  const [scriptType, setScriptType] = useState('promotional');
  const [duration, setDuration] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewIntervalRef = useRef<number | null>(null);

  // Initialize project
  useEffect(() => {
    if (!currentProject) {
      createProject('New Video Project');
    }
  }, [currentProject, createProject]);

  // Load voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
      };
    }
  }, []);

  const handleGenerateScript = async () => {
    if (!topic.trim() || !currentProject) return;

    setGenerating(true);
    setProgress(0, 'Generating AI script...');

    try {
      const script = await generateScript(topic, scriptType, duration);
      updateProject(currentProject.id, { script, title: topic });
      setProgress(100, 'Script generated!');
      setTimeout(() => {
        setCurrentStep('style');
        setGenerating(false);
      }, 500);
    } catch (error) {
      console.error('Script generation failed:', error);
      setGenerating(false);
    }
  };

  const handleStyleSelect = (styleId: string) => {
    if (!currentProject) return;
    updateProject(currentProject.id, { style: styleId });
  };

  const handleGenerateScenes = async () => {
    if (!currentProject?.script) return;

    setGenerating(true);
    const parsedScenes = parseScriptToScenes(currentProject.script);
    
    // Clear existing scenes
    updateProject(currentProject.id, { scenes: [] });

    for (let i = 0; i < parsedScenes.length; i++) {
      setProgress(
        (i / parsedScenes.length) * 100,
        `Generating image ${i + 1}/${parsedScenes.length}...`
      );

      try {
        const imageUrl = await generateImage(
          `${parsedScenes[i].text}, ${topic}`,
          currentProject.style
        );

        const scene: VideoScene = {
          id: crypto.randomUUID(),
          text: parsedScenes[i].text,
          imageUrl,
          duration: parsedScenes[i].duration,
          voiceAudio: null,
        };

        addScene(currentProject.id, scene);
      } catch (error) {
        console.error('Image generation failed:', error);
        const scene: VideoScene = {
          id: crypto.randomUUID(),
          text: parsedScenes[i].text,
          imageUrl: null,
          duration: parsedScenes[i].duration,
          voiceAudio: null,
        };
        addScene(currentProject.id, scene);
      }
    }

    setProgress(100, 'Scenes generated!');
    setTimeout(() => {
      setCurrentStep('scenes');
      setGenerating(false);
    }, 500);
  };

  const handleRegenerateImage = async (sceneId: string, text: string) => {
    if (!currentProject) return;
    
    setGenerating(true);
    setProgress(0, 'Regenerating image...');

    try {
      const imageUrl = await generateImage(text, currentProject.style);
      updateScene(currentProject.id, sceneId, { imageUrl });
      setProgress(100, 'Image regenerated!');
    } catch (error) {
      console.error('Image regeneration failed:', error);
    }
    
    setGenerating(false);
  };

  const handleRenderVideo = async () => {
    if (!currentProject?.scenes.length) return;

    setGenerating(true);
    updateProject(currentProject.id, { status: 'rendering' });

    try {
      const videoUrl = await renderVideo({
        scenes: currentProject.scenes,
        style: currentProject.style,
        musicTrack: currentProject.musicTrack,
        onProgress: setProgress,
      });

      updateProject(currentProject.id, { videoUrl, status: 'complete' });
      setProgress(100, 'Video rendered successfully!');
      setTimeout(() => {
        setCurrentStep('preview');
        setGenerating(false);
      }, 500);
    } catch (error) {
      console.error('Video rendering failed:', error);
      updateProject(currentProject.id, { status: 'ready' });
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!currentProject?.videoUrl) return;

    const a = document.createElement('a');
    a.href = currentProject.videoUrl;
    a.download = `${currentProject.title || 'video'}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePlayPreview = useCallback(() => {
    if (!currentProject?.scenes.length) return;

    if (isPlaying) {
      setIsPlaying(false);
      speechSynthesis.cancel();
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      return;
    }

    setIsPlaying(true);
    setCurrentSceneIndex(0);

    const playScene = async (index: number) => {
      if (index >= currentProject.scenes.length) {
        setIsPlaying(false);
        setCurrentSceneIndex(0);
        return;
      }

      setCurrentSceneIndex(index);
      const scene = currentProject.scenes[index];
      
      // Speak the text
      await speakText(scene.text, currentProject.voiceType);
      
      // Wait for scene duration then play next
      setTimeout(() => {
        playScene(index + 1);
      }, scene.duration * 1000);
    };

    playScene(0);
  }, [currentProject, isPlaying]);

  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: 'script', label: 'Script', icon: <FileText className="w-4 h-4" /> },
    { id: 'style', label: 'Style', icon: <Palette className="w-4 h-4" /> },
    { id: 'scenes', label: 'Scenes', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-4 h-4" /> },
    { id: 'render', label: 'Render', icon: <Film className="w-4 h-4" /> },
    { id: 'preview', label: 'Preview', icon: <Play className="w-4 h-4" /> },
  ];

  const getStepIndex = (step: Step) => steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl shadow-lg shadow-violet-500/25">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Video Studio</h1>
              <p className="text-xs text-white/60">Create stunning videos with AI</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full">
              ✨ Unlimited Generation
            </span>
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-white/70" />
            </button>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => {
                  if (getStepIndex(step.id) <= getStepIndex(currentStep)) {
                    setCurrentStep(step.id);
                  }
                }}
                disabled={getStepIndex(step.id) > getStepIndex(currentStep)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl transition-all',
                  currentStep === step.id
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25'
                    : getStepIndex(step.id) < getStepIndex(currentStep)
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-white/5 text-white/40 cursor-not-allowed'
                )}
              >
                {getStepIndex(step.id) < getStepIndex(currentStep) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  step.icon
                )}
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight className="w-5 h-5 text-white/20 mx-2" />
              )}
            </div>
          ))}
        </div>

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                  <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-yellow-400 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">AI is Working</h3>
                <p className="text-white/60 mb-4">{generationStep}</p>
                <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <span className="text-sm text-white/40">{Math.round(generationProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          {/* Script Step */}
          {currentStep === 'script' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Wand2 className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">AI Script Writer</h2>
                  <p className="text-sm text-white/60">Generate a compelling script for your video</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    What's your video about?
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., The future of artificial intelligence, Healthy morning routines..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">
                    Script Type
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {scriptTypes.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setScriptType(type.id)}
                        className={cn(
                          'p-4 rounded-xl border transition-all text-left',
                          scriptType === type.id
                            ? 'bg-violet-500/20 border-violet-500 text-white'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        )}
                      >
                        <div className="font-medium">{type.name}</div>
                        <div className="text-xs opacity-60 mt-1">{type.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Video Duration: {duration} seconds
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="10"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                  <div className="flex justify-between text-xs text-white/40 mt-1">
                    <span>30s</span>
                    <span>60s</span>
                    <span>90s</span>
                    <span>120s</span>
                  </div>
                </div>

                {currentProject?.script && (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Generated Script
                    </label>
                    <textarea
                      value={currentProject.script}
                      onChange={(e) =>
                        updateProject(currentProject.id, { script: e.target.value })
                      }
                      rows={6}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleGenerateScript}
                    disabled={!topic.trim() || isGenerating}
                    className="flex-1 py-3 px-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate Script
                  </button>
                  {currentProject?.script && (
                    <button
                      onClick={() => setCurrentStep('style')}
                      className="py-3 px-6 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center gap-2"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Style Step */}
          {currentStep === 'style' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-fuchsia-500/20 rounded-lg">
                  <Palette className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Video Style</h2>
                  <p className="text-sm text-white/60">Choose the visual style for your video</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {videoStyles.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    className={cn(
                      'p-6 rounded-2xl border transition-all text-left group',
                      currentProject?.style === style.id
                        ? 'bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border-violet-500'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    )}
                  >
                    <div className="text-4xl mb-3">{style.icon}</div>
                    <div className="font-semibold text-white">{style.name}</div>
                    <div className="text-xs text-white/50 mt-1">{style.desc}</div>
                    {currentProject?.style === style.id && (
                      <div className="mt-3">
                        <Check className="w-5 h-5 text-violet-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={handleGenerateScenes}
                disabled={!currentProject?.style || isGenerating}
                className="w-full py-3 px-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-5 h-5" />
                Generate Scene Images
              </button>
            </div>
          )}

          {/* Scenes Step */}
          {currentStep === 'scenes' && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <ImageIcon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Scene Editor</h2>
                    <p className="text-sm text-white/60">
                      {currentProject?.scenes.length || 0} scenes generated
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentStep('audio')}
                  className="py-2 px-4 bg-violet-500 text-white text-sm font-medium rounded-lg hover:bg-violet-600 transition-colors flex items-center gap-2"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {currentProject?.scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="flex gap-4 p-4 bg-white/5 rounded-xl border border-white/10"
                  >
                    <div className="relative w-48 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-white/10">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={`Scene ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white font-medium">
                        Scene {index + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={scene.text}
                        onChange={(e) =>
                          updateScene(currentProject.id, scene.id, { text: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                      />
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/40">Duration:</span>
                          <input
                            type="number"
                            value={scene.duration}
                            onChange={(e) =>
                              updateScene(currentProject.id, scene.id, {
                                duration: Number(e.target.value),
                              })
                            }
                            min="2"
                            max="15"
                            className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <span className="text-xs text-white/40">sec</span>
                        </div>
                        <button
                          onClick={() => handleRegenerateImage(scene.id, scene.text)}
                          disabled={isGenerating}
                          className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 text-sm transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                        <button
                          onClick={() => {
                            const scenes = currentProject.scenes.filter((s) => s.id !== scene.id);
                            updateProject(currentProject.id, { scenes });
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    if (!currentProject) return;
                    const newScene: VideoScene = {
                      id: crypto.randomUUID(),
                      text: 'New scene text...',
                      imageUrl: null,
                      duration: 5,
                      voiceAudio: null,
                    };
                    addScene(currentProject.id, newScene);
                  }}
                  className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-white/50 hover:border-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Scene
                </button>
              </div>
            </div>
          )}

          {/* Audio Step */}
          {currentStep === 'audio' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Volume2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Audio Settings</h2>
                  <p className="text-sm text-white/60">Configure voiceover and background music</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Voice Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Mic className="w-4 h-4 text-white/60" />
                    <h3 className="font-medium text-white">Voiceover</h3>
                  </div>
                  <div className="space-y-3">
                    {voiceTypes.map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() =>
                          currentProject &&
                          updateProject(currentProject.id, { voiceType: voice.id })
                        }
                        className={cn(
                          'w-full p-4 rounded-xl border transition-all flex items-center gap-3',
                          currentProject?.voiceType === voice.id
                            ? 'bg-green-500/20 border-green-500'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        )}
                      >
                        <span className="text-2xl">{voice.icon}</span>
                        <span className="text-white font-medium">{voice.name}</span>
                        {currentProject?.voiceType === voice.id && (
                          <Check className="w-4 h-4 text-green-400 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Music Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Music className="w-4 h-4 text-white/60" />
                    <h3 className="font-medium text-white">Background Music</h3>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(musicTracks).map(([id, track]) => (
                      <button
                        key={id}
                        onClick={() =>
                          currentProject &&
                          updateProject(currentProject.id, { musicTrack: id })
                        }
                        className={cn(
                          'w-full p-4 rounded-xl border transition-all text-left',
                          currentProject?.musicTrack === id
                            ? 'bg-violet-500/20 border-violet-500'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white font-medium">{track.name}</div>
                            <div className="text-xs text-white/50">{track.mood}</div>
                          </div>
                          {currentProject?.musicTrack === id && (
                            <Check className="w-4 h-4 text-violet-400" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCurrentStep('render')}
                className="w-full mt-8 py-3 px-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                Continue to Render
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Render Step */}
          {currentStep === 'render' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Film className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Render Video</h2>
                  <p className="text-sm text-white/60">Generate your final video</p>
                </div>
              </div>

              {/* Preview Thumbnails */}
              <div className="mb-8">
                <h3 className="text-sm font-medium text-white/60 mb-3">Scene Preview</h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {currentProject?.scenes.map((scene, index) => (
                    <div
                      key={scene.id}
                      className="relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-white/10"
                    >
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={`Scene ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30" />
                      )}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white">
                        {scene.duration}s
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video Summary */}
              <div className="bg-white/5 rounded-xl p-6 mb-8">
                <h3 className="font-medium text-white mb-4">Video Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-white/50">Scenes</div>
                    <div className="text-2xl font-bold text-white">
                      {currentProject?.scenes.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Duration</div>
                    <div className="text-2xl font-bold text-white">
                      {currentProject?.scenes.reduce((acc, s) => acc + s.duration, 0) || 0}s
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Style</div>
                    <div className="text-lg font-bold text-white capitalize">
                      {currentProject?.style}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Resolution</div>
                    <div className="text-lg font-bold text-white">1280×720</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handlePlayPreview}
                  className="flex-1 py-3 px-6 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-5 h-5" />
                      Stop Preview
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Preview with Voice
                    </>
                  )}
                </button>
                <button
                  onClick={handleRenderVideo}
                  disabled={isGenerating || !currentProject?.scenes.length}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Film className="w-5 h-5" />
                  Render Video
                </button>
              </div>

              {/* Preview Area */}
              {isPlaying && currentProject?.scenes[currentSceneIndex] && (
                <div className="mt-8 rounded-xl overflow-hidden bg-black aspect-video relative">
                  {currentProject.scenes[currentSceneIndex].imageUrl ? (
                    <img
                      src={currentProject.scenes[currentSceneIndex].imageUrl!}
                      alt="Current scene"
                      className="w-full h-full object-cover animate-ken-burns"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white text-lg text-center">
                      {currentProject.scenes[currentSceneIndex].text}
                    </p>
                  </div>
                  <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 rounded-full text-white text-sm">
                    Scene {currentSceneIndex + 1} / {currentProject.scenes.length}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Step */}
          {currentStep === 'preview' && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Video Ready!</h2>
                    <p className="text-sm text-white/60">Your video has been generated</p>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="py-2 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </button>
              </div>

              {/* Video Player */}
              <div className="rounded-xl overflow-hidden bg-black aspect-video mb-6">
                {currentProject?.videoUrl ? (
                  <video
                    ref={videoRef}
                    src={currentProject.videoUrl}
                    controls
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40">
                    Video not available
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    createProject('New Video Project');
                    setTopic('');
                    setCurrentStep('script');
                  }}
                  className="flex-1 py-3 px-6 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create New Video
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download (Free)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Features Banner */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Sparkles className="w-5 h-5" />, label: 'AI Script Writer', color: 'violet' },
            { icon: <ImageIcon className="w-5 h-5" />, label: 'AI Image Generation', color: 'fuchsia' },
            { icon: <Mic className="w-5 h-5" />, label: 'AI Voiceover', color: 'blue' },
            { icon: <Download className="w-5 h-5" />, label: 'Free Download', color: 'emerald' },
          ].map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10"
            >
              <div className={`p-2 bg-${feature.color}-500/20 rounded-lg text-${feature.color}-400`}>
                {feature.icon}
              </div>
              <span className="text-sm text-white/80">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-white/40 text-sm">
          <p>AI Video Studio - Powered by Open Source AI APIs</p>
          <p className="mt-1">Pollinations.ai for images • Web Speech API for voiceover • Canvas API for rendering</p>
        </div>
      </footer>
    </div>
  );
}
