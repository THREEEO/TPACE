
const URL_BASE = "https://codecream.larissagazoli45.workers.dev";
let listaPromocoes = [];

document.addEventListener("DOMContentLoaded", function() {
    carregarPromocoes();
    document.getElementById('form-promocao').addEventListener('submit', salvarPromocao);
    
    // Filtro de pesquisa rápida
    const inputPesquisa = document.getElementById('inputPesquisa');
    if (inputPesquisa) {
        inputPesquisa.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const filtrados = listaPromocoes.filter(p => 
                (p.nome_campanha && p.nome_campanha.toLowerCase().includes(termo))
            );
            renderizarTabela(filtrados);
        });
    }
});

async function carregarPromocoes() {
    const tbody = document.getElementById('tabela-promocoes');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Carregando promoções...</td></tr>';
    
    try {
        const resposta = await fetch(`${URL_BASE}/promocoes`);
        listaPromocoes = await resposta.json();
        
        if (!Array.isArray(listaPromocoes)) listaPromocoes = [];
        renderizarTabela(listaPromocoes);
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--chart-rosa);">Erro ao carregar promoções.</td></tr>';
    }
}

function renderizarTabela(promocoes) {
    const tbody = document.getElementById('tabela-promocoes');
    tbody.innerHTML = '';
    
    if (promocoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhuma promoção cadastrada.</td></tr>';
        return;
    }
    
    promocoes.forEach(promo => {
        const id = promo.id_promocao;
        
        // Verifica se a data passou
        let statusBadge = '<span class="status-badge status-good">Ativa</span>';
        if (promo.data_final) {
            const dataFinal = new Date(promo.data_final);
            if (dataFinal < new Date()) {
                statusBadge = '<span class="status-badge status-critical">Expirada</span>';
            }
        }
        
        // Formatar data para exibição
        let dataVisual = '-';
        if (promo.data_final) {
            const d = new Date(promo.data_final);
            dataVisual = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${promo.nome_campanha || 'Campanha sem nome'}</td>
            <td class="col-desktop">${promo.segmento_produtos || '-'}</td>
            <td class="col-desktop">${promo.maxima_desconto || '-'}</td>
            <td class="col-desktop">${dataVisual}</td>
            <td class="col-desktop">${statusBadge}</td>
            <td class="col-desktop action-links">
                <button class="btn-action btn-delete" onclick="excluirPromocao(${id}, '${promo.nome_campanha}')">Excluir</button>
            </td>
            <td class="td-seta"></td>
        `;
        tbody.appendChild(tr);
    });
}

// Controle do Modal
window.abrirModalNovo = function() {
    document.getElementById('modal-titulo').innerText = "Nova Promoção";
    document.getElementById('form-promocao').reset();
    document.getElementById('promo-id').value = "";
    document.getElementById('preview-imagem').style.display = 'none';
    document.getElementById('icone-imagem').style.display = 'block';
    document.getElementById('promo-imagem-url').value = "";
    document.getElementById('modal-promocao').classList.add('active');
}

window.fecharModal = function() {
    document.getElementById('modal-promocao').classList.remove('active');
}

// Upload da Imagem (Reaproveita a mesma rota do R2)
window.previewImagem = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Preview local imediato
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('preview-imagem').src = e.target.result;
        document.getElementById('preview-imagem').style.display = 'block';
        document.getElementById('icone-imagem').style.display = 'none';
    }
    reader.readAsDataURL(file);

    // Upload pro Cloudflare
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${URL_BASE}/api/web/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.sucesso) {
            document.getElementById('promo-imagem-url').value = data.url;
        } else {
            alert("Erro ao fazer upload da imagem.");
        }
    } catch (e) {
        alert("Erro de conexão no upload.");
    }
}

// Salvar Promoção
async function salvarPromocao(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-salvar');
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const dados = {
        nome_campanha: document.getElementById('promo-nome').value,
        descricao: document.getElementById('promo-descricao').value,
        maxima_desconto: document.getElementById('promo-desconto').value,
        data_final: document.getElementById('promo-data-final').value,
        segmento_produtos: document.getElementById('promo-segmento').value,
        produtos_selecionados: document.getElementById('promo-produtos-selecionados').value,
        foto: document.getElementById('promo-imagem-url').value || null
    };

    try {
        const res = await fetch(`${URL_BASE}/api/web/promocoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!res.ok) throw new Error("Erro na API.");
        
        fecharModal();
        carregarPromocoes();
    } catch (erro) {
        alert("Falha ao salvar a campanha.");
    } finally {
        btn.innerText = "Salvar Promoção";
        btn.disabled = false;
    }
}

// Excluir Promoção
window.excluirPromocao = async function(id, nome) {
    if (confirm(`Tem certeza que deseja encerrar e excluir a campanha "${nome}"?`)) {
        try {
            const res = await fetch(`${URL_BASE}/api/web/promocoes/${id}`, {
                method: 'DELETE'
            });
            if(!res.ok) throw new Error("Erro ao excluir.");
            carregarPromocoes();
        } catch (erro) {
            alert("Erro de conexão ao excluir.");
        }
    }
}