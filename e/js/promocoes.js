
const URL_BASE = "https://codecream.larissagazoli45.workers.dev";
let listaPromocoes = [];

document.addEventListener("DOMContentLoaded", function() {
    carregarPromocoes();
    carregarProdutosParaModal();
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
                <button class="btn-action btn-edit" onclick="abrirModalEditar(${id})">Editar</button>
                <button class="btn-action btn-delete" onclick="excluirPromocao(${id}, '${promo.nome_campanha}')">Excluir</button>
            </td>
            <td class="td-seta"></td>
        `;
        tbody.appendChild(tr);
    });
}

window.abrirModalNovo = function() {
    document.getElementById('modal-titulo').innerText = "Nova Promoção";
    document.getElementById('form-promocao').reset();
    document.getElementById('promo-id').value = "";
    document.getElementById('preview-imagem').style.display = 'none';
    document.getElementById('icone-imagem').style.display = 'block';
    document.getElementById('promo-imagem-url').value = "";
    
    // Adicione esta linha: Limpa os produtos marcados de promoções anteriores
    desmarcarTodos(); 
    
    // Volta os filtros pro padrão
    document.getElementById('filtro-cat-modal').value = "";
    document.getElementById('filtro-linha-modal').value = "";
    filtrarProdutosModal(); // Reseta a lista para mostrar todos

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


window.abrirModalEditar = function(id) {
    const promo = listaPromocoes.find(p => p.id_promocao === id);
    if (!promo) return;

    document.getElementById('modal-titulo').innerText = "Editar Promoção";
    document.getElementById('promo-id').value = promo.id_promocao;
    
    // Preenche os dados de texto
    document.getElementById('promo-nome').value = promo.nome_campanha || "";
    document.getElementById('promo-descricao').value = promo.descricao || "";
    document.getElementById('promo-desconto').value = promo.maxima_desconto || "";
    document.getElementById('promo-segmento').value = promo.segmento_produtos || "sorvete";
    
    // Preenche a data
    if (promo.data_final) {
        document.getElementById('promo-data-final').value = promo.data_final;
    } else {
        document.getElementById('promo-data-final').value = "";
    }

    // Lida com a imagem
    if (promo.foto) {
        document.getElementById('preview-imagem').src = promo.foto;
        document.getElementById('preview-imagem').style.display = 'block';
        document.getElementById('icone-imagem').style.display = 'none';
        document.getElementById('promo-imagem-url').value = promo.foto;
    } else {
        document.getElementById('preview-imagem').style.display = 'none';
        document.getElementById('icone-imagem').style.display = 'block';
        document.getElementById('promo-imagem-url').value = "";
    }

    // Marca os produtos que já estavam selecionados
    desmarcarTodos();
    if (promo.produtos_selecionados) {
        const produtosArray = promo.produtos_selecionados.split(',');
        const checkboxes = document.querySelectorAll('.check-produto');
        
        checkboxes.forEach(cb => {
            if (produtosArray.includes(cb.value)) {
                cb.checked = true;
            }
        });
    }

    // Reseta filtros visuais
    document.getElementById('filtro-cat-modal').value = "";
    document.getElementById('filtro-linha-modal').value = "";
    filtrarProdutosModal();

    document.getElementById('modal-promocao').classList.add('active');
}

async function salvarPromocao(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-salvar');
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const id = document.getElementById('promo-id').value;
    const isNovo = (id === "");

    const produtosMarcados = Array.from(document.querySelectorAll('.check-produto:checked'))
                                  .map(cb => cb.value)
                                  .join(',');

    const dados = {
        nome_campanha: document.getElementById('promo-nome').value,
        descricao: document.getElementById('promo-descricao').value,
        maxima_desconto: document.getElementById('promo-desconto').value,
        data_final: document.getElementById('promo-data-final').value,
        segmento_produtos: document.getElementById('promo-segmento').value,
        produtos_selecionados: produtosMarcados,
        foto: document.getElementById('promo-imagem-url').value || null
    };
    
    // Se for edição, anexa o ID no objeto
    if (!isNovo) {
        dados.id_promocao = id;
    }

    try {
        const metodo = isNovo ? 'POST' : 'PUT';
        
        const res = await fetch(`${URL_BASE}/promocoes`, {
            method: metodo,
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

window.excluirPromocao = async function(id, nome) {
    if (confirm(`Tem certeza que deseja encerrar e excluir a campanha "${nome}"?`)) {
        try {
            const res = await fetch(`${URL_BASE}/promocoes`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_promocao: id })
            });
            
            if(!res.ok) throw new Error("Erro ao excluir.");
            carregarPromocoes();
        } catch (erro) {
            alert("Erro de conexão ao excluir.");
        }
    }
}

let todosProdutos = [];

async function carregarProdutosParaModal() {
    try {
        const res = await fetch(`${URL_BASE}/produtos`);
        if (!res.ok) throw new Error("Falha ao comunicar com a API.");
        
        todosProdutos = await res.json();
        
        const categorias = [...new Set(todosProdutos.map(p => p.categoria).filter(Boolean))];
        const linhas = [...new Set(todosProdutos.map(p => p.linha).filter(Boolean))];
        
        const selCat = document.getElementById('filtro-cat-modal');
        const selLinha = document.getElementById('filtro-linha-modal');
        
        categorias.forEach(c => selCat.innerHTML += `<option value="${c}">${c}</option>`);
        linhas.forEach(l => selLinha.innerHTML += `<option value="${l}">${l}</option>`);
        
        renderizarCheckboxesProdutos(todosProdutos);
    } catch (e) {
        console.error("Erro ao buscar produtos", e);
        const divLista = document.getElementById('lista-produtos-checkbox');
        if (divLista) {
            divLista.innerHTML = `<span style="color: var(--chart-rosa); font-weight: bold;">Erro ao carregar a lista de produtos. Verifique sua conexão com a API.</span>`;
        }
    }
}

function renderizarCheckboxesProdutos(produtos) {
    const div = document.getElementById('lista-produtos-checkbox');
    div.innerHTML = '';
    
    if(produtos.length === 0) {
        div.innerHTML = '<span style="color: var(--chart-rosa);">Nenhum produto cadastrado no sistema.</span>';
        return;
    }

    produtos.forEach(p => {
        const nome = p.nome || p.nome_produto || 'Produto sem nome';
        const cat = p.categoria || '';
        const linha = p.linha || '';
        
        // Criamos o checkbox escondendo os dados de categoria e linha nas tags HTML para facilitar o filtro visual depois
        div.innerHTML += `
            <label class="item-produto-check" data-cat="${cat}" data-linha="${linha}" style="display: flex; align-items: flex-start; gap: 8px; color: var(--text-escuro); font-size: 13px; cursor: pointer;">
                <input type="checkbox" class="check-produto" value="${nome}" style="margin-top: 3px;">
                <span style="line-height: 1.2;">
                    <strong>${nome}</strong><br>
                    <span style="font-size: 10px; color: var(--text-secundario);">${linha ? 'Linha: '+linha : 'Sem linha'}</span>
                </span>
            </label>
        `;
    });
}

// Lógica para esconder e mostrar os checkboxes conforme os filtros de linha/categoria
window.filtrarProdutosModal = function() {
    const cat = document.getElementById('filtro-cat-modal').value;
    const linha = document.getElementById('filtro-linha-modal').value;
    
    const itens = document.querySelectorAll('.item-produto-check');
    itens.forEach(item => {
        const matchCat = (cat === "" || item.getAttribute('data-cat') === cat);
        const matchLinha = (linha === "" || item.getAttribute('data-linha') === linha);
        
        // Se combinar com o filtro, mostra, senão esconde
        if (matchCat && matchLinha) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Botões práticos
window.selecionarVisiveis = function() {
    const itens = document.querySelectorAll('.item-produto-check');
    itens.forEach(item => {
        if (item.style.display !== 'none') {
            item.querySelector('.check-produto').checked = true;
        }
    });
}

window.desmarcarTodos = function() {
    const checkboxes = document.querySelectorAll('.check-produto');
    checkboxes.forEach(cb => cb.checked = false);
}