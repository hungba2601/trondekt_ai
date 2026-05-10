export const exportToDocx = async (htmlContent: string, fileName: string) => {
  // Loại bỏ các thẻ code bọc ngoài nếu có
  const cleanHtml = htmlContent.replace(/```html|```/g, '');

  const preHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.5; }
        table { border-collapse: collapse; width: 100%; }
        .bordered-table td, .bordered-table th { border: 1px solid black; padding: 5px; }
        .question-block { margin-bottom: 20px; page-break-inside: avoid; }
      </style>
    </head>
    <body>
  `;
  const postHtml = "</body></html>";
  const html = preHtml + cleanHtml + postHtml;

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword'
  });
  
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.doc`;
  
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

