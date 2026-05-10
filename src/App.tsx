import React, { useState, useRef } from 'react';
import { extractSingleExam, QuotaExceededError } from './services/geminiService';
import { parseFileToText } from './utils/fileParser';
import { exportToDocx } from './utils/docxExport';
import { Settings, UploadCloud, RefreshCw, FileText, Download, Check, AlertCircle, Play } from 'lucide-react';

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiModal, setShowApiModal] = useState(!localStorage.getItem('gemini_api_key'));
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  
  const [numExams, setNumExams] = useState(4);
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedExams, setGeneratedExams] = useState<string[]>([]);
  const [error, setError] = useState('');
  
  const [isParsing, setIsParsing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [pendingExamIndex, setPendingExamIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveApiKey = () => {
    setApiKey(tempApiKey);
    localStorage.setItem('gemini_api_key', tempApiKey);
    setShowApiModal(false);
    
    // Resume processing if paused due to quota
    if (isPaused && pendingExamIndex !== null) {
      setError('');
      setIsPaused(false);
      processExamsAsync(pendingExamIndex, tempApiKey, [...generatedExams]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setGeneratedExams([]);
      setIsPaused(false);
      setPendingExamIndex(null);
      setProgressText('');
      setIsParsing(true); // Bắt đầu đọc file
      
      try {
        const text = await parseFileToText(selectedFile);
        if (!text || text.trim().length < 20) {
          throw new Error('File không có nội dung văn bản hoặc không đọc được. Vui lòng thử file khác.');
        }
        setFileContent(text);
      } catch (err: any) {
        setError(err?.message || 'Không thể đọc file. Vui lòng thử lại với file DOCX hoặc PDF mới.');
        setFile(null);
        setFileContent('');
      } finally {
        setIsParsing(false); // Kết thúc đọc
      }
    }
  };


  const processExamsAsync = async (startIndex: number, currentApiKey: string, existingExams: string[]) => {
    setIsProcessing(true);
    setError('');
    let currentArray = [...existingExams];
    
    for (let i = startIndex; i <= numExams; i++) {
      try {
        setProgressText(`Đang xử lý ${i}/${numExams}...`);
        const newExam = await extractSingleExam(currentApiKey, fileContent, i);
        
        currentArray = [...currentArray, newExam];
        setGeneratedExams(currentArray);
        
      } catch (err: any) {
        if (err instanceof QuotaExceededError || err.name === 'QuotaExceededError') {
           setPendingExamIndex(i); // Save where we stopped
           setError('Đã hết Quota API (hoặc quá tải). Quá trình ĐÃ TẠM DỪNG. Vui lòng thiết lập API Key mới để Tiếp Tục công việc mà không bị mất dữ liệu!');
           setIsPaused(true);
           setShowApiModal(true);
           return; // Break out of the loop!
        } else {
           setError(err?.message || 'Có lỗi xảy ra khi kết nối. Kiểm tra lại kết nối mạng hoặc thử lại sau.');
           setIsProcessing(false);
           return;
        }
      }
    }
    
    // Done
    setIsProcessing(false);
    setIsPaused(false);
    setPendingExamIndex(null);
    setProgressText('Hoàn thành!');
  };

  const handleShuffle = () => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }
    if (!fileContent) {
      setError('Vui lòng tải lên một file DOCX hoặc PDF để tiếp tục.');
      return;
    }
    if (numExams < 1 || numExams > 10) {
      setError('Số đề tạo cần nằm trong khoảng từ 1 đến 10.');
      return;
    }

    setGeneratedExams([]);
    setIsPaused(false);
    setPendingExamIndex(null);
    processExamsAsync(1, apiKey, []);
  };

  const handleExport = async (content: string, index: number) => {
    try {
      await exportToDocx(content, `De_Kiem_Tra_Hoan_Vi_${index + 1}`);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xuất file Word.');
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header" style={{ position: 'relative', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>TRỘN ĐỀ AI</h1>
          <p>Hệ thống hoán vị đề kiểm tra thông minh với Gemini Flash 3 Preview</p>
          <p style={{ color: '#b91c1c', fontWeight: 'bold', fontStyle: 'italic', marginTop: '0.25rem', fontSize: '1rem' }}>
            Made by Nguyễn Phi Hùng
          </p>
        </div>
        <button 
          className="btn btn-secondary" 
          style={{ position: 'absolute', right: 0 }}
          onClick={() => setShowApiModal(true)}
        >
          <Settings size={18} /> Cài đặt API
        </button>
      </header>

      {/* Main Panel */}
      <main className="glass-panel">
        <h2>Cấu hình hoán vị</h2>
        
        {/* Error message */}
        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Left Column: Upload */}
          <div style={{ flex: '1 1 300px' }}>
            <div 
              className="file-upload-area" 
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={48} className="file-upload-icon" />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text)', display: 'block', fontSize: '1.1rem' }}>Tải lên đề gốc</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Hỗ trợ định dạng .DOCX và .PDF</span>
              </div>
              {file && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
                  <Check size={16} /> <span>{file.name}</span>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".docx, .pdf" 
              onChange={handleFileChange} 
            />
          </div>

          {/* Right Column: Settings & Actions */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="input-group">
              <label className="input-label">Số lượng đề cần tạo (Max 10)</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={numExams} 
                onChange={(e) => setNumExams(parseInt(e.target.value) || 1)} 
                disabled={isProcessing || isPaused}
              />
            </div>
            
            {progressText && (
              <div style={{ color: 'var(--secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
                {progressText}
              </div>
            )}
            
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
              {isPaused ? (
                 <button 
                   className="btn btn-primary" 
                   style={{ width: '100%', height: '56px', fontSize: '1.2rem', backgroundColor: '#eab308' }}
                   onClick={() => setShowApiModal(true)}
                 >
                   <Play size={24} /> Cập nhật API để Tiếp Tục
                 </button>
              ) : (
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', height: '56px', fontSize: '1.2rem' }}
                  onClick={handleShuffle}
                  disabled={isProcessing || isParsing || !file}
                >
                  {isParsing ? (
                    <> <div className="loader"></div> Đang đọc file... </>
                  ) : isProcessing ? (
                    <> <div className="loader"></div> {progressText || "Đang xử lý..."} </>
                  ) : (
                    <> <RefreshCw size={24} /> Bắt đầu Đảo Đề </>
                  )}
                </button>

              )}
            </div>
          </div>
        </div>
      </main>

      {/* Results Display Area */}
      {generatedExams.length > 0 && (
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2rem' }}>
            <Check className="pulse" color="var(--secondary)" /> Các Đề Đã Được Hoán Vị ({generatedExams.length})
          </h2>
          <div className="results-grid">
            {generatedExams.map((exam, index) => (
              <div key={index} className="exam-card">
                <div className="exam-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--primary)' }}>
                    <FileText size={20} />
                    Đề Hoán Vị {index + 1}
                  </div>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                    onClick={() => handleExport(exam, index)}
                  >
                    <Download size={16} /> XUẤT DOCX
                  </button>
                </div>
                <div className="exam-card-body" dangerouslySetInnerHTML={{ __html: exam.replace(/```html|```/g, '') }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Modal */}
      {showApiModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Cấu hình API Key</h2>
            </div>
            
            {isPaused && (
               <div style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                 <strong>Thông báo:</strong> Tiến trình đang bị Tạm Dừng. Nhập API Key mới để tiếp tục tự động!
               </div>
            )}
            
            <p style={{ marginBottom: '1.5rem' }}>
              Vui lòng nhập <strong style={{ color: 'var(--primary)' }}>Gemini API Key</strong> để sử dụng tính năng trộn đề AI. Nó được lưu cục bộ trên trình duyệt của bạn.
            </p>
            <div className="input-group">
              <label className="input-label">Gemini API Key</label>
              <input 
                type="password" 
                placeholder="AIzaSy..." 
                value={tempApiKey} 
                onChange={(e) => setTempApiKey(e.target.value)} 
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowApiModal(false)}>
                Hủy bỏ
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveApiKey}
                disabled={!tempApiKey.trim()}
              >
                {isPaused ? "Lưu và Tiếp tục chạy" : "Lưu cấu hình"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
