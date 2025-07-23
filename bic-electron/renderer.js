window.addEventListener('DOMContentLoaded', () => {
  const { ipcRenderer } = window;
  const pdfList = document.getElementById('pdfList');
  const signForm = document.getElementById('signForm');
  const resultDiv = document.getElementById('result');

  // Variables para paginación
  let allPdfs = [];
  let currentPage = 1;
  const pageSize = 5;
  let selectedPdfs = new Set();

  // Recibe la lista de PDFs desde el proceso principal
  window.electronAPI?.onSetPdfUrls?.((pdfs) => {
    allPdfs = pdfs || [];
    currentPage = 1;
    selectedPdfs = new Set();
    renderPdfList();
  });

  // Función para renderizar la lista de PDFs con paginación
  function renderPdfList() {
    pdfList.innerHTML = '';
    if (!allPdfs || allPdfs.length === 0) {
      pdfList.innerHTML = '<div class="text-gray-500">No hay archivos para firmar.</div>';
      renderPagination();
      return;
    }
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, allPdfs.length);
    const pagePdfs = allPdfs.slice(startIdx, endIdx);
    pdfList.innerHTML = pagePdfs.map((pdf, idx) => {
      const globalIdx = startIdx + idx;
      const checked = selectedPdfs.has(pdf) ? 'checked' : '';
      return `
        <div class="flex items-center bg-gray-100 rounded-lg shadow p-4 mb-3 pdf-item w-full">
          <input type="checkbox" id="pdf-${globalIdx}" name="pdfs" value="${pdf}" class="mr-4 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${checked}>
          <label for="pdf-${globalIdx}" class="text-gray-800 break-all cursor-pointer">${pdf}</label>
        </div>
      `;
    }).join('');
    renderPagination();
    // Restaurar selección
    pagePdfs.forEach((pdf, idx) => {
      const globalIdx = startIdx + idx;
      const checkbox = document.getElementById(`pdf-${globalIdx}`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedPdfs.add(pdf);
          } else {
            selectedPdfs.delete(pdf);
          }
        });
      }
    });
  }

  // Renderiza los controles de paginación
  function renderPagination() {
    let paginationDiv = document.getElementById('pagination-controls');
    if (!paginationDiv) {
      paginationDiv = document.createElement('div');
      paginationDiv.id = 'pagination-controls';
      paginationDiv.className = 'flex justify-center items-center gap-2 mt-4';
      pdfList.parentNode.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = '';
    const totalPages = Math.ceil((allPdfs?.length || 0) / pageSize);
    if (totalPages <= 1) {
      paginationDiv.style.display = 'none';
      return;
    }
    paginationDiv.style.display = 'flex';
    // Botón anterior
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Anterior';
    prevBtn.className = 'px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderPdfList();
      }
    };
    paginationDiv.appendChild(prevBtn);
    // Info de página
    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    pageInfo.className = 'mx-2 text-gray-700';
    paginationDiv.appendChild(pageInfo);
    // Botón siguiente
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Siguiente';
    nextBtn.className = 'px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPdfList();
      }
    };
    paginationDiv.appendChild(nextBtn);
  }

  // Maneja el envío del formulario
  signForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const pdfs = Array.from(selectedPdfs);
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