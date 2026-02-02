import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Wand2, Loader2, RefreshCw, Sparkles, Zap, Upload, History as HistoryIcon, ClipboardList } from "lucide-react";
import { HistorySidebar, HistoryItem } from "@/components/HistorySidebar";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { API_BASE_URL } from "@/config";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface HumanizeResult {
  humanized_text: string;
  text?: string;
  ai_score: number;
  aiScore?: number;
  human_score: number;
  humanScore?: number;
  passes_completed: string[];
  mode: string;
  loops: number;
  score_history: number[];
  processingTime: number;
  auto_stop: boolean;
  warning?: string;
}

interface DetectionResult {
  ai_score: number;
  human_score: number;
}

const SAMPLE_TEXT = `Artificial intelligence has revolutionized the way we interact with technology. It is important to note that AI systems are becoming increasingly sophisticated. Furthermore, these technologies are being integrated into various sectors. Moreover, the implications of AI development are far-reaching. Consequently, businesses must adapt to remain competitive. Therefore, understanding AI is crucial for success. Additionally, ethical considerations play a vital role in AI development. In conclusion, AI will continue to shape our future in profound ways.`;

const MAX_SMART_HUMANIZE_TRIES = 20;
const AI_THRESHOLD = 10;

export default function Humanize() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string>("");
  const [mode, setMode] = useState("general");
  const [strength, setStrength] = useState("balanced");
  const [autoCopy, setAutoCopy] = useState(false);
  const [result, setResult] = useState<HumanizeResult | null>(null);

  // Live AI Detection states
  const [inputDetection, setInputDetection] = useState<DetectionResult | null>(null);
  const [outputDetection, setOutputDetection] = useState<DetectionResult | null>(null);
  const [isDetectingInput, setIsDetectingInput] = useState(false);
  const [isDetectingOutput, setIsDetectingOutput] = useState(false);

  // Smart Humanize states
  const [smartHumanizeAttempts, setSmartHumanizeAttempts] = useState(0);
  const [isSmartHumanizing, setIsSmartHumanizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history
  useEffect(() => {
    const saved = localStorage.getItem("humanize_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history
  useEffect(() => {
    localStorage.setItem("humanize_history", JSON.stringify(history));
  }, [history]);

  const addToHistory = (original: string, humanized: string, aiScore: number) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      original,
      humanized,
      aiScore,
    };
    setHistory((prev) => [newItem, ...prev].slice(0, 50)); // Keep last 50
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setInputText(item.original);
    setOutputText(item.humanized);
    setResult({
      humanized_text: item.humanized,
      ai_score: item.aiScore,
      human_score: 100 - item.aiScore,
      passes_completed: [],
      mode: "history",
      loops: 1,
      score_history: [item.aiScore],
      processingTime: 0,
      auto_stop: true,
    });
    toast.success("History item loaded");
  };

  const handleClearHistory = () => {
    setHistory([]);
    toast.success("History cleared");
  };

  // Debounced AI detection for input text
  useEffect(() => {
    const detectAI = async () => {
      if (!inputText.trim() || inputText.length < 100) {
        setInputDetection(null);
        return;
      }

      setIsDetectingInput(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/ai-detector`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: inputText }),
        });

        if (!response.ok) throw new Error("Detection failed");

        const data = await response.json();

        setInputDetection({
          ai_score: data.ai_score ?? data.aiScore ?? 0,
          human_score: data.human_score ?? data.humanScore ?? 100,
        });
      } catch (error) {
        console.error("Input detection error:", error);
      } finally {
        setIsDetectingInput(false);
      }
    };

    const timeoutId = setTimeout(detectAI, 800);
    return () => clearTimeout(timeoutId);
  }, [inputText]);

  // Detect AI for output text when it changes
  useEffect(() => {
    const detectAI = async () => {
      if (!outputText.trim() || outputText.length < 100) {
        setOutputDetection(null);
        return;
      }

      setIsDetectingOutput(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/ai-detector`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: outputText }),
        });

        if (!response.ok) throw new Error("Detection failed");

        const data = await response.json();

        setOutputDetection({
          ai_score: data.ai_score ?? data.aiScore ?? 0,
          human_score: data.human_score ?? data.humanScore ?? 100,
        });
      } catch (error) {
        console.error("Output detection error:", error);
      } finally {
        setIsDetectingOutput(false);
      }
    };

    const timeoutId = setTimeout(detectAI, 500);
    return () => clearTimeout(timeoutId);
  }, [outputText]);

  const wordCount = (text: string) =>
    text.trim() ? text.trim().split(/\s+/).length : 0;

  const readPdfFile = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      return fullText;
    } catch (e) {
      console.error("PDF read error:", e);
      throw new Error("Could not parse PDF");
    }
  };

  const readDocxFile = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (e) {
      console.error("DOCX read error:", e);
      throw new Error("Could not parse Word document");
    }
  };

  const processFile = async (file: File) => {
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();

    try {
      let text = "";
      if (fileType === 'pdf') {
        text = await readPdfFile(file);
      } else if (fileType === 'docx') {
        text = await readDocxFile(file);
      } else if (fileType === 'txt' || fileType === 'md') {
        text = await file.text();
      } else {
        throw new Error("Unsupported file type");
      }

      if (!text.trim()) {
        throw new Error("File appears to be empty");
      }

      setInputText(text);
      setOutputText("");
      setResult(null);
      toast.success("File loaded successfully");
    } catch (error) {
      console.error("File processing error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to read file");
    }
  };

  const handleTrySample = () => {
    setInputText(SAMPLE_TEXT);
    setOutputText("");
    setResult(null);
    toast.success("Sample text loaded");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
      // Reset input so same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      setOutputText("");
      setResult(null);
      toast.success("Text pasted from clipboard");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const humanizeOnce = async (textToProcess: string): Promise<{ text: string; score: number } | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/humanize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToProcess,
          mode,
          strength,
          action: "humanize",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to humanize");
      }

      const data = await response.json();

      if (data.warning) {
        toast.warning(data.warning);
      }

      const humanizeResult = data as HumanizeResult;
      const finalText = humanizeResult.humanized_text || humanizeResult.text || "";

      return { text: finalText, score: 0 };
    } catch (error) {
      console.error("Humanize error:", error);
      const message = error instanceof Error ? error.message : "Failed to humanize";
      if (message.includes("Rate") || message.includes("429")) {
        toast.error("Rate limited. Please wait a moment and try again.");
      } else {
        toast.error(message);
      }
      return null;
    }
  };

  const detectAIScore = async (text: string): Promise<number> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai-detector`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("Detection failed");
      const data = await response.json();

      return data.ai_score ?? data.aiScore ?? 0;
    } catch (error) {
      console.error("Detection error:", error);
      return 100;
    }
  };

  const handleHumanize = async (action: "humanize" | "rehumanize" = "humanize") => {
    const textToProcess = action === "rehumanize" ? outputText : inputText;

    if (!textToProcess.trim()) {
      toast.error(action === "rehumanize" ? "No output to re-humanize" : "Please enter some text to humanize");
      return;
    }

    setIsProcessing(true);
    setProcessingAction(action);

    try {
      const result = await humanizeOnce(textToProcess);
      if (!result) return;

      setOutputText(result.text);

      // Detect AI score for the humanized output
      const aiScore = await detectAIScore(result.text);

      setResult({
        humanized_text: result.text,
        ai_score: aiScore,
        human_score: 100 - aiScore,
        passes_completed: [],
        mode,
        loops: 1,
        score_history: [aiScore],
        processingTime: 0,
        auto_stop: aiScore < AI_THRESHOLD,
      });

      addToHistory(textToProcess, result.text, aiScore);

      if (aiScore < AI_THRESHOLD) {
        toast.success(`Done! AI score: ${aiScore.toFixed(1)}%`);
      } else {
        toast.success(`Completed. AI score: ${aiScore.toFixed(1)}%`);
      }

      if (autoCopy) {
        navigator.clipboard.writeText(result.text);
        toast.success("Auto-copied result to clipboard!");
      }
    } finally {
      setIsProcessing(false);
      setProcessingAction("");
    }
  };

  const handleSmartHumanize = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to humanize");
      return;
    }

    setIsSmartHumanizing(true);
    setSmartHumanizeAttempts(0);
    setProcessingAction("smart");

    let bestText = inputText;
    let minScore = 100;
    let currentText = inputText;
    let attempts = 0;
    let currentScore = 100;


    try {
      while (attempts < MAX_SMART_HUMANIZE_TRIES) {
        attempts++;
        setSmartHumanizeAttempts(attempts);

        toast.info(`Smart Humanize: Attempt ${attempts}/${MAX_SMART_HUMANIZE_TRIES}... (Best: ${minScore.toFixed(0)}%)`);

        const result = await humanizeOnce(currentText);
        if (!result) break;

        currentText = result.text;
        setOutputText(currentText);

        // Detect AI score
        currentScore = await detectAIScore(currentText);

        // Track Best Score
        if (currentScore < minScore) {
          minScore = currentScore;
          bestText = currentText;
        }

        setResult({
          humanized_text: currentText,
          ai_score: currentScore,
          human_score: 100 - currentScore,
          passes_completed: [],
          mode,
          loops: attempts,
          score_history: [],
          processingTime: 0,
          auto_stop: currentScore < 2,
        });

        if (currentScore < 2) {
          addToHistory(inputText, currentText, currentScore);
          toast.success(`Success! Dropped to ${currentScore.toFixed(1)}% AI in ${attempts} tries.`);

          if (autoCopy) {
            navigator.clipboard.writeText(currentText);
            toast.success("Auto-copied result to clipboard!");
          }
          break;
        }

        if (attempts >= MAX_SMART_HUMANIZE_TRIES) {
          // RESTORE BEST RESULT
          setOutputText(bestText);
          setResult({
            humanized_text: bestText,
            ai_score: minScore,
            human_score: 100 - minScore,
            passes_completed: [],
            mode,
            loops: attempts,
            score_history: [],
            processingTime: 0,
            auto_stop: false, // timed out
          });

          toast.warning(`Reached limit. Reverting to BEST result: ${minScore.toFixed(1)}%`);

          if (autoCopy) {
            navigator.clipboard.writeText(bestText);
          }
        }
      }
    } finally {
      setIsSmartHumanizing(false);
      setSmartHumanizeAttempts(0);
      setProcessingAction("");
    }
  };

  const handleCopy = () => {
    if (!outputText) {
      toast.error("No output to copy");
      return;
    }
    navigator.clipboard.writeText(outputText);
    toast.success("Copied to clipboard");
  };

  const handleClear = () => {
    setInputText("");
    setOutputText("");
    setResult(null);
    setInputDetection(null);
    setOutputDetection(null);
  };

  const getScoreColor = (score: number) => {
    if (score < 10) return "text-green-500";
    if (score < 30) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score < 10) return "bg-green-500/10 border-green-500/20";
    if (score < 30) return "bg-yellow-500/10 border-yellow-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              PL AI Humanizer
            </h1>
            <p className="text-muted-foreground">
              Transform AI text into natural human writing that bypasses all AI detectors
            </p>
          </div>

          {/* Main Two-Panel Layout */}
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Input Panel */}
              <div className="p-4 md:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">AI Text Input</span>
                  <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryOpen(true)}
                      className="text-xs h-8 px-2"
                    >
                      <HistoryIcon className="h-3.5 w-3.5 mr-1" />
                      <span className="hidden sm:inline">History</span>
                    </Button>
                    <div className="w-px h-4 bg-border mx-0.5 self-center" />
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      accept=".txt,.md,.pdf,.docx,.doc"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      className="text-xs h-8 px-2"
                    >
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      <span className="hidden sm:inline">Upload</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePaste}
                      className="text-xs h-8 px-2"
                    >
                      <ClipboardList className="h-3.5 w-3.5 mr-1" />
                      <span className="hidden sm:inline">Paste</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTrySample}
                      className="text-xs h-8 px-2"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      <span className="hidden sm:inline">Try Sample</span>
                    </Button>
                  </div>
                </div>
                <div
                  className={`relative transition-all duration-200 ${isDragging ? "ring-2 ring-primary ring-offset-2 scale-[1.01]" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isDragging && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary">
                      <Upload className="h-10 w-10 text-primary mb-2" />
                      <p className="text-sm font-medium text-primary">Drop text file here</p>
                    </div>
                  )}
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your AI-generated text here or drag & drop a file (PDF, Word, TXT)..."
                    className="w-full h-64 md:h-80 p-4 bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  />
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  <span>{wordCount(inputText)} words</span>
                  <span>{inputText.length} characters</span>
                </div>

                {/* Live AI Detection for Input */}
                {inputText.length >= 100 && (
                  <div className={`mt-3 p-3 rounded-xl border ${inputDetection ? getScoreBg(inputDetection.ai_score) : "bg-muted/50 border-border"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">AI Detected</span>
                      {isDetectingInput ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : inputDetection ? (
                        <span className={`text-lg font-bold ${getScoreColor(inputDetection.ai_score)}`}>
                          {inputDetection.ai_score.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">--</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Output Panel */}
              <div className="p-4 md:p-6 bg-muted/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 h-auto sm:h-9 gap-2">
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">Humanized Output</span>
                  <div className="flex items-center gap-2">
                    {result && (
                      <div className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${getScoreBg(result.ai_score)} ${getScoreColor(result.ai_score)}`}>
                        {result.ai_score.toFixed(1)}% AI
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  value={outputText}
                  readOnly
                  placeholder="Your humanized text will appear here..."
                  className="w-full h-64 md:h-80 p-4 bg-background border border-border rounded-xl resize-none focus:outline-none text-sm"
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-muted-foreground">{wordCount(outputText)} words</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      disabled={!outputText}
                      className="text-xs"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Live AI Detection for Output */}
                {outputText.length >= 100 && (
                  <div className={`mt-3 p-3 rounded-xl border ${outputDetection ? getScoreBg(outputDetection.ai_score) : "bg-muted/50 border-border"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">AI Detected</span>
                      {isDetectingOutput ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : outputDetection ? (
                        <span className={`text-lg font-bold ${getScoreColor(outputDetection.ai_score)}`}>
                          {outputDetection.ai_score.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">--</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="border-t border-border p-4 md:p-6 bg-muted/10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Settings */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Strength Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Strength:</span>
                    <Select value={strength} onValueChange={setStrength}>
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mode:</span>
                    <Select value={mode} onValueChange={setMode}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="academic">Academic</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Auto Copy Toggle */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="auto-copy"
                        checked={autoCopy}
                        onCheckedChange={setAutoCopy}
                        className="scale-90"
                      />
                      <label
                        htmlFor="auto-copy"
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                      >
                        Auto Copy
                      </label>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleHumanize("rehumanize")}
                    disabled={isProcessing || isSmartHumanizing || !outputText.trim()}
                    className="h-10 sm:h-9 w-full sm:w-auto"
                  >
                    {isProcessing && processingAction === "rehumanize" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Re-Humanize
                  </Button>

                  <Button
                    variant="gradient"
                    onClick={() => handleHumanize("humanize")}
                    disabled={isProcessing || isSmartHumanizing || !inputText.trim()}
                    className="h-10 sm:h-9 w-full sm:w-auto px-6 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    {isProcessing && processingAction === "humanize" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Humanize
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleSmartHumanize}
                    disabled={isProcessing || isSmartHumanizing || !inputText.trim()}
                    className="h-10 sm:h-9 w-full sm:w-auto px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-200 border-0"
                  >
                    {isSmartHumanizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Smart Mode...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2 fill-current" />
                        Smart Humanize
                      </>
                    )}
                  </Button>


                </div>
              </div>
            </div>
          </div>

          {/* Result Stats */}
          {result && (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-xl border ${getScoreBg(result.ai_score)} text-center`}>
                <p className="text-xs text-muted-foreground mb-1">AI Detected</p>
                <span className={`text-2xl font-bold ${getScoreColor(result.ai_score)}`}>
                  {result.ai_score.toFixed(1)}%
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-green-500/10 border-green-500/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">Human Score</p>
                <span className="text-2xl font-bold text-green-500">
                  {result.human_score.toFixed(1)}%
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Mode</p>
                <span className="text-lg font-semibold text-foreground capitalize">
                  {mode}
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Time</p>
                <span className="text-lg font-semibold text-foreground">
                  {((result.processingTime || 0) / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          )}

          {/* Bypasses AI Detectors */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground mb-4">
              PL Humanizer bypasses these AI detectors
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Turnitin", "GPTZero", "Copyleak", "ZeroGPT", "Originality", "Writer", "Sapling"].map((name) => (
                <span key={name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <HistorySidebar
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onSelect={handleSelectHistory}
        onClear={handleClearHistory}
      />
    </Layout>
  );
}
