window.addEventListener('DOMContentLoaded', () => {
  const { ipcRenderer } = window;
  const pdfList = document.getElementById('pdfList');
  const signForm = document.getElementById('signForm');
  const resultDiv = document.getElementById('result');
  const signBtn = document.getElementById('signBtn');
  const selectAllCheckbox = document.getElementById('selectAll');
  const signSpinner = document.getElementById('signSpinner');
  const msgDiv = document.getElementById('msg');
  const progresoDiv = document.getElementById('progreso');

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
      <div class="flex flex-row bg-gray-300 dark:bg-gray-700 rounded-lg shadow p-2 mb-3 pdf-item w-full">
        <div class="flex items-center w-5/6">
          <input type="checkbox" id="pdf-${globalIdx}" name="pdfs" value="${pdf["url"]}" class="mr-4 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${checked}>
          <label for="pdf-${globalIdx}" class="text-gray-900 dark:text-gray-300 break-all cursor-pointer" title="${pdf["url"]}">${pdf["nombre"]}</label>
        </div>
        <div id="${pdf["id"]}" class="flex flex-row justify-end w-1/6">
        </div>
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
      selectAllCheckbox.onchange = function () {
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

  function disableFirmarButton() {
    signBtn.disabled = true;
    signBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    signBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'cursor-pointer');
  }

  function enableFirmarButton() {
    signBtn.disabled = false;
    signBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
    signBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'cursor-pointer');
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

    const password = document.getElementById('password').value;
    const pdfs = Array.from(selectedPdfs);
    if (pdfs.length === 0) {
      resultDiv.innerHTML = '<div class="error text-red-600">Selecciona al menos un archivo para firmar.</div>';
      return;
    }
    resultDiv.innerHTML = '';
    if (signSpinner) signSpinner.style.display = 'flex'; // <-- Show spinner
    disableFirmarButton(); // Deshabilitar botón mientras se firma
    window.electronAPI?.sendToMain('firmar-pdfs', { pdfs, password });
  });

  // Variable para acumular el output en tiempo real
  let javaOutputBuffer = '';

  // Recibe el output en tiempo real del programa Java
  window.electronAPI?.onFromMain('java-output', (event, { type, data }) => {
    const timestamp = new Date().toLocaleTimeString();
    const outputLine = `<br/>[${timestamp}] [${type.toUpperCase()}] ${data}`;
    javaOutputBuffer += outputLine;

    // Mostrar el output en tiempo real
    if (resultDiv.innerHTML === '') {
      resultDiv.innerHTML = '<div class="java-output bg-gray-100 dark:text-gray-300 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto"></div>';
    }

    const outputDiv = resultDiv.querySelector('.java-output');
    if (outputDiv) {
      outputDiv.innerHTML += outputLine;
      outputDiv.scrollTop = outputDiv.scrollHeight; // Auto-scroll al final
    }
  });

  window.electronAPI?.onFromMain('firma-progreso', (event, payload) => {
    if (signSpinner) signSpinner.style.display = 'inline-flex';
    disableFirmarButton();
    progresoDiv.innerHTML = payload;
  });

  // Recibe el resultado final de la firma
  window.electronAPI?.onFromMain('firma-resultado', (event, payload) => {
    const { success, output, exitCode } = payload;
    if (signSpinner) signSpinner.style.display = 'none';
    enableFirmarButton(); // Habilitar botón después de firmar
    const msg = JSON.parse(output);
    const textMsg = msg.mensaje.replace('\n', '<br />');
    const cerrar = '<div class="absolute top-1 left-2 pl-1 pr-1 border border-white rounded-xl">&times;</div>';
    if (success) {
      msgDiv.innerHTML = `<div id="msg-info" title="Click para cerrar" onclick="document.getElementById('msg-info').style.display='none'" class="success text-sm cursor-pointer text-white bg-green-600 hover:bg-green-700 rounded-md shadow-xl absolute top-1 left-1 pl-9 p-3">${textMsg} ${cerrar}</div>`;

      const conf = localStorage.getItem('conf');
      if (!conf) return;
      const dir = (JSON.parse(conf)).directorio;

      selectedPdfs.forEach((elem) => {
        const id = elem.id;
        const opts = document.getElementById(id);

        if (opts && conf) {
          const uri = dir + "/" + elem.nombre;
          opts.innerHTML = `<span><a href="${uri}" title="Abrir ${elem.nombre}" target="_new">
            <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13V4M7 14H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2m-1-5-4 5-4-5m9 8h.01"/>
            </svg>          
          </a></span>`;
        }
      });

    } else {
      msgDiv.innerHTML = `<div id="msg-error" title="Click para cerrar" onclick="document.getElementById('msg-error').style.display='none'" class="error text-sm cursor-pointer text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xl absolute top-1 left-1 pl-9 p-3">${textMsg} ${cerrar}</div>`;
    }
    console.log(msg);
    javaOutputBuffer = '';
  });
});