window.addEventListener('DOMContentLoaded', () => {
  const { ipcRenderer } = window;
  const pdfList = document.getElementById('pdfList');
  const signForm = document.getElementById('signForm');
  const resultDiv = document.getElementById('result');
  const signBtn = document.getElementById('signBtn');
  const selectAllCheckbox = document.getElementById('selectAll');

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
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      return;
    }
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, allPdfs.length);
    const pagePdfs = allPdfs.slice(startIdx, endIdx);
    pdfList.innerHTML = pagePdfs.map((pdf, idx) => {
      const globalIdx = startIdx + idx;
      const checked = selectedPdfs.has(pdf) ? 'checked' : '';
      return `
        <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg shadow p-2 mb-3 pdf-item w-full">
          <input type="checkbox" id="pdf-${globalIdx}" name="pdfs" value="${pdf["url"]}" class="mr-4 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${checked}>
          <label for="pdf-${globalIdx}" class="text-gray-800 dark:text-gray-300 break-all cursor-pointer" title="${pdf["url"]}">${pdf["nombre"]}</label>
        </div>
      `;
    }).join('');
    renderPagination();
    // Restaurar selección y listeners
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
          updateSignBtnState();
          updateSelectAllCheckbox();
        });
      }
    });
    updateSignBtnState();
    updateSelectAllCheckbox();
    // Listener para el checkbox de seleccionar todos
    if (selectAllCheckbox) {
      selectAllCheckbox.onchange = function() {
        if (this.checked) {
          pagePdfs.forEach(pdf => selectedPdfs.add(pdf));
        } else {
          pagePdfs.forEach(pdf => selectedPdfs.delete(pdf));
        }
        renderPdfList(); // Volver a renderizar para reflejar los cambios
      };
    }
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
    prevBtn.textContent = ' < ';
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
    pageInfo.textContent = ` ${currentPage} / ${totalPages} `;
    pageInfo.className = 'mx-2 text-gray-700';
    paginationDiv.appendChild(pageInfo);
    // Botón siguiente
    const nextBtn = document.createElement('button');
    nextBtn.textContent = ' > ';
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

  // Función para actualizar el estado del botón de Firmar
  function updateSignBtnState() {
    const cantidad = selectedPdfs.size;
    signBtn.textContent = cantidad > 0 ? `Firmar (${cantidad})` : 'Firmar';
    if (cantidad > 0) {
      signBtn.disabled = false;
      signBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
      signBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'cursor-pointer');
    } else {
      signBtn.disabled = true;
      signBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'cursor-pointer');
      signBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    }
  }

  // Actualiza el estado del checkbox de seleccionar todos
  function updateSelectAllCheckbox() {
    if (!selectAllCheckbox) return;
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, allPdfs.length);
    const pagePdfs = allPdfs.slice(startIdx, endIdx);
    const allSelected = pagePdfs.every(pdf => selectedPdfs.has(pdf));
    selectAllCheckbox.checked = allSelected && pagePdfs.length > 0;
    selectAllCheckbox.indeterminate = !allSelected && pagePdfs.some(pdf => selectedPdfs.has(pdf));
  }

  // Maneja el envío del formulario
  signForm.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log("submitted!");
    const password = document.getElementById('password').value;
    const pdfs = Array.from(selectedPdfs);
    if (pdfs.length === 0) {
      resultDiv.innerHTML = '<div class="error text-red-600">Selecciona al menos un archivo para firmar.</div>';
      return;
    }
    resultDiv.innerHTML = '';
    window.electronAPI?.sendToMain('firmar-pdfs', { pdfs, password });
  });

  // Variable para acumular el output en tiempo real
  let javaOutputBuffer = '';

  // Recibe el output en tiempo real del programa Java
  window.electronAPI?.onFromMain('java-output', (event, { type, data }) => {
    const timestamp = new Date().toLocaleTimeString();
    const outputLine = `[${timestamp}] [${type.toUpperCase()}] ${data}`;
    javaOutputBuffer += outputLine;
    
    // Mostrar el output en tiempo real
    if (resultDiv.innerHTML === '') {
      resultDiv.innerHTML = '<div class="java-output bg-gray-100 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto"></div>';
    }
    
    const outputDiv = resultDiv.querySelector('.java-output');
    if (outputDiv) {
      outputDiv.innerHTML += outputLine.replace(/\n/g, '<br>');
      outputDiv.scrollTop = outputDiv.scrollHeight; // Auto-scroll al final
    }
  });

  // Recibe el resultado final de la firma
  window.electronAPI?.onFromMain('firma-resultado', (event, { success, output, stderr, error, exitCode }) => {
    const timestamp = new Date().toLocaleTimeString();
    
    if (success) {
      const successMessage = `[${timestamp}] ✅ Proceso completado exitosamente (código: ${exitCode})`;
      resultDiv.innerHTML += `<div class="result text-green-600 font-bold mt-2">${successMessage}</div>`;
      
      if (output && output.trim()) {
        resultDiv.innerHTML += `<div class="final-output bg-green-50 dark:bg-green-900 p-2 rounded mt-2 font-mono text-sm">${output}</div>`;
      }
    } else {
      const errorMessage = `[${timestamp}] ❌ Error en el proceso (código: ${exitCode || 'N/A'})`;
      resultDiv.innerHTML += `<div class="error text-red-600 font-bold mt-2">${errorMessage}</div>`;
      
      if (error) {
        resultDiv.innerHTML += `<div class="error-details bg-red-50 dark:bg-red-900 p-2 rounded mt-2 font-mono text-sm">${error}</div>`;
      }
    }
    
    // Limpiar el buffer para la próxima ejecución
    javaOutputBuffer = '';
  });
}); 