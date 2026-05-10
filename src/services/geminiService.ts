import { GoogleGenerativeAI } from '@google/generative-ai';

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Thuật toán tách theo Phần (Section) và Câu hỏi (Block):
 * Cho phép trộn độc lập từng phần mà không làm lộn xộn cấu trúc tổng thể.
 */
interface Section {
  titleHtml: string;
  blocks: string[];
}

const advancedSectionSplit = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  
  const children = Array.from(div.children);
  const sections: Section[] = [];
  let headerHtml = '';
  
  let currentSectionTitle = '';
  let currentBlocks: string[] = [];
  let foundFirstSection = false;
  let currentBlock = '';

  children.forEach((child) => {
    const text = (child.textContent || '').trim();
    // Phát hiện bắt đầu một PHẦN mới (Ví dụ: PHẦN I, PHẦN II, PHẦN TỰ LUẬN...)
    const isSectionStart = /^\s*(PHẦN|PART)\s+[I|V|X|L|\d+]/i.test(text);
    const isQuestionStart = /^\s*(Câu|Question)\s+\d+[:.]/i.test(text);

    if (isSectionStart) {
      if (foundFirstSection) {
        if (currentBlock) currentBlocks.push(currentBlock);
        sections.push({ titleHtml: currentSectionTitle, blocks: currentBlocks });
      }
      foundFirstSection = true;
      currentSectionTitle = child.outerHTML;
      currentBlocks = [];
      currentBlock = '';
    } else if (isQuestionStart) {
      if (!foundFirstSection) {
         // Trường hợp đề không có chữ PHẦN, tự tạo phần ảo
         foundFirstSection = true;
         currentSectionTitle = '<div style="display:none"></div>';
      }
      if (currentBlock) currentBlocks.push(currentBlock);
      currentBlock = child.outerHTML;
    } else {
      if (!foundFirstSection) {
        headerHtml += child.outerHTML;
      } else {
        if (!currentBlock) {
           // Nội dung mô tả dưới tên Phần
           currentSectionTitle += child.outerHTML;
        } else {
           currentBlock += child.outerHTML;
        }
      }
    }
  });

  // Đóng phần cuối cùng
  if (currentBlock) currentBlocks.push(currentBlock);
  if (foundFirstSection) {
    sections.push({ titleHtml: currentSectionTitle, blocks: currentBlocks });
  }

  return { headerHtml, sections };
};

interface QuestionData {
  original_id: number;
  question_html: string;
  shuffled_options: string[];
  new_correct_answer: string;
}




const formatOptionsToTable = (options: string[]) => {
  if (!options || options.length !== 4) return '';

  // Ước tính độ dài để quyết định số cột (1, 2 hoặc 4)
  const maxLen = Math.max(...options.map(o => {
    const tmp = document.createElement('div');
    tmp.innerHTML = o;
    return (tmp.textContent || '').length;
  }));

  let cols = 1;
  if (maxLen < 15) cols = 4;
  else if (maxLen < 40) cols = 2;

  let tableHtml = '<table style="width: 100%; border-collapse: collapse; border: none; margin-top: 8px; margin-bottom: 12px; font-family: Times New Roman, serif;">';
  const labels = ['A', 'B', 'C', 'D'];

  if (cols === 4) {
    tableHtml += '<tr>';
    options.forEach((opt, i) => {
      tableHtml += `<td style="width: 25%; vertical-align: top; padding: 2px; border: none;">${labels[i]}. ${opt}</td>`;
    });
    tableHtml += '</tr>';
  } else if (cols === 2) {
    tableHtml += '<tr>';
    tableHtml += `<td style="width: 50%; vertical-align: top; padding: 2px; border: none;">A. ${options[0]}</td>`;
    tableHtml += `<td style="width: 50%; vertical-align: top; padding: 2px; border: none;">B. ${options[1]}</td>`;
    tableHtml += '</tr><tr>';
    tableHtml += `<td style="width: 50%; vertical-align: top; padding: 2px; border: none;">C. ${options[2]}</td>`;
    tableHtml += `<td style="width: 50%; vertical-align: top; padding: 2px; border: none;">D. ${options[3]}</td>`;
    tableHtml += '</tr>';
  } else {
    options.forEach((opt, i) => {
      tableHtml += `<tr><td style="width: 100%; vertical-align: top; padding: 2px; border: none;">${labels[i]}. ${opt}</td></tr>`;
    });
  }

  tableHtml += '</table>';
  return tableHtml;
};

