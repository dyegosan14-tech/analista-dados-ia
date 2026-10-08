(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('ask-form');
  const input = $('question');
  const button = $('ask-button');
  const statusBox = $('status');
  const resultBox = $('result');
  const historyList = $('history-list');
  const historyEmpty = $('history-empty');

  const PALETTE = [
    '#818cf8',
    '#34d399',
    '#fbbf24',
    '#f472b6',
    '#38bdf8',
    '#fb923c',
    '#a78bfa',
    '#2dd4bf',
  ];
  const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  let chartInstance = null;
  let currentChartSpec = null;
  let currentId = null;

  if (window.Chart) {
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = '#1e293b';
    Chart.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
  }

  // ---------- helpers de interface ----------
  function show(el) {
    el.classList.remove('hidden');
  }
  function hide(el) {
    el.classList.add('hidden');
  }

  function setStatus(kind, message) {
    statusBox.className = 'rounded-lg border px-4 py-3 text-sm';
    if (kind === 'loading') {
      statusBox.classList.add('border-indigo-500/40', 'bg-indigo-500/10', 'text-indigo-100');
      statusBox.textContent = '⏳ ' + message;
    } else if (kind === 'error') {
      statusBox.classList.add('border-red-500/40', 'bg-red-500/10', 'text-red-200');
      statusBox.textContent = '⚠️ ' + message;
    }
    show(statusBox);
  }

  function clearStatus() {
    hide(statusBox);
    statusBox.textContent = '';
  }

  function formatCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return numberFmt.format(value);
    return String(value);
  }

  // ---------- renderização do resultado ----------
  function renderTable(columns, rows, truncated) {
    const table = $('table');
    table.replaceChildren();

    const thead = document.createElement('thead');
    thead.className = 'sticky top-0 bg-slate-800 text-xs uppercase tracking-wide text-slate-300';
    const headRow = document.createElement('tr');
    columns.forEach((name) => {
      const th = document.createElement('th');
      th.className = 'whitespace-nowrap px-3 py-2 font-medium';
      th.textContent = name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-slate-800';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/50';
      row.forEach((value) => {
        const td = document.createElement('td');
        td.className =
          'whitespace-nowrap px-3 py-2' +
          (typeof value === 'number' ? ' text-right tabular-nums' : '');
        td.textContent = formatCell(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    $('table-info').textContent =
      rows.length +
      (rows.length === 1 ? ' linha' : ' linhas') +
      (truncated ? ' (resultado limitado ao máximo permitido)' : '');
  }

  function updateChartButtons(activeType) {
    document.querySelectorAll('.chart-type-btn').forEach((btn) => {
      const active = btn.dataset.type === activeType;
      btn.classList.toggle('bg-indigo-600', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('border-indigo-500', active);
      btn.classList.toggle('bg-slate-800/60', !active);
      btn.classList.toggle('text-slate-200', !active);
      btn.classList.toggle('border-slate-700', !active);
    });
  }

  function renderChart(spec) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    currentChartSpec = spec ? { ...spec } : null;
    if (!spec || !window.Chart) {
      hide($('chart-wrap'));
      return;
    }

    const isPieOrDoughnut = spec.type === 'pie' || spec.type === 'doughnut';
    const datasets = spec.datasets.map((ds, index) => {
      const color = PALETTE[index % PALETTE.length];
      if (isPieOrDoughnut) {
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: spec.labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: '#0f172a',
        };
      }
      if (spec.type === 'line') {
        return {
          label: ds.label,
          data: ds.data,
          borderColor: color,
          backgroundColor: color + '33',
          tension: 0.3,
          fill: spec.datasets.length === 1,
          pointRadius: 3,
        };
      }
      return { label: ds.label, data: ds.data, backgroundColor: color, borderRadius: 4 };
    });

    show($('chart-wrap'));
    updateChartButtons(spec.type);

    chartInstance = new Chart($('chart'), {
      type: spec.type,
      data: { labels: spec.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPieOrDoughnut || datasets.length > 1,
            position: isPieOrDoughnut ? 'right' : 'top',
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ' ' +
                (ctx.dataset.label ? ctx.dataset.label + ': ' : '') +
                numberFmt.format(ctx.parsed.y ?? ctx.parsed),
            },
          },
        },
        scales: isPieOrDoughnut
          ? {}
          : { y: { beginAtZero: true, ticks: { callback: (v) => numberFmt.format(v) } } },
      },
    });
  }

  function renderResult(entry) {
    currentId = entry.id;
    $('result-question').textContent = entry.question;
    $('result-answer').textContent = entry.answer;

    if (entry.columns.length > 0 && entry.rows.length > 0) {
      renderTable(entry.columns, entry.rows, entry.truncated);
      $('csv-link').href = '/api/history/' + encodeURIComponent(entry.id) + '/csv';
      show($('table-wrap'));
    } else {
      hide($('table-wrap'));
    }

    renderChart(entry.chart);

    if (entry.sql) {
      $('sql-code').textContent = entry.sql;
      $('sql-wrap').open = false;
      show($('sql-wrap'));
    } else {
      hide($('sql-wrap'));
    }

    show(resultBox);
    highlightHistory();
  }

  // ---------- histórico ----------
  function highlightHistory() {
    historyList.querySelectorAll('button').forEach((btn) => {
      const active = btn.dataset.id === currentId;
      btn.classList.toggle('bg-slate-800', active);
      btn.classList.toggle('text-white', active);
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/history', { headers: { Accept: 'application/json' } });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const items = await res.json();
      historyList.replaceChildren();
      items.forEach((item) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.id = item.id;
        btn.title = item.question;
        btn.className =
          'w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800';
        btn.textContent = item.question;
        btn.addEventListener('click', () => openHistory(item.id));
        li.appendChild(btn);
        historyList.appendChild(li);
      });
      historyEmpty.classList.toggle('hidden', items.length > 0);
      highlightHistory();
    } catch (_err) {
      /* histórico é opcional */
    }
  }

  async function openHistory(id) {
    clearStatus();
    try {
      const res = await fetch('/api/history/' + encodeURIComponent(id));
      if (!res.ok) throw new Error('Não foi possível abrir essa pergunta.');
      renderResult(await res.json());
    } catch (err) {
      setStatus('error', err.message);
    }
  }

  // ---------- envio da pergunta ----------
  async function ask(question) {
    clearStatus();
    button.disabled = true;
    button.textContent = 'Consultando...';
    setStatus('loading', 'A IA está gerando a consulta e analisando os dados...');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ question }),
      });

      let payload = null;
      try {
        payload = await res.json();
      } catch (_err) {
        /* resposta sem JSON */
      }

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok)
        throw new Error(
          (payload && payload.error) || 'Não foi possível responder agora. Tente novamente.',
        );

      clearStatus();
      renderResult(payload);
      loadHistory();
    } catch (err) {
      const offline = err instanceof TypeError;
      setStatus(
        'error',
        offline ? 'Não consegui conectar ao servidor. Verifique se ele está rodando.' : err.message,
      );
    } finally {
      button.disabled = false;
      button.textContent = 'Perguntar';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      setStatus('error', 'Digite uma pergunta.');
      input.focus();
      return;
    }
    ask(question);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.querySelectorAll('.suggestion').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.question || '';
      input.focus();
      form.requestSubmit();
    });
  });

  $('copy-sql').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    try {
      await navigator.clipboard.writeText($('sql-code').textContent || '');
      btn.textContent = 'Copiado!';
    } catch (_err) {
      btn.textContent = 'Não foi possível copiar';
    }
    setTimeout(() => {
      btn.textContent = 'Copiar SQL';
    }, 1500);
  });

  document.querySelectorAll('.chart-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentChartSpec) return;
      const newType = btn.dataset.type;
      renderChart({ ...currentChartSpec, type: newType });
    });
  });

  const downloadBtn = $('download-chart');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const canvas = $('chart');
      if (!canvas || !chartInstance) return;
      const link = document.createElement('a');
      link.download = 'grafico-' + (currentId ? currentId.slice(0, 8) : 'resultado') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  loadHistory();
})();
