window.addEventListener('DOMContentLoaded', () => {
  const pdfListDiv = document.getElementById('pdfList');
  const signForm = document.getElementById('signForm');
  const resultDiv = document.getElementById('result');
  let pdfUrls = [];

  // Recibe la lista de PDFs desde el proceso principal
  window.electronAPI.onSetPdfUrls((urls) => {
    pdfUrls = urls;
    renderPdfList();
  });

  function renderPdfList() {
    pdfListDiv.innerHTML = '';
    if (pdfUrls.length === 0) {
      pdfListDiv.innerHTML = '<em>No se recibieron archivos PDF.</em>';
      return;
    }
    // Checkbox para seleccionar todos
    const selectAllId = 'selectAll';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAll.id = selectAllId;
    selectAll.addEventListener('change', (e) => {
      document.querySelectorAll('.pdf-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
    const labelAll = document.createElement('label');
    labelAll.htmlFor = selectAllId;
    labelAll.textContent = 'Seleccionar todos';
    pdfListDiv.appendChild(selectAll);
    pdfListDiv.appendChild(labelAll);
    pdfListDiv.appendChild(document.createElement('br'));
    // Lista de PDFs
    pdfUrls.forEach((url, idx) => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'pdf-checkbox';
      checkbox.id = 'pdf_' + idx;
      checkbox.value = url;
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = url;
      const div = document.createElement('div');
      div.className = 'pdf-item';
      div.appendChild(checkbox);
      div.appendChild(label);
      pdfListDiv.appendChild(div);
    });
  }

  signForm.addEventListener('submit', (e) => {
    e.preventDefault();
    resultDiv.textContent = '';
    const selected = Array.from(document.querySelectorAll('.pdf-checkbox:checked')).map(cb => cb.value);
    const password = document.getElementById('password').value;
    if (selected.length === 0) {
      resultDiv.textContent = 'Selecciona al menos un archivo.';
      resultDiv.className = 'error';
      return;
    }
    if (!password) {
      resultDiv.textContent = 'Ingresa el password del token.';
      resultDiv.className = 'error';
      return;
    }
    // Enviar datos al proceso principal
    window.electronAPI.sendToMain('firmar-pdfs', { pdfs: selected, password });
    resultDiv.textContent = 'Firmando...';
    resultDiv.className = '';
  });

  // Recibir resultado de la firma
  window.electronAPI.onFromMain('firma-resultado', (data) => {
    if (data.success) {
      resultDiv.textContent = '¡Firma completada!';
      resultDiv.className = 'result';
    } else {
      resultDiv.textContent = 'Error: ' + data.error;
      resultDiv.className = 'error';
    }
  });
}); 