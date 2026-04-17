import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  FileText, 
  Upload, 
  Search, 
  BarChart3, 
  PieChart as PieChartIcon, 
  BrainCircuit, 
  MessageSquare, 
  ChevronRight,
  TrendingUp,
  History,
  BookOpen,
  Settings,
  X,
  Plus,
  Loader2,
  Download,
  ClipboardCheck,
  Zap,
  Send,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";

// Types
interface ParsedFile {
  id: string;
  name: string;
  text: string;
  pages: number;
  status: "uploading" | "parsing" | "complete" | "error";
  error?: string;
  progress: number;
  isCookieError?: boolean;
}

interface MockQuestion {
  id: string;
  type: "mcq" | "coding";
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
}

interface AnalysisData {
  topics: { name: string; value: number }[];
  difficulty: { name: string; count: number }[];
  repeats: { pattern: string; frequency: number; examples: string[] }[];
  importantNotes: string[];
  links?: { url: string; context: string; title: string }[];
  externalQuestions?: { question: string; source_type: string; similar_to: string; topic: string }[];
}

const COLORS = ["#A78BFA", "#F472B6", "#60A5FA", "#34D399", "#FBBF24", "#F87171"];

export default function App() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "patterns" | "notes" | "mocktest" | "links" | "external">("dashboard");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [mockTest, setMockTest] = useState<MockQuestion[]>([]);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [expandedPatterns, setExpandedPatterns] = useState<Record<number, boolean>>({});
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  // Persistence Hooks
  useEffect(() => {
    const savedMessages = localStorage.getItem("placement_analyzer_chat_history");
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error("Failed to load chat history:", e);
      }
    }
    setIsHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (isHistoryLoaded) {
      localStorage.setItem("placement_analyzer_chat_history", JSON.stringify(messages));
    }
  }, [messages, isHistoryLoaded]);

  // Gemini Proxy Setup - Keeps API Key Secure on the Backend (Render)
  const apiBase = (import.meta as any).env.VITE_API_URL || "";
  const ai = React.useMemo(() => ({
    models: {
      generateContent: async (args: any) => {
        const response = await fetch(`${apiBase}/api/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt: args.contents, 
            config: args.config 
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'AI request failed');
        }
        const data = await response.json();
        return { text: data.text };
      }
    }
  }), [apiBase]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files) as File[];
    
    // Initialize temporary file objects for UI feedback
    const newFiles: ParsedFile[] = selectedFiles.map((file: File) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      text: "",
      pages: 0,
      status: "uploading",
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Process each file
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileId = newFiles[i].id;
      
      try {
        const formData = new FormData();
        formData.append("files", file);

        // We use XMLHttpRequest here to get progress events for each file
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const apiUrl = (import.meta as any).env.VITE_API_URL || "";
          xhr.open("POST", `${apiUrl}/api/upload`);
          
          // CORS settings - set to false for standard manual hosting
          xhr.withCredentials = false;
          
          // AI Studio proxy hint: adding this header can sometimes prevent HTML challenge redirects
          xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setFiles(prev => prev.map(f => 
                f.id === fileId ? { ...f, progress: percentComplete, status: percentComplete === 100 ? "parsing" : "uploading" } : f
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                // Check if response is HTML (likely AI Studio Cookie Check redirect)
                if (typeof xhr.response === 'string' && (xhr.response.trim().startsWith("<!doctype") || xhr.response.trim().startsWith("<html"))) {
                  if (xhr.response.includes("Action required") || xhr.response.includes("Cookie check") || xhr.response.includes("Authenticate in new window")) {
                    const cookieErr = new Error("AI Studio security check required. This happens when the browser blocks platform cookies.");
                    (cookieErr as any).isCookieError = true;
                    throw cookieErr;
                  }
                  throw new Error("Server returned an HTML page instead of JSON.");
                }

                const data = JSON.parse(xhr.response);
                if (data.files && data.files.length > 0) {
                  const result = data.files[0];
                  setFiles(prev => prev.map(f => 
                    f.id === fileId ? { 
                      ...f, 
                      text: result.text || "", 
                      pages: result.pages || 0, 
                      status: result.status === "error" ? "error" : "complete",
                      error: result.error || (result.status === "error" ? "Parsing failed" : undefined),
                      progress: 100 
                    } : f
                  ));
                }
              } catch (parseError: any) {
                console.error("Failed to parse server response:", xhr.response);
                const isCookieMsg = parseError.isCookieError || parseError.message?.includes("AI Studio");
                
                const msg = isCookieMsg 
                  ? "Authentication blocked. Please use 'Open in New Tab'." 
                  : "Server response was invalid (Non-JSON). This usually happens due to a platform security timeout.";
                
                setFiles(prev => prev.map(f => 
                  f.id === fileId ? { ...f, status: "error", error: msg, isCookieError: isCookieMsg } : f
                ));
                reject(new Error(msg));
              }
              resolve(xhr.response);
            } else {
              let errorMsg = "Upload failed";
              let isCookieMsg = false;
              
              // Sometimes even non-200 responses can be cookie checks
              if (typeof xhr.response === 'string' && xhr.response.includes("Cookie check")) {
                errorMsg = "Browser blocked platform cookies. Try opening in a new tab.";
                isCookieMsg = true;
              } else {
                try {
                  const errorData = JSON.parse(xhr.response);
                  errorMsg = errorData.error || errorMsg;
                } catch (e) {
                  if (xhr.status === 413) errorMsg = "File is too large for the server.";
                  else if (xhr.status === 504) errorMsg = "Server timed out processing the file.";
                  else if (xhr.status === 403 || xhr.status === 401) {
                    errorMsg = "Authentication lost. Please refresh the page.";
                    isCookieMsg = true;
                  }
                  else errorMsg = `Server error (${xhr.status}). Please try again later.`;
                }
              }
              
              setFiles(prev => prev.map(f => 
                f.id === fileId ? { ...f, status: "error", error: errorMsg, isCookieError: isCookieMsg } : f
              ));
              reject(new Error(errorMsg));
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(formData);
        });
      } catch (error) {
        console.error("Upload error for file:", file.name, error);
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, status: "error", error: "Failed to upload or parse" } : f
        ));
      }
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const runAnalysis = async () => {
    const readyFiles = files.filter(f => f.status === "complete");
    if (readyFiles.length === 0) return;
    setIsAnalyzing(true);
    
    // Smart Sampler: If the file is very long, sample from start, middle, and end to find more patterns
    const combinedText = readyFiles.map(f => {
      const charLimit = 30000; // Increased significantly for Gemin 3 Flash
      if (f.text.length <= charLimit) {
        return `File: ${f.name}\n${f.text}`;
      } else {
        const segmentSize = Math.floor(charLimit / 3);
        const start = f.text.substring(0, segmentSize);
        const middle = f.text.substring(Math.floor(f.text.length / 2) - Math.floor(segmentSize / 2), Math.floor(f.text.length / 2) + Math.floor(segmentSize / 2));
        const end = f.text.substring(f.text.length - segmentSize);
        return `File: ${f.name} (Sampled from start, middle, end)\n${start}\n[...]\n${middle}\n[...]\n${end}`;
      }
    }).join("\n\n---\n\n");

    try {
      const prompt = `
        You are a highly detailed Placement Pattern Analyst. Your mission is to find EVERYTHING useful in these documents. Do NOT be brief.
        
        Analyze the following text from placement papers and coding materials. Be extremely thorough and provide as much detail as possible.
        
        Identify:
        1. Comprehensive Topic distribution (Arrays, Strings, Aptitude, OS, Networking, HR, etc.) as a list of names and percentages (values from 0-100).
        2. Difficulty levels (Easy, Medium, Hard) counts based on question types.
        3. Extensive list of Frequently repeated question patterns or topics (Hunt for at least 10-15 distinct, specific trends). For each pattern, specify how frequently it appears and provide 3-4 distinct, specific examples found in the text.
        4. Deep Study Notes: Extract a massive list of 15-20 specific, high-value study notes, technical formulas, recurring concepts, or "interviewer favorite" tips identified in the materials.
        5. Extract all external links (URLs, websites, or resource links) found in the text along with their title and the exact sentence where they appear.
        6. Generate a robust, high-quantity set of 15-20 "Similar External Questions" that are highly relevant to the patterns found. Group these clearly by topic.
        
        Return the result ONLY as a JSON object with this structure:
        {
          "topics": [{"name": "topic", "value": 25}, ...],
          "difficulty": [{"name": "Easy", "count": 10}, ...],
          "repeats": [{"pattern": "Detailed naming of the specific pattern", "frequency": 5, "examples": ["Example 1", "Example 2", "Example 3"]}],
          "importantNotes": ["Detailed technical insight 1", "Detailed technical insight 2", ...],
          "links": [{"url": "https://example.com", "title": "Resource Name", "context": "The full sentence containing the link"}],
          "externalQuestions": [{"question": "The question text", "source_type": "Company/Platform", "similar_to": "Matched pattern", "topic": "Topic Category"}]
        }
        
        Text to analyze:
        ${combinedText}
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      // Robust JSON extraction
      let jsonStr = result.text.trim();
      if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      }
      
      const parsedAnalysis = JSON.parse(jsonStr);
      setAnalysis(parsedAnalysis);
      setActiveTab("dashboard");
    } catch (error) {
      console.error("Analysis error:", error);
      alert("Analysis failed. Please ensure your Gemini API key is valid and check the browser console for details.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateMockTest = async () => {
    const readyFiles = files.filter(f => f.status === "complete");
    if (readyFiles.length === 0) return;
    setIsGeneratingTest(true);
    const combinedText = readyFiles.map(f => f.text.substring(0, 2000)).join("\n");
    
    try {
      const prompt = `Based on these placement papers, generate a mock test with 5 multiple choice questions and 2 coding problems.
      Return the response in JSON format matching this schema:
      {
        "questions": [
          {
            "id": "q1",
            "type": "mcq",
            "question": "The question text here?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Option A",
            "explanation": "Why this is correct."
          },
          {
            "id": "q2",
            "type": "coding",
            "question": "Problem description here...",
            "answer": "Example solution code or expected output",
            "explanation": "Logic explanation"
          }
        ]
      }
      
      Focus on patterns identified in these papers:
      ${combinedText}`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { 
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(result.text);
      if (data.questions) {
        setMockTest(data.questions);
        setRevealedAnswers({});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const toggleAnswer = (id: string) => {
    setRevealedAnswers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const exportNotes = () => {
    if (!analysis) return;
    const content = `Placement Summary - ${new Date().toLocaleDateString()}\n\nImportant Notes:\n${analysis.importantNotes.map((n, i) => `${i+1}. ${n}`).join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'placement_notes.txt';
    a.click();
  };

  const clearChatHistory = () => {
    if (window.confirm("Are you sure you want to clear your entire chat history?")) {
      setMessages([]);
      localStorage.removeItem("placement_analyzer_chat_history");
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatting) return;

    const userMsg = inputMessage;
    setInputMessage("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsChatting(true);

    try {
      const readyFiles = files.filter(f => f.status === "complete");
      const docContext = readyFiles.map(f => f.text.substring(0, 1500)).join("\n");
      
      let extraContext = "";
      if (analysis) {
        extraContext += `\nTopic Patterns: ${analysis.topics.map(t => `${t.name} (${t.value}%)`).join(", ")}`;
        extraContext += `\nDifficulty Distribution: ${analysis.difficulty.map(d => `${d.name}: ${d.count}`).join(", ")}`;
        extraContext += `\nTop Repeated Patterns: ${analysis.repeats.slice(0, 3).map(r => r.pattern).join(", ")}`;
      }
      
      if (mockTest && mockTest.length > 0) {
        extraContext += `\nCurrent Generated Mock Test Content: ${JSON.stringify(mockTest).substring(0, 2000)}`;
      }

      const prompt = `
        You are "Placement Analyzer", a specialized placement preparation assistant.
        
        Context from documents:
        ${docContext}
        
        ${extraContext}
        
        User question: ${userMsg}
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: "You are Placement Analyzer, a versatile placement preparation assistant. Your primary goal is to help users succeed in their careers. If the user's question relates to the uploaded documents, analysis, or mock tests, use that context as your priority. If the question is general (e.g., coding concepts, interview tips, general technology, or even unrelated conversational topics), use your internal knowledge to provide helpful and accurate answers. Never refuse a question just because it isn't in the provided PDF; instead, provide the best answer possible while mentioning if you didn't find specific details in their personal files."
        }
      });

      setMessages(prev => [...prev, { role: "ai", content: result.text || "I'm sorry, I couldn't process that query." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: "ai", content: "I encountered an error connecting to my knowledge base. Please try again." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex h-screen bg-app-bg text-app-text-main font-sans selection:bg-app-accent/30 italic-serif:font-serif">
      {/* Sidebar */}
      <aside className="w-[260px] bg-app-surface border-r border-app-border flex flex-col z-10">
        <div className="p-6 border-b border-app-border">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-app-accent p-2 rounded-lg shadow-app-accent/20 shadow-lg">
              <BrainCircuit className="text-app-bg w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-app-accent">Placement Analyzer</h1>
          </div>
          
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-app-border rounded-xl cursor-pointer hover:border-app-accent hover:bg-app-accent-muted transition-all group">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 text-app-text-dim group-hover:text-app-accent mb-2 transition-colors" />
              <p className="text-sm text-app-text-main font-medium">Upload PDF Materials</p>
              <p className="text-xs text-app-text-dim mt-1">Placement papers, notes</p>
            </div>
            <input type="file" className="hidden" multiple accept=".pdf" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-app-text-dim">Your Documents</h2>
            <span className="text-[10px] bg-app-bg text-app-accent px-2 py-0.5 rounded-full font-bold border border-app-border">
              {files.filter(f => f.status === "complete").length}
            </span>
          </div>
          
          {files.length === 0 && (
            <div className="text-center py-10 px-4 opacity-50">
              <FileText className="w-10 h-10 text-app-border mx-auto mb-3" />
              <p className="text-sm text-app-text-dim">No documents uploaded yet.</p>
            </div>
          )}

          {files.map((file) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={file.id} 
              className={cn(
                "flex flex-col gap-2 p-3 bg-app-bg border rounded-lg group transition-colors",
                file.status === "error" ? "border-red-500/30" : "border-app-border hover:border-app-accent/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-1.5 rounded-md",
                  file.status === "error" ? "bg-red-500/10" : "bg-app-accent-muted"
                )}>
                  <FileText className={cn(
                    "w-3.5 h-3.5",
                    file.status === "error" ? "text-red-400" : "text-app-accent"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-app-text-main truncate">{file.name}</p>
                  <p className="text-[10px] text-app-text-dim">
                    {file.status === "complete" ? `${file.pages} Pages` : 
                     file.status === "error" ? "Parsing Failed" : 
                     file.status === "parsing" ? "Processing..." : 
                     `Uploading ${file.progress}%`}
                  </p>
                </div>
                <button 
                  onClick={() => removeFile(file.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 hover:text-red-400 rounded transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {(file.status === "uploading" || file.status === "parsing") && (
                <div className="w-full h-1 bg-app-border rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${file.progress}%` }}
                    className={cn(
                      "h-full transition-all duration-300",
                      file.status === "parsing" ? "bg-emerald-500 animate-pulse" : "bg-app-accent"
                    )}
                  />
                </div>
              )}

              {file.status === "error" && (
                <div className="space-y-1">
                  <p className="text-[9px] text-red-400 font-medium leading-tight">
                    {file.error || "An error occurred during upload."}
                  </p>
                  {file.isCookieError && (
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="text-[9px] text-app-accent font-bold underline hover:no-underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-2 h-2" />
                      Open in New Tab to fix
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="p-4 border-t border-app-border">
          <button 
            onClick={runAnalysis}
            disabled={files.filter(f => f.status === "complete").length === 0 || isAnalyzing}
            className="w-full flex items-center justify-center gap-2 bg-app-accent text-app-bg py-3 rounded-lg font-bold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98]"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BrainCircuit className="w-4 h-4" />
            )}
            Run AI Analysis
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-app-bg">
        {/* Top bar */}
        <header className="h-16 bg-app-surface border-b border-app-border flex items-center justify-between px-8">
          <nav className="flex items-center gap-8 h-full">
            <button 
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                activeTab === "dashboard" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Insights Dashboard
            </button>
            <button 
              onClick={() => setActiveTab("patterns")}
              className={cn(
                "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                activeTab === "patterns" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
              )}
            >
              <History className="w-4 h-4" />
              Pattern Analysis
            </button>
              <button 
                onClick={() => setActiveTab("notes")}
                className={cn(
                  "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                  activeTab === "notes" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
                )}
              >
                <BookOpen className="w-4 h-4" />
                Auto Notes
              </button>
              <button 
                onClick={() => setActiveTab("mocktest")}
                className={cn(
                  "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                  activeTab === "mocktest" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
                )}
              >
                <ClipboardCheck className="w-4 h-4" />
                Mock Test
              </button>
              <button 
                onClick={() => setActiveTab("links")}
                className={cn(
                  "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                  activeTab === "links" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
                )}
              >
                <ExternalLink className="w-4 h-4" />
                Links
              </button>
              <button 
                onClick={() => setActiveTab("external")}
                className={cn(
                  "h-full px-1 flex items-center gap-2 text-sm font-bold border-b-2 transition-all",
                  activeTab === "external" ? "border-app-accent text-app-accent" : "border-transparent text-app-text-dim hover:text-app-text-main"
                )}
              >
                <BrainCircuit className="w-4 h-4" />
                External Prep
              </button>
            </nav>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-dim" />
              <input 
                type="text" 
                placeholder="Search across documents..." 
                className="bg-app-bg border border-app-border rounded-full pl-10 pr-4 py-2 text-sm w-64 focus:ring-1 focus:ring-app-accent transition-all outline-none text-app-text-main"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-10">
          {files.some(f => f.isCookieError) && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="bg-app-accent-muted border border-app-accent/30 p-4 rounded-xl mb-8 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="bg-app-accent p-2 rounded-lg">
                  <ExternalLink className="w-4 h-4 text-app-bg" />
                </div>
                <div>
                  <p className="text-sm font-bold text-app-text-main">Action Required: Authentication Challenge</p>
                  <p className="text-xs text-app-text-dim">Your browser is protecting you by blocking security cookies. This app works best in its own tab.</p>
                </div>
              </div>
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="bg-app-accent text-app-bg px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Open in New Tab
              </button>
            </motion.div>
          )}

          {!analysis && !isAnalyzing && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-app-accent-muted rounded-2xl flex items-center justify-center mb-6">
                <BrainCircuit className="w-10 h-10 text-app-accent" />
              </div>
              <h2 className="text-2xl font-bold text-app-text-main mb-2">Unlock Placement Insights</h2>
              <p className="text-app-text-dim mb-8 leading-relaxed italic italic-serif:font-serif">
                Upload your company papers and study materials. We'll use AI to analyze patterns, 
                identify core topics, and generate a strategic roadmap for you.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-app-surface p-4 rounded-xl border border-app-border text-left">
                  <PieChartIcon className="w-5 h-5 text-app-accent mb-2" />
                  <p className="text-sm font-bold">Topic Stats</p>
                  <p className="text-xs text-app-text-dim">Distribution by category</p>
                </div>
                <div className="bg-app-surface p-4 rounded-xl border border-app-border text-left">
                  <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
                  <p className="text-sm font-bold">Trend Analysis</p>
                  <p className="text-xs text-app-text-dim">Repeating question types</p>
                </div>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                <BrainCircuit className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-6 text-slate-900 font-bold text-lg">Analyzing Patterns...</p>
              <p className="text-slate-400 text-sm italic">Gemini is clustering questions and mapping topics</p>
            </div>
          )}

          {analysis && !isAnalyzing && (
            <div className="space-y-8 max-w-6xl mx-auto">
              {activeTab === "dashboard" && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-app-text-main">Placement Intelligence</h2>
                      <p className="text-app-text-dim italic mt-1 font-medium italic-serif:font-serif">Analysis based on {files.filter(f => f.status === "complete").length} documents</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 bg-app-surface p-8 rounded-2xl border border-app-border shadow-sm">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-app-text-dim mb-8">Topic Distribution</h3>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analysis.topics}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2A2E" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fontWeight: 600, fill: '#9CA3AF' }} 
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                            <Tooltip 
                              cursor={{ fill: '#1E1E22' }}
                              contentStyle={{ backgroundColor: '#151517', borderRadius: '12px', border: '1px solid #2A2A2E', color: '#E5E7EB' }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} opacity={0.8}>
                              {analysis.topics.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-app-surface p-8 rounded-2xl border border-app-border shadow-sm flex flex-col">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-app-text-dim mb-8">Difficulty Spread</h3>
                      <div className="flex-1 flex flex-col justify-center">
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={analysis.difficulty}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="count"
                                stroke="#151517"
                              >
                                {analysis.difficulty.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={["#10B981", "#F59E0B", "#EF4444"][index % 3]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-3 mt-8">
                          {analysis.difficulty.map((diff, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", ["bg-emerald-500", "bg-amber-500", "bg-red-500"][i % 3])} />
                                <span className="text-xs font-bold text-app-text-dim">{diff.name}</span>
                              </div>
                              <span className="text-xs font-black text-app-text-main">{diff.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    {files.filter(f => f.status === "complete").slice(0, 3).map((f, i) => (
                      <div key={i} className="bg-app-surface p-6 rounded-xl border border-app-border shadow-sm hover:border-app-accent/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="bg-app-accent-muted p-2 rounded-lg">
                            <FileText className="w-4 h-4 text-app-accent" />
                          </div>
                          <p className="text-sm font-bold text-app-text-main truncate">{f.name}</p>
                        </div>
                        <p className="text-xs text-app-text-dim leading-relaxed line-clamp-3 italic italic-serif:font-serif">
                          {f.text.substring(0, 150)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "patterns" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <h2 className="text-2xl font-black text-app-text-main">Pattern Frequency Analysis</h2>
                  <div className="grid gap-4">
                    {analysis.repeats.map((pattern, idx) => (
                      <div key={idx} className="bg-app-surface p-6 rounded-2xl border border-app-border shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex gap-4">
                            <div className="bg-app-accent-muted text-app-accent w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl border border-app-accent/20">
                              {pattern.frequency}
                            </div>
                            <div>
                              <h4 className="font-bold text-app-text-main text-lg leading-tight">{pattern.pattern}</h4>
                              <p className="text-[10px] font-bold text-app-text-dim uppercase tracking-widest mt-1">Found across {files.filter(f => f.status === "complete").length} papers</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setExpandedPatterns(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            className="text-app-accent text-xs font-bold flex items-center gap-1 hover:underline group"
                          >
                            {expandedPatterns[idx] ? "Hide Matches" : "View Matches"} 
                            <ChevronRight className={cn(
                              "w-3 h-3 transition-transform duration-300",
                              expandedPatterns[idx] && "rotate-90"
                            )} />
                          </button>
                        </div>
                        
                        <AnimatePresence>
                          {expandedPatterns[idx] && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-app-bg p-4 rounded-xl space-y-3 border border-app-border mt-2">
                                {pattern.examples.map((ex, i) => (
                                  <div key={i} className="flex gap-3 text-sm text-app-text-dim italic italic-serif:font-serif">
                                    <span className="text-app-accent/50 font-bold font-mono">#{i + 1}</span>
                                    <p className="">{ex}</p>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "notes" && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-app-surface p-12 rounded-3xl border border-app-border shadow-xl max-w-3xl mx-auto min-h-[600px] relative overflow-hidden text-app-text-main"
                >
                  {/* Paper Texture Decor */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-app-bg -mr-16 -mt-16 rotate-45 border-b border-l border-app-border" />
                  
                  <div className="relative mb-12">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-accent mb-2">Automated Study Plan</p>
                    <h2 className="text-4xl font-black text-app-text-main tracking-tight">Placement Summary</h2>
                    <div className="h-1 w-20 bg-app-accent mt-4 rounded-full" />
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-lg font-bold text-app-text-main mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        Strategic Focus Areas
                      </h3>
                      <div className="grid gap-4">
                        {analysis.importantNotes.map((note, idx) => (
                          <div key={idx} className="flex items-start gap-4 group">
                            <div className="w-6 h-6 rounded-full border-2 border-app-border flex-shrink-0 flex items-center justify-center mt-0.5 group-hover:border-app-accent transition-colors">
                              <span className="text-[10px] font-bold text-app-text-dim group-hover:text-app-accent">{idx + 1}</span>
                            </div>
                            <p className="text-app-text-dim leading-relaxed italic-serif:font-serif group-hover:text-app-text-main transition-colors">{note}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="bg-app-accent-muted p-8 rounded-2xl border border-app-accent/20">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-app-accent mb-4 opacity-70">Company Specific Prediction</h3>
                      <p className="text-app-text-main italic italic-serif:font-serif leading-relaxed">
                        Based on the pattern trend analysis, there is a <span className="text-app-accent font-bold">78% probability</span> of seeing variation on 
                        {analysis.topics[0]?.name} and {analysis.topics[1]?.name || "linked concepts"} in your upcoming rounds.
                      </p>
                    </section>
                  </div>

                  <div className="mt-16 pt-8 border-t border-app-border flex items-center justify-between text-[10px] text-app-text-dim font-bold tracking-widest uppercase">
                    <button 
                      onClick={exportNotes}
                      className="flex items-center gap-1 hover:text-app-accent transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export as Text
                    </button>
                    <span>Generated by Placement Analyzer Engine</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </motion.div>
              )}

              {activeTab === "mocktest" && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-4xl mx-auto space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-black text-app-text-main">Practice Arena</h2>
                      <p className="text-app-text-dim text-sm font-medium mt-1">Simulate the real test environment based on your current materials.</p>
                    </div>
                    <button 
                      onClick={generateMockTest}
                      disabled={isGeneratingTest}
                      className="bg-app-accent text-app-bg px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-app-accent/20 active:scale-95 group"
                    >
                      <Zap className="w-5 h-5 group-hover:animate-pulse" />
                      {isGeneratingTest ? "Crafting Questions..." : "Generate New Blitz Test"}
                    </button>
                  </div>

                  {mockTest && mockTest.length > 0 ? (
                    <div className="space-y-6">
                      {mockTest.map((q, idx) => (
                        <div key={q.id} className="bg-app-surface p-8 rounded-2xl border border-app-border shadow-sm group hover:border-app-accent/30 transition-colors">
                          <div className="flex items-start gap-4 mb-6">
                            <span className="w-8 h-8 rounded-lg bg-app-bg border border-app-border flex items-center justify-center text-xs font-black text-app-accent shadow-sm">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <span className={cn(
                                "text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded bg-app-bg border mb-3 inline-block",
                                q.type === "mcq" ? "text-app-accent border-app-accent/20" : "text-pink-400 border-pink-400/20"
                              )}>
                                {q.type === "mcq" ? "Multiple Choice" : "Coding Challenge"}
                              </span>
                              <h3 className="text-lg font-bold text-app-text-main leading-tight mb-4">
                                {q.question}
                              </h3>

                              {q.options && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                  {q.options.map((option, optIdx) => (
                                    <div 
                                      key={optIdx}
                                      className="bg-app-bg border border-app-border px-4 py-3 rounded-xl text-sm font-medium hover:border-app-accent/50 transition-colors cursor-pointer group/opt flex items-center gap-3"
                                    >
                                      <span className="w-5 h-5 rounded-md bg-app-surface border border-app-border flex items-center justify-center text-[10px] text-app-text-dim group-hover/opt:text-app-accent group-hover/opt:border-app-accent transition-colors">
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      {option}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="pt-4 border-t border-app-border/50">
                                <button 
                                  onClick={() => toggleAnswer(q.id)}
                                  className="text-xs font-black text-app-accent uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                                >
                                  {revealedAnswers[q.id] ? "Hide Answer" : "Reveal Solution"}
                                  <ChevronRight className={cn("w-3 h-3 transition-transform", revealedAnswers[q.id] && "rotate-90")} />
                                </button>
                                
                                <AnimatePresence>
                                  {revealedAnswers[q.id] && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="mt-4 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                          <ClipboardCheck className="w-4 h-4 text-emerald-500" />
                                          <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">Correct Answer</span>
                                        </div>
                                        <p className="text-sm font-bold text-app-text-main mb-3">{q.answer}</p>
                                        {q.explanation && (
                                          <div className="pt-3 border-t border-emerald-500/10">
                                            <p className="text-xs text-app-text-dim leading-relaxed">
                                              <span className="font-bold opacity-70">EXPLANATION:</span> {q.explanation}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-app-surface p-20 rounded-2xl border border-app-border border-dashed text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-app-bg rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                        <ClipboardCheck className="w-8 h-8 text-app-border" />
                      </div>
                      <h3 className="text-xl font-bold text-app-text-main mb-2">No Test Generated</h3>
                      <p className="text-app-text-dim text-sm max-w-sm mx-auto leading-relaxed italic-serif:font-serif">
                        Analyze your documents first, then click the button above to create a custom practice blitz.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
              {activeTab === "links" && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-4xl mx-auto space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-black text-app-text-main">External Resources</h2>
                      <p className="text-app-text-dim text-sm font-medium mt-1">Found links and external sources mentioned in your papers.</p>
                    </div>
                  </div>

                  {analysis.links && analysis.links.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {analysis.links.map((link, idx) => (
                        <div key={idx} className="bg-app-surface p-6 rounded-2xl border border-app-border group hover:border-app-accent/30 transition-all hover:translate-y-[-2px] shadow-sm">
                          <div className="flex items-start justify-between mb-4">
                            <div className="w-10 h-10 bg-app-bg rounded-xl flex items-center justify-center border border-app-border group-hover:border-app-accent/20 transition-colors">
                              <ExternalLink className="w-5 h-5 text-app-accent" />
                            </div>
                            <a 
                              href={link.url.startsWith('http') ? link.url : `https://${link.url}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-app-accent text-app-bg text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"
                            >
                              Open <ChevronRight className="w-3 h-3" />
                            </a>
                          </div>
                          
                          <h4 className="font-bold text-app-text-main text-lg mb-2 line-clamp-1">{link.title || link.url}</h4>
                          <p className="text-xs text-app-text-dim leading-relaxed mb-4 italic italic-serif:font-serif">
                            "{link.context}"
                          </p>
                          
                          <p className="text-[10px] font-mono text-app-accent/70 truncate border-t border-app-border pt-3">
                            {link.url}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-app-surface p-20 rounded-2xl border border-app-border border-dashed text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-app-bg rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                        <ExternalLink className="w-8 h-8 text-app-border" />
                      </div>
                      <h3 className="text-xl font-bold text-app-text-main mb-2">No Links Found</h3>
                      <p className="text-app-text-dim text-sm max-w-sm mx-auto leading-relaxed italic-serif:font-serif">
                        No external URLs or resource links were identified in the analyzed documents.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
              {activeTab === "external" && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-4xl mx-auto space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-black text-app-text-main">External Practice Blitz</h2>
                      <p className="text-app-text-dim text-sm font-medium mt-1">Questions from outside your docs, curated by AI to match your patterns.</p>
                    </div>
                  </div>

                  {analysis.externalQuestions && analysis.externalQuestions.length > 0 ? (
                    <div className="space-y-12">
                      {Object.entries(
                        analysis.externalQuestions.reduce((acc, eq) => {
                          const topic = eq.topic || "General";
                          if (!acc[topic]) acc[topic] = [];
                          acc[topic].push(eq);
                          return acc;
                        }, {} as Record<string, typeof analysis.externalQuestions>)
                      ).map(([topic, questions]) => (
                        <div key={topic} className="space-y-6">
                          <div className="flex items-center gap-4">
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-app-accent flex-shrink-0">{topic}</h3>
                            <div className="h-[1px] bg-app-border w-full"></div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-6">
                            {questions?.map((eq, idx) => (
                              <div key={idx} className="bg-app-surface p-8 rounded-2xl border border-app-border group hover:border-app-accent/30 transition-all shadow-sm">
                                <div className="flex items-start gap-6">
                                  <div className="w-12 h-12 bg-app-bg rounded-xl flex items-center justify-center border border-app-border group-hover:border-app-accent/20 transition-colors shrink-0">
                                    <BrainCircuit className="w-6 h-6 text-app-accent" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-3">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
                                        {eq.source_type}
                                      </span>
                                      <span className="text-[10px] font-bold text-app-text-dim uppercase tracking-widest">
                                        Similar to: <span className="text-app-accent">{eq.similar_to}</span>
                                      </span>
                                    </div>
                                    <h4 className="font-bold text-app-text-main text-lg leading-relaxed">{eq.question}</h4>
                                    
                                    <div className="mt-6 pt-6 border-t border-app-border flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-app-text-dim uppercase tracking-widest">Global Pattern Match</p>
                                      <button 
                                        onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(eq.question + " solution")}`, '_blank')}
                                        className="text-xs font-black text-app-accent uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                                      >
                                        Search Solution <ChevronRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-app-surface p-20 rounded-2xl border border-app-border border-dashed text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-app-bg rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                        <TrendingUp className="w-8 h-8 text-app-border" />
                      </div>
                      <h3 className="text-xl font-bold text-app-text-main mb-2">Analysis Needed</h3>
                      <p className="text-app-text-dim text-sm max-w-sm mx-auto leading-relaxed italic-serif:font-serif">
                        Run the AI analysis to discover similar questions from external coding platforms and career rounds.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Chat Panel */}
      <aside className="w-96 bg-app-surface border-l border-app-border flex flex-col shadow-sm relative">
        <div className="p-6 border-b border-app-border flex items-center justify-between bg-app-bg/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-accent rounded-xl flex items-center justify-center shadow-lg shadow-app-accent/10">
              <MessageSquare className="w-5 h-5 text-app-bg" />
            </div>
            <div>
              <h3 className="font-bold text-app-text-main">Ask Placement Analyzer</h3>
              <p className="text-[10px] font-bold text-app-accent leading-none uppercase tracking-widest mt-1 animate-pulse">Assistant Active</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button 
                onClick={clearChatHistory}
                className="p-2 hover:bg-red-500/10 text-app-text-dim hover:text-red-400 rounded-lg transition-all"
                title="Clear Chat History"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button className="p-2 hover:bg-app-bg rounded-lg transition-colors border border-transparent hover:border-app-border">
              <Settings className="w-4 h-4 text-app-text-dim" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-app-bg/10">
          {messages.length === 0 && (
            <div className="text-center py-10 opacity-30">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-app-border" />
              <p className="text-sm font-medium text-app-text-dim">Ask about specific topics,<br/>company trends, or your uploaded notes.</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={cn(
                "flex flex-col gap-2 max-w-[85%]",
                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
      <div 
        className={cn(
          "p-4 rounded-2xl text-sm shadow-sm",
          msg.role === "user" 
            ? "bg-app-accent text-app-bg rounded-tr-none font-bold" 
            : "bg-app-bg text-app-text-main border border-app-border rounded-tl-none italic-serif:font-serif"
        )}
      >
        {msg.role === "user" ? (
          msg.content
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
              <span className="text-[10px] font-bold text-app-text-dim uppercase tracking-widest px-2">
                {msg.role === "user" ? "You" : "Placement Analyzer"}
              </span>
            </div>
          ))}
          
          {isChatting && (
            <div className="flex flex-col gap-2 max-w-[85%] items-start">
              <div className="bg-app-bg p-4 rounded-2xl rounded-tl-none border border-app-border shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-app-accent animate-spin" />
                <span className="text-xs text-app-text-dim font-medium">Processing...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-app-surface border-t border-app-border">
          <form onSubmit={handleChat} className="relative">
            <input 
              type="text" 
              placeholder="Ask about your papers..." 
              className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-app-accent transition-all outline-none pr-12 text-app-text-main"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
            />
            <button 
              type="submit"
              disabled={!inputMessage.trim() || isChatting}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-app-accent text-app-bg rounded-lg hover:opacity-90 disabled:opacity-30 transition-all shadow-md active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-center text-app-text-dim mt-4 uppercase tracking-tighter">Powered by Gemini Large Language Model</p>
        </div>
      </aside>
    </div>
  );
}

