import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Cấu hình worker cho pdfjs - Sử dụng Vite để bundle worker cục bộ
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;


export const parseFileToText = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  try {
    if (extension === 'docx') {
      return await parseDocx(file);
    } else if (extension === 'pdf') {
      return await parsePdf(file);
    } else if (extension === 'txt') {
      return await file.text();
    }
  } catch (error: any) {
    console.error(`Error parsing ${extension || 'unknown'} file:`, error);
    throw new Error(`Lỗi khi đọc file ${(extension || 'không xác định').toUpperCase()}: ${error.message || 'Lỗi không xác định'}`);
  }


  throw new Error('Định dạng file không được hỗ trợ. Vui lòng chọn DOCX hoặc PDF.');
};

const parseDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
};

const parsePdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Nạp PDF với cấu hình đầy đủ hơn
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
    standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/standard_fonts/`
  });
  
  const pdf = await loadingTask.promise;
  let html = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    // Ghép các dòng text, giữ khoảng cách cơ bản
    let lastY = -1;
    let pageText = '';
    
    for (const item of content.items as any[]) {
      const str = item.str || '';
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += '<br/>';
      }
      pageText += str + ' ';
      lastY = item.transform[5];
    }
    
    html += `<div>${pageText}</div><hr/>`;
  }
  
  return html;
};


