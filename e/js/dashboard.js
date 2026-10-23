const URL_BASE = "https://codecream.larissagazoli45.workers.dev";

document.addEventListener("DOMContentLoaded", async function() {
    const cardVendas = document.getElementById('card-vendas');
    const cardAtendimentos = document.getElementById('card-atendimentos');
    const cardAlertas = document.getElementById('card-alertas');

    cardVendas.innerText = "...";
    cardAtendimentos.innerText = "...";
    cardAlertas.innerText = "...";

    try {
        // Puxa as estatísticas consolidadas (Vendas, Pedidos e Alertas)
        const resStats = await fetch(`${URL_BASE}/dashboard/estatisticas`);
        const stats = await resStats.json();
        
        cardVendas.innerText = parseFloat(stats.vendasHoje || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        cardAtendimentos.innerText = stats.atendimentosHoje || 0;
        cardAlertas.innerText = `${stats.alertasEstoque || 0} itens`;

        // Puxa os itens mais vendidos para o Gráfico
        const resGrafico = await fetch(`${URL_BASE}/produtos/mais-vendidos`);
        const topProdutos = await resGrafico.json();
        
        renderizarGraficoProdutos(topProdutos);
    } catch (erro) {
        console.error("Erro ao carregar dashboard:", erro);
        cardVendas.innerText = "Erro";
        cardAtendimentos.innerText = "Erro";
        cardAlertas.innerText = "Erro";
    }
}); // <-- CORREÇÃO: O fechamento "});" estava faltando no arquivo original

function renderizarGraficoProdutos(dados) {
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.map(d => d.nome_produto),
            datasets: [{
                label: 'Unidades Vendidas',
                data: dados.map(d => d.total_vendido || 0),
                backgroundColor: '#68BBBA',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false
        }
    });
}