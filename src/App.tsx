import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Upload, Image as ImageIcon, FileText, Download, Sparkles, Loader2, Scissors, Trash2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { Rnd } from 'react-rnd';

// Setup PDF.js worker using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function App() {
  const [flyerImg, setFlyerImg] = useState<string | null>(null);
  const [obiImg, setObiImg] = useState<string | null>(null);
  
  // Draggable Obi Box State (percentages)
  const [obiRect, setObiRect] = useState({ x: 0, y: 80, width: 100, height: 20 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiText, setAiText] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');

  const flyerInputRef = useRef<HTMLInputElement>(null);
  const obiInputRef = useRef<HTMLInputElement>(null);

  // Save API key to local storage
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  }, [apiKey]);

  // Reset all inputs
  const handleReset = () => {
    if (window.confirm('アップロードした画像と生成された文案をクリアしますか？')) {
      setFlyerImg(null);
      setObiImg(null);
      setAiText('');
      setCustomPrompt('');
      if (flyerInputRef.current) flyerInputRef.current.value = '';
      if (obiInputRef.current) obiInputRef.current.value = '';
    }
  };

  // Update container size for Rnd positioning
  useEffect(() => {
    const updateSize = () => {
      if (previewContainerRef.current) {
        setContainerSize({
          width: previewContainerRef.current.clientWidth,
          height: previewContainerRef.current.clientHeight
        });
      }
    };
    
    // Small delay to ensure image is rendered
    const timer = setTimeout(updateSize, 100);
    window.addEventListener('resize', updateSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSize);
    };
  }, [flyerImg]);

  // Handle Flyer Upload (PDF or Image)
  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsProcessingPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Configure PDF.js for Japanese fonts and complex embedded images
        const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`;
        const STANDARD_FONTS_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;
        
        const pdf = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONTS_URL
        }).promise;
        
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // High res for better quality
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setFlyerImg(canvas.toDataURL('image/jpeg', 0.9));
        // Reset Obi box to bottom 20% full width
        setObiRect({ x: 0, y: 80, width: 100, height: 20 });
      } catch (error) {
        console.error('Error reading PDF:', error);
        alert('PDFの読み込みに失敗しました。');
      } finally {
        setIsProcessingPdf(false);
      }
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFlyerImg(event.target?.result as string);
        setObiRect({ x: 0, y: 80, width: 100, height: 20 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Obi Upload (Image)
  const handleObiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setObiImg(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Download Merged Image
  const handleDownload = async () => {
    if (!flyerImg) return;
    
    const flyer = new Image();
    flyer.src = flyerImg;
    await new Promise(r => flyer.onload = r);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = flyer.width;
    canvas.height = flyer.height;

    // Draw Flyer
    ctx.drawImage(flyer, 0, 0, flyer.width, flyer.height);

    const x = flyer.width * (obiRect.x / 100);
    const y = flyer.height * (obiRect.y / 100);
    const w = flyer.width * (obiRect.width / 100);
    const h = flyer.height * (obiRect.height / 100);

    // Draw Obi or White Box
    if (obiImg) {
      const obi = new Image();
      obi.src = obiImg;
      await new Promise(r => obi.onload = r);
      ctx.drawImage(obi, x, y, w, h);
    } else {
      // White eraser box if no obi is uploaded
      ctx.fillStyle = 'white';
      ctx.fillRect(x, y, w, h);
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.download = `property_flyer_${new Date().getTime()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate AI Copy
  const generateCopy = async () => {
    if (!flyerImg) {
      alert('先に物件の図面（マイソク）をアップロードしてください。');
      return;
    }
    
    // Use user-provided API key or fallback to environment variable (for AI Studio preview)
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!activeApiKey) {
      alert('Gemini API Key を入力してください。');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: activeApiKey });
      const base64Data = flyerImg.split(',')[1];
      
      let prompt = `あなたはプロの不動産仲介エージェントです。\n提供された不動産図面（マイソク）の画像を読み取り、`;
      
      if (customPrompt.trim()) {
        prompt += `以下の特別な指示に従って魅力的な募集文案を作成してください。\n\n【特別指示】\n${customPrompt}`;
      } else {
        prompt += `以下の3つの言語・フォーマットで魅力的な募集文案を作成してください。

---
1. 🇯🇵 【日本語】ポータルサイト＆SNS用
- 物件の基本情報（価格/家賃、管理費、敷金・礼金、間取り、面積、駅からの徒歩分数、築年数など）を正確に抽出して箇条書きにしてください。
- ターゲット層に向けた魅力的なアピールポイントを3〜4行で書いてください。
- 関連するハッシュタグをつけてください。

---
2. 🇨🇳 【中文】小红书 / 朋友圈 / 微信客户群用
- 提取核心物件信息（价格/租金、初期费用、面积、距车站距离、建年等）。
- 结合中国客户的喜好（如：采光好、近车站、干湿分离、新建、高性价比等），写一段带Emoji的、吸引人的种草文案。
- 加上引导语（如：“欢迎私信咨询详情”）。
- 加上相关Hashtag（如 #日本房产 #东京租房 #买房 等）。

---
3. 🇺🇸 【English】Global Clients / Facebook / Instagram
- Extract key property details (Price/Rent, Layout, Size, Distance to station, Year built).
- Write a short, catchy, and professional description highlighting the best features.
- Include a Call to Action (e.g., "DM for more details!").
- Add relevant hashtags.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
            ]
          }
        ]
      });
      
      setAiText(response.text || '');
    } catch (error) {
      console.error(error);
      setAiText('エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">不動産マーケティング Studio</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <span className="text-xs font-medium text-gray-500">API Key:</span>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Gemini API Key を入力"
              className="bg-transparent border-none focus:ring-0 text-sm w-48 text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>
          <div className="text-sm text-gray-500 hidden md:block">
            帯替え & AI文案生成ツール
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Image Processing */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-500" />
              1. 帯替え（画像合成）
            </h2>
            {flyerImg && (
              <button 
                onClick={handleReset}
                className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1 font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                やり直す
              </button>
            )}
          </div>
          
          <div className="p-5 flex-1 flex flex-col gap-6">
            {/* Upload Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => flyerInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors"
              >
                <input 
                  type="file" 
                  ref={flyerInputRef} 
                  onChange={handleFlyerUpload} 
                  accept="image/*,application/pdf" 
                  className="hidden" 
                />
                {isProcessingPdf ? (
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
                ) : (
                  <FileText className="w-6 h-6 text-gray-400 mb-2" />
                )}
                <span className="text-sm font-medium text-gray-700">元図面をアップロード</span>
                <span className="text-xs text-gray-400 mt-1">PDF または 画像</span>
                <span className="text-[10px] text-amber-500 mt-1 text-center">※PDFの写真が空白になる場合は<br/>画像(JPG/PNG)でお試しください</span>
              </div>

              <div 
                onClick={() => obiInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-green-50 hover:border-green-400 transition-colors"
              >
                <input 
                  type="file" 
                  ref={obiInputRef} 
                  onChange={handleObiUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <ImageIcon className="w-6 h-6 text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-700">自社帯（名片）をアップ</span>
                <span className="text-xs text-gray-400 mt-1">画像のみ</span>
              </div>
            </div>

            {/* Preview & Crop Area */}
            {flyerImg && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700">
                    帯の配置エリア（ドラッグ＆リサイズで調整）
                  </label>
                </div>
                
                <div className="mt-2 border rounded-lg overflow-hidden bg-gray-100 relative" ref={previewContainerRef}>
                  <img src={flyerImg} alt="Flyer Preview" className="w-full h-auto block" />
                  
                  {containerSize.width > 0 && (
                    <Rnd
                      bounds="parent"
                      position={{
                        x: (obiRect.x / 100) * containerSize.width,
                        y: (obiRect.y / 100) * containerSize.height
                      }}
                      size={{
                        width: `${obiRect.width}%`,
                        height: `${obiRect.height}%`
                      }}
                      onDragStop={(e, d) => {
                        setObiRect(prev => ({ 
                          ...prev, 
                          x: (d.x / containerSize.width) * 100, 
                          y: (d.y / containerSize.height) * 100 
                        }));
                      }}
                      onResizeStop={(e, direction, ref, delta, position) => {
                        setObiRect({
                          x: (position.x / containerSize.width) * 100,
                          y: (position.y / containerSize.height) * 100,
                          width: (ref.offsetWidth / containerSize.width) * 100,
                          height: (ref.offsetHeight / containerSize.height) * 100
                        });
                      }}
                      className="border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(255,255,255,0.4)] flex items-center justify-center overflow-hidden cursor-move group"
                    >
                      {obiImg ? (
                        <img src={obiImg} alt="Obi" className="w-full h-full object-fill" />
                      ) : (
                        <div className="w-full h-full bg-white/90 backdrop-blur-sm flex items-center justify-center">
                          <span className="text-sm font-bold text-blue-600 text-center px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            ここに帯を配置<br/>(または白塗り)
                          </span>
                        </div>
                      )}
                      
                      {/* Resize Handles Indicators */}
                      <div className="absolute top-0 left-0 w-2 h-2 bg-blue-600 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                      <div className="absolute top-0 right-0 w-2 h-2 bg-blue-600 rounded-full translate-x-1/2 -translate-y-1/2"></div>
                      <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-600 rounded-full -translate-x-1/2 translate-y-1/2"></div>
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-600 rounded-full translate-x-1/2 translate-y-1/2"></div>
                    </Rnd>
                  )}
                </div>

                <button 
                  onClick={handleDownload}
                  className="mt-2 w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-5 h-5" />
                  合成画像をダウンロード
                </button>
              </div>
            )}
            
            {!flyerImg && (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <p className="text-gray-400 text-sm">ここにプレビューが表示されます</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: AI Copywriter */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              2. AI 文案自動生成
            </h2>
          </div>
          
          <div className="p-5 flex-1 flex flex-col gap-4">
            {/* Custom Prompt Input */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                AIへの指示（オプション）
              </label>
              <textarea 
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="例: 小紅書向けに中国語だけで書いて / ペット可を一番のウリにして / 英語のみで出力して"
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none text-sm"
                rows={2}
              />
              <button 
                onClick={generateCopy}
                disabled={!flyerImg || isGenerating}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors mt-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    文案を生成する
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 flex flex-col">
              {aiText ? (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-gray-700">生成された文案</label>
                    <button 
                      onClick={() => navigator.clipboard.writeText(aiText)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      コピーする
                    </button>
                  </div>
                  <textarea 
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    className="w-full flex-1 p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm leading-relaxed"
                    placeholder="ここに生成された文案が表示されます..."
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-8">
                  <div className="bg-amber-50 p-4 rounded-full mb-4">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                  </div>
                  <h3 className="text-gray-900 font-medium mb-2">AIが図面から情報を自動抽出</h3>
                  <p className="text-gray-500 text-sm">
                    指示がない場合は、日・中・英の3ヶ国語で文案を作成します。特定のプラットフォーム向けにしたい場合は、上の入力欄に指示を書いてください。
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