export const extractSingleExam = async (
  apiKey: string,
  testContent: string,
  examIndex: number
): Promise<string> => {
  try {
    const { headerHtml, sections } = advancedSectionSplit(testContent);
    
    if (sections.length === 0) {
       return runDirectAiShuffle(apiKey, testContent, examIndex);
    }

    // Chuẩn bị dữ liệu gửi cho AI (gửi full content để AI phân tích)
    const sectionData = sections.map((sec, sIdx) => ({
       sIdx,
       blocks: sec.blocks.map((b, bIdx) => ({ id: bIdx, html: b }))
    }));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview', // Cập nhật lên bản Gemini 3 mới nhất cho năm 2026
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Bạn là chuyên gia giáo dục phụ trách giải đề và trộn đề cho ĐỀ SỐ ${examIndex}.
Nhiệm vụ:
1. Phân tích nội dung HTML của từng câu hỏi để tách riêng: 
   - Phần dẫn (question_html): Nội dung từ đầu câu đến trước các phương án.
   - Các phương án (shuffled_options): Danh sách 4 nội dung của A, B, C, D (KHÔNG bao gồm chữ cái "A.", "B." và nhãn ở đầu).
2. Tự giải từng câu để xác định đáp án đúng gốc.
3. Trộn ngẫu nhiên thứ tự các câu hỏi trong mỗi phần.
4. Trộn ngẫu nhiên vị trí các phương án A, B, C, D trong từng câu hỏi trắc nghiệm.
5. Cập nhật đáp án đúng tương ứng sau khi đã trộn phương án.

Dữ liệu đầu vào: ${JSON.stringify(sectionData)}

Yêu cầu trả về JSON chính xác:
{
  "shuffled_sections": [
     {
       "sIdx": 0,
       "questions": [
         {
           "original_id": 0,
           "question_html": "...",
           "shuffled_options": ["nội dung A mới", "nội dung B mới", "nội dung C mới", "nội dung D mới"],
           "new_correct_answer": "A"
         }
       ]
     }
  ]
}
Lưu ý: 
- Nếu không phải trắc nghiệm 4 lựa chọn, hãy để shuffled_options là [] và question_html là toàn bộ nội dung câu đó.
- Giữ nguyên các thẻ HTML quan trọng (img, sub, sup, b, i...).
- Phải trả về ĐÚNG 4 phương án cho câu trắc nghiệm.`;

    const result = await model.generateContent(prompt);
    const responseText = (await result.response).text();
    const resultJson = JSON.parse(responseText.replace(/```json|```/g, ''));

    let finalHtml = headerHtml;
    const code = 100 + examIndex;
    
    // Cập nhật các nhãn "Đề số" cũ nếu có trong header gốc
    finalHtml = finalHtml.replace(/(ĐỀ\s+SỐ|Đề\s+số|Đề\s+Số|Mã\s+đề|MÃ\s+ĐỀ)\s*[:.]?\s*\d*/gi, "");

    // Tạo Header mới cực kỳ rõ ràng ở đầu trang
    const boldHeader = `
      <div style="font-family: 'Times New Roman', serif; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; border: none;">
          <tr>
            <td style="width: 60%; text-align: left; font-size: 14pt; font-weight: bold; text-transform: uppercase;">
              ĐỀ KIỂM TRA HỌC KỲ - ĐỀ SỐ ${examIndex}
            </td>
            <td style="width: 40%; text-align: right; font-size: 14pt; font-weight: bold;">
              MÃ ĐỀ: ${code}
            </td>
          </tr>
        </table>
        <div style="border-bottom: 2px solid black; margin-top: 5px; margin-bottom: 15px;"></div>
      </div>
    `;
    
    finalHtml = boldHeader + finalHtml;
    
    let answerKeyHtml = '<div style="page-break-before: always; border-top: 2px solid #000; margin-top:30px; font-family: Times New Roman, serif; padding-top: 20px;">';
    answerKeyHtml += `<h2 style="text-align:center; color: #b91c1c; font-size: 18pt;">BẢNG ĐÁP ÁN ĐỀ SỐ ${examIndex} - MÃ ĐỀ: ${code}</h2>`;
    answerKeyHtml += `<table class="bordered-table" style="width:100%; border-collapse:collapse; text-align:center; margin-top: 15px;"><tr><th style="background: #f3f4f6; padding: 8px;">Câu</th><th style="background: #f3f4f6; padding: 8px;">Đáp án</th></tr>`;

    let globalQIdx = 1;

    sections.forEach((sec, sIdx) => {
       const shuffleInfo = resultJson.shuffled_sections?.find((s: any) => s.sIdx === sIdx);
       finalHtml += sec.titleHtml;
       
       if (shuffleInfo && shuffleInfo.questions) {
         shuffleInfo.questions.forEach((q: QuestionData) => {
            let qHtml = q.question_html;
            // Cập nhật số thứ tự câu
            qHtml = qHtml.replace(/(Câu|Question)\s+\d+[:.]/gi, `$1 ${globalQIdx}:`);
            
            finalHtml += `<div class="question-block" style="margin-bottom: 15px;">${qHtml}`;
            
            if (q.shuffled_options && q.shuffled_options.length === 4) {
               finalHtml += formatOptionsToTable(q.shuffled_options);
            }
            
            finalHtml += `</div>`;

            const ans = q.new_correct_answer || " - ";
            answerKeyHtml += `<tr><td style="padding: 5px;">${globalQIdx}</td><td style="padding: 5px;"><b>${ans}</b></td></tr>`;
            globalQIdx++;
         });
       } else {
         // Fallback nếu AI không trả về đúng cấu trúc
         sec.blocks.forEach((b) => {
            finalHtml += b.replace(/(Câu|Question)\s+\d+[:.]/gi, `$1 ${globalQIdx}:`);
            globalQIdx++;
         });
       }
    });

    answerKeyHtml += '</table></div>';
    return finalHtml + answerKeyHtml;


  } catch (error: any) {
    console.error('Error detail:', error);
    const errStr = (error?.message || error?.toString() || '').toLowerCase();
    if (
      errStr.includes('429') || 
      errStr.includes('quota') || 
      errStr.includes('exhausted') || 
      errStr.includes('limit') ||
      errStr.includes('403')
    ) {
      throw new QuotaExceededError('Hết Quota API (429/403). Vui lòng nạp API Key mới để tiếp tục.');
    }
    throw error;
  }
};

const runDirectAiShuffle = async (apiKey: string, content: string, _index: number) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const prompt = `Hoán vị đề sau, giữ HTML và đặt các lựa chọn trong bảng: ${content.substring(0, 10000)}`;
  const result = await model.generateContent(prompt);
  return (await result.response).text();
};


