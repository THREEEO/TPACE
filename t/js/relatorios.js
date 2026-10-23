const URL_BASE = 'https://tpace-api.whyguiih.workers.dev';
let graficoChart = null;
let listaVendasGlobal = [];

document.addEventListener("DOMContentLoaded", () => {
    const hoje = new Date();
    const trintaDias = new Date(hoje);
    trintaDias.setDate(hoje.getDate() - 30);

    const inputInicio = document.getElementById('filtro-inicio');
    const inputFim = document.getElementById('filtro-fim');
    
    inputInicio.value = trintaDias.toISOString().split('T')[0];
    inputFim.value = hoje.toISOString().split('T')[0];

    carregarRelatorioDesempenho();
    carregarGiro();
    carregarRadar();

    const inputFiltroId = document.getElementById('filtro-id-venda');
    if (inputFiltroId) {
        inputFiltroId.addEventListener('input', (evento) => {
            const idBuscado = evento.target.value.trim().toLowerCase();
            
            if (!idBuscado) {
                renderizarTabelaDesempenho(listaVendasGlobal);
                return;
            }
            
            const vendasFiltradas = listaVendasGlobal.filter(venda => {
                const cupom = venda.id_cupom ? String(venda.id_cupom).toLowerCase() : "";
                return cupom.includes(idBuscado);
            });
            
            renderizarTabelaDesempenho(vendasFiltradas);
        });
    }
});

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataString, comHora = false) {
    if (!dataString) return '-';
    const data = new Date(dataString);
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    
    if (comHora) {
        const hr = String(data.getHours()).padStart(2, '0');
        const min = String(data.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${ano} ${hr}:${min}`;
    }
    return `${dia}/${mes}/${ano}`;
}

async function carregarRelatorioDesempenho() {
    const inicio = document.getElementById('filtro-inicio').value;
    const fim = document.getElementById('filtro-fim').value;
    
    document.getElementById('texto-periodo').innerText = `Período exibido: ${formatarData(inicio)} até ${formatarData(fim)}`;
    
    try {
        const res = await fetch(`${URL_BASE}/relatorios/desempenho?inicio=${inicio}&fim=${fim}`);
        const dados = await res.json();
        
        listaVendasGlobal = dados.detalhes;
        
        renderizarTabelaDesempenho(listaVendasGlobal);
        renderizarGrafico(dados.grafico);
    } catch (e) {
        console.error("Erro ao carregar desempenho:", e);
        document.getElementById('tbody-desempenho').innerHTML = `<tr><td colspan="6">Erro ao carregar dados.</td></tr>`;
    }
}

function renderizarTabelaDesempenho(detalhes) {
    const tbody = document.getElementById('tbody-desempenho');
    tbody.innerHTML = '';

    if (!detalhes || detalhes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhuma venda registrada no período.</td></tr>`;
        return;
    }

    detalhes.forEach(det => {
        const produtosHtml = '• ' + (det.produtos_comprados || '').split(' | ').join('<br>• ');
        
        const numeroCupom = det.id_cupom;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarData(det.data_hora, true)}</td>
            <td>#${numeroCupom}</td>
            <td>${det.vendedor || 'Indefinido'}</td>
            <td>${produtosHtml}</td>
            <td>${formatarMoeda(det.venda_subtotal)}</td>
            <td><strong>${formatarMoeda(det.venda_total)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarGrafico(dadosGrafico) {
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    
    if (graficoChart) {
        graficoChart.destroy();
    }

    const labels = dadosGrafico.map(g => {
        const partes = g.data_venda.split('-');
        return `${partes[2]}/${partes[1]}`;
    });
    
    const valores = dadosGrafico.map(g => g.faturamento_diario);
    
    const total = valores.reduce((acc, curr) => acc + curr, 0);
    document.getElementById('total-faturamento').innerText = `Total: ${formatarMoeda(total)}`;

    const corLinha = getComputedStyle(document.documentElement).getPropertyValue('--btn-acao').trim() || '#A45FCE';
    const corFundo = `${corLinha}33`; 

    graficoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento Diário',
                data: valores,
                borderColor: corLinha,
                backgroundColor: corFundo,
                borderWidth: 3,
                pointBackgroundColor: corLinha,
                pointRadius: 4,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

async function carregarGiro() {
    try {
        const res = await fetch(`${URL_BASE}/relatorios/giro`);
        const dados = await res.json();
        const tbody = document.getElementById('tbody-giro');
        tbody.innerHTML = '';
        
        if(dados.length === 0) return tbody.innerHTML = `<tr><td colspan="5">Nenhum dado encontrado.</td></tr>`;

        dados.forEach(item => {
            let classe = 'status-low';
            let label = 'Baixo';
            
            if (item.volume_mes > 10) { classe = 'status-good'; label = 'Alto'; }
            else if (item.volume_mes >= 4) { classe = 'status-medium'; label = 'Bom'; }

            tbody.innerHTML += `
                <tr>
                    <td>${item.unidade_venda || '-'}</td>
                    <td>${item.nome || '-'}</td>
                    <td>${Number(item.volume_mes).toLocaleString('pt-BR')}</td>
                    <td>${Number(item.estoque_atual).toLocaleString('pt-BR')}</td>
                    <td><span class="status-badge ${classe}">${label}</span></td>
                </tr>
            `;
        });
    } catch (e) {}
}

async function carregarRadar() {
    try {
        const res = await fetch(`${URL_BASE}/relatorios/desequilibrados`);
        const dados = await res.json();
        const tbody = document.getElementById('tbody-radar');
        tbody.innerHTML = '';
        
        if(dados.length === 0) return tbody.innerHTML = `<tr><td colspan="3">Estoque perfeitamente equilibrado!</td></tr>`;

        dados.forEach(item => {
            const isExcesso = item.acao.includes('Excesso');
            const classeBadge = isExcesso ? 'status-warning' : 'status-critical';
            tbody.innerHTML += `
                <tr>
                    <td>${item.nome}</td>
                    <td><strong>${item.quantidade}</strong></td>
                    <td><span class="status-badge ${classeBadge}">${item.acao}</span></td>
                </tr>
            `;
        });
    } catch (e) {}
}
