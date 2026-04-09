import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Upload, Image as ImageIcon, FileText, Download, Sparkles, Loader2, Scissors } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// Setup PDF.js worker using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function App() {
  const [flyerImg, setFlyerImg] = useState<string | null>(null);
  const [obiImg, setObiImg] = useState<string | null>(null);
  const [cropPercent, setCropPercent] = useState<number>(75); // Default crop at 75% height
  const [mergedImg, setMergedImg] = useState<string | null>(null);
  
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiText, setAiText] = useState<string>('');

  const flyerInputRef = useRef<HTMLInputElement>(null);
  const obiInputRef = useRef<HTMLInputElement>(null);

  // Handle Flyer Upload (PDF or Image)
  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsProcessingPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // High res for better quality
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setFlyerImg(canvas.toDataURL('image/jpeg', 0.9));
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

  // Generate Merged Image
  useEffect(() => {
    const generateMerged = async () => {
      if (!flyerImg || !obiImg) return;
      
      const flyer = new Image();
      flyer.src = flyerImg;
      await new Promise(r => flyer.onload = r);

      const obi = new Image();
      obi.src = obiImg;
      await new Promise(r => obi.onload = r);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const cropY = flyer.height * (cropPercent / 100);
      
      // Calculate Obi scaled height to match Flyer width
      const obiScale = flyer.width / obi.width;
      const obiScaledHeight = obi.height * obiScale;

      canvas.width = flyer.width;
      canvas.height = cropY + obiScaledHeight;

      // Draw Flyer (cropped)
      ctx.drawImage(flyer, 0, 0, flyer.width, cropY, 0, 0, flyer.width, cropY);
      
      // Draw Obi
      ctx.drawImage(obi, 0, cropY, flyer.width, obiScaledHeight);

      setMergedImg(canvas.toDataURL('image/jpeg', 0.9));
    };

    generateMerged();
  }, [flyerImg, obiImg, cropPercent]);

  // Download Merged Image
  const handleDownload = () => {
    if (!mergedImg) return;
    const link = document.createElement('a');
    link.href = mergedImg;
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
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = flyerImg.split(',')[1];
      
      const prompt = `あなたはプロの不動産仲介エージェントです。
提供された不動産図面（マイソク）の画像を読み取り、以下の2つのフォーマットで魅力的な募集文案を作成してください。

1. 【Uchi等のポータルサイト用】
- 物件の基本情報（家賃、管理費、敷金・礼金、間取り、面積、駅からの徒歩分数、築年数など）を正確に抽出して箇条書きにしてください。
- ターゲット層（単身、ファミリーなど）に向けた魅力的なアピールポイントを3〜4行で書いてください。

2. 【SNS（小紅書/Twitter/朋友圈）用】
- 絵文字を適度に使い、目を引くキャッチーなタイトルをつけてください。
- 初期費用の安さや、デザイン性、立地など、一番のウリを強調してください。
- 最後に「詳細はDMで！」などのCall to Actionを入れてください。
- 関連するハッシュタグ（#東京賃貸 #お部屋探し など）を5つ程度つけてください。`;

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
        <div className="text-sm text-gray-500">
          帯替え & AI文案生成ツール
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
                    切り取り位置の調整 (上から {cropPercent}%)
                  </label>
                </div>
                
                <div className="flex gap-4 mt-2">
                  {/* Vertical Slider */}
                  <div className="flex flex-col items-center py-4 h-[500px] w-12 bg-gray-50 rounded-lg border border-gray-200 shrink-0">
                    <span className="text-xs text-gray-500 font-medium mb-4">50%</span>
                    <div className="relative flex-1 w-full flex items-center justify-center">
                      <input 
                        type="range" 
                        min="50" 
                        max="100" 
                        value={cropPercent} 
                        onChange={(e) => setCropPercent(Number(e.target.value))}
                        className="w-[380px] h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600 rotate-90 absolute origin-center"
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-medium mt-4">100%</span>
                  </div>

                  {/* Visual Preview */}
                  <div className="flex-1 border rounded-lg overflow-y-auto bg-gray-100 relative max-h-[500px]">
                    {mergedImg ? (
                      <img src={mergedImg} alt="Merged Preview" className="w-full h-auto block" />
                    ) : (
                      <div className="relative w-full">
                        <img src={flyerImg} alt="Flyer Preview" className="w-full h-auto block opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="bg-white/80 px-3 py-1 rounded text-sm font-medium">帯画像をアップロードしてください</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {mergedImg && (
                  <button 
                    onClick={handleDownload}
                    className="mt-2 w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    合成画像をダウンロード
                  </button>
                )}
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
            <button 
              onClick={generateCopy}
              disabled={!flyerImg || isGenerating}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  文案を生成する
                </>
              )}
            </button>
          </div>
          
          <div className="p-5 flex-1 flex flex-col">
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
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="bg-amber-50 p-4 rounded-full mb-4">
                  <Sparkles className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-gray-900 font-medium mb-2">AIが図面から情報を自動抽出</h3>
                <p className="text-gray-500 text-sm">
                  左側で図面をアップロードした後、「文案を生成する」ボタンをクリックすると、UchiやSNS向けの魅力的な紹介文をAIが自動で作成します。
                </p>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
