const URL_BASE = "https://codecream.larissagazoli45.workers.dev";

document.addEventListener("DOMContentLoaded", async function() {
    // Atualiza nome do usuário no topo e menu mobile
    const nomeSalvo = localStorage.getItem('tpace_usuario_nome');
    const userSpan = document.querySelector('.user-info span');
    if (userSpan) userSpan.innerText = (nomeSalvo && nomeSalvo !== "undefined") ? nomeSalvo : "Administrador";

    const btnMenu = document.querySelector('.mobile-menu-btn');
    const menuNav = document.querySelector('.topbar-menu');
    if (btnMenu && menuNav) {
        btnMenu.addEventListener('click', () => menuNav.classList.toggle('open'));
    }

    // 1. CARREGAR OS CARDS DO TOPO
    const cardVendas = document.getElementById('card-vendas');
    const cardAtendimentos = document.getElementById('card-atendimentos');
    const cardAlertas = document.getElementById('card-alertas');

    cardVendas.innerText = "...";
    cardAtendimentos.innerText = "...";
    cardAlertas.innerText = "...";

    try {
        const resStats = await fetch(`${URL_BASE}/dashboard/estatisticas`);
        const stats = await resStats.json();
        
        cardVendas.innerText = parseFloat(stats.vendasHoje || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        cardAtendimentos.innerText = stats.atendimentosHoje || 0;
        cardAlertas.innerText = `${stats.alertasEstoque || 0} ${stats.alertasEstoque === 1 ? 'item' : 'itens'}`;
    } catch (erro) {
        console.error("Erro ao carregar cards do dashboard:", erro);
        cardVendas.innerText = "Erro";
        cardAtendimentos.innerText = "Erro";
        cardAlertas.innerText = "Erro";
    }

    // 2. LÓGICA DO GRÁFICO DINÂMICO (TROCA DE ESTILO NO SELECT)
    let meuGraficoInstancia = null;
    let dadosGraficos = {
        faturamento: [],
        pagamentos: [],
        produtos: [],
        filiais: []
    };

    const canvasEl = document.getElementById('meuGrafico');
    const ctx = canvasEl.getContext('2d');
    const selector = document.getElementById('chart-selector');

    const cores = {
        vermelho: '#D50000',
        bordô: '#800000',
        turquesa: '#68BBBA',
        rosa: '#F25C8F',
        lilas: '#C0B9DD',
        chumbo: '#330000',
        fundoVermelho: 'rgba(213, 0, 0, 0.18)'
    };

    function renderizarGrafico(tipo) {
        const graficoExistente = Chart.getChart(canvasEl);
        if (graficoExistente) {
            graficoExistente.destroy();
        } else if (meuGraficoInstancia) {
            meuGraficoInstancia.destroy();
        }

        let config = {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { color: cores.chumbo, font: { family: 'Segoe UI' } }
                    }
                }
            }
        };

        if (tipo === 'faturamento') {
            const dados = Array.isArray(dadosGraficos.faturamento) ? [...dadosGraficos.faturamento].reverse() : [];
            config.type = 'line';
            config.data = {
                labels: dados.map(d => (d.data || '').split('-').reverse().join('/')),
                datasets: [{
                    label: 'Faturamento Diário (R$)',
                    data: dados.map(d => Number(d.valor) || 0),
                    borderColor: cores.vermelho,
                    backgroundColor: cores.fundoVermelho,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            };
        } 
        else if (tipo === 'pagamentos') {
            const dados = Array.isArray(dadosGraficos.pagamentos) ? dadosGraficos.pagamentos : [];
            config.type = 'doughnut';
            config.data = {
                labels: dados.map(d => String(d.metodo || 'Outro').toUpperCase()),
                datasets: [{
                    label: 'Total (R$)',
                    data: dados.map(d => Number(d.total) || 0),
                    backgroundColor: [cores.vermelho, cores.turquesa, cores.rosa, cores.lilas, cores.bordô],
                    borderWidth: 0
                }]
            };
        } 
        else if (tipo === 'produtos') {
            const dados = Array.isArray(dadosGraficos.produtos) ? dadosGraficos.produtos : [];
            config.type = 'bar';
            config.data = {
                labels: dados.map(d => {
                    const nome = String(d.nome || d.nome_produto || 'Produto');
                    return nome.length > 22 ? nome.substring(0, 22) + '...' : nome;
                }),
                datasets: [{
                    label: 'Unidades Vendidas',
                    data: dados.map(d => Number(d.qtd ?? d.total_vendido) || 0),
                    backgroundColor: cores.turquesa,
                    borderRadius: 6
                }]
            };
            config.options.indexAxis = 'y';
            config.options.plugins.legend.display = false;
        } 
        else if (tipo === 'filiais') {
            const dados = Array.isArray(dadosGraficos.filiais) ? dadosGraficos.filiais : [];
            config.type = 'bar';
            config.data = {
                labels: dados.map(d => {
                    const nome = String(d.nome || 'Filial');
                    return nome.length > 22 ? nome.substring(0, 22) + '...' : nome;
                }),
                datasets: [{
                    label: 'Faturamento (R$)',
                    data: dados.map(d => Number(d.valor) || 0),
                    backgroundColor: cores.rosa,
                    borderRadius: 6
                }]
            };
            config.options.indexAxis = 'y';
        }

        meuGraficoInstancia = new Chart(ctx, config);
    }

    async function carregarDadosGraficos() {
        try {
            const res = await fetch(`${URL_BASE}/api/web/graficos`);
            if (res.ok) {
                const json = await res.json();
                dadosGraficos = {
                    faturamento: json.faturamento || [],
                    pagamentos: json.pagamentos || [],
                    produtos: json.produtos || [],
                    filiais: json.filiais || []
                };
            }
        } catch (e) {
            console.error("Erro ao buscar /api/web/graficos:", e);
        } finally {
            renderizarGrafico(selector ? selector.value : 'faturamento');
        }
    }

    if (selector) {
        selector.addEventListener('change', function(e) {
            renderizarGrafico(e.target.value);
        });
    }

    carregarDadosGraficos();
});