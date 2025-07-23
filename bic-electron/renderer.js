window.addEventListener('DOMContentLoaded', () => {
  const { ipcRenderer } = window;
  const pdfList = document.getElementById('pdfList');
  const signForm = document.getElementById('signForm');
  const resultDiv = document.getElementById('result');

  // Recibe la lista de PDFs desde el proceso principal
  window.electronAPI?.onSetPdfUrls?.((_, pdfs) => {
    renderPdfList(pdfs);
  });

  // Función para renderizar la lista de PDFs como tarjetas con checkbox
  function renderPdfList(pdfs) {
    if (!pdfs || pdfs.length === 0) {
      pdfList.innerHTML = '<div class="text-gray-500">No hay archivos para firmar.</div>';
      return;
    }
    pdfList.innerHTML = pdfs.map((pdf, idx) => `
      <div class="flex items-center bg-gray-100 rounded-lg shadow p-4 mb-3 pdf-item">
        <input type="checkbox" id="pdf-${idx}" name="pdfs" value="${pdf}" class="mr-4 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
        <label for="pdf-${idx}" class="text-gray-800 break-all cursor-pointer">${pdf}</label>
      </div>
    `).join('');
  }

  // Maneja el envío del formulario
  signForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const checkboxes = pdfList.querySelectorAll('input[type="checkbox"]:checked');
    const pdfs = Array.from(checkboxes).map(cb => cb.value);
    if (pdfs.length === 0) {
      resultDiv.innerHTML = '<div class="error text-red-600">Selecciona al menos un archivo para firmar.</div>';
      return;
    }
    resultDiv.innerHTML = '';
    ipcRenderer.send('firmar-pdfs', { pdfs, password });
  });

  // Recibe el resultado de la firma
  ipcRenderer.on('firma-resultado', (event, { success, output, error }) => {
    if (success) {
      resultDiv.innerHTML = `<div class="result text-green-600">${output || 'Firma realizada correctamente.'}</div>`;
    } else {
      resultDiv.innerHTML = `<div class="error text-red-600">${error || 'Error al firmar.'}</div>`;
    }
  });
}); 