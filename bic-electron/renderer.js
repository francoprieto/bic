/**
 * Renderer process
 * Encargado de la UI:
 *  - Renderizar lista de PDFs con paginación
 *  - Manejar selección (individual/todos)
 *  - Disparar proceso de firma
 *  - Mostrar progreso, output y resultados
 */

window.addEventListener("DOMContentLoaded", () => {
  const { ipcRenderer } = window;
  const pdfList = document.getElementById("pdfList");
  const signForm = document.getElementById("signForm");
  const resultDiv = document.getElementById("result");
  const signBtn = document.getElementById("signBtn");
  const fileSelectBtn = document.getElementById("fileSelect");
  const selectAllCheckbox = document.getElementById("selectAll");
  const signSpinner = document.getElementById("signSpinner");
  const msgDiv = document.getElementById("msg");
  const progresoDiv = document.getElementById("progreso");
  const seleccionBtn = document.getElementById("fileSelect");

  // --- VARIABLES DE ESTADO ---
  let allPdfs = [];
  let currentPage = 1;
  const pageSize = 5;
  let selectedPdfs = new Set();
  let javaOutputBuffer = "";

  // --- EVENTOS IPC DESDE MAIN ---
  window.electronAPI?.onSetPdfUrls?.((pdfs) => {
    allPdfs = pdfs || [];
    currentPage = 1;
    selectedPdfs.clear();
    fileSelectBtn.classList.add('hidden');
    renderPdfList();
  });

  window.electronAPI?.onFromMain("java-output", (event, { type, data }) => {
    appendJavaOutput(type, data);
  });

  window.electronAPI?.onFromMain("firma-progreso", (event, payload) => {
    showProgress(payload);
  });

  window.electronAPI?.onFromMain("firma-resultado", (event, payload) => {
    handleFirmaResultado(payload);
  });

  window.electronAPI?.onFromMain("archivos-locales", (event, payload) =>{
    if(payload){
      fileSelectBtn.classList.remove('hidden');
      disableFirmarButton();
    }
  });


  

  // --- RENDERIZADO DE PDFs ---
  function renderPdfList() {
    pdfList.innerHTML = "";

    if (!allPdfs.length) {
      pdfList.innerHTML = `<div class="text-gray-500">No hay archivos para firmar.</div>`;
      renderPagination();
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      return;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, allPdfs.length);
    const pagePdfs = allPdfs.slice(startIdx, endIdx);

    pdfList.innerHTML = pagePdfs
      .map((pdf, idx) => {
        const globalIdx = startIdx + idx;
        const checked = selectedPdfs.has(pdf) ? "checked" : "";
        return `
          <div class="flex flex-row bg-gray-300 dark:bg-gray-700 rounded-lg shadow p-2 mb-3 pdf-item w-full">
            <div class="flex items-center w-5/6">
              <input type="checkbox" id="pdf-${globalIdx}" class="mr-4 h-5 w-5 text-blue-600" ${checked}>
              <label for="pdf-${globalIdx}" class="text-gray-900 dark:text-gray-300 break-all cursor-pointer" title="${pdf.url}">
                ${pdf.nombre}
              </label>
            </div>
            <div id="${pdf.id}" class="flex flex-row justify-end w-1/6"></div>
          </div>`;
      })
      .join("");

    renderPagination();
    restoreSelections(pagePdfs, startIdx);
    updateUIStates(pagePdfs);
  }

  function renderPagination() {
    let paginationDiv = document.getElementById("pagination-controls");
    if (!paginationDiv) {
      paginationDiv = document.createElement("div");
      paginationDiv.id = "pagination-controls";
      paginationDiv.className = "flex justify-center items-center gap-2 mt-4";
      pdfList.parentNode.appendChild(paginationDiv);
    }

    const totalPages = Math.ceil(allPdfs.length / pageSize);
    paginationDiv.innerHTML = "";

    if (totalPages <= 1) {
      paginationDiv.style.display = "none";
      return;
    }

    paginationDiv.style.display = "flex";

    const prevBtn = makePageButton("<", () => {
      if (currentPage > 1) {
        currentPage--;
        renderPdfList();
      }
    });
    prevBtn.disabled = currentPage === 1;

    const pageInfo = document.createElement("span");
    pageInfo.textContent = ` ${currentPage} / ${totalPages} `;
    pageInfo.className = "mx-2 text-gray-700";

    const nextBtn = makePageButton(">", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPdfList();
      }
    });
    nextBtn.disabled = currentPage === totalPages;

    paginationDiv.append(prevBtn, pageInfo, nextBtn);
  }

  function makePageButton(text, handler) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.className =
      "px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50";
    btn.onclick = handler;
    return btn;
  }

  // --- UI HELPERS ---
  function restoreSelections(pagePdfs, startIdx) {
    pagePdfs.forEach((pdf, idx) => {
      const globalIdx = startIdx + idx;
      const checkbox = document.getElementById(`pdf-${globalIdx}`);
      if (checkbox) {
        checkbox.addEventListener("change", (e) => {
          e.target.checked ? selectedPdfs.add(pdf) : selectedPdfs.delete(pdf);
          updateUIStates(pagePdfs);
        });
      }
    });
  }

  function updateUIStates(pagePdfs) {
    updateSignBtnState();
    updateSelectAllCheckbox(pagePdfs);

    if (selectAllCheckbox) {
      selectAllCheckbox.onchange = function () {
        if (this.checked) pagePdfs.forEach((pdf) => selectedPdfs.add(pdf));
        else pagePdfs.forEach((pdf) => selectedPdfs.delete(pdf));
        renderPdfList();
      };
    }
  }

  function updateSignBtnState() {
    const cantidad = selectedPdfs.size;
    signBtn.textContent = cantidad > 0 ? `Firmar (${cantidad})` : "Firmar";

    if (cantidad > 0) enableFirmarButton();
    else disableFirmarButton();
  }

  function disableFirmarButton() {
    signBtn.disabled = true;
    signBtn.classList.add("bg-gray-400", "cursor-not-allowed");
    signBtn.classList.remove("bg-blue-600", "hover:bg-blue-700", "cursor-pointer");
  }

  function enableFirmarButton() {
    signBtn.disabled = false;
    signBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    signBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "cursor-pointer");
  }

  function updateSelectAllCheckbox(pagePdfs) {
    if (!selectAllCheckbox) return;
    const allSelected = pagePdfs.every((pdf) => selectedPdfs.has(pdf));
    const someSelected = pagePdfs.some((pdf) => selectedPdfs.has(pdf));
    selectAllCheckbox.checked = allSelected && pagePdfs.length > 0;
    selectAllCheckbox.indeterminate = !allSelected && someSelected;
  }
  seleccionBtn.addEventListener("click", seleccionarArchivos);

  function seleccionarArchivos() {    
    window.electronAPI?.seleccionarArchivos();
  };

  // --- FORMULARIO DE FIRMA ---
  signForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const password = document.getElementById("password").value;
    const pdfs = Array.from(selectedPdfs);

    if (!pdfs.length) {
      resultDiv.innerHTML =
        '<div class="error text-red-600">Selecciona al menos un archivo para firmar.</div>';
      return;
    }

    resultDiv.innerHTML = "";
    if (signSpinner) signSpinner.style.display = "flex";
    disableFirmarButton();

    window.electronAPI?.sendToMain("firmar-pdfs", { pdfs, password });
  });

  // --- JAVA OUTPUT Y RESULTADOS ---
  function appendJavaOutput(type, data) {
    const timestamp = new Date().toLocaleTimeString();
    const outputLine = `<br/>[${timestamp}] [${type.toUpperCase()}] ${data}`;
    javaOutputBuffer += outputLine;

    if (!resultDiv.querySelector(".java-output")) {
      resultDiv.innerHTML =
        '<div class="java-output bg-gray-100 dark:text-gray-300 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto"></div>';
    }

    const outputDiv = resultDiv.querySelector(".java-output");
    if (outputDiv) {
      outputDiv.innerHTML += outputLine;
      outputDiv.scrollTop = outputDiv.scrollHeight;
    }
  }

  function showProgress(message) {
    if (signSpinner) signSpinner.style.display = "inline-flex";
    disableFirmarButton();
    progresoDiv.innerHTML = message;
  }

  function handleFirmaResultado(payload) {
    const { success, output } = payload;
    if (signSpinner) signSpinner.style.display = "none";
    enableFirmarButton();

    const msg = JSON.parse(output);
    const textMsg = msg.mensaje.replace("\n", "<br />");
    const cerrar =
      '<div class="absolute top-1 left-2 pl-1 pr-1 border border-white rounded-xl">&times;</div>';

    updatePdfResults(payload);

    msgDiv.innerHTML = `
      <div id="msg-${success ? "info" : "error"}"
        title="Click para cerrar"
        onclick="this.style.display='none'"
        class="text-sm cursor-pointer text-white ${
          success ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
        } rounded-md shadow-xl absolute top-1 left-1 pl-9 p-3">
        ${textMsg} ${cerrar}
      </div>`;

    javaOutputBuffer = "";
  }

  function updatePdfResults(payload) {
    const conf = localStorage.getItem("conf");
    if (!conf) return;
    const dir = JSON.parse(conf).directorio;

    selectedPdfs.forEach((elem) => {
      const opts = document.getElementById(elem.id);
      if (!opts) return;
      opts.innerHTML = "";

      // Si fue firmado
      if (payload.firmados?.includes(elem.id)) {
        opts.innerHTML = `
          <span><a href="${dir}/${elem.nombre}" title="Abrir ${elem.nombre}" target="_new">
            <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13V4M7 14H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2m-1-5-4 5-4-5m9 8h.01"/>
            </svg>          
          </a></span>`;
      }

      // Si fue subido o no
      payload.subidos?.forEach((ns) => {
        if (ns.id === elem.id) {
          if (!ns.subido) {
            opts.innerHTML += `
              <span class="text-red-700 pl-2">
                <a href="#" title="${ns.msg}">
                  <svg class="shrink-0 inline w-6 h-6 me-3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
                  </svg>
                </a>
              </span>`;
          } else {
            opts.innerHTML += `
              <span class="text-green-700 pl-2" title="Archivo subido correctamente">
                <svg class="shrink-0 inline w-6 h-6 me-3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
                </svg>
              </span>`;
          }
        }
      });
    });
  }
});
